// ============================================================================
// FILE: src/services/project/phaseService.ts
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM3 — Bước 3.2
// MÔ TẢ: CRUD phases (giai đoạn dự án), reorder, progress calculation
// BẢNG: project_phases, projects, project_milestones, project_activities
// PATTERN: async/await, Supabase, object-based service export
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  ProjectPhase,
  PhaseFormData,
  PhaseStatus,
  ActivityAction,
} from './project.types'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Select đầy đủ cho phase */
const PHASE_SELECT = `
  *,
  milestones:project_milestones(id, name, status, due_date, completed_date)
`

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Lấy current employee id từ auth
 */
async function getCurrentEmployeeId(): Promise<string | undefined> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return undefined
  const { data: emp } = await supabase
    .from('employees')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  return emp?.id
}

/**
 * Log activity cho project
 */
async function logActivity(params: {
  project_id: string
  action: ActivityAction
  entity_id?: string
  description?: string
  old_value?: Record<string, unknown>
  new_value?: Record<string, unknown>
}): Promise<void> {
  try {
    const actorId = await getCurrentEmployeeId()
    await supabase.from('project_activities').insert({
      project_id: params.project_id,
      action: params.action,
      entity_type: 'phase',
      entity_id: params.entity_id,
      actor_id: actorId,
      old_value: params.old_value,
      new_value: params.new_value,
      description: params.description,
    })
  } catch (err) {
    console.warn('[phaseService] logActivity failed:', err)
  }
}

/**
 * Recalculate project progress_pct từ trung bình phases
 * Công thức: AVG(phase.progress_pct) — weighted by phase count
 */
async function recalcProjectProgress(projectId: string): Promise<void> {
  const { data: phases, error } = await supabase
    .from('project_phases')
    .select('progress_pct, status')
    .eq('project_id', projectId)
    .neq('status', 'skipped') // Bỏ qua phase đã skip

  if (error || !phases || phases.length === 0) return

  const totalProgress = phases.reduce((sum, p) => sum + (p.progress_pct || 0), 0)
  const avgProgress = Math.round((totalProgress / phases.length) * 100) / 100

  await supabase
    .from('projects')
    .update({
      progress_pct: avgProgress,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)
}

/**
 * Lấy order_index tiếp theo cho project
 */
async function getNextOrderIndex(projectId: string): Promise<number> {
  const { data } = await supabase
    .from('project_phases')
    .select('order_index')
    .eq('project_id', projectId)
    .order('order_index', { ascending: false })
    .limit(1)

  if (data && data.length > 0) {
    return (data[0].order_index || 0) + 1
  }
  return 0
}

// ============================================================================
// SERVICE
// ============================================================================

export const phaseService = {

  // ==========================================================================
  // GET BY PROJECT — Danh sách phases theo dự án (ordered by order_index)
  // ==========================================================================

  async getByProject(projectId: string): Promise<ProjectPhase[]> {
    const { data, error } = await supabase
      .from('project_phases')
      .select(PHASE_SELECT)
      .eq('project_id', projectId)
      .order('order_index', { ascending: true })

    if (error) throw error
    return (data as unknown as ProjectPhase[]) || []
  },

  // ==========================================================================
  // GET BY ID
  // ==========================================================================

  async getById(id: string): Promise<ProjectPhase | null> {
    const { data, error } = await supabase
      .from('project_phases')
      .select(PHASE_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data as unknown as ProjectPhase
  },

  // ==========================================================================
  // CREATE — Tạo phase mới, auto set order_index
  // ==========================================================================

  async create(formData: PhaseFormData): Promise<ProjectPhase> {
    if (!formData.project_id) throw new Error('project_id là bắt buộc')
    if (!formData.name?.trim()) throw new Error('Tên giai đoạn không được để trống')

    // Validate dates
    if (formData.planned_start && formData.planned_end) {
      if (new Date(formData.planned_end) < new Date(formData.planned_start)) {
        throw new Error('Ngày kết thúc phải sau ngày bắt đầu')
      }
    }

    // Auto order_index
    const orderIndex = formData.order_index ?? await getNextOrderIndex(formData.project_id)

    const { data, error } = await supabase
      .from('project_phases')
      .insert({
        project_id: formData.project_id,
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        order_index: orderIndex,
        planned_start: formData.planned_start || null,
        planned_end: formData.planned_end || null,
        color: formData.color || null,
        status: formData.status || 'pending',
        progress_pct: 0,
      })
      .select(PHASE_SELECT)
      .single()

    if (error) throw error

    const phase = data as unknown as ProjectPhase

    // Log activity
    await logActivity({
      project_id: formData.project_id,
      action: 'phase_added',
      entity_id: phase.id,
      description: `Thêm giai đoạn "${phase.name}"`,
      new_value: { name: phase.name, order_index: phase.order_index },
    })

    return phase
  },

  // ==========================================================================
  // UPDATE — Cập nhật phase + recalculate project progress
  // ==========================================================================

  async update(id: string, formData: Partial<PhaseFormData>): Promise<ProjectPhase> {
    // Validate dates
    if (formData.planned_start && formData.planned_end) {
      if (new Date(formData.planned_end) < new Date(formData.planned_start)) {
        throw new Error('Ngày kết thúc phải sau ngày bắt đầu')
      }
    }

    const updateData: Record<string, unknown> = {
      ...formData,
      updated_at: new Date().toISOString(),
    }

    if (formData.name) {
      updateData.name = formData.name.trim()
    }

    // Xóa project_id khỏi update (không cho đổi project)
    delete updateData.project_id

    const { data, error } = await supabase
      .from('project_phases')
      .update(updateData)
      .eq('id', id)
      .select(PHASE_SELECT)
      .single()

    if (error) throw error

    const phase = data as unknown as ProjectPhase

    // Recalculate project progress
    await recalcProjectProgress(phase.project_id)

    return phase
  },

  // ==========================================================================
  // UPDATE STATUS — Chuyển trạng thái phase
  // ==========================================================================

  async updateStatus(id: string, newStatus: PhaseStatus): Promise<ProjectPhase> {
    const current = await this.getById(id)
    if (!current) throw new Error('Không tìm thấy giai đoạn')

    const oldStatus = current.status

    const updateData: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    }

    // Auto-set actual dates
    if (newStatus === 'in_progress' && !current.actual_start) {
      updateData.actual_start = new Date().toISOString().split('T')[0]
    }
    if (newStatus === 'completed') {
      updateData.actual_end = new Date().toISOString().split('T')[0]
      updateData.progress_pct = 100
    }

    const { data, error } = await supabase
      .from('project_phases')
      .update(updateData)
      .eq('id', id)
      .select(PHASE_SELECT)
      .single()

    if (error) throw error

    const phase = data as unknown as ProjectPhase

    // Recalculate project progress
    await recalcProjectProgress(phase.project_id)

    // Log activity
    if (newStatus === 'completed') {
      await logActivity({
        project_id: phase.project_id,
        action: 'phase_completed',
        entity_id: phase.id,
        old_value: { status: oldStatus },
        new_value: { status: newStatus },
        description: `Hoàn thành giai đoạn "${phase.name}"`,
      })
    }

    return phase
  },

  // ==========================================================================
  // UPDATE PROGRESS — Cập nhật % tiến độ phase
  // Có thể gọi thủ công hoặc auto-calc từ tasks (PM6)
  // ==========================================================================

  async updateProgress(id: string, progressPct?: number): Promise<ProjectPhase> {
    const current = await this.getById(id)
    if (!current) throw new Error('Không tìm thấy giai đoạn')

    let finalProgress = progressPct

    // Nếu không truyền progressPct, tự tính từ milestones
    if (finalProgress === undefined) {
      const { data: milestones } = await supabase
        .from('project_milestones')
        .select('status')
        .eq('phase_id', id)

      if (milestones && milestones.length > 0) {
        const completed = milestones.filter(m => m.status === 'completed').length
        finalProgress = Math.round((completed / milestones.length) * 100 * 100) / 100
      } else {
        finalProgress = current.progress_pct
      }
    }

    // Clamp 0-100
    finalProgress = Math.max(0, Math.min(100, finalProgress))

    const updateData: Record<string, unknown> = {
      progress_pct: finalProgress,
      updated_at: new Date().toISOString(),
    }

    // Auto-complete nếu đạt 100%
    if (finalProgress >= 100 && current.status !== 'completed') {
      updateData.status = 'completed'
      updateData.actual_end = new Date().toISOString().split('T')[0]
    }

    const { data, error } = await supabase
      .from('project_phases')
      .update(updateData)
      .eq('id', id)
      .select(PHASE_SELECT)
      .single()

    if (error) throw error

    const phase = data as unknown as ProjectPhase

    // Recalculate project progress
    await recalcProjectProgress(phase.project_id)

    return phase
  },

  // ==========================================================================
  // REORDER — Sắp xếp lại thứ tự phases (drag-drop)
  // ==========================================================================

  async reorder(projectId: string, phaseIds: string[]): Promise<void> {
    // Cập nhật từng phase với order_index mới
    const updates = phaseIds.map((id, index) =>
      supabase
        .from('project_phases')
        .update({
          order_index: index,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('project_id', projectId) // Safety check
    )

    const results = await Promise.all(updates)

    // Check errors
    const firstError = results.find(r => r.error)
    if (firstError?.error) throw firstError.error
  },

  // ==========================================================================
  // DELETE — Xóa phase (cascade check milestones)
  // ==========================================================================

  async delete(id: string): Promise<void> {
    const current = await this.getById(id)
    if (!current) throw new Error('Không tìm thấy giai đoạn')

    // Check milestones
    const { count: msCount } = await supabase
      .from('project_milestones')
      .select('id', { count: 'exact', head: true })
      .eq('phase_id', id)

    if (msCount && msCount > 0) {
      // Set milestones về phase_id = null (không xóa chúng)
      await supabase
        .from('project_milestones')
        .update({ phase_id: null })
        .eq('phase_id', id)
    }

    // TODO PM6: Check tasks liên kết phase này
    // Hiện tại chưa có liên kết task → phase

    const { error } = await supabase
      .from('project_phases')
      .delete()
      .eq('id', id)

    if (error) throw error

    // Recalculate project progress
    await recalcProjectProgress(current.project_id)

    // Log activity
    await logActivity({
      project_id: current.project_id,
      action: 'updated',
      entity_id: id,
      description: `Xóa giai đoạn "${current.name}"`,
      old_value: { name: current.name, order_index: current.order_index },
    })

    // Reindex remaining phases
    const remaining = await this.getByProject(current.project_id)
    if (remaining.length > 0) {
      await this.reorder(
        current.project_id,
        remaining.map(p => p.id)
      )
    }
  },

  // ==========================================================================
  // BULK CREATE — Tạo nhiều phases cùng lúc (dùng khi clone template)
  // ==========================================================================

  async bulkCreate(projectId: string, phases: Array<{
    name: string
    description?: string
    color?: string
    planned_start?: string
    planned_end?: string
  }>): Promise<ProjectPhase[]> {
    if (phases.length === 0) return []

    const currentMaxIndex = await getNextOrderIndex(projectId)

    const insertData = phases.map((p, idx) => ({
      project_id: projectId,
      name: p.name.trim(),
      description: p.description?.trim() || null,
      color: p.color || null,
      planned_start: p.planned_start || null,
      planned_end: p.planned_end || null,
      order_index: currentMaxIndex + idx,
      status: 'pending' as PhaseStatus,
      progress_pct: 0,
    }))

    const { data, error } = await supabase
      .from('project_phases')
      .insert(insertData)
      .select(PHASE_SELECT)

    if (error) throw error
    return (data as unknown as ProjectPhase[]) || []
  },

  // ==========================================================================
  // GET SUMMARY — Tóm tắt phases cho overview
  // ==========================================================================

  async getSummary(projectId: string): Promise<{
    total: number
    pending: number
    in_progress: number
    completed: number
    skipped: number
  }> {
    const phases = await this.getByProject(projectId)

    return {
      total: phases.length,
      pending: phases.filter(p => p.status === 'pending').length,
      in_progress: phases.filter(p => p.status === 'in_progress').length,
      completed: phases.filter(p => p.status === 'completed').length,
      skipped: phases.filter(p => p.status === 'skipped').length,
    }
  },
}

export default phaseService