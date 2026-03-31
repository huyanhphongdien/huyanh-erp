// ============================================================================
// MONTHLY TIMESHEET SERVICE
// File: src/services/monthlyTimesheetService.ts
// ============================================================================
// Lấy dữ liệu bảng chấm công tháng cho 1 phòng ban hoặc tất cả
// Output: mảng nhân viên, mỗi NV có mảng 31 ngày với ký hiệu + chi tiết
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

/** Ký hiệu chấm công 1 ngày */
export type DaySymbol =
  | 'S'    // Ca sáng/ngày (SHORT_1, LONG_DAY)
  | 'Đ'    // Ca đêm (SHORT_3, LONG_NIGHT)
  | 'C2'   // Ca chiều (SHORT_2)
  | 'HC'   // Hành chính (ADMIN_PROD, ADMIN_OFFICE)
  | 'P'    // Nghỉ phép (approved leave)
  | 'CT'   // ★ Công tác (business_trip)
  | 'X'    // Vắng không phép
  | '—'    // Chưa tới ngày / CN
  | ''     // Trống (không có data)

/** Chi tiết 1 ngày của 1 NV */
export interface DayDetail {
  date: string              // "2026-03-01"
  symbol: DaySymbol
  shiftCode: string | null  // "SHORT_1", "LONG_NIGHT"...
  shiftName: string | null
  checkIn: string | null    // ISO string
  checkOut: string | null
  workingMinutes: number
  overtimeMinutes: number
  lateMinutes: number
  earlyLeaveMinutes: number
  status: string            // "present", "late", "early_leave"...
  autoCheckout: boolean
  isWeekend: boolean        // CN
  isLeave: boolean          // Nghỉ phép
  isBusinessTrip: boolean   // ★ Công tác
  leaveType: string | null  // "annual", "sick"...
  crossesMidnight: boolean
}

/** Tổng hợp 1 NV trong tháng */
export interface EmployeeMonthlySummary {
  employeeId: string
  employeeCode: string
  fullName: string
  departmentName: string
  days: DayDetail[]         // 28-31 phần tử
  // Tổng hợp
  totalWorkDays: number     // Số ngày đi làm (count)
  totalCong: number         // Tổng công = SUM(work_units), e.g. 28.5
  totalWorkingHours: number // Tổng giờ làm
  totalOvertimeHours: number
  totalLateDays: number     // Số lần trễ
  totalEarlyDays: number    // Số lần về sớm
  totalAbsentDays: number   // Vắng không phép
  totalLeaveDays: number    // Nghỉ phép
  totalBusinessTripDays: number  // ★ Công tác
}

/** Kết quả bảng chấm công tháng */
export interface MonthlyTimesheetData {
  month: number
  year: number
  departmentId: string | null
  departmentName: string
  daysInMonth: number
  employees: EmployeeMonthlySummary[]
  generatedAt: string
}

// ============================================================================
// SHIFT CODE → SYMBOL MAPPING
// ============================================================================

function shiftToSymbol(shiftCode: string | null): DaySymbol {
  if (!shiftCode) return 'HC'
  switch (shiftCode) {
    case 'SHORT_1':
    case 'LONG_DAY':
      return 'S'
    case 'SHORT_2':
      return 'C2'
    case 'SHORT_3':
    case 'LONG_NIGHT':
      return 'Đ'
    case 'ADMIN_PROD':
    case 'ADMIN_OFFICE':
      return 'HC'
    default:
      return 'HC'
  }
}

// ============================================================================
// VIP EMAILS — ẩn khỏi bảng chấm công (BGĐ)
// ============================================================================

const VIP_EMAILS = ['huylv@huyanhrubber.com', 'thuyht@huyanhrubber.com', 'trunglxh@huyanhrubber.com']

// ============================================================================
// SERVICE
// ============================================================================

export const monthlyTimesheetService = {

  /**
   * Lấy bảng chấm công tháng
   */
  async getMonthlyTimesheet(
    year: number,
    month: number,
    departmentId?: string | null
  ): Promise<MonthlyTimesheetData> {
    const daysInMonth = new Date(year, month, 0).getDate()
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    // ① Lấy danh sách nhân viên
    let empQuery = supabase
      .from('employees')
      .select('id, code, full_name, email, department_id, department:departments!employees_department_id_fkey(id, name)')
      .eq('status', 'active')
      .order('full_name')

    if (departmentId) {
      empQuery = empQuery.eq('department_id', departmentId)
    }

    const { data: rawEmployees, error: empError } = await empQuery
    if (empError) throw empError

    // Lọc bỏ BGĐ (VIP emails)
    const employees = (rawEmployees || []).filter(
      e => !VIP_EMAILS.includes((e.email || '').toLowerCase())
    )

    // ② Lấy attendance records trong tháng
    const empIds = employees.map(e => e.id)
    if (empIds.length === 0) {
      return {
        month, year,
        departmentId: departmentId || null,
        departmentName: 'Tất cả',
        daysInMonth,
        employees: [],
        generatedAt: new Date().toISOString(),
      }
    }

    const { data: attendances, error: attError } = await supabase
      .from('attendance')
      .select(`
        id, employee_id, date, check_in_time, check_out_time,
        working_minutes, overtime_minutes, late_minutes, early_leave_minutes,
        status, auto_checkout, shift_id, work_units,
        shift:shifts!attendance_shift_id_fkey(code, name, crosses_midnight, work_units)
      `)
      .in('employee_id', empIds)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    if (attError) throw attError

    // ③ Lấy nghỉ phép approved trong tháng
    let leaveRecords: any[] = []
    try {
      const { data: leaves } = await supabase
        .from('leave_requests')
        .select('employee_id, start_date, end_date, leave_type, status')
        .in('employee_id', empIds)
        .eq('status', 'approved')
        .lte('start_date', endDate)
        .gte('end_date', startDate)

      leaveRecords = leaves || []
    } catch {
      // Table might not exist yet
    }

    // ④ Build data cho từng NV
    const result: EmployeeMonthlySummary[] = []

    for (const emp of employees || []) {
      const dept = Array.isArray(emp.department) ? emp.department[0] : emp.department
      const empAttendances = (attendances || []).filter(a => a.employee_id === emp.id)
      const empLeaves = leaveRecords.filter(l => l.employee_id === emp.id)

      // Build 1-31 days
      const days: DayDetail[] = []
      let totalWorkDays = 0
      let totalCong = 0       // SUM(work_units)
      let totalWorkingMins = 0
      let totalOTMins = 0
      let totalLateDays = 0
      let totalEarlyDays = 0
      let totalAbsentDays = 0
      let totalLeaveDays = 0
      let totalBusinessTripDays = 0

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const dateObj = new Date(dateStr + 'T00:00:00+07:00')
        const dayOfWeek = dateObj.getDay() // 0=CN
        const isWeekend = dayOfWeek === 0
        const isFuture = new Date(dateStr + 'T23:59:59+07:00') > new Date()

        // Check nghỉ phép
        const leave = empLeaves.find(l =>
          dateStr >= l.start_date && dateStr <= l.end_date
        )
        const isLeave = !!leave

        // Tìm attendance records cho ngày này
        // Lưu ý: ca đêm crosses_midnight → date = ngày bắt đầu ca
        const dayAtts = empAttendances.filter(a => a.date === dateStr)

        // Chọn record chính (ưu tiên record có check_in)
        const att = dayAtts.find(a => a.check_in_time) || dayAtts[0] || null
        const shift = att ? (Array.isArray(att.shift) ? att.shift[0] : att.shift) : null

        // Xác định symbol
        let symbol: DaySymbol = ''
        const isBusinessTrip = att?.status === 'business_trip'

        if (isBusinessTrip) {
          // ★ Công tác — ưu tiên cao nhất khi có attendance business_trip
          symbol = 'CT'
          totalBusinessTripDays++
          totalWorkDays++
          const wu = att.work_units > 0 ? att.work_units : 1.0
          totalCong += wu
          totalWorkingMins += att.working_minutes || 0
        } else if (isLeave) {
          symbol = 'P'
          totalLeaveDays++
        } else if (att && att.check_in_time) {
          symbol = shiftToSymbol(shift?.code || null)
          totalWorkDays++
          // work_units: ưu tiên attendance.work_units, fallback shift.work_units, default 1.0
          const wu = att.work_units > 0 ? att.work_units : (shift?.work_units || 1.0)
          totalCong += wu
          totalWorkingMins += att.working_minutes || 0
          totalOTMins += att.overtime_minutes || 0
          if (att.status === 'late' || att.late_minutes > 0) totalLateDays++
          if (att.status === 'early_leave' || att.status === 'late_and_early' || att.early_leave_minutes > 15) totalEarlyDays++
        } else if (isFuture) {
          symbol = '—'
        } else {
          // Ngày đã qua, không có attendance, không nghỉ phép → vắng
          symbol = 'X'
          totalAbsentDays++
        }

        days.push({
          date: dateStr,
          symbol,
          shiftCode: shift?.code || null,
          shiftName: shift?.name || null,
          checkIn: att?.check_in_time || null,
          checkOut: att?.check_out_time || null,
          workingMinutes: att?.working_minutes || 0,
          overtimeMinutes: att?.overtime_minutes || 0,
          lateMinutes: att?.late_minutes || 0,
          earlyLeaveMinutes: att?.early_leave_minutes || 0,
          status: att?.status || '',
          autoCheckout: att?.auto_checkout || false,
          isWeekend,
          isLeave,
          isBusinessTrip,
          leaveType: leave?.leave_type || null,
          crossesMidnight: shift?.crosses_midnight || false,
        })
      }

      result.push({
        employeeId: emp.id,
        employeeCode: emp.code,
        fullName: emp.full_name,
        departmentName: dept?.name || '',
        days,
        totalWorkDays,
        totalCong: Math.round(totalCong * 10) / 10,
        totalWorkingHours: Math.round(totalWorkingMins / 60 * 10) / 10,
        totalOvertimeHours: Math.round(totalOTMins / 60 * 10) / 10,
        totalLateDays,
        totalEarlyDays,
        totalAbsentDays,
        totalLeaveDays,
        totalBusinessTripDays,
      })
    }

    // Department name
    let deptName = 'Tất cả phòng ban'
    if (departmentId && rawEmployees && rawEmployees.length > 0) {
      const dept = Array.isArray(rawEmployees[0].department) ? rawEmployees[0].department[0] : rawEmployees[0].department
      deptName = dept?.name || ''
    }

    return {
      month, year,
      departmentId: departmentId || null,
      departmentName: deptName,
      daysInMonth,
      employees: result,
      generatedAt: new Date().toISOString(),
    }
  },
}

export default monthlyTimesheetService