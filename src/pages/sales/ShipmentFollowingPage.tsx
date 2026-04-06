// ============================================================================
// SHIPMENT FOLLOWING PAGE — Theo dõi lô hàng xuất
// File: src/pages/sales/ShipmentFollowingPage.tsx
// Module Bán hàng quốc tế — Huy Anh Rubber ERP
// Thay thế file Excel "SHIPMENT FOLLOWING"
// Primary color: #1B4D3E
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
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
  Statistic,
  DatePicker,
  message,
  Tooltip,
  InputNumber,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  SearchOutlined,
  DownloadOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ContainerOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'

import { supabase } from '../../lib/supabase'
import { salesCustomerService } from '../../services/sales/salesCustomerService'
import {
  type SalesOrder,
  type SalesOrderStatus,
  type SalesCustomer,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  SVR_GRADE_OPTIONS,
  PAYMENT_TERMS_LABELS,
} from '../../services/sales/salesTypes'
import { useAuthStore } from '../../stores/authStore'
import {
  getSalesRole,
  salesPermissions,
  type SalesRole,
} from '../../services/sales/salesPermissionService'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

// ============================================================================
// EXTENDED SALES ORDER — Các trường shipment mở rộng trên sales_orders
// ============================================================================

interface ShipmentOrder extends SalesOrder {
  // Shipment-specific fields (extended on sales_orders table)
  contract_no?: string
  lot_number?: number
  bl_number?: string
  bl_type?: string
  dhl_number?: string
  doc_submission_date?: string
  discount_date?: string
  discount_amount?: number
  discount_bank?: string
  bank_name?: string
  bank_charges?: number
  actual_payment_amount?: number
  payment_date?: string
  // Logistics
  voyage_number?: string
  port_of_loading?: string
  port_of_destination?: string
  cutoff_date?: string
  freight_terms?: string
  // Customs
  customs_declaration_no?: string
  customs_declaration_date?: string
  customs_clearance_status?: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SHIPMENT_STATUSES: SalesOrderStatus[] = [
  'packing',
  'ready',
  'shipped',
  'delivered',
  'invoiced',
  'paid',
]

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'packing', label: 'Đóng gói' },
  { value: 'ready', label: 'Sẵn sàng' },
  { value: 'shipped', label: 'Đã xuất' },
  { value: 'delivered', label: 'Đã giao' },
  { value: 'invoiced', label: 'Đã lập HĐ' },
  { value: 'paid', label: 'Đã thanh toán' },
]

const CUSTOMER_JOIN = 'customer:sales_customers!customer_id(id,code,name,short_name,country,tier)'

// ============================================================================
// HELPER — Format tiền USD
// ============================================================================

const formatUSD = (value?: number | null): string => {
  if (value == null) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

const formatDate = (value?: string | null): string => {
  if (!value) return '-'
  return dayjs(value).format('DD/MM/YYYY')
}

// ============================================================================
// COMPONENT
// ============================================================================

const ShipmentFollowingPage = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const salesRole = useMemo(() => getSalesRole(user), [user])

  // ========== State ==========
  const [loading, setLoading] = useState(false)
  const [orders, setOrders] = useState<ShipmentOrder[]>([])
  const [customers, setCustomers] = useState<SalesCustomer[]>([])
  const [editingKey, setEditingKey] = useState<string>('')
  const [editingField, setEditingField] = useState<string>('')
  const [editValue, setEditValue] = useState<any>(null)

  // Filters
  const [etdRange, setEtdRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [filterCustomer, setFilterCustomer] = useState<string | undefined>(undefined)
  const [filterGrade, setFilterGrade] = useState<string | undefined>(undefined)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchText, setSearchText] = useState('')

  // ========== Load Data ==========
  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('sales_orders')
        .select(`*,${CUSTOMER_JOIN}`)
        .in('status', SHIPMENT_STATUSES)
        .order('etd', { ascending: false })

      // Apply filters
      if (filterStatus && filterStatus !== 'all') {
        query = query.eq('status', filterStatus)
      }
      if (filterCustomer) {
        query = query.eq('customer_id', filterCustomer)
      }
      if (filterGrade) {
        query = query.eq('grade', filterGrade)
      }
      if (etdRange && etdRange[0] && etdRange[1]) {
        query = query.gte('etd', etdRange[0].format('YYYY-MM-DD'))
        query = query.lte('etd', etdRange[1].format('YYYY-MM-DD'))
      }
      if (searchText.trim()) {
        query = query.or(
          `code.ilike.%${searchText}%,customer_po.ilike.%${searchText}%,booking_reference.ilike.%${searchText}%,bl_number.ilike.%${searchText}%,contract_no.ilike.%${searchText}%`
        )
      }

      const { data, error } = await query

      if (error) throw error
      setOrders((data || []) as ShipmentOrder[])
    } catch (err: any) {
      message.error(`Lỗi tải dữ liệu: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterCustomer, filterGrade, etdRange, searchText])

  const loadCustomers = useCallback(async () => {
    try {
      const list = await salesCustomerService.getAllActive()
      setCustomers(list)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadOrders()
    loadCustomers()
  }, [loadOrders, loadCustomers])

  // ========== Stats ==========
  const stats = useMemo(() => {
    const totalShipments = orders.length
    const totalValue = orders.reduce((s, o) => s + (o.total_value_usd || 0), 0)
    const paidCount = orders.filter((o) => o.payment_date).length
    const unpaidCount = totalShipments - paidCount
    return { totalShipments, totalValue, paidCount, unpaidCount }
  }, [orders])

  // ========== Summary ==========
  const summary = useMemo(() => {
    const totalQty = orders.reduce((s, o) => s + (o.quantity_tons || 0), 0)
    const totalAmount = orders.reduce((s, o) => s + (o.total_value_usd || 0), 0)
    const totalDiscount = orders.reduce((s, o) => s + (o.discount_amount || 0), 0)
    return { totalQty, totalAmount, totalDiscount }
  }, [orders])

  // ========== Inline Edit ==========
  const canEditField = (field: string): boolean => {
    const logisticsFields = ['booking_reference', 'bl_number', 'etd', 'dhl_number', 'doc_submission_date']
    const accountingFields = ['discount_amount', 'discount_date', 'bank_name', 'payment_date']

    if (salesRole === 'admin') return true
    if (!salesRole) return false
    if (logisticsFields.includes(field) && salesPermissions.canEditShipmentLogistics(salesRole)) return true
    if (accountingFields.includes(field) && salesPermissions.canEditShipmentFinance(salesRole)) return true
    return false
  }

  const startEdit = (recordId: string, field: string, currentValue: any) => {
    if (!canEditField(field)) {
      message.warning('Bạn không có quyền chỉnh sửa trường này')
      return
    }
    setEditingKey(recordId)
    setEditingField(field)
    setEditValue(currentValue ?? null)
  }

  const cancelEdit = () => {
    setEditingKey('')
    setEditingField('')
    setEditValue(null)
  }

  const saveEdit = async (recordId: string, field: string) => {
    try {
      const updateData: Record<string, any> = {
        [field]: editValue || null,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('sales_orders')
        .update(updateData)
        .eq('id', recordId)

      if (error) throw error

      message.success('Cập nhật thành công')
      cancelEdit()
      loadOrders()
    } catch (err: any) {
      message.error(`Lỗi cập nhật: ${err.message}`)
    }
  }

  // Render editable cell
  const renderEditableCell = (
    record: ShipmentOrder,
    field: string,
    value: any,
    type: 'text' | 'date' | 'number' = 'text',
  ) => {
    const isEditing = editingKey === record.id && editingField === field
    const editable = canEditField(field)

    if (isEditing) {
      if (type === 'date') {
        return (
          <DatePicker
            size="small"
            value={editValue ? dayjs(editValue) : null}
            onChange={(d) => setEditValue(d ? d.format('YYYY-MM-DD') : null)}
            onBlur={() => saveEdit(record.id, field)}
            autoFocus
            style={{ width: 120 }}
          />
        )
      }
      if (type === 'number') {
        return (
          <InputNumber
            size="small"
            value={editValue}
            onChange={(v) => setEditValue(v)}
            onPressEnter={() => saveEdit(record.id, field)}
            onBlur={() => saveEdit(record.id, field)}
            autoFocus
            style={{ width: 100 }}
          />
        )
      }
      return (
        <Input
          size="small"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onPressEnter={() => saveEdit(record.id, field)}
          onBlur={() => saveEdit(record.id, field)}
          autoFocus
          style={{ width: 120 }}
        />
      )
    }

    const displayValue = type === 'date' ? formatDate(value) : type === 'number' ? formatUSD(value) : (value || '-')

    if (!editable) {
      return <span>{displayValue}</span>
    }

    return (
      <Tooltip title="Nhấp để chỉnh sửa">
        <span
          style={{ cursor: 'pointer', borderBottom: '1px dashed #1B4D3E', paddingBottom: 1 }}
          onClick={(e) => {
            e.stopPropagation()
            startEdit(record.id, field, value)
          }}
        >
          {displayValue}
        </span>
      </Tooltip>
    )
  }

  // ========== Row class by condition ==========
  const getRowClassName = (record: ShipmentOrder): string => {
    // Green: fully paid
    if (record.status === 'paid' || record.payment_date) {
      return 'shipment-row-paid'
    }

    // Red: payment overdue > 30 days (etd + 30 < today, not paid)
    if (record.etd && !record.payment_date) {
      const etdDate = dayjs(record.etd)
      const overdueDays = dayjs().diff(etdDate, 'day')
      if (overdueDays > 30) {
        return 'shipment-row-overdue'
      }
    }

    // Yellow: ETD < 7 days and not shipped
    if (record.etd && !['shipped', 'delivered', 'invoiced', 'paid'].includes(record.status)) {
      const daysToETD = dayjs(record.etd).diff(dayjs(), 'day')
      if (daysToETD >= 0 && daysToETD < 7) {
        return 'shipment-row-upcoming'
      }
    }

    return ''
  }

  // ========== Columns ==========
  const columns: ColumnsType<ShipmentOrder> = [
    {
      title: 'NO',
      key: 'no',
      width: 50,
      fixed: 'left',
      render: (_v, _r, idx) => idx + 1,
    },
    {
      title: 'Buyer',
      dataIndex: ['customer', 'short_name'],
      key: 'buyer',
      width: 110,
      fixed: 'left',
      render: (_v, record) => record.customer?.short_name || record.customer?.name || '-',
    },
    {
      title: 'Contract No',
      dataIndex: 'contract_no',
      key: 'contract_no',
      width: 120,
      render: (_v, record) => renderEditableCell(record, 'contract_no', record.contract_no),
    },
    {
      title: 'Lot',
      dataIndex: 'lot_number',
      key: 'lot_number',
      width: 80,
      render: (_v, record) => renderEditableCell(record, 'lot_number', record.lot_number),
    },
    {
      title: 'PO / L/C',
      key: 'po_lc',
      width: 130,
      render: (_v, record) => {
        const parts = [record.customer_po, record.lc_number].filter(Boolean)
        return parts.length > 0 ? parts.join(' / ') : '-'
      },
    },
    {
      title: 'Booking No',
      dataIndex: 'booking_reference',
      key: 'booking_reference',
      width: 120,
      render: (_v, record) =>
        renderEditableCell(record, 'booking_reference', record.booking_reference),
    },
    {
      title: 'B/L No',
      dataIndex: 'bl_number',
      key: 'bl_number',
      width: 120,
      render: (_v, record) => renderEditableCell(record, 'bl_number', record.bl_number),
    },
    {
      title: 'Commodity',
      dataIndex: 'grade',
      key: 'grade',
      width: 100,
      render: (grade: string) => (
        <Tag color="#1B4D3E">{grade?.replace('_', ' ') || '-'}</Tag>
      ),
    },
    {
      title: 'QTY (MT)',
      dataIndex: 'quantity_tons',
      key: 'quantity_tons',
      width: 90,
      align: 'right',
      render: (v: number) => v?.toFixed(1) || '-',
    },
    {
      title: 'VOL',
      dataIndex: 'container_count',
      key: 'container_count',
      width: 60,
      align: 'center',
      render: (v: number) => v || '-',
    },
    {
      title: 'POL',
      dataIndex: 'port_of_loading',
      key: 'port_of_loading',
      width: 110,
      ellipsis: true,
    },
    {
      title: 'POD',
      dataIndex: 'port_of_destination',
      key: 'port_of_destination',
      width: 110,
      ellipsis: true,
    },
    {
      title: 'Incoterms',
      dataIndex: 'incoterm',
      key: 'incoterm',
      width: 80,
      align: 'center',
    },
    {
      title: 'Payment Term',
      dataIndex: 'payment_terms',
      key: 'payment_terms',
      width: 130,
      ellipsis: true,
      render: (v: string) => {
        if (!v) return '-'
        return (PAYMENT_TERMS_LABELS as Record<string, string>)[v] || v
      },
    },
    {
      title: 'Unit Price',
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 100,
      align: 'right',
      render: (v: number) => formatUSD(v),
    },
    {
      title: 'Amount',
      dataIndex: 'total_value_usd',
      key: 'total_value_usd',
      width: 110,
      align: 'right',
      render: (v: number) => (
        <Text strong style={{ color: '#1B4D3E' }}>
          {formatUSD(v)}
        </Text>
      ),
    },
    {
      title: 'Discount',
      dataIndex: 'discount_amount',
      key: 'discount_amount',
      width: 100,
      align: 'right',
      render: (_v, record) =>
        renderEditableCell(record, 'discount_amount', record.discount_amount, 'number'),
    },
    {
      title: 'Bank',
      dataIndex: 'bank_name',
      key: 'bank_name',
      width: 100,
      render: (_v, record) => renderEditableCell(record, 'bank_name', record.bank_name),
    },
    {
      title: 'Ngày trình BTC',
      dataIndex: 'doc_submission_date',
      key: 'doc_submission_date',
      width: 120,
      render: (_v, record) =>
        renderEditableCell(record, 'doc_submission_date', record.doc_submission_date, 'date'),
    },
    {
      title: 'Ngày CK',
      dataIndex: 'discount_date',
      key: 'discount_date',
      width: 110,
      render: (_v, record) =>
        renderEditableCell(record, 'discount_date', record.discount_date, 'date'),
    },
    {
      title: 'ETD',
      dataIndex: 'etd',
      key: 'etd',
      width: 110,
      render: (_v, record) => renderEditableCell(record, 'etd', record.etd, 'date'),
    },
    {
      title: 'Vessel / Voyage',
      key: 'vessel',
      width: 140,
      render: (_v, record) => {
        const parts = [record.vessel_name, record.voyage_number].filter(Boolean)
        return parts.length > 0 ? parts.join(' / ') : renderEditableCell(record, 'vessel_name', record.vessel_name)
      },
    },
    {
      title: 'ETA',
      dataIndex: 'eta',
      key: 'eta',
      width: 110,
      render: (_v, record) => renderEditableCell(record, 'eta', record.eta, 'date'),
    },
    {
      title: 'B/L Type',
      dataIndex: 'bl_type',
      key: 'bl_type',
      width: 100,
      render: (_v, record) => renderEditableCell(record, 'bl_type', record.bl_type),
    },
    {
      title: 'Cutoff',
      dataIndex: 'cutoff_date',
      key: 'cutoff_date',
      width: 110,
      render: (_v, record) => renderEditableCell(record, 'cutoff_date', record.cutoff_date, 'date'),
    },
    {
      title: 'Tờ khai HQ',
      dataIndex: 'customs_declaration_no',
      key: 'customs_declaration_no',
      width: 120,
      render: (_v, record) => renderEditableCell(record, 'customs_declaration_no', record.customs_declaration_no),
    },
    {
      title: 'Thông quan',
      dataIndex: 'customs_clearance_status',
      key: 'customs_clearance_status',
      width: 100,
      render: (v: string) => {
        const colors: Record<string, string> = { cleared: 'green', pending: 'orange', rejected: 'red' }
        const labels: Record<string, string> = { cleared: 'Đã TQ', pending: 'Chờ TQ', rejected: 'Từ chối' }
        return <Tag color={colors[v] || 'default'}>{labels[v] || v || 'Chờ TQ'}</Tag>
      },
    },
    {
      title: 'DHL No',
      dataIndex: 'dhl_number',
      key: 'dhl_number',
      width: 110,
      render: (_v, record) => renderEditableCell(record, 'dhl_number', record.dhl_number),
    },
    {
      title: 'NH chiết khấu',
      dataIndex: 'discount_bank',
      key: 'discount_bank',
      width: 110,
      render: (_v, record) => renderEditableCell(record, 'discount_bank', record.discount_bank),
    },
    {
      title: 'Phí NH',
      dataIndex: 'bank_charges',
      key: 'bank_charges',
      width: 90,
      align: 'right',
      render: (_v, record) => renderEditableCell(record, 'bank_charges', record.bank_charges, 'number'),
    },
    {
      title: 'Thực nhận',
      dataIndex: 'actual_payment_amount',
      key: 'actual_payment_amount',
      width: 110,
      align: 'right',
      render: (_v, record) => renderEditableCell(record, 'actual_payment_amount', record.actual_payment_amount, 'number'),
    },
    {
      title: 'Payment Date',
      dataIndex: 'payment_date',
      key: 'payment_date',
      width: 120,
      render: (_v, record) =>
        renderEditableCell(record, 'payment_date', record.payment_date, 'date'),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      fixed: 'right',
      render: (status: SalesOrderStatus) => (
        <Tag color={ORDER_STATUS_COLORS[status] || 'default'}>
          {ORDER_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
  ]

  // ========== Export CSV ==========
  const exportToCSV = () => {
    const headers = [
      'NO', 'Buyer', 'Contract No', 'Lot', 'PO', 'L/C', 'Booking No', 'B/L No',
      'Commodity', 'QTY (MT)', 'VOL', 'POL', 'POD', 'Incoterms', 'Payment Term',
      'Unit Price (USD)', 'Amount (USD)', 'Discount (USD)', 'Bank',
      'Ngày trình BTC', 'Ngày CK', 'ETD', 'DHL No', 'Payment Date', 'Status',
    ]

    const rows = orders.map((o, idx) => [
      idx + 1,
      o.customer?.short_name || o.customer?.name || '',
      o.contract_no || '',
      o.lot_number || '',
      o.customer_po || '',
      o.lc_number || '',
      o.booking_reference || '',
      o.bl_number || '',
      o.grade?.replace('_', ' ') || '',
      o.quantity_tons?.toFixed(1) || '',
      o.container_count || '',
      o.port_of_loading || '',
      o.port_of_destination || '',
      o.incoterm || '',
      o.payment_terms ? ((PAYMENT_TERMS_LABELS as Record<string, string>)[o.payment_terms] || o.payment_terms) : '',
      o.unit_price || '',
      o.total_value_usd || '',
      o.discount_amount || '',
      o.bank_name || '',
      o.doc_submission_date ? dayjs(o.doc_submission_date).format('DD/MM/YYYY') : '',
      o.discount_date ? dayjs(o.discount_date).format('DD/MM/YYYY') : '',
      o.etd ? dayjs(o.etd).format('DD/MM/YYYY') : '',
      o.dhl_number || '',
      o.payment_date ? dayjs(o.payment_date).format('DD/MM/YYYY') : '',
      ORDER_STATUS_LABELS[o.status] || o.status,
    ])

    // UTF-8 BOM for Vietnamese support
    const BOM = '\uFEFF'
    const csvContent = BOM + [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => {
          const str = String(cell)
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`
          }
          return str
        }).join(',')
      ),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `Shipment_Following_${dayjs().format('YYYYMMDD')}.csv`
    link.click()
    URL.revokeObjectURL(url)
    message.success('Xuất file CSV thành công')
  }

  // ========== Render ==========
  return (
    <div style={{ padding: '24px', background: '#f5f5f0' }}>
      {/* Custom row styles */}
      <style>{`
        .shipment-row-paid td { background: #f0fff4 !important; }
        .shipment-row-overdue td { background: #fff1f0 !important; }
        .shipment-row-upcoming td { background: #fffbe6 !important; }
        .shipment-table .ant-table-thead > tr > th {
          background: #1B4D3E !important;
          color: #fff !important;
          font-size: 12px;
          padding: 8px 12px;
        }
        .shipment-table .ant-table-tbody > tr > td {
          padding: 6px 12px;
          font-size: 13px;
        }
        .shipment-table .ant-table-tbody > tr:hover > td {
          cursor: pointer;
        }
        .shipment-table .ant-table-summary > tr > td {
          background: #f0f7f4 !important;
          font-weight: 600;
        }
      `}</style>

      {/* ===== HEADER ===== */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 20 }}>
        <Col>
          <Title level={3} style={{ margin: 0, color: '#1B4D3E' }}>
            Theo dõi lô hàng xuất
          </Title>
          <Text type="secondary">
            Shipment Following — Thay thế file Excel theo dõi xuất hàng
          </Text>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={exportToCSV}
            style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
          >
            Xuất Excel
          </Button>
        </Col>
      </Row>

      {/* ===== STATS CARDS ===== */}
      <Row gutter={16} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" bordered={false} style={{ borderTop: '3px solid #1B4D3E' }}>
            <Statistic
              title="Tổng lô hàng"
              value={stats.totalShipments}
              prefix={<ContainerOutlined style={{ color: '#1B4D3E' }} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" bordered={false} style={{ borderTop: '3px solid #2D8B6E' }}>
            <Statistic
              title="Tổng giá trị (USD)"
              value={stats.totalValue}
              precision={0}
              prefix={<DollarOutlined style={{ color: '#2D8B6E' }} />}
              formatter={(v) => formatUSD(Number(v))}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" bordered={false} style={{ borderTop: '3px solid #52c41a' }}>
            <Statistic
              title="Đã thanh toán"
              value={stats.paidCount}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              suffix={`/ ${stats.totalShipments}`}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" bordered={false} style={{ borderTop: '3px solid #faad14' }}>
            <Statistic
              title="Chờ thanh toán"
              value={stats.unpaidCount}
              prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* ===== FILTER BAR ===== */}
      <Card size="small" bordered={false} style={{ marginBottom: 16 }}>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={12} md={5}>
            <RangePicker
              placeholder={['ETD từ', 'ETD đến']}
              onChange={(dates) => setEtdRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
              style={{ width: '100%' }}
              allowClear
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select
              placeholder="Khách hàng"
              value={filterCustomer}
              onChange={setFilterCustomer}
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: '100%' }}
              options={customers.map((c) => ({
                value: c.id,
                label: c.short_name || c.name,
              }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select
              placeholder="Grade"
              value={filterGrade}
              onChange={setFilterGrade}
              allowClear
              style={{ width: '100%' }}
              options={SVR_GRADE_OPTIONS.map((g) => ({
                value: g.value,
                label: g.label,
              }))}
            />
          </Col>
          <Col xs={12} sm={6} md={3}>
            <Select
              placeholder="Trạng thái"
              value={filterStatus}
              onChange={setFilterStatus}
              style={{ width: '100%' }}
              options={STATUS_FILTER_OPTIONS}
            />
          </Col>
          <Col xs={24} sm={12} md={5}>
            <Input.Search
              placeholder="Tìm mã đơn, booking, B/L..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onSearch={() => loadOrders()}
              allowClear
              enterButton={<SearchOutlined />}
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Space>
              <Button onClick={loadOrders} type="default">
                Làm mới
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* ===== TABLE ===== */}
      <Card size="small" bordered={false} bodyStyle={{ padding: 0 }}>
        <Table<ShipmentOrder>
          className="shipment-table"
          columns={columns}
          dataSource={orders}
          rowKey="id"
          loading={loading}
          size="small"
          scroll={{ x: 2800 }}
          pagination={{
            pageSize: 50,
            showTotal: (total) => `Tổng ${total} lô hàng`,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100'],
          }}
          rowClassName={getRowClassName}
          onRow={(record) => ({
            onClick: () => {
              // Only navigate if not editing
              if (editingKey !== record.id) {
                navigate(`/sales/orders/${record.id}`)
              }
            },
          })}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={8} align="right">
                  <Text strong style={{ color: '#1B4D3E' }}>TỔNG CỘNG:</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">
                  <Text strong>{summary.totalQty.toFixed(1)} MT</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={9} colSpan={6} />
                <Table.Summary.Cell index={15} align="right">
                  <Text strong style={{ color: '#1B4D3E' }}>{formatUSD(summary.totalAmount)}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={16} align="right">
                  <Text strong style={{ color: '#cf1322' }}>{formatUSD(summary.totalDiscount)}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={17} colSpan={7} />
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>

      {/* ===== LEGEND ===== */}
      <Row style={{ marginTop: 12 }} gutter={16}>
        <Col>
          <Space size="large">
            <Space>
              <div style={{ width: 16, height: 16, background: '#f0fff4', border: '1px solid #b7eb8f', borderRadius: 2 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>Đã thanh toán</Text>
            </Space>
            <Space>
              <div style={{ width: 16, height: 16, background: '#fff1f0', border: '1px solid #ffa39e', borderRadius: 2 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>Quá hạn &gt; 30 ngày</Text>
            </Space>
            <Space>
              <div style={{ width: 16, height: 16, background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 2 }} />
              <Text type="secondary" style={{ fontSize: 12 }}>ETD &lt; 7 ngày</Text>
            </Space>
          </Space>
        </Col>
      </Row>
    </div>
  )
}

export default ShipmentFollowingPage
