// ============================================================================
// ORDER SUMMARY - Tổng hợp đơn hàng (grand total)
// File: src/features/purchasing/pages/components/orders/OrderSummary.tsx
// ============================================================================

import { formatCurrency } from '../../../../../services/purchaseOrderService'

interface OrderSummaryProps {
  totalAmount: number
  vatAmount: number
  grandTotal: number
  validItemCount: number
  supplierCount: number
}

export function OrderSummary({
  totalAmount,
  vatAmount,
  grandTotal,
  validItemCount,
  supplierCount,
}: OrderSummaryProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h4 className="text-sm font-semibold text-gray-700 mb-4">Tổng cộng đơn hàng</h4>
      <div className="space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Tiền hàng:</span>
          <span className="font-medium text-gray-900">{formatCurrency(totalAmount)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Thuế VAT:</span>
          <span className="font-medium text-gray-900">{formatCurrency(vatAmount)}</span>
        </div>
        <div className="border-t pt-3 flex justify-between">
          <span className="text-base font-semibold text-gray-900">Tổng cộng:</span>
          <span className="text-lg font-bold text-blue-600">{formatCurrency(grandTotal)}</span>
        </div>
        <p className="text-xs text-gray-400 pt-1">
          {validItemCount} vật tư hợp lệ từ {supplierCount} nhà cung cấp
        </p>
      </div>
    </div>
  )
}

export default OrderSummary