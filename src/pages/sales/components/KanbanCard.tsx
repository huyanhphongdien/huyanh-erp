// ============================================================================
// KanbanCard — single order card in Kanban board
// File: src/pages/sales/components/KanbanCard.tsx
// ============================================================================

import { useNavigate } from 'react-router-dom'
import {
  type SalesStage,
  getSLAStatus,
  formatDwell,
  SLA_PILL_COLORS,
} from '../../../services/sales/salesStages'

export interface KanbanOrder {
  id: string
  code: string
  contract_no: string | null
  customer_short: string
  grade: string
  quantity_tons: number | null
  total_value_usd: number | null
  delivery_date: string | null
  etd: string | null
  current_stage: SalesStage
  stage_started_at: string | null
  stage_sla_hours: number | null
  current_owner_name: string | null
}

interface KanbanCardProps {
  order: KanbanOrder
  onDragStart: (orderId: string) => void
  onDragEnd: () => void
}

export default function KanbanCard({ order, onDragStart, onDragEnd }: KanbanCardProps) {
  const navigate = useNavigate()

  const elapsedHours = order.stage_started_at
    ? (Date.now() - new Date(order.stage_started_at).getTime()) / (1000 * 3600)
    : null
  const slaStatus = getSLAStatus(order.stage_started_at, order.stage_sla_hours, order.current_stage)
  const slaColors = SLA_PILL_COLORS[slaStatus]

  const etdLabel = order.etd || order.delivery_date
  const daysToETD = etdLabel
    ? Math.ceil((new Date(etdLabel).getTime() - Date.now()) / (1000 * 3600 * 24))
    : null

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', order.id)
    e.currentTarget.classList.add('dragging')
    onDragStart(order.id)
  }

  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('dragging')
    onDragEnd()
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => navigate(`/sales/orders/${order.id}`)}
      style={{
        background: '#ffffff',
        border: `1px solid ${slaColors.fg}40`,
        borderLeft: `3px solid ${slaColors.fg}`,
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 8,
        cursor: 'grab',
        userSelect: 'none',
        transition: 'all 0.15s',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.1)' }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)' }}
    >
      {/* Top row: code + value */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#111111', fontFamily: 'JetBrains Mono, monospace' }}>
          {order.code}
        </span>
        {order.total_value_usd != null && (
          <span style={{ fontSize: 10, color: '#6b7280' }}>
            ${(order.total_value_usd / 1000).toFixed(0)}K
          </span>
        )}
      </div>

      {/* Customer + grade */}
      <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>
        <strong>{order.customer_short}</strong>
        {order.grade && <span style={{ marginLeft: 6, color: '#6b7280' }}>· {order.grade}</span>}
      </div>

      {/* Owner */}
      {order.current_owner_name && (
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
          👤 {order.current_owner_name}
        </div>
      )}

      {/* Footer: dwell + ETD countdown */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: slaColors.fg, fontWeight: 500 }}>
          ⏱ {formatDwell(elapsedHours)}
          {slaStatus === 'overdue' && ' QUÁ SLA'}
          {slaStatus === 'at_risk' && ' (cận)'}
        </span>
        {etdLabel && daysToETD !== null && (
          <span style={{
            fontSize: 10,
            color: daysToETD < 0 ? '#ff5b4f' : daysToETD < 7 ? '#f59e0b' : '#6b7280',
            fontWeight: 500,
          }}>
            {daysToETD < 0
              ? `ETD ${Math.abs(daysToETD)}d trước`
              : daysToETD === 0
                ? 'ETD hôm nay'
                : `ETD ${daysToETD}d`}
          </span>
        )}
      </div>
    </div>
  )
}
