// ============================================================================
// taskScoring — MỘT nguồn công thức điểm công việc (Đợt 3 audit UI, 17/11/2026).
// Trước đây 3 cửa duyệt ra 3 kết quả: "Cần anh xem" chốt cứng 80; Duyệt hàng loạt
// LƯU sao×20×hệ số khó−trễ nhưng XEM TRƯỚC 40/60; trang Phê duyệt lưu thẳng số kéo
// (và không ghi final_score) — trong khi nhân viên được hứa "Tự chấm × 40% + QL × 60%".
// Giờ mọi cửa duyệt, mọi ô xem trước và câu hứa với nhân viên đều đọc từ file này.
// ⚠ ĐỔI CÔNG THỨC = SỬA HẰNG Ở ĐÂY (owner chốt), không viết lại công thức ở trang nào.
//   Muốn quay về kiểu cũ "bỏ qua tự chấm" → đặt SELF_WEIGHT = 0, MANAGER_WEIGHT = 1.
// ============================================================================
import { supabase } from '../lib/supabase'
import { calculateRating, type RatingLevel } from '../types/evaluation.types'

export type TaskDifficulty = 'normal' | 'hard' | 'critical'

export const SELF_WEIGHT = 0.4
export const MANAGER_WEIGHT = 0.6
export const DIFFICULTY_COEF: Record<TaskDifficulty, number> = { normal: 1, hard: 1.2, critical: 1.5 }
export const DIFFICULTY_LABEL: Record<TaskDifficulty, string> = { normal: 'Bình thường', hard: 'Khó', critical: 'Rất khó' }
export const LATE_PENALTY_PER_DAY = 2
/** Số sao QL mặc định khi duyệt hàng loạt không chấm riêng từng việc */
export const DEFAULT_MANAGER_STARS = 4

/** Hệ số tự duyệt theo nguồn việc (không qua QL): điểm = tự chấm × hệ số; chưa tự chấm thì coi như 100 */
export const AUTO_COEF = { recurring: 0.8, self: 0.85, project: 0.9, deptmanager: 1 } as const
export type AutoSource = keyof typeof AUTO_COEF

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const pct = (w: number) => `${Math.round(w * 100)}%`
const coefTxt = (c: number) => `×${String(c).replace('.', ',')}`

export const starsToPoints = (stars: number) => clamp(Math.round(stars || 0), 1, 5) * 20

/** Ngày lịch VN 'YYYY-MM-DD' của một mốc. due_date/completed_date là timestamptz: đa số lưu nửa đêm UTC của ngày
 *  dự định ("2026-11-14T00:00:00+00:00" = 7h sáng VN cùng ngày), một số lưu giờ thật lúc bấm xong — xong lúc 1h sáng
 *  VN ngày 15 là "2026-11-14T18:00:00Z", cắt 10 ký tự ra ngày 14 (bớt 1 ngày trễ). Quy về lịch VN thì cả hai đều đúng. */
export function dayOf(v?: string | null): string | null {
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(v)
    return m ? m[1] : null
  }
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
}

function dayNum(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y, (m || 1) - 1, d || 1) / 86400000
}

/** Số ngày trễ theo LỊCH giữa hạn và ngày xong (0 nếu thiếu mốc hoặc xong sớm). */
export function lateDays(due?: string | null, completed?: string | null): number {
  const a = dayOf(due), b = dayOf(completed)
  if (!a || !b) return 0
  return Math.max(0, Math.round(dayNum(b) - dayNum(a)))
}

/** Số ngày đã quá hạn tính tới hôm nay (giờ VN) — cho việc CHƯA xong. */
export function overdueDaysUntilToday(due?: string | null): number {
  const a = dayOf(due)
  if (!a) return 0
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' })
  return Math.max(0, Math.round(dayNum(today) - dayNum(a)))
}

export interface ScoreInput {
  /** Điểm QL 0–100: sao × 20 (Duyệt hàng loạt / Cần anh xem) hoặc số kéo (trang Phê duyệt) */
  managerPoints: number
  /** null/undefined = không có tự chấm → lấy trọn điểm QL */
  selfScore?: number | null
  difficulty?: string | null
  dueDate?: string | null
  completedDate?: string | null
  overdueExempt?: boolean | null
}

export interface ScoreBreakdown {
  base: number       // trộn tự chấm + QL (hoặc trọn QL)
  coef: number       // hệ số độ khó
  quality: number    // base × hệ số, trần 100
  daysLate: number
  penalty: number
  final: number
}

export function computeFinalScore(i: ScoreInput): ScoreBreakdown {
  const mgr = clamp(Math.round(i.managerPoints || 0), 0, 100)
  const hasSelf = typeof i.selfScore === 'number' && Number.isFinite(i.selfScore)
  const base = hasSelf ? Math.round(clamp(i.selfScore as number, 0, 100) * SELF_WEIGHT + mgr * MANAGER_WEIGHT) : mgr
  const coef = DIFFICULTY_COEF[(i.difficulty || 'normal') as TaskDifficulty] ?? 1
  const quality = Math.min(100, Math.round(base * coef))
  const daysLate = i.overdueExempt ? 0 : lateDays(i.dueDate, i.completedDate)
  const penalty = daysLate * LATE_PENALTY_PER_DAY
  return { base, coef, quality, daysLate, penalty, final: Math.max(0, quality - penalty) }
}

/** Câu giải thích từng bước, vd "Tự chấm 100 × 40% + QL 80 × 60% = 88 · ×1,2 (khó) → 100 · trễ 2 ngày −4 → 96" */
export function explainScore(i: ScoreInput): string {
  const b = computeFinalScore(i)
  const mgr = clamp(Math.round(i.managerPoints || 0), 0, 100)
  const hasSelf = typeof i.selfScore === 'number' && Number.isFinite(i.selfScore)
  const parts = [hasSelf
    ? `Tự chấm ${i.selfScore} × ${pct(SELF_WEIGHT)} + QL ${mgr} × ${pct(MANAGER_WEIGHT)} = ${b.base}`
    : `QL chấm ${mgr} (chưa có tự chấm)`]
  if (b.coef !== 1) parts.push(`${coefTxt(b.coef)} (${DIFFICULTY_LABEL[(i.difficulty || 'normal') as TaskDifficulty] || 'độ khó'}) → ${b.quality}`)
  if (b.penalty > 0) parts.push(`trễ ${b.daysLate} ngày −${b.penalty} → ${b.final}`)
  else if (i.overdueExempt && lateDays(i.dueDate, i.completedDate) > 0) parts.push('đã miễn trễ')
  return parts.join(' · ')
}

/** Câu hứa với nhân viên — đọc từ hằng, đổi công thức là câu tự đổi theo. */
export const FORMULA_TEXT =
  `Điểm cuối = Tự chấm × ${pct(SELF_WEIGHT)} + QL chấm × ${pct(MANAGER_WEIGHT)}, ` +
  `nhân hệ số độ khó (khó ${coefTxt(DIFFICULTY_COEF.hard)}, rất khó ${coefTxt(DIFFICULTY_COEF.critical)}, tối đa 100), ` +
  `trừ ${LATE_PENALTY_PER_DAY}đ mỗi ngày trễ hạn`

/** Điểm tự duyệt (việc tự giao / định kỳ / dự án / QL hoàn thành thay) */
export function computeAutoScore(source: AutoSource, selfScore?: number | null): number {
  const s = typeof selfScore === 'number' && Number.isFinite(selfScore) ? clamp(selfScore, 0, 100) : 100
  return Math.round(s * AUTO_COEF[source])
}

/** Xếp loại dùng chung toàn module (90/70/50) */
export const ratingFromScore = (score: number): RatingLevel => calculateRating(score)

/** Bảng task_evaluations chỉ nhận excellent/good/fair/average/poor (CHECK) — 'below_average' bị từ chối
 *  âm thầm làm báo cáo hiệu suất mất đúng các điểm kém. Ghi bảng đó phải qua hàm này. */
export function evalTableRating(score: number): 'excellent' | 'good' | 'average' | 'poor' {
  const r = calculateRating(score)
  return r === 'below_average' ? 'poor' : r
}

// ============================================================================
// DUYỆT — MỘT hàm cho mọi cửa (Cần anh xem · Duyệt hàng loạt · trang Phê duyệt)
// Thứ tự cố ý: (1) ghi final_score trước, (2) chèn task_approvals — trigger DB tự
// lật status=finished + evaluation_status=approved, lan điểm cho người cùng làm và
// gửi thông báo cho NV (KHÔNG notify thêm ở client, kẻo đúp). Nếu (2) lỗi, việc vẫn
// nằm trong hàng chờ duyệt → bấm lại là ghi đè, không sinh rác.
// ============================================================================

export interface ApproveItem {
  taskId: string
  managerPoints: number
  note?: string | null
  selfEvaluationId?: string | null
  /** Phê duyệt nhanh việc chưa có tự đánh giá: bỏ qua self_score (điểm = trọn QL) */
  ignoreSelf?: boolean
}

export interface ApproveOutcome {
  ok: string[]
  failed: { taskId: string; error: string }[]
  scores: Record<string, number>
}

const OPEN_STATUSES = ['overdue', 'in_progress', 'draft', 'assigned', 'paused', 'new', 'on_hold']

export async function approveTasksScored(items: ApproveItem[], approverId: string, defaultComment = 'Phê duyệt'): Promise<ApproveOutcome> {
  const uniq = [...new Map(items.map((it) => [it.taskId, it])).values()]
  const out: ApproveOutcome = { ok: [], failed: [], scores: {} }
  if (!uniq.length) return out
  if (!approverId) throw new Error('Không xác định được người duyệt (tài khoản chưa gắn hồ sơ nhân viên)')

  const { data: rows, error } = await supabase.from('tasks')
    .select('id, status, assignee_id, self_score, difficulty, due_date, completed_date, overdue_exempt')
    .in('id', uniq.map((i) => i.taskId))
  if (error) throw error
  const byId = new Map(((rows as any[]) || []).map((r) => [r.id, r]))

  type Row = { it: ApproveItem; t: any; final: number }
  const ready: Row[] = []
  for (const it of uniq) {
    const t = byId.get(it.taskId)
    if (!t) { out.failed.push({ taskId: it.taskId, error: 'Không tìm thấy công việc' }); continue }
    const { final } = computeFinalScore({
      managerPoints: it.managerPoints,
      selfScore: it.ignoreSelf ? null : t.self_score,
      difficulty: t.difficulty, dueDate: t.due_date, completedDate: t.completed_date, overdueExempt: t.overdue_exempt,
    })
    ready.push({ it, t, final })
  }

  // (1) final_score — gom theo (điểm, cần mở→đóng) để ít lệnh. Việc còn mở (phê duyệt nhanh) phải
  //     lên progress 100 + finished cùng lúc, vì trigger validate_task_status_progress bắt cặp đó.
  const groups = new Map<string, Row[]>()
  for (const r of ready) {
    const open = OPEN_STATUSES.includes(r.t.status)
    const k = `${r.final}|${open ? 1 : 0}`
    const g = groups.get(k)
    if (g) g.push(r)
    else groups.set(k, [r])
  }
  const passed: Row[] = []
  for (const [k, g] of groups) {
    const [score, open] = k.split('|')
    const patch: Record<string, unknown> = { final_score: Number(score), updated_at: new Date().toISOString() }
    if (open === '1') { patch.progress = 100; patch.status = 'finished' }
    const { error: e1 } = await supabase.from('tasks').update(patch).in('id', g.map((r) => r.t.id))
    if (e1) g.forEach((r) => out.failed.push({ taskId: r.t.id, error: e1.message }))
    else passed.push(...g)
  }
  if (!passed.length) return out

  // (2) task_approvals — một lệnh chèn cho cả lô (all-or-nothing)
  const { error: e2 } = await supabase.from('task_approvals').insert(passed.map((r) => ({
    task_id: r.t.id,
    approver_id: approverId,
    action: 'approved',
    approved_score: r.final,
    original_score: clamp(Math.round(r.it.managerPoints || 0), 0, 100),
    rating: ratingFromScore(r.final),
    comments: r.it.note || defaultComment,
    ...(r.it.selfEvaluationId ? { self_evaluation_id: r.it.selfEvaluationId } : {}),
  })))
  if (e2) {
    passed.forEach((r) => out.failed.push({ taskId: r.t.id, error: e2.message }))
    return out
  }
  passed.forEach((r) => { out.ok.push(r.t.id); out.scores[r.t.id] = r.final })

  // (3) task_evaluations (báo cáo hiệu suất đọc bảng này) — upsert theo (task, người chấm)
  const evals = passed.filter((r) => r.t.assignee_id).map((r) => ({
    task_id: r.t.id,
    employee_id: r.t.assignee_id,
    evaluator_id: approverId,
    score: r.final,
    rating: evalTableRating(r.final),
    content: r.it.note || null,
  }))
  if (evals.length) {
    const { error: e3 } = await supabase.from('task_evaluations').upsert(evals, { onConflict: 'task_id,evaluator_id' })
    if (e3) console.error('[taskScoring] task_evaluations upsert:', e3)
  }

  // (4) tự đánh giá còn treo 'pending' → approved
  const { error: e4 } = await supabase.from('task_self_evaluations')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .in('task_id', passed.map((r) => r.t.id)).eq('status', 'pending')
  if (e4) console.error('[taskScoring] self-eval status:', e4)

  return out
}

/** Đầu vào cho ô xem trước (trang Phê duyệt mở modal) — cùng nguồn với lúc lưu. */
export async function getScoringInputs(taskId: string): Promise<Omit<ScoreInput, 'managerPoints'>> {
  const { data, error } = await supabase.from('tasks')
    .select('self_score, difficulty, due_date, completed_date, overdue_exempt')
    .eq('id', taskId).maybeSingle()
  if (error) throw error
  const t = (data as any) || {}
  return { selfScore: t.self_score, difficulty: t.difficulty, dueDate: t.due_date, completedDate: t.completed_date, overdueExempt: t.overdue_exempt }
}
