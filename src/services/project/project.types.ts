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
// MỘT NGUỒN NHÃN + MÀU cho dự án / giai đoạn / mốc / ưu tiên (Đợt 3 audit UI 17/11/2026)
// Trước đó module có ≥6 bản chép tay đã trôi nhãn: planning = "Lập kế hoạch"/"Lên KH"/"Lên kế hoạch"/"Lập KH",
// in_progress = "Đang thực hiện"/"Đang chạy", giai đoạn xong = "Hoàn thành"/"Xong", mốc approaching =
// "Sắp đến hạn"/"Sắp tới"/"Sắp đến", overdue = "Quá hạn"/"Trễ". Trang ĐỌC CHỮ từ các map dưới; lớp Tailwind/icon
// riêng của từng màn thì giữ ở màn đó nhưng không chép lại chữ. *_COLORS = màu preset antd cho <EnumTag>
// (quy ước: default nháp · gold chờ · blue đang làm/đã duyệt · green xong · red huỷ/quá hạn).
// ============================================================================

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'Nháp',
  planning: 'Lập kế hoạch',
  approved: 'Đã duyệt',
  in_progress: 'Đang thực hiện',
  on_hold: 'Tạm dừng',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  draft: 'default',
  planning: 'gold',
  approved: 'blue',
  in_progress: 'blue',
  on_hold: 'orange',
  completed: 'green',
  cancelled: 'red',
}

export const PROJECT_PRIORITY_LABELS: Record<ProjectPriority, string> = {
  critical: 'Khẩn cấp',
  high: 'Cao',
  medium: 'Trung bình',
  low: 'Thấp',
}

export const PROJECT_PRIORITY_COLORS: Record<ProjectPriority, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'blue',
  low: 'default',
}

export const PHASE_STATUS_LABELS: Record<PhaseStatus, string> = {
  pending: 'Chờ',
  in_progress: 'Đang thực hiện',
  completed: 'Hoàn thành',
  skipped: 'Bỏ qua',
}

export const PHASE_STATUS_COLORS: Record<PhaseStatus, string> = {
  pending: 'default',
  in_progress: 'blue',
  completed: 'green',
  skipped: 'default',
}

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  pending: 'Chờ',
  approaching: 'Sắp đến hạn',
  completed: 'Hoàn thành',
  overdue: 'Quá hạn',
  cancelled: 'Đã hủy',
}

export const MILESTONE_STATUS_COLORS: Record<MilestoneStatus, string> = {
  pending: 'default',
  approaching: 'gold',
  completed: 'green',
  overdue: 'red',
  cancelled: 'red',
}

// ============================================================================
// Trạng thái dự án - Labels & Colors cho UI (lớp Tailwind; chữ lấy từ *_LABELS ở trên)
// ============================================================================

export const PROJECT_STATUS_CONFIG: Record<ProjectStatus, { label: string; color: string; bgColor: string }> = {
  draft:       { label: PROJECT_STATUS_LABELS.draft,       color: 'text-gray-600',   bgColor: 'bg-gray-100' },
  planning:    { label: PROJECT_STATUS_LABELS.planning,    color: 'text-blue-600',   bgColor: 'bg-blue-100' },
  approved:    { label: PROJECT_STATUS_LABELS.approved,    color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  in_progress: { label: PROJECT_STATUS_LABELS.in_progress, color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  on_hold:     { label: PROJECT_STATUS_LABELS.on_hold,     color: 'text-amber-600',  bgColor: 'bg-amber-100' },
  completed:   { label: PROJECT_STATUS_LABELS.completed,   color: 'text-green-600',  bgColor: 'bg-green-100' },
  cancelled:   { label: PROJECT_STATUS_LABELS.cancelled,   color: 'text-red-600',    bgColor: 'bg-red-100' },
}

export const PROJECT_PRIORITY_CONFIG: Record<ProjectPriority, { label: string; color: string; bgColor: string }> = {
  critical: { label: PROJECT_PRIORITY_LABELS.critical, color: 'text-red-600',    bgColor: 'bg-red-100' },
  high:     { label: PROJECT_PRIORITY_LABELS.high,     color: 'text-orange-600', bgColor: 'bg-orange-100' },
  medium:   { label: PROJECT_PRIORITY_LABELS.medium,   color: 'text-blue-600',  bgColor: 'bg-blue-100' },
  low:      { label: PROJECT_PRIORITY_LABELS.low,      color: 'text-gray-600',   bgColor: 'bg-gray-100' },
}

export const PHASE_STATUS_CONFIG: Record<PhaseStatus, { label: string; color: string }> = {
  pending:     { label: PHASE_STATUS_LABELS.pending,     color: 'text-gray-500' },
  in_progress: { label: PHASE_STATUS_LABELS.in_progress, color: 'text-blue-600' },
  completed:   { label: PHASE_STATUS_LABELS.completed,   color: 'text-green-600' },
  skipped:     { label: PHASE_STATUS_LABELS.skipped,     color: 'text-gray-400' },
}

export const MILESTONE_STATUS_CONFIG: Record<MilestoneStatus, { label: string; icon: string; color: string }> = {
  pending:     { label: MILESTONE_STATUS_LABELS.pending,     icon: '⬜', color: 'text-gray-500' },
  approaching: { label: MILESTONE_STATUS_LABELS.approaching, icon: '🔵', color: 'text-blue-600' },
  completed:   { label: MILESTONE_STATUS_LABELS.completed,   icon: '✅', color: 'text-green-600' },
  overdue:     { label: MILESTONE_STATUS_LABELS.overdue,     icon: '🔴', color: 'text-red-600' },
  cancelled:   { label: MILESTONE_STATUS_LABELS.cancelled,   icon: '⚫', color: 'text-gray-400' },
}

export const MEMBER_ROLE_CONFIG: Record<MemberRole, { label: string; description: string }> = {
  owner:    { label: 'Chủ dự án (PM)',     description: 'Toàn quyền quản lý dự án' },
  co_owner: { label: 'Đồng quản lý',       description: 'Tương tự PM, không xóa DA' },
  lead:     { label: 'Trưởng nhóm',        description: 'Quản lý giai đoạn được giao' },
  member:   { label: 'Thành viên',          description: 'Cập nhật công việc được giao' },
  reviewer: { label: 'Người kiểm duyệt',   description: 'Xem, bình luận, duyệt' },
  observer: { label: 'Quan sát viên',       description: 'Chỉ xem' },
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