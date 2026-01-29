// src/services/taskStatusService.ts
// Service xử lý chuyển đổi status task và thông báo
// ============================================================
// UPDATED: Tích hợp cascade logic cho công việc cha-con
// ============================================================

import { supabase } from '../lib/supabase'
import subtaskService from './subtaskService'

// ============================================================
// TYPES
// ============================================================

export interface TaskStatusHistory {
  id: string
  task_id: string
  old_status: string | null
  new_status: string
  old_progress: number | null
  new_progress: number | null
  changed_by: string | null
  change_reason: string | null
  change_type: 'manual' | 'auto_due' | 'auto_overdue' | 'approval' | 'rejection' | 'revision_request'
  created_at: string
  changed_by_employee?: {
    id: string
    full_name: string
  }
}

export interface TaskNotification {
  id: string
  task_id: string
  task_name?: string
  recipient_id: string
  notification_type: 'due_reminder' | 'overdue_alert' | 'pending_approval' | 'approval_result'
  title: string
  message: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
}

export interface DailyMaintenanceResult {
  executed_at: string
  due_tasks_transitioned: number
  overdue_tasks_marked: number
}

export interface TaskStatusSummary {
  status: string
  count: number
  avg_progress: number
  overdue_count: number
}

export interface TaskDueToday {
  id: string
  name: string
  status: string
  progress: number
  due_date: string
  priority: string
  assignee_name: string | null
  department_name: string | null
  has_self_evaluation: boolean
}

export interface StatusChangeResult {
  success: boolean
  cascadedChildren?: number
  error?: string
  warnings?: string[]
}

// ============================================================
// STATUS CHANGE WITH CASCADE
// ============================================================

/**
 * Thay đổi status của task với cascade logic cho công việc cha-con
 * 
 * Quy tắc:
 * - Cancelled/On Hold → Cascade xuống tất cả con
 * - Completed → Kiểm tra tất cả con đã completed chưa
 */
export async function changeTaskStatus(
  taskId: string,
  newStatus: string,
  changedBy?: string,
  changeReason?: string
): Promise<StatusChangeResult> {
  console.log('🔄 [taskStatusService.changeTaskStatus]', { taskId, newStatus })

  const warnings: string[] = []

  try {
    // 1. Kiểm tra task có phải là cha không
    const subtaskCount = await subtaskService.getSubtaskCount(taskId)
    const isParentTask = subtaskCount > 0

    // 2. Validate nếu là công việc cha
    if (isParentTask) {
      // 2a. Nếu chuyển sang Completed, kiểm tra tất cả con đã completed
      if (newStatus === 'completed') {
        const canComplete = await subtaskService.canParentComplete(taskId)
        
        if (!canComplete.canComplete) {
          return {
            success: false,
            error: canComplete.reason || 'Không thể hoàn thành công việc cha khi còn công việc con chưa hoàn thành',
          }
        }
      }

      // 2b. Nếu chuyển sang Cancelled hoặc On Hold, chuẩn bị cascade
      if (newStatus === 'cancelled' || newStatus === 'on_hold') {
        const statusLabel = newStatus === 'cancelled' ? 'Đã hủy' : 'Tạm dừng'
        warnings.push(`${subtaskCount} công việc con sẽ tự động chuyển sang "${statusLabel}"`)
      }
    }

    // 3. Lấy status cũ để log
    const { data: currentTask } = await supabase
      .from('tasks')
      .select('status, progress')
      .eq('id', taskId)
      .single()

    const oldStatus = currentTask?.status
    const oldProgress = currentTask?.progress

    // 4. Chuẩn bị data update
    const updateData: Record<string, any> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    }

    // Auto set progress và completed_date
    if (newStatus === 'completed') {
      updateData.progress = 100
      updateData.completed_date = new Date().toISOString()
    }

    // 5. Update task chính
    const { error: updateError } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)

    if (updateError) {
      throw updateError
    }

    // 6. Log status history
    if (oldStatus !== newStatus) {
      await supabase
        .from('task_status_history')
        .insert({
          task_id: taskId,
          old_status: oldStatus,
          new_status: newStatus,
          old_progress: oldProgress,
          new_progress: updateData.progress || oldProgress,
          changed_by: changedBy || null,
          change_reason: changeReason || null,
          change_type: 'manual',
        })
    }

    // 7. Cascade nếu cần
    let cascadedCount = 0
    if (isParentTask && (newStatus === 'cancelled' || newStatus === 'on_hold')) {
      const cascadeResult = await subtaskService.cascadeStatusToChildren(taskId, newStatus)
      cascadedCount = cascadeResult.updatedCount
      
      if (cascadeResult.error) {
        warnings.push(`Lỗi cascade: ${cascadeResult.error}`)
      }
    }

    console.log('✅ [taskStatusService.changeTaskStatus] Success', { cascadedCount })

    return {
      success: true,
      cascadedChildren: cascadedCount,
      warnings: warnings.length > 0 ? warnings : undefined,
    }

  } catch (err: any) {
    console.error('❌ [taskStatusService.changeTaskStatus] Error:', err)
    return {
      success: false,
      error: err.message || 'Có lỗi khi thay đổi trạng thái',
    }
  }
}

/**
 * Kiểm tra có thể thay đổi status không (pre-validation)
 */
export async function canChangeStatus(
  taskId: string,
  newStatus: string
): Promise<{ canChange: boolean; reason?: string; warnings?: string[] }> {
  const warnings: string[] = []

  // Kiểm tra nếu là công việc cha
  const subtaskCount = await subtaskService.getSubtaskCount(taskId)
  
  if (subtaskCount > 0) {
    // Không cho completed nếu còn con chưa completed
    if (newStatus === 'completed') {
      const result = await subtaskService.canParentComplete(taskId)
      if (!result.canComplete) {
        return { canChange: false, reason: result.reason }
      }
    }

    // Cảnh báo cascade
    if (newStatus === 'cancelled' || newStatus === 'on_hold') {
      const statusLabel = newStatus === 'cancelled' ? 'Đã hủy' : 'Tạm dừng'
      warnings.push(`${subtaskCount} công việc con sẽ tự động chuyển sang "${statusLabel}"`)
    }
  }

  return { canChange: true, warnings: warnings.length > 0 ? warnings : undefined }
}

// ============================================================
// APPROVAL FUNCTIONS
// ============================================================

export async function approveTask(
  taskId: string,
  managerId: string,
  notes?: string
): Promise<boolean> {
  const { data, error } = await supabase
    .rpc('fn_approve_task', {
      p_task_id: taskId,
      p_manager_id: managerId,
      p_notes: notes || null
    })

  if (error) {
    console.error('Error approving task:', error)
    throw new Error(error.message)
  }

  return data === true
}

export async function rejectTask(
  taskId: string,
  managerId: string,
  rejectionReason: string,
  newProgress: number = 99
): Promise<boolean> {
  const { data, error } = await supabase
    .rpc('fn_reject_task', {
      p_task_id: taskId,
      p_manager_id: managerId,
      p_rejection_reason: rejectionReason,
      p_new_progress: newProgress
    })

  if (error) {
    console.error('Error rejecting task:', error)
    throw new Error(error.message)
  }

  return data === true
}

export async function requestRevision(
  taskId: string,
  managerId: string,
  revisionNotes: string,
  newProgress: number = 95
): Promise<boolean> {
  const { data, error } = await supabase
    .rpc('fn_request_revision', {
      p_task_id: taskId,
      p_manager_id: managerId,
      p_revision_notes: revisionNotes,
      p_new_progress: newProgress
    })

  if (error) {
    console.error('Error requesting revision:', error)
    throw new Error(error.message)
  }

  return data === true
}

// ============================================================
// NOTIFICATION FUNCTIONS
// ============================================================

export async function getUnreadNotifications(
  employeeId: string
): Promise<TaskNotification[]> {
  const { data, error } = await supabase
    .rpc('fn_get_unread_notifications', {
      p_employee_id: employeeId
    })

  if (error) {
    console.error('Error fetching notifications:', error)
    throw new Error(error.message)
  }

  return data || []
}

export async function markNotificationRead(
  notificationId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .rpc('fn_mark_notification_read', {
      p_notification_id: notificationId
    })

  if (error) {
    console.error('Error marking notification read:', error)
    throw new Error(error.message)
  }

  return data === true
}

export async function markAllNotificationsRead(
  employeeId: string
): Promise<number> {
  const { data, error } = await supabase
    .from('task_notifications')
    .update({ 
      is_read: true, 
      read_at: new Date().toISOString() 
    })
    .eq('recipient_id', employeeId)
    .eq('is_read', false)
    .select('id')

  if (error) {
    console.error('Error marking all notifications read:', error)
    throw new Error(error.message)
  }

  return data?.length || 0
}

export async function countUnreadNotifications(
  employeeId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('task_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', employeeId)
    .eq('is_read', false)

  if (error) {
    console.error('Error counting notifications:', error)
    return 0
  }

  return count || 0
}

// ============================================================
// STATUS HISTORY FUNCTIONS
// ============================================================

export async function getTaskStatusHistory(
  taskId: string
): Promise<TaskStatusHistory[]> {
  const { data, error } = await supabase
    .from('task_status_history')
    .select(`
      *,
      changed_by_employee:employees!task_status_history_changed_by_fkey(
        id,
        full_name
      )
    `)
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching status history:', error)
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('task_status_history')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
    
    if (fallbackError) {
      throw new Error(fallbackError.message)
    }
    return fallbackData || []
  }

  return data || []
}

// ============================================================
// MAINTENANCE FUNCTIONS (Admin only)
// ============================================================

export async function runDailyMaintenance(): Promise<DailyMaintenanceResult> {
  const { data, error } = await supabase
    .rpc('fn_daily_task_maintenance')

  if (error) {
    console.error('Error running daily maintenance:', error)
    throw new Error(error.message)
  }

  return data as DailyMaintenanceResult
}

export async function transitionDueTasks(): Promise<number> {
  const { data, error } = await supabase
    .rpc('fn_auto_transition_due_tasks')

  if (error) {
    console.error('Error transitioning due tasks:', error)
    throw new Error(error.message)
  }

  return data || 0
}

export async function markOverdueTasks(): Promise<number> {
  const { data, error } = await supabase
    .rpc('fn_mark_overdue_tasks')

  if (error) {
    console.error('Error marking overdue tasks:', error)
    throw new Error(error.message)
  }

  return data || 0
}

// ============================================================
// STATISTICS FUNCTIONS
// ============================================================

export async function getTaskStatusSummary(): Promise<TaskStatusSummary[]> {
  const { data, error } = await supabase
    .from('v_task_status_summary')
    .select('*')

  if (error) {
    console.error('Error fetching status summary:', error)
    throw new Error(error.message)
  }

  return data || []
}

export async function getTasksDueToday(): Promise<TaskDueToday[]> {
  const { data, error } = await supabase
    .from('v_tasks_due_today')
    .select('*')

  if (error) {
    console.error('Error fetching tasks due today:', error)
    throw new Error(error.message)
  }

  return data || []
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export function getNotificationColor(type: TaskNotification['notification_type']): string {
  const colors: Record<TaskNotification['notification_type'], string> = {
    due_reminder: 'yellow',
    overdue_alert: 'red',
    pending_approval: 'blue',
    approval_result: 'green'
  }
  return colors[type] || 'gray'
}

export function getNotificationIcon(type: TaskNotification['notification_type']): string {
  const icons: Record<TaskNotification['notification_type'], string> = {
    due_reminder: '⏰',
    overdue_alert: '⚠️',
    pending_approval: '📋',
    approval_result: '✅'
  }
  return icons[type] || '📌'
}

export function getChangeTypeLabel(changeType: TaskStatusHistory['change_type']): string {
  const labels: Record<TaskStatusHistory['change_type'], string> = {
    manual: 'Thay đổi thủ công',
    auto_due: 'Tự động (đến hạn)',
    auto_overdue: 'Tự động (quá hạn)',
    approval: 'Phê duyệt',
    rejection: 'Từ chối',
    revision_request: 'Yêu cầu bổ sung'
  }
  return labels[changeType] || changeType
}

// ============================================================
// EXPORT OBJECT
// ============================================================

export const taskStatusService = {
  // Status change with cascade
  changeTaskStatus,
  canChangeStatus,
  
  // Approval
  approveTask,
  rejectTask,
  requestRevision,
  
  // Notifications
  getUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  countUnreadNotifications,
  
  // History
  getTaskStatusHistory,
  
  // Maintenance
  runDailyMaintenance,
  transitionDueTasks,
  markOverdueTasks,
  
  // Statistics
  getTaskStatusSummary,
  getTasksDueToday,
  
  // Helpers
  getNotificationColor,
  getNotificationIcon,
  getChangeTypeLabel
}

export default taskStatusService