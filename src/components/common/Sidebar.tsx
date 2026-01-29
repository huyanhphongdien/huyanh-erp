// ============================================================
// SIDEBAR COMPONENT - REFACTORED v3
// File: src/components/common/Sidebar.tsx
// ============================================================
// CHANGES:
// - Cho phép nhân viên xem "Danh sách công việc" (bỏ managerOnly)
// - Gộp "Tạo công việc" vào "Danh sách công việc" (nút + ở trong trang)
// - Gộp "Tự đánh giá" vào "Công việc của tôi" (tabs)
// - Mobile responsive với hamburger menu
// - THÊM MỚI: Menu BÁO CÁO cho Phó phòng trở lên (level <= 5)
// ============================================================

import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { 
  Menu, X, ChevronDown, ChevronRight,
  LayoutDashboard, Building2, Briefcase, Users,
  FileText, ScrollText, Palmtree, CalendarClock, Clock,
  Wallet, Calendar, Receipt,
  Target, Star,
  ClipboardList, UserCheck, CheckSquare,
  LogOut,
  BarChart3,     // Icon cho group Báo cáo
  FileBarChart,  // Icon cho Báo cáo công việc
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface MenuItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  managerOnly?: boolean;    // Chỉ hiển thị cho Manager (is_manager = true)
  executiveOnly?: boolean;  // Chỉ hiển thị cho Phó phòng trở lên (level <= 5)
  badge?: number;
}

interface MenuGroup {
  title: string;
  icon: React.ReactNode;
  items: MenuItem[];
  collapsible?: boolean;
  executiveOnly?: boolean;  // Toàn bộ group chỉ cho Phó phòng trở lên
}

// ============================================================
// MENU CONFIGURATION
// ============================================================

const getMenuGroups = (pendingApprovals: number = 0): MenuGroup[] => [
  {
    title: 'TỔNG QUAN',
    icon: <LayoutDashboard size={18} />,
    items: [
      { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    ],
  },
  {
    title: 'TỔ CHỨC',
    icon: <Building2 size={18} />,
    collapsible: true,
    items: [
      { path: '/departments', label: 'Phòng ban', icon: <Building2 size={18} /> },
      { path: '/positions', label: 'Chức vụ', icon: <Briefcase size={18} /> },
      { path: '/employees', label: 'Nhân viên', icon: <Users size={18} /> },
    ],
  },
  {
    title: 'HỢP ĐỒNG',
    icon: <FileText size={18} />,
    collapsible: true,
    items: [
      { path: '/contract-types', label: 'Loại hợp đồng', icon: <ScrollText size={18} /> },
      { path: '/contracts', label: 'Hợp đồng', icon: <FileText size={18} /> },
    ],
  },
  {
    title: 'NGHỈ PHÉP & CHẤM CÔNG',
    icon: <CalendarClock size={18} />,
    collapsible: true,
    items: [
      { path: '/leave-types', label: 'Loại nghỉ phép', icon: <Palmtree size={18} /> },
      { path: '/leave-requests', label: 'Đơn nghỉ phép', icon: <CalendarClock size={18} /> },
      { path: '/attendance', label: 'Chấm công', icon: <Clock size={18} /> },
    ],
  },
  {
    title: 'LƯƠNG',
    icon: <Wallet size={18} />,
    collapsible: true,
    items: [
      { path: '/salary-grades', label: 'Bậc lương', icon: <Wallet size={18} /> },
      { path: '/payroll-periods', label: 'Kỳ lương', icon: <Calendar size={18} /> },
      { path: '/payslips', label: 'Phiếu lương', icon: <Receipt size={18} /> },
    ],
  },
  {
    title: 'ĐÁNH GIÁ HIỆU SUẤT',
    icon: <Star size={18} />,
    collapsible: true,
    items: [
      { path: '/performance-criteria', label: 'Tiêu chí đánh giá', icon: <Target size={18} /> },
      { path: '/performance-reviews', label: 'Đánh giá hiệu suất', icon: <Star size={18} /> },
    ],
  },
  // ===== QUẢN LÝ CÔNG VIỆC =====
  {
    title: 'QUẢN LÝ CÔNG VIỆC',
    icon: <ClipboardList size={18} />,
    items: [
      { 
        path: '/tasks', 
        label: 'Danh sách công việc', 
        icon: <ClipboardList size={18} />,
        // Nhân viên có thể xem công việc trong phòng ban
      },
      { 
        path: '/my-tasks', 
        label: 'Công việc của tôi', 
        icon: <UserCheck size={18} />,
      },
      { 
        path: '/approvals', 
        label: 'Phê duyệt', 
        icon: <CheckSquare size={18} />, 
        managerOnly: true,
        badge: pendingApprovals > 0 ? pendingApprovals : undefined,
      },
    ],
  },
  // ===== BÁO CÁO - CHỈ CHO PHÓ PHÒNG TRỞ LÊN (level <= 5) =====
  {
    title: 'BÁO CÁO',
    icon: <BarChart3 size={18} />,
    executiveOnly: true, // Chỉ hiển thị cho level <= 5
    items: [
      { 
        path: '/reports/tasks', 
        label: 'Báo cáo công việc', 
        icon: <FileBarChart size={18} />,
        executiveOnly: true,
      },
    ],
  },
];

// ============================================================
// MAIN COMPONENT
// ============================================================

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  
  // State
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    'TỔ CHỨC': true,
    'HỢP ĐỒNG': true,
    'NGHỈ PHÉP & CHẤM CÔNG': true,
    'LƯƠNG': true,
    'ĐÁNH GIÁ HIỆU SUẤT': true,
  });

  // Check if user is manager (có quyền quản lý - is_manager flag)
  const isManager = user?.role === 'admin' || user?.role === 'manager' || user?.is_manager;
  
  // Check if user is executive (Phó phòng trở lên - level <= 5)
  // Level: 1-Giám đốc, 2-Phó GĐ, 3-Kế toán trưởng, 4-Trưởng phòng, 5-Phó phòng, 6-NV chính thức, 7-Thử việc
  const userLevel = user?.position_level || 7;
  const isExecutive = userLevel <= 5;

  // Get menu groups (with pending approvals count from somewhere)
  const menuGroups = getMenuGroups(0); // TODO: Pass actual pending count

  // Check active route
  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  // Toggle group collapse
  const toggleGroup = (title: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  // Check if item should be visible
  const isItemVisible = (item: MenuItem): boolean => {
    if (item.managerOnly && !isManager) return false;
    if (item.executiveOnly && !isExecutive) return false;
    return true;
  };

  // Check if group should be visible
  const isGroupVisible = (group: MenuGroup): boolean => {
    if (group.executiveOnly && !isExecutive) return false;
    return true;
  };

  // Render menu item
  const renderMenuItem = (item: MenuItem) => {
    // Skip items that shouldn't be visible
    if (!isItemVisible(item)) return null;

    return (
      <li key={item.path}>
        <NavLink
          to={item.path}
          onClick={() => setIsMobileOpen(false)}
          className={({ isActive: navIsActive }) =>
            `flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
              navIsActive || isActive(item.path)
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
            }`
          }
        >
          <div className="flex items-center gap-3">
            <span className="opacity-80">{item.icon}</span>
            <span>{item.label}</span>
          </div>
          {item.badge && (
            <span className="px-2 py-0.5 text-xs font-medium bg-red-500 text-white rounded-full">
              {item.badge}
            </span>
          )}
        </NavLink>
      </li>
    );
  };

  // Sidebar content
  const sidebarContent = (
    <>
      {/* Logo/Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Huy Anh ERP</h1>
            <p className="text-xs text-gray-400 mt-0.5">Quản lý Doanh nghiệp</p>
          </div>
          {/* Mobile close button */}
          <button
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* User Info */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-lg font-bold text-white shadow-lg">
            {user?.full_name?.charAt(0) || user?.email?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.full_name || user?.email}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {user?.position_name || (
                user?.role === 'admin' ? 'Quản trị viên' : 
                isManager ? 'Quản lý' : 'Nhân viên'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {menuGroups.map((group) => {
          // Skip group if not visible
          if (!isGroupVisible(group)) return null;

          // Filter items based on visibility
          const filteredItems = group.items.filter(isItemVisible);

          // Don't render group if no items
          if (filteredItems.length === 0) return null;

          const isCollapsed = group.collapsible && collapsedGroups[group.title];

          return (
            <div key={group.title} className="mb-2">
              {/* Group Header */}
              {group.collapsible ? (
                <button
                  onClick={() => toggleGroup(group.title)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-300 transition-colors"
                >
                  <span>{group.title}</span>
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
              ) : (
                <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {group.title}
                </p>
              )}

              {/* Group Items */}
              {!isCollapsed && (
                <ul className="space-y-1">
                  {filteredItems.map(renderMenuItem)}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={() => {
            logout();
            setIsMobileOpen(false);
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-red-600/20 hover:text-red-400 rounded-lg transition-colors"
        >
          <LogOut size={18} />
          <span>Đăng xuất</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Header Bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setIsMobileOpen(true)}
          className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded-lg"
        >
          <Menu size={24} />
        </button>
        <h1 className="text-lg font-bold text-white">Huy Anh ERP</h1>
        <div className="w-10" /> {/* Spacer for centering */}
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex w-64 bg-gray-800 text-white flex-col min-h-screen fixed left-0 top-0 bottom-0 z-30">
        {sidebarContent}
      </aside>

      {/* Sidebar - Mobile */}
      <aside 
        className={`lg:hidden fixed top-0 left-0 bottom-0 w-72 bg-gray-800 text-white flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main content spacer - Desktop only */}
      <div className="hidden lg:block w-64 flex-shrink-0" />
      
      {/* Mobile top spacer */}
      <div className="lg:hidden h-14" />
    </>
  );
}

export default Sidebar;