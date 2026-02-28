// ============================================================================
// NOTIFICATION PAGE - FULL PAGE VIEW
// File: src/pages/NotificationPage.tsx
// Huy Anh ERP System
// ============================================================================
// Trang xem tất cả thông báo với filter, search, actions
// Mobile-first optimized
// ============================================================================

import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import {
  Bell, Check, CheckCheck, Trash2, Filter, Search, X,
  RefreshCw, Inbox
} from 'lucide-react'
import {
  notificationService,
  type Notification,
  type NotificationModule,
  type NotificationCount,
} from '../services/notificationService'

// ============================================================================
// CONSTANTS
// ============================================================================

const MODULE_TABS: { key: NotificationModule | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: 'Tất cả', icon: '📬' },
  { key: 'task', label: 'Công việc', icon: '📋' },
  { key: 'leave', label: 'Nghỉ phép', icon: '🏖️' },
  { key: 'overtime', label: 'Tăng ca', icon: '⏱️' },
  { key: 'evaluation', label: 'Đánh giá', icon: '📊' },
  { key: 'attendance', label: 'Chấm công', icon: '✅' },
  { key: 'shift', label: 'Phân ca', icon: '📅' },
  { key: 'system', label: 'Hệ thống', icon: '⚙️' },
]

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function NotificationPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const employeeId = user?.employee_id || ''

  // State
  const [activeModule, setActiveModule] = useState<NotificationModule | 'all'>('all')
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  // Query: Đếm theo module
  const { data: countByModule } = useQuery<NotificationCount>({
    queryKey: ['notification-count-by-module', employeeId],
    queryFn: () => notificationService.countUnreadByModule(employeeId),
    enabled: !!employeeId,
  })

  // Query: Lấy thông báo
  const { data: allNotifications = [], isLoading, refetch } = useQuery({
    queryKey: ['notifications-page', employeeId, activeModule, showUnreadOnly],
    queryFn: () => notificationService.getNotifications(employeeId, {
      module: activeModule === 'all' ? undefined : activeModule,
      is_read: showUnreadOnly ? false : undefined,
      limit: 100,
    }),
    enabled: !!employeeId,
  })

  // Filter theo search text
  const filteredNotifications = useMemo(() => {
    if (!searchText.trim()) return allNotifications
    const lower = searchText.toLowerCase()
    return allNotifications.filter(n =>
      n.title.toLowerCase().includes(lower) ||
      (n.message && n.message.toLowerCase().includes(lower)) ||
      (n.sender_name && n.sender_name.toLowerCase().includes(lower))
    )
  }, [allNotifications, searchText])

  // Group by date
  const groupedNotifications = useMemo(() => {
    const groups: { label: string; items: Notification[] }[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const todayItems: Notification[] = []
    const yesterdayItems: Notification[] = []
    const olderGroups: Record<string, Notification[]> = {}

    for (const n of filteredNotifications) {
      const date = new Date(n.created_at)
      date.setHours(0, 0, 0, 0)

      if (date.getTime() === today.getTime()) {
        todayItems.push(n)
      } else if (date.getTime() === yesterday.getTime()) {
        yesterdayItems.push(n)
      } else {
        const key = date.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
        if (!olderGroups[key]) olderGroups[key] = []
        olderGroups[key].push(n)
      }
    }

    if (todayItems.length > 0) groups.push({ label: 'Hôm nay', items: todayItems })
    if (yesterdayItems.length > 0) groups.push({ label: 'Hôm qua', items: yesterdayItems })
    for (const [label, items] of Object.entries(olderGroups)) {
      groups.push({ label, items })
    }

    return groups
  }, [filteredNotifications])

  // Mutations
  const markReadMutation = useMutation({
    mutationFn: notificationService.markAsRead,
    onSuccess: () => invalidateAll(),
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationService.markAllAsRead(
      employeeId,
      activeModule === 'all' ? undefined : activeModule
    ),
    onSuccess: () => invalidateAll(),
  })

  const deleteMutation = useMutation({
    mutationFn: notificationService.deleteNotification,
    onSuccess: () => invalidateAll(),
  })

  const deleteAllReadMutation = useMutation({
    mutationFn: () => notificationService.deleteAllRead(employeeId),
    onSuccess: () => invalidateAll(),
  })

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
    queryClient.invalidateQueries({ queryKey: ['notification-count'] })
  }

  const handleNotificationClick = useCallback((notification: Notification) => {
    if (!notification.is_read) {
      markReadMutation.mutate(notification.id)
    }
    if (notification.reference_url) {
      navigate(notification.reference_url)
    }
  }, [markReadMutation, navigate])

  const unreadCount = countByModule?.total || 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" />
            <h1 className="text-lg font-bold text-gray-900">Thông báo</h1>
            {unreadCount > 0 && (
              <span className="bg-red-100 text-red-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                {unreadCount} chưa đọc
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Search toggle */}
            <button
              onClick={() => setShowSearch(!showSearch)}
              className={`p-2.5 rounded-lg transition-colors ${showSearch ? 'bg-blue-50 text-blue-600' : 'text-gray-500 active:bg-gray-100'}`}
              style={{ minWidth: 44, minHeight: 44 }}
            >
              <Search className="w-5 h-5" />
            </button>

            {/* Unread filter */}
            <button
              onClick={() => setShowUnreadOnly(!showUnreadOnly)}
              className={`p-2.5 rounded-lg transition-colors ${showUnreadOnly ? 'bg-blue-50 text-blue-600' : 'text-gray-500 active:bg-gray-100'}`}
              style={{ minWidth: 44, minHeight: 44 }}
              title={showUnreadOnly ? 'Hiện tất cả' : 'Chỉ chưa đọc'}
            >
              <Filter className="w-5 h-5" />
            </button>

            {/* Refresh */}
            <button
              onClick={() => refetch()}
              className="p-2.5 text-gray-500 active:bg-gray-100 rounded-lg"
              style={{ minWidth: 44, minHeight: 44 }}
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Tìm kiếm thông báo..."
                className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-xl text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              {searchText && (
                <button
                  onClick={() => setSearchText('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Module tabs */}
        <div className="flex items-center gap-1.5 px-4 pb-2 overflow-x-auto no-scrollbar">
          {MODULE_TABS.map(tab => {
            const count = tab.key === 'all'
              ? (countByModule?.total || 0)
              : (countByModule?.byModule?.[tab.key] || 0)
            const isActive = activeModule === tab.key
            
            return (
              <button
                key={tab.key}
                onClick={() => setActiveModule(tab.key)}
                className={`
                  flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-all
                  ${isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                    : 'bg-white text-gray-600 border border-gray-200 active:bg-gray-50'
                  }
                `}
                style={{ minHeight: 36 }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {count > 0 && (
                  <span className={`
                    min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold rounded-full px-1
                    ${isActive ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'}
                  `}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Action bar */}
      {filteredNotifications.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
          <span className="text-xs text-gray-500">
            {filteredNotifications.length} thông báo
            {showUnreadOnly ? ' (chưa đọc)' : ''}
          </span>
          <div className="flex items-center gap-2">
            {filteredNotifications.some(n => !n.is_read) && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg active:bg-blue-100 disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Đọc hết
              </button>
            )}
            <button
              onClick={() => {
                if (confirm('Xóa tất cả thông báo đã đọc?')) {
                  deleteAllReadMutation.mutate()
                }
              }}
              disabled={deleteAllReadMutation.isPending}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg active:bg-red-100 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Dọn đã đọc
            </button>
          </div>
        </div>
      )}

      {/* Notification List */}
      <div className="pb-safe">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400 mt-3">Đang tải...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Inbox className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-base font-medium mb-1">
              {showUnreadOnly ? 'Không có thông báo chưa đọc' : 'Chưa có thông báo'}
            </p>
            <p className="text-sm">
              {showUnreadOnly 
                ? 'Tất cả thông báo đã được đọc' 
                : 'Thông báo sẽ hiển thị khi có hoạt động mới'
              }
            </p>
          </div>
        ) : (
          groupedNotifications.map(group => (
            <div key={group.label}>
              {/* Date header */}
              <div className="sticky top-[120px] z-10 bg-gray-50 px-4 py-2 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {group.label}
                </span>
              </div>

              {/* Items */}
              <div className="bg-white divide-y divide-gray-50">
                {group.items.map(notification => (
                  <NotificationRow
                    key={notification.id}
                    notification={notification}
                    onClick={() => handleNotificationClick(notification)}
                    onMarkRead={() => markReadMutation.mutate(notification.id)}
                    onDelete={() => deleteMutation.mutate(notification.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ============================================================================
// NOTIFICATION ROW
// ============================================================================

interface NotificationRowProps {
  notification: Notification
  onClick: () => void
  onMarkRead: () => void
  onDelete: () => void
}

function NotificationRow({ notification, onClick, onMarkRead, onDelete }: NotificationRowProps) {
  const icon = notificationService.getNotificationIcon(notification.notification_type)
  const moduleColor = notificationService.getModuleColor(notification.module)
  const moduleLabel = notificationService.getModuleLabel(notification.module)
  const timeAgo = notificationService.formatTimeAgo(notification.created_at)

  return (
    <div
      className={`
        flex items-start gap-3 px-4 py-3.5 transition-colors cursor-pointer
        ${notification.is_read ? 'bg-white' : 'bg-blue-50/40 border-l-3 border-l-blue-500'}
        active:bg-gray-50 lg:hover:bg-gray-50
      `}
      onClick={onClick}
      style={{ minHeight: 72 }}
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl shadow-sm"
        style={{ backgroundColor: `${moduleColor}12`, border: `1px solid ${moduleColor}25` }}
      >
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Top: module badge + priority + time */}
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ color: moduleColor, backgroundColor: `${moduleColor}12` }}
          >
            {moduleLabel}
          </span>
          
          {notification.priority === 'urgent' && (
            <span className="text-[10px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded animate-pulse">
              KHẨN
            </span>
          )}
          {notification.priority === 'high' && (
            <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded">
              QUAN TRỌNG
            </span>
          )}

          <span className="text-[11px] text-gray-400 ml-auto flex-shrink-0">
            {timeAgo}
          </span>
        </div>

        {/* Title */}
        <p className={`text-sm leading-snug ${notification.is_read ? 'text-gray-700' : 'text-gray-900 font-semibold'}`}>
          {notification.title}
        </p>

        {/* Message */}
        {notification.message && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
            {notification.message}
          </p>
        )}

        {/* Footer */}
        {notification.sender_name && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500">
              {notification.sender_name.charAt(0)}
            </div>
            <span className="text-[11px] text-gray-400">{notification.sender_name}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex-shrink-0 flex flex-col items-center gap-1">
        {!notification.is_read && (
          <button
            onClick={(e) => { e.stopPropagation(); onMarkRead() }}
            className="p-1.5 text-blue-400 active:text-blue-600 rounded"
            title="Đánh dấu đã đọc"
          >
            <Check className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="p-1.5 text-gray-300 active:text-red-500 rounded"
          title="Xóa"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}