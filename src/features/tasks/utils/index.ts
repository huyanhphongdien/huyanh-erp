// src/features/tasks/utils/index.ts
// FIXED: Sửa cách export từ taskPermissions

// Option 1: Nếu taskPermissions.ts export named functions
export {
  canTaskBeEvaluated,
  isTaskPendingApproval,
} from './taskPermissions'

// Option 2: Nếu taskPermissions.ts export default
// import taskPermissions from './taskPermissions'
// export const canTaskBeEvaluated = taskPermissions.canTaskBeEvaluated
// export const isTaskPendingApproval = taskPermissions.isTaskPendingApproval

// ==========================================
// NẾU FILE taskPermissions.ts KHÔNG TỒN TẠI
// Tạo mới với nội dung sau trong file taskPermissions.ts:
// ==========================================
/*
// src/features/tasks/utils/taskPermissions.ts

import type { TaskStatus } from '../../../types'

// Các status có thể đánh giá
const EVALUATABLE_STATUSES: TaskStatus[] = ['completed', 'finished', 'pending_review']

// Các status chờ phê duyệt
const PENDING_APPROVAL_STATUSES: TaskStatus[] = ['pending_review', 'waiting_approval']

export function canTaskBeEvaluated(status: TaskStatus | string): boolean {
  return EVALUATABLE_STATUSES.includes(status as TaskStatus)
}

export function isTaskPendingApproval(status: TaskStatus | string): boolean {
  return PENDING_APPROVAL_STATUSES.includes(status as TaskStatus)
}

export function isTaskLocked(evaluationStatus: string | null | undefined): boolean {
  const lockedStatuses = ['approved', 'rejected']
  return !!evaluationStatus && lockedStatuses.includes(evaluationStatus)
}
*/