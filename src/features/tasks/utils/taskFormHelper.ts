// ============================================================================
// TASK FORM HELPER
// File: src/features/tasks/utils/taskFormHelper.ts
// ============================================================================

import type { TaskFormData } from '../components/TaskForm';

/**
 * Transform TaskFormData sang format database hiện tại
 * Bỏ qua các field chưa có trong database
 */
export function transformFormToDatabase(
  formData: TaskFormData,
  createdBy?: string | null
): Record<string, any> {
  // Chuyển date sang ISO string
  const formatDate = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toISOString();
    } catch {
      return null;
    }
  };

  // Xác định status dựa trên progress
  // DB rule: in_progress requires progress > 0
  const progress = formData.initial_progress || 0;
  let status = 'draft';
  
  if (progress > 0 && progress < 100) {
    status = 'in_progress';
  } else if (progress >= 100) {
    status = 'completed';
  }

  return {
    name: formData.name,
    description: formData.description || null,
    priority: formData.priority || 'medium',
    status: status,
    progress: progress,
    start_date: formatDate(formData.start_date),
    due_date: formatDate(formData.due_date),
    assignee_id: formData.assignee_id || null,
    department_id: formData.department_id || null,
    parent_task_id: formData.parent_task_id || null,
    tags: formData.tags && formData.tags.length > 0 ? formData.tags : null,
    notes: formData.notes || null,
    created_by: createdBy || null,
  };
}

export default transformFormToDatabase;