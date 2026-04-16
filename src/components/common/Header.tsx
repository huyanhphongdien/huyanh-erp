// src/components/common/Header.tsx
// NOTE: Component này hiện không được dùng trong MainLayout (chỉ render
// Sidebar + Outlet). Giữ lại cho future use hoặc các layout khác.
// FacilityPicker đã chuyển vào Sidebar (giữa user info và navigation).
import { useAuthStore } from '../../stores/authStore'
import { Button } from '../ui'
import { NotificationBell } from './NotificationBell'
import { TaskNotificationBell } from './TaskNotificationBell'

export function Header() {
  const { user, logout } = useAuthStore()

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-3">
        {/* Logo — compact on mobile */}
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xl sm:text-2xl">🏭</span>
          <span className="font-bold text-base sm:text-xl text-primary">Huy Anh ERP</span>
        </div>

        {/* User info & Actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Task Notification Bell */}
          <TaskNotificationBell />

          {/* Notification Bell */}
          <NotificationBell />

          {/* User Info — hidden on mobile, compact on tablet */}
          <div className="hidden sm:block text-right">
            <p className="font-medium text-gray-800 text-sm lg:text-base truncate max-w-[120px] lg:max-w-none">
              {user?.full_name || 'Người dùng'}
            </p>
            <p className="text-xs lg:text-sm text-gray-500 hidden lg:block">{user?.email}</p>
          </div>

          {/* Logout Button — icon only on mobile */}
          <Button variant="outline" size="sm" onClick={logout} className="min-h-touch min-w-touch sm:min-w-0 flex items-center justify-center">
            <span className="hidden sm:inline">Đăng xuất</span>
            <span className="sm:hidden text-lg">↪</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
