// ============================================================
// USE PERMISSIONS HOOK
// File: src/hooks/usePermissions.ts
// Huy Anh ERP System - Permission Hook
// ============================================================

import { useMemo } from 'react';
import { useAuthStore } from '../stores/authStore';
import { PERMISSIONS, canAccessMenu, getFeatureFromPath } from '../config/permissions.config';
import type { 
  Feature, 
  DataScope, 
  PermissionGroup, 
  PositionLevel,
  POSITION_LEVEL_TO_GROUP 
} from '../types/permissions';

// ==================== HELPER: Get permission group from level ====================
function getPermissionGroup(level: number | null | undefined): PermissionGroup {
  if (!level) return 'employee';
  
  // Level 1-3: Executive
  if (level >= 1 && level <= 3) return 'executive';
  
  // Level 4-5: Manager
  if (level >= 4 && level <= 5) return 'manager';
  
  // Level 6+: Employee
  return 'employee';
}

// ==================== MAIN HOOK ====================
export function usePermissions() {
  const { user } = useAuthStore();

  // Tính toán permission group từ position level
  const permissionData = useMemo(() => {
    const level = user?.position_level ?? 6;
    const group = getPermissionGroup(level);
    const isAdmin = user?.role === 'admin';
    const departmentId = user?.department_id ?? null;
    const employeeId = user?.employee_id ?? null;

    return {
      level: level as PositionLevel,
      group,
      isAdmin,
      departmentId,
      employeeId,
    };
  }, [user]);

  // ==================== CHECK VIEW PERMISSION ====================
  const canView = (feature: Feature): boolean => {
    if (permissionData.isAdmin) return true;
    
    const featurePerms = PERMISSIONS[feature];
    if (!featurePerms) return false;
    
    const groupPerms = featurePerms[permissionData.group];
    return groupPerms.view !== 'none';
  };

  // ==================== CHECK CREATE PERMISSION ====================
  const canCreate = (feature: Feature): boolean => {
    if (permissionData.isAdmin) return true;
    
    const featurePerms = PERMISSIONS[feature];
    if (!featurePerms) return false;
    
    const groupPerms = featurePerms[permissionData.group];
    return groupPerms.create;
  };

  // ==================== CHECK EDIT PERMISSION ====================
  const canEdit = (feature: Feature, resourceOwnerId?: string, resourceDeptId?: string): boolean => {
    if (permissionData.isAdmin) return true;
    
    const featurePerms = PERMISSIONS[feature];
    if (!featurePerms) return false;
    
    const groupPerms = featurePerms[permissionData.group];
    const scope = groupPerms.edit;
    
    if (scope === 'none') return false;
    if (scope === 'all') return true;
    
    if (scope === 'self') {
      return resourceOwnerId === permissionData.employeeId;
    }
    
    if (scope === 'department') {
      return resourceDeptId === permissionData.departmentId || 
             resourceOwnerId === permissionData.employeeId;
    }
    
    return false;
  };

  // ==================== CHECK DELETE PERMISSION ====================
  const canDelete = (feature: Feature, resourceOwnerId?: string, resourceDeptId?: string): boolean => {
    if (permissionData.isAdmin) return true;
    
    const featurePerms = PERMISSIONS[feature];
    if (!featurePerms) return false;
    
    const groupPerms = featurePerms[permissionData.group];
    const scope = groupPerms.delete;
    
    if (scope === 'none') return false;
    if (scope === 'all') return true;
    
    if (scope === 'self') {
      return resourceOwnerId === permissionData.employeeId;
    }
    
    if (scope === 'department') {
      return resourceDeptId === permissionData.departmentId;
    }
    
    return false;
  };

  // ==================== CHECK APPROVE PERMISSION ====================
  const canApprove = (feature: Feature, resourceDeptId?: string): boolean => {
    if (permissionData.isAdmin) return true;
    
    const featurePerms = PERMISSIONS[feature];
    if (!featurePerms) return false;
    
    const groupPerms = featurePerms[permissionData.group];
    const scope = groupPerms.approve;
    
    if (scope === 'none') return false;
    if (scope === 'all') return true;
    
    if (scope === 'department') {
      return resourceDeptId === permissionData.departmentId;
    }
    
    return false;
  };

  // ==================== GET DATA SCOPE ====================
  // Trả về phạm vi dữ liệu cho một feature
  const getDataScope = (feature: Feature): DataScope => {
    if (permissionData.isAdmin) return 'all';
    
    const featurePerms = PERMISSIONS[feature];
    if (!featurePerms) return 'none';
    
    const groupPerms = featurePerms[permissionData.group];
    return groupPerms.view;
  };

  // ==================== CHECK MENU ACCESS ====================
  const checkMenuAccess = (path: string): boolean => {
    return canAccessMenu(path, permissionData.group, permissionData.isAdmin);
  };

  // ==================== GET PERMISSION FOR FEATURE ====================
  const getFeaturePermissions = (feature: Feature) => {
    if (permissionData.isAdmin) {
      return {
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canApprove: true,
        dataScope: 'all' as DataScope,
      };
    }
    
    const featurePerms = PERMISSIONS[feature];
    if (!featurePerms) {
      return {
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        dataScope: 'none' as DataScope,
      };
    }
    
    const groupPerms = featurePerms[permissionData.group];
    
    return {
      canView: groupPerms.view !== 'none',
      canCreate: groupPerms.create,
      canEdit: groupPerms.edit !== 'none',
      canDelete: groupPerms.delete !== 'none',
      canApprove: groupPerms.approve !== 'none',
      dataScope: groupPerms.view,
    };
  };

  // ==================== HELPER: Build query filter ====================
  // Trả về filter object cho Supabase query
  const buildDataFilter = (feature: Feature): { 
    filterField?: string; 
    filterValue?: string | null;
    noFilter?: boolean;
  } => {
    const scope = getDataScope(feature);
    
    if (scope === 'all' || scope === 'none') {
      return { noFilter: scope === 'all' };
    }
    
    if (scope === 'self') {
      return { filterField: 'employee_id', filterValue: permissionData.employeeId };
    }
    
    if (scope === 'department') {
      return { filterField: 'department_id', filterValue: permissionData.departmentId };
    }
    
    return { noFilter: true };
  };

  return {
    // User info
    user,
    ...permissionData,
    
    // Permission checks
    canView,
    canCreate,
    canEdit,
    canDelete,
    canApprove,
    
    // Scope & filters
    getDataScope,
    buildDataFilter,
    getFeaturePermissions,
    
    // Menu access
    checkMenuAccess,
    
    // Quick checks
    isExecutive: permissionData.group === 'executive' || permissionData.isAdmin,
    isManager: permissionData.group === 'manager' || permissionData.group === 'executive' || permissionData.isAdmin,
    isEmployee: permissionData.group === 'employee',
  };
}

export default usePermissions;
