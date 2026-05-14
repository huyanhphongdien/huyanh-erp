// ============================================================================
// CONTRACT FILE SECTION — Multi-file upload + view/download + delete (admin)
// File: src/pages/sales/components/ContractFileSection.tsx
//
// Quy tắc (v2 — multi-file):
//  - Sale upload nhiều file cùng lúc (tối đa 10), mỗi file = 1 row
//  - Sau khi upload, sale xem được file của chính mình
//  - BGĐ (admin + Mr. Trung) xem/tải mọi file + lịch sử truy cập
//  - Chỉ BGĐ "Thay thế" 1 file cụ thể (file cũ giữ trong storage + log)
//  - Chỉ admin (Minh, Thúy, Huy, Trung) "Xóa" file (hard delete row + storage)
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button, message, Tag, Tooltip, Modal, Table, Empty, Spin, Popconfirm,
} from 'antd'
import {
  UploadOutlined, EyeOutlined, DownloadOutlined, SyncOutlined,
  HistoryOutlined, FilePdfOutlined, LockOutlined, DeleteOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  salesContractService,
  canUploadContract,
  canReplaceContract,
  canViewContract,
  canViewAccessLog,
  canDeleteContract,
  type ContractAccessLogEntry,
} from '../../../services/sales/salesContractService'
import type { SalesDocument } from '../../../services/sales/salesDocumentUploadService'
import { isBOD, type SalesRole } from '../../../services/sales/salesPermissionService'
import { useAuthStore } from '../../../stores/authStore'

const MAX_FILES = 10
const MAX_FILE_SIZE_MB = 20
const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const ACTION_LABELS: Record<string, { text: string; color: string }> = {
  upload:   { text: 'Tải lên',     color: 'green' },
  replace:  { text: 'Thay thế',    color: 'orange' },
  view:     { text: 'Xem',         color: 'blue' },
  download: { text: 'Tải về',      color: 'geekblue' },
  delete:   { text: 'Xóa',         color: 'red' },
}

const ROLE_LABELS: Record<string, string> = {
  sale: 'Kinh doanh',
  admin: 'BGĐ',
  production: 'Sản xuất',
  logistics: 'Xuất nhập khẩu',
  accounting: 'Kế toán',
}

function formatSize(bytes?: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

interface Props {
  orderId: string
  salesRole: SalesRole | null
}

export default function ContractFileSection({ orderId, salesRole }: Props) {
  const { user } = useAuthStore()
  const [docs, setDocs] = useState<SalesDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [logData, setLogData] = useState<ContractAccessLogEntry[]>([])
  const [logLoading, setLogLoading] = useState(false)

  // 2 input ẩn: 1 cho upload mới (multiple), 1 cho replace single file
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const replaceTargetIdRef = useRef<string | null>(null)

  const userIsBOD = isBOD(user)
  const hasFile = docs.length > 0
  const canUpload = canUploadContract(hasFile, salesRole, user)
  const canReplace = canReplaceContract(salesRole, user)
  const canSeeLog = canViewAccessLog(user, salesRole)
  const canDelete = canDeleteContract(salesRole, user)

  // ── Load contracts (multi) ─────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const list = await salesContractService.getContracts(orderId)
    setDocs(list)
    setLoading(false)
  }, [orderId])

  useEffect(() => { load() }, [load])

  // ── Validate 1 file ────────────────────────────────────────────────
  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return `File "${file.name}" quá lớn (>${MAX_FILE_SIZE_MB}MB)`
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return `File "${file.name}" sai định dạng (chỉ PDF/DOC/DOCX/JPG/PNG)`
    }
    return null
  }

  // ── Upload (multi-file) ────────────────────────────────────────────
  const handleUploadMulti = async (files: FileList | File[]) => {
    const arr = Array.from(files)
    if (arr.length === 0) return
    if (arr.length > MAX_FILES) {
      message.warning(`Tối đa ${MAX_FILES} file cùng lúc`)
      return
    }
    // Validate trước khi upload
    for (const f of arr) {
      const err = validateFile(f)
      if (err) {
        message.warning(err)
        return
      }
    }
    setUploading(true)
    let okCount = 0
    let failCount = 0
    for (const f of arr) {
      const res = await salesContractService.uploadContract(orderId, f, user, salesRole)
      if (res.ok) okCount++
      else {
        failCount++
        console.error('Upload fail:', f.name, res.error)
      }
    }
    setUploading(false)
    if (okCount > 0) {
      message.success(
        failCount > 0
          ? `Đã tải lên ${okCount}/${arr.length} file (${failCount} lỗi)`
          : `Đã tải lên ${okCount} file`,
      )
      await load()
    } else {
      message.error('Upload thất bại toàn bộ — xem console')
    }
  }

  // ── Replace 1 file cụ thể ─────────────────────────────────────────
  const handleReplace = async (file: File) => {
    const targetId = replaceTargetIdRef.current
    if (!targetId) return
    const err = validateFile(file)
    if (err) {
      message.warning(err)
      return
    }
    setUploading(true)
    const res = await salesContractService.uploadContract(orderId, file, user, salesRole, {
      replaceDocId: targetId,
    })
    setUploading(false)
    replaceTargetIdRef.current = null
    if (res.ok) {
      message.success('Đã thay thế file (file cũ vẫn lưu trong storage)')
      await load()
    } else {
      message.error('Lỗi thay thế: ' + (res.error || ''))
    }
  }

  // ── Delete 1 file ─────────────────────────────────────────────────
  const handleDelete = async (doc: SalesDocument) => {
    setDeletingId(doc.id)
    const res = await salesContractService.deleteContract(doc.id, user, salesRole)
    setDeletingId(null)
    if (res.ok) {
      message.success(`Đã xóa "${doc.file_name || 'file'}"`)
      await load()
    } else {
      message.error('Lỗi xóa: ' + (res.error || ''))
    }
  }

  // ── View / Download ───────────────────────────────────────────────
  const handleOpen = async (doc: SalesDocument, mode: 'view' | 'download') => {
    setBusyAction(`${doc.id}_${mode}`)
    const url = await salesContractService.getSignedUrl(doc, mode, user, salesRole)
    setBusyAction(null)
    if (!url) {
      message.error('Không có quyền hoặc lỗi khi tạo link')
      return
    }
    if (mode === 'view') {
      window.open(url, '_blank', 'noopener,noreferrer')
    } else {
      const a = document.createElement('a')
      a.href = url
      a.download = doc.file_name || 'contract.pdf'
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
  }

  // ── Access log ────────────────────────────────────────────────────
  const openLog = async () => {
    setLogOpen(true)
    setLogLoading(true)
    const rows = await salesContractService.getAccessLog(orderId)
    setLogData(rows)
    setLogLoading(false)
  }

  // ────────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{
          fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
          color: '#1B4D3E', letterSpacing: 1,
        }}>
          File hợp đồng
          {docs.length > 0 && (
            <Tag color="blue" style={{ marginLeft: 8, fontSize: 10 }}>
              {docs.length} file
            </Tag>
          )}
          {userIsBOD && <Tag color="gold" style={{ marginLeft: 4, fontSize: 10 }}>BGĐ</Tag>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {hasFile && canUpload && (
            <Button
              size="small"
              icon={<UploadOutlined />}
              onClick={() => uploadInputRef.current?.click()}
              loading={uploading}
            >
              Thêm file (tối đa {MAX_FILES})
            </Button>
          )}
          {canSeeLog && (
            <Button size="small" icon={<HistoryOutlined />} onClick={openLog}>
              Lịch sử truy cập
            </Button>
          )}
        </div>
      </div>

      <div style={{
        border: '1px solid #e8e8e8',
        borderRadius: 8,
        padding: 12,
        background: hasFile ? '#f6ffed' : '#fafafa',
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
        ) : !hasFile ? (
          canUpload ? (
            <UploadArea
              uploading={uploading}
              onPick={() => uploadInputRef.current?.click()}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#999', padding: 8 }}>
              <LockOutlined />
              <span style={{ fontSize: 13 }}>
                Chưa có file hợp đồng. {salesRole === 'sale' ? '' : 'Chỉ Sale được upload lần đầu.'}
              </span>
            </div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {docs.map((doc) => {
              const canView = canViewContract(doc, user, salesRole)
              return (
                <div
                  key={doc.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 4px', borderBottom: '1px dashed #d9f7be',
                  }}
                >
                  <FilePdfOutlined style={{ fontSize: 24, color: '#f5222d', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1B4D3E' }}>
                      {doc.file_name || 'contract'}
                    </div>
                    <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                      {formatSize(doc.file_size)}
                      {doc.received_at && (
                        <> • Tải lên {dayjs(doc.received_at).format('DD/MM/YYYY HH:mm')}</>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {canView ? (
                      <>
                        <Tooltip title="Xem trước">
                          <Button
                            size="small"
                            icon={<EyeOutlined />}
                            loading={busyAction === `${doc.id}_view`}
                            onClick={() => handleOpen(doc, 'view')}
                          >
                            Xem
                          </Button>
                        </Tooltip>
                        <Tooltip title="Tải file về máy">
                          <Button
                            size="small"
                            icon={<DownloadOutlined />}
                            loading={busyAction === `${doc.id}_download`}
                            onClick={() => handleOpen(doc, 'download')}
                          >
                            Tải
                          </Button>
                        </Tooltip>
                      </>
                    ) : (
                      <Tooltip title="Chỉ BGĐ + người upload mới xem được">
                        <Tag icon={<LockOutlined />} color="default">Bảo mật</Tag>
                      </Tooltip>
                    )}
                    {canReplace && (
                      <Tooltip title="Thay thế (file cũ giữ trong storage + log)">
                        <Button
                          size="small"
                          icon={<SyncOutlined />}
                          loading={uploading && replaceTargetIdRef.current === doc.id}
                          onClick={() => {
                            replaceTargetIdRef.current = doc.id
                            replaceInputRef.current?.click()
                          }}
                        >
                          Thay thế
                        </Button>
                      </Tooltip>
                    )}
                    {canDelete && (
                      <Popconfirm
                        title="Xóa file này?"
                        description={`"${doc.file_name}" sẽ bị xóa khỏi DB + storage. Audit log vẫn giữ.`}
                        okText="Xóa"
                        cancelText="Huỷ"
                        okButtonProps={{ danger: true, loading: deletingId === doc.id }}
                        onConfirm={() => handleDelete(doc)}
                      >
                        <Tooltip title="Xóa (hard delete) — admin only">
                          <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            loading={deletingId === doc.id}
                          >
                            Xóa
                          </Button>
                        </Tooltip>
                      </Popconfirm>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Hidden file input — Upload (multiple) */}
      <input
        ref={uploadInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = e.target.files
          if (files && files.length > 0) handleUploadMulti(files)
          e.target.value = ''
        }}
      />

      {/* Hidden file input — Replace 1 file */}
      <input
        ref={replaceInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleReplace(f)
          e.target.value = ''
        }}
      />

      {/* Access log modal */}
      <Modal
        title={<span><HistoryOutlined /> Lịch sử truy cập hợp đồng</span>}
        open={logOpen}
        onCancel={() => setLogOpen(false)}
        footer={null}
        width={760}
      >
        {logLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : logData.length === 0 ? (
          <Empty description="Chưa có hoạt động nào" />
        ) : (
          <Table
            size="small"
            rowKey="id"
            dataSource={logData}
            pagination={{ pageSize: 20, size: 'small' }}
            columns={[
              {
                title: 'Thời gian',
                dataIndex: 'created_at',
                width: 140,
                render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm:ss'),
              },
              {
                title: 'Hành động',
                dataIndex: 'action',
                width: 100,
                render: (v: string) => {
                  const meta = ACTION_LABELS[v] || { text: v, color: 'default' }
                  return <Tag color={meta.color}>{meta.text}</Tag>
                },
              },
              {
                title: 'Người dùng',
                dataIndex: 'user_name',
                render: (_: any, r: ContractAccessLogEntry) => (
                  <div>
                    <div style={{ fontWeight: 500 }}>{r.user_name || r.user_email || '—'}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>{r.user_email}</div>
                  </div>
                ),
              },
              {
                title: 'Vai trò',
                dataIndex: 'user_role',
                width: 130,
                render: (v: string) => v ? (ROLE_LABELS[v] || v) : '—',
              },
              {
                title: 'File',
                dataIndex: 'file_name',
                ellipsis: true,
                render: (v: string) => v || '—',
              },
            ]}
          />
        )}
      </Modal>
    </div>
  )
}

// ── Drag-drop upload area ──────────────────────────────────────────────
function UploadArea({ uploading, onPick }: { uploading: boolean; onPick: () => void }) {
  return (
    <div
      onClick={onPick}
      style={{
        border: '2px dashed #1B4D3E',
        borderRadius: 6,
        padding: 24,
        textAlign: 'center',
        cursor: 'pointer',
        background: '#fff',
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f0f9f4')}
      onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
    >
      {uploading ? (
        <Spin tip="Đang tải..." />
      ) : (
        <>
          <UploadOutlined style={{ fontSize: 32, color: '#1B4D3E' }} />
          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: '#1B4D3E' }}>
            Bấm để chọn file hợp đồng (1–10 file)
          </div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
            PDF / DOC / DOCX / JPG / PNG — tối đa {MAX_FILE_SIZE_MB}MB/file
          </div>
        </>
      )}
    </div>
  )
}
