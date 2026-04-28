// ============================================================================
// PROGRESS SERVICE
// File: src/services/progressService.ts
// Huy Anh ERP System
// ============================================================================
// UPDATED:
// - status 'completed' → 'finished'
// - progress_mode: chỉ còn 'manual' và 'auto_time'
// - Thêm calculateTimeBasedProgress
// ============================================================================

import { supabase } from '../lib/supabase'
import { insertAutoApproval, type AutoApproveSource } from './approvalService'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Chế độ tính tiến độ
 * - manual: Thủ công (user tự update)
 * - auto_time: Tự động theo thời gian (từ start_date đến due_date)
 */
export type ProgressMode = 'manual' | 'auto_time'

export interface UpdateProgressInput {
  taskId: string
  progress: number
  changedBy?: string
  reason?: string
}

export interface ChangeProgressModeInput {
  taskId: string
  mode: ProgressMode
  changedBy?: string
}

export interface SubtaskProgressInfo {
  subtaskCount: number
  averageProgress: number
  subtasks: {
    id: string
    name: string
    progress: number
    status: string
  }[]
}

// ============================================================================
// STATUS TO PROGRESS MAP
// UPDATED: 'completed' → 'finished'
// ============================================================================

const STATUS_PROGRESS_MAP: Record<string, number> = {
  draft: 0,
  in_progress: 50,
  paused: -1, // -1 means keep current
  finished: 100,
  cancelled: 0,
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Tính progress dựa trên status
 */
export function calculateProgressByStatus(status: string, currentProgress?: number): number {
  const progress = STATUS_PROGRESS_MAP[status]
  if (progress === -1) {
    return currentProgress ?? 0
  }
  return progress ?? 0
}

/**
 * Tính progress dựa trên thời gian (auto_time mode)
 */
export function calculateTimeBasedProgress(startDate: string | null, dueDate: string | null): number {
  if (!startDate || !dueDate) return 0
  
  const start = new Date(startDate).getTime()
  const end = new Date(dueDate).getTime()
  const now = Date.now()
  
  if (now <= start) return 0
  if (now >= end) return 100
  
  const progress = ((now - start) / (end - start)) * 100
  return Math.round(progress)
}

/**
 * Tính progress dựa trên subtasks
 */
export function calculateProgressBySubtasks(subtasks: { progress: number }[]): number {
  if (subtasks.length === 0) return 0
  const total = subtasks.reduce((sum, st) => sum + (st.progress || 0), 0)
  return Math.round(total / subtasks.length)
}

// ============================================================================
// PARENT PROGRESS AUTO-SYNC
// ============================================================================

/**
 * Tính lại tiến độ công việc cha từ các công việc con
 * Gọi tự động sau khi cập nhật progress/status của subtask
 */
async function recalcParentProgress(parentTaskId: string): Promise<void> {
  console.log('🔄 [progressService.recalcParentProgress] Parent:', parentTaskId)

  // 1. Get all subtasks
  const { data: subtasks, error } = await supabase
    .from('tasks')
    .select('progress, status')
    .eq('parent_task_id', parentTaskId)

  if (error) {
    console.error('❌ [progressService.recalcParentProgress] Error:', error)
    return
  }

  if (!subtasks || subtasks.length === 0) return

  // 2. Calculate average progress
  const avgProgress = Math.round(
    subtasks.reduce((sum, t) => sum + (t.progress || 0), 0) / subtasks.length
  )

  // 3. Update parent
  const updateData: Record<string, any> = { progress: avgProgress }
  if (avgProgress >= 100) {
    updateData.status = 'finished'
    updateData.completed_date = new Date().toISOString()
  }

  const { error: updateError } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', parentTaskId)

  if (updateError) {
    console.error('❌ [progressService.recalcParentProgress] Update error:', updateError)
  } else {
    console.log('✅ [progressService.recalcParentProgress] Updated parent:', parentTaskId, '-> progress:', avgProgress)
  }
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Cập nhật progress thủ công
 * 
 * VALIDATION:
 * - Không cho update nếu progress_mode = 'auto_time'
 * - progress phải từ 0-100
 * - Tự động chuyển status thành 'finished' nếu progress = 100
 */
export async function updateTaskProgress(input: UpdateProgressInput) {
  const { taskId, progress } = input

  // Validate progress range
  if (progress < 0 || progress > 100) {
    throw new Error('Tiến độ phải từ 0 đến 100')
  }

  // Kiểm tra progress_mode + parent_task_id
  const { data: task, error: fetchError } = await supabase
    .from('tasks')
    .select('progress_mode, status, parent_task_id, task_source, assigner_id')
    .eq('id', taskId)
    .single()

  if (fetchError) {
    console.error('Error fetching task:', fetchError)
    throw fetchError
  }

  // VALIDATION: Không cho update manual nếu mode = auto_time
  if (task.progress_mode === 'auto_time') {
    throw new Error('Không thể cập nhật tiến độ thủ công cho công việc có chế độ tính tự động theo thời gian')
  }

  const updateData: Record<string, any> = {
    progress: Math.max(0, Math.min(100, progress)),
    updated_at: new Date().toISOString(),
  }

  // Tự động chuyển status khi đạt 100%
  let autoApproveSource: AutoApproveSource | null = null
  if (progress >= 100) {
    updateData.completed_date = new Date().toISOString()
    updateData.progress = 100

    const source = (task as any).task_source || 'assigned'
    if (source === 'recurring') {
      // Recurring: auto-approve 80đ, không cần duyệt
      updateData.status = 'finished'
      updateData.self_score = 100
      updateData.final_score = 80
      updateData.evaluation_status = 'approved'
      autoApproveSource = 'recurring'
    } else if (source === 'self') {
      // Self: auto-approve 85đ
      updateData.status = 'finished'
      updateData.self_score = 100
      updateData.final_score = 85
      updateData.evaluation_status = 'approved'
      autoApproveSource = 'self'
    } else if (source === 'project') {
      // Project: auto-approve 90đ
      updateData.status = 'finished'
      updateData.self_score = 100
      updateData.final_score = 90
      updateData.evaluation_status = 'approved'
      autoApproveSource = 'project'
    } else {
      // Assigned: chờ Manager duyệt
      updateData.status = 'pending_review'
      if (task.status !== 'finished' && task.status !== 'pending_review') {
        updateData.evaluation_status = 'pending_approval'
      }
    }
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', taskId)
    .select()
    .single()

  if (error) {
    console.error('Error updating progress:', error)
    throw error
  }

  // Insert task_approvals row để trigger update_participant_scores_on_approval
  // lan tỏa shared_score sang task_assignments cho participants
  if (autoApproveSource) {
    const approverId = input.changedBy || (task as any).assigner_id
    if (approverId) {
      await insertAutoApproval({
        task_id: taskId,
        approver_id: approverId,
        source: autoApproveSource,
        self_score: 100,
      })
    }
  }

  console.log('✅ [progressService] Updated progress:', taskId, '->', progress)

  // Auto-sync parent progress if this is a subtask
  if (task.parent_task_id) {
    await recalcParentProgress(task.parent_task_id)
  }

  return data
}

/**
 * Đổi chế độ tính tiến độ
 */
export async function changeProgressMode(input: ChangeProgressModeInput) {
  const { taskId, mode } = input

  const updateData: Record<string, any> = {
    progress_mode: mode,
    updated_at: new Date().toISOString(),
  }

  // Nếu đổi sang auto_time, tính lại progress ngay
  if (mode === 'auto_time') {
    const { data: task } = await supabase
      .from('tasks')
      .select('start_date, due_date')
      .eq('id', taskId)
      .single()

    if (task) {
      updateData.progress = calculateTimeBasedProgress(task.start_date, task.due_date)
    }
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', taskId)
    .select()
    .single()

  if (error) {
    console.error('Error changing progress mode:', error)
    throw error
  }

  console.log('✅ [progressService] Changed mode:', taskId, '->', mode)
  return data
}

/**
 * Lấy thông tin progress của subtasks
 */
export async function getSubtasksProgress(parentTaskId: string): Promise<SubtaskProgressInfo> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, name, progress, status')
    .eq('parent_task_id', parentTaskId)

  if (error) {
    console.error('Error fetching subtasks:', error)
    throw error
  }

  const subtasks = data || []
  const averageProgress = subtasks.length > 0
    ? Math.round(subtasks.reduce((sum, st) => sum + (st.progress || 0), 0) / subtasks.length)
    : 0

  return {
    subtaskCount: subtasks.length,
    averageProgress,
    subtasks: subtasks.map(st => ({
      id: st.id,
      name: st.name || '',
      progress: st.progress || 0,
      status: st.status || 'draft',
    })),
  }
}

/**
 * Cập nhật progress trực tiếp (không qua RPC, dùng cho form)
 * A-H2 fix: gọi insertAutoApproval khi auto-complete đẩy task lên 100%.
 */
export async function updateTaskProgressDirect(
  taskId: string,
  progress: number,
  progressMode?: ProgressMode
) {
  const updateData: Record<string, any> = {
    progress: Math.max(0, Math.min(100, progress)),
    updated_at: new Date().toISOString(),
  }

  if (progressMode) {
    updateData.progress_mode = progressMode
  }

  // Cần task source + assigner trước khi update để biết auto-approve loại nào
  let taskMeta: { task_source: string | null; assigner_id: string | null; status: string | null } | null = null
  if (progress >= 100) {
    const { data: existing } = await supabase
      .from('tasks')
      .select('task_source, assigner_id, status')
      .eq('id', taskId)
      .single()
    taskMeta = existing as any

    updateData.status = 'finished'
    updateData.completed_date = new Date().toISOString()
    updateData.progress = 100

    // Auto-approve scoring theo task_source (giống updateTaskProgress)
    const source = taskMeta?.task_source || 'assigned'
    if (source === 'recurring') {
      updateData.self_score = 100
      updateData.final_score = 80
      updateData.evaluation_status = 'approved'
    } else if (source === 'self') {
      updateData.self_score = 100
      updateData.final_score = 85
      updateData.evaluation_status = 'approved'
    } else if (source === 'project') {
      updateData.self_score = 100
      updateData.final_score = 90
      updateData.evaluation_status = 'approved'
    } else if (taskMeta?.status !== 'finished' && taskMeta?.status !== 'pending_review') {
      updateData.status = 'pending_review'
      updateData.evaluation_status = 'pending_approval'
    }
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updateData)
    .eq('id', taskId)
    .select()
    .single()

  if (error) {
    console.error('Error updating task progress:', error)
    throw error
  }

  // Insert task_approvals row → trigger lan tỏa shared_score cho participants
  if (progress >= 100 && taskMeta?.assigner_id) {
    const source = taskMeta.task_source || 'assigned'
    const autoSource: AutoApproveSource | null =
      source === 'recurring' ? 'recurring' :
      source === 'self' ? 'self' :
      source === 'project' ? 'project' : null
    if (autoSource) {
      await insertAutoApproval({
        task_id: taskId,
        approver_id: taskMeta.assigner_id,
        source: autoSource,
        self_score: 100,
      })
    }
  }

  return data
}

/**
 * Cập nhật progress_mode cho task
 */
export async function updateProgressMode(taskId: string, mode: ProgressMode) {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      progress_mode: mode,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select()
    .single()

  if (error) {
    console.error('Error updating progress mode:', error)
    throw error
  }

  return data
}

/**
 * Recalculate progress cho tất cả tasks có mode auto_time
 * (Dùng cho scheduled job hoặc manual trigger)
 */
export async function recalculateAllAutoTimeProgress() {
  // Lấy tất cả tasks có mode auto_time và chưa finished
  const { data: tasks, error: fetchError } = await supabase
    .from('tasks')
    .select('id, start_date, due_date, progress')
    .eq('progress_mode', 'auto_time')
    .neq('status', 'finished')
    .neq('status', 'cancelled')

  if (fetchError) {
    console.error('Error fetching auto_time tasks:', fetchError)
    throw fetchError
  }

  const results: { taskId: string; oldProgress: number; newProgress: number; error?: string }[] = []

  for (const task of tasks || []) {
    try {
      const newProgress = calculateTimeBasedProgress(task.start_date, task.due_date)
      
      if (newProgress !== task.progress) {
        await updateTaskProgressDirect(task.id, newProgress)
        results.push({
          taskId: task.id,
          oldProgress: task.progress,
          newProgress: newProgress,
        })
      }
    } catch (err) {
      results.push({
        taskId: task.id,
        oldProgress: task.progress,
        newProgress: 0,
        error: (err as Error).message,
      })
    }
  }

  console.log('✅ [progressService] Recalculated', results.length, 'tasks')
  return results
}

/**
 * Lấy progress hiện tại của task (tính theo mode)
 */
export async function getCurrentProgress(taskId: string): Promise<{
  progress: number
  mode: ProgressMode
  isAutoCalculated: boolean
}> {
  const { data: task, error } = await supabase
    .from('tasks')
    .select('progress, progress_mode, start_date, due_date, status')
    .eq('id', taskId)
    .single()

  if (error) {
    console.error('Error fetching task progress:', error)
    throw error
  }

  const mode = (task.progress_mode || 'manual') as ProgressMode
  let progress = task.progress || 0
  let isAutoCalculated = false

  // Nếu mode = auto_time, tính lại progress
  if (mode === 'auto_time' && task.status !== 'finished' && task.status !== 'cancelled') {
    progress = calculateTimeBasedProgress(task.start_date, task.due_date)
    isAutoCalculated = true
  }

  return {
    progress,
    mode,
    isAutoCalculated,
  }
}

// ============================================================================
// HOOKS SUPPORT
// ============================================================================

/**
 * Hook data cho useQuery
 */
export const progressQueryKeys = {
  subtasks: (parentId: string) => ['subtasks-progress', parentId] as const,
  current: (taskId: string) => ['task-progress', taskId] as const,
}

export const progressQueryFns = {
  subtasks: (parentId: string) => () => getSubtasksProgress(parentId),
  current: (taskId: string) => () => getCurrentProgress(taskId),
}

// ============================================================================
// EXPORTS
// ============================================================================

export const progressService = {
  // Calculations
  calculateProgressByStatus,
  calculateTimeBasedProgress,
  calculateProgressBySubtasks,
  
  // API
  updateTaskProgress,
  changeProgressMode,
  getSubtasksProgress,
  updateTaskProgressDirect,
  updateProgressMode,
  recalculateAllAutoTimeProgress,
  getCurrentProgress,
  
  // Query helpers
  queryKeys: progressQueryKeys,
  queryFns: progressQueryFns,
}

export default progressService