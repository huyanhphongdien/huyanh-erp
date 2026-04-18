// ============================================================================
// DISPUTE DETAIL DRAWER — Xem / xử lý 1 DRC dispute
// File: src/components/b2b/DisputeDetailDrawer.tsx
//
// Factory view: có thể markInvestigating / resolve (accept / reject)
// Partner view: có thể withdraw khi dispute còn mở
// ============================================================================

import { useEffect, useState } from 'react'
import {
  Drawer,
  Descriptions,
  Tag,
  Typography,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Alert,
  message,
  Divider,
  Popconfirm,
} from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SearchOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import {
  drcDisputeService,
  type DrcDispute,
  DISPUTE_STATUS_LABELS,
  DISPUTE_STATUS_COLORS,
} from '../../services/b2b/drcDisputeService'

const { Text, Paragraph } = Typography
const { TextArea } = Input

interface DisputeDetailDrawerProps {
  open: boolean
  onClose: () => void
  disputeId: string | null
  viewerType: 'factory' | 'partner'
  /** employee_id nhà máy hoặc partner_user_id — dùng khi resolve */
  actionBy?: string
  onChanged?: () => void
}

const DisputeDetailDrawer = ({
  open,
  onClose,
  disputeId,
  viewerType,
  actionBy,
  onChanged,
}: DisputeDetailDrawerProps) => {
  const [loading, setLoading] = useState(false)
  const [dispute, setDispute] = useState<DrcDispute | null>(null)
  const [resolveModal, setResolveModal] = useState<{ visible: boolean; accept: boolean }>({
    visible: false,
    accept: true,
  })
  const [form] = Form.useForm()
  const [resolving, setResolving] = useState(false)

  const reload = async () => {
    if (!disputeId) return
    setLoading(true)
    try {
      const d = await drcDisputeService.getDisputeById(disputeId)
      setDispute(d)
    } catch (err: any) {
      message.error(err?.message || 'Không thể tải dispute')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && disputeId) reload()
    if (!open) setDispute(null)
  }, [open, disputeId])

  if (!dispute && !loading) {
    return (
      <Drawer open={open} onClose={onClose} title="Chi tiết khiếu nại" width={520}>
        <Text type="secondary">Không tìm thấy khiếu nại</Text>
      </Drawer>
    )
  }

  const isOpen = dispute?.status === 'open'
  const isInvestigating = dispute?.status === 'investigating'
  const isActive = isOpen || isInvestigating
  const isResolved = dispute?.status === 'resolved_accepted' || dispute?.status === 'resolved_rejected'

  const handleInvestigate = async () => {
    if (!dispute || !actionBy) return
    try {
      await drcDisputeService.markInvestigating(dispute.id, actionBy)
      message.success('Đã đánh dấu đang xác minh')
      reload()
      onChanged?.()
    } catch (err: any) {
      message.error(err?.message || 'Không thể cập nhật')
    }
  }

  const handleWithdraw = async () => {
    if (!dispute) return
    try {
      await drcDisputeService.withdrawDispute(dispute.id)
      message.success('Đã rút khiếu nại')
      reload()
      onChanged?.()
    } catch (err: any) {
      message.error(err?.message || 'Không thể rút khiếu nại')
    }
  }

  const openResolveModal = (accept: boolean) => {
    form.resetFields()
    if (accept && dispute) {
      form.setFieldsValue({
        adjustment_drc: dispute.actual_drc,
      })
    }
    setResolveModal({ visible: true, accept })
  }

  const handleResolve = async () => {
    if (!dispute || !actionBy) return
    try {
      const values = await form.validateFields()
      setResolving(true)
      await drcDisputeService.resolveDispute(dispute.id, {
        accepted: resolveModal.accept,
        resolved_by: actionBy,
        notes: values.notes,
        adjustment_drc: resolveModal.accept ? values.adjustment_drc : undefined,
        adjustment_amount: resolveModal.accept ? values.adjustment_amount : undefined,
      })
      message.success(resolveModal.accept ? 'Đã chấp nhận khiếu nại' : 'Đã từ chối khiếu nại')
      setResolveModal({ visible: false, accept: true })
      reload()
      onChanged?.()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || 'Không thể resolve')
    } finally {
      setResolving(false)
    }
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={
          <Space>
            <span>Khiếu nại {dispute?.dispute_number || '...'}</span>
            {dispute && (
              <Tag color={DISPUTE_STATUS_COLORS[dispute.status]}>
                {DISPUTE_STATUS_LABELS[dispute.status]}
              </Tag>
            )}
          </Space>
        }
        width={560}
        loading={loading}
      >
        {dispute && (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Deal">
                {dispute.deal?.deal_number} — {dispute.deal?.product_name}
              </Descriptions.Item>
              <Descriptions.Item label="Đại lý">
                {dispute.partner?.name} ({dispute.partner?.code})
              </Descriptions.Item>
              <Descriptions.Item label="DRC dự kiến">{dispute.expected_drc}%</Descriptions.Item>
              <Descriptions.Item label="DRC thực tế">{dispute.actual_drc}%</Descriptions.Item>
              <Descriptions.Item label="Chênh lệch">
                <Text strong style={{ color: dispute.drc_variance < 0 ? '#ef4444' : '#10b981' }}>
                  {dispute.drc_variance > 0 ? '+' : ''}{dispute.drc_variance}%
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Ngày khiếu nại">
                {new Date(dispute.created_at).toLocaleString('vi-VN')}
              </Descriptions.Item>
            </Descriptions>

            <Divider>Lý do</Divider>
            <Paragraph style={{ whiteSpace: 'pre-wrap', background: '#fafafa', padding: 12, borderRadius: 8 }}>
              {dispute.reason}
            </Paragraph>

            {dispute.partner_evidence && (
              <>
                <Divider>Bằng chứng</Divider>
                {(dispute.partner_evidence as any).files?.map((f: any, i: number) => (
                  <div key={i}>
                    <a href={f.url} target="_blank" rel="noopener noreferrer">
                      📎 {f.name}
                    </a>
                  </div>
                ))}
              </>
            )}

            {isResolved && (
              <>
                <Divider>Kết quả xử lý</Divider>
                <Alert
                  type={dispute.status === 'resolved_accepted' ? 'success' : 'error'}
                  message={DISPUTE_STATUS_LABELS[dispute.status]}
                  description={
                    <div>
                      {dispute.resolution_notes && <div>{dispute.resolution_notes}</div>}
                      {dispute.adjustment_drc != null && (
                        <div>DRC điều chỉnh: <b>{dispute.adjustment_drc}%</b></div>
                      )}
                      {dispute.adjustment_amount != null && (
                        <div>Số tiền điều chỉnh: <b>{dispute.adjustment_amount.toLocaleString('vi-VN')} VNĐ</b></div>
                      )}
                      {dispute.resolved_at && (
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                          Xử lý lúc: {new Date(dispute.resolved_at).toLocaleString('vi-VN')}
                        </div>
                      )}
                    </div>
                  }
                />
              </>
            )}

            {/* ========== Actions ========== */}
            <Divider />
            <Space wrap>
              {/* Factory actions */}
              {viewerType === 'factory' && isOpen && (
                <Button icon={<SearchOutlined />} onClick={handleInvestigate}>
                  Bắt đầu xác minh
                </Button>
              )}
              {viewerType === 'factory' && isActive && (
                <>
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    style={{ background: '#16a34a', borderColor: '#16a34a' }}
                    onClick={() => openResolveModal(true)}
                  >
                    Chấp nhận
                  </Button>
                  <Button
                    danger
                    icon={<CloseCircleOutlined />}
                    onClick={() => openResolveModal(false)}
                  >
                    Từ chối
                  </Button>
                </>
              )}

              {/* Partner withdraw */}
              {viewerType === 'partner' && isActive && (
                <Popconfirm
                  title="Rút khiếu nại?"
                  description="Thao tác không hoàn tác được. Nếu cần có thể tạo khiếu nại mới sau."
                  onConfirm={handleWithdraw}
                  okText="Rút"
                  cancelText="Hủy"
                >
                  <Button icon={<UndoOutlined />} danger>
                    Rút khiếu nại
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </>
        )}
      </Drawer>

      {/* ========== Resolve Modal (factory only) ========== */}
      <Modal
        open={resolveModal.visible}
        title={resolveModal.accept ? 'Chấp nhận khiếu nại' : 'Từ chối khiếu nại'}
        onOk={handleResolve}
        onCancel={() => setResolveModal({ visible: false, accept: true })}
        confirmLoading={resolving}
        okText={resolveModal.accept ? 'Chấp nhận' : 'Từ chối'}
        okButtonProps={resolveModal.accept ? { style: { background: '#16a34a', borderColor: '#16a34a' } } : { danger: true }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="notes"
            label="Ghi chú xử lý"
            rules={[
              { required: true, message: 'Vui lòng ghi rõ lý do' },
              { min: 10, message: 'Tối thiểu 10 ký tự' },
            ]}
          >
            <TextArea rows={4} placeholder="Lý do chấp nhận / từ chối, chi tiết giải thích..." />
          </Form.Item>

          {resolveModal.accept && (
            <>
              <Form.Item
                name="adjustment_drc"
                label="DRC sau điều chỉnh (%)"
                rules={[{ required: true, message: 'Nhập DRC mới' }]}
              >
                <InputNumber
                  min={0}
                  max={100}
                  step={0.1}
                  style={{ width: '100%' }}
                  addonAfter="%"
                />
              </Form.Item>
              <Form.Item
                name="adjustment_amount"
                label="Số tiền điều chỉnh (VNĐ)"
                help="Số tiền bù thêm (dương) hoặc trừ (âm) cho đại lý"
              >
                <InputNumber
                  style={{ width: '100%' }}
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => v!.replace(/,/g, '') as any}
                />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </>
  )
}

export default DisputeDetailDrawer
