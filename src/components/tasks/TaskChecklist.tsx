// ============================================================================
// TASK CHECKLIST V3 — Modern multi-file evidence UI
// File: src/components/tasks/TaskChecklist.tsx
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Card, Checkbox, Input, Button, Progress, Space, Typography, Popconfirm, message, Empty, Tag,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, CheckCircleOutlined, OrderedListOutlined,
  UploadOutlined, FileImageOutlined, VideoCameraOutlined, FileOutlined,
  CloseCircleOutlined, PaperClipOutlined,
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
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ACCEPT_TYPES = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx'

function getFileIcon(url: string) {
  const lower = url.toLowerCase()
  if (lower.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)/)) return { icon: <FileImageOutlined />, color: '#1890ff', type: 'image' }
  if (lower.match(/\.(mp4|mov|avi|webm|mkv)/)) return { icon: <VideoCameraOutlined />, color: '#722ed1', type: 'video' }
  if (lower.match(/\.(pdf)/)) return { icon: <FileOutlined />, color: '#f5222d', type: 'pdf' }
  return { icon: <FileOutlined />, color: '#52c41a', type: 'file' }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function TaskChecklist({ taskId, readonly = false, userId, onProgressChange }: TaskChecklistProps) {
  const { user } = useAuthStore()
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')

  // Upload state
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ★ Permission: chỉ TP/PP (level ≤ 5) mới sửa/xóa checklist
  const userLevel = user?.position_level || 7
  const canEditChecklist = userLevel <= 5
  const canToggle = !readonly

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
    } catch (err: any) { message.error(err.message || 'Không thể thêm') }
    setAdding(false)
  }

  async function handleDelete(id: string) {
    try {
      await taskChecklistService.delete(id)
      const updated = items.filter(i => i.id !== id)
      setItems(updated)
      notifyProgress(updated)
    } catch (err: any) { message.error(err.message || 'Không thể xóa') }
  }

  async function handleSaveEdit() {
    if (!editingId || !editTitle.trim()) return
    try {
      const updated = await taskChecklistService.updateTitle(editingId, editTitle.trim())
      setItems(items.map(i => i.id === editingId ? updated : i))
      setEditingId(null)
      setEditTitle('')
    } catch (err: any) { message.error(err.message || 'Không thể cập nhật') }
  }

  // ── Evidence helpers ──
  function getEvidenceUrls(item: any): string[] {
    if (item.evidence_urls && Array.isArray(item.evidence_urls) && item.evidence_urls.length > 0) return item.evidence_urls
    if (item.evidence_url) return [item.evidence_url]
    return []
  }

  // ── Toggle / Upload flow ──
  async function handleToggle(item: ChecklistItem) {
    if (item.requires_evidence && !item.evidence_url && !item.is_completed) {
      // Mở upload panel thay vì tick luôn
      setUploadingId(item.id)
      setPendingFiles([])
      return
    }
    try {
      const updated = await taskChecklistService.toggle(item.id, !item.is_completed, userId)
      const newItems = items.map(i => i.id === item.id ? updated : i)
      setItems(newItems)
      notifyProgress(newItems)
    } catch (err: any) { message.error(err.message || 'Không thể cập nhật') }
  }

  // ── File selection ──
  const addFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter(f => {
      if (f.size > MAX_FILE_SIZE) { message.warning(`${f.name} quá lớn (max 50MB)`); return false }
      return true
    })
    setPendingFiles(prev => {
      const combined = [...prev, ...valid]
      if (combined.length > MAX_FILES) {
        message.warning(`Tối đa ${MAX_FILES} file`)
        return combined.slice(0, MAX_FILES)
      }
      return combined
    })
  }, [])

  const removePendingFile = (idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Drag & drop ──
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }, [])
  const handleDragLeave = useCallback(() => setIsDragOver(false), [])
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    addFiles(files)
  }, [addFiles])

  // ── Upload & complete ──
  async function handleUploadAndComplete() {
    if (!uploadingId || pendingFiles.length === 0) {
      message.warning('Vui lòng chọn ít nhất 1 file')
      return
    }
    setUploading(true)
    setUploadProgress(0)
    try {
      const item = items.find(i => i.id === uploadingId)
      const existingUrls: string[] = getEvidenceUrls(item)
      const urls = [...existingUrls]
      const total = pendingFiles.length

      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i]
        const ext = file.name.split('.').pop() || 'bin'
        const path = `evidence/${taskId}/${uploadingId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`
        const { error: uploadError } = await supabase.storage.from('task-evidence').upload(path, file)
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage.from('task-evidence').getPublicUrl(path)
        urls.push(publicUrl)
        setUploadProgress(Math.round(((i + 1) / total) * 100))
      }

      const { error: updateError } = await supabase.from('task_checklist_items').update({
        evidence_url: urls[0],
        evidence_urls: urls,
        evidence_note: pendingFiles.map(f => f.name).join(', '),
        is_completed: true,
        completed_at: new Date().toISOString(),
        completed_by: userId || null,
      }).eq('id', uploadingId)
      if (updateError) throw updateError

      await loadItems()
      setUploadingId(null)
      setPendingFiles([])
      message.success(`Hoàn thành! Đã tải ${pendingFiles.length} file`)
    } catch (err: any) {
      message.error(err.message || 'Lỗi tải lên')
    }
    setUploading(false)
    setUploadProgress(0)
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
      extra={total > 0 && completed === total && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 18 }} />}
      style={{ borderRadius: 12, marginBottom: 16 }}
    >
      {items.length === 0 && !loading && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text type="secondary">Chưa có bước nào</Text>} style={{ padding: 8 }} />
      )}

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" multiple accept={ACCEPT_TYPES}
        style={{ display: 'none' }}
        onChange={(e) => { addFiles(Array.from(e.target.files || [])); e.target.value = '' }}
      />

      {/* Checklist items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((item) => {
          const evidenceUrls = getEvidenceUrls(item)
          const isUploadPanel = uploadingId === item.id

          return (
            <div key={item.id} style={{ borderRadius: 8, border: isUploadPanel ? '2px solid #1890ff' : '1px solid #f0f0f0', overflow: 'hidden', marginBottom: 4 }}>
              {/* Row chính */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: item.is_completed ? '#f6ffed' : '#fff' }}>
                <Checkbox checked={item.is_completed} disabled={readonly || !canToggle} onChange={() => handleToggle(item)} />

                {editingId === item.id && canEditChecklist ? (
                  <Input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    onPressEnter={handleSaveEdit} onBlur={handleSaveEdit} autoFocus size="small" style={{ flex: 1 }} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                    <Text style={{ textDecoration: item.is_completed ? 'line-through' : undefined, color: item.is_completed ? '#999' : undefined, cursor: canEditChecklist ? 'pointer' : 'default' }}
                      onClick={() => { if (canEditChecklist) { setEditingId(item.id); setEditTitle(item.title) } }}>
                      {item.title}
                    </Text>
                    {item.requires_evidence && evidenceUrls.length === 0 && (
                      <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>📷 Cần bằng chứng</Tag>
                    )}
                    {evidenceUrls.length > 0 && (
                      <Tag color="green" style={{ fontSize: 11, margin: 0, cursor: 'pointer' }}
                        onClick={() => { if (uploadingId === item.id) setUploadingId(null); else setUploadingId(item.id) }}>
                        <PaperClipOutlined /> {evidenceUrls.length} file
                      </Tag>
                    )}
                  </div>
                )}

                {/* Nút upload cho item chưa có evidence */}
                {!readonly && item.requires_evidence && evidenceUrls.length === 0 && !item.is_completed && (
                  <Button size="small" type="link" icon={<UploadOutlined />}
                    onClick={() => { setUploadingId(item.id); setPendingFiles([]) }}
                    style={{ color: '#fa8c16', padding: '0 4px' }}>
                    Upload
                  </Button>
                )}

                {canEditChecklist && !readonly && (
                  <Popconfirm title="Xóa bước này?" onConfirm={() => handleDelete(item.id)} okText="Xóa" cancelText="Hủy">
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </div>

              {/* ★ Evidence Gallery + Upload Panel */}
              {(isUploadPanel || evidenceUrls.length > 0) && uploadingId === item.id && (
                <div style={{ padding: '8px 10px', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>

                  {/* Existing files grid */}
                  {evidenceUrls.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
                        Đã tải ({evidenceUrls.length}/{MAX_FILES})
                      </Text>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6 }}>
                        {evidenceUrls.map((url, i) => {
                          const { type, color } = getFileIcon(url)
                          return (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 6, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 6, textDecoration: 'none', transition: 'border-color 0.2s' }}>
                              {type === 'image' ? (
                                <img src={url} alt="" style={{ width: '100%', height: 50, objectFit: 'cover', borderRadius: 4 }} />
                              ) : type === 'video' ? (
                                <div style={{ width: '100%', height: 50, background: '#f0e6ff', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <VideoCameraOutlined style={{ fontSize: 20, color: '#722ed1' }} />
                                </div>
                              ) : (
                                <div style={{ width: '100%', height: 50, background: '#f5f5f5', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <FileOutlined style={{ fontSize: 20, color }} />
                                </div>
                              )}
                              <Text style={{ fontSize: 10, marginTop: 2, color: '#666', textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                File {i + 1}
                              </Text>
                            </a>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Upload zone */}
                  {evidenceUrls.length < MAX_FILES && !item.is_completed && (
                    <>
                      {/* Drag & drop zone */}
                      <div
                        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          border: `2px dashed ${isDragOver ? '#1890ff' : '#d9d9d9'}`,
                          borderRadius: 8, padding: '12px 16px', textAlign: 'center',
                          background: isDragOver ? '#e6f7ff' : '#fff',
                          cursor: 'pointer', transition: 'all 0.2s', marginBottom: 8,
                        }}
                      >
                        <UploadOutlined style={{ fontSize: 24, color: isDragOver ? '#1890ff' : '#bfbfbf', display: 'block', marginBottom: 4 }} />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Kéo thả file vào đây hoặc <Text style={{ color: '#1890ff', fontSize: 12 }}>bấm để chọn</Text>
                        </Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 10 }}>
                          Ảnh, video, PDF, Word, Excel — Tối đa {MAX_FILES} file, mỗi file ≤ 50MB
                        </Text>
                      </div>

                      {/* Pending files */}
                      {pendingFiles.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <Text strong style={{ fontSize: 12 }}>Đang chờ tải ({pendingFiles.length} file)</Text>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                            {pendingFiles.map((f, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: '#fff', border: '1px solid #f0f0f0', borderRadius: 6, fontSize: 12 }}>
                                {f.type.startsWith('image') ? <FileImageOutlined style={{ color: '#1890ff' }} />
                                  : f.type.startsWith('video') ? <VideoCameraOutlined style={{ color: '#722ed1' }} />
                                  : <FileOutlined style={{ color: '#52c41a' }} />}
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                <span style={{ color: '#999', flexShrink: 0 }}>{formatFileSize(f.size)}</span>
                                <CloseCircleOutlined style={{ color: '#ff4d4f', cursor: 'pointer' }} onClick={() => removePendingFile(i)} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Upload progress */}
                      {uploading && <Progress percent={uploadProgress} size="small" style={{ marginBottom: 8 }} />}

                      {/* Action buttons */}
                      <Space>
                        <Button size="small" type="primary" disabled={pendingFiles.length === 0 || uploading}
                          loading={uploading}
                          style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
                          icon={<UploadOutlined />}
                          onClick={handleUploadAndComplete}>
                          {uploading ? 'Đang tải...' : `Tải lên & hoàn thành (${pendingFiles.length})`}
                        </Button>
                        <Button size="small" onClick={() => { setUploadingId(null); setPendingFiles([]) }} disabled={uploading}>
                          Đóng
                        </Button>
                      </Space>
                    </>
                  )}

                  {/* Close button when just viewing */}
                  {(evidenceUrls.length >= MAX_FILES || item.is_completed) && (
                    <div style={{ marginTop: 4 }}>
                      {!readonly && evidenceUrls.length < MAX_FILES && (
                        <Button size="small" icon={<PlusOutlined />} onClick={() => fileInputRef.current?.click()} style={{ marginRight: 8 }}>
                          Thêm file
                        </Button>
                      )}
                      <Button size="small" onClick={() => setUploadingId(null)}>Đóng</Button>
                    </div>
                  )}
                </div>
              )}

              {/* Compact evidence preview (khi không mở panel) */}
              {evidenceUrls.length > 0 && uploadingId !== item.id && (
                <div style={{ padding: '4px 10px 6px 36px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {evidenceUrls.slice(0, 5).map((url, i) => {
                    const { type } = getFileIcon(url)
                    return type === 'image' ? (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid #e8e8e8' }} />
                      </a>
                    ) : (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                        style={{ width: 32, height: 32, borderRadius: 4, border: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
                        {getFileIcon(url).icon}
                      </a>
                    )
                  })}
                  {evidenceUrls.length > 5 && (
                    <span style={{ width: 32, height: 32, borderRadius: 4, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#666', cursor: 'pointer' }}
                      onClick={() => setUploadingId(item.id)}>
                      +{evidenceUrls.length - 5}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add new item — chỉ TP/PP */}
      {canEditChecklist && !readonly && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} onPressEnter={handleAdd}
            placeholder="Thêm bước mới..." size="small" style={{ flex: 1 }} />
          <Button size="small" icon={<PlusOutlined />} onClick={handleAdd} loading={adding}
            disabled={!newTitle.trim()} type="primary" style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
            Thêm
          </Button>
        </div>
      )}
    </Card>
  )
}
