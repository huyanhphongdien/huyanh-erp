// ============================================================================
// INVENTORY DASHBOARD — Ant Design + Rubber KPIs
// File: src/pages/wms/InventoryDashboard.tsx
// Rewrite: Tailwind -> Ant Design v6, them rubber grade distribution, dry weight
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenTab } from '../../hooks/useOpenTab'
import { useFacilityFilter } from '../../stores/facilityFilterStore'
import { useActiveFacilities } from '../../hooks/useActiveFacilities'
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tag,
  Button,
  Space,
  Input,
  Select,
  Spin,
  Alert,
  Empty,
  Typography,
  Badge,
  Tooltip,
  Progress,
} from 'antd'
import {
  ReloadOutlined,
  PlusOutlined,
  ExportOutlined,
  InboxOutlined,
  WarningOutlined,
  BellOutlined,
  ExperimentOutlined,
  DashboardOutlined,
  SearchOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons'
import { inventoryService, type StockSummaryItem, type InventoryOverview } from '../../services/wms/inventoryService'
import { alertService, type StockAlert } from '../../services/wms/alertService'
import { supabase } from '../../lib/supabase'
import GradeBadge from '../../components/wms/GradeBadge'
import type { RubberGrade } from '../../services/wms/wms.types'
import { RUBBER_GRADE_LABELS, RUBBER_GRADE_COLORS } from '../../services/wms/wms.types'

const { Title, Text } = Typography

// ============================================================================
// TYPES
// ============================================================================

interface GradeDistribution {
  grade: string
  count: number
  total_weight: number
}

// ============================================================================
// COMPONENT
// ============================================================================

const COUNTRY_FLAG: Record<string, string> = { VN: '🇻🇳', LA: '🇱🇦' }

const InventoryDashboard = () => {
  const navigate = useNavigate()
  const openTab = useOpenTab()
  const { currentFacilityId } = useFacilityFilter()
  const { data: facilities = [] } = useActiveFacilities()

  const [overview, setOverview] = useState<InventoryOverview | null>(null)
  const [stockSummary, setStockSummary] = useState<StockSummaryItem[]>([])
  const [alerts, setAlerts] = useState<StockAlert[]>([])
  const [gradeDistribution, setGradeDistribution] = useState<GradeDistribution[]>([])
  const [avgDrc, setAvgDrc] = useState<number | null>(null)
  const [totalDryWeight, setTotalDryWeight] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterGrade, setFilterGrade] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)

  // --------------------------------------------------------------------------
  // DATA LOADING
  // --------------------------------------------------------------------------

  const loadData = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)

      const [overviewData, summaryData, alertsData] = await Promise.all([
        inventoryService.getOverview(),
        inventoryService.getStockSummary({ type: 'finished' }),
        alertService.checkAllAlerts(),
      ])

      setOverview(overviewData)
      setStockSummary(summaryData)
      setAlerts(alertsData)

      // Load rubber-specific data: grade distribution + avg DRC
      try {
        const { data: batches } = await supabase
          .from('stock_batches')
          .select('rubber_grade, latest_drc, quantity_remaining, initial_weight, current_weight')
          .eq('status', 'active')
          .gt('quantity_remaining', 0)

        if (batches && batches.length > 0) {
          // Grade distribution
          const gradeMap: Record<string, { count: number; total_weight: number }> = {}
          let drcWeightSum = 0
          let weightSum = 0
          let drySum = 0

          for (const b of batches) {
            const grade = b.rubber_grade || 'unknown'
            if (!gradeMap[grade]) gradeMap[grade] = { count: 0, total_weight: 0 }
            gradeMap[grade].count++
            gradeMap[grade].total_weight += b.quantity_remaining || 0

            if (b.latest_drc && b.quantity_remaining > 0) {
              drcWeightSum += b.latest_drc * b.quantity_remaining
              weightSum += b.quantity_remaining
              drySum += b.quantity_remaining * (b.latest_drc / 100)
            }
          }

          setGradeDistribution(
            Object.entries(gradeMap)
              .map(([grade, data]) => ({ grade, ...data }))
              .sort((a, b) => b.total_weight - a.total_weight)
          )
          setAvgDrc(weightSum > 0 ? Math.round((drcWeightSum / weightSum) * 100) / 100 : null)
          setTotalDryWeight(Math.round(drySum))
        }
      } catch (err) {
        console.error('Load rubber data error:', err)
      }
    } catch (err: any) {
      console.error('Dashboard load error:', err)
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
  // FILTERED DATA
  // --------------------------------------------------------------------------

  // F2: Khi chọn 1 nhà máy, lọc warehouse_breakdown và tính lại tổng theo facility đó.
  // Khi "Tất cả nhà máy", giữ nguyên dữ liệu gốc (sẽ có thêm cột pivot bên dưới).
  const scopedSummary = useMemo(() => {
    if (!currentFacilityId) return stockSummary
    return stockSummary
      .map(item => {
        const breakdown = item.warehouse_breakdown.filter(
          (w: any) => w.warehouse?.facility_id === currentFacilityId,
        )
        if (breakdown.length === 0) return null
        const total_quantity = breakdown.reduce((s, w) => s + (w.quantity || 0), 0)
        const total_weight = breakdown.reduce((s, w) => s + (w.weight || 0), 0)
        return { ...item, warehouse_breakdown: breakdown, total_quantity, total_weight }
      })
      .filter((x): x is StockSummaryItem => x !== null)
  }, [stockSummary, currentFacilityId])

  const filteredSummary = scopedSummary.filter(item => {
    if (searchText) {
      const s = searchText.toLowerCase()
      if (!item.material.name?.toLowerCase().includes(s) &&
          !item.material.sku?.toLowerCase().includes(s)) {
        return false
      }
    }
    if (filterStatus !== 'all' && item.stock_status !== filterStatus) return false
    return true
  })

  // F2: Cross-facility pivot — tính tổng TL mỗi nhà máy cho mỗi material (chỉ khi "Tất cả")
  const facilityPivot = useMemo(() => {
    if (currentFacilityId || facilities.length === 0) return null
    const pivot: Record<string, Record<string, number>> = {} // material_id → facility_id → weight
    for (const item of filteredSummary) {
      pivot[item.material_id] = {}
      for (const w of item.warehouse_breakdown as any[]) {
        const fid = w.warehouse?.facility_id
        if (!fid) continue
        pivot[item.material_id][fid] = (pivot[item.material_id][fid] || 0) + (w.weight || 0)
      }
    }
    return pivot
  }, [filteredSummary, currentFacilityId, facilities])

  const topAlerts = alerts.slice(0, 8)
  const highAlertCount = alerts.filter(a => a.severity === 'high').length

  // F2: KPI hiển thị tổng theo facility đang filter (nếu có), hoặc toàn công ty
  const displayOverview = useMemo(() => {
    if (!currentFacilityId) return overview
    const total_materials = scopedSummary.length
    const total_weight = scopedSummary.reduce((s, i) => s + (i.total_weight || 0), 0)
    const total_quantity = scopedSummary.reduce((s, i) => s + (i.total_quantity || 0), 0)
    return {
      ...(overview || { total_alerts: 0, low_stock_count: 0, expiring_soon_count: 0 } as any),
      total_materials, total_weight, total_quantity,
    }
  }, [overview, scopedSummary, currentFacilityId])

  const currentFacility = facilities.find(f => f.id === currentFacilityId)

  // --------------------------------------------------------------------------
  // TABLE COLUMNS
  // --------------------------------------------------------------------------

  // F2: Cột pivot per-facility chỉ khi không filter (tổng quan toàn công ty)
  const facilityPivotColumns = (!currentFacilityId && facilityPivot)
    ? facilities.map(f => ({
        title: (
          <Space size={4}>
            <span>{COUNTRY_FLAG[f.country || 'VN'] || '🏭'}</span>
            <span>{f.code}</span>
          </Space>
        ),
        key: `pivot-${f.id}`,
        align: 'right' as const,
        width: 90,
        render: (_: any, record: StockSummaryItem) => {
          const w = facilityPivot[record.material_id]?.[f.id] || 0
          if (w === 0) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
          return (
            <Text style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#1B4D3E' }}>
              {(w / 1000).toFixed(2)}
            </Text>
          )
        },
      }))
    : []

  const columns = [
    {
      title: 'Vật liệu',
      key: 'material',
      render: (_: any, record: StockSummaryItem) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{record.material.name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11 }}>{record.material.sku}</Text>
        </div>
      ),
    },
    {
      title: 'Tồn (kg)',
      dataIndex: 'total_quantity',
      key: 'total_quantity',
      align: 'right' as const,
      sorter: (a: StockSummaryItem, b: StockSummaryItem) => a.total_quantity - b.total_quantity,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
          {v.toLocaleString()}
        </Text>
      ),
    },
    {
      title: 'Tổng (T)',
      dataIndex: 'total_weight',
      key: 'total_weight',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {(v / 1000).toFixed(1)}
        </Text>
      ),
    },
    ...facilityPivotColumns,
    {
      title: 'Kho',
      key: 'warehouses',
      align: 'center' as const,
      render: (_: any, record: StockSummaryItem) => record.warehouse_breakdown.length,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'stock_status',
      key: 'stock_status',
      render: (status: string) => {
        const config: Record<string, { color: string; label: string }> = {
          normal: { color: 'success', label: 'Bình thường' },
          low: { color: 'error', label: 'Tồn thấp' },
          over: { color: 'warning', label: 'Vượt mức' },
          out_of_stock: { color: 'default', label: 'Hết hàng' },
        }
        const c = config[status] || config.normal
        return <Tag color={c.color}>{c.label}</Tag>
      },
    },
    {
      title: 'Min/Max',
      key: 'minmax',
      width: 120,
      render: (_: any, record: StockSummaryItem) => {
        if (!record.min_stock || record.min_stock <= 0) return <Text type="secondary">—</Text>
        const max = record.max_stock || record.min_stock * 3
        const pct = Math.min(100, (record.total_quantity / max) * 100)
        return (
          <Tooltip title={`Min: ${record.min_stock} / Max: ${record.max_stock || '—'}`}>
            <Progress
              percent={pct}
              size="small"
              showInfo={false}
              strokeColor={
                record.stock_status === 'low' || record.stock_status === 'out_of_stock' ? '#DC2626'
                : record.stock_status === 'over' ? '#F59E0B'
                : '#16A34A'
              }
            />
          </Tooltip>
        )
      },
    },
  ]

  // --------------------------------------------------------------------------
  // LOADING
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', paddingTop: 100 }}>
        <Spin size="large" />
        <div style={{ marginTop: 12, color: '#999' }}>Đang tải dữ liệu kho...</div>
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
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <DashboardOutlined style={{ marginRight: 8 }} />
            Kho Thành Phẩm
            {currentFacility && (
              <Tag color="green" style={{ marginLeft: 8, fontSize: 12 }}>
                {COUNTRY_FLAG[currentFacility.country || 'VN']} {currentFacility.name}
              </Tag>
            )}
            {!currentFacilityId && (
              <Tag color="blue" style={{ marginLeft: 8, fontSize: 12 }}>
                🏢 Tất cả nhà máy
              </Tag>
            )}
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
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
            >
              Nhập kho
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Error */}
      {error && (
        <Alert type="error" message={error} closable onClose={() => setError(null)} style={{ marginBottom: 16, borderRadius: 8 }} showIcon />
      )}

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8} lg={4}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Tổng lô</Text>}
              value={displayOverview?.total_materials || 0}
              valueStyle={{ color: '#1B4D3E', fontFamily: "'JetBrains Mono', monospace" }}
              prefix={<InboxOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Trọng lượng (T)</Text>}
              value={((displayOverview?.total_weight || 0) / 1000).toFixed(1)}
              valueStyle={{ color: '#1B4D3E', fontFamily: "'JetBrains Mono', monospace" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>TL kho / Dry (T)</Text>}
              value={(totalDryWeight / 1000).toFixed(1)}
              valueStyle={{ color: '#2D8B6E', fontFamily: "'JetBrains Mono', monospace" }}
              suffix={<Text type="secondary" style={{ fontSize: 11 }}>dry</Text>}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bodyStyle={{ padding: 16 }}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>DRC TB</Text>}
              value={avgDrc || '—'}
              suffix={avgDrc ? '%' : ''}
              valueStyle={{ color: '#1B4D3E', fontFamily: "'JetBrains Mono', monospace" }}
              prefix={<ExperimentOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={4}>
          <Card bodyStyle={{ padding: 16 }} style={{ cursor: 'pointer' }} onClick={() => navigate('/wms/alerts')}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>Cảnh báo</Text>}
              value={overview?.total_alerts || 0}
              valueStyle={{ color: highAlertCount > 0 ? '#DC2626' : '#16A34A', fontFamily: "'JetBrains Mono', monospace" }}
              prefix={<Badge count={highAlertCount} size="small"><BellOutlined /></Badge>}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Grade Distribution */}
        <Col xs={24} lg={10}>
          <Card
            title={<Space><ExperimentOutlined /> Phân bố Grade</Space>}
            size="small"
            bodyStyle={{ padding: 16 }}
          >
            {gradeDistribution.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu grade" />
            ) : (
              <div>
                {gradeDistribution.map(item => {
                  const totalWeight = gradeDistribution.reduce((s, g) => s + g.total_weight, 0)
                  const pct = totalWeight > 0 ? Math.round((item.total_weight / totalWeight) * 100) : 0
                  const gradeColor = RUBBER_GRADE_COLORS[item.grade as RubberGrade] || '#6B7280'

                  return (
                    <div key={item.grade} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <GradeBadge grade={item.grade as RubberGrade} size="small" />
                      <Progress
                        percent={pct}
                        size="small"
                        style={{ flex: 1 }}
                        strokeColor={gradeColor}
                        format={() => `${pct}%`}
                      />
                      <Text type="secondary" style={{ fontSize: 11, minWidth: 60, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>
                        {(item.total_weight / 1000).toFixed(1)} T
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        ({item.count} lô)
                      </Text>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </Col>

        {/* Alerts */}
        <Col xs={24} lg={14}>
          <Card
            title={
              <Space>
                <BellOutlined />
                Cảnh báo ({alerts.length})
              </Space>
            }
            size="small"
            bodyStyle={{ padding: topAlerts.length > 0 ? 0 : 16, maxHeight: 300, overflow: 'auto' }}
            extra={alerts.length > 8 && (
              <Button type="link" size="small" onClick={() => navigate('/wms/alerts')}>Xem tất cả</Button>
            )}
          >
            {topAlerts.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có cảnh báo" />
            ) : (
              <div>
                {topAlerts.map(alert => (
                  <div
                    key={alert.id}
                    style={{
                      padding: '8px 16px',
                      borderBottom: '1px solid #f0f0f0',
                      borderLeft: `3px solid ${
                        alert.severity === 'high' ? '#DC2626'
                        : alert.severity === 'medium' ? '#F59E0B'
                        : '#3B82F6'
                      }`,
                    }}
                  >
                    <Text style={{ fontSize: 13 }}>{alert.message}</Text>
                    {alert.detail && (
                      <div><Text type="secondary" style={{ fontSize: 11 }}>{alert.detail}</Text></div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Quick Actions */}
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<ArrowDownOutlined />} onClick={() => navigate('/wms/stock-in/new')}
          style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
          Nhập kho
        </Button>
        <Button icon={<ArrowUpOutlined />} onClick={() => navigate('/wms/stock-out/new')}
          style={{ background: '#E8A838', borderColor: '#E8A838', color: 'white' }}>
          Xuất kho
        </Button>
        <Button icon={<ExperimentOutlined />} onClick={() => navigate('/wms/qc')}>QC Dashboard</Button>
        <Button onClick={() => navigate('/wms/stock-check')}>Kiểm kê</Button>
      </Space>

      {/* Stock Summary Table */}
      <Card
        title="Tồn kho theo vật liệu"
        extra={
          <Space>
            <Input.Search
              placeholder="Tìm tên, SKU..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              allowClear
              style={{ width: 200 }}
              size="small"
            />
            <Select
              value={filterStatus}
              onChange={setFilterStatus}
              size="small"
              style={{ width: 130 }}
              options={[
                { value: 'all', label: 'Tất cả TT' },
                { value: 'normal', label: 'Bình thường' },
                { value: 'low', label: 'Tồn thấp' },
                { value: 'over', label: 'Vượt mức' },
                { value: 'out_of_stock', label: 'Hết hàng' },
              ]}
            />
          </Space>
        }
      >
        <Table
          dataSource={filteredSummary}
          columns={columns}
          rowKey="material_id"
          size="small"
          scroll={{ x: 1200 }}
          pagination={{ showSizeChanger: true, showTotal: (t, r) => `${r[0]}-${r[1]} / ${t}` }}
          onRow={(record) => ({
            onClick: () => openTab({
              key: `inventory-${record.material_id}`,
              title: `Tồn: ${(record as any).material_name || record.material_id.slice(0, 8)}`,
              componentId: 'inventory-detail',
              props: { materialId: record.material_id },
              path: `/wms/inventory/${record.material_id}`,
            }),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    </div>
  )
}

export default InventoryDashboard
