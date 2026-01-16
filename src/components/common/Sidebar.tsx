import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/utils'

const menuItems = [
  { path: '/dashboard', label: 'Tổng quan', icon: '📊' },
  { path: '/employees', label: 'Nhân viên', icon: '👥' },
  { path: '/departments', label: 'Phòng ban', icon: '🏢' },
  { path: '/tasks', label: 'Công việc', icon: '📋' },
  { path: '/attendance', label: 'Chấm công', icon: '⏰' },
]

export function Sidebar() {
  return (
    <aside className="w-64 bg-secondary min-h-screen">
      <nav className="p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg',
                    'transition-colors duration-200',
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-gray-300 hover:bg-primary/20'
                  )
                }
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}