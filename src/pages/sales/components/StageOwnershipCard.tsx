// ============================================================================
// StageOwnershipCard — current stage display + transition action
// File: src/pages/sales/components/StageOwnershipCard.tsx
// Pattern: Cal.com clean card + Vercel pill status
// ============================================================================

import { useState, useEffect, useMemo } from 'react'
import { Modal, Input, message, Button, Tag } from 'antd'
import { useAuthStore } from '../../../stores/authStore'
import { salesStageService } from '../../../services/sales/salesStageService'
import {
  type SalesStage,
  SALES_STAGE_LABELS,
  SALES_STAGE_EMOJI,
  SALES_STAGE_NEXT,
  SLA_PILL_COLORS,
  getSLAStatus,
  formatDwell,
} from '../../../services/sales/salesStages'
import StagePill from '../../../components/common/StagePill'

interface StageOwnershipCardProps {
  orderId: string
  orderCode: string
  currentStage: SalesStage
  currentOwnerName: string | null
  stageStartedAt: string | null
  stageSlaHours: number | null
  onChanged?: () => void
}

const { TextArea } = Input

export default function StageOwnershipCard({
  orderId,
  orderCode,
  currentStage,
  currentOwnerName,
  stageStartedAt,
  stageSlaHours,
  onChanged,
}: StageOwnershipCardProps) {
  const user = useAuthStore(s => s.user)
  const [, forceUpdate] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Tick mỗi 30s để update SLA elapsed
  useEffect(() => {
    const id = setInterval(() => forceUpdate(x => x + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const elapsedHours = useMemo(() => {
    if (!stageStartedAt) return null
    return (Date.now() - new Date(stageStartedAt).getTime()) / (1000 * 3600)
  }, [stageStartedAt])

  const slaStatus = getSLAStatus(stageStartedAt, stageSlaHours, currentStage)
  const slaColors = SLA_PILL_COLORS[slaStatus]
  const nextStage = SALES_STAGE_NEXT[currentStage]
  const isTerminal = !nextStage

  const slaProgress = useMemo(() => {
    if (!stageSlaHours || !elapsedHours) return null
    const pct = Math.min(100, (elapsedHours / stageSlaHours) * 100)
    return Math.round(pct)
  }, [elapsedHours, stageSlaHours])

  const handleConfirmTransition = async () => {
    if (!user?.employee_id) {
      message.error('Không xác định được user — vui lòng login lại')
      return
    }
    setSubmitting(true)
    const res = await salesStageService.passToNext(
      orderId,
      currentStage,
      user.employee_id,
      notes || undefined,
    )
    setSubmitting(false)
    if (res.success) {
      message.success(`Đã chuyển ${orderCode} sang ${SALES_STAGE_LABELS[nextStage!]}`)
      setModalOpen(false)
      setNotes('')
      onChanged?.()
    } else {
      message.error(res.error || 'Lỗi chuyển stage')
    }
  }

  return (
    <div style={{
      borderRadius: 12,
      padding: 24,
      background: '#f8f9fa',
      border: '1px solid #e5e7eb',
      maxWidth: 560,
    }}>
      {/* Header — current stage */}
      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>
        ĐANG Ở
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 28 }}>{SALES_STAGE_EMOJI[currentStage]}</span>
        <span style={{ fontSize: 22, fontWeight: 600, color: '#111111' }}>
          {SALES_STAGE_LABELS[currentStage]}
        </span>
      </div>

      {/* Owner + dwell time */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Owner</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#111111' }}>
            {currentOwnerName || <span style={{ color: '#a1a1aa' }}>Chưa gán</span>}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Đã giữ</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#111111' }}>
            {formatDwell(elapsedHours)}
          </div>
        </div>
      </div>

      {/* SLA progress bar */}
      {!isTerminal && stageSlaHours && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#6b7280' }}>SLA</span>
            <Tag color={slaStatus === 'overdue' ? 'red' : slaStatus === 'at_risk' ? 'orange' : 'blue'} style={{ fontSize: 10, margin: 0 }}>
              {slaStatus === 'overdue' && `Quá ${formatDwell((elapsedHours || 0) - stageSlaHours)}`}
              {slaStatus === 'at_risk' && `Cận ${formatDwell(stageSlaHours - (elapsedHours || 0))}`}
              {slaStatus === 'on_track' && `Còn ${formatDwell(stageSlaHours - (elapsedHours || 0))}`}
              {slaStatus === 'pending' && `${stageSlaHours}h`}
            </Tag>
          </div>
          {slaProgress !== null && (
            <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${slaProgress}%`,
                height: '100%',
                background: slaColors.fg,
                transition: 'width 0.3s',
              }} />
            </div>
          )}
        </div>
      )}

      {/* Next stage preview */}
      {!isTerminal && nextStage && (
        <div style={{
          padding: '10px 12px',
          background: '#ffffff',
          borderRadius: 8,
          marginBottom: 16,
          border: '1px dashed #d4d4d8',
        }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>
            BỘ PHẬN TIẾP THEO
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{SALES_STAGE_EMOJI[nextStage]}</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{SALES_STAGE_LABELS[nextStage]}</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!isTerminal && (
          <Button
            type="primary"
            onClick={() => setModalOpen(true)}
            style={{ background: '#111111', borderColor: '#111111' }}
          >
            ✓ Mark done & Chuyển {SALES_STAGE_LABELS[nextStage!]}
          </Button>
        )}
        {isTerminal && (
          <StagePill stage={currentStage} status="done" />
        )}
      </div>

      {/* Confirm modal */}
      <Modal
        title={`Chuyển ${orderCode} sang ${nextStage ? SALES_STAGE_LABELS[nextStage] : ''}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleConfirmTransition}
        confirmLoading={submitting}
        okText="Xác nhận chuyển"
        cancelText="Hủy"
        okButtonProps={{ style: { background: '#111111', borderColor: '#111111' } }}
      >
        <p style={{ margin: 0, marginBottom: 8, fontSize: 13, color: '#374151' }}>
          Hệ thống sẽ ghi log handoff với:
        </p>
        <ul style={{ margin: 0, marginBottom: 12, paddingLeft: 20, fontSize: 13, color: '#374151' }}>
          <li>Người chuyển: <strong>{user?.full_name || user?.email}</strong></li>
          <li>Dwell time: <strong>{formatDwell(elapsedHours)}</strong></li>
          <li>From: {SALES_STAGE_LABELS[currentStage]} → {nextStage && SALES_STAGE_LABELS[nextStage]}</li>
        </ul>
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Ghi chú (tùy chọn)</div>
          <TextArea
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="VD: NVL đã đầy đủ, sẵn sàng SX..."
          />
        </div>
      </Modal>
    </div>
  )
}
