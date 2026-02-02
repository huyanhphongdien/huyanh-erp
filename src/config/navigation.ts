// ============================================================
// NAVIGATION CONFIG - REFACTORED v2
// File: src/config/navigation.ts
// ============================================================
// CHANGES:
// - Xóa "Tự đánh giá" (đã gộp vào "Công việc của tôi")
// - Xóa "Tạo công việc" riêng (đã có trong trang Danh sách)
// - Gọn gàng hơn, tập trung vào các entry points chính
// - THÊM MỚI: CÀI ĐẶT TÀI KHOẢN cho tất cả user
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
  Settings,
  User,
  BarChart3,
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
  /** Chỉ hiển thị cho Phó phòng trở lên (level <= 5) */
  executiveOnly?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  /** Mặc định mở rộng */
  defaultOpen?: boolean;
  /** Chỉ hiển thị cho Phó phòng trở lên */
  executiveOnly?: boolean;
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
      // Danh sách công việc - Tất cả user có thể xem
      {
        label: 'Danh sách công việc',
        href: '/tasks',
        icon: ClipboardList,
      },
      // Công việc của tôi - Entry point chính cho nhân viên
      // Đã gộp: Tự đánh giá + Kết quả đánh giá (tabs trong page)
      {
        label: 'Công việc của tôi',
        href: '/my-tasks',
        icon: UserCheck,
      },
      // Phê duyệt - Manager only
      {
        label: 'Phê duyệt công việc',
        href: '/approvals',
        icon: CheckSquare,
        requireManager: true,
      },
    ],
  },

  // ===== BÁO CÁO - CHỈ CHO PHÓ PHÒNG TRỞ LÊN =====
  {
    title: 'BÁO CÁO',
    defaultOpen: true,
    executiveOnly: true,
    items: [
      {
        label: 'Báo cáo công việc',
        href: '/reports/tasks',
        icon: BarChart3,
        executiveOnly: true,
      },
    ],
  },

  // ===== CÀI ĐẶT - TẤT CẢ USER =====
  {
    title: 'CÀI ĐẶT',
    defaultOpen: true,
    items: [
      {
        label: 'Cài đặt tài khoản',
        href: '/settings',
        icon: User,
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
export function getNavItemsByRole(
  isManager: boolean, 
  isAdmin: boolean, 
  isExecutive: boolean = false
): NavGroup[] {
  return navigationGroups
    .filter(group => {
      // Filter out executive-only groups for non-executives
      if (group.executiveOnly && !isExecutive && !isAdmin) return false;
      return true;
    })
    .map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (item.adminOnly && !isAdmin) return false;
        if (item.requireManager && !isManager && !isAdmin) return false;
        if (item.executiveOnly && !isExecutive && !isAdmin) return false;
        return true;
      }),
    }))
    .filter(group => group.items.length > 0);
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