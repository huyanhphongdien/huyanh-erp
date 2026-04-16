// ============================================================================
// TRANSFER DETAIL PAGE — Chi tiết phiếu chuyển kho + timeline 5 bước (F3)
// File: src/pages/wms/transfer/TransferDetailPage.tsx
// ============================================================================

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Card, Typography, Space, Button, Tag, Row, Col, Descriptions, Table,
  Statistic, Steps, Modal, Input, message, Spin, Alert, Empty,
} from 'antd'
import {
  ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined, CarOutlined,
  WarningOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../../../stores/authStore'
import transferService, { type TransferStatus } from '../../../services/wms/transferService'
import GradeBadge from '../../../components/wms/GradeBadge'
import type { RubberGrade } from '../../../services/wms/wms.types'

const { Title, Text } = Typography
const PRIMARY = '#1B4D3E'

const STATUS_LABELS: Record<TransferStatus, string> = {
  draft: 'Nháp',
  picking: 'Đang lấy',
  picked: 'Đã lấy',
  in_transit: 'Đang vận chuyển',
  arrived: 'Đã đến',
  received: 'Hoàn tất',
  cancelled: 'Hủy',
  rejected: 'Từ chối',
}

const STATUS_COLORS: Record<TransferStatus, string> = {
  draft: 'default',
  picking: 'processing',
  picked: 'cyan',
  in_transit: 'warning',
  arrived: 'gold',
  received: 'success',
  cancelled: 'default',
  rejected: 'error',
}

const formatDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('vi-VN') : '—'

interface Props {
  id?: string  // truyền qua tab system, fallback URL params
}

export default function TransferDetailPage({ id: propId }: Props) {
  const params = useParams<{ id: string }>()
  const id = propId || params.id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const [approveOpen, setApproveOpen] = useState(false)
  const [approveNote, setApproveNote] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const { data: transfer, isLoading, refetch } = useQuery({
    queryKey: ['transfer', id],
    queryFn: () => transferService.getById(id!),
    enabled: !!id,
    staleTime: 10000,
  })

  if (isLoading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
  if (!transfer) return <Empty description="Không tìm thấy phiếu chuyển" />

  const stepIndex: Record<TransferStatus, number> = {
    draft: 0,
    picking: 1,
    picked: 1,
    in_transit: 2,
    arrived: 3,
    received: 4,
    cancelled: 0,
    rejected: 3,
  }
  const currentStep = stepIndex[transfer.status]
  const stepStatus =
    transfer.status === 'cancelled' || transfer.status === 'rejected' ? 'error' :
    transfer.status === 'received' ? 'finish' : 'process'

  const handleApprove = async () => {
    if (!user?.id) { message.error('Chưa đăng nhập'); return }
    if (!user.employee_id) { message.error('Tài khoản chưa gắn với nhân viên — không thể duyệt'); return }
    try {
      await transferService.approveReceived({
        transfer_id: transfer.id,
        approved_by: user.employee_id,
        approval_note: approveNote || undefined,
      })
      message.success('Đã duyệt — phiếu chuyển hoàn tất')
      setApproveOpen(false)
      setApproveNote('')
      queryClient.invalidateQueries({ queryKey: ['transfer', id] })
      queryClient.invalidateQueries({ queryKey: ['transfers-all'] })
    } catch (err: any) {
      message.error('Lỗi duyệt: ' + (err.message || ''))
    }
  }

  const handleReject = async () => {
    if (!user?.id) { message.error('Chưa đăng nhập'); return }
    if (!user.employee_id) { message.error('Tài khoản chưa gắn với nhân viên — không thể từ chối'); return }
    if (!rejectReason.trim()) { message.warning('Nhập lý do từ chối'); return }
    try {
      await transferService.rejectReceived({
        transfer_id: transfer.id,
        rejected_by: user.employee_id,
        reason: rejectReason,
      })
      message.success('Đã từ chối phiếu chuyển')
      setRejectOpen(false)
      setRejectReason('')
      queryClient.invalidateQueries({ queryKey: ['transfer', id] })
    } catch (err: any) {
      message.error('Lỗi: ' + (err.message || ''))
    }
  }

  const handleCancel = async () => {
    try {
      await transferService.cancel(transfer.id, user?.employee_id || undefined, cancelReason || undefined)
      message.success('Đã hủy phiếu')
      setCancelOpen(false)
      queryClient.invalidateQueries({ queryKey: ['transfer', id] })
    } catch (err: any) {
      message.error('Lỗi: ' + (err.message || ''))
    }
  }

  const handleMarkArrived = async () => {
    try {
      await transferService.markArrived(transfer.id, user?.employee_id || undefined)
      message.success('Đã đánh dấu xe đến NM nhận')
      queryClient.invalidateQueries({ queryKey: ['transfer', id] })
    } catch (err: any) {
      message.error('Lỗi: ' + (err.message || ''))
    }
  }

  const lossOk = transfer.loss_pct == null || transfer.loss_pct <= (transfer.loss_threshold_pct || 0.5)

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <Space style={{ marginBottom: 16 }} size={12}>
        {!propId && <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/transfer')} />}
        <Title level={4} style={{ margin: 0, color: PRIMARY }}>
          🔀 Phiếu chuyển <Text code>{transfer.code}</Text>
        </Title>
        <Tag color={STATUS_COLORS[transfer.status]} style={{ fontSize: 13, padding: '2px 8px' }}>
          {STATUS_LABELS[transfer.status]}
        </Tag>
        {transfer.needs_approval && transfer.status === 'arrived' && (
          <Tag color="red" icon={<WarningOutlined />}>Cần BGD duyệt</Tag>
        )}
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
      </Space>

      {/* Timeline 5 bước */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
        <Steps
          current={currentStep}
          status={stepStatus as any}
          size="small"
          items={[
            { title: 'Tạo phiếu', description: formatDateTime(transfer.created_at) },
            { title: 'Lấy hàng', description: transfer.picked_at ? formatDateTime(transfer.picked_at) : '—' },
            { title: 'Cân xuất', description: transfer.shipped_at ? formatDateTime(transfer.shipped_at) : '—' },
            { title: 'Cân nhận', description: transfer.arrived_at ? formatDateTime(transfer.arrived_at) : '—' },
            { title: 'Hoàn tất', description: transfer.received_at ? formatDateTime(transfer.received_at) : '—' },
          ]}
        />
      </Card>

      {/* Cảnh báo hao hụt */}
      {transfer.needs_approval && transfer.status === 'arrived' && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 16 }}
          message={`Hao hụt ${transfer.loss_pct?.toFixed(2)}% vượt ngưỡng ${transfer.loss_threshold_pct}% — cần BGD duyệt`}
          description={
            <Space>
              <Text>Cân xuất: <Text strong>{transfer.weight_out_kg?.toLocaleString('vi-VN')} kg</Text></Text>
              <Text>→ Cân nhận: <Text strong>{transfer.weight_in_kg?.toLocaleString('vi-VN')} kg</Text></Text>
              <Text>Hao hụt: <Text strong type="danger">{transfer.loss_kg?.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg</Text></Text>
            </Space>
          }
          action={
            <Space>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => setApproveOpen(true)}>Duyệt</Button>
              <Button danger icon={<CloseCircleOutlined />} onClick={() => setRejectOpen(true)}>Từ chối</Button>
            </Space>
          }
        />
      )}

      {/* Stats trọng lượng */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic
              title="Cân xuất"
              value={transfer.weight_out_kg || 0}
              precision={1}
              suffix="kg"
              valueStyle={{ fontSize: 18, color: PRIMARY }}
              formatter={(v) => Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic
              title="Cân nhận"
              value={transfer.weight_in_kg || 0}
              precision={1}
              suffix="kg"
              valueStyle={{ fontSize: 18, color: '#1890ff' }}
              formatter={(v) => Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic
              title="Hao hụt"
              value={transfer.loss_kg || 0}
              precision={1}
              suffix="kg"
              valueStyle={{ fontSize: 18, color: lossOk ? '#52c41a' : '#ff4d4f' }}
              formatter={(v) => Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic
              title="Hao hụt %"
              value={transfer.loss_pct || 0}
              precision={2}
              suffix="%"
              valueStyle={{ fontSize: 18, color: lossOk ? '#52c41a' : '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Info chính */}
      <Card title="📋 Thông tin phiếu" size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
        <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} labelStyle={{ fontWeight: 600 }}>
          <Descriptions.Item label="Từ NM">
            <Tag color="blue">{transfer.from_facility?.code}</Tag> {transfer.from_facility?.name}
          </Descriptions.Item>
          <Descriptions.Item label="Kho gửi">{transfer.from_warehouse?.name}</Descriptions.Item>
          <Descriptions.Item label="Đến NM">
            <Tag color="green">{transfer.to_facility?.code}</Tag> {transfer.to_facility?.name}
          </Descriptions.Item>
          <Descriptions.Item label="Kho nhận">{transfer.to_warehouse?.name}</Descriptions.Item>
          <Descriptions.Item label="Biển số">{transfer.vehicle_plate || '—'}</Descriptions.Item>
          <Descriptions.Item label="Tài xế">
            {transfer.driver_name || '—'}
            {transfer.driver_phone && <Text type="secondary"> • {transfer.driver_phone}</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="Ngưỡng hao hụt">{transfer.loss_threshold_pct}%</Descriptions.Item>
          <Descriptions.Item label="Phiếu xuất">{transfer.stock_out_order_id ? <Text code>{transfer.stock_out_order_id.slice(0, 8)}</Text> : '—'}</Descriptions.Item>
          <Descriptions.Item label="Phiếu nhập">{transfer.stock_in_order_id ? <Text code>{transfer.stock_in_order_id.slice(0, 8)}</Text> : '—'}</Descriptions.Item>
          <Descriptions.Item label="Ghi chú" span={3}>{transfer.notes || '—'}</Descriptions.Item>
          {transfer.approved_at && (
            <Descriptions.Item label="Duyệt" span={3}>
              <Text type="secondary">{formatDateTime(transfer.approved_at)}</Text>
              {transfer.approval_note && <div><Text>{transfer.approval_note}</Text></div>}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Items */}
      <Card title={`📦 Hàng chuyển (${transfer.items?.length || 0} batch)`} size="small" style={{ marginBottom: 16, borderRadius: 10 }}>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={transfer.items || []}
          columns={[
            { title: 'Vật liệu', dataIndex: ['material', 'name'], render: (_, r: any) => r.material?.name || '—' },
            {
              title: 'Grade',
              dataIndex: ['source_batch', 'rubber_grade'],
              width: 90,
              render: (_, r: any) => <GradeBadge grade={(r.source_batch?.rubber_grade as RubberGrade) || null} size="small" />,
            },
            { title: 'Batch nguồn', dataIndex: ['source_batch', 'batch_no'], width: 140, render: (_, r: any) => r.source_batch?.batch_no ? <Text code>{r.source_batch.batch_no}</Text> : '—' },
            {
              title: 'Dự kiến',
              dataIndex: 'quantity_planned',
              width: 100,
              align: 'right',
              render: (v, r: any) => (
                <Space direction="vertical" size={0}>
                  <Text>{v?.toLocaleString('vi-VN') || 0}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{r.weight_planned_kg?.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg</Text>
                </Space>
              ),
            },
            {
              title: 'Thực nhận',
              dataIndex: 'quantity_received',
              width: 100,
              align: 'right',
              render: (v, r: any) => v != null ? (
                <Space direction="vertical" size={0}>
                  <Text strong>{v.toLocaleString('vi-VN')}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{r.weight_received_kg?.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg</Text>
                </Space>
              ) : '—',
            },
            {
              title: 'Batch nhận',
              dataIndex: ['destination_batch_id'],
              width: 110,
              render: (v) => v ? <Text code>{v.slice(0, 8)}</Text> : '—',
            },
          ]}
        />
      </Card>

      {/* Actions */}
      <div style={{ textAlign: 'right' }}>
        <Space>
          {transfer.status === 'in_transit' && (
            <Button type="primary" icon={<CarOutlined />} onClick={handleMarkArrived}>
              Đánh dấu xe đã đến
            </Button>
          )}
          {(['draft', 'picking', 'picked'] as TransferStatus[]).includes(transfer.status) && (
            <Button danger onClick={() => setCancelOpen(true)}>Hủy phiếu</Button>
          )}
        </Space>
      </div>

      {/* Modals */}
      <Modal
        title="Duyệt phiếu chuyển (hao hụt vượt ngưỡng)"
        open={approveOpen}
        onCancel={() => setApproveOpen(false)}
        onOk={handleApprove}
        okText="Duyệt + Hoàn tất"
        cancelText="Đóng"
      >
        <Text>Hao hụt {transfer.loss_pct?.toFixed(2)}% — vượt ngưỡng {transfer.loss_threshold_pct}%.</Text>
        <Input.TextArea
          rows={3}
          placeholder="Ghi chú duyệt (lý do chấp nhận hao hụt...)"
          value={approveNote}
          onChange={(e) => setApproveNote(e.target.value)}
          style={{ marginTop: 12 }}
        />
      </Modal>

      <Modal
        title="Từ chối phiếu chuyển"
        open={rejectOpen}
        onCancel={() => setRejectOpen(false)}
        onOk={handleReject}
        okText="Từ chối"
        okButtonProps={{ danger: true }}
        cancelText="Đóng"
      >
        <Text type="warning">⚠️ Hàng sẽ KHÔNG được nhập vào kho nhận. Cần điều tra hao hụt.</Text>
        <Input.TextArea
          rows={3}
          placeholder="Lý do từ chối (bắt buộc)..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          style={{ marginTop: 12 }}
        />
      </Modal>

      <Modal
        title="Hủy phiếu chuyển"
        open={cancelOpen}
        onCancel={() => setCancelOpen(false)}
        onOk={handleCancel}
        okText="Hủy phiếu"
        okButtonProps={{ danger: true }}
        cancelText="Đóng"
      >
        <Input.TextArea
          rows={2}
          placeholder="Lý do hủy (tùy chọn)"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
        />
      </Modal>
    </div>
  )
}
