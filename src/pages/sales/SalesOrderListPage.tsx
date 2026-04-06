// ============================================================================
// SALES ORDER LIST PAGE — Danh sách Đơn hàng bán quốc tế
// File: src/pages/sales/SalesOrderListPage.tsx
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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
import {
  PlusOutlined,
  SearchOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  EditOutlined,
  InboxOutlined,
  CarOutlined,
  RocketOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { salesOrderService } from '../../services/sales/salesOrderService'
import type { SalesOrderStats, SalesOrderListParams } from '../../services/sales/salesOrderService'
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
import SalesOrderDetailPanel from './components/SalesOrderDetailPanel'

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
  { key: 'packing', label: 'Đóng gói' },
  { key: 'shipped', label: 'Đã xuất' },
  { key: 'delivered', label: 'Đã giao' },
  { key: 'paid', label: 'Đã TT' },
]

// ============================================
// MAIN COMPONENT
// ============================================

const SalesOrderListPage = () => {
  const navigate = useNavigate()

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

  // Detail panel v4
  const [panelOrderId, setPanelOrderId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

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
  }, [pagination, searchText, statusTab, customerFilter, gradeFilter, dateRange])

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

  const handleTableChange = (pag: TablePaginationConfig) => {
    setPagination({
      current: pag.current || 1,
      pageSize: pag.pageSize || 10,
    })
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

  // ============================================
  // ROW COLOR — v4: nhìn vào biết ngay thiếu gì
  // ============================================
  //
  // 🟢 Xanh lá: Đã thanh toán (xong)
  // 🔵 Xanh dương: Đã xuất/giao — chờ tiền
  // 🟡 Vàng: Thiếu logistics (chưa có BK/BL/ETD)
  // 🔴 Đỏ nhạt: Quá hạn giao hoặc L/C hết hạn
  // ⚪ Trắng: Đang sản xuất (bình thường)
  // 🩶 Xám: Nháp / Hủy

  const getRowStyle = (r: SalesOrder): React.CSSProperties => {
    if (r.status === 'cancelled') return { background: '#f5f5f5', opacity: 0.6 }
    if (r.status === 'paid') return { background: '#f6ffed' } // xanh lá nhạt — xong

    // Quá hạn giao?
    if (r.delivery_date) {
      const overdue = Math.ceil((Date.now() - new Date(r.delivery_date).getTime()) / 86400000)
      if (overdue > 0 && !['shipped', 'delivered', 'paid'].includes(r.status)) {
        return { background: '#fff1f0' } // đỏ nhạt — quá hạn giao
      }
    }
    // L/C hết hạn?
    if (r.lc_expiry_date) {
      const lcDays = Math.ceil((new Date(r.lc_expiry_date).getTime() - Date.now()) / 86400000)
      if (lcDays <= 0) return { background: '#fff1f0' } // đỏ nhạt
      if (lcDays <= 7) return { background: '#fff7e6' } // cam nhạt
    }

    if (['shipped', 'delivered', 'invoiced'].includes(r.status)) {
      return { background: '#e6f4ff' } // xanh dương nhạt — chờ tiền
    }

    // Đã confirm nhưng thiếu logistics
    if (['confirmed', 'producing', 'ready', 'packing'].includes(r.status)) {
      const missingLog = !r.booking_reference || !r.bl_number || !r.etd
      if (missingLog && ['ready', 'packing'].includes(r.status)) {
        return { background: '#fffbe6' } // vàng nhạt — thiếu LOG
      }
    }

    if (r.status === 'draft') return { background: '#fafafa' } // xám nhạt

    return {} // trắng — bình thường
  }

  // Left border accent theo trạng thái thiếu
  const getRowBorderLeft = (r: SalesOrder): string => {
    if (r.status === 'paid') return '3px solid #52c41a'
    if (r.status === 'cancelled') return '3px solid #d9d9d9'
    if (['shipped', 'delivered', 'invoiced'].includes(r.status)) return '3px solid #1677ff'

    if (r.delivery_date) {
      const overdue = Math.ceil((Date.now() - new Date(r.delivery_date).getTime()) / 86400000)
      if (overdue > 0 && !['shipped', 'delivered', 'paid'].includes(r.status)) return '3px solid #ff4d4f'
    }

    if (['ready', 'packing'].includes(r.status) && (!r.booking_reference || !r.bl_number || !r.etd)) {
      return '3px solid #faad14'
    }

    if (r.status === 'draft') return '3px solid #d9d9d9'
    return '3px solid #1B4D3E'
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

  // ── Column header with color bar ──
  const groupTitle = (title: string, color: string) => (
    <span style={{ borderBottom: `3px solid ${color}`, paddingBottom: 2, fontWeight: 600, fontSize: 11 }}>
      {title}
    </span>
  )

  const columns: ColumnsType<SalesOrder> = [
    // ═══ FROZEN: #, Mã HĐ, Buyer ═══
    {
      title: '#',
      key: 'index',
      width: 40,
      fixed: 'left',
      render: (_: unknown, __: SalesOrder, idx: number) => (
        <span style={{ color: '#999', fontSize: 11 }}>{(pagination.current - 1) * pagination.pageSize + idx + 1}</span>
      ),
    },
    {
      title: 'Mã HĐ',
      dataIndex: 'code',
      key: 'code',
      width: 120,
      fixed: 'left',
      render: (code: string) => mono(<strong>{code}</strong>),
    },
    {
      title: 'Buyer',
      dataIndex: 'customer',
      key: 'customer',
      width: 140,
      fixed: 'left',
      ellipsis: true,
      render: (_: unknown, r: SalesOrder) => {
        const c = r.customer
        if (!c) return gray(null)
        return <span style={{ fontSize: 12 }}>{c.country ? getCountryFlag(c.country) + ' ' : ''}{c.short_name || c.name}</span>
      },
    },

    // ═══ SALE GROUP (green) ═══
    {
      title: groupTitle('Grade', '#1B4D3E'),
      dataIndex: 'grade',
      key: 'grade',
      width: 80,
      render: (g: string) => <GradeBadge grade={g} size="small" />,
    },
    {
      title: groupTitle('Tấn', '#1B4D3E'),
      dataIndex: 'quantity_tons',
      key: 'qty',
      width: 70,
      align: 'right',
      render: (v: number) => v != null ? mono(v.toLocaleString('vi-VN')) : gray(null),
    },
    {
      title: groupTitle('$/tấn', '#1B4D3E'),
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 80,
      align: 'right',
      render: (v: number) => v ? mono(formatCurrency(v)) : gray(null),
    },
    {
      title: groupTitle('Tổng USD', '#1B4D3E'),
      dataIndex: 'total_value_usd',
      key: 'total_usd',
      width: 110,
      align: 'right',
      render: (v: number) => v ? <strong style={{ color: '#1B4D3E', fontFamily: 'monospace', fontSize: 12 }}>{formatCurrency(v)}</strong> : gray(null),
    },
    {
      title: groupTitle('Thanh toán', '#1B4D3E'),
      dataIndex: 'payment_terms',
      key: 'payment_terms',
      width: 80,
      render: (v: string) => v ? <span style={{ fontSize: 11 }}>{v}</span> : gray(null),
    },
    {
      title: groupTitle('Giao', '#1B4D3E'),
      dataIndex: 'delivery_date',
      key: 'delivery',
      width: 90,
      render: (d: string) => d ? <span style={{ fontSize: 12 }}>{formatDate(d)}</span> : gray(null),
    },

    // ═══ SX GROUP (blue) ═══
    {
      title: groupTitle('SX sẵn', '#1677ff'),
      dataIndex: 'ready_date',
      key: 'ready_date',
      width: 90,
      render: (d: string) => d ? <span style={{ fontSize: 12 }}>{formatDate(d)}</span> : gray(null),
    },
    {
      title: groupTitle('Cont', '#1677ff'),
      dataIndex: 'container_count',
      key: 'containers',
      width: 55,
      align: 'center',
      render: (v: number) => v ? mono(v) : gray(null),
    },

    // ═══ LOG GROUP (yellow/orange) ═══
    {
      title: groupTitle('BK', '#d48806'),
      dataIndex: 'booking_reference',
      key: 'bk',
      width: 80,
      ellipsis: true,
      render: (v: string) => v ? <span style={{ fontSize: 11 }}>{v}</span> : gray(null),
    },
    {
      title: groupTitle('B/L', '#d48806'),
      dataIndex: 'bl_number',
      key: 'bl',
      width: 80,
      ellipsis: true,
      render: (v: string) => v ? <span style={{ fontSize: 11 }}>{v}</span> : gray(null),
    },
    {
      title: groupTitle('ETD', '#d48806'),
      dataIndex: 'etd',
      key: 'etd',
      width: 90,
      render: (d: string) => d ? <span style={{ fontSize: 12 }}>{formatDate(d)}</span> : gray(null),
    },
    {
      title: groupTitle('L/C hạn', '#d48806'),
      dataIndex: 'lc_expiry_date',
      key: 'lc_expiry',
      width: 100,
      render: (d: string) => lcBadge(d),
    },
    {
      title: groupTitle('CK $', '#d48806'),
      dataIndex: 'discount_amount',
      key: 'discount',
      width: 80,
      align: 'right',
      render: (v: number) => v ? mono(formatCurrency(v)) : gray(null),
    },

    // ═══ KT GROUP (red/pink) ═══
    {
      title: groupTitle('Tỷ giá', '#cf1322'),
      dataIndex: 'exchange_rate',
      key: 'exrate',
      width: 80,
      align: 'right',
      render: (v: number) => v ? mono(v.toLocaleString('vi-VN')) : gray(null),
    },
    {
      title: groupTitle('Tiền về', '#cf1322'),
      dataIndex: 'payment_received_date',
      key: 'payment_date',
      width: 90,
      render: (d: string) => d ? <span style={{ fontSize: 12 }}>{formatDate(d)}</span> : gray(null),
    },
    {
      title: groupTitle('TT', '#cf1322'),
      dataIndex: 'payment_status',
      key: 'pay_status',
      width: 65,
      render: (v: string) => {
        if (!v || v === 'unpaid') return gray(null)
        if (v === 'paid') return <Tag color="green" style={{ fontSize: 10, padding: '0 4px' }}>TT</Tag>
        return <Tag color="blue" style={{ fontSize: 10, padding: '0 4px' }}>1P</Tag>
      },
    },

    // ═══ STATUS ═══
    {
      title: 'Tiến độ',
      key: 'progress',
      width: 90,
      align: 'center',
      render: (_: unknown, r: SalesOrder) => progressDots(r),
    },

    // ═══ ACTIONS (fixed right) ═══
    {
      title: '',
      key: 'actions',
      width: 80,
      fixed: 'right',
      render: (_: unknown, record: SalesOrder) => (
        <Space size={2}>
          <Tooltip title="Xem">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                setPanelOrderId(record.id)
                setPanelOpen(true)
              }}
            />
          </Tooltip>
          {record.status === 'draft' && (
            <Popconfirm
              title={`Xác nhận ${record.code}?`}
              onConfirm={() => handleConfirm(record)}
              okText="OK"
              cancelText="Hủy"
            >
              <Tooltip title="Xác nhận">
                <Button
                  type="text"
                  size="small"
                  icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                  onClick={(e) => e.stopPropagation()}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
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
            onClick={() => navigate('/sales/orders/new')}
            style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Tạo đơn hàng
          </Button>
        </Col>
      </Row>

      {/* Stats Row — 6 mini cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Tổng đơn"
              value={stats.total}
              prefix={<FileTextOutlined style={{ color: '#1B4D3E' }} />}
              valueStyle={{ color: '#1B4D3E' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Nháp"
              value={stats.draft}
              prefix={<EditOutlined style={{ color: '#8c8c8c' }} />}
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Đã xác nhận"
              value={stats.confirmed}
              prefix={<CheckCircleOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Đang SX"
              value={stats.producing}
              prefix={<InboxOutlined style={{ color: '#fa8c16' }} />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Sẵn sàng"
              value={stats.ready}
              prefix={<CarOutlined style={{ color: '#13c2c2' }} />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Đã xuất"
              value={stats.shipped}
              prefix={<RocketOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabs by status */}
      <Tabs
        activeKey={statusTab}
        onChange={handleTabChange}
        style={{ marginBottom: 16 }}
        items={STATUS_TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
        }))}
      />

      {/* Filter Bar */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 8 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={8} md={7}>
            <Input.Search
              placeholder="Tìm mã đơn, mã KH, PO#..."
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

      {/* Color Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', fontSize: 12, color: '#666' }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: '#f6ffed', border: '1px solid #b7eb8f', marginRight: 4, verticalAlign: 'middle' }} /> Đã TT</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: '#e6f4ff', border: '1px solid #91caff', marginRight: 4, verticalAlign: 'middle' }} /> Chờ tiền</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: '#fffbe6', border: '1px solid #ffe58f', marginRight: 4, verticalAlign: 'middle' }} /> Thiếu LOG</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: '#fff1f0', border: '1px solid #ffa39e', marginRight: 4, verticalAlign: 'middle' }} /> Quá hạn / L/C hết</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: '#fafafa', border: '1px solid #d9d9d9', marginRight: 4, verticalAlign: 'middle' }} /> Nháp</span>
      </div>

      {/* Table */}
      <Card style={{ borderRadius: 8 }}>
        <Table<SalesOrder>
          rowKey="id"
          columns={columns}
          dataSource={orders}
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `Tổng ${t} đơn hàng`,
            pageSizeOptions: ['10', '20', '50'],
          }}
          onChange={handleTableChange}
          scroll={{ x: 2000 }}
          summary={() => {
            if (!orders.length) return null
            const totalQty = orders.reduce((s, o) => s + (o.quantity_tons || 0), 0)
            const totalUSD = orders.reduce((s, o) => s + (o.total_value_usd || o.quantity_tons * o.unit_price || 0), 0)
            const totalDiscount = orders.reduce((s, o) => s + (o.discount_amount || 0), 0)
            return (
              <Table.Summary fixed>
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4} align="right">
                    <strong style={{ fontSize: 12 }}>Tổng trang:</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <strong style={{ fontFamily: 'monospace', fontSize: 12 }}>{totalQty.toLocaleString('vi-VN')}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} />
                  <Table.Summary.Cell index={6} align="right">
                    <strong style={{ fontFamily: 'monospace', fontSize: 12, color: '#1B4D3E' }}>{formatCurrency(totalUSD)}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} colSpan={9} />
                  <Table.Summary.Cell index={16} align="right">
                    <strong style={{ fontFamily: 'monospace', fontSize: 12, color: '#d48806' }}>{totalDiscount > 0 ? formatCurrency(totalDiscount) : ''}</strong>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={17} colSpan={4} />
                </Table.Summary.Row>
              </Table.Summary>
            )
          }}
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
          size="middle"
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
