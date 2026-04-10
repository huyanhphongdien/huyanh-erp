// ============================================================================
// PRICE INTELLIGENCE PAGE — Biểu đồ giá mủ theo vùng/thời gian
// File: src/pages/b2b/reports/PriceIntelligencePage.tsx
// ============================================================================

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, Row, Col, Select, Typography, Spin, Empty, Statistic, Tag, Table, Button } from 'antd'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { ArrowLeftOutlined, FundOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

const { Title, Text } = Typography

const PRODUCT_TYPES = [
  { value: 'all', label: 'Tất cả' },
  { value: 'mu_tap', label: 'Mủ tạp' },
  { value: 'mu_nuoc', label: 'Mủ nước' },
  { value: 'mu_dong', label: 'Mủ đông' },
  { value: 'mu_chen', label: 'Mủ chén' },
  { value: 'mu_to', label: 'Mủ tờ' },
]

const COLORS = ['#1B4D3E', '#1890ff', '#722ed1', '#fa8c16', '#eb2f96', '#52c41a']

export default function PriceIntelligencePage() {
  const navigate = useNavigate()
  const [productType, setProductType] = useState('all')
  const now = new Date()

  // Price trend — last 12 months
  const { data: priceTrend = [], isLoading: loadingTrend } = useQuery({
    queryKey: ['price-trend', productType],
    queryFn: async () => {
      const months: { month: string; avgPrice: number; minPrice: number; maxPrice: number; dealCount: number }[] = []

      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const year = d.getFullYear()
        const month = d.getMonth() + 1
        const start = `${year}-${String(month).padStart(2, '0')}-01`
        const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

        let query = supabase
          .from('b2b_deals')
          .select('unit_price')
          .gte('created_at', start)
          .lt('created_at', end)
          .not('status', 'eq', 'cancelled')
          .gt('unit_price', 0)

        if (productType !== 'all') query = query.eq('product_code', productType)

        const { data } = await query
        if (data && data.length > 0) {
          const prices = data.map(d => d.unit_price)
          months.push({
            month: `T${month}/${String(year).slice(-2)}`,
            avgPrice: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
            minPrice: Math.min(...prices),
            maxPrice: Math.max(...prices),
            dealCount: prices.length,
          })
        } else {
          months.push({ month: `T${month}/${String(year).slice(-2)}`, avgPrice: 0, minPrice: 0, maxPrice: 0, dealCount: 0 })
        }
      }
      return months.filter(m => m.dealCount > 0)
    },
  })

  // Price by region
  const { data: regionPrices = [], isLoading: loadingRegion } = useQuery({
    queryKey: ['price-by-region', productType],
    queryFn: async () => {
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString()

      let query = supabase
        .from('b2b_deals')
        .select('unit_price, source_region, quantity_kg')
        .gte('created_at', sixMonthsAgo)
        .not('status', 'eq', 'cancelled')
        .gt('unit_price', 0)
        .not('source_region', 'is', null)

      if (productType !== 'all') query = query.eq('product_code', productType)

      const { data } = await query
      if (!data) return []

      const regionMap: Record<string, { prices: number[]; volume: number }> = {}
      data.forEach(d => {
        const region = d.source_region || 'Khác'
        if (!regionMap[region]) regionMap[region] = { prices: [], volume: 0 }
        regionMap[region].prices.push(d.unit_price)
        regionMap[region].volume += (d.quantity_kg || 0) / 1000
      })

      return Object.entries(regionMap)
        .map(([region, stats]) => ({
          region,
          avgPrice: Math.round(stats.prices.reduce((s, p) => s + p, 0) / stats.prices.length),
          minPrice: Math.min(...stats.prices),
          maxPrice: Math.max(...stats.prices),
          volume: Math.round(stats.volume * 10) / 10,
          dealCount: stats.prices.length,
        }))
        .sort((a, b) => b.volume - a.volume)
    },
  })

  // KPIs
  const currentMonth = priceTrend[priceTrend.length - 1]
  const prevMonth = priceTrend[priceTrend.length - 2]
  const priceChange = currentMonth && prevMonth && prevMonth.avgPrice > 0
    ? Math.round((currentMonth.avgPrice - prevMonth.avgPrice) / prevMonth.avgPrice * 100)
    : 0

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/b2b/analytics')} />
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <FundOutlined /> Giá mủ cao su
          </Title>
        </div>
        <Select value={productType} onChange={setProductType} style={{ width: 160 }} options={PRODUCT_TYPES} />
      </div>

      {/* KPI */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={8}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Statistic
              title="Giá TB tháng này"
              value={currentMonth?.avgPrice || 0}
              suffix="VNĐ/kg"
              valueStyle={{ color: '#1B4D3E', fontSize: 20 }}
              formatter={v => Number(v).toLocaleString('vi-VN')}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Statistic
              title="Thay đổi vs tháng trước"
              value={Math.abs(priceChange)}
              suffix="%"
              prefix={priceChange >= 0 ? <ArrowUpOutlined style={{ color: '#cf1322' }} /> : <ArrowDownOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: priceChange >= 0 ? '#cf1322' : '#52c41a', fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Statistic
              title="Deals tháng này"
              value={currentMonth?.dealCount || 0}
              valueStyle={{ fontSize: 20 }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        {/* Price trend chart */}
        <Col xs={24} lg={16}>
          <Card size="small" title="Xu hướng giá 12 tháng" style={{ borderRadius: 12, marginBottom: 16 }}>
            {loadingTrend ? <Spin /> : priceTrend.length === 0 ? <Empty description="Chưa có dữ liệu" /> : (
              <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={priceTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                    <Tooltip formatter={(v: number) => `${v.toLocaleString('vi-VN')} VNĐ/kg`} />
                    <Legend />
                    <Line type="monotone" dataKey="avgPrice" name="Giá TB" stroke="#1B4D3E" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="maxPrice" name="Cao nhất" stroke="#cf1322" strokeWidth={1} strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="minPrice" name="Thấp nhất" stroke="#1890ff" strokeWidth={1} strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Col>

        {/* Price by region */}
        <Col xs={24} lg={8}>
          <Card size="small" title="Giá theo vùng (6 tháng)" style={{ borderRadius: 12 }}>
            {loadingRegion ? <Spin /> : regionPrices.length === 0 ? <Empty description="Chưa có dữ liệu" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <Table
                dataSource={regionPrices}
                rowKey="region"
                pagination={false}
                size="small"
                columns={[
                  { title: 'Vùng', dataIndex: 'region', render: (v: string) => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
                  { title: 'Giá TB', dataIndex: 'avgPrice', align: 'right' as const, render: (v: number) => <Text style={{ fontSize: 12 }}>{v.toLocaleString('vi-VN')}</Text> },
                  { title: 'Tấn', dataIndex: 'volume', align: 'right' as const, render: (v: number) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
                ]}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
