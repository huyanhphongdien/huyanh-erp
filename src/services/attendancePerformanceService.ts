// ============================================================================
// ATTENDANCE-PERFORMANCE SERVICE — Sprint 2
// File: src/services/attendancePerformanceService.ts
// ============================================================================
// Sprint 2 changes:
// - Attendance score 2 chiều (base 80, có thưởng đủ công + không trễ + OT)
// - Đọc weights từ performance_config (config-able qua DB)
// - Task score đọc từ employee_monthly_score snapshot (không tính realtime)
// - Overtime CHỈ tính khi status='approved' (rule policy)
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
  early_leave_count: number
  overtime_hours_approved: number   // ⚠️ CHỈ approved
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

export const attendancePerformanceService = {

  async getAttendanceScore(employeeId: string, month: number, year: number): Promise<AttendanceScore> {
    const weights = await loadConfig('attendance_weights', DEFAULT_ATTENDANCE_WEIGHTS)

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    // 1. Attendance records
    const { data: records } = await supabase
      .from('attendance')
      .select('date, status, check_in_time, check_out_time, shift_start, shift_end')
      .eq('employee_id', employeeId)
      .gte('date', startDate)
      .lte('date', endDate)

    const presentDays = (records || []).filter(r => ['present', 'late', 'half_day'].includes(r.status)).length
    const absentDays = (records || []).filter(r => r.status === 'absent').length
    const lateCount = (records || []).filter(r => r.status === 'late').length

    // Đếm về sớm — nếu có column phát hiện (giả định status='early_leave' hoặc check_out_time < shift_end)
    const earlyLeaveCount = (records || []).filter(r => r.status === 'early_leave').length

    // 2. Overtime — CHỈ tính approved (rule policy, memory feedback_overtime_must_approved)
    const { data: overtimeRecords } = await supabase
      .from('overtime_requests')
      .select('hours, status, date')
      .eq('employee_id', employeeId)
      .eq('status', 'approved')   // ⚠️ MEMORY: tăng ca chưa duyệt KHÔNG cộng
      .gte('date', startDate)
      .lte('date', endDate)

    const overtimeHoursApproved = (overtimeRecords || []).reduce((sum, ot) => sum + (Number(ot.hours) || 0), 0)

    // 3. Calculate (2-way: bonus + penalty)
    let score = weights.base

    // Bonuses
    if (absentDays === 0 && presentDays > 0) score += weights.bonus_full_attendance
    if (lateCount === 0 && presentDays > 0) score += weights.bonus_no_late
    score += Math.min(weights.bonus_overtime_max, overtimeHoursApproved * weights.bonus_overtime_per_hour)

    // Penalties
    score -= absentDays * weights.penalty_absent
    score -= Math.min(weights.penalty_late_max, lateCount * weights.penalty_late)
    score -= earlyLeaveCount * weights.penalty_early_leave

    score = Math.max(0, Math.min(100, score))

    return {
      employee_id: employeeId,
      period_month: month,
      period_year: year,
      working_days: 26,
      present_days: presentDays,
      absent_without_leave: absentDays,
      late_count: lateCount,
      early_leave_count: earlyLeaveCount,
      overtime_hours_approved: overtimeHoursApproved,
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
