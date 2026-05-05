// ============================================================================
// SalesWatchlistPage — BGĐ overview: đơn nào sắp quá hạn, ai đang giữ
// File: src/pages/sales/SalesWatchlistPage.tsx
// ============================================================================
//
// Mục đích: BGĐ mở 1 trang là thấy ngay các đơn cần lưu ý, sắp xếp theo
// mức độ khẩn (đơn nào sắp quá ETD → trên đầu). Mỗi dòng:
//   - Mã + khách
//   - ETD countdown (đỏ: quá hạn, cam: ≤ 7 ngày, xanh: bình thường)
//   - StagePill (đang ở bộ phận nào + SLA progress)
//   - Owner phụ trách
//   - Giá trị
//
// Khác Kanban: Kanban là "phân lane theo bộ phận", Watchlist là "sort theo
// urgency" — BGĐ scan từ trên xuống, không cần switch lane nào trước.
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { Card, Tag, Tooltip, Spin, message, Segmented, Button } from 'antd'
import { RefreshCw, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  type SalesStage,
  SALES_STAGE_LABELS,
  SALES_STAGE_EMOJI,
  getSLAStatus,
} from '../../services/sales/salesStages'
import StagePill from '../../components/common/StagePill'
import SalesOrderDetailPanel from './components/SalesOrderDetailPanel'

interface WatchlistOrder {
  id: string
  code: string
  contract_no: string | null
  customer_short: string
  grade: string | null
  total_value_usd: number | null
  delivery_date: string | null
  etd: string | null
  current_stage: SalesStage
  stage_started_at: string | null
  stage_sla_hours: number | null
  current_owner_name: string | null
  status: string
}

type FilterMode = 'urgent' | 'overdue_eta' | 'overdue_sla' | 'all_active'

const FILTER_OPTIONS = [
  { label: '🔥 Khẩn (≤7d)', value: 'urgent' as FilterMode },
  { label: '🚨 Quá ETD', value: 'overdue_eta' as FilterMode },
  { label: '⚠ Quá SLA bộ phận', value: 'overdue_sla' as FilterMode },
  { label: '📋 Tất cả đơn active', value: 'all_active' as FilterMode },
]

export default function SalesWatchlistPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<WatchlistOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filterMode, setFilterMode] = useState<FilterMode>('urgent')
  const [panelOrderId, setPanelOrderId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const fetchOrders = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('sales_orders')
      .select(`
        id, code, contract_no, grade, total_value_usd,
        delivery_date, etd, status, current_stage, current_owner_id,
        stage_started_at, stage_sla_hours,
        customer:sales_customers!sales_orders_customer_id_fkey(short_name, name),
        owner:employees!sales_orders_current_owner_id_fkey(full_name)
      `)
      .neq('status', 'cancelled')
      .neq('current_stage', 'delivered')
      .order('etd', { ascending: true, nullsFirst: false })

    setLoading(false)
    if (error) {
      message.error('Lỗi tải danh sách: ' + error.message)
      return
    }

    const mapped: WatchlistOrder[] = (data || []).map((o: any) => {
      const customer = Array.isArray(o.customer) ? o.customer[0] : o.customer
      const owner = Array.isArray(o.owner) ? o.owner[0] : o.owner
      return {
        id: o.id,
        code: o.code,
        contract_no: o.contract_no,
        customer_short: customer?.short_name || customer?.name || '—',
        grade: o.grade,
        total_value_usd: o.total_value_usd,
        delivery_date: o.delivery_date,
        etd: o.etd,
        current_stage: (o.current_stage as SalesStage) || 'sales',
        stage_started_at: o.stage_started_at,
        stage_sla_hours: o.stage_sla_hours,
        current_owner_name: owner?.full_name || null,
        status: o.status,
      }
    })
    setOrders(mapped)
  }

  useEffect(() => { fetchOrders() }, [])

  const filtered = useMemo(() => {
    const now = Date.now()
    const within = (dateStr: string | null, days: number) => {
      if (!dateStr) return false
      const ms = new Date(dateStr).getTime() - now
      const diffDays = ms / (1000 * 3600 * 24)
      return diffDays <= days && diffDays >= 0
    }
    const isOverdue = (dateStr: string | null) => {
      if (!dateStr) return false
      return new Date(dateStr).getTime() < now
    }

    return orders.filter(o => {
      switch (filterMode) {
        case 'urgent':
          return within(o.etd, 7) || isOverdue(o.etd)
        case 'overdue_eta':
          return isOverdue(o.etd)
        case 'overdue_sla':
          return getSLAStatus(o.stage_started_at, o.stage_sla_hours, o.current_stage) === 'overdue'
        case 'all_active':
        default:
          return true
      }
    })
  }, [orders, filterMode])

  const stats = useMemo(() => {
    const now = Date.now()
    const overdueEta = orders.filter(o => o.etd && new Date(o.etd).getTime() < now).length
    const within7 = orders.filter(o => {
      if (!o.etd) return false
      const ms = new Date(o.etd).getTime() - now
      return ms >= 0 && ms <= 7 * 86400000
    }).length
    const overdueSla = orders.filter(o =>
      getSLAStatus(o.stage_started_at, o.stage_sla_hours, o.current_stage) === 'overdue',
    ).length
    return { overdueEta, within7, overdueSla, total: orders.length }
  }, [orders])

  return (
    <div style={{ padding: 16, maxWidth: 1400, margin: '0 auto' }}>
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: '#1B4D3E', fontSize: 17, fontWeight: 700 }}>
              🎯 BGĐ Watchlist — Đơn cần lưu ý
            </span>
          </div>
        }
        extra={
          <Button icon={<RefreshCw size={14} />} onClick={fetchOrders} loading={loading} size="small">
            Refresh
          </Button>
        }
        style={{ borderRadius: 12 }}
        bodyStyle={{ padding: 12 }}
      >
        {/* Stats summary */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
          marginBottom: 14,
        }}>
          <StatCard
            icon={<AlertTriangle size={18} />}
            label="Quá ETD"
            value={stats.overdueEta}
            color="#cf1322"
          />
          <StatCard
            icon={<Clock size={18} />}
            label="ETD ≤ 7 ngày"
            value={stats.within7}
            color="#fa8c16"
          />
          <StatCard
            icon={<AlertTriangle size={18} />}
            label="Quá SLA bộ phận"
            value={stats.overdueSla}
            color="#d4380d"
          />
          <StatCard
            icon={<CheckCircle2 size={18} />}
            label="Tổng active (chưa giao)"
            value={stats.total}
            color="#1B4D3E"
          />
        </div>

        {/* Filter segmented */}
        <div style={{ marginBottom: 12 }}>
          <Segmented
            options={FILTER_OPTIONS}
            value={filterMode}
            onChange={(v) => setFilterMode(v as FilterMode)}
            size="small"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
            🎉 Không có đơn nào trong nhóm này
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              fontSize: 13,
              borderCollapse: 'collapse',
              minWidth: 1100,
            }}>
              <thead>
                <tr style={{ background: '#fafafa', textAlign: 'left' }}>
                  <Th>#</Th>
                  <Th>Mã</Th>
                  <Th>Khách</Th>
                  <Th>Grade</Th>
                  <Th align="right">Giá trị</Th>
                  <Th>ETD</Th>
                  <Th>Bộ phận hiện tại</Th>
                  <Th>Người phụ trách</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o, idx) => {
                  const etdInfo = computeEtdInfo(o.etd)
                  return (
                    <tr
                      key={o.id}
                      onClick={() => { setPanelOrderId(o.id); setPanelOpen(true) }}
                      style={{
                        borderTop: '1px solid #f0f0f0',
                        cursor: 'pointer',
                        background: etdInfo.rowBg,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = etdInfo.hoverBg)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = etdInfo.rowBg)}
                    >
                      <Td style={{ color: '#9ca3af', fontFamily: 'monospace', width: 32 }}>
                        {idx + 1}
                      </Td>
                      <Td>
                        <div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>
                          {o.contract_no || o.code}
                        </div>
                        {o.contract_no && (
                          <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>
                            {o.code}
                          </div>
                        )}
                      </Td>
                      <Td><span style={{ fontSize: 12 }}>{o.customer_short}</span></Td>
                      <Td>
                        {o.grade && (
                          <Tag color="green" style={{ marginInlineEnd: 0, fontSize: 11 }}>
                            {o.grade}
                          </Tag>
                        )}
                      </Td>
                      <Td align="right">
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#1B4D3E', fontWeight: 600 }}>
                          {o.total_value_usd
                            ? '$' + (o.total_value_usd / 1000).toFixed(0) + 'K'
                            : '—'}
                        </span>
                      </Td>
                      <Td>
                        <Tooltip title={o.etd ? `ETD: ${o.etd}` : 'Chưa có ETD'}>
                          <Tag color={etdInfo.tagColor} style={{ marginInlineEnd: 0, fontSize: 11, fontWeight: 600 }}>
                            {etdInfo.label}
                          </Tag>
                        </Tooltip>
                      </Td>
                      <Td>
                        <StagePill
                          stage={o.current_stage}
                          stageStartedAt={o.stage_started_at}
                          slaHours={o.stage_sla_hours}
                          variant="compact"
                        />
                      </Td>
                      <Td>
                        <span style={{ fontSize: 12, color: o.current_owner_name ? '#374151' : '#9ca3af' }}>
                          {o.current_owner_name ? `👤 ${o.current_owner_name}` : 'Chưa gán'}
                        </span>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer note */}
        <div style={{ marginTop: 14, padding: '8px 12px', background: '#f8f9fa', borderRadius: 6, fontSize: 11, color: '#6b7280' }}>
          ℹ️ Click vô dòng để mở chi tiết. Đã sort theo ETD tăng dần (đơn sắp quá hạn lên trước).
          Loại trừ đơn đã giao + đơn hủy.
        </div>
      </Card>

      <SalesOrderDetailPanel
        orderId={panelOrderId}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onOrderUpdated={fetchOrders}
      />
    </div>
  )
}

// ── Helpers ──

function computeEtdInfo(etd: string | null): {
  label: string
  tagColor: string
  rowBg: string
  hoverBg: string
} {
  if (!etd) return { label: '—', tagColor: 'default', rowBg: '#ffffff', hoverBg: '#f9fafb' }
  const ms = new Date(etd).getTime() - Date.now()
  const days = Math.ceil(ms / (1000 * 3600 * 24))

  if (days < 0) {
    return {
      label: `Quá ${Math.abs(days)}d`,
      tagColor: 'red',
      rowBg: '#fff1f0',  // light red bg
      hoverBg: '#ffccc7',
    }
  }
  if (days <= 7) {
    return {
      label: `${days}d`,
      tagColor: 'orange',
      rowBg: '#fff7e6',  // light amber
      hoverBg: '#ffe7ba',
    }
  }
  if (days <= 30) {
    return {
      label: `${days}d`,
      tagColor: 'gold',
      rowBg: '#ffffff',
      hoverBg: '#fafafa',
    }
  }
  return {
    label: `${days}d`,
    tagColor: 'default',
    rowBg: '#ffffff',
    hoverBg: '#fafafa',
  }
}

interface ThProps { children: React.ReactNode; align?: 'left' | 'right' | 'center' }
function Th({ children, align = 'left' }: ThProps) {
  return (
    <th style={{
      padding: '8px 10px',
      fontSize: 11,
      color: '#6b7280',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      textAlign: align,
    }}>
      {children}
    </th>
  )
}

interface TdProps { children: React.ReactNode; align?: 'left' | 'right' | 'center'; style?: React.CSSProperties }
function Td({ children, align = 'left', style }: TdProps) {
  return (
    <td style={{
      padding: '10px 10px',
      textAlign: align,
      verticalAlign: 'middle',
      ...style,
    }}>
      {children}
    </td>
  )
}

interface StatCardProps { icon: React.ReactNode; label: string; value: number; color: string }
function StatCard({ icon, label, value, color }: StatCardProps) {
  return (
    <div style={{
      padding: '10px 14px',
      background: '#ffffff',
      border: '1px solid #e4e4e7',
      borderLeft: `3px solid ${color}`,
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <span style={{ color }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      </div>
    </div>
  )
}
