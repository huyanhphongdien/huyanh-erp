// ============================================================================
// SALES DASHBOARD PAGE — Tổng quan bán hàng
// File: src/pages/sales/SalesDashboardPage.tsx
// Module Bán hàng quốc tế — Huy Anh Rubber ERP
// Primary color: #1B4D3E
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Card, Table, Tag, Spin, Segmented, Statistic, Typography, Space } from 'antd'
import {
  ShoppingBag, TrendingUp, Package, Clock, CheckCircle,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { salesOrderService } from '../../services/sales/salesOrderService'
import { salesDashboardService } from '../../services/sales/salesDashboardService'
import type { MonthlyRevenue, GradeDistribution, TopCustomer, PipelineStage } from '../../services/sales/salesDashboardService'
import type { SalesOrder } from '../../services/sales/salesTypes'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../../services/sales/salesTypes'

const { Title, Text } = Typography

const PRIMARY = '#1B4D3E'
const SECONDARY = '#2D8B6E'

// ============================================================================
// CHART COLORS
// ============================================================================

const GRADE_COLORS = [
  '#1B4D3E', '#2D8B6E', '#E8A838', '#3B82F6', '#8B5CF6',
  '#EC4899', '#F97316', '#06B6D4', '#84CC16', '#EF4444',
]

const PIPELINE_COLORS: Record<string, string> = {
  draft: '#94A3B8',
  confirmed: '#3B82F6',
  producing: '#F97316',
  ready: '#06B6D4',
  shipped: '#6366F1',
  delivered: '#22C55E',
  paid: '#1B4D3E',
}

// ============================================================================
// FORMAT HELPERS
// ============================================================================

const formatUSD = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

const formatNumber = (v: number) =>
  new Intl.NumberFormat('vi-VN').format(v)

const formatTons = (v: number) =>
  `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(v)} tấn`

// ============================================================================
// SIMPLE SVG BAR CHART
// ============================================================================

function BarChart({ data }: { data: MonthlyRevenue[] }) {
  if (data.length === 0) return <div className="text-center text-gray-400 py-10">Chưa có dữ liệu</div>

  const maxRevenue = Math.max(...data.map(d => d.revenue), 1)
  const barWidth = Math.floor(100 / data.length)
  const chartHeight = 200

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg width="100%" height={chartHeight + 40} viewBox={`0 0 ${data.length * 80} ${chartHeight + 40}`}>
        {data.map((d, i) => {
          const barH = maxRevenue > 0 ? (d.revenue / maxRevenue) * (chartHeight - 20) : 0
          const x = i * 80 + 15
          const y = chartHeight - barH
          return (
            <g key={d.month}>
              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={50}
                height={barH}
                rx={6}
                fill={i === data.length - 1 ? PRIMARY : SECONDARY}
                opacity={i === data.length - 1 ? 1 : 0.6}
              />
              {/* Value label */}
              {d.revenue > 0 && (
                <text
                  x={x + 25}
                  y={y - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#5A6B63"
                  fontWeight="600"
                >
                  {d.revenue >= 1000000
                    ? `${(d.revenue / 1000000).toFixed(1)}M`
                    : d.revenue >= 1000
                      ? `${(d.revenue / 1000).toFixed(0)}K`
                      : formatNumber(d.revenue)}
                </text>
              )}
              {/* Month label */}
              <text
                x={x + 25}
                y={chartHeight + 18}
                textAnchor="middle"
                fontSize="12"
                fill="#94A3A8"
                fontWeight="500"
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ============================================================================
// SIMPLE SVG PIE CHART
// ============================================================================

function PieChart({ data }: { data: GradeDistribution[] }) {
  if (data.length === 0) return <div className="text-center text-gray-400 py-10">Chưa có dữ liệu</div>

  const total = data.reduce((s, d) => s + d.value_usd, 0)
  if (total === 0) return <div className="text-center text-gray-400 py-10">Chưa có dữ liệu</div>

  const cx = 100, cy = 100, r = 80
  let currentAngle = -90

  const segments = data.slice(0, 8).map((d, i) => {
    const angle = (d.value_usd / total) * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angle
    currentAngle = endAngle

    const startRad = (startAngle * Math.PI) / 180
    const endRad = (endAngle * Math.PI) / 180

    const x1 = cx + r * Math.cos(startRad)
    const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad)
    const y2 = cy + r * Math.sin(endRad)

    const largeArc = angle > 180 ? 1 : 0

    const pathD = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`

    return (
      <path key={d.grade} d={pathD} fill={GRADE_COLORS[i % GRADE_COLORS.length]} />
    )
  })

  return (
    <div className="flex items-center gap-4">
      <svg width={200} height={200} viewBox="0 0 200 200">
        {segments}
        {/* Center hole */}
        <circle cx={cx} cy={cy} r={45} fill="white" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="14" fill={PRIMARY} fontWeight="700">
          {formatNumber(data.length)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill="#94A3A8">
          loại mủ
        </text>
      </svg>
      <div className="flex-1 space-y-1.5">
        {data.slice(0, 6).map((d, i) => (
          <div key={d.grade} className="flex items-center gap-2 text-sm">
            <div
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: GRADE_COLORS[i % GRADE_COLORS.length] }}
            />
            <span className="text-gray-700 flex-1 truncate">{d.grade.replace('_', ' ')}</span>
            <span className="text-gray-500 font-medium">{d.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// PIPELINE FUNNEL
// ============================================================================

function PipelineFunnel({ data }: { data: PipelineStage[] }) {
  if (data.length === 0) return null

  const maxCount = Math.max(...data.map(d => d.count), 1)

  return (
    <div className="flex gap-1 items-end" style={{ minHeight: 120 }}>
      {data.map((stage, i) => {
        const height = maxCount > 0 ? Math.max((stage.count / maxCount) * 80, 24) : 24
        const color = PIPELINE_COLORS[stage.status] || '#94A3B8'

        return (
          <div key={stage.status} className="flex-1 flex flex-col items-center gap-1">
            {/* Count */}
            <span className="text-xs font-bold" style={{ color }}>{stage.count}</span>
            {/* Bar */}
            <div
              className="w-full rounded-t-md transition-all"
              style={{ height, backgroundColor: color, opacity: 0.85, minWidth: 36 }}
            />
            {/* Value */}
            <span className="text-[10px] text-gray-500 font-medium">
              {stage.value_usd >= 1000 ? `$${(stage.value_usd / 1000).toFixed(0)}K` : `$${stage.value_usd}`}
            </span>
            {/* Label */}
            <span className="text-[10px] text-gray-500 text-center leading-tight">{stage.label}</span>
            {/* Arrow (except last) */}
            {i < data.length - 1 && (
              <span className="text-gray-300 text-xs" style={{ marginTop: -2 }}>→</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// KPI CARD
// ============================================================================

interface KPICardProps {
  title: string
  value: string | number
  suffix?: string
  icon: React.ReactNode
  trend?: { value: number; label: string }
  color?: string
}

function KPICard({ title, value, suffix, icon, trend, color = PRIMARY }: KPICardProps) {
  return (
    <Card size="small" className="h-full" styles={{ body: { padding: '16px 20px' } }}>
      <div className="flex items-start justify-between mb-2">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${color}14` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
        {trend && (
          <div className={`flex items-center gap-0.5 text-xs font-semibold ${trend.value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {trend.value >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <Statistic
        value={value}
        suffix={suffix}
        valueStyle={{ fontSize: 24, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.2 }}
      />
      <Text type="secondary" className="text-xs mt-1 block">{title}</Text>
    </Card>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

type DateRangeOption = 'month' | 'quarter' | 'year'

export default function SalesDashboardPage() {
  const navigate = useNavigate()
  const [dateRange, setDateRange] = useState<DateRangeOption>('month')
  const [loading, setLoading] = useState(true)

  // Data states
  const [kpis, setKpis] = useState<{
    ordersThisPeriod: number
    ordersLastPeriod: number
    revenueThisPeriod: number
    quantityTons: number
    processingOrders: number
    onTimeRate: number
  } | null>(null)
  const [monthlyRevenue, setMonthlyRevenue] = useState<MonthlyRevenue[]>([])
  const [gradeDistribution, setGradeDistribution] = useState<GradeDistribution[]>([])
  const [recentOrders, setRecentOrders] = useState<SalesOrder[]>([])
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])
  const [pipeline, setPipeline] = useState<PipelineStage[]>([])

  // ── Load all data ──
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [kpiData, revenueData, gradeData, ordersResult, customersData, pipelineData] =
        await Promise.all([
          salesDashboardService.getKPIs(dateRange),
          salesDashboardService.getMonthlyRevenue(6),
          salesDashboardService.getGradeDistribution(),
          salesOrderService.getList({ page: 1, pageSize: 10, sort_by: 'order_date', sort_order: 'desc' }),
          salesDashboardService.getTopCustomers(5),
          salesDashboardService.getPipeline(),
        ])

      setKpis(kpiData)
      setMonthlyRevenue(revenueData)
      setGradeDistribution(gradeData)
      setRecentOrders(ordersResult.data)
      setTopCustomers(customersData)
      setPipeline(pipelineData)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Trend calculation ──
  const ordersTrend = kpis && kpis.ordersLastPeriod > 0
    ? Math.round(((kpis.ordersThisPeriod - kpis.ordersLastPeriod) / kpis.ordersLastPeriod) * 100)
    : 0

  // ── Recent orders table columns ──
  const orderColumns = [
    {
      title: 'Mã đơn',
      dataIndex: 'code',
      key: 'code',
      render: (code: string, record: SalesOrder) => (
        <a
          onClick={() => navigate(`/sales/orders/${record.id}`)}
          className="font-semibold cursor-pointer"
          style={{ color: PRIMARY }}
        >
          {code}
        </a>
      ),
    },
    {
      title: 'Khách hàng',
      dataIndex: ['customer', 'name'],
      key: 'customer',
      ellipsis: true,
      render: (_: unknown, record: SalesOrder) => record.customer?.short_name || record.customer?.name || '—',
    },
    {
      title: 'Cấp mủ',
      dataIndex: 'grade',
      key: 'grade',
      render: (g: string) => <Tag>{g?.replace('_', ' ')}</Tag>,
    },
    {
      title: 'SL (tấn)',
      dataIndex: 'quantity_tons',
      key: 'qty',
      align: 'right' as const,
      render: (v: number) => formatNumber(v),
    },
    {
      title: 'Giá trị',
      dataIndex: 'total_value_usd',
      key: 'value',
      align: 'right' as const,
      render: (v: number) => v ? formatUSD(v) : '—',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => (
        <Tag color={ORDER_STATUS_COLORS[s as keyof typeof ORDER_STATUS_COLORS] || 'default'}>
          {ORDER_STATUS_LABELS[s as keyof typeof ORDER_STATUS_LABELS] || s}
        </Tag>
      ),
    },
  ]

  // ── Top customers table columns ──
  const customerColumns = [
    {
      title: 'Khách hàng',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string) => <span className="font-medium">{name}</span>,
    },
    {
      title: 'Quốc gia',
      dataIndex: 'country',
      key: 'country',
      render: (c: string | null) => c || '—',
    },
    {
      title: 'Đơn hàng',
      dataIndex: 'order_count',
      key: 'orders',
      align: 'right' as const,
    },
    {
      title: 'Doanh thu',
      dataIndex: 'total_revenue',
      key: 'revenue',
      align: 'right' as const,
      render: (v: number) => <span className="font-semibold" style={{ color: PRIMARY }}>{formatUSD(v)}</span>,
    },
  ]

  // ── Date range labels ──
  const dateRangeLabel =
    dateRange === 'month' ? 'tháng này' :
    dateRange === 'quarter' ? 'quý này' : 'năm nay'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spin size="large" tip="Đang tải dữ liệu..." />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Title level={3} style={{ margin: 0, color: PRIMARY }}>
            Tổng quan bán hàng
          </Title>
          <Text type="secondary" className="text-sm">
            Dữ liệu cập nhật {dateRangeLabel}
          </Text>
        </div>
        <Segmented
          value={dateRange}
          onChange={(v) => setDateRange(v as DateRangeOption)}
          options={[
            { label: 'Tháng này', value: 'month' },
            { label: 'Quý này', value: 'quarter' },
            { label: 'Năm', value: 'year' },
          ]}
        />
      </div>

      {/* ═══ KPI ROW ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KPICard
          title={`Đơn hàng ${dateRangeLabel}`}
          value={kpis?.ordersThisPeriod || 0}
          icon={<ShoppingBag size={20} />}
          trend={ordersTrend !== 0 ? { value: ordersTrend, label: 'vs kỳ trước' } : undefined}
          color={PRIMARY}
        />
        <KPICard
          title={`Doanh thu ${dateRangeLabel}`}
          value={formatUSD(kpis?.revenueThisPeriod || 0)}
          icon={<TrendingUp size={20} />}
          color="#2D8B6E"
        />
        <KPICard
          title="Số lượng xuất"
          value={formatTons(kpis?.quantityTons || 0)}
          icon={<Package size={20} />}
          color="#3B82F6"
        />
        <KPICard
          title="Đơn đang xử lý"
          value={kpis?.processingOrders || 0}
          icon={<Clock size={20} />}
          color="#F97316"
        />
        <KPICard
          title="Giao đúng hạn"
          value={kpis?.onTimeRate || 0}
          suffix="%"
          icon={<CheckCircle size={20} />}
          color="#22C55E"
        />
      </div>

      {/* ═══ CHARTS ROW ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title={<span className="text-sm font-semibold" style={{ color: PRIMARY }}>Doanh thu theo tháng</span>}
          size="small"
        >
          <BarChart data={monthlyRevenue} />
        </Card>
        <Card
          title={<span className="text-sm font-semibold" style={{ color: PRIMARY }}>Phân bố theo Grade</span>}
          size="small"
        >
          <PieChart data={gradeDistribution} />
        </Card>
      </div>

      {/* ═══ PIPELINE ═══ */}
      <Card
        title={<span className="text-sm font-semibold" style={{ color: PRIMARY }}>Pipeline đơn hàng</span>}
        size="small"
      >
        <PipelineFunnel data={pipeline} />
      </Card>

      {/* ═══ TABLES ROW ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card
          title={<span className="text-sm font-semibold" style={{ color: PRIMARY }}>Đơn hàng gần đây</span>}
          size="small"
          extra={
            <a
              onClick={() => navigate('/sales/orders')}
              className="text-xs cursor-pointer"
              style={{ color: SECONDARY }}
            >
              Xem tất cả →
            </a>
          }
        >
          <Table
            columns={orderColumns}
            dataSource={recentOrders}
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ x: 600 }}
          />
        </Card>
        <Card
          title={<span className="text-sm font-semibold" style={{ color: PRIMARY }}>Top khách hàng</span>}
          size="small"
          extra={
            <a
              onClick={() => navigate('/sales/customers')}
              className="text-xs cursor-pointer"
              style={{ color: SECONDARY }}
            >
              Xem tất cả →
            </a>
          }
        >
          <Table
            columns={customerColumns}
            dataSource={topCustomers}
            rowKey="customer_id"
            size="small"
            pagination={false}
          />
        </Card>
      </div>
    </div>
  )
}
