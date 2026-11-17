// ============================================================================
// opsService — data cho App "Huy Anh Ops" (mobile thợ vận hành/bảo trì)
// Gom mọi truy vấn Supabase cho 4 tab: Hôm nay · Tuần tra · Ca · Công.
// Các hàm get* NÉM lỗi Supabase (không nuốt thành mảng rỗng) để màn useQuery hiện khối lỗi + Thử lại
// thay vì "Chưa có việc / Chưa phân ca / Chưa có công" giả. Nơi cần mặc định rỗng tự `.catch(() => [])` (khoMixUtil).
// ============================================================================
import { supabase } from '../lib/supabase'
import { toDateStrVN } from '../utils/dateVN'

// Ngày "hôm nay" theo giờ VN (YYYY-MM-DD) — tránh lệch múi giờ máy chủ.
export function vnToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}
// Tháng theo giờ VN dạng 'YYYY-MM' (tab Công xem lùi tháng trước để đối chiếu lương)
export function vnMonthKey(): string {
  return vnToday().slice(0, 7)
}
// Cộng/trừ `delta` tháng trên 'YYYY-MM' — thuần lịch, không dính múi giờ
export function shiftMonthKey(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
// Ngày đầu/cuối của tháng `ym` ('YYYY-MM'); bỏ trống = tháng này theo giờ VN
export function vnMonthRange(ym?: string): { first: string; last: string } {
  const [y, m] = (ym || vnMonthKey()).split('-').map(Number)
  const first = toDateStrVN(new Date(y, m - 1, 1))
  const last = toDateStrVN(new Date(y, m, 0))
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
  const { data, error } = await supabase
    .from('tasks')
    .select('id, name, status, work_category, recurring_date, due_date, priority, completed_at, evidence_count')
    .eq('assignee_id', employeeId)
    .or(`recurring_date.eq.${today},due_date.eq.${today}`)
    .order('recurring_date', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as OpsTask[]) || []
}

export type OpsAttendance = {
  id: string; date: string; check_in_time: string | null; check_out_time: string | null
  status: string | null; late_minutes: number | null; early_leave_minutes: number | null
  working_minutes: number | null; overtime_minutes: number | null
  is_gps_verified: boolean | null; check_in_lat: number | null; check_in_lng: number | null
}
// Tất cả bản ghi chấm công HÔM NAY (có thể 1–2 ca) — mới nhất trước
export async function getTodayAttendanceRows(employeeId: string): Promise<(OpsAttendance & { shift_id: string | null; shift?: { name: string } | null })[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, date, check_in_time, check_out_time, status, late_minutes, early_leave_minutes, working_minutes, overtime_minutes, is_gps_verified, check_in_lat, check_in_lng, shift_id, shift:shift_id(name)')
    .eq('employee_id', employeeId).eq('date', vnToday())
    .order('check_in_time', { ascending: true })
  if (error) throw error
  return (data as any) || []
}

export type OpsShiftOption = { id: string; code: string | null; name: string; start_time: string | null; end_time: string | null; shift_category: string | null; crosses_midnight: boolean | null }
// Danh sách ca đang bật để thợ TỰ CHỌN khi vào ca
export async function getActiveShifts(): Promise<OpsShiftOption[]> {
  const { data, error } = await supabase
    .from('shifts')
    .select('id, code, name, start_time, end_time, shift_category, crosses_midnight')
    .eq('is_active', true)
    .order('start_time', { ascending: true })
  if (error) throw error
  return (data as OpsShiftOption[]) || []
}
// Chấm công của tháng `ym` ('YYYY-MM'); bỏ trống = tháng này (giờ VN)
export async function getMonthAttendance(employeeId: string, ym?: string): Promise<OpsAttendance[]> {
  const { first, last } = vnMonthRange(ym)
  const { data, error } = await supabase
    .from('attendance')
    .select('id, date, check_in_time, check_out_time, status, late_minutes, early_leave_minutes, working_minutes, overtime_minutes, is_gps_verified, check_in_lat, check_in_lng')
    .eq('employee_id', employeeId).gte('date', first).lte('date', last)
    .order('date', { ascending: false })
  if (error) throw error
  return (data as OpsAttendance[]) || []
}

export type OpsShift = {
  date: string; assignment_type: string | null
  shift: { code: string | null; name: string; start_time: string | null; end_time: string | null; shift_category: string | null } | null
}
export async function getWeekShifts(employeeId: string): Promise<OpsShift[]> {
  const { first, last } = vnWeekRange()
  const { data, error } = await supabase
    .from('shift_assignments')
    .select('date, assignment_type, shift:shift_id(code, name, start_time, end_time, shift_category)')
    .eq('employee_id', employeeId).gte('date', first).lte('date', last)
    .order('date', { ascending: true })
  if (error) throw error
  return (data as any) || []
}
// Ngày NGHỈ PHÉP trong tuần của thợ ('YYYY-MM-DD'). Duyệt đơn nghỉ (leaveRequestService._applyLeaveToSchedule) XOÁ phân ca
// ngày đó → tab Ca không được ghi "Chưa phân ca". Đọc cả HAI nguồn: đơn đã duyệt (trừ Công tác — công tác giữ nguyên ca)
// + dòng chấm công status 'leave' (tạo khi duyệt, hoặc HCNS nhập tay).
export async function getWeekLeaveDates(employeeId: string): Promise<string[]> {
  const { first, last, days } = vnWeekRange()
  const [don, cong] = await Promise.all([
    supabase
      .from('leave_requests')
      .select('start_date, end_date, leave_type:leave_types!leave_requests_leave_type_id_fkey(code)')
      .eq('employee_id', employeeId).eq('status', 'approved')
      .lte('start_date', last).gte('end_date', first),
    supabase
      .from('attendance')
      .select('date')
      .eq('employee_id', employeeId).eq('status', 'leave')
      .gte('date', first).lte('date', last),
  ])
  if (don.error) throw don.error
  if (cong.error) throw cong.error
  const out = new Set<string>(((cong.data as { date: string }[]) || []).map(r => r.date))
  for (const r of (don.data as any[]) || []) {
    const lt = Array.isArray(r.leave_type) ? r.leave_type[0] : r.leave_type
    if (lt?.code === 'BUSINESS_TRIP') continue
    for (const d of days) if (d >= r.start_date && d <= r.end_date) out.add(d)
  }
  return [...out]
}
export async function getTodayShift(employeeId: string): Promise<OpsShift | null> {
  const { data, error } = await supabase
    .from('shift_assignments')
    .select('date, assignment_type, shift:shift_id(code, name, start_time, end_time, shift_category)')
    .eq('employee_id', employeeId).eq('date', vnToday())
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return (data as any) || null
}

// ── Phiếu báo hỏng máy (machine_issues) — MỘT nguồn trạng thái cho Hôm nay + hàng chờ /m/yeu-cau ──
// Phiếu "đang mở" = chưa xử lý xong
export const MACHINE_ISSUE_OPEN_STATUSES: string[] = ['moi', 'da_nhan', 'dang_xu_ly']
export const MACHINE_ISSUE_STATUS_LABELS: Record<string, string> = {
  moi: 'Mới', da_nhan: 'Đã nhận', dang_xu_ly: 'Đang xử lý', xong: 'Đã xử lý xong',
}

// Số phiếu báo hỏng đang mở (cho banner cảnh báo ở Hôm nay)
export async function getOpenIssues(): Promise<{ total: number; dung: number }> {
  const { data, error } = await supabase
    .from('machine_issues')
    .select('severity')
    .in('status', MACHINE_ISSUE_OPEN_STATUSES)
  if (error) throw error
  const rows = (data as { severity: string }[]) || []
  return { total: rows.length, dung: rows.filter(r => r.severity === 'do').length }
}
