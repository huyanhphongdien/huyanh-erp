// ============================================================================
// BLEND LIST PAGE — Ant Design
// File: src/pages/wms/blending/BlendListPage.tsx
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
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
  Alert,
  Row,
  Col,
  Statistic,
} from 'antd'
import {
  PlusOutlined,
  ReloadOutlined,
  ExperimentOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import blendingService from '../../../services/wms/blendingService'
import GradeBadge from '../../../components/wms/GradeBadge'
import type { BlendOrder, BlendStatus } from '../../../services/wms/wms.types'
import {
  BLEND_STATUS_LABELS,
  BLEND_STATUS_COLORS,
} from '../../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// COMPONENT
// ============================================================================

const BlendListPage = () => {
  const navigate = useNavigate()

  const [orders, setOrders] = useState<BlendOrder[]>([])
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
      const result = await blendingService.getAll({
        page,
        pageSize,
        status: filterStatus,
        search: searchText.trim() || undefined,
      })
      setOrders(result.data)
      setTotalOrders(result.total)
    } catch (err: any) {
      console.error('Load blend list error:', err)
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
      title: 'Grade mục tiêu',
      dataIndex: 'target_grade',
      key: 'target_grade',
      render: (v: string | null) => <GradeBadge grade={v} size="small" />,
    },
    {
      title: 'DRC mục tiêu',
      dataIndex: 'target_drc',
      key: 'target_drc',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {v ? `${v}%` : '—'}
        </Text>
      ),
    },
    {
      title: 'SL muc tieu (kg)',
      dataIndex: 'target_quantity_kg',
      key: 'target_quantity_kg',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {v ? v.toLocaleString() : '—'}
        </Text>
      ),
    },
    {
      title: 'DRC mô phỏng',
      dataIndex: 'simulated_drc',
      key: 'simulated_drc',
      align: 'right' as const,
      render: (v: number | null) => v != null ? (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>
          {v}%
        </Text>
      ) : '—',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: BlendStatus) => (
        <Tag color={BLEND_STATUS_COLORS[status] || 'default'}>
          {BLEND_STATUS_LABELS[status] || status}
        </Tag>
      ),
    },
    {
      title: 'Ngay',
      key: 'date',
      render: (_: any, r: BlendOrder) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(r.created_at).toLocaleDateString('vi-VN')}
        </Text>
      ),
    },
  ]

  const statusOptions = [
    { value: 'all', label: 'Tất cả' },
    ...Object.entries(BLEND_STATUS_LABELS).map(([value, label]) => ({ value, label })),
  ]

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <ExperimentOutlined style={{ marginRight: 8 }} />
            Lenh phoi tron
          </Title>
        </Col>
        <Col>
          <Space>
            <Button icon={<BulbOutlined />} onClick={() => navigate('/wms/blending/suggest')}>
              Goi y phoi tron
            </Button>
            <Button icon={<ReloadOutlined />} onClick={loadOrders} loading={loading}>
              Làm mới
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/wms/blending/new')}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
            >
              Tạo lệnh trộn
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
        <Col xs={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Tổng" value={totalOrders} valueStyle={{ fontSize: 20, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Đang trộn" value={inProgress} valueStyle={{ fontSize: 20, color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card styles={{ body: { padding: 12 } }}>
            <Statistic title="Hoàn thành" value={completed} valueStyle={{ fontSize: 20, color: '#16A34A' }} />
          </Card>
        </Col>
      </Row>

      {/* Filter + Table */}
      <Card
        styles={{ body: { padding: 0 } }}
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
            onClick: () => navigate(`/wms/blending/${record.id}`),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    </div>
  )
}

export default BlendListPage
