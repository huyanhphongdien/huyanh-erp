// ============================================================================
// TASK CHECKLIST — Danh sách bước nhỏ trong công việc
// File: src/components/tasks/TaskChecklist.tsx
// ============================================================================

import { useState, useEffect } from 'react'
import {
  Card, Checkbox, Input, Button, Progress, Space, Typography, Popconfirm, message, Empty, Tag,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, CheckCircleOutlined, OrderedListOutlined,
} from '@ant-design/icons'
import { taskChecklistService, ChecklistItem } from '../../services/taskChecklistService'
import { supabase } from '../../lib/supabase'

const { Text } = Typography

interface TaskChecklistProps {
  taskId: string
  readonly?: boolean
  userId?: string
  onProgressChange?: (percent: number) => void
}

export default function TaskChecklist({ taskId, readonly = false, userId, onProgressChange }: TaskChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  useEffect(() => {
    loadItems()
  }, [taskId])

  async function loadItems() {
    setLoading(true)
    try {
      const data = await taskChecklistService.getByTaskId(taskId)
      setItems(data)
      notifyProgress(data)
    } catch { /* ignore */ }
    setLoading(false)
  }

  function notifyProgress(data: ChecklistItem[]) {
    if (onProgressChange) {
      const { percent } = taskChecklistService.getProgress(data)
      onProgressChange(percent)
    }
  }

  async function handleAdd() {
    if (!newTitle.trim()) return
    setAdding(true)
    try {
      const item = await taskChecklistService.create({ task_id: taskId, title: newTitle.trim() })
      const updated = [...items, item]
      setItems(updated)
      setNewTitle('')
      notifyProgress(updated)
    } catch (err: any) {
      message.error(err.message || 'Không thể thêm')
    }
    setAdding(false)
  }

  async function handleToggle(item: ChecklistItem) {
    // If requires evidence and not yet uploaded and trying to complete → prompt file upload
    if (item.requires_evidence && !item.evidence_url && !item.is_completed) {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*,.pdf'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) return
        try {
          const path = `evidence/${taskId}/${item.id}_${file.name}`
          const { data, error: uploadError } = await supabase.storage.from('task-evidence').upload(path, file)
          if (uploadError) throw uploadError
          if (data) {
            const { data: { publicUrl } } = supabase.storage.from('task-evidence').getPublicUrl(path)
            const { error: updateError } = await supabase.from('task_checklist_items').update({
              evidence_url: publicUrl,
              evidence_note: file.name,
              is_completed: true,
              completed_at: new Date().toISOString(),
              completed_by: userId || null,
            }).eq('id', item.id)
            if (updateError) throw updateError
            await loadItems()
            message.success('Đã đính kèm bằng chứng')
          }
        } catch (err: any) {
          message.error(err.message || 'Không thể tải lên bằng chứng')
        }
      }
      input.click()
      return
    }

    try {
      const updated = await taskChecklistService.toggle(item.id, !item.is_completed, userId)
      const newItems = items.map(i => i.id === item.id ? updated : i)
      setItems(newItems)
      notifyProgress(newItems)
    } catch (err: any) {
      message.error(err.message || 'Không thể cập nhật')
    }
  }

  async function handleDelete(id: string) {
    try {
      await taskChecklistService.delete(id)
      const updated = items.filter(i => i.id !== id)
      setItems(updated)
      notifyProgress(updated)
    } catch (err: any) {
      message.error(err.message || 'Không thể xóa')
    }
  }

  async function handleSaveEdit() {
    if (!editingId || !editTitle.trim()) return
    try {
      const updated = await taskChecklistService.updateTitle(editingId, editTitle.trim())
      setItems(items.map(i => i.id === editingId ? updated : i))
      setEditingId(null)
      setEditTitle('')
    } catch (err: any) {
      message.error(err.message || 'Không thể cập nhật')
    }
  }

  const { completed, total, percent } = taskChecklistService.getProgress(items)

  return (
    <Card
      size="small"
      title={
        <Space>
          <OrderedListOutlined />
          <Text strong>Checklist ({completed}/{total})</Text>
          {total > 0 && <Progress percent={percent} size="small" style={{ width: 100 }} />}
        </Space>
      }
      extra={
        total > 0 && completed === total && (
          <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />
        )
      }
      style={{ borderRadius: 12, marginBottom: 16 }}
    >
      {items.length === 0 && !loading && (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<Text type="secondary">Chưa có bước nào</Text>}
          style={{ padding: 8 }}
        />
      )}

      {/* Checklist items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((item, idx) => (
          <div
            key={item.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', borderRadius: 6,
              background: item.is_completed ? '#f6ffed' : undefined,
              transition: 'background 0.2s',
            }}
          >
            <Checkbox
              checked={item.is_completed}
              disabled={readonly}
              onChange={() => handleToggle(item)}
            />

            {editingId === item.id ? (
              <Input
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onPressEnter={handleSaveEdit}
                onBlur={handleSaveEdit}
                autoFocus
                size="small"
                style={{ flex: 1 }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <Text
                  style={{
                    textDecoration: item.is_completed ? 'line-through' : undefined,
                    color: item.is_completed ? '#999' : undefined,
                    cursor: readonly ? 'default' : 'pointer',
                  }}
                  onClick={() => {
                    if (!readonly) {
                      setEditingId(item.id)
                      setEditTitle(item.title)
                    }
                  }}
                >
                  {item.title}
                </Text>
                {item.requires_evidence && !item.evidence_url && (
                  <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>📷 Cần bằng chứng</Tag>
                )}
                {item.evidence_url && (
                  <a href={item.evidence_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#52c41a', whiteSpace: 'nowrap' }}>
                    📷 Đã đính kèm
                  </a>
                )}
              </div>
            )}

            {!readonly && (
              <Popconfirm
                title="Xóa bước này?"
                onConfirm={() => handleDelete(item.id)}
                okText="Xóa"
                cancelText="Hủy"
              >
                <Button type="text" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </div>
        ))}
      </div>

      {/* Add new item */}
      {!readonly && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onPressEnter={handleAdd}
            placeholder="Thêm bước mới..."
            size="small"
            style={{ flex: 1 }}
          />
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={handleAdd}
            loading={adding}
            disabled={!newTitle.trim()}
            type="primary"
            style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Thêm
          </Button>
        </div>
      )}
    </Card>
  )
}
