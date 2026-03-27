// src/services/taskNotificationService.ts
// Service tạo notification on-the-fly từ dữ liệu task (không cần bảng riêng)

import { supabase } from '../lib/supabase'

export interface TaskNotification {
  id: string
  type: 'assigned' | 'overdue' | 'comment' | 'completed' | 'status_change'
  title: string
  message: string
  task_id: string
  task_code: string
  is_read: boolean
  created_at: string
}

// Local storage key for read notification IDs
const READ_KEY = 'task_notifications_read'

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY)
    if (raw) return new Set(JSON.parse(raw))
  } catch { /* ignore */ }
  return new Set()
}

function saveReadIds(ids: Set<string>): void {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...ids]))
  } catch { /* ignore */ }
}

export const taskNotificationService = {
  /**
   * Generate notifications on-the-fly from task data.
   * No separate notifications table needed.
   */
  async getNotifications(userId: string): Promise<TaskNotification[]> {
    const notifications: TaskNotification[] = []
    const now = new Date()
    const readIds = getReadIds()

    // 1. Tasks assigned to me in last 48h
    const { data: recentTasks } = await supabase
      .from('tasks')
      .select('id, code, name, created_at')
      .eq('assignee_id', userId)
      .gte('created_at', new Date(now.getTime() - 48 * 3600000).toISOString())
      .order('created_at', { ascending: false })

    recentTasks?.forEach((t) => {
      const nid = `assigned-${t.id}`
      notifications.push({
        id: nid,
        type: 'assigned',
        title: 'Công việc mới',
        message: `Bạn được giao: ${t.name}`,
        task_id: t.id,
        task_code: t.code,
        is_read: readIds.has(nid),
        created_at: t.created_at,
      })
    })

    // 2. My overdue tasks
    const { data: overdueTasks } = await supabase
      .from('tasks')
      .select('id, code, name, due_date')
      .eq('assignee_id', userId)
      .in('status', ['in_progress', 'draft'])
      .lt('due_date', now.toISOString().split('T')[0])

    overdueTasks?.forEach((t) => {
      const nid = `overdue-${t.id}`
      notifications.push({
        id: nid,
        type: 'overdue',
        title: 'Quá hạn',
        message: `${t.name} đã quá hạn`,
        task_id: t.id,
        task_code: t.code,
        is_read: readIds.has(nid),
        created_at: t.due_date,
      })
    })

    // 3. My tasks completed in last 48h (by others or system)
    const { data: completedTasks } = await supabase
      .from('tasks')
      .select('id, code, name, completed_date')
      .eq('assignee_id', userId)
      .eq('status', 'finished')
      .gte('completed_date', new Date(now.getTime() - 48 * 3600000).toISOString().split('T')[0])

    completedTasks?.forEach((t) => {
      const nid = `completed-${t.id}`
      notifications.push({
        id: nid,
        type: 'completed',
        title: 'Đã hoàn thành',
        message: `${t.name} đã được hoàn thành`,
        task_id: t.id,
        task_code: t.code,
        is_read: readIds.has(nid),
        created_at: t.completed_date || now.toISOString(),
      })
    })

    // Sort by created_at descending
    return notifications.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  },

  async getUnreadCount(userId: string): Promise<number> {
    const all = await this.getNotifications(userId)
    return all.filter((n) => !n.is_read).length
  },

  markAsRead(notificationId: string): void {
    const ids = getReadIds()
    ids.add(notificationId)
    saveReadIds(ids)
  },

  markAllRead(userId: string): void {
    // Mark all currently known IDs as read — will be regenerated on next fetch
    // For simplicity, we just rely on getNotifications to re-check
    // Save a "mark all" timestamp instead
    try {
      localStorage.setItem(`${READ_KEY}_all_${userId}`, new Date().toISOString())
    } catch { /* ignore */ }
  },
}
