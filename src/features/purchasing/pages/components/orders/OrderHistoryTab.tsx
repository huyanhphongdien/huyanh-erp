// ============================================================================
// ORDER HISTORY TAB - CẬP NHẬT WORKFLOW ĐƠN GIẢN
// File: src/features/purchasing/pages/components/orders/OrderHistoryTab.tsx
// ============================================================================

import {
  FileText,
  Pencil,
  CheckCircle2,
  Package,
  RotateCcw,
  Ban,
  CreditCard,
  Receipt,
} from 'lucide-react'
import { type PurchaseOrderHistory, PO_STATUS_LABELS } from '../../../../../services/purchaseOrderService'
import { fmtDate, fmtDateTime } from '../../../../../utils/format'

// ===== NHÃN TIẾNG VIỆT (trước đây thiếu mô tả thì in thẳng mã 'status_changed', và in JSON {"status":"draft"}) =====

const HISTORY_LABELS: Record<string, string> = {
  created: 'Tạo đơn hàng',
  updated: 'Cập nhật đơn hàng',
  confirmed: 'Xác nhận đơn hàng',
  status_changed: 'Đổi trạng thái',
  items_updated: 'Cập nhật vật tư',
  cancelled: 'Hủy đơn hàng',
  invoice_added: 'Thêm hóa đơn',
  payment_added: 'Ghi nhận thanh toán',
}

const FIELD_LABELS: Record<string, string> = {
  status: 'Trạng thái',
  project_name: 'Dự án',
  expected_delivery_date: 'Ngày giao dự kiến',
  confirmation_files: 'File xác nhận',
}

/** Giá trị cũ/mới của lịch sử → chữ đọc được (trạng thái theo PO_STATUS_LABELS, ngày DD/MM/YYYY) */
function describeHistoryValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v !== 'object') return String(v)
  return Object.entries(v as Record<string, unknown>)
    .map(([k, val]) => {
      const label = FIELD_LABELS[k] || k
      if (k === 'status') return `${label}: ${PO_STATUS_LABELS[val as keyof typeof PO_STATUS_LABELS] || String(val)}`
      if (k === 'confirmation_files') return `${label}: ${Array.isArray(val) ? val.length : 0} file`
      if (k.endsWith('_date')) return `${label}: ${fmtDate(val as string)}`
      return `${label}: ${val === null || val === undefined || val === '' ? '—' : String(val)}`
    })
    .join(' · ')
}

// ===== HISTORY ICONS =====

const HISTORY_ICONS: Record<string, React.ElementType> = {
  created: FileText,
  updated: Pencil,
  confirmed: CheckCircle2,
  status_changed: RotateCcw,
  items_updated: Package,
  cancelled: Ban,
  invoice_added: Receipt,
  payment_added: CreditCard,
}

const HISTORY_COLORS: Record<string, string> = {
  created: 'bg-blue-100 text-blue-600',
  updated: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-green-100 text-green-600',
  status_changed: 'bg-purple-100 text-purple-600',
  items_updated: 'bg-indigo-100 text-indigo-600',
  cancelled: 'bg-red-100 text-red-600',
  invoice_added: 'bg-orange-100 text-orange-600',
  payment_added: 'bg-teal-100 text-teal-600',
}

// ===== COMPONENT =====

interface OrderHistoryTabProps {
  history: PurchaseOrderHistory[]
}

export function OrderHistoryTab({ history }: OrderHistoryTabProps) {
  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <FileText className="w-10 h-10 mx-auto mb-2" />
        <p>Chưa có lịch sử</p>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {history.map((entry, idx) => {
        const HistIcon = HISTORY_ICONS[entry.action] || FileText
        const colorClass = HISTORY_COLORS[entry.action] || 'bg-gray-100 text-gray-500'

        return (
          <div key={entry.id} className="flex gap-3">
            {/* Timeline dot + line */}
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                <HistIcon className="w-4 h-4" />
              </div>
              {idx < history.length - 1 && (
                <div className="w-px flex-1 bg-gray-200 my-1" />
              )}
            </div>

            {/* Content */}
            <div className="pb-4 flex-1">
              <p className="text-sm text-gray-900">
                {entry.description || HISTORY_LABELS[entry.action] || entry.action}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                {entry.performer && (
                  <span className="text-xs text-gray-500">
                    {entry.performer.full_name}
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {fmtDateTime(entry.performed_at)}
                </span>
              </div>

              {/* Hiển thị lý do hủy */}
              {entry.action === 'cancelled' && entry.details?.reason && (
                <p className="text-xs text-red-500 mt-1">
                  Lý do: {entry.details.reason}
                </p>
              )}

              {/* Hiển thị old_value → new_value nếu có */}
              {entry.old_value && entry.new_value && (
                <p className="text-xs text-gray-400 mt-1">
                  {describeHistoryValue(entry.old_value)}
                  {' → '}
                  {describeHistoryValue(entry.new_value)}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default OrderHistoryTab