// ============================================================================
// GRADE BADGE — Hien thi SVR grade voi mau sac
// File: src/components/wms/GradeBadge.tsx
// ============================================================================

import { Tag } from 'antd'
import type { RubberGrade } from '../../services/wms/wms.types'
import { RUBBER_GRADE_LABELS, RUBBER_GRADE_COLORS } from '../../services/wms/wms.types'

interface GradeBadgeProps {
  grade?: RubberGrade | string | null
  size?: 'small' | 'default'
}

const GradeBadge = ({ grade, size = 'default' }: GradeBadgeProps) => {
  if (!grade) return <span style={{ color: '#999' }}>—</span>

  const label = RUBBER_GRADE_LABELS[grade as RubberGrade] || grade
  const color = RUBBER_GRADE_COLORS[grade as RubberGrade] || '#6B7280'

  return (
    <Tag
      color={color}
      style={{
        fontSize: size === 'small' ? 11 : 13,
        fontWeight: 600,
        padding: size === 'small' ? '0 4px' : '1px 8px',
        margin: 0,
        borderRadius: 4,
      }}
    >
      {label}
    </Tag>
  )
}

export default GradeBadge
