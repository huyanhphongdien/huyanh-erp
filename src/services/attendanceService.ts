// ============================================================================
// ATTENDANCE SERVICE V4 — Overnight Shift Fix + Multi-Shift Robust
// File: src/services/attendanceService.ts
// Huy Anh ERP System - Chấm công V4
// ============================================================================
// FIX V4.0:
//   ① getTodayShifts()   — query cả yesterday cho ca crosses_midnight
//   ② checkIn()          — lookup cả yesterday cho ca đêm check-in trễ
//   ③ checkIn()          — late calculation đúng cho ca đêm
//   ④ checkIn()          — attendance date = shift_assignments.date (ngày bắt đầu ca)
//   ⑤ getRelevantShifts() — helper mới: tìm ca hợp lệ cho thời điểm hiện tại
//   ⑥ Bỏ dependency shiftTeamService (team info tùy chọn)
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
  assignment_date: string   // ★ V4: ngày phân ca (có thể là hôm qua cho ca đêm)
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

/**
 * Kiểm tra thời điểm hiện tại có nằm trong window check-in của ca không
 * Buffer: 2h trước ca, 1h sau kết thúc ca
 * 
 * Ví dụ: Ca 3 (22:00-06:00), assignment_date = 24/02
 *   → Window check-in: 20:00 ngày 24 → 07:00 ngày 25
 *   → Lúc 22:30 ngày 24: ✓ (trong window)
 *   → Lúc 02:00 ngày 25: ✓ (trong window, check-in trễ ca đêm)
 *   → Lúc 10:00 ngày 25: ✗ (ngoài window)
 */
function isInShiftWindow(
  shift: ShiftInfo,
  assignmentDate: string,
  now: Date,
  bufferBeforeMinutes = 120,
  bufferAfterMinutes = 60
): boolean {
  const startMin = timeToMinutes(shift.start_time)
  const endMin = timeToMinutes(shift.end_time)

  // Tạo datetime bắt đầu ca
  const shiftStartDT = new Date(assignmentDate + 'T00:00:00')
  shiftStartDT.setMinutes(startMin)

  // Tạo datetime kết thúc ca
  const shiftEndDT = new Date(assignmentDate + 'T00:00:00')
  if (shift.crosses_midnight) {
    shiftEndDT.setDate(shiftEndDT.getDate() + 1) // Ngày hôm sau
  }
  shiftEndDT.setMinutes(endMin)

  // Window = [start - buffer, end + buffer]
  const windowStart = new Date(shiftStartDT.getTime() - bufferBeforeMinutes * 60 * 1000)
  const windowEnd = new Date(shiftEndDT.getTime() + bufferAfterMinutes * 60 * 1000)

  return now >= windowStart && now <= windowEnd
}

/**
 * Chọn ca tốt nhất từ danh sách assignments dựa trên thời điểm hiện tại
 * Ưu tiên: ca đang trong window check-in và gần giờ bắt đầu nhất
 */
function detectBestShift(
  assignments: { shift_id: string; shift: ShiftInfo; assignment_date: string }[],
  now: Date
): { shift_id: string; shift: ShiftInfo; assignment_date: string } | null {
  if (assignments.length === 0) return null
  if (assignments.length === 1) return assignments[0]

  // Lọc ca trong window check-in
  const inWindow = assignments.filter(a =>
    isInShiftWindow(a.shift, a.assignment_date, now)
  )

  const candidates = inWindow.length > 0 ? inWindow : assignments

  // Chọn ca gần nhất (theo khoảng cách đến start_time)
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
// SHIFT ASSIGNMENT QUERY
// ============================================================================

const SHIFT_ASSIGNMENT_SELECT = `
  id, shift_id, date,
  shift:shifts!shift_assignments_shift_id_fkey(
    id, code, name, start_time, end_time,
    standard_hours, break_minutes, crosses_midnight,
    late_threshold_minutes, early_leave_threshold_minutes
  )
`

/**
 * ★ V4: Lấy tất cả ca liên quan cho thời điểm hiện tại
 * 
 * Query 2 ngày:
 *   - today: tất cả ca hôm nay
 *   - yesterday: chỉ ca crosses_midnight (ca đêm hôm qua chưa kết thúc)
 */
async function getRelevantAssignments(
  employeeId: string,
  now: Date
): Promise<{ shift_id: string; shift: ShiftInfo; assignment_date: string; assignment_id: string }[]> {
  const today = now.toISOString().split('T')[0]
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  // Query cả 2 ngày
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

  const results: { shift_id: string; shift: ShiftInfo; assignment_date: string; assignment_id: string }[] = []

  for (const a of data || []) {
    const shift = (Array.isArray(a.shift) ? a.shift[0] : a.shift) as ShiftInfo
    if (!shift) continue

    // Ca hôm qua: chỉ lấy nếu crosses_midnight VÀ đang trong window
    if (a.date === yesterdayStr) {
      if (shift.crosses_midnight && isInShiftWindow(shift, yesterdayStr, now)) {
        results.push({
          shift_id: a.shift_id,
          shift,
          assignment_date: yesterdayStr,
          assignment_id: a.id,
        })
      }
    } else {
      // Ca hôm nay: lấy tất cả
      results.push({
        shift_id: a.shift_id,
        shift,
        assignment_date: today,
        assignment_id: a.id,
      })
    }
  }

  return results
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
  // ★ V4: TODAY QUERIES — Bao gồm ca đêm hôm qua
  // ═══════════════════════════════════════════════════

  /**
   * ★ V4: Lấy tất cả ca liên quan cho hôm nay
   * Bao gồm ca đêm hôm qua nếu đang trong window
   */
  async getTodayShifts(employeeId: string): Promise<TodayShiftAssignment[]> {
    const now = new Date()
    const assignments = await getRelevantAssignments(employeeId, now)

    return assignments.map(a => ({
      id: a.assignment_id,
      shift_id: a.shift_id,
      shift: a.shift,
      assignment_date: a.assignment_date,
    }))
  },

  async getTodayAttendances(employeeId: string): Promise<AttendanceRecord[]> {
    const today = getToday()
    const yesterday = getYesterday()

    // ★ V4: Query cả hôm nay + hôm qua (cho ca đêm)
    const { data, error } = await supabase
      .from('attendance')
      .select(ATTENDANCE_SELECT)
      .eq('employee_id', employeeId)
      .in('date', [today, yesterday])
      .order('check_in_time')

    if (error) { console.error('getTodayAttendances:', error); return [] }

    const records = (data || []).map(normalize)

    // Lọc: giữ tất cả hôm nay + ca đêm hôm qua (crosses_midnight)
    return records.filter(r => {
      if (r.date === today) return true
      // Ca hôm qua: chỉ giữ nếu crosses_midnight VÀ chưa check-out
      if (r.date === yesterday && r.shift?.crosses_midnight) {
        return !r.check_out_time // Đang mở = hiển thị
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
  // ★★★ V4: CHECK-IN — Overnight shift support
  // ═══════════════════════════════════════════════════

  async checkIn(employeeId: string, options: CheckInOptions = {}): Promise<AttendanceRecord> {
    const { targetShiftId, gps, isGpsVerified } = options
    const now = new Date()
    const today = getToday()
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

    // ③ ★★★ V4: LOOKUP shift_assignments — cả today + yesterday ★★★
    const allAssignments = await getRelevantAssignments(employeeId, now)

    // ④ Select shift
    let selectedShift: { shift_id: string; shift: ShiftInfo; assignment_date: string } | null = null

    if (targetShiftId) {
      // Tìm trong assignments trước
      selectedShift = allAssignments.find(a => a.shift_id === targetShiftId) || null

      if (!selectedShift) {
        // Fallback: load shift trực tiếp (cho trường hợp chưa phân ca nhưng chọn thủ công)
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
          }
        }
      }
    } else if (allAssignments.length > 0) {
      selectedShift = detectBestShift(allAssignments, now)
    }

    // ⑤ Duplicate check
    // ★ V4: attendance.date = assignment_date (ngày phân ca, không phải ngày hiện tại)
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

    // ⑥ ★ V4: Late calculation — đúng cho mọi loại ca
    let status = 'present'
    let lateMinutes = 0
    let breakMins = 0

    if (selectedShift) {
      const shift = selectedShift.shift
      breakMins = shift.break_minutes || 0

      // Tạo datetime chính xác cho giờ bắt đầu ca
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
    // ★ V4: date = assignment_date (ngày phân ca, quan trọng cho ca đêm)
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
  // CHECK-OUT — Handles overnight shifts (giữ nguyên, đã đúng)
  // ═══════════════════════════════════════════════════

  async checkOut(employeeId: string, options: CheckOutOptions = {}): Promise<AttendanceRecord> {
    const { gps } = options
    const now = new Date()
    const nowISO = now.toISOString()

    const openRecord = await this.getOpenAttendance(employeeId)
    if (!openRecord) throw new Error('Không tìm thấy ca đang mở. Bạn chưa check-in.')

    const checkOutLat = gps?.latitude || null
    const checkOutLng = gps?.longitude || null

    // ★ V4.1: Tổng thời gian từ check-in đến check-out
    const checkIn = new Date(openRecord.check_in_time!)
    const totalElapsedMinutes = Math.max(0, Math.floor((now.getTime() - checkIn.getTime()) / (1000 * 60)))

    // Early leave / overtime / working time
    let earlyLeaveMinutes = 0
    let overtimeMinutes = 0
    let workingMinutes = 0
    let newStatus = openRecord.status

    if (openRecord.shift) {
      const shift = openRecord.shift
      const breakMins = shift.break_minutes || 0
      const standardMinutes = shift.standard_hours * 60  // VD: 8h = 480 phút

      // ★ V4.1: working_minutes = tổng thời gian - break (không âm)
      workingMinutes = Math.max(0, totalElapsedMinutes - breakMins)

      // ★ V4.1: OT = thời gian làm thực tế vượt giờ chuẩn (không tính break)
      // VD: Ca 8h, break 1h, standard = 8h (480p)
      //     Làm 10h (600p) - break 60p = 540p working → OT = 540 - 480 = 60p
      overtimeMinutes = Math.max(0, workingMinutes - standardMinutes)

      // ★ V4.1: Early leave = giờ chuẩn - giờ làm thực tế
      // VD: Ca 8h, làm 5h → early = 480 - 300 = 180p (3h)
      const earlyThreshold = shift.early_leave_threshold_minutes || 15
      if (workingMinutes < standardMinutes) {
        const shortage = standardMinutes - workingMinutes
        if (shortage > earlyThreshold) {
          earlyLeaveMinutes = shortage
          if (openRecord.status !== 'late') newStatus = 'early_leave'
        }
      }
    } else {
      // Fallback: không có shift — dùng 8h chuẩn, 1h break
      const standardMinutes = 480 // 8h
      const breakMins = 60
      workingMinutes = Math.max(0, totalElapsedMinutes - breakMins)
      overtimeMinutes = Math.max(0, workingMinutes - standardMinutes)

      if (workingMinutes < standardMinutes) {
        const shortage = standardMinutes - workingMinutes
        if (shortage > 15) {
          earlyLeaveMinutes = shortage
          if (openRecord.status !== 'late') newStatus = 'early_leave'
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