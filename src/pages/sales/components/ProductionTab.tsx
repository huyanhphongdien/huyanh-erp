// ============================================================================
// PRODUCTION TAB — Tab Sản xuất trong Detail Panel v4
// File: src/pages/sales/components/ProductionTab.tsx
// BP Sản xuất nhập: ready_date, quản lý container, theo dõi tiến độ
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Row,
  Col,
  Tag,
  Button,
  Space,
  Table,
  Progress,
  Steps,
  DatePicker,
  InputNumber,
  Input,
  Form,
  Popconfirm,
  Descriptions,
  Spin,
  Empty,
  Alert,
  message,
} from 'antd'
import { useNavigate } from 'react-router-dom'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  LinkOutlined,
  DeleteOutlined,
  EditOutlined,
  ThunderboltOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { salesOrderService } from '../../../services/sales/salesOrderService'
import { salesProductionService, type ProductionProgress } from '../../../services/sales/salesProductionService'
import { containerService } from '../../../services/sales/containerService'
import type { ContainerSummary } from '../../../services/sales/containerService'
import type { SalesOrder, SalesOrderContainer, ContainerStatus } from '../../../services/sales/salesTypes'
import { CONTAINER_TYPE_LABELS } from '../../../services/sales/salesTypes'
import type { SalesRole } from '../../../services/sales/salesPermissionService'
import OrderActionButtons from './OrderActionButtons'
import StockPickerSection from './StockPickerSection'

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTAINER_STATUS_LABELS: Record<string, string> = {
  planning: 'Lên kế hoạch',
  packing: 'Đang đóng',
  sealed: 'Đã seal',
  shipped: 'Đã xuất',
}

const CONTAINER_STATUS_COLORS: Record<string, string> = {
  planning: 'default',
  packing: 'processing',
  sealed: 'success',
  shipped: 'blue',
}

// ============================================================================
// TYPES
// ============================================================================

interface Props {
  order: SalesOrder
  salesRole: SalesRole | null
  editable: boolean
  onSaved: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ProductionTab({ order, salesRole, editable, onSaved }: Props) {
  const navigate = useNavigate()
  const [productionProgress, setProductionProgress] = useState<ProductionProgress | null>(null)
  const [progressLoading, setProgressLoading] = useState(false)
  const [containers, setContainers] = useState<SalesOrderContainer[]>([])
  const [containerSummary, setContainerSummary] = useState<ContainerSummary | null>(null)
  const [containersLoading, setContainersLoading] = useState(false)
  const [readyDate, setReadyDate] = useState<dayjs.Dayjs | null>(
    order.ready_date ? dayjs(order.ready_date) : null,
  )
  const [savingReadyDate, setSavingReadyDate] = useState(false)
  const [addingContainer, setAddingContainer] = useState(false)
  const [editingContainerId, setEditingContainerId] = useState<string | null>(null)
  const [form] = Form.useForm()

  const canEdit = editable && (salesRole === 'production' || salesRole === 'admin')

  // ── Load production progress ──
  const loadProgress = useCallback(async () => {
    if (!order.production_order_id) return
    setProgressLoading(true)
    try {
      const data = await salesProductionService.getProductionProgress(order.id)
      setProductionProgress(data)
    } catch {
      // silent — may not have production order
    } finally {
      setProgressLoading(false)
    }
  }, [order.id, order.production_order_id])

  // ── Load containers ──
  const loadContainers = useCallback(async () => {
    setContainersLoading(true)
    try {
      const [ctrs, summary] = await Promise.all([
        containerService.getContainers(order.id),
        containerService.getContainerSummary(order.id),
      ])
      setContainers(ctrs)
      setContainerSummary(summary)
    } catch {
      // silent
    } finally {
      setContainersLoading(false)
    }
  }, [order.id])

  useEffect(() => {
    loadProgress()
    loadContainers()
  }, [loadProgress, loadContainers])

  // Auto-fill Bành + KL inline form = phần CÒN LẠI chưa assign vào container nào
  // Re-compute khi containers thay đổi (thêm/xóa container)
  useEffect(() => {
    const totalBales = order.total_bales || 0
    const balesAssigned = containers.reduce((s, c) => s + (c.bale_count || 0), 0)
    const balesRemaining = Math.max(0, totalBales - balesAssigned)
    const balesPerCont = order.bales_per_container || totalBales || 0
    const autoFillBales = balesRemaining > 0 ? Math.min(balesPerCont, balesRemaining) : 0
    const wpu = order.bale_weight_kg || (order.quantity_kg && totalBales ? order.quantity_kg / totalBales : 35)
    const autoFillKg = Math.round(autoFillBales * wpu * 100) / 100
    form.setFieldsValue({
      container_no: undefined,
      seal_no: undefined,
      bale_count: autoFillBales > 0 ? autoFillBales : undefined,
      net_weight_kg: autoFillKg > 0 ? autoFillKg : undefined,
    })
  }, [containers, order, form])

  // ── Save ready date ──
  const handleSaveReadyDate = async () => {
    setSavingReadyDate(true)
    try {
      await salesOrderService.updateFields(order.id, {
        ready_date: readyDate?.format('YYYY-MM-DD') || null,
      } as any)
      message.success('Đã cập nhật ngày sẵn sàng')
      onSaved()
    } catch (e: any) {
      message.error(e.message)
    } finally {
      setSavingReadyDate(false)
    }
  }

  // ── Add container ──
  const handleAddContainer = async () => {
    try {
      const vals = await form.validateFields()
      setAddingContainer(true)
      await salesOrderService.addContainer(order.id, {
        container_no: vals.container_no || null,
        seal_no: vals.seal_no || null,
        container_type: order.container_type || '20ft',
        bale_count: vals.bale_count || null,
        net_weight_kg: vals.net_weight_kg || null,
      })
      message.success('Đã thêm container')
      form.resetFields()
      loadContainers()
      onSaved()
    } catch (e: any) {
      if (e.errorFields) return
      message.error(e.message)
    } finally {
      setAddingContainer(false)
    }
  }

  // ── Update container inline ──
  const handleUpdateContainer = async (container: SalesOrderContainer, vals: any) => {
    try {
      await containerService.updateContainer(container.id, vals)
      message.success('Đã cập nhật container')
      // KHÔNG setEditingContainerId(null) — giữ edit mode để user sửa tiếp
      // field khác (vd seal_no sau container_no). User tự thoát bằng click ✏️.
      loadContainers()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  // ── Delete container ──
  const handleDeleteContainer = async (id: string) => {
    try {
      await containerService.deleteContainer(id)
      message.success('Đã xóa container')
      loadContainers()
      onSaved()
    } catch (e: any) {
      message.error(e.message)
    }
  }

  // ── Computed ──
  const totalBales = order.total_bales || 0
  const containerCount = order.container_count || 0
  const balesPerContainer = order.bales_per_container || 576

  // ═══════════════════════════════��══════════════════════════════
  // PRODUCTION PROGRESS SECTION
  // ══════════════════════════════════════════════════════════════

  const renderProductionProgress = () => {
    if (!order.production_order_id) {
      // Cho phép tạo Lệnh SX ở 2 status:
      //  - confirmed: chưa start sản xuất, đang xếp hàng đợi
      //  - producing: đã chuyển status nhưng chưa có Lệnh SX (vd user revert
      //    từ packing về producing để cấp lại NVL/làm lại lô mới)
      const canCreate = ['confirmed', 'producing'].includes(order.status) &&
        (salesRole === 'production' || salesRole === 'admin')
      return (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có lệnh sản xuất"
          />
          {canCreate && (
            <Alert
              type="info"
              showIcon
              icon={<ThunderboltOutlined />}
              style={{ marginTop: 12 }}
              message="Tạo lệnh sản xuất cho đơn này"
              description="Tạo lệnh SX cần chọn các lô NVL (batch) trong kho. Mở trang chi tiết đầy đủ để check NVL và tạo lệnh."
              action={
                <Button
                  type="primary"
                  icon={<ArrowRightOutlined />}
                  onClick={() => navigate(`/sales/orders/${order.id}?tab=production`)}
                  style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
                >
                  Mở trang chi tiết
                </Button>
              }
            />
          )}
        </Card>
      )
    }

    if (progressLoading) {
      return (
        <Card size="small" style={{ marginBottom: 16 }}>
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        </Card>
      )
    }

    if (!productionProgress) return null

    const po = productionProgress.production_order
    const stages = productionProgress.stages || []
    const progress = productionProgress.overall_progress || 0
    const isCompleted = productionProgress.is_completed || false
    const currentIdx = stages.findIndex(s => s.status === 'in_progress')

    const getStepStatus = (status: string): 'wait' | 'process' | 'finish' | 'error' => {
      switch (status) {
        case 'completed': return 'finish'
        case 'in_progress': return 'process'
        case 'failed': return 'error'
        default: return 'wait'
      }
    }

    return (
      <Card
        size="small"
        title="Tiến độ sản xuất"
        style={{ marginBottom: 16 }}
        extra={
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => window.open(`/wms/production/${order.production_order_id}`, '_blank')}
          >
            Xem lệnh SX
          </Button>
        }
      >
        {/* Stats row */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <div style={{ fontSize: 11, color: '#999' }}>Mã lệnh SX</div>
            <div style={{ fontWeight: 600, color: '#1B4D3E' }}>{po?.code || '—'}</div>
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 11, color: '#999' }}>SL mục tiêu</div>
            <div style={{ fontWeight: 600 }}>{((po?.target_quantity || order.quantity_kg || 0) / 1000).toFixed(1)} tấn</div>
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 11, color: '#999' }}>Trạng thái</div>
            <Tag color={isCompleted ? 'green' : po?.status === 'in_progress' ? 'orange' : 'default'}>
              {isCompleted ? 'Hoàn thành' : po?.status === 'in_progress' ? 'Đang SX' : po?.status || 'Nháp'}
            </Tag>
          </Col>
          <Col span={6}>
            <div style={{ fontSize: 11, color: '#999' }}>Tiến độ</div>
            <Progress percent={progress} size="small" status={isCompleted ? 'success' : 'active'} strokeColor="#1B4D3E" />
          </Col>
        </Row>

        {/* 5-stage progress */}
        <Steps
          current={currentIdx >= 0 ? currentIdx : (isCompleted ? stages.length : 0)}
          size="small"
          items={stages.map((stage) => ({
            title: stage.name,
            status: getStepStatus(stage.status),
            description: stage.completed_at
              ? dayjs(stage.completed_at).format('DD/MM')
              : stage.started_at
              ? `Bắt đầu ${dayjs(stage.started_at).format('DD/MM')}`
              : undefined,
          }))}
        />

        {/* Completion badge */}
        {isCompleted && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Tag icon={<CheckCircleOutlined />} color="success" style={{ fontSize: 13, padding: '4px 12px' }}>
              Sản xuất hoàn thành — Sẵn sàng đóng gói
            </Tag>
          </div>
        )}
      </Card>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // READY DATE + ORDER INFO
  // ══════════════════════════════════════════════════════════════

  const renderReadyDate = () => (
    <Card size="small" title="Thông tin sản xuất" style={{ marginBottom: 16 }}>
      <Descriptions column={2} size="small" bordered>
        <Descriptions.Item label="Grade"><Tag color="green">{order.grade}</Tag></Descriptions.Item>
        <Descriptions.Item label="Số lượng">{order.quantity_tons} tấn ({(order.quantity_kg || order.quantity_tons * 1000).toLocaleString()} kg)</Descriptions.Item>
        <Descriptions.Item label="Tổng bành">{totalBales}</Descriptions.Item>
        <Descriptions.Item label="Bành/container">{balesPerContainer}</Descriptions.Item>
        <Descriptions.Item label="Container cần">{containerCount} x {order.container_type || '20ft'}</Descriptions.Item>
        <Descriptions.Item label="KL bành">{order.bale_weight_kg || 33.33} kg</Descriptions.Item>
        <Descriptions.Item label="Ngày sẵn sàng" span={2}>
          {canEdit ? (
            <Space>
              <DatePicker
                value={readyDate}
                onChange={setReadyDate}
                format="DD/MM/YYYY"
                placeholder="Chọn ngày..."
                size="small"
              />
              <Button
                type="primary"
                size="small"
                icon={<SaveOutlined />}
                loading={savingReadyDate}
                onClick={handleSaveReadyDate}
                disabled={
                  readyDate?.format('YYYY-MM-DD') === order.ready_date ||
                  (!readyDate && !order.ready_date)
                }
                style={{ background: '#1677ff' }}
              >
                Lưu
              </Button>
            </Space>
          ) : (
            <span>{order.ready_date ? dayjs(order.ready_date).format('DD/MM/YYYY') : '—'}</span>
          )}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  )

  // ══════════════════════════════════════════════════════════════
  // CONTAINERS TABLE
  // ══════════════════════════════════════════════════════════════

  const containerColumns: ColumnsType<SalesOrderContainer> = [
    {
      title: '#',
      key: 'index',
      width: 40,
      render: (_, __, idx) => idx + 1,
    },
    {
      title: 'Container No.',
      dataIndex: 'container_no',
      key: 'container_no',
      width: 140,
      render: (v, record) => {
        if (editingContainerId === record.id) {
          return (
            <Input
              size="small"
              defaultValue={v}
              placeholder="ABCU1234567"
              onBlur={(e) => handleUpdateContainer(record, { container_no: e.target.value })}
              onPressEnter={(e) => handleUpdateContainer(record, { container_no: (e.target as any).value })}
              autoFocus
            />
          )
        }
        return v || <span style={{ color: '#ccc' }}>—</span>
      },
    },
    {
      title: 'Seal No.',
      dataIndex: 'seal_no',
      key: 'seal_no',
      width: 120,
      render: (v, record) => {
        if (editingContainerId === record.id) {
          return (
            <Input
              size="small"
              defaultValue={v}
              onBlur={(e) => handleUpdateContainer(record, { seal_no: e.target.value })}
              onPressEnter={(e) => handleUpdateContainer(record, { seal_no: (e.target as any).value })}
            />
          )
        }
        return v || <span style={{ color: '#ccc' }}>—</span>
      },
    },
    {
      title: 'Bành',
      dataIndex: 'bale_count',
      key: 'bale_count',
      width: 70,
      align: 'right',
      render: (v) => v ?? '—',
    },
    {
      title: 'KL (kg)',
      dataIndex: 'net_weight_kg',
      key: 'net_weight_kg',
      width: 90,
      align: 'right',
      render: (v) => v ? v.toLocaleString() : '—',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: ContainerStatus) => (
        <Tag color={CONTAINER_STATUS_COLORS[s]}>{CONTAINER_STATUS_LABELS[s] || s}</Tag>
      ),
    },
    ...(canEdit ? [{
      title: '',
      key: 'actions',
      width: 70,
      render: (_: unknown, record: SalesOrderContainer) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => setEditingContainerId(editingContainerId === record.id ? null : record.id)}
          />
          <Popconfirm title="Xóa container?" onConfirm={() => handleDeleteContainer(record.id)}>
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ]

  const renderContainers = () => (
    <Card
      size="small"
      title={
        <Space>
          <span>Container</span>
          {containerSummary && (
            <Tag>{containerSummary.total_containers} / {containerCount}</Tag>
          )}
          {containerSummary && containerSummary.sealed > 0 && (
            <Tag color="green">{containerSummary.sealed} sealed</Tag>
          )}
        </Space>
      }
      extra={
        canEdit && (
          <Space>
            <Popconfirm
              title="Tạo container tự động?"
              description={`Sẽ tạo ${containerCount} container theo đơn hàng`}
              onConfirm={async () => {
                try {
                  await containerService.autoCreateContainers(order.id)
                  message.success('Đã tạo container tự động')
                  loadContainers()
                  onSaved()
                } catch (e: any) {
                  message.error(e.message)
                }
              }}
            >
              <Button size="small" type="dashed">Tạo tự động</Button>
            </Popconfirm>
          </Space>
        )
      }
    >
      <Table
        rowKey="id"
        columns={containerColumns as any}
        dataSource={containers}
        loading={containersLoading}
        size="small"
        pagination={false}
        scroll={{ x: 600 }}
        locale={{ emptyText: 'Chưa có container' }}
      />

      {/* Add container form — Bành + KL auto-fill = phần CÒN LẠI chưa assign */}
      {canEdit && (
        <Form
          form={form}
          layout="inline"
          size="small"
          style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}
        >
          <Form.Item name="container_no">
            <Input placeholder="Container No." style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="seal_no">
            <Input placeholder="Seal No." style={{ width: 120 }} />
          </Form.Item>
          <Form.Item name="bale_count">
            <InputNumber placeholder="Bành" min={0} style={{ width: 80 }} />
          </Form.Item>
          <Form.Item name="net_weight_kg">
            <InputNumber placeholder="KL (kg)" min={0} style={{ width: 100 }} />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={addingContainer}
              onClick={handleAddContainer}
              style={{ background: '#1677ff' }}
            >
              Thêm
            </Button>
          </Form.Item>
        </Form>
      )}
    </Card>
  )

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  // Hiển thị StockPickerSection (MTS flow) khi:
  //  - Đơn ở status confirmed/producing/ready
  //  - Đơn KHÔNG có production_order_id (nếu đã có Lệnh SX → đi flow MTO)
  //  - Role production hoặc admin
  const showStockPicker =
    order.status &&
    ['confirmed', 'producing', 'ready'].includes(order.status) &&
    !order.production_order_id &&
    (salesRole === 'production' || salesRole === 'admin')

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <OrderActionButtons order={order} salesRole={salesRole} onSaved={onSaved} tab="production" size="small" />
      </div>
      {showStockPicker && (
        <StockPickerSection
          order={order}
          canEdit={editable && (salesRole === 'production' || salesRole === 'admin')}
          onSaved={onSaved}
        />
      )}
      {renderProductionProgress()}
      {renderReadyDate()}
      {renderContainers()}
    </div>
  )
}
