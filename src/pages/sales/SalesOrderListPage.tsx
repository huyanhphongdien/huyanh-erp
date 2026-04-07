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
  const { user } = useAuthStore()
  const salesRole = getSalesRole(user)
  const isAdmin = salesRole === 'admin'

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

  // ── Header style ──
  const hdr = (title: string) => (
    <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{title}</span>
  )

  const columns: ColumnsType<SalesOrder> = [
    // ═══ CỘT THEO YÊU CẦU ═══
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
      render: (_: string, r: SalesOrder) => mono(<strong>{(r as any).contract_no || r.code}</strong>),
    },
    {
      title: hdr('Người mua'),
      dataIndex: 'customer',
      key: 'customer',
      width: 150,
      fixed: 'left',
      ellipsis: true,
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
      width: 90,
      render: (g: string) => g ? <GradeBadge grade={g} size="small" /> : gray(null),
    },
    {
      title: hdr('Số LOT'),
      dataIndex: 'customer_po',
      key: 'lot',
      width: 100,
      ellipsis: true,
      render: (v: string) => v ? <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{v}</span> : gray(null),
    },
    {
      title: hdr('SL (tấn)'),
      dataIndex: 'quantity_tons',
      key: 'qty',
      width: 75,
      align: 'right',
      render: (v: number) => v != null ? mono(v.toLocaleString('vi-VN')) : gray(null),
    },
    {
      title: hdr('Hạn giao'),
      dataIndex: 'delivery_date',
      key: 'delivery',
      width: 90,
      render: (d: string) => d ? <span style={{ fontSize: 12 }}>{formatDate(d)}</span> : gray(null),
    },
    {
      title: hdr('Sẵn hàng'),
      dataIndex: 'ready_date',
      key: 'ready_date',
      width: 85,
      render: (d: string) => d ? <span style={{ fontSize: 12 }}>{formatDate(d)}</span> : gray(null),
    },
    {
      title: hdr('Ngân hàng'),
      dataIndex: 'bank_name',
      key: 'bank',
      width: 110,
      ellipsis: true,
      render: (v: string) => v ? <span style={{ fontSize: 11 }}>{v}</span> : gray(null),
    },
    {
      title: hdr('Số BKG'),
      dataIndex: 'booking_reference',
      key: 'bkg',
      width: 100,
      ellipsis: true,
      render: (v: string) => v ? <span style={{ fontSize: 11 }}>{v}</span> : gray(null),
    },
    {
      title: hdr('ETD'),
      dataIndex: 'etd',
      key: 'etd',
      width: 90,
      render: (d: string) => d ? <span style={{ fontSize: 12 }}>{formatDate(d)}</span> : gray(null),
    },
    {
      title: hdr('Đ.giá'),
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 80,
      align: 'right',
      render: (v: number) => v ? mono(formatCurrency(v)) : gray(null),
    },
    {
      title: hdr('Thành tiền'),
      dataIndex: 'total_value_usd',
      key: 'total_usd',
      width: 110,
      align: 'right',
      render: (v: number) => v ? <strong style={{ color: '#1B4D3E', fontFamily: 'monospace', fontSize: 12 }}>{formatCurrency(v)}</strong> : gray(null),
    },
    {
      title: hdr('Đặt cọc'),
      dataIndex: 'deposit_amount',
      key: 'deposit',
      width: 85,
      align: 'right',
      render: (v: number) => v ? mono(formatCurrency(v)) : gray(null),
    },
    {
      title: hdr('CK'),
      dataIndex: 'discount_amount',
      key: 'discount',
      width: 85,
      align: 'right',
      render: (v: number) => v ? mono(formatCurrency(v)) : gray(null),
    },
    {
      title: hdr('NH CK'),
      dataIndex: 'discount_bank',
      key: 'discount_bank',
      width: 90,
      ellipsis: true,
      render: (v: string) => v ? <span style={{ fontSize: 11 }}>{v}</span> : gray(null),
    },
    {
      title: hdr('Còn lại'),
      dataIndex: 'remaining_amount',
      key: 'remaining',
      width: 90,
      align: 'right',
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
      render: (d: string) => d ? <span style={{ fontSize: 12 }}>{formatDate(d)}</span> : gray(null),
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
      render: (_: unknown, record: SalesOrder) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<EyeOutlined />}
            onClick={(e) => { e.stopPropagation(); setPanelOrderId(record.id); setPanelOpen(true) }} />
          {isAdmin && (
            <Popconfirm title={`Xóa ${(record as any).contract_no || record.code}?`} onConfirm={() => handleDelete(record)} okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
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
