// ============================================================================
// ORDER INFO TAB - CẬP NHẬT WORKFLOW ĐƠN GIẢN
// File: src/features/purchasing/pages/components/orders/OrderInfoTab.tsx
// ============================================================================
// Hiển thị: Info cards, delivery info, approval evidence, cancellation info, notes
// ============================================================================

import {
  Calendar,
  Building2,
  ShoppingCart,
  MapPin,
  User,
  Ban,
  Shield,
  FileText,
  FileImage,
  Eye,
  CheckCircle2,
} from 'lucide-react'
import {
  type PurchaseOrder,
  formatCurrency,
} from '../../../../../services/purchaseOrderService'
import { OrderProgressBar } from './OrderProgressBar'

// ============================================================================
// APPROVAL EVIDENCE (Thông tin phê duyệt bên ngoài)
// ============================================================================

function ApprovalEvidence({ order, onEdit }: { order: PurchaseOrder; onEdit?: () => void }) {
  const hasApprovalInfo = order.approval_number || order.approval_date || order.approved_by_name
  const hasApprovalDocs = order.approval_documents && order.approval_documents.length > 0
  const canEdit = order.status !== 'cancelled'

  if (!hasApprovalInfo && !hasApprovalDocs) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-amber-800">Chưa có thông tin phê duyệt</h4>
            <p className="text-xs text-amber-600 mt-0.5">
              Đề xuất mua hàng cần được phê duyệt qua hệ thống bên ngoài.
              Vui lòng cập nhật thông tin và upload file bằng chứng khi có.
            </p>
          </div>
          {canEdit && onEdit && (
            <button
              onClick={onEdit}
              className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 border border-amber-300 rounded-lg hover:bg-amber-200 transition-colors flex-shrink-0"
            >
              + Thêm
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Shield className="w-4 h-4 text-green-600" />
          Thông tin phê duyệt
        </h4>
        {canEdit && onEdit && (
          <button
            onClick={onEdit}
            className="px-2.5 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
          >
            Sửa
          </button>
        )}
      </div>
      <div className="p-4 space-y-3">
        {hasApprovalInfo && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {order.approval_number && (
              <div>
                <span className="text-xs text-gray-500">Số đề xuất</span>
                <p className="text-sm font-medium text-gray-900">{order.approval_number}</p>
              </div>
            )}
            {order.approval_date && (
              <div>
                <span className="text-xs text-gray-500">Ngày duyệt</span>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(order.approval_date).toLocaleDateString('vi-VN')}
                </p>
              </div>
            )}
            {order.approved_by_name && (
              <div>
                <span className="text-xs text-gray-500">Người duyệt</span>
                <p className="text-sm font-medium text-gray-900">{order.approved_by_name}</p>
              </div>
            )}
          </div>
        )}

        {hasApprovalDocs && (
          <div>
            <span className="text-xs text-gray-500 block mb-2">File đính kèm</span>
            <div className="flex flex-wrap gap-2">
              {order.approval_documents!.map((doc: any, idx: number) => {
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(doc.name || '')
                const Icon = isImage ? FileImage : FileText

                return (
                  <a
                    key={idx}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors group"
                  >
                    <Icon className="w-4 h-4 text-gray-400 group-hover:text-blue-500" />
                    <span className="text-xs text-gray-700 max-w-[150px] truncate">
                      {doc.name || `File ${idx + 1}`}
                    </span>
                    <Eye className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500" />
                  </a>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// CANCELLATION BANNER
// ============================================================================

function CancellationBanner({ order }: { order: PurchaseOrder }) {
  if (order.status !== 'cancelled' || !order.cancellation_reason) return null

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <Ban className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="text-sm font-medium text-red-800">Đơn hàng đã bị hủy</h4>
          <p className="text-sm text-red-700 mt-1">
            <strong>Lý do:</strong> {order.cancellation_reason}
          </p>
          {order.cancelled_by_name && (
            <p className="text-xs text-red-500 mt-1">
              Hủy bởi: {order.cancelled_by_name}
              {order.cancelled_at && ` • ${new Date(order.cancelled_at).toLocaleString('vi-VN')}`}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface OrderInfoTabProps {
  order: PurchaseOrder
  onEditApproval?: () => void
}

export function OrderInfoTab({ order, onEditApproval }: OrderInfoTabProps) {
  const invoiceProgress = order.invoice_progress ?? 0
  const paymentProgress = order.payment_progress ?? 0

  return (
    <div className="space-y-4">
      {/* ===== CANCELLATION BANNER ===== */}
      <CancellationBanner order={order} />

      {/* ===== INFO CARDS ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ngày đơn hàng */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Calendar className="w-3.5 h-3.5" />
            Ngày đơn hàng
          </div>
          <p className="text-sm font-semibold text-gray-900">
            {new Date(order.order_date || order.created_at).toLocaleDateString('vi-VN')}
          </p>
          {order.expected_delivery_date && (
            <p className="text-xs text-gray-400 mt-0.5">
              Giao: {new Date(order.expected_delivery_date).toLocaleDateString('vi-VN')}
            </p>
          )}
        </div>

        {/* Phòng ban */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Building2 className="w-3.5 h-3.5" />
            Phòng ban / Người yêu cầu
          </div>
          <p className="text-sm font-semibold text-gray-900">
            {order.department?.name || '-'}
          </p>
          {order.requester?.full_name && (
            <p className="text-xs text-gray-400 mt-0.5">{order.requester.full_name}</p>
          )}
        </div>

        {/* Tổng tiền */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <ShoppingCart className="w-3.5 h-3.5" />
            Tổng tiền
          </div>
          <p className="text-lg font-bold text-gray-900">
            {formatCurrency(order.grand_total)}
          </p>
        </div>

        {/* Tiến độ */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
          <OrderProgressBar value={invoiceProgress} label="Hóa đơn" color="blue" />
          <OrderProgressBar value={paymentProgress} label="Thanh toán" color="green" />
        </div>
      </div>

      {/* ===== CONFIRMED BY ===== */}
      {order.confirmed_by && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <p className="text-sm text-blue-700">
            <strong>Xác nhận bởi:</strong>{' '}
            {order.confirmed_by_name || order.confirmed_by}
            {order.confirmed_at && ` • ${new Date(order.confirmed_at).toLocaleString('vi-VN')}`}
          </p>
        </div>
      )}

      {/* ===== APPROVAL EVIDENCE ===== */}
      <ApprovalEvidence order={order} onEdit={onEditApproval} />

      {/* ===== DELIVERY INFO ===== */}
      {(order.delivery_address || order.delivery_notes) && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h4 className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            Thông tin giao hàng
          </h4>
          {order.delivery_address && (
            <p className="text-sm text-gray-900">{order.delivery_address}</p>
          )}
          {order.delivery_notes && (
            <p className="text-sm text-gray-500 mt-1">{order.delivery_notes}</p>
          )}
        </div>
      )}

      {/* ===== NOTES ===== */}
      {(order.notes || order.internal_notes) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {order.notes && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h4 className="text-xs font-medium text-gray-500 mb-1">Ghi chú (cho NCC)</h4>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.notes}</p>
            </div>
          )}
          {order.internal_notes && (
            <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4">
              <h4 className="text-xs font-medium text-yellow-600 mb-1">Ghi chú nội bộ</h4>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{order.internal_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* ===== CREATOR INFO ===== */}
      <div className="flex items-center justify-between text-xs text-gray-400 pt-2">
        <div className="flex items-center gap-1">
          <User className="w-3.5 h-3.5" />
          Tạo bởi: {order.creator?.full_name || '-'}
        </div>
        <span>Cập nhật: {new Date(order.updated_at).toLocaleString('vi-VN')}</span>
      </div>
    </div>
  )
}

export { ApprovalEvidence, CancellationBanner }
export default OrderInfoTab