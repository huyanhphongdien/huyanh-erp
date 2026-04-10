// ============================================================================
// AUCTION DETAIL PAGE — Chi tiết phiên đấu giá + danh sách bids
// File: src/pages/b2b/auctions/AuctionDetailPage.tsx
// ============================================================================

import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Card, Descriptions, Tag, Button, Space, Typography, Spin, Empty, Table, Statistic, Row, Col,
} from 'antd'
import {
  ArrowLeftOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  TeamOutlined,
  UserOutlined,
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

const BID_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: 'Hợp lệ', color: 'green' },
  outbid: { label: 'Bị vượt', color: 'default' },
  winning: { label: 'Thắng', color: 'gold' },
  withdrawn: { label: 'Rút', color: 'error' },
}

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: auction, isLoading } = useQuery({
    queryKey: ['b2b-auction', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('b2b')
        .from('auctions')
        .select('*, winner:partners!auctions_winner_id_fkey(id, name, code)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return { ...data, winner: Array.isArray(data.winner) ? data.winner[0] : data.winner }
    },
    enabled: !!id,
  })

  const { data: bids = [] } = useQuery({
    queryKey: ['b2b-auction-bids', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('b2b')
        .from('auction_bids')
        .select('*, partner:partners!auction_bids_partner_id_fkey(id, name, code)')
        .eq('auction_id', id!)
        .order('bid_price', { ascending: false })
      if (error) throw error
      return (data || []).map((b: any) => ({
        ...b,
        partner: Array.isArray(b.partner) ? b.partner[0] : b.partner,
      }))
    },
    enabled: !!id,
  })

  if (isLoading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  if (!auction) return <Empty description="Không tìm thấy phiên đấu giá" />

  const st = STATUS_MAP[auction.status] || STATUS_MAP.draft
  const isActive = ['active', 'extended'].includes(auction.status)
  const endTime = auction.end_time ? new Date(auction.end_time) : null
  const remaining = endTime ? Math.max(0, Math.floor((endTime.getTime() - Date.now()) / 60000)) : 0

  const bidColumns = [
    {
      title: '#',
      key: 'rank',
      width: 50,
      render: (_: any, __: any, idx: number) => (
        <span style={{ fontWeight: idx === 0 ? 700 : 400, color: idx === 0 ? '#722ed1' : '#666' }}>
          {idx === 0 ? <TrophyOutlined /> : idx + 1}
        </span>
      ),
    },
    {
      title: 'Đại lý',
      key: 'partner',
      render: (_: any, r: any) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{r.partner?.name || '—'}</Text>
          <div style={{ fontSize: 11, color: '#999' }}>{r.partner?.code || ''}</div>
        </div>
      ),
    },
    {
      title: 'Giá bid',
      dataIndex: 'bid_price',
      key: 'bid_price',
      render: (v: number) => (
        <Text strong style={{ fontSize: 14, color: '#1B4D3E' }}>
          {Number(v || 0).toLocaleString('vi-VN')} {auction.currency || 'VND'}/kg
        </Text>
      ),
    },
    {
      title: 'Số lượng',
      dataIndex: 'quantity_tons',
      render: (v: number) => v ? `${v} tấn` : '—',
    },
    {
      title: 'DRC cam kết',
      dataIndex: 'guaranteed_drc',
      render: (v: number) => v ? `${v}%` : '—',
    },
    {
      title: 'Ngày giao',
      dataIndex: 'delivery_date',
      render: (v: string) => v || '—',
    },
    {
      title: 'Thời gian bid',
      dataIndex: 'bid_at',
      render: (v: string) => v ? new Date(v).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (v: string) => {
        const s = BID_STATUS[v] || BID_STATUS.active
        return <Tag color={s.color}>{s.label}</Tag>
      },
    },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/b2b/auctions')} />
        <div style={{ flex: 1 }}>
          <Title level={4} style={{ margin: 0, color: '#1B4D3E' }}>
            <ThunderboltOutlined /> {auction.auction_number || 'Phiên đấu giá'}
          </Title>
          <Text type="secondary">{auction.title}</Text>
        </div>
        <Tag color={st.color} style={{ fontSize: 14, padding: '4px 12px' }}>{st.label}</Tag>
      </div>

      {/* KPIs */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={6}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Statistic title="Giá hiện tại" value={Number(auction.current_price || auction.starting_price || 0)} suffix={`${auction.currency || 'VND'}/kg`} valueStyle={{ color: '#1B4D3E', fontSize: 18 }} formatter={(v) => Number(v).toLocaleString('vi-VN')} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Statistic title="Số lượt bid" value={auction.bid_count || bids.length} prefix={<DollarOutlined />} valueStyle={{ fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card size="small" style={{ borderRadius: 12 }}>
            <Statistic title="Đại lý tham gia" value={auction.participant_count || 0} prefix={<TeamOutlined />} valueStyle={{ fontSize: 18 }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card size="small" style={{ borderRadius: 12 }}>
            {isActive && remaining > 0 ? (
              <Statistic title="Còn lại" value={remaining} suffix="phút" prefix={<ClockCircleOutlined />} valueStyle={{ color: '#cf1322', fontSize: 18 }} />
            ) : (
              <Statistic title="Gia hạn" value={auction.extended_count || 0} suffix="lần" valueStyle={{ fontSize: 18 }} />
            )}
          </Card>
        </Col>
      </Row>

      {/* Auction info */}
      <Card size="small" style={{ borderRadius: 12, marginBottom: 24 }} title="Thông tin phiên">
        <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3 }}>
          <Descriptions.Item label="Sản phẩm">{auction.product_type} {auction.product_grade && <Tag color="blue">{auction.product_grade}</Tag>}</Descriptions.Item>
          <Descriptions.Item label="Số lượng">{auction.quantity_tons} tấn</Descriptions.Item>
          <Descriptions.Item label="Giá khởi điểm">{Number(auction.starting_price || 0).toLocaleString('vi-VN')} {auction.currency || 'VND'}/kg</Descriptions.Item>
          <Descriptions.Item label="Giá sàn">{auction.reserve_price ? `${Number(auction.reserve_price).toLocaleString('vi-VN')} ${auction.currency || 'VND'}/kg` : 'Không có'}</Descriptions.Item>
          <Descriptions.Item label="Bước giá tối thiểu">{Number(auction.min_bid_step || 0).toLocaleString('vi-VN')} {auction.currency || 'VND'}</Descriptions.Item>
          <Descriptions.Item label="DRC tối thiểu">{auction.min_drc ? `${auction.min_drc}%` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Bắt đầu">{auction.start_time ? new Date(auction.start_time).toLocaleString('vi-VN') : '—'}</Descriptions.Item>
          <Descriptions.Item label="Kết thúc">{auction.end_time ? new Date(auction.end_time).toLocaleString('vi-VN') : '—'}</Descriptions.Item>
          <Descriptions.Item label="Auto gia hạn">{auction.auto_extend_minutes ? `${auction.auto_extend_minutes} phút` : 'Không'}</Descriptions.Item>
          <Descriptions.Item label="Giao hàng">{auction.delivery_date || '—'}</Descriptions.Item>
          <Descriptions.Item label="Nơi giao">{auction.delivery_location || '—'}</Descriptions.Item>
          {auction.winner && (
            <Descriptions.Item label="Winner">
              <Tag color="purple" icon={<TrophyOutlined />}>
                {auction.winner.name} — {Number(auction.winning_price || 0).toLocaleString('vi-VN')} {auction.currency || 'VND'}/kg
              </Tag>
            </Descriptions.Item>
          )}
        </Descriptions>
        {auction.terms_conditions && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#f6f6f6', borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap' }}>
            <strong>Điều khoản:</strong><br />{auction.terms_conditions}
          </div>
        )}
      </Card>

      {/* Bids table */}
      <Card size="small" style={{ borderRadius: 12 }} title={`Danh sách bids (${bids.length})`}>
        <Table
          dataSource={bids}
          columns={bidColumns}
          rowKey="id"
          pagination={false}
          size="small"
          rowClassName={(r: any, idx: number) => idx === 0 ? 'ant-table-row-selected' : ''}
          locale={{ emptyText: <Empty description="Chưa có bid nào" /> }}
        />
      </Card>
    </div>
  )
}
