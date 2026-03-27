// ============================================================================
// TASK UTILITIES — Shared helpers for task module
// File: src/utils/taskUtils.ts
// ============================================================================

const COMPLETED_STATUSES = ['finished', 'completed', 'cancelled']

/**
 * Check if a task is overdue based on due_date.
 * Due date is considered the end of that day (23:59:59.999).
 */
export function isTaskOverdue(dueDate: string | null | undefined, status?: string): boolean {
  if (!dueDate) return false
  if (status && COMPLETED_STATUSES.includes(status)) return false
  const due = new Date(dueDate)
  due.setHours(23, 59, 59, 999)
  return due < new Date()
}

/**
 * Check if a task is due today.
 */
export function isTaskDueToday(dueDate: string | null | undefined, status?: string): boolean {
  if (!dueDate) return false
  if (status && COMPLETED_STATUSES.includes(status)) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  return due.getTime() === today.getTime()
}

/**
 * Get number of days a task is overdue.
 */
export function getDaysOverdue(dueDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  return Math.ceil((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
}
