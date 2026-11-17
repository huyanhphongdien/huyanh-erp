// ============================================================================
// SALES ORDER LIST PAGE — Danh sách Đơn hàng bán quốc tế
// File: src/pages/sales/SalesOrderListPage.tsx
// ============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Card,
  Table,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Typography,
  Row,
  Col,
  Tooltip,
  Statistic,
  Tabs,
  Popconfirm,
  DatePicker,
  Dropdown,
  Checkbox,
  Modal,
  message,
} from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { FilterValue, SorterResult, TableCurrentDataSource } from 'antd/es/table/interface'
import {
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  FileTextOutlined,
  EditOutlined,
  InboxOutlined,
  CarOutlined,
  RocketOutlined,
  SettingOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { salesOrderService, SORTABLE_ORDER_COLUMNS, nextOrderStatuses, familyTotals } from '../../services/sales/salesOrderService'
import type { SalesOrderStats, SalesOrderListParams, SortableOrderColumn } from '../../services/sales/salesOrderService'
import { isVnd, fmtMoney } from '../../services/sales/salesMoney'
import { dispatchService, deliveredTons, remainingTons, type LotProgress } from '../../services/logistics/dispatchService'
import LotProgressBadge, { DispatchChips } from '../../components/sales/LotProgressBadge'
import LotChipStrip, { mergeLotAxes } from '../../components/sales/LotChipStrip'
import { salesOrderPaymentService, type OrderLotMoney } from '../../services/sales/salesOrderPaymentService'
import StagePill from '../../components/common/StagePill'
import type { SalesStage } from '../../services/sales/salesStages'
import { getSLAStatus, SALES_STAGE_LABELS } from '../../services/sales/salesStages'
import { salesCustomerService } from '../../services/sales/salesCustomerService'
import {
  type SalesOrder,
  type SalesOrderStatus,
  type SalesCustomer,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  ORDER_KIND_LABELS,
  SVR_GRADE_OPTIONS,
  PACKING_TYPE_LABELS,
  type PackingType,
  soDisplayCode,
  countryFlag,
  partyShortName,
} from '../../services/sales/salesTypes'
import { exportSalesOrdersExcel } from '../../services/sales/salesOrderExcel'
import { fmtDate, fmtNum } from '../../utils/format'
import { dichLoiHeThong } from '../../utils/dichLoiHeThong'
import PageState from '../../components/common/PageState'
import { EnumTag } from '../../components/common/EnumTag'
import { palette } from '../../theme/palette'
import { useFamilyPartiesReady, salesOrderFamilyQueryKey } from './components/OrderFamilyChip'
import GradeBadge from '../../components/wms/GradeBadge'
import { useAuthStore } from '../../stores/authStore'
import { getSalesRole } from '../../services/sales/salesPermissionService'
import SalesOrderDetailPanel from './components/SalesOrderDetailPanel'
import SalesOrderSplitView from './components/SalesOrderSplitView'
import SalesCommandPalette from './components/SalesCommandPalette'
import { useOpenTab } from '../../hooks/useOpenTab'
import { useIsPhone } from '../../hooks/useIsPhone'
import SalesOrderPhoneList from './components/SalesOrderPhoneList'
import { userSavedViewsService, type SavedView } from '../../services/userSavedViewsService'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

// Cờ quốc gia: countryFlag() trong salesTypes (sinh từ mã ISO-2 — bỏ bảng tra 19 nước chép tay).

// ============================================
// FORMAT HELPERS
// ============================================

const SORT_FIELD_LABELS: Record<string, string> = {
  created_at: 'Ngày tạo',
  order_date: 'Ngày đặt hàng',
  etd: 'ETD (ngày tàu chạy)',
  delivery_date: 'Hạn giao',
  ready_date: 'Sẵn hàng',
  contract_no: 'Số HĐ',
  contract_no_sort_key: 'Số HĐ (theo số đơn)',
  customer_id: 'Khách hàng',
  grade: 'Grade',
  customer_po: 'PO khách',
  quantity_tons: 'Số lượng (tấn)',
  delivered_tons: 'Đã giao (tấn)',
  shortage: 'Còn thiếu (tấn)',
  unit_price: 'Đơn giá',
  total_value_usd: 'Thành tiền',
  incoterm: 'Incoterm',
  booking_reference: 'Số BKG',
  deposit_amount: 'Đặt cọc',
  discount_amount: 'CK',
  remaining_amount: 'Còn lại',
  payment_received_date: 'Ngày TT',
  code: 'Mã đơn',
  id: 'ID',
}

function sortFieldLabel(field: string): string {
  return SORT_FIELD_LABELS[field] || field
}

// Tiền: fmtMoney(v, currency, { decimals: 0 }) — đơn USD và VND cùng cột đều có ký hiệu ($ / ₫).
// Ngày: fmtDate (utils/format). Bỏ formatCurrency en-US không ký hiệu ("473,760" lẫn với cột tấn).
/** Đơn giá /tấn: giữ số lẻ khi có (1.752,5) — bảng tiền khác làm tròn 0 số lẻ. */
const fmtUnitPrice = (v: number, currency?: string | null): string =>
  fmtMoney(v, currency, { decimals: Number.isInteger(v) ? 0 : 2 })

/** Mục "Huỷ đơn…" trong ô đổi trạng thái — tách khỏi các bước đi tới. */
const CANCEL_ORDER_KEY = '__cancel__'

// ============================================
// SẮP XẾP — bảng ánh xạ DUY NHẤT: key của cột → tên cột trong DB
// ============================================
// Khoá là `key` của cột (không phải `dataIndex`) vì antd trả về cả hai và ta đọc
// `columnKey`. Cột nào KHÔNG có ở đây thì không sắp xếp được ở tầng DB — đúng ý đồ
// với cột client-only: delivered_tons, shortage, lot_progress, progress, index.
//
// Cột SỐ HĐ sắp theo `contract_no_sort_key` (generated column = 4 chữ số cuối của
// contract_no parse INT: HA20260001→1, HA20240046→46). Sắp tăng dần sẽ cho
// HA20260001, HA20260002, …, HA20240046, … — đơn 2024 chen giữa theo hậu tố số,
// đúng mong muốn của người dùng.
const SORT_FIELD_BY_COLUMN: Record<string, SortableOrderColumn> = {
  contract_no: 'contract_no_sort_key',
  customer: 'customer_id',
  grade: 'grade',
  lot: 'customer_po',
  qty: 'quantity_tons',
  delivery: 'delivery_date',
  ready_date: 'ready_date',
  incoterm: 'incoterm',
  bkg: 'booking_reference',
  etd: 'etd',
  unit_price: 'unit_price',
  total_usd: 'total_value_usd',
  deposit: 'deposit_amount',
  discount: 'discount_amount',
  discount_bank: 'discount_bank',
  remaining: 'remaining_amount',
  payment_date: 'payment_received_date',
}

// ============================================
// COLUMN VISIBILITY (M1 — Tùy chỉnh cột)
// ============================================
// Cột có thể ẩn/hiện qua dropdown "Tùy chỉnh cột". Default hide 4 cột chi
// tiết ít dùng — finance review mới enable lại. Persist qua localStorage.
// ⚠ Cột 'lot' nay mang nhãn "PO khách" (là customer_po) nhưng GIỮ key 'lot' — đổi key là mọi máy mất cấu hình
// ẩn/hiện đã nhớ. `family: true` = cột họ HĐ / người nhận, chỉ hiện khi đã migration sales_family_parties_p1.
const HIDEABLE_COLUMNS: { key: string; label: string; family?: boolean }[] = [
  { key: 'lot',           label: 'PO khách' },
  { key: 'ship_to',       label: 'Người nhận hàng', family: true },
  { key: 'family_root',   label: 'HĐ gốc', family: true },
  { key: 'family_seq',    label: 'Đợt', family: true },
  { key: 'ready_date',    label: 'Sẵn hàng' },
  { key: 'incoterm',      label: 'Incoterm' },
  { key: 'bkg',           label: 'Số BKG' },
  { key: 'deposit',       label: 'Đặt cọc' },
  { key: 'discount',      label: 'CK' },
  { key: 'discount_bank', label: 'NH CK' },
  { key: 'payment_date',  label: 'Tiền về' },
  { key: 'current_stage', label: 'Bộ phận' },
  { key: 'progress',      label: 'T.độ' },
  { key: 'status',        label: 'Trạng thái' },
]
const DEFAULT_HIDDEN_COLS = new Set(['lot', 'ready_date', 'discount_bank', 'payment_date', 'ship_to', 'family_root', 'family_seq'])
const COL_VISIBILITY_KEY = 'sales-order-hidden-cols-v1'
/** Danh sách cột đã biết lúc người dùng lưu cấu hình — để cột MỚI vẫn theo mặc định (ẩn) thay vì tự hiện ra. */
const COL_KNOWN_KEY = 'sales-order-known-cols-v1'
/** Cột đã có trước 17/11/2026 (cấu hình cũ không ghi danh sách cột đã biết → coi như biết đúng các cột này). */
const LEGACY_KNOWN_COLS = ['lot', 'ready_date', 'incoterm', 'bkg', 'deposit', 'discount', 'discount_bank', 'payment_date', 'current_stage', 'progress', 'status']

/**
 * Cấu hình ẩn cột đã lưu (máy này hoặc Bộ lọc đã lưu) + cột MỚI chưa có lúc lưu → cột mới theo mặc định.
 * Không có bước này thì ai từng bấm ẩn/hiện một cột sẽ thấy 3 cột họ HĐ tự bật lên.
 */
function withNewColumnDefaults(hidden: Iterable<string>, known?: unknown): Set<string> {
  const k = new Set<string>(Array.isArray(known) && known.length > 0 ? known.map(String) : LEGACY_KNOWN_COLS)
  const out = new Set<string>(hidden)
  for (const c of HIDEABLE_COLUMNS) if (!k.has(c.key) && DEFAULT_HIDDEN_COLS.has(c.key)) out.add(c.key)
  return out
}
const allColumnKeys = () => HIDEABLE_COLUMNS.map((c) => c.key)
/** Key các cột họ HĐ / người nhận — bỏ khỏi bảng khi chưa migration */
const FAMILY_COL_KEYS: ReadonlySet<string> = new Set(HIDEABLE_COLUMNS.filter((c) => c.family).map((c) => c.key))

/** Lọc theo HĐ gốc (chip "HĐ gốc: …"): id đơn gốc + số HĐ để hiện chip / lưu trong Bộ lọc đã lưu. */
type FamilyRootFilter = { id: string; label: string }
type CustomerRole = 'buyer' | 'receiver' | 'both'
type OrderKindFilter = 'all' | 'new' | 'continuation'
const CUSTOMER_ROLE_LABELS: Record<CustomerRole, string> = { buyer: 'Người mua', receiver: 'Người nhận', both: 'Cả hai' }

// Chữ phụ xám trong ô (cùng sắc xám bảng đang dùng)
const SUB_GRAY = '#8c8c8c'

/**
 * Khối "Các đợt cùng HĐ" trong dòng mở rộng — nạp khi MỞ dòng (getFamily, cùng khoá query với chip họ HĐ ở
 * chi tiết đơn). Không làm bảng cây: rc-table bỏ qua children khi có expandedRowRender, và bảng phân trang ở
 * server nên các đợt có thể nằm ở trang khác. Dòng cộng chỉ CỘNG các đơn — không phải mẫu số công nợ.
 */
function FamilyRowsBlock({ rootId, currentId, onOpen }: {
  rootId: string
  currentId: string
  onOpen: (id: string, label: string) => void
}) {
  const q = useQuery({
    queryKey: salesOrderFamilyQueryKey(rootId),
    queryFn: () => salesOrderService.getFamily(rootId),
    staleTime: 60 * 1000,
  })
  const members = q.data || []
  const totals = familyTotals(members)
  const root = members.find((m) => m.is_root)
  const rootNo = root ? soDisplayCode(root) : ''
  const cancelledN = members.length - totals.orders
  const vnd = members.some((m) => isVnd(m.currency))
  const th = (t: string, align: 'left' | 'right' = 'left') => (
    <th style={{ padding: '6px 10px', textAlign: align, fontWeight: 600, color: '#666', whiteSpace: 'nowrap' }}>{t}</th>
  )
  const td: React.CSSProperties = { padding: '5px 10px', whiteSpace: 'nowrap' }
  const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontFamily: 'monospace' }
  return (
    <div style={{ padding: '6px 0 2px' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: palette.brand, marginBottom: 4 }}>
        ⧉ Các đợt cùng HĐ {rootNo} ({q.isSuccess ? totals.orders : '…'})
        {cancelledN > 0 && <span style={{ fontWeight: 400, color: SUB_GRAY }}> · {cancelledN} đợt đã huỷ</span>}
        <span style={{ fontWeight: 400, color: SUB_GRAY }}> — mỗi đợt là một đơn riêng: tiền, lô, công nợ riêng</span>
      </div>
      <PageState
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        empty={q.isSuccess && members.length === 0}
        emptyText="Không còn đợt nào trong HĐ này"
        minHeight={60}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: palette.brandBg, borderBottom: '1px solid #f0f0f0' }}>
                {th('Đợt')}{th('Số đơn')}{th('Trạng thái')}{th('Bộ phận')}{th('Người nhận')}
                {th('Tấn', 'right')}{th('Đơn giá', 'right')}{th('ETD')}{th('Đã thu', 'right')}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.id === currentId
                const cancelled = m.status === 'cancelled'
                const lbl = soDisplayCode(m)
                return (
                  <tr key={m.id} style={{
                    borderBottom: '1px solid #f5f5f5', opacity: cancelled ? 0.55 : 1,
                    background: isSelf ? palette.brandBg : undefined,
                  }}>
                    <td style={td}><b>{m.seq}</b>{m.is_root && <span style={{ color: SUB_GRAY }}> · gốc</span>}</td>
                    <td style={td}>
                      {isSelf ? (
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{lbl} <span style={{ color: SUB_GRAY, fontWeight: 400 }}>(đang xem)</span></span>
                      ) : (
                        <Button type="link" size="small" style={{ padding: 0, height: 'auto', fontFamily: 'monospace' }}
                          onClick={(e) => { e.stopPropagation(); onOpen(m.id, lbl) }}>
                          {cancelled ? <s>{lbl}</s> : lbl}
                        </Button>
                      )}
                    </td>
                    <td style={td}><EnumTag value={m.status} labels={ORDER_STATUS_LABELS} colors={ORDER_STATUS_COLORS} style={{ margin: 0, fontSize: 11 }} /></td>
                    <td style={td}>{cancelled ? '—' : (SALES_STAGE_LABELS[(m.current_stage || 'sales') as SalesStage] ?? '—')}</td>
                    <td style={td}>
                      {m.ship_to_customer_id
                        ? (m.ship_to ? <Tooltip title={m.ship_to.name}><span>{partyShortName(m.ship_to)}</span></Tooltip> : <span style={{ color: '#cf1322' }}>không rõ</span>)
                        : <span style={{ color: SUB_GRAY }}>= người mua</span>}
                    </td>
                    <td style={tdNum}>{fmtNum(m.quantity_tons, 2)}</td>
                    <td style={tdNum}>{m.unit_price != null ? fmtUnitPrice(m.unit_price, m.currency) : '—'}</td>
                    <td style={td}>{fmtDate(m.etd)}</td>
                    <td style={tdNum}>{fmtMoney(m.actual_payment_amount, 'USD', { decimals: 0 })}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 12, color: '#374151', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
          <span><b>Cộng {totals.orders} đơn chưa huỷ:</b> {fmtNum(totals.tons, 2)} t</span>
          <span>trị giá {fmtMoney(totals.valueUsd, 'USD', { decimals: 0 })}{vnd ? ' (USD quy đổi)' : ''}</span>
          <span>đã thu {fmtMoney(totals.paidUsd, 'USD', { decimals: 0 })}</span>
          <span style={{ color: SUB_GRAY }}>(cộng các đơn — mỗi đơn một khoản phải thu riêng, không phải mẫu số công nợ)</span>
        </div>
      </PageState>
    </div>
  )
}

// ============================================
// TABS CONFIG
// ============================================

const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'draft', label: 'Nháp' },
  { key: 'confirmed', label: 'Đã xác nhận' },
  { key: 'producing', label: 'Đang SX' },
  { key: 'ready', label: 'Sẵn sàng' },
  { key: 'packing', label: '📦 Đóng gói' },
  { key: 'shipped', label: 'Đã xuất' },
  { key: 'delivered', label: 'Đã giao' },
  { key: 'invoiced', label: 'Đã lập HĐ' },
  { key: 'paid', label: 'Đã TT' },
]

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * Ô tìm kiếm Sổ đơn: giữ chữ đang gõ trong CHÍNH nó. Để chữ gõ ở state của cả trang thì mỗi phím vẽ lại bảng 25 cột
 * (gõ bị giật); trang chỉ nhận giá trị khi bấm Enter / xoá. `applied` kéo chữ về khi trang đổi (xoá bộ lọc, chọn chip HĐ gốc…).
 */
function OrderSearchBox({ applied, onSearch }: { applied: string; onSearch: (v: string) => void }) {
  const [text, setText] = useState(applied)
  useEffect(() => { setText(applied) }, [applied])
  return (
    <Input.Search
      placeholder="Tìm số HĐ, booking, B/L, grade..."
      allowClear
      value={text}
      onSearch={onSearch}
      onChange={(e) => {
        setText(e.target.value)
        if (!e.target.value) onSearch('')
      }}
      prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
    />
  )
}

const SalesOrderListPage = () => {
  const navigate = useNavigate()
  const openTab = useOpenTab()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const salesRole = getSalesRole(user)
  const isAdmin = salesRole === 'admin'

  // Mở chi tiết đơn thành tab (full editing) — phân biệt với row click (slide panel preview)
  const openOrderTab = (record: SalesOrder) => {
    const contractNo = soDisplayCode(record)
    openTab({
      key: `sales-order-${record.id}`,
      title: `Đơn ${contractNo}`,
      componentId: 'sales-order-detail',
      props: { orderId: record.id },
      path: `/sales/orders/${record.id}`,
    })
  }

  const openOrderTabById = (id: string, label: string) => openTab({
    key: `sales-order-${id}`,
    title: `Đơn ${label}`,
    componentId: 'sales-order-detail',
    props: { orderId: id },
    path: `/sales/orders/${id}`,
  })

  // Họ HĐ (mua tiếp) + người nhận: chỉ hiện khi migration sales_family_parties_p1 đã áp (đang tải / lỗi → ẩn)
  const familyReady = useFamilyPartiesReady()
  const queryClient = useQueryClient()

  // ĐIỆN THOẠI (≤ 640px): bảng 20 cột không dùng được → vẽ thẻ (SalesOrderPhoneList),
  // giấu Views/độ dày/Split/ẩn cột/Excel/chọn nhiều dòng. Dữ liệu + bộ lọc dùng chung.
  const isPhone = useIsPhone()
  const [phoneFiltersOpen, setPhoneFiltersOpen] = useState(false)
  const openCreateTab = () => openTab({
    key: 'sales-order-create',
    title: 'Tạo đơn hàng',
    componentId: 'sales-order-create',
    props: {},
    path: '/sales/orders/new',
  })

  // State
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [lotProgress, setLotProgress] = useState<Record<string, LotProgress>>({})  // trục GIAO theo lô
  const [lotPay, setLotPay] = useState<Record<string, OrderLotMoney>>({})          // trục TIỀN theo lô
  // Số đơn CẢ HỌ của các dòng GỐC trên trang (getFamilyCounts — 1 truy vấn, không nhúng ngược); ≥ 2 → "⧉ n đợt"
  const [familyCounts, setFamilyCounts] = useState<Record<string, number>>({})
  // DÒNG TỔNG — tính trên TOÀN BỘ đơn khớp bộ lọc (KHÔNG chỉ trang hiện tại).
  // Khách lọc Grade=RSS rồi hỏi "còn thiếu bao nhiêu tấn" ⇒ tổng của 10 dòng là vô nghĩa.
  const [summary, setSummary] = useState<{ orders: number; qty: number; delivered: number; shortage: number; estimated: boolean; truncated: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<SalesOrderStats>({
    total: 0,
    draft: 0,
    confirmed: 0,
    producing: 0,
    ready: 0,
    packing: 0,
    shipped: 0,
    delivered: 0,
    invoiced: 0,
    paid: 0,
    overdue_etd: 0,
    total_value_usd_month: 0,
    orders_this_month: 0,
  })
  const [customers, setCustomers] = useState<SalesCustomer[]>([])

  // Filters
  const [searchText, setSearchText] = useState('')
  // Chữ đang gõ trong ô tìm — ô có `value` để gỡ chip "Tìm: …" / Xoá tất cả / áp Bộ lọc đã lưu thì ô cũng trống
  // theo (trước đây ô không điều khiển: gỡ chip rồi mà chữ cũ vẫn nằm trong ô).
  const [searchBoxKey, setSearchBoxKey] = useState(0)   // tăng để ô tìm kiếm bỏ chữ gõ dở (xoá bộ lọc)
  // Họ HĐ + Các bên (service bỏ qua khi chưa migration → truyền thẳng, khỏi nạp 2 lần lúc cờ "ready" đổi)
  const [orderKind, setOrderKind] = useState<OrderKindFilter>('all')
  const [customerRole, setCustomerRole] = useState<CustomerRole>('buyer')
  const [familyRoot, setFamilyRoot] = useState<FamilyRootFilter | null>(null)
  const [statusTab, setStatusTab] = useState<string>(() => {
    try { return localStorage.getItem('sales-orders-status-tab') || 'all' } catch { return 'all' }
  })
  // Giữ tab lọc trạng thái khi F5
  useEffect(() => {
    try { localStorage.setItem('sales-orders-status-tab', statusTab) } catch { /* ignore */ }
  }, [statusTab])
  const [customerFilter, setCustomerFilter] = useState<string | undefined>(undefined)
  const [gradeFilter, setGradeFilter] = useState<string | undefined>(undefined)
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 })
  // Sort + column filter state (Ant Table onChange driven)
  // Default = created_at DESC (đơn mới tạo lên đầu) — chuẩn ERP cho daily ops.
  // Khi filter overdue_etd_only=true → auto-switch ETD asc để show urgent first.
  // Watchlist BGĐ là page riêng, mặc định ETD asc cho mục đích catch quá hạn.
  const [sortBy, setSortBy] = useState<string>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  // Filter "chỉ show đơn quá ETD" — set qua query param ?filter=overdue_etd
  const [overdueEtdOnly, setOverdueEtdOnly] = useState<boolean>(false)
  // Lọc 1 ngày ETD — lịch giao ở Dashboard truyền ?etd=YYYY-MM-DD (lọc cột etd, KHÔNG phải ngày đặt)
  const [etdDay, setEtdDay] = useState<string | null>(null)

  // Detail panel v4
  const [panelOrderId, setPanelOrderId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  // View mode: 'table' (default cũ) | 'split' (Linear/Gmail-style 2-cột)
  // Persist vào localStorage để giữ lựa chọn user
  const [viewMode, setViewMode] = useState<'table' | 'split'>(() => {
    const saved = localStorage.getItem('sales-orders-view-mode')
    return saved === 'split' ? 'split' : 'table'
  })
  const changeViewMode = (mode: 'table' | 'split') => {
    setViewMode(mode)
    localStorage.setItem('sales-orders-view-mode', mode)
  }

  // Row selection — checkbox tick từng đơn, hỗ trợ bulk action
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // M4-C: Density toggle (Compact / Normal / Comfortable) — persist localStorage
  type Density = 'compact' | 'normal' | 'comfortable'
  const [density, setDensity] = useState<Density>(() => {
    try {
      const saved = localStorage.getItem('sales-order-density-v1') as Density
      if (saved === 'compact' || saved === 'normal' || saved === 'comfortable') return saved
    } catch {}
    return 'normal'
  })
  const setDensityAndSave = (d: Density) => {
    setDensity(d)
    localStorage.setItem('sales-order-density-v1', d)
  }
  // Map density → Ant size + row CSS overrides
  const densityConfig = {
    compact: { size: 'small' as const, rowPadding: '4px 6px', fontSize: 11 },
    normal: { size: 'small' as const, rowPadding: '6px 8px', fontSize: 12 },
    comfortable: { size: 'middle' as const, rowPadding: '10px 12px', fontSize: 13 },
  }[density]

  // M1: Column visibility — persist localStorage
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(COL_VISIBILITY_KEY)
      if (saved) {
        const knownRaw = localStorage.getItem(COL_KNOWN_KEY)
        return withNewColumnDefaults(JSON.parse(saved), knownRaw ? JSON.parse(knownRaw) : null)
      }
    } catch {}
    return new Set(DEFAULT_HIDDEN_COLS)
  })
  const persistHiddenCols = (next: Set<string>) => {
    try {
      localStorage.setItem(COL_VISIBILITY_KEY, JSON.stringify([...next]))
      localStorage.setItem(COL_KNOWN_KEY, JSON.stringify(allColumnKeys()))
    } catch { /* trình duyệt chặn lưu → chỉ mất phần "nhớ theo máy" */ }
  }
  const toggleColumn = (key: string) => {
    setHiddenCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      persistHiddenCols(next)
      return next
    })
  }
  const resetColumns = () => {
    setHiddenCols(new Set(DEFAULT_HIDDEN_COLS))
    persistHiddenCols(new Set(DEFAULT_HIDDEN_COLS))
  }
  // Cột họ HĐ / người nhận chỉ có nghĩa khi đã migration
  const hideableCols = useMemo(
    () => HIDEABLE_COLUMNS.filter((c) => familyReady || !c.family),
    [familyReady],
  )
  const shownHideableCount = hideableCols.filter((c) => !hiddenCols.has(c.key)).length

  // M4-A: Active filter chips — build list từ state hiện tại
  const activeFilters = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = []
    if (searchText) {
      chips.push({ key: 'search', label: `Tìm: "${searchText}"`, onRemove: () => setSearchText('') })
    }
    if (statusTab !== 'all') {
      const t = STATUS_TABS.find(x => x.key === statusTab)
      chips.push({ key: 'status', label: `Trạng thái: ${t?.label || statusTab}`, onRemove: () => setStatusTab('all') })
    }
    if (customerFilter) {
      const c = customers.find(x => x.id === customerFilter)
      // Vai khác "Người mua" thì chip nói rõ — dòng tổng đang KHÁC tổng theo người mua
      const role = familyReady && customerRole !== 'buyer' ? ` (${CUSTOMER_ROLE_LABELS[customerRole].toLowerCase()})` : ''
      chips.push({ key: 'customer', label: `KH${role}: ${c ? partyShortName(c) : ''}`, onRemove: () => setCustomerFilter(undefined) })
    }
    if (familyReady && orderKind !== 'all') {
      chips.push({ key: 'order_kind', label: `Loại đơn: ${ORDER_KIND_LABELS[orderKind]}`, onRemove: () => setOrderKind('all') })
    }
    if (familyReady && familyRoot) {
      chips.push({ key: 'family_root', label: `⧉ HĐ gốc: ${familyRoot.label}`, onRemove: () => setFamilyRoot(null) })
    }
    if (gradeFilter) {
      chips.push({ key: 'grade', label: `Grade: ${gradeFilter}`, onRemove: () => setGradeFilter(undefined) })
    }
    if (dateRange) {
      chips.push({
        key: 'date',
        label: `${dateRange[0].format('DD/MM')} → ${dateRange[1].format('DD/MM')}`,
        onRemove: () => setDateRange(null),
      })
    }
    if (overdueEtdOnly) {
      chips.push({ key: 'overdue', label: '🚨 Quá ETD', onRemove: () => { setOverdueEtdOnly(false); setSearchParams({}) } })
    }
    if (etdDay) {
      chips.push({ key: 'etd', label: `ETD: ${fmtDate(etdDay)}`, onRemove: () => { setEtdDay(null); setSearchParams({}) } })
    }
    return chips
  }, [searchText, statusTab, customerFilter, gradeFilter, dateRange, overdueEtdOnly, etdDay, customers, setSearchParams,
    familyReady, customerRole, orderKind, familyRoot])

  const clearAllFilters = () => {
    setSearchText('')
    setSearchBoxKey((k) => k + 1)
    setStatusTab('all')
    setCustomerFilter(undefined)
    setCustomerRole('buyer')
    setOrderKind('all')
    setFamilyRoot(null)
    setGradeFilter(undefined)
    setDateRange(null)
    setOverdueEtdOnly(false)
    setEtdDay(null)
    setSearchParams({})
    setPagination(p => ({ ...p, current: 1 }))
  }

  /**
   * Bấm "⧉ n đợt" (gốc) hoặc "Đợt n · HĐ X" (đợt) → chip "HĐ gốc: X" = hiện ĐỦ cả họ (gốc + các đợt).
   * Bỏ các bộ lọc có thể giấu bớt đợt (tìm chữ, tab trạng thái, grade, ngày, ETD) — gõ 'HA20260302' rồi bấm
   * "⧉ 2 đợt" mà vẫn giữ ô tìm thì đợt mang số riêng HA20260301 bị giấu, đúng thứ người dùng muốn thấy.
   */
  const applyFamilyRoot = (id: string, label: string) => {
    // Lọc khách theo vai NGƯỜI MUA không giấu đợt nào (trigger bắt cả họ cùng người mua) → giữ; vai khác thì bỏ.
    const dropCustomer = !!customerFilter && customerRole !== 'buyer'
    const hadOthers = !!searchText || statusTab !== 'all' || !!gradeFilter || !!dateRange || overdueEtdOnly
      || !!etdDay || orderKind !== 'all' || dropCustomer
    setFamilyRoot({ id, label })
    setSearchText('')
    setSearchBoxKey((k) => k + 1)
    setStatusTab('all')
    if (dropCustomer) {
      setCustomerFilter(undefined)
      setCustomerRole('buyer')
    }
    setOrderKind('all')
    setGradeFilter(undefined)
    setDateRange(null)
    setOverdueEtdOnly(false)
    setEtdDay(null)
    if (searchParams.toString()) setSearchParams({})
    setPagination(p => ({ ...p, current: 1 }))
    message.info(`Đang lọc theo HĐ gốc ${label} — gốc + các đợt mua tiếp${hadOthers ? ' (đã bỏ các bộ lọc khác để hiện đủ)' : ''}`)
  }

  // M4-B: Saved views per user
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [saveViewModalOpen, setSaveViewModalOpen] = useState(false)
  const [newViewName, setNewViewName] = useState('')

  useEffect(() => {
    userSavedViewsService.list('sales_orders')
      .then(setSavedViews)
      .catch(err => console.warn('Saved views load failed (table may not exist yet):', err))
  }, [])

  // M4-F: Realtime collab — subscribe sales_orders table changes
  // Audit 17/11/2026: trước đây MỖI biến động (kể cả đơn ngoài trang) refetch cả trang ngay lập tức
  // và toast "Đơn mới" cho mọi người; đang sửa inline thì dữ liệu dưới tay bị thay; callback còn giữ
  // fetchOrders CŨ (deps [orders.length]) nên đổi bộ lọc xong có thể bị nạp lại theo bộ lọc cũ.
  // Nay: gom sự kiện 3 giây, hoãn khi đang mở ô sửa inline, luôn gọi bản fetch MỚI NHẤT qua ref.
  const ordersRef = useRef<SalesOrder[]>([])
  const editingRef = useRef<{ rowId: string; key: string } | null>(null)
  const refetchRef = useRef<() => void>(() => {})
  const rtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const run = () => {
      if (editingRef.current) { rtTimerRef.current = setTimeout(run, 3000); return }   // đang sửa → hoãn
      rtTimerRef.current = null
      refetchRef.current()
    }
    const scheduleRefetch = () => {
      if (rtTimerRef.current) clearTimeout(rtTimerRef.current)
      rtTimerRef.current = setTimeout(run, 3000)
    }
    const channel = supabase
      .channel('sales-orders-list-realtime')
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'sales_orders' },
        (payload: any) => {
          const row = payload.new || payload.old
          const code = (row as any)?.contract_no || (row as any)?.code || ''
          const visible = ordersRef.current.some(o => o.id === (row as any)?.id)
          // INSERT: không toast cho mọi người — đơn mới hiện ở lần nạp lại nếu khớp bộ lọc.
          if (payload.eventType === 'UPDATE' && visible) {
            message.info(`✏️ Đơn ${code} vừa được cập nhật`)
          } else if (payload.eventType === 'DELETE' && visible) {
            message.warning(`🗑 Đơn ${code} đã bị xóa`)
          }
          scheduleRefetch()
        },
      )
      .subscribe()

    return () => {
      if (rtTimerRef.current) clearTimeout(rtTimerRef.current)
      supabase.removeChannel(channel)
    }
  }, [])

  const applyView = (v: SavedView) => {
    const f = v.filters || {}
    setSearchText(f.searchText || '')
    setStatusTab(f.statusTab || 'all')
    setCustomerFilter(f.customerFilter || undefined)
    setGradeFilter(f.gradeFilter || undefined)
    setDateRange(f.dateRange ? [dayjs(f.dateRange[0]), dayjs(f.dateRange[1])] : null)
    setOverdueEtdOnly(!!f.overdueEtdOnly)
    setEtdDay(null)
    // Họ HĐ + vai khách (bộ lọc lưu trước 17/11/2026 không có → về mặc định)
    setOrderKind(f.orderKind === 'new' || f.orderKind === 'continuation' ? f.orderKind : 'all')
    setCustomerRole(f.customerRole === 'receiver' || f.customerRole === 'both' ? f.customerRole : 'buyer')
    setFamilyRoot(f.familyRoot && typeof f.familyRoot.id === 'string'
      ? { id: f.familyRoot.id, label: String(f.familyRoot.label || '') }
      : null)
    if (v.columns?.hiddenCols) {
      // Bộ lọc lưu trước khi có cột mới → cột mới vẫn ẩn theo mặc định
      setHiddenCols(withNewColumnDefaults(v.columns.hiddenCols, v.columns.knownCols))
    }
    if (v.sort?.sortBy) {
      // v.sort là JSONB tự do trong user_saved_views — không có gì bảo đảm nó còn là cột
      // hợp lệ (view cũ, cột đã đổi tên, sửa tay trong DB). Service cũng kẹp lần hai, nhưng
      // kẹp ở ĐÂY để state khớp với cái server thật sự dùng — nếu không thì dữ liệu sắp
      // theo order_date mà bảng không cột nào sáng mũi tên, người dùng thấy thứ tự lạ
      // và không biết vì sao.
      const s = v.sort.sortBy
      if (SORTABLE_ORDER_COLUMNS.has(s)) {
        setSortBy(s)
      } else {
        setSortBy('created_at')
        message.warning(`Bộ lọc "${v.name}" sắp xếp theo cột không còn dùng được — đã về mặc định.`)
      }
      setSortOrder(v.sort.sortOrder || 'desc')
    }
    if (v.density && ['compact', 'normal', 'comfortable'].includes(v.density)) {
      setDensityAndSave(v.density as Density)
    }
    message.success(`Đã áp dụng bộ lọc: ${v.name}`)
  }

  const handleSaveView = async () => {
    if (!newViewName.trim()) {
      message.warning('Nhập tên bộ lọc')
      return
    }
    try {
      const view = await userSavedViewsService.create({
        module: 'sales_orders',
        name: newViewName.trim(),
        filters: {
          searchText, statusTab, customerFilter, gradeFilter,
          dateRange: dateRange ? [dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD')] : null,
          overdueEtdOnly,
          orderKind, customerRole, familyRoot,
        },
        columns: { hiddenCols: [...hiddenCols], knownCols: allColumnKeys() },
        sort: { sortBy, sortOrder },
        density,
      })
      setSavedViews(prev => [...prev, view])
      setSaveViewModalOpen(false)
      setNewViewName('')
      message.success(`Đã lưu bộ lọc: ${view.name}`)
    } catch (e: any) {
      message.error(dichLoiHeThong(e, 'Không lưu được bộ lọc'))
    }
  }

  const handleDeleteView = async (id: string) => {
    try {
      await userSavedViewsService.delete(id)
      setSavedViews(prev => prev.filter(v => v.id !== id))
      message.success('Đã xóa bộ lọc đã lưu')
    } catch (e: any) {
      message.error(dichLoiHeThong(e, 'Không xóa được'))
    }
  }

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
    columnWidth: 36,
    fixed: true as const,
  }

  const selectedOrders = useMemo<SalesOrder[]>(
    () => orders.filter((o: SalesOrder) => selectedRowKeys.includes(o.id)),
    [orders, selectedRowKeys],
  )

  // Export Excel — dùng service riêng (salesOrderExcel.ts), tái dùng ĐÚNG helper
  // deliveredTons/remainingTons → số trong file KHÔNG thể lệch số trên màn hình.
  const [exportingAll, setExportingAll] = useState(false)

  /** Mô tả bộ lọc đang áp — in lên đầu file để biết đây là báo cáo gì. */
  const filterDesc = useMemo(() => {
    const p: string[] = []
    if (statusTab && statusTab !== 'all') p.push(`Trạng thái: ${ORDER_STATUS_LABELS[statusTab as SalesOrderStatus] || statusTab}`)
    if (gradeFilter) p.push(`Grade: ${gradeFilter}`)
    if (customerFilter) {
      const role = familyReady && customerRole !== 'buyer' ? ` (vai ${CUSTOMER_ROLE_LABELS[customerRole].toLowerCase()})` : ''
      p.push(`Khách${role}: ${customers.find((c) => c.id === customerFilter)?.name || customerFilter}`)
    }
    if (familyReady && orderKind !== 'all') p.push(`Loại đơn: ${ORDER_KIND_LABELS[orderKind]}`)
    if (familyReady && familyRoot) p.push(`HĐ gốc: ${familyRoot.label} (gốc + các đợt)`)
    if (dateRange?.[0] && dateRange?.[1]) p.push(`Ngày đặt: ${dateRange[0].format('DD/MM/YYYY')} → ${dateRange[1].format('DD/MM/YYYY')}`)
    if (searchText) p.push(`Tìm: "${searchText}"`)
    if (overdueEtdOnly) p.push('Chỉ đơn quá ETD')
    if (etdDay) p.push(`ETD: ${fmtDate(etdDay)}`)
    return p.join(' · ')
  }, [statusTab, gradeFilter, customerFilter, dateRange, searchText, overdueEtdOnly, etdDay, customers,
    familyReady, customerRole, orderKind, familyRoot])

  /**
   * Tham số lọc DÙNG CHUNG cho nạp trang, xuất Excel "theo bộ lọc" và DÒNG TỔNG (getAllForSummary) — một chỗ,
   * kẻo file Excel / dòng tổng lọc khác danh sách. Họ HĐ + vai khách: service tự bỏ qua khi chưa migration.
   */
  const baseParams = useMemo<SalesOrderListParams>(() => ({
    search: searchText || undefined,
    status: statusTab !== 'all' ? (statusTab as SalesOrderStatus) : undefined,
    customer_id: customerFilter || undefined,
    customer_role: customerFilter ? customerRole : undefined,
    grade: gradeFilter || undefined,
    date_from: dateRange?.[0]?.format('YYYY-MM-DD') || undefined,
    date_to: dateRange?.[1]?.format('YYYY-MM-DD') || undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
    overdue_etd_only: overdueEtdOnly || undefined,
    etd_from: etdDay || undefined,
    etd_to: etdDay || undefined,
    order_kind: orderKind !== 'all' ? orderKind : undefined,
    family_root: familyRoot?.id || undefined,
  }), [searchText, statusTab, customerFilter, customerRole, gradeFilter, dateRange, sortBy, sortOrder,
    overdueEtdOnly, etdDay, orderKind, familyRoot])

  const handleExportSelected = async () => {
    if (selectedOrders.length === 0) return
    try {
      // ⚠ Lấy CẢ HAI trục. Thiếu lotPay thì cột "Thu (lô)" trong file trống trong khi
      // màn hình có số — file Excel và màn hình nói khác nhau.
      const ids = selectedOrders.map((o) => o.id)
      const [prog, pay] = await Promise.all([
        dispatchService.getLotProgressForOrders(ids),
        // Trục tiền hỏng thì mất MỘT cột; để nó ném ra là mất CẢ file.
        salesOrderPaymentService.getLotPaymentForOrders(ids).catch(() => ({})),
      ])
      await exportSalesOrdersExcel({
        orders: selectedOrders, lotProgress: prog, lotPay: pay, filterDesc, scopeLabel: 'Đơn đã chọn',
        // Đơn đã chọn nằm trên trang đang xem → số đợt của các dòng gốc đã có sẵn
        familyCounts,
      })
      message.success(`Đã xuất ${selectedOrders.length} đơn`)
    } catch (e: any) {
      console.error(e)
      message.error(dichLoiHeThong(e, 'Lỗi xuất Excel'))
    }
  }

  /**
   * Xuất TẤT CẢ đơn theo bộ lọc hiện tại — không chỉ trang hiện tại / đơn đã tick.
   * Trước đây muốn xuất 79 đơn phải tick từng cái.
   */
  const handleExportAll = async () => {
    setExportingAll(true)
    try {
      const PAGE = 200, CAP = 3000
      const all: SalesOrder[] = []
      let grand = 0
      for (let page = 1; (page - 1) * PAGE < CAP; page++) {
        const res = await salesOrderService.getList({ ...baseParams, page, pageSize: PAGE })
        grand = res.total
        all.push(...res.data)
        if (all.length >= res.total || res.data.length < PAGE) break
      }
      if (all.length === 0) { message.info('Không có đơn nào khớp bộ lọc'); return }
      // Cắt bớt thì phải NÓI, không im lặng xuất thiếu.
      if (all.length < grand) {
        message.warning(`Chỉ xuất ${all.length}/${grand} đơn (giới hạn ${CAP}) — thu hẹp bộ lọc để xuất đủ`)
      }
      // Cả hai trục, giống chỗ xuất đơn đã chọn — hai chỗ phải sửa cùng lúc.
      const allIds = all.map((o) => o.id)
      const [prog, pay, fam] = await Promise.all([
        dispatchService.getLotProgressForOrders(allIds),
        salesOrderPaymentService.getLotPaymentForOrders(allIds).catch(() => ({})),   // mất 1 cột còn hơn mất cả file
        // Số đợt cho các đơn GỐC (cột "Số HĐ gốc"/"Đợt" của dòng gốc) — hỏng thì 2 cột đó trống ở dòng gốc
        salesOrderService.getFamilyCounts(all.filter((o) => !o.parent_order_id).map((o) => o.id))
          .catch((e) => { console.error('[sales] Không đếm được các đợt mua tiếp khi xuất Excel:', e); return {} as Record<string, number> }),
      ])
      await exportSalesOrdersExcel({
        orders: all, lotProgress: prog, lotPay: pay, filterDesc, scopeLabel: 'Tất cả theo bộ lọc', familyCounts: fam,
      })
      message.success(`Đã xuất ${all.length} đơn`)
    } catch (e: any) {
      console.error(e)
      message.error(dichLoiHeThong(e, 'Lỗi xuất Excel'))
    } finally {
      setExportingAll(false)
    }
  }

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const params: SalesOrderListParams = {
        ...baseParams,
        page: pagination.current,
        pageSize: pagination.pageSize,
      }
      const response = await salesOrderService.getList(params)
      setOrders(response.data)
      setTotal(response.total)
      // Khối "Các đợt cùng HĐ" đang mở (dòng mở rộng) nạp lại theo dữ liệu mới — đổi trạng thái / realtime / huỷ đợt
      queryClient.invalidateQueries({ queryKey: ['sales-order-family'] })
      // Tiến độ lô cho 3 view (best-effort, không chặn list)
      const ids = response.data.map((o) => o.id)

      // Số đợt cho các dòng GỐC trên trang ("⧉ n đợt") — best-effort như tiến độ lô; hỏng thì xoá trắng + log,
      // dòng gốc chỉ mất chữ "⧉ n đợt" (đợt con vẫn có "Đợt n · HĐ X" vì đọc ngay từ dòng).
      salesOrderService.getFamilyCounts(response.data.filter((o) => !o.parent_order_id).map((o) => o.id))
        .then(setFamilyCounts)
        .catch((e) => { console.error('[sales] Không đếm được các đợt mua tiếp:', e); setFamilyCounts({}) })
      dispatchService.getLotProgressForOrders(ids)
        .then(setLotProgress)
        // Hỏng thì XOÁ TRẮNG tiến độ lô, đừng giữ số của lần tải trước — số cũ đứng cạnh
        // danh sách mới là số sai mà trông vẫn hợp lý. Và phải log: khi lotProgress rỗng,
        // remainingTons() trả về NGUYÊN số lượng hợp đồng và được vẽ tự tin ở cột
        // "Còn thiếu (T)" — im lặng ở đây nghĩa là con số đó sai mà không ai biết.
        .catch((e) => { console.error('[sales] Không tải được tiến độ lô:', e); setLotProgress({}) })

      // Trục TIỀN theo lô — nuôi máng dưới của viên lô. Best-effort riêng: hỏng trục tiền
      // thì viên vẫn vẽ được trục giao, chỉ mất máng.
      salesOrderPaymentService.getLotPaymentForOrders(ids)
        .then(setLotPay)
        .catch((e) => { console.error('[sales] Không tải được tiền theo lô:', e); setLotPay({}) })

      // DÒNG TỔNG trên TOÀN BỘ bộ lọc (best-effort — lỗi thì ẩn dòng tổng, không chặn list)
      salesOrderService.getAllForSummary(params)
        .then(async ({ rows, truncated }) => {
          const live = rows.filter((r) => r.status !== 'cancelled')   // đơn hủy KHÔNG phải nợ hàng
          const prog = await dispatchService.getLotProgressForOrders(live.map((r) => r.id))
          let qty = 0, delivered = 0, shortage = 0, estimated = false
          for (const r of live) {
            qty += r.quantity_tons || 0
            const d = deliveredTons(r.quantity_tons, prog[r.id], r.status)
            delivered += d.tons
            if (d.estimated) estimated = true
            shortage += remainingTons(r.quantity_tons, prog[r.id], r.status)
          }
          setSummary({ orders: live.length, qty, delivered, shortage, estimated, truncated })
        })
        .catch(() => setSummary(null))
    } catch (error) {
      // Lỗi tải ≠ "không có đơn": hiện khối lỗi + Thử lại thay cho bảng (không để danh sách cũ/rỗng giả).
      console.error('Error fetching orders:', error)
      setLoadError(error || new Error('Không thể tải danh sách đơn hàng'))
    } finally {
      setLoading(false)
    }
  }, [pagination, baseParams, queryClient])

  const fetchStats = useCallback(async () => {
    try {
      const data = await salesOrderService.getStats()
      setStats(data)
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }, [])

  const fetchCustomers = useCallback(async () => {
    try {
      const data = await salesCustomerService.getAllActive()
      setCustomers(data)
    } catch (error) {
      console.error('Error fetching customers:', error)
    }
  }, [])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Realtime luôn gọi bản fetch MỚI NHẤT (đúng bộ lọc hiện tại) + biết danh sách đang hiện
  ordersRef.current = orders
  refetchRef.current = () => { fetchOrders(); fetchStats() }

  useEffect(() => {
    fetchStats()
    fetchCustomers()
  }, [fetchStats, fetchCustomers])

  // Parse query param ?filter=overdue_etd để jump từ Watchlist
  // → Khi filter active, auto-switch sort sang ETD asc (urgent first)
  useEffect(() => {
    const filter = searchParams.get('filter')
    if (filter === 'overdue_etd') {
      setOverdueEtdOnly(true)
      setSortBy('etd')
      setSortOrder('asc')
    }
    // Lịch giao trên Sales Dashboard truyền ?etd=YYYY-MM-DD → lọc đúng cột ETD (bản trước nhét vào
    // bộ lọc NGÀY ĐẶT — bấm ô "ETD 20/11" lại ra các đơn đặt ngày 20/11). Chip "ETD: …" gỡ được.
    const etd = searchParams.get('etd')
    if (etd && /^\d{4}-\d{2}-\d{2}$/.test(etd) && dayjs(etd).isValid()) {
      setEtdDay(etd)
      setPagination((p) => ({ ...p, current: 1 }))
    }
  }, [searchParams])

  // ============================================
  // HANDLERS
  // ============================================

  const handleSearch = (value: string) => {
    setSearchText(value)
    setPagination((prev) => ({ ...prev, current: 1 }))
  }

  const handleTabChange = (key: string) => {
    setStatusTab(key)
    setPagination((prev) => ({ ...prev, current: 1 }))
  }

  /**
   * Ant Table onChange — gọi khi user pagination, sort, filter
   * Map sorter.field → server sort_by; map filters.grade → gradeFilter state
   */
  const handleTableChange = (
    pag: TablePaginationConfig,
    filters: Record<string, FilterValue | null>,
    sorter: SorterResult<SalesOrder> | SorterResult<SalesOrder>[],
    extra: TableCurrentDataSource<SalesOrder>,
  ) => {
    setPagination({
      current: pag.current || 1,
      pageSize: pag.pageSize || 10,
    })

    // ─── SẮP XẾP ────────────────────────────────────────────────────────────
    // Nhận biết "người dùng vừa bấm sắp xếp" bằng extra.action, KHÔNG bằng sự có mặt
    // của sorter. Lý do: khi huỷ sort (bấm lần 3), antd 6.3.2 xoá SẠCH cả columnKey lẫn
    // field lẫn order (useSorter.js:221-229) — nên nếu dò theo sorter thì nhánh huỷ là
    // CODE CHẾT, người dùng bấm lần 3 không có gì xảy ra. Ngược lại, dò `!single.order`
    // đơn thuần cũng sai: điều kiện đó đúng cả khi đổi trang/lọc lúc không cột nào active,
    // và sẽ ghi đè sort mà người dùng đang có.
    if (extra?.action === 'sort') {
      const single = Array.isArray(sorter) ? sorter[0] : sorter
      // ⚠ PHẢI đọc columnKey, KHÔNG phải field.
      // antd đặt `field: column.dataIndex` và `columnKey: column.key`
      // (node_modules/antd/es/table/hooks/useSorter.js:211-212), còn bảng ánh xạ khoá theo
      // KEY. Cột nào có key ≠ dataIndex — lot/customer_po, qty/quantity_tons,
      // delivery/delivery_date, bank, bkg, total_usd, deposit, discount, remaining,
      // payment_date — thì tra theo field ra undefined rồi thoát im lặng. Hậu quả:
      // 10/17 cột bấm sắp xếp KHÔNG có gì xảy ra, mũi tên cũng không đổi (sortOrder là
      // controlled) nên không ai nghi ngờ. Bug có từ trước 26/08/2026.
      const key = single?.order ? String(single.columnKey ?? single.field ?? '') : ''
      const mapped = key ? SORT_FIELD_BY_COLUMN[key] : undefined

      if (mapped && single?.order) {
        setSortBy(mapped)
        setSortOrder(single.order === 'ascend' ? 'asc' : 'desc')
      } else if (!single?.order) {
        // Bấm lần 3 → bỏ sắp xếp → về mặc định
        setSortBy('created_at')
        setSortOrder('desc')
      }
      // mapped rỗng mà vẫn có order = cột client-only lỡ được gắn sorter → bỏ qua sắp xếp,
      // nhưng KHÔNG return: phần đồng bộ bộ lọc bên dưới vẫn phải chạy, vì antd gửi cả
      // sorter lẫn filters trong CÙNG một lần onChange.

      // Sắp xếp lại thì phải về trang 1. antd cố tình không reset phân trang cho hành động
      // sort (InternalTable.js:203-207 truyền reset = false, khác với lọc). Không ép về 1
      // thì đang ở trang 4 bấm "Thành tiền" sẽ thấy hạng 31-40 và tưởng đó là đơn to nhất.
      setPagination((prev) => ({ ...prev, current: 1 }))
    }
    // Trường hợp khác (đổi trang, lọc): GIỮ NGUYÊN sort hiện tại.

    // Filter: chỉ grade hiện hỗ trợ ở column header (đồng bộ với gradeFilter ở toolbar)
    if (filters.grade && filters.grade.length > 0) {
      setGradeFilter(String(filters.grade[0]))
    } else if (filters.grade !== undefined) {
      // user clear filter
      setGradeFilter(undefined)
    }
  }

  const actor = { id: user?.employee_id || user?.id || null, name: user?.full_name || user?.email || null }

  // ── Đổi trạng thái inline (audit 17/11/2026, sev4) ──
  // Chỉ cho chọn các bước đi TỚI theo đúng bảng luật của service (nextOrderStatuses = VALID_TRANSITIONS
  // mà updateStatus dùng để chặn) + hỏi xác nhận như Kanban. KHÔNG dùng STAGE_RANK của Kanban: đó là
  // trục "bộ phận" (current_stage), còn ô này đổi cột status.
  const confirmStatusChange = (order: SalesOrder, to: SalesOrderStatus) => {
    Modal.confirm({
      title: `Chuyển ${soDisplayCode(order)} sang "${ORDER_STATUS_LABELS[to]}"?`,
      content: `Trạng thái hiện tại: ${ORDER_STATUS_LABELS[order.status]}. Quy trình chỉ đi tới — muốn lùi lại phải nhờ admin.`
        + (to === 'shipped' ? ' Chuyển "Đã xuất" sẽ chốt toàn bộ hàng đã phân bổ của đơn là đã rời kho.' : ''),
      okText: 'Chuyển trạng thái',
      cancelText: 'Để sau',
      onOk: async () => {
        try {
          await salesOrderService.updateStatus(order.id, to, { actor })
          message.success(`Đã chuyển ${soDisplayCode(order)} → ${ORDER_STATUS_LABELS[to]}`)
          fetchOrders()
          fetchStats()
        } catch (e) {
          message.error(dichLoiHeThong(e, 'Không đổi được trạng thái'))
        }
      },
    })
  }

  // Huỷ đơn — PHẢI đi qua cancelOrder (bắt lý do + nhả phân bổ tồn kho), không đi updateStatus.
  const [cancelTarget, setCancelTarget] = useState<SalesOrder | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const handleCancel = async () => {
    if (!cancelTarget || !cancelReason.trim()) return
    setCancelling(true)
    try {
      await salesOrderService.cancelOrder(cancelTarget.id, cancelReason.trim(), actor)
      message.success(`Đã hủy đơn hàng ${soDisplayCode(cancelTarget)}`)
      setCancelTarget(null)
      setCancelReason('')
      fetchOrders()
      fetchStats()
    } catch (error) {
      console.error('Cancel error:', error)
      message.error(dichLoiHeThong(error, 'Không thể hủy đơn hàng'))
    } finally {
      setCancelling(false)
    }
  }

  // Delete — chỉ Admin (đơn đã xác nhận trở đi phải gõ lại số HĐ mới xoá được)
  const [deleteTarget, setDeleteTarget] = useState<SalesOrder | null>(null)
  const [deleteTyped, setDeleteTyped] = useState('')
  const handleDelete = async (order: SalesOrder) => {
    try {
      await salesOrderService.deleteOrder(order.id)
      message.success(`Đã xóa đơn hàng ${soDisplayCode(order)}`)
      setDeleteTarget(null)
      setDeleteTyped('')
      fetchOrders()
      fetchStats()
    } catch (error: any) {
      message.error(dichLoiHeThong(error, 'Không thể xóa đơn hàng'))
    }
  }

  // ============================================
  // ROW COLOR — v5 UX simplified: chỉ 2 trạng thái
  // ============================================
  //
  // ✅ Xanh nhạt: Đã thanh toán (paid)
  // 🚨 Đỏ nhạt: Quá hạn giao HOẶC L/C hết hạn (cần action gấp)
  // ⚪ Trắng: tất cả còn lại — đỡ rối, focus vào 2 case quan trọng

  const getRowStyle = (r: SalesOrder): React.CSSProperties => {
    if (r.status === 'cancelled') return { opacity: 0.5 } // xám nhạt qua opacity
    if (r.status === 'paid') return { background: '#f6ffed' } // xanh — xong xuôi

    // Quá hạn giao chưa giao?
    if (r.delivery_date) {
      const overdue = Math.ceil((Date.now() - new Date(r.delivery_date).getTime()) / 86400000)
      if (overdue > 0 && !['shipped', 'delivered', 'paid'].includes(r.status)) {
        return { background: '#fff1f0' } // đỏ — quá hạn
      }
    }
    // L/C đã hết hạn?
    if (r.lc_expiry_date) {
      const lcDays = Math.ceil((new Date(r.lc_expiry_date).getTime() - Date.now()) / 86400000)
      if (lcDays <= 0) return { background: '#fff1f0' } // đỏ — L/C hết hạn
    }

    return {} // trắng — bình thường (bao gồm shipped/delivered/invoiced/confirmed/producing/ready/packing/draft)
  }

  // Left border accent — v5 simplified: chỉ 3 màu (paid/overdue/default)
  const getRowBorderLeft = (r: SalesOrder): string => {
    if (r.status === 'paid') return '3px solid #52c41a'  // xanh — xong
    if (r.delivery_date) {
      const overdue = Math.ceil((Date.now() - new Date(r.delivery_date).getTime()) / 86400000)
      if (overdue > 0 && !['shipped', 'delivered', 'paid'].includes(r.status)) return '3px solid #ff4d4f'  // đỏ — quá hạn
    }
    if (r.lc_expiry_date) {
      const lcDays = Math.ceil((new Date(r.lc_expiry_date).getTime() - Date.now()) / 86400000)
      if (lcDays <= 0) return '3px solid #ff4d4f'  // đỏ — L/C hết
    }
    return '3px solid #1B4D3E'  // mặc định — xanh brand
  }

  // ============================================
  // TABLE COLUMNS — v4: Color-coded groups
  // ============================================

  // ── Helpers ──
  const gray = (v: any) => v ? v : <span style={{ color: '#d9d9d9' }}>—</span>
  const mono = (v: any) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>

  // ── Progress dots: HĐ / SX / LOG / KT ──
  const progressDots = (r: SalesOrder) => {
    const STATUS_PHASE: Record<string, number> = {
      draft: 0, confirmed: 1, producing: 1, ready: 2, packing: 2,
      shipped: 3, delivered: 3, invoiced: 4, paid: 4, cancelled: -1,
    }
    const phase = STATUS_PHASE[r.status] ?? 0
    if (r.status === 'cancelled') return <Tag color="red" style={{ fontSize: 10, padding: '0 4px' }}>HỦY</Tag>
    const colors = ['#1B4D3E', '#1677ff', '#d48806', '#cf1322']
    const labels = ['HĐ', 'SX', 'LOG', 'KT']
    return (
      <Space size={2}>
        {colors.map((c, i) => (
          <Tooltip key={i} title={labels[i]}>
            <span style={{
              display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
              background: i < phase ? c : i === phase ? c : '#e8e8e8',
              opacity: i <= phase ? 1 : 0.4,
              border: i === phase ? `2px solid ${c}` : 'none',
              boxSizing: 'border-box',
            }} />
          </Tooltip>
        ))}
      </Space>
    )
  }

  // ── LC expiry badge ──
  const lcBadge = (d: string | undefined | null) => {
    if (!d) return gray(null)
    const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
    const formatted = fmtDate(d)
    if (days <= 0) return <Tag color="red" style={{ fontSize: 11 }}>{formatted}</Tag>
    if (days <= 7) return <Tag color="red" style={{ fontSize: 11 }}>{formatted}</Tag>
    if (days <= 20) return <Tag color="orange" style={{ fontSize: 11 }}>{formatted}</Tag>
    return <span style={{ fontSize: 12 }}>{formatted}</span>
  }

  // ── Header style ──
  // Q5 UX: nếu là viết tắt → wrap Tooltip cho rõ nghĩa
  const HDR_TOOLTIPS: Record<string, string> = {
    'Số HĐ': familyReady
      ? 'Số đơn (HA20YYYYNNNN). Đợt mua tiếp có thêm dòng "Đợt n · HĐ gốc"; HĐ gốc có đợt hiện "⧉ n đợt" — bấm để lọc cả HĐ'
      : 'Số hợp đồng (HA20YYYYNNNN)',
    'Người mua': 'Người mua — đứng tên HĐ, trả tiền, chịu công nợ. "→ …" = người nhận hàng khi khác người mua',
    'Người nhận hàng': 'Người nhận hàng (khách cuối) khi KHÁC người mua — trống = giao thẳng cho người mua. Công nợ vẫn theo người mua',
    'HĐ gốc': 'HĐ đã ký mà đơn mua tiếp theo (đơn gốc có đợt: chính nó)',
    'Đợt': 'Thứ tự đợt trong HĐ: gốc = 1, đợt mua tiếp = 2, 3…',
    'SL (tấn)': 'Số lượng (tấn)',
    'PO khách': 'Số PO/tham chiếu của người mua (vd ATC 5200006321) — trước gọi là Số LOT',
    'Số BKG': 'Số booking vận tải (đặt tàu)',
    'ETD': 'Estimated Time of Departure — Ngày tàu chạy dự kiến',
    'Đ.giá': 'Đơn giá /tấn theo đồng tiền của đơn ($ xuất khẩu, ₫ nội địa)',
    'CK': 'Chiết khấu',
    'NH CK': 'Ngân hàng chiết khấu',
    'Incoterm': 'Điều kiện giao hàng: FOB / CIF / CNF / DDP / EXW',
    'T.độ': 'Tiến độ 4 phase: Hợp đồng → Sản xuất → Logistics → Kế toán',
    'Tiền về': 'Ngày tiền về tài khoản',
  }
  const hdr = (title: string) => {
    const tip = HDR_TOOLTIPS[title]
    const inner = <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{title}</span>
    return tip ? <Tooltip title={tip}>{inner}</Tooltip> : inner
  }

  // R4: Inline edit — click cell mở DatePicker/Input → blur/Enter để lưu
  const [editingCell, setEditingCell] = useState<{ rowId: string; key: string } | null>(null)
  editingRef.current = editingCell   // realtime hoãn nạp lại khi đang mở ô sửa

  // `prev` = giá trị đang có: không đổi thì CHỈ đóng ô (trước đây click nhầm ô rồi click ra ngoài
  // = 1 lần ghi DB + toast "Đã cập nhật" + nạp lại cả trang).
  const saveInlineField = async (orderId: string, field: keyof SalesOrder, value: any, prev?: any) => {
    if (String(value ?? '') === String(prev ?? '')) {
      setEditingCell(null)
      return
    }
    try {
      await salesOrderService.updateFields(orderId, { [field]: value } as any)
      message.success('Đã cập nhật')
      setEditingCell(null)
      fetchOrders()
    } catch (e: any) {
      message.error(dichLoiHeThong(e, 'Không lưu được'))
    }
  }

  // Cell wrapper: click → mở editor; click ngoài → đóng. e.stopPropagation()
  // để không trigger row click (mở slide panel).
  const InlineDateCell = ({ orderId, field, value }: { orderId: string; field: keyof SalesOrder; value?: string | null }) => {
    const isEditing = editingCell?.rowId === orderId && editingCell?.key === field
    if (isEditing) {
      return (
        <DatePicker
          autoFocus
          open
          size="small"
          defaultValue={value ? dayjs(value) : undefined}
          format="DD/MM/YYYY"
          onChange={(d) => saveInlineField(orderId, field, d ? d.format('YYYY-MM-DD') : null, value)}
          onBlur={() => setEditingCell(null)}
          onClick={(e) => e.stopPropagation()}
          style={{ width: '100%' }}
        />
      )
    }
    return (
      <span
        onClick={(e) => { e.stopPropagation(); setEditingCell({ rowId: orderId, key: field }) }}
        style={{ fontSize: 12, cursor: 'pointer', display: 'inline-block', padding: '2px 4px', borderRadius: 3 }}
        className="inline-edit-cell"
      >
        {value ? fmtDate(value) : <span style={{ color: '#d9d9d9' }}>—</span>}
      </span>
    )
  }

  // M4-E: Inline edit số (đơn giá, đặt cọc...) — `format` vẽ số theo đồng tiền (có $ / ₫)
  const InlineNumberCell = ({ orderId, field, value, format }: { orderId: string; field: keyof SalesOrder; value?: number | null; format: (v: number) => string }) => {
    const isEditing = editingCell?.rowId === orderId && editingCell?.key === field
    const [tmp, setTmp] = useState<string>(value != null ? String(value) : '')
    useEffect(() => { setTmp(value != null ? String(value) : '') }, [value, isEditing])

    if (isEditing) {
      return (
        <Input
          autoFocus
          size="small"
          type="number"
          value={tmp}
          onChange={(e) => setTmp(e.target.value)}
          onPressEnter={() => saveInlineField(orderId, field, tmp ? Number(tmp) : null, value)}
          onBlur={() => saveInlineField(orderId, field, tmp ? Number(tmp) : null, value)}
          onClick={(e) => e.stopPropagation()}
          style={{ fontFamily: 'monospace', textAlign: 'right' }}
        />
      )
    }
    return (
      <span
        onClick={(e) => { e.stopPropagation(); setEditingCell({ rowId: orderId, key: field }) }}
        style={{ fontSize: 12, fontFamily: 'monospace', cursor: 'pointer', display: 'inline-block', padding: '2px 4px', borderRadius: 3 }}
        className="inline-edit-cell"
      >
        {value ? format(value) : <span style={{ color: '#d9d9d9' }}>—</span>}
      </span>
    )
  }

  // M4-E: Inline edit status (dropdown) — chỉ các bước đi TỚI hợp lệ + mục "Huỷ đơn…" riêng
  const InlineStatusCell = ({ order }: { order: SalesOrder }) => {
    const isEditing = editingCell?.rowId === order.id && editingCell?.key === 'status'
    const next = nextOrderStatuses(order.status)
    const forward = next.filter((s) => s !== 'cancelled')
    const canCancel = next.includes('cancelled')
    const tag = (
      <Tag color={ORDER_STATUS_COLORS[order.status]} style={{ margin: 0, fontSize: 11 }}>
        {ORDER_STATUS_LABELS[order.status]}
      </Tag>
    )
    if (next.length === 0) {
      // Đã thanh toán / đã huỷ: không còn bước nào → không mở ô chọn
      return <Tooltip title="Đơn đã kết thúc — không còn bước trạng thái nào để chuyển">{tag}</Tooltip>
    }
    if (isEditing) {
      return (
        <Select
          autoFocus
          size="small"
          open
          placeholder="Chuyển sang…"
          popupMatchSelectWidth={false}
          onChange={(val: string) => {
            setEditingCell(null)
            if (val === CANCEL_ORDER_KEY) {
              setCancelReason('')
              setCancelTarget(order)
            } else {
              confirmStatusChange(order, val as SalesOrderStatus)
            }
          }}
          onBlur={() => setEditingCell(null)}
          onClick={(e) => e.stopPropagation()}
          style={{ width: '100%' }}
          options={[
            ...forward.map((s) => ({ value: s, label: `→ ${ORDER_STATUS_LABELS[s]}` })),
            ...(canCancel ? [{ value: CANCEL_ORDER_KEY, label: <span style={{ color: '#cf1322' }}>Huỷ đơn…</span> }] : []),
          ]}
        />
      )
    }
    return (
      <Tooltip title="Bấm để chuyển sang bước tiếp theo">
        <span
          onClick={(e) => { e.stopPropagation(); setEditingCell({ rowId: order.id, key: 'status' }) }}
          className="inline-edit-cell"
          style={{ cursor: 'pointer', display: 'inline-block', padding: '2px 4px', borderRadius: 3 }}
        >
          {tag}
        </span>
      </Tooltip>
    )
  }

  const InlineTextCell = ({ orderId, field, value, placeholder }: { orderId: string; field: keyof SalesOrder; value?: string | null; placeholder?: string }) => {
    const isEditing = editingCell?.rowId === orderId && editingCell?.key === field
    const [tmp, setTmp] = useState(value || '')
    useEffect(() => { setTmp(value || '') }, [value, isEditing])

    if (isEditing) {
      return (
        <Input
          autoFocus
          size="small"
          value={tmp}
          placeholder={placeholder}
          onChange={(e) => setTmp(e.target.value)}
          onPressEnter={() => saveInlineField(orderId, field, tmp || null, value)}
          onBlur={() => saveInlineField(orderId, field, tmp || null, value)}
          onClick={(e) => e.stopPropagation()}
        />
      )
    }
    return (
      <span
        onClick={(e) => { e.stopPropagation(); setEditingCell({ rowId: orderId, key: field }) }}
        style={{ fontSize: 11, cursor: 'pointer', display: 'inline-block', padding: '2px 4px', borderRadius: 3 }}
        className="inline-edit-cell"
      >
        {value || <span style={{ color: '#d9d9d9' }}>—</span>}
      </span>
    )
  }

  // Helpers map state ↔ Ant sort order — đọc CHUNG bảng ánh xạ với handleTableChange.
  // Trước 26/08/2026 chỗ này là bản chép tay thứ hai của cùng bảng đó, nên sửa một bên
  // là hai bên lệch nhau (mũi tên chỉ một cột, dữ liệu sắp theo cột khác).
  const sortedColumn = (key: string) =>
    sortBy === (SORT_FIELD_BY_COLUMN[key] ?? key)
      ? (sortOrder === 'asc' ? 'ascend' as const : 'descend' as const)
      : null

  // Filter values — đồng bộ với toolbar
  const gradeFilteredValue = gradeFilter ? [gradeFilter] : null

  // ── Họ HĐ: dòng phụ dưới số đơn ──
  /** Số đơn CẢ HỌ của một dòng GỐC (1 = đơn thường). Đợt con luôn thuộc họ ≥ 2. */
  const familySizeOf = (r: SalesOrder): number => (r.parent_order_id ? 2 : (familyCounts[r.id] ?? 1))
  const isFamilyMember = (r: SalesOrder): boolean => familyReady && (!!r.parent_order_id || familySizeOf(r) >= 2)
  const rootNoOf = (r: SalesOrder): string =>
    r.parent_order_id ? (r.parent?.contract_no || r.parent?.code || '') : soDisplayCode(r)

  /** Chữ phụ bấm được → chip "HĐ gốc: …" (stopPropagation: bấm dòng là mở panel chi tiết). */
  const familyLink = (text: string, tip: string, onClick: () => void, color: string, fontSize = 10) => (
    <Tooltip title={tip}>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onClick() }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClick() } }}
        style={{
          display: 'block', fontSize, color, cursor: 'pointer', lineHeight: 1.3, marginTop: 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'inherit',
        }}
      >
        {text}
      </span>
    </Tooltip>
  )

  /** Dòng phụ cột Số HĐ: đợt "Đợt n · HĐ X" (chỗ DUY NHẤT trên bảng thấy quan hệ của đợt mang số riêng) / gốc "⧉ n đợt". */
  const familySubLine = (r: SalesOrder) => {
    if (!familyReady) return null
    if (r.parent_order_id) {
      const rootNo = rootNoOf(r)
      return familyLink(
        `Đợt ${r.continuation_seq ?? '?'}${rootNo ? ` · HĐ ${rootNo}` : ''}`,
        `Mua tiếp theo HĐ ${rootNo || 'gốc'} — không ký HĐ mới. Bấm để lọc cả HĐ (gốc + các đợt).`,
        () => applyFamilyRoot(r.parent_order_id as string, rootNo || 'gốc'),
        SUB_GRAY,
      )
    }
    const n = familySizeOf(r)
    if (n < 2) return null
    return familyLink(
      `⧉ ${n} đợt`,
      `HĐ gốc có ${n} đợt đang chạy (kể cả HĐ này). Bấm để lọc cả HĐ; mở dòng (▸) để xem các đợt.`,
      () => applyFamilyRoot(r.id, soDisplayCode(r)),
      palette.brand,
    )
  }

  /** Một dòng chữ trong ô hẹp: cắt "…" riêng từng dòng (ô ellipsis của antd chỉ cắt được một dòng). */
  const clip = (content: React.ReactNode, style?: React.CSSProperties) => (
    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...style }}>{content}</span>
  )

  const columns: ColumnsType<SalesOrder> = [
    // ═══ CỘT THEO YÊU CẦU — sorter + filter ═══
    {
      title: '#',
      key: 'index',
      width: 35,
      fixed: 'left',
      render: (_: unknown, __: SalesOrder, idx: number) => (
        <span style={{ color: '#999', fontSize: 11 }}>{(pagination.current - 1) * pagination.pageSize + idx + 1}</span>
      ),
    },
    {
      title: hdr('Số HĐ'),
      dataIndex: 'contract_no',
      key: 'contract_no',
      width: 120,
      fixed: 'left',
      sorter: true,
      sortOrder: sortedColumn('contract_no'),
      // Không tô nền / viền dòng cho họ HĐ — hai thứ đó đang mã hoá "đã TT" / "quá hạn"
      render: (_: string, r: SalesOrder) => (
        <div style={{ minWidth: 0 }}>
          {mono(<strong>{soDisplayCode(r)}</strong>)}
          {familySubLine(r)}
        </div>
      ),
    },
    {
      title: hdr('Người mua'),
      dataIndex: 'customer',
      key: 'customer',
      width: 150,
      fixed: 'left',
      ellipsis: true,
      sorter: true,
      sortOrder: sortedColumn('customer'),
      render: (_: unknown, r: SalesOrder) => {
        const c = r.customer
        if (!c) return gray(null)
        const f = countryFlag(c.country)
        const buyer = <span style={{ fontSize: 12 }}>{f ? f + ' ' : ''}{partyShortName(c)}</span>
        // "→ người nhận" chỉ khi đơn có người nhận riêng; tooltip ghi đủ tên hai bên
        if (!familyReady || !r.ship_to_customer_id) {
          return <Tooltip title={c.name} mouseEnterDelay={0.4}>{clip(buyer)}</Tooltip>
        }
        const rec = r.ship_to
        const tip = `Người mua (đứng tên HĐ, trả tiền, công nợ): ${c.name} → Người nhận hàng: ${rec?.name || '(không tìm thấy hồ sơ)'}`
        return (
          <Tooltip title={tip}>
            <div style={{ minWidth: 0 }}>
              {clip(buyer)}
              {clip(<>→ {rec ? partyShortName(rec) : 'không rõ người nhận'}</>, { fontSize: 11, color: SUB_GRAY, lineHeight: 1.3 })}
            </div>
          </Tooltip>
        )
      },
    },
    // ── 3 cột họ HĐ / người nhận: ẩn mặc định (ẩn-hiện + Excel), KHÔNG sorter ──
    {
      title: hdr('Người nhận hàng'),
      key: 'ship_to',
      width: 150,
      ellipsis: true,
      render: (_: unknown, r: SalesOrder) => {
        if (!r.ship_to_customer_id) return gray(null)
        const s = r.ship_to
        if (!s) return <span style={{ fontSize: 11, color: '#cf1322' }}>Không tìm thấy hồ sơ</span>
        const f = countryFlag(s.country)
        return <Tooltip title={s.name}>{clip(<span style={{ fontSize: 12 }}>{f ? f + ' ' : ''}{partyShortName(s)}</span>)}</Tooltip>
      },
    },
    {
      title: hdr('HĐ gốc'),
      key: 'family_root',
      width: 130,
      ellipsis: true,
      render: (_: unknown, r: SalesOrder) => {
        if (!isFamilyMember(r)) return gray(null)
        const rootNo = rootNoOf(r)
        const rootId = r.parent_order_id || r.id
        return familyLink(
          r.parent_order_id ? rootNo : `${rootNo} · gốc`,
          `Bấm để lọc cả HĐ ${rootNo} (gốc + các đợt)`,
          () => applyFamilyRoot(rootId, rootNo || 'gốc'),
          r.parent_order_id ? '#262626' : SUB_GRAY,
          12,
        )
      },
    },
    {
      title: hdr('Đợt'),
      key: 'family_seq',
      width: 60,
      align: 'center',
      render: (_: unknown, r: SalesOrder) => {
        if (!isFamilyMember(r)) return gray(null)
        return r.parent_order_id
          ? <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{r.continuation_seq ?? '?'}</span>
          : <Tooltip title="Đơn gốc (đợt 1)"><span style={{ fontSize: 12, fontFamily: 'monospace', color: SUB_GRAY }}>1</span></Tooltip>
      },
    },
    {
      title: hdr('Loại hàng'),
      dataIndex: 'grade',
      key: 'grade',
      width: 140,  // tăng từ 90 → 140 vì sort + filter icons chiếm thêm ~50px
      sorter: true,
      sortOrder: sortedColumn('grade'),
      filters: SVR_GRADE_OPTIONS.map((g: any) => ({
        text: typeof g === 'string' ? g : (g.label || g.value),
        value: typeof g === 'string' ? g : g.value,
      })),
      filteredValue: gradeFilteredValue,
      filterMultiple: false,
      // Bỏ phân màu — chỉ hiển thị text grade dạng plain để bảng đỡ rối
      render: (g: string) => g ? <span style={{ fontSize: 12, fontWeight: 500, color: '#262626' }}>{g}</span> : gray(null),
    },
    {
      // Nhãn "PO khách" (là customer_po — chữ "LOT" đang mang 4 nghĩa); GIỮ key 'lot' cho cấu hình ẩn/hiện đã nhớ
      title: hdr('PO khách'),
      dataIndex: 'customer_po',
      key: 'lot',
      width: 100,
      ellipsis: true,
      sorter: true,
      sortOrder: sortedColumn('lot'),
      render: (v: string) => v ? <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{v}</span> : gray(null),
    },
    {
      title: hdr('Tiến độ lô'),
      key: 'lot_progress',
      width: 158,
      // ⚠ KHÔNG đặt `sorter` và KHÔNG đặt `dataIndex` cho cột này: nó là cột client-only,
      // không có cột tương ứng trong DB. Gắn sorter là tên nó lọt vào .order() → 400.
      render: (_: unknown, r: SalesOrder) => {
        const p = lotProgress[r.id]
        if (!p || p.contsTotal === 0) return gray(null)
        const chips = mergeLotAxes(p.deliveryByLot, lotPay[r.id]?.moneyByLot)
        if (chips.length === 0) return <LotProgressBadge p={p} />
        const money = lotPay[r.id]
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <LotChipStrip lots={chips} size="s" />
              {/* Dải viên không có chip lệnh — giữ riêng, nếu không đơn CÓ LÔ mất hẳn
                  lối nhảy sang Lệnh điều động vốn đang nằm trong cột này. */}
              <DispatchChips orders={p.dispatchOrders} />
            </div>
            <span style={{ display: 'block', fontSize: 10, color: '#6b7280', marginTop: 3, fontFamily: 'JetBrains Mono, monospace' }}>
              {p.lotsDelivered}/{p.lotsTotal} giao
              {money && (
                <> · <span style={{ color: money.lotsPaid === 0 ? '#b45309' : money.lotsPaid >= money.lotsTotal ? '#15803d' : '#0369a1', fontWeight: 600 }}>
                  {money.lotsPaid}/{money.lotsTotal} thu
                </span></>
              )}
              {p.contsNoLot > 0 && (
                <Tooltip title={`${p.contsNoLot} container chưa gán lô — không nằm trong phân số lô ở trên.`}>
                  <span style={{ color: '#dc2626', fontWeight: 700, cursor: 'help' }}> ⚠</span>
                </Tooltip>
              )}
            </span>
          </div>
        )
      },
    },
    {
      title: hdr('SL (tấn)'),
      dataIndex: 'quantity_tons',
      key: 'qty',
      width: 75,
      align: 'right',
      sorter: true,
      sortOrder: sortedColumn('qty'),
      render: (v: number) => v != null ? mono(v.toLocaleString('vi-VN')) : gray(null),
    },
    {
      // "~" = có container đã giao nhưng chưa nhập KL → phải ước lượng.
      title: hdr('Đã giao (T)'),
      key: 'delivered_tons',
      width: 92,
      align: 'right',
      render: (_: unknown, r: SalesOrder) => {
        if (r.status === 'cancelled') return gray(null)
        const d = deliveredTons(r.quantity_tons, lotProgress[r.id], r.status)
        if (!d.tons) return gray(null)
        return mono(`${d.tons.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}${d.estimated ? ' ~' : ''}`)
      },
    },
    {
      title: hdr('Còn thiếu (T)'),
      key: 'shortage',
      width: 100,
      align: 'right',
      render: (_: unknown, r: SalesOrder) => {
        if (r.status === 'cancelled') return gray(null)
        const rem = remainingTons(r.quantity_tons, lotProgress[r.id], r.status)
        if (rem <= 0) return <Tag color="green" style={{ margin: 0 }}>Đủ</Tag>
        return <b style={{ color: '#dc2626', fontFamily: 'monospace' }}>
          {rem.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}
        </b>
      },
    },
    {
      title: hdr('Hạn giao'),
      dataIndex: 'delivery_date',
      key: 'delivery',
      width: 110,
      sorter: true,
      sortOrder: sortedColumn('delivery'),
      render: (d: string, r: SalesOrder) => <InlineDateCell orderId={r.id} field="delivery_date" value={d} />,
    },
    {
      title: hdr('Sẵn hàng'),
      dataIndex: 'ready_date',
      key: 'ready_date',
      width: 85,
      sorter: true,
      sortOrder: sortedColumn('ready_date'),
      render: (d: string) => d ? <span style={{ fontSize: 12 }}>{fmtDate(d)}</span> : gray(null),
    },
    {
      title: hdr('Incoterm'),
      dataIndex: 'incoterm',
      key: 'incoterm',
      // 105px: tiêu đề in hoa + giãn chữ (INCOTERM) + mũi tên sort; 80px thì mũi tên đè lên chữ
      width: 105,
      align: 'center' as const,
      sorter: true,
      sortOrder: sortedColumn('incoterm'),
      render: (v: string) => v ? <span style={{ fontSize: 11, fontWeight: 600 }}>{v}</span> : gray(null),
    },
    {
      title: hdr('Số BKG'),
      dataIndex: 'booking_reference',
      key: 'bkg',
      width: 120,
      sorter: true,
      sortOrder: sortedColumn('bkg'),
      render: (v: string, r: SalesOrder) => <InlineTextCell orderId={r.id} field="booking_reference" value={v} placeholder="Nhập booking..." />,
    },
    {
      title: hdr('ETD'),
      dataIndex: 'etd',
      key: 'etd',
      width: 110,
      sorter: true,
      sortOrder: sortedColumn('etd'),
      render: (d: string, r: SalesOrder) => <InlineDateCell orderId={r.id} field="etd" value={d} />,
    },
    {
      title: hdr('Đ.giá'),
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 95,
      align: 'right',
      sorter: true,
      sortOrder: sortedColumn('unit_price'),
      render: (v: number, r: SalesOrder) => (
        <InlineNumberCell orderId={r.id} field="unit_price" value={v} format={(n) => fmtUnitPrice(n, r.currency)} />
      ),
    },
    {
      title: hdr('Thành tiền'),
      dataIndex: 'total_value_usd',
      key: 'total_usd',
      width: 110,
      align: 'right',
      sorter: true,
      sortOrder: sortedColumn('total_usd'),
      // Đơn VNĐ: hiện số VNĐ thật, kèm USD quy đổi nhỏ (cột sort vẫn theo total_value_usd)
      render: (v: number, r: SalesOrder) => isVnd(r.currency)
        ? (r.total_value_vnd
            ? <span style={{ display: 'inline-block', textAlign: 'right' }}>
                <strong style={{ color: '#1B4D3E', fontFamily: 'monospace', fontSize: 12 }}>{fmtMoney(r.total_value_vnd, 'VND')}</strong>
                {v ? <div style={{ fontSize: 10, color: '#999' }}>≈ {fmtMoney(v, 'USD', { decimals: 0 })}</div> : null}
              </span>
            : gray(null))
        : (v ? <strong style={{ color: '#1B4D3E', fontFamily: 'monospace', fontSize: 12 }}>{fmtMoney(v, 'USD', { decimals: 0 })}</strong> : gray(null)),
    },
    {
      title: hdr('Đặt cọc'),
      dataIndex: 'deposit_amount',
      key: 'deposit',
      width: 100,
      align: 'right',
      sorter: true,
      sortOrder: sortedColumn('deposit'),
      // Đặt cọc / CK / Còn lại là số USD (form Vận chuyển ghi "Số tiền đặt cọc (USD)")
      render: (v: number, r: SalesOrder) => <InlineNumberCell orderId={r.id} field={'deposit_amount' as any} value={v} format={(n) => fmtMoney(n, 'USD', { decimals: 0 })} />,
    },
    {
      title: hdr('CK'),
      dataIndex: 'discount_amount',
      key: 'discount',
      width: 85,
      align: 'right',
      sorter: true,
      sortOrder: sortedColumn('discount'),
      render: (v: number) => v ? mono(fmtMoney(v, 'USD', { decimals: 0 })) : gray(null),
    },
    {
      title: hdr('NH CK'),
      dataIndex: 'discount_bank',
      key: 'discount_bank',
      width: 90,
      ellipsis: true,
      sorter: true,
      sortOrder: sortedColumn('discount_bank'),
      render: (v: string) => v ? <span style={{ fontSize: 11 }}>{v}</span> : gray(null),
    },
    {
      title: hdr('Còn lại'),
      dataIndex: 'remaining_amount',
      key: 'remaining',
      width: 90,
      align: 'right',
      sorter: true,
      sortOrder: sortedColumn('remaining'),
      render: (v: number, r: SalesOrder) => {
        const remaining = v ?? ((r.total_value_usd || 0) - ((r as any).deposit_amount || 0) - ((r as any).discount_amount || 0) - ((r as any).bank_charges || 0))
        return remaining ? <strong style={{ color: '#1677ff', fontFamily: 'monospace', fontSize: 12 }}>{fmtMoney(remaining, 'USD', { decimals: 0 })}</strong> : gray(null)
      },
    },
    {
      title: hdr('Tiền về'),
      dataIndex: 'payment_received_date',
      key: 'payment_date',
      width: 110,
      sorter: true,
      sortOrder: sortedColumn('payment_date'),
      render: (d: string, r: SalesOrder) => <InlineDateCell orderId={r.id} field="payment_received_date" value={d} />,
    },
    {
      title: hdr('Bộ phận'),
      key: 'current_stage',
      width: 120,
      align: 'center',
      render: (_: unknown, r: SalesOrder) => {
        const stage = (r.current_stage as SalesStage) || 'sales'
        return (
          <StagePill
            stage={stage}
            stageStartedAt={r.stage_started_at}
            slaHours={r.stage_sla_hours}
            variant="compact"
          />
        )
      },
    },
    {
      title: hdr('T.độ'),
      key: 'progress',
      width: 60,
      align: 'center',
      render: (_: unknown, r: SalesOrder) => progressDots(r),
    },
    {
      title: hdr('Trạng thái'),
      key: 'status',
      width: 110,
      align: 'center',
      render: (_: unknown, r: SalesOrder) => <InlineStatusCell order={r} />,
    },

    // ═══ ACTIONS ═══
    {
      title: '',
      key: 'actions',
      width: 50,
      fixed: 'right',
      render: (_: unknown, record: SalesOrder) => {
        // Quyền xóa:
        //   - Admin: xóa mọi đơn
        //   - Sale: chỉ xóa đơn draft + chưa khóa (đơn confirmed trở đi đã
        //     ký với khách, chỉ admin mới được xóa)
        const canDelete = isAdmin
          || (salesRole === 'sale' && record.status === 'draft' && !record.is_locked)

        return (
        <Space size={0}>
          <Tooltip title="Mở chi tiết (tab)">
            <Button type="text" size="small" icon={<EyeOutlined />}
              onClick={(e) => { e.stopPropagation(); openOrderTab(record) }} />
          </Tooltip>
          {canDelete && record.status === 'draft' && (
            <Popconfirm
              title={`Xóa ${soDisplayCode(record)}?`}
              description="Đơn nháp — sẽ xóa vĩnh viễn"
              onConfirm={() => handleDelete(record)}
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
            </Popconfirm>
          )}
          {/* Đơn đã xác nhận trở đi = đã ký với khách, dữ liệu thật → bắt gõ lại số HĐ (không còn 1 cú Popconfirm) */}
          {canDelete && record.status !== 'draft' && (
            <Tooltip title="Xóa vĩnh viễn (chỉ Admin)">
              <Button type="text" size="small" danger icon={<DeleteOutlined />}
                onClick={(e) => { e.stopPropagation(); setDeleteTyped(''); setDeleteTarget(record) }} />
            </Tooltip>
          )}
        </Space>
        )
      },
    },
  ]

  // ============================================
  // RENDER
  // ============================================

  // Khối "không có đơn" — dùng chung cho bảng (máy tính) và danh sách thẻ (điện thoại).
  const emptyState = (
    // M4-D: Empty state đẹp
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 12, opacity: 0.6 }}>📦</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#1B4D3E', marginBottom: 6 }}>
        Không tìm thấy đơn hàng nào
      </div>
      <div style={{ fontSize: 13, color: '#6c6a64', marginBottom: 20 }}>
        {activeFilters.length > 0
          ? `Bộ lọc hiện tại không có đơn nào khớp (${activeFilters.length} bộ lọc đang bật).`
          : 'Chưa có đơn hàng nào trong tháng — bắt đầu tạo đơn đầu tiên.'}
      </div>
      <Space>
        {activeFilters.length > 0 && (
          <Button onClick={clearAllFilters}>Xóa bộ lọc</Button>
        )}
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => openTab({
            key: 'sales-order-create',
            title: 'Tạo đơn hàng',
            componentId: 'sales-order-create',
            props: {},
            path: '/sales/orders/new',
          })}
          style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
        >
          Tạo đơn mới
        </Button>
      </Space>
    </div>
  )

  return (
    <div style={{ padding: isPhone ? 12 : 24 }}>
      <style>{`
        .inline-edit-cell:hover {
          background: #e6f4ff !important;
          outline: 1px dashed #1677ff;
        }
      `}</style>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: isPhone ? 12 : 24 }}>
        <Col>
          <Title level={isPhone ? 4 : 3} style={{ margin: 0 }}>
            Đơn hàng bán
          </Title>
        </Col>
        <Col>
          {isPhone ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openCreateTab}
              style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E', height: 40, borderRadius: 10, fontWeight: 600 }}
            >
              Tạo đơn
            </Button>
          ) : (
          <Space>
            {/* M4-B: Saved Views dropdown */}
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  ...(savedViews.length === 0
                    ? [{ key: 'empty', label: <span style={{ color: '#999' }}>Chưa có bộ lọc nào được lưu</span>, disabled: true }]
                    : savedViews.map(v => ({
                        key: v.id,
                        label: (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 200 }}>
                            <span onClick={() => applyView(v)}>⭐ {v.name}</span>
                            <Popconfirm title={`Xóa bộ lọc đã lưu "${v.name}"?`} okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }} onConfirm={() => handleDeleteView(v.id)}>
                              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                            </Popconfirm>
                          </div>
                        ),
                      }))),
                  { type: 'divider' as const },
                  {
                    key: 'save',
                    label: <span style={{ color: '#1B4D3E' }}>💾 Lưu bộ lọc hiện tại</span>,
                    onClick: () => setSaveViewModalOpen(true),
                  },
                ],
              }}
            >
              <Button icon={<span style={{ fontSize: 14 }}>⭐</span>}>
                Bộ lọc đã lưu ({savedViews.length})
              </Button>
            </Dropdown>

            {/* M4-C: Density toggle */}
            {/* span: Tooltip cần con nhận được ref — Space.Compact/Button.Group thì không, tooltip không bao giờ hiện */}
            <Tooltip title="Độ dày dòng (Gọn / Vừa / Thoáng)">
              <span style={{ display: 'inline-flex' }}>
                <Space.Compact>
                  <Button size="small" aria-label="Dòng gọn" type={density === 'compact' ? 'primary' : 'default'}
                    onClick={() => setDensityAndSave('compact')}
                    style={density === 'compact' ? { background: '#1B4D3E', borderColor: '#1B4D3E' } : {}}>≡</Button>
                  <Button size="small" aria-label="Dòng vừa" type={density === 'normal' ? 'primary' : 'default'}
                    onClick={() => setDensityAndSave('normal')}
                    style={density === 'normal' ? { background: '#1B4D3E', borderColor: '#1B4D3E' } : {}}>≣</Button>
                  <Button size="small" aria-label="Dòng thoáng" type={density === 'comfortable' ? 'primary' : 'default'}
                    onClick={() => setDensityAndSave('comfortable')}
                    style={density === 'comfortable' ? { background: '#1B4D3E', borderColor: '#1B4D3E' } : {}}>☰</Button>
                </Space.Compact>
              </span>
            </Tooltip>

            {/* Cmd+K trigger button — visible nút mở command palette (giống mock) */}
            <Tooltip title="Tìm nhanh + Lệnh tắt (Ctrl+K)">
              <Button
                size="middle"
                onClick={() => window.dispatchEvent(new Event('sales-cmdk-open'))}
                style={{
                  background: '#fafafa',
                  borderColor: '#e8e8e8',
                  color: '#8c8c8c',
                  fontWeight: 500,
                }}
              >
                🔍 Tìm nhanh
                <span style={{
                  marginLeft: 8, padding: '0 6px',
                  background: '#fff', border: '1px solid #d9d9d9', borderRadius: 4,
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#595959',
                  boxShadow: '0 1px 0 #d9d9d9',
                }}>Ctrl+K</span>
              </Button>
            </Tooltip>

            {/* View mode toggle: Bảng (current default) | Split (Linear/Gmail-style) | Kanban */}
            <Space.Compact>
              <Tooltip title="Bảng — danh sách đầy đủ cột">
                <Button
                  size="middle"
                  icon={<span style={{ fontSize: 14 }}>▦</span>}
                  type={viewMode === 'table' ? 'primary' : 'default'}
                  onClick={() => changeViewMode('table')}
                  style={viewMode === 'table' ? { background: '#1B4D3E', borderColor: '#1B4D3E' } : {}}
                >
                  Bảng
                </Button>
              </Tooltip>
              <Tooltip title="Chia đôi — danh sách bên trái, chi tiết đơn luôn hiện bên phải (phím J/K để chuyển đơn)">
                <Button
                  size="middle"
                  icon={<span style={{ fontSize: 14 }}>▤▥</span>}
                  type={viewMode === 'split' ? 'primary' : 'default'}
                  onClick={() => changeViewMode('split')}
                  style={viewMode === 'split' ? { background: '#1B4D3E', borderColor: '#1B4D3E' } : {}}
                >
                  Chia đôi
                </Button>
              </Tooltip>
              <Tooltip title="Kanban — kéo thả theo công đoạn">
                <Button
                  size="middle"
                  icon={<span style={{ fontSize: 14 }}>📋</span>}
                  onClick={() => navigate('/sales/kanban')}
                >
                  Kanban
                </Button>
              </Tooltip>
            </Space.Compact>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openTab({
                key: 'sales-order-create',
                title: 'Tạo đơn hàng',
                componentId: 'sales-order-create',
                props: {},
                path: '/sales/orders/new',
              })}
              style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
            >
              Tạo đơn hàng
            </Button>
          </Space>
          )}
        </Col>
      </Row>

      {/* M4-A: Filter chips bar — hiện khi có >=1 filter active */}
      {activeFilters.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 12px',
          background: '#f5f7fa',
          border: '1px solid #e6e8ec',
          borderRadius: 6,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 12, color: '#6c6a64', fontWeight: 500 }}>🔍 Đang lọc:</span>
          {activeFilters.map(f => (
            <Tag
              key={f.key}
              closable
              onClose={(e) => { e.preventDefault(); f.onRemove() }}
              style={{ margin: 0, padding: '2px 8px', fontSize: 12, background: '#fff', border: '1px solid #d0cec9', maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere' }}
            >
              {f.label}
            </Tag>
          ))}
          <Button size="small" type="link" danger onClick={clearAllFilters} style={{ padding: '0 4px', fontSize: 12 }}>
            Xóa tất cả
          </Button>
        </div>
      )}

      {/* Status tabs có badge count + nút "🚨 Quá ETD" inline (Q1 UX) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Tabs
          activeKey={statusTab}
          onChange={handleTabChange}
          style={{ flex: 1, minWidth: 0 }}
          tabBarStyle={{ marginBottom: 0 }}
          items={STATUS_TABS.map((tab) => {
            const count = tab.key === 'all' ? stats.total
              : tab.key === 'draft' ? stats.draft
              : tab.key === 'confirmed' ? stats.confirmed
              : tab.key === 'producing' ? stats.producing
              : tab.key === 'ready' ? stats.ready
              : tab.key === 'packing' ? stats.packing
              : tab.key === 'shipped' ? stats.shipped
              : tab.key === 'delivered' ? stats.delivered
              : tab.key === 'invoiced' ? stats.invoiced
              : tab.key === 'paid' ? stats.paid
              : 0
            return {
              key: tab.key,
              label: (
                <span>
                  {tab.label}
                  {count > 0 && (
                    <span style={{
                      marginLeft: 6,
                      padding: '0 6px',
                      background: statusTab === tab.key ? '#1B4D3E' : '#f0f0f0',
                      color: statusTab === tab.key ? '#fff' : '#666',
                      borderRadius: 9999,
                      fontSize: 11,
                      fontWeight: 600,
                    }}>{count}</span>
                  )}
                </span>
              ),
            }
          })}
        />
        {/* Nút "🚨 Quá ETD" — toggle filter overdue */}
        {stats.overdue_etd > 0 && (
          <Button
            danger={overdueEtdOnly}
            type={overdueEtdOnly ? 'primary' : 'default'}
            onClick={() => {
              const next = !overdueEtdOnly
              setOverdueEtdOnly(next)
              setSearchParams(next ? { filter: 'overdue_etd' } : {})
              setPagination(p => ({ ...p, current: 1 }))
            }}
            style={overdueEtdOnly ? {} : { color: '#cf1322', borderColor: '#ffa39e' }}
          >
            🚨 Quá ETD ({stats.overdue_etd})
          </Button>
        )}
        {!isPhone && (<>
        {/* M1: Tùy chỉnh cột — dropdown checkbox */}
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              ...hideableCols.map(c => ({
                key: c.key,
                label: (
                  <Checkbox
                    checked={!hiddenCols.has(c.key)}
                    onChange={() => toggleColumn(c.key)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {c.label}
                  </Checkbox>
                ),
              })),
              { type: 'divider' as const },
              {
                key: 'reset',
                label: <span style={{ color: '#1B4D3E' }}>↻ Khôi phục mặc định</span>,
                onClick: resetColumns,
              },
            ],
          }}
        >
          <Button icon={<SettingOutlined />}>
            Tùy chỉnh cột ({shownHideableCount}/{hideableCols.length})
          </Button>
        </Dropdown>
        {/* Xuất TẤT CẢ theo bộ lọc — không phải tick từng đơn như trước. */}
        <Button
          icon={<DownloadOutlined />}
          loading={exportingAll}
          onClick={handleExportAll}
          title="Xuất toàn bộ đơn khớp bộ lọc hiện tại (kể cả các trang sau)"
        >
          Xuất Excel (theo bộ lọc)
        </Button>
        </>)}
      </div>

      {/* Q2: Banner "đang lọc Quá ETD" + "Đang sắp xếp" — đã bỏ.
          Status filter overdue_etd thấy ở nút "Quá ETD" (đỏ khi active).
          Sort state thấy qua arrow trên column header (Ant Design tự render). */}

      {/* Filter Bar */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={familyReady ? 12 : 8} md={familyReady ? 6 : 7}>
            <OrderSearchBox key={searchBoxKey} applied={searchText} onSearch={handleSearch} />
          </Col>
          {isPhone && (
            <Col xs={24} style={{ paddingTop: 0 }}>
              <Button
                type="link"
                size="small"
                style={{ padding: 0, height: 'auto', fontWeight: 600 }}
                onClick={() => setPhoneFiltersOpen((v) => !v)}
              >
                {phoneFiltersOpen || customerFilter || gradeFilter || dateRange || orderKind !== 'all'
                  ? '▴ Thu gọn bộ lọc'
                  : familyReady ? '▾ Bộ lọc thêm (khách, grade, loại đơn, ngày)' : '▾ Bộ lọc thêm (khách, grade, ngày)'}
              </Button>
            </Col>
          )}
          {(!isPhone || phoneFiltersOpen || !!customerFilter || !!gradeFilter || !!dateRange || orderKind !== 'all') && (<>
          <Col xs={familyReady ? 24 : 12} sm={familyReady ? 12 : 5} md={familyReady ? 7 : 5}>
            {(() => {
              const customerSelect = (
                <Select
                  value={customerFilter}
                  onChange={(val) => {
                    setCustomerFilter(val)
                    setPagination((prev) => ({ ...prev, current: 1 }))
                  }}
                  allowClear
                  placeholder="Khách hàng"
                  style={familyReady ? { flex: 1, minWidth: 0 } : { width: '100%' }}
                  showSearch
                  optionFilterProp="label"
                  options={customers.map((c) => ({
                    label: [countryFlag(c.country), c.name].filter(Boolean).join(' '),
                    value: c.id,
                  }))}
                />
              )
              if (!familyReady) return customerSelect
              // Vai của khách trong lọc: Người mua (mặc định — tổng như cũ) | Người nhận (hàng giao tới khách qua
              // trung gian) | Cả hai. Công nợ/doanh thu vẫn luôn theo người mua.
              return (
                <Space.Compact block>
                  <Tooltip title="Lọc khách theo vai: Người mua = đứng tên HĐ, công nợ (mặc định) · Người nhận = hàng giao tới khách này qua người mua khác · Cả hai">
                    <Select
                      value={customerRole}
                      onChange={(v: CustomerRole) => {
                        setCustomerRole(v)
                        setPagination((prev) => ({ ...prev, current: 1 }))
                      }}
                      aria-label="Vai của khách trong bộ lọc"
                      style={{ width: 116, flex: 'none' }}
                      popupMatchSelectWidth={false}
                      options={(Object.keys(CUSTOMER_ROLE_LABELS) as CustomerRole[]).map((k) => ({ value: k, label: CUSTOMER_ROLE_LABELS[k] }))}
                    />
                  </Tooltip>
                  {customerSelect}
                </Space.Compact>
              )
            })()}
          </Col>
          <Col xs={12} sm={familyReady ? 6 : 5} md={familyReady ? 3 : 4}>
            <Select
              value={gradeFilter}
              onChange={(val) => {
                setGradeFilter(val)
                setPagination((prev) => ({ ...prev, current: 1 }))
              }}
              allowClear
              placeholder="Grade"
              style={{ width: '100%' }}
              options={SVR_GRADE_OPTIONS.map((g) => ({
                value: g.value,
                label: g.label,
              }))}
            />
          </Col>
          {familyReady && (
            <Col xs={12} sm={6} md={3}>
              <Select
                value={orderKind}
                onChange={(v: OrderKindFilter) => {
                  setOrderKind(v)
                  setPagination((prev) => ({ ...prev, current: 1 }))
                }}
                aria-label="Loại đơn"
                style={{ width: '100%' }}
                popupMatchSelectWidth={false}
                options={[
                  { value: 'all', label: 'Mọi loại đơn' },
                  { value: 'new', label: ORDER_KIND_LABELS.new },
                  { value: 'continuation', label: `⧉ ${ORDER_KIND_LABELS.continuation}` },
                ]}
              />
            </Col>
          )}
          <Col xs={24} sm={familyReady ? 12 : 6} md={familyReady ? 5 : 8}>
            <RangePicker
              value={dateRange}
              onChange={(dates) => {
                setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)
                setPagination((prev) => ({ ...prev, current: 1 }))
              }}
              placeholder={['Ngày đặt từ', 'Đến ngày']}
              format="DD/MM/YYYY"
              style={{ width: '100%' }}
              allowClear
            />
          </Col>
          </>)}
        </Row>
      </Card>

      {/* Q3: Color legend đã bỏ. Row chỉ còn 2 màu — xanh nhạt (đã TT) + đỏ nhạt (quá hạn/L/C hết).
          User hover row sẽ thấy tooltip giải thích — không cần legend chip riêng. */}

      {/* Bulk action bar — hiện khi có row được chọn */}
      {!isPhone && selectedRowKeys.length > 0 && (
        <div style={{
          padding: '8px 14px',
          background: '#e6f4ff',
          border: '1px solid #91caff',
          borderRadius: 6,
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: 13,
        }}>
          <span style={{ color: '#0958d9', fontWeight: 600 }}>
            ✓ Đã chọn {selectedRowKeys.length} đơn
          </span>
          <span style={{ color: '#666' }}>·</span>
          <Button size="small" onClick={() => setSelectedRowKeys([])}>Bỏ chọn</Button>
          <Button size="small" onClick={() => {
            const codes = selectedOrders.map((o: SalesOrder) => soDisplayCode(o)).join(', ')
            message.info(`Đã copy ${selectedOrders.length} mã đơn: ${codes}`)
            navigator.clipboard?.writeText(codes)
          }}>📋 Copy mã đơn</Button>
          <Button
            size="small"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExportSelected}
            style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Xuất Excel ({selectedOrders.length})
          </Button>
          <span style={{ marginLeft: 'auto', color: '#666' }}>
            Tổng giá trị (USD): <strong>{fmtMoney(selectedOrders.reduce((s: number, o: SalesOrder) => s + (o.total_value_usd || 0), 0), 'USD', { decimals: 0 })}</strong>
          </span>
        </div>
      )}

      {/* DÒNG TỔNG — tính trên TOÀN BỘ đơn khớp bộ lọc, KHÔNG phải trang hiện tại.
          Đây là con số khách dùng: "lọc Grade = RSS → còn thiếu bao nhiêu tấn". */}
      {summary && summary.orders > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20,
          padding: '10px 14px', marginBottom: 10, borderRadius: 8,
          background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 13,
        }}>
          <span style={{ fontWeight: 700, color: '#1B4D3E' }}>
            TỔNG · {summary.orders} đơn <span style={{ fontWeight: 400, color: '#64748b' }}>(toàn bộ bộ lọc, trừ đơn hủy)</span>
          </span>
          <span>SL: <b style={{ fontFamily: 'monospace' }}>{summary.qty.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}</b> T</span>
          <span>Đã giao: <b style={{ fontFamily: 'monospace', color: '#15803d' }}>
            {summary.delivered.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}{summary.estimated ? ' ~' : ''}</b> T</span>
          <span>Còn thiếu: <b style={{ fontFamily: 'monospace', color: '#dc2626', fontSize: 15 }}>
            {summary.shortage.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}</b> T</span>
          {summary.estimated && (
            <span style={{ color: '#92400e' }}>~ = có container đã giao chưa nhập KL → ước lượng</span>
          )}
          {summary.truncated && (
            <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠ Tổng chưa đủ đơn — thu hẹp bộ lọc</span>
          )}
          {/* Bộ lọc Grade lọc theo grade CẤP ĐƠN, còn SL là tấn CẢ ĐƠN. Hệ thống có 2 đơn
              nhiều loại hàng → với các đơn đó tổng gồm cả tấn loại khác. Nói rõ, không để
              khách tưởng đây là con số tuyệt đối riêng cho grade đang lọc. */}
          {gradeFilter && (
            <span style={{ color: '#92400e' }}>
              ⓘ Tổng tính theo tấn <b>cả đơn</b> — đơn có nhiều loại hàng sẽ gồm cả loại khác
            </span>
          )}
        </div>
      )}

      {/* Body: điện thoại → thẻ · máy tính → Split view HOẶC Table view tuỳ viewMode.
          Tải lỗi → khối lỗi + Thử lại (không vẽ "Không tìm thấy đơn hàng nào" giả). */}
      {loadError && !loading ? (
        <PageState error={loadError} onRetry={fetchOrders} />
      ) : isPhone ? (
        <SalesOrderPhoneList
          orders={orders}
          loading={loading}
          lotProgress={lotProgress}
          lotPay={lotPay}
          page={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            onChange: (page) => setPagination((prev) => ({ ...prev, current: page })),
          }}
          onOpen={(o) => { setPanelOrderId(o.id); setPanelOpen(true) }}
          empty={emptyState}
          familyReady={familyReady}
          familyCounts={familyCounts}
          onFamilyFilter={applyFamilyRoot}
        />
      ) : viewMode === 'split' ? (
        <SalesOrderSplitView
          orders={orders}
          loading={loading}
          onOrderUpdated={fetchOrders}
          lotProgress={lotProgress}
        />
      ) : (
      <Card style={{ borderRadius: 8 }}>
        <Table<SalesOrder>
          rowKey="id"
          columns={columns.filter(c =>
            !hiddenCols.has(c.key as string) && (familyReady || !FAMILY_COL_KEYS.has(c.key as string)))}
          dataSource={orders}
          rowSelection={rowSelection}
          loading={loading}
          expandable={{
            // Dòng mở rộng: bảng mặt hàng (đơn nhiều mặt hàng) + khối "Các đợt cùng HĐ" (nạp khi mở dòng)
            expandedRowRender: (record) => {
              const items = (record as any).items as any[] || []
              const family = isFamilyMember(record)
                ? <FamilyRowsBlock rootId={record.parent_order_id || record.id} currentId={record.id} onOpen={openOrderTabById} />
                : null
              if (items.length <= 1) return family
              return (
                <>
                <div style={{ padding: '4px 0' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: '#666' }}>Loại hàng</th>
                        <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, color: '#666' }}>Số lượng</th>
                        <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, color: '#666' }}>Đơn giá</th>
                        <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, color: '#666' }}>Thành tiền</th>
                        <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, color: '#666' }}>Tổng bành</th>
                        <th style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, color: '#666' }}>Container</th>
                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: '#666' }}>KG/bành</th>
                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: '#666' }}>Đóng gói</th>
                        <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: '#666' }}>Thanh toán</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item: any, i: number) => (
                        <tr key={item.id || i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                          <td style={{ padding: '6px 12px' }}><Tag color="green">{item.grade}</Tag></td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{item.quantity_tons} tấn</td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{fmtMoney(item.unit_price, record.currency, { decimals: 0 })}</td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#1B4D3E' }}>
                            {isVnd(record.currency)
                              ? fmtMoney((item.quantity_tons || 0) * (item.unit_price || 0), 'VND')
                              : fmtMoney(item.total_value_usd, 'USD', { decimals: 0 })}
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{item.total_bales?.toLocaleString('vi-VN')}</td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{item.container_count}</td>
                          <td style={{ padding: '6px 12px' }}>{item.bale_weight_kg} kg</td>
                          <td style={{ padding: '6px 12px', fontSize: 11 }}>{PACKING_TYPE_LABELS[item.packing_type as PackingType] || 'Loose Bale'}</td>
                          <td style={{ padding: '6px 12px', fontSize: 11 }}>{item.payment_terms ? item.payment_terms.split(',').map((pt: string) => pt.replace(/_/g, ' ')).join(' + ') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {family}
                </>
              )
            },
            rowExpandable: (record) => ((record as any).items?.length || 0) > 1 || isFamilyMember(record),
          }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `Tổng ${t} đơn hàng`,
            pageSizeOptions: ['10', '20', '50'],
          }}
          onChange={handleTableChange}
          scroll={{ x: 1850 }}
          size={densityConfig.size}
          locale={{ emptyText: emptyState }}
          onRow={(record) => ({
            onClick: () => {
              setPanelOrderId(record.id)
              setPanelOpen(true)
            },
            style: {
              cursor: 'pointer',
              ...getRowStyle(record),
              borderLeft: getRowBorderLeft(record),
            },
          })}
        />
      </Card>
      )}

      {/* Huỷ đơn — bắt lý do, đi qua cancelOrder (ghi lý do + nhả phân bổ tồn kho) */}
      <Modal
        title={cancelTarget ? `Huỷ đơn ${soDisplayCode(cancelTarget)}?` : 'Huỷ đơn'}
        open={!!cancelTarget}
        onCancel={() => { if (!cancelling) { setCancelTarget(null); setCancelReason('') } }}
        onOk={handleCancel}
        confirmLoading={cancelling}
        okText="Huỷ đơn"
        cancelText="Không huỷ"
        okButtonProps={{ danger: true, disabled: !cancelReason.trim() }}
      >
        <p style={{ marginBottom: 8, color: '#666', fontSize: 13 }}>
          Đơn chuyển sang "Đã huỷ" (vẫn giữ lịch sử, không xoá). Hàng đã phân bổ cho đơn sẽ được trả về kho.
          Đơn đã huỷ không đổi lại trạng thái được.
        </p>
        <Input.TextArea
          autoFocus
          rows={3}
          maxLength={500}
          placeholder="Lý do huỷ (bắt buộc) — VD: khách rút đơn, đổi sang HĐ mới…"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
        />
      </Modal>

      {/* Xoá vĩnh viễn đơn đã xác nhận trở đi — gõ lại số HĐ mới bấm được */}
      <Modal
        title={deleteTarget ? `Xóa vĩnh viễn ${soDisplayCode(deleteTarget)}?` : 'Xóa đơn'}
        open={!!deleteTarget}
        onCancel={() => { setDeleteTarget(null); setDeleteTyped('') }}
        onOk={() => deleteTarget && handleDelete(deleteTarget)}
        okText="Xóa vĩnh viễn"
        cancelText="Không xóa"
        okButtonProps={{ danger: true, disabled: !deleteTarget || deleteTyped.trim() !== soDisplayCode(deleteTarget) }}
      >
        {deleteTarget && (
          <>
            <p style={{ marginBottom: 8, fontSize: 13 }}>
              Đơn đang ở trạng thái <b>{ORDER_STATUS_LABELS[deleteTarget.status]}</b> — đã ký với khách. Xóa sẽ mất
              vĩnh viễn đơn cùng toàn bộ sản phẩm, container, chứng từ, hoá đơn gắn với đơn. <b>Không hoàn tác được.</b>
            </p>
            <p style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>
              Chỉ muốn dừng đơn? Dùng "Huỷ đơn" ở cột Trạng thái — giữ lại lịch sử.
            </p>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              Gõ lại <b style={{ fontFamily: 'monospace' }}>{soDisplayCode(deleteTarget)}</b> để xác nhận:
            </div>
            <Input
              autoFocus
              value={deleteTyped}
              placeholder={soDisplayCode(deleteTarget)}
              onChange={(e) => setDeleteTyped(e.target.value)}
              style={{ fontFamily: 'monospace' }}
            />
          </>
        )}
      </Modal>

      {/* M4-B: Modal lưu bộ lọc (saved view) */}
      <Modal
        title="Lưu bộ lọc hiện tại"
        open={saveViewModalOpen}
        onCancel={() => { setSaveViewModalOpen(false); setNewViewName('') }}
        onOk={handleSaveView}
        okText="Lưu"
        cancelText="Hủy"
      >
        <p style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
          Đặt tên cho bộ lọc này. Sẽ lưu toàn bộ bộ lọc + cột + sắp xếp + độ dày dòng hiện tại.
        </p>
        <Input
          autoFocus
          placeholder="VD: Đơn quá hạn của tôi"
          value={newViewName}
          onChange={(e) => setNewViewName(e.target.value)}
          onPressEnter={handleSaveView}
        />
        <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
          {activeFilters.length} bộ lọc đang bật · {shownHideableCount}/{hideableCols.length} cột hiện · Độ dày dòng: {{ compact: 'Gọn', normal: 'Vừa', comfortable: 'Thoáng' }[density]}
        </div>
      </Modal>

      {/* v4: Slide-in Detail Panel — chỉ dùng cho Table view, Split tự render inline */}
      <SalesOrderDetailPanel
        orderId={panelOrderId}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onOrderUpdated={fetchOrders}
      />

      {/* Cmd+K Command Palette — global, mount sau cùng để overlay đầy đủ */}
      <SalesCommandPalette
        orders={orders}
        onOpenOrder={(id) => {
          setPanelOrderId(id)
          setPanelOpen(true)
        }}
      />
    </div>
  )
}

export default SalesOrderListPage
