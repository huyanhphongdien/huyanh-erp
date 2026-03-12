// ============================================================================
// PROJECT MANAGEMENT TYPES — src/services/project/project.types.ts
// Module Quản lý Dự án - Huy Anh Rubber ERP
// Phase PM1: Tất cả types, enums, interfaces
// Ngày: 28/02/2026
// ============================================================================

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type ProjectStatus =
  | 'draft'        // Nháp, chưa duyệt
  | 'planning'     // Đang lập kế hoạch
  | 'approved'     // Đã duyệt, chờ bắt đầu
  | 'in_progress'  // Đang thực hiện
  | 'on_hold'      // Tạm dừng
  | 'completed'    // Hoàn thành
  | 'cancelled'    // Đã hủy

export type ProjectPriority = 'critical' | 'high' | 'medium' | 'low'

export type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

export type MilestoneStatus = 'pending' | 'approaching' | 'completed' | 'overdue' | 'cancelled'

export type MemberRole = 'owner' | 'co_owner' | 'lead' | 'member' | 'reviewer' | 'observer'

export type DependencyType = 'FS' | 'FF' | 'SS' | 'SF'

export type RiskStatus = 'identified' | 'analyzing' | 'mitigating' | 'resolved' | 'accepted' | 'closed'

export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'escalated'

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low'

export type ActivityAction =
  | 'created' | 'updated' | 'status_changed'
  | 'member_added' | 'member_removed'
  | 'phase_added' | 'phase_completed'
  | 'milestone_completed' | 'milestone_overdue'
  | 'risk_identified' | 'issue_opened'
  | 'document_uploaded' | 'comment_added'

export type ActivityEntityType =
  | 'project' | 'phase' | 'milestone' | 'task'
  | 'risk' | 'issue' | 'document' | 'member'

// ============================================================================
// Trạng thái dự án - Labels & Colors cho UI
// ============================================================================

export const PROJECT_STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string; bgColor: string }> = {
  draft:       { label: 'Nháp',           color: 'text-gray-600',   bgColor: 'bg-gray-100' },
  planning:    { label: 'Lập kế hoạch',   color: 'text-blue-600',   bgColor: 'bg-blue-100' },
  approved:    { label: 'Đã duyệt',       color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  in_progress: { label: 'Đang thực hiện', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  on_hold:     { label: 'Tạm dừng',       color: 'text-amber-600',  bgColor: 'bg-amber-100' },
  completed:   { label: 'Hoàn thành',     color: 'text-green-600',  bgColor: 'bg-green-100' },
  cancelled:   { label: 'Đã hủy',         color: 'text-red-600',    bgColor: 'bg-red-100' },
}

export const PROJECT_PRIORITY_CONFIG: Record<ProjectPriority, { label: string; color: string; bgColor: string }> = {
  critical: { label: 'Khẩn cấp', color: 'text-red-600',    bgColor: 'bg-red-100' },
  high:     { label: 'Cao',      color: 'text-orange-600', bgColor: 'bg-orange-100' },
  medium:   { label: 'Trung bình', color: 'text-blue-600',  bgColor: 'bg-blue-100' },
  low:      { label: 'Thấp',     color: 'text-gray-600',   bgColor: 'bg-gray-100' },
}

export const PHASE_STATUS_CONFIG: Record<PhaseStatus, { label: string; color: string }> = {
  pending:     { label: 'Chờ',           color: 'text-gray-500' },
  in_progress: { label: 'Đang thực hiện', color: 'text-blue-600' },
  completed:   { label: 'Hoàn thành',    color: 'text-green-600' },
  skipped:     { label: 'Bỏ qua',        color: 'text-gray-400' },
}

export const MILESTONE_STATUS_CONFIG: Record<MilestoneStatus, { label: string; icon: string; color: string }> = {
  pending:     { label: 'Chờ',          icon: '⬜', color: 'text-gray-500' },
  approaching: { label: 'Sắp đến hạn', icon: '🔵', color: 'text-blue-600' },
  completed:   { label: 'Hoàn thành',   icon: '✅', color: 'text-green-600' },
  overdue:     { label: 'Quá hạn',      icon: '🔴', color: 'text-red-600' },
  cancelled:   { label: 'Đã hủy',       icon: '⚫', color: 'text-gray-400' },
}

export const MEMBER_ROLE_CONFIG: Record<MemberRole, { label: string; description: string }> = {
  owner:    { label: 'Chủ dự án (PM)',     description: 'Toàn quyền quản lý dự án' },
  co_owner: { label: 'Đồng quản lý',       description: 'Tương tự PM, không xóa DA' },
  lead:     { label: 'Trưởng nhóm',        description: 'Quản lý phase được giao' },
  member:   { label: 'Thành viên',          description: 'Cập nhật task được giao' },
  reviewer: { label: 'Người kiểm duyệt',   description: 'Xem, comment, approve' },
  observer: { label: 'Quan sát',            description: 'Chỉ xem (read-only)' },
}

// ============================================================================
// Valid status transitions cho dự án
// ============================================================================

export const VALID_STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft:       ['planning', 'cancelled'],
  planning:    ['approved', 'draft', 'cancelled'],
  approved:    ['in_progress', 'planning', 'cancelled'],
  in_progress: ['on_hold', 'completed', 'cancelled'],
  on_hold:     ['in_progress', 'cancelled'],
  completed:   [],        // Không chuyển tiếp
  cancelled:   ['draft'], // Có thể mở lại thành nháp
}

// ============================================================================
// INTERFACES - Project Category (PM2)
// ============================================================================

export interface ProjectCategory {
  id: string
  name: string
  description?: string
  color: string
  icon?: string
  is_active: boolean
  created_at: string
  updated_at: string
  // Computed
  project_count?: number
}

// ============================================================================
// INTERFACES - Project (bảng chính)
// ============================================================================

export interface Project {
  id: string
  code: string                          // "DA-2026-001"
  name: string
  description?: string
  category_id?: string
  category?: ProjectCategory            // join

  // Thời gian
  planned_start?: string                // DATE as string
  planned_end?: string
  actual_start?: string
  actual_end?: string

  // Trạng thái
  status: ProjectStatus
  priority: ProjectPriority
  progress_pct: number                  // 0-100

  // Ngân sách
  budget_planned: number
  budget_actual: number
  budget_currency: string               // 'VND'

  // Nhân sự chính
  owner_id?: string
  owner?: { id: string; full_name: string; avatar_url?: string }
  sponsor_id?: string
  sponsor?: { id: string; full_name: string }
  department_id?: string
  department?: { id: string; name: string }

  // Metadata
  tags?: string[]
  is_template: boolean
  template_id?: string

  // Audit
  created_by?: string
  updated_by?: string
  created_at: string
  updated_at: string

  // Computed (join/aggregate)
  phases?: ProjectPhase[]
  members?: ProjectMember[]
  _stats?: ProjectStats
}

export interface ProjectFormData {
  name: string
  description?: string
  category_id?: string
  planned_start?: string
  planned_end?: string
  priority?: ProjectPriority
  budget_planned?: number
  budget_currency?: string
  owner_id?: string
  sponsor_id?: string
  department_id?: string
  tags?: string[]
  is_template?: boolean
}

export interface ProjectStats {
  phase_count: number
  milestone_count: number
  milestone_completed: number
  task_count: number
  task_completed: number
  member_count: number
  risk_count: number
  open_issues: number
}

// ============================================================================
// INTERFACES - Phase
// ============================================================================

export interface ProjectPhase {
  id: string
  project_id: string
  name: string
  description?: string
  order_index: number

  planned_start?: string
  planned_end?: string
  actual_start?: string
  actual_end?: string

  status: PhaseStatus
  progress_pct: number
  color?: string

  created_at: string
  updated_at: string

  // Computed
  milestones?: ProjectMilestone[]
  task_count?: number
}

export interface PhaseFormData {
  project_id: string
  name: string
  description?: string
  order_index?: number
  planned_start?: string
  planned_end?: string
  color?: string
  status?: PhaseStatus
}

// ============================================================================
// INTERFACES - Milestone
// ============================================================================

export interface MilestoneDeliverable {
  id: string
  title: string
  completed: boolean
}

export interface ProjectMilestone {
  id: string
  project_id: string
  phase_id?: string
  phase?: { id: string; name: string }
  name: string
  description?: string

  due_date: string
  completed_date?: string

  status: MilestoneStatus

  assignee_id?: string
  assignee?: { id: string; full_name: string; avatar_url?: string }

  deliverables: MilestoneDeliverable[]

  created_at: string
  updated_at: string
}

export interface MilestoneFormData {
  project_id: string
  phase_id?: string
  name: string
  description?: string
  due_date: string
  assignee_id?: string
  deliverables?: MilestoneDeliverable[]
}

// ============================================================================
// INTERFACES - Member
// ============================================================================

export interface ProjectMember {
  id: string
  project_id: string
  employee_id: string
  employee?: { id: string; full_name: string; avatar_url?: string; department?: { name: string } }

  role: MemberRole
  allocation_pct: number
  start_date?: string
  end_date?: string
  responsibility?: string

  is_active: boolean
  joined_at: string
  left_at?: string
}

export interface MemberFormData {
  project_id: string
  employee_id: string
  role?: MemberRole
  allocation_pct?: number
  start_date?: string
  end_date?: string
  responsibility?: string
}

// ============================================================================
// INTERFACES - Activity Log
// ============================================================================

export interface ProjectActivity {
  id: string
  project_id: string
  action: ActivityAction
  entity_type?: ActivityEntityType
  entity_id?: string
  actor_id?: string
  actor?: { id: string; full_name: string; avatar_url?: string }
  old_value?: Record<string, unknown>
  new_value?: Record<string, unknown>
  description?: string
  created_at: string
}

// ============================================================================
// PAGINATION (tái sử dụng pattern ERP)
// ============================================================================

export interface ProjectPaginationParams {
  page?: number
  pageSize?: number
  search?: string
  status?: ProjectStatus | 'all'
  priority?: ProjectPriority | 'all'
  category_id?: string
  owner_id?: string
  department_id?: string
  sort_by?: 'created_at' | 'planned_end' | 'progress_pct' | 'name' | 'priority'
  sort_order?: 'asc' | 'desc'
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}