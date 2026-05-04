// ============================================================================
// SalesDigestPage — preview daily digest
// File: src/pages/sales/SalesDigestPage.tsx
// Sprint 2 D7 (Sales Tracking & Control)
// ============================================================================

import { useEffect, useState } from 'react'
import { Card, Button, Spin, message, Modal } from 'antd'
import { RefreshCw, Eye, Send } from 'lucide-react'
import { salesDigestService, type DigestData } from '../../services/sales/salesDigestService'
import { supabase } from '../../lib/supabase'

export default function SalesDigestPage() {
  const [data, setData] = useState<DigestData | null>(null)
  const [html, setHtml] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const generate = async () => {
    setLoading(true)
    try {
      const d = await salesDigestService.generate()
      setData(d)
      setHtml(salesDigestService.renderHtml(d))
    } catch (err: any) {
      message.error('Lỗi generate digest: ' + (err.message || err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { generate() }, [])

  const handleDownloadHtml = () => {
    if (!html) return
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-digest-${new Date().toISOString().split('T')[0]}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSendTest = () => {
    Modal.confirm({
      title: 'Gửi email test ngay?',
      content: (
        <div>
          <p style={{ margin: 0, marginBottom: 8 }}>
            Sẽ gọi edge function <code>sales-digest</code> để gửi email tới:
          </p>
          <div style={{ padding: '8px 12px', background: '#f8f9fa', borderRadius: 6, fontFamily: 'monospace', fontSize: 12 }}>
            minhld@huyanhrubber.com
          </div>
          <p style={{ margin: '12px 0 0 0', fontSize: 12, color: '#6b7280' }}>
            (Test mode — chỉ 1 recipient. Sau khi confirm OK sẽ mở rộng cho subscribers list.)
          </p>
        </div>
      ),
      okText: 'Gửi ngay',
      cancelText: 'Hủy',
      okButtonProps: { style: { background: '#1B4D3E', borderColor: '#1B4D3E' } },
      onOk: async () => {
        setSending(true)
        try {
          const { data: result, error } = await supabase.functions.invoke('sales-digest', {
            body: {},
          })
          if (error) throw error
          if (result?.success) {
            message.success(`Đã gửi đến ${result.sent_to?.join(', ') || 'minhld@huyanhrubber.com'}`)
          } else {
            message.error('Lỗi gửi: ' + (result?.error || 'Unknown'))
          }
        } catch (err: any) {
          message.error('Lỗi: ' + (err.message || err))
        } finally {
          setSending(false)
        }
      },
    })
  }

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: '0 auto' }}>
      <Card
        title={
          <span style={{ color: '#1B4D3E', fontSize: 16 }}>
            📨 Sales Daily Digest — Preview
          </span>
        }
        extra={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<RefreshCw size={14} />} onClick={generate} loading={loading}>
              Regenerate
            </Button>
            <Button icon={<Eye size={14} />} onClick={handleDownloadHtml} disabled={!html}>
              Tải HTML
            </Button>
            <Button
              type="primary"
              icon={<Send size={14} />}
              onClick={handleSendTest}
              loading={sending}
              style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}
              title="Gọi edge function sales-digest gửi tới minhld@huyanhrubber.com (test mode)"
            >
              Gửi email test
            </Button>
          </div>
        }
        style={{ borderRadius: 12 }}
      >
        {/* Stats summary */}
        {data && !loading && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 16,
          }}>
            <SummaryStat
              label="Đơn quá SLA"
              value={data.overdue_orders.length}
              color={data.overdue_orders.length > 0 ? '#ff5b4f' : '#10b981'}
            />
            <SummaryStat
              label="Chuyển 24h qua"
              value={data.arrived_today.length}
              color="#0a72ef"
            />
            <SummaryStat
              label="Tổng đơn active"
              value={data.total_active_orders}
              color="#1B4D3E"
            />
            <SummaryStat
              label="Giá trị đang xử lý"
              value={`$${(data.total_value_in_progress_usd / 1000).toFixed(0)}K`}
              color="#1B4D3E"
            />
          </div>
        )}

        {/* HTML preview iframe */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
        ) : html ? (
          <iframe
            srcDoc={html}
            title="Digest preview"
            style={{
              width: '100%',
              minHeight: 800,
              border: '1px solid #e4e4e7',
              borderRadius: 8,
              background: '#f8f9fa',
            }}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
            Chưa có dữ liệu
          </div>
        )}
      </Card>
    </div>
  )
}

interface SummaryStatProps {
  label: string
  value: number | string
  color: string
}

function SummaryStat({ label, value, color }: SummaryStatProps) {
  return (
    <div style={{
      padding: '10px 14px',
      background: '#ffffff',
      border: '1px solid #e4e4e7',
      borderLeft: `3px solid ${color}`,
      borderRadius: 8,
    }}>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}
