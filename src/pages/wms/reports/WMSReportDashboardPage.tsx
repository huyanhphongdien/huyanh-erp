// ============================================================================
// WMS REPORT DASHBOARD PAGE — Ant Design v6
// File: src/pages/wms/reports/WMSReportDashboardPage.tsx
// Phase: P10 - Báo cáo WMS
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Row, Col, Statistic, Button, Space, Typography,
  Spin, Empty, Progress, DatePicker, Divider,
} from 'antd'
import {
  ReloadOutlined, BarChartOutlined, ImportOutlined, ExportOutlined,
  ExperimentOutlined, PercentageOutlined, DatabaseOutlined,
  FileTextOutlined, TeamOutlined, LineChartOutlined,
  AppstoreOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import wmsReportService from '../../../services/wms/wmsReportService'
import type { DRCTrendReport } from '../../../services/wms/wms.types'
import { RUBBER_GRADE_COLORS } from '../../../services/wms/wms.types'
import type { RubberGrade } from '../../../services/wms/wms.types'
import GradeBadge from '../../../components/wms/GradeBadge'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

type KPIs = Awaited<ReturnType<typeof wmsReportService.getWMSSummaryKPIs>>

const WMSReportDashboardPage = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [kpis, setKpis] = useState<KPIs | null>(null)
  const [drcTrend, setDrcTrend] = useState<DRCTrendReport[]>([])
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ])

  const loadData = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true); else setLoading(true)
      const from_date = dateRange[0].format('YYYY-MM-DD')
      const to_date = dateRange[1].format('YYYY-MM-DD')
      const [k, trend] = await Promise.all([
        wmsReportService.getWMSSummaryKPIs({ from_date, to_date }),
        wmsReportService.getDRCTrendReport({ from_date, to_date }),
      ])
      setKpis(k)
      setDrcTrend(trend)
    } catch (err) {
      console.error('Load WMS report dashboard error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [dateRange])

  useEffect(() => { loadData() }, [loadData])

  // Grade distribution from KPIs
  const gradeEntries = kpis
    ? Object.entries(kpis.grade_distribution).sort((a, b) => b[1] - a[1])
    : []
  const totalGradeWeight = gradeEntries.reduce((s, [, w]) => s + w, 0)

  if (loading) return <div style={{ padding: 24, textAlign: 'center', paddingTop: 100 }}><Spin size="large" /></div>

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <BarChartOutlined style={{ marginRight: 8 }} />Báo cáo WMS
          </Title>
        </Col>
        <Col>
          <Space>
            <RangePicker
              value={dateRange}
              onChange={(vals) => {
                if (vals && vals[0] && vals[1]) setDateRange([vals[0], vals[1]])
              }}
              format="DD/MM/YYYY"
              size="small"
            />
            <Button icon={<ReloadOutlined spin={refreshing} />} onClick={() => loadData(true)}>Làm mới</Button>
          </Space>
        </Col>
      </Row>

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          { title: 'Nhập kho (kg)', value: kpis?.total_stock_in_kg || 0, color: '#16A34A', icon: <ImportOutlined /> },
          { title: 'Xuất kho (kg)', value: kpis?.total_stock_out_kg || 0, color: '#DC2626', icon: <ExportOutlined /> },
          { title: 'Sản xuất (kg)', value: kpis?.total_production_kg || 0, color: '#2563EB', icon: <ExperimentOutlined /> },
          { title: 'Yield TB', value: kpis?.avg_yield_percent || 0, color: '#E8A838', icon: <PercentageOutlined />, suffix: '%' },
          { title: 'DRC TB', value: kpis?.avg_drc || 0, color: '#1B4D3E', icon: <ExperimentOutlined />, suffix: '%' },
          { title: 'Lô hoạt động', value: kpis?.total_batches_active || 0, color: '#7C3AED', icon: <DatabaseOutlined /> },
        ].map((item, i) => (
          <Col xs={12} sm={8} lg={4} key={i}>
            <Card styles={{ body: { padding: 16 } }}>
              <Statistic
                title={item.title}
                value={item.value}
                suffix={item.suffix}
                valueStyle={{ color: item.color, fontFamily: "'JetBrains Mono'", fontSize: 20 }}
                prefix={item.icon}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {/* Grade Distribution */}
        <Col xs={24} lg={12}>
          <Card title={<Space><AppstoreOutlined /> Phân bố Grade (tồn kho)</Space>} size="small">
            {gradeEntries.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu" />
            ) : (
              gradeEntries.map(([grade, weight]) => {
                const pct = totalGradeWeight > 0 ? Math.round((weight / totalGradeWeight) * 100) : 0
                return (
                  <div key={grade} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <GradeBadge grade={grade as RubberGrade} size="small" />
                    <Progress percent={pct} size="small" style={{ flex: 1 }}
                      strokeColor={RUBBER_GRADE_COLORS[grade as RubberGrade] || '#6B7280'}
                      format={() => `${pct}%`} />
                    <Text type="secondary" style={{ fontSize: 11, fontFamily: "'JetBrains Mono'", minWidth: 60, textAlign: 'right' }}>
                      {(weight / 1000).toFixed(1)}T
                    </Text>
                  </div>
                )
              })
            )}
          </Card>
        </Col>

        {/* DRC Trend */}
        <Col xs={24} lg={12}>
          <Card title={<Space><LineChartOutlined /> DRC Trend</Space>} size="small">
            {drcTrend.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có dữ liệu" />
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 100, padding: '0 4px' }}>
                {drcTrend.map((item) => {
                  const maxDrc = Math.max(...drcTrend.map(d => d.avg_drc), 70)
                  const minDrc = Math.min(...drcTrend.map(d => d.avg_drc), 40)
                  const range = maxDrc - minDrc || 1
                  const height = Math.max(10, ((item.avg_drc - minDrc) / range) * 80)
                  return (
                    <div key={item.date} style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                      <div style={{
                        height, background: '#1B4D3E', borderRadius: 3, minWidth: 8,
                        margin: '0 auto', width: '80%', opacity: 0.8,
                      }} />
                      <Text style={{ fontSize: 8, fontFamily: "'JetBrains Mono'", display: 'block', marginTop: 2 }}>
                        {item.avg_drc}%
                      </Text>
                      <Text type="secondary" style={{ fontSize: 7 }}>
                        {item.date.substring(5)}
                      </Text>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Divider />

      {/* Quick Links */}
      <Title level={5} style={{ color: '#1B4D3E', marginBottom: 16 }}>Báo cáo chi tiết</Title>
      <Row gutter={[16, 16]}>
        {[
          { title: 'XNT — Xuất Nhập Tồn', desc: 'Báo cáo xuất nhập tồn theo ngày', icon: <FileTextOutlined />, path: '/wms/reports/stock-movement' },
          { title: 'Chất lượng đại lý', desc: 'Phân tích chất lượng theo đại lý cung cấp', icon: <TeamOutlined />, path: '/wms/reports/supplier-quality' },
          { title: 'Tồn kho theo vật liệu', desc: 'Giá trị tồn kho, dry weight, DRC', icon: <DatabaseOutlined />, path: '/wms/reports/inventory-value' },
        ].map((item, i) => (
          <Col xs={24} sm={12} lg={8} key={i}>
            <Card
              hoverable
              onClick={() => navigate(item.path)}
              styles={{ body: { padding: 20 } }}
            >
              <Space>
                <div style={{ fontSize: 24, color: '#1B4D3E' }}>{item.icon}</div>
                <div>
                  <Text strong>{item.title}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>{item.desc}</Text>
                </div>
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
}

export default WMSReportDashboardPage
