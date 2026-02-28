// ============================================================
// PERMISSIONS CONFIG - CẬP NHẬT CHẤM CÔNG V2
// File: src/config/permissions.config.ts
// Huy Anh ERP System - Permission Matrix Configuration
// ============================================================
// CẬP NHẬT V2:
// - THÊM: shifts, shift-assignments, overtime, overtime-approval
// - Quản lý ca: Executive only (Phó phòng trở lên, level ≤ 5)
// - Phân ca: Manager (Trưởng/Phó phòng) + Executive
// - Tăng ca: Tất cả nhân viên
// - Duyệt tăng ca: Manager + Executive
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

  // ===== NGHỈ PHÉP =====
  'leave-types': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'none' },
    manager: { view: 'all', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
  },
  'leave-requests': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'all' },
    manager: { view: 'department', create: true, edit: 'department', delete: 'self', approve: 'department' },
    employee: { view: 'self', create: true, edit: 'self', delete: 'self', approve: 'none' },
  },

  // ===== CHẤM CÔNG V2 =====
  'attendance': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'none' },
    manager: { view: 'department', create: true, edit: 'self', delete: 'none', approve: 'none' },
    employee: { view: 'self', create: true, edit: 'self', delete: 'none', approve: 'none' },
  },
  // Quản lý ca: CHỈ Executive (Phó phòng trở lên, level ≤ 5)
  'shifts': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'none' },
    manager: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
  },
  // Phân ca: Manager (Trưởng/Phó phòng) + Executive
  'shift-assignments': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'none' },
    manager: { view: 'department', create: true, edit: 'department', delete: 'department', approve: 'none' },
    employee: { view: 'self', create: false, edit: 'none', delete: 'none', approve: 'none' },
  },
  // Tăng ca: Tất cả đều có thể xem và tạo
  'overtime': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'none' },
    manager: { view: 'department', create: true, edit: 'self', delete: 'self', approve: 'none' },
    employee: { view: 'self', create: true, edit: 'self', delete: 'self', approve: 'none' },
  },
  // Duyệt tăng ca: CHỈ Manager + Executive
  'overtime-approval': {
    executive: { view: 'all', create: false, edit: 'all', delete: 'none', approve: 'all' },
    manager: { view: 'department', create: false, edit: 'department', delete: 'none', approve: 'department' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
  },

  // ===== LƯƠNG =====
  'salary-grades': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'none' },
    manager: { view: 'all', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
  },
  'payroll-periods': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'all' },
    manager: { view: 'all', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
  },
  'payslips': {
    executive: { view: 'all', create: true, edit: 'all', delete: 'all', approve: 'all' },
    manager: { view: 'department', create: false, edit: 'none', delete: 'none', approve: 'none' },
    employee: { view: 'self', create: false, edit: 'none', delete: 'none', approve: 'none' },
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
    employee: { 
      view: 'department',
      create: true,
      edit: 'self',
      delete: 'self',
      approve: 'none'
    },
  },
  'my-tasks': {
    executive: { view: 'all', create: true, edit: 'self', delete: 'none', approve: 'none' },
    manager: { view: 'all', create: true, edit: 'self', delete: 'none', approve: 'none' },
    employee: { view: 'all', create: true, edit: 'self', delete: 'none', approve: 'none' },
  },
  'approvals': {
    executive: { view: 'all', create: false, edit: 'all', delete: 'none', approve: 'all' },
    manager: { view: 'department', create: false, edit: 'department', delete: 'none', approve: 'department' },
    employee: { view: 'none', create: false, edit: 'none', delete: 'none', approve: 'none' },
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
  
  // NGHỈ PHÉP
  { path: '/leave-types', groups: ['executive', 'manager'] },
  { path: '/leave-requests' },  // Hiện cho tất cả

  // ===== CHẤM CÔNG V2 =====
  { path: '/attendance' },                                        // Hiện cho tất cả
  { path: '/shifts', groups: ['executive'] },                     // CHỈ Executive
  { path: '/shift-assignments', groups: ['executive', 'manager'] }, // Manager + Executive
  { path: '/overtime' },                                          // Hiện cho tất cả
  { path: '/overtime/approval', groups: ['executive', 'manager'] }, // Manager + Executive
  
  // LƯƠNG
  { path: '/salary-grades', groups: ['executive', 'manager'] },
  { path: '/payroll-periods', groups: ['executive', 'manager'] },
  { path: '/payslips' },  // Hiện cho tất cả
  
  // ĐÁNH GIÁ HIỆU SUẤT - Ẩn toàn bộ với employee
  { path: '/performance-criteria', groups: ['executive', 'manager'] },
  { path: '/performance-reviews', groups: ['executive', 'manager'] },
  
  // QUẢN LÝ CÔNG VIỆC
  { path: '/tasks' },
  { path: '/my-tasks' },
  { path: '/approvals', groups: ['executive', 'manager'] },
  
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
    '/shifts': 'shifts',
    '/shift-assignments': 'shift-assignments',
    '/overtime': 'overtime',
    '/overtime/approval': 'overtime-approval',
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