// ============================================================================
// STOCK IN LIST PAGE — Ant Design
// File: src/pages/wms/stock-in/StockInListPage.tsx
// Rewrite: Tailwind -> Ant Design v6, them rubber grade column
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
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
  Alert,
  Row,
  Col,
  Statistic,
} from 'antd'
import {
  PlusOutlined,
  ReloadOutlined,
  InboxOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import stockInService from '../../../services/wms/stockInService'
import type { StockInOrder } from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// CONSTANTS
// ============================================================================

const SOURCE_LABELS: Record<string, string> = {
  production: 'Sản xuất',
  purchase: 'Mua hàng',
  blend: 'Phối trộn',
  transfer: 'Chuyển kho',
  adjust: 'Điều chỉnh',
}

const SOURCE_COLORS: Record<string, string> = {
  production: 'blue',
  purchase: 'purple',
  blend: 'cyan',
  transfer: 'geekblue',
  adjust: 'default',
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: 'Nháp' },
  confirmed: { color: 'success', label: 'Đã nhập' },
  cancelled: { color: 'error', label: 'Đã hủy' },
}

// ============================================================================
// COMPONENT
// ============================================================================

const StockInListPage = () => {
  const navigate = useNavigate()

  const [orders, setOrders] = useState<StockInOrder[]>([])
  const [totalOrders, setTotalOrders] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Load data
  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await stockInService.getAll({
        page,
        pageSize,
        status: filterStatus,
        search: searchText.trim() || undefined,
      })
      setOrders(result.data)
      setTotalOrders(result.total)
    } catch (err: any) {
      console.error('Load stock-in list error:', err)
      setError(err.message || 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [filterStatus, searchText, page, pageSize])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Summary stats
  const drafts = orders.filter(o => o.status === 'draft').length
  const confirmed = orders.filter(o => o.status === 'confirmed').length
  const totalWeight = orders
    .filter(o => o.status === 'confirmed')
    .reduce((sum, o) => sum + (o.total_weight || 0), 0)

  // Table columns
  const columns = [
    {
      title: 'Mã phiếu',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => (
        <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
          {code}
        </Text>
      ),
    },
    {
      title: 'Kho',
      key: 'warehouse',
      render: (_: any, r: StockInOrder) => r.warehouse?.name || '—',
    },
    {
      title: 'Nguồn',
      dataIndex: 'source_type',
      key: 'source_type',
      render: (v: string) => (
        <Tag color={SOURCE_COLORS[v] || 'default'} style={{ margin: 0 }}>
          {SOURCE_LABELS[v] || v}
        </Tag>
      ),
    },
    {
      title: 'Deal',
      key: 'deal',
      render: (_: any, r: StockInOrder) => {
        const deal = r.deal as any
        return deal ? (
          <Tag
            color="blue"
            style={{ cursor: 'pointer', margin: 0 }}
            onClick={(e) => { e.stopPropagation(); navigate(`/b2b/deals/${deal.id}`) }}
          >
            {deal.deal_number}
          </Tag>
        ) : <Text type="secondary">—</Text>
      },
    },
    {
      title: 'SL',
      dataIndex: 'total_quantity',
      key: 'total_quantity',
      align: 'right' as const,
      render: (v: number) => v ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {v.toLocaleString()}
        </Text>
      ) : '—',
    },
    {
      title: 'KL (T)',
      dataIndex: 'total_weight',
      key: 'total_weight',
      align: 'right' as const,
      render: (v: number) => v ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {(v / 1000).toFixed(1)}
        </Text>
      ) : '—',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const c = STATUS_CONFIG[status] || STATUS_CONFIG.draft
        return <Tag color={c.color}>{c.label}</Tag>
      },
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (d: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(d).toLocaleDateString('vi-VN')}
        </Text>
      ),
    },
    {
      title: 'Người tạo',
      key: 'creator',
      render: (_: any, r: StockInOrder) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {r.creator?.full_name || '—'}
        </Text>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <InboxOutlined style={{ marginRight: 8 }} />
            Phiếu nhập kho
          </Title>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadOrders} loading={loading}>
              Làm mới
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/wms/stock-in/new')}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
            >
              Tạo phiếu nhập
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Error */}
      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
      )}

      {/* Summary */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Tổng" value={totalOrders} valueStyle={{ fontSize: 20, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Nháp" value={drafts} valueStyle={{ fontSize: 20, color: '#888' }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Đã nhập" value={confirmed} valueStyle={{ fontSize: 20, color: '#16A34A' }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="KL (T)" value={(totalWeight / 1000).toFixed(1)} valueStyle={{ fontSize: 20, color: '#1B4D3E' }} />
          </Card>
        </Col>
      </Row>

      {/* Filter + Table */}
      <Card
        bodyStyle={{ padding: 0 }}
        title={
          <Space>
            <Input.Search
              placeholder="Tìm mã phiếu, kho..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
              style={{ width: 250 }}
              size="small"
            />
            <Select
              value={filterStatus || 'all'}
              onChange={v => { setFilterStatus(v === 'all' ? undefined : v); setPage(1) }}
              size="small"
              style={{ width: 130 }}
              options={[
                { value: 'all', label: 'Tất cả' },
                { value: 'draft', label: 'Nháp' },
                { value: 'confirmed', label: 'Đã nhập' },
                { value: 'cancelled', label: 'Đã hủy' },
              ]}
            />
          </Space>
        }
      >
        <Table
          dataSource={orders}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            current: page,
            pageSize,
            total: totalOrders,
            showSizeChanger: true,
            showTotal: (t, r) => `${r[0]}-${r[1]} / ${t}`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps) },
          }}
          onRow={(record) => ({
            onClick: () => navigate(`/wms/stock-in/${record.id}`),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    </div>
  )
}

export default StockInListPage
