// ============================================================================
// src/features/tasks/utils/taskPermissions.ts
// Task Permissions - FINAL VERSION v2
// Fixed param order to match approvalService.ts
// ============================================================================

// ============================================================================
// TYPES
// ============================================================================

export type UserRole = 'admin' | 'manager' | 'employee'

export type PermissionGroup = 'executive' | 'manager' | 'employee'

export interface TaskForPermission {
  id: string
  code?: string
  name?: string
  status: string
  priority?: string
  progress?: number
  department_id?: string | null
  assignee_id?: string | null
  assigner_id?: string | null
  evaluation_status?: string | null
  created_by?: string | null
  parent_id?: string | null
  is_self_assigned?: boolean
  assigner_level?: number | null
}

export interface TaskPermissions {
  canView: boolean
  canEdit: boolean
  canDelete: boolean
  canAssign: boolean
  canChangeStatus: boolean
  canEvaluate: boolean
  canApprove: boolean
  canRequestExtension: boolean
  canComment: boolean
  canAttach: boolean
  canSelfEvaluate: boolean
  canMarkComplete: boolean
  canPause: boolean
  canResume: boolean
  canCancel: boolean
  editDisabledReason?: string
  deleteDisabledReason?: string
}

export interface PermissionCheckResult {
  canApprove: boolean
  reason?: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const EVALUATABLE_STATUSES = ['completed', 'finished', 'pending_review']
const PENDING_APPROVAL_STATUSES = ['pending_review', 'waiting_approval']
const LOCKED_EVALUATION_STATUSES = ['approved', 'rejected']
const COMPLETED_STATUSES = ['completed', 'finished', 'cancelled', 'accepted']
const PAUSABLE_STATUSES = ['in_progress', 'new']
const RESUMABLE_STATUSES = ['paused', 'on_hold']
const CANCELLABLE_STATUSES = ['new', 'in_progress', 'paused', 'on_hold', 'pending_review']

const EXECUTIVE_LEVELS = [1, 2, 3]
const MANAGER_LEVELS = [4, 5]

// ============================================================================
// PERMISSION GROUP FUNCTIONS
// ============================================================================

export function getPermissionGroup(positionLevel: number | null | undefined): PermissionGroup {
  if (!positionLevel) return 'employee'
  if (EXECUTIVE_LEVELS.includes(positionLevel)) return 'executive'
  if (MANAGER_LEVELS.includes(positionLevel)) return 'manager'
  return 'employee'
}

export function isExecutive(positionLevel: number | null | undefined): boolean {
  return getPermissionGroup(positionLevel) === 'executive'
}

export function isManagerLevel(positionLevel: number | null | undefined): boolean {
  const group = getPermissionGroup(positionLevel)
  return group === 'executive' || group === 'manager'
}

export function isEmployeeLevel(positionLevel: number | null | undefined): boolean {
  return getPermissionGroup(positionLevel) === 'employee'
}

// ============================================================================
// TASK STATUS FUNCTIONS
// ============================================================================

export function canTaskBeEvaluated(status: string): boolean {
  return EVALUATABLE_STATUSES.includes(status)
}

export function isTaskPendingApproval(status: string): boolean {
  return PENDING_APPROVAL_STATUSES.includes(status)
}

export function isTaskLocked(evaluationStatus: string | null | undefined): boolean {
  return !!evaluationStatus && LOCKED_EVALUATION_STATUSES.includes(evaluationStatus)
}

export function isTaskCompleted(status: string): boolean {
  return COMPLETED_STATUSES.includes(status)
}

export function getTaskLockMessage(taskOrStatus: string | { evaluation_status?: string | null }): string {
  const status = typeof taskOrStatus === 'string' 
    ? taskOrStatus 
    : taskOrStatus?.evaluation_status
  
  if (!status) return ''
  if (status === 'approved') return 'Công việc đã được phê duyệt, không thể chỉnh sửa'
  if (status === 'rejected') return 'Công việc đã bị từ chối'
  return ''
}

// ============================================================================
// EVALUATION STATUS FUNCTIONS
// ============================================================================

export function getEvaluationStatusColor(status: string | null | undefined): string {
  const colors: Record<string, string> = {
    none: 'gray',
    pending_self_eval: 'orange',
    pending_approval: 'yellow',
    approved: 'green',
    rejected: 'red',
    revision_requested: 'purple',
  }
  return colors[status || 'none'] || 'gray'
}

export function getEvaluationStatusLabel(status: string | null | undefined): string {
  const labels: Record<string, string> = {
    none: 'Chưa có',
    pending_self_eval: 'Chờ tự đánh giá',
    pending_approval: 'Chờ phê duyệt',
    approved: 'Đã phê duyệt',
    rejected: 'Bị từ chối',
    revision_requested: 'Yêu cầu sửa',
  }
  return labels[status || 'none'] || status || 'Chưa có'
}

// ============================================================================
// SIMPLE PERMISSION CHECKS
// ============================================================================

export function canCreateSelfEvaluation(
  taskStatus: string,
  evaluationStatus: string | null | undefined
): boolean {
  return canTaskBeEvaluated(taskStatus) && !isTaskLocked(evaluationStatus)
}

export function canApproveTask(
  taskStatus: string,
  evaluationStatus: string | null | undefined,
  hasPermission: boolean
): boolean {
  return (
    hasPermission &&
    isTaskPendingApproval(taskStatus) &&
    (evaluationStatus === 'pending' || evaluationStatus === 'pending_approval')
  )
}

// ============================================================================
// MAIN PERMISSION FUNCTIONS
// ============================================================================

/**
 * Check if user can approve a task
 * Called from approvalService with: canUserApproveTask(userLevel, userDeptId, assignerLevel, taskDeptId, isAdmin)
 * ALWAYS returns PermissionCheckResult
 * 
 * @param userLevel - User's position level (number)
 * @param userDepartmentId - User's department ID (string)
 * @param assignerLevel - Task assigner's level (number) - NOT USED but kept for compatibility
 * @param taskDepartmentId - Task's department ID (string)
 * @param isAdmin - Whether user is admin (boolean)
 */
export function canUserApproveTask(
  userLevel: number | null,
  userDepartmentId: string | null,
  _assignerLevel?: number | null,
  taskDepartmentId?: string | null,
  isAdmin?: boolean
): PermissionCheckResult {
  // Admin can always approve
  if (isAdmin) {
    return { canApprove: true }
  }
  
  // Only managers can approve
  if (!isManagerLevel(userLevel)) {
    return { canApprove: false, reason: 'Chỉ quản lý mới có quyền phê duyệt' }
  }
  
  // Executive can approve all
  if (isExecutive(userLevel)) {
    return { canApprove: true }
  }
  
  // Manager can only approve in same department
  if (taskDepartmentId === userDepartmentId) {
    return { canApprove: true }
  }
  
  return { canApprove: false, reason: 'Không có quyền phê duyệt công việc ngoài phòng ban' }
}

/**
 * Check if user can assign to an employee
 */
export function canAssignToEmployee(
  userRole: UserRole,
  targetDepartmentId: string | null | undefined,
  userDepartmentId?: string | null,
  userPositionLevel?: number | null,
  isAdmin?: boolean
): boolean {
  if (isAdmin || userRole === 'admin') return true
  if (isExecutive(userPositionLevel)) return true
  
  if (isManagerLevel(userPositionLevel)) {
    return !targetDepartmentId || targetDepartmentId === userDepartmentId
  }
  
  return false
}

/**
 * Get all permissions for a task
 */
export function getTaskPermissions(
  task: TaskForPermission,
  userRole: UserRole,
  userDepartmentId?: string | null,
  userPositionLevel?: number | null,
  isAdmin?: boolean
): TaskPermissions {
  const isAdminUser = isAdmin || userRole === 'admin'
  const locked = isTaskLocked(task.evaluation_status)
  const completed = isTaskCompleted(task.status)
  
  // Default permissions for admin
  if (isAdminUser) {
    return {
      canView: true,
      canEdit: !locked,
      canDelete: !completed,
      canAssign: true,
      canChangeStatus: !locked,
      canEvaluate: canTaskBeEvaluated(task.status) && !locked,
      canApprove: isTaskPendingApproval(task.status),
      canRequestExtension: !completed,
      canComment: true,
      canAttach: true,
      canSelfEvaluate: canTaskBeEvaluated(task.status) && !locked,
      canMarkComplete: !completed && !locked,
      canPause: PAUSABLE_STATUSES.includes(task.status),
      canResume: RESUMABLE_STATUSES.includes(task.status),
      canCancel: CANCELLABLE_STATUSES.includes(task.status) && !locked,
      editDisabledReason: locked ? 'Công việc đã khóa' : undefined,
      deleteDisabledReason: completed ? 'Không thể xóa công việc đã hoàn thành' : undefined,
    }
  }
  
  const isOwner = task.is_self_assigned === true
  const isSameDepartment = task.department_id === userDepartmentId
  const isManager = isManagerLevel(userPositionLevel)
  const isExec = isExecutive(userPositionLevel)
  
  // Executive permissions
  if (isExec) {
    return {
      canView: true,
      canEdit: !locked,
      canDelete: !completed,
      canAssign: true,
      canChangeStatus: !locked,
      canEvaluate: canTaskBeEvaluated(task.status) && !locked,
      canApprove: isTaskPendingApproval(task.status),
      canRequestExtension: !completed,
      canComment: true,
      canAttach: true,
      canSelfEvaluate: isOwner && canTaskBeEvaluated(task.status) && !locked,
      canMarkComplete: isOwner && !completed && !locked,
      canPause: isOwner && PAUSABLE_STATUSES.includes(task.status),
      canResume: isOwner && RESUMABLE_STATUSES.includes(task.status),
      canCancel: CANCELLABLE_STATUSES.includes(task.status) && !locked,
      editDisabledReason: locked ? 'Công việc đã khóa' : undefined,
      deleteDisabledReason: completed ? 'Không thể xóa công việc đã hoàn thành' : undefined,
    }
  }
  
  // Manager permissions
  if (isManager) {
    const canManage = isSameDepartment
    return {
      canView: canManage || isOwner,
      canEdit: canManage && !locked,
      canDelete: canManage && !completed,
      canAssign: canManage,
      canChangeStatus: (canManage || isOwner) && !locked,
      canEvaluate: canManage && canTaskBeEvaluated(task.status) && !locked,
      canApprove: canManage && isTaskPendingApproval(task.status),
      canRequestExtension: isOwner && !completed,
      canComment: canManage || isOwner,
      canAttach: canManage || isOwner,
      canSelfEvaluate: isOwner && canTaskBeEvaluated(task.status) && !locked,
      canMarkComplete: isOwner && !completed && !locked,
      canPause: isOwner && PAUSABLE_STATUSES.includes(task.status),
      canResume: isOwner && RESUMABLE_STATUSES.includes(task.status),
      canCancel: (canManage || isOwner) && CANCELLABLE_STATUSES.includes(task.status) && !locked,
      editDisabledReason: !canManage ? 'Không có quyền sửa công việc này' : locked ? 'Công việc đã khóa' : undefined,
      deleteDisabledReason: !canManage ? 'Không có quyền xóa công việc này' : completed ? 'Không thể xóa công việc đã hoàn thành' : undefined,
    }
  }
  
  // Employee permissions
  return {
    canView: isOwner,
    canEdit: isOwner && !locked && !completed,
    canDelete: false,
    canAssign: false,
    canChangeStatus: isOwner && !locked,
    canEvaluate: isOwner && canTaskBeEvaluated(task.status) && !locked,
    canApprove: false,
    canRequestExtension: isOwner && !completed,
    canComment: isOwner,
    canAttach: isOwner,
    canSelfEvaluate: isOwner && canTaskBeEvaluated(task.status) && !locked,
    canMarkComplete: isOwner && !completed && !locked,
    canPause: isOwner && PAUSABLE_STATUSES.includes(task.status),
    canResume: isOwner && RESUMABLE_STATUSES.includes(task.status),
    canCancel: isOwner && CANCELLABLE_STATUSES.includes(task.status) && !locked,
    editDisabledReason: !isOwner ? 'Không có quyền sửa công việc này' : locked ? 'Công việc đã khóa' : completed ? 'Công việc đã hoàn thành' : undefined,
    deleteDisabledReason: 'Nhân viên không có quyền xóa công việc',
  }
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  EVALUATABLE_STATUSES,
  PENDING_APPROVAL_STATUSES,
  LOCKED_EVALUATION_STATUSES,
  COMPLETED_STATUSES,
  getPermissionGroup,
  isExecutive,
  isManagerLevel,
  isEmployeeLevel,
  canTaskBeEvaluated,
  isTaskPendingApproval,
  isTaskLocked,
  isTaskCompleted,
  getTaskLockMessage,
  getEvaluationStatusColor,
  getEvaluationStatusLabel,
  canCreateSelfEvaluation,
  canApproveTask,
  canUserApproveTask,
  canAssignToEmployee,
  getTaskPermissions,
}