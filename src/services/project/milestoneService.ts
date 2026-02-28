// ============================================================================
// FILE: src/services/project/milestoneService.ts
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM3 — Bước 3.3
// MÔ TẢ: CRUD milestones, complete, deliverables check, upcoming/overdue
// BẢNG: project_milestones, project_phases, employees, project_activities
// PATTERN: async/await, Supabase, object-based service export
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  ProjectMilestone,
  MilestoneFormData,
  MilestoneStatus,
  MilestoneDeliverable,
  ActivityAction,
} from './project.types'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Select đầy đủ cho milestone — join phase + assignee */
const MILESTONE_SELECT = `
  *,
  phase:project_phases!project_milestones_phase_id_fkey(id, name, color),
  assignee:employees!project_milestones_assignee_id_fkey(id, full_name)
`

// ============================================================================
// HELPERS
// ============================================================================

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
      entity_type: 'milestone',
      entity_id: params.entity_id,
      actor_id: actorId,
      old_value: params.old_value,
      new_value: params.new_value,
      description: params.description,
    })
  } catch (err) {
    console.warn('[milestoneService] logActivity failed:', err)
  }
}

/**
 * Recalculate phase progress từ milestones
 */
async function recalcPhaseProgress(phaseId: string): Promise<void> {
  if (!phaseId) return

  const { data: milestones } = await supabase
    .from('project_milestones')
    .select('status')
    .eq('phase_id', phaseId)

  if (!milestones || milestones.length === 0) return

  const completed = milestones.filter(m => m.status === 'completed').length
  const progress = Math.round((completed / milestones.length) * 100 * 100) / 100

  await supabase
    .from('project_phases')
    .update({
      progress_pct: progress,
      updated_at: new Date().toISOString(),
    })
    .eq('id', phaseId)

  // Cascade: recalc project progress
  const { data: phase } = await supabase
    .from('project_phases')
    .select('project_id')
    .eq('id', phaseId)
    .single()

  if (phase?.project_id) {
    // Recalc project = AVG(phases)
    const { data: allPhases } = await supabase
      .from('project_phases')
      .select('progress_pct')
      .eq('project_id', phase.project_id)
      .neq('status', 'skipped')

    if (allPhases && allPhases.length > 0) {
      const total = allPhases.reduce((s, p) => s + (p.progress_pct || 0), 0)
      const avg = Math.round((total / allPhases.length) * 100) / 100

      await supabase
        .from('projects')
        .update({ progress_pct: avg, updated_at: new Date().toISOString() })
        .eq('id', phase.project_id)
    }
  }
}

// ============================================================================
// SERVICE
// ============================================================================

export const milestoneService = {

  // ==========================================================================
  // GET BY PROJECT — Tất cả milestones của dự án
  // ==========================================================================

  async getByProject(projectId: string): Promise<ProjectMilestone[]> {
    const { data, error } = await supabase
      .from('project_milestones')
      .select(MILESTONE_SELECT)
      .eq('project_id', projectId)
      .order('due_date', { ascending: true })

    if (error) throw error
    return (data as unknown as ProjectMilestone[]) || []
  },

  // ==========================================================================
  // GET BY PHASE — Milestones thuộc 1 phase
  // ==========================================================================

  async getByPhase(phaseId: string): Promise<ProjectMilestone[]> {
    const { data, error } = await supabase
      .from('project_milestones')
      .select(MILESTONE_SELECT)
      .eq('phase_id', phaseId)
      .order('due_date', { ascending: true })

    if (error) throw error
    return (data as unknown as ProjectMilestone[]) || []
  },

  // ==========================================================================
  // GET BY ID
  // ==========================================================================

  async getById(id: string): Promise<ProjectMilestone | null> {
    const { data, error } = await supabase
      .from('project_milestones')
      .select(MILESTONE_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }
    return data as unknown as ProjectMilestone
  },

  // ==========================================================================
  // GET UPCOMING — Milestones sắp đến hạn trong N ngày
  // ==========================================================================

  async getUpcoming(days: number = 7, projectId?: string): Promise<ProjectMilestone[]> {
    const today = new Date().toISOString().split('T')[0]
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + days)
    const futureDateStr = futureDate.toISOString().split('T')[0]

    let query = supabase
      .from('project_milestones')
      .select(`
        ${MILESTONE_SELECT},
        project:projects!project_milestones_project_id_fkey(id, code, name)
      `)
      .in('status', ['pending', 'approaching'])
      .gte('due_date', today)
      .lte('due_date', futureDateStr)

    if (projectId) {
      query = query.eq('project_id', projectId)
    }

    const { data, error } = await query
      .order('due_date', { ascending: true })

    if (error) throw error
    return (data as unknown as ProjectMilestone[]) || []
  },

  // ==========================================================================
  // GET OVERDUE — Milestones quá hạn
  // ==========================================================================

  async getOverdue(projectId?: string): Promise<ProjectMilestone[]> {
    const today = new Date().toISOString().split('T')[0]

    let query = supabase
      .from('project_milestones')
      .select(`
        ${MILESTONE_SELECT},
        project:projects!project_milestones_project_id_fkey(id, code, name)
      `)
      .in('status', ['pending', 'approaching', 'overdue'])
      .lt('due_date', today)

    if (projectId) {
      query = query.eq('project_id', projectId)
    }

    const { data, error } = await query
      .order('due_date', { ascending: true })

    if (error) throw error
    return (data as unknown as ProjectMilestone[]) || []
  },

  // ==========================================================================
  // CREATE
  // ==========================================================================

  async create(formData: MilestoneFormData): Promise<ProjectMilestone> {
    if (!formData.project_id) throw new Error('project_id là bắt buộc')
    if (!formData.name?.trim()) throw new Error('Tên milestone không được để trống')
    if (!formData.due_date) throw new Error('Ngày đến hạn là bắt buộc')

    // Khởi tạo deliverables với id nếu có
    const deliverables = (formData.deliverables || []).map((d, idx) => ({
      id: d.id || `del-${Date.now()}-${idx}`,
      title: d.title,
      completed: d.completed || false,
    }))

    // Xác định status ban đầu
    const today = new Date().toISOString().split('T')[0]
    const daysUntilDue = Math.ceil(
      (new Date(formData.due_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
    )
    let initialStatus: MilestoneStatus = 'pending'
    if (daysUntilDue <= 7 && daysUntilDue >= 0) {
      initialStatus = 'approaching'
    } else if (daysUntilDue < 0) {
      initialStatus = 'overdue'
    }

    const { data, error } = await supabase
      .from('project_milestones')
      .insert({
        project_id: formData.project_id,
        phase_id: formData.phase_id || null,
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        due_date: formData.due_date,
        assignee_id: formData.assignee_id || null,
        deliverables: deliverables,
        status: initialStatus,
      })
      .select(MILESTONE_SELECT)
      .single()

    if (error) throw error

    const milestone = data as unknown as ProjectMilestone

    // Recalc phase progress nếu thuộc phase
    if (milestone.phase_id) {
      await recalcPhaseProgress(milestone.phase_id)
    }

    // Log
    await logActivity({
      project_id: formData.project_id,
      action: 'updated',
      entity_id: milestone.id,
      description: `Thêm milestone "${milestone.name}" (hạn: ${milestone.due_date})`,
      new_value: { name: milestone.name, due_date: milestone.due_date, status: initialStatus },
    })

    return milestone
  },

  // ==========================================================================
  // UPDATE
  // ==========================================================================

  async update(id: string, formData: Partial<MilestoneFormData>): Promise<ProjectMilestone> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (formData.name !== undefined) updateData.name = formData.name.trim()
    if (formData.description !== undefined) updateData.description = formData.description?.trim() || null
    if (formData.due_date !== undefined) updateData.due_date = formData.due_date
    if (formData.phase_id !== undefined) updateData.phase_id = formData.phase_id || null
    if (formData.assignee_id !== undefined) updateData.assignee_id = formData.assignee_id || null
    if (formData.deliverables !== undefined) {
      updateData.deliverables = formData.deliverables.map((d, idx) => ({
        id: d.id || `del-${Date.now()}-${idx}`,
        title: d.title,
        completed: d.completed || false,
      }))
    }

    const { data, error } = await supabase
      .from('project_milestones')
      .update(updateData)
      .eq('id', id)
      .select(MILESTONE_SELECT)
      .single()

    if (error) throw error

    const milestone = data as unknown as ProjectMilestone

    // Recalc phase progress
    if (milestone.phase_id) {
      await recalcPhaseProgress(milestone.phase_id)
    }

    return milestone
  },

  // ==========================================================================
  // COMPLETE — Đánh dấu hoàn thành
  // ==========================================================================

  async complete(id: string): Promise<ProjectMilestone> {
    const current = await this.getById(id)
    if (!current) throw new Error('Không tìm thấy milestone')

    if (current.status === 'completed') {
      throw new Error('Milestone này đã hoàn thành')
    }

    const { data, error } = await supabase
      .from('project_milestones')
      .update({
        status: 'completed',
        completed_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(MILESTONE_SELECT)
      .single()

    if (error) throw error

    const milestone = data as unknown as ProjectMilestone

    // Recalc phase progress
    if (milestone.phase_id) {
      await recalcPhaseProgress(milestone.phase_id)
    }

    // Log
    await logActivity({
      project_id: milestone.project_id,
      action: 'milestone_completed',
      entity_id: milestone.id,
      description: `Hoàn thành milestone "${milestone.name}"`,
      old_value: { status: current.status },
      new_value: { status: 'completed', completed_date: milestone.completed_date },
    })

    return milestone
  },

  // ==========================================================================
  // REOPEN — Mở lại milestone (undo complete)
  // ==========================================================================

  async reopen(id: string): Promise<ProjectMilestone> {
    const current = await this.getById(id)
    if (!current) throw new Error('Không tìm thấy milestone')

    const today = new Date().toISOString().split('T')[0]
    let newStatus: MilestoneStatus = 'pending'
    if (current.due_date < today) {
      newStatus = 'overdue'
    } else {
      const daysUntilDue = Math.ceil(
        (new Date(current.due_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysUntilDue <= 7) newStatus = 'approaching'
    }

    const { data, error } = await supabase
      .from('project_milestones')
      .update({
        status: newStatus,
        completed_date: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(MILESTONE_SELECT)
      .single()

    if (error) throw error

    const milestone = data as unknown as ProjectMilestone

    if (milestone.phase_id) {
      await recalcPhaseProgress(milestone.phase_id)
    }

    return milestone
  },

  // ==========================================================================
  // CHECK DELIVERABLES — Kiểm tra tất cả deliverables đã hoàn thành chưa
  // ==========================================================================

  checkDeliverables(milestone: ProjectMilestone): {
    total: number
    completed: number
    allDone: boolean
    pending: MilestoneDeliverable[]
  } {
    const deliverables = milestone.deliverables || []
    const completed = deliverables.filter(d => d.completed)
    const pending = deliverables.filter(d => !d.completed)

    return {
      total: deliverables.length,
      completed: completed.length,
      allDone: deliverables.length > 0 && pending.length === 0,
      pending,
    }
  },

  // ==========================================================================
  // TOGGLE DELIVERABLE — Check/uncheck 1 deliverable
  // ==========================================================================

  async toggleDeliverable(milestoneId: string, deliverableId: string): Promise<ProjectMilestone> {
    const current = await this.getById(milestoneId)
    if (!current) throw new Error('Không tìm thấy milestone')

    const deliverables = (current.deliverables || []).map(d => {
      if (d.id === deliverableId) {
        return { ...d, completed: !d.completed }
      }
      return d
    })

    return this.update(milestoneId, { deliverables } as Partial<MilestoneFormData>)
  },

  // ==========================================================================
  // DELETE
  // ==========================================================================

  async delete(id: string): Promise<void> {
    const current = await this.getById(id)
    if (!current) throw new Error('Không tìm thấy milestone')

    const { error } = await supabase
      .from('project_milestones')
      .delete()
      .eq('id', id)

    if (error) throw error

    // Recalc phase progress
    if (current.phase_id) {
      await recalcPhaseProgress(current.phase_id)
    }

    // Log
    await logActivity({
      project_id: current.project_id,
      action: 'updated',
      entity_id: id,
      description: `Xóa milestone "${current.name}"`,
      old_value: { name: current.name, due_date: current.due_date },
    })
  },

  // ==========================================================================
  // REFRESH STATUSES — Cron-like: cập nhật approaching/overdue
  // Gọi khi load danh sách hoặc dashboard
  // ==========================================================================

  async refreshStatuses(projectId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0]
    const sevenDaysLater = new Date()
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7)
    const sevenDaysStr = sevenDaysLater.toISOString().split('T')[0]

    let updated = 0

    // 1) Pending → Overdue (quá hạn)
    const { data: overdueList } = await supabase
      .from('project_milestones')
      .update({ status: 'overdue', updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .in('status', ['pending', 'approaching'])
      .lt('due_date', today)
      .select('id')

    updated += overdueList?.length || 0

    // 2) Pending → Approaching (trong 7 ngày tới)
    const { data: approachingList } = await supabase
      .from('project_milestones')
      .update({ status: 'approaching', updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .gte('due_date', today)
      .lte('due_date', sevenDaysStr)
      .select('id')

    updated += approachingList?.length || 0

    return updated
  },
}

export default milestoneService