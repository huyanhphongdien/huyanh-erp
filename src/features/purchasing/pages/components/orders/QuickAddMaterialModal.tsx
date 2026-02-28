// ============================================================================
// QUICK ADD MATERIAL MODAL - Tạo vật tư mới ngay trong form đơn hàng
// File: src/features/purchasing/pages/components/orders/QuickAddMaterialModal.tsx
// ============================================================================
// FIX 2026-02-26:
// - loadData: mỗi service call có try/catch riêng + fallback supabase trực tiếp
// - materialTypeService có thể chỉ có getAllActive() thay vì getAll()
// - unitService có thể không export getAll() — fallback query supabase
// - previewMaterialCode có thể không tồn tại — fallback '---'
// ============================================================================

import { useState, useEffect, useRef } from 'react'
import { X, Package, Loader2, Save, AlertCircle, Eye } from 'lucide-react'
import { supabase } from '../../../../../lib/supabase'
import { materialService, type MaterialFormData } from '../../../../../services/materialService'
import { materialCategoryService, type MaterialCategory } from '../../../../../services/materialCategoryService'
import { materialTypeService, type MaterialType } from '../../../../../services/materialTypeService'
import { supplierService } from '../../../../../services/supplierService'

// Safe import previewMaterialCode — có thể không export
let previewMaterialCode: ((catId: string, typeId: string) => Promise<string>) | null = null
try {
  const mod = require('../../../../../services/materialService')
  if (typeof mod.previewMaterialCode === 'function') {
    previewMaterialCode = mod.previewMaterialCode
  }
} catch {
  // not available
}

// Safe import unitService — module có thể thiếu hoặc API khác
let unitService: any = null
try {
  const mod = require('../../../../../services/unitService')
  unitService = mod.unitService || mod.default || null
} catch {
  // not available
}

// ===== TYPES =====

interface Unit {
  id: string
  code: string
  name: string
  symbol?: string
  is_active?: boolean
}

interface Supplier {
  id: string
  code: string
  name: string
  short_name?: string
}

/** Material trả về sau khi tạo — khớp interface Material trong OrderItemsTable */
export interface CreatedMaterial {
  id: string
  code: string
  name: string
  unit_name?: string
  specifications?: string
  reference_price?: number
  last_purchase_price?: number
  unit?: {
    id: string
    code: string
    name: string
    symbol?: string
  }
}

interface QuickAddMaterialModalProps {
  initialName?: string
  onSave: (material: CreatedMaterial) => void
  onClose: () => void
}

// ============================================================================
// HELPER: Safe service call with fallback
// ============================================================================

async function safeLoadFromService<T>(
  serviceFn: (() => Promise<any>) | null,
  extractData: (res: any) => T[],
  fallbackQuery?: () => Promise<T[]>
): Promise<T[]> {
  // Try service first
  if (serviceFn) {
    try {
      const res = await serviceFn()
      const data = extractData(res)
      if (Array.isArray(data) && data.length > 0) return data
    } catch { /* ignore */ }
  }
  // Fallback to supabase
  if (fallbackQuery) {
    try {
      return await fallbackQuery()
    } catch { /* ignore */ }
  }
  return []
}

// ============================================================================
// COMPONENT
// ============================================================================

export function QuickAddMaterialModal({ initialName = '', onSave, onClose }: QuickAddMaterialModalProps) {
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Form state — khớp MaterialFormData
  const [form, setForm] = useState<MaterialFormData>({
    name: initialName,
    category_id: '',
    type_id: '',
    unit_id: '',
    preferred_supplier_id: '',
    specifications: '',
    brand: '',
    origin: '',
    description: '',
    reference_price: 0,
    min_stock: 0,
    current_stock: 0,
    last_purchase_price: 0,
    status: 'active',
  })

  // Code preview
  const [codePreview, setCodePreview] = useState('---')
  const [loadingCode, setLoadingCode] = useState(false)

  // Reference data
  const [categories, setCategories] = useState<MaterialCategory[]>([])
  const [allTypes, setAllTypes] = useState<MaterialType[]>([])
  const [filteredTypes, setFilteredTypes] = useState<MaterialType[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  // UI state
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showMore, setShowMore] = useState(false)

  // ===== Load reference data — each with individual try/catch =====
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)

      // 1. Categories
      const catData = await safeLoadFromService<MaterialCategory>(
        // Try getAll first
        () => materialCategoryService.getAll({ page: 1, pageSize: 100, is_active: true }),
        (res) => res?.data || [],
        // Fallback: supabase direct
        async () => {
          const { data } = await supabase
            .from('material_categories')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('name')
          return data || []
        }
      )
      setCategories(catData)

      // 2. Material Types
      let typeData: MaterialType[] = []
      // Try getAll
      try {
        if (typeof (materialTypeService as any).getAll === 'function') {
          const res = await (materialTypeService as any).getAll({ page: 1, pageSize: 200, is_active: true })
          typeData = res?.data || (Array.isArray(res) ? res : [])
        }
      } catch { /* ignore */ }
      // Try getAllActive
      if (typeData.length === 0) {
        try {
          if (typeof materialTypeService.getAllActive === 'function') {
            typeData = await materialTypeService.getAllActive()
          }
        } catch { /* ignore */ }
      }
      // Fallback: supabase
      if (typeData.length === 0) {
        try {
          const { data } = await supabase
            .from('material_types')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .order('name')
          typeData = data || []
        } catch { /* ignore */ }
      }
      setAllTypes(typeData)
      setFilteredTypes(typeData)

      // 3. Units
      let unitData: Unit[] = []
      // Try unitService.getAll
      try {
        if (unitService && typeof unitService.getAll === 'function') {
          const res = await unitService.getAll({ page: 1, pageSize: 200, isActive: true })
          unitData = res?.data || (Array.isArray(res) ? res : [])
        }
      } catch { /* ignore */ }
      // Try unitService.getAllActive
      if (unitData.length === 0) {
        try {
          if (unitService && typeof unitService.getAllActive === 'function') {
            unitData = await unitService.getAllActive()
          }
        } catch { /* ignore */ }
      }
      // Fallback: supabase
      if (unitData.length === 0) {
        try {
          const { data } = await supabase
            .from('units')
            .select('*')
            .eq('is_active', true)
            .order('name')
          unitData = data || []
        } catch { /* ignore */ }
      }
      setUnits(unitData)

      // 4. Suppliers
      let supData: Supplier[] = []
      try {
        const res = await supplierService.getAll({ page: 1, pageSize: 200, status: 'active' })
        supData = res?.data || []
      } catch { /* ignore */ }
      if (supData.length === 0) {
        try {
          const { data } = await supabase
            .from('suppliers')
            .select('id, code, name, short_name')
            .eq('status', 'active')
            .order('code')
          supData = data || []
        } catch { /* ignore */ }
      }
      setSuppliers(supData)

      setLoading(false)
    }
    loadData()
  }, [])

  // Auto-focus name input
  useEffect(() => {
    if (!loading) {
      setTimeout(() => nameInputRef.current?.focus(), 100)
    }
  }, [loading])

  // Filter types by category
  useEffect(() => {
    if (form.category_id) {
      const filtered = allTypes.filter((t) => t.category_id === form.category_id)
      setFilteredTypes(filtered)
      // Clear type if not in filtered list
      if (form.type_id && !filtered.find((t) => t.id === form.type_id)) {
        setForm((prev) => ({ ...prev, type_id: '' }))
      }
    } else {
      setFilteredTypes(allTypes)
    }
  }, [form.category_id, allTypes])

  // ===== Preview material code =====
  useEffect(() => {
    const preview = async () => {
      if (!form.category_id) {
        setCodePreview('---')
        return
      }
      try {
        setLoadingCode(true)
        if (previewMaterialCode) {
          const code = await previewMaterialCode(form.category_id, form.type_id || '')
          setCodePreview(code)
        } else {
          // Fallback: show category code + ???
          const cat = categories.find((c) => c.id === form.category_id)
          const catCode = (cat as any)?.code || cat?.name?.substring(0, 2).toUpperCase() || 'VT'
          setCodePreview(`${catCode}-???`)
        }
      } catch {
        setCodePreview('---')
      } finally {
        setLoadingCode(false)
      }
    }
    preview()
  }, [form.category_id, form.type_id, categories])

  // ===== Handlers =====

  const updateField = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (error) setError('')
  }

  const handleSave = async () => {
    // Validate
    if (!form.name.trim()) {
      setError('Vui lòng nhập tên vật tư')
      nameInputRef.current?.focus()
      return
    }
    if (!form.category_id) {
      setError('Vui lòng chọn nhóm vật tư')
      return
    }

    try {
      setSaving(true)
      setError('')

      // Clean empty strings to null for optional UUID fields
      const cleanForm = { ...form }
      if (!cleanForm.type_id) cleanForm.type_id = undefined as any
      if (!cleanForm.unit_id) cleanForm.unit_id = undefined as any
      if (!cleanForm.preferred_supplier_id) cleanForm.preferred_supplier_id = undefined as any

      // Dùng materialService.create() — tự sinh mã theo quy tắc
      const created = await materialService.create(cleanForm)

      // Tìm unit để trả về đầy đủ
      const selectedUnit = units.find((u) => u.id === form.unit_id)

      const newMaterial: CreatedMaterial = {
        id: created.id,
        code: created.code || '',
        name: created.name || form.name,
        unit_name: selectedUnit?.name || created.unit_name || '',
        specifications: created.specifications || form.specifications?.trim() || undefined,
        reference_price: created.reference_price || form.reference_price || undefined,
        last_purchase_price: created.last_purchase_price || form.last_purchase_price || undefined,
        unit: selectedUnit
          ? { id: selectedUnit.id, code: selectedUnit.code, name: selectedUnit.name, symbol: selectedUnit.symbol }
          : undefined,
      }

      onSave(newMaterial)
    } catch (err: any) {
      console.error('Create material error:', err)
      const msg = err?.message || ''
      if (msg.includes('violates foreign key') || msg.includes('fkey')) {
        setError('Lỗi dữ liệu liên kết. Vui lòng kiểm tra nhóm/loại/đơn vị đã chọn.')
      } else if (msg.includes('duplicate') || msg.includes('unique')) {
        setError('Mã vật tư đã tồn tại. Vui lòng thử lại.')
      } else if (msg.includes('permission') || msg.includes('RLS') || msg.includes('policy')) {
        setError('Không có quyền tạo vật tư. Liên hệ quản trị viên.')
      } else {
        setError(msg || 'Lỗi tạo vật tư. Vui lòng thử lại.')
      }
    } finally {
      setSaving(false)
    }
  }

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [saving, onClose])

  // ===== RENDER =====
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={saving ? undefined : onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Thêm vật tư mới</h3>
              <p className="text-sm text-blue-600 font-mono flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Mã: {loadingCode ? '...' : codePreview}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-gray-500 mt-3">Đang tải dữ liệu...</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* ===== THÔNG TIN CƠ BẢN ===== */}
              <div>
                <h4 className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                  <Package className="w-4 h-4" />
                  Thông tin cơ bản
                </h4>

                <div className="space-y-4">
                  {/* Tên vật tư */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tên vật tư <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={nameInputRef}
                      type="text"
                      value={form.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      placeholder="VD: Xi măng PCB40 Holcim"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[15px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Nhóm + Loại */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nhóm vật tư <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={form.category_id}
                        onChange={(e) => updateField('category_id', e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[15px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        <option value="">-- Chọn nhóm --</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Loại vật tư</label>
                      <select
                        value={form.type_id}
                        onChange={(e) => updateField('type_id', e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[15px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        <option value="">-- Chọn loại --</option>
                        {filteredTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* ĐVT + NCC ưu tiên */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị tính</label>
                      <select
                        value={form.unit_id}
                        onChange={(e) => updateField('unit_id', e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[15px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        <option value="">-- Chọn đơn vị --</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                            {u.symbol ? ` (${u.symbol})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">NCC ưu tiên</label>
                      <select
                        value={form.preferred_supplier_id || ''}
                        onChange={(e) => updateField('preferred_supplier_id', e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[15px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      >
                        <option value="">-- Chọn NCC --</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.code} - {s.short_name || s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Quy cách */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quy cách / Thông số kỹ thuật
                    </label>
                    <input
                      type="text"
                      value={form.specifications || ''}
                      onChange={(e) => updateField('specifications', e.target.value)}
                      placeholder="VD: Bao 50kg, sản xuất tại VN"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[15px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>

                  {/* Thương hiệu + Xuất xứ */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Thương hiệu</label>
                      <input
                        type="text"
                        value={form.brand || ''}
                        onChange={(e) => updateField('brand', e.target.value)}
                        placeholder="VD: Holcim, Hòa Phát..."
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[15px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Xuất xứ</label>
                      <input
                        type="text"
                        value={form.origin || ''}
                        onChange={(e) => updateField('origin', e.target.value)}
                        placeholder="VD: Việt Nam, Nhật Bản..."
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[15px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Mô tả */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                    <textarea
                      value={form.description || ''}
                      onChange={(e) => updateField('description', e.target.value)}
                      rows={2}
                      placeholder="Mô tả chi tiết về vật tư..."
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[15px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* ===== TỒN KHO & GIÁ (mở rộng) ===== */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowMore(!showMore)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <span className={`transform transition-transform ${showMore ? 'rotate-90' : ''}`}>▶</span>
                  Tồn kho & Giá
                  {!showMore && <span className="text-xs text-gray-400">(tùy chọn)</span>}
                </button>

                {showMore && (
                  <div className="mt-3 space-y-4 pl-1">
                    {/* Tồn kho */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Tồn kho tối thiểu</label>
                        <input
                          type="number"
                          value={form.min_stock || ''}
                          onChange={(e) => updateField('min_stock', parseFloat(e.target.value) || 0)}
                          min={0}
                          placeholder="0"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Tồn kho hiện tại</label>
                        <input
                          type="number"
                          value={form.current_stock || ''}
                          onChange={(e) => updateField('current_stock', parseFloat(e.target.value) || 0)}
                          min={0}
                          placeholder="0"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Giá mua gần nhất</label>
                        <input
                          type="number"
                          value={form.last_purchase_price || ''}
                          onChange={(e) => updateField('last_purchase_price', parseFloat(e.target.value) || 0)}
                          min={0}
                          placeholder="0"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>

                    {/* Giá tham khảo */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Giá tham khảo (VNĐ)</label>
                      <input
                        type="number"
                        value={form.reference_price || ''}
                        onChange={(e) => updateField('reference_price', parseFloat(e.target.value) || 0)}
                        min={0}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex-shrink-0">
            {/* Code preview */}
            <div className="text-sm">
              <span className="text-gray-500">Mã tạo ra: </span>
              <span className="font-mono font-semibold text-blue-700">
                {loadingCode ? '...' : codePreview}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.category_id}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang tạo...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Tạo vật tư
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default QuickAddMaterialModal