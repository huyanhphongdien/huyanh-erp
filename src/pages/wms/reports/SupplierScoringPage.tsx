// ============================================================================
// SUPPLIER SCORING DASHBOARD
// File: src/pages/wms/reports/SupplierScoringPage.tsx
// Module: Kho (WMS) - Huy Anh Rubber ERP
// Phase 10: Chấm điểm nhà cung cấp
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
  Progress,
} from 'antd'
import {
  ReloadOutlined,
  ArrowLeftOutlined,
  TrophyOutlined,
  RiseOutlined,
  FallOutlined,
  StarFilled,
} from '@ant-design/icons'
import supplierScoringService, {
  type SupplierScore,
  type SupplierDetail,
} from '../../../services/wms/supplierScoringService'

const { Title, Text } = Typography

// ============================================================================
// CONSTANTS
// ============================================================================

const GRADE_COLORS: Record<string, string> = {
  A: '#16A34A',
  B: '#2563EB',
  C: '#F59E0B',
  D: '#DC2626',
  F: '#7F1D1D',
}

const GRADE_BG: Record<string, string> = {
  A: '#f0fdf4',
  B: '#eff6ff',
  C: '#fffbeb',
  D: '#fef2f2',
  F: '#fef2f2',
}

// ============================================================================
// SVG LINE CHART — DRC Trend
// ============================================================================

function DRCTrendChart({ data }: { data: Array<{ date: string; drc: number }> }) {
  if (!data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu DRC" />

  const width = 500
  const height = 160
  const padding = { top: 20, right: 20, bottom: 30, left: 45 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const values = data.map(d => d.drc)
  const minV = Math.floor(Math.min(...values) - 1)
  const maxV = Math.ceil(Math.max(...values) + 1)
  const range = maxV - minV || 1

  const points = data.map((d, i) => {
    const x = padding.left + (data.length > 1 ? (i / (data.length - 1)) * chartW : chartW / 2)
    const y = padding.top + chartH - ((d.drc - minV) / range) * chartH
    return { x, y, ...d }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(pct => {
        const y = padding.top + chartH - chartH * pct
        const val = (minV + range * pct).toFixed(1)
        return (
          <g key={pct}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f0f0f0" strokeWidth={1} />
            <text x={padding.left - 6} y={y + 4} textAnchor="end" style={{ fontSize: 9, fill: '#aaa' }}>
              {val}%
            </text>
          </g>
        )
      })}
      {/* Line */}
      <path d={linePath} fill="none" stroke="#1B4D3E" strokeWidth={2} />
      {/* Points */}
      {points.map((p, i) => (
        <Tooltip key={i} title={`${p.date}: DRC ${p.drc}%`}>
          <circle cx={p.x} cy={p.y} r={3} fill="#1B4D3E" stroke="#fff" strokeWidth={1.5} style={{ cursor: 'pointer' }} />
        </Tooltip>
      ))}
      {/* X labels (show first, mid, last) */}
      {points.length > 0 && [0, Math.floor(points.length / 2), points.length - 1]
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .map(idx => (
          <text key={idx} x={points[idx].x} y={height - 5} textAnchor="middle" style={{ fontSize: 9, fill: '#888' }}>
            {points[idx].date.slice(5)}
          </text>
        ))}
    </svg>
  )
}

// ============================================================================
// SVG BAR CHART — Monthly Volume
// ============================================================================

function MonthlyVolumeChart({ data }: { data: Array<{ month: string; weight_kg: number }> }) {
  if (!data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu" />

  const maxWeight = Math.max(...data.map(d => d.weight_kg), 1)
  const barWidth = 40
  const gap = 8
  const chartH = 120
  const totalW = data.length * (barWidth + gap) - gap + 50
  const svgH = chartH + 30

  return (
    <svg width="100%" height={svgH} viewBox={`0 0 ${totalW} ${svgH}`} preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const x = 40 + i * (barWidth + gap)
        const h = maxWeight > 0 ? (d.weight_kg / maxWeight) * chartH : 0
        const y = chartH - h

        return (
          <g key={d.month}>
            <Tooltip title={`${d.month}: ${(d.weight_kg / 1000).toFixed(1)}T`}>
              <rect x={x} y={y} width={barWidth} height={Math.max(h, 1)} rx={4}
                fill="#1B4D3E" style={{ cursor: 'pointer' }} />
            </Tooltip>
            {d.weight_kg > 0 && (
              <text x={x + barWidth / 2} y={y - 4} textAnchor="middle"
                style={{ fontSize: 9, fill: '#1B4D3E', fontWeight: 600 }}>
                {(d.weight_kg / 1000).toFixed(1)}T
              </text>
            )}
            <text x={x + barWidth / 2} y={chartH + 14} textAnchor="middle"
              style={{ fontSize: 9, fill: '#888' }}>
              {d.month.slice(2)}
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

const SupplierScoringPage = () => {
  const navigate = useNavigate()
  const [scores, setScores] = useState<SupplierScore[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Expanded row detail
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null)
  const [supplierDetail, setSupplierDetail] = useState<SupplierDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // --------------------------------------------------------------------------
  // DATA LOADING
  // --------------------------------------------------------------------------

  const loadData = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)

      const data = await supplierScoringService.getRanking()
      setScores(data)
    } catch (err: any) {
      console.error('Supplier Scoring load error:', err)
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
  // EXPAND ROW — LOAD DETAIL
  // --------------------------------------------------------------------------

  const handleExpand = useCallback(async (expanded: boolean, record: SupplierScore) => {
    if (!expanded) {
      setExpandedSupplier(null)
      setSupplierDetail(null)
      return
    }
    setExpandedSupplier(record.supplier_name)
    setDetailLoading(true)
    try {
      const detail = await supplierScoringService.getSupplierDetail(record.supplier_name)
      setSupplierDetail(detail)
    } catch (err: any) {
      console.error('Load supplier detail error:', err)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  // --------------------------------------------------------------------------
  // COMPUTED
  // --------------------------------------------------------------------------

  const totalSuppliers = scores.length
  const avgScore = totalSuppliers > 0
    ? Math.round(scores.reduce((s, sc) => s + sc.overall_score, 0) / totalSuppliers * 10) / 10
    : 0
  const gradeACount = scores.filter(s => s.grade === 'A').length
  const gradeFCount = scores.filter(s => s.grade === 'F').length

  // --------------------------------------------------------------------------
  // LOADING
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', paddingTop: 100 }}>
        <Spin size="large" />
        <div style={{ marginTop: 12, color: '#999' }}>Đang tải dữ liệu chấm điểm NCC...</div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // COLUMNS
  // --------------------------------------------------------------------------

  const columns = [
    {
      title: '#',
      key: 'rank',
      width: 50,
      render: (_: any, __: any, index: number) => (
        <Text strong style={{
          fontFamily: "'JetBrains Mono', monospace",
          color: index < 3 ? '#F59E0B' : '#888',
        }}>
          {index < 3 ? <StarFilled style={{ color: '#F59E0B', marginRight: 4 }} /> : null}
          {index + 1}
        </Text>
      ),
    },
    {
      title: 'Nhà cung cấp',
      dataIndex: 'supplier_name',
      key: 'supplier_name',
      render: (v: string) => <Text strong style={{ fontSize: 13 }}>{v}</Text>,
    },
    {
      title: 'Lô',
      dataIndex: 'total_batches',
      key: 'total_batches',
      align: 'center' as const,
      width: 70,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v}</Text>
      ),
    },
    {
      title: 'KL (T)',
      key: 'total_weight',
      align: 'right' as const,
      width: 90,
      render: (_: any, r: SupplierScore) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {(r.total_weight_kg / 1000).toFixed(1)}
        </Text>
      ),
    },
    {
      title: 'DRC TB',
      dataIndex: 'avg_drc',
      key: 'avg_drc',
      align: 'right' as const,
      width: 80,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {v > 0 ? `${v}%` : '—'}
        </Text>
      ),
    },
    {
      title: 'Độ ổn định',
      dataIndex: 'consistency_score',
      key: 'consistency_score',
      align: 'center' as const,
      width: 130,
      sorter: (a: SupplierScore, b: SupplierScore) => a.consistency_score - b.consistency_score,
      render: (v: number) => (
        <Progress
          percent={Math.round(v)}
          size="small"
          strokeColor={v >= 75 ? '#16A34A' : v >= 50 ? '#F59E0B' : '#DC2626'}
          format={pct => <span style={{ fontSize: 11 }}>{pct}</span>}
        />
      ),
    },
    {
      title: 'Chất lượng',
      dataIndex: 'quality_score',
      key: 'quality_score',
      align: 'center' as const,
      width: 130,
      sorter: (a: SupplierScore, b: SupplierScore) => a.quality_score - b.quality_score,
      render: (v: number) => (
        <Progress
          percent={Math.round(v)}
          size="small"
          strokeColor={v >= 75 ? '#16A34A' : v >= 50 ? '#F59E0B' : '#DC2626'}
          format={pct => <span style={{ fontSize: 11 }}>{pct}</span>}
        />
      ),
    },
    {
      title: 'Tổng điểm',
      dataIndex: 'overall_score',
      key: 'overall_score',
      align: 'center' as const,
      width: 100,
      sorter: (a: SupplierScore, b: SupplierScore) => a.overall_score - b.overall_score,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => (
        <Text strong style={{
          fontSize: 16,
          fontFamily: "'JetBrains Mono', monospace",
          color: v >= 75 ? '#16A34A' : v >= 50 ? '#F59E0B' : '#DC2626',
        }}>
          {Math.round(v)}
        </Text>
      ),
    },
    {
      title: 'Hạng',
      dataIndex: 'grade',
      key: 'grade',
      align: 'center' as const,
      width: 70,
      render: (v: string) => (
        <Tag
          style={{
            background: GRADE_BG[v] || '#f5f5f5',
            color: GRADE_COLORS[v] || '#888',
            border: `1px solid ${GRADE_COLORS[v] || '#ddd'}`,
            fontWeight: 700,
            fontSize: 14,
            minWidth: 36,
            textAlign: 'center',
          }}
        >
          {v}
        </Tag>
      ),
    },
  ]

  // --------------------------------------------------------------------------
  // EXPANDED ROW
  // --------------------------------------------------------------------------

  const expandedRowRender = () => {
    if (detailLoading) {
      return <div style={{ padding: 24, textAlign: 'center' }}><Spin /> Đang tải chi tiết...</div>
    }
    if (!supplierDetail) {
      return <Empty description="Không tải được chi tiết" />
    }

    const { batches, drc_trend, monthly_volume } = supplierDetail

    return (
      <div style={{ padding: '8px 0' }}>
        <Row gutter={[16, 16]}>
          {/* DRC Trend */}
          <Col xs={24} md={12}>
            <Card size="small" title="Xu hướng DRC" bodyStyle={{ padding: 12 }}>
              <DRCTrendChart data={drc_trend} />
            </Card>
          </Col>
          {/* Monthly Volume */}
          <Col xs={24} md={12}>
            <Card size="small" title="Sản lượng theo tháng" bodyStyle={{ padding: 12 }}>
              <MonthlyVolumeChart data={monthly_volume} />
            </Card>
          </Col>
        </Row>
        {/* Batch list */}
        <Card size="small" title={`Danh sách lô (${batches.length})`} style={{ marginTop: 12 }} bodyStyle={{ padding: 0 }}>
          <Table
            dataSource={batches.slice(0, 20)}
            rowKey="batch_no"
            size="small"
            pagination={false}
            columns={[
              {
                title: 'Mã lô',
                dataIndex: 'batch_no',
                key: 'batch_no',
                render: (v: string) => (
                  <Text style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{v}</Text>
                ),
              },
              {
                title: 'Ngày',
                dataIndex: 'date',
                key: 'date',
                render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
              },
              {
                title: 'DRC (%)',
                dataIndex: 'drc',
                key: 'drc',
                align: 'right' as const,
                render: (v: number | null) => (
                  <Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                    {v ? `${v}%` : '—'}
                  </Text>
                ),
              },
              {
                title: 'KL (kg)',
                dataIndex: 'weight',
                key: 'weight',
                align: 'right' as const,
                render: (v: number) => (
                  <Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                    {v.toLocaleString()}
                  </Text>
                ),
              },
              {
                title: 'QC',
                dataIndex: 'qc_status',
                key: 'qc_status',
                align: 'center' as const,
                render: (v: string) => {
                  const colors: Record<string, string> = {
                    passed: 'green', warning: 'orange', failed: 'red',
                    pending: 'default', needs_blend: 'purple',
                  }
                  const labels: Record<string, string> = {
                    passed: 'Đạt', warning: 'Cảnh báo', failed: 'Không đạt',
                    pending: 'Chờ', needs_blend: 'Cần trộn',
                  }
                  return <Tag color={colors[v] || 'default'} style={{ fontSize: 11 }}>{labels[v] || v}</Tag>
                },
              },
            ]}
          />
          {batches.length > 20 && (
            <div style={{ padding: 8, textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Hiển thị 20/{batches.length} lô gần nhất
              </Text>
            </div>
          )}
        </Card>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/wms/reports')} type="text" />
            <div>
              <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
                <TrophyOutlined style={{ marginRight: 8 }} />
                Chấm điểm nhà cung cấp
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Đánh giá chất lượng, độ ổn định DRC của nhà cung cấp mủ cao su
              </Text>
            </div>
          </Space>
        </Col>
        <Col>
          <Button
            icon={<ReloadOutlined spin={refreshing} />}
            onClick={() => loadData(true)}
            loading={refreshing}
          >
            Làm mới
          </Button>
        </Col>
      </Row>

      {/* Error */}
      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)}
          style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
      )}

      {/* KPI Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Tổng NCC</Text>}
              value={totalSuppliers}
              valueStyle={{ color: '#1B4D3E', fontFamily: "'JetBrains Mono', monospace" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Score TB</Text>}
              value={avgScore}
              valueStyle={{ color: '#1B4D3E', fontFamily: "'JetBrains Mono', monospace" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>NCC hạng A</Text>}
              value={gradeACount}
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#16A34A', fontFamily: "'JetBrains Mono', monospace" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>NCC hạng F</Text>}
              value={gradeFCount}
              prefix={<FallOutlined />}
              valueStyle={{ color: gradeFCount > 0 ? '#DC2626' : '#16A34A', fontFamily: "'JetBrains Mono', monospace" }}
            />
          </Card>
        </Col>
      </Row>

      {/* Ranking Table */}
      <Card
        title={
          <Space>
            <TrophyOutlined style={{ color: '#F59E0B' }} />
            <span>Bảng xếp hạng nhà cung cấp</span>
          </Space>
        }
        bodyStyle={{ padding: 0 }}
      >
        {scores.length > 0 ? (
          <Table
            dataSource={scores}
            columns={columns}
            rowKey="supplier_name"
            size="small"
            pagination={scores.length > 20 ? { pageSize: 20, showSizeChanger: false } : false}
            expandable={{
              expandedRowRender: () => expandedRowRender(),
              expandedRowKeys: expandedSupplier ? [expandedSupplier] : [],
              onExpand: handleExpand,
              rowExpandable: () => true,
            }}
            rowClassName={(record) => {
              const bg = GRADE_BG[record.grade]
              return ''
            }}
            onRow={(record) => ({
              style: { background: GRADE_BG[record.grade] || 'transparent' },
            })}
          />
        ) : (
          <div style={{ padding: 48 }}>
            <Empty description="Chưa có dữ liệu nhà cung cấp" />
          </div>
        )}
      </Card>
    </div>
  )
}

export default SupplierScoringPage
