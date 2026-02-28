// ============================================================================
// TASK COMMENT SERVICE
// File: src/services/taskCommentService.ts
// Huy Anh ERP System - Phase 4.4: Task Comments
// ============================================================================

import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface TaskComment {
  id: string;
  task_id: string;
  content: string;
  author_id: string;
  parent_comment_id: string | null;
  is_edited: boolean;
  edited_at: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  author?: {
    id: string;
    full_name: string;
    avatar_url?: string | null;
    email?: string;
  } | null;
  // Nested replies
  replies?: TaskComment[];
}

export interface CreateCommentInput {
  task_id: string;
  content: string;
  author_id: string;
  parent_comment_id?: string | null;
}

export interface UpdateCommentInput {
  content: string;
}

export interface CommentStats {
  total: number;
  rootComments: number;
  replies: number;
}

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
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Lấy danh sách comments của task (bao gồm replies)
 */
export async function getComments(taskId: string): Promise<{ data: TaskComment[]; error: Error | null }> {
  console.log('📋 [taskCommentService] getComments for task:', taskId);

  try {
    const { data, error } = await supabase
      .from('task_comments')
      .select(`
        *,
        author:employees!task_comments_author_id_fkey(
          id,
          full_name,
          avatar_url,
          email
        )
      `)
      .eq('task_id', taskId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Transform: group replies under parent comments
    const comments = (data || []).map(item => ({
      ...item,
      author: Array.isArray(item.author) ? item.author[0] : item.author,
    }));

    // Separate root comments and replies
    const rootComments: TaskComment[] = [];
    const repliesMap: Record<string, TaskComment[]> = {};

    comments.forEach(comment => {
      if (comment.parent_comment_id) {
        // This is a reply
        if (!repliesMap[comment.parent_comment_id]) {
          repliesMap[comment.parent_comment_id] = [];
        }
        repliesMap[comment.parent_comment_id].push(comment);
      } else {
        // This is a root comment
        rootComments.push(comment);
      }
    });

    // Attach replies to root comments
    const result = rootComments.map(comment => ({
      ...comment,
      replies: repliesMap[comment.id] || [],
    }));

    console.log('✅ [taskCommentService] Found', result.length, 'root comments');
    return { data: result, error: null };
  } catch (error) {
    console.error('❌ [taskCommentService] getComments error:', error);
    return { data: [], error: error as Error };
  }
}

/**
 * Thêm comment mới
 */
export async function createComment(input: CreateCommentInput): Promise<{ data: TaskComment | null; error: Error | null }> {
  console.log('📝 [taskCommentService] createComment:', input);

  try {
    // Validate content
    if (!input.content || input.content.trim().length === 0) {
      throw new Error('Nội dung bình luận không được để trống');
    }

    if (input.content.length > 5000) {
      throw new Error('Nội dung bình luận không được vượt quá 5000 ký tự');
    }

    const { data, error } = await supabase
      .from('task_comments')
      .insert({
        task_id: input.task_id,
        content: input.content.trim(),
        author_id: input.author_id,
        parent_comment_id: input.parent_comment_id || null,
      })
      .select(`
        *,
        author:employees!task_comments_author_id_fkey(
          id,
          full_name,
          avatar_url,
          email
        )
      `)
      .single();

    if (error) throw error;

    const result = {
      ...data,
      author: Array.isArray(data.author) ? data.author[0] : data.author,
      replies: [],
    };

    console.log('✅ [taskCommentService] Comment created:', result.id);
    return { data: result, error: null };
  } catch (error) {
    console.error('❌ [taskCommentService] createComment error:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Sửa comment
 */
export async function updateComment(
  commentId: string,
  input: UpdateCommentInput
): Promise<{ data: TaskComment | null; error: Error | null }> {
  console.log('✏️ [taskCommentService] updateComment:', commentId);

  try {
    // Validate content
    if (!input.content || input.content.trim().length === 0) {
      throw new Error('Nội dung bình luận không được để trống');
    }

    if (input.content.length > 5000) {
      throw new Error('Nội dung bình luận không được vượt quá 5000 ký tự');
    }

    const { data, error } = await supabase
      .from('task_comments')
      .update({
        content: input.content.trim(),
        is_edited: true,
        edited_at: new Date().toISOString(),
      })
      .eq('id', commentId)
      .select(`
        *,
        author:employees!task_comments_author_id_fkey(
          id,
          full_name,
          avatar_url,
          email
        )
      `)
      .single();

    if (error) throw error;

    const result = {
      ...data,
      author: Array.isArray(data.author) ? data.author[0] : data.author,
    };

    console.log('✅ [taskCommentService] Comment updated:', commentId);
    return { data: result, error: null };
  } catch (error) {
    console.error('❌ [taskCommentService] updateComment error:', error);
    return { data: null, error: error as Error };
  }
}

/**
 * Xóa comment (soft delete)
 */
export async function deleteComment(commentId: string): Promise<{ success: boolean; error: Error | null }> {
  console.log('🗑️ [taskCommentService] deleteComment:', commentId);

  try {
    // Soft delete the comment
    const { error } = await supabase
      .from('task_comments')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', commentId);

    if (error) throw error;

    // Also soft delete replies
    await supabase
      .from('task_comments')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('parent_comment_id', commentId);

    console.log('✅ [taskCommentService] Comment deleted:', commentId);
    return { success: true, error: null };
  } catch (error) {
    console.error('❌ [taskCommentService] deleteComment error:', error);
    return { success: false, error: error as Error };
  }
}

/**
 * Lấy số lượng comments của task
 */
export async function getCommentCount(taskId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('task_comments')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)
      .eq('is_deleted', false);

    if (error) throw error;
    return count || 0;
  } catch (error) {
    console.error('❌ [taskCommentService] getCommentCount error:', error);
    return 0;
  }
}

/**
 * Lấy thống kê comments của task
 */
export async function getCommentStats(taskId: string): Promise<CommentStats> {
  try {
    const { data, error } = await supabase
      .from('task_comments')
      .select('id, parent_comment_id')
      .eq('task_id', taskId)
      .eq('is_deleted', false);

    if (error) throw error;

    const comments = data || [];
    const rootComments = comments.filter(c => !c.parent_comment_id).length;
    const replies = comments.filter(c => c.parent_comment_id).length;

    return {
      total: comments.length,
      rootComments,
      replies,
    };
  } catch (error) {
    console.error('❌ [taskCommentService] getCommentStats error:', error);
    return { total: 0, rootComments: 0, replies: 0 };
  }
}

// ============================================================================
// SERVICE OBJECT (Alternative export)
// ============================================================================

export const taskCommentService = {
  getComments,
  createComment,
  updateComment,
  deleteComment,
  getCommentCount,
  getCommentStats,
  formatRelativeTime,
};

export default taskCommentService;