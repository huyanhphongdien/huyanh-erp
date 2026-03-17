// ============================================================================
// PRODUCTION DASHBOARD PAGE — Ant Design
// File: src/pages/wms/production/ProductionDashboardPage.tsx
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
// ============================================================================

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Statistic,
  Progress,
  Spin,
  Alert,
} from 'antd'
import {
  PlusOutlined,
  ExperimentOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  DashboardOutlined,
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

const ProductionDashboardPage = () => {
  const navigate = useNavigate()

  const [allOrders, setAllOrders] = useState<ProductionOrder[]>([])
  const [inProgressOrders, setInProgressOrders] = useState<ProductionOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [allResult, inProgress] = await Promise.all([
          productionService.getAll({ page: 1, pageSize: 100 }),
          productionService.getInProgress(),
        ])
        setAllOrders(allResult.data)
        setInProgressOrders(inProgress)
      } catch (err: any) {
        setError(err.message || 'Không thể tải du lieu')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // KPIs
  const totalPOs = allOrders.length
  const inProgressCount = allOrders.filter(o => o.status === 'in_progress').length
  const now = new Date()
  const completedThisMonth = allOrders.filter(o => {
    if (o.status !== 'completed' || !o.actual_end_date) return false
    const endDate = new Date(o.actual_end_date)
    return endDate.getMonth() === now.getMonth() && endDate.getFullYear() === now.getFullYear()
  }).length
  const yieldValues = allOrders.filter(o => o.yield_percent != null).map(o => o.yield_percent!)
  const avgYield = yieldValues.length > 0
    ? Math.round(yieldValues.reduce((s, v) => s + v, 0) / yieldValues.length * 10) / 10
    : 0

  // Grade breakdown
  const gradeBreakdown: Record<string, number> = {}
  allOrders.forEach(o => {
    const grade = o.target_grade || 'other'
    gradeBreakdown[grade] = (gradeBreakdown[grade] || 0) + 1
  })
  const maxGradeCount = Math.max(...Object.values(gradeBreakdown), 1)

  // Active productions columns
  const activeColumns = [
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
      title: 'SL (kg)',
      dataIndex: 'target_quantity',
      key: 'target_quantity',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v?.toLocaleString()}</Text>
      ),
    },
    {
      title: 'Công đoạn',
      key: 'stage',
      render: (_: any, r: ProductionOrder) => {
        if (!r.stage_current) return '—'
        return (
          <Tag color="blue">
            {r.stage_current}/5 · {STAGE_NAMES[r.stage_current]}
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
      title: 'Giám sát',
      key: 'supervisor',
      render: (_: any, r: ProductionOrder) => r.supervisor?.full_name || '—',
    },
  ]

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', paddingTop: 100 }}><Spin size="large" /></div>
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <DashboardOutlined style={{ marginRight: 8 }} />
            Dashboard San xuat
          </Title>
        </Col>
        <Col>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/wms/production/new')}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
            >
              Tạo lệnh SX
            </Button>
            <Button icon={<UnorderedListOutlined />} onClick={() => navigate('/wms/production')}>
              Xem tất cả
            </Button>
            <Button icon={<SettingOutlined />} onClick={() => navigate('/wms/production/facilities')}>
              Nha may
            </Button>
          </Space>
        </Col>
      </Row>

      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
      )}

      {/* KPI Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic title="Tong lenh SX" value={totalPOs}
              valueStyle={{ fontSize: 28, fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic title="Đang sản xuất" value={inProgressCount}
              valueStyle={{ fontSize: 28, color: '#1890ff', fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic title="Hoàn thành thang nay" value={completedThisMonth}
              valueStyle={{ fontSize: 28, color: '#16A34A', fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic title="Yield TB" value={avgYield} suffix="%"
              valueStyle={{ fontSize: 28, color: '#E8A838', fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {/* Grade breakdown */}
        <Col xs={24} lg={8}>
          <Card title="San xuat theo Grade" style={{ borderRadius: 12, height: '100%' }}>
            {Object.entries(gradeBreakdown).map(([grade, count]) => (
              <div key={grade} style={{ marginBottom: 12 }}>
                <Row justify="space-between" align="middle" style={{ marginBottom: 4 }}>
                  <Col>
                    <GradeBadge grade={grade} size="small" />
                  </Col>
                  <Col>
                    <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{count}</Text>
                  </Col>
                </Row>
                <Progress
                  percent={Math.round((count / maxGradeCount) * 100)}
                  showInfo={false}
                  strokeColor="#1B4D3E"
                  size="small"
                />
              </div>
            ))}
            {Object.keys(gradeBreakdown).length === 0 && (
              <Text type="secondary">Chưa có du lieu</Text>
            )}
          </Card>
        </Col>

        {/* Active productions */}
        <Col xs={24} lg={16}>
          <Card
            title={`Dang san xuat (${inProgressOrders.length})`}
            style={{ borderRadius: 12 }}
            bodyStyle={{ padding: 0 }}
          >
            <Table
              dataSource={inProgressOrders}
              columns={activeColumns}
              rowKey="id"
              size="small"
              pagination={false}
              onRow={(record) => ({
                onClick: () => navigate(`/wms/production/${record.id}`),
                style: { cursor: 'pointer' },
              })}
              locale={{ emptyText: 'Không có lệnh đang sản xuất' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default ProductionDashboardPage
