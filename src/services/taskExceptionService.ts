// ============================================================================
// taskExceptionService — GĐ 5: DUYỆT THEO NGOẠI LỆ
// Chủ dự án KHÔNG duyệt từng việc (900 việc/tháng). Chỉ xem những việc "lệch":
// trễ hạn · chờ duyệt · kẹt chờ tự đánh giá · máy hỏng chưa xử lý.
// ============================================================================
import { supabase } from '../lib/supabase'
import { approveTasksScored, starsToPoints, dayOf } from './taskScoring'
import { TASK_STATUS_LABELS } from '../types'
import { getEvaluationStatusLabel } from '../features/tasks/utils/taskPermissions'

export type ExcTask = {
  id: string; code: string | null; name: string; status: string
  due_date: string | null; completed_date: string | null
  evaluation_status: string | null; self_score: number | null
  work_category: string | null; recurring_date: string | null
  assignee_id?: string | null
  assignee?: { full_name: string } | null
  department?: { name: string } | null
}

const SEL = `id, code, name, status, due_date, completed_date, evaluation_status, self_score,
  work_category, recurring_date, assignee_id,
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

// ── Badge menu "Phê duyệt": cùng phạm vi với trang Duyệt hàng loạt (QL thường = phòng mình) ──
export async function getPendingApprovalCount(departmentId?: string | null): Promise<number> {
  let q = supabase.from('tasks').select('id', { count: 'exact', head: true })
    .eq('evaluation_status', 'pending_approval')
    .in('status', ['finished', 'pending_review'])
  if (departmentId) q = q.eq('department_id', departmentId)
  const { count, error } = await q
  if (error) throw error
  return count || 0
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
// Duyệt hàng loạt nhóm "chờ duyệt" — qua cửa duyệt CHUNG (taskScoring): điểm cuối theo công thức
// chung với số sao QL chọn cho cả lô. Bản cũ ghi cứng final_score=80, không chèn task_approvals
// (nên không đổi trạng thái, không lan điểm cho người cùng làm, không báo NV) — 77 việc dính.
export async function approveTasks(ids: string[], managerStars: number, approverId: string) {
  return approveTasksScored(
    ids.map((taskId) => ({ taskId, managerPoints: starsToPoints(managerStars) })),
    approverId,
    'Duyệt theo ngoại lệ (Cần anh xem)',
  )
}

// Nhắc việc trễ — gom theo người làm, mỗi người MỘT thông báo (màn hứa "nhắc hoặc miễn trễ")
export async function remindOverdue(tasks: ExcTask[], senderId?: string | null): Promise<number> {
  const byAssignee = new Map<string, ExcTask[]>()
  for (const t of tasks) {
    if (!t.assignee_id) continue
    const g = byAssignee.get(t.assignee_id)
    if (g) g.push(t)
    else byAssignee.set(t.assignee_id, [t])
  }
  if (!byAssignee.size) return 0
  const { notify } = await import('./notificationHelper')
  for (const [recipientId, list] of byAssignee) {
    const ten = list.slice(0, 3).map((t) => t.name).join(' · ')
    await notify({
      recipientId,
      senderId: senderId || undefined,
      module: 'task',
      type: 'task_overdue',
      title: `Nhắc việc trễ hạn (${list.length})`,
      message: list.length > 3 ? `${ten} … và ${list.length - 3} việc khác` : ten,
      referenceUrl: '/my-tasks',
      priority: 'high',
    })
  }
  return byAssignee.size
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
  // Excel cho người đọc: nhãn tiếng Việt + ngày dd/mm/yyyy (bản cũ xuất mã thô 'pending_approval',
  // '2026-11-14T00:00:00+00:00')
  return ((data as any[]) || []).map(t => ({
    date: ddmmyyyy(t.recurring_date || t.due_date),
    code: t.code, name: t.name,
    assignee: t.assignee?.full_name || '',
    department: t.department?.name || '',
    work_category: workCategoryLabel(t.work_category),
    status: TASK_STATUS_LABELS[t.status] || t.status,
    evaluation_status: t.evaluation_status ? getEvaluationStatusLabel(t.evaluation_status) : '',
    due_date: ddmmyyyy(t.due_date), completed_date: ddmmyyyy(t.completed_date),
    score: t.final_score ?? null,
  }))
}

/** Nhóm việc (tasks.work_category) — nhãn cho người đọc thay mã thô */
export const WORK_CATEGORY_LABELS: Record<string, string> = {
  kiem_tra: 'Kiểm tra', do_luong: 'Đo lường', su_co: 'Sự cố', bao_tri: 'Bảo trì', hanh_chinh: 'Hành chính', general: 'Chung',
}
export const workCategoryLabel = (c?: string | null) => (c ? WORK_CATEGORY_LABELS[c] || c : '')

/** 'YYYY-MM-DD…' → 'dd/mm/yyyy' theo ngày lịch (task lưu nửa đêm UTC của ngày dự định) */
export function ddmmyyyy(v?: string | null): string {
  const d = dayOf(v)
  if (!d) return ''
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}
