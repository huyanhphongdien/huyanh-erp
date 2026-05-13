// ============================================================================
// SALES ORDER LIST PAGE — Danh sách Đơn hàng bán quốc tế
// File: src/pages/sales/SalesOrderListPage.tsx
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
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
  message,
} from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import type { FilterValue, SorterResult } from 'antd/es/table/interface'
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
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { salesOrderService } from '../../services/sales/salesOrderService'
import type { SalesOrderStats, SalesOrderListParams } from '../../services/sales/salesOrderService'
import StagePill from '../../components/common/StagePill'
import type { SalesStage } from '../../services/sales/salesStages'
import { getSLAStatus } from '../../services/sales/salesStages'
import { salesCustomerService } from '../../services/sales/salesCustomerService'
import {
  type SalesOrder,
  type SalesOrderStatus,
  type SalesCustomer,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  SVR_GRADE_OPTIONS,
} from '../../services/sales/salesTypes'
import GradeBadge from '../../components/wms/GradeBadge'
import { useAuthStore } from '../../stores/authStore'
import { getSalesRole } from '../../services/sales/salesPermissionService'
import SalesOrderDetailPanel from './components/SalesOrderDetailPanel'
import { useOpenTab } from '../../hooks/useOpenTab'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

// ============================================
// COUNTRY FLAG HELPER
// ============================================

const COUNTRY_FLAGS: Record<string, string> = {
  JP: '\u{1F1EF}\u{1F1F5}',
  CN: '\u{1F1E8}\u{1F1F3}',
  IN: '\u{1F1EE}\u{1F1F3}',
  DE: '\u{1F1E9}\u{1F1EA}',
  US: '\u{1F1FA}\u{1F1F8}',
  MY: '\u{1F1F2}\u{1F1FE}',
  KR: '\u{1F1F0}\u{1F1F7}',
  TW: '\u{1F1F9}\u{1F1FC}',
  TR: '\u{1F1F9}\u{1F1F7}',
  BR: '\u{1F1E7}\u{1F1F7}',
  IT: '\u{1F1EE}\u{1F1F9}',
  FR: '\u{1F1EB}\u{1F1F7}',
  ES: '\u{1F1EA}\u{1F1F8}',
  TH: '\u{1F1F9}\u{1F1ED}',
  ID: '\u{1F1EE}\u{1F1E9}',
  RU: '\u{1F1F7}\u{1F1FA}',
  PK: '\u{1F1F5}\u{1F1F0}',
  BD: '\u{1F1E7}\u{1F1E9}',
  EG: '\u{1F1EA}\u{1F1EC}',
}

const getCountryFlag = (code?: string): string => {
  if (!code) return ''
  return COUNTRY_FLAGS[code] || '\u{1F3F3}\u{FE0F}'
}

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
  customer_po: 'Số LOT',
  quantity_tons: 'Số lượng (tấn)',
  unit_price: 'Đơn giá',
  total_value_usd: 'Thành tiền',
  bank_name: 'Ngân hàng',
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

const formatCurrency = (value?: number): string => {
  if (value == null) return '-'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

const formatDate = (date?: string): string => {
  if (!date) return '-'
  return dayjs(date).format('DD/MM/YYYY')
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
  { key: 'shipped', label: 'Đã xuất' },
  { key: 'delivered', label: 'Đã giao' },
  { key: 'invoiced', label: 'Đã lập HĐ' },
  { key: 'paid', label: 'Đã TT' },
]

// ============================================
// MAIN COMPONENT
// ============================================

const SalesOrderListPage = () => {
  const navigate = useNavigate()
  const openTab = useOpenTab()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuthStore()
  const salesRole = getSalesRole(user)
  const isAdmin = salesRole === 'admin'

  // Mở chi tiết đơn thành tab (full editing) — phân biệt với row click (slide panel preview)
  const openOrderTab = (record: SalesOrder) => {
    const contractNo = (record as any).contract_no || record.code
    openTab({
      key: `sales-order-${record.id}`,
      title: `Đơn ${contractNo}`,
      componentId: 'sales-order-detail',
      props: { orderId: record.id },
      path: `/sales/orders/${record.id}`,
    })
  }

  // State
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<SalesOrderStats>({
    total: 0,
    draft: 0,
    confirmed: 0,
    producing: 0,
    ready: 0,
    shipped: 0,
    overdue_etd: 0,
    total_value_usd_month: 0,
    orders_this_month: 0,
  })
  const [customers, setCustomers] = useState<SalesCustomer[]>([])

  // Filters
  const [searchText, setSearchText] = useState('')
  const [statusTab, setStatusTab] = useState<string>('all')
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

  // Detail panel v4
  const [panelOrderId, setPanelOrderId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  // Row selection — checkbox tick từng đơn, hỗ trợ bulk action
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

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

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true)
      const params: SalesOrderListParams = {
        page: pagination.current,
        pageSize: pagination.pageSize,
        search: searchText || undefined,
        status: statusTab !== 'all' ? (statusTab as SalesOrderStatus) : undefined,
        customer_id: customerFilter || undefined,
        grade: gradeFilter || undefined,
        date_from: dateRange?.[0]?.format('YYYY-MM-DD') || undefined,
        date_to: dateRange?.[1]?.format('YYYY-MM-DD') || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        overdue_etd_only: overdueEtdOnly || undefined,
      }
      const response = await salesOrderService.getList(params)
      setOrders(response.data)
      setTotal(response.total)
    } catch (error) {
      console.error('Error fetching orders:', error)
      message.error('Không thể tải danh sách đơn hàng')
    } finally {
      setLoading(false)
    }
  }, [pagination, searchText, statusTab, customerFilter, gradeFilter, dateRange, sortBy, sortOrder, overdueEtdOnly])

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
  ) => {
    setPagination({
      current: pag.current || 1,
      pageSize: pag.pageSize || 10,
    })

    // Sort: map column key → server field. Server hỗ trợ sort theo column trong table.
    const single = Array.isArray(sorter) ? sorter[0] : sorter
    if (single && single.order && single.field) {
      // single.field có thể là string hoặc array — Ant Design typing
      const field = String(single.field)
      // Map column key → DB field
      const fieldMap: Record<string, string> = {
        // Click cột SỐ HĐ → sort theo `contract_no_sort_key` (generated column,
        // = last 4 chữ số của contract_no parse INT). Vd HA20260001→1,
        // HA20240046→46, HA20260050→50. Sort numeric ASC sẽ:
        //   HA20260001 (1), HA20260002 (2), ..., HA20240046 (46), ..., HA20260050 (50)
        // → User thấy đơn 2024 chen giữa list theo suffix number, đúng mong muốn.
        contract_no: 'contract_no_sort_key',
        customer: 'customer_id',
        grade: 'grade',
        lot: 'customer_po',
        qty: 'quantity_tons',
        delivery: 'delivery_date',
        ready_date: 'ready_date',
        bank: 'bank_name',
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
      setSortBy(fieldMap[field] || field)
      setSortOrder(single.order === 'ascend' ? 'asc' : 'desc')
    } else if (single && single.field && !single.order) {
      // User click lần 3 trên cùng cột → clear sort → fallback default
      setSortBy('created_at')
      setSortOrder('desc')
    }
    // Trường hợp khác (pagination, filter, ...): GIỮ NGUYÊN sort hiện tại,
    // không setSortBy gì cả → tránh bug pagination reset sort.

    // Filter: chỉ grade hiện hỗ trợ ở column header (đồng bộ với gradeFilter ở toolbar)
    if (filters.grade && filters.grade.length > 0) {
      setGradeFilter(String(filters.grade[0]))
    } else if (filters.grade !== undefined) {
      // user clear filter
      setGradeFilter(undefined)
    }
  }

  const handleConfirm = async (order: SalesOrder) => {
    try {
      await salesOrderService.updateStatus(order.id, 'confirmed')
      message.success(`Đã xác nhận đơn hàng ${order.code}`)
      fetchOrders()
      fetchStats()
    } catch (error) {
      console.error('Confirm error:', error)
      message.error('Không thể xác nhận đơn hàng')
    }
  }

  const handleCancel = async (order: SalesOrder) => {
    try {
      await salesOrderService.cancelOrder(order.id, 'Hủy từ danh sách')
      message.success(`Đã hủy đơn hàng ${order.code}`)
      fetchOrders()
      fetchStats()
    } catch (error) {
      console.error('Cancel error:', error)
      message.error('Không thể hủy đơn hàng')
    }
  }

  // Delete — chỉ Admin
  const handleDelete = async (order: SalesOrder) => {
    try {
      await salesOrderService.deleteOrder(order.id)
      message.success(`Đã xóa đơn hàng ${order.code}`)
      fetchOrders()
      fetchStats()
    } catch (error: any) {
      message.error(error.message || 'Không thể xóa đơn hàng')
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
    const formatted = formatDate(d)
    if (days <= 0) return <Tag color="red" style={{ fontSize: 11 }}>{formatted}</Tag>
    if (days <= 7) return <Tag color="red" style={{ fontSize: 11 }}>{formatted}</Tag>
    if (days <= 20) return <Tag color="orange" style={{ fontSize: 11 }}>{formatted}</Tag>
    return <span style={{ fontSize: 12 }}>{formatted}</span>
  }

  // ── Header style ──
  // Q5 UX: nếu là viết tắt → wrap Tooltip cho rõ nghĩa
  const HDR_TOOLTIPS: Record<string, string> = {
    'Số HĐ': 'Số hợp đồng (HA20YYYYNNNN)',
    'SL (tấn)': 'Số lượng (tấn)',
    'Số LOT': 'Số LOT của khách hàng (Customer PO)',
    'Số BKG': 'Số booking vận tải (đặt tàu)',
    'ETD': 'Estimated Time of Departure — Ngày tàu chạy dự kiến',
    'Đ.giá': 'Đơn giá USD/tấn',
    'CK': 'Chiết khấu',
    'NH CK': 'Ngân hàng chiết khấu',
    'T.độ': 'Tiến độ 4 phase: Hợp đồng → Sản xuất → Logistics → Kế toán',
    'Tiền về': 'Ngày tiền về tài khoản',
  }
  const hdr = (title: string) => {
    const tip = HDR_TOOLTIPS[title]
    const inner = <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{title}</span>
    return tip ? <Tooltip title={tip}>{inner}</Tooltip> : inner
  }

  // Helpers map state ↔ Ant sort order
  const sortedColumn = (key: string) =>
    sortBy === (key === 'lot' ? 'customer_po' : key === 'qty' ? 'quantity_tons' :
      key === 'delivery' ? 'delivery_date' : key === 'bank' ? 'bank_name' :
      key === 'bkg' ? 'booking_reference' : key === 'total_usd' ? 'total_value_usd' :
      key === 'deposit' ? 'deposit_amount' : key === 'discount' ? 'discount_amount' :
      key === 'remaining' ? 'remaining_amount' : key === 'payment_date' ? 'payment_received_date' :
      key === 'customer' ? 'customer_id' : key === 'contract_no' ? 'contract_no_sort_key' : key)
      ? (sortOrder === 'asc' ? 'ascend' as const : 'descend' as const)
      : null

  // Filter values — đồng bộ với toolbar
  const gradeFilteredValue = gradeFilter ? [gradeFilter] : null

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
      render: (_: string, r: SalesOrder) => mono(<strong>{(r as any).contract_no || r.code}</strong>),
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
        return <span style={{ fontSize: 12 }}>{c.country ? getCountryFlag(c.country) + ' ' : ''}{c.short_name || c.name}</span>
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
      title: hdr('Số LOT'),
      dataIndex: 'customer_po',
      key: 'lot',
      width: 100,
      ellipsis: true,
      sorter: true,
      sortOrder: sortedColumn('lot'),
      render: (v: string) => v ? <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{v}</span> : gray(null),
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
      title: hdr('Hạn giao'),
      dataIndex: 'delivery_date',
      key: 'delivery',
      width: 90,
      sorter: true,
      sortOrder: sortedColumn('delivery'),
      render: (d: string) => d ? <span style={{ fontSize: 12 }}>{formatDate(d)}</span> : gray(null),
    },
    {
      title: hdr('Sẵn hàng'),
      dataIndex: 'ready_date',
      key: 'ready_date',
      width: 85,
      sorter: true,
      sortOrder: sortedColumn('ready_date'),
      render: (d: string) => d ? <span style={{ fontSize: 12 }}>{formatDate(d)}</span> : gray(null),
    },
    {
      title: hdr('Ngân hàng'),
      dataIndex: 'bank_name',
      key: 'bank',
      width: 110,
      ellipsis: true,
      sorter: true,
      sortOrder: sortedColumn('bank'),
      render: (v: string) => v ? <span style={{ fontSize: 11 }}>{v}</span> : gray(null),
    },
    {
      title: hdr('Số BKG'),
      dataIndex: 'booking_reference',
      key: 'bkg',
      width: 100,
      ellipsis: true,
      sorter: true,
      sortOrder: sortedColumn('bkg'),
      render: (v: string) => v ? <span style={{ fontSize: 11 }}>{v}</span> : gray(null),
    },
    {
      title: hdr('ETD'),
      dataIndex: 'etd',
      key: 'etd',
      width: 90,
      sorter: true,
      sortOrder: sortedColumn('etd'),
      render: (d: string) => d ? <span style={{ fontSize: 12 }}>{formatDate(d)}</span> : gray(null),
    },
    {
      title: hdr('Đ.giá'),
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 80,
      align: 'right',
      sorter: true,
      sortOrder: sortedColumn('unit_price'),
      render: (v: number) => v ? mono(formatCurrency(v)) : gray(null),
    },
    {
      title: hdr('Thành tiền'),
      dataIndex: 'total_value_usd',
      key: 'total_usd',
      width: 110,
      align: 'right',
      sorter: true,
      sortOrder: sortedColumn('total_usd'),
      render: (v: number) => v ? <strong style={{ color: '#1B4D3E', fontFamily: 'monospace', fontSize: 12 }}>{formatCurrency(v)}</strong> : gray(null),
    },
    {
      title: hdr('Đặt cọc'),
      dataIndex: 'deposit_amount',
      key: 'deposit',
      width: 85,
      align: 'right',
      sorter: true,
      sortOrder: sortedColumn('deposit'),
      render: (v: number) => v ? mono(formatCurrency(v)) : gray(null),
    },
    {
      title: hdr('CK'),
      dataIndex: 'discount_amount',
      key: 'discount',
      width: 85,
      align: 'right',
      sorter: true,
      sortOrder: sortedColumn('discount'),
      render: (v: number) => v ? mono(formatCurrency(v)) : gray(null),
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
        return remaining ? <strong style={{ color: '#1677ff', fontFamily: 'monospace', fontSize: 12 }}>{formatCurrency(remaining)}</strong> : gray(null)
      },
    },
    {
      title: hdr('Tiền về'),
      dataIndex: 'payment_received_date',
      key: 'payment_date',
      width: 80,
      sorter: true,
      sortOrder: sortedColumn('payment_date'),
      render: (d: string) => d ? <span style={{ fontSize: 12 }}>{formatDate(d)}</span> : gray(null),
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
          {canDelete && (
            <Popconfirm
              title={`Xóa ${(record as any).contract_no || record.code}?`}
              description={record.status === 'draft' ? 'Đơn nháp — sẽ xóa vĩnh viễn' : 'Sẽ xóa kèm tất cả items / containers / docs'}
              onConfirm={() => handleDelete(record)}
              okText="Xóa"
              cancelText="Hủy"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
            </Popconfirm>
          )}
        </Space>
        )
      },
    },
  ]

  // ============================================
  // RENDER
  // ============================================

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            Đơn hàng bán
          </Title>
        </Col>
        <Col>
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
        </Col>
      </Row>

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
              : tab.key === 'shipped' ? stats.shipped
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
      </div>

      {/* Q2: Banner "đang lọc Quá ETD" + "Đang sắp xếp" — đã bỏ.
          Status filter overdue_etd thấy ở nút "Quá ETD" (đỏ khi active).
          Sort state thấy qua arrow trên column header (Ant Design tự render). */}

      {/* Filter Bar */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={8} md={7}>
            <Input.Search
              placeholder="Tìm số HĐ, booking, B/L, grade, ngân hàng..."
              allowClear
              onSearch={handleSearch}
              onChange={(e) => {
                if (!e.target.value) handleSearch('')
              }}
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            />
          </Col>
          <Col xs={12} sm={5} md={5}>
            <Select
              value={customerFilter}
              onChange={(val) => {
                setCustomerFilter(val)
                setPagination((prev) => ({ ...prev, current: 1 }))
              }}
              allowClear
              placeholder="Khách hàng"
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              options={customers.map((c) => ({
                label: `${getCountryFlag(c.country)} ${c.name}`,
                value: c.id,
              }))}
            />
          </Col>
          <Col xs={12} sm={5} md={4}>
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
          <Col xs={24} sm={6} md={8}>
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
        </Row>
      </Card>

      {/* Q3: Color legend đã bỏ. Row chỉ còn 2 màu — xanh nhạt (đã TT) + đỏ nhạt (quá hạn/L/C hết).
          User hover row sẽ thấy tooltip giải thích — không cần legend chip riêng. */}

      {/* Bulk action bar — hiện khi có row được chọn */}
      {selectedRowKeys.length > 0 && (
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
            const codes = selectedOrders.map((o: SalesOrder) => (o as any).contract_no || o.code).join(', ')
            message.info(`Đã copy ${selectedOrders.length} mã đơn: ${codes}`)
            navigator.clipboard?.writeText(codes)
          }}>📋 Copy mã đơn</Button>
          <span style={{ marginLeft: 'auto', color: '#666' }}>
            Tổng giá trị: <strong>${selectedOrders.reduce((s: number, o: SalesOrder) => s + (o.total_value_usd || 0), 0).toLocaleString()}</strong>
          </span>
        </div>
      )}

      {/* Table */}
      <Card style={{ borderRadius: 8 }}>
        <Table<SalesOrder>
          rowKey="id"
          columns={columns}
          dataSource={orders}
          rowSelection={rowSelection}
          loading={loading}
          expandable={{
            expandedRowRender: (record) => {
              const items = (record as any).items as any[] || []
              if (items.length <= 1) return null
              return (
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
                          <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace' }}>${item.unit_price?.toLocaleString()}</td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#1B4D3E' }}>${item.total_value_usd?.toLocaleString()}</td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{item.total_bales?.toLocaleString()}</td>
                          <td style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'monospace' }}>{item.container_count}</td>
                          <td style={{ padding: '6px 12px' }}>{item.bale_weight_kg} kg</td>
                          <td style={{ padding: '6px 12px', fontSize: 11 }}>{item.packing_type === 'sw_pallet' ? 'SW Pallet' : item.packing_type === 'wooden_pallet' ? 'Wooden Pallet' : item.packing_type === 'metal_box' ? 'Metal Box' : 'Loose Bale'}</td>
                          <td style={{ padding: '6px 12px', fontSize: 11 }}>{item.payment_terms ? item.payment_terms.split(',').map((pt: string) => pt.replace(/_/g, ' ')).join(' + ') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            },
            rowExpandable: (record) => ((record as any).items?.length || 0) > 1,
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
          scroll={{ x: 1600 }}
          size="small"
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

      {/* v4: Slide-in Detail Panel */}
      <SalesOrderDetailPanel
        orderId={panelOrderId}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onOrderUpdated={fetchOrders}
      />
    </div>
  )
}

export default SalesOrderListPage
