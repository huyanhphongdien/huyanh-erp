// ============================================================================
// StagePill — reusable status pill for Sales tracking
// File: src/components/common/StagePill.tsx
// Pattern: Vercel-inspired pill (9999px radius)
// ============================================================================

import {
  type SLAStatus,
  type SalesStage,
  SALES_STAGE_SHORT,
  SALES_STAGE_EMOJI,
  SLA_PILL_COLORS,
  formatDwell,
  getSLAStatus,
} from '../../services/sales/salesStages'

interface StagePillProps {
  stage: SalesStage
  /** Hours đã dừng tại stage này (cho hiển thị) */
  elapsedHours?: number | null
  /** SLA hours của stage (default lấy từ config) */
  slaHours?: number | null
  /** Stage started timestamp ISO (để tính SLA status) */
  stageStartedAt?: string | null
  /** Override SLA status nếu cần (vd kanban card) */
  status?: SLAStatus
  /** Hiện emoji + label đầy đủ vs chỉ pill */
  variant?: 'full' | 'compact'
  /** Click handler */
  onClick?: () => void
}

export default function StagePill({
  stage,
  elapsedHours,
  slaHours,
  stageStartedAt,
  status,
  variant = 'full',
  onClick,
}: StagePillProps) {
  const computed: SLAStatus = status ?? getSLAStatus(
    stageStartedAt ?? null,
    slaHours ?? null,
    stage,
  )
  const colors = SLA_PILL_COLORS[computed]
  const label = SALES_STAGE_SHORT[stage]
  const emoji = SALES_STAGE_EMOJI[stage]

  const dwellText = elapsedHours != null && elapsedHours > 0
    ? ` · ${formatDwell(elapsedHours)}`
    : ''

  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: variant === 'compact' ? '1px 8px' : '2px 10px',
        borderRadius: 9999,
        fontSize: variant === 'compact' ? 10 : 11,
        fontWeight: 500,
        backgroundColor: colors.bg,
        color: colors.fg,
        cursor: onClick ? 'pointer' : 'default',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
      title={`${label}${dwellText}`}
    >
      <span>{emoji}</span>
      <span>{label}</span>
      {dwellText && variant === 'full' && (
        <span style={{ opacity: 0.7 }}>{dwellText}</span>
      )}
    </span>
  )
}
