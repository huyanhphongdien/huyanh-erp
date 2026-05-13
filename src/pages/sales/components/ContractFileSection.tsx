// ============================================================================
// CONTRACT FILE SECTION — Upload + Xem/Tải file Hợp đồng trong ContractTab
// File: src/pages/sales/components/ContractFileSection.tsx
//
// Quy tắc:
//  - Sale upload lần đầu (drag-drop)
//  - Sau khi upload, sale xem được file của chính mình
//  - BGĐ (admin + Mr. Trung) xem/tải mọi file + xem lịch sử truy cập
//  - Chỉ BGĐ được "Thay thế" file (replace)
//  - Không có nút xóa
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button, message, Tag, Tooltip, Modal, Table, Empty, Spin,
} from 'antd'
import {
  UploadOutlined, EyeOutlined, DownloadOutlined, SyncOutlined,
  HistoryOutlined, FilePdfOutlined, LockOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  salesContractService,
  canUploadContract,
  canReplaceContract,
  canViewContract,
  canViewAccessLog,
  type ContractAccessLogEntry,
} from '../../../services/sales/salesContractService'
import type { SalesDocument } from '../../../services/sales/salesDocumentUploadService'
import { isBOD, type SalesRole } from '../../../services/sales/salesPermissionService'
import { useAuthStore } from '../../../stores/authStore'

const ACTION_LABELS: Record<string, { text: string; color: string }> = {
  upload:   { text: 'Tải lên',     color: 'green' },
  replace:  { text: 'Thay thế',    color: 'orange' },
  view:     { text: 'Xem',         color: 'blue' },
  download: { text: 'Tải về',      color: 'geekblue' },
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
  const [doc, setDoc] = useState<SalesDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [busyAction, setBusyAction] = useState<'view' | 'download' | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [logData, setLogData] = useState<ContractAccessLogEntry[]>([])
  const [logLoading, setLogLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const userIsBOD = isBOD(user)
  const hasFile = !!doc?.file_url
  const canUpload = canUploadContract(hasFile, salesRole, user)
  const canReplace = canReplaceContract(salesRole, user)
  const canView = canViewContract(doc, user, salesRole)
  const canSeeLog = canViewAccessLog(user, salesRole)

  // ── Load contract record ────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const d = await salesContractService.getContract(orderId)
    setDoc(d)
    setLoading(false)
  }, [orderId])

  useEffect(() => { load() }, [load])

  // ── Upload handler ──────────────────────────────────────────────────
  const handleUpload = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      message.warning('File quá lớn (tối đa 20MB)')
      return
    }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png',
                     'application/msword',
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowed.includes(file.type)) {
      message.warning('Chỉ chấp nhận PDF, DOC/DOCX, JPG, PNG')
      return
    }
    setUploading(true)
    const res = await salesContractService.uploadContract(orderId, file, user, salesRole)
    setUploading(false)
    if (res.ok) {
      message.success(hasFile ? 'Đã thay thế hợp đồng' : 'Đã tải lên hợp đồng')
      await load()
    } else {
      message.error('Lỗi tải lên: ' + (res.error || ''))
    }
  }

  // ── View / Download ─────────────────────────────────────────────────
  const handleOpen = async (mode: 'view' | 'download') => {
    if (!doc) return
    setBusyAction(mode)
    const url = await salesContractService.getSignedUrl(doc, mode, user, salesRole)
    setBusyAction(null)
    if (!url) {
      message.error('Không có quyền hoặc lỗi khi tạo link')
      return
    }
    if (mode === 'view') {
      window.open(url, '_blank', 'noopener,noreferrer')
    } else {
      // download
      const a = document.createElement('a')
      a.href = url
      a.download = doc.file_name || 'contract.pdf'
      a.target = '_blank'
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
  }

  // ── Access log ──────────────────────────────────────────────────────
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
          {userIsBOD && <Tag color="gold" style={{ marginLeft: 8, fontSize: 10 }}>BGĐ</Tag>}
        </div>
        {canSeeLog && (
          <Button
            size="small"
            icon={<HistoryOutlined />}
            onClick={openLog}
          >
            Lịch sử truy cập
          </Button>
        )}
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
          // ─── EMPTY STATE ──────────────────────────────────────────
          canUpload ? (
            <UploadArea
              uploading={uploading}
              onPick={() => fileInputRef.current?.click()}
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
          // ─── HAS FILE ─────────────────────────────────────────────
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FilePdfOutlined style={{ fontSize: 28, color: '#f5222d', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1B4D3E' }}>
                {doc!.file_name || 'contract'}
              </div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                {formatSize(doc!.file_size)}
                {doc!.received_at && (
                  <> • Tải lên {dayjs(doc!.received_at).format('DD/MM/YYYY HH:mm')}</>
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
                      loading={busyAction === 'view'}
                      onClick={() => handleOpen('view')}
                    >
                      Xem
                    </Button>
                  </Tooltip>
                  <Tooltip title="Tải file về máy">
                    <Button
                      size="small"
                      icon={<DownloadOutlined />}
                      loading={busyAction === 'download'}
                      onClick={() => handleOpen('download')}
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
                <Tooltip title="Thay thế (file cũ vẫn được lưu trữ + log)">
                  <Button
                    size="small"
                    icon={<SyncOutlined />}
                    loading={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Thay thế
                  </Button>
                </Tooltip>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input — dùng chung cho upload + replace */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleUpload(f)
          e.target.value = ''
        }}
      />

      {/* Access log modal — BGĐ only */}
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
            Bấm để chọn file hợp đồng
          </div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
            PDF / DOC / DOCX / JPG / PNG — tối đa 20MB
          </div>
        </>
      )}
    </div>
  )
}

