// ============================================================================
// TASK COMMENTS — Bình luận công việc (Ant Design)
// File: src/components/tasks/TaskComments.tsx
// ============================================================================

import { useState, useEffect, useRef } from 'react'
import {
  Card, Button, Input, Avatar, Typography, Space, Popconfirm, message, Empty, Spin,
} from 'antd'
import {
  SendOutlined, EditOutlined, DeleteOutlined, UserOutlined,
  MessageOutlined,
} from '@ant-design/icons'
import {
  taskCommentService,
  type TaskComment,
  formatRelativeTime,
} from '../../services/taskCommentService'
import { useAuthStore } from '../../stores/authStore'

const { Text } = Typography
const { TextArea } = Input

// ============================================================================
// PROPS
// ============================================================================

interface TaskCommentsProps {
  taskId: string
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function TaskComments({ taskId }: TaskCommentsProps) {
  const { user } = useAuthStore()
  const [comments, setComments] = useState<TaskComment[]>([])
  const [loading, setLoading] = useState(true)
  const [newContent, setNewContent] = useState('')
  const [sending, setSending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const refreshTimer = useRef<ReturnType<typeof setInterval>>()

  const currentUserId = user?.employee_id || ''

  // Load comments
  async function loadComments() {
    try {
      const { data } = await taskCommentService.getComments(taskId)
      setComments(data)
    } catch {
      /* ignore */
    }
    setLoading(false)
  }

  useEffect(() => {
    loadComments()

    // Auto-refresh every 30s
    refreshTimer.current = setInterval(() => {
      loadComments()
    }, 30000)

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current)
    }
  }, [taskId])

  // Send comment
  async function handleSend() {
    if (!newContent.trim() || !currentUserId) return
    setSending(true)
    try {
      const { data, error } = await taskCommentService.createComment({
        task_id: taskId,
        content: newContent.trim(),
        author_id: currentUserId,
      })
      if (error) throw error
      if (data) {
        setComments(prev => [...prev, data])
      }
      setNewContent('')
    } catch (err: any) {
      message.error(err.message || 'Không thể gửi bình luận')
    }
    setSending(false)
  }

  // Edit comment
  async function handleSaveEdit() {
    if (!editingId || !editContent.trim()) return
    try {
      const { data, error } = await taskCommentService.updateComment(editingId, {
        content: editContent.trim(),
      })
      if (error) throw error
      if (data) {
        setComments(prev => prev.map(c => c.id === editingId ? { ...c, ...data } : c))
      }
      setEditingId(null)
      setEditContent('')
      message.success('Đã cập nhật')
    } catch (err: any) {
      message.error(err.message || 'Không thể cập nhật')
    }
  }

  // Delete comment
  async function handleDelete(commentId: string) {
    try {
      const { error } = await taskCommentService.deleteComment(commentId)
      if (error) throw error
      setComments(prev => prev.filter(c => c.id !== commentId))
      message.success('Đã xóa bình luận')
    } catch (err: any) {
      message.error(err.message || 'Không thể xóa')
    }
  }

  // Flatten comments (root + replies) for display
  const allComments: TaskComment[] = []
  for (const c of comments) {
    allComments.push(c)
    if (c.replies) {
      for (const r of c.replies) {
        allComments.push(r)
      }
    }
  }

  const totalCount = allComments.length

  return (
    <Card
      size="small"
      title={
        <Space>
          <MessageOutlined />
          <Text strong>Bình luận ({totalCount})</Text>
        </Space>
      }
      style={{ borderRadius: 12, marginBottom: 16 }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin />
        </div>
      ) : allComments.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text type="secondary">Chưa có bình luận</Text>}
          style={{ padding: 8 }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
          {allComments.map(comment => {
            const isOwn = comment.author_id === currentUserId
            const authorName = comment.author?.full_name || 'Người dùng'
            const isEditing = editingId === comment.id

            return (
              <div
                key={comment.id}
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: isOwn ? '#f6ffed' : '#fafafa',
                }}
              >
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  style={{ backgroundColor: isOwn ? '#1B4D3E' : '#8c8c8c', flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text strong style={{ fontSize: 13 }}>{authorName}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {formatRelativeTime(comment.created_at)}
                    </Text>
                    {comment.is_edited && (
                      <Text type="secondary" style={{ fontSize: 10, fontStyle: 'italic' }}>
                        (đã chỉnh sửa)
                      </Text>
                    )}
                  </div>

                  {isEditing ? (
                    <div style={{ marginTop: 6 }}>
                      <TextArea
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        style={{ marginBottom: 6 }}
                      />
                      <Space>
                        <Button
                          size="small"
                          type="primary"
                          onClick={handleSaveEdit}
                          disabled={!editContent.trim()}
                          style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
                        >
                          Lưu
                        </Button>
                        <Button
                          size="small"
                          onClick={() => { setEditingId(null); setEditContent('') }}
                        >
                          Hủy
                        </Button>
                      </Space>
                    </div>
                  ) : (
                    <div style={{
                      marginTop: 4,
                      fontSize: 13,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {comment.content}
                    </div>
                  )}

                  {/* Actions for own comments */}
                  {isOwn && !isEditing && (
                    <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        style={{ fontSize: 11, color: '#8c8c8c' }}
                        onClick={() => {
                          setEditingId(comment.id)
                          setEditContent(comment.content)
                        }}
                      >
                        Sửa
                      </Button>
                      <Popconfirm
                        title="Xóa bình luận này?"
                        onConfirm={() => handleDelete(comment.id)}
                        okText="Xóa"
                        cancelText="Hủy"
                      >
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          style={{ fontSize: 11 }}
                        >
                          Xóa
                        </Button>
                      </Popconfirm>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Input area */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <TextArea
          value={newContent}
          onChange={e => setNewContent(e.target.value)}
          placeholder="Viết bình luận..."
          autoSize={{ minRows: 2, maxRows: 4 }}
          onPressEnter={e => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          style={{ flex: 1 }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={sending}
          disabled={!newContent.trim()}
          style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
        >
          Gửi
        </Button>
      </div>
      <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
        Ctrl+Enter để gửi nhanh
      </Text>
    </Card>
  )
}
