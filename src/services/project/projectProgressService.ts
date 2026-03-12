// ============================================================================
// FILE: src/services/project/projectProgressService.ts
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// MÔ TẢ: Service tính tiến độ tự động cho Project & Phases
// ============================================================================
// LOGIC:
// - Phase progress = weighted avg of tasks (weight = estimated_hours)
// - Project progress = weighted avg of phases (weight = tổng hours)
// - progress_mode: 'auto' | 'manual'
// - Trigger trong DB tự động recalc khi task thay đổi
// - Service này dùng cho UI: refresh, toggle mode, xem breakdown
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export type ProgressMode = 'auto' | 'manual'

export interface PhaseProgressBreakdown {
  id: string
  name: string
  progress_pct: number
  progress_mode: ProgressMode
  status: string
  task_count: number
  completed_count: number
  total_hours: number
  calculated_progress: number | null
}

export interface OrphanTask {
  id: string
  name: string
  status: string
  progress: number
  estimated_hours: number
}

export interface ProgressBreakdown {
  project_progress: number
  calculated_progress: number
  phases: PhaseProgressBreakdown[]
  orphan_tasks: OrphanTask[]
}

export interface RecalcResult {
  success: boolean
  project_progress: number
  phases_updated: number
}

// ============================================================================
// SERVICE
// ============================================================================

export const projectProgressService = {

  // --------------------------------------------------------------------------
  // Recalculate: Tính lại tiến độ project + tất cả phases
  // Gọi khi user nhấn nút "Refresh" hoặc khi cần force update
  // --------------------------------------------------------------------------
  async recalculate(projectId: string): Promise<RecalcResult> {
    const { data, error } = await supabase.rpc('rpc_recalculate_project_progress', {
      p_project_id: projectId,
    })

    if (error) {
      console.error('[projectProgressService] recalculate error:', error)
      throw new Error(error.message)
    }

    return data as RecalcResult
  },

  // --------------------------------------------------------------------------
  // Get Breakdown: Lấy chi tiết tiến độ từng phase + orphan tasks
  // --------------------------------------------------------------------------
  async getBreakdown(projectId: string): Promise<ProgressBreakdown> {
    const { data, error } = await supabase.rpc('rpc_get_progress_breakdown', {
      p_project_id: projectId,
    })

    if (error) {
      console.error('[projectProgressService] getBreakdown error:', error)
      throw new Error(error.message)
    }

    return data as ProgressBreakdown
  },

  // --------------------------------------------------------------------------
  // Toggle Mode: Đổi giữa auto / manual cho project hoặc phase
  // --------------------------------------------------------------------------
  async setMode(
    entityType: 'project' | 'phase',
    entityId: string,
    mode: ProgressMode
  ): Promise<{ success: boolean; mode: ProgressMode }> {
    const { data, error } = await supabase.rpc('rpc_set_progress_mode', {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_mode: mode,
    })

    if (error) {
      console.error('[projectProgressService] setMode error:', error)
      throw new Error(error.message)
    }

    return data as { success: boolean; mode: ProgressMode }
  },

  // --------------------------------------------------------------------------
  // Get current mode cho project
  // --------------------------------------------------------------------------
  async getProjectMode(projectId: string): Promise<ProgressMode> {
    const { data, error } = await supabase
      .from('projects')
      .select('progress_mode')
      .eq('id', projectId)
      .single()

    if (error) {
      console.error('[projectProgressService] getProjectMode error:', error)
      return 'auto' // default
    }

    return (data?.progress_mode as ProgressMode) || 'auto'
  },

  // --------------------------------------------------------------------------
  // Manual update: PM tự nhập progress (chỉ khi mode = manual)
  // --------------------------------------------------------------------------
  async setManualProgress(
    entityType: 'project' | 'phase',
    entityId: string,
    progress: number
  ): Promise<void> {
    const clampedProgress = Math.max(0, Math.min(100, progress))

    if (entityType === 'project') {
      const { error } = await supabase
        .from('projects')
        .update({
          progress_pct: clampedProgress,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entityId)

      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase
        .from('project_phases')
        .update({
          progress_pct: clampedProgress,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entityId)

      if (error) throw new Error(error.message)
    }
  },

  // --------------------------------------------------------------------------
  // Quick stats: đếm tasks cho badge
  // --------------------------------------------------------------------------
  async getTaskStats(projectId: string): Promise<{
    total: number
    completed: number
    in_progress: number
    cancelled: number
  }> {
    const { data, error } = await supabase
      .from('tasks')
      .select('status')
      .eq('project_id', projectId)

    if (error) {
      console.error('[projectProgressService] getTaskStats error:', error)
      return { total: 0, completed: 0, in_progress: 0, cancelled: 0 }
    }

    const tasks = data || []
    return {
      total: tasks.length,
      completed: tasks.filter(t => ['finished', 'completed'].includes(t.status)).length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
    }
  },
}

export default projectProgressService