// ============================================================================
// CUSTOMER DETAIL PAGE — Chi tiết Khách hàng bán quốc tế
// File: src/pages/sales/CustomerDetailPage.tsx
//
// 17/11/2026 — Các bên của đơn + Đơn mua tiếp (docs/migrations/sales_family_parties_p1.sql):
//   • Tab Đơn hàng tách "Đứng tên mua" (customer_id = khách — tiền, công nợ, doanh thu thuộc khách này) |
//     "Nhận qua trung gian" (ship_to_customer_id = khách, bên khác đứng tên mua — KHÔNG thuộc công nợ / doanh thu /
//     hạn mức của khách này; salesCustomerService.getReceivedOrders).
//   • Khách là trung gian (đơn đứng tên mua có người nhận khác): khối "Giao thẳng cho người nhận khác", gom theo người nhận.
//   • Thống kê: KPI "Hàng về tay" = mua thẳng + nhận qua trung gian (tấn đặt / đã giao) — getEndCustomerVolume (view
//     v_sales_order_end_customer, KHÔNG có cột tiền). 4 số cũ (đơn, doanh thu, tấn, đang xử lý) vẫn CHỈ tính đơn đứng tên mua.
//   • "Mua tiếp theo HĐ…" (RootContractPickerModal lọc sẵn người mua = khách này) + nút "Mua tiếp" trên từng dòng đơn
//     → tab tạo đợt 'sales-order-continue-<id>' (quyền canCreateOrder).
//   Chưa migration (useFamilyPartiesReady() = false) → ẩn mọi khối / nút mới, trang y như cũ.
// ============================================================================

import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
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
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  Popconfirm,
  Segmented,
  Alert,
  Tooltip,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowLeftOutlined,
  EditOutlined,
  StopOutlined,
  PlusOutlined,
  ShoppingOutlined,
  DollarOutlined,
  BarChartOutlined,
  FileTextOutlined,
  SubnodeOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import {
  salesCustomerService,
  customSpecsToRows,
  rowsToCustomSpecs,
  type EndCustomerVolume,
  type TonsBucket,
} from '../../services/sales/salesCustomerService'
import { getSalesRole, salesPermissions } from '../../services/sales/salesPermissionService'
import { useAuthStore } from '../../stores/authStore'
import { useOpenTab } from '../../hooks/useOpenTab'
import { useIsPhone } from '../../hooks/useIsPhone'
import { CustomSpecsFormList } from './CustomerSpecsField'
import { DASH, fmtUsd, fmtDate, fmtNum, usdInputProps } from '../../utils/format'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'
import { palette } from '../../theme/palette'
import PageState from '../../components/common/PageState'
import { EnumTag } from '../../components/common/EnumTag'
import { stdPagination } from '../../components/common/tableDefaults'
import CustomerExportProfileTab from './components/CustomerExportProfileTab'
import CustomerDocSetHistoryTab from './components/CustomerDocSetHistoryTab'
import RootContractPickerModal from './components/RootContractPickerModal'
import { useFamilyPartiesReady } from './components/OrderFamilyChip'
import type {
  SalesCustomer,
  CreateCustomerData,
  SalesOrder,
  SalesOrderShipTo,
} from '../../services/sales/salesTypes'
import {
  CUSTOMER_TIER_LABELS,
  CUSTOMER_TIER_COLORS,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  QUALITY_STANDARD_LABELS,
  INCOTERM_LABELS,
  PAYMENT_TERMS_LABELS,
  SVR_GRADE_OPTIONS,
  COUNTRY_OPTIONS,
  soDisplayCode,
  countryLabel,
  countryFlag,
  partyShortName,
} from '../../services/sales/salesTypes'

const { Title, Text } = Typography

// ============================================
// HELPERS
// ============================================

// Định dạng: fmtUsd / fmtDate / fmtNum / DASH (utils/format) — bỏ formatCurrency ' đ' (không dùng) + formatUSD cục bộ.

const GradeBadge = ({ grade }: { grade: string }) => (
  <Tag color="blue" style={{ marginBottom: 4 }}>{grade}</Tag>
)

/** Một bên (người mua / người nhận) để mở trang khách. */
type PartyRef = { id: string; name?: string | null; short_name?: string | null }

/** Dòng phụ HỌ HĐ dưới số đơn — màu THƯƠNG HIỆU (không dùng màu trạng thái). */
type FamilyInfo = { text: string; tip: string }

function FamilyLine({ info }: { info: FamilyInfo }) {
  return (
    <Tooltip title={info.tip}>
      <div style={{ fontSize: 11, color: palette.brand, lineHeight: 1.35, overflowWrap: 'anywhere' }}>⧉ {info.text}</div>
    </Tooltip>
  )
}

/** Thẻ một đơn cho điện thoại (≤ 640px) — thay bảng nhiều cột, xếp dọc, không tràn ngang. */
function PhoneOrderCard({ order, family, party, meta, action, onOpen }: {
  order: SalesOrder
  family?: FamilyInfo | null
  party?: ReactNode
  meta: ReactNode[]
  action?: ReactNode
  onOpen: () => void
}) {
  return (
    <Card size="small" hoverable onClick={onOpen} style={{ cursor: 'pointer' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <Text strong style={{ fontFamily: 'monospace', fontSize: 15, overflowWrap: 'anywhere', minWidth: 0 }}>
          {soDisplayCode(order)}
        </Text>
        <EnumTag value={order.status} labels={ORDER_STATUS_LABELS} colors={ORDER_STATUS_COLORS} />
      </div>
      {family && <FamilyLine info={family} />}
      {party && <div style={{ fontSize: 13, marginTop: 2, overflowWrap: 'anywhere' }}>{party}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginTop: 4, fontSize: 12.5 }}>
        {meta.map((m, i) => <Text key={i} type="secondary">{m}</Text>)}
      </div>
      {action && <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>{action}</div>}
    </Card>
  )
}

/** Nhóm đơn khách này đứng tên mua nhưng giao thẳng cho MỘT người nhận khác. */
interface ShipToGroup {
  id: string
  receiver: SalesOrderShipTo | null
  orders: SalesOrder[]
  tons: number
  valueUsd: number
}

/** Khối "Giao thẳng cho người nhận khác" (khách là trung gian) — tiền & công nợ các đơn này vẫn của khách đang xem. */
function ShipToGroupsCard({ groups, totalOwn, onOpenCustomer, onOpenOrder }: {
  groups: ShipToGroup[]
  totalOwn: number
  onOpenCustomer: (c: PartyRef) => void
  onOpenOrder: (o: SalesOrder) => void
}) {
  const n = groups.reduce((s, g) => s + g.orders.length, 0)
  return (
    <Card
      size="small"
      style={{ marginBottom: 16 }}
      title={(
        <span>
          Giao thẳng cho người nhận khác{' '}
          <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>· {n}/{totalOwn} đơn</Text>
        </span>
      )}
    >
      <Text type="secondary" style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>
        Khách này đứng tên mua, trả tiền và chịu công nợ các đơn dưới đây; hàng giao thẳng cho người nhận.
      </Text>
      {groups.map((g) => (
        <div
          key={g.id}
          style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 12px',
            padding: '8px 0', borderTop: `1px solid ${palette.brandBg}`,
          }}
        >
          {g.receiver ? (
            <Button
              type="link"
              style={{ padding: 0, height: 'auto', fontWeight: 600, whiteSpace: 'normal', textAlign: 'left' }}
              onClick={() => onOpenCustomer(g.receiver as SalesOrderShipTo)}
            >
              {countryFlag(g.receiver.country)} {partyShortName(g.receiver)}
            </Button>
          ) : (
            <Text type="warning">Không tìm thấy hồ sơ người nhận</Text>
          )}
          <Text type="secondary">
            {g.orders.length} đơn · {fmtNum(g.tons, 2)} t · {fmtUsd(g.valueUsd)}
          </Text>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', minWidth: 0 }}>
            {g.orders.map((o) => (
              <Button
                key={o.id}
                type="link"
                size="small"
                style={{ padding: 0, height: 'auto', fontFamily: 'monospace' }}
                onClick={() => onOpenOrder(o)}
              >
                {soDisplayCode(o)}
              </Button>
            ))}
          </span>
        </div>
      ))}
    </Card>
  )
}

/** KPI "Hàng về tay" — chỉ TẤN (đặt / đã giao), một nguồn v_sales_order_end_customer. */
function EndVolumeKpi({ v, onOpenCustomer }: { v: EndCustomerVolume; onOpenCustomer: (c: PartyRef) => void }) {
  const tons = (b: TonsBucket) => (
    <>
      <b>{fmtNum(b.tons, 2)} t</b> đặt / {fmtNum(b.delivered_tons, 2)} t đã giao · {b.orders} đơn
    </>
  )
  return (
    <Row gutter={[16, 12]} align="middle">
      <Col xs={24} sm={8}>
        <Statistic
          title="Đã giao tới tay khách (tấn)"
          value={v.total.delivered_tons}
          formatter={(x) => fmtNum(Number(x), 2)}
        />
        <Text type="secondary">đặt {fmtNum(v.total.tons, 2)} t · {v.total.orders} đơn</Text>
      </Col>
      <Col xs={24} sm={16}>
        <div style={{ fontSize: 13, lineHeight: 1.75, overflowWrap: 'anywhere' }}>
          <div>= <b>Mua thẳng</b> (khách đứng tên): {tons(v.direct)}</div>
          <div>+ <b>Nhận qua trung gian</b>: {tons(v.via)}</div>
          {v.byIntermediary.map((b) => (
            <div key={b.buyer_id} style={{ paddingLeft: 16 }}>
              qua{' '}
              <Button
                type="link"
                size="small"
                style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'left' }}
                onClick={() => onOpenCustomer({ id: b.buyer_id, name: b.name, short_name: b.short_name })}
              >
                {b.short_name}
              </Button>
              : {fmtNum(b.tons, 2)} t đặt / {fmtNum(b.delivered_tons, 2)} t đã giao · {b.orders} đơn
            </div>
          ))}
        </div>
      </Col>
      <Col xs={24}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Chỉ là sản lượng hàng đến tay khách — không phải tiền. Doanh thu, công nợ, hạn mức chỉ tính đơn khách này
          ĐỨNG TÊN MUA; đơn nhận qua trung gian thuộc công nợ của người mua trung gian.
        </Text>
      </Col>
    </Row>
  )
}

// ============================================
// STATS INTERFACE (computed client-side)
// ============================================

interface CustomerDetailStats {
  totalOrders: number
  totalRevenue: number
  totalQuantity: number
  processingOrders: number
}

type OrdersView = 'buyer' | 'received'

/** Số thẻ đơn hiện mỗi lần trên điện thoại ("Xem thêm" để hiện tiếp). */
const PHONE_PAGE = 20

// ============================================
// MAIN COMPONENT
// ============================================

// Accept optional customerId prop cho tab mode — fallback useParams cho direct URL
interface CustomerDetailPageProps {
  customerId?: string
}

export default function CustomerDetailPage({ customerId: propCustomerId }: CustomerDetailPageProps = {}) {
  const { customerId: paramCustomerId } = useParams<{ customerId: string }>()
  const customerId = propCustomerId || paramCustomerId
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const openTab = useOpenTab()
  const isPhone = useIsPhone()
  const { user } = useAuthStore()
  const salesRole = getSalesRole(user)
  const canCreateOrder = !!salesRole && salesPermissions.canCreateOrder(salesRole)
  // Đã chạy migration họ HĐ / người nhận chưa — chưa thì ẩn mọi khối / nút mới
  const familyReady = useFamilyPartiesReady()

  const [customer, setCustomer] = useState<SalesCustomer | null>(null)
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [stats, setStats] = useState<CustomerDetailStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [ordersError, setOrdersError] = useState<unknown>(null)
  // Deep-link: ?tab=export mở thẳng tab "Hồ sơ chứng từ" (chỉ ở chế độ route, không phải khi nhúng tab)
  const [activeTab, setActiveTab] = useState<string>(() => {
    const t = searchParams.get('tab')
    const valid = ['info', 'quality', 'export', 'doc-history', 'orders', 'stats']
    return !propCustomerId && t && valid.includes(t) ? t : 'info'
  })
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const [ordersView, setOrdersView] = useState<OrdersView>('buyer')
  const [phoneLimit, setPhoneLimit] = useState(PHONE_PAGE)
  const [rootPickerOpen, setRootPickerOpen] = useState(false)

  // ── Đơn khách này là NGƯỜI NHẬN qua trung gian + "Hàng về tay" (chỉ khi đã migration) ──
  const receivedQ = useQuery({
    queryKey: ['sales-customer-received-orders', customerId],
    queryFn: () => salesCustomerService.getReceivedOrders(customerId as string),
    enabled: familyReady && !!customerId,
    staleTime: 60 * 1000,
  })
  const volumeQ = useQuery({
    queryKey: ['sales-customer-end-volume', customerId],
    queryFn: () => salesCustomerService.getEndCustomerVolume(customerId as string),
    enabled: familyReady && !!customerId,
    staleTime: 60 * 1000,
  })
  const received = useMemo(() => receivedQ.data ?? [], [receivedQ.data])

  // ── Load data ──
  const loadData = useCallback(async () => {
    if (!customerId) return
    setLoading(true)
    setLoadError(null)
    setOrdersError(null)
    try {
      const customerData = await salesCustomerService.getById(customerId)
      setCustomer(customerData)

      // Đơn khách ĐỨNG TÊN MUA (chưa huỷ) — mọi số tiền / doanh thu / tấn của trang chỉ cộng từ đây
      try {
        const ordersList = await salesCustomerService.getOrderHistory(customerId)
        setOrders(ordersList)

        // Compute stats — CHỈ đơn đứng tên mua (đơn nhận qua trung gian không bao giờ cộng vào đây)
        setStats({
          totalOrders: ordersList.length,
          totalRevenue: ordersList.reduce((sum, o) => sum + (o.total_value_usd || 0), 0),
          totalQuantity: ordersList.reduce((sum, o) => sum + (o.quantity_tons || 0), 0),
          processingOrders: ordersList.filter(o => o.status === 'producing' || o.status === 'ready' || o.status === 'packing').length,
        })
      } catch (e) {
        // Lỗi tải đơn ≠ "chưa có đơn" — tab Đơn hàng/Thống kê hiện khối lỗi thay cho số 0
        setOrders([])
        setStats(null)
        setOrdersError(e)
      }
    } catch (err) {
      // Lỗi tải ≠ "không tìm thấy khách hàng" (nạp lại sau khi sửa mà hỏng thì toast: đang xem bản cũ)
      console.error('Lỗi tải dữ liệu khách hàng:', err)
      setLoadError(err)
      message.error(dichLoiHeThong(err, 'Không thể tải dữ liệu khách hàng'))
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Họ HĐ: tra đơn theo id (đơn đứng tên mua + đơn nhận qua trung gian) và đếm đợt của gốc ──
  // Đợt mua tiếp luôn CÙNG người mua với gốc (trigger trg_so_family_guard) → cả họ chưa huỷ nằm trọn trong `orders`
  // của người mua, nên đếm ở client là đúng số đợt (khớp getFamilyCounts: 1 + đợt chưa huỷ).
  const orderById = useMemo(() => {
    const m = new Map<string, SalesOrder>()
    for (const o of received) m.set(o.id, o)
    for (const o of orders) m.set(o.id, o)
    return m
  }, [orders, received])
  const ownChildCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of orders) if (o.parent_order_id) m.set(o.parent_order_id, (m.get(o.parent_order_id) ?? 0) + 1)
    return m
  }, [orders])

  // ── Khách là trung gian: đơn đứng tên mua có người nhận khác, gom theo người nhận ──
  const shipGroups = useMemo<ShipToGroup[]>(() => {
    const m = new Map<string, ShipToGroup>()
    for (const o of orders) {
      const rid = o.ship_to_customer_id
      if (!rid) continue
      const g = m.get(rid) || { id: rid, receiver: o.ship_to ?? null, orders: [], tons: 0, valueUsd: 0 }
      g.orders.push(o)
      g.tons += Number(o.quantity_tons) || 0
      g.valueUsd += Number(o.total_value_usd) || 0
      if (!g.receiver && o.ship_to) g.receiver = o.ship_to
      m.set(rid, g)
    }
    return [...m.values()].sort((a, b) => b.tons - a.tons)
  }, [orders])

  // ── Mở tab ──
  const openOrder = (o: { id: string; contract_no?: string | null; code?: string | null }) => {
    openTab({
      key: `sales-order-${o.id}`,
      title: `Đơn ${soDisplayCode(o)}`,
      componentId: 'sales-order-detail',
      props: { orderId: o.id },
      path: `/sales/orders/${o.id}`,
    })
  }
  const openCustomer = (c: PartyRef) => {
    openTab({
      key: `sales-customer-${c.id}`,
      title: c.short_name || c.name || 'Khách hàng',
      componentId: 'sales-customer-detail',
      props: { customerId: c.id },
      path: `/sales/customers/${c.id}`,
    })
  }
  /** Tab tạo ĐỢT MUA TIẾP — đơn nguồn = đơn được bấm (service tự quy về gốc thật). */
  const openContinue = (sourceId: string, rootLabel: string) => {
    openTab({
      key: `sales-order-continue-${sourceId}`,
      title: `Mua tiếp HĐ ${rootLabel}`,
      componentId: 'sales-order-continue',
      props: { sourceOrderId: sourceId },
      path: `/sales/orders/${sourceId}/continue`,
    })
  }
  const onPickRoot = (root: { id: string; latest_member_id?: string | null; contract_no: string }) => {
    // Đơn nguồn gợi ý = đơn mới nhất của họ (quy cách mới nhất)
    openContinue(root.latest_member_id || root.id, root.contract_no)
  }

  /** Dòng phụ họ HĐ: đợt '⧉ Đợt 3 · HĐ HA20260302' / gốc '⧉ HĐ gốc · 3 đợt' (gốc chỉ đếm ở danh sách đứng tên mua). */
  const familyInfo = (o: SalesOrder, countKids: boolean): FamilyInfo | null => {
    if (o.parent_order_id) {
      const root = orderById.get(o.parent_order_id)
      const rootNo = root ? soDisplayCode(root) : ''
      const seq = o.continuation_seq
      return {
        text: `${seq ? `Đợt ${seq}` : 'Mua tiếp'}${rootNo ? ` · HĐ ${rootNo}` : ''}`,
        tip: `Mua tiếp theo HĐ ${rootNo || 'gốc'} — không ký HĐ mới; tiền, lô, công nợ của đợt này tách riêng.`,
      }
    }
    if (countKids) {
      const kids = ownChildCount.get(o.id) ?? 0
      if (kids > 0) {
        return {
          text: `HĐ gốc · ${kids + 1} đợt`,
          tip: 'HĐ gốc có các đợt mua tiếp (cùng người mua) — mỗi đợt là một đơn riêng: tiền, lô, công nợ riêng.',
        }
      }
    }
    return null
  }

  /** Nút "Mua tiếp" trên một đơn đứng tên mua. Gốc chưa có số HĐ → nút mờ + lý do. */
  const continueAction = (o: SalesOrder): ReactNode => {
    if (!familyReady || !canCreateOrder) return null
    const root = o.parent_order_id ? orderById.get(o.parent_order_id) ?? null : o
    const rootNo = (root?.contract_no || '').trim()
    // Đợt con: gốc luôn có số HĐ (trigger chặn từ lúc tạo) — chỉ chặn ở đơn gốc chưa điền số HĐ
    const blocked = !o.parent_order_id && !rootNo
    if (blocked) {
      return (
        <Tooltip title="Đơn chưa có số HĐ — điền số HĐ (tab Hợp đồng) trước rồi mới tạo đơn mua tiếp">
          <span><Button size="small" icon={<SubnodeOutlined />} disabled>Mua tiếp</Button></span>
        </Tooltip>
      )
    }
    const label = rootNo || soDisplayCode(root ?? o)
    return (
      <Tooltip title={`Khách mua thêm theo HĐ ${label}: tạo đợt mới gắn vào HĐ gốc — không ký HĐ mới`}>
        <Button
          size="small"
          icon={<SubnodeOutlined />}
          onClick={(e) => { e.stopPropagation(); openContinue(o.id, label) }}
        >
          Mua tiếp
        </Button>
      </Tooltip>
    )
  }

  /** Ô "Giao cho" của đơn đứng tên mua: người nhận riêng (link) hoặc chính khách này. */
  const receiverCell = (o: SalesOrder): ReactNode => {
    if (!o.ship_to_customer_id) return <Text type="secondary">chính khách này</Text>
    if (!o.ship_to) return <Text type="warning">Không tìm thấy hồ sơ người nhận</Text>
    const st = o.ship_to
    return (
      <Tooltip title={`Người nhận hàng: ${st.name}${st.address ? ` — ${st.address}` : ''}`}>
        <Button
          type="link"
          size="small"
          style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'left' }}
          onClick={(e) => { e.stopPropagation(); openCustomer(st) }}
        >
          {countryFlag(st.country)} {partyShortName(st)}
        </Button>
      </Tooltip>
    )
  }

  // ── Edit ──
  const handleEdit = () => {
    if (!customer) return
    form.setFieldsValue({
      name: customer.name,
      short_name: customer.short_name,
      country: customer.country,
      region: customer.region,
      contact_person: customer.contact_person,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      tier: customer.tier,
      status: customer.status,
      payment_terms: customer.payment_terms,
      default_incoterm: customer.default_incoterm,
      default_currency: customer.default_currency,
      credit_limit: customer.credit_limit,
      notes: customer.notes,
      quality_standard: customer.quality_standard,
      preferred_grades: customer.preferred_grades,
      requires_pre_shipment_sample: customer.requires_pre_shipment_sample,
      // Cùng ô với modal ở trang danh sách (trước đây modal này thiếu hẳn trường này → 2 form lệch nhau)
      custom_specs: customSpecsToRows(customer.custom_specs),
    })
    setEditModalOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!customerId) return
    try {
      const values = await form.validateFields()
      setSaving(true)
      await salesCustomerService.update(customerId, {
        ...(values as Partial<CreateCustomerData>),
        custom_specs: rowsToCustomSpecs(values.custom_specs),   // dòng form → object jsonb
      })
      message.success('Đã cập nhật khách hàng')
      setEditModalOpen(false)
      loadData()
    } catch (err: any) {
      if (err?.errorFields) return // lỗi nhập liệu — form đã tô đỏ
      console.error('Lỗi cập nhật:', err)
      message.error(dichLoiHeThong(err, 'Cập nhật thất bại'))
    } finally {
      setSaving(false)
    }
  }

  // ── Ngừng hoạt động ──
  // salesCustomerService.delete() KHÔNG xoá: chuyển khách sang "Ngừng HĐ" (giữ lịch sử) và từ chối khi
  // khách còn đơn đang xử lý. Nhãn cũ "Xóa"/"Đã xóa" + nhảy về danh sách là nói sai việc hệ thống làm.
  const handleDeactivate = async () => {
    if (!customerId) return
    try {
      await salesCustomerService.delete(customerId)
      message.success(`Đã chuyển khách sang ${CUSTOMER_STATUS_LABELS.inactive}`)
      loadData()
    } catch (err) {
      console.error('Lỗi ngừng hoạt động:', err)
      message.error(dichLoiHeThong(err, 'Không chuyển được sang Ngừng hoạt động'), 6)
    }
  }

  // ── Order table columns (đơn khách ĐỨNG TÊN MUA) ──
  const anyShipTo = orders.some((o) => !!o.ship_to_customer_id)
  const orderColumns: ColumnsType<SalesOrder> = [
    {
      // Số HĐ (HA…) là số người dùng nhớ; đơn chưa có HĐ mới rơi về mã SO nội bộ
      title: 'Số HĐ',
      dataIndex: 'contract_no',
      key: 'contract_no',
      render: (_: string, record: SalesOrder) => {
        const fam = familyInfo(record, true)
        return (
          <div>
            <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => openOrder(record)}>
              {soDisplayCode(record)}
            </Button>
            {fam && <FamilyLine info={fam} />}
          </div>
        )
      },
    },
    ...(anyShipTo
      ? [{
          title: (
            <Tooltip title="Người nhận hàng của đơn — khách này vẫn đứng tên mua, trả tiền và chịu công nợ">
              <span>Giao cho</span>
            </Tooltip>
          ),
          key: 'ship_to',
          render: (_: unknown, record: SalesOrder) => receiverCell(record),
        }]
      : []),
    {
      title: 'Grade',
      dataIndex: 'grade',
      key: 'grade',
      render: (grade: string | null) => grade ? <Tag color="blue">{grade}</Tag> : DASH,
    },
    {
      title: 'Số lượng (tấn)',
      dataIndex: 'quantity_tons',
      key: 'quantity_tons',
      align: 'right',
      render: (v: number | null) => fmtNum(v, 2),
    },
    {
      title: 'Giá trị (USD)',
      dataIndex: 'total_value_usd',
      key: 'total_value_usd',
      align: 'right',
      render: (v: number | null) => fmtUsd(v),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <EnumTag value={status} labels={ORDER_STATUS_LABELS} colors={ORDER_STATUS_COLORS} />,
    },
    {
      title: 'Ngày đặt',
      dataIndex: 'order_date',
      key: 'order_date',
      render: (d: string) => fmtDate(d),
    },
    ...(familyReady && canCreateOrder
      ? [{
          title: '',
          key: 'continue',
          width: 112,
          render: (_: unknown, record: SalesOrder) => continueAction(record),
        }]
      : []),
  ]

  // ── Đơn khách là NGƯỜI NHẬN qua trung gian: Số đơn · Người mua · Grade · Tấn · Trạng thái · ETD (cố ý KHÔNG có tiền) ──
  const receivedColumns: ColumnsType<SalesOrder> = [
    {
      title: 'Số đơn',
      key: 'no',
      render: (_: unknown, record: SalesOrder) => {
        const fam = familyInfo(record, false)
        return (
          <div>
            <Button type="link" style={{ padding: 0, height: 'auto' }} onClick={() => openOrder(record)}>
              {soDisplayCode(record)}
            </Button>
            {fam && <FamilyLine info={fam} />}
          </div>
        )
      },
    },
    {
      title: (
        <Tooltip title="Bên đứng tên HĐ, trả tiền và chịu công nợ — khách đang xem chỉ là người nhận hàng">
          <span>Người mua (trung gian)</span>
        </Tooltip>
      ),
      key: 'buyer',
      render: (_: unknown, record: SalesOrder) => record.customer ? (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'left' }}
          onClick={() => openCustomer(record.customer as PartyRef)}
        >
          {countryFlag(record.customer.country)} {partyShortName(record.customer)}
        </Button>
      ) : DASH,
    },
    {
      title: 'Grade',
      dataIndex: 'grade',
      key: 'grade',
      render: (grade: string | null) => grade ? <Tag color="blue">{grade}</Tag> : DASH,
    },
    {
      title: 'Tấn',
      dataIndex: 'quantity_tons',
      key: 'quantity_tons',
      align: 'right',
      render: (v: number | null) => fmtNum(v, 2),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <EnumTag value={status} labels={ORDER_STATUS_LABELS} colors={ORDER_STATUS_COLORS} />,
    },
    {
      title: 'ETD',
      dataIndex: 'etd',
      key: 'etd',
      render: (d: string | null) => fmtDate(d),
    },
  ]

  // ── Custom specs table columns ──
  const customSpecColumns: ColumnsType<{ key: string; spec_key: string; spec_value: string }> = [
    { title: 'Thông số', dataIndex: 'spec_key', key: 'spec_key' },
    { title: 'Giá trị', dataIndex: 'spec_value', key: 'spec_value' },
  ]

  // ── Loading ──
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip="Đang tải..." />
      </div>
    )
  }

  if (loadError && !customer) {
    return <PageState error={loadError} onRetry={loadData} />
  }

  if (!customer) {
    return <Empty description="Không tìm thấy khách hàng" />
  }

  // ── Custom specs data ── (đọc được cả bản cũ lỡ lưu thành chuỗi JSON — trước đây vỡ thành từng ký tự)
  const customSpecData = customSpecsToRows(customer.custom_specs).map((r, i) => ({
    key: `${i}-${r.key}`,
    spec_key: r.key,
    spec_value: r.value,
  }))

  // ============================================
  // TAB ĐƠN HÀNG — "Đứng tên mua" | "Nhận qua trung gian"
  // ============================================

  // Chỉ hiện công tắc khi khách THỰC SỰ có đơn nhận qua trung gian (hoặc tải lỗi — không nuốt lỗi)
  const showReceivedSwitch = familyReady && (receivedQ.isError || received.length > 0)
  const view: OrdersView = showReceivedSwitch ? ordersView : 'buyer'
  const customerShort = partyShortName(customer)
  const receivedTons = received.reduce((s, o) => s + (Number(o.quantity_tons) || 0), 0)
  const receivedBuyers = [...new Set(received.map((o) => (o.customer ? partyShortName(o.customer) : '')).filter(Boolean))]

  const moreButton = (total: number) => total > phoneLimit && (
    <Button block onClick={() => setPhoneLimit((n) => n + PHONE_PAGE)}>
      Xem thêm {Math.min(PHONE_PAGE, total - phoneLimit)} đơn ({phoneLimit}/{total})
    </Button>
  )

  const buyerView = ordersError ? (
    <PageState error={ordersError} onRetry={loadData} />
  ) : (
    <>
      {familyReady && shipGroups.length > 0 && (
        <ShipToGroupsCard
          groups={shipGroups}
          totalOwn={orders.length}
          onOpenCustomer={openCustomer}
          onOpenOrder={openOrder}
        />
      )}
      {isPhone ? (
        orders.length === 0 ? (
          <Empty description="Chưa có đơn hàng nào khách này đứng tên mua" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {orders.slice(0, phoneLimit).map((o) => (
              <PhoneOrderCard
                key={o.id}
                order={o}
                family={familyInfo(o, true)}
                party={o.ship_to_customer_id ? <><Text type="secondary">Giao cho </Text>{receiverCell(o)}</> : undefined}
                meta={[o.grade || DASH, `${fmtNum(o.quantity_tons, 2)} t`, fmtUsd(o.total_value_usd), `Đặt ${fmtDate(o.order_date)}`]}
                action={continueAction(o)}
                onOpen={() => openOrder(o)}
              />
            ))}
            {moreButton(orders.length)}
          </div>
        )
      ) : (
        <Table
          dataSource={orders}
          columns={orderColumns}
          rowKey="id"
          pagination={stdPagination(20)}
          locale={{ emptyText: <Empty description="Chưa có đơn hàng nào khách này đứng tên mua" /> }}
          size="middle"
          scroll={{ x: 'max-content' }}
        />
      )}
    </>
  )

  const receivedView = (
    <PageState
      loading={receivedQ.isLoading}
      error={receivedQ.error}
      onRetry={() => { void receivedQ.refetch() }}
      empty={received.length === 0}
      emptyText="Không có đơn nào khách này nhận hàng qua trung gian"
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        title="Nhận hàng qua trung gian — không thuộc công nợ khách này"
        description={(
          <>
            {received.length} đơn · {fmtNum(receivedTons, 2)} t do{' '}
            <b>{receivedBuyers.length ? receivedBuyers.join(', ') : 'bên khác'}</b> đứng tên mua (ký HĐ, trả tiền, chịu
            công nợ); {customerShort} chỉ là <b>người nhận hàng</b>. Các đơn này KHÔNG cộng vào doanh thu, công nợ
            hay hạn mức của khách này.
          </>
        )}
      />
      {isPhone ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {received.slice(0, phoneLimit).map((o) => (
            <PhoneOrderCard
              key={o.id}
              order={o}
              family={familyInfo(o, false)}
              party={o.customer ? (
                <>
                  <Text type="secondary">Người mua </Text>
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, height: 'auto', whiteSpace: 'normal', textAlign: 'left' }}
                    onClick={(e) => { e.stopPropagation(); openCustomer(o.customer as PartyRef) }}
                  >
                    {countryFlag(o.customer.country)} {partyShortName(o.customer)}
                  </Button>
                </>
              ) : undefined}
              meta={[o.grade || DASH, `${fmtNum(o.quantity_tons, 2)} t`, `ETD ${fmtDate(o.etd)}`]}
              onOpen={() => openOrder(o)}
            />
          ))}
          {moreButton(received.length)}
        </div>
      ) : (
        <Table
          dataSource={received}
          columns={receivedColumns}
          rowKey="id"
          pagination={stdPagination(20)}
          size="middle"
          scroll={{ x: 'max-content' }}
        />
      )}
    </PageState>
  )

  const ordersTab = (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {showReceivedSwitch && (
          <Segmented<OrdersView>
            value={view}
            onChange={(v) => { setOrdersView(v); setPhoneLimit(PHONE_PAGE) }}
            block={isPhone}
            orientation={isPhone ? 'vertical' : 'horizontal'}
            options={[
              { value: 'buyer', label: `Đứng tên mua (${ordersError ? '!' : orders.length})` },
              { value: 'received', label: `Nhận qua trung gian (${receivedQ.isError ? '!' : received.length})` },
            ]}
          />
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginLeft: 'auto' }}>
          {familyReady && canCreateOrder && (
            <Tooltip title={`Khách mua thêm theo HĐ đã ký: chọn HĐ gốc của ${customerShort} — tạo đợt mới, không ký lại HĐ`}>
              <Button icon={<SubnodeOutlined />} onClick={() => setRootPickerOpen(true)}>
                Mua tiếp theo HĐ…
              </Button>
            </Tooltip>
          )}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate(`/sales/orders/new?customer_id=${customerId}`)}
          >
            Tạo đơn hàng mới
          </Button>
        </div>
      </div>
      {view === 'received' ? receivedView : buyerView}
    </div>
  )

  // KPI "Hàng về tay": chỉ khi khách có hàng nhận qua trung gian (không thì trùng ô "Số lượng") — lỗi thì hiện lỗi
  const volume = volumeQ.data ?? null
  const showVolume = familyReady && (volumeQ.isError || (!!volume && volume.via.orders > 0))

  // ============================================
  // TAB ITEMS
  // ============================================

  const tabItems = [
    {
      key: 'info',
      label: 'Thông tin',
      children: (
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={14}>
            <Descriptions
              bordered
              column={1}
              size="middle"
              title="Thông tin chung"
            >
              <Descriptions.Item label="Mã KH">{customer.code}</Descriptions.Item>
              <Descriptions.Item label="Tên">{customer.name}</Descriptions.Item>
              <Descriptions.Item label="Tên viết tắt">{customer.short_name || DASH}</Descriptions.Item>
              <Descriptions.Item label="Quốc gia">
                {countryLabel(customer.country)}
              </Descriptions.Item>
              <Descriptions.Item label="Khu vực">{customer.region || DASH}</Descriptions.Item>
              <Descriptions.Item label="Người liên hệ">{customer.contact_person || DASH}</Descriptions.Item>
              <Descriptions.Item label="Email">{customer.email || DASH}</Descriptions.Item>
              <Descriptions.Item label="Điện thoại">{customer.phone || DASH}</Descriptions.Item>
              <Descriptions.Item label="Địa chỉ">{customer.address || DASH}</Descriptions.Item>
              <Descriptions.Item label="Hạng">
                <Tag color={CUSTOMER_TIER_COLORS[customer.tier]}>
                  {CUSTOMER_TIER_LABELS[customer.tier]}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                <Tag color={CUSTOMER_STATUS_COLORS[customer.status]}>
                  {CUSTOMER_STATUS_LABELS[customer.status]}
                </Tag>
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="Thương mại" size="small">
              <Descriptions column={1} size="small">
                <Descriptions.Item label="Điều khoản TT">
                  {customer.payment_terms
                    ? PAYMENT_TERMS_LABELS[customer.payment_terms]
                    : DASH}
                </Descriptions.Item>
                <Descriptions.Item label="Incoterm mặc định">
                  {customer.default_incoterm
                    ? INCOTERM_LABELS[customer.default_incoterm]
                    : DASH}
                </Descriptions.Item>
                <Descriptions.Item label="Tiền tệ">
                  {customer.default_currency || DASH}
                </Descriptions.Item>
                <Descriptions.Item label="Hạn mức tín dụng">
                  {fmtUsd(customer.credit_limit)}
                </Descriptions.Item>
                <Descriptions.Item label="Ghi chú">
                  {customer.notes || DASH}
                </Descriptions.Item>
              </Descriptions>
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key: 'quality',
      label: 'Yêu cầu chất lượng',
      children: (
        <div>
          <Card size="small" style={{ marginBottom: 16 }}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="Tiêu chuẩn">
                {customer.quality_standard
                  ? QUALITY_STANDARD_LABELS[customer.quality_standard]
                  : DASH}
              </Descriptions.Item>
              <Descriptions.Item label="Yêu cầu mẫu trước xuất">
                {customer.requires_pre_shipment_sample ? (
                  <Tag color="green">Có</Tag>
                ) : (
                  <Tag color="default">Không</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Grade ưu tiên" span={2}>
                {customer.preferred_grades && customer.preferred_grades.length > 0
                  ? customer.preferred_grades.map((g) => (
                      <GradeBadge key={g} grade={g} />
                    ))
                  : DASH}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {customSpecData.length > 0 && (
            <Card title="Thông số tùy chỉnh" size="small">
              <Table
                dataSource={customSpecData}
                columns={customSpecColumns}
                pagination={false}
                size="small"
              />
            </Card>
          )}
        </div>
      ),
    },
    {
      key: 'export',
      label: 'Hồ sơ chứng từ',
      children: <CustomerExportProfileTab customerId={customer.id} />,
    },
    {
      key: 'doc-history',
      label: 'Lịch sử bộ chứng từ',
      children: <CustomerDocSetHistoryTab customerId={customer.id} />,
    },
    {
      key: 'orders',
      label: 'Đơn hàng',
      children: ordersTab,
    },
    {
      key: 'stats',
      label: 'Thống kê',
      children: (
        <>
          {ordersError ? (
            <PageState error={ordersError} onRetry={loadData} />
          ) : (
            <Row gutter={[16, 16]}>
              <Col xs={12} sm={6}>
                <Card>
                  <Statistic
                    title="Tổng đơn"
                    value={stats?.totalOrders || 0}
                    prefix={<ShoppingOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card>
                  <Statistic
                    title="Doanh thu (USD)"
                    value={stats?.totalRevenue || 0}
                    prefix={<DollarOutlined />}
                    formatter={(v) => fmtUsd(Number(v))}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card>
                  <Statistic
                    title="Số lượng (tấn)"
                    value={stats?.totalQuantity || 0}
                    prefix={<BarChartOutlined />}
                    formatter={(v) => fmtNum(Number(v), 2)}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={6}>
                <Card>
                  <Statistic
                    title="Đơn đang xử lý"
                    value={stats?.processingOrders || 0}
                    prefix={<FileTextOutlined />}
                    valueStyle={
                      (stats?.processingOrders || 0) > 0
                        ? { color: '#fa8c16' }
                        : undefined
                    }
                  />
                </Card>
              </Col>
              {familyReady && (
                <Col xs={24}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Bốn số trên CHỈ tính đơn khách này ĐỨNG TÊN MUA (chưa huỷ) — doanh thu, công nợ, hạn mức luôn theo
                    người mua; đơn nhận hàng qua trung gian không cộng vào đây.
                  </Text>
                </Col>
              )}
            </Row>
          )}
          {showVolume && (
            <Card
              size="small"
              style={{ marginTop: 16 }}
              title={(
                <span>
                  Hàng về tay khách này{' '}
                  <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>
                    (mua thẳng + nhận qua trung gian · chỉ tấn)
                  </Text>
                </span>
              )}
            >
              {volumeQ.isError || !volume ? (
                <PageState error={volumeQ.error} onRetry={() => { void volumeQ.refetch() }} minHeight={100} />
              ) : (
                <EndVolumeKpi v={volume} onOpenCustomer={openCustomer} />
              )}
            </Card>
          )}
        </>
      ),
    },
  ]

  // ============================================
  // RENDER
  // ============================================

  return (
    <div style={{ padding: '0 0 24px' }}>
      {/* ── Breadcrumb ── */}
      <Breadcrumb
        style={{ marginBottom: 16 }}
        items={[
          { title: 'Đơn hàng bán' },
          {
            title: <a onClick={() => navigate('/sales/customers')}>Khách hàng</a>,
          },
          { title: customer.name },
        ]}
      />

      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Space align="center" size="middle">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/sales/customers')}
          />
          <Title level={4} style={{ margin: 0 }}>
            {customer.name}
          </Title>
          <Tag color={CUSTOMER_TIER_COLORS[customer.tier]}>
            {CUSTOMER_TIER_LABELS[customer.tier]}
          </Tag>
        </Space>
        <Space>
          <Button icon={<EditOutlined />} onClick={handleEdit}>
            Sửa
          </Button>
          {/* Chỉ khách đang hoạt động — khách "Cấm GD" bấm vào sẽ bị hạ xuống "Ngừng HĐ" (mất cờ cấm) */}
          {customer.status === 'active' && (
            <Popconfirm
              title="Chuyển khách sang Ngừng hoạt động?"
              description={
                <div style={{ maxWidth: 340 }}>
                  Khách không bị xoá: {customer.order_count ? `${customer.order_count} đơn` : 'các đơn'} và lịch sử giữ
                  nguyên, chỉ không hiện trong danh sách chọn khi tạo đơn. Bật lại bằng Sửa → Trạng thái.
                  Khách còn đơn đang xử lý thì hệ thống sẽ từ chối.
                </div>
              }
              onConfirm={handleDeactivate}
              okText="Ngừng hoạt động"
              cancelText="Không"
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<StopOutlined />}>
                Ngừng hoạt động
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      {/* ── Tabs ── */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="large"
      />

      {/* ── Mua tiếp theo HĐ đã ký — lọc sẵn người mua = khách này ── */}
      {familyReady && canCreateOrder && (
        <RootContractPickerModal
          open={rootPickerOpen}
          onClose={() => setRootPickerOpen(false)}
          onPick={onPickRoot}
          buyerId={customer.id}
          title={`Mua tiếp theo HĐ đã ký của ${customerShort} — chọn HĐ gốc`}
        />
      )}

      {/* ── Edit Modal ── */}
      <Modal
        title="Sửa thông tin khách hàng"
        open={editModalOpen}
        onOk={handleSaveEdit}
        onCancel={() => setEditModalOpen(false)}
        confirmLoading={saving}
        okText="Lưu"
        cancelText="Hủy"
        width={700}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="Tên khách hàng"
                rules={[{ required: true, message: 'Vui lòng nhập tên' }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="short_name" label="Tên viết tắt">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contact_person" label="Người liên hệ">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email">
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="Điện thoại">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="country" label="Quốc gia">
                <Select allowClear showSearch optionFilterProp="label">
                  {COUNTRY_OPTIONS.map((c) => (
                    <Select.Option key={c.value} value={c.value} label={c.label}>{c.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="region" label="Khu vực">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="tier" label="Hạng">
                <Select>
                  {Object.entries(CUSTOMER_TIER_LABELS).map(([k, v]) => (
                    <Select.Option key={k} value={k}>{v}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="address" label="Địa chỉ">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="status" label="Trạng thái">
                <Select>
                  {Object.entries(CUSTOMER_STATUS_LABELS).map(([k, v]) => (
                    <Select.Option key={k} value={k}>{v}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="payment_terms" label="Điều khoản TT">
                <Select allowClear>
                  {Object.entries(PAYMENT_TERMS_LABELS).map(([k, v]) => (
                    <Select.Option key={k} value={k}>{v}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="default_incoterm" label="Incoterm mặc định">
                <Select allowClear>
                  {Object.entries(INCOTERM_LABELS).map(([k, v]) => (
                    <Select.Option key={k} value={k}>{v}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="default_currency" label="Tiền tệ">
                <Select allowClear>
                  {['USD', 'EUR', 'JPY', 'CNY'].map((c) => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="credit_limit" label="Hạn mức tín dụng (USD)">
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  {...usdInputProps}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="quality_standard" label="Tiêu chuẩn chất lượng">
                <Select allowClear>
                  {Object.entries(QUALITY_STANDARD_LABELS).map(([k, v]) => (
                    <Select.Option key={k} value={k}>{v}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="preferred_grades" label="Grade ưu tiên">
                <Select mode="multiple" allowClear showSearch optionFilterProp="label">
                  {SVR_GRADE_OPTIONS.map((g) => (
                    <Select.Option key={g.value} value={g.value} label={g.label}>{g.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="requires_pre_shipment_sample"
                label="Yêu cầu mẫu trước xuất"
                valuePropName="checked"
              >
                <Switch checkedChildren="Có" unCheckedChildren="Không" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={3} />
          </Form.Item>
          <CustomSpecsFormList />
        </Form>
      </Modal>
    </div>
  )
}
