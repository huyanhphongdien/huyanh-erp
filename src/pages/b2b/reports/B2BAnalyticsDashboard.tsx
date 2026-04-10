// ============================================================================
// B2B ANALYTICS DASHBOARD — Báo cáo B2B tổng hợp
// File: src/pages/b2b/reports/B2BAnalyticsDashboard.tsx
// Top đại lý, DRC variance, funnel conversion, settlement aging
// ============================================================================

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Card, Row, Col, Statistic, Table, Tag, Typography, Select, Spin, Empty, Progress,
} from 'antd'
import {
  TrophyOutlined, DollarOutlined, ExperimentOutlined, FunnelPlotOutlined,
  TeamOutlined, ArrowLeftOutlined, ClockCircleOutlined, BarChartOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { Button } from 'antd'
import { supabase } from '../../../lib/supabase'

const { Title, Text } = Typography

const MONTHS = ['', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12']

export default function B2BAnalyticsDashboard() {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())

  // ═══ Top đại lý theo doanh thu ═══
  const { data: topPartners = [], isLoading: loadingPartners } = useQuery({
    queryKey: ['b2b-top-partners', year],
    queryFn: async () => {
      const startDate = `${year}-01-01`
      const endDate = `${year}-12-31`
      const { data: deals } = await supabase
        .from('b2b_deals')
        .select('partner_id, total_value_vnd, quantity_kg, actual_drc, status')
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59')
        .not('status', 'eq', 'cancelled')
      if (!deals) return []

      const { data: partners } = await supabase
        .from('b2b_partners')
        .select('id, name, code, tier')
        .eq('is_active', true)

      const partnerMap = new Map((partners || []).map(p => [p.id, p]))
      const agg: Record<string, { value: number; volume: number; deals: number; drcSum: number; drcCount: number }> = {}

      deals.forEach(d => {
        if (!agg[d.partner_id]) agg[d.partner_id] = { value: 0, volume: 0, deals: 0, drcSum: 0, drcCount: 0 }
        agg[d.partner_id].value += d.total_value_vnd || 0
        agg[d.partner_id].volume += (d.quantity_kg || 0) / 1000
        agg[d.partner_id].deals++
        if (d.actual_drc) { agg[d.partner_id].drcSum += d.actual_drc; agg[d.partner_id].drcCount++ }
      })

      return Object.entries(agg)
        .map(([id, stats]) => ({
          partner: partnerMap.get(id),
          ...stats,
          avgDrc: stats.drcCount > 0 ? Math.round(stats.drcSum / stats.drcCount * 10) / 10 : null,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 15)
    },
  })

  // ═══ Funnel conversion ═══
  const { data: funnel = { demands: 0, offers: 0, deals: 0, settlements: 0 }, isLoading: loadingFunnel } = useQuery({
    queryKey: ['b2b-funnel', year],
    queryFn: async () => {
      const startDate = `${year}-01-01`
      const endDate = `${year}-12-31T23:59:59`

      const [demandRes, offerRes, dealRes, settlementRes] = await Promise.all([
        supabase.from('b2b_demands').select('*', { count: 'exact', head: true }).gte('created_at', startDate).lte('created_at', endDate),
        supabase.from('b2b_demand_offers').select('*', { count: 'exact', head: true }).gte('created_at', startDate).lte('created_at', endDate),
        supabase.from('b2b_deals').select('*', { count: 'exact', head: true }).gte('created_at', startDate).lte('created_at', endDate).not('status', 'eq', 'cancelled'),
        supabase.from('b2b_settlements').select('*', { count: 'exact', head: true }).gte('created_at', startDate).lte('created_at', endDate),
      ])
      return {
        demands: demandRes.count || 0,
        offers: offerRes.count || 0,
        deals: dealRes.count || 0,
        settlements: settlementRes.count || 0,
      }
    },
  })

  // ═══ Settlement aging ═══
  const { data: aging = [], isLoading: loadingAging } = useQuery({
    queryKey: ['b2b-settlement-aging'],
    queryFn: async () => {
      const { data: settlements } = await supabase
        .from('b2b_settlements')
        .select('id, settlement_number, total_amount, currency, status, created_at, partner_id')
        .in('status', ['pending', 'approved', 'draft'])
        .order('created_at', { ascending: true })
        .limit(20)

      // Fetch partner names separately (FK join may not work on views)
      const partnerIds = [...new Set((settlements || []).map((s: any) => s.partner_id).filter(Boolean))]
      const partnerMap = new Map<string, string>()
      if (partnerIds.length > 0) {
        const { data: partners } = await supabase.from('b2b_partners').select('id, name').in('id', partnerIds)
        ;(partners || []).forEach((p: any) => partnerMap.set(p.id, p.name))
      }

      return (settlements || []).map((s: any) => {
        const days = Math.floor((Date.now() - new Date(s.created_at).getTime()) / 86400000)
        return {
          ...s,
          partner: { name: partnerMap.get(s.partner_id) || '—' },
          agingDays: days,
          agingColor: days > 30 ? 'red' : days > 14 ? 'orange' : 'green',
        }
      })
    },
  })

  // ═══ KPI summary ═══
  const totalValue = topPartners.reduce((s, p) => s + p.value, 0)
  const totalVolume = topPartners.reduce((s, p) => s + p.volume, 0)
  const totalDeals = topPartners.reduce((s, p) => s + p.deals, 0)
  const activePartners = topPartners.length

  const funnelSteps = [
    { label: 'Nhu cầu', value: funnel.demands, color: '#1890ff' },
    { label: 'Báo giá', value: funnel.offers, color: '#722ed1' },
    { label: 'Deal', value: funnel.deals, color: '#52c41a' },
    { label: 'Quyết toán', value: funnel.settlements, color: '#1B4D3E' },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/b2b')} />
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <BarChartOutlined /> Báo cáo B2B
          </Title>
        </div>
        <Select value={year} onChange={setYear} style={{ width: 100 }}
          options={[2024, 2025, 2026, 2027].map(y => ({ value: y, label: `${y}` }))} />
      </div>

      {/* KPI Row */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={6}><Card size="small" style={{ borderRadius: 12 }}>
          <Statistic title="Giá trị B2B" value={totalValue} formatter={v => `${(Number(v) / 1e9).toFixed(1)} tỷ`} prefix={<DollarOutlined style={{ color: '#1B4D3E' }} />} valueStyle={{ color: '#1B4D3E' }} />
        </Card></Col>
        <Col xs={6}><Card size="small" style={{ borderRadius: 12 }}>
          <Statistic title="Sản lượng" value={Math.round(totalVolume)} suffix="tấn" prefix={<ExperimentOutlined style={{ color: '#1890ff' }} />} valueStyle={{ color: '#1890ff' }} />
        </Card></Col>
        <Col xs={6}><Card size="small" style={{ borderRadius: 12 }}>
          <Statistic title="Số deal" value={totalDeals} prefix={<FunnelPlotOutlined style={{ color: '#722ed1' }} />} valueStyle={{ color: '#722ed1' }} />
        </Card></Col>
        <Col xs={6}><Card size="small" style={{ borderRadius: 12 }}>
          <Statistic title="Đại lý active" value={activePartners} prefix={<TeamOutlined style={{ color: '#fa8c16' }} />} valueStyle={{ color: '#fa8c16' }} />
        </Card></Col>
      </Row>

      <Row gutter={16}>
        {/* Funnel */}
        <Col xs={24} lg={8}>
          <Card size="small" title={<><FunnelPlotOutlined /> Funnel chuyển đổi ({year})</>} style={{ borderRadius: 12, marginBottom: 16 }}>
            {loadingFunnel ? <Spin /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
                {funnelSteps.map((step, idx) => {
                  const rate = idx > 0 && funnelSteps[idx - 1].value > 0
                    ? Math.round(step.value / funnelSteps[idx - 1].value * 100)
                    : 100
                  return (
                    <div key={step.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text strong style={{ fontSize: 13 }}>{step.label}</Text>
                        <Text strong style={{ color: step.color }}>{step.value}</Text>
                      </div>
                      <Progress percent={funnelSteps[0].value > 0 ? Math.round(step.value / funnelSteps[0].value * 100) : 0} strokeColor={step.color} showInfo={false} size="small" />
                      {idx > 0 && <Text type="secondary" style={{ fontSize: 11 }}>Tỉ lệ: {rate}% từ {funnelSteps[idx - 1].label}</Text>}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Settlement Aging */}
          <Card size="small" title={<><ClockCircleOutlined /> Quyết toán chờ xử lý</>} style={{ borderRadius: 12 }}>
            {loadingAging ? <Spin /> : aging.length === 0 ? <Empty description="Không có" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {aging.map((s: any) => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <div>
                      <Text strong style={{ fontSize: 12 }}>{s.settlement_number}</Text>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{s.partner?.name}</Text>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <Text strong style={{ fontSize: 12 }}>{Number(s.total_amount || 0).toLocaleString('vi-VN')}</Text>
                      <Tag color={s.agingColor} style={{ marginLeft: 4, fontSize: 10 }}>{s.agingDays}d</Tag>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>

        {/* Top Partners */}
        <Col xs={24} lg={16}>
          <Card size="small" title={<><TrophyOutlined /> Top đại lý ({year})</>} style={{ borderRadius: 12 }}>
            <Table
              dataSource={topPartners}
              rowKey={(r: any) => r.partner?.id || Math.random()}
              loading={loadingPartners}
              pagination={false}
              size="small"
              columns={[
                {
                  title: '#', key: 'rank', width: 40,
                  render: (_: any, __: any, idx: number) => (
                    <span style={{ fontWeight: idx < 3 ? 700 : 400, color: idx === 0 ? '#faad14' : idx < 3 ? '#1B4D3E' : '#999' }}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                    </span>
                  ),
                },
                {
                  title: 'Đại lý', key: 'partner',
                  render: (_: any, r: any) => (
                    <div>
                      <Text strong style={{ fontSize: 13 }}>{r.partner?.name || '—'}</Text>
                      <div style={{ fontSize: 11, color: '#999' }}>
                        {r.partner?.code}
                        {r.partner?.tier && <Tag style={{ marginLeft: 4, fontSize: 10 }}>{r.partner.tier}</Tag>}
                      </div>
                    </div>
                  ),
                },
                {
                  title: 'Giá trị (VNĐ)', key: 'value', align: 'right' as const,
                  render: (_: any, r: any) => <Text strong>{(r.value / 1e6).toFixed(0)}M</Text>,
                  sorter: (a: any, b: any) => a.value - b.value,
                },
                {
                  title: 'Tấn', dataIndex: 'volume', align: 'right' as const,
                  render: (v: number) => `${v.toFixed(1)}`,
                  sorter: (a: any, b: any) => a.volume - b.volume,
                },
                {
                  title: 'Deals', dataIndex: 'deals', align: 'center' as const,
                  sorter: (a: any, b: any) => a.deals - b.deals,
                },
                {
                  title: 'DRC TB', key: 'drc', align: 'center' as const,
                  render: (_: any, r: any) => r.avgDrc ? <Tag color="blue">{r.avgDrc}%</Tag> : '—',
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
