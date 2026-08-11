// ============================================================================
// SALES ORDER DETAIL PAGE — Chi tiết Đơn hàng bán quốc tế
// File: src/pages/sales/SalesOrderDetailPage.tsx
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Card,
  Tabs,
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
  message,
  Checkbox,
} from 'antd'
import {
  ArrowLeftOutlined,
  EditOutlined,
  ExperimentOutlined,
  ContainerOutlined,
  FileTextOutlined,
  ToolOutlined,
  TruckOutlined,
  DollarOutlined,
  FileDoneOutlined,
  SolutionOutlined,
  MessageOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { supabase } from '../../lib/supabase'
import { salesOrderService } from '../../services/sales/salesOrderService'
import { getSalesRole, salesPermissions, getVisibleTabs, isTabEditable } from '../../services/sales/salesPermissionService'
import FinanceTabV4 from './components/FinanceTabV4'
import DocumentChecklistTab from './components/DocumentChecklistTab'
import SalesOrderStatusTimeline from './components/SalesOrderStatusTimeline'
import StageOwnershipCard from './components/StageOwnershipCard'
import BookingTableSection from './components/BookingTableSection'
import ShippingTab from './components/ShippingTab'
import OrderInfoTab from './components/OrderInfoTab'
import ProductionTab from './components/ProductionTab'
import PackingTabPanel from './components/PackingTabPanel'
import QualityTab from './components/QualityTab'
import StatusHistoryTab from './components/StatusHistoryTab'
import HandoffTimeline from './components/HandoffTimeline'
import ContractTab from './components/ContractTab'
import SalesOrderChat from './components/SalesOrderChat'
import OrderProgressDashboard from './components/OrderProgressDashboard'
import { useAuthStore } from '../../stores/authStore'
import type {
  SalesOrder,
  SalesOrderStatus,
} from '../../services/sales/salesTypes'
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
  soDisplayCode,
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
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} tỷ`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} tr`
  return new Intl.NumberFormat('vi-VN').format(value) + ' đ'
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

// Accept optional orderId prop cho tab mode — fallback useParams cho direct URL
interface SalesOrderDetailPageProps {
  orderId?: string
}

function SalesOrderDetailPage({ orderId: propOrderId }: SalesOrderDetailPageProps = {}) {
  const { orderId: paramOrderId } = useParams<{ orderId: string }>()
  const orderId = propOrderId || paramOrderId
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'info'
  const { user } = useAuthStore()
  const salesRole = getSalesRole(user)
  const visibleTabs = getVisibleTabs(salesRole)
  // Controlled active tab — cho phép Timeline component navigate giữa tabs
  const [activeTab, setActiveTab] = useState(initialTab)
  const handleTabChange = (key: string) => {
    setActiveTab(key)
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  const [order, setOrder] = useState<SalesOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // (Production + Packing tab: chuyển sang component gọn + trang riêng.
  //  Container/lot quản lý ở <PackingTabPanel /> → /sales/orders/:id/packing,
  //  luồng SX ở <ProductionTab /> → /sales/orders/:id/production.)

  // ── Load data ──
  const loadOrder = useCallback(async () => {
    if (!orderId) return
    try {
      setLoading(true)
      const o = await salesOrderService.getById(orderId)
      setOrder(o)
    } catch (err) {
      console.error(err)
      message.error('Không thể tải thông tin đơn hàng')
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
      const actor = { id: user?.employee_id || user?.id || null, name: user?.full_name || user?.email || null }
      if (newStatus === 'cancelled') {
        await salesOrderService.cancelOrder(order.id, 'Hủy bởi người dùng', actor)
      } else {
        await salesOrderService.updateStatus(order.id, newStatus, { actor })
      }
      message.success(`Đã cập nhật trạng thái: ${ORDER_STATUS_LABELS[newStatus]}`)
      loadOrder()
    } catch (err: any) {
      message.error(err?.message || 'Không thể cập nhật trạng thái')
    } finally {
      setActionLoading(false)
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
        <Empty description="Không tìm thấy đơn hàng" />
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button onClick={() => navigate('/sales/orders')}>Quay lại danh sách</Button>
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
  // ACTION BUTTONS — dùng chung OrderActionButtons component
  // ══════════════════════════════════════════════════════════════

  // Các button đặc thù cho trang detail (không phải chuyển trạng thái chuẩn)
  const renderExtraEditButton = () => {
    if (order.status !== 'draft') return null
    const canEdit = salesRole ? salesPermissions.canEditOrder(salesRole) : false
    if (!canEdit) return null
    return (
      <Button
        key="edit"
        icon={<EditOutlined />}
        onClick={() => navigate(`/sales/orders/${order.id}`)}
      >
        Sửa
      </Button>
    )
  }

  // Tab "Thông tin" giờ dùng chung component <OrderInfoTab /> (đồng nhất với dạng Bảng/Split)

  // Tab "Chất lượng" giờ dùng chung component <QualityTab /> (đồng nhất 2 dạng xem)
  // Tab "Sản xuất" giờ dùng chung component <ProductionTab /> (bản gọn); luồng tạo
  // lệnh SX đầy đủ (kiểm tra NVL + chọn lô) nằm ở trang /sales/orders/:id/production.





  // ══════════════════════════════════════════════════════════════
  // TAB: CHỨNG TỪ
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
      <div>
        {/* Sinh chứng từ (COA, PL, Invoice) */}
        <Card title="Sinh chứng từ" size="small" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {docs.map((doc) => (
              <div key={doc.key}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid #f0f0f0', borderRadius: 8, background: doc.done ? '#f6ffed' : '#fff' }}>
                <Space>
                  <Checkbox checked={doc.done} disabled />
                  <Text strong={doc.done}>{doc.label}</Text>
                </Space>
                <Button size="small" type="link" onClick={() => navigate(`/sales/orders/${order.id}/documents`)}>
                  {doc.done ? 'Xem' : 'Tạo'}
                </Button>
              </div>
            ))}
          </div>
        </Card>

        {/* ★ Upload + Checklist chứng từ gốc */}
        <DocumentChecklistTab
          orderId={order.id}
          orderCode={soDisplayCode(order)}
          readonly={['draft', 'cancelled'].includes(order.status)}
        />
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════
  // STATUS TIMELINE
  // ══════════════════════════════════════════════════════════════

  const renderTimeline = () => {
    const currentIdx = STATUS_FLOW.indexOf(order.status)
    const cancelled = order.status === 'cancelled'

    return (
      <Card title="Tiến trình đơn hàng" size="small" style={{ marginTop: 24 }}>
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
                        Đã hủy
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
    <div style={{ padding: 24 }}>
      {/* Breadcrumb */}
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: 'Đơn hàng bán' },
          {
            title: <a onClick={() => navigate('/sales/orders')}>Danh sách</a>,
          },
          { title: soDisplayCode(order) },
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
            {soDisplayCode(order)}
            {(order as any).contract_no && (order as any).code && (
              <span style={{ fontSize: 16, fontWeight: 400, color: '#8c8c8c', marginLeft: 10 }}>
                · Mã đơn: <span style={{ color: '#1B4D3E', fontWeight: 600 }}>{(order as any).code}</span>
              </span>
            )}
          </Title>
          <Tag
            color={ORDER_STATUS_COLORS[order.status]}
            style={{ fontSize: 14, padding: '2px 12px' }}
          >
            {ORDER_STATUS_LABELS[order.status]}
          </Tag>
        </Space>
        <Space wrap>{renderExtraEditButton()}</Space>
      </div>

      {/* Info row */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            {order.customer_id ? (
              <>
                <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>Khách hàng</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <a
                    onClick={() => navigate(`/sales/customers/${order.customer_id}`)}
                    style={{ fontSize: 14, fontWeight: 600, color: '#1B4D3E' }}
                  >
                    {customerName}{customerCountry ? ` (${customerCountry})` : ''}
                  </a>
                  <Button
                    type="link"
                    size="small"
                    icon={<SolutionOutlined />}
                    title="Mở Hồ sơ chứng từ của khách"
                    style={{ padding: 0, height: 'auto', fontSize: 12 }}
                    onClick={() => navigate(`/sales/customers/${order.customer_id}?tab=export`)}
                  >
                    Hồ sơ CT
                  </Button>
                </div>
              </>
            ) : (
              <Statistic
                title="Khách hàng"
                value={customerName}
                suffix={customerCountry ? `(${customerCountry})` : undefined}
                valueStyle={{ fontSize: 14 }}
              />
            )}
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
            <Statistic title="Số lượng" value={order.quantity_tons} suffix="tấn" />
          </Card>
        </Col>
        <Col xs={12} sm={5}>
          <Card size="small">
            <Statistic
              title="Giá trị"
              value={order.total_value_usd || 0}
              precision={0}
              prefix="$"
            />
          </Card>
        </Col>
        <Col xs={12} sm={5}>
          <Card size="small">
            <Statistic
              title="Ngày giao"
              value={formatDate(order.delivery_date)}
              valueStyle={{ fontSize: 14 }}
            />
          </Card>
        </Col>
      </Row>

      {/* F-polish: Status Timeline + Next-step hint */}
      <SalesOrderStatusTimeline order={order} onTabChange={handleTabChange} />

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          {
            key: 'info',
            label: (
              <span>
                <FileTextOutlined /> Thông tin
              </span>
            ),
            children: <OrderInfoTab order={order} />,
          },
          ...(visibleTabs.includes('contract') ? [{
            key: 'contract',
            label: (
              <span>
                <SolutionOutlined /> Hợp đồng
              </span>
            ),
            children: (
              <ContractTab
                order={order}
                salesRole={salesRole}
                editable={!!salesRole && isTabEditable(salesRole, 'contract', order.status as SalesOrderStatus, !!order.is_locked)}
                onSaved={loadOrder}
              />
            ),
          }] : []),
          ...(visibleTabs.includes('production') ? [{
            key: 'production',
            label: (
              <span>
                <ToolOutlined /> Sản xuất
              </span>
            ),
            children: <ProductionTab order={order} salesRole={salesRole} editable={!!salesRole && isTabEditable(salesRole, 'production', order.status as SalesOrderStatus, !!order.is_locked)} onSaved={loadOrder} />,
          }] : []),
          {
            key: 'quality',
            label: (
              <span>
                <ExperimentOutlined /> Chất lượng
              </span>
            ),
            children: <QualityTab order={order} />,
          },
          ...(visibleTabs.includes('packing') ? [{
            key: 'packing',
            label: (
              <span>
                <ContainerOutlined /> Đóng gói
              </span>
            ),
            children: <PackingTabPanel orderId={order.id} />,
          }] : []),
          ...(visibleTabs.includes('shipping') ? [{
            key: 'shipping',
            label: (
              <span>
                <TruckOutlined /> Vận chuyển
              </span>
            ),
            children: <ShippingTab order={order} salesRole={salesRole} editable={!!salesRole && salesPermissions.canEditBooking(salesRole)} onSaved={loadOrder} />,
          }] : []),
          ...(visibleTabs.includes('documents') ? [{
            key: 'documents',
            label: (
              <span>
                <FileDoneOutlined /> Chứng từ
              </span>
            ),
            children: renderDocumentsTab(),
          }] : []),
          ...(visibleTabs.includes('finance') ? [{
            key: 'finance',
            label: (
              <span>
                <DollarOutlined /> Tài chính
              </span>
            ),
            children: <FinanceTabV4 order={order} salesRole={salesRole} editable={!!salesRole && salesPermissions.canEditFinance(salesRole)} onSaved={loadOrder} />,
          }] : []),
          {
            key: 'progress',
            label: (
              <span>
                📈 Tiến độ
              </span>
            ),
            children: (
              <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <OrderProgressDashboard order={order} onChanged={loadOrder} onNavigateTab={handleTabChange} />
                <StageOwnershipCard
                  orderId={order.id}
                  orderCode={soDisplayCode(order)}
                  currentStage={(order.current_stage as any) || 'sales'}
                  currentOwnerId={order.current_owner_id || null}
                  currentOwnerName={(order as any).current_owner?.full_name || null}
                  stageStartedAt={order.stage_started_at || null}
                  stageSlaHours={order.stage_sla_hours || null}
                  onChanged={loadOrder}
                />
                <HandoffTimeline
                  orderId={order.id}
                  orderCode={soDisplayCode(order)}
                  currentStage={(order.current_stage as any) || 'sales'}
                  stageStartedAt={order.stage_started_at || null}
                />
              </div>
            ),
          },
          {
            key: 'chat',
            label: (
              <span>
                <MessageOutlined /> Trao đổi
              </span>
            ),
            children: <SalesOrderChat salesOrderId={order.id} />,
          },
          ...(salesRole === 'admin' ? [{
            key: 'history',
            label: (
              <span>
                <ClockCircleOutlined /> Lịch sử
              </span>
            ),
            children: <StatusHistoryTab orderId={order.id} />,
          }] : []),
        ]}
      />
    </div>
  )
}

export default SalesOrderDetailPage
