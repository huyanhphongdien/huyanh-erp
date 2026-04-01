// ============================================================================
// TASK CHECKLIST V2 — Multi-file evidence + permission control
// File: src/components/tasks/TaskChecklist.tsx
// ============================================================================
// V2 Changes:
//   ★ Multi-file upload (1-10 files: image/video/PDF/doc)
//   ★ Chỉ TP/PP (level ≤ 5) mới sửa/xóa checklist item
//   ★ NV chỉ tick hoàn thành + upload bằng chứng
//   ★ Evidence lưu JSONB array thay vì 1 URL
// ============================================================================

import { useState, useEffect, useRef } from 'react'
import {
  Card, Checkbox, Input, Button, Progress, Space, Typography, Popconfirm, message, Empty, Tag, Upload,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, CheckCircleOutlined, OrderedListOutlined,
  UploadOutlined, FileImageOutlined, VideoCameraOutlined, FileOutlined,
} from '@ant-design/icons'
import { taskChecklistService, ChecklistItem } from '../../services/taskChecklistService'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

const { Text } = Typography

interface TaskChecklistProps {
  taskId: string
  readonly?: boolean
  userId?: string
  onProgressChange?: (percent: number) => void
}

const MAX_FILES = 10
const ACCEPT_TYPES = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx'

export default function TaskChecklist({ taskId, readonly = false, userId, onProgressChange }: TaskChecklistProps) {
  const { user } = useAuthStore()
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ★ Permission: chỉ TP/PP (level ≤ 5) mới sửa/xóa checklist
  const userLevel = user?.position_level || 7
  const canEditChecklist = userLevel <= 5 // TP/PP/BGĐ
  const canToggle = !readonly // NV được tick

  useEffect(() => { loadItems() }, [taskId])

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

  // ★ Upload multi-file rồi tick hoàn thành
  function openUploadModal(item: ChecklistItem) {
    setUploadingId(item.id)
    setUploadFiles([])
    setTimeout(() => fileInputRef.current?.click(), 100)
  }

  async function handleUploadAndComplete() {
    if (!uploadingId || uploadFiles.length === 0) {
      message.warning('Vui lòng chọn ít nhất 1 file')
      return
    }
    if (uploadFiles.length > MAX_FILES) {
      message.warning(`Tối đa ${MAX_FILES} file`)
      return
    }

    try {
      const urls: string[] = []

      // Lấy evidence_urls hiện có
      const item = items.find(i => i.id === uploadingId)
      const existingUrls: string[] = (item as any)?.evidence_urls || []
      urls.push(...existingUrls)

      for (const file of uploadFiles) {
        const ext = file.name.split('.').pop() || 'bin'
        const path = `evidence/${taskId}/${uploadingId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`
        const { error: uploadError } = await supabase.storage.from('task-evidence').upload(path, file)
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage.from('task-evidence').getPublicUrl(path)
        urls.push(publicUrl)
      }

      if (urls.length > MAX_FILES) {
        message.warning(`Tổng tối đa ${MAX_FILES} file. Đã có ${existingUrls.length}, thêm ${uploadFiles.length}.`)
        return
      }

      // Update DB
      const { error: updateError } = await supabase.from('task_checklist_items').update({
        evidence_url: urls[0], // backward compat
        evidence_urls: urls,
        evidence_note: uploadFiles.map(f => f.name).join(', '),
        is_completed: true,
        completed_at: new Date().toISOString(),
        completed_by: userId || null,
      }).eq('id', uploadingId)
      if (updateError) throw updateError

      await loadItems()
      setUploadingId(null)
      setUploadFiles([])
      message.success(`Đã đính kèm ${uploadFiles.length} file`)
    } catch (err: any) {
      message.error(err.message || 'Không thể tải lên')
    }
  }

  async function handleToggle(item: ChecklistItem) {
    // Nếu yêu cầu bằng chứng + chưa upload → mở upload
    if (item.requires_evidence && !item.evidence_url && !item.is_completed) {
      openUploadModal(item)
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

  // ★ Parse evidence URLs (backward compat: evidence_url string or evidence_urls array)
  function getEvidenceUrls(item: any): string[] {
    if (item.evidence_urls && Array.isArray(item.evidence_urls) && item.evidence_urls.length > 0) {
      return item.evidence_urls
    }
    if (item.evidence_url) return [item.evidence_url]
    return []
  }

  function getFileIcon(url: string) {
    const lower = url.toLowerCase()
    if (lower.match(/\.(jpg|jpeg|png|gif|webp|bmp)/)) return <FileImageOutlined style={{ color: '#1890ff' }} />
    if (lower.match(/\.(mp4|mov|avi|webm)/)) return <VideoCameraOutlined style={{ color: '#722ed1' }} />
    return <FileOutlined style={{ color: '#52c41a' }} />
  }

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

      {/* Hidden file input for multi-select */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_TYPES}
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          if (files.length > MAX_FILES) {
            message.warning(`Tối đa ${MAX_FILES} file`)
            setUploadFiles(files.slice(0, MAX_FILES))
          } else {
            setUploadFiles(files)
          }
          e.target.value = '' // reset
        }}
      />

      {/* Checklist items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.map((item) => {
          const evidenceUrls = getEvidenceUrls(item)
          const isUploading = uploadingId === item.id

          return (
            <div key={item.id}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 8px', borderRadius: 6,
                  background: item.is_completed ? '#f6ffed' : undefined,
                  transition: 'background 0.2s',
                }}
              >
                <Checkbox
                  checked={item.is_completed}
                  disabled={readonly || !canToggle}
                  onChange={() => handleToggle(item)}
                />

                {editingId === item.id && canEditChecklist ? (
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                    <Text
                      style={{
                        textDecoration: item.is_completed ? 'line-through' : undefined,
                        color: item.is_completed ? '#999' : undefined,
                        cursor: canEditChecklist ? 'pointer' : 'default',
                      }}
                      onClick={() => {
                        if (canEditChecklist) {
                          setEditingId(item.id)
                          setEditTitle(item.title)
                        }
                      }}
                    >
                      {item.title}
                    </Text>
                    {item.requires_evidence && evidenceUrls.length === 0 && (
                      <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>📷 Cần bằng chứng</Tag>
                    )}
                    {evidenceUrls.length > 0 && (
                      <Tag color="green" style={{ fontSize: 11, margin: 0 }}>📷 {evidenceUrls.length} file</Tag>
                    )}
                  </div>
                )}

                {/* ★ Chỉ TP/PP mới xóa */}
                {canEditChecklist && !readonly && (
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

              {/* Evidence preview */}
              {evidenceUrls.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0 4px 32px' }}>
                  {evidenceUrls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#1890ff', background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>
                      {getFileIcon(url)}
                      <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        File {i + 1}
                      </span>
                    </a>
                  ))}
                  {/* Thêm file nếu chưa đủ 10 */}
                  {!readonly && evidenceUrls.length < MAX_FILES && (
                    <button
                      onClick={() => openUploadModal(item)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#1890ff', background: '#e6f7ff', padding: '2px 6px', borderRadius: 4, border: '1px dashed #91d5ff', cursor: 'pointer' }}>
                      <PlusOutlined /> Thêm file
                    </button>
                  )}
                </div>
              )}

              {/* Upload modal inline */}
              {isUploading && (
                <div style={{ padding: '8px 8px 8px 32px', background: '#fffbe6', borderRadius: 6, margin: '4px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <UploadOutlined style={{ color: '#faad14' }} />
                    <Text strong style={{ fontSize: 13 }}>Đính kèm bằng chứng (1-{MAX_FILES} file)</Text>
                  </div>

                  {uploadFiles.length > 0 ? (
                    <div style={{ marginBottom: 8 }}>
                      {uploadFiles.map((f, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#333', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {f.type.startsWith('image') ? <FileImageOutlined /> : f.type.startsWith('video') ? <VideoCameraOutlined /> : <FileOutlined />}
                          {f.name} ({(f.size / 1024).toFixed(0)} KB)
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>Chưa chọn file. Bấm nút bên dưới.</Text>
                  )}

                  <Space>
                    <Button size="small" onClick={() => fileInputRef.current?.click()} icon={<UploadOutlined />}>
                      Chọn file
                    </Button>
                    <Button size="small" type="primary" disabled={uploadFiles.length === 0}
                      style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
                      onClick={handleUploadAndComplete}>
                      Tải lên ({uploadFiles.length} file)
                    </Button>
                    <Button size="small" onClick={() => { setUploadingId(null); setUploadFiles([]) }}>
                      Hủy
                    </Button>
                  </Space>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add new item — ★ chỉ TP/PP */}
      {canEditChecklist && !readonly && (
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
