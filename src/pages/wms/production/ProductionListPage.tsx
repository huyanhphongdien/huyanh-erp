// ============================================================================
// PRODUCTION LIST PAGE — Ant Design
// File: src/pages/wms/production/ProductionListPage.tsx
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenTab } from '../../../hooks/useOpenTab'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Input,
  Select,
  Typography,
  Alert,
  Row,
  Col,
  Statistic,
} from 'antd'
import {
  PlusOutlined,
  ReloadOutlined,
  ExperimentOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import productionService from '../../../services/wms/productionService'
import GradeBadge from '../../../components/wms/GradeBadge'
import type { ProductionOrder, ProductionStatus } from '../../../services/wms/wms.types'
import {
  PRODUCTION_STATUS_LABELS,
  PRODUCTION_STATUS_COLORS,
  STAGE_NAMES,
  RUBBER_GRADE_LABELS,
} from '../../../services/wms/wms.types'
import type { RubberGrade } from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// COMPONENT
// ============================================================================

const ProductionListPage = () => {
  const navigate = useNavigate()
  const openTab = useOpenTab()

  const [orders, setOrders] = useState<ProductionOrder[]>([])
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
      const result = await productionService.getAll({
        page,
        pageSize,
        status: filterStatus,
        search: searchText.trim() || undefined,
      })
      setOrders(result.data)
      setTotalOrders(result.total)
    } catch (err: any) {
      console.error('Load production list error:', err)
      setError(err.message || 'Không thể tải du lieu')
    } finally {
      setLoading(false)
    }
  }, [filterStatus, searchText, page, pageSize])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Summary stats
  const inProgress = orders.filter(o => o.status === 'in_progress').length
  const completed = orders.filter(o => o.status === 'completed').length
  const yieldValues = orders.filter(o => o.yield_percent != null).map(o => o.yield_percent!)
  const avgYield = yieldValues.length > 0
    ? Math.round(yieldValues.reduce((s, v) => s + v, 0) / yieldValues.length * 10) / 10
    : 0

  // Table columns
  const columns = [
    {
      title: 'Mã lệnh',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => (
        <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
          {code}
        </Text>
      ),
    },
    {
      title: 'Grade',
      dataIndex: 'target_grade',
      key: 'target_grade',
      render: (v: string | null) => <GradeBadge grade={v} size="small" />,
    },
    {
      title: 'SL muc tieu (kg)',
      dataIndex: 'target_quantity',
      key: 'target_quantity',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {v ? v.toLocaleString() : '—'}
        </Text>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: ProductionStatus) => (
        <Tag color={PRODUCTION_STATUS_COLORS[status] || 'default'}>
          {PRODUCTION_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: 'Công đoạn',
      key: 'stage',
      render: (_: any, r: ProductionOrder) => {
        if (!r.stage_current) return <Text type="secondary">—</Text>
        return (
          <Tag color="blue">
            {r.stage_current}/5 · {STAGE_NAMES[r.stage_current] || ''}
          </Tag>
        )
      },
    },
    {
      title: 'Nhà máy',
      key: 'facility',
      render: (_: any, r: ProductionOrder) => r.facility?.name || '—',
    },
    {
      title: 'Ngay',
      key: 'date',
      render: (_: any, r: ProductionOrder) => {
        const d = r.scheduled_start_date || r.created_at
        return (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {new Date(d).toLocaleDateString('vi-VN')}
          </Text>
        )
      },
    },
    {
      title: 'Yield %',
      dataIndex: 'yield_percent',
      key: 'yield_percent',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: v >= 90 ? '#16A34A' : v >= 80 ? '#E8A838' : '#DC2626' }}>
          {v.toFixed(1)}%
        </Text>
      ) : '—',
    },
  ]

  const statusOptions = [
    { value: 'all', label: 'Tất cả' },
    ...Object.entries(PRODUCTION_STATUS_LABELS).map(([value, label]) => ({ value, label })),
  ]

  const gradeOptions = [
    { value: 'all', label: 'Tat ca Grade' },
    ...Object.entries(RUBBER_GRADE_LABELS).map(([value, label]) => ({ value, label })),
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <ExperimentOutlined style={{ marginRight: 8 }} />
            Lệnh sản xuất
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
              onClick={() => navigate('/wms/production/new')}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
            >
              Tạo lệnh SX
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
            <Statistic title="Đang SX" value={inProgress} valueStyle={{ fontSize: 20, color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Hoàn thành" value={completed} valueStyle={{ fontSize: 20, color: '#16A34A' }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 12 }}>
            <Statistic title="Yield TB" value={avgYield} suffix="%" valueStyle={{ fontSize: 20, color: '#1B4D3E' }} />
          </Card>
        </Col>
      </Row>

      {/* Filter + Table */}
      <Card
        bodyStyle={{ padding: 0 }}
        title={
          <Space>
            <Input.Search
              placeholder="Tìm mã lenh..."
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
              style={{ width: 140 }}
              options={statusOptions}
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
            onClick: () => openTab({
              key: `production-${record.id}`,
              title: `Lệnh SX ${(record as any).code || record.id.slice(0, 8)}`,
              componentId: 'production-detail',
              props: { id: record.id },
              path: `/wms/production/${record.id}`,
            }),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    </div>
  )
}

export default ProductionListPage
