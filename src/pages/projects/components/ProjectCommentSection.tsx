// ============================================================================
// PROJECT COMMENT SECTION — Bình luận dự án + @mention + notification
// File: src/pages/projects/components/ProjectCommentSection.tsx
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageSquare, Send, Edit3, Trash2, Reply, MoreHorizontal,
  X, ChevronDown, ChevronUp, User, Clock, AlertCircle, AtSign,
} from 'lucide-react'
import {
  getComments, createComment, updateComment, deleteComment,
  getMentionableUsers, formatRelativeTime,
  type ProjectComment, type MentionableUser,
} from '../../../services/project/projectCommentService'
import { notify } from '../../../services/notificationHelper'

// ============================================================================
// MENTION DROPDOWN
// ============================================================================

function MentionDropdown({
  users,
  filter,
  onSelect,
  position,
}: {
  users: MentionableUser[]
  filter: string
  onSelect: (user: MentionableUser) => void
  position: { top: number; left: number }
}) {
  const filtered = users.filter(u =>
    u.full_name.toLowerCase().includes(filter.toLowerCase())
  ).slice(0, 8)

  if (filtered.length === 0) return null

  return (
    <div
      className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto w-64"
      style={{ top: position.top, left: position.left }}
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
        Tag người
      </div>
      {filtered.map(user => (
        <button
          key={user.id}
          onClick={() => onSelect(user)}
          className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-blue-50 text-left transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
            {user.avatar_url ? (
              <img src={user.avatar_url} className="w-full h-full rounded-full object-cover" />
            ) : (
              user.full_name.charAt(0)
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{user.full_name}</div>
            {user.department_name && (
              <div className="text-[11px] text-gray-400 truncate">{user.department_name}</div>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// COMMENT INPUT WITH @MENTION
// ============================================================================

function CommentInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  submitting,
  mentionableUsers,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  placeholder: string
  submitting: boolean
  mentionableUsers: MentionableUser[]
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showMention, setShowMention] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionPos, setMentionPos] = useState({ top: 0, left: 0 })
  const [mentionStart, setMentionStart] = useState(-1)

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    const cursorPos = e.target.selectionStart || 0
    onChange(text)

    // Detect @mention
    const textBefore = text.slice(0, cursorPos)
    const atIndex = textBefore.lastIndexOf('@')

    if (atIndex >= 0) {
      const charBefore = atIndex > 0 ? textBefore[atIndex - 1] : ' '
      const textAfterAt = textBefore.slice(atIndex + 1)
      const hasSpace = textAfterAt.includes('\n')

      if ((charBefore === ' ' || charBefore === '\n' || atIndex === 0) && !hasSpace) {
        setShowMention(true)
        setMentionFilter(textAfterAt)
        setMentionStart(atIndex)
        // Position dropdown below textarea
        setMentionPos({ top: (textareaRef.current?.offsetHeight || 40) + 4, left: 0 })
        return
      }
    }
    setShowMention(false)
  }

  const handleSelectMention = (user: MentionableUser) => {
    const before = value.slice(0, mentionStart)
    const after = value.slice((textareaRef.current?.selectionStart || value.length))
    const newValue = `${before}@${user.full_name} ${after}`
    onChange(newValue)
    setShowMention(false)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !showMention) {
      e.preventDefault()
      onSubmit()
    }
    if (e.key === 'Escape') setShowMention(false)
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        maxLength={5000}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm min-h-[44px]"
        disabled={submitting}
      />
      {showMention && (
        <MentionDropdown
          users={mentionableUsers}
          filter={mentionFilter}
          onSelect={handleSelectMention}
          position={mentionPos}
        />
      )}
    </div>
  )
}

// ============================================================================
// RENDER CONTENT WITH @MENTION HIGHLIGHTING
// ============================================================================

function RenderContent({ content, mentionableUsers }: { content: string; mentionableUsers: MentionableUser[] }) {
  // Split content by @mentions and highlight them
  const parts = content.split(/(@\S+(?:\s\S+)?)/g)

  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('@')) {
          const name = part.slice(1)
          const isUser = mentionableUsers.some(u =>
            u.full_name.toLowerCase() === name.toLowerCase() ||
            u.full_name.toLowerCase().startsWith(name.trim().toLowerCase())
          )
          if (isUser) {
            return (
              <span key={i} className="text-blue-600 font-medium bg-blue-50 px-0.5 rounded">
                {part}
              </span>
            )
          }
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

// ============================================================================
// COMMENT ITEM
// ============================================================================

function CommentItem({
  comment, currentUserId, onReply, onEdit, onDelete, isReply = false, mentionableUsers,
}: {
  comment: ProjectComment
  currentUserId: string
  onReply: (id: string) => void
  onEdit: (c: ProjectComment) => void
  onDelete: (id: string) => void
  isReply?: boolean
  mentionableUsers: MentionableUser[]
}) {
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isAuthor = comment.author_id === currentUserId
  const authorName = comment.author?.full_name || 'Người dùng'

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className={`flex gap-3 ${isReply ? 'ml-10 mt-3' : ''}`}>
      <div className={`flex-shrink-0 ${isReply ? 'w-8 h-8' : 'w-10 h-10'} rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-medium ${isReply ? 'text-xs' : 'text-sm'}`}>
        {comment.author?.avatar_url ? (
          <img src={comment.author.avatar_url} alt={authorName} className="w-full h-full rounded-full object-cover" />
        ) : (
          authorName.charAt(0).toUpperCase()
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium text-gray-900 ${isReply ? 'text-sm' : ''}`}>{authorName}</span>
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Clock size={12} />
            {formatRelativeTime(comment.created_at)}
          </span>
          {comment.is_edited && <span className="text-xs text-gray-400 italic">(đã sửa)</span>}
        </div>

        <div className={`mt-1 text-gray-700 whitespace-pre-wrap break-words ${isReply ? 'text-sm' : ''}`}>
          <RenderContent content={comment.content} mentionableUsers={mentionableUsers} />
        </div>

        <div className="mt-2 flex items-center gap-3">
          {!isReply && (
            <button onClick={() => onReply(comment.id)} className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1 min-h-[44px] sm:min-h-0">
              <Reply size={14} /> Trả lời
            </button>
          )}
          {isAuthor && (
            <div className="relative" ref={menuRef}>
              <button onClick={() => setShowMenu(!showMenu)} className="text-xs text-gray-400 hover:text-gray-600 p-1 rounded min-h-[44px] sm:min-h-0 min-w-[44px] sm:min-w-0 flex items-center justify-center">
                <MoreHorizontal size={16} />
              </button>
              {showMenu && (
                <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 min-w-[100px]">
                  <button onClick={() => { onEdit(comment); setShowMenu(false) }} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    <Edit3 size={14} /> Sửa
                  </button>
                  <button onClick={() => { onDelete(comment.id); setShowMenu(false) }} className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                    <Trash2 size={14} /> Xóa
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-3 space-y-3 border-l-2 border-gray-100 pl-3">
            {comment.replies.map(reply => (
              <CommentItem key={reply.id} comment={reply} currentUserId={currentUserId} onReply={onReply} onEdit={onEdit} onDelete={onDelete} isReply mentionableUsers={mentionableUsers} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface Props {
  projectId: string
  projectName: string
  currentUserId: string
  currentUserName: string
}

export default function ProjectCommentSection({ projectId, projectName, currentUserId, currentUserName }: Props) {
  const [comments, setComments] = useState<ProjectComment[]>([])
  const [loading, setLoading] = useState(true)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([])

  // Form
  const [newComment, setNewComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editingComment, setEditingComment] = useState<ProjectComment | null>(null)
  const [editContent, setEditContent] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load data
  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    Promise.all([
      getComments(projectId),
      getMentionableUsers(projectId),
    ]).then(([c, u]) => {
      setComments(c)
      setMentionableUsers(u)
      setLoading(false)
    })
  }, [projectId])

  const totalCount = comments.reduce((sum, c) => sum + 1 + (c.replies?.length || 0), 0)

  // ========== HANDLERS ==========

  const handleSubmit = useCallback(async () => {
    if (!newComment.trim() || submitting) return
    setSubmitting(true)
    setError(null)

    // Parse @mentions
    const mentionedIds: string[] = []
    const mentionRegex = /@([^\n@]+?)(?=\s|$)/g
    let match: RegExpExecArray | null
    while ((match = mentionRegex.exec(newComment)) !== null) {
      const name = match[1].trim()
      const user = mentionableUsers.find(u => u.full_name === name)
      if (user && !mentionedIds.includes(user.id) && user.id !== currentUserId) {
        mentionedIds.push(user.id)
      }
    }

    const result = await createComment({
      project_id: projectId,
      content: newComment.trim(),
      author_id: currentUserId,
      parent_comment_id: replyTo,
      mentioned_ids: mentionedIds,
    })

    if (result) {
      if (replyTo) {
        setComments(prev => prev.map(c => c.id === replyTo ? { ...c, replies: [...(c.replies || []), result] } : c))
      } else {
        setComments(prev => [...prev, result])
      }
      setNewComment('')
      setReplyTo(null)

      // Send notifications to @mentioned users
      for (const uid of mentionedIds) {
        notify({
          recipientId: uid,
          senderId: currentUserId,
          module: 'system',
          type: 'system_mention',
          title: `${currentUserName} đã tag bạn trong dự án`,
          message: `"${newComment.trim().slice(0, 100)}${newComment.length > 100 ? '...' : ''}" — Dự án: ${projectName}`,
          referenceUrl: `/projects/${projectId}`,
          priority: 'normal',
        })
      }
    } else {
      setError('Không thể gửi bình luận')
    }

    setSubmitting(false)
  }, [newComment, submitting, replyTo, projectId, currentUserId, currentUserName, projectName, mentionableUsers])

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingComment || !editContent.trim()) return
    setSubmitting(true)
    const ok = await updateComment(editingComment.id, editContent.trim())
    if (ok) {
      setComments(prev => prev.map(c => {
        if (c.id === editingComment.id) return { ...c, content: editContent.trim(), is_edited: true }
        if (c.replies) return { ...c, replies: c.replies.map(r => r.id === editingComment.id ? { ...r, content: editContent.trim(), is_edited: true } : r) }
        return c
      }))
      setEditingComment(null)
      setEditContent('')
    }
    setSubmitting(false)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setSubmitting(true)
    const ok = await deleteComment(deleteId)
    if (ok) {
      setComments(prev => prev.filter(c => c.id !== deleteId).map(c => ({ ...c, replies: c.replies?.filter(r => r.id !== deleteId) || [] })))
    }
    setDeleteId(null)
    setSubmitting(false)
  }

  const replyToComment = replyTo ? comments.find(c => c.id === replyTo) : null

  // ========== RENDER ==========

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <button onClick={() => setIsCollapsed(!isCollapsed)} className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors min-h-[44px]">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Bình luận</h3>
          {totalCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">{totalCount}</span>
          )}
        </div>
        {isCollapsed ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronUp className="w-5 h-5 text-gray-400" />}
      </button>

      {!isCollapsed && (
        <div className="px-4 pb-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* Comment Form */}
          {!editingComment && (
            <div className="mb-4">
              {replyTo && replyToComment && (
                <div className="mb-2 flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
                  <Reply size={14} />
                  <span>Trả lời <span className="font-medium text-gray-700">{replyToComment.author?.full_name || 'Người dùng'}</span></span>
                  <button onClick={() => setReplyTo(null)} className="ml-auto text-gray-400 hover:text-gray-600 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center"><X size={16} /></button>
                </div>
              )}

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white font-medium text-sm">
                  <User size={18} />
                </div>
                <div className="flex-1">
                  <CommentInput
                    value={newComment}
                    onChange={setNewComment}
                    onSubmit={handleSubmit}
                    placeholder={replyTo ? 'Viết trả lời... (gõ @ để tag)' : 'Viết bình luận... (gõ @ để tag)'}
                    submitting={submitting}
                    mentionableUsers={mentionableUsers}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{newComment.length}/5000 ký tự</span>
                      <span className="text-xs text-gray-300 flex items-center gap-1"><AtSign size={11} /> Gõ @ để tag</span>
                    </div>
                    <button
                      onClick={handleSubmit}
                      disabled={!newComment.trim() || submitting}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                    >
                      <Send size={14} />
                      {submitting ? 'Đang gửi...' : 'Gửi'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Edit Form */}
          {editingComment && (
            <form onSubmit={handleEdit} className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2 text-sm text-yellow-700"><Edit3 size={14} /> Chỉnh sửa bình luận</div>
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 resize-none text-sm"
                disabled={submitting}
                autoFocus
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button type="button" onClick={() => { setEditingComment(null); setEditContent('') }} className="px-3 py-2 text-sm text-gray-600 min-h-[44px]">Hủy</button>
                <button type="submit" disabled={!editContent.trim() || submitting} className="px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 disabled:opacity-50 min-h-[44px]">
                  {submitting ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </form>
          )}

          {/* Comments List */}
          {loading ? (
            <div className="py-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
              <p className="mt-2 text-sm text-gray-500">Đang tải bình luận...</p>
            </div>
          ) : comments.length === 0 ? (
            <div className="py-8 text-center">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Chưa có bình luận nào</p>
              <p className="text-sm text-gray-400 mt-1">Hãy là người đầu tiên bình luận!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map(comment => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentUserId={currentUserId}
                  onReply={setReplyTo}
                  onEdit={c => { setEditingComment(c); setEditContent(c.content); setReplyTo(null) }}
                  onDelete={setDeleteId}
                  mentionableUsers={mentionableUsers}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Xác nhận xóa</h3>
            <p className="text-gray-500 mb-4">Bạn có chắc muốn xóa bình luận này?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-gray-600 min-h-[44px]">Hủy</button>
              <button onClick={handleDelete} disabled={submitting} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 min-h-[44px]">
                {submitting ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
