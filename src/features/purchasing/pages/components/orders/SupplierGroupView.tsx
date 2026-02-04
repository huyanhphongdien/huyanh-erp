// ============================================================================
// SUPPLIER GROUP VIEW - Nhóm vật tư theo NCC
// File: src/features/purchasing/pages/components/orders/SupplierGroupView.tsx
// ============================================================================

import { Building2, Package } from 'lucide-react'
import { formatCurrency, type PurchaseOrderItem } from '../../../../../services/purchaseOrderService'

// ===== TYPES =====

interface Supplier {
  id: string
  code: string
  name: string
  short_name?: string
}

/** Dùng cho FormItem (trong form, chưa lưu DB) */
interface FormItemLike {
  supplier_id: string
  material_code?: string
  material_name: string
  specifications?: string
  unit: string
  quantity: number
  unit_price: number
  vat_rate: number
  amount: number
  vat_amount: number
  total_amount: number
  supplier_name?: string
  supplier_code?: string
}

interface SupplierGroup {
  supplier: { id: string; name: string; code: string }
  items: FormItemLike[]
  subtotal: number
  vat: number
  total: number
}

// ===== COMPACT VIEW (for Form summary) =====

interface SupplierSummaryProps {
  items: FormItemLike[]
  suppliers: Supplier[]
}

export function SupplierSummary({ items, suppliers }: SupplierSummaryProps) {
  const validItems = items.filter((i) => i.supplier_id && i.total_amount > 0)
  if (validItems.length === 0) return null

  const grouped = groupBySupplier(validItems, suppliers)

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
        <Building2 className="w-4 h-4" />
        Tổng hợp theo NCC ({grouped.length} nhà cung cấp)
      </h4>
      <div className="space-y-2">
        {grouped.map((group) => (
          <div
            key={group.supplier.id}
            className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-2"
          >
            <div>
              <span className="font-medium text-gray-900">{group.supplier.name}</span>
              <span className="text-gray-400 ml-2">({group.supplier.code})</span>
              <span className="text-gray-400 ml-2">• {group.items.length} vật tư</span>
            </div>
            <div className="text-right">
              <span className="font-semibold text-gray-900">{formatCurrency(group.total)}</span>
              {group.vat > 0 && (
                <span className="text-xs text-gray-400 ml-2">(VAT: {formatCurrency(group.vat)})</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ===== FULL VIEW (for Detail page with tables) =====

interface SupplierGroupDetailProps {
  items: PurchaseOrderItem[]
  grandTotal: number
}

export function SupplierGroupDetail({ items, grandTotal }: SupplierGroupDetailProps) {
  // Group items by supplier
  const grouped = items.reduce<
    Record<string, { supplier: any; items: PurchaseOrderItem[]; subtotal: number; vat: number; total: number }>
  >((acc, item) => {
    const suppId = item.supplier_id
    if (!acc[suppId]) {
      acc[suppId] = {
        supplier: item.supplier || { id: suppId, name: 'N/A', code: '' },
        items: [],
        subtotal: 0,
        vat: 0,
        total: 0,
      }
    }
    acc[suppId].items.push(item)
    acc[suppId].subtotal += item.amount
    acc[suppId].vat += item.vat_amount
    acc[suppId].total += item.total_amount
    return acc
  }, {})

  if (Object.keys(grouped).length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <Package className="w-10 h-10 mx-auto mb-2" />
        <p>Chưa có vật tư nào</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([suppId, group]) => (
        <div key={suppId}>
          {/* Supplier header */}
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-500" />
              {group.supplier?.name || 'N/A'}
              <span className="text-xs font-normal text-gray-400">
                ({group.supplier?.code}) • {group.items.length} vật tư
              </span>
            </h4>
            <span className="text-sm font-semibold text-gray-900">{formatCurrency(group.total)}</span>
          </div>

          {/* Items table */}
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-10">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Mã</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Tên vật tư</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-16">ĐVT</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-24">SL</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-28">Đơn giá</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-16">VAT%</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 w-32">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {group.items.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-gray-50/50">
                    <td className="px-3 py-2.5 text-center text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{item.material_code || '—'}</td>
                    <td className="px-3 py-2.5">
                      <p className="text-sm text-gray-900">{item.material_name}</p>
                      {item.specifications && (
                        <p className="text-xs text-gray-400 mt-0.5">{item.specifications}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-xs text-gray-500">{item.unit}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-gray-900">
                      {item.quantity.toLocaleString('vi-VN')}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-gray-900">
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-gray-500">{item.vat_rate}%</td>
                    <td className="px-3 py-2.5 text-right">
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(item.total_amount)}</p>
                      {item.vat_amount > 0 && (
                        <p className="text-xs text-gray-400">VAT: {formatCurrency(item.vat_amount)}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200">
                  <td colSpan={5}></td>
                  <td className="px-3 py-2 text-right text-xs text-gray-500">Tiền hàng:</td>
                  <td colSpan={2} className="px-3 py-2 text-right text-sm font-medium text-gray-900">
                    {formatCurrency(group.subtotal)}
                  </td>
                </tr>
                <tr className="bg-gray-50">
                  <td colSpan={5}></td>
                  <td className="px-3 py-1 text-right text-xs text-gray-500">VAT:</td>
                  <td colSpan={2} className="px-3 py-1 text-right text-sm text-gray-600">
                    {formatCurrency(group.vat)}
                  </td>
                </tr>
                <tr className="bg-gray-50">
                  <td colSpan={5}></td>
                  <td className="px-3 py-2 text-right text-xs font-medium text-gray-700">Tổng:</td>
                  <td colSpan={2} className="px-3 py-2 text-right text-sm font-bold text-blue-600">
                    {formatCurrency(group.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}

      {/* Grand total (khi > 1 NCC) */}
      {Object.keys(grouped).length > 1 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <span className="text-sm font-semibold text-blue-800">
            Tổng cộng ({Object.keys(grouped).length} NCC, {items.length} vật tư)
          </span>
          <span className="text-lg font-bold text-blue-700">{formatCurrency(grandTotal)}</span>
        </div>
      )}
    </div>
  )
}

// ===== HELPER =====

function groupBySupplier(items: FormItemLike[], suppliers: Supplier[]): SupplierGroup[] {
  const map = new Map<string, SupplierGroup>()

  for (const item of items) {
    const suppId = item.supplier_id
    if (!map.has(suppId)) {
      const sup = suppliers.find((s) => s.id === suppId)
      map.set(suppId, {
        supplier: {
          id: suppId,
          name: sup?.short_name || sup?.name || item.supplier_name || 'N/A',
          code: sup?.code || item.supplier_code || '',
        },
        items: [],
        subtotal: 0,
        vat: 0,
        total: 0,
      })
    }
    const g = map.get(suppId)!
    g.items.push(item)
    g.subtotal += item.amount
    g.vat += item.vat_amount
    g.total += item.total_amount
  }

  return Array.from(map.values())
}

export default SupplierGroupDetail