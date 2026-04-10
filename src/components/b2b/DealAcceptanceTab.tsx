// ============================================================================
// DEAL ACCEPTANCE TAB — Biên bản nghiệm thu từ Portal
// File: src/components/b2b/DealAcceptanceTab.tsx
// Đọc từ b2b.acceptances (Portal tạo + ký, ERP xem)
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import { Tag, Empty, Spin, Descriptions, Button, Card, Avatar, Space } from 'antd'
import {
  FileTextOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  EditOutlined,
  DownloadOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { supabase } from '../../lib/supabase'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'Nháp', color: 'default' },
  pending_factory: { label: 'Chờ NM ký', color: 'warning' },
  pending_partner: { label: 'Chờ ĐL ký', color: 'processing' },
  signed: { label: 'Đã ký cả 2', color: 'success' },
  disputed: { label: 'Tranh chấp', color: 'error' },
  resolved: { label: 'Đã giải quyết', color: 'cyan' },
}

export default function DealAcceptanceTab({ dealId }: { dealId: string }) {
  // Acceptances link to processing_orders which link to deals
  const { data: acceptances = [], isLoading } = useQuery({
    queryKey: ['deal-acceptances', dealId],
    queryFn: async () => {
      // First get processing_order_ids for this deal
      const { data: orders } = await supabase
        .schema('b2b')
        .from('processing_orders')
        .select('id')
        .eq('deal_id', dealId)
      if (!orders || orders.length === 0) return []

      const orderIds = orders.map(o => o.id)
      const { data, error } = await supabase
        .schema('b2b')
        .from('acceptances')
        .select('*')
        .in('processing_order_id', orderIds)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
  if (acceptances.length === 0) return <Empty description="Chưa có biên bản nghiệm thu" image={Empty.PRESENTED_IMAGE_SIMPLE} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {acceptances.map((acc: any) => {
        const st = STATUS_MAP[acc.status] || STATUS_MAP.draft
        return (
          <Card key={acc.id} size="small" title={
            <span><FileTextOutlined style={{ marginRight: 8 }} />{acc.acceptance_number || 'Biên bản'}</span>
          } extra={
            <Space>
              <Tag color={st.color}>{st.label}</Tag>
              {acc.pdf_url && (
                <Button type="link" size="small" icon={<DownloadOutlined />} href={acc.pdf_url} target="_blank">
                  PDF
                </Button>
              )}
            </Space>
          }>
            <Descriptions size="small" column={{ xs: 1, sm: 2 }} labelStyle={{ fontWeight: 600, color: '#666' }}>
              <Descriptions.Item label="Ngày nghiệm thu">{acc.acceptance_date || '—'}</Descriptions.Item>
              <Descriptions.Item label="Quality Grade">{acc.quality_grade ? <Tag color="green">{acc.quality_grade}</Tag> : '—'}</Descriptions.Item>
              <Descriptions.Item label="Đầu vào (ướt)">{acc.input_wet_weight ? `${acc.input_wet_weight} kg` : '—'}</Descriptions.Item>
              <Descriptions.Item label="DRC đầu vào">{acc.input_drc ? `${acc.input_drc}%` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Đầu ra">{acc.output_weight ? `${acc.output_weight} kg` : '—'}</Descriptions.Item>
              <Descriptions.Item label="DRC đầu ra">{acc.output_drc ? `${acc.output_drc}%` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Hao hụt">{acc.loss_percentage != null ? `${acc.loss_percentage}%` : '—'}
                {acc.acceptable_loss_percentage && (
                  <span style={{ color: '#999', marginLeft: 4 }}>(cho phép: {acc.acceptable_loss_percentage}%)</span>
                )}
              </Descriptions.Item>
            </Descriptions>

            {/* Chữ ký */}
            <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Chữ ký</div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {/* Factory signer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar size={32} icon={<UserOutlined />} style={{ backgroundColor: '#1B4D3E' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{acc.factory_signer_name || 'Nhà máy'}</div>
                    {acc.factory_signed_at ? (
                      <div style={{ fontSize: 11, color: '#52c41a' }}>
                        <CheckCircleOutlined /> Đã ký {new Date(acc.factory_signed_at).toLocaleDateString('vi-VN')}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#faad14' }}><WarningOutlined /> Chưa ký</div>
                    )}
                  </div>
                </div>

                {/* Partner signer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar size={32} icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{acc.partner_signer_name || 'Đại lý'}</div>
                    {acc.partner_signed_at ? (
                      <div style={{ fontSize: 11, color: '#52c41a' }}>
                        <CheckCircleOutlined /> Đã ký {new Date(acc.partner_signed_at).toLocaleDateString('vi-VN')}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#faad14' }}><WarningOutlined /> Chưa ký</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Dispute */}
            {acc.status === 'disputed' && acc.dispute_reason && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: '#fff2f0', borderRadius: 8, border: '1px solid #ffccc7' }}>
                <div style={{ fontWeight: 600, color: '#cf1322', fontSize: 12 }}><WarningOutlined /> Tranh chấp</div>
                <div style={{ fontSize: 12, color: '#595959', marginTop: 4 }}>{acc.dispute_reason}</div>
                {acc.dispute_resolution && (
                  <div style={{ fontSize: 12, color: '#52c41a', marginTop: 4 }}>Giải quyết: {acc.dispute_resolution}</div>
                )}
              </div>
            )}

            {acc.notes && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>Ghi chú: {acc.notes}</div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
