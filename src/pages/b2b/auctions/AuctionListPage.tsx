// ============================================================================
// AUCTION LIST PAGE — Quản lý phiên đấu giá B2B
// File: src/pages/b2b/auctions/AuctionListPage.tsx
// ERP side: xem tất cả auctions, theo dõi bids, chọn winner
// ============================================================================

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Card, Table, Tag, Button, Space, Typography, Spin, Empty, Statistic, Row, Col, Badge, Tooltip, Progress,
} from 'antd'
import {
  ThunderboltOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
  TeamOutlined,
  DollarOutlined,
  EyeOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons'
import { supabase } from '../../../lib/supabase'

const { Title, Text } = Typography

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'Nháp', color: 'default' },
  upcoming: { label: 'Sắp diễn ra', color: 'blue' },
  active: { label: 'Đang đấu giá', color: 'green' },
  extended: { label: 'Gia hạn', color: 'orange' },
  ended: { label: 'Đã kết thúc', color: 'default' },
  awarded: { label: 'Đã chọn winner', color: 'purple' },
  cancelled: { label: 'Đã hủy', color: 'error' },
}

export default function AuctionListPage() {
  const navigate = useNavigate()

  const { data: auctions = [], isLoading } = useQuery({
    queryKey: ['b2b-auctions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('b2b')
        .from('auctions')
        .select(`
          *,
          winner:partners!auctions_winner_id_fkey(id, name)
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((a: any) => ({
        ...a,
        winner: Array.isArray(a.winner) ? a.winner[0] : a.winner,
      }))
    },
  })

  // KPI
  const activeCount = auctions.filter((a: any) => ['active', 'extended'].includes(a.status)).length
  const totalBids = auctions.reduce((s: number, a: any) => s + (a.bid_count || 0), 0)
  const awardedCount = auctions.filter((a: any) => a.status === 'awarded').length

  const columns = [
    {
      title: 'Mã phiên',
      dataIndex: 'auction_number',
      key: 'auction_number',
      render: (v: string, r: any) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{v || '—'}</Text>
          <div style={{ fontSize: 11, color: '#999' }}>{r.title}</div>
        </div>
      ),
    },
    {
      title: 'Sản phẩm',
      key: 'product',
      render: (_: any, r: any) => (
        <div>
          <Tag>{r.product_type || '—'}</Tag>
          {r.product_grade && <Tag color="blue">{r.product_grade}</Tag>}
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{r.quantity_tons} tấn</div>
        </div>
      ),
    },
    {
      title: 'Giá',
      key: 'price',
      render: (_: any, r: any) => (
        <div>
          <div style={{ fontSize: 12, color: '#999' }}>Khởi điểm: {Number(r.starting_price || 0).toLocaleString('vi-VN')}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1B4D3E' }}>
            Hiện tại: {Number(r.current_price || r.starting_price || 0).toLocaleString('vi-VN')}
          </div>
          <div style={{ fontSize: 11, color: '#999' }}>{r.currency || 'VND'}/kg • Bước: {Number(r.min_bid_step || 0).toLocaleString('vi-VN')}</div>
        </div>
      ),
    },
    {
      title: 'Thời gian',
      key: 'time',
      render: (_: any, r: any) => {
        const isActive = ['active', 'extended'].includes(r.status)
        const endTime = r.end_time ? new Date(r.end_time) : null
        const remaining = endTime ? Math.max(0, Math.floor((endTime.getTime() - Date.now()) / 60000)) : 0
        return (
          <div>
            <div style={{ fontSize: 12 }}>
              {r.start_time ? new Date(r.start_time).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
            </div>
            <div style={{ fontSize: 12 }}>
              → {r.end_time ? new Date(r.end_time).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
            </div>
            {isActive && remaining > 0 && (
              <Tag color="red" style={{ marginTop: 4 }}>Còn {remaining} phút</Tag>
            )}
            {r.extended_count > 0 && <Tag color="orange" style={{ marginTop: 2 }}>Gia hạn {r.extended_count}x</Tag>}
          </div>
        )
      },
    },
    {
      title: 'Bids',
      key: 'bids',
      align: 'center' as const,
      render: (_: any, r: any) => (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1B4D3E' }}>{r.bid_count || 0}</div>
          <div style={{ fontSize: 10, color: '#999' }}>{r.participant_count || 0} đại lý</div>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => {
        const st = STATUS_MAP[v] || STATUS_MAP.draft
        return <Tag color={st.color}>{st.label}</Tag>
      },
    },
    {
      title: 'Winner',
      key: 'winner',
      render: (_: any, r: any) => r.winner ? (
        <div>
          <Text strong style={{ color: '#722ed1', fontSize: 12 }}><TrophyOutlined /> {r.winner.name}</Text>
          <div style={{ fontSize: 11, color: '#999' }}>{Number(r.winning_price || 0).toLocaleString('vi-VN')} {r.currency || 'VND'}/kg</div>
        </div>
      ) : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_: any, r: any) => (
        <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/b2b/auctions/${r.id}`)} />
      ),
    },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/b2b')} />
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <ThunderboltOutlined /> Đấu giá B2B
          </Title>
        </div>
      </div>

      {/* KPI Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={8}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Statistic title="Đang đấu giá" value={activeCount} prefix={<ThunderboltOutlined style={{ color: '#52c41a' }} />} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Statistic title="Tổng bids" value={totalBids} prefix={<DollarOutlined style={{ color: '#1890ff' }} />} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Statistic title="Đã chọn winner" value={awardedCount} prefix={<TrophyOutlined style={{ color: '#722ed1' }} />} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <Table
          dataSource={auctions}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 15 }}
          size="small"
          locale={{ emptyText: <Empty description="Chưa có phiên đấu giá" /> }}
        />
      </Card>
    </div>
  )
}
