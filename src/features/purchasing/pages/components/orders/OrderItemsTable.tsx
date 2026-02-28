// ============================================================================
// ORDER ITEMS TABLE - Smart Material Search & Inline Add
// File: src/features/purchasing/pages/components/orders/OrderItemsTable.tsx
// ============================================================================
// FEATURES:
// - MaterialCombobox: Gõ tìm ngay, dropdown thông minh, auto-fill
// - QuickAddMaterialModal: Tạo vật tư mới không cần rời trang
// - Fixed dropdown: Không bị cắt bởi table overflow
// - Selected state: Hiển thị rõ vật tư đã chọn với nút đổi/xóa
// - Auto-fill: Mã VT, ĐVT, giá gần nhất khi chọn vật tư
// ============================================================================

import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import {
  Plus,
  Trash2,
  Package,
  Search,
  ShoppingCart,
  X,
  Check,
  PlusCircle,
  RefreshCw,
} from 'lucide-react'
import { calculateItemAmounts, formatCurrency } from '../../../../../services/purchaseOrderService'
import { QuickAddMaterialModal, type CreatedMaterial } from './QuickAddMaterialModal'

// ============================================================================
// TYPES
// ============================================================================

interface Supplier {
  id: string
  code: string
  name: string
  short_name?: string
}

interface Material {
  id: string
  code: string
  name: string
  unit_name?: string
  specifications?: string
  last_purchase_price?: number
  reference_price?: number
  category_name?: string
  unit?: {
    id: string
    code: string
    name: string
    symbol?: string
  }
}

export interface FormItem {
  _tempId: string
  id?: string
  material_id?: string
  supplier_id: string
  material_code: string
  material_name: string
  specifications: string
  unit: string
  quantity: number
  unit_price: number
  vat_rate: number
  amount: number
  vat_amount: number
  total_amount: number
  notes: string
  supplier_name?: string
  supplier_code?: string
}

interface OrderItemsTableProps {
  items: FormItem[]
  suppliers: Supplier[]
  materials: Material[]
  onChange: (items: FormItem[]) => void
  /** Callback khi tạo vật tư mới — parent thêm vào materials list */
  onMaterialCreated?: (material: Material) => void
}

// ============================================================================
// HELPERS
// ============================================================================

export function generateTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createEmptyItem(): FormItem {
  return {
    _tempId: generateTempId(),
    supplier_id: '',
    material_code: '',
    material_name: '',
    specifications: '',
    unit: '',
    quantity: 0,
    unit_price: 0,
    vat_rate: 10,
    amount: 0,
    vat_amount: 0,
    total_amount: 0,
    notes: '',
  }
}

export function recalcItem(item: FormItem): FormItem {
  const { amount, vat_amount, total_amount } = calculateItemAmounts(item.quantity, item.unit_price, item.vat_rate)
  return { ...item, amount, vat_amount, total_amount }
}

// ============================================================================
// MATERIAL COMBOBOX
// ============================================================================
// Trạng thái:
// 1. Chưa chọn: Input search → dropdown kết quả → chọn hoặc tạo mới
// 2. Đã chọn: Card xanh hiển thị tên/mã/ĐVT → nút đổi
// ============================================================================

interface MaterialComboboxProps {
  item: FormItem
  materials: Material[]
  onSelect: (material: Material) => void
  onClear: () => void
  onQuickAdd: (searchText: string) => void
}

function MaterialCombobox({ item, materials, onSelect, onClear, onQuickAdd }: MaterialComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})

  const isSelected = !!(item.material_id && item.material_name)

  // ===== Filter materials =====
  const filtered = useMemo(() => {
    const query = searchText.toLowerCase().trim()
    if (!query) {
      return materials.slice(0, 50)
    }
    return materials
      .filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.code.toLowerCase().includes(query) ||
          (m.specifications || '').toLowerCase().includes(query) ||
          (m.category_name || '').toLowerCase().includes(query)
      )
      .slice(0, 40)
  }, [materials, searchText])

  // ===== Calculate dropdown position (fixed) =====
  const updateDropdownPosition = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - 16
    const spaceAbove = rect.top - 16
    const dropdownHeight = Math.min(380, Math.max(spaceBelow, spaceAbove))
    const showAbove = spaceBelow < 200 && spaceAbove > spaceBelow

    setDropdownStyle({
      position: 'fixed',
      left: Math.max(8, rect.left),
      width: Math.max(rect.width, 380),
      maxHeight: dropdownHeight,
      zIndex: 9999,
      ...(showAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    })
  }, [])

  const handleOpen = useCallback(() => {
    updateDropdownPosition()
    setIsOpen(true)
  }, [updateDropdownPosition])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setSearchText('')
  }, [])

  const handleSelect = useCallback(
    (m: Material) => {
      onSelect(m)
      handleClose()
    },
    [onSelect, handleClose]
  )

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onClear()
      setSearchText('')
      setTimeout(() => inputRef.current?.focus(), 50)
    },
    [onClear]
  )

  const handleQuickAdd = useCallback(() => {
    const name = searchText.trim()
    handleClose()
    onQuickAdd(name)
  }, [searchText, handleClose, onQuickAdd])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, handleClose])

  // Format helpers
  const getPrice = (m: Material) => m.last_purchase_price || m.reference_price || 0
  const getUnitLabel = (m: Material) => m.unit?.name || m.unit_name || ''

  // ==========================================================================
  // RENDER: SELECTED STATE
  // ==========================================================================
  if (isSelected) {
    return (
      <div
        ref={containerRef}
        className="flex items-center gap-2 px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-lg cursor-default group/mat"
      >
        <div className="w-6 h-6 bg-blue-100 rounded flex items-center justify-center flex-shrink-0">
          <Check className="w-3.5 h-3.5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{item.material_name}</p>
          <p className="text-xs text-gray-500 truncate">
            <span className="font-mono text-gray-400">{item.material_code}</span>
            {item.unit && (
              <>
                <span className="mx-1 text-gray-300">·</span>
                {item.unit}
              </>
            )}
            {item.specifications && (
              <>
                <span className="mx-1 text-gray-300">·</span>
                <span className="text-gray-400">{item.specifications}</span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover/mat:opacity-100"
          title="Đổi vật tư"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  // ==========================================================================
  // RENDER: SEARCH STATE
  // ==========================================================================
  return (
    <div ref={containerRef} className="relative">
      {/* Search input */}
      <div className="flex items-center gap-1.5 px-2.5 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all bg-white">
        <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value)
            if (!isOpen) handleOpen()
          }}
          onFocus={handleOpen}
          placeholder="Tìm vật tư theo tên, mã..."
          className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400 min-w-0"
        />
        {searchText && (
          <button
            type="button"
            onClick={() => setSearchText('')}
            className="p-0.5 text-gray-300 hover:text-gray-500 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[9998]" onClick={handleClose} />

          {/* Results */}
          <div
            style={dropdownStyle}
            className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden flex flex-col"
          >
            {/* Header hint */}
            {!searchText && (
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                <p className="text-xs text-gray-500">
                  💡 Gõ để tìm kiếm trong {materials.length} vật tư
                </p>
              </div>
            )}

            {/* Results list */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    Không tìm thấy vật tư{' '}
                    {searchText && <span className="font-medium">"{searchText}"</span>}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Bạn có thể tạo vật tư mới bên dưới</p>
                </div>
              ) : (
                filtered.map((m) => {
                  const unitLabel = getUnitLabel(m)
                  const price = getPrice(m)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelect(m)}
                      className="w-full px-3 py-2.5 text-left hover:bg-blue-50 flex items-center gap-2.5 border-b border-gray-50 last:border-b-0 transition-colors group/item"
                    >
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 group-hover/item:bg-blue-100 transition-colors">
                        <Package className="w-4 h-4 text-gray-400 group-hover/item:text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {searchText ? highlightText(m.name, searchText) : m.name}
                        </p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          <span className="font-mono text-gray-400">{m.code}</span>
                          {unitLabel && (
                            <>
                              <span className="mx-1 text-gray-300">·</span>
                              {unitLabel}
                            </>
                          )}
                          {m.specifications && (
                            <>
                              <span className="mx-1 text-gray-300">·</span>
                              <span className="text-gray-400">{m.specifications}</span>
                            </>
                          )}
                        </p>
                      </div>
                      {price > 0 && (
                        <span className="text-xs text-gray-500 flex-shrink-0 font-medium tabular-nums">
                          {formatCurrency(price)}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>

            {/* Footer: count + quick add */}
            <div className="border-t border-gray-200 bg-gray-50/80">
              {filtered.length > 0 && searchText && (
                <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-100">
                  Tìm thấy {filtered.length}
                  {filtered.length >= 40 ? '+' : ''} kết quả
                </div>
              )}

              <button
                type="button"
                onClick={handleQuickAdd}
                className="w-full px-3 py-2.5 text-left flex items-center gap-2.5 text-emerald-700 hover:bg-emerald-50 transition-colors"
              >
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <PlusCircle className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">Tạo vật tư mới</p>
                  {searchText && (
                    <p className="text-xs text-emerald-600/70 truncate">với tên "{searchText}"</p>
                  )}
                </div>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Highlight search text in results
function highlightText(text: string, query: string): React.ReactNode {
  if (!query) return text
  const index = text.toLowerCase().indexOf(query.toLowerCase())
  if (index === -1) return text
  return (
    <>
      {text.slice(0, index)}
      <span className="bg-yellow-100 text-yellow-800 rounded-sm px-0.5">
        {text.slice(index, index + query.length)}
      </span>
      {text.slice(index + query.length)}
    </>
  )
}

// ============================================================================
// ITEM ROW
// ============================================================================

interface ItemRowProps {
  item: FormItem
  index: number
  suppliers: Supplier[]
  materials: Material[]
  onChange: (item: FormItem) => void
  onRemove: () => void
  onSelectMaterial: (material: Material) => void
  onClearMaterial: () => void
  onQuickAdd: (searchText: string) => void
}

function ItemRow({
  item,
  index,
  suppliers,
  materials,
  onChange,
  onRemove,
  onSelectMaterial,
  onClearMaterial,
  onQuickAdd,
}: ItemRowProps) {
  const handleFieldChange = (field: string, value: any) => {
    const updated = { ...item, [field]: value }
    if (['quantity', 'unit_price', 'vat_rate'].includes(field)) {
      onChange(recalcItem(updated))
    } else {
      onChange(updated)
    }
  }

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/30 group">
      {/* STT */}
      <td className="px-3 py-3 text-center text-sm text-gray-400 font-medium w-12 align-top pt-5">
        {index + 1}
      </td>

      {/* Vật tư - MaterialCombobox */}
      <td className="px-3 py-3 min-w-[260px] align-top">
        <MaterialCombobox
          item={item}
          materials={materials}
          onSelect={onSelectMaterial}
          onClear={onClearMaterial}
          onQuickAdd={onQuickAdd}
        />
      </td>

      {/* NCC */}
      <td className="px-3 py-3 min-w-[180px] align-top">
        <select
          value={item.supplier_id}
          onChange={(e) => {
            const sup = suppliers.find((s) => s.id === e.target.value)
            if (sup) {
              onChange({ ...item, supplier_id: sup.id, supplier_code: sup.code, supplier_name: sup.name })
            } else {
              handleFieldChange('supplier_id', '')
            }
          }}
          className={`w-full px-2.5 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors ${
            item.supplier_id ? 'border-gray-300 text-gray-900' : 'border-gray-300 text-gray-400'
          }`}
        >
          <option value="">Chọn NCC *</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} - {s.short_name || s.name}
            </option>
          ))}
        </select>
      </td>

      {/* Số lượng */}
      <td className="px-3 py-3 w-28 align-top">
        <input
          type="number"
          value={item.quantity || ''}
          onChange={(e) => handleFieldChange('quantity', parseFloat(e.target.value) || 0)}
          min={0}
          step="any"
          placeholder="0"
          className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none transition-colors tabular-nums"
        />
      </td>

      {/* Đơn giá */}
      <td className="px-3 py-3 w-32 align-top">
        <input
          type="number"
          value={item.unit_price || ''}
          onChange={(e) => handleFieldChange('unit_price', parseFloat(e.target.value) || 0)}
          min={0}
          step="any"
          placeholder="0"
          className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none transition-colors tabular-nums"
        />
        {item.material_id && item.unit_price > 0 && item.unit && (
          <p className="text-[10px] text-gray-400 text-right mt-0.5 tabular-nums">/{item.unit}</p>
        )}
      </td>

      {/* VAT % */}
      <td className="px-3 py-3 w-20 align-top">
        <input
          type="number"
          value={item.vat_rate}
          onChange={(e) => handleFieldChange('vat_rate', parseFloat(e.target.value) || 0)}
          min={0}
          max={100}
          step={0.5}
          className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none transition-colors tabular-nums"
        />
      </td>

      {/* Thành tiền */}
      <td className="px-3 py-3 w-36 text-right align-top pt-5">
        {item.total_amount > 0 ? (
          <>
            <p className="text-sm font-semibold text-gray-900 tabular-nums">
              {formatCurrency(item.total_amount)}
            </p>
            {item.vat_amount > 0 && (
              <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                VAT: {formatCurrency(item.vat_amount)}
              </p>
            )}
          </>
        ) : (
          <span className="text-sm text-gray-300">—</span>
        )}
      </td>

      {/* Xóa */}
      <td className="px-3 py-3 w-12 text-center align-top pt-4">
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
          title="Xóa dòng"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  )
}

// ============================================================================
// MAIN TABLE COMPONENT
// ============================================================================

export function OrderItemsTable({
  items,
  suppliers,
  materials,
  onChange,
  onMaterialCreated,
}: OrderItemsTableProps) {
  // Quick Add Modal state
  const [quickAdd, setQuickAdd] = useState<{
    show: boolean
    rowIndex: number | null
    initialName: string
  }>({ show: false, rowIndex: null, initialName: '' })

  // ===== Item CRUD =====

  const handleItemChange = (index: number, updatedItem: FormItem) => {
    const newItems = items.map((item, i) => (i === index ? updatedItem : item))
    onChange(newItems)
  }

  const handleAddItem = () => {
    onChange([...items, createEmptyItem()])
  }

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      onChange([createEmptyItem()])
    } else {
      onChange(items.filter((_, i) => i !== index))
    }
  }

  // ===== Material Selection =====

  const handleSelectMaterial = (index: number, material: Material) => {
    const newItems = items.map((item, i) => {
      if (i !== index) return item
      const unitLabel = material.unit?.name || material.unit_name || item.unit
      const price = material.last_purchase_price || material.reference_price || item.unit_price
      const updated: FormItem = {
        ...item,
        material_id: material.id,
        material_code: material.code,
        material_name: material.name,
        unit: unitLabel || '',
        specifications: material.specifications || '',
        unit_price: price || 0,
      }
      return recalcItem(updated)
    })
    onChange(newItems)
  }

  const handleClearMaterial = (index: number) => {
    const newItems = items.map((item, i) => {
      if (i !== index) return item
      return {
        ...item,
        material_id: undefined,
        material_code: '',
        material_name: '',
        unit: '',
        specifications: '',
      }
    })
    onChange(newItems)
  }

  // ===== Quick Add Material =====

  const handleQuickAddOpen = (rowIndex: number, initialName: string) => {
    setQuickAdd({ show: true, rowIndex, initialName })
  }

  const handleQuickAddSave = (createdMaterial: CreatedMaterial) => {
    const material: Material = {
      id: createdMaterial.id,
      code: createdMaterial.code,
      name: createdMaterial.name,
      unit_name: createdMaterial.unit_name,
      specifications: createdMaterial.specifications,
      reference_price: createdMaterial.reference_price,
      unit: createdMaterial.unit,
    }

    // Select in the row that triggered Quick Add
    if (quickAdd.rowIndex !== null) {
      handleSelectMaterial(quickAdd.rowIndex, material)
    }

    // Notify parent to add to materials list
    onMaterialCreated?.(material)

    setQuickAdd({ show: false, rowIndex: null, initialName: '' })
  }

  const handleQuickAddClose = () => {
    setQuickAdd({ show: false, rowIndex: null, initialName: '' })
  }

  // Valid items count
  const validCount = items.filter((i) => i.material_name && i.supplier_id).length

  // ===== RENDER =====
  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-orange-500" />
            Danh sách vật tư
            <span className="text-sm font-normal text-gray-400">({validCount} mục)</span>
          </h2>
          <button
            type="button"
            onClick={handleAddItem}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Thêm dòng
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase w-12">
                  #
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase min-w-[260px]">
                  Vật tư
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase min-w-[180px]">
                  NCC
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase w-28">
                  Số lượng
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase w-32">
                  Đơn giá
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase w-20">
                  VAT %
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase w-36">
                  Thành tiền
                </th>
                <th className="px-3 py-2.5 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <ItemRow
                  key={item._tempId}
                  item={item}
                  index={index}
                  suppliers={suppliers}
                  materials={materials}
                  onChange={(updated) => handleItemChange(index, updated)}
                  onRemove={() => handleRemoveItem(index)}
                  onSelectMaterial={(mat) => handleSelectMaterial(index, mat)}
                  onClearMaterial={() => handleClearMaterial(index)}
                  onQuickAdd={(name) => handleQuickAddOpen(index, name)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={handleAddItem}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Thêm dòng vật tư
          </button>
        </div>
      </div>

      {/* Quick Add Material Modal */}
      {quickAdd.show && (
        <QuickAddMaterialModal
          initialName={quickAdd.initialName}
          onSave={handleQuickAddSave}
          onClose={handleQuickAddClose}
        />
      )}
    </>
  )
}

export default OrderItemsTable