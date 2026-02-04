// ============================================================
// NAVIGATION CONFIG - REFACTORED v9 (PHÂN QUYỀN V2)
// File: src/config/navigation.ts
// ============================================================
// CHANGES v9:
// - PHÂN QUYỀN CHI TIẾT cho CHẤM CÔNG V2:
//   • Quản lý ca: executiveOnly (Phó phòng trở lên, level ≤ 5)
//   • Phân ca: requireManager (Trưởng/Phó phòng)
//   • Duyệt tăng ca: requireManager
//   • Bảng chấm công + Tăng ca: Tất cả nhân viên
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
  LucideIcon,
} from 'lucide-react';

// ============================================================
// TYPES
// ============================================================

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number | string;
  /** Chỉ hiển thị cho manager/admin (Trưởng/Phó phòng) */
  requireManager?: boolean;
  /** Chỉ hiển thị cho admin */
  adminOnly?: boolean;
  /** Chỉ hiển thị cho Phó phòng trở lên (level <= 5) */
  executiveOnly?: boolean;
  /** Yêu cầu quyền truy cập module mua hàng */
  requirePurchaseAccess?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  /** Mặc định mở rộng */
  defaultOpen?: boolean;
  /** Chỉ hiển thị cho Phó phòng trở lên */
  executiveOnly?: boolean;
  /** Yêu cầu quyền truy cập module mua hàng */
  requirePurchaseAccess?: boolean;
}

// ============================================================
// NAVIGATION GROUPS
// ============================================================

export const navigationGroups: NavGroup[] = [
  // ===== TỔNG QUAN =====
  {
    title: 'TỔNG QUAN',
    defaultOpen: true,
    items: [
      { label: 'Dashboard', href: '/', icon: LayoutDashboard },
    ],
  },

  // ===== QUẢN LÝ NHÂN SỰ (GOM LẠI) =====
  {
    title: 'QUẢN LÝ NHÂN SỰ',
    defaultOpen: false,
    items: [
      // Tổ chức
      { label: 'Phòng ban', href: '/departments', icon: Building2 },
      { label: 'Chức vụ', href: '/positions', icon: Briefcase },
      { label: 'Nhân viên', href: '/employees', icon: Users },
      // Hợp đồng
      { label: 'Loại hợp đồng', href: '/contract-types', icon: ScrollText },
      { label: 'Hợp đồng', href: '/contracts', icon: FileText },
      // Nghỉ phép
      { label: 'Loại nghỉ phép', href: '/leave-types', icon: Palmtree },
      { label: 'Đơn nghỉ phép', href: '/leave-requests', icon: CalendarClock },
      // Lương
      { label: 'Bậc lương', href: '/salary-grades', icon: Wallet },
      { label: 'Kỳ lương', href: '/payroll-periods', icon: Calendar },
      { label: 'Phiếu lương', href: '/payslips', icon: Receipt },
      // Đánh giá hiệu suất
      { label: 'Tiêu chí đánh giá', href: '/performance-criteria', icon: Target },
      { label: 'Đánh giá hiệu suất', href: '/performance-reviews', icon: Star },
    ],
  },

  // ===== CHẤM CÔNG V2 (PHÂN QUYỀN CHI TIẾT) =====
  {
    title: 'CHẤM CÔNG',
    defaultOpen: true,
    items: [
      // ✅ TẤT CẢ nhân viên xem được
      { label: 'Bảng chấm công', href: '/attendance', icon: Clock },
      // ❌ CHỈ Executive (Phó phòng trở lên, level ≤ 5)
      { label: 'Quản lý ca', href: '/shifts', icon: Timer, executiveOnly: true },
      // ❌ CHỈ Manager (Trưởng/Phó phòng) + Executive
      { label: 'Phân ca', href: '/shift-assignments', icon: CalendarDays, requireManager: true },
      // ✅ TẤT CẢ nhân viên xem được
      { label: 'Tăng ca', href: '/overtime', icon: AlarmClockPlus },
      // ❌ CHỈ Manager + Executive
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

  // ===== MUA HÀNG =====
  {
    title: 'MUA HÀNG',
    defaultOpen: true,
    requirePurchaseAccess: true,
    items: [
      { label: 'Nhà cung cấp', href: '/purchasing/suppliers', icon: Building2, requirePurchaseAccess: true },
      { label: 'Nhóm vật tư', href: '/purchasing/categories', icon: Layers, requirePurchaseAccess: true },
      { label: 'Loại vật tư', href: '/purchasing/types', icon: Tag, requirePurchaseAccess: true },
      { label: 'Đơn vị tính', href: '/purchasing/units', icon: Scale, requirePurchaseAccess: true },
      { label: 'Vật tư', href: '/purchasing/materials', icon: Package, requirePurchaseAccess: true },
      { label: 'Thuộc tính biến thể', href: '/purchasing/variant-attributes', icon: Boxes, requirePurchaseAccess: true },
      { label: 'Đơn đặt hàng', href: '/purchasing/orders', icon: ShoppingCart, requirePurchaseAccess: true },
      { label: 'Công nợ NCC', href: '/purchasing/debt', icon: DollarSign, requirePurchaseAccess: true },
      { label: 'Lịch sử thanh toán', href: '/purchasing/payments', icon: CreditCard, requirePurchaseAccess: true },
    ],
  },

  // ===== BÁO CÁO =====
  {
    title: 'BÁO CÁO',
    defaultOpen: true,
    executiveOnly: true,
    items: [
      { label: 'Báo cáo công việc', href: '/reports/tasks', icon: BarChart3, executiveOnly: true },
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

// ============================================================
// HELPER FUNCTIONS
// ============================================================

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