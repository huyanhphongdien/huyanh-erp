// ============================================================================
// ATTENDANCE SERVICE V3 — Multi-Shift + Proper Shift Assignment Lookup
// File: src/services/attendanceService.ts
// Huy Anh ERP System - Chấm công V3
// ============================================================================
// FIX: checkIn() ALWAYS looks up shift_assignments for correct shift_id
// FIX: checkOut() properly handles overnight shifts
// FIX: getAll() supports all filters for AttendanceListPage V6
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface ShiftInfo {
  id: string
  code: string
  name: string
  start_time: string
  end_time: string
  standard_hours: number
  break_minutes: number
  crosses_midnight: boolean
  late_threshold_minutes?: number
  early_leave_threshold_minutes?: number
}

export interface AttendanceRecord {
  id: string
  employee_id: string
  date: string
  shift_id: string | null
  shift_date: string | null
  check_in_time: string | null
  check_out_time: string | null
  working_minutes: number
  overtime_minutes: number
  break_minutes: number
  late_minutes: number
  early_leave_minutes: number
  status: string
  notes: string | null
  is_gps_verified: boolean
  auto_checkout: boolean
  check_in_lat: number | null
  check_in_lng: number | null
  check_out_lat: number | null
  check_out_lng: number | null
  created_at: string
  updated_at: string
  shift?: ShiftInfo | null
  employee?: {
    id: string
    code: string
    full_name: string
    department_id?: string
    department?: { id: string; name: string; code: string }
  }
}

export interface TodayShiftAssignment {
  id: string
  shift_id: string
  shift: ShiftInfo
  team_code?: string
  team_name?: string
}

export interface GPSData {
  latitude: number
  longitude: number
  accuracy?: number
}

export interface CheckInOptions {
  targetShiftId?: string
  gps?: GPSData | null
  isGpsVerified?: boolean
}

export interface CheckOutOptions {
  gps?: GPSData | null
}

export interface AttendanceListParams {
  page: number
  pageSize: number
  search?: string
  employee_id?: string
  department_id?: string
  from_date?: string
  to_date?: string
  status?: string
  shift_id?: string
  scope?: string
  current_employee_id?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface GPSLocation {
  latitude: number
  longitude: number
  radius_meters: number
  name: string
}

interface GPSConfig {
  enabled: boolean
  locations: GPSLocation[]
}

// ============================================================================
// GPS HELPERS
// ============================================================================

async function getGPSConfig(): Promise<GPSConfig | null> {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'gps_attendance')
      .maybeSingle()
    return data?.value || null
  } catch {
    return null
  }
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function validateGPS(lat: number, lng: number, config: GPSConfig): {
  valid: boolean; distance: number; location_name: string
} {
  for (const loc of config.locations) {
    const dist = haversineDistance(lat, lng, loc.latitude, loc.longitude)
    if (dist <= loc.radius_meters) {
      return { valid: true, distance: Math.round(dist), location_name: loc.name }
    }
  }
  const nearest = config.locations[0]
  const dist = nearest ? haversineDistance(lat, lng, nearest.latitude, nearest.longitude) : 0
  return { valid: false, distance: Math.round(dist), location_name: nearest?.name || 'N/A' }
}

// ============================================================================
// SHIFT DETECTION
// ============================================================================

function detectBestShift(
  assignments: { shift_id: string; shift: ShiftInfo }[],
  now: Date
): { shift_id: string; shift: ShiftInfo } | null {
  if (assignments.length === 0) return null
  if (assignments.length === 1) return assignments[0]

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  let best = assignments[0]
  let bestScore = Infinity

  for (const a of assignments) {
    const [sh, sm] = a.shift.start_time.split(':').map(Number)
    const startMin = sh * 60 + (sm || 0)
    let diff = Math.abs(nowMinutes - startMin)
    if (a.shift.crosses_midnight && diff > 720) diff = 1440 - diff
    if (diff < bestScore) { bestScore = diff; best = a }
  }
  return best
}

// ============================================================================
// SELECT CONSTANT
// ============================================================================

const ATTENDANCE_SELECT = `
  id, employee_id, date, shift_id, shift_date,
  check_in_time, check_out_time,
  working_minutes, overtime_minutes, break_minutes,
  late_minutes, early_leave_minutes,
  status, notes,
  is_gps_verified, auto_checkout,
  check_in_lat, check_in_lng, check_out_lat, check_out_lng,
  created_at, updated_at,
  shift:shifts!attendance_shift_id_fkey(
    id, code, name, start_time, end_time,
    standard_hours, break_minutes, crosses_midnight,
    late_threshold_minutes, early_leave_threshold_minutes
  ),
  employee:employees!attendance_employee_id_fkey(
    id, code, full_name, department_id,
    department:departments!employees_department_id_fkey(id, name, code)
  )
`

function normalize(r: any): AttendanceRecord {
  return {
    ...r,
    shift: Array.isArray(r.shift) ? r.shift[0] : r.shift,
    employee: Array.isArray(r.employee) ? r.employee[0] : r.employee,
  }
}

// ============================================================================
// SERVICE
// ============================================================================

export const attendanceService = {

  // ═══════════════════════════════════════════════════
  // LIST (AttendanceListPage)
  // ═══════════════════════════════════════════════════

  async getAll(params: AttendanceListParams): Promise<PaginatedResponse<AttendanceRecord>> {
    const { page, pageSize, search, employee_id, department_id,
      from_date, to_date, status, shift_id, scope } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('attendance')
      .select(ATTENDANCE_SELECT, { count: 'exact' })

    // Scope
    if (scope === 'mine' && employee_id) {
      query = query.eq('employee_id', employee_id)
    } else if ((scope === 'department' || scope === 'all') && department_id) {
      const { data: deptEmps } = await supabase
        .from('employees').select('id')
        .eq('department_id', department_id).eq('status', 'active')
      if (deptEmps && deptEmps.length > 0) {
        query = query.in('employee_id', deptEmps.map(e => e.id))
      } else {
        return { data: [], total: 0, page, pageSize, totalPages: 0 }
      }
    }

    // Search
    if (search) {
      const { data: matched } = await supabase
        .from('employees').select('id')
        .or(`full_name.ilike.%${search}%,code.ilike.%${search}%`)
      if (matched && matched.length > 0) {
        query = query.in('employee_id', matched.map(e => e.id))
      } else {
        return { data: [], total: 0, page, pageSize, totalPages: 0 }
      }
    }

    if (from_date) query = query.gte('date', from_date)
    if (to_date) query = query.lte('date', to_date)
    if (status && status !== 'all') query = query.eq('status', status)
    if (shift_id && shift_id !== 'all') query = query.eq('shift_id', shift_id)

    const { data, error, count } = await query
      .order('date', { ascending: false })
      .order('check_in_time', { ascending: false })
      .range(from, to)

    if (error) throw error

    return {
      data: (data || []).map(normalize),
      total: count || 0, page, pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  // ═══════════════════════════════════════════════════
  // TODAY QUERIES (CheckInOutWidget)
  // ═══════════════════════════════════════════════════

  async getTodayShifts(employeeId: string): Promise<TodayShiftAssignment[]> {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('shift_assignments')
      .select(`
        id, shift_id,
        shift:shifts!shift_assignments_shift_id_fkey(
          id, code, name, start_time, end_time,
          standard_hours, break_minutes, crosses_midnight,
          late_threshold_minutes, early_leave_threshold_minutes
        )
      `)
      .eq('employee_id', employeeId)
      .eq('date', today)

    if (error) { console.error('getTodayShifts:', error); return [] }

    const assignments = (data || []).map(a => ({
      id: a.id,
      shift_id: a.shift_id,
      shift: (Array.isArray(a.shift) ? a.shift[0] : a.shift) as ShiftInfo,
    })).filter(a => a.shift)

    // Team info
    try {
      const { data: teamData } = await supabase
        .from('shift_team_members')
        .select('team:shift_teams!shift_team_members_team_id_fkey(code, name)')
        .eq('employee_id', employeeId)
        .is('effective_to', null)
        .limit(1)

      if (teamData?.[0]) {
        const team = Array.isArray(teamData[0].team) ? teamData[0].team[0] : teamData[0].team
        if (team) {
          return assignments.map(a => ({
            ...a,
            team_code: (team as any).code,
            team_name: (team as any).name,
          }))
        }
      }
    } catch { /* shift_teams may not exist */ }

    return assignments
  },

  async getTodayAttendances(employeeId: string): Promise<AttendanceRecord[]> {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('attendance')
      .select(ATTENDANCE_SELECT)
      .eq('employee_id', employeeId)
      .eq('date', today)
      .order('check_in_time')

    if (error) { console.error('getTodayAttendances:', error); return [] }
    return (data || []).map(normalize)
  },

  async getOpenAttendance(employeeId: string): Promise<AttendanceRecord | null> {
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('attendance')
      .select(ATTENDANCE_SELECT)
      .eq('employee_id', employeeId)
      .in('date', [today, yesterdayStr])
      .not('check_in_time', 'is', null)
      .is('check_out_time', null)
      .order('check_in_time', { ascending: false })
      .limit(1)

    if (error) { console.error('getOpenAttendance:', error); return null }
    if (!data || data.length === 0) return null
    return normalize(data[0])
  },

  // ═══════════════════════════════════════════════════
  // ★★★ CHECK-IN — Looks up shift_assignments
  // ═══════════════════════════════════════════════════

  async checkIn(employeeId: string, options: CheckInOptions = {}): Promise<AttendanceRecord> {
    const { targetShiftId, gps, isGpsVerified } = options
    const today = new Date().toISOString().split('T')[0]
    const now = new Date()
    const nowISO = now.toISOString()

    // ① Open record check
    const openRecord = await this.getOpenAttendance(employeeId)
    if (openRecord) {
      throw new Error(`Bạn chưa check-out ca ${openRecord.shift?.name || 'trước đó'}. Vui lòng check-out trước.`)
    }

    // ② GPS
    let gpsVerified = isGpsVerified || false
    let checkInLat: number | null = gps?.latitude || null
    let checkInLng: number | null = gps?.longitude || null

    const gpsConfig = await getGPSConfig()
    if (gpsConfig?.enabled) {
      if (!gps) throw new Error('Vui lòng bật định vị GPS để check-in')
      checkInLat = gps.latitude
      checkInLng = gps.longitude
      const gpsResult = validateGPS(gps.latitude, gps.longitude, gpsConfig)
      if (!gpsResult.valid) {
        throw new Error(
          `Bạn không ở trong khu vực công ty. Khoảng cách đến ${gpsResult.location_name}: ${gpsResult.distance}m (cho phép: ${gpsConfig.locations[0]?.radius_meters || 300}m)`
        )
      }
      gpsVerified = true
    }

    // ③ ★★★ LOOKUP shift_assignments ★★★
    const { data: todayAssignments } = await supabase
      .from('shift_assignments')
      .select(`
        id, shift_id,
        shift:shifts!shift_assignments_shift_id_fkey(
          id, code, name, start_time, end_time,
          standard_hours, break_minutes, crosses_midnight,
          late_threshold_minutes, early_leave_threshold_minutes
        )
      `)
      .eq('employee_id', employeeId)
      .eq('date', today)

    const assignments = (todayAssignments || []).map(a => ({
      shift_id: a.shift_id,
      shift: (Array.isArray(a.shift) ? a.shift[0] : a.shift) as ShiftInfo,
    })).filter(a => a.shift)

    // ④ Select shift
    let selectedShift: { shift_id: string; shift: ShiftInfo } | null = null

    if (targetShiftId) {
      selectedShift = assignments.find(a => a.shift_id === targetShiftId) || null
      if (!selectedShift) {
        // Fallback: load shift directly
        const { data: shiftData } = await supabase
          .from('shifts')
          .select('id, code, name, start_time, end_time, standard_hours, break_minutes, crosses_midnight, late_threshold_minutes, early_leave_threshold_minutes')
          .eq('id', targetShiftId)
          .single()
        if (shiftData) selectedShift = { shift_id: targetShiftId, shift: shiftData as ShiftInfo }
      }
    } else if (assignments.length > 0) {
      selectedShift = detectBestShift(assignments, now)
    }

    // ⑤ Duplicate check
    if (selectedShift) {
      const { data: dup } = await supabase
        .from('attendance').select('id')
        .eq('employee_id', employeeId).eq('date', today)
        .eq('shift_id', selectedShift.shift_id).limit(1)
      if (dup && dup.length > 0) {
        throw new Error(`Bạn đã check-in ca ${selectedShift.shift.name} hôm nay rồi`)
      }
    } else {
      const { data: dup } = await supabase
        .from('attendance').select('id')
        .eq('employee_id', employeeId).eq('date', today)
        .is('shift_id', null).limit(1)
      if (dup && dup.length > 0) throw new Error('Bạn đã check-in hôm nay rồi')
    }

    // ⑥ Late calculation
    let status = 'present'
    let lateMinutes = 0
    let breakMins = 0

    if (selectedShift) {
      const shift = selectedShift.shift
      breakMins = shift.break_minutes || 0
      const [startH, startM] = shift.start_time.split(':').map(Number)
      const shiftStart = new Date(today + 'T00:00:00')
      shiftStart.setHours(startH, startM || 0, 0, 0)

      const diff = Math.floor((now.getTime() - shiftStart.getTime()) / (1000 * 60))
      if (diff > (shift.late_threshold_minutes || 15)) {
        status = 'late'
        lateMinutes = diff
      }
    } else {
      const h = now.getHours(), m = now.getMinutes()
      if (h > 8 || (h === 8 && m > 30)) {
        status = 'late'
        lateMinutes = (h - 8) * 60 + (m - 30)
      }
    }

    // ⑦ Insert
    const { data, error } = await supabase
      .from('attendance')
      .insert({
        employee_id: employeeId,
        date: today,
        check_in_time: nowISO,
        status,
        shift_id: selectedShift?.shift_id || null,
        shift_date: today,
        late_minutes: Math.max(0, lateMinutes),
        early_leave_minutes: 0,
        working_minutes: 0,
        overtime_minutes: 0,
        break_minutes: breakMins,
        check_in_lat: checkInLat,
        check_in_lng: checkInLng,
        is_gps_verified: gpsVerified,
        auto_checkout: false,
      })
      .select(ATTENDANCE_SELECT)
      .single()

    if (error) throw error
    return normalize(data)
  },

  // ═══════════════════════════════════════════════════
  // CHECK-OUT — Handles overnight shifts
  // ═══════════════════════════════════════════════════

  async checkOut(employeeId: string, options: CheckOutOptions = {}): Promise<AttendanceRecord> {
    const { gps } = options
    const now = new Date()
    const nowISO = now.toISOString()

    const openRecord = await this.getOpenAttendance(employeeId)
    if (!openRecord) throw new Error('Không tìm thấy ca đang mở. Bạn chưa check-in.')

    const checkOutLat = gps?.latitude || null
    const checkOutLng = gps?.longitude || null

    // Working time
    const checkIn = new Date(openRecord.check_in_time!)
    const workingMinutes = Math.max(0, Math.floor((now.getTime() - checkIn.getTime()) / (1000 * 60)))

    // Early leave / overtime
    let earlyLeaveMinutes = 0
    let overtimeMinutes = 0
    let newStatus = openRecord.status

    if (openRecord.shift) {
      const shift = openRecord.shift
      const [endH, endM] = shift.end_time.split(':').map(Number)

      let shiftEndTime: Date
      if (shift.crosses_midnight) {
        const nextDay = new Date(openRecord.date + 'T00:00:00')
        nextDay.setDate(nextDay.getDate() + 1)
        shiftEndTime = new Date(nextDay)
        shiftEndTime.setHours(endH, endM || 0, 0, 0)
      } else {
        shiftEndTime = new Date(openRecord.date + 'T00:00:00')
        shiftEndTime.setHours(endH, endM || 0, 0, 0)
      }

      const diffFromEnd = Math.floor((now.getTime() - shiftEndTime.getTime()) / (1000 * 60))
      const earlyThreshold = shift.early_leave_threshold_minutes || 15

      if (diffFromEnd < -earlyThreshold) {
        earlyLeaveMinutes = Math.abs(diffFromEnd)
        if (openRecord.status !== 'late') newStatus = 'early_leave'
      } else if (diffFromEnd > 0) {
        overtimeMinutes = diffFromEnd
      }
    } else {
      const endOfDay = new Date(openRecord.date + 'T17:00:00')
      if (now < endOfDay) {
        earlyLeaveMinutes = Math.floor((endOfDay.getTime() - now.getTime()) / (1000 * 60))
        if (openRecord.status !== 'late') newStatus = 'early_leave'
      } else {
        const after = Math.floor((now.getTime() - endOfDay.getTime()) / (1000 * 60))
        if (after > 30) overtimeMinutes = after
      }
    }

    const { data, error } = await supabase
      .from('attendance')
      .update({
        check_out_time: nowISO,
        working_minutes: workingMinutes,
        overtime_minutes: Math.max(0, overtimeMinutes),
        early_leave_minutes: Math.max(0, earlyLeaveMinutes),
        status: newStatus,
        check_out_lat: checkOutLat,
        check_out_lng: checkOutLng,
      })
      .eq('id', openRecord.id)
      .select(ATTENDANCE_SELECT)
      .single()

    if (error) throw error
    return normalize(data)
  },

  // ═══════════════════════════════════════════════════
  // LEGACY COMPAT
  // ═══════════════════════════════════════════════════

  async getByEmployeeAndDate(employeeId: string, date: string): Promise<AttendanceRecord | null> {
    const { data, error } = await supabase
      .from('attendance').select(ATTENDANCE_SELECT)
      .eq('employee_id', employeeId).eq('date', date)
      .order('check_in_time').limit(1)
    if (error || !data?.length) return null
    return normalize(data[0])
  },

  async getTodayAttendance(employeeId: string): Promise<AttendanceRecord | null> {
    return this.getByEmployeeAndDate(employeeId, new Date().toISOString().split('T')[0])
  },

  async getTodayShift(employeeId: string): Promise<ShiftInfo | null> {
    const shifts = await this.getTodayShifts(employeeId)
    return shifts.length > 0 ? shifts[0].shift : null
  },

  async update(id: string, updates: Record<string, any>): Promise<AttendanceRecord> {
    const { data, error } = await supabase
      .from('attendance').update(updates).eq('id', id)
      .select(ATTENDANCE_SELECT).single()
    if (error) throw error
    return normalize(data)
  },

  async getMonthlyReport(year: number, month: number, departmentId?: string): Promise<AttendanceRecord[]> {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('attendance').select(ATTENDANCE_SELECT)
      .gte('date', startDate).lte('date', endDate)
      .order('employee_id').order('date')
    if (error) throw error

    let results = (data || []).map(normalize)
    if (departmentId) results = results.filter(r => r.employee?.department_id === departmentId)
    return results
  },
}

export default attendanceService