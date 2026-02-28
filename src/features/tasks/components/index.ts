// ============================================================================
// TASK COMPONENTS INDEX
// File: src/features/tasks/components/index.ts
// Phase 4.3: Updated exports with History, Detail, Progress components
// Phase 4.4: Added Subtask components
// Phase 4.5: Added Attachment and Overview components
// Huy Anh ERP System
// ============================================================================

// ============ Task Display Components ============
export { TaskStatusBadge, default as TaskStatusBadgeDefault } from './TaskStatusBadge';
export { TaskPriorityBadge, default as TaskPriorityBadgeDefault } from './TaskPriorityBadge';
export { AssignmentRoleBadge, default as AssignmentRoleBadgeDefault } from './AssignmentRoleBadge';

// ============ Progress Components ============
export { 
  ProgressDisplay, 
  CompactProgress, 
  CircularProgress, 
  StepProgress,
  default as ProgressDisplayDefault,
} from './ProgressDisplay';

export { 
  ProgressInput,
  CompactProgressInput,
  InlineProgressEdit,
  ProgressUpdateForm,
  default as ProgressInputDefault,
} from './ProgressInput';

// ============ Form & Filter Components ============
export { TaskFilters, DEFAULT_FILTERS, default as TaskFiltersDefault } from './TaskFilters';
export { TaskForm, QuickTaskForm, default as TaskFormDefault } from './TaskForm';
export type { TaskFormData } from './TaskForm';

// ============ Participant Components ============
export { ParticipantList, ParticipantAvatars, default as ParticipantListDefault } from './ParticipantList';
export { AddParticipantModal, default as AddParticipantModalDefault } from './AddParticipantModal';

// ============ Phase 4.3: History & Detail Components ============
export { TaskStatusHistory, TaskStatusHistoryCompact, default as TaskStatusHistoryDefault } from './TaskStatusHistory';
export { TaskDetailPanel, TaskDetailModal, default as TaskDetailPanelDefault } from './TaskDetailPanel';

// ============ Phase 4.4: Subtask Components ============
export { SubtasksList, default as SubtasksListDefault } from './SubtasksList';
export { SubtaskBadge, SubtaskBadgeInline, default as SubtaskBadgeDefault } from './SubtaskBadge';
export { ParentTaskInfo, default as ParentTaskInfoDefault } from './ParentTaskInfo';

// ============ Phase 4.5: Attachment & Overview Components ============
export { AttachmentSection, default as AttachmentSectionDefault } from './AttachmentSection';
export { TaskOverviewTab, default as TaskOverviewTabDefault } from './TaskOverviewTab';

// ============ Utility Functions ============
export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Nháp',
    pending: 'Chờ xử lý',
    not_started: 'Chưa bắt đầu',
    in_progress: 'Đang thực hiện',
    completed: 'Hoàn thành',
    pending_evaluation: 'Chờ đánh giá',
    pending_review: 'Chờ duyệt',
    evaluated: 'Đã đánh giá',
    approved: 'Đã duyệt',
    rejected: 'Bị từ chối',
    revision_requested: 'Yêu cầu sửa',
    cancelled: 'Đã hủy',
    on_hold: 'Tạm dừng',
  };
  return labels[status] || status;
}

export function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    draft: '📝',
    pending: '⏳',
    not_started: '⏳',
    in_progress: '🔄',
    completed: '✓',
    pending_evaluation: '📝',
    pending_review: '⏳',
    evaluated: '✅',
    approved: '✔️',
    rejected: '✕',
    revision_requested: '↻',
    cancelled: '🚫',
    on_hold: '⏸️',
  };
  return icons[status] || '❓';
}

export function getStatusColors(status: string): { bg: string; text: string } {
  const colors: Record<string, { bg: string; text: string }> = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-600' },
    pending: { bg: 'bg-gray-100', text: 'text-gray-700' },
    not_started: { bg: 'bg-gray-100', text: 'text-gray-700' },
    in_progress: { bg: 'bg-blue-100', text: 'text-blue-700' },
    completed: { bg: 'bg-green-100', text: 'text-green-700' },
    pending_evaluation: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    pending_review: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    evaluated: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
    approved: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    rejected: { bg: 'bg-red-100', text: 'text-red-700' },
    revision_requested: { bg: 'bg-orange-100', text: 'text-orange-700' },
    cancelled: { bg: 'bg-gray-200', text: 'text-gray-600' },
    on_hold: { bg: 'bg-purple-100', text: 'text-purple-700' },
  };
  return colors[status] || { bg: 'bg-gray-100', text: 'text-gray-600' };
}

export function isCompletedStatus(status: string): boolean {
  return ['completed', 'evaluated', 'approved'].includes(status);
}

export function canEvaluate(status: string): boolean {
  return ['completed', 'revision_requested'].includes(status);
}

export function isPendingApproval(status: string): boolean {
  return status === 'pending_evaluation' || status === 'pending_review';
}

export function getAllStatuses(): { value: string; label: string }[] {
  return [
    { value: 'draft', label: 'Nháp' },
    { value: 'pending', label: 'Chờ xử lý' },
    { value: 'not_started', label: 'Chưa bắt đầu' },
    { value: 'in_progress', label: 'Đang thực hiện' },
    { value: 'completed', label: 'Hoàn thành' },
    { value: 'pending_evaluation', label: 'Chờ đánh giá' },
    { value: 'pending_review', label: 'Chờ duyệt' },
    { value: 'evaluated', label: 'Đã đánh giá' },
    { value: 'approved', label: 'Đã duyệt' },
    { value: 'rejected', label: 'Bị từ chối' },
    { value: 'revision_requested', label: 'Yêu cầu sửa' },
    { value: 'cancelled', label: 'Đã hủy' },
    { value: 'on_hold', label: 'Tạm dừng' },
  ];
}

export function calculateProgressByStatus(status: string): number {
  const statusProgress: Record<string, number> = {
    draft: 0,
    pending: 0,
    not_started: 0,
    in_progress: 50,
    completed: 100,
    pending_evaluation: 100,
    pending_review: 100,
    evaluated: 100,
    approved: 100,
    rejected: 0,
    revision_requested: 50,
    cancelled: 0,
    on_hold: 0,
  };
  return statusProgress[status] ?? 0;
}

export function getProgressColor(progress: number): string {
  if (progress >= 100) return 'bg-green-500';
  if (progress >= 70) return 'bg-blue-500';
  if (progress >= 40) return 'bg-yellow-500';
  return 'bg-gray-400';
}

// ============ Types ============
export type TaskStatus = 
  | 'draft'
  | 'pending'
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'pending_evaluation'
  | 'pending_review'
  | 'evaluated'
  | 'approved'
  | 'rejected'
  | 'revision_requested'
  | 'cancelled'
  | 'on_hold';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type AssignmentRole = 'assignee' | 'reviewer' | 'observer' | 'creator' | 'approver';

export type ProgressMode = 'manual' | 'auto_status' | 'auto_subtasks';