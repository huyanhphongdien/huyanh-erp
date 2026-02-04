// ============================================================================
// ORDER ITEMS TAB - Tab hiển thị vật tư nhóm theo NCC
// File: src/features/purchasing/pages/components/orders/OrderItemsTab.tsx
// ============================================================================

import { Package } from 'lucide-react'
import { type PurchaseOrderItem } from '../../../../../services/purchaseOrderService'
import { SupplierGroupDetail } from './SupplierGroupView'

interface OrderItemsTabProps {
  items: PurchaseOrderItem[]
  grandTotal: number
}

export function OrderItemsTab({ items, grandTotal }: OrderItemsTabProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <Package className="w-10 h-10 mx-auto mb-2" />
        <p>Chưa có vật tư nào</p>
      </div>
    )
  }

  return <SupplierGroupDetail items={items} grandTotal={grandTotal} />
}

export default OrderItemsTab