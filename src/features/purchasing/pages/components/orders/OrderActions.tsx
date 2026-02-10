// ============================================================================
// ORDER ACTIONS - CẬP NHẬT WORKFLOW ĐƠN GIẢN
// File: src/features/purchasing/pages/components/orders/OrderActions.tsx
// ============================================================================
// Workflow: draft → confirmed → partial → completed | cancelled
// Nút chính: "Xác nhận" (draft→confirmed), "Hủy đơn" (→cancelled)
// Menu phụ: Chuyển trạng thái (partial, completed), Xóa (draft only)
// ============================================================================

import { useState } from 'react'
import {
  Pencil,
  CheckCircle2,
  Ban,
  Trash2,
  MoreHorizontal,
  X,
} from 'lucide-react'
import {
  type PurchaseOrder,
  type POStatus,
  formatCurrency,
} from '../../../../../services/purchaseOrderService'

// ===== STATUS CONFIG (self-contained) =====

const SIMPLE_STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  confirmed: 'Đã xác nhận',
  partial: 'Đang giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

const SIMPLE_TRANSITIONS: Record<string, string[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['partial', 'completed', 'cancelled'],
  partial: ['completed'],
  completed: [],
  cancelled: [],
}

function getAvailableTransitions(status: string): string[] {
  return SIMPLE_TRANSITIONS[status] || []
}

// ============================================================================
// CANCEL MODAL (thay thế RejectModal cũ)
// ============================================================================

interface CancelModalProps {
  show: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
  loading: boolean
}

export function CancelModal({ show, onClose, onConfirm, loading }: CancelModalProps) {
  const [reason, setReason] = useState('')

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Hủy đơn hàng</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Lý do hủy <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Nhập lý do hủy đơn hàng..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 text-sm"
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Đóng
          </button>
          <button
            onClick={() => { onConfirm(reason); setReason('') }}
            disabled={!reason.trim() || loading}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Đang xử lý...' : 'Xác nhận hủy'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// DELETE MODAL
// ============================================================================

interface DeleteModalProps {
  show: boolean
  onClose: () => void
  onConfirm: () => void
  loading: boolean
}

export function DeleteModal({ show, onClose, onConfirm, loading }: DeleteModalProps) {
  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="text-center mb-4">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Xóa đơn hàng?</h3>
          <p className="text-sm text-gray-500 mt-1">
            Thao tác này không thể hoàn tác.
          </p>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
            Hủy
          </button>
          <button onClick={onConfirm} disabled={loading} className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
            {loading ? 'Đang xóa...' : 'Xóa'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ORDER ACTIONS COMPONENT
// ============================================================================

interface OrderActionsProps {
  order: PurchaseOrder
  loading: boolean
  onEdit: () => void
  onConfirm: () => void
  onCancel: () => void
  onDelete: () => void
  onStatusChange: (status: string) => void
}

export function OrderActions({
  order,
  loading,
  onEdit,
  onConfirm,
  onCancel,
  onDelete,
  onStatusChange,
}: OrderActionsProps) {
  const [showMenu, setShowMenu] = useState(false)
  const transitions = getAvailableTransitions(order.status)

  // Các transition đã có nút riêng (không hiện trong menu)
  const menuTransitions = transitions.filter((t) => t !== 'confirmed' && t !== 'cancelled')

  return (
    <div className="flex items-center gap-2">
      {/* Sửa - chỉ khi draft */}
      {order.status === 'draft' && (
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Pencil className="w-4 h-4" />
          Sửa
        </button>
      )}

      {/* XÁC NHẬN - draft với grand_total > 0 */}
      {order.status === 'draft' && order.grand_total > 0 && (
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <CheckCircle2 className="w-4 h-4" />
          Xác nhận
        </button>
      )}

      {/* HỦY ĐƠN - draft hoặc confirmed */}
      {['draft', 'confirmed'].includes(order.status) && (
        <button
          onClick={onCancel}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
        >
          <Ban className="w-4 h-4" />
          Hủy đơn
        </button>
      )}

      {/* Menu thêm: chuyển trạng thái & xóa */}
      {(menuTransitions.length > 0 || order.status === 'draft') && (
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>

          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-10 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-48">
                {/* Status transitions */}
                {menuTransitions.map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      onStatusChange(status)
                      setShowMenu(false)
                    }}
                    disabled={loading}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Chuyển → {SIMPLE_STATUS_LABELS[status] || status}
                  </button>
                ))}

                {/* Xóa - chỉ draft */}
                {order.status === 'draft' && (
                  <>
                    {menuTransitions.length > 0 && <div className="border-t border-gray-100 my-1" />}
                    <button
                      onClick={() => {
                        setShowMenu(false)
                        onDelete()
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      Xóa đơn hàng
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default OrderActions