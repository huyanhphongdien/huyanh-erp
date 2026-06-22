// ============================================================================
// STATUS HISTORY TAB — Lịch sử đổi TRẠNG THÁI đơn hàng bán (ai · khi · từ→tới)
// File: src/pages/sales/components/StatusHistoryTab.tsx
// Nguồn: sales_order_status_log (migration sales_order_status_log.sql)
// ============================================================================
import { useEffect, useState, useCallback } from 'react'
import { Timeline, Empty, Spin, Tag } from 'antd'
import { HistoryOutlined, UserOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { salesOrderService } from '../../../services/sales/salesOrderService'
import { ORDER_STATUS_LABELS, type SalesOrderStatus, type SalesOrderStatusLog } from '../../../services/sales/salesTypes'

const statusLabel = (s?: string | null) =>
  s ? (ORDER_STATUS_LABELS[s as SalesOrderStatus] || s) : '—'

export default function StatusHistoryTab({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<SalesOrderStatusLog[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await salesOrderService.getStatusLog(orderId)) } catch { /* ignore */ }
    setLoading(false)
  }, [orderId])
  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div>
  if (rows.length === 0) {
    return <Empty description="Chưa có lịch sử đổi trạng thái (chỉ ghi từ khi bật tính năng)" style={{ padding: 40 }} />
  }

  return (
    <div style={{ padding: '8px 4px' }}>
      <div style={{ fontWeight: 700, marginBottom: 14, color: '#1B4D3E', fontSize: 14 }}>
        <HistoryOutlined /> Lịch sử đổi trạng thái <Tag style={{ marginLeft: 4 }}>{rows.length}</Tag>
      </div>
      <Timeline
        items={rows.map((r) => ({
          color: r.to_status === 'cancelled' ? 'red' : 'green',
          children: (
            <div>
              <div style={{ fontSize: 13 }}>
                <Tag>{statusLabel(r.from_status)}</Tag>
                <span style={{ color: '#9ca3af' }}>→</span>{' '}
                <Tag color={r.to_status === 'cancelled' ? 'red' : 'blue'}>{statusLabel(r.to_status)}</Tag>
              </div>
              <div style={{ fontSize: 12.5, color: '#374151', marginTop: 3 }}>
                <UserOutlined /> <b>{r.changed_by_name || 'Hệ thống'}</b>
                {r.source === 'system' && <Tag color="default" style={{ marginLeft: 6, fontSize: 11 }}>tự động</Tag>}
              </div>
              {r.reason && <div style={{ fontSize: 12, color: '#92400E', marginTop: 2 }}>📝 {r.reason}</div>}
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                {dayjs(r.created_at).format('HH:mm · DD/MM/YYYY')}
              </div>
            </div>
          ),
        }))}
      />
    </div>
  )
}
