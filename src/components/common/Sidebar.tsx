// ============================================================
// SIDEBAR COMPONENT - UPDATED: PM5 PHÂN BỔ NGUỒN LỰC
// File: src/components/common/Sidebar.tsx
// ============================================================
// CHANGES:
// - ✅ PM2: Thêm group "QUẢN LÝ DỰ ÁN" với Loại dự án, Templates
// - ✅ PM3: Thêm Danh sách DA, Tạo DA mới
// - ✅ PM4: Thêm Gantt tổng hợp
// - ✅ PM5: Thêm Nguồn lực (Capacity Planning)
// - ✅ FIX: Ẩn mặc định KHO THÀNH PHẨM, LÝ LỊCH MỦ, THU MUA MỦ
// - ✅ FIX: BÁO CÁO hiển thị cho Trưởng phòng/Phó phòng (managerOnly)
// ============================================================

import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { purchaseAccessService } from '../../services/purchaseAccessService';
import { overtimeRequestService } from '../../services/overtimeRequestService';
import { leaveRequestService } from '../../services/leaveRequestService';
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
  Shield,
  UsersRound,
  Bell,
  // WMS icons
  Warehouse,
  MapPin,
  PackagePlus,
  PackageMinus,
  // Phase 5: WMS Tồn kho icons
  Activity,
  AlertTriangle,
  // ✅ Phase 6: QC icon
  FlaskConical,
  // ✅ Phase 7: Weighbridge icon
  History,
  // Lý lịch mủ icons
  Droplets,
  ClipboardList as ClipboardListIcon,
  // Phase 3.6: Thu mua mủ icons
  Truck,
  ArrowRightLeft,
  FileCheck,
  PieChart,
  // ✅ Purchasing P7: Report icon
  TrendingUp,
  // ✅ PM2 + PM3 + PM4 + PM5: Project Management icons
  FolderKanban,
  Copy,
  ListTodo,
  Plus,
  GanttChart,
  UserCog,
} from 'lucide-react';

interface MenuItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  managerOnly?: boolean;
  executiveOnly?: boolean;
  bgdOnly?: boolean;
  requirePurchaseAccess?: boolean;
  approvalLevel?: boolean;
  badge?: number;
}

interface MenuGroup {
  title: string;
  icon: React.ReactNode;
  items: MenuItem[];
  collapsible?: boolean;
  executiveOnly?: boolean;
  requirePurchaseAccess?: boolean;
  /** Ẩn hoàn toàn group (cả tiêu đề) khi không có child active */
  hiddenByDefault?: boolean;
}

const getMenuGroups = (
  pendingApprovals: number = 0, 
  pendingOT: number = 0,
  pendingLeave: number = 0
): MenuGroup[] => [
  // ===== TỔNG QUAN =====
  {
    title: 'TỔNG QUAN',
    icon: <LayoutDashboard size={18} />,
    items: [
      { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
      { path: '/notifications', label: 'Thông báo', icon: <Bell size={18} /> },
    ],
  },

  // ===== KHO THÀNH PHẨM (WMS) — HIDDEN =====
  // {
  //   title: 'KHO THÀNH PHẨM',
  //   icon: <Warehouse size={18} />,
  //   collapsible: true,
  //   hiddenByDefault: true,
  //   items: [
  //     { path: '/wms', label: 'Dashboard Kho', icon: <BarChart3 size={18} /> },
  //     { path: '/wms/materials', label: 'Thành phẩm', icon: <Package size={18} /> },
  //     { path: '/wms/warehouses', label: 'Kho & Vị trí', icon: <MapPin size={18} /> },
  //     { path: '/wms/stock-in', label: 'Nhập kho TP', icon: <PackagePlus size={18} /> },
  //     { path: '/wms/stock-out', label: 'Xuất kho', icon: <PackageMinus size={18} /> },
  //     { path: '/wms/qc', label: 'QC & DRC', icon: <FlaskConical size={18} /> },
  //     { path: '/wms/alerts', label: 'Cảnh báo', icon: <AlertTriangle size={18} /> },
  //     { path: '/wms/stock-check', label: 'Kiểm kê', icon: <ClipboardCheck size={18} /> },
  //     { path: '/wms/weighbridge', label: 'Trạm cân', icon: <Scale size={18} /> },
  //     { path: '/wms/weighbridge/list', label: 'Lịch sử cân', icon: <History size={18} /> },
  //   ],
  // },

  // ===== LÝ LỊCH MỦ — HIDDEN =====
  // {
  //   title: 'LÝ LỊCH MỦ',
  //   icon: <Droplets size={18} />,
  //   collapsible: true,
  //   hiddenByDefault: true,
  //   items: [
  //     { path: '/rubber/suppliers', label: 'NCC Mủ', icon: <Users size={18} /> },
  //     { path: '/rubber/intake', label: 'Phiếu nhập mủ', icon: <ClipboardListIcon size={18} /> },
  //     { path: '/rubber/daily-report', label: 'Báo cáo ngày', icon: <FileBarChart size={18} /> },
  //     { path: '/rubber/debt', label: 'Công nợ NCC mủ', icon: <Wallet size={18} /> },
  //   ],
  // },

  // ===== THU MUA MỦ — HIDDEN =====
  // {
  //   title: 'THU MUA MỦ',
  //   icon: <Scale size={18} />,
  //   collapsible: true,
  //   hiddenByDefault: true,
  //   items: [
  //     { path: '/rubber/dashboard', label: 'Tổng hợp', icon: <PieChart size={18} /> },
  //     { path: '/rubber/vn/batches', label: '🇻🇳 Chốt mủ Việt', icon: <ClipboardList size={18} /> },
  //     { path: '/rubber/lao/transfers', label: '🇱🇦 Chuyển tiền Lào', icon: <ArrowRightLeft size={18} /> },
  //     { path: '/rubber/lao/purchases', label: '🇱🇦 Thu mua Lào', icon: <ShoppingCart size={18} /> },
  //     { path: '/rubber/lao/shipments', label: '🚛 Xuất kho Lào→NM', icon: <Truck size={18} /> },
  //     { path: '/rubber/profiles', label: 'Lý lịch phiếu', icon: <FileCheck size={18} /> },
  //     { path: '/rubber/settlements', label: 'Quyết toán TT', icon: <DollarSign size={18} /> },
  //   ],
  // },

  // ===== QUẢN LÝ NHÂN SỰ — HIDDEN =====
  // {
  //   title: 'QUẢN LÝ NHÂN SỰ',
  //   icon: <Users size={18} />,
  //   collapsible: true,
  //   hiddenByDefault: true,
  //   items: [
  //     { path: '/departments', label: 'Phòng ban', icon: <Building2 size={18} /> },
  //     { path: '/positions', label: 'Chức vụ', icon: <Briefcase size={18} /> },
  //     { path: '/employees', label: 'Nhân viên', icon: <Users size={18} /> },
  //     { path: '/contract-types', label: 'Loại hợp đồng', icon: <ScrollText size={18} /> },
  //     { path: '/contracts', label: 'Hợp đồng', icon: <FileText size={18} /> },
  //     { path: '/salary-grades', label: 'Bậc lương', icon: <Wallet size={18} /> },
  //     { path: '/payroll-periods', label: 'Kỳ lương', icon: <Calendar size={18} /> },
  //     { path: '/payslips', label: 'Phiếu lương', icon: <Receipt size={18} /> },
  //     { path: '/performance-criteria', label: 'Tiêu chí đánh giá', icon: <Target size={18} /> },
  //     { path: '/performance-reviews', label: 'Đánh giá hiệu suất', icon: <Star size={18} /> },
  //     { path: '/leave-types', label: 'Loại nghỉ phép', icon: <Palmtree size={18} /> },
  //   ],
  // },

  // ===== CHẤM CÔNG =====
  {
    title: 'CHẤM CÔNG',
    icon: <Clock size={18} />,
    collapsible: true,
    items: [
      { path: '/attendance', label: 'Bảng chấm công', icon: <Clock size={18} /> },
      { path: '/shifts', label: 'Quản lý ca', icon: <Timer size={18} />, executiveOnly: true },
      { path: '/shift-assignments', label: 'Phân ca', icon: <CalendarDays size={18} />, managerOnly: true },
      { path: '/shift-teams', label: 'Quản lý đội ca', icon: <UsersRound size={18} />, managerOnly: true },
      { path: '/leave-requests', label: 'Đơn nghỉ phép', icon: <CalendarClock size={18} /> },
      { 
        path: '/leave-approvals', 
        label: 'Duyệt nghỉ phép', 
        icon: <CheckSquare size={18} />, 
        approvalLevel: true,
        badge: pendingLeave > 0 ? pendingLeave : undefined,
      },
      { path: '/overtime', label: 'Tăng ca', icon: <AlarmClockPlus size={18} /> },
      { 
        path: '/overtime/approval', 
        label: 'Duyệt tăng ca', 
        icon: <ClipboardCheck size={18} />, 
        approvalLevel: true,
        badge: pendingOT > 0 ? pendingOT : undefined,
      },
    ],
  },

  // ===== QUẢN LÝ CÔNG VIỆC =====
  {
    title: 'QUẢN LÝ CÔNG VIỆC',
    icon: <ClipboardList size={18} />,
    items: [
      { path: '/tasks', label: 'Danh sách công việc', icon: <ClipboardList size={18} /> },
      { path: '/my-tasks', label: 'Công việc của tôi', icon: <UserCheck size={18} /> },
      { 
        path: '/approvals', 
        label: 'Phê duyệt', 
        icon: <CheckSquare size={18} />, 
        managerOnly: true,
        badge: pendingApprovals > 0 ? pendingApprovals : undefined,
      },
    ],
  },

  // ===== QUẢN LÝ DỰ ÁN — PM2 + PM3 + PM4 + PM5 =====
  {
    title: 'QUẢN LÝ DỰ ÁN',
    icon: <FolderKanban size={18} />,
    collapsible: true,
    items: [
      // ✅ PM3: Danh sách & Tạo mới
      { path: '/projects/list', label: 'Danh sách DA', icon: <ListTodo size={18} /> },
      { path: '/projects/new', label: 'Tạo DA mới', icon: <Plus size={18} /> },
      // ✅ PM4: Gantt tổng hợp
      { path: '/projects/gantt', label: 'Gantt tổng hợp', icon: <GanttChart size={18} /> },
      // ✅ PM5: Phân bổ nguồn lực
      { path: '/projects/resources', label: 'Nguồn lực', icon: <UserCog size={18} /> },
      // PM2: Danh mục & Cấu hình
      { path: '/projects/categories', label: 'Loại dự án', icon: <Layers size={18} /> },
      { path: '/projects/templates', label: 'Templates', icon: <Copy size={18} /> },
    ],
  },

  // ===== MUA HÀNG — HIDDEN =====
  // {
  //   title: 'QUẢN LÝ ĐƠN HÀNG',
  //   icon: <ShoppingCart size={18} />,
  //   collapsible: true,
  //   items: [
  //     { path: '/purchasing/suppliers', label: 'Nhà cung cấp', icon: <Building2 size={18} /> },
  //     { path: '/purchasing/categories', label: 'Nhóm vật tư', icon: <Layers size={18} /> },
  //     { path: '/purchasing/types', label: 'Loại vật tư', icon: <Tag size={18} /> },
  //     { path: '/purchasing/units', label: 'Đơn vị tính', icon: <Scale size={18} /> },
  //     { path: '/purchasing/materials', label: 'Vật tư', icon: <Package size={18} /> },
  //     { path: '/purchasing/variant-attributes', label: 'Thuộc tính biến thể', icon: <Boxes size={18} /> },
  //     { path: '/purchasing/orders', label: 'Đơn đặt hàng', icon: <ShoppingCart size={18} /> },
  //     { path: '/purchasing/debt', label: 'Công nợ NCC', icon: <DollarSign size={18} /> },
  //     { path: '/purchasing/payments', label: 'Lịch sử thanh toán', icon: <CreditCard size={18} /> },
  //     { path: '/purchasing/reports', label: 'Báo cáo mua hàng', icon: <TrendingUp size={18} /> },
  //   ],
  // },

  // ===== QUẢN TRỊ =====
  {
    title: 'QUẢN TRỊ',
    icon: <Shield size={18} />,
    items: [
      { path: '/purchasing/access', label: 'Phân quyền mua hàng', icon: <Shield size={18} />, bgdOnly: true },
    ],
  },

  // ===== BÁO CÁO =====
  // ✅ FIX: Đổi từ executiveOnly → managerOnly để Trưởng phòng/Phó phòng cũng thấy
  {
    title: 'BÁO CÁO',
    icon: <BarChart3 size={18} />,
    items: [
      { path: '/reports/tasks', label: 'Báo cáo công việc', icon: <FileBarChart size={18} />, managerOnly: true },
      { path: '/purchasing/reports', label: 'Báo cáo mua hàng', icon: <TrendingUp size={18} />, managerOnly: true },
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

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  // ✅ FIX: Ẩn mặc định KHO THÀNH PHẨM, LÝ LỊCH MỦ, THU MUA MỦ, QUẢN LÝ NHÂN SỰ, QUẢN LÝ ĐƠN HÀNG
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    'KHO THÀNH PHẨM': true,
    'LÝ LỊCH MỦ': true,
    'THU MUA MỦ': true,
    'QUẢN LÝ NHÂN SỰ': true,
    'CHẤM CÔNG': false,
    'QUẢN LÝ ĐƠN HÀNG': true,
    'QUẢN LÝ DỰ ÁN': false,
  });
  
  const [hasPurchaseAccess, setHasPurchaseAccess] = useState(true);
  const [loadingPurchaseAccess, setLoadingPurchaseAccess] = useState(false);
  const [pendingOTCount, setPendingOTCount] = useState(0);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);

  const isAdmin = user?.role === 'admin';
  const userLevel = user?.position_level || 7;
  const isExecutive = userLevel <= 3;
  const isBGD = isAdmin || userLevel <= 3;
  const canApproveOT = userLevel >= 4 && userLevel <= 5;
  const isManager = user?.role === 'admin' || user?.role === 'manager' || user?.is_manager;

  // ✅ Load pending OT count
  useEffect(() => {
    const loadPendingOTCount = async () => {
      if (!user?.employee_id || (!canApproveOT && !isExecutive && !isAdmin)) return

      try {
        const count = await overtimeRequestService.getPendingCount(user.employee_id)
        setPendingOTCount(count)
      } catch (error) {
        console.error('Failed to load pending OT count:', error)
        setPendingOTCount(0)
      }
    }

    if (user?.employee_id && (canApproveOT || isExecutive || isAdmin)) {
      loadPendingOTCount()
      const interval = setInterval(loadPendingOTCount, 120000)
      return () => clearInterval(interval)
    }
  }, [user?.employee_id, canApproveOT, isExecutive, isAdmin]);

  // ✅ Load pending leave count
  useEffect(() => {
    const loadPendingLeaveCount = async () => {
      if (!user?.employee_id || (!canApproveOT && !isExecutive && !isAdmin)) return

      try {
        const count = await leaveRequestService.getPendingCount(user.employee_id)
        setPendingLeaveCount(count)
      } catch (error) {
        console.error('Failed to load pending leave count:', error)
        setPendingLeaveCount(0)
      }
    }

    if (user?.employee_id && (canApproveOT || isExecutive || isAdmin)) {
      loadPendingLeaveCount()
      const interval = setInterval(loadPendingLeaveCount, 120000)
      return () => clearInterval(interval)
    }
  }, [user?.employee_id, canApproveOT, isExecutive, isAdmin]);

  // Auto-expand group when child is active
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

  const menuGroups = getMenuGroups(0, pendingOTCount, pendingLeaveCount);

  const toggleGroup = (title: string) => {
    setCollapsedGroups(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const isItemVisible = (item: MenuItem): boolean => {
    if (isAdmin) return true;
    if (item.managerOnly && !isManager) return false;
    if (item.executiveOnly && !isExecutive) return false;
    if (item.bgdOnly && !isBGD) return false;
    if (item.requirePurchaseAccess && !hasPurchaseAccess) return false;
    if (item.approvalLevel && !canApproveOT && !isExecutive) return false;
    return true;
  };

  const isGroupVisible = (group: MenuGroup): boolean => {
    if (group.executiveOnly && !isExecutive && !isAdmin) return false;
    if (group.requirePurchaseAccess && !hasPurchaseAccess && !isAdmin) return false;
    // ✅ Ẩn hoàn toàn group (cả tiêu đề) nếu hiddenByDefault và không có child active
    if (group.hiddenByDefault) {
      const hasActiveChild = group.items.some(item => 
        location.pathname === item.path || location.pathname.startsWith(item.path + '/')
      );
      if (!hasActiveChild) return false;
    }
    return true;
  };

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

  const sidebarContent = (
    <>
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

      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {menuGroups.map((group) => {
          if (!isGroupVisible(group)) return null;

          const filteredItems = group.items.filter(isItemVisible);
          if (filteredItems.length === 0) return null;

          const isCollapsed = group.collapsible && collapsedGroups[group.title];

          return (
            <div key={group.title} className="mb-2">
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

              {!isCollapsed && (
                <ul className="space-y-1">
                  {filteredItems.map(renderMenuItem)}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

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

      {isMobileOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      <aside className="hidden lg:flex w-64 bg-gray-800 text-white flex-col min-h-screen fixed left-0 top-0 bottom-0 z-30">
        {sidebarContent}
      </aside>

      <aside 
        className={`lg:hidden fixed top-0 left-0 bottom-0 w-72 bg-gray-800 text-white flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      <div className="hidden lg:block w-64 flex-shrink-0" />
    </>
  );
}

export default Sidebar;