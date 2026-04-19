// ============================================================================
// DEAL INLINE DETAIL — Expandable detail tabs inside AdvancedDataTable
// File: src/components/b2b/DealInlineDetail.tsx
// Shows deal info + all tabs inline (no page navigation)
// ============================================================================

import { Suspense, lazy } from 'react'
import { Tabs, Descriptions, Tag, Typography, Spin, Row, Col, Statistic, Card, Button } from 'antd'
import {
  InfoCircleOutlined, InboxOutlined, ExperimentOutlined, CarOutlined,
  WalletOutlined, FileProtectOutlined,
  MessageOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { DEAL_STATUS_LABELS, DEAL_STATUS_COLORS } from '../../services/b2b/dealService'

// Lazy load tab components (same as DealDetailPage)
const DealWmsTab = lazy(() => import('./DealWmsTab'))
const DealQcTab = lazy(() => import('./DealQcTab'))
const DealAdvancesTab = lazy(() => import('./DealAdvancesTab'))
const DealDeliveryTab = lazy(() => import('./DealDeliveryTab'))
const DealContractTab = lazy(() => import('./DealContractTab'))

const { Text } = Typography

const formatCurrency = (v: number | null) => {
  if (!v) return '—'
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} tỷ`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} tr`
  return v.toLocaleString('vi-VN')
}

const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('vi-VN') : '—'

interface Props {
  deal: any
}

export default function DealInlineDetail({ deal }: Props) {
  const navigate = useNavigate()

  const tabItems = [
    {
      key: 'info',
      label: <span><InfoCircleOutlined /> Thông tin</span>,
      children: (
        <div>
          <Row gutter={[16, 12]}>
            <Col xs={6}>
              <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
                <Statistic title="Giá trị" value={deal.total_value_vnd || 0} formatter={v => formatCurrency(Number(v))} valueStyle={{ fontSize: 18, color: '#1B4D3E' }} />
              </Card>
            </Col>
            <Col xs={6}>
              <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
                <Statistic title="Tạm ứng" value={deal.total_advanced || 0} formatter={v => formatCurrency(Number(v))} valueStyle={{ fontSize: 18, color: '#722ed1' }} />
              </Card>
            </Col>
            <Col xs={6}>
              <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
                <Statistic title="Còn nợ" value={(deal.total_value_vnd || 0) - (deal.total_advanced || 0)} formatter={v => formatCurrency(Number(v))} valueStyle={{ fontSize: 18, color: ((deal.total_value_vnd || 0) - (deal.total_advanced || 0)) > 0 ? '#cf1322' : '#52c41a' }} />
              </Card>
            </Col>
            <Col xs={6}>
              <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
                <Statistic title="DRC" value={deal.actual_drc || deal.expected_drc || 0} suffix="%" valueStyle={{ fontSize: 18, color: '#1890ff' }} />
              </Card>
            </Col>
          </Row>
          <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }} style={{ marginTop: 12 }} labelStyle={{ fontWeight: 600 }}>
            <Descriptions.Item label="Mã Deal">{deal.deal_number}</Descriptions.Item>
            <Descriptions.Item label="Trạng thái"><Tag color={DEAL_STATUS_COLORS[deal.status]}>{DEAL_STATUS_LABELS[deal.status]}</Tag></Descriptions.Item>
            <Descriptions.Item label="Đại lý">{deal.partner?.name || '—'} <Text type="secondary">({deal.partner?.code})</Text></Descriptions.Item>
            <Descriptions.Item label="Sản phẩm">{deal.product_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Số lượng">{deal.quantity_tons ? `${deal.quantity_tons.toFixed(1)} tấn` : '—'} ({(deal.quantity_kg || 0).toLocaleString('vi-VN')} kg)</Descriptions.Item>
            <Descriptions.Item label="Đơn giá">{Number(deal.unit_price || 0).toLocaleString('vi-VN')} VNĐ/kg</Descriptions.Item>
            <Descriptions.Item label="Vùng">{deal.source_region || '—'}</Descriptions.Item>
            <Descriptions.Item label="Nơi bốc">{deal.pickup_location_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Mã lô">{deal.lot_code || '—'}</Descriptions.Item>
            <Descriptions.Item label="Ngày tạo">{formatDate(deal.created_at)}</Descriptions.Item>
            <Descriptions.Item label="Nhập kho">{deal.stock_in_count || 0} phiếu · {deal.actual_weight_kg ? `${(deal.actual_weight_kg / 1000).toFixed(1)}T` : '—'}</Descriptions.Item>
            <Descriptions.Item label="QC">{deal.qc_status ? <Tag color={deal.qc_status === 'passed' ? 'success' : deal.qc_status === 'failed' ? 'error' : 'warning'}>{deal.qc_status}</Tag> : '—'}</Descriptions.Item>
          </Descriptions>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Button type="link" icon={<MessageOutlined />} onClick={async () => {
              if (!deal.partner_id) return
              try {
                const { data: room } = await (await import('../../lib/supabase')).supabase
                  .from('b2b_chat_rooms')
                  .select('id')
                  .eq('partner_id', deal.partner_id)
                  .limit(1)
                  .maybeSingle()
                if (room) navigate(`/b2b/chat/${room.id}`)
                else navigate('/b2b/chat')
              } catch { navigate('/b2b/chat') }
            }}>Mở chat đại lý</Button>
          </div>
        </div>
      ),
    },
    {
      key: 'wms',
      label: <span><InboxOutlined /> Nhập kho {deal.stock_in_count ? `(${deal.stock_in_count})` : ''}</span>,
      children: <Suspense fallback={<Spin />}><DealWmsTab dealId={deal.id} /></Suspense>,
    },
    {
      key: 'qc',
      label: <span><ExperimentOutlined /> QC</span>,
      children: <Suspense fallback={<Spin />}><DealQcTab dealId={deal.id} deal={deal} /></Suspense>,
    },
    {
      key: 'delivery',
      label: <span><CarOutlined /> Thông tin giao hàng</span>,
      children: <Suspense fallback={<Spin />}><DealDeliveryTab dealId={deal.id} /></Suspense>,
    },
    {
      key: 'advances',
      label: <span><WalletOutlined /> Tạm ứng</span>,
      children: <Suspense fallback={<Spin />}><DealAdvancesTab dealId={deal.id} deal={deal} /></Suspense>,
    },
    {
      key: 'contract',
      label: <span><FileProtectOutlined /> Hợp đồng</span>,
      children: <Suspense fallback={<Spin />}><DealContractTab dealId={deal.id} /></Suspense>,
    },
  ]

  return (
    <div style={{ padding: '4px 0' }}>
      <Tabs
        items={tabItems}
        size="small"
        type="card"
        style={{ marginBottom: 0 }}
        tabBarStyle={{ marginBottom: 12 }}
      />
    </div>
  )
}
