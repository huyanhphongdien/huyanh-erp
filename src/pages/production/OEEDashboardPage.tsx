// ============================================================================
// OEE DASHBOARD — Overall Equipment Effectiveness
// File: src/pages/production/OEEDashboardPage.tsx
// OEE = Availability × Performance × Quality
// ============================================================================

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, Row, Col, Statistic, Typography, Button, Select, Spin, Empty, Tag } from 'antd'
import {
  ArrowLeftOutlined, DashboardOutlined, BarChartOutlined,
} from '@ant-design/icons'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import { shiftReportService } from '../../services/production/shiftReportService'
import { downtimeService, REASON_CATEGORIES } from '../../services/production/downtimeService'

const { Text, Title } = Typography
const COLORS = ['#1B4D3E', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280']

export default function OEEDashboardPage() {
  const navigate = useNavigate()
  const now = new Date()
  const [period, setPeriod] = useState('month')

  const from = period === 'week'
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString().split('T')[0]
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const to = now.toISOString().split('T')[0]

  // OEE Summary
  const { data: oee, isLoading: loadingOEE } = useQuery({
    queryKey: ['oee-dashboard', from, to],
    queryFn: () => shiftReportService.getOEESummary(from, to),
  })

  // Shift reports for trend
  const { data: reports = [] } = useQuery({
    queryKey: ['oee-reports', from, to],
    queryFn: () => shiftReportService.getByRange(from, to),
  })

  // Downtime Pareto
  const { data: pareto = [] } = useQuery({
    queryKey: ['oee-pareto', from, to],
    queryFn: () => downtimeService.getPareto(from, to),
  })

  // OEE trend data (group by date)
  const trendData = (() => {
    const byDate: Record<string, { a: number[]; p: number[]; q: number[]; o: number[] }> = {}
    reports.forEach(r => {
      const d = r.report_date
      if (!byDate[d]) byDate[d] = { a: [], p: [], q: [], o: [] }
      if (r.oee_availability) byDate[d].a.push(r.oee_availability)
      if (r.oee_performance) byDate[d].p.push(r.oee_performance)
      if (r.oee_quality) byDate[d].q.push(r.oee_quality)
      if (r.oee_overall) byDate[d].o.push(r.oee_overall)
    })
    return Object.entries(byDate)
      .map(([date, v]) => ({
        date: new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        OEE: v.o.length > 0 ? Math.round(v.o.reduce((s, n) => s + n, 0) / v.o.length) : 0,
        Availability: v.a.length > 0 ? Math.round(v.a.reduce((s, n) => s + n, 0) / v.a.length) : 0,
        Performance: v.p.length > 0 ? Math.round(v.p.reduce((s, n) => s + n, 0) / v.p.length) : 0,
        Quality: v.q.length > 0 ? Math.round(v.q.reduce((s, n) => s + n, 0) / v.q.length) : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  })()

  // Pareto chart data
  const totalDowntimeMinutes = pareto.reduce((s, p) => s + p.total_minutes, 0)
  const paretoData = pareto.map(p => ({
    ...p,
    percent: totalDowntimeMinutes > 0 ? Math.round(p.total_minutes / totalDowntimeMinutes * 100) : 0,
  }))

  const oeeColor = (v: number) => v >= 85 ? '#52c41a' : v >= 60 ? '#fa8c16' : '#ef4444'

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} />
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <DashboardOutlined /> OEE Dashboard
          </Title>
        </div>
        <Select value={period} onChange={setPeriod} style={{ width: 140 }}
          options={[{ value: 'week', label: '7 ngày' }, { value: 'month', label: 'Tháng này' }]} />
      </div>

      {/* OEE KPI Cards */}
      {loadingOEE ? <Spin /> : oee && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={6}>
            <Card style={{ borderRadius: 12, borderTop: `4px solid ${oeeColor(oee.avg_oee)}` }}>
              <Statistic title="OEE Tổng" value={oee.avg_oee} suffix="%" valueStyle={{ fontSize: 32, fontWeight: 800, color: oeeColor(oee.avg_oee) }} />
              <Text type="secondary" style={{ fontSize: 12 }}>{oee.report_count} ca báo cáo</Text>
            </Card>
          </Col>
          <Col xs={6}>
            <Card style={{ borderRadius: 12, borderTop: '4px solid #3b82f6' }}>
              <Statistic title="Availability" value={oee.avg_availability} suffix="%" valueStyle={{ fontSize: 28, color: '#3b82f6' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>(Thời gian chạy / Kế hoạch)</Text>
            </Card>
          </Col>
          <Col xs={6}>
            <Card style={{ borderRadius: 12, borderTop: '4px solid #8b5cf6' }}>
              <Statistic title="Performance" value={oee.avg_performance} suffix="%" valueStyle={{ fontSize: 28, color: '#8b5cf6' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>(SL thực tế / SL kế hoạch)</Text>
            </Card>
          </Col>
          <Col xs={6}>
            <Card style={{ borderRadius: 12, borderTop: '4px solid #10b981' }}>
              <Statistic title="Quality" value={oee.avg_quality} suffix="%" valueStyle={{ fontSize: 28, color: '#10b981' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>(Đạt chất lượng / Tổng)</Text>
            </Card>
          </Col>
        </Row>
      )}

      <Row gutter={16}>
        {/* OEE Trend */}
        <Col xs={24} lg={14}>
          <Card title={<><BarChartOutlined /> OEE Trend</>} style={{ borderRadius: 12, marginBottom: 16 }}>
            {trendData.length === 0 ? <Empty description="Chưa có dữ liệu báo cáo ca" /> : (
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    <Legend />
                    <Bar dataKey="OEE" fill="#1B4D3E" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Availability" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Performance" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Quality" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Col>

        {/* Downtime Pareto */}
        <Col xs={24} lg={10}>
          <Card title="🔧 Downtime Pareto" style={{ borderRadius: 12, marginBottom: 16 }}>
            {paretoData.length === 0 ? <Empty description="Chưa có sự cố" /> : (
              <>
                <div style={{ marginBottom: 12 }}>
                  <Text strong>Tổng downtime: {totalDowntimeMinutes} phút</Text>
                </div>
                {paretoData.map((p, i) => (
                  <div key={p.category} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13 }}>{p.label} ({p.count} lần)</Text>
                      <Text strong>{p.total_minutes} phút ({p.percent}%)</Text>
                    </div>
                    <div style={{ height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        width: `${p.percent}%`, height: '100%',
                        background: COLORS[i % COLORS.length], borderRadius: 4,
                      }} />
                    </div>
                  </div>
                ))}
              </>
            )}
          </Card>

          {/* OEE Formula */}
          <Card size="small" style={{ borderRadius: 12, background: '#f6ffed', border: '1px solid #b7eb8f' }}>
            <Text strong style={{ color: '#1B4D3E' }}>📐 Công thức OEE</Text>
            <div style={{ fontSize: 12, marginTop: 8, color: '#555', lineHeight: 1.8 }}>
              <strong>OEE = A × P × Q / 10000</strong><br />
              A = (Planned − Downtime) / Planned × 100<br />
              P = Actual Output / Planned Output × 100<br />
              Q = Passed Units / Total Units × 100<br /><br />
              🟢 ≥85% World Class &nbsp; 🟡 60-84% Typical &nbsp; 🔴 &lt;60% Cần cải thiện
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
