// ============================================================================
// DOCUMENT CHECKLIST TAB — Upload + quản lý chứng từ đơn hàng bán
// File: src/pages/sales/components/DocumentChecklistTab.tsx
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Card, Button, Tag, Progress, Typography, Space, Input, message,
  Upload, Tooltip, Empty, Popconfirm,
} from 'antd'
import {
  UploadOutlined, CheckCircleOutlined, CloseCircleOutlined,
  FileOutlined, FilePdfOutlined, FileImageOutlined,
  EyeOutlined, DeleteOutlined, PlusOutlined, DownloadOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import {
  salesDocumentUploadService,
  type SalesDocument,
  STANDARD_DOCUMENTS,
  canEditDocument,
  canViewDocument,
} from '../../../services/sales/salesDocumentUploadService'
import { useAuthStore } from '../../../stores/authStore'
import { getSalesRole } from '../../../services/sales/salesPermissionService'

const { Text, Title } = Typography

// ============================================================================
// HELPERS
// ============================================================================

function getDocIcon(docType: string) {
  const icons: Record<string, React.ReactNode> = {
    bl: <FilePdfOutlined style={{ color: '#f5222d' }} />,
    commercial_invoice: <FilePdfOutlined style={{ color: '#fa8c16' }} />,
    packing_list: <FileOutlined style={{ color: '#1890ff' }} />,
    coa: <FileOutlined style={{ color: '#52c41a' }} />,
    co: <FilePdfOutlined style={{ color: '#722ed1' }} />,
    lc_copy: <FilePdfOutlined style={{ color: '#eb2f96' }} />,
    insurance: <FileOutlined style={{ color: '#13c2c2' }} />,
  }
  return icons[docType] || <FileOutlined style={{ color: '#999' }} />
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isRequired(docType: string): boolean {
  return STANDARD_DOCUMENTS.find(d => d.doc_type === docType)?.required || false
}

// ============================================================================
// COMPONENT
// ============================================================================

interface Props {
  orderId: string
  orderCode: string
  readonly?: boolean
}

export default function DocumentChecklistTab({ orderId, orderCode, readonly = false }: Props) {
  const { user } = useAuthStore()
  const salesRole = getSalesRole(user)
  const [docs, setDocs] = useState<SalesDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [customName, setCustomName] = useState('')
  const [showAddCustom, setShowAddCustom] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const initRef = useRef(false)
  const load = useCallback(async () => {
    setLoading(true)
    let data = await salesDocumentUploadService.getByOrderId(orderId)
    if (data.length === 0 && !initRef.current) {
      initRef.current = true // prevent double init
      data = await salesDocumentUploadService.initChecklist(orderId)
    }
    setDocs(data)
    setLoading(false)
  }, [orderId])

  useEffect(() => { load() }, [load])

  const visibleDocs = docs.filter(d => canViewDocument(d.doc_type, salesRole))
  const received = visibleDocs.filter(d => d.is_received).length
  const uploaded = visibleDocs.filter(d => d.file_url).length
  const total = visibleDocs.length
  const percent = total > 0 ? Math.round((received / total) * 100) : 0

  // Upload handler
  const handleUpload = async (docId: string, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      message.warning('File quá lớn (tối đa 10MB)')
      return
    }
    setUploading(docId)
    const url = await salesDocumentUploadService.uploadFile(docId, orderId, file, user?.employee_id ?? undefined)
    if (url) {
      message.success('Tải lên thành công!')
      await load()
    } else {
      message.error('Lỗi tải lên')
    }
    setUploading(null)
  }

  // Toggle received
  const handleToggleReceived = async (doc: SalesDocument) => {
    await salesDocumentUploadService.markReceived(doc.id, !doc.is_received)
    await load()
  }

  // Add custom
  const handleAddCustom = async () => {
    if (!customName.trim()) return
    await salesDocumentUploadService.addCustomDocument(orderId, customName.trim())
    setCustomName('')
    setShowAddCustom(false)
    await load()
  }

  // Delete
  const handleDelete = async (docId: string) => {
    await salesDocumentUploadService.deleteDocument(docId)
    await load()
  }

  return (
    <div>
      {/* Header Stats */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 12, background: 'linear-gradient(135deg, #1B4D3E 0%, #2E7D5B 100%)', border: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Chứng từ đơn hàng {orderCode}</Text>
            <div style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginTop: 4 }}>
              {received}/{total} <span style={{ fontSize: 14, fontWeight: 400, opacity: 0.7 }}>đã nhận</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}>
              {uploaded} file đã upload
            </div>
          </div>
          <div style={{ width: 80 }}>
            <Progress
              type="circle"
              percent={percent}
              size={72}
              strokeColor="#4ADE80"
              trailColor="rgba(255,255,255,0.2)"
              format={(p) => <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{p}%</span>}
            />
          </div>
        </div>
      </Card>

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          const docId = fileInputRef.current?.getAttribute('data-doc-id')
          if (file && docId) handleUpload(docId, file)
          e.target.value = ''
        }}
      />

      {/* Document List */}
      <Card size="small" style={{ borderRadius: 12 }}
        title={<Space><FileOutlined /> <span>Checklist chứng từ</span></Space>}
        extra={!readonly && (
          <Button size="small" icon={<PlusOutlined />} onClick={() => setShowAddCustom(true)}>
            Thêm
          </Button>
        )}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div className="animate-spin" style={{ width: 32, height: 32, border: '3px solid #f0f0f0', borderTop: '3px solid #1B4D3E', borderRadius: '50%', margin: '0 auto' }} />
          </div>
        ) : docs.length === 0 ? (
          <Empty description="Chưa có chứng từ" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {docs.filter(doc => canViewDocument(doc.doc_type, salesRole)).map((doc) => (
              <div key={doc.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  borderRadius: 8, border: '1px solid #f0f0f0',
                  background: doc.is_received ? '#f6ffed' : '#fff',
                  transition: 'all 0.2s',
                }}
              >
                {/* Icon + Status */}
                <div style={{ fontSize: 18, flexShrink: 0 }}>
                  {doc.is_received
                    ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    : <CloseCircleOutlined style={{ color: '#d9d9d9' }} />
                  }
                </div>

                {/* Doc icon */}
                <div style={{ fontSize: 16, flexShrink: 0 }}>{getDocIcon(doc.doc_type)}</div>

                {/* Name + file info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Text strong style={{ fontSize: 13, color: doc.is_received ? '#333' : '#666' }}>
                      {doc.doc_name}
                    </Text>
                    {isRequired(doc.doc_type) && (
                      <Tag color="red" style={{ fontSize: 10, margin: 0, lineHeight: '16px' }}>Bắt buộc</Tag>
                    )}
                  </div>
                  {doc.file_url ? (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {doc.file_name} ({formatFileSize(doc.file_size)})
                      {doc.received_at && ` • ${new Date(doc.received_at).toLocaleDateString('vi-VN')}`}
                    </Text>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 11 }}>Chưa upload file</Text>
                  )}
                </div>

                {/* Actions */}
                {(() => {
                  const canEdit = !readonly && canEditDocument(doc.doc_type, salesRole)
                  const ownerLabel = STANDARD_DOCUMENTS.find(d => d.doc_type === doc.doc_type)?.owner
                  return (
                    <Space size={4}>
                      {/* Xem + Tải — ai cũng được */}
                      {doc.file_url && (
                        <>
                          <Tooltip title="Xem trước">
                            <Button size="small" type="link" icon={<EyeOutlined />}
                              onClick={() => window.open(doc.file_url!, '_blank')} />
                          </Tooltip>
                          <Tooltip title="Tải về">
                            <Button size="small" type="link" icon={<DownloadOutlined />}
                              onClick={() => {
                                const a = document.createElement('a')
                                a.href = doc.file_url!
                                a.download = doc.file_name || `${doc.doc_name}.pdf`
                                a.target = '_blank'
                                a.click()
                              }} />
                          </Tooltip>
                        </>
                      )}

                      {/* Upload/Tick/Xóa — chỉ role owner */}
                      {canEdit ? (
                        <>
                          <Tooltip title={doc.file_url ? 'Upload lại' : 'Upload file'}>
                            <Button size="small" type={doc.file_url ? 'link' : 'primary'}
                              icon={<UploadOutlined />}
                              loading={uploading === doc.id}
                              onClick={() => {
                                fileInputRef.current?.setAttribute('data-doc-id', doc.id)
                                fileInputRef.current?.click()
                              }}
                            >
                              {!doc.file_url && 'Upload'}
                            </Button>
                          </Tooltip>

                          <Tooltip title={doc.is_received ? 'Bỏ đánh dấu nhận' : 'Đánh dấu đã nhận'}>
                            <Button size="small" type="link"
                              icon={doc.is_received ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CloseCircleOutlined />}
                              onClick={() => handleToggleReceived(doc)}
                            />
                          </Tooltip>

                          {doc.doc_type === 'other' && (
                            <Popconfirm title="Xóa chứng từ này?" onConfirm={() => handleDelete(doc.id)}>
                              <Button size="small" type="link" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                          )}
                        </>
                      ) : (
                        !doc.file_url && ownerLabel && ownerLabel !== 'all' && (
                          <Tag style={{ fontSize: 10, margin: 0 }}>
                            {ownerLabel === 'sale' ? 'Sale' : ownerLabel === 'production' ? 'SX' : ownerLabel === 'logistics' ? 'LOG' : ownerLabel === 'accounting' ? 'KT' : ownerLabel}
                          </Tag>
                        )
                      )}
                    </Space>
                  )
                })()}
              </div>
            ))}
          </div>
        )}

        {/* Add custom document */}
        {showAddCustom && !readonly && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Input
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              onPressEnter={handleAddCustom}
              placeholder="Tên chứng từ..."
              size="small"
              autoFocus
            />
            <Button size="small" type="primary" onClick={handleAddCustom}>Thêm</Button>
            <Button size="small" onClick={() => { setShowAddCustom(false); setCustomName('') }}>Hủy</Button>
          </div>
        )}
      </Card>
    </div>
  )
}
