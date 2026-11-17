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

// ============ Nhãn / màu trạng thái — KHÔNG định nghĩa ở đây ============
// Bộ getStatusLabel/getStatusColors/getAllStatuses… chép tay cũ (đã lệch nhãn: "Đang thực hiện"
// vs "Đang làm") bị gỡ 17/11/2026 — 0 nơi import. Nhãn + màu trạng thái/ưu tiên công việc:
//   TASK_STATUS_LABELS / TASK_PRIORITY_LABELS (src/types/index.ts) + bộ chuyển màu ../taskUi.ts.
export {
  taskStatusLabel,
  taskStatusTone,
  taskPriorityLabel,
  taskPriorityTone,
  toneClasses,
  TASK_STATUS_TAG_COLORS,
  TASK_PRIORITY_TAG_COLORS,
} from '../taskUi';
