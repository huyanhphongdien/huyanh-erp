// src/features/tasks/utils/taskPermissions.ts
// Utility functions để kiểm tra quyền và trạng thái task

import type { TaskStatus } from '../../../types'

// Các status có thể đánh giá
const EVALUATABLE_STATUSES: TaskStatus[] = ['completed', 'finished', 'pending_review']

// Các status chờ phê duyệt
const PENDING_APPROVAL_STATUSES: TaskStatus[] = ['pending_review', 'waiting_approval']

// Các status đã khóa (không thể chỉnh sửa)
const LOCKED_EVALUATION_STATUSES = ['approved', 'rejected']

/**
 * Kiểm tra task có thể được đánh giá không
 */
export function canTaskBeEvaluated(status: TaskStatus | string): boolean {
  return EVALUATABLE_STATUSES.includes(status as TaskStatus)
}

/**
 * Kiểm tra task đang chờ phê duyệt
 */
export function isTaskPendingApproval(status: TaskStatus | string): boolean {
  return PENDING_APPROVAL_STATUSES.includes(status as TaskStatus)
}

/**
 * Kiểm tra task đã bị khóa (đã duyệt hoặc từ chối)
 */
export function isTaskLocked(evaluationStatus: string | null | undefined): boolean {
  return !!evaluationStatus && LOCKED_EVALUATION_STATUSES.includes(evaluationStatus)
}

/**
 * Kiểm tra có thể tạo self-evaluation cho task
 */
export function canCreateSelfEvaluation(
  taskStatus: TaskStatus | string,
  evaluationStatus: string | null | undefined
): boolean {
  // Task phải hoàn thành và chưa có đánh giá được duyệt
  return canTaskBeEvaluated(taskStatus) && !isTaskLocked(evaluationStatus)
}

/**
 * Kiểm tra có thể phê duyệt task
 */
export function canApproveTask(
  taskStatus: TaskStatus | string,
  evaluationStatus: string | null | undefined,
  hasPermission: boolean
): boolean {
  return (
    hasPermission &&
    isTaskPendingApproval(taskStatus) &&
    evaluationStatus === 'pending'
  )
}