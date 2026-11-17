// ============================================================================
// WEIGHT LOSS INDICATOR — Hien thi % hao hut voi mau canh bao
// File: src/components/wms/WeightLossIndicator.tsx
// ============================================================================

import { Tag, Tooltip } from 'antd'
import { ArrowDownOutlined } from '@ant-design/icons'
import { fmtKg, fmtPct } from '../../utils/format'

interface WeightLossIndicatorProps {
  initialWeight?: number | null
  currentWeight?: number | null
  weightLoss?: number | null
  showKg?: boolean
}

const WeightLossIndicator = ({
  initialWeight,
  currentWeight,
  weightLoss,
  showKg = false,
}: WeightLossIndicatorProps) => {
  let lossKg = weightLoss || 0
  let lossPercent = 0

  if (!weightLoss && initialWeight && currentWeight) {
    lossKg = initialWeight - currentWeight
  }

  if (initialWeight && initialWeight > 0) {
    lossPercent = (lossKg / initialWeight) * 100
  }

  if (lossKg <= 0 || lossPercent <= 0) return null

  let color: string
  if (lossPercent > 5) color = 'red'
  else if (lossPercent > 3) color = 'orange'
  else color = 'default'

  // Số theo vi-VN (format.ts) — toFixed cũ ra dấu CHẤM thập phân
  const label = showKg
    ? `${fmtPct(lossPercent, 1)} (${fmtKg(lossKg, 1)} kg)`
    : fmtPct(lossPercent, 1)

  return (
    <Tooltip title={`Hao hụt: ${fmtKg(lossKg, 1)} kg / ${fmtKg(initialWeight, 1)} kg`}>
      <Tag
        color={color}
        icon={<ArrowDownOutlined />}
        style={{ margin: 0, borderRadius: 4 }}
      >
        {label}
      </Tag>
    </Tooltip>
  )
}

export default WeightLossIndicator
