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
  CloseCircleOutlined,
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
  COUNTRY_OPTIONS,
} from '../../services/sales/salesTypes'
import GradeBadge from '../../components/wms/GradeBadge'

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
  { key: 'all', label: 'T\u1EA5t c\u1EA3' },
  { key: 'draft', label: 'Nh\u00E1p' },
  { key: 'confirmed', label: '\u0110\u00E3 x\u00E1c nh\u1EADn' },
  { key: 'producing', label: '\u0110ang SX' },
  { key: 'ready', label: 'S\u1EB5n s\u00E0ng' },
  { key: 'packing', label: '\u0110\u00F3ng g\u00F3i' },
  { key: 'shipped', label: '\u0110\u00E3 xu\u1EA5t' },
  { key: 'delivered', label: '\u0110\u00E3 giao' },
  { key: 'paid', label: '\u0110\u00E3 TT' },
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
      message.error('Kh\u00F4ng th\u1EC3 t\u1EA3i danh s\u00E1ch \u0111\u01A1n h\u00E0ng')
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
      message.success(`\u0110\u00E3 x\u00E1c nh\u1EADn \u0111\u01A1n h\u00E0ng ${order.code}`)
      fetchOrders()
      fetchStats()
    } catch (error) {
      console.error('Confirm error:', error)
      message.error('Kh\u00F4ng th\u1EC3 x\u00E1c nh\u1EADn \u0111\u01A1n h\u00E0ng')
    }
  }

  const handleCancel = async (order: SalesOrder) => {
    try {
      await salesOrderService.cancelOrder(order.id, 'Hủy từ danh sách')
      message.success(`\u0110\u00E3 h\u1EE7y \u0111\u01A1n h\u00E0ng ${order.code}`)
      fetchOrders()
      fetchStats()
    } catch (error) {
      console.error('Cancel error:', error)
      message.error('Kh\u00F4ng th\u1EC3 h\u1EE7y \u0111\u01A1n h\u00E0ng')
    }
  }

  // ============================================
  // TABLE COLUMNS
  // ============================================

  const columns: ColumnsType<SalesOrder> = [
    {
      title: 'M\u00E3 \u0111\u01A1n',
      dataIndex: 'code',
      key: 'code',
      width: 130,
      render: (code: string, record: SalesOrder) => (
        <Text
          code
          style={{ fontFamily: 'monospace', fontSize: 13, cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/sales/orders/${record.id}`)
          }}
        >
          {code}
        </Text>
      ),
    },
    {
      title: 'Kh\u00E1ch h\u00E0ng',
      dataIndex: 'customer',
      key: 'customer',
      ellipsis: true,
      width: 200,
      render: (_: unknown, record: SalesOrder) => {
        const cust = record.customer
        if (!cust) return <Text type="secondary">-</Text>
        return (
          <Space size={4}>
            {cust.country && <span>{getCountryFlag(cust.country)}</span>}
            <Text strong>{cust.name}</Text>
          </Space>
        )
      },
    },
    {
      title: 'PO#',
      dataIndex: 'customer_po',
      key: 'customer_po',
      width: 120,
      render: (po?: string) =>
        po ? (
          <Text style={{ fontSize: 13 }}>{po}</Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: 'Grade',
      dataIndex: 'grade',
      key: 'grade',
      width: 110,
      render: (grade: string) => <GradeBadge grade={grade} size="small" />,
    },
    {
      title: 'S\u1ED1 l\u01B0\u1EE3ng',
      dataIndex: 'quantity_tons',
      key: 'quantity_tons',
      width: 110,
      align: 'right',
      render: (qty: number) => (
        <Text>
          {qty != null ? `${qty.toLocaleString('vi-VN')} t\u1EA5n` : '-'}
        </Text>
      ),
    },
    {
      title: 'Gi\u00E1 tr\u1ECB',
      dataIndex: 'total_value_usd',
      key: 'total_value_usd',
      width: 140,
      align: 'right',
      render: (val?: number) => (
        <Text strong style={{ color: val ? '#1B4D3E' : undefined }}>
          {val != null ? `${formatCurrency(val)} USD` : '-'}
        </Text>
      ),
    },
    {
      title: 'Giao h\u00E0ng',
      dataIndex: 'delivery_date',
      key: 'delivery_date',
      width: 120,
      render: (date?: string) => (
        <Text>{formatDate(date)}</Text>
      ),
    },
    {
      title: 'Tr\u1EA1ng th\u00E1i',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: SalesOrderStatus) => (
        <Tag color={ORDER_STATUS_COLORS[status]}>
          {ORDER_STATUS_LABELS[status]}
        </Tag>
      ),
    },
    {
      title: 'Thao t\u00E1c',
      key: 'actions',
      width: 130,
      fixed: 'right',
      render: (_: unknown, record: SalesOrder) => (
        <Space size={4}>
          <Tooltip title="Xem chi ti\u1EBFt">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/sales/orders/${record.id}`)
              }}
            />
          </Tooltip>
          {record.status === 'draft' && (
            <Popconfirm
              title="X\u00E1c nh\u1EADn \u0111\u01A1n h\u00E0ng"
              description={`X\u00E1c nh\u1EADn \u0111\u01A1n h\u00E0ng ${record.code}?`}
              onConfirm={() => handleConfirm(record)}
              okText="X\u00E1c nh\u1EADn"
              cancelText="H\u1EE7y"
            >
              <Tooltip title="X\u00E1c nh\u1EADn">
                <Button
                  type="text"
                  size="small"
                  icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                  onClick={(e) => e.stopPropagation()}
                />
              </Tooltip>
            </Popconfirm>
          )}
          {record.status !== 'cancelled' && record.status !== 'paid' && record.status !== 'delivered' && (
            <Popconfirm
              title="H\u1EE7y \u0111\u01A1n h\u00E0ng"
              description={`H\u1EE7y \u0111\u01A1n h\u00E0ng ${record.code}?`}
              onConfirm={() => handleCancel(record)}
              okText="H\u1EE7y \u0111\u01A1n"
              cancelText="\u0110\u00F3ng"
              okButtonProps={{ danger: true }}
            >
              <Tooltip title="H\u1EE7y">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<CloseCircleOutlined />}
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
            \u0110\u01A1n h\u00E0ng b\u00E1n
          </Title>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/sales/orders/create')}
            style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            T\u1EA1o \u0111\u01A1n h\u00E0ng
          </Button>
        </Col>
      </Row>

      {/* Stats Row — 6 mini cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="T\u1ED5ng \u0111\u01A1n"
              value={stats.total}
              prefix={<FileTextOutlined style={{ color: '#1B4D3E' }} />}
              valueStyle={{ color: '#1B4D3E' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="Nh\u00E1p"
              value={stats.draft}
              prefix={<EditOutlined style={{ color: '#8c8c8c' }} />}
              valueStyle={{ color: '#8c8c8c' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="\u0110\u00E3 x\u00E1c nh\u1EADn"
              value={stats.confirmed}
              prefix={<CheckCircleOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="\u0110ang SX"
              value={stats.producing}
              prefix={<InboxOutlined style={{ color: '#fa8c16' }} />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="S\u1EB5n s\u00E0ng"
              value={stats.ready}
              prefix={<CarOutlined style={{ color: '#13c2c2' }} />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={4}>
          <Card size="small" style={{ borderRadius: 8 }}>
            <Statistic
              title="\u0110\u00E3 xu\u1EA5t"
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
              placeholder="T\u00ECm m\u00E3 \u0111\u01A1n, m\u00E3 KH, PO#..."
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
              placeholder="Kh\u00E1ch h\u00E0ng"
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
              placeholder={['Ng\u00E0y \u0111\u1EB7t t\u1EEB', '\u0110\u1EBFn ng\u00E0y']}
              format="DD/MM/YYYY"
              style={{ width: '100%' }}
              allowClear
            />
          </Col>
        </Row>
      </Card>

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
            showTotal: (t) => `T\u1ED5ng ${t} \u0111\u01A1n h\u00E0ng`,
            pageSizeOptions: ['10', '20', '50'],
          }}
          onChange={handleTableChange}
          scroll={{ x: 1200 }}
          onRow={(record) => ({
            onClick: () => navigate(`/sales/orders/${record.id}`),
            style: { cursor: 'pointer' },
          })}
          size="middle"
        />
      </Card>
    </div>
  )
}

export default SalesOrderListPage
