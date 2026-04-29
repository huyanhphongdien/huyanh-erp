// ============================================================================
// ATTENDANCE-PERFORMANCE SERVICE — Sprint 2 + ATT bug fixes (29/04)
// File: src/services/attendancePerformanceService.ts
// ============================================================================
// Sprint 2 changes:
// - Attendance score 2 chiều (base 80, có thưởng đủ công + không trễ + OT)
// - Đọc weights từ performance_config (config-able qua DB)
// - Task score đọc từ employee_monthly_score snapshot (không tính realtime)
// - Overtime CHỈ tính khi status='approved' (rule policy)
//
// ATT-1/2/3/4 bug fixes (29/04/2026 — discovered khi audit "Chấm công 80 hết"):
// - ATT-1: Bỏ shift_start/shift_end (column không tồn tại trong schema)
//          → query attendance fail → records=null → score luôn = base 80
// - ATT-2: overtime_requests dùng request_date + planned_minutes/actual_minutes
//          (không phải date + hours)
// - ATT-3: Status enum thật có 6 giá trị: present, late, late_and_early,
//          early_leave, business_trip, leave (code chỉ xử lý 3 → miss 3)
// - ATT-4: Dùng late_minutes / early_leave_minutes (cột số phút thật)
//          thay vì binary count "lần"
// ============================================================================

import { supabase } from '../lib/supabase'

export interface AttendanceScore {
  employee_id: string
  period_month: number
  period_year: number
  working_days: number
  present_days: number
  absent_without_leave: number
  late_count: number
  late_minutes_total: number          // ATT-4: tổng phút trễ
  early_leave_count: number
  early_leave_minutes_total: number    // ATT-4: tổng phút về sớm
  overtime_hours_approved: number      // ⚠️ CHỈ approved
  business_trip_days: number           // ATT-3: thêm metric
  leave_days: number                   // ATT-3: nghỉ phép có duyệt
  attendance_score: number
}

interface AttendanceWeights {
  base: number
  bonus_full_attendance: number
  bonus_no_late: number
  bonus_overtime_per_hour: number
  bonus_overtime_max: number
  penalty_absent: number
  penalty_late: number
  penalty_late_max: number
  penalty_early_leave: number
}

const DEFAULT_ATTENDANCE_WEIGHTS: AttendanceWeights = {
  base: 80,
  bonus_full_attendance: 10,
  bonus_no_late: 5,
  bonus_overtime_per_hour: 1,
  bonus_overtime_max: 5,
  penalty_absent: 10,
  penalty_late: 3,
  penalty_late_max: 15,
  penalty_early_leave: 2,
}

const DEFAULT_COMBINED_WEIGHTS = { task: 0.7, attendance: 0.3 }

async function loadConfig<T>(key: string, defaults: T): Promise<T> {
  try {
    const { data } = await supabase
      .from('performance_config')
      .select('config_value')
      .eq('config_key', key)
      .maybeSingle()
    return (data?.config_value as T) || defaults
  } catch {
    return defaults
  }
}

// ATT-3: status mapping đầy đủ 6 enum values
const STATUS_GROUPS = {
  // "Đi làm" = present + late + late_and_early + business_trip
  PRESENT: ['present', 'late', 'late_and_early', 'business_trip'],
  // "Trễ" = late + late_and_early
  LATE: ['late', 'late_and_early'],
  // "Về sớm" = early_leave + late_and_early
  EARLY_LEAVE: ['early_leave', 'late_and_early'],
  // "Vắng không phép" = absent (KHÔNG có status='absent' trong schema thật,
  //   thường được suy ra từ ngày có shift assigned mà không có attendance row)
  ABSENT: ['absent'],
  // "Nghỉ phép" = leave (đã duyệt — không penalty)
  LEAVE_APPROVED: ['leave'],
  // "Công tác" = business_trip
  BUSINESS_TRIP: ['business_trip'],
}

export const attendancePerformanceService = {

  async getAttendanceScore(employeeId: string, month: number, year: number): Promise<AttendanceScore> {
    const weights = await loadConfig('attendance_weights', DEFAULT_ATTENDANCE_WEIGHTS)

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    // ATT-1 fix: bỏ shift_start, shift_end (không tồn tại) — dùng late_minutes
    // và early_leave_minutes (cột phút thật trong schema)
    const { data: records, error: attendanceError } = await supabase
      .from('attendance')
      .select('date, status, check_in_time, check_out_time, late_minutes, early_leave_minutes, working_minutes, overtime_minutes')
      .eq('employee_id', employeeId)
      .gte('date', startDate)
      .lte('date', endDate)

    if (attendanceError) {
      console.error('[attendance] query error:', attendanceError)
    }

    const recs = records || []

    // ATT-3: dùng STATUS_GROUPS để count theo enum thật 6 giá trị
    const presentDays = recs.filter(r => STATUS_GROUPS.PRESENT.includes(r.status)).length
    const lateCount = recs.filter(r => STATUS_GROUPS.LATE.includes(r.status)).length
    const earlyLeaveCount = recs.filter(r => STATUS_GROUPS.EARLY_LEAVE.includes(r.status)).length
    const absentDays = recs.filter(r => STATUS_GROUPS.ABSENT.includes(r.status)).length
    const leaveDays = recs.filter(r => STATUS_GROUPS.LEAVE_APPROVED.includes(r.status)).length
    const businessTripDays = recs.filter(r => STATUS_GROUPS.BUSINESS_TRIP.includes(r.status)).length

    // ATT-4: tổng phút trễ + về sớm (chính xác hơn binary count "lần")
    const lateMinutesTotal = recs.reduce((sum, r) => sum + (Number(r.late_minutes) || 0), 0)
    const earlyLeaveMinutesTotal = recs.reduce((sum, r) => sum + (Number(r.early_leave_minutes) || 0), 0)

    // ATT-2 fix: overtime_requests có request_date (không date) + planned_minutes/actual_minutes (không hours)
    const { data: overtimeRecords, error: otError } = await supabase
      .from('overtime_requests')
      .select('actual_minutes, planned_minutes, status, request_date')
      .eq('employee_id', employeeId)
      .eq('status', 'approved')   // ⚠️ MEMORY: tăng ca chưa duyệt KHÔNG cộng
      .gte('request_date', startDate)
      .lte('request_date', endDate)

    if (otError) {
      console.error('[overtime] query error:', otError)
    }

    // Convert phút → giờ. Ưu tiên actual_minutes (thực tế), fallback planned_minutes.
    const overtimeMinutesTotal = (overtimeRecords || []).reduce((sum, ot) => {
      const minutes = Number(ot.actual_minutes) || Number(ot.planned_minutes) || 0
      return sum + minutes
    }, 0)
    const overtimeHoursApproved = Math.round((overtimeMinutesTotal / 60) * 10) / 10  // 1 chữ số thập phân

    // 3. Calculate (2-way: bonus + penalty)
    let score = weights.base

    // Bonuses
    // bonus_full_attendance: chỉ khi không vắng VÀ có ngày làm việc thực
    if (absentDays === 0 && presentDays > 0) score += weights.bonus_full_attendance
    // bonus_no_late: không trễ (kể cả late + late_and_early)
    if (lateCount === 0 && presentDays > 0) score += weights.bonus_no_late
    // bonus overtime: cộng theo giờ approved, max cap
    score += Math.min(weights.bonus_overtime_max, overtimeHoursApproved * weights.bonus_overtime_per_hour)

    // Penalties
    score -= absentDays * weights.penalty_absent
    // ATT-4: penalty late vẫn theo "lần" (không đổi behavior). Có thể nâng cấp:
    //   penalty = ceil(lateMinutesTotal / 30) × penalty_late để phạt theo phút.
    score -= Math.min(weights.penalty_late_max, lateCount * weights.penalty_late)
    score -= earlyLeaveCount * weights.penalty_early_leave

    score = Math.max(0, Math.min(100, score))

    // ATT-1: working_days theo shift_assignments (Sprint 2 fix A-H8)
    let workingDays = 26
    try {
      const { count } = await supabase
        .from('shift_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('employee_id', employeeId)
        .gte('date', startDate)
        .lte('date', endDate)
      if (count != null && count > 0) workingDays = count
    } catch {
      // Bảng shift_assignments có thể chưa exist → fallback 26
    }

    return {
      employee_id: employeeId,
      period_month: month,
      period_year: year,
      working_days: workingDays,
      present_days: presentDays,
      absent_without_leave: absentDays,
      late_count: lateCount,
      late_minutes_total: lateMinutesTotal,
      early_leave_count: earlyLeaveCount,
      early_leave_minutes_total: earlyLeaveMinutesTotal,
      overtime_hours_approved: overtimeHoursApproved,
      business_trip_days: businessTripDays,
      leave_days: leaveDays,
      attendance_score: score,
    }
  },

  async getCombinedScore(employeeId: string, month: number, year: number): Promise<{
    task_score: number
    attendance_score: number
    combined_score: number
    grade: string
  }> {
    const combinedWeights = await loadConfig('combined_weights', DEFAULT_COMBINED_WEIGHTS)
    const attendance = await this.getAttendanceScore(employeeId, month, year)

    // Sprint 2: đọc task_score từ snapshot thay vì tính từ task_evaluations
    const { data: snapshot } = await supabase
      .from('employee_monthly_score')
      .select('final_score')
      .eq('employee_id', employeeId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle()

    const taskScore = snapshot?.final_score ?? 0

    const combined = Math.round(
      taskScore * combinedWeights.task + attendance.attendance_score * combinedWeights.attendance
    )

    const grade = combined >= 90 ? 'A'
      : combined >= 75 ? 'B'
      : combined >= 60 ? 'C'
      : combined >= 40 ? 'D'
      : 'F'

    return {
      task_score: taskScore,
      attendance_score: attendance.attendance_score,
      combined_score: combined,
      grade,
    }
  },
}
