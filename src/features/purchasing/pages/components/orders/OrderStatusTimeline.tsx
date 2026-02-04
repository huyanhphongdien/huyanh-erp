// ============================================================================
// ORDER STATUS TIMELINE - CẬP NHẬT WORKFLOW ĐƠN GIẢN
// File: src/features/purchasing/pages/components/orders/OrderStatusTimeline.tsx
// ============================================================================
// Workflow: draft → confirmed → partial → completed | cancelled
// ============================================================================

import {
  FileText,
  CheckCircle2,
  Package,
  CheckCheck,
  Ban,
} from 'lucide-react'

// ===== TYPES =====

interface TimelineStep {
  status: string
  label: string
  icon: React.ElementType
}

const STEPS: TimelineStep[] = [
  { status: 'draft', label: 'Nháp', icon: FileText },
  { status: 'confirmed', label: 'Đã xác nhận', icon: CheckCircle2 },
  { status: 'partial', label: 'Đang giao', icon: Package },
  { status: 'completed', label: 'Hoàn thành', icon: CheckCheck },
]

/** Thứ tự trạng thái */
const STATUS_ORDER: Record<string, number> = {
  draft: 0,
  confirmed: 1,
  partial: 2,
  completed: 3,
  cancelled: -1,
}

// ===== COMPONENT =====

interface OrderStatusTimelineProps {
  currentStatus: string
  confirmedAt?: string | null
  confirmedByName?: string | null
  cancelledAt?: string | null
  cancelledByName?: string | null
  cancellationReason?: string | null
}

export function OrderStatusTimeline({
  currentStatus,
  confirmedAt,
  confirmedByName,
  cancelledAt,
  cancelledByName,
  cancellationReason,
}: OrderStatusTimelineProps) {
  const currentOrder = STATUS_ORDER[currentStatus] ?? -1
  const isCancelled = currentStatus === 'cancelled'

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h4 className="text-xs font-medium text-gray-500 mb-4">Tiến trình đơn hàng</h4>

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-red-500" />
            <span className="text-sm font-medium text-red-700">Đơn hàng đã bị hủy</span>
          </div>
          {cancellationReason && (
            <p className="text-xs text-red-600 mt-1 ml-6">Lý do: {cancellationReason}</p>
          )}
          {cancelledByName && (
            <p className="text-xs text-red-400 mt-0.5 ml-6">
              {cancelledByName}
              {cancelledAt && ` • ${new Date(cancelledAt).toLocaleString('vi-VN')}`}
            </p>
          )}
        </div>
      )}

      {/* Timeline steps */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, idx) => {
          const stepOrder = STATUS_ORDER[step.status]
          const isPassed = !isCancelled && currentOrder >= stepOrder
          const isCurrent = currentStatus === step.status
          const Icon = step.icon

          return (
            <div key={step.status} className="flex items-center flex-1">
              {/* Step circle + label */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors ${
                    isCurrent
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : isPassed
                      ? 'border-green-500 bg-green-50 text-green-600'
                      : isCancelled
                      ? 'border-gray-200 bg-gray-50 text-gray-300'
                      : 'border-gray-200 bg-white text-gray-400'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span
                  className={`text-xs mt-1.5 text-center ${
                    isCurrent
                      ? 'font-semibold text-blue-600'
                      : isPassed
                      ? 'font-medium text-green-600'
                      : 'text-gray-400'
                  }`}
                >
                  {step.label}
                </span>

                {/* Confirmed info */}
                {step.status === 'confirmed' && confirmedAt && isPassed && (
                  <span className="text-[10px] text-gray-400 mt-0.5">
                    {new Date(confirmedAt).toLocaleDateString('vi-VN')}
                  </span>
                )}
              </div>

              {/* Connector line */}
              {idx < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 ${
                    !isCancelled && currentOrder > stepOrder
                      ? 'bg-green-400'
                      : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default OrderStatusTimeline