// ============================================================================
// SALES ORDER DETAIL PAGE — Chi tiet Don hang ban quoc te
// File: src/pages/sales/SalesOrderDetailPage.tsx
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Tabs,
  Descriptions,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Statistic,
  Spin,
  Empty,
  Breadcrumb,
  Timeline,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Popconfirm,
  message,
  Checkbox,
  Progress,
  Steps,
  Result,
  Alert,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  EditOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  ExperimentOutlined,
  ContainerOutlined,
  FileTextOutlined,
  ToolOutlined,
  TruckOutlined,
  DollarOutlined,
  FileDoneOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  LinkOutlined,
  LoadingOutlined,
} from '@ant-design/icons'
import { salesOrderService } from '../../services/sales/salesOrderService'
import { salesProductionService } from '../../services/sales/salesProductionService'
import type { NvlAvailability, ProductionProgress } from '../../services/sales/salesProductionService'
import { rubberGradeService } from '../../services/wms/rubberGradeService'
import type {
  SalesOrder,
  SalesOrderStatus,
  SalesOrderContainer,
  ContainerStatus,
} from '../../services/sales/salesTypes'
import type { RubberGradeStandard } from '../../services/wms/wms.types'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  INCOTERM_LABELS,
  PAYMENT_TERMS_LABELS,
  PACKING_TYPE_LABELS,
  PORT_OF_LOADING_OPTIONS,
  CONTAINER_TYPE_LABELS,
  CONTAINER_STATUS_LABELS,
  CONTAINER_STATUS_COLORS,
  SVR_GRADE_OPTIONS,
  COUNTRY_OPTIONS,
  CUSTOMER_TIER_LABELS,
  CUSTOMER_TIER_COLORS,
} from '../../services/sales/salesTypes'
import type { Incoterm, PaymentTerms, PackingType } from '../../services/sales/salesTypes'

const { Title, Text } = Typography

// ============================================================================
// HELPERS
// ============================================================================

const formatCurrency = (value: number | null | undefined, currency = 'USD'): string => {
  if (!value) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

const formatVND = (value: number | null | undefined): string => {
  if (!value) return '-'
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} ty`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} tr`
  return new Intl.NumberFormat('vi-VN').format(value) + ' d'
}

const formatDate = (d: string | null | undefined): string => {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('vi-VN')
}

// ============================================================================
// STATUS FLOW
// ============================================================================

const STATUS_FLOW: SalesOrderStatus[] = [
  'draft',
  'confirmed',
  'producing',
  'ready',
  'packing',
  'shipped',
  'delivered',
  'invoiced',
  'paid',
]

// ============================================================================
// COMPONENT
// ============================================================================

function SalesOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()

  const [order, setOrder] = useState<SalesOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [containers, setContainers] = useState<SalesOrderContainer[]>([])
  const [gradeStandard, setGradeStandard] = useState<RubberGradeStandard | null>(null)
  const [containerModalOpen, setContainerModalOpen] = useState(false)
  const [containerForm] = Form.useForm()

  // Production tab state
  const [nvlAvailability, setNvlAvailability] = useState<NvlAvailability | null>(null)
  const [nvlLoading, setNvlLoading] = useState(false)
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([])
  const [createProdLoading, setCreateProdLoading] = useState(false)
  const [productionProgress, setProductionProgress] = useState<ProductionProgress | null>(null)
  const [progressLoading, setProgressLoading] = useState(false)

  // ── Load data ──
  const loadOrder = useCallback(async () => {
    if (!orderId) return
    try {
      setLoading(true)
      const [o, c] = await Promise.all([
        salesOrderService.getById(orderId),
        salesOrderService.getContainers(orderId),
      ])
      setOrder(o)
      setContainers(c)
      if (o?.grade) {
        const std = await rubberGradeService.getByGrade(o.grade as any)
        setGradeStandard(std)
      }
    } catch (err) {
      console.error(err)
      message.error('Khong the tai thong tin don hang')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    loadOrder()
  }, [loadOrder])

  // ── Actions ──
  const handleStatusAction = async (newStatus: SalesOrderStatus) => {
    if (!order) return
    try {
      setActionLoading(true)
      if (newStatus === 'cancelled') {
        await salesOrderService.cancelOrder(order.id, 'Huy boi nguoi dung')
      } else {
        await salesOrderService.updateStatus(order.id, newStatus)
      }
      message.success(`Da cap nhat trang thai: ${ORDER_STATUS_LABELS[newStatus]}`)
      loadOrder()
    } catch (err: any) {
      message.error(err?.message || 'Khong the cap nhat trang thai')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAddContainer = async () => {
    if (!order) return
    try {
      const vals = await containerForm.validateFields()
      await salesOrderService.addContainer(order.id, vals)
      message.success('Da them container')
      setContainerModalOpen(false)
      containerForm.resetFields()
      loadOrder()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.message || 'Khong the them container')
    }
  }

  // ── Loading / not found ──
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
        <Empty description="Khong tim thay don hang" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={() => navigate('/sales/orders')}>Quay lai danh sach</Button>
        </div>
      </div>
    )
  }

  // ── Derived data ──
  const gradeLabel =
    SVR_GRADE_OPTIONS.find((g) => g.value === order.grade)?.label || order.grade
  const polLabel =
    PORT_OF_LOADING_OPTIONS.find((p) => p.value === order.port_of_loading)?.label ||
    order.port_of_loading ||
    '-'
  const customerName = order.customer?.name || '-'
  const customerCountry =
    COUNTRY_OPTIONS.find((c) => c.value === order.customer?.country)?.label ||
    order.customer?.country ||
    ''

  // ══════════════════════════════════════════════════════════════
  // ACTION BUTTONS
  // ══════════════════════════════════════════════════════════════

  const renderActionButtons = () => {
    const s = order.status
    const btns: React.ReactNode[] = []

    if (s === 'draft') {
      btns.push(
        <Popconfirm
          key="confirm"
          title="Xac nhan don hang?"
          onConfirm={() => handleStatusAction('confirmed')}
        >
          <Button type="primary" icon={<CheckCircleOutlined />} loading={actionLoading}>
            Xac nhan
          </Button>
        </Popconfirm>,
        <Button
          key="edit"
          icon={<EditOutlined />}
          onClick={() => navigate(`/sales/orders/${order.id}`)}
        >
          Sua
        </Button>,
        <Popconfirm
          key="cancel"
          title="Huy don hang?"
          onConfirm={() => handleStatusAction('cancelled')}
        >
          <Button danger icon={<CloseCircleOutlined />} loading={actionLoading}>
            Huy
          </Button>
        </Popconfirm>,
      )
    } else if (s === 'confirmed') {
      btns.push(
        <Button
          key="produce"
          style={{ background: '#fa8c16', borderColor: '#fa8c16', color: '#fff' }}
          icon={<ToolOutlined />}
          onClick={() => handleStatusAction('producing')}
          loading={actionLoading}
        >
          Tao lenh SX
        </Button>,
        <Popconfirm
          key="cancel"
          title="Huy don hang?"
          onConfirm={() => handleStatusAction('cancelled')}
        >
          <Button danger icon={<CloseCircleOutlined />} loading={actionLoading}>
            Huy
          </Button>
        </Popconfirm>,
      )
    } else if (s === 'producing') {
      btns.push(
        <Tag key="status" color="orange" style={{ fontSize: 14, padding: '4px 12px' }}>
          Dang san xuat...
        </Tag>,
      )
    } else if (s === 'ready') {
      btns.push(
        <Button
          key="pack"
          style={{ background: '#722ed1', borderColor: '#722ed1', color: '#fff' }}
          icon={<ContainerOutlined />}
          onClick={() => handleStatusAction('packing')}
          loading={actionLoading}
        >
          Dong goi
        </Button>,
      )
    } else if (s === 'packing') {
      btns.push(
        <Button
          key="ship"
          style={{ background: '#52c41a', borderColor: '#52c41a', color: '#fff' }}
          icon={<TruckOutlined />}
          onClick={() => handleStatusAction('shipped')}
          loading={actionLoading}
        >
          Xuat hang
        </Button>,
      )
    } else if (s === 'shipped') {
      btns.push(
        <Button
          key="deliver"
          type="primary"
          icon={<CheckCircleOutlined />}
          onClick={() => handleStatusAction('delivered')}
          loading={actionLoading}
        >
          Da giao
        </Button>,
      )
    } else if (s === 'delivered') {
      btns.push(
        <Button
          key="invoice"
          style={{ background: '#faad14', borderColor: '#faad14', color: '#fff' }}
          icon={<DollarOutlined />}
          onClick={() => handleStatusAction('invoiced')}
          loading={actionLoading}
        >
          Lap hoa don
        </Button>,
      )
    }

    return btns
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: THONG TIN
  // ══════════════════════════════════════════════════════════════

  const renderInfoTab = () => (
    <Row gutter={24}>
      <Col xs={24} lg={14}>
        <Card title="Thong tin don hang" size="small">
          <Descriptions bordered column={{ xs: 1, sm: 2 }} size="small">
            <Descriptions.Item label="Ma don">{order.code}</Descriptions.Item>
            <Descriptions.Item label="Trang thai">
              <Tag color={ORDER_STATUS_COLORS[order.status]}>
                {ORDER_STATUS_LABELS[order.status]}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Khach hang" span={2}>
              {customerName} {customerCountry ? `(${customerCountry})` : ''}
            </Descriptions.Item>
            <Descriptions.Item label="Grade">
              <Tag color="blue">{gradeLabel}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="PO# KH">{order.customer_po || '-'}</Descriptions.Item>
            <Descriptions.Item label="So luong">
              {order.quantity_tons} tan ({order.quantity_kg?.toLocaleString()} kg)
            </Descriptions.Item>
            <Descriptions.Item label="Don gia">
              {formatCurrency(order.unit_price, order.currency)} / tan
            </Descriptions.Item>
            <Descriptions.Item label="Gia tri USD">
              {formatCurrency(order.total_value_usd)}
            </Descriptions.Item>
            <Descriptions.Item label="Gia tri VND">{formatVND(order.total_value_vnd)}</Descriptions.Item>
            <Descriptions.Item label="Ty gia">
              {order.exchange_rate ? `${order.exchange_rate.toLocaleString()} VND/USD` : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Incoterm">
              {INCOTERM_LABELS[order.incoterm as Incoterm] || order.incoterm}
            </Descriptions.Item>
            <Descriptions.Item label="Cang xep hang">{polLabel}</Descriptions.Item>
            <Descriptions.Item label="Cang dich">
              {order.port_of_destination || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Loai container">
              {order.container_count || 0} x{' '}
              {CONTAINER_TYPE_LABELS[order.container_type as keyof typeof CONTAINER_TYPE_LABELS] ||
                order.container_type ||
                '20ft'}
            </Descriptions.Item>
            <Descriptions.Item label="Tong banh">{order.total_bales || '-'}</Descriptions.Item>
            <Descriptions.Item label="Dong goi">
              {PACKING_TYPE_LABELS[order.packing_type as PackingType] || order.packing_type}
              {order.shrink_wrap ? ' + Shrink wrap' : ''}
              {order.pallet_required ? ' + Pallet' : ''}
            </Descriptions.Item>
            <Descriptions.Item label="KL banh">{order.bale_weight_kg} kg</Descriptions.Item>
            <Descriptions.Item label="Thanh toan">
              {PAYMENT_TERMS_LABELS[order.payment_terms as PaymentTerms] ||
                order.payment_terms ||
                '-'}
            </Descriptions.Item>
            <Descriptions.Item label="So L/C">{order.lc_number || '-'}</Descriptions.Item>
            <Descriptions.Item label="NH L/C">{order.lc_bank || '-'}</Descriptions.Item>
            <Descriptions.Item label="Het han L/C">
              {formatDate(order.lc_expiry_date)}
            </Descriptions.Item>
            <Descriptions.Item label="Ngay dat">{formatDate(order.order_date)}</Descriptions.Item>
            <Descriptions.Item label="Ngay giao">
              {formatDate(order.delivery_date)}
            </Descriptions.Item>
            <Descriptions.Item label="ETD">{formatDate(order.etd)}</Descriptions.Item>
            <Descriptions.Item label="ETA">{formatDate(order.eta)}</Descriptions.Item>
            <Descriptions.Item label="Hang tau">{order.shipping_line || '-'}</Descriptions.Item>
            <Descriptions.Item label="Tau">{order.vessel_name || '-'}</Descriptions.Item>
            <Descriptions.Item label="Booking ref">
              {order.booking_reference || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Marking" span={2}>
              {order.marking_instructions || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Ghi chu" span={2}>
              {order.notes || '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>

      <Col xs={24} lg={10}>
        {/* Customer card */}
        {order.customer && (
          <Card
            size="small"
            title="Khach hang"
            style={{ marginBottom: 16 }}
            extra={
              <Button
                size="small"
                type="link"
                onClick={() => navigate(`/sales/customers/${order.customer!.id}`)}
              >
                Chi tiet
              </Button>
            }
          >
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Ma">{order.customer.code}</Descriptions.Item>
              <Descriptions.Item label="Ten">{order.customer.name}</Descriptions.Item>
              <Descriptions.Item label="Quoc gia">{customerCountry || '-'}</Descriptions.Item>
              <Descriptions.Item label="Hang">
                <Tag color={CUSTOMER_TIER_COLORS[order.customer.tier]}>
                  {CUSTOMER_TIER_LABELS[order.customer.tier]}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        )}

        {/* Quality specs card */}
        <Card size="small" title="Chi tieu ky thuat yeu cau">
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="DRC min">{order.drc_min ?? '-'} %</Descriptions.Item>
            <Descriptions.Item label="DRC max">{order.drc_max ?? '-'} %</Descriptions.Item>
            <Descriptions.Item label="Moisture">{order.moisture_max ?? '-'} %</Descriptions.Item>
            <Descriptions.Item label="Dirt">{order.dirt_max ?? '-'} %</Descriptions.Item>
            <Descriptions.Item label="Ash">{order.ash_max ?? '-'} %</Descriptions.Item>
            <Descriptions.Item label="Nitrogen">{order.nitrogen_max ?? '-'} %</Descriptions.Item>
            <Descriptions.Item label="Volatile">{order.volatile_max ?? '-'} %</Descriptions.Item>
            <Descriptions.Item label="PRI">{order.pri_min ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Mooney">{order.mooney_max ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Color">{order.color_lovibond_max ?? '-'}</Descriptions.Item>
          </Descriptions>
        </Card>
      </Col>
    </Row>
  )

  // ══════════════════════════════════════════════════════════════
  // TAB: CHAT LUONG
  // ══════════════════════════════════════════════════════════════

  const renderQualityTab = () => {
    interface QualityRow {
      key: string
      parameter: string
      unit: string
      required: number | null | undefined
      standard: number | null | undefined
      type: 'min' | 'max'
    }

    const rows: QualityRow[] = [
      { key: 'drc_min', parameter: 'DRC', unit: '%', required: order.drc_min, standard: gradeStandard?.drc_min, type: 'min' },
      { key: 'drc_max', parameter: 'DRC', unit: '%', required: order.drc_max, standard: gradeStandard?.drc_max, type: 'max' },
      { key: 'moisture', parameter: 'Moisture', unit: '%', required: order.moisture_max, standard: gradeStandard?.moisture_max, type: 'max' },
      { key: 'dirt', parameter: 'Dirt', unit: '%', required: order.dirt_max, standard: gradeStandard?.dirt_max, type: 'max' },
      { key: 'ash', parameter: 'Ash', unit: '%', required: order.ash_max, standard: gradeStandard?.ash_max, type: 'max' },
      { key: 'nitrogen', parameter: 'Nitrogen', unit: '%', required: order.nitrogen_max, standard: gradeStandard?.nitrogen_max, type: 'max' },
      { key: 'volatile', parameter: 'Volatile', unit: '%', required: order.volatile_max, standard: gradeStandard?.volatile_matter_max, type: 'max' },
      { key: 'pri', parameter: 'PRI', unit: '', required: order.pri_min, standard: gradeStandard?.pri_min, type: 'min' },
      { key: 'mooney', parameter: 'Mooney', unit: '', required: order.mooney_max, standard: gradeStandard?.mooney_max, type: 'max' },
      { key: 'color', parameter: 'Color Lovibond', unit: '', required: order.color_lovibond_max, standard: gradeStandard?.color_lovibond_max, type: 'max' },
    ]

    const columns: ColumnsType<QualityRow> = [
      { title: 'Chi tieu', dataIndex: 'parameter', key: 'parameter' },
      { title: 'Loai', dataIndex: 'type', key: 'type', render: (t) => t === 'min' ? 'Min' : 'Max' },
      {
        title: 'Yeu cau don hang',
        dataIndex: 'required',
        key: 'required',
        render: (v, row) => (v != null ? `${v} ${row.unit}` : '-'),
      },
      {
        title: `Tieu chuan ${gradeLabel}`,
        dataIndex: 'standard',
        key: 'standard',
        render: (v, row) => (v != null ? `${v} ${row.unit}` : '-'),
      },
      {
        title: 'Trang thai',
        key: 'status',
        render: (_: unknown, row: QualityRow) => {
          if (row.required == null || row.standard == null) return <Tag>N/A</Tag>
          const inSpec =
            row.type === 'min'
              ? row.required >= row.standard
              : row.required <= row.standard
          return inSpec ? (
            <Tag color="green">Dat</Tag>
          ) : (
            <Tag color="red">Khong dat</Tag>
          )
        },
      },
    ]

    return (
      <Card title="So sanh chi tieu ky thuat" size="small">
        <Table
          dataSource={rows}
          columns={columns}
          pagination={false}
          size="small"
          bordered
        />
      </Card>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: SAN XUAT
  // ══════════════════════════════════════════════════════════════

  // ── Production tab handlers ──
  const handleCheckNvl = async () => {
    if (!orderId) return
    try {
      setNvlLoading(true)
      const result = await salesProductionService.checkNvlAvailability(orderId)
      setNvlAvailability(result)
      setSelectedBatchIds(result.suitable_batches.map(b => b.batch_id))
    } catch (err: any) {
      message.error(err?.message || 'Không thể kiểm tra NVL')
    } finally {
      setNvlLoading(false)
    }
  }

  const handleCreateProduction = async () => {
    if (!orderId) return
    try {
      setCreateProdLoading(true)
      const prodOrder = await salesProductionService.createProductionFromSalesOrder(
        orderId,
        selectedBatchIds.length > 0 ? selectedBatchIds : undefined
      )
      message.success(`Đã tạo lệnh sản xuất: ${prodOrder.code}`)
      loadOrder()
    } catch (err: any) {
      message.error(err?.message || 'Không thể tạo lệnh sản xuất')
    } finally {
      setCreateProdLoading(false)
    }
  }

  const handleLoadProgress = async () => {
    if (!orderId) return
    try {
      setProgressLoading(true)
      const result = await salesProductionService.getProductionProgress(orderId)
      setProductionProgress(result)
    } catch (err: any) {
      message.error(err?.message || 'Không thể tải tiến độ sản xuất')
    } finally {
      setProgressLoading(false)
    }
  }

  const handleMarkReady = async () => {
    if (!order) return
    try {
      setActionLoading(true)
      await salesOrderService.updateStatus(order.id, 'ready')
      message.success('Đã chuyển trạng thái: Sẵn sàng giao hàng')
      loadOrder()
    } catch (err: any) {
      message.error(err?.message || 'Không thể cập nhật trạng thái')
    } finally {
      setActionLoading(false)
    }
  }

  const renderProductionTab = () => {
    // ── Case 1: Has production order ──
    if (order.production_order_id) {
      // Auto-load progress on first render
      if (!productionProgress && !progressLoading) {
        handleLoadProgress()
      }

      if (progressLoading) {
        return (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" tip="Đang tải tiến độ sản xuất..." />
          </div>
        )
      }

      const po = productionProgress?.production_order
      const stages = productionProgress?.stages || []
      const progress = productionProgress?.overall_progress || 0
      const isCompleted = productionProgress?.is_completed || false

      // Map stage status to Steps status
      const getStepStatus = (status: string): 'wait' | 'process' | 'finish' | 'error' => {
        switch (status) {
          case 'completed': return 'finish'
          case 'in_progress': return 'process'
          case 'failed': return 'error'
          default: return 'wait'
        }
      }

      // Find current step index
      const currentStepIdx = stages.findIndex(s => s.status === 'in_progress')

      return (
        <Row gutter={[16, 16]}>
          {/* Production info */}
          <Col xs={24}>
            <Card
              title="Lệnh sản xuất"
              size="small"
              extra={
                <Button
                  type="link"
                  icon={<LinkOutlined />}
                  onClick={() => navigate(`/wms/production/${order.production_order_id}`)}
                >
                  Xem chi tiết lệnh SX &rarr;
                </Button>
              }
            >
              <Row gutter={16}>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="Mã lệnh SX"
                    value={po?.code || order.production_order_id}
                    valueStyle={{ fontSize: 14, color: '#1B4D3E' }}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="Cấp mủ"
                    value={po?.target_grade || order.grade}
                    valueStyle={{ fontSize: 14, color: '#1890ff' }}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="SL mục tiêu"
                    value={po?.target_quantity || order.quantity_kg || 0}
                    suffix="kg"
                    valueStyle={{ fontSize: 14 }}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="Trạng thái SX"
                    value={
                      po?.status === 'completed' ? 'Hoàn thành' :
                      po?.status === 'in_progress' ? 'Đang SX' :
                      po?.status === 'cancelled' ? 'Đã hủy' :
                      po?.status || 'Nháp'
                    }
                    valueStyle={{
                      fontSize: 14,
                      color: po?.status === 'completed' ? '#52c41a' :
                             po?.status === 'in_progress' ? '#fa8c16' :
                             po?.status === 'cancelled' ? '#ff4d4f' : '#666',
                    }}
                  />
                </Col>
              </Row>
            </Card>
          </Col>

          {/* Progress bar */}
          <Col xs={24}>
            <Card title="Tiến độ tổng thể" size="small">
              <Progress
                percent={progress}
                status={isCompleted ? 'success' : 'active'}
                strokeColor={isCompleted ? '#52c41a' : '#1B4D3E'}
                style={{ marginBottom: 24 }}
              />

              {/* Stages timeline */}
              <Steps
                current={currentStepIdx >= 0 ? currentStepIdx : (isCompleted ? 5 : 0)}
                size="small"
                items={stages.map((stage) => ({
                  title: stage.name,
                  status: getStepStatus(stage.status),
                  description: stage.completed_at
                    ? `Xong: ${formatDate(stage.completed_at)}`
                    : stage.started_at
                    ? `Bắt đầu: ${formatDate(stage.started_at)}`
                    : undefined,
                }))}
              />
            </Card>
          </Col>

          {/* Completed state */}
          {isCompleted && (
            <Col xs={24}>
              <Result
                status="success"
                title="Sản xuất hoàn thành!"
                subTitle={`Lệnh sản xuất ${po?.code || ''} đã hoàn thành. Sản phẩm sẵn sàng để đóng gói và giao hàng.`}
                extra={
                  order.status === 'producing' ? (
                    <Button
                      type="primary"
                      size="large"
                      style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
                      onClick={handleMarkReady}
                      loading={actionLoading}
                      icon={<CheckCircleOutlined />}
                    >
                      Chuyển trạng thái &rarr; Sẵn sàng
                    </Button>
                  ) : (
                    <Tag color="green" style={{ fontSize: 14, padding: '4px 16px' }}>
                      Đã sẵn sàng giao hàng
                    </Tag>
                  )
                }
              />
            </Col>
          )}

          {/* Actual output info if completed */}
          {isCompleted && po?.actual_quantity && (
            <Col xs={24}>
              <Card title="Kết quả sản xuất" size="small">
                <Row gutter={16}>
                  <Col xs={12} sm={6}>
                    <Statistic
                      title="SL thực tế"
                      value={po.actual_quantity}
                      suffix="kg"
                      valueStyle={{ color: '#1B4D3E' }}
                    />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic
                      title="Cấp mủ đạt"
                      value={po.final_grade || '-'}
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic
                      title="DRC"
                      value={po.final_drc || '-'}
                      suffix="%"
                    />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic
                      title="Hiệu suất"
                      value={po.yield_percent || '-'}
                      suffix="%"
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
          )}
        </Row>
      )
    }

    // ── Case 2: No production order yet ──
    const canCreate = ['confirmed', 'draft'].includes(order.status)

    // NVL batch table columns
    const nvlBatchColumns: ColumnsType<NvlAvailability['suitable_batches'][0]> = [
      {
        title: '',
        key: 'select',
        width: 40,
        render: (_: unknown, record) => (
          <Checkbox
            checked={selectedBatchIds.includes(record.batch_id)}
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedBatchIds(prev => [...prev, record.batch_id])
              } else {
                setSelectedBatchIds(prev => prev.filter(id => id !== record.batch_id))
              }
            }}
          />
        ),
      },
      {
        title: 'Mã lô',
        dataIndex: 'batch_no',
        key: 'batch_no',
        render: (v: string) => <Text strong style={{ color: '#1B4D3E' }}>{v}</Text>,
      },
      {
        title: 'Khối lượng (kg)',
        dataIndex: 'weight_kg',
        key: 'weight_kg',
        align: 'right' as const,
        render: (v: number) => v.toLocaleString('vi-VN'),
      },
      {
        title: 'DRC (%)',
        dataIndex: 'drc',
        key: 'drc',
        align: 'right' as const,
        render: (v: number) => <Tag color="blue">{v}%</Tag>,
      },
      {
        title: 'QC',
        dataIndex: 'qc_status',
        key: 'qc_status',
        render: (v: string) => (
          <Tag color={v === 'passed' ? 'green' : v === 'failed' ? 'red' : 'default'}>
            {v === 'passed' ? 'Đạt' : v === 'failed' ? 'Không đạt' : v}
          </Tag>
        ),
      },
      {
        title: 'Kho',
        dataIndex: 'warehouse_name',
        key: 'warehouse_name',
      },
      {
        title: 'Ngày tồn',
        dataIndex: 'days_in_stock',
        key: 'days_in_stock',
        align: 'right' as const,
        render: (v: number) => `${v} ngày`,
      },
    ]

    // Calculate selected weight
    const selectedWeight = nvlAvailability
      ? nvlAvailability.suitable_batches
          .filter(b => selectedBatchIds.includes(b.batch_id))
          .reduce((sum, b) => sum + b.weight_kg, 0)
      : 0

    return (
      <Row gutter={[16, 16]}>
        {/* NVL Check Card */}
        <Col xs={24}>
          <Card
            title="Kiểm tra nguyên vật liệu (NVL)"
            size="small"
            extra={
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleCheckNvl}
                loading={nvlLoading}
                style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
              >
                Kiểm tra NVL
              </Button>
            }
          >
            {!nvlAvailability && !nvlLoading && (
              <Empty
                description="Nhấn 'Kiểm tra NVL' để xem nguyên vật liệu khả dụng"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}

            {nvlLoading && (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin tip="Đang kiểm tra NVL khả dụng..." />
              </div>
            )}

            {nvlAvailability && !nvlLoading && (
              <>
                {/* Summary stats */}
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col xs={12} sm={6}>
                    <Statistic
                      title="NVL cần (kg)"
                      value={nvlAvailability.required_kg}
                      valueStyle={{ color: '#1B4D3E' }}
                      suffix="kg"
                    />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic
                      title="NVL khả dụng (kg)"
                      value={nvlAvailability.available_kg}
                      valueStyle={{ color: nvlAvailability.is_sufficient ? '#52c41a' : '#fa8c16' }}
                      suffix="kg"
                    />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic
                      title="Đã chọn (kg)"
                      value={selectedWeight}
                      valueStyle={{ color: '#1890ff' }}
                      suffix="kg"
                    />
                  </Col>
                  <Col xs={12} sm={6}>
                    <Statistic
                      title="Thiếu (kg)"
                      value={nvlAvailability.shortage_kg}
                      valueStyle={{ color: nvlAvailability.shortage_kg > 0 ? '#ff4d4f' : '#52c41a' }}
                      suffix="kg"
                    />
                  </Col>
                </Row>

                {/* Alert */}
                {nvlAvailability.is_sufficient ? (
                  <Alert
                    type="success"
                    showIcon
                    message="Đủ nguyên vật liệu"
                    description={`Có đủ ${nvlAvailability.available_kg.toLocaleString('vi-VN')} kg NVL trong kho để sản xuất ${nvlAvailability.required_kg.toLocaleString('vi-VN')} kg cần thiết.`}
                    style={{ marginBottom: 16 }}
                  />
                ) : (
                  <Alert
                    type="warning"
                    showIcon
                    message="Thiếu nguyên vật liệu"
                    description={`Còn thiếu ${nvlAvailability.shortage_kg.toLocaleString('vi-VN')} kg NVL. Có thể vẫn tạo lệnh SX với số lượng hiện có.`}
                    style={{ marginBottom: 16 }}
                  />
                )}

                {/* Batch table */}
                {nvlAvailability.suitable_batches.length > 0 ? (
                  <Table
                    dataSource={nvlAvailability.suitable_batches}
                    columns={nvlBatchColumns}
                    rowKey="batch_id"
                    pagination={false}
                    size="small"
                    bordered
                    title={() => (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text strong>Lô NVL phù hợp ({nvlAvailability.suitable_batches.length} lô)</Text>
                        <Space>
                          <Button
                            size="small"
                            onClick={() => setSelectedBatchIds(nvlAvailability.suitable_batches.map(b => b.batch_id))}
                          >
                            Chọn tất cả
                          </Button>
                          <Button
                            size="small"
                            onClick={() => setSelectedBatchIds([])}
                          >
                            Bỏ chọn
                          </Button>
                        </Space>
                      </div>
                    )}
                  />
                ) : (
                  <Alert
                    type="error"
                    showIcon
                    message="Không tìm thấy lô NVL phù hợp"
                    description="Không có lô nguyên vật liệu nào đạt yêu cầu DRC và QC trong kho."
                  />
                )}
              </>
            )}
          </Card>
        </Col>

        {/* Create production button */}
        {canCreate && nvlAvailability && (
          <Col xs={24}>
            <Card size="small">
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <Space direction="vertical" size={12}>
                  <Text type="secondary">
                    Đã chọn {selectedBatchIds.length} lô — Tổng {selectedWeight.toLocaleString('vi-VN')} kg
                  </Text>
                  <Popconfirm
                    title="Tạo lệnh sản xuất?"
                    description={`Sẽ tạo lệnh SX cho đơn hàng ${order.code} với ${selectedBatchIds.length} lô NVL đã chọn.`}
                    onConfirm={handleCreateProduction}
                    okText="Tạo lệnh SX"
                    cancelText="Hủy"
                  >
                    <Button
                      type="primary"
                      size="large"
                      icon={<ThunderboltOutlined />}
                      loading={createProdLoading}
                      disabled={selectedBatchIds.length === 0}
                      style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
                    >
                      Tạo lệnh sản xuất
                    </Button>
                  </Popconfirm>
                </Space>
              </div>
            </Card>
          </Col>
        )}

        {/* Info if not in correct status */}
        {!canCreate && !order.production_order_id && (
          <Col xs={24}>
            <Alert
              type="info"
              showIcon
              message="Chưa thể tạo lệnh sản xuất"
              description={`Đơn hàng đang ở trạng thái "${ORDER_STATUS_LABELS[order.status]}". Cần xác nhận đơn hàng trước khi tạo lệnh sản xuất.`}
            />
          </Col>
        )}
      </Row>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: DONG GOI (Containers)
  // ══════════════════════════════════════════════════════════════

  const containerColumns: ColumnsType<SalesOrderContainer> = [
    {
      title: 'Container No.',
      dataIndex: 'container_no',
      key: 'container_no',
      render: (v) => v || <Text type="secondary">Chua co</Text>,
    },
    {
      title: 'Seal No.',
      dataIndex: 'seal_no',
      key: 'seal_no',
      render: (v) => v || '-',
    },
    {
      title: 'Loai',
      dataIndex: 'container_type',
      key: 'container_type',
      render: (v) =>
        CONTAINER_TYPE_LABELS[v as keyof typeof CONTAINER_TYPE_LABELS] || v || '-',
    },
    {
      title: 'So banh',
      dataIndex: 'bale_count',
      key: 'bale_count',
      render: (v) => v ?? '-',
    },
    {
      title: 'KL net (kg)',
      dataIndex: 'net_weight_kg',
      key: 'net_weight_kg',
      render: (v) => (v ? v.toLocaleString() : '-'),
    },
    {
      title: 'Trang thai',
      dataIndex: 'status',
      key: 'status',
      render: (s: ContainerStatus) => (
        <Tag color={CONTAINER_STATUS_COLORS[s]}>{CONTAINER_STATUS_LABELS[s]}</Tag>
      ),
    },
  ]

  const renderPackingTab = () => (
    <Card
      title="Danh sach Container"
      size="small"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="small"
          onClick={() => setContainerModalOpen(true)}
          style={{ background: '#1B4D3E' }}
        >
          Them container
        </Button>
      }
    >
      {containers.length > 0 ? (
        <Table
          dataSource={containers}
          columns={containerColumns}
          rowKey="id"
          pagination={false}
          size="small"
          bordered
        />
      ) : (
        <Empty
          description="Chua co container nao"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      )}
    </Card>
  )

  // ══════════════════════════════════════════════════════════════
  // TAB: CHUNG TU
  // ══════════════════════════════════════════════════════════════

  const renderDocumentsTab = () => {
    const docs = [
      {
        key: 'coa',
        label: 'COA (Certificate of Analysis)',
        done: order.coa_generated,
      },
      {
        key: 'packing_list',
        label: 'Packing List',
        done: order.packing_list_generated,
      },
      {
        key: 'invoice',
        label: 'Invoice',
        done: order.invoice_generated,
      },
      {
        key: 'bl',
        label: 'Bill of Lading (B/L)',
        done: order.bl_received,
      },
    ]

    return (
      <Card title="Chung tu xuat khau" size="small">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {docs.map((doc) => (
            <div
              key={doc.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                background: doc.done ? '#f6ffed' : '#fff',
              }}
            >
              <Space>
                <Checkbox checked={doc.done} disabled />
                <Text strong={doc.done}>{doc.label}</Text>
              </Space>
              <Button size="small" type="link" disabled>
                {doc.done ? 'Xem' : 'Tao'}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // STATUS TIMELINE
  // ══════════════════════════════════════════════════════════════

  const renderTimeline = () => {
    const currentIdx = STATUS_FLOW.indexOf(order.status)
    const cancelled = order.status === 'cancelled'

    return (
      <Card title="Tien trinh don hang" size="small" style={{ marginTop: 24 }}>
        <Timeline
          mode="left"
          items={[
            ...STATUS_FLOW.map((s, i) => {
              let color: string = 'gray'
              if (cancelled) {
                color = 'gray'
              } else if (i < currentIdx) {
                color = 'green'
              } else if (i === currentIdx) {
                color = 'blue'
              }

              const dateMap: Record<string, string | null | undefined> = {
                draft: order.created_at,
                confirmed: order.confirmed_at,
                shipped: order.shipped_at,
              }

              return {
                color,
                children: (
                  <div>
                    <Text strong={i === currentIdx}>
                      {ORDER_STATUS_LABELS[s]}
                    </Text>
                    {dateMap[s] && (
                      <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                        {formatDate(dateMap[s]!)}
                      </Text>
                    )}
                  </div>
                ),
              }
            }),
            ...(cancelled
              ? [
                  {
                    color: 'red' as const,
                    children: (
                      <Text type="danger" strong>
                        Da huy
                      </Text>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: 'Don hang ban' },
          {
            title: <a onClick={() => navigate('/sales/orders')}>Danh sach</a>,
          },
          { title: order.code },
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
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/sales/orders')} />
          <Title level={4} style={{ margin: 0 }}>
            {order.code}
          </Title>
          <Tag
            color={ORDER_STATUS_COLORS[order.status]}
            style={{ fontSize: 14, padding: '2px 12px' }}
          >
            {ORDER_STATUS_LABELS[order.status]}
          </Tag>
        </Space>
        <Space wrap>{renderActionButtons()}</Space>
      </div>

      {/* Info row */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="Khach hang"
              value={customerName}
              suffix={customerCountry ? `(${customerCountry})` : undefined}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small">
            <Statistic
              title="Grade"
              value={gradeLabel}
              valueStyle={{ fontSize: 14, color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small">
            <Statistic title="So luong" value={order.quantity_tons} suffix="tan" />
          </Card>
        </Col>
        <Col xs={12} sm={5}>
          <Card size="small">
            <Statistic
              title="Gia tri"
              value={order.total_value_usd || 0}
              precision={0}
              prefix="$"
            />
          </Card>
        </Col>
        <Col xs={12} sm={5}>
          <Card size="small">
            <Statistic
              title="Ngay giao"
              value={formatDate(order.delivery_date)}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabs */}
      <Tabs
        defaultActiveKey="info"
        items={[
          {
            key: 'info',
            label: (
              <span>
                <FileTextOutlined /> Thong tin
              </span>
            ),
            children: renderInfoTab(),
          },
          {
            key: 'quality',
            label: (
              <span>
                <ExperimentOutlined /> Chat luong
              </span>
            ),
            children: renderQualityTab(),
          },
          {
            key: 'production',
            label: (
              <span>
                <ToolOutlined /> San xuat
              </span>
            ),
            children: renderProductionTab(),
          },
          {
            key: 'packing',
            label: (
              <span>
                <ContainerOutlined /> Dong goi
              </span>
            ),
            children: renderPackingTab(),
          },
          {
            key: 'documents',
            label: (
              <span>
                <FileDoneOutlined /> Chung tu
              </span>
            ),
            children: renderDocumentsTab(),
          },
        ]}
      />

      {/* Status timeline */}
      {renderTimeline()}

      {/* Container modal */}
      <Modal
        title="Them Container"
        open={containerModalOpen}
        onOk={handleAddContainer}
        onCancel={() => {
          setContainerModalOpen(false)
          containerForm.resetFields()
        }}
        okText="Them"
        cancelText="Huy"
      >
        <Form form={containerForm} layout="vertical">
          <Form.Item label="Container No." name="container_no">
            <Input placeholder="Vd: MRKU1234567" />
          </Form.Item>
          <Form.Item label="Seal No." name="seal_no">
            <Input placeholder="Seal number" />
          </Form.Item>
          <Form.Item label="Loai container" name="container_type" initialValue="20ft">
            <Select
              options={Object.entries(CONTAINER_TYPE_LABELS).map(([v, l]) => ({
                value: v,
                label: l,
              }))}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="So banh" name="bale_count">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="KL net (kg)" name="net_weight_kg">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

export default SalesOrderDetailPage
