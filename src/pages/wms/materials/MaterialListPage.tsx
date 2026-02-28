// ============================================================================
// FILE: src/pages/wms/materials/MaterialListPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P2 — Bước 2.5 + 2.6 (List + Form tích hợp)
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search,
  Plus,
  Package,
  ChevronRight,
  ChevronDown,
  X,
  Tag,
  Scale,
  AlertTriangle,
  AlertCircle,
  Clock,
  Loader2,
  CheckCircle2,
  Save,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface MaterialCategory {
  id: string
  name: string
  type: 'raw' | 'finished'
}

interface Material {
  id: string
  sku: string
  name: string
  type: 'raw' | 'finished'
  category_id?: string
  category?: MaterialCategory
  unit: string
  weight_per_unit?: number
  min_stock: number
  max_stock?: number
  shelf_life_days?: number
  description?: string
  image_url?: string
  is_active: boolean
  created_at: string
  updated_at: string
  current_stock?: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PRODUCT_FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'SVR3L', label: 'SVR 3L', search: 'SVR 3L' },
  { key: 'SVR5', label: 'SVR 5', search: 'SVR 5' },
  { key: 'SVR10', label: 'SVR 10', search: 'SVR 10' },
  { key: 'SVR20', label: 'SVR 20', search: 'SVR 20' },
  { key: 'LATEX', label: 'Latex', search: 'Latex' },
] as const

const TYPE_CONFIG: Record<string, { label: string; className: string; icon: string }> = {
  finished: {
    label: 'Thành phẩm',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-600/10',
    icon: '📦',
  },
  raw: {
    label: 'Nguyên liệu',
    className: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-600/10',
    icon: '🧴',
  },
}

const PAGE_SIZE = 20

// ============================================================================
// SUB-COMPONENTS — List
// ============================================================================

/** Status Badge */
const Badge: React.FC<{ label: string; className: string; icon?: string }> = ({
  label, className, icon,
}) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold leading-none rounded-full border ring-1 ring-inset ${className}`}>
    {icon && <span className="text-[10px]">{icon}</span>}
    {label}
  </span>
)

/** Stock level indicator */
const StockIndicator: React.FC<{
  current?: number
  min: number
  max?: number
  unit: string
}> = ({ current = 0, min, max, unit }) => {
  const ratio = max && max > 0 ? current / max : min > 0 ? current / (min * 3) : 0.5
  const capped = Math.min(ratio, 1)
  const isLow = min > 0 && current < min
  const barColor = isLow ? 'bg-red-500' : capped > 0.7 ? 'bg-emerald-500' : 'bg-amber-500'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[80px]">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${Math.max(capped * 100, 4)}%` }} />
      </div>
      <span className={`text-[13px] font-semibold tabular-nums ${isLow ? 'text-red-600' : 'text-gray-800'}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        {current.toLocaleString('vi-VN')}
      </span>
      <span className="text-[11px] text-gray-400">{unit}</span>
      {isLow && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
    </div>
  )
}

/** Material Card */
const MaterialCard: React.FC<{
  material: Material
  onTap: (id: string) => void
}> = ({ material, onTap }) => {
  const typeConf = TYPE_CONFIG[material.type] || TYPE_CONFIG.finished

  return (
    <button
      type="button"
      onClick={() => onTap(material.id)}
      className="w-full text-left bg-white rounded-[14px] border border-gray-100 overflow-hidden active:scale-[0.98] transition-transform duration-150 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
    >
      <div className="flex">
        {/* Left accent bar */}
        <div className={`w-1 shrink-0 rounded-l-[14px] ${material.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />

        <div className="flex-1 p-4">
          {/* Row 1: SKU + Type badge */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[13px] font-semibold text-[#1B4D3E] tracking-wide" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {material.sku}
            </span>
            <Badge label={typeConf.label} className={typeConf.className} icon={typeConf.icon} />
          </div>

          {/* Row 2: Name */}
          <h3 className="text-[15px] font-semibold text-gray-900 mb-1 leading-snug">{material.name}</h3>

          {/* Row 3: Meta */}
          <div className="flex items-center gap-3 mb-2.5 text-[12px] text-gray-500">
            {material.category && (
              <span className="flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {material.category.name}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Scale className="w-3 h-3" />
              {material.weight_per_unit ? `${material.weight_per_unit} kg/${material.unit}` : material.unit}
            </span>
            {material.shelf_life_days && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {material.shelf_life_days} ngày
              </span>
            )}
          </div>

          {/* Row 4: Stock + nav */}
          <div className="flex items-center justify-between">
            <StockIndicator
              current={material.current_stock}
              min={material.min_stock}
              max={material.max_stock}
              unit={material.unit}
            />
            <ChevronRight className="w-5 h-5 text-gray-300 shrink-0 ml-2" />
          </div>
        </div>
      </div>
    </button>
  )
}

/** Skeleton loading card */
const SkeletonCard: React.FC = () => (
  <div className="bg-white rounded-[14px] border border-gray-100 overflow-hidden">
    <div className="flex">
      <div className="w-1 bg-gray-200 shrink-0 rounded-l-[14px]" />
      <div className="flex-1 p-4 animate-pulse">
        <div className="flex items-center justify-between mb-2">
          <div className="h-4 w-24 bg-gray-200 rounded-md" />
          <div className="h-4 w-16 bg-gray-200 rounded-full" />
        </div>
        <div className="h-4 w-44 bg-gray-200 rounded-md mb-3" />
        <div className="flex gap-3 mb-3">
          <div className="h-3 w-20 bg-gray-200 rounded-md" />
          <div className="h-3 w-24 bg-gray-200 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-24 bg-gray-200 rounded-full" />
          <div className="h-3 w-16 bg-gray-200 rounded-md" />
        </div>
      </div>
    </div>
  </div>
)

/** Empty state */
const EmptyState: React.FC<{
  hasFilter: boolean
  onReset: () => void
  onCreate: () => void
}> = ({ hasFilter, onReset, onCreate }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6">
    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
      <Package className="w-8 h-8 text-gray-300" />
    </div>
    <h3 className="text-[16px] font-semibold text-gray-800 mb-1.5 text-center">
      {hasFilter ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm nào'}
    </h3>
    <p className="text-[14px] text-gray-500 text-center mb-5 max-w-[260px] leading-relaxed">
      {hasFilter
        ? 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm'
        : 'Thêm sản phẩm đầu tiên để bắt đầu quản lý kho thành phẩm'}
    </p>
    <button
      type="button"
      onClick={hasFilter ? onReset : onCreate}
      className="min-h-[48px] px-6 bg-[#1B4D3E] text-white text-[14px] font-semibold rounded-xl flex items-center gap-2 active:scale-[0.96] transition-transform duration-150 shadow-md shadow-[#1B4D3E]/20"
    >
      {hasFilter ? (
        <><X className="w-4 h-4" /> Xóa bộ lọc</>
      ) : (
        <><Plus className="w-4 h-4" /> Thêm sản phẩm</>
      )}
    </button>
  </div>
)

// ============================================================================
// MATERIAL FORM BOTTOM SHEET (tạo mới / sửa)
// ============================================================================

interface FormData {
  name: string
  sku: string
  category_id: string
  unit_id: string
  weight_per_unit: string
  min_stock: string
  max_stock: string
  shelf_life_days: string
  description: string
}

interface FormErrors {
  name?: string
  sku?: string
  weight_per_unit?: string
  max_stock?: string
}

interface LookupItem {
  id: string
  name: string
  code?: string
  symbol?: string
}

const INITIAL_FORM: FormData = {
  name: '',
  sku: '',
  category_id: '',
  unit_id: '',
  weight_per_unit: '33.33',
  min_stock: '0',
  max_stock: '',
  shelf_life_days: '365',
  description: '',
}

const MaterialFormSheet: React.FC<{
  materialId: string | null  // null=closed, 'new'=create, uuid=edit
  onClose: () => void
  onSaved: () => void
}> = ({ materialId, onClose, onSaved }) => {
  const isOpen = materialId !== null
  const isCreate = materialId === 'new'

  const [form, setForm] = useState<FormData>(INITIAL_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [loadingForm, setLoadingForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [categories, setCategories] = useState<LookupItem[]>([])
  const [units, setUnits] = useState<LookupItem[]>([])
  const [showAdvanced, setShowAdvanced] = useState(false)

  // ===== Load lookups =====
  useEffect(() => {
    if (!isOpen) return

    const loadLookups = async () => {
      try {
        const [catsRes, unitsRes] = await Promise.all([
          // ★ FIX: dùng is_active (boolean) thay vì status
          supabase.from('material_categories').select('id, name').eq('is_active', true).order('name'),
          supabase.from('units').select('id, name, symbol').eq('is_active', true).order('name'),
        ])
        if (catsRes.data) setCategories(catsRes.data)
        if (unitsRes.data) setUnits(unitsRes.data)
      } catch (err) {
        console.error('Lỗi tải danh mục:', err)
      }
    }
    loadLookups()
  }, [isOpen])

  // ===== Load material for edit =====
  useEffect(() => {
    if (!isOpen) return

    if (isCreate) {
      setForm(INITIAL_FORM)
      setErrors({})
      setDirty(false)
      setShowAdvanced(false)
      return
    }

    // Edit mode — load existing material
    const loadMaterial = async () => {
      setLoadingForm(true)
      try {
        const { data, error } = await supabase
          .from('materials')
          .select('*')
          .eq('id', materialId)
          .single()

        if (error) throw error
        if (data) {
          setForm({
            name: data.name || '',
            sku: data.sku || '',
            category_id: data.category_id || '',
            unit_id: '', // units table reference, map if needed
            weight_per_unit: data.weight_per_unit?.toString() || '',
            min_stock: data.min_stock?.toString() || '0',
            max_stock: data.max_stock?.toString() || '',
            shelf_life_days: data.shelf_life_days?.toString() || '',
            description: data.description || '',
          })
        }
      } catch (err) {
        console.error('Lỗi tải thành phẩm:', err)
        showToast('error', 'Không thể tải thông tin sản phẩm')
      } finally {
        setLoadingForm(false)
      }
    }
    loadMaterial()
  }, [materialId, isOpen, isCreate])

  // ===== Toast =====
  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  // ===== Update field =====
  const updateField = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setDirty(true)
    // Clear error for this field
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  // ===== Validate =====
  const validate = (): boolean => {
    const e: FormErrors = {}
    if (!form.name.trim()) e.name = 'Vui lòng nhập tên sản phẩm'
    if (!form.sku.trim()) e.sku = 'Vui lòng nhập mã SKU'
    if (form.weight_per_unit && isNaN(Number(form.weight_per_unit))) e.weight_per_unit = 'Số không hợp lệ'
    if (form.max_stock && isNaN(Number(form.max_stock))) e.max_stock = 'Số không hợp lệ'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ===== Submit =====
  const handleSubmit = async () => {
    if (!validate()) return

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        sku: form.sku.trim().toUpperCase(),
        type: 'finished' as const,
        category_id: form.category_id || null,
        unit: units.find(u => u.id === form.unit_id)?.symbol || 'bành',
        weight_per_unit: form.weight_per_unit ? Number(form.weight_per_unit) : null,
        min_stock: form.min_stock ? Number(form.min_stock) : 0,
        max_stock: form.max_stock ? Number(form.max_stock) : null,
        shelf_life_days: form.shelf_life_days ? Number(form.shelf_life_days) : null,
        description: form.description.trim() || null,
      }

      if (isCreate) {
        // Check SKU exists
        const { data: existing } = await supabase
          .from('materials')
          .select('id')
          .eq('sku', payload.sku as string)
          .maybeSingle()

        if (existing) {
          setErrors({ sku: `SKU "${payload.sku}" đã tồn tại` })
          setSaving(false)
          return
        }

        const { error } = await supabase.from('materials').insert(payload)
        if (error) throw error
        showToast('success', `Đã tạo ${form.name}`)
      } else {
        const { error } = await supabase.from('materials').update(payload).eq('id', materialId)
        if (error) throw error
        showToast('success', `Đã cập nhật ${form.name}`)
      }

      setTimeout(() => onSaved(), 500)
    } catch (err: any) {
      console.error('Lỗi lưu:', err)
      showToast('error', err.message || 'Không thể lưu sản phẩm')
    } finally {
      setSaving(false)
    }
  }

  // ===== Close handler =====
  const handleClose = () => {
    if (dirty && !window.confirm('Bạn có dữ liệu chưa lưu. Đóng form?')) return
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-50"
        onClick={handleClose}
        style={{ animation: 'fadeIn 200ms ease-out' }}
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-[20px] shadow-2xl"
        style={{
          maxHeight: '92vh',
          animation: 'sheetUp 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100">
          <h2 className="text-[17px] font-bold text-gray-900">
            {isCreate ? '✚ Thêm thành phẩm mới' : '✎ Sửa thành phẩm'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 active:bg-gray-200"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto px-4 pt-4 pb-28" style={{ maxHeight: 'calc(92vh - 140px)' }}>
          {loadingForm ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[#2D8B6E]" />
              <span className="ml-2 text-sm text-gray-500">Đang tải...</span>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {/* SKU */}
              <FieldGroup label="Mã SKU" required error={errors.sku} hint="VD: TP-SVR10">
                <input
                  type="text"
                  value={form.sku}
                  onChange={e => updateField('sku', e.target.value.toUpperCase())}
                  placeholder="TP-SVR10"
                  className={inputClass(errors.sku)}
                  autoFocus={isCreate}
                />
              </FieldGroup>

              {/* Name */}
              <FieldGroup label="Tên sản phẩm" required error={errors.name}>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => updateField('name', e.target.value)}
                  placeholder="Cao su SVR 10"
                  className={inputClass(errors.name)}
                />
              </FieldGroup>

              {/* Category */}
              <FieldGroup label="Nhóm sản phẩm">
                <div className="relative">
                  <select
                    value={form.category_id}
                    onChange={e => updateField('category_id', e.target.value)}
                    className={inputClass() + ' appearance-none pr-10'}
                  >
                    <option value="">— Chọn nhóm —</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </FieldGroup>

              {/* Unit */}
              <FieldGroup label="Đơn vị tính">
                <div className="relative">
                  <select
                    value={form.unit_id}
                    onChange={e => updateField('unit_id', e.target.value)}
                    className={inputClass() + ' appearance-none pr-10'}
                  >
                    <option value="">— Chọn đơn vị —</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name}{u.symbol ? ` (${u.symbol})` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </FieldGroup>

              {/* Weight per unit */}
              <FieldGroup label="Khối lượng / đơn vị" error={errors.weight_per_unit} hint="kg">
                <input
                  type="number"
                  inputMode="decimal"
                  value={form.weight_per_unit}
                  onChange={e => updateField('weight_per_unit', e.target.value)}
                  placeholder="33.33"
                  className={inputClass(errors.weight_per_unit)}
                  step="0.01"
                />
              </FieldGroup>

              {/* Advanced toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-sm font-medium text-[#2D8B6E]"
              >
                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
                {showAdvanced ? 'Ẩn bớt' : 'Thêm thông tin'}
              </button>

              {showAdvanced && (
                <>
                  {/* Min stock */}
                  <FieldGroup label="Tồn tối thiểu">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={form.min_stock}
                      onChange={e => updateField('min_stock', e.target.value)}
                      placeholder="0"
                      className={inputClass()}
                    />
                  </FieldGroup>

                  {/* Max stock */}
                  <FieldGroup label="Tồn tối đa" error={errors.max_stock}>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={form.max_stock}
                      onChange={e => updateField('max_stock', e.target.value)}
                      placeholder="Không giới hạn"
                      className={inputClass(errors.max_stock)}
                    />
                  </FieldGroup>

                  {/* Shelf life */}
                  <FieldGroup label="Hạn sử dụng" hint="ngày">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={form.shelf_life_days}
                      onChange={e => updateField('shelf_life_days', e.target.value)}
                      placeholder="365"
                      className={inputClass()}
                    />
                  </FieldGroup>

                  {/* Description */}
                  <FieldGroup label="Mô tả">
                    <textarea
                      value={form.description}
                      onChange={e => updateField('description', e.target.value)}
                      placeholder="Ghi chú về sản phẩm..."
                      rows={3}
                      className={inputClass() + ' resize-none'}
                    />
                  </FieldGroup>
                </>
              )}
            </div>
          )}
        </div>

        {/* Sticky bottom action bar */}
        {!loadingForm && (
          <div className="absolute bottom-0 inset-x-0 bg-white border-t border-gray-100 px-4 py-3 flex gap-3"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
          >
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 min-h-[48px] bg-gray-100 text-gray-700 text-[14px] font-semibold rounded-xl active:bg-gray-200 transition-colors"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex-[2] min-h-[48px] bg-[#1B4D3E] text-white text-[14px] font-semibold rounded-xl flex items-center justify-center gap-2 active:bg-[#163d31] transition-colors disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isCreate ? (
                <><Plus className="w-4 h-4" /> Tạo thành phẩm</>
              ) : (
                <><Save className="w-4 h-4" /> Lưu thay đổi</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-4 right-4 z-[60] px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-medium shadow-lg ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}
          style={{ animation: 'slideDown 300ms ease-out' }}
        >
          {toast.type === 'success'
            ? <CheckCircle2 className="w-5 h-5 shrink-0" />
            : <AlertCircle className="w-5 h-5 shrink-0" />}
          {toast.msg}
        </div>
      )}
    </>
  )
}

// ===== Form helpers =====

function FieldGroup({ label, required, error, hint, children }: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500">*</span>}
        {hint && <span className="text-xs text-gray-400 font-normal ml-auto">{hint}</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      )}
    </div>
  )
}

function inputClass(error?: string): string {
  return `
    w-full min-h-[48px] px-3.5 py-3
    bg-white text-[15px] text-gray-900
    rounded-xl
    border ${error ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200'}
    focus:outline-none focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/30
    transition-colors duration-150
    placeholder:text-gray-300
  `.trim()
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const MaterialListPage: React.FC = () => {
  // State
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [productFilter, setProductFilter] = useState<string>('all')
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  // ★ State điều khiển form bottom-sheet
  const [formMaterialId, setFormMaterialId] = useState<string | null>(null)

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300)
    return () => clearTimeout(timer)
  }, [searchText])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ─── Filter state helpers ───
  const hasActiveFilter = productFilter !== 'all' || debouncedSearch.length > 0

  // ─── FETCH DATA ───
  const fetchMaterials = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('materials')
        .select('*, category:material_categories(id, name, type)', { count: 'exact' })
        .eq('type', 'finished')
        .eq('is_active', true)
        .order('sku')
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      // Search
      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,sku.ilike.%${debouncedSearch}%`)
      }

      // Product filter
      if (productFilter !== 'all') {
        const filterConf = PRODUCT_FILTERS.find(f => f.key === productFilter)
        if (filterConf && 'search' in filterConf) {
          query = query.ilike('name', `%${filterConf.search}%`)
        }
      }

      const { data, count, error } = await query
      if (error) throw error

      // Map current_stock from stock_levels (optional - if table exists)
      const materialsWithStock: Material[] = (data || []).map(m => ({
        ...m,
        current_stock: 0, // TODO: join stock_levels khi P5 hoàn thành
      }))

      setMaterials(materialsWithStock)
      setTotal(count || 0)
    } catch (err) {
      console.error('Lỗi tải danh sách:', err)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, productFilter, page])

  useEffect(() => {
    fetchMaterials()
  }, [fetchMaterials])

  // Reset page khi filter thay đổi
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, productFilter])

  // ─── Handlers ───
  const handleCreate = () => {
    setFormMaterialId('new')
  }

  const handleTapCard = (id: string) => {
    setFormMaterialId(id)
  }

  const handleResetFilters = () => {
    setSearchText('')
    setProductFilter('all')
    setSearchOpen(false)
  }

  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-30 bg-[#1B4D3E] text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-[17px] font-bold">Thành phẩm</h1>
            <p className="text-[12px] text-white/60">{total} sản phẩm</p>
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen(!searchOpen)}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 active:bg-white/20"
          >
            {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <div className="px-4 pb-3" style={{ animation: 'slideDown 200ms ease-out' }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Tìm theo tên, mã SKU..."
                className="w-full h-10 pl-10 pr-8 bg-white/10 text-white text-[14px] rounded-xl border border-white/10 placeholder:text-white/30 focus:outline-none focus:bg-white/15 focus:border-white/30"
                autoFocus
              />
              {searchText && (
                <button
                  type="button"
                  onClick={() => setSearchText('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5 text-white/50" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filter chips */}
        <div className="px-4 pb-3 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2">
            {PRODUCT_FILTERS.map(f => {
              const isActive = productFilter === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setProductFilter(f.key)}
                  className={`shrink-0 px-3 py-1.5 text-[13px] font-medium rounded-full border transition-colors duration-150 ${
                    isActive
                      ? 'bg-white text-[#1B4D3E] border-white'
                      : 'bg-white/10 text-white/70 border-white/10'
                  }`}
                >
                  {f.label}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {/* ===== CONTENT ===== */}
      <main className="px-4 pb-28 pt-3">
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : materials.length === 0 ? (
          <EmptyState
            hasFilter={hasActiveFilter}
            onReset={handleResetFilters}
            onCreate={handleCreate}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {materials.map(material => (
              <MaterialCard
                key={material.id}
                material={material}
                onTap={handleTapCard}
              />
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-4">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="min-h-[48px] min-w-[48px] px-4 bg-white text-gray-700 text-sm font-medium rounded-xl border border-gray-200 disabled:opacity-30 disabled:pointer-events-none active:scale-[0.96] transition-transform duration-150"
                >
                  ← Trước
                </button>
                <span className="text-sm text-gray-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {page}/{totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="min-h-[48px] min-w-[48px] px-4 bg-white text-gray-700 text-sm font-medium rounded-xl border border-gray-200 disabled:opacity-30 disabled:pointer-events-none active:scale-[0.96] transition-transform duration-150"
                >
                  Sau →
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ===== FAB — Thêm sản phẩm ===== */}
      <button
        type="button"
        onClick={handleCreate}
        className="fixed bottom-6 right-4 w-14 h-14 bg-[#1B4D3E] text-white rounded-2xl shadow-lg shadow-[#1B4D3E]/30 flex items-center justify-center active:scale-[0.92] transition-transform duration-150 z-40"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* ★ MATERIAL FORM BOTTOM SHEET */}
      <MaterialFormSheet
        materialId={formMaterialId}
        onClose={() => setFormMaterialId(null)}
        onSaved={() => {
          setFormMaterialId(null)
          fetchMaterials()
        }}
      />

      {/* ===== KEYFRAME ANIMATIONS ===== */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sheetUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  )
}

export default MaterialListPage