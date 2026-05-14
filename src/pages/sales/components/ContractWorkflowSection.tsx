// ============================================================================
// CONTRACT WORKFLOW SECTION
// File: src/pages/sales/components/ContractWorkflowSection.tsx
//
// Render block "Hợp đồng (workflow mới)" cho đơn hàng đã có sales_order_contracts.
// Hiển thị:
//  - Status badge (drafting / reviewing / approved / rejected / signed / archived)
//  - Timeline: tạo bởi X → trình review → duyệt → ký
//  - Bank info (read-only, do Kiểm tra nhập)
//  - Action: tải SC/PI, vào trang Review, tải PDF đã ký
//  - Revisions history (nếu có nhiều rev do reject + resubmit)
//
// Đơn HĐ cũ (không có sales_order_contracts) sẽ fall back ContractFileSection
// (upload file scan). Logic detect ở ContractTab.tsx.
// ============================================================================

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Tag, Space, Button, Typography, Empty, Spin, message, Tooltip } from 'antd'
import {
  EyeOutlined,
  DownloadOutlined,
  FileWordOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
} from '@ant-design/icons'
import {
  salesContractWorkflowService,
  type SalesOrderContract,
  type ContractStatus,
} from '../../../services/sales/salesContractWorkflowService'
import {
  downloadContract,
  deriveKind,
} from '../../../services/sales/contractGeneratorService'

const { Text } = Typography

interface Props {
  salesOrderId: string
}

const STATUS_META: Record<
  ContractStatus,
  { color: string; label: string; icon: React.ReactNode }
> = {
  drafting: { color: 'default', label: 'Nháp', icon: <EditOutlined /> },
  reviewing: {
    color: 'processing',
    label: 'Chờ Kiểm tra',
    icon: <ClockCircleOutlined />,
  },
  rejected: { color: 'error', label: 'Bị trả lại', icon: <CloseCircleOutlined /> },
  approved: {
    color: 'warning',
    label: 'Đã duyệt, chờ ký',
    icon: <ClockCircleOutlined />,
  },
  signed: { color: 'success', label: 'Đã ký', icon: <CheckCircleOutlined /> },
  archived: { color: 'default', label: 'Lưu trữ', icon: <CheckCircleOutlined /> },
}

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleString('vi-VN') : '—'

export default function ContractWorkflowSection({ salesOrderId }: Props) {
  const navigate = useNavigate()
  const [rows, setRows] = useState<SalesOrderContract[]>([])
  const [loading, setLoading] = useState(true)
  const [docLoading, setDocLoading] = useState<string | null>(null)

  useEffect(() => {
    salesContractWorkflowService
      .listBySalesOrder(salesOrderId)
      .then(setRows)
      .catch((e) => message.error(`Không tải được HĐ: ${e?.message || e}`))
      .finally(() => setLoading(false))
  }, [salesOrderId])

  const handleDownload = async (
    contract: SalesOrderContract,
    type: 'SC' | 'PI',
  ) => {
    const key = `${contract.id}_${type}`
    setDocLoading(key)
    try {
      const kind = deriveKind(contract.form_data?.incoterm || 'FOB', type)
      await downloadContract(
        kind,
        contract.form_data,
        `${contract.form_data?.contract_no || 'contract'}_${type}_rev${contract.revision_no}.docx`,
      )
      message.success(`Đã tải ${type} (rev #${contract.revision_no})`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      message.error(`Tải ${type} thất bại: ${msg}`)
    } finally {
      setDocLoading(null)
    }
  }

  if (loading) {
    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <Spin /> <Text type="secondary">Đang tải workflow HĐ…</Text>
      </Card>
    )
  }

  if (rows.length === 0) {
    return null // Caller sẽ fall back legacy ContractFileSection
  }

  // Latest revision lên đầu (rows đã sorted DESC by revision_no)
  const latest = rows[0]
  const history = rows.slice(1)
  const meta = STATUS_META[latest.status]
  const fd = latest.form_data || {}

  return (
    <Card
      size="small"
      style={{ marginBottom: 16, borderRadius: 8, border: '1px solid #1B4D3E33' }}
      title={
        <Space>
          <FileWordOutlined style={{ color: '#1B4D3E' }} />
          <span style={{ fontWeight: 600 }}>Hợp đồng (workflow)</span>
          <Tag color={meta.color} icon={meta.icon}>
            {meta.label}
          </Tag>
          <Tag>rev #{latest.revision_no}</Tag>
        </Space>
      }
      extra={
        <Space>
          {latest.status === 'reviewing' && (
            <Tooltip title="Mở trang Kiểm tra để duyệt">
              <Button
                size="small"
                type="primary"
                icon={<EyeOutlined />}
                onClick={() => navigate('/sales/contracts/review')}
                style={{ background: '#1B4D3E' }}
              >
                Mở queue Kiểm tra
              </Button>
            </Tooltip>
          )}
          {latest.signed_pdf_url && (
            <Tooltip title="Tải PDF đã ký + đóng dấu (signed URL 2 phút)">
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={async () => {
                  const url = await salesContractWorkflowService.getSignedPdfUrl(
                    latest.signed_pdf_url || '',
                  )
                  if (url) window.open(url, '_blank')
                  else message.error('Không tạo được signed URL')
                }}
              >
                PDF đã ký
              </Button>
            </Tooltip>
          )}
        </Space>
      }
    >
      {/* Timeline */}
      <Space direction="vertical" size={4} style={{ width: '100%', fontSize: 12 }}>
        <div>
          <Tag color="blue">Sale</Tag> {latest.created_by_employee?.full_name || '—'} tạo lúc{' '}
          <Text type="secondary">{fmtDate(latest.submitted_at || latest.created_at)}</Text>
        </div>
        {latest.reviewed_at && (
          <div>
            <Tag color="orange">Kiểm tra</Tag>{' '}
            {latest.reviewer_employee?.full_name || '—'} duyệt lúc{' '}
            <Text type="secondary">{fmtDate(latest.reviewed_at)}</Text>
            {latest.review_notes && (
              <Text type="secondary" style={{ marginLeft: 8 }}>
                — {latest.review_notes}
              </Text>
            )}
          </div>
        )}
        {latest.rejected_at && (
          <div>
            <Tag color="red">Trả lại</Tag>{' '}
            <Text type="danger">{latest.rejected_reason}</Text>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              ({fmtDate(latest.rejected_at)})
            </Text>
          </div>
        )}
        {latest.signed_at && (
          <div>
            <Tag color="green">Đã ký</Tag>{' '}
            {latest.signer_employee?.full_name || '—'} ký lúc{' '}
            <Text type="secondary">{fmtDate(latest.signed_at)}</Text>
          </div>
        )}
      </Space>

      {/* Bank info (nếu đã có) */}
      {fd.bank_account_no && (
        <div
          style={{
            marginTop: 12,
            padding: 8,
            background: '#fff7e6',
            borderRadius: 4,
            fontSize: 11,
          }}
        >
          <Text strong>Bank info (Kiểm tra nhập):</Text>{' '}
          {fd.bank_account_name} — {fd.bank_account_no} — {fd.bank_full_name} —
          SWIFT {fd.bank_swift}
        </div>
      )}

      {/* Action: tải .docx render từ form_data */}
      <div style={{ marginTop: 12 }}>
        <Space.Compact size="small">
          <Button
            icon={<DownloadOutlined />}
            loading={docLoading === `${latest.id}_SC`}
            onClick={() => handleDownload(latest, 'SC')}
          >
            Tải SC
          </Button>
          <Button
            icon={<DownloadOutlined />}
            loading={docLoading === `${latest.id}_PI`}
            onClick={() => handleDownload(latest, 'PI')}
          >
            Tải PI
          </Button>
        </Space.Compact>
        <Text type="secondary" style={{ marginLeft: 8, fontSize: 11 }}>
          File render từ template + form_data (revision #{latest.revision_no})
        </Text>
      </div>

      {/* Lịch sử revision (nếu có) */}
      {history.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: '#666' }}>
            Lịch sử {history.length} revision cũ
          </summary>
          <div style={{ marginTop: 8, fontSize: 11 }}>
            {history.map((r) => {
              const m = STATUS_META[r.status]
              return (
                <div
                  key={r.id}
                  style={{
                    padding: 4,
                    borderBottom: '1px dashed #eee',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Tag>rev #{r.revision_no}</Tag>
                  <Tag color={m.color}>{m.label}</Tag>
                  {r.rejected_reason && (
                    <Text type="danger" style={{ fontSize: 11 }}>
                      Lý do trả: {r.rejected_reason}
                    </Text>
                  )}
                  <Text type="secondary" style={{ marginLeft: 'auto', fontSize: 11 }}>
                    {fmtDate(r.submitted_at || r.created_at)}
                  </Text>
                </div>
              )
            })}
          </div>
        </details>
      )}
    </Card>
  )
}

/** Helper: detect 1 order có dùng workflow mới không (caller dùng để skip
 *  legacy ContractFileSection). Trả về true nếu có ít nhất 1 row trong
 *  sales_order_contracts. */
export async function hasWorkflowContract(salesOrderId: string): Promise<boolean> {
  const rows = await salesContractWorkflowService.listBySalesOrder(salesOrderId)
  return rows.length > 0
}

// Re-export Empty để tránh ESLint unused-import warning (Empty hiện không
// dùng trực tiếp, giữ lại trong import phòng khi muốn customize empty state)
export const _Empty = Empty
