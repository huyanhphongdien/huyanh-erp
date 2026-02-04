// ============================================================
// SIDEBAR COMPONENT - REFACTORED v10
// File: src/components/common/Sidebar.tsx
// ============================================================
// CHANGES v10:
// - GOM NHÓM: TỔ CHỨC + HỢP ĐỒNG + NGHỈ PHÉP + LƯƠNG + ĐÁNH GIÁ
//   → thành "QUẢN LÝ NHÂN SỰ"
// - TÁCH RIÊNG: "CHẤM CÔNG" thành group mới
// - THÊM MỚI: Quản lý ca, Phân ca, Tăng ca, Duyệt tăng ca
// - THÊM: Badge count cho pending overtime approvals
// ============================================================

import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { purchaseAccessService } from '../../services/purchaseAccessService';
import { overtimeRequestService } from '../../services/overtimeRequestService';
import { 
  Menu, X, ChevronDown, ChevronRight,
  LayoutDashboard, Building2, Briefcase, Users,
  FileText, ScrollText, Palmtree, CalendarClock, Clock,
  Wallet, Calendar, Receipt,
  Target, Star,
  ClipboardList, UserCheck, CheckSquare,
  LogOut,
  BarChart3,
  FileBarChart,
  Settings,
  User,
  ShoppingCart,
  Package,
  Layers,
  Tag,
  Scale,
  Boxes,
  DollarSign,
  CreditCard,
  Timer,
  CalendarDays,
  AlarmClockPlus,
  ClipboardCheck,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

interface MenuItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  managerOnly?: boolean;
  executiveOnly?: boolean;
  requirePurchaseAccess?: boolean;
  badge?: number;
}

interface MenuGroup {
  title: string;
  icon: React.ReactNode;
  items: MenuItem[];
  collapsible?: boolean;
  executiveOnly?: boolean;
  requirePurchaseAccess?: boolean;
}

// ============================================================
// MENU CONFIGURATION
// ============================================================

const getMenuGroups = (pendingApprovals: number = 0, pendingOT: number = 0): MenuGroup[] => [
  // ===== TỔNG QUAN =====
  {
    title: 'TỔNG QUAN',
    icon: <LayoutDashboard size={18} />,
    items: [
      { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
    ],
  },

  // ===== QUẢN LÝ NHÂN SỰ (GOM: Tổ chức + Hợp đồng + Nghỉ phép + Lương + Đánh giá) =====
  {
    title: 'QUẢN LÝ NHÂN SỰ',
    icon: <Users size={18} />,
    collapsible: true,
    items: [
      // Tổ chức
      { path: '/departments', label: 'Phòng ban', icon: <Building2 size={18} /> },
      { path: '/positions', label: 'Chức vụ', icon: <Briefcase size={18} /> },
      { path: '/employees', label: 'Nhân viên', icon: <Users size={18} /> },
      // Hợp đồng
      { path: '/contract-types', label: 'Loại hợp đồng', icon: <ScrollText size={18} /> },
      { path: '/contracts', label: 'Hợp đồng', icon: <FileText size={18} /> },
      // Nghỉ phép
      { path: '/leave-types', label: 'Loại nghỉ phép', icon: <Palmtree size={18} /> },
      { path: '/leave-requests', label: 'Đơn nghỉ phép', icon: <CalendarClock size={18} /> },
      // Lương
      { path: '/salary-grades', label: 'Bậc lương', icon: <Wallet size={18} /> },
      { path: '/payroll-periods', label: 'Kỳ lương', icon: <Calendar size={18} /> },
      { path: '/payslips', label: 'Phiếu lương', icon: <Receipt size={18} /> },
      // Đánh giá hiệu suất
      { path: '/performance-criteria', label: 'Tiêu chí đánh giá', icon: <Target size={18} /> },
      { path: '/performance-reviews', label: 'Đánh giá hiệu suất', icon: <Star size={18} /> },
    ],
  },

  // ===== CHẤM CÔNG (TÁCH RIÊNG + THÊM MỚI) =====
  {
    title: 'CHẤM CÔNG',
    icon: <Clock size={18} />,
    collapsible: true,
    items: [
      { path: '/attendance', label: 'Bảng chấm công', icon: <Clock size={18} /> },
      { path: '/shifts', label: 'Quản lý ca', icon: <Timer size={18} />, executiveOnly: true },
      { path: '/shift-assignments', label: 'Phân ca', icon: <CalendarDays size={18} />, managerOnly: true },
      { path: '/overtime', label: 'Tăng ca', icon: <AlarmClockPlus size={18} /> },
      { 
        path: '/overtime/approval', 
        label: 'Duyệt tăng ca', 
        icon: <ClipboardCheck size={18} />, 
        managerOnly: true,
        badge: pendingOT > 0 ? pendingOT : undefined,
      },
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

  // ===== MUA HÀNG =====
  {
    title: 'QUẢN LÝ ĐƠN HÀNG',
    icon: <ShoppingCart size={18} />,
    collapsible: true,
    requirePurchaseAccess: true,
    items: [
      { path: '/purchasing/suppliers', label: 'Nhà cung cấp', icon: <Building2 size={18} />, requirePurchaseAccess: true },
      { path: '/purchasing/categories', label: 'Nhóm vật tư', icon: <Layers size={18} />, requirePurchaseAccess: true },
      { path: '/purchasing/types', label: 'Loại vật tư', icon: <Tag size={18} />, requirePurchaseAccess: true },
      { path: '/purchasing/units', label: 'Đơn vị tính', icon: <Scale size={18} />, requirePurchaseAccess: true },
      { path: '/purchasing/materials', label: 'Vật tư', icon: <Package size={18} />, requirePurchaseAccess: true },
      { path: '/purchasing/variant-attributes', label: 'Thuộc tính biến thể', icon: <Boxes size={18} />, requirePurchaseAccess: true },
      { path: '/purchasing/orders', label: 'Đơn đặt hàng', icon: <ShoppingCart size={18} />, requirePurchaseAccess: true },
      { path: '/purchasing/debt', label: 'Công nợ NCC', icon: <DollarSign size={18} />, requirePurchaseAccess: true },
      { path: '/purchasing/payments', label: 'Lịch sử thanh toán', icon: <CreditCard size={18} />, requirePurchaseAccess: true },
    ],
  },

  // ===== BÁO CÁO =====
  {
    title: 'BÁO CÁO',
    icon: <BarChart3 size={18} />,
    executiveOnly: true,
    items: [
      { path: '/reports/tasks', label: 'Báo cáo công việc', icon: <FileBarChart size={18} />, executiveOnly: true },
    ],
  },

  // ===== CÀI ĐẶT =====
  {
    title: 'CÀI ĐẶT',
    icon: <Settings size={18} />,
    items: [
      { path: '/settings', label: 'Cài đặt tài khoản', icon: <User size={18} /> },
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
    'QUẢN LÝ NHÂN SỰ': true,
    'CHẤM CÔNG': false,
    'QUẢN LÝ ĐƠN HÀNG': true,
  });
  
  // Purchase access state
  const [hasPurchaseAccess, setHasPurchaseAccess] = useState(false);
  const [loadingPurchaseAccess, setLoadingPurchaseAccess] = useState(true);

  // Badge counts
  const [pendingOTCount, setPendingOTCount] = useState(0);

  // Check if user is manager (có quyền quản lý - is_manager flag)
  const isManager = user?.role === 'admin' || user?.role === 'manager' || user?.is_manager;
  
  // Check if user is admin
  const isAdmin = user?.role === 'admin';
  
  // Check if user is executive (Phó phòng trở lên - level <= 5)
  const userLevel = user?.position_level || 7;
  const isExecutive = userLevel <= 5;

  // Load pending overtime count for managers
  useEffect(() => {
    const loadPendingOTCount = async () => {
      if (!user?.employee_id || (!isManager && !isAdmin)) return;

      try {
        const count = await overtimeRequestService.getPendingCount(
  isExecutive || isAdmin ? undefined : { departmentId: user.department_id || undefined }
);
setPendingOTCount(count);
      } catch (error) {
        console.error('Failed to load pending OT count:', error);
        setPendingOTCount(0);
      }
    };

    if (user?.employee_id && (isManager || isAdmin)) {
      loadPendingOTCount();

      // Refresh every 2 minutes
      const interval = setInterval(loadPendingOTCount, 120000);
      return () => clearInterval(interval);
    }
  }, [user?.employee_id, isManager, isAdmin]);

  // Check purchase access on mount
  useEffect(() => {
    const checkPurchaseAccess = async () => {
      try {
        setLoadingPurchaseAccess(true);
        
        if (isAdmin || isExecutive) {
          setHasPurchaseAccess(true);
          setLoadingPurchaseAccess(false);
          return;
        }
        
        try {
          const hasAccess = await purchaseAccessService.hasAccess();
          setHasPurchaseAccess(hasAccess);
        } catch (serviceError) {
          console.warn('Purchase access check failed:', serviceError);
          setHasPurchaseAccess(false);
        }
      } catch (error) {
        console.error('Check purchase access error:', error);
        setHasPurchaseAccess(false);
      } finally {
        setLoadingPurchaseAccess(false);
      }
    };

    if (user) {
      checkPurchaseAccess();
    }
  }, [user, isAdmin, isExecutive]);

  // Auto-expand group when its child is active
  useEffect(() => {
    const menuGroups = getMenuGroups();
    for (const group of menuGroups) {
      if (group.collapsible) {
        const hasActiveChild = group.items.some(item => 
          location.pathname === item.path || location.pathname.startsWith(item.path + '/')
        );
        if (hasActiveChild) {
          setCollapsedGroups(prev => ({ ...prev, [group.title]: false }));
        }
      }
    }
  }, [location.pathname]);

  // Get menu groups with badge counts
  const menuGroups = getMenuGroups(0, pendingOTCount);

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
    if (item.managerOnly && !isManager && !isAdmin) return false;
    if (item.executiveOnly && !isExecutive && !isAdmin) return false;
    if (item.requirePurchaseAccess && !hasPurchaseAccess && !isAdmin) return false;
    return true;
  };

  // Check if group should be visible
  const isGroupVisible = (group: MenuGroup): boolean => {
    if (group.executiveOnly && !isExecutive && !isAdmin) return false;
    if (group.requirePurchaseAccess && !hasPurchaseAccess && !isAdmin) return false;
    return true;
  };

  // Render menu item
  const renderMenuItem = (item: MenuItem) => {
    if (!isItemVisible(item)) return null;

    return (
      <li key={item.path}>
        <NavLink
  to={item.path}
  end
  onClick={() => setIsMobileOpen(false)}
  className={({ isActive: navIsActive }) =>
    `flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
      navIsActive
        ? 'bg-blue-600 text-white shadow-md'
        : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
    }`
  }
>
          <div className="flex items-center gap-3">
            <span className="opacity-80">{item.icon}</span>
            <span>{item.label}</span>
          </div>
          {item.badge && item.badge > 0 && (
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
        <NavLink 
          to="/settings" 
          onClick={() => setIsMobileOpen(false)}
          className="flex items-center gap-3 group"
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-lg font-bold text-white shadow-lg group-hover:from-blue-400 group-hover:to-blue-500 transition-all">
            {user?.full_name?.charAt(0) || user?.email?.charAt(0) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate group-hover:text-blue-300 transition-colors">
              {user?.full_name || user?.email}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {user?.position_name || (
                user?.role === 'admin' ? 'Quản trị viên' : 
                isManager ? 'Quản lý' : 'Nhân viên'
              )}
            </p>
          </div>
          <Settings size={16} className="text-gray-500 group-hover:text-blue-400 transition-colors" />
        </NavLink>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {menuGroups.map((group) => {
          if (!isGroupVisible(group)) return null;

          const filteredItems = group.items.filter(isItemVisible);
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
        <div className="w-10" />
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