import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

interface MenuItem {
  path: string
  label: string
  icon: string
}

interface MenuGroup {
  title: string
  items: MenuItem[]
}

const menuGroups: MenuGroup[] = [
  {
    title: 'TỔNG QUAN',
    items: [
      { path: '/', label: 'Dashboard', icon: '🏠' },
    ]
  },
  {
    title: 'TỔ CHỨC',
    items: [
      { path: '/departments', label: 'Phòng ban', icon: '🏢' },
      { path: '/positions', label: 'Chức vụ', icon: '💼' },
      { path: '/employees', label: 'Nhân viên', icon: '👥' },
    ]
  },
  {
    title: 'HỢP ĐỒNG',
    items: [
      { path: '/contract-types', label: 'Loại hợp đồng', icon: '📑' },
      { path: '/contracts', label: 'Hợp đồng', icon: '📝' },
    ]
  },
  {
    title: 'NGHỈ PHÉP & CHẤM CÔNG',
    items: [
      { path: '/leave-types', label: 'Loại nghỉ phép', icon: '🏷️' },
      { path: '/leave-requests', label: 'Đơn nghỉ phép', icon: '📋' },
      { path: '/attendance', label: 'Chấm công', icon: '⏰' },
    ]
  },
  {
    title: 'LƯƠNG',
    items: [
      { path: '/salary-grades', label: 'Bậc lương', icon: '💰' },
      { path: '/payroll-periods', label: 'Kỳ lương', icon: '📅' },
      { path: '/payslips', label: 'Phiếu lương', icon: '📄' },
    ]
  },
  {
    title: 'ĐÁNH GIÁ',
    items: [
      { path: '/performance-criteria', label: 'Tiêu chí đánh giá', icon: '📊' },
      { path: '/performance-reviews', label: 'Đánh giá hiệu suất', icon: '⭐' },
    ]
  },
]

export function Sidebar() {
  const { user, logout } = useAuthStore()

  return (
    <aside className="w-64 bg-gray-800 text-white min-h-screen flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold text-center">HUY ANH ERP</h1>
        <p className="text-xs text-gray-400 text-center mt-1">Hệ thống quản lý nhân sự</p>
      </div>

      {/* User Info */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
            {user?.full_name?.charAt(0) || user?.email?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.full_name || 'Người dùng'}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {menuGroups.map((group) => (
          <div key={group.title} className="mb-4">
            <h3 className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              {group.title}
            </h3>
            <ul>
              {group.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      }`
                    }
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors"
        >
          <span>🚪</span>
          <span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  )
}