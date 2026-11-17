// ============================================================================
// PRODUCTION DASHBOARD PAGE — Ant Design
// File: src/pages/wms/production/ProductionDashboardPage.tsx
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
  Typography,
  Row,
  Col,
  Statistic,
  Progress,
  Spin,
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
import PageState from '../../../components/common/PageState'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { fmtKg } from '../../../utils/format'
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
  const openTab = useOpenTab()

  const openProductionTab = (record: any) => {
    openTab({
      key: `production-${record.id}`,
      title: `Lệnh SX ${record.code || record.id.slice(0, 8)}`,
      componentId: 'production-detail',
      props: { id: record.id },
      path: `/wms/production/${record.id}`,
    })
  }

  const [allOrders, setAllOrders] = useState<ProductionOrder[]>([])
  const [allTotal, setAllTotal] = useState(0) // tổng số lệnh trên server (allOrders chỉ là 100 lệnh gần nhất)
  const [inProgressOrders, setInProgressOrders] = useState<ProductionOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [allResult, inProgress] = await Promise.all([
        productionService.getAll({ page: 1, pageSize: 100 }),
        productionService.getInProgress(),
      ])
      setAllOrders(allResult.data)
      setAllTotal(allResult.total)
      setInProgressOrders(inProgress)
    } catch (err: any) {
      setError(dichLoiHeThong(err, 'Không tải được số liệu sản xuất'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // KPIs — "Tổng" và "Đang SX" lấy số server (count + getInProgress đủ mọi lệnh đang chạy);
  // "Hoàn thành tháng này", "Hiệu suất TB", "theo Grade" tính trên 100 lệnh gần nhất → ghi rõ phạm vi khi bị cắt.
  const totalPOs = allTotal
  const inProgressCount = inProgressOrders.length
  const biCat = allTotal > allOrders.length
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
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtKg(v, 2)}</Text>
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
      title: 'Dây chuyền',
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
            Tổng quan sản xuất
          </Title>
        </Col>
        <Col>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/wms/production/new')}
            >
              Tạo lệnh SX
            </Button>
            <Button icon={<UnorderedListOutlined />} onClick={() => navigate('/wms/production')}>
              Xem tất cả
            </Button>
            {/* Cùng tên với menu "Dây chuyền" và tiêu đề trang Dây chuyền sản xuất */}
            <Button icon={<SettingOutlined />} onClick={() => navigate('/wms/production/facilities')}>
              Dây chuyền
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Lỗi tải → khối lỗi + Thử lại thay cho dãy thẻ KPI toàn số 0 giả */}
      {error ? <PageState error={error} onRetry={load} /> : (<>
      {/* KPI Cards */}
      <Row gutter={16} style={{ marginBottom: biCat ? 8 : 24 }}>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic title="Tổng lệnh SX" value={totalPOs}
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
            <Statistic title="Hoàn thành tháng này" value={completedThisMonth}
              valueStyle={{ fontSize: 28, color: '#16A34A', fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic title="Hiệu suất TB" value={avgYield} suffix="%"
              valueStyle={{ fontSize: 28, color: '#E8A838', fontFamily: "'JetBrains Mono'" }} />
          </Card>
        </Col>
      </Row>
      {biCat && (
        <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 24 }}>
          “Hoàn thành tháng này”, “Hiệu suất TB” và “Sản xuất theo Grade” tính trên {allOrders.length} lệnh tạo gần nhất
          (tổng {totalPOs} lệnh).
        </Text>
      )}

      <Row gutter={16} style={{ marginBottom: 24 }}>
        {/* Grade breakdown */}
        <Col xs={24} lg={8}>
          <Card title="Sản xuất theo Grade" style={{ borderRadius: 12, height: '100%' }}>
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
              <Text type="secondary">Chưa có dữ liệu</Text>
            )}
          </Card>
        </Col>

        {/* Active productions */}
        <Col xs={24} lg={16}>
          <Card
            title={`Đang sản xuất (${inProgressOrders.length})`}
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
                onClick: () => openProductionTab(record),
                style: { cursor: 'pointer' },
              })}
              locale={{ emptyText: 'Không có lệnh đang sản xuất' }}
            />
          </Card>
        </Col>
      </Row>
      </>)}
    </div>
  )
}

export default ProductionDashboardPage
