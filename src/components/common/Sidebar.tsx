// ============================================================
// SIDEBAR COMPONENT - MODERN REDESIGN 2025
// File: src/components/common/Sidebar.tsx
// ============================================================
// REDESIGN: Light warm theme matching Dashboard redesign
// - Warm white sidebar with glassmorphism
// - Brand gradient logo area
// - Soft active states with left accent bar
// - Company name: Công ty TNHH MTV Cao su Huy Anh Phong Điền
// LOGIC: 100% unchanged - same permissions, badges, collapsible, mobile
// ============================================================
// CẬP NHẬT: 
// - Thêm group MUA HÀNG với requirePurchaseAccess
// - ★ Thêm group B2B THU MUA với requireB2BPurchaser (chỉ cho khuyennt@, duyhh@)
// - ★ Thêm badge số tin chưa đọc cho B2B Chat
// ============================================================

import { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useOpenTab } from '../../hooks/useOpenTab';
import { getSalesRole, hasSalesAccess } from '../../services/sales/salesPermissionService';
import { supabase } from '../../lib/supabase';
import { isFinanceUser } from '../../lib/financeAccess';
import { purchaseAccessService } from '../../services/purchaseAccessService';
import { overtimeRequestService } from '../../services/overtimeRequestService';
import { leaveRequestService } from '../../services/leaveRequestService';
import logoImg from '../../assets/logo.png';
import {
  Menu, X, ChevronDown, ChevronRight, ChevronLeft,
  LayoutDashboard, Building2, Briefcase, Users,
  FileText, ScrollText, Palmtree, CalendarClock, Clock,
  Wallet, Calendar, Receipt,
  Target,
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
  Percent,
  Banknote,
  Timer,
  CalendarDays,
  AlarmClockPlus,
  ScanLine,
  Monitor,
  ClipboardCheck,
  Shield,
  UsersRound,
  Bell,
  Warehouse,
  MapPin,
  PackagePlus,
  PackageMinus,
  AlertTriangle,
  FlaskConical,
  History,
  Droplets,
  ClipboardList as ClipboardListIcon,
  Truck,
  ArrowRightLeft,
  FileCheck,
  PieChart,
  TrendingUp,
  FolderKanban,
  Copy,
  ListTodo,
  Plus,
  GanttChart,
  UserCog,
  MessageSquare,
  Handshake,
  BookOpen,
  ArrowLeftRight,
  Factory,
  Globe,
  ShoppingBag,
  LayoutGrid,
  Ship,
  Activity,
  Gift,
  IdCard,
} from 'lucide-react';

// ============================================================
// DESIGN TOKENS
// ============================================================

const BRAND = {
  primary: '#1B4D3E',
  secondary: '#2D8B6E',
  accent: '#E8A838',
} as const;

// ============================================================
// TYPES (updated with requireB2BPurchaser)
// ============================================================

interface MenuItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  managerOnly?: boolean;
  executiveOnly?: boolean;
  bgdOnly?: boolean;
  adminOnly?: boolean;        // CHỈ Admin (vd Nhật ký kiểm toán tài chính) — ẩn kể cả khi mở group cho BGĐ/Kế toán
  requirePurchaseAccess?: boolean;
  requireB2BPurchaser?: boolean;
  approvalLevel?: boolean;
  badge?: number;
  allowedEmails?: string[];
  requireSalesRoles?: string[]; // ['sale','logistics','accounting','admin']
  // Nếu item này nên mở thành tab (thay vì navigate), cung cấp tab config.
  // Key trùng → focus tab đã mở, không tạo mới.
  tab?: {
    key: string;
    componentId: string;
  };
  /**
   * Paths bổ sung sẽ làm item này HIGHLIGHT (ngoài exact match path chính).
   * Dùng cho menu group có nhiều sub-page (vd Đại lý có 3 tab: partners,
   * partners/requests, bonuses — sidebar "Đại lý" cần sáng cho cả 3).
   * Match bằng startsWith (giống auto-expand-group logic).
   */
  extraActivePaths?: string[];
}

interface MenuGroup {
  title: string;
  icon: React.ReactNode;
  items: MenuItem[];
  collapsible?: boolean;
  executiveOnly?: boolean;       // chỉ BGD (level ≤ 3)
  managerLevelOnly?: boolean;    // BGD + TP + PP (level ≤ 5) — vd Quản lý Dự án
  requirePurchaseAccess?: boolean;
  requireB2BPurchaser?: boolean;
  hiddenByDefault?: boolean;
  allowedEmails?: string[];
  requireSalesRole?: boolean; // true = check getSalesRole
  adminOnly?: boolean;        // CHỈ Admin (vd Vốn vay — dữ liệu tài chính nhạy cảm)
  financeOnly?: boolean;      // Admin / Ban giám đốc / Phòng kế toán (Module Tài chính)
  transportOnly?: boolean;    // Admin / BGĐ / Hành chính / QC (Module Vận tải)
}

// ============================================================
// MENU CONFIG - CẬP NHẬT: Thêm group B2B THU MUA với badge
// ============================================================

const getMenuGroups = (
  pendingApprovals: number = 0,
  pendingOT: number = 0,
  pendingLeave: number = 0,
  unreadB2BCount: number = 0,
  unreadNotifications: number = 0,
): MenuGroup[] => [
  {
    title: 'TỔNG QUAN',
    collapsible: true,
    icon: <LayoutDashboard size={18} />,
    items: [
      { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
      { path: '/notifications', label: 'Thông báo', icon: <Bell size={18} />, badge: unreadNotifications > 0 ? unreadNotifications : undefined },
    ],
  },
  {
    title: 'CHẤM CÔNG',
    icon: <Clock size={18} />,
    collapsible: true,
    items: [
      { path: '/attendance/qr-checkin', label: 'Chấm công QR', icon: <ScanLine size={18} /> },
      { path: '/attendance', label: 'Bảng chấm công', icon: <Clock size={18} /> },
      { path: '/attendance/monthly', label: 'Chấm công tháng', icon: <Calendar size={18} />, managerOnly: true },
      { path: '/operations/coverage', label: 'Coverage live', icon: <Activity size={18} />, managerOnly: true },
      { path: '/shifts', label: 'Quản lý ca', icon: <Timer size={18} />, executiveOnly: true },
      { path: '/shift-assignments', label: 'Phân ca', icon: <CalendarDays size={18} />, managerOnly: true },
      {
        path: '/leave-requests',
        label: 'Nghỉ phép',
        icon: <CalendarClock size={18} />,
        badge: pendingLeave > 0 ? pendingLeave : undefined,
      },
      { path: '/attendance/business-trips', label: 'Đơn công tác', icon: <Briefcase size={18} /> },
      {
        path: '/overtime',
        label: 'Tăng ca',
        icon: <AlarmClockPlus size={18} />,
        badge: pendingOT > 0 ? pendingOT : undefined,
      },
    ],
  },
  {
    title: 'QUẢN LÝ CÔNG VIỆC',
    collapsible: true,
    icon: <ClipboardList size={18} />,
    items: [
      { path: '/tasks', label: 'Danh sách công việc', icon: <ClipboardList size={18} /> },
      { path: '/my-tasks', label: 'Công việc của tôi', icon: <UserCheck size={18} /> },
      {
        path: '/tasks/approve-batch',
        label: 'Phê duyệt',
        icon: <CheckSquare size={18} />,
        managerOnly: true,
        badge: pendingApprovals > 0 ? pendingApprovals : undefined,
      },
      { path: '/task-templates', label: 'Mẫu công việc', icon: <FileText size={18} />, managerOnly: true },
      { path: '/performance', label: 'Hiệu suất', icon: <TrendingUp size={18} />, managerOnly: true },
    ],
  },
  {
    title: 'QUẢN LÝ DỰ ÁN',
    icon: <FolderKanban size={18} />,
    managerLevelOnly: true,    // BGD + TP + PP (level ≤ 5)
    collapsible: true,
    items: [
      { path: '/projects/list', label: 'Danh sách DA', icon: <ListTodo size={18} /> },
      { path: '/projects/new', label: 'Tạo DA mới', icon: <Plus size={18} /> },
      { path: '/projects/gantt', label: 'Gantt tổng hợp', icon: <GanttChart size={18} /> },
      { path: '/projects/resources', label: 'Nguồn lực', icon: <UserCog size={18} /> },
      { path: '/projects/categories', label: 'Loại dự án', icon: <Layers size={18} /> },
      { path: '/projects/templates', label: 'Templates', icon: <Copy size={18} /> },
    ],
  },

  // ============================================================
  // ★ MUA HÀNG — CHỈ HIỆN KHI CÓ PURCHASE ACCESS ★
  // ============================================================
  {
    title: 'MUA HÀNG',
    icon: <ShoppingCart size={18} />,
    collapsible: true,
    requirePurchaseAccess: true,
    hiddenByDefault: true,
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
      { path: '/purchasing/reports', label: 'Báo cáo mua hàng', icon: <TrendingUp size={18} />, requirePurchaseAccess: true },
      { path: '/purchasing/access', label: 'Phân quyền', icon: <Shield size={18} />, bgdOnly: true },
    ],
  },

  // ============================================================
  // ★ B2B THU MUA — CHỈ HIỆN CHO NHÂN VIÊN THU MUA
  // ============================================================
  {
    title: 'B2B THU MUA',
    icon: <MessageSquare size={18} />,
    collapsible: true,
    requireB2BPurchaser: true,
    // 7 items (giảm từ 16) — các page liên quan gom vào tab nội bộ page:
    // Mua hàng: Nhu cầu mua + Deals + Đấu giá (1 menu, 3 tabs)
    // Đại lý: ds + Duyệt đăng ký + Thưởng đại lý (1 menu, 3 tabs)
    // Nhập kho mủ: ds + Phiếu cân đa NM + Nhập tay (1 menu, 3 tabs)
    // Công nợ: sổ + Báo cáo (1 menu, 2 tabs)
    // Dashboard: Tổng quan + Phân tích B2B (1 menu, 2 tabs)
    items: [
      {
        path: '/b2b',
        label: 'Dashboard',
        icon: <LayoutDashboard size={18} />,
        requireB2BPurchaser: true,
        tab: { key: 'b2b-dashboard', componentId: 'b2b-dashboard' },
        extraActivePaths: ['/b2b/analytics'],
      },
      {
        path: '/b2b/chat',
        label: 'Chat Đại lý',
        icon: <MessageSquare size={18} />,
        requireB2BPurchaser: true,
        badge: unreadB2BCount > 0 ? unreadB2BCount : undefined,
        tab: { key: 'b2b-chat-list', componentId: 'b2b-chat-list' },
      },
      {
        path: '/b2b/deals',
        label: 'Deals (Mua hàng)',
        icon: <ShoppingCart size={18} />,
        requireB2BPurchaser: true,
        tab: { key: 'b2b-deal-list', componentId: 'b2b-deal-list' },
        // Đã ẩn Nhu cầu mua + Đấu giá (2026-05) — chỉ còn Deals.
        extraActivePaths: ['/b2b/demands', '/b2b/auctions'],
      },
      {
        path: '/b2b/partners',
        label: 'Đại lý',
        icon: <Users size={18} />,
        requireB2BPurchaser: true,
        tab: { key: 'b2b-partner-list', componentId: 'b2b-partner-list' },
        // Tab section: Danh sách + Chờ duyệt + Thưởng đại lý
        extraActivePaths: ['/b2b/partners/requests', '/b2b/bonuses'],
      },
      {
        path: '/b2b/price-lock',
        label: 'Phiếu chốt giá',
        icon: <Tag size={18} />,
        requireB2BPurchaser: true,
      },
      {
        path: '/b2b/rubber-intake',
        label: 'Nhập kho mủ',
        icon: <FileCheck size={18} />,
        requireB2BPurchaser: true,
        tab: { key: 'b2b-rubber-intake-list', componentId: 'b2b-rubber-intake-list' },
        // Tab section: Phiếu nhập (Lý lịch) + Phiếu cân (đa NM) + Nhập tay
        extraActivePaths: ['/wms/weighbridge/list', '/b2b/intake-manual'],
      },
      {
        path: '/b2b/ledger',
        label: 'Công nợ',
        icon: <BookOpen size={18} />,
        requireB2BPurchaser: true,
        tab: { key: 'b2b-ledger-overview', componentId: 'b2b-ledger-overview' },
        // Tab section: Sổ công nợ + Báo cáo
        extraActivePaths: ['/b2b/reports'],
      },
      {
        path: '/b2b/settlements',
        label: 'Quyết toán',
        icon: <ArrowLeftRight size={18} />,
        requireB2BPurchaser: true,
        tab: { key: 'b2b-settlement-list', componentId: 'b2b-settlement-list' },
      },
      {
        path: '/rubber/payment-requests',
        label: 'Đề nghị thanh toán',
        icon: <Receipt size={18} />,
        requireB2BPurchaser: true,
      },
    ],
  },

  // ============================================================
  // ★ ĐƠN HÀNG BÁN — Quản lý khách hàng quốc tế
  // ============================================================
  {
    title: 'ĐƠN HÀNG BÁN',
    icon: <ShoppingBag size={18} />,
    collapsible: true,
    requireSalesRole: true, // hiện cho tất cả BP liên quan (sale, sx, log, kt, admin)
    items: [
      { path: '/sales/dashboard', label: 'Tổng quan', icon: <BarChart3 size={18} />,
        tab: { key: 'sales-dashboard', componentId: 'sales-dashboard' },
        requireSalesRoles: ['sale', 'logistics', 'accounting', 'admin'] },
      { path: '/sales/customers', label: 'Khách hàng', icon: <Globe size={18} />,
        tab: { key: 'sales-customer-list', componentId: 'sales-customer-list' },
        requireSalesRoles: ['sale', 'accounting', 'admin'] },
      { path: '/sales/orders', label: 'Đơn hàng', icon: <FileText size={18} />,
        tab: { key: 'sales-order-list', componentId: 'sales-order-list' },
        requireSalesRoles: ['sale', 'production', 'logistics', 'accounting', 'admin', 'viewer'] },
      { path: '/sales/contracts/review', label: 'Kiểm tra HĐ', icon: <FileText size={18} />,
        allowedEmails: ['phulv@huyanhrubber.com', 'minhld@huyanhrubber.com', 'sales@huyanhrubber.com', 'yendt@huyanhrubber.com',
          'ahtn@huyanhrubber.com', 'linhlt@huyanhrubber.com', 'tamltt@huyanhrubber.com', 'phungnt@huyanhrubber.com', 'hungtv@huyanhrubber.com'] },
      { path: '/sales/contracts/sign', label: 'Ký HĐ', icon: <FileText size={18} />,
        allowedEmails: ['trunglxh@huyanhrubber.com', 'huylv@huyanhrubber.com'] },
      { path: '/sales/kanban', label: 'Kanban tiến độ', icon: <LayoutDashboard size={18} />,
        tab: { key: 'sales-kanban', componentId: 'sales-kanban' },
        requireSalesRoles: ['sale', 'production', 'logistics', 'accounting', 'admin'] },
    ],
  },

  // ============================================================
  // ============================================================
  // ★ QUẢN LÝ SẢN XUẤT — Module QLSX (chỉ minhld@)
  // ============================================================
  {
    title: 'QUẢN LÝ SẢN XUẤT',
    icon: <Factory size={18} />,
    collapsible: true,
    allowedEmails: ['minhld@huyanhrubber.com'],
    items: [
      { path: '/wms/production', label: 'Lệnh sản xuất', icon: <ClipboardList size={18} /> },
      { path: '/wms/production/dashboard', label: 'Dashboard SX', icon: <TrendingUp size={18} /> },
      { path: '/wms/production/facilities', label: 'Dây chuyền', icon: <Settings size={18} /> },
      { path: '/wms/production/specs', label: 'Công thức BOM', icon: <FileText size={18} /> },
      { path: '/wms/blending', label: 'Phối trộn', icon: <Droplets size={18} /> },
      { path: '/wms/blending/suggest', label: 'Gợi ý trộn', icon: <FlaskConical size={18} /> },
    ],
  },

  // ★ KHO (WMS) — Phase B consolidation: 10 → 8 items, inline tabs trong /wms, /wms/qc, /wms/reports, /wms/config
  // ============================================================
  {
    title: 'KHO (WMS)',
    icon: <Warehouse size={18} />,
    collapsible: true,
    executiveOnly: true,
    items: [
      { path: '/wms', label: 'Tồn kho', icon: <Warehouse size={18} /> }, // tabs: overview | nvl | alerts | stock-check
      { path: '/wms/stock-in', label: 'Nhập kho', icon: <PackagePlus size={18} /> },
      { path: '/wms/stock-out', label: 'Xuất kho', icon: <PackageMinus size={18} /> },
      { path: '/wms/transfer', label: 'Chuyển kho NM', icon: <PackageMinus size={18} /> },
      { path: '/wms/weighbridge/list', label: 'Phiếu cân (đa NM)', icon: <Scale size={18} /> },
      { path: '/wms/qc', label: 'QC / DRC', icon: <FlaskConical size={18} /> }, // tabs: dashboard | recheck | quick-scan | standards
      { path: '/wms/reports', label: 'Báo cáo WMS', icon: <BarChart3 size={18} /> }, // tabs: dashboard | stock-movement | supplier-quality | inventory-value | supplier-scoring
      { path: '/wms/config', label: 'Cấu hình', icon: <Settings size={18} />, allowedEmails: ['minhld@huyanhrubber.com'] }, // tabs: materials | warehouses | settings
    ],
  },

  // ★ VẬN TẢI — Lệnh điều động + Đội xe
  // ============================================================
  {
    title: 'VẬN TẢI',
    icon: <Truck size={18} />,
    collapsible: true,
    transportOnly: true,
    items: [
      { path: '/logistics/dispatch', label: 'Lệnh điều động', icon: <ClipboardList size={18} />,
        tab: { key: 'dispatch-list', componentId: 'dispatch-list' },
        extraActivePaths: ['/logistics/dispatch/new'] },
      { path: '/logistics/fleet/vehicles', label: 'Đội xe', icon: <Truck size={18} />,
        tab: { key: 'fleet-vehicle-list', componentId: 'fleet-vehicle-list' } },
      { path: '/logistics/fleet/drivers', label: 'Tài xế', icon: <UserCheck size={18} />,
        tab: { key: 'fleet-driver-list', componentId: 'fleet-driver-list' } },
    ],
  },

  // ★ TÀI CHÍNH (vốn vay + tiền gửi + phải thu + dòng tiền) — chỉ Admin
  // ============================================================
  {
    title: 'TÀI CHÍNH',
    icon: <Building2 size={18} />,
    collapsible: true,
    financeOnly: true,
    items: [
      { path: '/finance/cashflow', label: 'Dòng tiền tổng hợp', icon: <TrendingUp size={18} /> },
      { path: '/finance/overview', label: 'Vay vốn (vay·lãi·gửi·ĐB)', icon: <CreditCard size={18} />, extraActivePaths: ['/finance/credit-lines', '/finance/loans', '/finance/interest', '/finance/collaterals', '/finance/deposits'] },
      { path: '/finance/receivables', label: 'Phải thu KH', icon: <DollarSign size={18} /> },
      { path: '/finance/cash', label: 'Tồn quỹ & phải nộp', icon: <Banknote size={18} /> },
      { path: '/finance/audit-log', label: 'Nhật ký kiểm toán', icon: <History size={18} />, adminOnly: true },
    ],
  },

  // QUẢN TRỊ: đã gộp vào MUA HÀNG (Phân quyền)
  {
    title: 'BÁO CÁO',
    icon: <BarChart3 size={18} />,
    collapsible: true,
    hiddenByDefault: true,
    items: [
      { path: '/reports/tasks', label: 'Báo cáo công việc', icon: <FileBarChart size={18} />, managerOnly: true },
      { path: '/purchasing/reports', label: 'Báo cáo mua hàng', icon: <TrendingUp size={18} />, managerOnly: true },

    ],
  },
  {
    title: 'CÀI ĐẶT',
    icon: <Settings size={18} />,
    collapsible: true,
    items: [
      { path: '/settings', label: 'Cài đặt tài khoản', icon: <User size={18} /> },
      // Audit Log: chỉ hiện cho admin/BGĐ (executiveOnly = level <= 3)
      { path: '/admin/audit-log', label: 'Audit Log (BGĐ)', icon: <Shield size={18} />, executiveOnly: true },
    ],
  },
];

// ============================================================
// MAIN COMPONENT
// ============================================================

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const openTab = useOpenTab();

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    // Mặc định MỞ: module đang dùng nhiều
    'CHẤM CÔNG': false,
    'ĐƠN HÀNG BÁN': false,
    'KHO (WMS)': false,
    'VẬN TẢI': false,
    // Mặc định ĐÓNG: module ít dùng hàng ngày
    'QUẢN LÝ SẢN XUẤT': true,
    'QUẢN LÝ CÔNG VIỆC': true,
    'QUẢN LÝ DỰ ÁN': true,
    'MUA HÀNG': true,
    'B2B THU MUA': true,
    'BÁO CÁO': true,
    'QUẢN TRỊ': true,
    'CÀI ĐẶT': true,
  });

  // Sidebar thu gọn icon-only (desktop) — nhớ lựa chọn; hover bung tạm thời
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('erp_sidebar_collapsed') === '1' } catch { return false }
  });
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const toggleCollapsed = () => setCollapsed(prev => {
    const next = !prev;
    try { localStorage.setItem('erp_sidebar_collapsed', next ? '1' : '0') } catch { /* ignore */ }
    if (next) setSidebarHovered(false);
    return next;
  });
  const desktopExpanded = !collapsed || sidebarHovered;

  // ★ Purchase access state
  const [hasPurchaseAccess, setHasPurchaseAccess] = useState(false);
  const [loadingPurchaseAccess, setLoadingPurchaseAccess] = useState(false);
  
  // ★ B2B Purchaser state - chỉ cho khuyennt@ và duyhh@
  const [isB2BPurchaser, setIsB2BPurchaser] = useState(false);

  // ★ Sales Role — phân quyền module Đơn hàng bán
  const salesRole = useMemo(() => getSalesRole(user) || '', [user]);
  
  const [pendingOTCount, setPendingOTCount] = useState(0);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
  const [unreadB2BCount, setUnreadB2BCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const ADMIN_EMAILS = ['minhld@huyanhrubber.com'];
  const isAdmin = user?.role === 'admin' || ADMIN_EMAILS.includes(user?.email?.toLowerCase() || '');
  const isFinance = isFinanceUser(user);   // Admin / BGĐ / Phòng kế toán — Module Tài chính
  const userLevel = user?.position_level || (isAdmin ? 1 : 7);
  const isExecutive = isAdmin || userLevel <= 3;
  // VẬN TẢI: Admin / BGĐ (level<=3 hoặc phòng BGĐ) / Hành chính - Tổng hợp / QC / Logistics — theo MÃ phòng
  const deptCode = (user?.department_code || '').toUpperCase();
  const deptNameT = (user?.department_name || '').toLowerCase();
  const TRANSPORT_DEPTS = ['HAP-BGD', 'HAP-HCTH', 'HAP-QC', 'HAP-LOG'];
  const isTransport = isAdmin || userLevel <= 3 || TRANSPORT_DEPTS.includes(deptCode)
    // fallback theo tên (cho phiên đăng nhập cũ chưa có department_code)
    || deptNameT.includes('hành chính') || deptNameT.includes('qc') || deptNameT.includes('logistics');
  const isBGD = isAdmin || userLevel <= 3;
  const isManagerLevel = isAdmin || userLevel <= 5;  // BGD + TP + PP — dùng cho Quản lý Dự án
  const canApproveOT = userLevel >= 4 && userLevel <= 5;
  const isManager = user?.role === 'admin' || user?.role === 'manager' || user?.is_manager;

  // ── ★ Check B2B Purchaser (chỉ 2 email được phép) ──
  useEffect(() => {
    const b2bPurchaserEmails = [
      'khuyennt@huyanhrubber.com',
      'duyhh@huyanhrubber.com',
      'minhld@huyanhrubber.com',
      'trunglxh@huyanhrubber.com',
    ];
    
    if (user?.email && b2bPurchaserEmails.includes(user.email.toLowerCase())) {
      setIsB2BPurchaser(true);
    } else {
      setIsB2BPurchaser(false);
    }
  }, [user?.email]);

  // ── ★ Check purchase access ──
  useEffect(() => {
    const checkPurchaseAccess = async () => {
      try {
        setLoadingPurchaseAccess(true);
        
        // Admin và Executive tự động có quyền
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

  // ── Load pending OT count (unchanged) ──
  useEffect(() => {
    const loadPendingOTCount = async () => {
      if (!user?.employee_id || (!canApproveOT && !isExecutive && !isAdmin)) return;
      try {
        const count = await overtimeRequestService.getPendingCount(user.employee_id);
        setPendingOTCount(count);
      } catch (error) {
        console.error('Failed to load pending OT count:', error);
        setPendingOTCount(0);
      }
    };
    if (user?.employee_id && (canApproveOT || isExecutive || isAdmin)) {
      loadPendingOTCount();
      const interval = setInterval(loadPendingOTCount, 120000);
      return () => clearInterval(interval);
    }
  }, [user?.employee_id, canApproveOT, isExecutive, isAdmin]);

  // ── Load pending leave count (unchanged) ──
  useEffect(() => {
    const loadPendingLeaveCount = async () => {
      if (!user?.employee_id || (!canApproveOT && !isExecutive && !isAdmin)) return;
      try {
        const count = await leaveRequestService.getPendingCount(user.employee_id);
        setPendingLeaveCount(count);
      } catch (error) {
        console.error('Failed to load pending leave count:', error);
        setPendingLeaveCount(0);
      }
    };
    if (user?.employee_id && (canApproveOT || isExecutive || isAdmin)) {
      loadPendingLeaveCount();
      const interval = setInterval(loadPendingLeaveCount, 120000);
      return () => clearInterval(interval);
    }
  }, [user?.employee_id, canApproveOT, isExecutive, isAdmin]);

  // ── ★ Load B2B unread chat count ──
  useEffect(() => {
    const loadB2BUnreadCount = async () => {
      if (!isB2BPurchaser) return;
      try {
        const { count, error } = await supabase
          .from('b2b_chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('sender_type', 'partner')
          .is('read_at', null)
          .is('deleted_at', null);

        if (!error) {
          setUnreadB2BCount(count || 0);
        }
      } catch (error) {
        console.error('Failed to load B2B unread count:', error);
        setUnreadB2BCount(0);
      }
    };

    if (isB2BPurchaser) {
      loadB2BUnreadCount();
      const interval = setInterval(loadB2BUnreadCount, 30000); // Refresh mỗi 30s
      return () => clearInterval(interval);
    }
  }, [isB2BPurchaser]);

  // ── Load avatar from employee record ──
  useEffect(() => {
    const loadAvatar = async () => {
      if (!user?.employee_id) return;
      try {
        const { data } = await supabase
          .from('employees')
          .select('avatar_url')
          .eq('id', user.employee_id)
          .maybeSingle();
        if (data?.avatar_url) setAvatarUrl(data.avatar_url);
      } catch (e) {
        console.error('Failed to load avatar:', e);
      }
    };
    loadAvatar();
  }, [user?.employee_id]);

  // ── Auto-expand active group (unchanged) ──
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

  // ★ Notification count
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  useEffect(() => {
    if (!user?.employee_id) return;
    const load = async () => {
      try {
        const { countUnread } = await import('../../services/notificationHelper');
        const count = await countUnread(user.employee_id!);
        setUnreadNotifCount(count);
      } catch { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [user?.employee_id]);

  const toggleGroup = (title: string) => {
    setCollapsedGroups(prev => ({ ...prev, [title]: !prev[title] }));
  };

  // ── Permission checks — ★ CẬP NHẬT: thêm check requireB2BPurchaser ──
  const isItemVisible = (item: MenuItem): boolean => {
    if (isAdmin) return true;
    if (item.adminOnly) return false;   // chỉ Admin (đã return true ở trên)
    if (item.managerOnly && !isManager) return false;
    if (item.executiveOnly && !isExecutive) return false;
    if (item.bgdOnly && !isBGD) return false;
    if (item.requirePurchaseAccess && !hasPurchaseAccess) return false;
    if (item.requireB2BPurchaser && !isB2BPurchaser) return false;
    if (item.approvalLevel && !canApproveOT && !isExecutive) return false;
    if (item.allowedEmails && !item.allowedEmails.includes(user?.email?.toLowerCase() || '')) return false;
    if (item.requireSalesRoles && !item.requireSalesRoles.includes(salesRole)) return false;
    return true;
  };

  const isGroupVisible = (group: MenuGroup): boolean => {
    if (group.adminOnly && !isAdmin) return false;
    if (group.financeOnly && !isFinance) return false;
    if (group.transportOnly && !isTransport) return false;
    if (group.executiveOnly && !isExecutive && !isAdmin) return false;
    if (group.managerLevelOnly && !isManagerLevel) return false;
    if (group.requirePurchaseAccess && !hasPurchaseAccess && !isAdmin) return false;
    if (group.requireB2BPurchaser && !isB2BPurchaser && !isAdmin) return false;
    if (group.requireSalesRole) {
      if (!hasSalesAccess(user)) return false
    }
    if (group.allowedEmails && !group.allowedEmails.includes(user?.email?.toLowerCase() || '')) return false;
    if (group.hiddenByDefault) {
      const hasActiveChild = group.items.some(item =>
        location.pathname === item.path || location.pathname.startsWith(item.path + '/')
      );
      if (!hasActiveChild) return false;
    }
    return true;
  };

  // ── Build filtered menu (must be AFTER isGroupVisible/isItemVisible) ──
  const allMenuGroups = getMenuGroups(0, pendingOTCount, pendingLeaveCount, unreadB2BCount, unreadNotifCount);
  const menuGroups = allMenuGroups.filter(g =>
    isGroupVisible(g) && g.items.some(item => isItemVisible(item))
  );

  // ══════════════════════════════════════════════════════════
  // RENDER MENU ITEM — NEW DESIGN
  // ══════════════════════════════════════════════════════════

  const renderMenuItem = (item: MenuItem, expanded: boolean = true) => {
    if (!isItemVisible(item)) return null;

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      setIsMobileOpen(false);
      // Nếu item có tab config → mở thành tab thay vì navigate thường
      if (item.tab) {
        e.preventDefault();
        openTab({
          key: item.tab.key,
          title: item.label,
          componentId: item.tab.componentId,
          props: {},
          path: item.path,
        });
      }
    };

    // Custom isActive: match exact path HOẶC bất kỳ extraActivePaths nào
    // (dùng để sidebar item "Đại lý" sáng khi user trên /b2b/bonuses qua tab).
    const computeIsActive = (defaultActive: boolean): boolean => {
      if (defaultActive) return true;
      if (!item.extraActivePaths || item.extraActivePaths.length === 0) return false;
      return item.extraActivePaths.some(p =>
        location.pathname === p || location.pathname.startsWith(p + '/')
      );
    };

    return (
      <li key={item.path}>
        <NavLink
          to={item.path}
          end
          onClick={handleClick}
          title={!expanded ? item.label : undefined}
          className={({ isActive }) => {
            const navIsActive = computeIsActive(isActive);
            return `relative flex items-center ${expanded ? 'justify-between gap-3 px-3' : 'justify-center px-0'} py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 ${
              navIsActive
                ? 'text-[#1B4D3E] bg-[#2D8B6E]/[0.12]'
                : 'text-[#5A6B63] hover:text-[#1B4D3E] hover:bg-black/[0.03]'
            }`;
          }}
        >
          {({ isActive }) => {
            const navIsActive = computeIsActive(isActive);
            return (
            <>
              {/* Active indicator bar */}
              {navIsActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#1B4D3E]" />
              )}
              {expanded ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className={`transition-colors ${navIsActive ? 'text-[#2D8B6E]' : 'text-[#94A3A8]'}`}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge && item.badge > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[20px] text-center leading-tight">
                      {item.badge}
                    </span>
                  )}
                </>
              ) : (
                <span className={`relative transition-colors ${navIsActive ? 'text-[#2D8B6E]' : 'text-[#94A3A8]'}`}>
                  {item.icon}
                  {item.badge && item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
                  )}
                </span>
              )}
            </>
            );
          }}
        </NavLink>
      </li>
    );
  };

  // ══════════════════════════════════════════════════════════
  // SIDEBAR CONTENT — NEW DESIGN
  // ══════════════════════════════════════════════════════════

  const renderSidebarContent = (expanded: boolean) => (
    <>
      {/* ─── LOGO / COMPANY ─── */}
      <div className="p-4 pb-3 border-b border-black/[0.06]">
        <div className={`flex items-center ${expanded ? 'justify-between' : 'justify-center'}`}>
          <div className={`flex items-center ${expanded ? 'gap-3' : ''} min-w-0`}>
            <img
              src={logoImg}
              alt="Huy Anh Logo"
              className="h-9 w-auto flex-shrink-0 object-contain"
            />
            {expanded && (
              <div className="min-w-0">
                <h1 className="text-[13px] font-bold tracking-tight leading-tight" style={{ color: BRAND.primary }}>
                  Công ty TNHH MTV
                </h1>
                <p className="text-[11px] text-[#94A3A8] leading-tight truncate">
                  Cao su Huy Anh Phong Điền
                </p>
              </div>
            )}
          </div>
          {/* Mobile close */}
          {expanded && (
            <button
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#94A3A8] hover:text-[#5A6B63] hover:bg-black/[0.04] rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {/* ─── USER INFO ─── */}
      <div className={`${expanded ? 'px-4' : 'px-2'} py-3 border-b border-black/[0.06]`}>
        <NavLink
          to="/settings"
          onClick={() => setIsMobileOpen(false)}
          title={!expanded ? (user?.full_name || 'Cài đặt') : undefined}
          className={`flex items-center ${expanded ? 'gap-3' : 'justify-center'} group`}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={user?.full_name || ''}
              className="w-9 h-9 rounded-xl object-cover flex-shrink-0 shadow-sm transition-all group-hover:shadow-md"
            />
          ) : (
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm transition-all group-hover:shadow-md"
              style={{ background: `linear-gradient(135deg, ${BRAND.accent}, #F5C563)` }}
            >
              {user?.full_name?.charAt(0) || user?.email?.charAt(0) || '?'}
            </div>
          )}
          {expanded && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-gray-800 truncate group-hover:text-[#1B4D3E] transition-colors">
                  {user?.full_name || user?.email}
                </p>
                <p className="text-[11px] text-[#94A3A8] truncate">
                  {user?.position_name || (
                    user?.role === 'admin' ? 'Quản trị viên' :
                    isManager ? 'Quản lý' : 'Nhân viên'
                  )}
                </p>
              </div>
              <Settings size={15} className="text-[#C8D0CC] group-hover:text-[#2D8B6E] transition-colors flex-shrink-0" />
            </>
          )}
        </NavLink>
      </div>

      {/* ─── NAVIGATION ─── */}
      <nav className={`flex-1 overflow-y-auto overflow-x-hidden py-3 ${expanded ? 'px-2.5' : 'px-2'}`}>
        {menuGroups.map((group) => {
          if (!isGroupVisible(group)) return null;

          const filteredItems = group.items.filter(isItemVisible);
          if (filteredItems.length === 0) return null;

          const isCollapsed = group.collapsible && collapsedGroups[group.title];

          return (
            <div key={group.title} className="mb-1.5">
              {/* Tiêu đề group chỉ hiện khi mở rộng; thu gọn dùng đường kẻ mảnh */}
              {expanded ? (
                group.collapsible ? (
                  <button
                    onClick={() => toggleGroup(group.title)}
                    className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold text-[#B0B8B4] uppercase tracking-[0.08em] hover:text-[#7A8A82] transition-colors rounded-lg"
                  >
                    <span>{group.title}</span>
                    {isCollapsed
                      ? <ChevronRight size={13} className="text-[#C8D0CC]" />
                      : <ChevronDown size={13} className="text-[#C8D0CC]" />
                    }
                  </button>
                ) : (
                  <p className="px-3 py-2 text-[10px] font-semibold text-[#B0B8B4] uppercase tracking-[0.08em]">
                    {group.title}
                  </p>
                )
              ) : (
                <div className="mx-2 my-1.5 border-t border-black/[0.05]" />
              )}

              {(!isCollapsed || !expanded) && (
                <ul className="space-y-0.5">
                  {filteredItems.map((it) => renderMenuItem(it, expanded))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* ─── LOGOUT ─── */}
      <div className={`${expanded ? 'p-3' : 'p-2'} border-t border-black/[0.06]`}>
        <button
          onClick={() => {
            logout();
            setIsMobileOpen(false);
          }}
          title={!expanded ? 'Đăng xuất' : undefined}
          className={`w-full flex items-center justify-center gap-2 ${expanded ? 'px-4' : 'px-0'} py-2.5 text-sm text-[#94A3A8] hover:text-red-500 hover:bg-red-50 rounded-xl transition-all font-medium`}
        >
          <LogOut size={17} />
          {expanded && <span>Đăng xuất</span>}
        </button>
      </div>
    </>
  );

  // ══════════════════════════════════════════════════════════
  // RENDER — NEW DESIGN (light sidebar)
  // ══════════════════════════════════════════════════════════

  return (
    <>
      {/* ─── MOBILE HEADER BAR ─── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-md border-b border-black/[0.06] px-4 flex items-center justify-between" style={{ paddingTop: 'max(0.75rem, var(--safe-top))', paddingBottom: '0.75rem' }}>
        <button
          onClick={() => setIsMobileOpen(true)}
          className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#5A6B63] hover:text-[#1B4D3E] hover:bg-black/[0.04] rounded-xl transition-colors"
        >
          <Menu size={22} />
        </button>
        <div className="flex items-center gap-2">
          <img src={logoImg} alt="Huy Anh" className="h-7 w-auto object-contain" />
        </div>
        <div className="w-10" />
      </div>

      {/* ─── MOBILE OVERLAY ─── */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* ─── DESKTOP SIDEBAR (thu gọn icon-only + hover bung) ─── */}
      <aside
        onMouseEnter={() => { if (collapsed) setSidebarHovered(true); }}
        onMouseLeave={() => setSidebarHovered(false)}
        className={`hidden lg:flex ${desktopExpanded ? 'w-64' : 'w-20'} bg-white/70 backdrop-blur-xl border-r border-black/[0.05] text-gray-800 flex-col min-h-screen fixed left-0 top-0 bottom-0 z-30 transition-[width] duration-500 ease-in-out ${collapsed && sidebarHovered ? 'shadow-2xl' : ''}`}
      >
        {renderSidebarContent(desktopExpanded)}
        {/* Toggle thu gọn / mở rộng */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          className="absolute top-4 -right-3 w-6 h-6 rounded-full bg-white border border-black/10 shadow flex items-center justify-center text-[#5A6B63] hover:text-[#1B4D3E] hover:border-[#2D8B6E]/40 transition-colors z-10"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </aside>

      {/* ─── MOBILE SIDEBAR (slide-in) ─── */}
      <aside
        className={`lg:hidden fixed top-0 left-0 bottom-0 w-72 bg-white/95 backdrop-blur-xl border-r border-black/[0.05] text-gray-800 flex flex-col z-50 transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {renderSidebarContent(true)}
      </aside>

      {/* ─── DESKTOP SPACER ─── (giãn đồng bộ với sidebar → đẩy nội dung, KHÔNG đè) */}
      <div className={`hidden lg:block ${desktopExpanded ? 'w-64' : 'w-20'} flex-shrink-0 transition-[width] duration-500 ease-in-out`} />
    </>
  );
}

export default Sidebar;