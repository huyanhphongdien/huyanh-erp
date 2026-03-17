// ============================================================================
// CONTAMINATION BADGE — Trạng thái tap chat
// File: src/components/wms/ContaminationBadge.tsx
// ============================================================================

import { Tag } from 'antd'
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import type { ContaminationStatus } from '../../services/wms/wms.types'
import { CONTAMINATION_LABELS, CONTAMINATION_COLORS } from '../../services/wms/wms.types'

interface ContaminationBadgeProps {
  status?: ContaminationStatus | string | null
  showIcon?: boolean
}

const ICONS: Record<string, React.ReactNode> = {
  clean: <CheckCircleOutlined />,
  suspected: <ExclamationCircleOutlined />,
  confirmed: <CloseCircleOutlined />,
  cleared: <InfoCircleOutlined />,
}

const ContaminationBadge = ({ status, showIcon = true }: ContaminationBadgeProps) => {
  if (!status || status === 'clean') return null

  const label = CONTAMINATION_LABELS[status as ContaminationStatus] || status
  const color = CONTAMINATION_COLORS[status as ContaminationStatus] || '#6B7280'

  return (
    <Tag
      color={color}
      icon={showIcon ? ICONS[status] : undefined}
      style={{ margin: 0, borderRadius: 4 }}
    >
      {label}
    </Tag>
  )
}

export default ContaminationBadge
