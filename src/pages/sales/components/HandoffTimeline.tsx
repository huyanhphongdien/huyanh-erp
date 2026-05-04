// ============================================================================
// HandoffTimeline — vertical audit timeline of stage handoffs
// File: src/pages/sales/components/HandoffTimeline.tsx
// Sprint 1 D4 (Sales Tracking & Control)
// ============================================================================

import { useEffect, useState } from 'react'
import { Spin, Empty, Button } from 'antd'
import { RefreshCw } from 'lucide-react'
import {
  type SalesStage,
  SALES_STAGE_LABELS,
  SALES_STAGE_EMOJI,
  formatDwell,
} from '../../../services/sales/salesStages'
import { salesStageService, type HandoffRow } from '../../../services/sales/salesStageService'

interface HandoffTimelineProps {
  orderId: string
  orderCode: string
  currentStage: SalesStage
  stageStartedAt: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
}

export default function HandoffTimeline({
  orderId,
  orderCode,
  currentStage,
  stageStartedAt,
}: HandoffTimelineProps) {
  const [handoffs, setHandoffs] = useState<HandoffRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = async () => {
    setLoading(true)
    const rows = await salesStageService.getHandoffHistory(orderId)
    setHandoffs(rows)
    setLoading(false)
  }

  useEffect(() => { fetch() }, [orderId])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
  }

  // Compute current dwell at the active stage
  const currentDwellHours = stageStartedAt
    ? (Date.now() - new Date(stageStartedAt).getTime()) / (1000 * 3600)
    : null

  // Total elapsed time = sum dwell + current
  const totalDwell = handoffs.reduce((sum, h) => sum + (Number(h.dwell_time_hours) || 0), 0)
    + (currentDwellHours || 0)

  return (
    <div style={{ padding: '8px 0', maxWidth: 760 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, color: '#111' }}>🕒 Lịch sử di chuyển — {orderCode}</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#6b7280' }}>
            {handoffs.length} lần chuyển bộ phận · Tổng thời gian: <strong>{formatDwell(totalDwell)}</strong>
          </p>
        </div>
        <Button size="small" icon={<RefreshCw size={12} />} onClick={fetch}>Làm mới</Button>
      </div>

      {handoffs.length === 0 ? (
        <Empty description="Chưa có lịch sử chuyển bộ phận" style={{ marginTop: 32 }} />
      ) : (
        <div style={{ position: 'relative', paddingLeft: 24 }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute',
            left: 8,
            top: 12,
            bottom: 24,
            width: 2,
            background: '#e4e4e7',
          }} />

          {/* Initial create node */}
          {handoffs.length > 0 && handoffs[0].from_dept && (
            <TimelineNode
              dotColor="#6b7280"
              title="Khởi tạo đơn"
              meta={`Bắt đầu tại ${SALES_STAGE_EMOJI[handoffs[0].from_dept!]} ${SALES_STAGE_LABELS[handoffs[0].from_dept!]}`}
              when={null}
              isFirst
            />
          )}

          {/* Each handoff */}
          {handoffs.map((h, idx) => (
            <TimelineNode
              key={h.id}
              dotColor="#0a72ef"
              title={
                <span>
                  {h.from_dept ? `${SALES_STAGE_EMOJI[h.from_dept]} ${SALES_STAGE_LABELS[h.from_dept]}` : 'Tạo đơn'}
                  <span style={{ margin: '0 8px', color: '#6b7280' }}>→</span>
                  {SALES_STAGE_EMOJI[h.to_dept as SalesStage]} {SALES_STAGE_LABELS[h.to_dept as SalesStage]}
                </span>
              }
              meta={
                <>
                  {h.passer && <span>NV chuyển: <strong>{h.passer.full_name}</strong> ({h.passer.code})</span>}
                  {h.dwell_time_hours != null && (
                    <span style={{ marginLeft: 12, color: '#6b7280' }}>
                      Dừng {formatDwell(Number(h.dwell_time_hours))}
                    </span>
                  )}
                </>
              }
              when={formatDate(h.passed_at)}
              notes={h.passed_notes}
              isLast={idx === handoffs.length - 1}
            />
          ))}

          {/* Current stage node */}
          <TimelineNode
            dotColor="#10b981"
            title={
              <span>
                <strong style={{ color: '#10b981' }}>HIỆN TẠI:</strong>{' '}
                {SALES_STAGE_EMOJI[currentStage]} {SALES_STAGE_LABELS[currentStage]}
              </span>
            }
            meta={
              currentDwellHours != null
                ? <span>Đang giữ <strong>{formatDwell(currentDwellHours)}</strong></span>
                : 'Mới chuyển vào'
            }
            when={stageStartedAt ? formatDate(stageStartedAt) : '—'}
            isLast
            isCurrent
          />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Sub: TimelineNode
// ============================================================================
interface TimelineNodeProps {
  title: React.ReactNode
  meta?: React.ReactNode
  when: string | null
  notes?: string | null
  dotColor: string
  isFirst?: boolean
  isLast?: boolean
  isCurrent?: boolean
}

function TimelineNode({
  title, meta, when, notes, dotColor, isFirst, isLast, isCurrent,
}: TimelineNodeProps) {
  return (
    <div style={{ position: 'relative', paddingLeft: 8, paddingBottom: isLast ? 0 : 18 }}>
      {/* Dot */}
      <div style={{
        position: 'absolute',
        left: -24,
        top: 4,
        width: 16,
        height: 16,
        borderRadius: 9999,
        background: '#ffffff',
        border: `3px solid ${dotColor}`,
        boxSizing: 'border-box',
        boxShadow: isCurrent ? `0 0 0 4px ${dotColor}33` : undefined,
      }} />

      {/* Content */}
      <div style={{
        background: isCurrent ? '#f0fdf4' : isFirst ? '#f8f9fa' : '#ffffff',
        border: `1px solid ${isCurrent ? '#86efac' : '#e4e4e7'}`,
        borderRadius: 8,
        padding: '10px 14px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#111', marginBottom: 2 }}>
          {title}
        </div>
        {when && (
          <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'JetBrains Mono, monospace' }}>
            {when}
          </div>
        )}
        {meta && (
          <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>
            {meta}
          </div>
        )}
        {notes && (
          <div style={{
            fontSize: 12,
            color: '#374151',
            marginTop: 6,
            padding: '6px 10px',
            background: '#f8f9fa',
            borderRadius: 4,
            borderLeft: '2px solid #d4d4d8',
          }}>
            <em>"{notes}"</em>
          </div>
        )}
      </div>
    </div>
  )
}
