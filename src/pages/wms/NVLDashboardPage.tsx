// ============================================================================
// NVL DASHBOARD — Tổng quan bãi nguyên liệu
// File: src/pages/wms/NVLDashboardPage.tsx
// Ant Design + inline SVG charts, no external chart library
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Button,
  Space,
  Spin,
  Alert,
  Empty,
  Typography,
  Tooltip,
} from 'antd'
import {
  ReloadOutlined,
  PlusOutlined,
  ExperimentOutlined,
  EnvironmentOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  RightOutlined,
  LineChartOutlined,
} from '@ant-design/icons'
import { Layers } from 'lucide-react'
import nvlDashboardService, {
  type NVLOverview,
  type GradeDistItem,
  type DailyIntakeItem,
  type BatchesNeedingAction,
  type SupplierBreakdownItem,
} from '../../services/wms/nvlDashboardService'
import forecastService, { type GradeForecast } from '../../services/wms/forecastService'
import { RUBBER_GRADE_LABELS, RUBBER_GRADE_COLORS } from '../../services/wms/wms.types'
import type { RubberGrade } from '../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// SVG DONUT CHART — Phân bố Grade
// ============================================================================

const DONUT_COLORS = ['#16A34A', '#22C55E', '#F59E0B', '#DC2626', '#7C3AED', '#3B82F6', '#6B7280']

function DonutChart({ data }: { data: GradeDistItem[] }) {
  if (!data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu" />

  const total = data.reduce((s, d) => s + d.weight_kg, 0)
  const size = 200
  const cx = size / 2
  const cy = size / 2
  const outerR = 90
  const innerR = 55

  let cumulativePercent = 0
  const slices = data.map((item, i) => {
    const pct = total > 0 ? item.weight_kg / total : 0
    const startAngle = cumulativePercent * 2 * Math.PI - Math.PI / 2
    cumulativePercent += pct
    const endAngle = cumulativePercent * 2 * Math.PI - Math.PI / 2

    const gradeColor = RUBBER_GRADE_COLORS[item.grade as RubberGrade] || DONUT_COLORS[i % DONUT_COLORS.length]

    const largeArc = pct > 0.5 ? 1 : 0
    const x1o = cx + outerR * Math.cos(startAngle)
    const y1o = cy + outerR * Math.sin(startAngle)
    const x2o = cx + outerR * Math.cos(endAngle)
    const y2o = cy + outerR * Math.sin(endAngle)
    const x1i = cx + innerR * Math.cos(endAngle)
    const y1i = cy + innerR * Math.sin(endAngle)
    const x2i = cx + innerR * Math.cos(startAngle)
    const y2i = cy + innerR * Math.sin(startAngle)

    const d = [
      `M ${x1o} ${y1o}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2o} ${y2o}`,
      `L ${x1i} ${y1i}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2i} ${y2i}`,
      'Z',
    ].join(' ')

    return { d, color: gradeColor, grade: item.grade, pct, weight: item.weight_kg, count: item.count }
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => (
          <Tooltip key={i} title={`${RUBBER_GRADE_LABELS[s.grade as RubberGrade] || s.grade}: ${(s.weight / 1000).toFixed(1)}T (${s.count} lô)`}>
            <path d={s.d} fill={s.color} stroke="#fff" strokeWidth={2} style={{ cursor: 'pointer' }} />
          </Tooltip>
        ))}
        <text x={cx} y={cy - 8} textAnchor="middle" style={{ fontSize: 20, fontWeight: 700, fill: '#1B4D3E' }}>
          {(total / 1000).toFixed(1)}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontSize: 12, fill: '#888' }}>
          tấn
        </text>
      </svg>
      <div style={{ flex: 1 }}>
        {data.map((item, i) => {
          const color = RUBBER_GRADE_COLORS[item.grade as RubberGrade] || DONUT_COLORS[i % DONUT_COLORS.length]
          return (
            <div key={item.grade} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: color, flexShrink: 0 }} />
              <Text style={{ fontSize: 13, minWidth: 60 }}>
                {RUBBER_GRADE_LABELS[item.grade as RubberGrade] || item.grade}
              </Text>
              <Text style={{ fontSize: 12, color: '#888', fontFamily: "'JetBrains Mono', monospace" }}>
                {(item.weight_kg / 1000).toFixed(1)}T
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                ({item.percentage}%)
              </Text>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// SVG BAR CHART — Nhập kho 7 ngày
// ============================================================================

function BarChart({ data }: { data: DailyIntakeItem[] }) {
  if (!data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu" />

  const maxWeight = Math.max(...data.map(d => d.weight_kg), 1)
  const barWidth = 36
  const gap = 8
  const chartH = 160
  const labelH = 28
  const totalW = data.length * (barWidth + gap) - gap + 40
  const svgH = chartH + labelH + 10

  return (
    <svg width="100%" height={svgH} viewBox={`0 0 ${totalW} ${svgH}`} preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map(pct => {
        const y = chartH - chartH * pct
        return (
          <g key={pct}>
            <line x1={30} y1={y} x2={totalW} y2={y} stroke="#f0f0f0" strokeWidth={1} />
            <text x={26} y={y + 4} textAnchor="end" style={{ fontSize: 9, fill: '#aaa' }}>
              {((maxWeight * pct) / 1000).toFixed(1)}T
            </text>
          </g>
        )
      })}
      {/* Bars */}
      {data.map((d, i) => {
        const x = 34 + i * (barWidth + gap)
        const h = maxWeight > 0 ? (d.weight_kg / maxWeight) * chartH : 0
        const y = chartH - h
        const dayLabel = d.date.slice(8, 10) + '/' + d.date.slice(5, 7)

        return (
          <g key={d.date}>
            <Tooltip title={`${d.date}: ${(d.weight_kg / 1000).toFixed(1)}T (${d.batch_count} lô)`}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(h, 1)}
                rx={4}
                fill={d.weight_kg > 0 ? '#1B4D3E' : '#e5e7eb'}
                style={{ cursor: 'pointer' }}
              />
            </Tooltip>
            {d.weight_kg > 0 && (
              <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" style={{ fontSize: 10, fill: '#1B4D3E', fontWeight: 600 }}>
                {(d.weight_kg / 1000).toFixed(1)}
              </text>
            )}
            <text x={x + barWidth / 2} y={chartH + 14} textAnchor="middle" style={{ fontSize: 10, fill: '#888' }}>
              {dayLabel}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ============================================================================
// COMPONENT
// ============================================================================

const NVLDashboardPage = () => {
  const navigate = useNavigate()

  const [overview, setOverview] = useState<NVLOverview | null>(null)
  const [gradeDist, setGradeDist] = useState<GradeDistItem[]>([])
  const [dailyIntake, setDailyIntake] = useState<DailyIntakeItem[]>([])
  const [actionBatches, setActionBatches] = useState<BatchesNeedingAction | null>(null)
  const [supplierBreakdown, setSupplierBreakdown] = useState<SupplierBreakdownItem[]>([])
  const [forecastData, setForecastData] = useState<GradeForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --------------------------------------------------------------------------
  // DATA LOADING
  // --------------------------------------------------------------------------

  const loadData = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)

      const [ov, gd, di, ab, sb, fc] = await Promise.all([
        nvlDashboardService.getOverview(),
        nvlDashboardService.getGradeDistribution(),
        nvlDashboardService.getDailyIntake(7),
        nvlDashboardService.getBatchesNeedingAction(),
        nvlDashboardService.getSupplierBreakdown(10),
        forecastService.forecastByGrade().catch(() => [] as GradeForecast[]),
      ])

      setOverview(ov)
      setGradeDist(gd)
      setDailyIntake(di)
      setActionBatches(ab)
      setSupplierBreakdown(sb)
      setForecastData(fc)
    } catch (err: any) {
      console.error('NVL Dashboard load error:', err)
      setError(err.message || 'Lỗi tải dữ liệu')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // --------------------------------------------------------------------------
  // LOADING
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', paddingTop: 100 }}>
        <Spin size="large" />
        <div style={{ marginTop: 12, color: '#999' }}>Đang tải dữ liệu bãi NVL...</div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // READY BATCH COUNT
  // --------------------------------------------------------------------------

  const readyCount = actionBatches?.ready_for_production?.length || 0

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div style={{ padding: 24 }}>

      {/* ===== HEADER ===== */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <Layers size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Tổng quan bãi nguyên liệu
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Cập nhật: {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </Col>
        <Col>
          <Space>
            <Button
              icon={<ReloadOutlined spin={refreshing} />}
              onClick={() => loadData(true)}
              loading={refreshing}
            >
              Làm mới
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/wms/stock-in/new')}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
              Nhập kho mới
            </Button>
            <Button icon={<EnvironmentOutlined />} onClick={() => navigate('/wms/yard-map')}>
              Bản đồ bãi
            </Button>
            <Button icon={<ExperimentOutlined />} onClick={() => navigate('/wms/qc')}>
              QC nhanh
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Error */}
      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
      )}

      {/* ===== KPI CARDS ===== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8} lg={4}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Tổng lô NVL</Text>}
              value={overview?.total_batches || 0}
              valueStyle={{ color: '#1B4D3E', fontFamily: "'JetBrains Mono', monospace" }}
              prefix={<Layers size={16} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Tổng trọng lượng (tấn)</Text>}
              value={overview?.total_weight_tons || 0}
              valueStyle={{ color: '#16A34A', fontSize: 28, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>DRC trung bình (%)</Text>}
              value={overview?.avg_drc || '—'}
              suffix={overview?.avg_drc ? '%' : ''}
              valueStyle={{ color: '#1B4D3E', fontFamily: "'JetBrains Mono', monospace" }}
              prefix={<ExperimentOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bodyStyle={{ padding: 16 }}
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/wms/qc')}
          >
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Chờ QC</Text>}
              value={overview?.pending_qc || 0}
              valueStyle={{
                color: (overview?.pending_qc || 0) > 0 ? '#F59E0B' : '#16A34A',
                fontFamily: "'JetBrains Mono', monospace",
              }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bodyStyle={{ padding: 16 }}
            style={{ cursor: 'pointer', borderColor: (overview?.batches_over_30_days || 0) > 0 ? '#F59E0B' : undefined }}
          >
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Lưu kho &gt; 30 ngày</Text>}
              value={overview?.batches_over_30_days || 0}
              valueStyle={{
                color: (overview?.batches_over_30_days || 0) > 0 ? '#F59E0B' : '#16A34A',
                fontFamily: "'JetBrains Mono', monospace",
              }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Sẵn sàng SX</Text>}
              value={readyCount}
              valueStyle={{ color: '#16A34A', fontFamily: "'JetBrains Mono', monospace" }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* ===== CHARTS ROW ===== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card
            title={<Space><ExperimentOutlined /> Phân bố Grade</Space>}
            size="small"
            bodyStyle={{ padding: 16 }}
          >
            <DonutChart data={gradeDist} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={<Space><Layers size={14} /> Nhập kho 7 ngày</Space>}
            size="small"
            bodyStyle={{ padding: 16 }}
          >
            <BarChart data={dailyIntake} />
          </Card>
        </Col>
      </Row>

      {/* ===== ACTION LISTS ===== */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Left — Cần xử lý */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <WarningOutlined style={{ color: '#F59E0B' }} />
                <span>Cần xử lý</span>
              </Space>
            }
            size="small"
            bodyStyle={{ padding: 0 }}
          >
            {/* Lô chờ QC */}
            {(actionBatches?.pending_qc?.length || 0) > 0 && (
              <>
                <div style={{ padding: '8px 16px', background: '#fefce8', borderBottom: '1px solid #f0f0f0' }}>
                  <Text strong style={{ fontSize: 12, color: '#F59E0B' }}>
                    Lô chờ QC ({actionBatches!.pending_qc.length})
                  </Text>
                </div>
                <Table
                  dataSource={actionBatches!.pending_qc.slice(0, 5)}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  showHeader={false}
                  onRow={(record) => ({
                    onClick: () => navigate(`/wms/qc/batch/${record.id}`),
                    style: { cursor: 'pointer' },
                  })}
                  columns={[
                    {
                      key: 'batch_no',
                      render: (_, r) => <Text style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{r.batch_no}</Text>,
                    },
                    {
                      key: 'supplier',
                      render: (_, r) => <Text type="secondary" style={{ fontSize: 12 }}>{r.supplier_name}</Text>,
                    },
                    {
                      key: 'weight',
                      align: 'right' as const,
                      render: (_, r) => <Text style={{ fontSize: 12 }}>{r.weight.toLocaleString()} kg</Text>,
                    },
                    {
                      key: 'days',
                      align: 'right' as const,
                      render: (_, r) => (
                        <Tag color={r.days > 7 ? 'red' : r.days > 3 ? 'orange' : 'default'} style={{ fontSize: 11 }}>
                          {r.days}d
                        </Tag>
                      ),
                    },
                    {
                      key: 'action',
                      width: 30,
                      render: () => <RightOutlined style={{ fontSize: 10, color: '#ccc' }} />,
                    },
                  ]}
                />
              </>
            )}

            {/* Lô QC không đạt */}
            {(actionBatches?.failed_qc?.length || 0) > 0 && (
              <>
                <div style={{ padding: '8px 16px', background: '#fef2f2', borderBottom: '1px solid #f0f0f0', borderTop: '1px solid #f0f0f0' }}>
                  <Text strong style={{ fontSize: 12, color: '#DC2626' }}>
                    QC không đạt ({actionBatches!.failed_qc.length})
                  </Text>
                </div>
                <Table
                  dataSource={actionBatches!.failed_qc.slice(0, 5)}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  showHeader={false}
                  onRow={(record) => ({
                    onClick: () => navigate(`/wms/qc/batch/${record.id}`),
                    style: { cursor: 'pointer' },
                  })}
                  columns={[
                    {
                      key: 'batch_no',
                      render: (_, r) => <Text style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{r.batch_no}</Text>,
                    },
                    {
                      key: 'drc',
                      render: (_, r) => <Text style={{ fontSize: 12 }}>DRC: {r.latest_drc}%</Text>,
                    },
                    {
                      key: 'status',
                      render: (_, r) => <Tag color="red" style={{ fontSize: 11 }}>{r.qc_status === 'needs_blend' ? 'Cần trộn' : 'Không đạt'}</Tag>,
                    },
                    {
                      key: 'action',
                      width: 30,
                      render: () => <RightOutlined style={{ fontSize: 10, color: '#ccc' }} />,
                    },
                  ]}
                />
              </>
            )}

            {/* Lưu kho lâu */}
            {(actionBatches?.long_storage?.length || 0) > 0 && (
              <>
                <div style={{ padding: '8px 16px', background: '#fffbeb', borderBottom: '1px solid #f0f0f0', borderTop: '1px solid #f0f0f0' }}>
                  <Text strong style={{ fontSize: 12, color: '#D97706' }}>
                    Lưu kho lâu &gt; 30 ngày ({actionBatches!.long_storage.length})
                  </Text>
                </div>
                <Table
                  dataSource={actionBatches!.long_storage.slice(0, 5)}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  showHeader={false}
                  onRow={(record) => ({
                    onClick: () => navigate(`/wms/qc/batch/${record.id}`),
                    style: { cursor: 'pointer' },
                  })}
                  columns={[
                    {
                      key: 'batch_no',
                      render: (_, r) => <Text style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{r.batch_no}</Text>,
                    },
                    {
                      key: 'days',
                      render: (_, r) => (
                        <Tag color={r.days > 60 ? 'red' : 'orange'} style={{ fontSize: 11 }}>
                          {r.days} ngày
                        </Tag>
                      ),
                    },
                    {
                      key: 'weight',
                      align: 'right' as const,
                      render: (_, r) => <Text style={{ fontSize: 12 }}>{r.weight.toLocaleString()} kg</Text>,
                    },
                    {
                      key: 'action',
                      width: 30,
                      render: () => <RightOutlined style={{ fontSize: 10, color: '#ccc' }} />,
                    },
                  ]}
                />
              </>
            )}

            {/* Empty state */}
            {!(actionBatches?.pending_qc?.length) && !(actionBatches?.failed_qc?.length) && !(actionBatches?.long_storage?.length) && (
              <div style={{ padding: 24 }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có lô nào cần xử lý" />
              </div>
            )}
          </Card>
        </Col>

        {/* Right — Sẵn sàng sản xuất */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <CheckCircleOutlined style={{ color: '#16A34A' }} />
                <span>Sẵn sàng sản xuất ({readyCount})</span>
              </Space>
            }
            size="small"
            bodyStyle={{ padding: 0 }}
          >
            {readyCount > 0 ? (
              <Table
                dataSource={actionBatches!.ready_for_production.slice(0, 10)}
                rowKey="id"
                size="small"
                pagination={false}
                onRow={(record) => ({
                  onClick: () => navigate(`/wms/stock-out/new?batch=${record.id}`),
                  style: { cursor: 'pointer' },
                })}
                columns={[
                  {
                    title: 'Mã lô',
                    key: 'batch_no',
                    render: (_, r) => (
                      <Text style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{r.batch_no}</Text>
                    ),
                  },
                  {
                    title: 'Grade',
                    key: 'grade',
                    render: (_, r) => {
                      const label = RUBBER_GRADE_LABELS[r.grade as RubberGrade] || r.grade
                      const color = RUBBER_GRADE_COLORS[r.grade as RubberGrade] || '#6B7280'
                      return <Tag color={color} style={{ fontSize: 11 }}>{label}</Tag>
                    },
                  },
                  {
                    title: 'DRC',
                    key: 'drc',
                    align: 'right' as const,
                    render: (_, r) => (
                      <Text style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                        {r.drc}%
                      </Text>
                    ),
                  },
                  {
                    title: 'Trọng lượng',
                    key: 'weight',
                    align: 'right' as const,
                    render: (_, r) => (
                      <Text style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                        {r.weight.toLocaleString()} kg
                      </Text>
                    ),
                  },
                  {
                    key: 'action',
                    width: 40,
                    render: () => (
                      <Button type="link" size="small" style={{ color: '#1B4D3E', fontSize: 11 }}>
                        Xuất kho
                      </Button>
                    ),
                  },
                ]}
              />
            ) : (
              <div style={{ padding: 24 }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có lô sẵn sàng" />
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ===== SUPPLIER BREAKDOWN ===== */}
      <Card
        title={
          <Space>
            <Layers size={14} />
            <span>Top đại lý theo trọng lượng</span>
          </Space>
        }
        size="small"
      >
        {supplierBreakdown.length > 0 ? (
          <Table
            dataSource={supplierBreakdown}
            rowKey="supplier_name"
            size="small"
            pagination={false}
            columns={[
              {
                title: 'Đại lý',
                dataIndex: 'supplier_name',
                key: 'supplier_name',
                render: (v: string) => <Text strong style={{ fontSize: 13 }}>{v}</Text>,
              },
              {
                title: 'Số lô',
                dataIndex: 'batch_count',
                key: 'batch_count',
                align: 'center' as const,
                render: (v: number) => <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v}</Text>,
              },
              {
                title: 'Trọng lượng (kg)',
                dataIndex: 'total_weight_kg',
                key: 'total_weight_kg',
                align: 'right' as const,
                sorter: (a: SupplierBreakdownItem, b: SupplierBreakdownItem) => a.total_weight_kg - b.total_weight_kg,
                defaultSortOrder: 'descend' as const,
                render: (v: number) => (
                  <Text style={{ fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
                    {v.toLocaleString()}
                  </Text>
                ),
              },
              {
                title: 'Trọng lượng (T)',
                key: 'weight_tons',
                align: 'right' as const,
                render: (_: any, r: SupplierBreakdownItem) => (
                  <Text style={{ fontFamily: "'JetBrains Mono', monospace", color: '#1B4D3E' }}>
                    {(r.total_weight_kg / 1000).toFixed(1)}
                  </Text>
                ),
              },
              {
                title: 'DRC TB (%)',
                dataIndex: 'avg_drc',
                key: 'avg_drc',
                align: 'right' as const,
                render: (v: number) => (
                  <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {v > 0 ? `${v}%` : '—'}
                  </Text>
                ),
              },
              {
                title: 'Tỷ trọng',
                key: 'bar',
                width: 150,
                render: (_: any, r: SupplierBreakdownItem) => {
                  const maxW = supplierBreakdown[0]?.total_weight_kg || 1
                  const pct = Math.round((r.total_weight_kg / maxW) * 100)
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#f0f0f0' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: '#1B4D3E' }} />
                      </div>
                      <Text type="secondary" style={{ fontSize: 11, minWidth: 30, textAlign: 'right' }}>{pct}%</Text>
                    </div>
                  )
                },
              },
            ]}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu đại lý" />
        )}
      </Card>

      {/* ===== DỰ BÁO TỒN KHO ===== */}
      <Card
        title={
          <Space>
            <LineChartOutlined style={{ color: '#7C3AED' }} />
            <span>Dự báo tồn kho</span>
          </Space>
        }
        size="small"
        style={{ marginTop: 16 }}
      >
        {forecastData.length > 0 ? (
          <Table
            dataSource={forecastData}
            rowKey="grade"
            size="small"
            pagination={false}
            columns={[
              {
                title: 'Grade',
                dataIndex: 'grade',
                key: 'grade',
                render: (v: string) => {
                  const label = RUBBER_GRADE_LABELS[v as RubberGrade] || v
                  const color = RUBBER_GRADE_COLORS[v as RubberGrade] || '#6B7280'
                  return <Tag color={color} style={{ fontSize: 11 }}>{label}</Tag>
                },
              },
              {
                title: 'Tồn hiện tại (kg)',
                dataIndex: 'current_stock_kg',
                key: 'current_stock_kg',
                align: 'right' as const,
                render: (v: number) => (
                  <Text style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                    {v.toLocaleString()}
                  </Text>
                ),
              },
              {
                title: 'Tiêu thụ TB/ngày (kg)',
                dataIndex: 'avg_daily_consumption_kg',
                key: 'avg_daily_consumption_kg',
                align: 'right' as const,
                render: (v: number) => (
                  <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {v > 0 ? v.toLocaleString() : '—'}
                  </Text>
                ),
              },
              {
                title: 'Còn (ngày)',
                dataIndex: 'days_until_empty',
                key: 'days_until_empty',
                align: 'center' as const,
                render: (v: number | null, r: GradeForecast) => {
                  if (v === null) return <Text type="secondary">—</Text>
                  const color = r.recommendation === 'CRITICAL' ? '#DC2626'
                    : r.recommendation === 'LOW' ? '#F59E0B'
                    : '#16A34A'
                  return (
                    <Text strong style={{ fontFamily: "'JetBrains Mono', monospace", color }}>
                      {v}
                    </Text>
                  )
                },
              },
              {
                title: 'Dự kiến hết',
                dataIndex: 'forecast_date_empty',
                key: 'forecast_date_empty',
                render: (v: string | null) => (
                  <Text style={{ fontSize: 12 }}>
                    {v || '—'}
                  </Text>
                ),
              },
              {
                title: 'Trạng thái',
                dataIndex: 'recommendation',
                key: 'recommendation',
                align: 'center' as const,
                render: (v: string) => {
                  const map: Record<string, { color: string; label: string }> = {
                    OK: { color: 'green', label: 'Ổn' },
                    LOW: { color: 'orange', label: 'Thấp' },
                    CRITICAL: { color: 'red', label: 'Nguy hiểm' },
                    NO_DATA: { color: 'default', label: 'Không có dữ liệu' },
                  }
                  const item = map[v] || map.NO_DATA
                  return <Tag color={item.color} style={{ fontSize: 11 }}>{item.label}</Tag>
                },
              },
            ]}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu dự báo" />
        )}
      </Card>
    </div>
  )
}

export default NVLDashboardPage
