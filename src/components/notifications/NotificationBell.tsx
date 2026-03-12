// ============================================================================
// NOTIFICATION BELL - UNIFIED
// File: src/components/notifications/NotificationBell.tsx
// Huy Anh ERP System
// ============================================================================
// Component chuông thông báo tích hợp vào Header/Sidebar
// Mobile-first: 44px+ touch targets, bottom-sheet on mobile
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { Bell, CheckCheck, X, ChevronRight } from 'lucide-react'
import {
  notificationService,
  type Notification,
  type NotificationModule,
  type NotificationCount,
} from '../../services/notificationService'

// ============================================================================
// NOTIFICATION BELL (Entry point)
// ============================================================================

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const employeeId = user?.employee_id

  // Query: Đếm số chưa đọc
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['notification-count', employeeId],
    queryFn: () => notificationService.countUnread(employeeId!),
    enabled: !!employeeId,
    refetchInterval: 30000,
    staleTime: 15000,
  })

  // Realtime subscription
  useEffect(() => {
    if (!employeeId) return

    const unsubscribe = notificationService.subscribeToNotifications(
      employeeId,
      (_newNotification) => {
        queryClient.invalidateQueries({ queryKey: ['notification-count'] })
        queryClient.invalidateQueries({ queryKey: ['notifications'] })
      }
    )

    return unsubscribe
  }, [employeeId, queryClient])

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 text-gray-600 active:bg-gray-100 rounded-full transition-colors lg:hover:bg-gray-100 lg:hover:text-gray-900"
        aria-label="Thông báo"
        style={{ minWidth: 44, minHeight: 44 }}
      >
        <Bell className="w-5 h-5" />
        
        {/* Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[20px] h-5 px-1 text-[11px] font-bold text-white bg-red-500 rounded-full animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && employeeId && (
        <>
          {/* Mobile: Overlay */}
          <div 
            className="fixed inset-0 bg-black/30 z-40 lg:hidden"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Panel */}
          <NotificationPanel
            employeeId={employeeId}
            onClose={() => setIsOpen(false)}
          />
        </>
      )}
    </div>
  )
}

// ============================================================================
// NOTIFICATION PANEL (Dropdown content)
// ============================================================================

interface NotificationPanelProps {
  employeeId: string
  onClose: () => void
}

function NotificationPanel({ employeeId, onClose }: NotificationPanelProps) {
  const [activeModule, setActiveModule] = useState<NotificationModule | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Query: Lấy danh sách thông báo
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', employeeId, activeModule],
    queryFn: () => notificationService.getNotifications(employeeId, {
      module: activeModule || undefined,
      limit: 30,
    }),
    enabled: !!employeeId,
  })

  // Query: Đếm theo module
  const { data: countByModule } = useQuery<NotificationCount>({
    queryKey: ['notification-count-by-module', employeeId],
    queryFn: () => notificationService.countUnreadByModule(employeeId),
    enabled: !!employeeId,
    staleTime: 30000,
  })

  // Mutation: Đánh dấu đã đọc
  const markReadMutation = useMutation({
    mutationFn: notificationService.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notification-count'] })
    },
  })

  // Mutation: Đánh dấu tất cả đã đọc
  const markAllReadMutation = useMutation({
    mutationFn: () => notificationService.markAllAsRead(employeeId, activeModule || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notification-count'] })
    },
  })

  // Mutation: Xóa
  const deleteMutation = useMutation({
    mutationFn: notificationService.deleteNotification,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['notification-count'] })
    },
  })

  const handleClick = useCallback((notification: Notification) => {
    if (!notification.is_read) {
      markReadMutation.mutate(notification.id)
    }
    if (notification.reference_url) {
      navigate(notification.reference_url)
      onClose()
    }
  }, [markReadMutation, navigate, onClose])

  // Module tabs with unread counts
  const moduleTabs: { key: NotificationModule | null; label: string }[] = [
    { key: null, label: 'Tất cả' },
    { key: 'task', label: 'Công việc' },
    { key: 'leave', label: 'Nghỉ phép' },
    { key: 'overtime', label: 'Tăng ca' },
    { key: 'evaluation', label: 'Đánh giá' },
    { key: 'attendance', label: 'Chấm công' },
    { key: 'shift', label: 'Phân ca' },
    { key: 'system', label: 'Hệ thống' },
  ]

  const unreadNotifs = notifications.filter(n => !n.is_read)

  return (
    <div className={`
      fixed bottom-0 left-0 right-0 z-50
      max-h-[85vh] bg-white rounded-t-2xl shadow-2xl
      flex flex-col
      lg:absolute lg:bottom-auto lg:left-auto lg:right-0 lg:top-full lg:mt-2
      lg:w-[420px] lg:max-h-[600px] lg:rounded-xl
      animate-slide-up lg:animate-fade-in
    `}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900 text-base">Thông báo</h3>
          {unreadNotifs.length > 0 && (
            <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
              {unreadNotifs.length} mới
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          {unreadNotifs.length > 0 && (
            <button
              onClick={() => markAllReadMutation.mutate()}
              className="p-2 text-blue-600 active:bg-blue-50 rounded-lg text-xs font-medium flex items-center gap-1"
              style={{ minHeight: 44 }}
              title="Đánh dấu tất cả đã đọc"
            >
              <CheckCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Đọc hết</span>
            </button>
          )}
          
          <button
            onClick={() => {
              navigate('/notifications')
              onClose()
            }}
            className="p-2 text-gray-500 active:bg-gray-50 rounded-lg text-xs font-medium flex items-center gap-1"
            style={{ minHeight: 44 }}
          >
            <span className="hidden sm:inline">Xem tất cả</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Close button (mobile) */}
          <button
            onClick={onClose}
            className="p-2 text-gray-400 active:bg-gray-100 rounded-lg lg:hidden"
            style={{ minHeight: 44 }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Module Filter Tabs */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-50 overflow-x-auto no-scrollbar">
        {moduleTabs.map(tab => {
          const count = tab.key ? (countByModule?.byModule?.[tab.key] || 0) : (countByModule?.total || 0)
          return (
            <button
              key={tab.key || 'all'}
              onClick={() => setActiveModule(tab.key)}
              className={`
                flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${activeModule === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }
              `}
              style={{ minHeight: 32 }}
            >
              {tab.label}
              {count > 0 && (
                <span className={`ml-1 ${activeModule === tab.key ? 'text-blue-100' : 'text-gray-400'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Bell className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-sm">Không có thông báo</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {notifications.map(notification => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={() => handleClick(notification)}
                onDelete={() => deleteMutation.mutate(notification.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom safe area (mobile) */}
      <div className="h-safe-area-bottom lg:hidden" />
    </div>
  )
}

// ============================================================================
// NOTIFICATION ITEM
// ============================================================================

interface NotificationItemProps {
  notification: Notification
  onClick: () => void
  onDelete: () => void
}

function NotificationItem({ notification, onClick, onDelete }: NotificationItemProps) {
  const icon = notificationService.getNotificationIcon(notification.notification_type)
  const moduleColor = notificationService.getModuleColor(notification.module)
  const moduleLabel = notificationService.getModuleLabel(notification.module)
  const timeAgo = notificationService.formatTimeAgo(notification.created_at)

  return (
    <div
      className={`
        relative flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer group
        ${notification.is_read 
          ? 'bg-white' 
          : 'bg-blue-50/50'
        }
        active:bg-gray-50 lg:hover:bg-gray-50
      `}
      onClick={onClick}
      style={{ minHeight: 64 }}
    >
      {/* Unread dot */}
      {!notification.is_read && (
        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 bg-blue-500 rounded-full" />
      )}

      {/* Icon */}
      <div 
        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg"
        style={{ backgroundColor: `${moduleColor}15` }}
      >
        {icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Module badge + priority */}
        <div className="flex items-center gap-2 mb-0.5">
          <span 
            className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{ color: moduleColor, backgroundColor: `${moduleColor}15` }}
          >
            {moduleLabel}
          </span>
          
          {notification.priority === 'urgent' && (
            <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
              KHẨN
            </span>
          )}
          {notification.priority === 'high' && (
            <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
              QUAN TRỌNG
            </span>
          )}
        </div>

        {/* Title */}
        <p className={`text-sm leading-snug ${notification.is_read ? 'text-gray-700' : 'text-gray-900 font-medium'}`}>
          {notification.title}
        </p>

        {/* Message */}
        {notification.message && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
            {notification.message}
          </p>
        )}

        {/* Footer: sender + time */}
        <div className="flex items-center gap-2 mt-1">
          {notification.sender_name && (
            <span className="text-[11px] text-gray-400">
              {notification.sender_name}
            </span>
          )}
          <span className="text-[11px] text-gray-400">
            {timeAgo}
          </span>
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="flex-shrink-0 p-2 text-gray-300 active:text-red-500 rounded-lg lg:opacity-0 lg:group-hover:opacity-100"
        style={{ minWidth: 36, minHeight: 36 }}
        aria-label="Xóa thông báo"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ============================================================================
// CSS (add to global styles)
// ============================================================================
// @keyframes slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
// @keyframes fade-in { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
// .animate-slide-up { animation: slide-up 0.3s ease-out; }
// .animate-fade-in { animation: fade-in 0.2s ease-out; }
// .no-scrollbar::-webkit-scrollbar { display: none; }
// .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
// .h-safe-area-bottom { height: env(safe-area-inset-bottom, 0px); }

export default NotificationBell