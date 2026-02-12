// ============================================================================
// FILE: src/pages/wms/materials/MaterialFormPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P2 — Bước 2.6 (CẬP NHẬT — hỗ trợ tạo mới + sửa)
// ============================================================================
// FIX 11/02/2026: .eq('status','active') → .eq('is_active', true)
//   material_categories không có cột 'status', chỉ có 'is_active' (boolean)
// ============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  X,
  Package,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Plus,
  Save,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface MaterialFormPageProps {
  materialId: string | null
  onClose: () => void
  onSaved?: () => void
}

interface Category {
  id: string
  name: string
  code?: string
}

interface Unit {
  id: string
  name: string
  symbol?: string
  code?: string
}

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
  category_id?: string
  unit_id?: string
  weight_per_unit?: string
  max_stock?: string
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

// ============================================================================
// COMPONENT
// ============================================================================

const MaterialFormPage: React.FC<MaterialFormPageProps> = ({
  materialId,
  onClose,
  onSaved,
}) => {
  const isOpen = materialId !== null
  const isCreateMode = materialId === 'new'
  const sheetRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState<FormData>(INITIAL_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [materialName, setMaterialName] = useState('')

  // ===== LOAD CATEGORIES & UNITS =====
  useEffect(() => {
    if (!isOpen) return

    const loadLookups = async () => {
      try {
        // ★ FIX: dùng is_active (boolean) thay vì status
        const { data: cats } = await supabase
          .from('material_categories')
          .select('id, name')
          .eq('is_active', true)
          .order('name')

        if (cats) setCategories(cats)

        // ★ FIX: units cũng dùng is_active nếu bảng units có cột này
        // Nếu bảng units dùng 'status' thì giữ nguyên
        const { data: unitList } = await supabase
          .from('units')
          .select('id, name, symbol')
          .eq('is_active', true)
          .order('name')

        if (unitList) setUnits(unitList)
      } catch (err) {
        console.error('Lỗi tải danh mục:', err)
      }
    }

    loadLookups()
  }, [isOpen])

  // ===== LOAD MATERIAL (edit mode) =====
  useEffect(() => {
    if (!isOpen || isCreateMode) {
      setForm(INITIAL_FORM)
      setDirty(false)
      setErrors({})
      setMaterialName('')
      return
    }

    const loadMaterial = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('materials')
          .select(`
            *,
            category:material_categories(id, name),
            unit:units(id, name, symbol)
          `)
          .eq('id', materialId)
          .single()

        if (error) throw error
        if (!data) throw new Error('Không tìm thấy sản phẩm')

        setMaterialName(data.name || '')
        setForm({
          name: data.name || '',
          sku: data.sku || '',
          category_id: data.category_id || '',
          unit_id: data.unit_id || '',
          weight_per_unit: data.weight_per_unit?.toString() || '',
          min_stock: data.min_stock?.toString() || '0',
          max_stock: data.max_stock?.toString() || '',
          shelf_life_days: data.shelf_life_days?.toString() || '',
          description: data.description || '',
        })
      } catch (err) {
        console.error('Lỗi tải sản phẩm:', err)
        showToast('error', 'Không thể tải thông tin sản phẩm')
      } finally {
        setLoading(false)
      }
    }

    loadMaterial()
  }, [materialId, isOpen, isCreateMode])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
  }

  const updateField = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (!dirty) setDirty(true)
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const generateSku = useCallback(() => {
    const name = form.name.trim().toUpperCase()
    if (!name) return
    let sku = 'TP-'
    const words = name.replace(/cao su/gi, '').trim().split(/\s+/)
    sku += words.map(w => w.replace(/[^A-Z0-9]/g, '')).filter(Boolean).join('-')
    updateField('sku', sku)
  }, [form.name])

  const validate = (): boolean => {
    const errs: FormErrors = {}
    if (!form.name.trim()) errs.name = 'Vui lòng nhập tên sản phẩm'
    if (!form.sku.trim()) errs.sku = 'Vui lòng nhập mã SKU'
    else if (!/^[A-Z0-9\-_]+$/i.test(form.sku.trim())) errs.sku = 'SKU chỉ chứa chữ cái, số, gạch ngang'
    if (form.weight_per_unit && parseFloat(form.weight_per_unit) <= 0) errs.weight_per_unit = 'Khối lượng phải > 0'
    if (form.max_stock && form.min_stock) {
      const max = parseFloat(form.max_stock)
      const min = parseFloat(form.min_stock)
      if (max > 0 && min > 0 && max < min) errs.max_stock = 'Tồn tối đa phải ≥ tồn tối thiểu'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const { data: existing } = await supabase
        .from('materials')
        .select('id')
        .eq('sku', form.sku.trim().toUpperCase())
        .neq('id', isCreateMode ? '00000000-0000-0000-0000-000000000000' : materialId!)
        .maybeSingle()

      if (existing) { setErrors({ sku: 'SKU đã tồn tại' }); setSaving(false); return }

      const payload: Record<string, any> = {
        name: form.name.trim(),
        sku: form.sku.trim().toUpperCase(),
        material_type: 'finished',
        category_id: form.category_id || null,
        unit_id: form.unit_id || null,
        weight_per_unit: form.weight_per_unit ? parseFloat(form.weight_per_unit) : null,
        min_stock: form.min_stock ? parseFloat(form.min_stock) : 0,
        max_stock: form.max_stock ? parseFloat(form.max_stock) : null,
        shelf_life_days: form.shelf_life_days ? parseInt(form.shelf_life_days, 10) : null,
        description: form.description.trim() || null,
      }

      if (isCreateMode) {
        payload.code = form.sku.trim().toUpperCase()
        payload.status = 'active'
        const { error } = await supabase.from('materials').insert(payload)
        if (error) throw error
        showToast('success', 'Đã tạo thành phẩm mới')
      } else {
        const { error } = await supabase
          .from('materials')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', materialId!)
        if (error) throw error
        showToast('success', 'Đã cập nhật thành phẩm')
      }

      setDirty(false)
      onSaved?.()
      setTimeout(() => onClose(), 600)
    } catch (err: any) {
      console.error('Lỗi lưu:', err)
      showToast('error', err?.message || 'Không thể lưu. Vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <div
        ref={sheetRef}
        className={`fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-[20px] shadow-[0_-10px_40px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-out flex flex-col ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '92vh', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#E8A838]/10 rounded-lg flex items-center justify-center">
              {isCreateMode ? <Plus className="w-4 h-4 text-[#E8A838]" /> : <Package className="w-4 h-4 text-[#E8A838]" />}
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {isCreateMode ? 'Thêm thành phẩm mới' : 'Sửa thông tin WMS'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="min-w-[48px] min-h-[48px] flex items-center justify-center -mr-2">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-[#2D8B6E] animate-spin" />
              <span className="text-sm text-gray-400">Đang tải...</span>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {!isCreateMode && materialName && (
                <div className="px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
                  <p className="text-xs text-gray-400 mb-0.5">Sản phẩm</p>
                  <p className="text-sm font-semibold text-gray-800">{materialName}</p>
                </div>
              )}

              {isCreateMode && (
                <FieldGroup label="Tên sản phẩm" required error={errors.name}>
                  <input type="text" value={form.name} onChange={e => updateField('name', e.target.value)} onBlur={() => { if (form.name && !form.sku) generateSku() }} placeholder="VD: Cao su SVR 10" className={inputClass(errors.name)} />
                </FieldGroup>
              )}

              <FieldGroup label="Mã SKU" required error={errors.sku} hint={isCreateMode ? 'Tự động từ tên' : undefined}>
                <div className="flex gap-2">
                  <input type="text" value={form.sku} onChange={e => updateField('sku', e.target.value.toUpperCase())} placeholder="VD: TP-SVR10" className={`flex-1 ${inputClass(errors.sku)}`} style={{ fontFamily: "'JetBrains Mono', monospace" }} />
                  {isCreateMode && (
                    <button type="button" onClick={generateSku} className="min-w-[48px] min-h-[48px] bg-gray-100 text-gray-600 rounded-xl text-xs font-medium px-3 active:bg-gray-200 transition-colors">Tự tạo</button>
                  )}
                </div>
              </FieldGroup>

              {isCreateMode && (
                <FieldGroup label="Nhóm sản phẩm" error={errors.category_id}>
                  <div className="relative">
                    <select value={form.category_id} onChange={e => updateField('category_id', e.target.value)} className={`${inputClass()} appearance-none pr-10`}>
                      <option value="">-- Chọn nhóm --</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  </div>
                </FieldGroup>
              )}

              {isCreateMode && (
                <FieldGroup label="Đơn vị tính" error={errors.unit_id}>
                  <div className="relative">
                    <select value={form.unit_id} onChange={e => updateField('unit_id', e.target.value)} className={`${inputClass()} appearance-none pr-10`}>
                      <option value="">-- Chọn đơn vị --</option>
                      {units.map(u => <option key={u.id} value={u.id}>{u.name}{u.symbol ? ` (${u.symbol})` : ''}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                  </div>
                </FieldGroup>
              )}

              <FieldGroup label="Khối lượng / đơn vị" error={errors.weight_per_unit} hint="kg">
                <input type="number" inputMode="decimal" step="0.01" value={form.weight_per_unit} onChange={e => updateField('weight_per_unit', e.target.value)} placeholder="33.33" className={inputClass(errors.weight_per_unit)} style={{ fontFamily: "'JetBrains Mono', monospace" }} />
              </FieldGroup>

              <div className="grid grid-cols-2 gap-3">
                <FieldGroup label="Tồn tối thiểu">
                  <input type="number" inputMode="numeric" value={form.min_stock} onChange={e => updateField('min_stock', e.target.value)} placeholder="0" className={inputClass()} style={{ fontFamily: "'JetBrains Mono', monospace" }} />
                </FieldGroup>
                <FieldGroup label="Tồn tối đa" error={errors.max_stock}>
                  <input type="number" inputMode="numeric" value={form.max_stock} onChange={e => updateField('max_stock', e.target.value)} placeholder="5000" className={inputClass(errors.max_stock)} style={{ fontFamily: "'JetBrains Mono', monospace" }} />
                </FieldGroup>
              </div>

              <FieldGroup label="Hạn sử dụng" hint="ngày">
                <input type="number" inputMode="numeric" value={form.shelf_life_days} onChange={e => updateField('shelf_life_days', e.target.value)} placeholder="365" className={inputClass()} style={{ fontFamily: "'JetBrains Mono', monospace" }} />
              </FieldGroup>

              {isCreateMode && (
                <FieldGroup label="Mô tả">
                  <textarea value={form.description} onChange={e => updateField('description', e.target.value)} placeholder="Ghi chú thêm về sản phẩm..." rows={2} className={`${inputClass()} resize-none`} />
                </FieldGroup>
              )}
            </div>
          )}
        </div>

        {!loading && (
          <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-t border-gray-100 bg-white">
            <button type="button" onClick={onClose} className="flex-1 min-h-[48px] bg-gray-100 text-gray-700 rounded-xl text-sm font-medium active:bg-gray-200 transition-colors">Hủy</button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || (!isCreateMode && !dirty)}
              className={`flex-1 min-h-[48px] rounded-xl text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.97] transition-all duration-150 ${(saving || (!isCreateMode && !dirty)) ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#1B4D3E] text-white shadow-lg shadow-[#1B4D3E]/20'}`}
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang lưu...</>
                : isCreateMode ? <><Plus className="w-4 h-4" /> Tạo thành phẩm</>
                : <><Save className="w-4 h-4" /> Lưu thay đổi</>}
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed top-4 left-4 right-4 z-[60] px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-medium shadow-lg animate-[slideDown_300ms_ease-out] ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          {toast.message}
        </div>
      )}
    </>
  )
}

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
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
    </div>
  )
}

function inputClass(error?: string): string {
  return `w-full min-h-[48px] px-3.5 py-3 bg-white text-[15px] text-gray-900 rounded-xl border ${error ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200'} focus:outline-none focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/30 transition-colors duration-150 placeholder:text-gray-300`
}

export default MaterialFormPage