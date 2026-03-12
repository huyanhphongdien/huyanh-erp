// ============================================================================
// ADD ITEM MODAL - Modal thêm vật tư nhanh từ danh mục
// File: src/features/purchasing/pages/components/orders/AddItemModal.tsx
// ============================================================================

import { useState, useMemo } from 'react'
import { X, Search, Package, Plus, Check } from 'lucide-react'
import { formatCurrency } from '../../../../../services/purchaseOrderService'

// ===== TYPES =====

interface Material {
  id: string
  code: string
  name: string
  unit_name?: string
  specifications?: string
  last_purchase_price?: number
  reference_price?: number
  unit?: {
    id: string
    code: string
    name: string
    symbol?: string
  }
}

interface Supplier {
  id: string
  code: string
  name: string
  short_name?: string
}

interface SelectedMaterial {
  material: Material
  supplier_id: string
  quantity: number
  unit_price: number
  vat_rate: number
}

interface AddItemModalProps {
  show: boolean
  materials: Material[]
  suppliers: Supplier[]
  onClose: () => void
  onAdd: (items: SelectedMaterial[]) => void
}

// ===== COMPONENT =====

export function AddItemModal({ show, materials, suppliers, onClose, onAdd }: AddItemModalProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Map<string, SelectedMaterial>>(new Map())

  const filteredMaterials = useMemo(() => {
    if (!search.trim()) return materials
    const q = search.toLowerCase()
    return materials.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        (m.specifications || '').toLowerCase().includes(q)
    )
  }, [materials, search])

  const toggleSelect = (material: Material) => {
    const newSelected = new Map(selected)
    if (newSelected.has(material.id)) {
      newSelected.delete(material.id)
    } else {
      newSelected.set(material.id, {
        material,
        supplier_id: '',
        quantity: 1,
        unit_price: material.last_purchase_price || material.reference_price || 0,
        vat_rate: 10,
      })
    }
    setSelected(newSelected)
  }

  const updateSelected = (materialId: string, field: string, value: any) => {
    const newSelected = new Map(selected)
    const item = newSelected.get(materialId)
    if (item) {
      newSelected.set(materialId, { ...item, [field]: value })
      setSelected(newSelected)
    }
  }

  const handleConfirm = () => {
    const items = Array.from(selected.values()).filter((i) => i.quantity > 0)
    if (items.length > 0) {
      onAdd(items)
      setSelected(new Map())
      setSearch('')
      onClose()
    }
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-500" />
            Thêm vật tư từ danh mục
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên, mã vật tư..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Material list */}
        <div className="flex-1 overflow-y-auto p-5">
          {filteredMaterials.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Không tìm thấy vật tư</p>
          ) : (
            <div className="space-y-2">
              {filteredMaterials.map((m) => {
                const isSelected = selected.has(m.id)
                const selectedItem = selected.get(m.id)
                const unitLabel = m.unit?.name || m.unit_name || ''
                const price = m.last_purchase_price || m.reference_price

                return (
                  <div
                    key={m.id}
                    className={`border rounded-lg transition-colors ${
                      isSelected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Material row */}
                    <button
                      type="button"
                      onClick={() => toggleSelect(m)}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left"
                    >
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{m.name}</p>
                        <p className="text-xs text-gray-400">
                          {m.code}
                          {unitLabel ? ` • ${unitLabel}` : ''}
                          {m.specifications ? ` • ${m.specifications}` : ''}
                        </p>
                      </div>
                      {price && price > 0 && (
                        <span className="text-xs text-gray-500">{formatCurrency(price)}</span>
                      )}
                    </button>

                    {/* Expanded details when selected */}
                    {isSelected && selectedItem && (
                      <div className="px-4 pb-3 pt-1 border-t border-blue-200 grid grid-cols-4 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">NCC</label>
                          <select
                            value={selectedItem.supplier_id}
                            onChange={(e) => updateSelected(m.id, 'supplier_id', e.target.value)}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                          >
                            <option value="">Chọn NCC</option>
                            {suppliers.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.code} - {s.short_name || s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Số lượng</label>
                          <input
                            type="number"
                            value={selectedItem.quantity || ''}
                            onChange={(e) => updateSelected(m.id, 'quantity', parseFloat(e.target.value) || 0)}
                            min={0}
                            step="any"
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-right focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Đơn giá</label>
                          <input
                            type="number"
                            value={selectedItem.unit_price || ''}
                            onChange={(e) => updateSelected(m.id, 'unit_price', parseFloat(e.target.value) || 0)}
                            min={0}
                            step="any"
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-right focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">VAT %</label>
                          <input
                            type="number"
                            value={selectedItem.vat_rate}
                            onChange={(e) => updateSelected(m.id, 'vat_rate', parseFloat(e.target.value) || 0)}
                            min={0}
                            max={100}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-right focus:ring-1 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t bg-gray-50 rounded-b-xl">
          <span className="text-sm text-gray-500">
            Đã chọn: <strong>{selected.size}</strong> vật tư
          </span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              onClick={handleConfirm}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Thêm {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AddItemModal