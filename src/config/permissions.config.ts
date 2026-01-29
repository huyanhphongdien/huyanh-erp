// ============================================================
// PERMISSIONS CONFIG
// File: src/config/permissions.config.ts
// Huy Anh ERP System - Permission Matrix Configuration
// ============================================================
// CẬP NHẬT:
// - Employee có thể xem công việc trong phòng ban (view: 'department')
// - Employee có thể tạo công việc cá nhân (create: true)
// - Employee có thể sửa công việc của mình (edit: 'self')
// ============================================================

import type { 
  Feature, 
  PermissionGroup, 
  FeaturePermission, 
  PermissionConfig,
  MenuVisibility 
} from '../types/permissions';

// ==================== PERMISSION MATRIX ====================
// Định nghĩa chi tiết quyền cho từng feature theo group

export const PERMISSIONS: PermissionConfig = {
  // ===== TỔ CHỨC - Ẩn toàn bộ với Employee =====
  'departments': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'none' },
    manager: { view: 'all', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
  },
  'positions': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'none' },
    manager: { view: 'all', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
  },
  'employees': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'none' },
    manager: { view: 'department', create: false, edit: 'department', delete: 'none', approve: 'none' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
  },

  // ===== HỢP ĐỒNG - Ẩn toàn bộ với Employee =====
  'contract-types': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'none' },
    manager: { view: 'all', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
  },
  'contracts': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'none' },
    manager: { view: 'department', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
  },

  // ===== NGHỈ PHÉP & CHẤM CÔNG =====
  'leave-types': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'none' },
    manager: { view: 'all', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' }, // Ẩn
  },
  'leave-requests': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'all' },
    manager: { view: 'department', create: true, edit: 'department', delete: 'self', approve: 'department' },
    employee: { view: 'self', create: true, edit: 'self', delete: 'self', approve: 'none' }, // HIỆN
  },
  'attendance': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'none' },
    manager: { view: 'department', create: true, edit: 'self', delete: 'none', approve: 'none' },
    employee: { view: 'self', create: true, edit: 'self', delete: 'none', approve: 'none' }, // HIỆN
  },

  // ===== LƯƠNG =====
  'salary-grades': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'none' },
    manager: { view: 'all', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' }, // Ẩn
  },
  'payroll-periods': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'all' },
    manager: { view: 'all', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' }, // Ẩn
  },
  'payslips': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'all' },
    manager: { view: 'department', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'self', create: false, edit: 'none', delete: 'none', approve: 'none' }, // HIỆN
  },

  // ===== ĐÁNH GIÁ HIỆU SUẤT - Ẩn toàn bộ với Employee =====
  'performance-criteria': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'none' },
    manager: { view: 'all', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
  },
  'performance-reviews': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'all' },
    manager: { view: 'department', create: true, edit: 'department', delete: 'none', approve: 'department' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
  },

  // ===== QUẢN LÝ CÔNG VIỆC =====
  'tasks': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'all' },
    manager: { view: 'department', create: true, edit: 'department', delete: 'department', approve: 'department' },
    // ========== ĐÃ SỬA: Employee có thể xem phòng ban và tạo việc cá nhân ==========
    employee: { 
      view: 'department',  // Xem công việc trong phòng ban
      create: true,        // Tạo công việc cá nhân (tự giao cho mình)
      edit: 'self',        // Sửa công việc của mình
      delete: 'self',      // Xóa công việc của mình (chỉ draft)
      approve: 'none'      // Không có quyền phê duyệt
    },
  },
  'my-tasks': {
    executive: { view: 'all', create: true, edit: 'self', delete: 'none', approve: 'none' },
    manager: { view: 'all', create: true, edit: 'self', delete: 'none', approve: 'none' },
    employee: { view: 'all', create: true, edit: 'self', delete: 'none', approve: 'none' }, // HIỆN - Đã thêm create: true
  },
  'approvals': {
    executive: { view: 'all', create: false, edit: 'all', delete: 'none', approve: 'all' },
    manager: { view: 'department', create: false, edit: 'department', delete: 'none', approve: 'department' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' }, // Ẩn
  },

  // ===== BÁO CÁO =====
  'reports-tasks': {
    executive: { view: 'all', create: false, edit: 'none', delete: 'none', approve: 'none' },
    manager: { view: 'department', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
  },
  'reports-hr': {
    executive: { view: 'all', create: false, edit: 'none', delete: 'none', approve: 'none' },
    manager: { view: 'department', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
  },
};

// ==================== MENU VISIBILITY CONFIG ====================
export const MENU_CONFIG: MenuVisibility[] = [
  // TỔ CHỨC - Ẩn với employee
  { path: '/departments', groups: ['executive', 'manager'] },
  { path: '/positions', groups: ['executive', 'manager'] },
  { path: '/employees', groups: ['executive', 'manager'] },
  
  // HỢP ĐỒNG - Ẩn toàn bộ với employee
  { path: '/contract-types', groups: ['executive', 'manager'] },
  { path: '/contracts', groups: ['executive', 'manager'] },
  
  // NGHỈ PHÉP & CHẤM CÔNG
  { path: '/leave-types', groups: ['executive', 'manager'] },  // Ẩn với employee
  { path: '/leave-requests' },  // Hiện cho tất cả
  { path: '/attendance' },       // Hiện cho tất cả
  
  // LƯƠNG
  { path: '/salary-grades', groups: ['executive', 'manager'] },
  { path: '/payroll-periods', groups: ['executive', 'manager'] },
  { path: '/payslips' },  // Hiện cho tất cả
  
  // ĐÁNH GIÁ HIỆU SUẤT - Ẩn toàn bộ với employee
  { path: '/performance-criteria', groups: ['executive', 'manager'] },
  { path: '/performance-reviews', groups: ['executive', 'manager'] },
  
  // QUẢN LÝ CÔNG VIỆC
  // ========== ĐÃ SỬA: Bỏ giới hạn groups để employee có thể xem ==========
  { path: '/tasks' },  // Hiện cho tất cả (employee xem công việc phòng ban)
  { path: '/my-tasks' },  // Hiện cho tất cả
  { path: '/approvals', groups: ['executive', 'manager'] },  // Chỉ manager+ mới phê duyệt
  
  // BÁO CÁO
  { path: '/reports/tasks', groups: ['executive', 'manager'] },
];

// ==================== HELPER FUNCTIONS ====================
export function getFeatureFromPath(path: string): Feature | null {
  const pathToFeature: Record<string, Feature> = {
    '/departments': 'departments',
    '/positions': 'positions',
    '/employees': 'employees',
    '/contract-types': 'contract-types',
    '/contracts': 'contracts',
    '/leave-types': 'leave-types',
    '/leave-requests': 'leave-requests',
    '/attendance': 'attendance',
    '/salary-grades': 'salary-grades',
    '/payroll-periods': 'payroll-periods',
    '/payslips': 'payslips',
    '/performance-criteria': 'performance-criteria',
    '/performance-reviews': 'performance-reviews',
    '/tasks': 'tasks',
    '/my-tasks': 'my-tasks',
    '/approvals': 'approvals',
    '/reports/tasks': 'reports-tasks',
  };
  
  return pathToFeature[path] || null;
}

export function canAccessMenu(
  path: string, 
  group: PermissionGroup, 
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  
  const menuConfig = MENU_CONFIG.find(m => m.path === path);
  if (!menuConfig) return true;
  if (menuConfig.adminOnly) return false;
  if (menuConfig.groups) {
    return menuConfig.groups.includes(group);
  }
  
  return true;
}