// ============================================================================
// TASK TYPES - Status & Progress Redesign
// File: src/types/task.types.ts
// Version: 4.4.5
// Huy Anh ERP System
// ============================================================================

// ============================================================================
// STATUS TYPES
// ============================================================================

/**
 * Trạng thái công việc
 * - draft: Nháp, chưa bắt đầu
 * - in_progress: Đang thực hiện
 * - paused: Tạm dừng
 * - finished: Đã hoàn thành (progress = 100%)
 * - cancelled: Đã hủy
 */
export type TaskStatus = 'draft' | 'in_progress' | 'paused' | 'finished' | 'cancelled';

/**
 * Trạng thái đánh giá
 * - none: Chưa có đánh giá
 * - pending_self_eval: Chờ nhân viên tự đánh giá
 * - pending_approval: Chờ Manager phê duyệt
 * - approved: Đã được phê duyệt
 * - rejected: Bị từ chối
 * - revision_requested: Yêu cầu sửa lại
 */
export type EvaluationStatus = 
  | 'none' 
  | 'pending_self_eval' 
  | 'pending_approval' 
  | 'approved' 
  | 'rejected' 
  | 'revision_requested';

/**
 * Chế độ tính tiến độ
 * - manual: Thủ công (user tự update)
 * - auto_time: Tự động theo thời gian (từ start_date đến due_date)
 */
export type ProgressMode = 'manual' | 'auto_time';

/**
 * Độ ưu tiên công việc
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// ============================================================================
// STATUS CONFIGURATIONS
// ============================================================================

export const TASK_STATUS_CONFIG: Record<TaskStatus, {
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
  icon: string;
}> = {
  draft: {
    label: 'Nháp',
    color: 'gray',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
    icon: '📝'
  },
  in_progress: {
    label: 'Đang làm',
    color: 'blue',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    icon: '🔄'
  },
  paused: {
    label: 'Tạm dừng',
    color: 'yellow',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700',
    icon: '⏸️'
  },
  finished: {
    label: 'Hoàn thành',
    color: 'green',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    icon: '✅'
  },
  cancelled: {
    label: 'Đã hủy',
    color: 'red',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    icon: '❌'
  }
};

export const EVALUATION_STATUS_CONFIG: Record<EvaluationStatus, {
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
}> = {
  none: {
    label: 'Chưa có',
    color: 'gray',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-600'
  },
  pending_self_eval: {
    label: 'Chờ tự đánh giá',
    color: 'orange',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700'
  },
  pending_approval: {
    label: 'Chờ phê duyệt',
    color: 'yellow',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700'
  },
  approved: {
    label: 'Đã phê duyệt',
    color: 'green',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700'
  },
  rejected: {
    label: 'Bị từ chối',
    color: 'red',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700'
  },
  revision_requested: {
    label: 'Yêu cầu sửa',
    color: 'purple',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700'
  }
};

export const PRIORITY_CONFIG: Record<TaskPriority, {
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
}> = {
  low: {
    label: 'Thấp',
    color: 'gray',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-600'
  },
  medium: {
    label: 'Trung bình',
    color: 'blue',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700'
  },
  high: {
    label: 'Cao',
    color: 'orange',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700'
  },
  urgent: {
    label: 'Khẩn cấp',
    color: 'red',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700'
  }
};

// ============================================================================
// TASK INTERFACES
// ============================================================================

export interface Task {
  id: string;
  code: string;
  name: string;
  title?: string; // Alias for name in UI
  description?: string | null;
  
  // Relationships
  department_id?: string | null;
  project_id?: string | null;
  parent_task_id?: string | null;
  assignee_id?: string | null;
  assigner_id?: string | null;
  
  // Status & Progress
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  progress_mode: ProgressMode;
  evaluation_status: EvaluationStatus;
  
  // Dates
  start_date?: string | null;
  due_date?: string | null;
  completed_date?: string | null;
  
  // Metadata
  notes?: string | null;
  is_self_assigned?: boolean;
  difficulty?: 'normal' | 'hard' | 'critical';
  overdue_exempt?: boolean;
  task_source?: string;
  created_at: string;
  updated_at: string;
  
  // Relations (populated by queries)
  department?: {
    id: string;
    code?: string;
    name: string;
  } | null;
  assigner?: {
    id: string;
    code?: string;
    full_name: string;
  } | null;
  assignee?: {
    id: string;
    code?: string;
    full_name: string;
  } | null;
  parent_task?: {
    id: string;
    code?: string;
    name: string;
  } | null;
}

export interface CreateTaskInput {
  name: string;
  title?: string; // Alias for UI
  description?: string;
  department_id?: string;
  project_id?: string;
  parent_task_id?: string;
  assignee_id?: string;
  assigner_id?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  progress?: number;
  progress_mode?: ProgressMode;
  start_date?: string;
  due_date?: string;
  notes?: string;
  is_self_assigned?: boolean;
}

export interface UpdateTaskInput {
  name?: string;
  title?: string;
  description?: string;
  department_id?: string;
  project_id?: string;
  parent_task_id?: string;
  assignee_id?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  progress?: number;
  progress_mode?: ProgressMode;
  evaluation_status?: EvaluationStatus;
  start_date?: string;
  due_date?: string;
  completed_date?: string;
  notes?: string;
}

export interface TaskFilter {
  search?: string;
  department_id?: string;
  assignee_id?: string;
  assigner_id?: string;
  project_id?: string;
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  evaluation_status?: EvaluationStatus | EvaluationStatus[];
  start_date_from?: string;
  start_date_to?: string;
  due_date_from?: string;
  due_date_to?: string;
  has_parent?: boolean;
  is_overdue?: boolean;
  is_self_assigned?: boolean;
}

export interface TaskListResponse {
  data: Task[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Kiểm tra task có cần tự đánh giá không
 * Task cần tự đánh giá khi:
 * - status = 'finished' HOẶC progress >= 100
 * - evaluation_status = 'none' hoặc 'pending_self_eval' hoặc 'revision_requested'
 */
export function needsSelfEvaluation(task: {
  status: string;
  progress: number;
  evaluation_status?: string | null;
  has_self_evaluation?: boolean;
  self_evaluation_status?: string | null;
}): boolean {
  const isFinished = task.status === 'finished' || task.progress >= 100;
  
  // Nếu có self_evaluation_status từ query
  if (task.self_evaluation_status !== undefined) {
    return isFinished && (
      !task.has_self_evaluation ||
      task.self_evaluation_status === 'revision_requested'
    );
  }
  
  // Nếu dùng evaluation_status
  const needsEval = !task.evaluation_status || 
    task.evaluation_status === 'none' ||
    task.evaluation_status === 'pending_self_eval' ||
    task.evaluation_status === 'revision_requested';
    
  return isFinished && needsEval;
}

/**
 * Kiểm tra task đang trong tiến độ
 * Task đang làm khi: status = 'in_progress' HOẶC (status = 'draft' và progress > 0)
 * VÀ chưa hoàn thành (progress < 100)
 */
export function isInProgress(task: { status: string; progress: number }): boolean {
  if (task.progress >= 100) return false;
  if (task.status === 'finished' || task.status === 'cancelled') return false;
  return task.status === 'in_progress' || (task.status === 'draft' && task.progress > 0);
}

/**
 * Lấy label cho status
 */
export function getStatusLabel(status: TaskStatus): string {
  return TASK_STATUS_CONFIG[status]?.label || status;
}

/**
 * Lấy config cho status
 */
export function getStatusConfig(status: TaskStatus) {
  return TASK_STATUS_CONFIG[status] || TASK_STATUS_CONFIG.draft;
}

/**
 * Lấy label cho evaluation status
 */
export function getEvaluationStatusLabel(status: EvaluationStatus): string {
  return EVALUATION_STATUS_CONFIG[status]?.label || status;
}

/**
 * Tính tiến độ tự động theo thời gian
 */
export function calculateTimeBasedProgress(startDate: string, dueDate: string): number {
  const start = new Date(startDate).getTime();
  const end = new Date(dueDate).getTime();
  const now = Date.now();
  
  if (now <= start) return 0;
  if (now >= end) return 100;
  
  const progress = ((now - start) / (end - start)) * 100;
  return Math.round(progress);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  TASK_STATUS_CONFIG,
  EVALUATION_STATUS_CONFIG,
  PRIORITY_CONFIG,
  needsSelfEvaluation,
  isInProgress,
  getStatusLabel,
  getStatusConfig,
  getEvaluationStatusLabel,
  calculateTimeBasedProgress,
};