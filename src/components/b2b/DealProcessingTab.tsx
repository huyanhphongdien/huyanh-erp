// ============================================================================
// DEAL PROCESSING TAB — Xem lệnh xử lý mủ từ Portal
// File: src/components/b2b/DealProcessingTab.tsx
// Đọc từ b2b.processing_orders (Portal tạo, ERP xem)
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import { Tag, Empty, Spin, Descriptions, Timeline, Card } from 'antd'
import {
  ExperimentOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons'
import { supabase } from '../../lib/supabase'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'Chờ xử lý', color: 'default' },
  scheduled: { label: 'Đã lên lịch', color: 'blue' },
  in_progress: { label: 'Đang xử lý', color: 'processing' },
  completed: { label: 'Hoàn thành', color: 'success' },
  cancelled: { label: 'Đã hủy', color: 'error' },
}

export default function DealProcessingTab({ dealId }: { dealId: string }) {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['deal-processing', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('b2b')
        .from('processing_orders')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
  if (orders.length === 0) return <Empty description="Chưa có lệnh xử lý mủ" image={Empty.PRESENTED_IMAGE_SIMPLE} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {orders.map((order: any) => {
        const st = STATUS_MAP[order.status] || STATUS_MAP.pending
        const outputRate = order.actual_input_tons && order.actual_output_tons
          ? Math.round(order.actual_output_tons / order.actual_input_tons * 100)
          : null
        return (
          <Card key={order.id} size="small" title={
            <span><ExperimentOutlined style={{ marginRight: 8 }} />{order.order_number || 'Lệnh xử lý'}</span>
          } extra={<Tag color={st.color}>{st.label}</Tag>}>
            <Descriptions size="small" column={{ xs: 1, sm: 2 }} labelStyle={{ fontWeight: 600, color: '#666' }}>
              <Descriptions.Item label="Loại sản phẩm">{order.product_type || '—'}</Descriptions.Item>
              <Descriptions.Item label="Grade">{order.product_grade || '—'}</Descriptions.Item>
              <Descriptions.Item label="Đầu vào (dự kiến)">{order.estimated_input_tons ? `${order.estimated_input_tons} tấn` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Đầu vào (thực tế)">{order.actual_input_tons ? `${order.actual_input_tons} tấn` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Đầu ra (dự kiến)">{order.estimated_output_tons ? `${order.estimated_output_tons} tấn` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Đầu ra (thực tế)">
                {order.actual_output_tons ? `${order.actual_output_tons} tấn` : '—'}
                {outputRate && <Tag color="blue" style={{ marginLeft: 8 }}>Tỉ lệ: {outputRate}%</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Phí xử lý">{order.processing_fee_per_ton ? `${Number(order.processing_fee_per_ton).toLocaleString('vi-VN')} ${order.currency || 'VND'}/tấn` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Tổng phí">{order.total_processing_fee ? `${Number(order.total_processing_fee).toLocaleString('vi-VN')} ${order.currency || 'VND'}` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Quality Grade">{order.quality_grade ? <Tag color="green">{order.quality_grade}</Tag> : '—'}</Descriptions.Item>
            </Descriptions>

            {/* Timeline */}
            <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
              <Timeline items={[
                { color: 'blue', children: <><strong>Yêu cầu:</strong> {order.requested_date || '—'}</> },
                ...(order.scheduled_date ? [{ color: 'cyan', children: <><strong>Lên lịch:</strong> {order.scheduled_date}</> }] : []),
                ...(order.started_at ? [{ color: 'orange', dot: <LoadingOutlined />, children: <><strong>Bắt đầu:</strong> {new Date(order.started_at).toLocaleDateString('vi-VN')}</> }] : []),
                ...(order.completed_at ? [{ color: 'green', dot: <CheckCircleOutlined />, children: <><strong>Hoàn thành:</strong> {new Date(order.completed_at).toLocaleDateString('vi-VN')}</> }] : []),
              ]} />
            </div>
          </Card>
        )
      })}
    </div>
  )
}
