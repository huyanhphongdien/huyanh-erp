// ============================================================================
// PROGRESS SERVICE — Auto-calculate project/phase progress from tasks
// File: src/services/project/progressService.ts
// Huy Anh Rubber ERP — Project Management Module
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export type ProgressMode = 'auto' | 'manual'

export interface PhaseProgressBreakdown {
  phase_id: string | null
  phase_name: string
  total_tasks: number
  completed_tasks: number
  cancelled_tasks: number
  total_weight: number
  completed_weight: number
  progress_pct: number
  progress_mode: ProgressMode
}

export interface ProjectProgressSummary {
  project_id: string
  project_code: string
  project_name: string
  progress_pct: number
  progress_mode: ProgressMode
  total_tasks: number
  completed_tasks: number
  phases: PhaseProgressBreakdown[]
}

// ============================================================================
// RECALCULATE FUNCTIONS — Gọi DB functions
// ============================================================================

/**
 * Tính lại progress cho 1 phase
 * Gọi fn_recalculate_phase_progress trong DB
 */
export async function recalculatePhase(phaseId: string): Promise<number> {
  const { data, error } = await supabase.rpc('fn_recalculate_phase_progress', {
    p_phase_id: phaseId,
  })

  if (error) {
    console.error('[progressService] recalculatePhase error:', error)
    throw error
  }

  return data as number
}

/**
 * Tính lại progress cho 1 project
 * Gọi fn_recalculate_project_progress trong DB
 */
export async function recalculateProject(projectId: string): Promise<number> {
  const { data, error } = await supabase.rpc('fn_recalculate_project_progress', {
    p_project_id: projectId,
  })

  if (error) {
    console.error('[progressService] recalculateProject error:', error)
    throw error
  }

  return data as number
}

/**
 * Tính lại TẤT CẢ phases + project progress
 * Gọi fn_recalculate_all_phases trong DB
 */
export async function recalculateAll(projectId: string): Promise<void> {
  const { error } = await supabase.rpc('fn_recalculate_all_phases', {
    p_project_id: projectId,
  })

  if (error) {
    console.error('[progressService] recalculateAll error:', error)
    throw error
  }
}

// ============================================================================
// PROGRESS BREAKDOWN — Chi tiết tiến độ từng phase
// ============================================================================

/**
 * Lấy chi tiết tiến độ từng phase + nhóm "Chưa phân loại"
 */
export async function getProgressBreakdown(
  projectId: string
): Promise<ProjectProgressSummary> {
  // 1. Lấy thông tin project
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, code, name, progress_pct, progress_mode')
    .eq('id', projectId)
    .single()

  if (projErr || !project) {
    throw projErr || new Error('Project not found')
  }

  // 2. Lấy tất cả phases
  const { data: phases, error: phaseErr } = await supabase
    .from('project_phases')
    .select('id, name, progress_pct, progress_mode')
    .eq('project_id', projectId)
    .order('order_index')

  if (phaseErr) throw phaseErr

  // 3. Lấy task stats gộp theo phase_id
  const { data: taskStats, error: taskErr } = await supabase
    .from('tasks')
    .select('phase_id, status, estimated_hours')
    .eq('project_id', projectId)

  if (taskErr) throw taskErr

  // 4. Tính toán breakdown
  const phaseMap = new Map<string | null, {
    total: number
    completed: number
    cancelled: number
    totalWeight: number
    completedWeight: number
  }>()

  // Init cho mỗi phase
  for (const ph of (phases || [])) {
    phaseMap.set(ph.id, { total: 0, completed: 0, cancelled: 0, totalWeight: 0, completedWeight: 0 })
  }
  // Init cho unassigned
  phaseMap.set(null, { total: 0, completed: 0, cancelled: 0, totalWeight: 0, completedWeight: 0 })

  // Aggregate tasks
  for (const task of (taskStats || [])) {
    const key = task.phase_id || null
    if (!phaseMap.has(key)) {
      phaseMap.set(key, { total: 0, completed: 0, cancelled: 0, totalWeight: 0, completedWeight: 0 })
    }
    const bucket = phaseMap.get(key)!
    const weight = task.estimated_hours || 1

    if (task.status === 'cancelled') {
      bucket.cancelled++
    } else {
      bucket.total++
      bucket.totalWeight += weight
      if (task.status === 'completed') {
        bucket.completed++
        bucket.completedWeight += weight
      }
    }
  }

  // 5. Build breakdown array
  const breakdowns: PhaseProgressBreakdown[] = []

  for (const ph of (phases || [])) {
    const stats = phaseMap.get(ph.id)!
    breakdowns.push({
      phase_id: ph.id,
      phase_name: ph.name,
      total_tasks: stats.total,
      completed_tasks: stats.completed,
      cancelled_tasks: stats.cancelled,
      total_weight: stats.totalWeight,
      completed_weight: stats.completedWeight,
      progress_pct: ph.progress_pct ?? 0,
      progress_mode: (ph.progress_mode as ProgressMode) || 'auto',
    })
  }

  // Nhóm "Chưa phân loại"
  const unassigned = phaseMap.get(null)!
  if (unassigned.total > 0 || unassigned.cancelled > 0) {
    breakdowns.push({
      phase_id: null,
      phase_name: 'Chưa phân loại',
      total_tasks: unassigned.total,
      completed_tasks: unassigned.completed,
      cancelled_tasks: unassigned.cancelled,
      total_weight: unassigned.totalWeight,
      completed_weight: unassigned.completedWeight,
      progress_pct: unassigned.totalWeight > 0
        ? Math.round((unassigned.completedWeight / unassigned.totalWeight) * 1000) / 10
        : 0,
      progress_mode: 'auto',
    })
  }

  // 6. Totals
  const totalTasks = breakdowns.reduce((s, b) => s + b.total_tasks, 0)
  const completedTasks = breakdowns.reduce((s, b) => s + b.completed_tasks, 0)

  return {
    project_id: project.id,
    project_code: project.code,
    project_name: project.name,
    progress_pct: project.progress_pct ?? 0,
    progress_mode: (project.progress_mode as ProgressMode) || 'auto',
    total_tasks: totalTasks,
    completed_tasks: completedTasks,
    phases: breakdowns,
  }
}

// ============================================================================
// TOGGLE PROGRESS MODE — Chuyển auto ↔ manual
// ============================================================================

/**
 * Đổi progress_mode cho phase hoặc project
 */
export async function setProgressMode(
  entityId: string,
  entityType: 'phase' | 'project',
  mode: ProgressMode
): Promise<void> {
  const table = entityType === 'phase' ? 'project_phases' : 'projects'

  const { error } = await supabase
    .from(table)
    .update({ progress_mode: mode, updated_at: new Date().toISOString() })
    .eq('id', entityId)

  if (error) {
    console.error(`[progressService] setProgressMode error:`, error)
    throw error
  }

  // Nếu chuyển về auto → tính lại ngay
  if (mode === 'auto') {
    if (entityType === 'phase') {
      await recalculatePhase(entityId)
    } else {
      await recalculateAll(entityId)
    }
  }
}

/**
 * Manual override progress cho phase/project khi mode = 'manual'
 */
export async function setManualProgress(
  entityId: string,
  entityType: 'phase' | 'project',
  progressPct: number
): Promise<void> {
  const table = entityType === 'phase' ? 'project_phases' : 'projects'
  const clamped = Math.min(100, Math.max(0, progressPct))

  const { error } = await supabase
    .from(table)
    .update({
      progress_pct: clamped,
      progress_mode: 'manual',
      updated_at: new Date().toISOString(),
    })
    .eq('id', entityId)

  if (error) {
    console.error(`[progressService] setManualProgress error:`, error)
    throw error
  }
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

const progressService = {
  recalculatePhase,
  recalculateProject,
  recalculateAll,
  getProgressBreakdown,
  setProgressMode,
  setManualProgress,
}

export default progressService