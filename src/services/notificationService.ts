// ============================================================================
// NOTIFICATION SERVICE - UNIFIED
// File: src/services/notificationService.ts
// Huy Anh ERP System
// ============================================================================
// Hệ thống thông báo tổng hợp cho tất cả modules
// Hỗ trợ: Task, Leave, Overtime, Attendance, Shift, Evaluation, System
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export type NotificationModule = 
  | 'task' 
  | 'leave' 
  | 'overtime' 
  | 'attendance' 
  | 'shift' 
  | 'evaluation' 
  | 'purchasing' 
  | 'maintenance' 
  | 'system'

export type NotificationType =
  // Task
  | 'task_assigned'
  | 'task_status_changed'
  | 'task_due_reminder'
  | 'task_overdue'
  | 'task_comment'
  | 'task_approval_pending'
  | 'task_approved'
  | 'task_rejected'
  | 'task_revision_requested'
  | 'task_participant_added'
  | 'task_subtask_completed'
  | 'task_progress_updated'
  // Leave
  | 'leave_submitted'
  | 'leave_approved'
  | 'leave_rejected'
  // Overtime
  | 'overtime_submitted'
  | 'overtime_approved'
  | 'overtime_rejected'
  // Attendance
  | 'attendance_missing'
  | 'attendance_late'
  | 'attendance_early_leave'
  // Shift
  | 'shift_assigned'
  | 'shift_changed'
  | 'shift_swap'
  // Evaluation
  | 'evaluation_submitted'
  | 'evaluation_completed'
  // System
  | 'system_announcement'
  | 'system_maintenance'

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface Notification {
  id: string
  sender_id: string | null
  sender_name: string | null
  sender_avatar: string | null
  module: NotificationModule
  notification_type: NotificationType
  title: string
  message: string | null
  reference_id: string | null
  reference_type: string | null
  reference_url: string | null
  metadata: Record<string, any>
  is_read: boolean
  read_at: string | null
  priority: NotificationPriority
  created_at: string
}

export interface NotificationCount {
  total: number
  byModule: Record<NotificationModule, number>
}

export interface NotificationFilters {
  module?: NotificationModule
  is_read?: boolean
  limit?: number
  offset?: number
}

export interface CreateNotificationInput {
  recipient_id: string
  sender_id?: string
  module: NotificationModule
  notification_type: NotificationType
  title: string
  message?: string
  reference_id?: string
  reference_type?: string
  reference_url?: string
  metadata?: Record<string, any>
  priority?: NotificationPriority
}

// ============================================================================
// NOTIFICATION QUERIES
// ============================================================================

/**
 * Lấy danh sách thông báo với filter
 */
export async function getNotifications(
  employeeId: string,
  filters?: NotificationFilters
): Promise<Notification[]> {
  try {
    const { data, error } = await supabase.rpc('fn_get_notifications', {
      p_employee_id: employeeId,
      p_module: filters?.module || null,
      p_is_read: filters?.is_read ?? null,
      p_limit: filters?.limit || 20,
      p_offset: filters?.offset || 0,
    })

    if (error) {
      console.error('❌ [notificationService] getNotifications error:', error)
      // Fallback: query trực tiếp
      return await getNotificationsFallback(employeeId, filters)
    }

    return (data || []) as Notification[]
  } catch (err) {
    console.error('❌ [notificationService] getNotifications exception:', err)
    return await getNotificationsFallback(employeeId, filters)
  }
}

/**
 * Fallback: Query trực tiếp nếu RPC không hoạt động
 */
async function getNotificationsFallback(
  employeeId: string,
  filters?: NotificationFilters
): Promise<Notification[]> {
  try {
    let query = supabase
      .from('notifications')
      .select(`
        id,
        sender_id,
        module,
        notification_type,
        title,
        message,
        reference_id,
        reference_type,
        reference_url,
        metadata,
        is_read,
        read_at,
        priority,
        created_at
      `)
      .eq('recipient_id', employeeId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(filters?.limit || 20)

    if (filters?.module) {
      query = query.eq('module', filters.module)
    }
    if (filters?.is_read !== undefined && filters?.is_read !== null) {
      query = query.eq('is_read', filters.is_read)
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1)
    }

    const { data, error } = await query

    if (error) throw error

    // Lấy sender info riêng
    const senderIds = [...new Set((data || []).map(n => n.sender_id).filter(Boolean))]
    let senderMap: Record<string, { full_name: string; avatar_url: string | null }> = {}
    
    if (senderIds.length > 0) {
      const { data: senders } = await supabase
        .from('employees')
        .select('id, full_name, avatar_url')
        .in('id', senderIds)
      
      if (senders) {
        senderMap = Object.fromEntries(
          senders.map(s => [s.id, { full_name: s.full_name, avatar_url: s.avatar_url }])
        )
      }
    }

    return (data || []).map(n => ({
      ...n,
      sender_name: n.sender_id ? senderMap[n.sender_id]?.full_name || null : null,
      sender_avatar: n.sender_id ? senderMap[n.sender_id]?.avatar_url || null : null,
    })) as Notification[]
  } catch (err) {
    console.error('❌ [notificationService] fallback error:', err)
    return []
  }
}

/**
 * Đếm thông báo chưa đọc (tổng)
 */
export async function countUnread(employeeId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', employeeId)
      .eq('is_read', false)
      .eq('is_deleted', false)

    if (error) throw error
    return count || 0
  } catch (err) {
    console.error('❌ [notificationService] countUnread error:', err)
    return 0
  }
}

/**
 * Đếm thông báo chưa đọc theo module
 */
export async function countUnreadByModule(
  employeeId: string
): Promise<NotificationCount> {
  try {
    const { data, error } = await supabase.rpc('fn_count_unread_by_module', {
      p_employee_id: employeeId,
    })

    if (error) throw error

    const byModule: Record<string, number> = {}
    let total = 0
    
    for (const row of (data || [])) {
      byModule[row.module] = Number(row.unread_count)
      total += Number(row.unread_count)
    }

    return { total, byModule: byModule as Record<NotificationModule, number> }
  } catch (err) {
    console.error('❌ [notificationService] countUnreadByModule error:', err)
    // Fallback
    const total = await countUnread(employeeId)
    return { total, byModule: {} as Record<NotificationModule, number> }
  }
}

// ============================================================================
// NOTIFICATION ACTIONS
// ============================================================================

/**
 * Đánh dấu 1 thông báo đã đọc
 */
export async function markAsRead(notificationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId)

    if (error) throw error
    return true
  } catch (err) {
    console.error('❌ [notificationService] markAsRead error:', err)
    return false
  }
}

/**
 * Đánh dấu tất cả đã đọc
 */
export async function markAllAsRead(
  employeeId: string,
  module?: NotificationModule
): Promise<number> {
  try {
    let query = supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('recipient_id', employeeId)
      .eq('is_read', false)
      .eq('is_deleted', false)

    if (module) {
      query = query.eq('module', module)
    }

    const { data, error } = await query.select('id')

    if (error) throw error
    return data?.length || 0
  } catch (err) {
    console.error('❌ [notificationService] markAllAsRead error:', err)
    return 0
  }
}

/**
 * Xóa mềm 1 thông báo
 */
export async function deleteNotification(notificationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', notificationId)

    if (error) throw error
    return true
  } catch (err) {
    console.error('❌ [notificationService] deleteNotification error:', err)
    return false
  }
}

/**
 * Xóa tất cả thông báo đã đọc
 */
export async function deleteAllRead(employeeId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('recipient_id', employeeId)
      .eq('is_read', true)
      .eq('is_deleted', false)
      .select('id')

    if (error) throw error
    return data?.length || 0
  } catch (err) {
    console.error('❌ [notificationService] deleteAllRead error:', err)
    return 0
  }
}

// ============================================================================
// CREATE NOTIFICATION (từ frontend, khi triggers không cover)
// ============================================================================

/**
 * Tạo thông báo thủ công
 */
export async function createNotification(
  input: CreateNotificationInput
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('fn_create_notification', {
      p_recipient_id: input.recipient_id,
      p_sender_id: input.sender_id || null,
      p_module: input.module,
      p_notification_type: input.notification_type,
      p_title: input.title,
      p_message: input.message || null,
      p_reference_id: input.reference_id || null,
      p_reference_type: input.reference_type || null,
      p_reference_url: input.reference_url || null,
      p_metadata: input.metadata || {},
      p_priority: input.priority || 'normal',
    })

    if (error) {
      // Fallback: insert trực tiếp
      const { data: directData, error: directError } = await supabase
        .from('notifications')
        .insert({
          recipient_id: input.recipient_id,
          sender_id: input.sender_id || null,
          module: input.module,
          notification_type: input.notification_type,
          title: input.title,
          message: input.message || null,
          reference_id: input.reference_id || null,
          reference_type: input.reference_type || null,
          reference_url: input.reference_url || null,
          metadata: input.metadata || {},
          priority: input.priority || 'normal',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('id')
        .single()

      if (directError) throw directError
      return directData?.id || null
    }

    return data as string
  } catch (err) {
    console.error('❌ [notificationService] createNotification error:', err)
    return null
  }
}

// ============================================================================
// REALTIME SUBSCRIPTION
// ============================================================================

/**
 * Subscribe realtime notifications cho employee
 * Returns unsubscribe function
 */
export function subscribeToNotifications(
  employeeId: string,
  onNewNotification: (notification: Notification) => void
): () => void {
  const channel = supabase
    .channel(`notifications:${employeeId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `recipient_id=eq.${employeeId}`,
      },
      async (payload) => {
        console.log('🔔 [notificationService] New notification:', payload.new)
        
        // Lấy sender info
        const newNotif = payload.new as any
        let senderName = null
        let senderAvatar = null
        
        if (newNotif.sender_id) {
          const { data: sender } = await supabase
            .from('employees')
            .select('full_name, avatar_url')
            .eq('id', newNotif.sender_id)
            .single()
          
          senderName = sender?.full_name || null
          senderAvatar = sender?.avatar_url || null
        }

        onNewNotification({
          ...newNotif,
          sender_name: senderName,
          sender_avatar: senderAvatar,
        } as Notification)
      }
    )
    .subscribe()

  // Return unsubscribe function
  return () => {
    supabase.removeChannel(channel)
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Lấy icon cho notification type
 */
export function getNotificationIcon(type: NotificationType): string {
  const icons: Record<NotificationType, string> = {
    // Task
    task_assigned: '📋',
    task_status_changed: '🔄',
    task_due_reminder: '⏰',
    task_overdue: '⚠️',
    task_comment: '💬',
    task_approval_pending: '📝',
    task_approved: '✅',
    task_rejected: '❌',
    task_revision_requested: '📝',
    task_participant_added: '👥',
    task_subtask_completed: '✔️',
    task_progress_updated: '📊',
    // Leave
    leave_submitted: '📮',
    leave_approved: '✅',
    leave_rejected: '❌',
    // Overtime
    overtime_submitted: '⏱️',
    overtime_approved: '✅',
    overtime_rejected: '❌',
    // Attendance
    attendance_missing: '🚫',
    attendance_late: '⏰',
    attendance_early_leave: '🏃',
    // Shift
    shift_assigned: '📅',
    shift_changed: '🔄',
    shift_swap: '🔀',
    // Evaluation
    evaluation_submitted: '📊',
    evaluation_completed: '🏆',
    // System
    system_announcement: '📢',
    system_maintenance: '🔧',
  }
  return icons[type] || '🔔'
}

/**
 * Lấy màu cho module
 */
export function getModuleColor(module: NotificationModule): string {
  const colors: Record<NotificationModule, string> = {
    task: '#3B82F6',       // blue
    leave: '#10B981',      // green
    overtime: '#F59E0B',   // amber
    attendance: '#6366F1', // indigo
    shift: '#8B5CF6',      // violet
    evaluation: '#EC4899', // pink
    purchasing: '#14B8A6', // teal
    maintenance: '#F97316', // orange
    system: '#6B7280',     // gray
  }
  return colors[module] || '#6B7280'
}

/**
 * Lấy label tiếng Việt cho module
 */
export function getModuleLabel(module: NotificationModule): string {
  const labels: Record<NotificationModule, string> = {
    task: 'Công việc',
    leave: 'Nghỉ phép',
    overtime: 'Tăng ca',
    attendance: 'Chấm công',
    shift: 'Phân ca',
    evaluation: 'Đánh giá',
    purchasing: 'Mua hàng',
    maintenance: 'Bảo trì',
    system: 'Hệ thống',
  }
  return labels[module] || module
}

/**
 * Lấy label tiếng Việt cho priority
 */
export function getPriorityLabel(priority: NotificationPriority): string {
  const labels: Record<NotificationPriority, string> = {
    low: 'Thấp',
    normal: 'Bình thường',
    high: 'Cao',
    urgent: 'Khẩn cấp',
  }
  return labels[priority] || priority
}

/**
 * Format thời gian relative (vd: "5 phút trước")
 */
export function formatTimeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Vừa xong'
  if (diffMins < 60) return `${diffMins} phút trước`
  if (diffHours < 24) return `${diffHours} giờ trước`
  if (diffDays < 7) return `${diffDays} ngày trước`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`
  
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ============================================================================
// EXPORT
// ============================================================================

export const notificationService = {
  // Queries
  getNotifications,
  countUnread,
  countUnreadByModule,
  
  // Actions
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllRead,
  
  // Create
  createNotification,
  
  // Realtime
  subscribeToNotifications,
  
  // Helpers
  getNotificationIcon,
  getModuleColor,
  getModuleLabel,
  getPriorityLabel,
  formatTimeAgo,
}

export default notificationService