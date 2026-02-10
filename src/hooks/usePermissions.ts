// ============================================================================
// src/hooks/usePermissions.ts
// Permission Hook - COMPLETE VERSION matching PermissionGate usage
// ============================================================================

import { useMemo } from 'react'
import { useAuthStore } from '../stores/authStore'
import {
  getPermissionGroup,
  isExecutive as checkIsExecutive,
  isManagerLevel,
  canTaskBeEvaluated,
  isTaskLocked,
  getTaskPermissions,
  type TaskForPermission,
  type TaskPermissions,
  type PermissionGroup,
  type UserRole,
} from '../features/tasks/utils/taskPermissions'

// Re-export types
export type { TaskForPermission, TaskPermissions, PermissionGroup, UserRole }

// ============================================================================
// TYPES
// ============================================================================

export interface UsePermissionsReturn {
  // User info
  group: PermissionGroup
  level: number | null
  userRole: UserRole
  userLevel: number | null
  userDepartmentId: string | null
  userEmployeeId: string | null
  isAdmin: boolean
  isManager: boolean
  isLoading: boolean
  
  // Role checks
  isExecutive: boolean
  isEmployee: boolean
  
  // General permission checks - matching PermissionGate usage
  canView: (feature?: string, resourceOwnerId?: string, resourceDeptId?: string) => boolean
  canCreate: (feature?: string, resourceOwnerId?: string, resourceDeptId?: string) => boolean
  canEdit: (feature?: string, resourceOwnerId?: string, resourceDeptId?: string) => boolean
  canDelete: (feature?: string, resourceOwnerId?: string, resourceDeptId?: string) => boolean
  // canApprove for PermissionGate - returns boolean
  canApprove: (feature?: string, resourceDeptId?: string | null) => boolean
  // canApproveTask for task approval - returns object
  canApproveTask: (assignerLevel: number | null, taskDepartmentId: string | null) => { canApprove: boolean; reason?: string }
  
  // Task permission functions
  getPermissions: (task: TaskForPermission) => TaskPermissions
  canAssignTo: (targetDepartmentId: string | null) => { canAssign: boolean; reason?: string }
  canEvaluateTask: (task: TaskForPermission) => boolean
  
  // Helper functions
  isTaskLocked: (evaluationStatus: string | null | undefined) => boolean
  canTaskBeEvaluated: (status: string) => boolean
}

export interface UseTaskPermissionsReturn extends UsePermissionsReturn {}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function usePermissions(): UsePermissionsReturn {
  const { user, isLoading } = useAuthStore()
  
  // Get user info
  const userRole: UserRole = useMemo(() => {
    if (!user?.role) return 'employee'
    if (user.role === 'admin') return 'admin'
    if (user.role === 'manager' || user.is_manager) return 'manager'
    return 'employee'
  }, [user?.role, user?.is_manager])
  
  const userLevel = user?.position_level ?? null
  const userDepartmentId = user?.department_id ?? null
  const userEmployeeId = user?.employee_id ?? null
  const isAdmin = userRole === 'admin'
  const group = getPermissionGroup(userLevel)
  
  // Role checks
  const isExecutive = checkIsExecutive(userLevel)
  const isManager = userRole === 'manager' || userRole === 'admin' || isManagerLevel(userLevel)
  const isEmployee = !isManager && !isAdmin
  
  // General permission checks - matching PermissionGate usage
  const canView = useMemo(() => {
    return (_feature?: string, _resourceOwnerId?: string, resourceDeptId?: string): boolean => {
      // Admin and executives can view everything
      if (isAdmin || isExecutive) return true
      // Managers can view their department
      if (isManager) {
        if (!resourceDeptId) return true
        return resourceDeptId === userDepartmentId
      }
      // Employees can view limited
      return true
    }
  }, [isAdmin, isExecutive, isManager, userDepartmentId])
  
  const canCreate = useMemo(() => {
    return (_feature?: string, _resourceOwnerId?: string, resourceDeptId?: string): boolean => {
      if (isAdmin || isExecutive) return true
      if (isManager) {
        if (!resourceDeptId) return true
        return resourceDeptId === userDepartmentId
      }
      return false
    }
  }, [isAdmin, isExecutive, isManager, userDepartmentId])
  
  const canEdit = useMemo(() => {
    return (_feature?: string, resourceOwnerId?: string, resourceDeptId?: string): boolean => {
      if (isAdmin || isExecutive) return true
      if (isManager) {
        if (!resourceDeptId) return true
        return resourceDeptId === userDepartmentId
      }
      // Employee can edit own resources
      if (resourceOwnerId && resourceOwnerId === userEmployeeId) return true
      return false
    }
  }, [isAdmin, isExecutive, isManager, userDepartmentId, userEmployeeId])
  
  const canDelete = useMemo(() => {
    return (_feature?: string, resourceOwnerId?: string, resourceDeptId?: string): boolean => {
      if (isAdmin || isExecutive) return true
      if (isManager) {
        if (!resourceDeptId) return true
        return resourceDeptId === userDepartmentId
      }
      // Employee can delete own resources (in some cases)
      if (resourceOwnerId && resourceOwnerId === userEmployeeId) return true
      return false
    }
  }, [isAdmin, isExecutive, isManager, userDepartmentId, userEmployeeId])
  
  // canApprove for PermissionGate - returns boolean
  const canApprove = useMemo(() => {
    return (_feature?: string, resourceDeptId?: string | null): boolean => {
      if (isAdmin) return true
      if (!isManagerLevel(userLevel)) return false
      if (isExecutive) return true
      if (!resourceDeptId || resourceDeptId === userDepartmentId) return true
      return false
    }
  }, [userLevel, userDepartmentId, isAdmin, isExecutive])
  
  // canApproveTask for task approval - returns object
  const canApproveTask = useMemo(() => {
    return (_assignerLevel: number | null, taskDepartmentId: string | null): { canApprove: boolean; reason?: string } => {
      if (isAdmin) {
        return { canApprove: true }
      }
      
      if (!isManagerLevel(userLevel)) {
        return { canApprove: false, reason: 'Chỉ quản lý mới có quyền phê duyệt' }
      }
      
      if (isExecutive) {
        return { canApprove: true }
      }
      
      if (taskDepartmentId === userDepartmentId) {
        return { canApprove: true }
      }
      
      return { canApprove: false, reason: 'Không có quyền phê duyệt công việc ngoài phòng ban' }
    }
  }, [userLevel, userDepartmentId, isAdmin, isExecutive])
  
  // Get permissions for a task
  const getPermissions = useMemo(() => {
    return (task: TaskForPermission): TaskPermissions => {
      return getTaskPermissions(
        task,
        userRole,
        userDepartmentId,
        userLevel,
        isAdmin
      )
    }
  }, [userRole, userDepartmentId, userLevel, isAdmin])
  
  // Check if user can assign to a department
  const canAssignTo = useMemo(() => {
    return (targetDepartmentId: string | null): { canAssign: boolean; reason?: string } => {
      if (isAdmin) {
        return { canAssign: true }
      }
      
      if (isExecutive) {
        return { canAssign: true }
      }
      
      if (isManagerLevel(userLevel)) {
        if (!targetDepartmentId || targetDepartmentId === userDepartmentId) {
          return { canAssign: true }
        }
        return { canAssign: false, reason: 'Chỉ có thể giao việc trong phòng ban của mình' }
      }
      
      return { canAssign: false, reason: 'Nhân viên không có quyền giao việc' }
    }
  }, [userLevel, userDepartmentId, isAdmin, isExecutive])
  
  // Check if user can evaluate a task
  const canEvaluateTask = useMemo(() => {
    return (task: TaskForPermission): boolean => {
      if (!canTaskBeEvaluated(task.status)) return false
      if (isTaskLocked(task.evaluation_status)) return false
      return true
    }
  }, [])
  
  return {
    // User info
    group,
    level: userLevel,
    userRole,
    userLevel,
    userDepartmentId,
    userEmployeeId,
    isAdmin,
    isManager,
    isLoading: isLoading ?? false,
    
    // Role checks
    isExecutive,
    isEmployee,
    
    // General permissions
    canView,
    canCreate,
    canEdit,
    canDelete,
    canApprove,
    canApproveTask,
    
    // Task permissions
    getPermissions,
    canAssignTo,
    canEvaluateTask,
    isTaskLocked,
    canTaskBeEvaluated,
  }
}

// Alias for backward compatibility
export function useTaskPermissions(): UseTaskPermissionsReturn {
  return usePermissions()
}

export default usePermissions