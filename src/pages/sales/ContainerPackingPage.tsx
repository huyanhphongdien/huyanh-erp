// ============================================================================
// CONTAINER PACKING PAGE — Trang quản lý đóng gói container
// File: src/pages/sales/ContainerPackingPage.tsx
// Module Bán hàng quốc tế — Huy Anh Rubber ERP
// Primary color: #1B4D3E
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Row,
  Col,
  Button,
  Space,
  Typography,
  Statistic,
  Spin,
  Empty,
  Breadcrumb,
  Tag,
  Table,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Collapse,
  Popconfirm,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
  LockOutlined,
  ContainerOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import { salesOrderService } from '../../services/sales/salesOrderService'
import { containerService } from '../../services/sales/containerService'
import type { ContainerSummary } from '../../services/sales/containerService'
import type {
  SalesOrder,
  SalesOrderContainer,
  SalesOrderContainerItem,
  ContainerStatus,
} from '../../services/sales/salesTypes'
import {
  CONTAINER_STATUS_LABELS,
  CONTAINER_STATUS_COLORS,
  CONTAINER_TYPE_LABELS,
  SVR_GRADE_OPTIONS,
} from '../../services/sales/salesTypes'

const { Title, Text } = Typography

// ============================================================================
// HELPERS
// ============================================================================

const formatNumber = (v: number | null | undefined): string => {
  if (v == null) return '-'
  return v.toLocaleString('vi-VN')
}

// ============================================================================
// COMPONENT
// ============================================================================

function ContainerPackingPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()

  // State
  const [order, setOrder] = useState<SalesOrder | null>(null)
  const [containers, setContainers] = useState<SalesOrderContainer[]>([])
  const [summary, setSummary] = useState<ContainerSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Modals
  const [addContainerOpen, setAddContainerOpen] = useState(false)
  const [addContainerForm] = Form.useForm()

  const [sealModalOpen, setSealModalOpen] = useState(false)
  const [sealContainerId, setSealContainerId] = useState<string | null>(null)
  const [sealForm] = Form.useForm()

  const [addBalesModalOpen, setAddBalesModalOpen] = useState(false)
  const [addBalesContainerId, setAddBalesContainerId] = useState<string | null>(null)
  const [addBalesForm] = Form.useForm()
  const [availableBatches, setAvailableBatches] = useState<Array<{
    id: string
    batch_no: string
    grade: string
    drc: number
    total_bales: number
    total_weight_kg: number
    assigned_bales: number
    remaining_bales: number
  }>>([])

  // ── Load data ──
  const loadData = useCallback(async () => {
    if (!orderId) return
    try {
      setLoading(true)
      const [o, c, s] = await Promise.all([
        salesOrderService.getById(orderId),
        containerService.getContainers(orderId),
        containerService.getContainerSummary(orderId),
      ])
      setOrder(o)
      setContainers(c)
      setSummary(s)
    } catch (err) {
      console.error(err)
      message.error('Không thể tải dữ liệu đóng gói')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Load available batches ──
  const loadAvailableBatches = useCallback(async () => {
    if (!orderId) return
    try {
      const batches = await containerService.getAvailableBatches(orderId)
      setAvailableBatches(batches)
    } catch (err) {
      console.error(err)
    }
  }, [orderId])

  // ══════════════════════════════════════════════════════════════
  // HANDLERS
  // ══════════════════════════════════════════════════════════════

  const handleAutoCreateContainers = async () => {
    if (!orderId) return
    try {
      setActionLoading(true)
      await containerService.autoCreateContainers(orderId)
      message.success('Đã tạo container tự động')
      loadData()
    } catch (err: any) {
      message.error(err?.message || 'Không thể tạo container tự động')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAutoAssignBales = async () => {
    if (!orderId) return
    try {
      setActionLoading(true)
      await containerService.autoAssignBales(orderId)
      message.success('Đã phân bổ bành tự động vào các container')
      loadData()
    } catch (err: any) {
      message.error(err?.message || 'Không thể phân bổ bành tự động')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAddContainer = async () => {
    try {
      const vals = await addContainerForm.validateFields()
      if (!orderId) return
      await containerService.addContainer(orderId, vals)
      message.success('Đã thêm container')
      setAddContainerOpen(false)
      addContainerForm.resetFields()
      loadData()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || 'Không thể thêm container')
    }
  }

  const handleDeleteContainer = async (containerId: string) => {
    try {
      setActionLoading(true)
      await containerService.deleteContainer(containerId)
      message.success('Đã xóa container')
      loadData()
    } catch (err: any) {
      message.error(err?.message || 'Không thể xóa container')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSealContainer = async () => {
    if (!sealContainerId) return
    try {
      const vals = await sealForm.validateFields()
      await containerService.sealContainer(sealContainerId, vals.seal_no)
      message.success('Đã niêm phong container')
      setSealModalOpen(false)
      setSealContainerId(null)
      sealForm.resetFields()
      loadData()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || 'Không thể niêm phong container')
    }
  }

  const handleOpenAddBales = async (containerId: string) => {
    setAddBalesContainerId(containerId)
    setAddBalesModalOpen(true)
    await loadAvailableBatches()
  }

  const handleAddBales = async () => {
    if (!addBalesContainerId) return
    try {
      const vals = await addBalesForm.validateFields()

      // Tìm batch info
      const batch = availableBatches.find((b) => b.id === vals.batch_id)
      if (!batch) {
        message.error('Vui lòng chọn lô hàng')
        return
      }

      const baleFrom = vals.bale_from || 1
      const baleTo = vals.bale_to || vals.bale_count
      const baleCount = vals.bale_count || (baleTo - baleFrom + 1)
      const weightPerBale = batch.total_weight_kg / batch.total_bales
      const weight = Math.round(baleCount * weightPerBale)

      await containerService.addContainerItems(addBalesContainerId, [
        {
          batch_id: batch.id,
          batch_no: batch.batch_no,
          bale_from: baleFrom,
          bale_to: baleTo,
          bale_count: baleCount,
          weight_kg: weight,
          grade: batch.grade,
          drc: batch.drc,
        },
      ])

      message.success(`Đã thêm ${baleCount} bành vào container`)
      setAddBalesModalOpen(false)
      setAddBalesContainerId(null)
      addBalesForm.resetFields()
      loadData()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || 'Không thể thêm bành')
    }
  }

  const handleRemoveItem = async (itemId: string) => {
    try {
      await containerService.removeContainerItem(itemId)
      message.success('Đã xóa bành khỏi container')
      loadData()
    } catch (err: any) {
      message.error(err?.message || 'Không thể xóa bành')
    }
  }

  // ══════════════════════════════════════════════════════════════
  // LOADING / NOT FOUND
  // ══════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!order) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description="Không tìm thấy đơn hàng" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={() => navigate('/sales/orders')}>Quay lại danh sách</Button>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // DERIVED DATA
  // ══════════════════════════════════════════════════════════════

  const gradeLabel =
    SVR_GRADE_OPTIONS.find((g) => g.value === order.grade)?.label || order.grade
  const customerName = order.customer?.name || '-'

  // ══════════════════════════════════════════════════════════════
  // CONTAINER ITEM COLUMNS
  // ══════════════════════════════════════════════════════════════

  const itemColumns: ColumnsType<SalesOrderContainerItem> = [
    {
      title: 'Mã lô',
      dataIndex: 'batch_no',
      key: 'batch_no',
      render: (v) => <Text strong style={{ color: '#1B4D3E' }}>{v || '-'}</Text>,
    },
    {
      title: 'Bành',
      key: 'bale_range',
      render: (_: unknown, record) => {
        if (record.bale_from && record.bale_to) {
          return `${record.bale_from} - ${record.bale_to}`
        }
        return '-'
      },
    },
    {
      title: 'Số bành',
      dataIndex: 'bale_count',
      key: 'bale_count',
      align: 'right' as const,
      render: (v) => formatNumber(v),
    },
    {
      title: 'KL (kg)',
      dataIndex: 'weight_kg',
      key: 'weight_kg',
      align: 'right' as const,
      render: (v) => formatNumber(v),
    },
    {
      title: 'Cấp mủ',
      dataIndex: 'grade',
      key: 'grade',
      render: (v) => v ? <Tag color="blue">{v}</Tag> : '-',
    },
    {
      title: 'DRC (%)',
      dataIndex: 'drc',
      key: 'drc',
      align: 'right' as const,
      render: (v) => v ? `${v}%` : '-',
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: unknown, record) => (
        <Popconfirm
          title="Xóa bành này khỏi container?"
          onConfirm={() => handleRemoveItem(record.id)}
          okText="Xóa"
          cancelText="Hủy"
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  // ══════════════════════════════════════════════════════════════
  // AVAILABLE BATCHES COLUMNS
  // ══════════════════════════════════════════════════════════════

  const batchSelectOptions = availableBatches
    .filter((b) => b.remaining_bales > 0)
    .map((b) => ({
      value: b.id,
      label: `${b.batch_no} — ${b.grade} — Còn ${b.remaining_bales} bành (${formatNumber(b.total_weight_kg)} kg)`,
    }))

  // ══════════════════════════════════════════════════════════════
  // RENDER CONTAINER PANELS
  // ══════════════════════════════════════════════════════════════

  const containerPanels = containers.map((c, idx) => {
    const items = c.items || []
    const totalBales = items.reduce((sum, i) => sum + (i.bale_count || 0), 0)
    const totalWeight = items.reduce((sum, i) => sum + (i.weight_kg || 0), 0)

    const headerLabel = (
      <Space size="middle" wrap>
        <Text strong>Container #{idx + 1}</Text>
        {c.container_no && <Text type="secondary">{c.container_no}</Text>}
        {c.seal_no && (
          <Tag color="blue" icon={<LockOutlined />}>
            Seal: {c.seal_no}
          </Tag>
        )}
        <Tag color={CONTAINER_STATUS_COLORS[c.status as ContainerStatus]}>
          {CONTAINER_STATUS_LABELS[c.status as ContainerStatus]}
        </Tag>
        <Text type="secondary">
          Bành: {totalBales || c.bale_count || 0}
        </Text>
        <Text type="secondary">
          KL: {formatNumber(totalWeight || c.net_weight_kg || 0)} kg
        </Text>
        {c.container_type && (
          <Tag>{CONTAINER_TYPE_LABELS[c.container_type as keyof typeof CONTAINER_TYPE_LABELS]}</Tag>
        )}
      </Space>
    )

    return {
      key: c.id,
      label: headerLabel,
      children: (
        <div>
          {/* Items table */}
          {items.length > 0 ? (
            <Table
              dataSource={items}
              columns={itemColumns}
              rowKey="id"
              pagination={false}
              size="small"
              bordered
            />
          ) : (
            <Empty
              description="Chưa có bành nào trong container"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ padding: '16px 0' }}
            />
          )}

          {/* Footer actions */}
          <div
            style={{
              marginTop: 12,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Space>
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => handleOpenAddBales(c.id)}
              >
                Thêm bành
              </Button>
              {c.status !== 'sealed' && c.status !== 'shipped' && (
                <Button
                  size="small"
                  icon={<LockOutlined />}
                  style={{ color: '#1B4D3E', borderColor: '#1B4D3E' }}
                  onClick={() => {
                    setSealContainerId(c.id)
                    setSealModalOpen(true)
                  }}
                >
                  Seal container
                </Button>
              )}
            </Space>
            {c.status === 'planning' && (
              <Popconfirm
                title="Xóa container này?"
                description="Tất cả bành trong container sẽ bị xóa."
                onConfirm={() => handleDeleteContainer(c.id)}
                okText="Xóa"
                cancelText="Hủy"
              >
                <Button size="small" danger icon={<DeleteOutlined />}>
                  Xóa
                </Button>
              </Popconfirm>
            )}
          </div>
        </div>
      ),
    }
  })

  // ══════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: <a onClick={() => navigate('/sales/orders')}>Đơn hàng</a> },
          { title: <a onClick={() => navigate(`/sales/orders/${orderId}`)}>{order.code}</a> },
          { title: 'Đóng gói' },
        ]}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/sales/orders/${orderId}`)}
          />
          <Title level={4} style={{ margin: 0 }}>
            <ContainerOutlined style={{ marginRight: 8 }} />
            Đóng gói — {order.code}
          </Title>
        </Space>
      </div>

      {/* Order summary */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col xs={12} sm={6}>
            <Statistic
              title="Khách hàng"
              value={customerName}
              valueStyle={{ fontSize: 14 }}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Statistic
              title="Cấp mủ"
              value={gradeLabel}
              valueStyle={{ fontSize: 14, color: '#1890ff' }}
            />
          </Col>
          <Col xs={12} sm={4}>
            <Statistic
              title="Số lượng"
              value={order.quantity_tons}
              suffix="tấn"
              valueStyle={{ fontSize: 14 }}
            />
          </Col>
          <Col xs={12} sm={5}>
            <Statistic
              title="Tổng bành cần"
              value={order.total_bales || 0}
              suffix="bành"
              valueStyle={{ fontSize: 14, color: '#1B4D3E' }}
            />
          </Col>
          <Col xs={12} sm={5}>
            <Statistic
              title="KL bành"
              value={order.bale_weight_kg}
              suffix="kg"
              valueStyle={{ fontSize: 14 }}
            />
          </Col>
        </Row>
      </Card>

      {/* Container summary stats */}
      {summary && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={12} sm={4}>
              <Statistic
                title="Tổng container"
                value={summary.total_containers}
                valueStyle={{ color: '#1B4D3E' }}
              />
            </Col>
            <Col xs={12} sm={5}>
              <Statistic
                title="Đã đóng"
                value={summary.packed}
                suffix={`/ ${summary.total_containers}`}
                valueStyle={{ color: '#fa8c16' }}
              />
            </Col>
            <Col xs={12} sm={5}>
              <Statistic
                title="Đã seal"
                value={summary.sealed}
                suffix={`/ ${summary.total_containers}`}
                valueStyle={{ color: '#1890ff' }}
              />
            </Col>
            <Col xs={12} sm={5}>
              <Statistic
                title="Tổng bành"
                value={summary.total_bales}
                suffix={`/ ${order.total_bales || '?'}`}
                valueStyle={{
                  color: summary.total_bales >= (order.total_bales || 0)
                    ? '#52c41a'
                    : '#fa8c16',
                }}
              />
            </Col>
            <Col xs={12} sm={5}>
              <Statistic
                title="Tổng KL"
                value={summary.total_weight_kg}
                suffix="kg"
                valueStyle={{ color: '#1B4D3E' }}
                formatter={(v) => formatNumber(Number(v))}
              />
            </Col>
          </Row>
        </Card>
      )}

      {/* Actions bar */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={handleAutoCreateContainers}
            loading={actionLoading}
            style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
            disabled={containers.length > 0}
          >
            Tạo container tự động
          </Button>
          <Button
            icon={<InboxOutlined />}
            onClick={handleAutoAssignBales}
            loading={actionLoading}
            disabled={containers.length === 0}
            style={{ color: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Phân bổ bành tự động
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={() => setAddContainerOpen(true)}
          >
            Thêm container
          </Button>
        </Space>
      </Card>

      {/* Container list */}
      {containers.length > 0 ? (
        <Collapse
          items={containerPanels}
          defaultActiveKey={containers.map((c) => c.id)}
          style={{ marginBottom: 24 }}
        />
      ) : (
        <Card>
          <Empty
            description="Chưa có container nào"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={handleAutoCreateContainers}
              loading={actionLoading}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
            >
              Tạo container tự động
            </Button>
          </Empty>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* MODALS                                                    */}
      {/* ══════════════════════════════════════════════════════════ */}

      {/* Add container modal */}
      <Modal
        title="Thêm Container"
        open={addContainerOpen}
        onOk={handleAddContainer}
        onCancel={() => {
          setAddContainerOpen(false)
          addContainerForm.resetFields()
        }}
        okText="Thêm"
        cancelText="Hủy"
      >
        <Form form={addContainerForm} layout="vertical">
          <Form.Item label="Container No." name="container_no">
            <Input placeholder="Vd: MRKU1234567" />
          </Form.Item>
          <Form.Item
            label="Loại container"
            name="container_type"
            initialValue={order.container_type || '20ft'}
          >
            <Select
              options={Object.entries(CONTAINER_TYPE_LABELS).map(([v, l]) => ({
                value: v,
                label: l,
              }))}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="Số bành" name="bale_count">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="KL net (kg)" name="net_weight_kg">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="Ghi chú" name="notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Seal container modal */}
      <Modal
        title="Niêm phong Container"
        open={sealModalOpen}
        onOk={handleSealContainer}
        onCancel={() => {
          setSealModalOpen(false)
          setSealContainerId(null)
          sealForm.resetFields()
        }}
        okText="Niêm phong"
        cancelText="Hủy"
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
      >
        <Form form={sealForm} layout="vertical">
          <Form.Item
            label="Số Seal"
            name="seal_no"
            rules={[{ required: true, message: 'Vui lòng nhập số seal' }]}
          >
            <Input placeholder="Vd: SEAL123456" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add bales modal */}
      <Modal
        title="Thêm bành vào Container"
        open={addBalesModalOpen}
        onOk={handleAddBales}
        onCancel={() => {
          setAddBalesModalOpen(false)
          setAddBalesContainerId(null)
          addBalesForm.resetFields()
        }}
        okText="Thêm bành"
        cancelText="Hủy"
        width={600}
        okButtonProps={{ style: { background: '#1B4D3E', borderColor: '#1B4D3E' } }}
      >
        <Form form={addBalesForm} layout="vertical">
          <Form.Item
            label="Lô hàng"
            name="batch_id"
            rules={[{ required: true, message: 'Vui lòng chọn lô hàng' }]}
          >
            <Select
              placeholder="Chọn lô hàng..."
              options={batchSelectOptions}
              showSearch
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="Bành từ"
                name="bale_from"
                rules={[{ required: true, message: 'Nhập số' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Bành đến"
                name="bale_to"
                rules={[{ required: true, message: 'Nhập số' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Số bành"
                name="bale_count"
                rules={[{ required: true, message: 'Nhập số' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default ContainerPackingPage
