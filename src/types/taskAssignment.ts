// ============================================================================
// src/types/taskAssignment.ts
// Phase 4.2: Task Assignment Types
// Huy Anh ERP System
// ============================================================================
// Database: task_assignments
// ============================================================================

// ============ ENUM TYPES ============
export type AssignmentRole = 
  | 'owner'       // Người phụ trách chính
  | 'assignee'    // Người được giao
  | 'participant' // Người tham gia
  | 'reviewer'    // Người kiểm tra
  | 'watcher'     // Người theo dõi

export type AssignmentStatus = 
  | 'pending'    // Chờ xác nhận
  | 'accepted'   // Đã nhận
  | 'declined'   // Từ chối
  | 'completed'  // Hoàn thành
  | 'removed'    // Đã gỡ

// ============ MAIN INTERFACE ============
/**
 * Database: task_assignments
 * 
 * ACTUAL SCHEMA:
 * - id (uuid)
 * - task_id (uuid) - FK to tasks
 * - employee_id (uuid) - FK to employees
 * - assigned_by (uuid) - FK to employees
 * - role (varchar) - CHECK IN ('owner', 'assignee', 'participant', 'reviewer', 'watcher')
 * - status (varchar) - CHECK IN ('pending', 'accepted', 'declined', 'completed', 'removed')
 * - note (text)
 * - estimated_hours (numeric)
 * - actual_hours (numeric)
 * - assigned_at (timestamp)
 * - accepted_at (timestamp)
 * - completed_at (timestamp)
 * - created_at (timestamp)
 * - updated_at (timestamp)
 */
export interface TaskAssignment {
  id: string
  task_id: string
  employee_id: string
  assigned_by?: string | null
  
  role: AssignmentRole
  status: AssignmentStatus
  
  note?: string | null
  estimated_hours?: number | null
  actual_hours?: number | null
  
  assigned_at?: string | null
  accepted_at?: string | null
  completed_at?: string | null
  
  created_at?: string
  updated_at?: string
  
  // Relations (populated by Supabase select)
  employee?: {
    id: string
    code?: string
    full_name: string
    email?: string
    avatar_url?: string | null
    department_id?: string
    position_id?: string
    department?: { id: string; name: string }
    position?: { id: string; name: string }
  } | null
  
  assigner?: {
    id: string
    code?: string
    full_name: string
  } | null
  
  task?: {
    id: string
    code?: string
    name: string
    status?: string
    priority?: string
    due_date?: string
    progress?: number
    department_id?: string
    department?: { id: string; name: string }
  } | null
}

// ============ INPUT TYPES ============
export interface CreateAssignmentInput {
  task_id: string
  employee_id: string
  assigned_by?: string
  role?: AssignmentRole
  note?: string
  estimated_hours?: number
}

export interface UpdateAssignmentInput {
  role?: AssignmentRole
  status?: AssignmentStatus
  note?: string
  estimated_hours?: number
  actual_hours?: number
}

export interface BulkAssignInput {
  task_id: string
  assignments: {
    employee_id: string
    role: AssignmentRole
    note?: string
    estimated_hours?: number
  }[]
  assigned_by?: string
}

// ============ HELPER TYPES ============
export interface AssignmentWithEmployee extends TaskAssignment {
  employee: NonNullable<TaskAssignment['employee']>
}

export interface AssignmentWithTask extends TaskAssignment {
  task: NonNullable<TaskAssignment['task']>
}

export interface AssignmentWithRelations extends TaskAssignment {
  employee: NonNullable<TaskAssignment['employee']>
  task: NonNullable<TaskAssignment['task']>
  assigner?: NonNullable<TaskAssignment['assigner']>
}

// ============ FILTER TYPES ============
export interface AssignmentFilters {
  task_id?: string
  employee_id?: string
  assigned_by?: string
  role?: AssignmentRole
  status?: AssignmentStatus
  department_id?: string
  from_date?: string
  to_date?: string
}

// ============ STATS TYPES ============
export interface AssignmentStats {
  total: number
  by_role: Record<AssignmentRole, number>
  by_status: Record<AssignmentStatus, number>
  total_estimated_hours: number
  total_actual_hours: number
}

// ============ LABELS & COLORS ============
export const ROLE_LABELS: Record<AssignmentRole, string> = {
  owner: 'Phụ trách chính',
  assignee: 'Được giao',
  participant: 'Tham gia',
  reviewer: 'Kiểm tra',
  watcher: 'Theo dõi'
}

export const ROLE_COLORS: Record<AssignmentRole, string> = {
  owner: 'bg-blue-100 text-blue-700 border-blue-300',
  assignee: 'bg-green-100 text-green-700 border-green-300',
  participant: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  reviewer: 'bg-purple-100 text-purple-700 border-purple-300',
  watcher: 'bg-gray-100 text-gray-600 border-gray-300'
}

export const ROLE_ICONS: Record<AssignmentRole, string> = {
  owner: 'crown',
  assignee: 'user-check',
  participant: 'users',
  reviewer: 'eye',
  watcher: 'bell'
}

export const STATUS_LABELS: Record<AssignmentStatus, string> = {
  pending: 'Chờ xác nhận',
  accepted: 'Đã nhận',
  declined: 'Từ chối',
  completed: 'Hoàn thành',
  removed: 'Đã gỡ'
}

export const STATUS_COLORS: Record<AssignmentStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  completed: 'bg-blue-100 text-blue-700',
  removed: 'bg-gray-100 text-gray-500'
}

// ============ HELPER FUNCTIONS ============

/**
 * Check if user can accept/decline assignment
 */
export function canRespondToAssignment(
  assignment: TaskAssignment, 
  userId: string
): boolean {
  return assignment.employee_id === userId && assignment.status === 'pending'
}

/**
 * Check if user can mark assignment as completed
 */
export function canCompleteAssignment(
  assignment: TaskAssignment,
  userId: string
): boolean {
  return assignment.employee_id === userId && assignment.status === 'accepted'
}

/**
 * Check if user can edit assignment
 */
export function canEditAssignment(
  assignment: TaskAssignment,
  userId: string,
  isManager: boolean
): boolean {
  return (
    isManager || 
    assignment.assigned_by === userId ||
    assignment.employee_id === userId
  )
}

/**
 * Check if user can remove assignment
 */
export function canRemoveAssignment(
  assignment: TaskAssignment,
  userId: string,
  isManager: boolean
): boolean {
  return (
    isManager || 
    assignment.assigned_by === userId
  )
}

/**
 * Get role priority (for sorting)
 */
export function getRolePriority(role: AssignmentRole): number {
  const priorities: Record<AssignmentRole, number> = {
    owner: 1,
    assignee: 2,
    reviewer: 3,
    participant: 4,
    watcher: 5
  }
  return priorities[role] || 99
}

/**
 * Sort assignments by role priority
 */
export function sortByRolePriority(assignments: TaskAssignment[]): TaskAssignment[] {
  return [...assignments].sort((a, b) => getRolePriority(a.role) - getRolePriority(b.role))
}

// ============ EXPORT DEFAULT ============
export default {
  ROLE_LABELS,
  ROLE_COLORS,
  ROLE_ICONS,
  STATUS_LABELS,
  STATUS_COLORS,
  canRespondToAssignment,
  canCompleteAssignment,
  canEditAssignment,
  canRemoveAssignment,
  getRolePriority,
  sortByRolePriority,
}