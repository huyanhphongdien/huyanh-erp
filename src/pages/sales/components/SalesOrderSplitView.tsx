// ============================================================================
// SALES ORDER SPLIT VIEW — Linear/Gmail-style 2-column layout
// File: src/pages/sales/components/SalesOrderSplitView.tsx
//
// Layout: Compact list trái (~460px) + Detail panel phải (1fr).
// Click order → detail update tức thì, KHÔNG mất scroll.
// J/K phím → chuyển order lên/xuống.
// ============================================================================

import { useState, useEffect, useMemo, useRef } from 'react'
import { Tag, Empty } from 'antd'
import type { SalesOrder, SalesOrderStatus } from '../../../services/sales/salesTypes'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../../../services/sales/salesTypes'
import SalesOrderDetailPanel from './SalesOrderDetailPanel'
import { getSLAStatus } from '../../../services/sales/salesStages'
import type { SalesStage } from '../../../services/sales/salesStages'

const PRIMARY = '#1B4D3E'
const PRIMARY_BG = '#f0f9f4'
const PRIMARY_BG2 = '#d9f4e3'

const COUNTRY_FLAGS: Record<string, string> = {
  IN: '🇮🇳', PH: '🇵🇭', ID: '🇮🇩', KR: '🇰🇷', SG: '🇸🇬', FR: '🇫🇷',
  AE: '🇦🇪', TW: '🇹🇼', TR: '🇹🇷', ES: '🇪🇸', BD: '🇧🇩', CN: '🇨🇳', LK: '🇱🇰',
  JP: '🇯🇵', MY: '🇲🇾', US: '🇺🇸', DE: '🇩🇪', VN: '🇻🇳',
}

const fmtUSD = (v: number | undefined | null) => {
  if (!v) return '—'
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`
  return `$${Math.round(v)}`
}

interface Props {
  orders: SalesOrder[]
  loading?: boolean
  onOrderUpdated?: () => void
}

export default function SalesOrderSplitView({ orders, loading, onOrderUpdated }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Auto select first order if nothing selected
  useEffect(() => {
    if (!selectedId && orders.length > 0) {
      setSelectedId(orders[0].id)
    }
    // Nếu order đang chọn không còn trong list (do filter) → chọn lại order đầu
    if (selectedId && !orders.find((o) => o.id === selectedId) && orders.length > 0) {
      setSelectedId(orders[0].id)
    }
  }, [orders, selectedId])

  // J/K keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore khi đang gõ input/textarea
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key !== 'j' && e.key !== 'k') return

      e.preventDefault()
      const currentIdx = orders.findIndex((o) => o.id === selectedId)
      if (currentIdx < 0) return
      const newIdx =
        e.key === 'j'
          ? Math.min(currentIdx + 1, orders.length - 1)
          : Math.max(currentIdx - 1, 0)
      if (newIdx !== currentIdx) {
        const newId = orders[newIdx].id
        setSelectedId(newId)
        // Scroll item into view
        const item = listRef.current?.querySelector(`[data-order-id="${newId}"]`)
        item?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [orders, selectedId])

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedId) || null,
    [orders, selectedId],
  )

  return (
    <div style={splitContainer}>
      {/* ═══ LEFT: COMPACT LIST ═══ */}
      <div style={panelLeft}>
        <div style={listHeader}>
          <span>
            <strong style={{ color: PRIMARY }}>{orders.length}</strong> đơn ·
            phím <span style={kbd}>J</span><span style={kbd}>K</span> chuyển
          </span>
        </div>

        <div ref={listRef} style={{ flex: 1, overflowY: 'auto' }}>
          {loading && orders.length === 0 ? (
            <div style={emptyStyle}>Đang tải...</div>
          ) : orders.length === 0 ? (
            <Empty description="Không có đơn hàng" style={{ padding: 48 }} />
          ) : (
            orders.map((order) => (
              <OrderItem
                key={order.id}
                order={order}
                selected={order.id === selectedId}
                onClick={() => setSelectedId(order.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ═══ RIGHT: DETAIL ═══ */}
      <div style={panelRight}>
        {selectedOrder ? (
          <SalesOrderDetailPanel
            key={selectedOrder.id}
            orderId={selectedOrder.id}
            open={true}
            onClose={() => {}}
            onOrderUpdated={onOrderUpdated}
            inline={true}
          />
        ) : (
          <div style={emptyDetailStyle}>
            <div style={{ fontSize: 64, opacity: 0.2 }}>📋</div>
            <div style={{ marginTop: 12, color: '#8c8c8c' }}>
              Chọn đơn hàng bên trái để xem chi tiết
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: '#bfbfbf' }}>
              Hoặc bấm <span style={kbd}>Ctrl</span><span style={kbd}>K</span> để tìm nhanh
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Order list item ─────────────────────────────────────────────────

function OrderItem({ order, selected, onClick }: {
  order: SalesOrder
  selected: boolean
  onClick: () => void
}) {
  const flag = COUNTRY_FLAGS[order.customer?.country || ''] || '🌐'
  const slaStatus = getSLAStatus(
    order.stage_started_at || null,
    order.stage_sla_hours || null,
    (order.current_stage as SalesStage) || null,
  )
  const slaColor =
    slaStatus === 'overdue' ? '#cf1322'
    : slaStatus === 'at_risk' ? '#d46b08'
    : slaStatus === 'on_track' ? '#389e0d'
    : slaStatus === 'done' ? '#bfbfbf'
    : '#d9d9d9'

  // Container count
  const containers = (order as { container_count?: number }).container_count
  const incoterm = (order as { incoterm?: string }).incoterm || ''
  const contType = (order as { container_type?: string }).container_type || '20DC'

  // Days overdue (cho SLA pill)
  let daysOver: number | null = null
  if (slaStatus === 'overdue' && order.stage_started_at && order.stage_sla_hours) {
    const elapsedH = (Date.now() - new Date(order.stage_started_at).getTime()) / 3600000
    daysOver = Math.ceil((elapsedH - order.stage_sla_hours) / 24)
  }

  return (
    <div
      data-order-id={order.id}
      style={{
        ...itemStyle,
        background: selected ? PRIMARY_BG : 'transparent',
        boxShadow: selected ? `inset 3px 0 0 ${PRIMARY}` : 'none',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = '#fafafa'
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      <div style={itemAvatar}>{flag}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={itemCode}>
            {order.contract_no || order.code || order.id.slice(0, 8)}
          </span>
          {slaStatus !== 'pending' && slaStatus !== 'done' && (
            <span
              title={`SLA: ${slaStatus}`}
              style={{
                width: 8, height: 8, borderRadius: 4,
                background: slaColor, flexShrink: 0,
              }}
            />
          )}
        </div>
        <div
          style={{
            fontSize: 12, color: '#595959', marginTop: 2, fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {order.customer?.name || '—'}
        </div>
        <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4, display: 'flex',
                       gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>📦 {order.grade || '—'} · {(order.quantity_tons || 0).toFixed(2)}MT</span>
          {(incoterm || containers) && (
            <>
              <span style={{ color: '#d9d9d9' }}>·</span>
              <span>🚢 {incoterm} {containers ? `· ${containers}×${contType}` : ''}</span>
            </>
          )}
        </div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Tag
            color={ORDER_STATUS_COLORS[order.status as SalesOrderStatus]}
            style={{
              fontSize: 10, padding: '1px 7px', margin: 0,
              borderRadius: 10, lineHeight: '16px',
            }}
          >
            {ORDER_STATUS_LABELS[order.status as SalesOrderStatus] || order.status}
          </Tag>
          {daysOver !== null && daysOver > 0 && (
            <Tag
              color="error"
              style={{
                fontSize: 10, padding: '1px 7px', margin: 0,
                borderRadius: 10, lineHeight: '16px',
              }}
            >
              ⚠ +{daysOver}d SLA
            </Tag>
          )}
          <span style={itemValue}>{fmtUSD(order.total_value_usd)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────

const splitContainer: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '460px 1fr',
  height: 'calc(100vh - 280px)',
  minHeight: 600,
  background: '#fff',
  borderRadius: 8,
  border: '1px solid #e8e8e8',
  overflow: 'hidden',
}

const panelLeft: React.CSSProperties = {
  background: '#fff',
  borderRight: '1px solid #e8e8e8',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const panelRight: React.CSSProperties = {
  background: '#fafafa',
  overflow: 'auto',
  position: 'relative',
}

const listHeader: React.CSSProperties = {
  padding: '8px 16px',
  background: '#fafafa',
  borderBottom: '1px solid #e8e8e8',
  fontSize: 11,
  color: '#8c8c8c',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexShrink: 0,
}

const itemStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #f0f0f0',
  cursor: 'pointer',
  transition: 'background 0.15s',
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
}

const itemAvatar: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  background: '#f5f5f5',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  flexShrink: 0,
}

const itemCode: React.CSSProperties = {
  fontWeight: 700, fontSize: 12, color: PRIMARY,
  fontFamily: 'monospace',
}

const itemValue: React.CSSProperties = {
  marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: PRIMARY,
  fontFamily: 'monospace',
}

const emptyStyle: React.CSSProperties = {
  padding: 48, textAlign: 'center', color: '#bfbfbf', fontSize: 13,
}

const emptyDetailStyle: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 48,
  textAlign: 'center',
}

const kbd: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', padding: '1px 5px',
  background: '#fff', border: '1px solid #d9d9d9', borderRadius: 3,
  fontFamily: 'monospace', fontSize: 10, color: '#595959',
  marginLeft: 3, marginRight: 1,
  boxShadow: '0 1px 0 #d9d9d9',
}

// Re-export utility — give it a placeholder reference for ESLint
void PRIMARY_BG2
