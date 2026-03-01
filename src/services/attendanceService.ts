// ============================================================================
// ATTENDANCE SERVICE V5 — Auto-checkout + OT Requests + Team Info
// File: src/services/attendanceService.ts
// Huy Anh ERP System - Chấm công V5
// ============================================================================
// V5.0 Changes:
//   ① [BUG 2] checkIn() — auto-checkout records mở quá hạn thay vì block
//   ② [BUG 3] checkOut() — OT chỉ tính khi có phiếu tăng ca approved
//   ③ [BUG 4] getRelevantAssignments — select team_id + join shift_teams
//   ④ [BUG 4] getTodayShifts — trả về team_code, team_name
//   ⑤ Giữ nguyên toàn bộ V4 logic: ca đêm, multi-shift, GPS
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
  assignment_date: string
  team_code?: string   // ★ V5: populated from shift_teams join
  team_name?: string   // ★ V5: populated from shift_teams join
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
// DATE HELPERS
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

// ============================================================================
// ★ V4: SHIFT DETECTION — Hỗ trợ ca qua đêm
// ============================================================================

function isInShiftWindow(
  shift: ShiftInfo,
  assignmentDate: string,
  now: Date,
  bufferBeforeMinutes = 120,
  bufferAfterMinutes = 60
): boolean {
  const startMin = timeToMinutes(shift.start_time)
  const endMin = timeToMinutes(shift.end_time)

  const shiftStartDT = new Date(assignmentDate + 'T00:00:00')
  shiftStartDT.setMinutes(startMin)

  const shiftEndDT = new Date(assignmentDate + 'T00:00:00')
  if (shift.crosses_midnight) {
    shiftEndDT.setDate(shiftEndDT.getDate() + 1)
  }
  shiftEndDT.setMinutes(endMin)

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
    const startMin = timeToMinutes(a.shift.start_time)
    const shiftStartDT = new Date(a.assignment_date + 'T00:00:00')
    shiftStartDT.setMinutes(startMin)

    const distance = Math.abs(now.getTime() - shiftStartDT.getTime())
    if (distance < bestDistance) {
      bestDistance = distance
      best = a
    }
  }

  return best
}

// ============================================================================
// ★ V5: SHIFT ASSIGNMENT QUERY — Thêm team_id + join shift_teams
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

// ★ V5: Internal type cho assignment kết quả
interface RelevantAssignment {
  shift_id: string
  shift: ShiftInfo
  assignment_date: string
  assignment_id: string
  team_code?: string
  team_name?: string
}

/**
 * ★ V5: Lấy tất cả ca liên quan — bao gồm team info
 */
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

    // ★ V5: Extract team info
    const team = Array.isArray(a.team) ? a.team[0] : a.team
    const teamCode = team?.code || undefined
    const teamName = team?.name || undefined

    if (a.date === yesterdayStr) {
      // Ca hôm qua: chỉ lấy nếu crosses_midnight VÀ đang trong window
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
      // Ca hôm nay: lấy tất cả
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
// ★ V5: AUTO-CHECKOUT HELPER
// ============================================================================

/**
 * Tính shift_end datetime từ date + shift info
 */
function getShiftEndDatetime(date: string, endTime: string, crossesMidnight: boolean): Date {
  const dt = new Date(date + 'T00:00:00')
  dt.setMinutes(timeToMinutes(endTime))
  if (crossesMidnight) {
    dt.setDate(dt.getDate() + 1)
  }
  return dt
}

/**
 * ★ V5: Thử auto-checkout 1 record mở nếu đã quá hạn
 * Returns true nếu đã đóng thành công
 */
async function tryAutoCloseRecord(record: AttendanceRecord, now: Date): Promise<boolean> {
  // Tính shift_end
  let shiftEndDt: Date
  if (record.shift?.end_time) {
    shiftEndDt = getShiftEndDatetime(
      record.date,
      record.shift.end_time,
      record.shift.crosses_midnight || false
    )
  } else {
    shiftEndDt = new Date(record.date + 'T17:00:00')
  }

  // Phải quá 2h sau kết thúc ca mới auto-checkout
  const BUFFER_MS = 2 * 60 * 60 * 1000
  if (now.getTime() <= shiftEndDt.getTime() + BUFFER_MS) {
    return false
  }

  // Tính toán giờ làm
  const checkInDt = new Date(record.check_in_time!)
  const breakMins = record.shift?.break_minutes ?? record.break_minutes ?? 60
  const stdMins = (record.shift?.standard_hours ?? 8) * 60
  const earlyThreshold = record.shift?.early_leave_threshold_minutes ?? 15

  let workingMinutes = Math.max(0,
    Math.floor((shiftEndDt.getTime() - checkInDt.getTime()) / (1000 * 60)) - breakMins
  )
  workingMinutes = Math.min(workingMinutes, stdMins) // Cap tại standard_hours

  let earlyLeaveMinutes = 0
  let newStatus = record.status
  if (workingMinutes < stdMins) {
    const shortage = stdMins - workingMinutes
    if (shortage > earlyThreshold) {
      earlyLeaveMinutes = shortage
      // ★ V5 BUG 7: Phân biệt late + early_leave + late_and_early
      if (record.status === 'late' || record.late_minutes > 0) {
        newStatus = 'late_and_early'
      } else {
        newStatus = 'early_leave'
      }
    }
  }

  const { error } = await supabase
    .from('attendance')
    .update({
      check_out_time: shiftEndDt.toISOString(),
      auto_checkout: true,
      working_minutes: workingMinutes,
      overtime_minutes: 0,
      early_leave_minutes: earlyLeaveMinutes,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', record.id)

  if (error) {
    console.error(`[AutoCheckout] Failed record ${record.id}:`, error)
    return false
  }

  console.log(`[AutoCheckout] Đóng ${record.id} — NV ${record.employee_id}, ngày ${record.date}`)
  return true
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
  // TODAY QUERIES — Bao gồm ca đêm hôm qua
  // ═══════════════════════════════════════════════════

  /** ★ V5: Trả về team_code, team_name từ shift_assignments join */
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
  // ★★★ V5: CHECK-IN — Auto-checkout fallback
  // ═══════════════════════════════════════════════════

  async checkIn(employeeId: string, options: CheckInOptions = {}): Promise<AttendanceRecord> {
    const { targetShiftId, gps, isGpsVerified } = options
    const now = new Date()
    const today = getToday()
    const nowISO = now.toISOString()

    // ① ★★★ V5: Open record check — với auto-checkout fallback ★★★
    const openRecord = await this.getOpenAttendance(employeeId)
    if (openRecord) {
      // Thử auto-checkout nếu đã quá hạn
      const autoClosed = await tryAutoCloseRecord(openRecord, now)

      if (autoClosed) {
        // Đã đóng → kiểm tra còn record mở khác không
        const stillOpen = await this.getOpenAttendance(employeeId)
        if (stillOpen) {
          throw new Error(
            `Bạn chưa check-out ca ${stillOpen.shift?.name || 'trước đó'}. Vui lòng check-out trước.`
          )
        }
        // OK — đã tự đóng, tiếp tục check-in
        console.log(`[CheckIn] Auto-closed expired record for ${employeeId}, proceeding with check-in`)
      } else {
        // Chưa đủ điều kiện auto-checkout (ca vẫn đang trong thời gian)
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

    // ⑥ Late calculation
    let status = 'present'
    let lateMinutes = 0
    let breakMins = 0

    if (selectedShift) {
      const shift = selectedShift.shift
      breakMins = shift.break_minutes || 0

      const startMin = timeToMinutes(shift.start_time)
      const shiftStartDT = new Date(selectedShift.assignment_date + 'T00:00:00')
      shiftStartDT.setMinutes(startMin)

      const diffMs = now.getTime() - shiftStartDT.getTime()
      const diffMinutes = Math.floor(diffMs / (1000 * 60))
      const threshold = shift.late_threshold_minutes || 15

      if (diffMinutes > threshold) {
        status = 'late'
        lateMinutes = diffMinutes
      }
    } else {
      // Fallback: không có shift — dùng giờ hành chính 8:00
      const defaultStart = new Date(today + 'T08:00:00')
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
  // ★★★ V5: CHECK-OUT — OT tham chiếu phiếu tăng ca
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

    // Calculate working time, early leave, overtime
    let earlyLeaveMinutes = 0
    let overtimeMinutes = 0
    let workingMinutes = 0
    let newStatus = openRecord.status

    if (openRecord.shift) {
      const shift = openRecord.shift
      const breakMins = shift.break_minutes || 0
      const standardMinutes = shift.standard_hours * 60

      workingMinutes = Math.max(0, totalElapsedMinutes - breakMins)

      // ★★★ V5: OT chỉ tính khi có phiếu tăng ca approved ★★★
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
            // Có phiếu approved → OT = min(thực tế vượt, phút đã duyệt)
            overtimeMinutes = Math.min(excessMinutes, otRequest.planned_minutes)

            // Cập nhật actual_minutes vào phiếu
            await supabase
              .from('overtime_requests')
              .update({
                actual_minutes: excessMinutes,
                updated_at: nowISO,
              })
              .eq('id', otRequest.id)
          }
          // Không có phiếu → overtimeMinutes = 0 (không tính OT)
        } catch (err) {
          // Lỗi query overtime_requests → an toàn: không tính OT
          console.error('[CheckOut] Error checking overtime_requests:', err)
        }
      }

      // Early leave
      const earlyThreshold = shift.early_leave_threshold_minutes || 15
      if (workingMinutes < standardMinutes) {
        const shortage = standardMinutes - workingMinutes
        if (shortage > earlyThreshold) {
          earlyLeaveMinutes = shortage
          // ★ V5 BUG 7: Phân biệt late + early_leave + late_and_early
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
      // Không tính OT khi không có shift (không thể có phiếu tăng ca)
      overtimeMinutes = 0

      if (workingMinutes < standardMinutes) {
        const shortage = standardMinutes - workingMinutes
        if (shortage > 15) {
          earlyLeaveMinutes = shortage
          // ★ V5 BUG 7: Phân biệt late + early_leave + late_and_early
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
  // ★ V5: AUTO-CHECKOUT — Chạy hàng loạt
  // ═══════════════════════════════════════════════════

  /**
   * Tìm và đóng tất cả attendance records mở quá hạn.
   * Gọi khi: admin mở dashboard, hoặc widget mount.
   */
  async runAutoCheckout(): Promise<{ closed: number }> {
    const now = new Date()
    let closed = 0

    const { data: openRecords, error } = await supabase
      .from('attendance')
      .select(ATTENDANCE_SELECT)
      .is('check_out_time', null)
      .not('check_in_time', 'is', null)
      .eq('auto_checkout', false)

    if (error || !openRecords) return { closed: 0 }

    for (const raw of openRecords) {
      const record = normalize(raw)
      const success = await tryAutoCloseRecord(record, now)
      if (success) closed++
    }

    if (closed > 0) {
      console.log(`[AutoCheckout] Đã đóng ${closed} records quá hạn`)
    }

    return { closed }
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

    // ★ V5: Filter server-side nếu có departmentId (IMPROVE 1)
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