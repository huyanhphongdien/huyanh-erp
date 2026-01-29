// ============================================================================
// TASK ACTIVITY SERVICE
// File: src/services/taskActivityService.ts
// Huy Anh ERP System - Phase 4.4: Activity Timeline
// ============================================================================

import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export type TaskActivityAction =
  | 'created'
  | 'updated'
  | 'assigned'
  | 'unassigned'
  | 'status_changed'
  | 'progress_updated'
  | 'priority_changed'
  | 'due_date_changed'
  | 'comment_added'
  | 'comment_edited'
  | 'comment_deleted'
  | 'attachment_added'
  | 'attachment_deleted'
  | 'self_eval_submitted'
  | 'self_eval_updated'
  | 'approved'
  | 'rejected'
  | 'revision_requested'
  | 'subtask_added'
  | 'subtask_removed'
  | 'subtask_completed';

export interface TaskActivity {
  id: string;
  task_id: string;
  action: TaskActivityAction;
  actor_id: string | null;
  details: Record<string, any>;
  created_at: string;
  // Relations
  actor?: {
    id: string;
    full_name: string;
    avatar_url?: string | null;
  } | null;
}

export interface CreateActivityInput {
  task_id: string;
  action: TaskActivityAction;
  actor_id: string;
  details?: Record<string, any>;
}

export interface ActivityFilters {
  task_id: string;
  actions?: TaskActivityAction[];
  actor_id?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// ACTION CONFIG (Icons, Colors, Labels)
// ============================================================================

export const ACTION_CONFIG: Record<TaskActivityAction, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
}> = {
  created: {
    label: 'đã tạo công việc',
    icon: '✨',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  updated: {
    label: 'đã cập nhật công việc',
    icon: '📝',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  assigned: {
    label: 'đã giao việc cho',
    icon: '👤',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  unassigned: {
    label: 'đã hủy giao việc',
    icon: '👤',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  status_changed: {
    label: 'đã chuyển trạng thái',
    icon: '🔄',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  progress_updated: {
    label: 'đã cập nhật tiến độ',
    icon: '📊',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
  },
  priority_changed: {
    label: 'đã đổi độ ưu tiên',
    icon: '🚨',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  due_date_changed: {
    label: 'đã đổi hạn hoàn thành',
    icon: '📅',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
  },
  comment_added: {
    label: 'đã thêm bình luận',
    icon: '💬',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  comment_edited: {
    label: 'đã sửa bình luận',
    icon: '✏️',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
  },
  comment_deleted: {
    label: 'đã xóa bình luận',
    icon: '🗑️',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  attachment_added: {
    label: 'đã đính kèm file',
    icon: '📎',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
  },
  attachment_deleted: {
    label: 'đã xóa file đính kèm',
    icon: '🗑️',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  self_eval_submitted: {
    label: 'đã nộp tự đánh giá',
    icon: '📋',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
  },
  self_eval_updated: {
    label: 'đã cập nhật tự đánh giá',
    icon: '📋',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
  },
  approved: {
    label: 'đã phê duyệt',
    icon: '✅',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  rejected: {
    label: 'đã từ chối',
    icon: '❌',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  revision_requested: {
    label: 'đã yêu cầu chỉnh sửa',
    icon: '🔄',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
  subtask_added: {
    label: 'đã thêm công việc con',
    icon: '📌',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  subtask_removed: {
    label: 'đã xóa công việc con',
    icon: '🗑️',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
  },
  subtask_completed: {
    label: 'đã hoàn thành công việc con',
    icon: '✅',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
};

// ============================================================================
// STATUS LABELS (Vietnamese)
// ============================================================================

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  new: 'Mới',
  in_progress: 'Đang làm',
  paused: 'Tạm dừng',
  pending_review: 'Chờ review',
  completed: 'Hoàn thành',
  finished: 'Hoàn thành',
  cancelled: 'Đã hủy',
  accepted: 'Đã duyệt',
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  urgent: 'Khẩn cấp',
};

// ============================================================================
// HELPER: Format relative time
// ============================================================================

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'Vừa xong';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} phút trước`;
  } else if (diffHours < 24) {
    return `${diffHours} giờ trước`;
  } else if (diffDays === 1) {
    return 'Hôm qua';
  } else if (diffDays < 7) {
    return `${diffDays} ngày trước`;
  } else {
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

// ============================================================================
// HELPER: Format file size
// ============================================================================

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ============================================================================
// HELPER: Generate activity description
// ============================================================================

export function generateActivityDescription(activity: TaskActivity): string {
  const config = ACTION_CONFIG[activity.action] || { label: activity.action };
  const details = activity.details || {};
  
  switch (activity.action) {
    case 'assigned':
      return `${config.label} ${details.assignee_name || 'người dùng'}`;
    
    case 'unassigned':
      return `${config.label} (trước đó: ${details.old_assignee_name || 'không rõ'})`;
    
    case 'status_changed':
      const oldStatus = STATUS_LABELS[details.old_status] || details.old_status;
      const newStatus = STATUS_LABELS[details.new_status] || details.new_status;
      return `${config.label} ${oldStatus} → ${newStatus}`;
    
    case 'progress_updated':
      return `${config.label} ${details.old_progress || 0}% → ${details.new_progress || 0}%`;
    
    case 'priority_changed':
      const oldPriority = PRIORITY_LABELS[details.old_priority] || details.old_priority;
      const newPriority = PRIORITY_LABELS[details.new_priority] || details.new_priority;
      return `${config.label} ${oldPriority} → ${newPriority}`;
    
    case 'attachment_added':
      return `${config.label} "${details.file_name || 'file'}"`;
    
    case 'comment_added':
      if (details.is_reply) {
        return 'đã trả lời bình luận';
      }
      return config.label;
    
    case 'approved':
      if (details.score) {
        return `${config.label} (${details.score} điểm)`;
      }
      return config.label;
    
    case 'self_eval_submitted':
      if (details.self_score) {
        return `${config.label} (tự chấm ${details.self_score} điểm)`;
      }
      return config.label;
    
    default:
      return config.label;
  }
}

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Lấy danh sách activities của task
 */
export async function getActivities(
  filters: ActivityFilters
): Promise<{ data: TaskActivity[]; total: number; error: Error | null }> {
  console.log('📋 [taskActivityService] getActivities:', filters);

  try {
    let query = supabase
      .from('task_activities')
      .select(`
        *,
        actor:employees!task_activities_actor_id_fkey(
          id,
          full_name,
          avatar_url
        )
      `, { count: 'exact' })
      .eq('task_id', filters.task_id)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters.actions && filters.actions.length > 0) {
      query = query.in('action', filters.actions);
    }

    if (filters.actor_id) {
      query = query.eq('actor_id', filters.actor_id);
    }

    if (filters.from_date) {
      query = query.gte('created_at', filters.from_date);
    }

    if (filters.to_date) {
      query = query.lte('created_at', filters.to_date);
    }

    // Pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const { data, count, error } = await query;

    if (error) throw error;

    // Transform data
    const activities = (data || []).map(item => ({
      ...item,
      actor: Array.isArray(item.actor) ? item.actor[0] : item.actor,
    }));

    console.log('✅ [taskActivityService] Found', activities.length, 'activities');
    return { data: activities, total: count || 0, error: null };
  } catch (error) {
    console.error('❌ [taskActivityService] getActivities error:', error);
    return { data: [], total: 0, error: error as Error };
  }
}

/**
 * Thêm activity mới (manual logging)
 */
export async function createActivity(
  input: CreateActivityInput
): Promise<{ data: TaskActivity | null; error: Error | null }> {
  console.log('📝 [taskActivityService] createActivity:', input);

  try {
    const { data, error } = await supabase
      .from('task_activities')
      .insert({
        task_id: input.task_id,
        action: input.action,
        actor_id: input.actor_id,
        details: input.details || {},
      })
      .select(`
        *,
        actor:employees!task_activities_actor_id_fkey(
          id,
          full_name,
          avatar_url
        )
      `)
      .single();

    if (error) throw error;

    const result = {
      ...data,
      actor: Array.isArray(data.actor) ? data.actor[0] : data.actor,
    };

    console.log('✅ [taskActivityService] Activity created:', result.id);
    return { data: result, error: null };
  } catch (error) {
    console.error('❌ [taskActivityService] createActivity error:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Lấy số lượng activities của task
 */
export async function getActivityCount(taskId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('task_activities')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('❌ [taskActivityService] getActivityCount error:', error);
    return 0;
  }
}

// ============================================================================
// SERVICE OBJECT (Alternative export)
// ============================================================================

export const taskActivityService = {
  getActivities,
  createActivity,
  getActivityCount,
  formatRelativeTime,
  formatFileSize,
  generateActivityDescription,
  ACTION_CONFIG,
  STATUS_LABELS,
  PRIORITY_LABELS,
};

export default taskActivityService;