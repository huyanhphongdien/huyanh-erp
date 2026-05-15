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
import {
  Card, Tag, Space, Button, Typography, Spin, message, Tooltip, Modal, Drawer,
  Form, Input, Alert, Row, Col,
} from 'antd'
import {
  EyeOutlined,
  DownloadOutlined,
  FileWordOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  InboxOutlined,
  RedoOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../../../stores/authStore'
import { SALES_CONFIG, isAllowedToDelete } from '../../../config/sales.config'
import {
  salesContractWorkflowService,
  type SalesOrderContract,
  type ContractStatus,
} from '../../../services/sales/salesContractWorkflowService'
import {
  downloadContract,
  deriveKind,
} from '../../../services/sales/contractGeneratorService'
import { supabase } from '../../../lib/supabase'

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
  const user = useAuthStore((s) => s.user)
  const [rows, setRows] = useState<SalesOrderContract[]>([])
  const [loading, setLoading] = useState(true)
  const [docLoading, setDocLoading] = useState<string | null>(null)
  const [resubmitOpen, setResubmitOpen] = useState(false)
  const [resubmitting, setResubmitting] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [resubmitForm] = Form.useForm()

  // SALES_CONFIG dùng được vì là source-of-truth single. Admin email được archive.
  const canArchive = SALES_CONFIG.DELETE_PERMISSION_EMAILS.includes(
    (user?.email || '').toLowerCase(),
  )
  // Ai trong DELETE list cũng được archive (admin/BOD)
  void isAllowedToDelete  // re-export helper

  useEffect(() => {
    salesContractWorkflowService
      .listBySalesOrder(salesOrderId)
      .then(setRows)
      .catch((e) => message.error(`Không tải được HĐ: ${e?.message || e}`))
      .finally(() => setLoading(false))
  }, [salesOrderId])

  /** Self-heal form_data: fetch fresh customer info + recompute amount_words
   *  cho HĐ cũ được tạo trước khi CUSTOMER_JOIN có address. */
  async function enrichFormData(
    contract: SalesOrderContract,
  ): Promise<Partial<typeof contract.form_data>> {
    const fd = { ...(contract.form_data || {}) }
    if (!fd.buyer_address || !fd.buyer_phone) {
      try {
        const { data: order } = await supabase
          .from('sales_orders')
          .select('customer:sales_customers!customer_id(name,address,phone)')
          .eq('id', salesOrderId)
          .maybeSingle()
        const cust = (order?.customer as { name?: string; address?: string; phone?: string } | null) || null
        if (cust) {
          if (!fd.buyer_name) fd.buyer_name = cust.name || ''
          if (!fd.buyer_address) fd.buyer_address = cust.address || ''
          if (!fd.buyer_phone) fd.buyer_phone = cust.phone || ''
        }
      } catch (e) {
        console.warn('enrichFormData: không fetch được customer', e)
      }
    }
    return fd
  }

  const handleDownload = async (
    contract: SalesOrderContract,
    type: 'SC' | 'PI',
  ) => {
    const key = `${contract.id}_${type}`
    setDocLoading(key)
    try {
      const enriched = await enrichFormData(contract)
      const kind = deriveKind(enriched.incoterm || 'FOB', type)
      await downloadContract(
        kind,
        enriched,
        `${enriched.contract_no || 'contract'}_${type}_rev${contract.revision_no}.docx`,
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
          {latest.status === 'rejected' && (
            <Tooltip title="Tạo revision mới để Phú LV duyệt lại">
              <Button
                size="small"
                type="primary"
                icon={<RedoOutlined />}
                onClick={() => {
                  resubmitForm.setFieldsValue(latest.form_data || {})
                  setResubmitOpen(true)
                }}
                style={{ background: '#1B4D3E' }}
              >
                Sửa & Trình lại
              </Button>
            </Tooltip>
          )}
          {latest.status === 'approved' && (
            <Tooltip title="Mở trang Trình ký để Trung/Huy ký">
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => navigate('/sales/contracts/sign')}
              >
                Mở queue Ký
              </Button>
            </Tooltip>
          )}
          {latest.status === 'signed' && canArchive && (
            <Tooltip title="Lưu trữ HĐ đã ký (terminal state)">
              <Button
                size="small"
                icon={<InboxOutlined />}
                loading={archiving}
                onClick={() => {
                  Modal.confirm({
                    title: 'Lưu trữ HĐ?',
                    content: `HĐ ${latest.form_data?.contract_no} (rev #${latest.revision_no}) sẽ chuyển sang archived. Không undo được.`,
                    okText: 'Lưu trữ',
                    cancelText: 'Huỷ',
                    onOk: async () => {
                      setArchiving(true)
                      try {
                        await salesContractWorkflowService.archive(latest.id)
                        message.success('Đã lưu trữ')
                        const updated = await salesContractWorkflowService.listBySalesOrder(salesOrderId)
                        setRows(updated)
                      } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message : String(e)
                        message.error(`Lưu trữ thất bại: ${msg}`)
                      } finally {
                        setArchiving(false)
                      }
                    },
                  })
                }}
              >
                Lưu trữ
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

      {/* Drawer Sửa & Trình lại (chỉ khi rejected) */}
      <Drawer
        title={
          <Space>
            <RedoOutlined />
            <span>Sửa & Trình lại — {latest.form_data?.contract_no}</span>
            <Tag>rev #{latest.revision_no + 1} (mới)</Tag>
          </Space>
        }
        open={resubmitOpen}
        onClose={() => setResubmitOpen(false)}
        width={640}
        extra={
          <Space>
            <Button onClick={() => setResubmitOpen(false)}>Huỷ</Button>
            <Button
              type="primary"
              icon={<RedoOutlined />}
              loading={resubmitting}
              onClick={async () => {
                const vals = await resubmitForm.validateFields()
                const merged = { ...latest.form_data, ...vals }
                setResubmitting(true)
                try {
                  await salesContractWorkflowService.resubmitRevision(salesOrderId, merged)
                  message.success('Đã trình revision mới — Phú LV sẽ kiểm tra lại')
                  setResubmitOpen(false)
                  const updated = await salesContractWorkflowService.listBySalesOrder(salesOrderId)
                  setRows(updated)
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : String(e)
                  message.error(`Trình lại thất bại: ${msg}`)
                } finally {
                  setResubmitting(false)
                }
              }}
              style={{ background: '#1B4D3E' }}
            >
              Trình lại
            </Button>
          </Space>
        }
      >
        <Alert
          type="error"
          showIcon
          message={`Phú LV đã trả lại với lý do: "${latest.rejected_reason || '—'}"`}
          description="Sửa các trường bị Phú LV report, sau đó bấm 'Trình lại' để tạo revision mới."
          style={{ marginBottom: 16 }}
        />
        <Form form={resubmitForm} layout="vertical" size="middle">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Số HĐ" name="contract_no" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Ngày HĐ" name="contract_date">
                <Input placeholder="08 May 2026" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="Grade" name="grade">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Quantity (MT)" name="quantity">
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="Unit price" name="unit_price">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Amount (USD)" name="amount">
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Time of shipment" name="shipment_time">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Payment" name="payment">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Packing description" name="packing_desc">
            <Input />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            message="Các trường khác (buyer, bank, ports, etc.) giữ nguyên từ revision cũ. Cần edit chi tiết thì vào trang Sales Order Create."
            style={{ marginTop: 8 }}
          />
        </Form>
      </Drawer>
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

