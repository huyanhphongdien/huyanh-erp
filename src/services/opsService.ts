// ============================================================================
// opsService — data cho App "Huy Anh Ops" (mobile thợ vận hành/bảo trì)
// Gom mọi truy vấn Supabase cho 4 tab: Hôm nay · Tuần tra · Ca · Công.
// ============================================================================
import { supabase } from '../lib/supabase'

// Ngày "hôm nay" theo giờ VN (YYYY-MM-DD) — tránh lệch múi giờ máy chủ.
export function vnToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}
export function vnMonthRange(): { first: string; last: string } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
  const y = now.getFullYear(), m = now.getMonth()
  const first = new Date(y, m, 1).toLocaleDateString('en-CA')
  const last = new Date(y, m + 1, 0).toLocaleDateString('en-CA')
  return { first, last }
}
// Tuần hiện tại (Thứ 2 → Chủ nhật) theo giờ VN
export function vnWeekRange(): { first: string; last: string; days: string[] } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
  const dow = (now.getDay() + 6) % 7 // 0 = Thứ 2
  const monday = new Date(now); monday.setDate(now.getDate() - dow)
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    days.push(d.toLocaleDateString('en-CA'))
  }
  return { first: days[0], last: days[6], days }
}

export type OpsTask = {
  id: string; name: string; status: string; work_category: string | null
  recurring_date: string | null; due_date: string | null; priority: string | null
  completed_at: string | null; evidence_count: number | null
}
const DONE_HINTS = ['complet', 'done', 'xong', 'hoan_thanh', 'approved', 'da_duyet']
export function taskDone(t: OpsTask): boolean {
  if (t.completed_at) return true
  const s = (t.status || '').toLowerCase()
  return DONE_HINTS.some(h => s.includes(h))
}

// Việc hôm nay của thợ: ưu tiên việc định kỳ sinh cho hôm nay,
// kèm việc chưa xong đến hạn hôm nay hoặc quá hạn.
export async function getTodayTasks(employeeId: string): Promise<OpsTask[]> {
  const today = vnToday()
  const { data } = await supabase
    .from('tasks')
    .select('id, name, status, work_category, recurring_date, due_date, priority, completed_at, evidence_count')
    .eq('assignee_id', employeeId)
    .or(`recurring_date.eq.${today},due_date.eq.${today}`)
    .order('recurring_date', { ascending: true })
    .order('created_at', { ascending: true })
  return (data as OpsTask[]) || []
}

export type OpsAttendance = {
  id: string; date: string; check_in_time: string | null; check_out_time: string | null
  status: string | null; late_minutes: number | null; early_leave_minutes: number | null
  working_minutes: number | null; overtime_minutes: number | null
  is_gps_verified: boolean | null; check_in_lat: number | null; check_in_lng: number | null
}
export async function getTodayAttendance(employeeId: string): Promise<OpsAttendance | null> {
  const { data } = await supabase
    .from('attendance')
    .select('id, date, check_in_time, check_out_time, status, late_minutes, early_leave_minutes, working_minutes, overtime_minutes, is_gps_verified, check_in_lat, check_in_lng')
    .eq('employee_id', employeeId).eq('date', vnToday())
    .maybeSingle()
  return (data as OpsAttendance) || null
}
export async function getMonthAttendance(employeeId: string): Promise<OpsAttendance[]> {
  const { first, last } = vnMonthRange()
  const { data } = await supabase
    .from('attendance')
    .select('id, date, check_in_time, check_out_time, status, late_minutes, early_leave_minutes, working_minutes, overtime_minutes, is_gps_verified, check_in_lat, check_in_lng')
    .eq('employee_id', employeeId).gte('date', first).lte('date', last)
    .order('date', { ascending: false })
  return (data as OpsAttendance[]) || []
}

export type OpsShift = {
  date: string; assignment_type: string | null
  shift: { code: string | null; name: string; start_time: string | null; end_time: string | null; shift_category: string | null } | null
}
export async function getWeekShifts(employeeId: string): Promise<OpsShift[]> {
  const { first, last } = vnWeekRange()
  const { data } = await supabase
    .from('shift_assignments')
    .select('date, assignment_type, shift:shift_id(code, name, start_time, end_time, shift_category)')
    .eq('employee_id', employeeId).gte('date', first).lte('date', last)
    .order('date', { ascending: true })
  return (data as any) || []
}
export async function getTodayShift(employeeId: string): Promise<OpsShift | null> {
  const { data } = await supabase
    .from('shift_assignments')
    .select('date, assignment_type, shift:shift_id(code, name, start_time, end_time, shift_category)')
    .eq('employee_id', employeeId).eq('date', vnToday())
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return (data as any) || null
}

// Số phiếu báo hỏng đang mở (cho banner cảnh báo ở Hôm nay)
export async function getOpenIssues(): Promise<{ total: number; dung: number }> {
  const { data } = await supabase
    .from('machine_issues')
    .select('severity')
    .in('status', ['moi', 'da_nhan', 'dang_xu_ly'])
  const rows = (data as { severity: string }[]) || []
  return { total: rows.length, dung: rows.filter(r => r.severity === 'do').length }
}
