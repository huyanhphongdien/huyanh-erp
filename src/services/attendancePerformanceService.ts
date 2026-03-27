// ============================================================================
// ATTENDANCE-PERFORMANCE SERVICE
// File: src/services/attendancePerformanceService.ts
// Liên kết chấm công với hiệu suất nhân viên
// Combined score = task_score * 70% + attendance_score * 30%
// ============================================================================

import { supabase } from '../lib/supabase'

export interface AttendanceScore {
  employee_id: string
  period_month: number
  period_year: number
  working_days: number        // Tổng ngày làm việc trong tháng
  present_days: number        // Ngày đi làm
  absent_without_leave: number // Nghỉ không phép
  late_count: number          // Số lần đi trễ
  overtime_count: number      // Số lần tăng ca (approved)
  attendance_score: number    // 0-100
}

export const attendancePerformanceService = {

  async getAttendanceScore(employeeId: string, month: number, year: number): Promise<AttendanceScore> {
    // 1. Get attendance records for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0] // last day of month

    const { data: records } = await supabase
      .from('attendance')
      .select('date, status, check_in_time, shift_start')
      .eq('employee_id', employeeId)
      .gte('date', startDate)
      .lte('date', endDate)

    // 2. Count metrics
    const presentDays = (records || []).filter(r => ['present', 'late', 'half_day'].includes(r.status)).length
    const absentDays = (records || []).filter(r => r.status === 'absent').length
    const lateDays = (records || []).filter(r => r.status === 'late').length

    // 3. Get approved overtime
    const { count: overtimeCount } = await supabase
      .from('overtime_requests')
      .select('id', { count: 'exact' })
      .eq('employee_id', employeeId)
      .eq('status', 'approved')
      .gte('date', startDate)
      .lte('date', endDate)

    // 4. Calculate score
    // Base: 100
    // -10 per absent without leave
    // -5 per late
    // +5 per overtime (max +20)
    let score = 100
    score -= absentDays * 10
    score -= lateDays * 5
    score += Math.min((overtimeCount || 0) * 5, 20)
    score = Math.max(0, Math.min(100, score))

    return {
      employee_id: employeeId,
      period_month: month,
      period_year: year,
      working_days: 26, // approximate
      present_days: presentDays,
      absent_without_leave: absentDays,
      late_count: lateDays,
      overtime_count: overtimeCount || 0,
      attendance_score: score,
    }
  },

  // Combined performance = task_score * 70% + attendance_score * 30%
  async getCombinedScore(employeeId: string, month: number, year: number): Promise<{
    task_score: number
    attendance_score: number
    combined_score: number
    grade: string
  }> {
    const attendance = await this.getAttendanceScore(employeeId, month, year)

    // Get task score from evaluations
    const { data: evals } = await supabase
      .from('task_evaluations')
      .select('score')
      .eq('employee_id', employeeId)

    // Filter by month manually (created_at)
    const taskScores = (evals || []).map(e => e.score).filter(Boolean)
    const taskScore = taskScores.length > 0
      ? taskScores.reduce((a: number, b: number) => a + b, 0) / taskScores.length
      : 60 // default

    const combined = Math.round(taskScore * 0.7 + attendance.attendance_score * 0.3)

    const grade = combined >= 90 ? 'A' : combined >= 75 ? 'B' : combined >= 60 ? 'C' : combined >= 40 ? 'D' : 'F'

    return { task_score: taskScore, attendance_score: attendance.attendance_score, combined_score: combined, grade }
  },
}
