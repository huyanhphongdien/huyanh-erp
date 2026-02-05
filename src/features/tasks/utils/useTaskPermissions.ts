// ============================================================================
// src/features/tasks/utils/useTaskPermissions.ts
// Task Permission Hook - v3
// Now passes userEmployeeId to getTaskPermissions
// ============================================================================

import { useMemo } from 'react'
import { useAuthStore } from '../../../stores/authStore'
import {
  getTaskPermissions,
  getPermissionGroup,
  isExecutive as checkIsExecutive,
  isManagerLevel,
  canTaskBeEvaluated,
  isTaskLocked,
  type TaskForPermission,
  type TaskPermissions,
  type PermissionGroup,
  type UserRole,
} from './taskPermissions'

// Re-export types
export type { TaskForPermission, TaskPermissions, PermissionGroup, UserRole }

// ============================================================================
// TYPES
// ============================================================================

export interface UseTaskPermissionsReturn {
  // User info
  userRole: UserRole
  userGroup: PermissionGroup
  userLevel: number | null
  userDepartmentId: string | null
  userEmployeeId: string | null
  isAdmin: boolean
  isLoading: boolean
  
  // Role checks
  isExecutive: boolean
  isManager: boolean
  isEmployee: boolean
  
  // Permission check functions
  getPermissions: (task: TaskForPermission) => TaskPermissions
  canApprove: (assignerLevel: number | null, taskDepartmentId: string | null) => { canApprove: boolean; reason?: string }
  canApproveTask: (assignerLevel: number | null, taskDepartmentId: string | null) => { canApprove: boolean; reason?: string }
  canAssignTo: (targetDepartmentId: string | null) => { canAssign: boolean; reason?: string }
  canEvaluateTask: (task: TaskForPermission) => boolean
  
  // Helper functions
  isTaskLocked: (evaluationStatus: string | null | undefined) => boolean
  canTaskBeEvaluated: (status: string) => boolean
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useTaskPermissions(): UseTaskPermissionsReturn {
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
  const userGroup = getPermissionGroup(userLevel)
  
  // Role checks
  const isExecutive = checkIsExecutive(userLevel)
  const isManager = userRole === 'manager' || userRole === 'admin' || isManagerLevel(userLevel)
  const isEmployee = !isManager && !isAdmin
  
  // Get permissions for a task — now passes userEmployeeId
  const getPermissions = useMemo(() => {
    return (task: TaskForPermission): TaskPermissions => {
      return getTaskPermissions(
        task,
        userRole,
        userDepartmentId,
        userLevel,
        isAdmin,
        userEmployeeId  // ← NEW in v3
      )
    }
  }, [userRole, userDepartmentId, userLevel, isAdmin, userEmployeeId])
  
  // Check if user can approve a task
  const canApprove = useMemo(() => {
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
    userRole,
    userGroup,
    userLevel,
    userDepartmentId,
    userEmployeeId,
    isAdmin,
    isLoading: isLoading ?? false,
    
    // Role checks
    isExecutive,
    isManager,
    isEmployee,
    
    // Functions
    getPermissions,
    canApprove,
    canApproveTask: canApprove,
    canAssignTo,
    canEvaluateTask,
    isTaskLocked,
    canTaskBeEvaluated,
  }
}

export default useTaskPermissions