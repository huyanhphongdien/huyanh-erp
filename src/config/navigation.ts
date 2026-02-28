// ============================================================
// NAVIGATION CONFIG - UPDATED: PM5 PHÂN BỔ NGUỒN LỰC
// File: src/config/navigation.ts
// ============================================================
// CHANGES:
// - ✅ PM2: Thêm group "QUẢN LÝ DỰ ÁN" với Loại dự án, Templates
// - ✅ PM3: Thêm Danh sách DA, Tạo DA mới
// - ✅ PM4: Thêm Gantt tổng hợp
// - ✅ PM5: Thêm Nguồn lực (Capacity Planning)
// ============================================================

import {
  LayoutDashboard,
  Building2,
  Users,
  Briefcase,
  FileText,
  ScrollText,
  Palmtree,
  CalendarClock,
  Calendar,
  Clock,
  DollarSign,
  Wallet,
  Receipt,
  Target,
  Star,
  ClipboardList,
  CheckSquare,
  UserCheck,
  Settings,
  User,
  BarChart3,
  ShoppingCart,
  Package,
  Layers,
  Tag,
  Scale,
  Boxes,
  CreditCard,
  Timer,
  CalendarDays,
  AlarmClockPlus,
  ClipboardCheck,
  Bell,
  // WMS icons
  Warehouse,
  MapPin,
  PackagePlus,
  PackageMinus,
  // Phase 5: WMS Tồn kho icons
  AlertTriangle,
  // ✅ Phase 6: QC icon
  FlaskConical,
  // ✅ Phase 7: Weighbridge icon
  History,
  // Lý lịch mủ icons
  Droplets,
  FileBarChart,
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
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number | string;
  requireManager?: boolean;
  adminOnly?: boolean;
  executiveOnly?: boolean;
  requirePurchaseAccess?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  defaultOpen?: boolean;
  executiveOnly?: boolean;
  requirePurchaseAccess?: boolean;
}

export const navigationGroups: NavGroup[] = [
  // ===== TỔNG QUAN =====
  {
    title: 'TỔNG QUAN',
    defaultOpen: true,
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
      { label: 'Thông báo', href: '/notifications', icon: Bell },
    ],
  },

  // ===== KHO THÀNH PHẨM (WMS) — Updated Phase 6 =====
  {
    title: 'KHO THÀNH PHẨM',
    defaultOpen: true,
    items: [
      { label: 'Dashboard Kho', href: '/wms', icon: BarChart3 },
      { label: 'Thành phẩm', href: '/wms/materials', icon: Package },
      { label: 'Kho & Vị trí', href: '/wms/warehouses', icon: MapPin },
      { label: 'Nhập kho TP', href: '/wms/stock-in', icon: PackagePlus },
      { label: 'Xuất kho', href: '/wms/stock-out', icon: PackageMinus },
      { label: 'QC & DRC', href: '/wms/qc', icon: FlaskConical },
      { label: 'Cảnh báo', href: '/wms/alerts', icon: AlertTriangle },
      { label: 'Kiểm kê', href: '/wms/stock-check', icon: ClipboardCheck },
      { label: 'Trạm cân', href: '/wms/weighbridge', icon: Scale },
      { label: 'Lịch sử cân', href: '/wms/weighbridge/list', icon: History },
    ],
  },

  // ===== LÝ LỊCH MỦ — Phase 3.5 =====
  {
    title: 'LÝ LỊCH MỦ',
    defaultOpen: true,
    items: [
      { label: 'NCC Mủ', href: '/rubber/suppliers', icon: Users },
      { label: 'Phiếu nhập mủ', href: '/rubber/intake', icon: ClipboardList },
      { label: 'Báo cáo ngày', href: '/rubber/daily-report', icon: FileBarChart },
      { label: 'Công nợ NCC mủ', href: '/rubber/debt', icon: Wallet },
    ],
  },

  // ===== THU MUA MỦ — Phase 3.6 =====
  {
    title: 'THU MUA MỦ',
    defaultOpen: true,
    items: [
      { label: 'Tổng hợp', href: '/rubber/dashboard', icon: PieChart },
      { label: 'Chốt mủ Việt', href: '/rubber/vn/batches', icon: ClipboardList },
      { label: 'Chuyển tiền Lào', href: '/rubber/lao/transfers', icon: ArrowRightLeft },
      { label: 'Thu mua Lào', href: '/rubber/lao/purchases', icon: ShoppingCart },
      { label: 'Xuất kho Lào→NM', href: '/rubber/lao/shipments', icon: Truck },
      { label: 'Lý lịch phiếu', href: '/rubber/profiles', icon: FileCheck },
      { label: 'Quyết toán TT', href: '/rubber/settlements', icon: DollarSign },
    ],
  },

  // ===== QUẢN LÝ NHÂN SỰ =====
  {
    title: 'QUẢN LÝ NHÂN SỰ',
    defaultOpen: false,
    items: [
      { label: 'Phòng ban', href: '/departments', icon: Building2 },
      { label: 'Chức vụ', href: '/positions', icon: Briefcase },
      { label: 'Nhân viên', href: '/employees', icon: Users },
      { label: 'Loại hợp đồng', href: '/contract-types', icon: ScrollText },
      { label: 'Hợp đồng', href: '/contracts', icon: FileText },
      { label: 'Bậc lương', href: '/salary-grades', icon: Wallet },
      { label: 'Kỳ lương', href: '/payroll-periods', icon: Calendar },
      { label: 'Phiếu lương', href: '/payslips', icon: Receipt },
      { label: 'Tiêu chí đánh giá', href: '/performance-criteria', icon: Target },
      { label: 'Đánh giá hiệu suất', href: '/performance-reviews', icon: Star },
      { label: 'Loại nghỉ phép', href: '/leave-types', icon: Palmtree },
    ],
  },

  // ===== CHẤM CÔNG =====
  {
    title: 'CHẤM CÔNG',
    defaultOpen: true,
    items: [
      { label: 'Bảng chấm công', href: '/attendance', icon: Clock },
      { label: 'Quản lý ca', href: '/shifts', icon: Timer, executiveOnly: true },
      { label: 'Phân ca', href: '/shift-assignments', icon: CalendarDays, requireManager: true },
      { label: 'Đơn nghỉ phép', href: '/leave-requests', icon: CalendarClock },
      { label: 'Duyệt nghỉ phép', href: '/leave-approvals', icon: CheckSquare, requireManager: true },
      { label: 'Tăng ca', href: '/overtime', icon: AlarmClockPlus },
      { label: 'Duyệt tăng ca', href: '/overtime/approval', icon: ClipboardCheck, requireManager: true },
    ],
  },

  // ===== QUẢN LÝ CÔNG VIỆC =====
  {
    title: 'QUẢN LÝ CÔNG VIỆC',
    defaultOpen: true,
    items: [
      { label: 'Danh sách công việc', href: '/tasks', icon: ClipboardList },
      { label: 'Công việc của tôi', href: '/my-tasks', icon: UserCheck },
      { label: 'Phê duyệt công việc', href: '/approvals', icon: CheckSquare, requireManager: true },
    ],
  },

  // ===== QUẢN LÝ DỰ ÁN — PM2 + PM3 + PM4 + PM5 =====
  {
    title: 'QUẢN LÝ DỰ ÁN',
    defaultOpen: true,
    items: [
      // ✅ PM3: Danh sách & Tạo mới
      { label: 'Danh sách DA', href: '/projects/list', icon: ListTodo },
      { label: 'Tạo DA mới', href: '/projects/new', icon: Plus },
      // ✅ PM4: Gantt tổng hợp
      { label: 'Gantt tổng hợp', href: '/projects/gantt', icon: GanttChart },
      // ✅ PM5: Phân bổ nguồn lực
      { label: 'Nguồn lực', href: '/projects/resources', icon: UserCog },
      // PM2: Danh mục & Cấu hình
      { label: 'Loại dự án', href: '/projects/categories', icon: Layers },
      { label: 'Templates', href: '/projects/templates', icon: Copy },
    ],
  },

  // ===== MUA HÀNG — TẠM MỞ CHO TẤT CẢ XEM =====
  {
    title: 'MUA HÀNG',
    defaultOpen: true,
    items: [
      { label: 'Nhà cung cấp', href: '/purchasing/suppliers', icon: Building2 },
      { label: 'Nhóm vật tư', href: '/purchasing/categories', icon: Layers },
      { label: 'Loại vật tư', href: '/purchasing/types', icon: Tag },
      { label: 'Đơn vị tính', href: '/purchasing/units', icon: Scale },
      { label: 'Vật tư', href: '/purchasing/materials', icon: Package },
      { label: 'Thuộc tính biến thể', href: '/purchasing/variant-attributes', icon: Boxes },
      { label: 'Đơn đặt hàng', href: '/purchasing/orders', icon: ShoppingCart },
      { label: 'Công nợ NCC', href: '/purchasing/debt', icon: DollarSign },
      { label: 'Lịch sử thanh toán', href: '/purchasing/payments', icon: CreditCard },
      { label: 'Báo cáo mua hàng', href: '/purchasing/reports', icon: TrendingUp },
    ],
  },

  // ===== BÁO CÁO =====
  {
    title: 'BÁO CÁO',
    defaultOpen: true,
    executiveOnly: true,
    items: [
      { label: 'Báo cáo công việc', href: '/reports/tasks', icon: BarChart3, executiveOnly: true },
      { label: 'Báo cáo mua hàng', href: '/purchasing/reports', icon: TrendingUp, executiveOnly: true },
    ],
  },

  // ===== CÀI ĐẶT =====
  {
    title: 'CÀI ĐẶT',
    defaultOpen: true,
    items: [
      { label: 'Cài đặt tài khoản', href: '/settings', icon: User },
    ],
  },
];

export function getAllNavItems(): NavItem[] {
  return navigationGroups.flatMap(group => group.items);
}

export function getNavItemsByRole(
  isManager: boolean, 
  isAdmin: boolean, 
  isExecutive: boolean = false,
  hasPurchaseAccess: boolean = false
): NavGroup[] {
  return navigationGroups
    .filter(group => {
      if (group.executiveOnly && !isExecutive && !isAdmin) return false;
      if (group.requirePurchaseAccess && !hasPurchaseAccess && !isAdmin) return false;
      return true;
    })
    .map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (item.adminOnly && !isAdmin) return false;
        if (item.requireManager && !isManager && !isAdmin) return false;
        if (item.executiveOnly && !isExecutive && !isAdmin) return false;
        if (item.requirePurchaseAccess && !hasPurchaseAccess && !isAdmin) return false;
        return true;
      }),
    }))
    .filter(group => group.items.length > 0);
}

export function findNavItemByHref(href: string): NavItem | undefined {
  return getAllNavItems().find(item => item.href === href);
}

export function getBreadcrumbFromHref(href: string): { group: string; item: string } | null {
  for (const group of navigationGroups) {
    const item = group.items.find(i => i.href === href);
    if (item) {
      return { group: group.title, item: item.label };
    }
  }
  return null;
}

export default navigationGroups;