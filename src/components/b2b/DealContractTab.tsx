// ============================================================================
// DEAL CONTRACT TAB — Hợp đồng từ Portal
// File: src/components/b2b/DealContractTab.tsx
// Đọc từ b2b.contracts (Portal upload + ký, ERP xem)
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import { Tag, Empty, Spin, Button, Card, Avatar, Space, Descriptions } from 'antd'
import {
  FileProtectOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  DownloadOutlined,
  UserOutlined,
  CalendarOutlined,
} from '@ant-design/icons'
import { supabase } from '../../lib/supabase'

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'Nháp', color: 'default' },
  pending_review: { label: 'Chờ duyệt', color: 'warning' },
  pending_signature: { label: 'Chờ ký', color: 'processing' },
  active: { label: 'Có hiệu lực', color: 'success' },
  expired: { label: 'Hết hạn', color: 'error' },
  terminated: { label: 'Đã chấm dứt', color: 'default' },
}

const TYPE_MAP: Record<string, string> = {
  purchase: 'Mua bán',
  processing: 'Gia công',
  consignment: 'Ký gửi',
  framework: 'Khung',
}

export default function DealContractTab({ dealId }: { dealId: string }) {
  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ['deal-contracts', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .schema('b2b')
        .from('contracts')
        .select('*')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })

  if (isLoading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
  if (contracts.length === 0) return <Empty description="Chưa có hợp đồng" image={Empty.PRESENTED_IMAGE_SIMPLE} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {contracts.map((ct: any) => {
        const st = STATUS_MAP[ct.status] || STATUS_MAP.draft
        const isExpired = ct.expiry_date && new Date(ct.expiry_date) < new Date()
        return (
          <Card key={ct.id} size="small" title={
            <span><FileProtectOutlined style={{ marginRight: 8 }} />{ct.contract_number || 'Hợp đồng'}</span>
          } extra={
            <Space>
              <Tag color={isExpired && ct.status === 'active' ? 'error' : st.color}>
                {isExpired && ct.status === 'active' ? 'Hết hạn' : st.label}
              </Tag>
              {ct.file_url && (
                <Button type="primary" size="small" icon={<DownloadOutlined />} href={ct.file_url} target="_blank">
                  Tải file
                </Button>
              )}
            </Space>
          }>
            <Descriptions size="small" column={{ xs: 1, sm: 2 }} labelStyle={{ fontWeight: 600, color: '#666' }}>
              <Descriptions.Item label="Loại HĐ">{TYPE_MAP[ct.contract_type] || ct.contract_type || '—'}</Descriptions.Item>
              <Descriptions.Item label="Giá trị">{ct.total_value ? `${Number(ct.total_value).toLocaleString('vi-VN')} ${ct.currency || 'VND'}` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Ngày ký">{ct.signed_date || '—'}</Descriptions.Item>
              <Descriptions.Item label="Hiệu lực">{ct.effective_date || '—'}</Descriptions.Item>
              <Descriptions.Item label="Hết hạn">
                {ct.expiry_date || '—'}
                {isExpired && <Tag color="error" style={{ marginLeft: 8 }}>Đã hết hạn</Tag>}
              </Descriptions.Item>
              {ct.file_name && <Descriptions.Item label="File">{ct.file_name}</Descriptions.Item>}
            </Descriptions>

            {/* Chữ ký */}
            <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Chữ ký</div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar size={32} icon={<UserOutlined />} style={{ backgroundColor: '#1B4D3E' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Nhà máy</div>
                    {ct.factory_signed_at ? (
                      <div style={{ fontSize: 11, color: '#52c41a' }}>
                        <CheckCircleOutlined /> Đã ký {new Date(ct.factory_signed_at).toLocaleDateString('vi-VN')}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#faad14' }}><WarningOutlined /> Chưa ký</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar size={32} icon={<UserOutlined />} style={{ backgroundColor: '#1890ff' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Đại lý</div>
                    {ct.partner_signed_at ? (
                      <div style={{ fontSize: 11, color: '#52c41a' }}>
                        <CheckCircleOutlined /> Đã ký {new Date(ct.partner_signed_at).toLocaleDateString('vi-VN')}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#faad14' }}><WarningOutlined /> Chưa ký</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {ct.terms && (
              <div style={{ marginTop: 12, padding: '8px 12px', background: '#f6f6f6', borderRadius: 8, fontSize: 12, color: '#666', whiteSpace: 'pre-wrap' }}>
                <strong>Điều khoản:</strong><br />{ct.terms}
              </div>
            )}
            {ct.notes && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>Ghi chú: {ct.notes}</div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
