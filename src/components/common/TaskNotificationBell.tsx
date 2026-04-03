// src/components/common/TaskNotificationBell.tsx
// Bell icon with dropdown showing task notifications (on-the-fly generated)

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import {
  taskNotificationService,
  type TaskNotification,
} from '../../services/taskNotificationService'

// ============================================================
// ICON MAP
// ============================================================

const NOTIFICATION_ICONS: Record<TaskNotification['type'], string> = {
  assigned: '\uD83D\uDCCB',    // clipboard
  overdue: '\u26A0\uFE0F',     // warning
  comment: '\uD83D\uDCAC',     // speech bubble
  completed: '\u2705',          // check mark
  status_change: '\uD83D\uDD04', // arrows
}

const NOTIFICATION_COLORS: Record<TaskNotification['type'], string> = {
  assigned: 'bg-blue-50 border-blue-200',
  overdue: 'bg-red-50 border-red-200',
  comment: 'bg-purple-50 border-purple-200',
  completed: 'bg-green-50 border-green-200',
  status_change: 'bg-gray-50 border-gray-200',
}

function timeAgo(dateString: string): string {
  try {
    const d = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'Vừa xong'
    if (diffMin < 60) return `${diffMin} phút trước`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr} giờ trước`
    const diffDay = Math.floor(diffHr / 24)
    if (diffDay === 1) return 'Hôm qua'
    return `${diffDay} ngày trước`
  } catch {
    return ''
  }
}

// ============================================================
// COMPONENT
// ============================================================

export function TaskNotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<TaskNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const employeeId = user?.employee_id

  const fetchNotifications = useCallback(async () => {
    if (!employeeId) return
    setLoading(true)
    try {
      const data = await taskNotificationService.getNotifications(employeeId)
      const limited = data.slice(0, 20)
      setNotifications(limited)
      setUnreadCount(limited.filter((n) => !n.is_read).length)
    } catch (err) {
      console.error('Failed to fetch task notifications:', err)
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  // Initial load + periodic refresh
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60000) // every 60s
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Refetch when dropdown opens
  useEffect(() => {
    if (isOpen) fetchNotifications()
  }, [isOpen, fetchNotifications])

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleItemClick = (notification: TaskNotification) => {
    taskNotificationService.markAsRead(notification.id)
    setIsOpen(false)
    navigate(`/tasks/${notification.task_id}`)
  }

  const handleMarkAllRead = () => {
    if (!employeeId) return
    notifications.forEach((n) => taskNotificationService.markAsRead(n.id))
    taskNotificationService.markAllRead(employeeId)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  if (!employeeId) return null

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
        title="Thông báo công việc"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="fixed left-2 right-2 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-auto mt-2 sm:w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[70vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
            <h3 className="font-semibold text-gray-900 text-sm">Thông báo công việc</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
                <p className="text-sm">Không có thông báo</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleItemClick(notification)}
                  className={`px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                    !notification.is_read ? NOTIFICATION_COLORS[notification.type] : ''
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-lg flex-shrink-0 mt-0.5">
                      {NOTIFICATION_ICONS[notification.type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!notification.is_read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-mono text-gray-400">
                          {notification.task_code}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {timeAgo(notification.created_at)}
                        </span>
                      </div>
                    </div>
                    {!notification.is_read && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default TaskNotificationBell
