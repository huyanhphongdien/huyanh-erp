// ============================================================================
// PHASE 4.3: EVALUATION TYPE DEFINITIONS (FIXED VERSION)
// File: src/types/evaluation.types.ts
// Huy Anh ERP System
// ============================================================================

// ============================================================================
// SLIM TYPES FOR RELATIONS
// ============================================================================

export interface TaskSlim {
  id: string;
  code?: string;
  name?: string;
  title?: string;
  status: string;
  department_id?: string;
  assignee_id?: string;
  assigner_id?: string;
  due_date?: string;
  department?: DepartmentSlim;
  assignee?: EmployeeSlim;
}

export interface EmployeeSlim {
  id: string;
  code?: string;
  full_name: string;
  avatar_url?: string | null;
  email?: string;
  department_id?: string;
  position_id?: string;
  department?: DepartmentSlim;
  position?: PositionSlim;
}

export interface DepartmentSlim {
  id: string;
  name: string;
  manager_id?: string;
}

export interface PositionSlim {
  id: string;
  name: string;
  level?: number;
  can_approve?: boolean;
  approval_scope?: 'department' | 'company';
}

// Backward compatible aliases
export type TaskBasic = TaskSlim;
export type EmployeeBasic = EmployeeSlim;
export type DepartmentBasic = DepartmentSlim;
export type PositionBasic = PositionSlim;

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

/**
 * Trạng thái tự đánh giá
 */
export const SELF_EVALUATION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REVISION_REQUESTED: 'revision_requested',
} as const;

export type SelfEvaluationStatus = typeof SELF_EVALUATION_STATUS[keyof typeof SELF_EVALUATION_STATUS];

export const SELF_EVALUATION_STATUS_LABELS: Record<SelfEvaluationStatus, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  revision_requested: 'Yêu cầu sửa',
};

export const SELF_EVALUATION_STATUS_COLORS: Record<SelfEvaluationStatus, string> = {
  pending: 'yellow',
  approved: 'green',
  rejected: 'red',
  revision_requested: 'orange',
};

/**
 * Hành động phê duyệt - FIXED: Đảm bảo type inference đúng
 */
export const APPROVAL_ACTIONS = {
  APPROVE: 'approve' as const,
  REJECT: 'reject' as const,
  REQUEST_INFO: 'request_info' as const,
};

// FIXED: Explicit union type để TypeScript nhận diện đúng khi so sánh
export type ApprovalAction = 'approve' | 'reject' | 'request_info';

export const APPROVAL_ACTION_LABELS: Record<ApprovalAction, string> = {
  approve: 'Phê duyệt',
  reject: 'Từ chối',
  request_info: 'Yêu cầu bổ sung',
};

export const APPROVAL_ACTION_COLORS: Record<ApprovalAction, string> = {
  approve: 'green',
  reject: 'red',
  request_info: 'orange',
};

/**
 * Xếp loại đánh giá
 */
export const RATING_LEVELS = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  AVERAGE: 'average',
  BELOW_AVERAGE: 'below_average',
} as const;

export type RatingLevel = typeof RATING_LEVELS[keyof typeof RATING_LEVELS];

export const RATING_LABELS: Record<RatingLevel, string> = {
  excellent: 'Xuất sắc',
  good: 'Tốt',
  average: 'Trung bình',
  below_average: 'Cần cải thiện',
};

export const RATING_SCORE_RANGES: Record<RatingLevel, { min: number; max: number }> = {
  excellent: { min: 90, max: 100 },
  good: { min: 70, max: 89 },
  average: { min: 50, max: 69 },
  below_average: { min: 0, max: 49 },
};

export const RATING_COLORS: Record<RatingLevel, string> = {
  excellent: 'green',
  good: 'blue',
  average: 'yellow',
  below_average: 'red',
};

/**
 * Đánh giá chất lượng
 */
export const QUALITY_ASSESSMENTS = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  AVERAGE: 'average',
  BELOW_AVERAGE: 'below_average',
} as const;

export type QualityAssessment = typeof QUALITY_ASSESSMENTS[keyof typeof QUALITY_ASSESSMENTS];

export const QUALITY_ASSESSMENT_LABELS: Record<QualityAssessment, string> = {
  excellent: 'Xuất sắc',
  good: 'Tốt',
  average: 'Trung bình',
  below_average: 'Cần cải thiện',
};

/**
 * Loại thông báo email
 */
export const EMAIL_NOTIFICATION_TYPES = {
  SELF_EVALUATION_SUBMITTED: 'self_evaluation_submitted',
  TASK_APPROVED: 'task_approved',
  TASK_REJECTED: 'task_rejected',
  REVISION_REQUESTED: 'revision_requested',
  EVALUATION_RECEIVED: 'evaluation_received',
} as const;

export type EmailNotificationType = typeof EMAIL_NOTIFICATION_TYPES[keyof typeof EMAIL_NOTIFICATION_TYPES];

/**
 * Trạng thái email
 */
export const EMAIL_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
} as const;

export type EmailStatus = typeof EMAIL_STATUS[keyof typeof EMAIL_STATUS];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Tính rating từ điểm số
 */
export function calculateRating(score: number): RatingLevel {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'average';
  return 'below_average';
}

/**
 * Lấy label tiếng Việt từ rating
 */
export function getRatingLabel(rating: RatingLevel): string {
  return RATING_LABELS[rating] || rating;
}

/**
 * Lấy màu từ rating
 */
export function getRatingColor(rating: RatingLevel): string {
  return RATING_COLORS[rating] || 'gray';
}

/**
 * Lấy màu từ status
 */
export function getStatusColor(status: SelfEvaluationStatus): string {
  return SELF_EVALUATION_STATUS_COLORS[status] || 'gray';
}

/**
 * Lấy màu từ action
 */
export function getActionColor(action: ApprovalAction): string {
  return APPROVAL_ACTION_COLORS[action] || 'gray';
}

// ============================================================================
// TASK SELF-EVALUATIONS
// ============================================================================

export interface TaskSelfEvaluation {
  id: string;
  task_id: string;
  employee_id: string;
  completion_percentage: number;
  self_score: number | null;
  quality_assessment: QualityAssessment | string | null;
  achievements: string | null;
  difficulties: string | null;
  solutions: string | null;
  recommendations: string | null;
  status: SelfEvaluationStatus;
  revision_count: number;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SelfEvaluationWithRelations extends TaskSelfEvaluation {
  task?: TaskSlim;
  employee?: EmployeeSlim;
}

export interface CreateSelfEvaluationInput {
  task_id: string;
  employee_id: string;
  completion_percentage: number;
  self_score?: number;
  quality_assessment?: QualityAssessment | string;
  achievements?: string;
  difficulties?: string;
  solutions?: string;
  recommendations?: string;
}

export interface UpdateSelfEvaluationInput {
  completion_percentage?: number;
  self_score?: number;
  quality_assessment?: QualityAssessment | string;
  achievements?: string;
  difficulties?: string;
  solutions?: string;
  recommendations?: string;
  status?: SelfEvaluationStatus;
}

export interface SelfEvaluationFilters {
  employee_id?: string;
  task_id?: string;
  status?: SelfEvaluationStatus;
  department_id?: string;
  from_date?: string;
  to_date?: string;
}

export interface SelfEvaluationStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  revision_requested: number;
  averageScore: number;
}

// ============================================================================
// TASK APPROVALS
// ============================================================================

/**
 * Database: task_approvals
 */
export interface TaskApproval {
  id: string;
  task_id: string;
  approver_id: string;
  approval_date: string;
  action: ApprovalAction;
  score: number | null;
  rating: RatingLevel | null;
  comments: string | null;
  rejection_reason: string | null;
  additional_request: string | null;
  additional_deadline: string | null;
  created_at: string;
}

/**
 * Approval với relations - FIXED: Đảm bảo có đầy đủ các fields
 */
export interface ApprovalWithRelations extends TaskApproval {
  task?: TaskSlim;
  approver?: EmployeeSlim;
}

/**
 * Item công việc chờ duyệt
 */
export interface PendingApprovalItem {
  id: string;
  task_id: string;
  task_code: string;
  task_name: string;
  employee_id: string;
  employee_name: string;
  department_name: string;
  self_score: number | null;
  completion_percentage: number;
  evaluation_date: string;
  status: SelfEvaluationStatus;
}

/**
 * Input phê duyệt - FIXED: score là optional trong input
 */
export interface ApproveTaskInput {
  task_id: string;
  approver_id: string;
  score?: number;  // FIXED: Optional vì có thể không cần điểm
  comments?: string;
}

/**
 * Input từ chối - FIXED: comments là optional
 */
export interface RejectTaskInput {
  task_id: string;
  approver_id: string;
  rejection_reason: string;  // Required
  comments?: string;         // Optional
}

/**
 * Input yêu cầu bổ sung
 */
export interface RequestInfoInput {
  task_id: string;
  approver_id: string;
  additional_request: string;
  additional_deadline?: string;
  comments?: string;
}

export interface ApprovalFilters {
  task_id?: string;
  approver_id?: string;
  action?: ApprovalAction;
  from_date?: string;
  to_date?: string;
}

export interface ApprovalStats {
  total: number;
  approved: number;
  rejected: number;
  requested_info: number;
  averageScore: number;
}

// ============================================================================
// TASK EVALUATIONS
// ============================================================================

export interface TaskEvaluation {
  id: string;
  task_id: string;
  employee_id: string;
  evaluator_id: string;
  score: number;
  content: string | null;
  rating: RatingLevel;
  created_at: string;
  updated_at: string;
}

export interface EvaluationWithRelations extends TaskEvaluation {
  task?: TaskSlim;
  employee?: EmployeeSlim;
  evaluator?: EmployeeSlim;
}

export interface CreateEvaluationInput {
  task_id: string;
  employee_id: string;
  evaluator_id: string;
  score: number;
  content?: string;
}

export interface UpdateEvaluationInput {
  score?: number;
  content?: string;
}

export interface EvaluationFilters {
  task_id?: string;
  employee_id?: string;
  evaluator_id?: string;
  department_id?: string;
  rating?: RatingLevel;
  from_date?: string;
  to_date?: string;
}

export interface EmployeeLeaderboardItem {
  employee_id: string;
  employee_code: string;
  employee_name: string;
  avatar_url: string | null;
  department_id: string;
  department_name: string;
  total_tasks: number;
  total_score: number;
  average_score: number;
  rating: RatingLevel;
}

export interface DepartmentStats {
  department_id: string;
  department_name: string;
  total_evaluations: number;
  average_score: number;
  rating_distribution: RatingDistribution;
}

export interface RatingDistribution {
  excellent: number;
  good: number;
  average: number;
  below_average: number;
}

export interface EmployeeEvaluationStats {
  total: number;
  averageScore: number;
  rating: RatingLevel | string;
  ratingDistribution: RatingDistribution;
}

// ============================================================================
// EMAIL NOTIFICATIONS
// ============================================================================

export interface EmailNotification {
  id: string;
  recipient_id: string;
  recipient_email: string;
  notification_type: EmailNotificationType;
  subject: string;
  content: string;
  task_id: string | null;
  status: EmailStatus;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface SendEmailInput {
  recipient_id: string;
  notification_type: EmailNotificationType;
  task_id?: string;
  additional_data?: Record<string, unknown>;
}

// ============================================================================
// FORM TYPES
// ============================================================================

export interface SelfEvaluationFormData {
  task_id: string;
  completion_percentage: number;
  quality_assessment: QualityAssessment | string;
  self_score: number;
  achievements: string;
  difficulties: string;
  solutions: string;
  recommendations: string;
}

export interface ApprovalFormData {
  action: ApprovalAction;
  score?: number;
  comments?: string;
  rejection_reason?: string;
  additional_request?: string;
  additional_deadline?: string;
}

export interface EvaluationFormData {
  score: number;
  content: string;
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  // Constants
  SELF_EVALUATION_STATUS,
  APPROVAL_ACTIONS,
  RATING_LEVELS,
  QUALITY_ASSESSMENTS,
  EMAIL_NOTIFICATION_TYPES,
  EMAIL_STATUS,
  
  // Labels
  SELF_EVALUATION_STATUS_LABELS,
  APPROVAL_ACTION_LABELS,
  RATING_LABELS,
  RATING_COLORS,
  QUALITY_ASSESSMENT_LABELS,
  
  // Helper functions
  calculateRating,
  getRatingLabel,
  getRatingColor,
  getStatusColor,
  getActionColor,
};