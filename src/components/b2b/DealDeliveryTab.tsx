// ============================================================================
// DEAL DELIVERY TAB — Thông tin giao hàng cho 1 Deal
// File: src/components/b2b/DealDeliveryTab.tsx
//
// Nhà máy (admin) khai báo trước các xe dự kiến chở hàng cho Deal này.
// Khi xe đến cân, weighbridge match theo biển số → auto-fill actual_kg.
// Tab hiển thị bảng so sánh KL khai báo vs KL thực cân + highlight chênh lệch.
// ============================================================================

import { useEffect, useState } from 'react'
import {
  Button, Card, Table, Tag, Modal, Form, Input, InputNumber,
  Space, Typography, Popconfirm, message, Row, Col, Statistic, Tooltip,
} from 'antd'
import {
  PlusOutlined, CarOutlined, EditOutlined, DeleteOutlined,
  CheckCircleOutlined, ClockCircleOutlined, WarningOutlined,
} from '@ant-design/icons'
import {
  dealDeliveryPlanService,
  DELIVERY_PLAN_STATUS_LABELS,
  DELIVERY_PLAN_STATUS_COLORS,
  type DeliveryPlan,
  type DeliveryPlanStatus,
} from '../../services/b2b/dealDeliveryPlanService'
import { useAuthStore } from '../../stores/authStore'

const { Text } = Typography

interface DealDeliveryTabProps {
  dealId: string
  onTotalsChange?: (summary: {
    total_declared_kg: number
    total_actual_kg: number
    total_variance_kg: number
  }) => void
}

const VARIANCE_WARN_PCT = 5 // variance > 5% → warning color

const DealDeliveryTab = ({ dealId, onTotalsChange }: DealDeliveryTabProps) => {
  const { user } = useAuthStore()
  const [plans, setPlans] = useState<DeliveryPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<DeliveryPlan | null>(null)
  const [form] = Form.useForm()

  const load = async () => {
    try {
      setLoading(true)
      const data = await dealDeliveryPlanService.getByDeal(dealId)
      setPlans(data)
      if (onTotalsChange) {
        const s = dealDeliveryPlanService.summarize(data)
        onTotalsChange({
          total_declared_kg: s.total_declared_kg,
          total_actual_kg: s.total_actual_kg,
          total_variance_kg: s.total_variance_kg,
        })
      }
    } catch (e: any) {
      message.error(e?.message || 'Không tải được kế hoạch giao hàng')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [dealId])

  const openCreate = () => {
    setEditing(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (p: DeliveryPlan) => {
    setEditing(p)
    form.setFieldsValue({
      vehicle_plate: p.vehicle_plate,
      driver_name: p.driver_name,
      driver_phone: p.driver_phone,
      declared_tons: p.declared_kg ? p.declared_kg / 1000 : undefined,
      notes: p.notes,
    })
    setModalOpen(true)
  }

  const submit = async () => {
    try {
      const v = await form.validateFields()
      // UI input tấn → DB lưu kg
      const payload = {
        vehicle_plate: v.vehicle_plate,
        driver_name: v.driver_name,
        driver_phone: v.driver_phone,
        declared_kg: Number(v.declared_tons) * 1000,
        notes: v.notes,
      }
      if (editing) {
        await dealDeliveryPlanService.update(editing.id, payload)
        message.success('Đã cập nhật kế hoạch')
      } else {
        await dealDeliveryPlanService.create({
          deal_id: dealId,
          declared_by: user?.employee_id || undefined,
          ...payload,
        })
        message.success('Đã thêm xe dự kiến')
      }
      setModalOpen(false)
      await load()
    } catch (e: any) {
      if (!e?.errorFields) message.error(e?.message || 'Lỗi')
    }
  }

  const remove = async (id: string) => {
    try {
      await dealDeliveryPlanService.delete(id)
      message.success('Đã xóa')
      await load()
    } catch (e: any) {
      message.error(e?.message || 'Không xóa được')
    }
  }

  const setStatus = async (id: string, status: DeliveryPlanStatus) => {
    try {
      await dealDeliveryPlanService.setStatus(id, status)
      await load()
    } catch (e: any) {
      message.error(e?.message || 'Không đổi trạng thái')
    }
  }

  const summary = dealDeliveryPlanService.summarize(plans)

  const columns = [
    {
      title: 'Biển số',
      dataIndex: 'vehicle_plate',
      render: (v: string) => <Text code style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text>,
    },
    {
      title: 'Tài xế',
      dataIndex: 'driver_name',
      render: (v: string | null, row: DeliveryPlan) => (
        <div>
          <div>{v || '—'}</div>
          {row.driver_phone && (
            <Text type="secondary" style={{ fontSize: 11 }}>{row.driver_phone}</Text>
          )}
        </div>
      ),
    },
    {
      title: 'KL khai báo',
      dataIndex: 'declared_kg',
      align: 'right' as const,
      render: (v: number) => <Text strong>{(v / 1000).toFixed(2)} tấn</Text>,
    },
    {
      title: 'KL cân thực',
      dataIndex: 'actual_kg',
      align: 'right' as const,
      render: (v: number | null) => (
        v != null ? (
          <Text strong style={{ color: '#1B4D3E' }}>{(v / 1000).toFixed(2)} tấn</Text>
        ) : (
          <Text type="secondary" italic>Chưa cân</Text>
        )
      ),
    },
    {
      title: 'Chênh lệch',
      dataIndex: 'variance_kg',
      align: 'right' as const,
      render: (v: number | null, row: DeliveryPlan) => {
        if (v == null || row.status !== 'weighed') return <Text type="secondary">—</Text>
        const pct = row.declared_kg ? (v / row.declared_kg) * 100 : 0
        const abs = Math.abs(pct)
        const color = abs > VARIANCE_WARN_PCT ? '#ef4444' : abs > 2 ? '#f59e0b' : '#16a34a'
        const sign = v > 0 ? '+' : ''
        return (
          <Tooltip title={abs > VARIANCE_WARN_PCT ? 'Chênh lệch vượt ngưỡng 5% — kiểm tra' : ''}>
            <span style={{ color, fontWeight: 600 }}>
              {sign}{(v / 1000).toFixed(2)} tấn
              <Text style={{ color, fontSize: 11, marginLeft: 4 }}>
                ({sign}{pct.toFixed(1)}%)
              </Text>
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (s: DeliveryPlanStatus) => (
        <Tag color={DELIVERY_PLAN_STATUS_COLORS[s]}>{DELIVERY_PLAN_STATUS_LABELS[s]}</Tag>
      ),
    },
    {
      title: 'Hành động',
      render: (_: unknown, row: DeliveryPlan) => (
        <Space size={4}>
          {row.status === 'pending' && (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
              <Button
                size="small"
                icon={<WarningOutlined />}
                onClick={() => setStatus(row.id, 'no_show')}
                title="Đánh dấu không đến"
              />
              <Popconfirm title="Xóa kế hoạch này?" onConfirm={() => remove(row.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      {/* Summary stats */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Số xe kế hoạch"
              value={summary.total_plans}
              prefix={<CarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Đã cân / Chờ đến"
              value={summary.weighed_count}
              suffix={`/ ${summary.pending_count}`}
              prefix={<CheckCircleOutlined style={{ color: '#16a34a' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Tổng khai báo"
              value={(summary.total_declared_kg / 1000).toFixed(2)}
              suffix="tấn"
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic
              title="Chênh lệch (đã cân)"
              value={(summary.total_variance_kg / 1000).toFixed(2)}
              suffix="tấn"
              valueStyle={{
                color: Math.abs(summary.avg_variance_pct || 0) > VARIANCE_WARN_PCT
                  ? '#ef4444'
                  : '#1B4D3E',
              }}
              prefix={
                summary.avg_variance_pct != null && Math.abs(summary.avg_variance_pct) > VARIANCE_WARN_PCT
                  ? <WarningOutlined />
                  : <ClockCircleOutlined />
              }
            />
          </Card>
        </Col>
      </Row>

      {/* Action + table */}
      <Card
        title="Kế hoạch giao hàng"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Thêm xe dự kiến
          </Button>
        }
        style={{ borderRadius: 12 }}
      >
        <Table
          dataSource={plans}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          locale={{
            emptyText: (
              <div style={{ padding: 32 }}>
                <Text type="secondary">
                  Chưa có xe nào được khai báo. Bấm <b>"Thêm xe dự kiến"</b> khi đại lý báo xe chở hàng.
                </Text>
              </div>
            ),
          }}
        />
      </Card>

      {/* Modal tạo/sửa */}
      <Modal
        open={modalOpen}
        title={editing ? 'Sửa kế hoạch giao hàng' : 'Thêm xe dự kiến'}
        onCancel={() => setModalOpen(false)}
        onOk={submit}
        okText={editing ? 'Lưu' : 'Thêm'}
        cancelText="Hủy"
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="vehicle_plate"
            label="Biển số xe"
            rules={[{ required: true, message: 'Nhập biển số' }]}
          >
            <Input
              placeholder="VD: 43C-123.45"
              style={{ textTransform: 'uppercase' }}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="driver_name" label="Tài xế">
                <Input placeholder="Tên tài xế" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="driver_phone" label="SĐT tài xế">
                <Input placeholder="0905..." />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="declared_tons"
            label="Khối lượng khai báo (tấn)"
            rules={[{ required: true, message: 'Nhập KL' }, { type: 'number', min: 0.01, message: 'Tối thiểu 0.01 tấn' }]}
          >
            <InputNumber<number>
              style={{ width: '100%' }}
              min={0.01}
              step={0.1}
              precision={3}
              placeholder="VD: 60"
              addonAfter="tấn"
            />
          </Form.Item>
          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Ghi chú nếu có..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DealDeliveryTab
