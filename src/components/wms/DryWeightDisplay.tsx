// ============================================================================
// DRY WEIGHT DISPLAY — Hien thi trong luong gross va dry (= gross x DRC/100)
// File: src/components/wms/DryWeightDisplay.tsx
// ============================================================================

import { Typography, Space, Tooltip } from 'antd'
import { rubberGradeService } from '../../services/wms/rubberGradeService'

const { Text } = Typography

interface DryWeightDisplayProps {
  grossWeight: number
  drc?: number | null
  unit?: string
  showGross?: boolean
  size?: 'small' | 'default' | 'large'
}

const DryWeightDisplay = ({
  grossWeight,
  drc,
  unit = 'kg',
  showGross = true,
  size = 'default',
}: DryWeightDisplayProps) => {
  if (!drc || drc <= 0) {
    const formatted = unit === 'kg' && grossWeight >= 1000
      ? `${(grossWeight / 1000).toFixed(1)} T`
      : `${grossWeight.toLocaleString()} ${unit}`
    return <Text>{formatted}</Text>
  }

  const dryWeight = rubberGradeService.calculateDryWeight(grossWeight, drc)

  const formatWeight = (w: number) => {
    if (unit === 'kg' && w >= 1000) return `${(w / 1000).toFixed(1)} T`
    return `${w.toLocaleString()} ${unit}`
  }

  const fontSize = size === 'large' ? 18 : size === 'small' ? 12 : 14

  return (
    <Tooltip title={`Gross: ${formatWeight(grossWeight)} × DRC ${drc}% = Dry: ${formatWeight(dryWeight)}`}>
      <Space size={4}>
        {showGross && (
          <Text type="secondary" style={{ fontSize }}>
            {formatWeight(grossWeight)} →
          </Text>
        )}
        <Text strong style={{ fontSize, color: '#1B4D3E' }}>
          {formatWeight(dryWeight)}
        </Text>
        <Text type="secondary" style={{ fontSize: fontSize - 2 }}>
          dry
        </Text>
      </Space>
    </Tooltip>
  )
}

export default DryWeightDisplay
