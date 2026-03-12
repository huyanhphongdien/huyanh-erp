// ============================================================
// PERMISSION TYPES
// File: src/types/permissions.ts
// Huy Anh ERP System - Permission System
// ============================================================
// CẬP NHẬT V2:
// - THÊM: shifts, shift-assignments, overtime, overtime-approval
// ============================================================

// ==================== POSITION LEVELS ====================
// Level 1: Giám đốc
// Level 2: Phó Giám đốc
// Level 3: Trợ lý Ban giám đốc
// Level 4: Trưởng phòng
// Level 5: Phó phòng
// Level 6: Nhân viên

export type PositionLevel = 1 | 2 | 3 | 4 | 5 | 6;

// ==================== PERMISSION GROUPS ====================
export type PermissionGroup = 'executive' | 'manager' | 'employee';

export const POSITION_LEVEL_TO_GROUP: Record<PositionLevel, PermissionGroup> = {
  1: 'executive',  // Giám đốc
  2: 'executive',  // Phó Giám đốc
  3: 'executive',  // Trợ lý BGĐ
  4: 'manager',    // Trưởng phòng
  5: 'manager',    // Phó phòng
  6: 'employee',   // Nhân viên
};

// ==================== DATA SCOPE ====================
// Phạm vi dữ liệu được phép truy cập
export type DataScope = 'self' | 'department' | 'all' | 'none';

// ==================== ACTIONS ====================
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve';

// ==================== FEATURES ====================
// Danh sách các tính năng trong hệ thống
export type Feature =
  // Tổ chức
  | 'departments'
  | 'positions'
  | 'employees'
  // Hợp đồng
  | 'contract-types'
  | 'contracts'
  // Nghỉ phép
  | 'leave-types'
  | 'leave-requests'
  // Chấm công V2
  | 'attendance'
  | 'shifts'
  | 'shift-assignments'
  | 'overtime'
  | 'overtime-approval'
  // Lương
  | 'salary-grades'
  | 'payroll-periods'
  | 'payslips'
  // Đánh giá hiệu suất
  | 'performance-criteria'
  | 'performance-reviews'
  // Quản lý công việc
  | 'tasks'
  | 'my-tasks'
  | 'approvals'
  // Báo cáo
  | 'reports-tasks'
  | 'reports-hr';

// ==================== FEATURE PERMISSION ====================
export interface FeaturePermission {
  view: DataScope;
  create: boolean;
  edit: DataScope;
  delete: DataScope;
  approve: DataScope;
}

// ==================== PERMISSION CONFIG ====================
export type PermissionConfig = {
  [key in Feature]: {
    [group in PermissionGroup]: FeaturePermission;
  };
};

// ==================== MENU VISIBILITY ====================
export interface MenuVisibility {
  path: string;
  minLevel?: PositionLevel;  // Level tối thiểu để xem (số nhỏ = cao hơn)
  maxLevel?: PositionLevel;  // Level tối đa để xem
  groups?: PermissionGroup[]; // Hoặc chỉ định theo group
  adminOnly?: boolean;
}

// ==================== USER PERMISSIONS ====================
export interface UserPermissions {
  group: PermissionGroup;
  level: PositionLevel;
  isAdmin: boolean;
  departmentId: string | null;
  employeeId: string | null;
}