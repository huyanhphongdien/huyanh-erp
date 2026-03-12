// ============================================================================
// ATTENDANCE SERVICE V6 — Unified Auto-checkout + Timezone Fix
// File: src/services/attendanceService.ts
// Huy Anh ERP System - Chấm công V6
// ============================================================================
// V6 Changes:
//   ① XÓA tryAutoCloseRecord(), getShiftEndDatetime() nội bộ
//   ② XÓA runAutoCheckout() — để pg_cron auto_checkout_v6() lo
//   ③ checkIn() → gọi autoCheckoutService.tryCloseForEmployee() thay vì nội bộ
//   ④ Fix timezone: dùng +07:00 explicit thay vì new Date(date+'T00:00:00')
//   ⑤ Giữ nguyên: checkOut() OT logic, GPS, team info, ca đêm
// ============================================================================

import { supabase } from '../lib/supabase'
import { autoCheckoutService } from './autoCheckoutService'

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
  assignment_date: string
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
// DATE HELPERS — ★ V6: Tất cả dùng +07:00 explicit
// ============================================================================

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function getYesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

/** Chuyển time string "HH:MM:SS" → phút trong ngày */
function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + (m || 0)
}

/**
 * ★ V6: Tạo Date object với timezone VN (+07:00)
 * Tránh bug new Date(date + 'T00:00:00') phụ thuộc browser timezone
 */
function createVNDate(date: string, timeStr: string): Date {
  const min = timeToMinutes(timeStr)
  const h = Math.floor(min / 60)
  const m = min % 60
  return new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`)
}

// ============================================================================
// SHIFT DETECTION — Hỗ trợ ca qua đêm (★ V6: dùng +07:00)
// ============================================================================

function isInShiftWindow(
  shift: ShiftInfo,
  assignmentDate: string,
  now: Date,
  bufferBeforeMinutes = 120,
  bufferAfterMinutes = 60
): boolean {
  const shiftStartDT = createVNDate(assignmentDate, shift.start_time)

  let endDate = assignmentDate
  if (shift.crosses_midnight) {
    const d = new Date(assignmentDate + 'T00:00:00+07:00')
    d.setDate(d.getDate() + 1)
    endDate = d.toISOString().split('T')[0]
  }
  const shiftEndDT = createVNDate(endDate, shift.end_time)

  const windowStart = new Date(shiftStartDT.getTime() - bufferBeforeMinutes * 60 * 1000)
  const windowEnd = new Date(shiftEndDT.getTime() + bufferAfterMinutes * 60 * 1000)

  return now >= windowStart && now <= windowEnd
}

function detectBestShift(
  assignments: { shift_id: string; shift: ShiftInfo; assignment_date: string }[],
  now: Date
): { shift_id: string; shift: ShiftInfo; assignment_date: string } | null {
  if (assignments.length === 0) return null
  if (assignments.length === 1) return assignments[0]

  const inWindow = assignments.filter(a =>
    isInShiftWindow(a.shift, a.assignment_date, now)
  )

  const candidates = inWindow.length > 0 ? inWindow : assignments

  let best = candidates[0]
  let bestDistance = Infinity

  for (const a of candidates) {
    const shiftStartDT = createVNDate(a.assignment_date, a.shift.start_time)
    const distance = Math.abs(now.getTime() - shiftStartDT.getTime())
    if (distance < bestDistance) {
      bestDistance = distance
      best = a
    }
  }

  return best
}

// ============================================================================
// SHIFT ASSIGNMENT QUERY — team_id + join shift_teams
// ============================================================================

const SHIFT_ASSIGNMENT_SELECT = `
  id, shift_id, date, team_id,
  shift:shifts!shift_assignments_shift_id_fkey(
    id, code, name, start_time, end_time,
    standard_hours, break_minutes, crosses_midnight,
    late_threshold_minutes, early_leave_threshold_minutes
  ),
  team:shift_teams!shift_assignments_team_id_fkey(
    id, code, name
  )
`

interface RelevantAssignment {
  shift_id: string
  shift: ShiftInfo
  assignment_date: string
  assignment_id: string
  team_code?: string
  team_name?: string
}

async function getRelevantAssignments(
  employeeId: string,
  now: Date
): Promise<RelevantAssignment[]> {
  const today = now.toISOString().split('T')[0]
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('shift_assignments')
    .select(SHIFT_ASSIGNMENT_SELECT)
    .eq('employee_id', employeeId)
    .in('date', [today, yesterdayStr])
    .order('date', { ascending: true })

  if (error) {
    console.error('getRelevantAssignments:', error)
    return []
  }

  const results: RelevantAssignment[] = []

  for (const a of data || []) {
    const shift = (Array.isArray(a.shift) ? a.shift[0] : a.shift) as ShiftInfo
    if (!shift) continue

    const team = Array.isArray(a.team) ? a.team[0] : a.team
    const teamCode = team?.code || undefined
    const teamName = team?.name || undefined

    if (a.date === yesterdayStr) {
      if (shift.crosses_midnight && isInShiftWindow(shift, yesterdayStr, now)) {
        results.push({
          shift_id: a.shift_id,
          shift,
          assignment_date: yesterdayStr,
          assignment_id: a.id,
          team_code: teamCode,
          team_name: teamName,
        })
      }
    } else {
      results.push({
        shift_id: a.shift_id,
        shift,
        assignment_date: today,
        assignment_id: a.id,
        team_code: teamCode,
        team_name: teamName,
      })
    }
  }

  return results
}

// ============================================================================
// ATTENDANCE SELECT CONSTANT
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
  // TODAY QUERIES — Bao gồm ca đêm hôm qua
  // ═══════════════════════════════════════════════════

  async getTodayShifts(employeeId: string): Promise<TodayShiftAssignment[]> {
    const now = new Date()
    const assignments = await getRelevantAssignments(employeeId, now)

    return assignments.map(a => ({
      id: a.assignment_id,
      shift_id: a.shift_id,
      shift: a.shift,
      assignment_date: a.assignment_date,
      team_code: a.team_code,
      team_name: a.team_name,
    }))
  },

  async getTodayAttendances(employeeId: string): Promise<AttendanceRecord[]> {
    const today = getToday()
    const yesterday = getYesterday()

    const { data, error } = await supabase
      .from('attendance')
      .select(ATTENDANCE_SELECT)
      .eq('employee_id', employeeId)
      .in('date', [today, yesterday])
      .order('check_in_time')

    if (error) { console.error('getTodayAttendances:', error); return [] }

    const records = (data || []).map(normalize)

    return records.filter(r => {
      if (r.date === today) return true
      if (r.date === yesterday && r.shift?.crosses_midnight) {
        return !r.check_out_time
      }
      return false
    })
  },

  async getOpenAttendance(employeeId: string): Promise<AttendanceRecord | null> {
    const today = getToday()
    const yesterday = getYesterday()

    const { data, error } = await supabase
      .from('attendance')
      .select(ATTENDANCE_SELECT)
      .eq('employee_id', employeeId)
      .in('date', [today, yesterday])
      .not('check_in_time', 'is', null)
      .is('check_out_time', null)
      .order('check_in_time', { ascending: false })
      .limit(1)

    if (error) { console.error('getOpenAttendance:', error); return null }
    if (!data || data.length === 0) return null
    return normalize(data[0])
  },

  // ═══════════════════════════════════════════════════
  // ★★★ V6: CHECK-IN — Gọi autoCheckoutService thống nhất
  // ═══════════════════════════════════════════════════

  async checkIn(employeeId: string, options: CheckInOptions = {}): Promise<AttendanceRecord> {
    const { targetShiftId, gps, isGpsVerified } = options
    const now = new Date()
    const today = getToday()
    const nowISO = now.toISOString()

    // ① ★ V6: Open record check — gọi autoCheckoutService thống nhất
    const openRecord = await this.getOpenAttendance(employeeId)
    if (openRecord) {
      // Thử auto-close nếu đã quá buffer (1h sau ca)
      const autoClosed = await autoCheckoutService.tryCloseForEmployee(employeeId)

      if (autoClosed) {
        // Đã đóng thành công → kiểm tra còn record mở khác không
        const stillOpen = await this.getOpenAttendance(employeeId)
        if (stillOpen) {
          throw new Error(
            `Bạn chưa check-out ca ${stillOpen.shift?.name || 'trước đó'}. Vui lòng check-out trước.`
          )
        }
        console.log(`[CheckIn V6] Auto-closed expired record for ${employeeId}`)
      } else {
        // Chưa đủ điều kiện → NV phải tự checkout
        throw new Error(
          `Bạn chưa check-out ca ${openRecord.shift?.name || 'trước đó'}. Vui lòng check-out trước.`
        )
      }
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

    // ③ LOOKUP shift_assignments — cả today + yesterday
    const allAssignments = await getRelevantAssignments(employeeId, now)

    // ④ Select shift
    let selectedShift: RelevantAssignment | null = null

    if (targetShiftId) {
      selectedShift = allAssignments.find(a => a.shift_id === targetShiftId) || null

      if (!selectedShift) {
        const { data: shiftData } = await supabase
          .from('shifts')
          .select('id, code, name, start_time, end_time, standard_hours, break_minutes, crosses_midnight, late_threshold_minutes, early_leave_threshold_minutes')
          .eq('id', targetShiftId)
          .single()
        if (shiftData) {
          selectedShift = {
            shift_id: targetShiftId,
            shift: shiftData as ShiftInfo,
            assignment_date: today,
            assignment_id: '',
          }
        }
      }
    } else if (allAssignments.length > 0) {
      selectedShift = detectBestShift(allAssignments, now) as RelevantAssignment | null
    }

    // ⑤ Duplicate check
    const attendanceDate = selectedShift?.assignment_date || today

    if (selectedShift) {
      const { data: dup } = await supabase
        .from('attendance').select('id')
        .eq('employee_id', employeeId)
        .eq('date', attendanceDate)
        .eq('shift_id', selectedShift.shift_id)
        .limit(1)

      if (dup && dup.length > 0) {
        throw new Error(`Bạn đã check-in ca ${selectedShift.shift.name} ngày ${attendanceDate} rồi`)
      }
    } else {
      const { data: dup } = await supabase
        .from('attendance').select('id')
        .eq('employee_id', employeeId)
        .eq('date', attendanceDate)
        .is('shift_id', null)
        .limit(1)

      if (dup && dup.length > 0) {
        throw new Error('Bạn đã check-in hôm nay rồi')
      }
    }

    // ⑥ Late calculation — ★ V6: dùng createVNDate()
    let status = 'present'
    let lateMinutes = 0
    let breakMins = 0

    if (selectedShift) {
      const shift = selectedShift.shift
      breakMins = shift.break_minutes || 0

      const shiftStartDT = createVNDate(selectedShift.assignment_date, shift.start_time)
      const diffMs = now.getTime() - shiftStartDT.getTime()
      const diffMinutes = Math.floor(diffMs / (1000 * 60))
      const threshold = shift.late_threshold_minutes || 15

      if (diffMinutes > threshold) {
        status = 'late'
        lateMinutes = diffMinutes
      }
    } else {
      // Fallback: không có shift — dùng giờ hành chính 8:00
      const defaultStart = new Date(today + 'T08:00:00+07:00')
      const diffMs = now.getTime() - defaultStart.getTime()
      const diffMinutes = Math.floor(diffMs / (1000 * 60))

      if (diffMinutes > 30) {
        status = 'late'
        lateMinutes = diffMinutes
      }
    }

    // ⑦ Insert
    const { data, error } = await supabase
      .from('attendance')
      .insert({
        employee_id: employeeId,
        date: attendanceDate,
        check_in_time: nowISO,
        status,
        shift_id: selectedShift?.shift_id || null,
        shift_date: attendanceDate,
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
  // CHECK-OUT — OT tham chiếu phiếu tăng ca (giữ từ V5)
  // ═══════════════════════════════════════════════════

  async checkOut(employeeId: string, options: CheckOutOptions = {}): Promise<AttendanceRecord> {
    const { gps } = options
    const now = new Date()
    const nowISO = now.toISOString()

    const openRecord = await this.getOpenAttendance(employeeId)
    if (!openRecord) throw new Error('Không tìm thấy ca đang mở. Bạn chưa check-in.')

    const checkOutLat = gps?.latitude || null
    const checkOutLng = gps?.longitude || null

    // Tổng thời gian từ check-in đến check-out
    const checkIn = new Date(openRecord.check_in_time!)
    const totalElapsedMinutes = Math.max(0, Math.floor((now.getTime() - checkIn.getTime()) / (1000 * 60)))

    let earlyLeaveMinutes = 0
    let overtimeMinutes = 0
    let workingMinutes = 0
    let newStatus = openRecord.status

    if (openRecord.shift) {
      const shift = openRecord.shift
      const breakMins = shift.break_minutes || 0
      const standardMinutes = shift.standard_hours * 60

      workingMinutes = Math.max(0, totalElapsedMinutes - breakMins)

      // OT chỉ tính khi có phiếu tăng ca approved
      const excessMinutes = Math.max(0, workingMinutes - standardMinutes)

      if (excessMinutes > 0) {
        try {
          const { data: otRequest } = await supabase
            .from('overtime_requests')
            .select('id, planned_minutes, status')
            .eq('employee_id', employeeId)
            .eq('request_date', openRecord.date)
            .eq('status', 'approved')
            .maybeSingle()

          if (otRequest) {
            overtimeMinutes = Math.min(excessMinutes, otRequest.planned_minutes)

            await supabase
              .from('overtime_requests')
              .update({
                actual_minutes: excessMinutes,
                updated_at: nowISO,
              })
              .eq('id', otRequest.id)
          }
        } catch (err) {
          console.error('[CheckOut] Error checking overtime_requests:', err)
        }
      }

      // Early leave
      const earlyThreshold = shift.early_leave_threshold_minutes || 15
      if (workingMinutes < standardMinutes) {
        const shortage = standardMinutes - workingMinutes
        if (shortage > earlyThreshold) {
          earlyLeaveMinutes = shortage
          if (openRecord.status === 'late' || openRecord.late_minutes > 0) {
            newStatus = 'late_and_early'
          } else {
            newStatus = 'early_leave'
          }
        }
      }
    } else {
      // Fallback: không có shift — dùng 8h chuẩn, 1h break
      const standardMinutes = 480
      const breakMins = 60
      workingMinutes = Math.max(0, totalElapsedMinutes - breakMins)
      overtimeMinutes = 0

      if (workingMinutes < standardMinutes) {
        const shortage = standardMinutes - workingMinutes
        if (shortage > 15) {
          earlyLeaveMinutes = shortage
          if (openRecord.status === 'late' || openRecord.late_minutes > 0) {
            newStatus = 'late_and_early'
          } else {
            newStatus = 'early_leave'
          }
        }
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
    return this.getByEmployeeAndDate(employeeId, getToday())
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

    let query = supabase
      .from('attendance').select(ATTENDANCE_SELECT)
      .gte('date', startDate).lte('date', endDate)

    if (departmentId) {
      const { data: deptEmps } = await supabase
        .from('employees').select('id')
        .eq('department_id', departmentId).eq('status', 'active')
      if (deptEmps && deptEmps.length > 0) {
        query = query.in('employee_id', deptEmps.map(e => e.id))
      } else {
        return []
      }
    }

    const { data, error } = await query
      .order('employee_id').order('date')
    if (error) throw error

    return (data || []).map(normalize)
  },
}

export default attendanceService