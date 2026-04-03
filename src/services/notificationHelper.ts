// ============================================================================
// NOTIFICATION HELPER — Tạo thông báo đơn giản
// File: src/services/notificationHelper.ts
// ============================================================================
// Dùng bảng notifications hiện có:
//   id, user_id, user_type, partner_id, employee_id,
//   title, content, type, is_read, link, metadata, created_at
// ============================================================================

import { supabase } from '../lib/supabase'

export type NotifyModule = 'task' | 'leave' | 'overtime' | 'evaluation' | 'attendance' | 'shift' | 'system'

export interface NotifyParams {
  recipientId: string       // employee_id người nhận
  senderId?: string         // employee_id người gửi
  module: NotifyModule
  type?: string             // task_assigned, leave_approved, etc.
  title: string
  message?: string
  referenceUrl?: string     // "/tasks/xxx"
  priority?: 'low' | 'normal' | 'high'
}

/**
 * Tạo thông báo cho 1 người
 */
export async function notify(params: NotifyParams): Promise<void> {
  try {
    await supabase.from('notifications').insert({
      employee_id: params.recipientId,
      title: params.title,
      content: params.message || null,
      type: params.module,
      is_read: false,
      link: params.referenceUrl || null,
      metadata: {
        notification_type: params.type || params.module,
        sender_id: params.senderId || null,
        priority: params.priority || 'normal',
      },
    })
  } catch (e) {
    console.error('[notify] error:', e)
  }
}

/**
 * Tạo thông báo cho nhiều người
 */
export async function notifyMany(recipientIds: string[], params: Omit<NotifyParams, 'recipientId'>): Promise<void> {
  try {
    const rows = recipientIds.map(id => ({
      employee_id: id,
      title: params.title,
      content: params.message || null,
      type: params.module,
      is_read: false,
      link: params.referenceUrl || null,
      metadata: {
        notification_type: params.type || params.module,
        sender_id: params.senderId || null,
        priority: params.priority || 'normal',
      },
    }))
    if (rows.length > 0) {
      await supabase.from('notifications').insert(rows)
    }
  } catch (e) {
    console.error('[notifyMany] error:', e)
  }
}

/**
 * Thông báo cho TP/PP của phòng ban
 */
export async function notifyDeptManagers(departmentId: string, params: Omit<NotifyParams, 'recipientId'>): Promise<void> {
  try {
    const { data: managers } = await supabase
      .from('employees')
      .select('id')
      .eq('department_id', departmentId)
      .eq('status', 'active')
      .in('position_id', await getManagerPositionIds())

    if (managers && managers.length > 0) {
      await notifyMany(managers.map(m => m.id), params)
    }
  } catch (e) {
    console.error('[notifyDeptManagers] error:', e)
  }
}

// Cache position IDs cho TP/PP
let _managerPosIds: string[] | null = null
async function getManagerPositionIds(): Promise<string[]> {
  if (_managerPosIds) return _managerPosIds
  const { data } = await supabase
    .from('positions')
    .select('id')
    .lte('level', 5) // level 1-5: BGĐ, TP, PP
  _managerPosIds = (data || []).map(p => p.id)
  return _managerPosIds
}

/**
 * Đếm thông báo chưa đọc
 */
export async function countUnread(employeeId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employeeId)
    .eq('is_read', false)
  if (error) return 0
  return count || 0
}

/**
 * Lấy danh sách thông báo
 */
export async function getNotifications(employeeId: string, limit = 50): Promise<any[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return data || []
}

/**
 * Đánh dấu đã đọc
 */
export async function markRead(notificationId: string): Promise<void> {
  await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId)
}

export async function markAllRead(employeeId: string): Promise<void> {
  await supabase.from('notifications').update({ is_read: true }).eq('employee_id', employeeId).eq('is_read', false)
}

export async function deleteNotification(notificationId: string): Promise<void> {
  await supabase.from('notifications').delete().eq('id', notificationId)
}
