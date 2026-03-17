// ============================================================================
// WEIGHT LOSS INDICATOR — Hien thi % hao hut voi mau canh bao
// File: src/components/wms/WeightLossIndicator.tsx
// ============================================================================

import { Tag, Tooltip } from 'antd'
import { ArrowDownOutlined } from '@ant-design/icons'

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

  const label = showKg
    ? `${lossPercent.toFixed(1)}% (${lossKg.toFixed(1)} kg)`
    : `${lossPercent.toFixed(1)}%`

  return (
    <Tooltip title={`Hao hut: ${lossKg.toFixed(1)} kg / ${initialWeight?.toFixed(1)} kg`}>
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
