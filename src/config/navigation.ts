// ============================================================
// NAVIGATION CONFIG - REFACTORED
// File: src/config/navigation.ts
// ============================================================
// CHANGES:
// - Xóa "Tự đánh giá" (đã gộp vào "Công việc của tôi")
// - Xóa "Tạo công việc" riêng (đã có trong trang Danh sách)
// - Gọn gàng hơn, tập trung vào các entry points chính
// ============================================================

import {
  LayoutDashboard,
  Building2,
  Users,
  Briefcase,
  FileText,
  Calendar,
  Clock,
  DollarSign,
  ClipboardList,
  CheckSquare,
  UserCheck,
  Star,
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
  /** Chỉ hiển thị cho manager/admin */
  requireManager?: boolean;
  /** Chỉ hiển thị cho admin */
  adminOnly?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  /** Mặc định mở rộng */
  defaultOpen?: boolean;
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
      {
        label: 'Dashboard',
        href: '/',
        icon: LayoutDashboard,
      },
    ],
  },

  // ===== TỔ CHỨC =====
  {
    title: 'TỔ CHỨC',
    defaultOpen: false,
    items: [
      {
        label: 'Phòng ban',
        href: '/departments',
        icon: Building2,
      },
      {
        label: 'Chức vụ',
        href: '/positions',
        icon: Briefcase,
      },
      {
        label: 'Nhân viên',
        href: '/employees',
        icon: Users,
      },
    ],
  },

  // ===== HỢP ĐỒNG =====
  {
    title: 'HỢP ĐỒNG',
    defaultOpen: false,
    items: [
      {
        label: 'Loại hợp đồng',
        href: '/contract-types',
        icon: FileText,
      },
      {
        label: 'Hợp đồng',
        href: '/contracts',
        icon: FileText,
      },
    ],
  },

  // ===== NGHỈ PHÉP & CHẤM CÔNG =====
  {
    title: 'NGHỈ PHÉP & CHẤM CÔNG',
    defaultOpen: false,
    items: [
      {
        label: 'Loại nghỉ phép',
        href: '/leave-types',
        icon: Calendar,
      },
      {
        label: 'Đơn nghỉ phép',
        href: '/leave-requests',
        icon: Calendar,
      },
      {
        label: 'Chấm công',
        href: '/attendance',
        icon: Clock,
      },
    ],
  },

  // ===== LƯƠNG =====
  {
    title: 'LƯƠNG',
    defaultOpen: false,
    items: [
      {
        label: 'Bậc lương',
        href: '/salary-grades',
        icon: DollarSign,
      },
      {
        label: 'Kỳ lương',
        href: '/payroll-periods',
        icon: DollarSign,
      },
      {
        label: 'Phiếu lương',
        href: '/payslips',
        icon: FileText,
      },
    ],
  },

  // ===== ĐÁNH GIÁ HIỆU SUẤT =====
  {
    title: 'ĐÁNH GIÁ HIỆU SUẤT',
    defaultOpen: false,
    items: [
      {
        label: 'Tiêu chí đánh giá',
        href: '/performance-criteria',
        icon: Star,
      },
      {
        label: 'Đánh giá nhân viên',
        href: '/performance-reviews',
        icon: Star,
      },
    ],
  },

  // ===== QUẢN LÝ CÔNG VIỆC (REFACTORED - GỌN HƠN) =====
  {
    title: 'QUẢN LÝ CÔNG VIỆC',
    defaultOpen: true,
    items: [
      // Danh sách công việc - Manager only (có nút + tạo mới bên trong)
      {
        label: 'Danh sách công việc',
        href: '/tasks',
        icon: ClipboardList,
        requireManager: true,
      },
      // Công việc của tôi - Entry point chính cho nhân viên
      // Đã gộp: Tự đánh giá + Kết quả đánh giá (tabs trong page)
      {
        label: 'Công việc của tôi',
        href: '/my-tasks',
        icon: UserCheck,
      },
      // ĐÃ XÓA: Tự đánh giá (gộp vào Công việc của tôi)
      // ĐÃ XÓA: Kết quả đánh giá (gộp vào Công việc của tôi - tab Đã duyệt)
      // Phê duyệt - Manager only
      {
        label: 'Phê duyệt công việc',
        href: '/approvals',
        icon: CheckSquare,
        requireManager: true,
      },
    ],
  },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Lấy tất cả nav items (flat)
 */
export function getAllNavItems(): NavItem[] {
  return navigationGroups.flatMap(group => group.items);
}

/**
 * Lọc nav items theo role
 */
export function getNavItemsByRole(isManager: boolean, isAdmin: boolean): NavGroup[] {
  return navigationGroups.map(group => ({
    ...group,
    items: group.items.filter(item => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.requireManager && !isManager && !isAdmin) return false;
      return true;
    }),
  })).filter(group => group.items.length > 0);
}

/**
 * Tìm nav item theo href
 */
export function findNavItemByHref(href: string): NavItem | undefined {
  return getAllNavItems().find(item => item.href === href);
}

/**
 * Lấy breadcrumb từ href
 */
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