// ============================================================================
// ATTENDANCE SERVICE V2
// File: src/services/attendanceService.ts
// Huy Anh ERP System - Chấm công V2: GPS + Ca làm việc
// THAY THẾ hoàn toàn file cũ
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface Attendance {
  id: string
  employee_id: string
  date: string
  check_in_time?: string
  check_out_time?: string
  working_minutes?: number
  overtime_minutes?: number
  status: string // 'present' | 'late' | 'early_leave' | 'absent'
  notes?: string
  // V2 fields
  shift_id?: string
  shift_date?: string
  late_minutes?: number
  early_leave_minutes?: number
  break_minutes?: number
  check_in_lat?: number
  check_in_lng?: number
  check_out_lat?: number
  check_out_lng?: number
  is_gps_verified?: boolean
  auto_checkout?: boolean
  // Timestamps
  created_at: string
  updated_at: string
  // Relations
  employee?: {
    id: string
    code: string
    full_name: string
    department_id?: string
    department?: {
      id: string
      name: string
    }
  }
  shift?: {
    id: string
    code: string
    name: string
    shift_category: string
    start_time: string
    end_time: string
    crosses_midnight: boolean
    standard_hours: number
    break_minutes: number
    late_threshold_minutes: number
    early_leave_threshold_minutes: number
  }
}

export interface AttendanceFormData {
  employee_id: string
  date: string
  check_in_time?: string
  check_out_time?: string
  working_minutes?: number
  overtime_minutes?: number
  status?: string
  notes?: string
  shift_id?: string
  late_minutes?: number
  early_leave_minutes?: number
}

interface PaginationParams {
  page: number
  pageSize: number
  search?: string
  status?: string
}

interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface GPSLocation {
  latitude: number
  longitude: number
}

interface GPSConfig {
  enabled: boolean
  locations: {
    name: string
    latitude: number
    longitude: number
    radius_meters: number
  }[]
}

// ============================================================================
// GPS UTILS
// ============================================================================

function calculateDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  // Haversine formula → khoảng cách tính bằng mét
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

async function getGPSConfig(): Promise<GPSConfig | null> {
  const { data, error } = await supabase
    .from('attendance_settings')
    .select('setting_value')
    .eq('setting_key', 'gps_config')
    .maybeSingle()

  if (error || !data) return null
  return data.setting_value as GPSConfig
}

function validateGPS(
  userLat: number, userLng: number,
  config: GPSConfig
): { valid: boolean; distance: number; location_name: string } {
  for (const loc of config.locations) {
    const distance = calculateDistance(userLat, userLng, loc.latitude, loc.longitude)
    if (distance <= loc.radius_meters) {
      return { valid: true, distance: Math.round(distance), location_name: loc.name }
    }
  }

  // Tính khoảng cách gần nhất
  const nearest = config.locations.reduce((min, loc) => {
    const d = calculateDistance(userLat, userLng, loc.latitude, loc.longitude)
    return d < min.distance ? { distance: d, name: loc.name } : min
  }, { distance: Infinity, name: '' })

  return {
    valid: false,
    distance: Math.round(nearest.distance),
    location_name: nearest.name
  }
}

// ============================================================================
// SELECT QUERY
// ============================================================================

const ATTENDANCE_SELECT = `
  *,
  employee:employees!attendance_employee_id_fkey(
    id, code, full_name,
    department_id,
    department:departments!employees_department_id_fkey(id, name)
  ),
  shift:shifts!attendance_shift_id_fkey(
    id, code, name, shift_category, start_time, end_time,
    crosses_midnight, standard_hours, break_minutes,
    late_threshold_minutes, early_leave_threshold_minutes
  )
`

// ============================================================================
// SERVICE
// ============================================================================

export const attendanceService = {

  // ══════════════════════════════════════════════════════════════════════════
  // GET ALL (Paginated) - CẬP NHẬT: thêm shift relation + department filter
  // ══════════════════════════════════════════════════════════════════════════

  async getAll(params: PaginationParams & {
    employee_id?: string
    department_id?: string
    from_date?: string
    to_date?: string
  }): Promise<PaginatedResponse<Attendance>> {
    const { page, pageSize, status, employee_id, department_id, from_date, to_date } = params
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('attendance')
      .select(ATTENDANCE_SELECT, { count: 'exact' })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (employee_id) {
      query = query.eq('employee_id', employee_id)
    }

    if (from_date) {
      query = query.gte('date', from_date)
    }

    if (to_date) {
      query = query.lte('date', to_date)
    }

    const { data, error, count } = await query
      .order('date', { ascending: false })
      .order('check_in_time', { ascending: false })
      .range(from, to)

    if (error) throw error

    // Filter theo department_id ở client (vì nested filter phức tạp)
    let filtered = data || []
    if (department_id) {
      filtered = filtered.filter(item => item.employee?.department_id === department_id)
    }

    return {
      data: filtered,
      total: department_id ? filtered.length : (count || 0),
      page,
      pageSize,
      totalPages: Math.ceil((department_id ? filtered.length : (count || 0)) / pageSize)
    }
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GET BY EMPLOYEE AND DATE
  // ══════════════════════════════════════════════════════════════════════════

  async getByEmployeeAndDate(employeeId: string, date: string): Promise<Attendance | null> {
    const { data, error } = await supabase
      .from('attendance')
      .select(ATTENDANCE_SELECT)
      .eq('employee_id', employeeId)
      .eq('date', date)
      .maybeSingle()

    if (error) throw error
    return data
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GET TODAY ATTENDANCE
  // ══════════════════════════════════════════════════════════════════════════

  async getTodayAttendance(employeeId: string): Promise<Attendance | null> {
    const today = new Date().toISOString().split('T')[0]
    const todayRecord = await this.getByEmployeeAndDate(employeeId, today)

    if (todayRecord) return todayRecord

    // Kiểm tra ca qua đêm từ hôm qua (chưa check-out)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    const yesterdayRecord = await this.getByEmployeeAndDate(employeeId, yesterdayStr)

    if (yesterdayRecord && yesterdayRecord.check_in_time && !yesterdayRecord.check_out_time) {
      // Có record hôm qua chưa check-out → ca qua đêm
      return yesterdayRecord
    }

    return null
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GET TODAY SHIFT - Lấy ca được phân cho hôm nay
  // ══════════════════════════════════════════════════════════════════════════

  async getTodayShift(employeeId: string): Promise<any | null> {
    const today = new Date().toISOString().split('T')[0]

    // Kiểm tra có đang trong ca qua đêm (hôm qua chưa check-out) không
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    const yesterdayRecord = await this.getByEmployeeAndDate(employeeId, yesterdayStr)
    if (yesterdayRecord && yesterdayRecord.check_in_time && !yesterdayRecord.check_out_time && yesterdayRecord.shift) {
      // Đang trong ca qua đêm → hiện ca đó
      return yesterdayRecord.shift
    }

    // Bình thường: lấy ca hôm nay
    const { data, error } = await supabase
      .from('shift_assignments')
      .select(`
        shift_id,
        shift:shifts!shift_assignments_shift_id_fkey(
          id, code, name, shift_category, start_time, end_time,
          crosses_midnight, standard_hours, break_minutes,
          late_threshold_minutes, early_leave_threshold_minutes
        )
      `)
      .eq('employee_id', employeeId)
      .eq('date', today)
      .maybeSingle()

    if (error) {
      console.error('Error loading today shift:', error)
      return null
    }
    return data?.shift || null
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CHECK-IN V2 (GPS + Shift)
  // ══════════════════════════════════════════════════════════════════════════

  async checkIn(
    employeeId: string,
    gps?: GPSLocation
  ): Promise<Attendance> {
    const today = new Date().toISOString().split('T')[0]
    const now = new Date()
    const nowISO = now.toISOString()

    // ① Kiểm tra đã check-in chưa
    const existing = await this.getByEmployeeAndDate(employeeId, today)
    if (existing) {
      throw new Error('Bạn đã check-in hôm nay rồi')
    }

    // ①b Kiểm tra ca qua đêm hôm qua chưa check-out
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]
    const yesterdayRecord = await this.getByEmployeeAndDate(employeeId, yesterdayStr)
    if (yesterdayRecord && yesterdayRecord.check_in_time && !yesterdayRecord.check_out_time) {
      throw new Error('Bạn chưa check-out ca qua đêm hôm qua. Vui lòng check-out trước.')
    }

    // ② Kiểm tra GPS (nếu bật)
    let isGpsVerified = false
    let checkInLat: number | null = null
    let checkInLng: number | null = null

    const gpsConfig = await getGPSConfig()
    if (gpsConfig?.enabled) {
      if (!gps) {
        throw new Error('Vui lòng bật định vị GPS để check-in')
      }

      checkInLat = gps.latitude
      checkInLng = gps.longitude

      const gpsResult = validateGPS(gps.latitude, gps.longitude, gpsConfig)
      if (!gpsResult.valid) {
        throw new Error(
          `Bạn không ở trong khu vực công ty. ` +
          `Khoảng cách đến ${gpsResult.location_name}: ${gpsResult.distance}m ` +
          `(cho phép: ${gpsConfig.locations[0]?.radius_meters || 300}m)`
        )
      }
      isGpsVerified = true
    } else if (gps) {
      // GPS không bắt buộc nhưng vẫn ghi nhận
      checkInLat = gps.latitude
      checkInLng = gps.longitude
    }

    // ③ Tìm ca được phân cho hôm nay
    const { data: shiftAssignment } = await supabase
      .from('shift_assignments')
      .select(`
        shift_id,
        shift:shifts!shift_assignments_shift_id_fkey(*)
      `)
      .eq('employee_id', employeeId)
      .eq('date', today)
      .maybeSingle()

    // ④ Xác định trạng thái
    let status = 'present'
    let lateMinutes = 0
    let shiftId: string | null = null
    let breakMins = 0

    if (shiftAssignment?.shift) {
      // ✅ CÓ CA → tính theo ca
      const shift = Array.isArray(shiftAssignment.shift)
        ? shiftAssignment.shift[0]
        : shiftAssignment.shift

      shiftId = shiftAssignment.shift_id
      breakMins = shift.break_minutes || 60

      // Parse start_time (format: "HH:MM:SS")
      const [startH, startM] = (shift.start_time as string).split(':').map(Number)
      const shiftStart = new Date(today)
      shiftStart.setHours(startH, startM, 0, 0)

      const diffMinutes = Math.floor((now.getTime() - shiftStart.getTime()) / (1000 * 60))

      if (diffMinutes > (shift.late_threshold_minutes || 15)) {
        status = 'late'
        lateMinutes = diffMinutes
      }
    } else {
      // ❌ KHÔNG CÓ CA → fallback logic cũ (8:30)
      const checkInHour = now.getHours()
      const checkInMinute = now.getMinutes()
      const isLate = checkInHour > 8 || (checkInHour === 8 && checkInMinute > 30)
      if (isLate) {
        status = 'late'
        lateMinutes = (checkInHour - 8) * 60 + (checkInMinute - 30)
      }
    }

    // ⑤ Tạo record
    const { data, error } = await supabase
      .from('attendance')
      .insert({
        employee_id: employeeId,
        date: today,
        check_in_time: nowISO,
        status,
        shift_id: shiftId,
        shift_date: today,
        late_minutes: Math.max(0, lateMinutes),
        break_minutes: breakMins,
        check_in_lat: checkInLat,
        check_in_lng: checkInLng,
        is_gps_verified: isGpsVerified
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CHECK-OUT V2 (GPS + OT logic)
  // ══════════════════════════════════════════════════════════════════════════

  async checkOut(
    employeeId: string,
    gps?: GPSLocation
  ): Promise<Attendance> {
    const today = new Date().toISOString().split('T')[0]
    const now = new Date()
    const nowISO = now.toISOString()

    // ① Lấy attendance hôm nay HOẶC hôm qua (ca qua đêm)
    let existing = await this.getByEmployeeAndDate(employeeId, today)

    // Nếu không có hôm nay, kiểm tra hôm qua (ca qua đêm)
    if (!existing) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().split('T')[0]

      const yesterdayRecord = await this.getByEmployeeAndDate(employeeId, yesterdayStr)

      if (yesterdayRecord && yesterdayRecord.check_in_time && !yesterdayRecord.check_out_time) {
        existing = yesterdayRecord
      }
    }

    if (!existing) {
      throw new Error('Bạn chưa check-in hôm nay')
    }

    if (existing.check_out_time) {
      throw new Error('Bạn đã check-out rồi')
    }

    // ② GPS (ghi nhận nếu có)
    let checkOutLat: number | null = null
    let checkOutLng: number | null = null

    if (gps) {
      checkOutLat = gps.latitude
      checkOutLng = gps.longitude
    }

    // ③ Tính toán dựa trên có shift hay không
    let workingMinutes: number
    let overtimeMinutes = 0
    let earlyLeaveMinutes = 0
    let finalStatus = existing.status

    const checkIn = new Date(existing.check_in_time!)

    if (existing.shift_id) {
      // ✅ CÓ CA → tính theo ca
      // Lấy thông tin shift
      const { data: shiftData } = await supabase
        .from('shifts')
        .select('*')
        .eq('id', existing.shift_id)
        .maybeSingle()

      if (shiftData) {
        const breakMins = shiftData.break_minutes || 60

        // Tính working minutes (trừ break)
        const rawMinutes = Math.floor((now.getTime() - checkIn.getTime()) / (1000 * 60))
        workingMinutes = Math.max(0, rawMinutes - breakMins)

        // Parse end_time - dùng ngày check-in (existing.date) để tính
        const [endH, endM] = (shiftData.end_time as string).split(':').map(Number)
        const attendanceDate = existing.date // Ngày check-in gốc
        const shiftEnd = new Date(attendanceDate + 'T00:00:00')
        shiftEnd.setHours(endH, endM, 0, 0)

        // Xử lý ca qua đêm: end_time < start_time → cộng 1 ngày
        if (shiftData.crosses_midnight) {
          shiftEnd.setDate(shiftEnd.getDate() + 1)
        }

        // Về sớm?
        const earlyThreshold = shiftData.early_leave_threshold_minutes || 15
        const diffToEnd = Math.floor((shiftEnd.getTime() - now.getTime()) / (1000 * 60))

        if (diffToEnd > earlyThreshold) {
          finalStatus = 'early_leave'
          earlyLeaveMinutes = diffToEnd
        }

        // OT: kiểm tra phiếu tăng ca đã duyệt
        if (now > shiftEnd) {
          const { data: otRequest } = await supabase
            .from('overtime_requests')
            .select('id, planned_minutes')
            .eq('employee_id', employeeId)
            .eq('overtime_date', existing.date)
            .eq('status', 'approved')
            .maybeSingle()

          if (otRequest) {
            overtimeMinutes = Math.floor((now.getTime() - shiftEnd.getTime()) / (1000 * 60))
            // Cập nhật actual_minutes vào overtime_requests
            await supabase
              .from('overtime_requests')
              .update({
                actual_start_time: shiftData.end_time,
                actual_end_time: now.toTimeString().slice(0, 8),
                actual_minutes: overtimeMinutes
              })
              .eq('id', otRequest.id)
          }
        }
      } else {
        // Shift không tìm thấy → fallback
        workingMinutes = Math.floor((now.getTime() - checkIn.getTime()) / (1000 * 60))
      }
    } else {
      // ❌ KHÔNG CÓ CA → logic cũ
      workingMinutes = Math.floor((now.getTime() - checkIn.getTime()) / (1000 * 60))

      // OT sau 17:30
      const endOfDay = new Date(today + 'T17:30:00')
      if (now > endOfDay) {
        overtimeMinutes = Math.floor((now.getTime() - endOfDay.getTime()) / (1000 * 60))
      }

      // Về sớm trước 17:00
      if (now.getHours() < 17) {
        finalStatus = 'early_leave'
        const standardEnd = new Date(today + 'T17:00:00')
        earlyLeaveMinutes = Math.floor((standardEnd.getTime() - now.getTime()) / (1000 * 60))
      }
    }

    // ④ Update record
    const { data, error } = await supabase
      .from('attendance')
      .update({
        check_out_time: nowISO,
        working_minutes: workingMinutes!,
        overtime_minutes: overtimeMinutes,
        early_leave_minutes: earlyLeaveMinutes,
        status: finalStatus,
        check_out_lat: checkOutLat,
        check_out_lng: checkOutLng
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MONTHLY REPORT - CẬP NHẬT: thêm shift relation
  // ══════════════════════════════════════════════════════════════════════════

  async getMonthlyReport(year: number, month: number, departmentId?: string): Promise<any[]> {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('attendance')
      .select(ATTENDANCE_SELECT)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('employee_id')
      .order('date')

    if (error) throw error

    if (departmentId && data) {
      return data.filter(item => item.employee?.department_id === departmentId)
    }

    return data || []
  },

  // ══════════════════════════════════════════════════════════════════════════
  // UPDATE (Admin)
  // ══════════════════════════════════════════════════════════════════════════

  async update(id: string, attendance: Partial<AttendanceFormData>): Promise<Attendance> {
    const { data, error } = await supabase
      .from('attendance')
      .update(attendance)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GET GPS CONFIG (cho UI hiển thị)
  // ══════════════════════════════════════════════════════════════════════════

  async getGPSConfig(): Promise<GPSConfig | null> {
    return getGPSConfig()
  },

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATE GPS (cho UI preview)
  // ══════════════════════════════════════════════════════════════════════════

  async validateGPSPosition(lat: number, lng: number): Promise<{
    valid: boolean
    distance: number
    location_name: string
  } | null> {
    const config = await getGPSConfig()
    if (!config?.enabled) return null
    return validateGPS(lat, lng, config)
  }
}

export default attendanceService