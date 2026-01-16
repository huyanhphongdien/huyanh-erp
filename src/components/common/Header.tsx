import { useAuthStore } from '../../stores/authStore'
import { Button } from '../ui'

export function Header() {
  const { user, logout } = useAuthStore()

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏭</span>
          <span className="font-bold text-xl text-primary">Huy Anh ERP</span>
        </div>

        {/* User info */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-medium text-gray-800">
              {user?.full_name || 'Người dùng'}
            </p>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>
          <Button variant="outline" size="sm" onClick={logout}>
            Đăng xuất
          </Button>
        </div>
      </div>
    </header>
  )
}