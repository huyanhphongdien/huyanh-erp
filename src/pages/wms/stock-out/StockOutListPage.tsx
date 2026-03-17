// ============================================================================
// STOCK OUT LIST PAGE — Ant Design
// File: src/pages/wms/stock-out/StockOutListPage.tsx
// Rewrite: Tailwind -> Ant Design v6, add rubber fields
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Input,
  Select,
  Typography,
  Spin,
  Row,
  Col,
  Statistic,
  Empty,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined,
  SearchOutlined,
  ArrowLeftOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'
import GradeBadge from '../../../components/wms/GradeBadge'
import type { RubberGrade } from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// TYPES
// ============================================================================

interface WarehouseRef {
  id: string
  code: string
  name: string
}

interface StockOutOrder {
  id: string
  code: string
  type: string
  warehouse_id: string
  warehouse?: WarehouseRef
  reason: string
  customer_name?: string | null
  customer_order_ref?: string | null
  total_quantity?: number | null
  total_weight?: number | null
  status: 'draft' | 'picking' | 'picked' | 'confirmed' | 'cancelled'
  notes?: string | null
  created_by?: string | null
  confirmed_by?: string | null
  confirmed_at?: string | null
  created_at: string
  updated_at: string
  svr_grade?: RubberGrade | null
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: 'Nháp' },
  picking: { color: 'processing', label: 'Đang lấy' },
  picked: { color: 'warning', label: 'Đã lấy' },
  confirmed: { color: 'success', label: 'Đã xuất' },
  cancelled: { color: 'error', label: 'Đã hủy' },
}

const REASON_LABELS: Record<string, string> = {
  sale: 'Bán hàng',
  production: 'Sản xuất',
  transfer: 'Chuyển kho',
  blend: 'Phối trộn',
  adjust: 'Điều chỉnh',
  return: 'Trả hàng',
}

const REASON_COLORS: Record<string, string> = {
  sale: 'green',
  production: 'blue',
  transfer: 'purple',
  blend: 'cyan',
  adjust: 'default',
  return: 'orange',
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tat ca trang thai' },
  { value: 'draft', label: 'Nháp' },
  { value: 'picking', label: 'Đang lấy' },
  { value: 'picked', label: 'Đã lấy' },
  { value: 'confirmed', label: 'Đã xuất' },
  { value: 'cancelled', label: 'Đã hủy' },
]

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatNumber(num?: number | null): string {
  if (num === undefined || num === null) return '—'
  return num.toLocaleString('vi-VN')
}

function formatWeight(kg?: number | null): string {
  if (!kg) return '—'
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} tan`
  return `${formatNumber(kg)} kg`
}

const monoStyle: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }

// ============================================================================
// COMPONENT
// ============================================================================

const StockOutListPage: React.FC = () => {
  const navigate = useNavigate()

  // State
  const [orders, setOrders] = useState<StockOutOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('')

  // Load data from Supabase
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('stock_out_orders')
        .select(`
          id, code, type, warehouse_id,
          reason, customer_name, customer_order_ref,
          total_quantity, total_weight, status, notes,
          created_by, confirmed_by, confirmed_at,
          created_at, updated_at, svr_grade,
          warehouse:warehouses(id, code, name)
        `)
        .order('created_at', { ascending: false })
        .limit(100)

      if (!error && data) {
        setOrders(data as unknown as StockOutOrder[])
      } else if (error) {
        console.error('Loi tai danh sach phiếu xuất:', error)
      }
      setLoading(false)
    }
    load()
  }, [])

  // Filter + search logic
  const filteredOrders = useCallback(() => {
    let result = [...orders]

    // Status filter
    if (activeFilter) {
      result = result.filter(o => o.status === activeFilter)
    }

    // Search
    if (searchText.trim()) {
      const term = searchText.trim().toLowerCase()
      result = result.filter(o =>
        o.code.toLowerCase().includes(term) ||
        o.customer_name?.toLowerCase().includes(term) ||
        o.customer_order_ref?.toLowerCase().includes(term) ||
        o.warehouse?.name?.toLowerCase().includes(term) ||
        o.notes?.toLowerCase().includes(term)
      )
    }

    return result
  }, [orders, activeFilter, searchText])

  const displayOrders = filteredOrders()

  // Summary stats
  const totalCount = orders.length
  const draftCount = orders.filter(o => o.status === 'draft').length
  const pickingCount = orders.filter(o => o.status === 'picking' || o.status === 'picked').length
  const confirmedCount = orders.filter(o => o.status === 'confirmed').length
  const confirmedQty = orders
    .filter(o => o.status === 'confirmed')
    .reduce((sum, o) => sum + (o.total_quantity || 0), 0)
  const confirmedWeight = orders
    .filter(o => o.status === 'confirmed')
    .reduce((sum, o) => sum + (o.total_weight || 0), 0)

  // Handlers
  const handleTapRow = (record: StockOutOrder) => {
    navigate(`/wms/stock-out/${record.id}`)
  }

  const handleCreateNew = () => {
    navigate('/wms/stock-out/new')
  }

  const handleGoBack = () => {
    navigate('/wms')
  }

  // ============================================================================
  // TABLE COLUMNS
  // ============================================================================
  const columns: ColumnsType<StockOutOrder> = [
    {
      title: 'Mã phiếu',
      dataIndex: 'code',
      key: 'code',
      width: 180,
      render: (code: string) => (
        <Text strong style={{ ...monoStyle, color: '#1B4D3E' }}>{code}</Text>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => {
        const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft
        return <Tag color={cfg.color}>{cfg.label}</Tag>
      },
    },
    {
      title: 'Kho',
      key: 'warehouse',
      width: 150,
      render: (_: any, record: StockOutOrder) => (
        <Text>{record.warehouse?.name || record.warehouse?.code || '—'}</Text>
      ),
    },
    {
      title: 'Lý do',
      dataIndex: 'reason',
      key: 'reason',
      width: 110,
      render: (reason: string) => (
        <Tag color={REASON_COLORS[reason] || 'default'}>
          {REASON_LABELS[reason] || reason}
        </Tag>
      ),
    },
    {
      title: 'Grade',
      dataIndex: 'svr_grade',
      key: 'svr_grade',
      width: 100,
      render: (grade: RubberGrade | null) => <GradeBadge grade={grade} size="small" />,
    },
    {
      title: 'Khách hàng',
      key: 'customer',
      width: 160,
      render: (_: any, record: StockOutOrder) => (
        record.customer_name ? (
          <div>
            <Text>{record.customer_name}</Text>
            {record.customer_order_ref && (
              <div><Text type="secondary" style={{ ...monoStyle, fontSize: 12 }}>{record.customer_order_ref}</Text></div>
            )}
          </div>
        ) : <Text type="secondary">—</Text>
      ),
    },
    {
      title: 'Số lượng',
      dataIndex: 'total_quantity',
      key: 'total_quantity',
      width: 100,
      align: 'right',
      render: (qty: number | null) => (
        <Text strong style={monoStyle}>{formatNumber(qty)}</Text>
      ),
    },
    {
      title: 'Trọng lượng',
      dataIndex: 'total_weight',
      key: 'total_weight',
      width: 110,
      align: 'right',
      render: (weight: number | null) => (
        <Text style={monoStyle}>{formatWeight(weight)}</Text>
      ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (dt: string) => <Text type="secondary">{formatDate(dt)}</Text>,
    },
    {
      title: 'Ghi chú',
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
      render: (notes: string | null) => notes ? <Text type="secondary">{notes}</Text> : '—',
    },
  ]

  // ============================================================================
  // RENDER
  // ============================================================================
  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={handleGoBack} />
          <div>
            <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
              <ExportOutlined style={{ marginRight: 8 }} />
              Phiếu xuất kho
            </Title>
            <Text type="secondary">Thành phẩm</Text>
          </div>
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={handleCreateNew}
          style={{ backgroundColor: '#E8A838', borderColor: '#E8A838' }}
        >
          Tạo phiếu xuat
        </Button>
      </div>

      {/* Summary Stats */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="Tổng phiếu"
              value={totalCount}
              valueStyle={monoStyle}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="Nhap"
              value={draftCount}
              valueStyle={{ ...monoStyle, color: '#8c8c8c' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="Đang xử lý"
              value={pickingCount}
              valueStyle={{ ...monoStyle, color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="Đã xuất"
              value={confirmedCount}
              valueStyle={{ ...monoStyle, color: '#1B4D3E' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="SL da xuat"
              value={confirmedQty}
              suffix="banh"
              valueStyle={{ ...monoStyle, color: '#1B4D3E' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="KL đã xuất"
              value={confirmedWeight}
              suffix="kg"
              valueStyle={{ ...monoStyle, color: '#2D8B6E' }}
              formatter={(val) => formatNumber(val as number)}
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="Tìm mã phieu, khach hang, kho..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            style={{ width: 300 }}
          />
          <Select
            value={activeFilter}
            onChange={val => setActiveFilter(val)}
            options={STATUS_OPTIONS}
            style={{ width: 180 }}
          />
        </Space>
      </Card>

      {/* Table */}
      <Card styles={{ body: { padding: 0 } }}>
        <Table<StockOutOrder>
          columns={columns}
          dataSource={displayOrders}
          rowKey="id"
          loading={loading}
          pagination={{
            total: displayOrders.length,
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `${total} phieu`,
          }}
          onRow={(record) => ({
            onClick: () => handleTapRow(record),
            style: { cursor: 'pointer' },
          })}
          scroll={{ x: 1200 }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  activeFilter || searchText.trim()
                    ? 'Không tìm thấy phieu'
                    : 'Chưa có phiếu xuất kho'
                }
              >
                {!activeFilter && !searchText.trim() && (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleCreateNew}
                    style={{ backgroundColor: '#1B4D3E', borderColor: '#1B4D3E' }}
                  >
                    Tạo phiếu xuat
                  </Button>
                )}
              </Empty>
            ),
          }}
        />
      </Card>
    </div>
  )
}

export default StockOutListPage
