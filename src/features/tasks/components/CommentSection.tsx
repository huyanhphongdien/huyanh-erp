// ============================================================================
// COMMENT SECTION COMPONENT
// File: src/features/tasks/components/CommentSection.tsx
// Huy Anh ERP System - Phase 4.4: Task Comments
// ============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Send,
  Edit3,
  Trash2,
  Reply,
  MoreHorizontal,
  X,
  ChevronDown,
  ChevronUp,
  User,
  Clock,
  AlertCircle,
} from 'lucide-react';
import {
  taskCommentService,
  type TaskComment,
  formatRelativeTime,
} from '../../../services/taskCommentService';

// ============================================================================
// TYPES
// ============================================================================

interface CommentSectionProps {
  taskId: string;
  currentUserId: string;
  canComment?: boolean;
}

interface CommentItemProps {
  comment: TaskComment;
  currentUserId: string;
  canComment: boolean;
  onReply: (commentId: string) => void;
  onEdit: (comment: TaskComment) => void;
  onDelete: (commentId: string) => void;
  isReply?: boolean;
}

// ============================================================================
// COMMENT ITEM COMPONENT
// ============================================================================

function CommentItem({
  comment,
  currentUserId,
  canComment,
  onReply,
  onEdit,
  onDelete,
  isReply = false,
}: CommentItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const isAuthor = comment.author_id === currentUserId;
  const authorName = comment.author?.full_name || 'Người dùng';
  const authorInitial = authorName.charAt(0).toUpperCase();

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`flex gap-3 ${isReply ? 'ml-10 mt-3' : ''}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 ${isReply ? 'w-8 h-8' : 'w-10 h-10'} rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-medium ${isReply ? 'text-xs' : 'text-sm'}`}>
        {comment.author?.avatar_url ? (
          <img
            src={comment.author.avatar_url}
            alt={authorName}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          authorInitial
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium text-gray-900 ${isReply ? 'text-sm' : ''}`}>
            {authorName}
          </span>
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Clock size={12} />
            {formatRelativeTime(comment.created_at)}
          </span>
          {comment.is_edited && (
            <span className="text-xs text-gray-400 italic">(đã chỉnh sửa)</span>
          )}
        </div>

        {/* Comment Content */}
        <div className={`mt-1 text-gray-700 whitespace-pre-wrap break-words ${isReply ? 'text-sm' : ''}`}>
          {comment.content}
        </div>

        {/* Actions */}
        <div className="mt-2 flex items-center gap-3">
          {/* Reply button - chỉ hiện cho root comments */}
          {canComment && !isReply && (
            <button
              onClick={() => onReply(comment.id)}
              className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
            >
              <Reply size={14} />
              Trả lời
            </button>
          )}

          {/* Edit/Delete - chỉ hiện cho author */}
          {isAuthor && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="text-xs text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
              >
                <MoreHorizontal size={16} />
              </button>

              {showMenu && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[100px]">
                  <button
                    onClick={() => {
                      onEdit(comment);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Edit3 size={14} />
                    Sửa
                  </button>
                  <button
                    onClick={() => {
                      onDelete(comment.id);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <Trash2 size={14} />
                    Xóa
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-3 space-y-3 border-l-2 border-gray-100 pl-3">
            {comment.replies.map(reply => (
              <CommentItem
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                canComment={canComment}
                onReply={onReply}
                onEdit={onEdit}
                onDelete={onDelete}
                isReply
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CommentSection({ taskId, currentUserId, canComment = true }: CommentSectionProps) {
  // State
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Form state
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<TaskComment | null>(null);
  const [editContent, setEditContent] = useState('');

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ========== FETCH COMMENTS ==========
  const fetchComments = async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await taskCommentService.getComments(taskId);

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setComments(data);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (taskId) {
      fetchComments();
    }
  }, [taskId]);

  // ========== HANDLERS ==========

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    const { data, error: createError } = await taskCommentService.createComment({
      task_id: taskId,
      content: newComment.trim(),
      author_id: currentUserId,
      parent_comment_id: replyTo,
    });

    if (createError) {
      setError(createError.message);
    } else if (data) {
      // Add to list
      if (replyTo) {
        // Add reply to parent comment
        setComments(prev =>
          prev.map(c =>
            c.id === replyTo
              ? { ...c, replies: [...(c.replies || []), data] }
              : c
          )
        );
      } else {
        // Add root comment
        setComments(prev => [...prev, data]);
      }
      setNewComment('');
      setReplyTo(null);
    }

    setSubmitting(false);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingComment || !editContent.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    const { data, error: updateError } = await taskCommentService.updateComment(
      editingComment.id,
      { content: editContent.trim() }
    );

    if (updateError) {
      setError(updateError.message);
    } else if (data) {
      // Update in list
      setComments(prev =>
        prev.map(c => {
          if (c.id === data.id) {
            return { ...c, ...data };
          }
          // Check replies
          if (c.replies) {
            return {
              ...c,
              replies: c.replies.map(r => (r.id === data.id ? { ...r, ...data } : r)),
            };
          }
          return c;
        })
      );
      setEditingComment(null);
      setEditContent('');
    }

    setSubmitting(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    setSubmitting(true);
    const { success, error: deleteError } = await taskCommentService.deleteComment(deleteId);

    if (deleteError) {
      setError(deleteError.message);
    } else if (success) {
      // Remove from list
      setComments(prev =>
        prev
          .filter(c => c.id !== deleteId)
          .map(c => ({
            ...c,
            replies: c.replies?.filter(r => r.id !== deleteId) || [],
          }))
      );
    }

    setDeleteId(null);
    setSubmitting(false);
  };

  const handleReply = (commentId: string) => {
    setReplyTo(commentId);
    setEditingComment(null);
    textareaRef.current?.focus();
  };

  const handleStartEdit = (comment: TaskComment) => {
    setEditingComment(comment);
    setEditContent(comment.content);
    setReplyTo(null);
  };

  const cancelReply = () => {
    setReplyTo(null);
  };

  const cancelEdit = () => {
    setEditingComment(null);
    setEditContent('');
  };

  // Find parent comment name for reply indicator
  const replyToComment = replyTo ? comments.find(c => c.id === replyTo) : null;

  // Count total comments including replies
  const totalCount = comments.reduce(
    (sum, c) => sum + 1 + (c.replies?.length || 0),
    0
  );

  // ========== RENDER ==========

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Bình luận</h3>
          {totalCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
              {totalCount}
            </span>
          )}
        </div>
        {isCollapsed ? (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className="px-4 pb-4">
          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Comment Form */}
          {canComment && !editingComment && (
            <form onSubmit={handleSubmit} className="mb-4">
              {/* Reply indicator */}
              {replyTo && replyToComment && (
                <div className="mb-2 flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
                  <Reply size={14} />
                  <span>
                    Đang trả lời{' '}
                    <span className="font-medium text-gray-700">
                      {replyToComment.author?.full_name || 'Người dùng'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={cancelReply}
                    className="ml-auto text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              <div className="flex gap-3">
                {/* Current user avatar */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white font-medium text-sm">
                  <User size={18} />
                </div>

                {/* Input */}
                <div className="flex-1">
                  <textarea
                    ref={textareaRef}
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder={replyTo ? 'Viết trả lời...' : 'Viết bình luận...'}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm"
                    disabled={submitting}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-400">
                      {newComment.length}/5000 ký tự
                    </span>
                    <button
                      type="submit"
                      disabled={!newComment.trim() || submitting}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send size={14} />
                      {submitting ? 'Đang gửi...' : 'Gửi'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}

          {/* Edit Form */}
          {editingComment && (
            <form onSubmit={handleEdit} className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2 text-sm text-yellow-700">
                <Edit3 size={14} />
                <span>Chỉnh sửa bình luận</span>
              </div>
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 resize-none text-sm"
                disabled={submitting}
                autoFocus
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                  disabled={submitting}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!editContent.trim() || submitting}
                  className="px-4 py-1.5 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          )}

          {/* Comments List */}
          {loading ? (
            <div className="py-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-500">Đang tải bình luận...</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="py-8 text-center">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Chưa có bình luận nào</p>
              {canComment && (
                <p className="text-sm text-gray-400 mt-1">
                  Hãy là người đầu tiên bình luận!
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map(comment => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentUserId={currentUserId}
                  canComment={canComment}
                  onReply={handleReply}
                  onEdit={handleStartEdit}
                  onDelete={setDeleteId}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Xác nhận xóa</h3>
            <p className="text-gray-500 mb-4">
              Bạn có chắc muốn xóa bình luận này? Hành động này không thể hoàn tác.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
                disabled={submitting}
              >
                Hủy
              </button>
              <button
                onClick={handleDelete}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CommentSection;