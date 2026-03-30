// ============================================================================
// EXECUTIVE DASHBOARD PAGE — Tong quan dieu hanh (BGD)
// File: src/pages/sales/ExecutiveDashboardPage.tsx
// Module Ban hang quoc te — Huy Anh Rubber ERP
// Primary color: #1B4D3E
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Button,
  Select,
  Space,
  Spin,
  Typography,
  List,
  Badge,
} from 'antd'
import {
  DollarOutlined,
  AlertOutlined,
  ShoppingCartOutlined,
  BankOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  FilePdfOutlined,
  RightOutlined,
} from '@ant-design/icons'
import { supabase } from '../../lib/supabase'
import { salesOrderService } from '../../services/sales/salesOrderService'
import { salesAlertService } from '../../services/sales/salesAlertService'
import type { SalesAlert } from '../../services/sales/salesAlertService'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../../services/sales/salesTypes'

const { Title, Text } = Typography

// ============================================================================
// CONSTANTS
// ============================================================================

const PRIMARY = '#1B4D3E'

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: `Tháng ${i + 1}`,
}))

const currentYear = new Date().getFullYear()
const YEAR_OPTIONS = Array.from({ length: 3 }, (_, i) => ({
  value: currentYear - i,
  label: `${currentYear - i}`,
}))

const PIPELINE_STAGES = [
  { key: 'draft', label: 'Nháp', color: '#d9d9d9' },
  { key: 'confirmed', label: 'Xác nhận', color: '#1890ff' },
  { key: 'producing', label: 'Đang SX', color: '#fa8c16' },
  { key: 'ready', label: 'Sẵn sàng', color: '#722ed1' },
  { key: 'packing', label: 'Đóng gói', color: '#13c2c2' },
  { key: 'shipped', label: 'Đã xuất', color: '#52c41a' },
  { key: 'paid', label: 'Đã TT', color: '#1B4D3E' },
] as const

// ============================================================================
// TYPES
// ============================================================================

interface KpiData {
  revenue_month: number
  collected: number
  order_count: number
  uncollected: number
}

interface PipelineData {
  [status: string]: number
}

interface MonthlyRevenue {
  month: string
  revenue: number
}

interface TopCustomer {
  name: string
  revenue: number
  orders: number
}

interface RecentShipment {
  id: string
  code: string
  customer_name: string
  grade: string
  quantity_tons: number
  etd: string | null
  status: string
  payment_date: string | null
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ExecutiveDashboardPage() {
  const navigate = useNavigate()
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [loading, setLoading] = useState(true)

  const [kpi, setKpi] = useState<KpiData>({ revenue_month: 0, collected: 0, order_count: 0, uncollected: 0 })
  const [alerts, setAlerts] = useState<SalesAlert[]>([])
  const [pipeline, setPipeline] = useState<PipelineData>({})
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([])
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])
  const [recentShipments, setRecentShipments] = useState<RecentShipment[]>([])

  // ── Load all data ──
  useEffect(() => {
    loadData()
  }, [selectedMonth, selectedYear])

  const loadData = async () => {
    try {
      setLoading(true)
      await Promise.all([
        loadKpi(),
        loadAlerts(),
        loadPipeline(),
        loadMonthlyRevenue(),
        loadTopCustomers(),
        loadRecentShipments(),
      ])
    } finally {
      setLoading(false)
    }
  }

  const loadKpi = async () => {
    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
    const endDate = selectedMonth === 12
      ? `${selectedYear + 1}-01-01`
      : `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`

    // Revenue this month (all orders created this month)
    const { data: monthOrders } = await supabase
      .from('sales_orders')
      .select('total_value_usd, payment_date, payment_received_amount, status')
      .gte('order_date', startDate)
      .lt('order_date', endDate)
      .not('status', 'eq', 'cancelled')

    const revenue = monthOrders?.reduce((s, o) => s + (o.total_value_usd || 0), 0) || 0
    const collected = monthOrders?.reduce((s, o) => s + (o.payment_received_amount || 0), 0) || 0
    const count = monthOrders?.length || 0

    setKpi({
      revenue_month: revenue,
      collected,
      order_count: count,
      uncollected: revenue - collected,
    })
  }

  const loadAlerts = async () => {
    const result = await salesAlertService.getAlerts()
    setAlerts(result)
  }

  const loadPipeline = async () => {
    const { data } = await supabase
      .from('sales_orders')
      .select('status')
      .not('status', 'eq', 'cancelled')

    const counts: PipelineData = {}
    data?.forEach(o => {
      counts[o.status] = (counts[o.status] || 0) + 1
    })
    setPipeline(counts)
  }

  const loadMonthlyRevenue = async () => {
    const months: MonthlyRevenue[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(selectedYear, selectedMonth - 1 - i, 1)
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      const start = `${y}-${String(m).padStart(2, '0')}-01`
      const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`

      const { data } = await supabase
        .from('sales_orders')
        .select('total_value_usd')
        .gte('order_date', start)
        .lt('order_date', end)
        .not('status', 'eq', 'cancelled')

      const rev = data?.reduce((s, o) => s + (o.total_value_usd || 0), 0) || 0
      months.push({ month: `T${m}/${y}`, revenue: rev })
    }
    setMonthlyRevenue(months)
  }

  const loadTopCustomers = async () => {
    const { data } = await supabase
      .from('sales_orders')
      .select('total_value_usd, customer:sales_customers!customer_id(name)')
      .not('status', 'eq', 'cancelled')

    const map: Record<string, { revenue: number; orders: number }> = {}
    data?.forEach(o => {
      const name = (o.customer as any)?.name || 'N/A'
      if (!map[name]) map[name] = { revenue: 0, orders: 0 }
      map[name].revenue += o.total_value_usd || 0
      map[name].orders += 1
    })

    const sorted = Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
    setTopCustomers(sorted)
  }

  const loadRecentShipments = async () => {
    const { data } = await supabase
      .from('sales_orders')
      .select('id, code, grade, quantity_tons, etd, status, payment_date, customer:sales_customers!customer_id(name)')
      .in('status', ['shipped', 'delivered', 'invoiced', 'paid'])
      .order('etd', { ascending: false })
      .limit(10)

    setRecentShipments(
      (data || []).map(o => ({
        id: o.id,
        code: o.code,
        customer_name: (o.customer as any)?.name || '',
        grade: o.grade || '',
        quantity_tons: o.quantity_tons || 0,
        etd: o.etd,
        status: o.status,
        payment_date: o.payment_date,
      }))
    )
  }

  // ── Derived: max revenue for chart ──
  const maxRevenue = useMemo(() =>
    Math.max(...monthlyRevenue.map(m => m.revenue), 1),
    [monthlyRevenue]
  )

  // ── Pipeline total ──
  const pipelineTotal = useMemo(() =>
    Object.values(pipeline).reduce((s, v) => s + v, 0) || 1,
    [pipeline]
  )

  // ── Alert severity icon ──
  const alertIcon = (severity: SalesAlert['severity']) => {
    switch (severity) {
      case 'critical': return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
      case 'warning': return <WarningOutlined style={{ color: '#faad14' }} />
      default: return <InfoCircleOutlined style={{ color: '#1890ff' }} />
    }
  }

  const alertColor = (severity: SalesAlert['severity']) => {
    switch (severity) {
      case 'critical': return '#fff1f0'
      case 'warning': return '#fffbe6'
      default: return '#e6f7ff'
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip="Đang tải dữ liệu..." />
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* ═══ HEADER ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <Title level={3} style={{ margin: 0, color: PRIMARY }}>
          Tổng quan điều hành
        </Title>
        <Space>
          <Select
            value={selectedMonth}
            onChange={setSelectedMonth}
            options={MONTH_OPTIONS}
            style={{ width: 120 }}
          />
          <Select
            value={selectedYear}
            onChange={setSelectedYear}
            options={YEAR_OPTIONS}
            style={{ width: 100 }}
          />
          <Button icon={<FilePdfOutlined />} onClick={() => window.print()}>
            Xuất PDF
          </Button>
        </Space>
      </div>

      {/* ═══ KPI ROW ═══ */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: `3px solid #52c41a` }}>
            <Statistic
              title="Doanh thu tháng"
              value={kpi.revenue_month}
              precision={0}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#52c41a', fontSize: 22, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: `3px solid #1890ff` }}>
            <Statistic
              title="Đã thu"
              value={kpi.collected}
              precision={0}
              prefix={<BankOutlined />}
              valueStyle={{ color: '#1890ff', fontSize: 22, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: `3px solid ${PRIMARY}` }}>
            <Statistic
              title="Số đơn hàng"
              value={kpi.order_count}
              prefix={<ShoppingCartOutlined />}
              valueStyle={{ color: PRIMARY, fontSize: 22, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderTop: `3px solid ${kpi.uncollected > 0 ? '#ff4d4f' : '#52c41a'}` }}>
            <Statistic
              title="Chưa thu"
              value={kpi.uncollected}
              precision={0}
              prefix={<DollarOutlined />}
              valueStyle={{ color: kpi.uncollected > 0 ? '#ff4d4f' : '#52c41a', fontSize: 22, fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      {/* ═══ ALERTS ═══ */}
      {alerts.length > 0 && (
        <Card
          title={
            <Space>
              <AlertOutlined style={{ color: '#ff4d4f' }} />
              <span>Cảnh báo ({alerts.length})</span>
            </Space>
          }
          size="small"
          style={{ marginBottom: 24 }}
        >
          <List
            dataSource={alerts.slice(0, 8)}
            renderItem={(alert) => (
              <List.Item
                style={{
                  background: alertColor(alert.severity),
                  borderRadius: 6,
                  marginBottom: 4,
                  padding: '8px 12px',
                  cursor: 'pointer',
                }}
                onClick={() => navigate(`/sales/orders/${alert.order_id}`)}
                extra={<RightOutlined style={{ color: '#999' }} />}
              >
                <List.Item.Meta
                  avatar={alertIcon(alert.severity)}
                  title={<Text strong style={{ fontSize: 13 }}>{alert.title}</Text>}
                  description={<Text style={{ fontSize: 12 }}>{alert.message} — {alert.customer_name}</Text>}
                />
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* ═══ PIPELINE ═══ */}
      <Card title="Pipeline đơn hàng" size="small" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 2, height: 40, borderRadius: 8, overflow: 'hidden' }}>
          {PIPELINE_STAGES.map(stage => {
            const count = pipeline[stage.key] || 0
            const pct = (count / pipelineTotal) * 100
            if (pct === 0) return null
            return (
              <div
                key={stage.key}
                style={{
                  width: `${Math.max(pct, 5)}%`,
                  background: stage.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  transition: 'width 0.3s ease',
                  minWidth: 40,
                }}
                title={`${stage.label}: ${count}`}
              >
                {count}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          {PIPELINE_STAGES.map(stage => (
            <Space key={stage.key} size={4}>
              <Badge color={stage.color} />
              <Text style={{ fontSize: 12 }}>{stage.label}: {pipeline[stage.key] || 0}</Text>
            </Space>
          ))}
        </div>
      </Card>

      {/* ═══ TWO COLUMNS: Revenue chart + Top customers ═══ */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={14}>
          <Card title="Doanh thu 6 tháng (USD)" size="small">
            <svg viewBox="0 0 600 220" style={{ width: '100%', height: 220 }}>
              {monthlyRevenue.map((m, i) => {
                const barH = (m.revenue / maxRevenue) * 160
                const x = 20 + i * 95
                return (
                  <g key={m.month}>
                    <rect
                      x={x}
                      y={180 - barH}
                      width={60}
                      height={barH}
                      fill={PRIMARY}
                      rx={4}
                      opacity={0.85}
                    />
                    <text x={x + 30} y={175 - barH} textAnchor="middle" fontSize="11" fill="#333" fontWeight="600">
                      {m.revenue >= 1000 ? `${(m.revenue / 1000).toFixed(0)}k` : m.revenue.toLocaleString()}
                    </text>
                    <text x={x + 30} y={200} textAnchor="middle" fontSize="11" fill="#666">
                      {m.month}
                    </text>
                  </g>
                )
              })}
              {/* baseline */}
              <line x1="10" y1="180" x2="590" y2="180" stroke="#e8e8e8" strokeWidth="1" />
            </svg>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Top 5 khách hàng" size="small">
            <Table
              dataSource={topCustomers}
              rowKey="name"
              pagination={false}
              size="small"
              columns={[
                {
                  title: 'Khách hàng',
                  dataIndex: 'name',
                  key: 'name',
                  ellipsis: true,
                  render: (v: string) => <Text strong style={{ fontSize: 12 }}>{v}</Text>,
                },
                {
                  title: 'Doanh thu (USD)',
                  dataIndex: 'revenue',
                  key: 'revenue',
                  align: 'right' as const,
                  render: (v: number) => <Text style={{ color: PRIMARY, fontWeight: 600 }}>${v.toLocaleString()}</Text>,
                },
                {
                  title: 'Đơn',
                  dataIndex: 'orders',
                  key: 'orders',
                  align: 'center' as const,
                  width: 50,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {/* ═══ RECENT SHIPMENTS ═══ */}
      <Card title="Lô hàng gần đây" size="small">
        <Table
          dataSource={recentShipments}
          rowKey="id"
          pagination={false}
          size="small"
          onRow={(record) => ({
            style: { cursor: 'pointer' },
            onClick: () => navigate(`/sales/orders/${record.id}`),
          })}
          columns={[
            {
              title: 'Mã đơn',
              dataIndex: 'code',
              key: 'code',
              render: (v: string) => <Text strong style={{ color: PRIMARY }}>{v}</Text>,
            },
            {
              title: 'Khách hàng',
              dataIndex: 'customer_name',
              key: 'customer_name',
              ellipsis: true,
            },
            {
              title: 'Grade',
              dataIndex: 'grade',
              key: 'grade',
              render: (v: string) => <Tag color="blue">{v}</Tag>,
            },
            {
              title: 'SL (tấn)',
              dataIndex: 'quantity_tons',
              key: 'quantity_tons',
              align: 'right' as const,
            },
            {
              title: 'ETD',
              dataIndex: 'etd',
              key: 'etd',
              render: (v: string | null) => v ? new Date(v).toLocaleDateString('vi-VN') : '-',
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              render: (s: string) => (
                <Tag color={ORDER_STATUS_COLORS[s as keyof typeof ORDER_STATUS_COLORS]}>
                  {ORDER_STATUS_LABELS[s as keyof typeof ORDER_STATUS_LABELS] || s}
                </Tag>
              ),
            },
            {
              title: 'Thanh toán',
              dataIndex: 'payment_date',
              key: 'payment_date',
              render: (v: string | null) => v
                ? <Tag color="green">Đã TT</Tag>
                : <Tag color="orange">Chưa TT</Tag>,
            },
          ]}
        />
      </Card>
    </div>
  )
}
