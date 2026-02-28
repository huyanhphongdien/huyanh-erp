// ============================================================================
// ORDER STATUS BADGE - CẬP NHẬT WORKFLOW ĐƠN GIẢN
// File: src/features/purchasing/pages/components/orders/OrderStatusBadge.tsx
// ============================================================================
// Workflow: draft → confirmed → partial → completed | cancelled
// KHÔNG CÓ: pending, approved, rejected
// ============================================================================

import {
  FileText,
  CheckCircle2,
  Package,
  CheckCheck,
  Ban,
} from 'lucide-react'

// ===== STATUS CONFIG =====

type SimpleStatus = 'draft' | 'confirmed' | 'partial' | 'completed' | 'cancelled'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  confirmed: 'Đã xác nhận',
  partial: 'Đang giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

export const STATUS_ICONS: Record<string, React.ElementType> = {
  draft: FileText,
  confirmed: CheckCircle2,
  partial: Package,
  completed: CheckCheck,
  cancelled: Ban,
}

export const STATUS_BADGE_CLASSES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-300',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-300',
  partial: 'bg-orange-50 text-orange-700 border-orange-300',
  completed: 'bg-green-50 text-green-700 border-green-300',
  cancelled: 'bg-gray-50 text-gray-500 border-gray-300',
}

// ===== COMPONENT =====

interface StatusBadgeProps {
  status: string
  size?: 'sm' | 'md' | 'lg'
}

export function OrderStatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const Icon = STATUS_ICONS[status] || FileText
  const label = STATUS_LABELS[status] || status
  const classes = STATUS_BADGE_CLASSES[status] || 'bg-gray-100 text-gray-700 border-gray-300'

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  }

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
    lg: 'w-4 h-4',
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold border ${classes} ${sizeClasses[size]}`}
    >
      <Icon className={iconSizes[size]} />
      {label}
    </span>
  )
}

export { STATUS_LABELS }
export default OrderStatusBadge