// ============================================================================
// taskExceptionService — GĐ 5: DUYỆT THEO NGOẠI LỆ
// Chủ dự án KHÔNG duyệt từng việc (900 việc/tháng). Chỉ xem những việc "lệch":
// trễ hạn · chờ duyệt · kẹt chờ tự đánh giá · máy hỏng chưa xử lý.
// ============================================================================
import { supabase } from '../lib/supabase'

export type ExcTask = {
  id: string; code: string | null; name: string; status: string
  due_date: string | null; completed_date: string | null
  evaluation_status: string | null; self_score: number | null
  work_category: string | null; recurring_date: string | null
  assignee?: { full_name: string } | null
  department?: { name: string } | null
}

const SEL = `id, code, name, status, due_date, completed_date, evaluation_status, self_score,
  work_category, recurring_date,
  assignee:employees!tasks_assignee_id_fkey(full_name),
  department:departments!tasks_department_id_fkey(name)`

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}

// ── Đếm nhanh 4 nhóm ngoại lệ (cho ô KPI) ──
export async function getExceptionCounts(): Promise<{
  overdue: number; pendingApproval: number; pendingSelfEval: number; machineIssues: number
}> {
  const today = todayStr()
  const [ov, pa, pse, mi] = await Promise.all([
    supabase.from('tasks').select('id', { count: 'exact', head: true })
      .lt('due_date', today).is('completed_date', null)
      .not('status', 'in', '("finished","cancelled")'),
    supabase.from('tasks').select('id', { count: 'exact', head: true })
      .eq('evaluation_status', 'pending_approval'),
    supabase.from('tasks').select('id', { count: 'exact', head: true })
      .eq('evaluation_status', 'pending_self_eval'),
    supabase.from('machine_issues').select('id', { count: 'exact', head: true })
      .in('status', ['moi', 'da_nhan', 'dang_xu_ly']),
  ])
  return {
    overdue: ov.count || 0,
    pendingApproval: pa.count || 0,
    pendingSelfEval: pse.count || 0,
    machineIssues: mi.count || 0,
  }
}

// ── Việc TRỄ HẠN (chưa xong, quá hạn) — mới trễ trước ──
export async function getOverdueTasks(limit = 100): Promise<ExcTask[]> {
  const { data } = await supabase.from('tasks').select(SEL)
    .lt('due_date', todayStr()).is('completed_date', null)
    .not('status', 'in', '("finished","cancelled")')
    .order('due_date', { ascending: false }).limit(limit)
  return (data as any) || []
}

// ── Việc CHỜ DUYỆT (đã xong, chờ chủ dự án gật) ──
export async function getPendingApprovalTasks(limit = 100): Promise<ExcTask[]> {
  const { data } = await supabase.from('tasks').select(SEL)
    .eq('evaluation_status', 'pending_approval')
    .order('completed_date', { ascending: false }).limit(limit)
  return (data as any) || []
}

// ── Việc KẸT chờ tự đánh giá (thợ chưa tự chấm → tắc luồng) ──
export async function getPendingSelfEvalTasks(limit = 100): Promise<ExcTask[]> {
  const { data } = await supabase.from('tasks').select(SEL)
    .eq('evaluation_status', 'pending_self_eval')
    .order('due_date', { ascending: false }).limit(limit)
  return (data as any) || []
}

// ── Hành động nhanh ──
// Duyệt 1 việc (chốt điểm) — dùng cho nhóm "chờ duyệt"
export async function approveTask(taskId: string, finalScore = 80): Promise<void> {
  const { error } = await supabase.from('tasks')
    .update({ evaluation_status: 'approved', final_score: finalScore, updated_at: new Date().toISOString() })
    .eq('id', taskId)
  if (error) throw error
}
// Duyệt hàng loạt
export async function approveTasks(ids: string[], finalScore = 80): Promise<number> {
  if (!ids.length) return 0
  const { error } = await supabase.from('tasks')
    .update({ evaluation_status: 'approved', final_score: finalScore, updated_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw error
  return ids.length
}
// Miễn trễ (chấp nhận ngoại lệ, không tính là trễ)
export async function exemptOverdue(ids: string[]): Promise<number> {
  if (!ids.length) return 0
  const { error } = await supabase.from('tasks')
    .update({ overdue_exempt: true, updated_at: new Date().toISOString() })
    .in('id', ids)
  if (error) throw error
  return ids.length
}

// ── Dữ liệu cho NHẬT KÝ CÔNG VIỆC (xuất Excel) ──
export type JournalRow = {
  date: string; code: string | null; name: string; assignee: string; department: string
  work_category: string | null; status: string; evaluation_status: string | null
  due_date: string | null; completed_date: string | null; score: number | null
}
export async function getJournal(from: string, to: string): Promise<JournalRow[]> {
  const { data } = await supabase.from('tasks')
    .select(`${SEL}, final_score`)
    .or(`recurring_date.gte.${from},due_date.gte.${from}`)
    .lte('due_date', to)
    .order('due_date', { ascending: true }).limit(5000)
  return ((data as any[]) || []).map(t => ({
    date: t.recurring_date || t.due_date || '',
    code: t.code, name: t.name,
    assignee: t.assignee?.full_name || '',
    department: t.department?.name || '',
    work_category: t.work_category,
    status: t.status,
    evaluation_status: t.evaluation_status,
    due_date: t.due_date, completed_date: t.completed_date,
    score: t.final_score ?? null,
  }))
}
