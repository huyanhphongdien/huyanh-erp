// ============================================================================
// WarehouseListPage.tsx — WMS Phase 2.7
// Danh sách kho + Form thêm/sửa kho (Bottom Sheet)
// Design: WMS_UI_DESIGN_GUIDE.md — Industrial Rubber Theme
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import {
  ArrowLeft, Plus, X, ChevronRight, CheckCircle2,
  AlertCircle, Loader2, Warehouse as WarehouseIcon,
  ToggleLeft, ToggleRight, Pencil, MapPin,
} from 'lucide-react'

// ===== TYPES =====
interface Warehouse {
  id: string
  code: string
  name: string
  type: 'raw' | 'finished' | 'mixed'
  address?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface LocationStats {
  total: number
  empty: number
  inUse: number
  full: number
}

// ===== CONSTANTS =====
const TYPE_LABELS: Record<string, string> = {
  finished: 'Thành phẩm',
  raw: 'Nguyên liệu',
  mixed: 'Hỗn hợp',
}

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  finished: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', accent: '#1B4D3E' },
  raw:      { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200',    accent: '#2D8B6E' },
  mixed:    { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   accent: '#E8A838' },
}

// ===== MAIN COMPONENT =====
export default function WarehouseListPage() {
  const navigate = useNavigate()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [locationStats, setLocationStats] = useState<Record<string, LocationStats>>({})
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('all')
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null)

  const showToast = (type: string, message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  // ===== LOAD DATA =====
  const loadWarehouses = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .order('code')

      if (error) throw error
      setWarehouses(data || [])

      // Load location stats for each warehouse
      if (data && data.length > 0) {
        const statsMap: Record<string, LocationStats> = {}
        for (const wh of data) {
          const { data: locs } = await supabase
            .from('warehouse_locations')
            .select('current_quantity, capacity, is_available')
            .eq('warehouse_id', wh.id)

          if (locs) {
            const total = locs.length
            const empty = locs.filter(l => l.current_quantity === 0 && l.is_available).length
            const full = locs.filter(l => l.capacity > 0 && l.current_quantity / l.capacity >= 0.8).length
            const disabled = locs.filter(l => !l.is_available).length
            statsMap[wh.id] = { total, empty, inUse: total - empty - full - disabled, full }
          } else {
            statsMap[wh.id] = { total: 0, empty: 0, inUse: 0, full: 0 }
          }
        }
        setLocationStats(statsMap)
      }
    } catch (err) {
      console.error('Load warehouses error:', err)
      showToast('error', 'Không thể tải danh sách kho')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadWarehouses() }, [loadWarehouses])

  // ===== FILTER =====
  const filtered = warehouses.filter(w =>
    filterType === 'all' || w.type === filterType
  )

  // ===== HANDLERS =====
  const handleSaved = (wh: Warehouse) => {
    if (editId) {
      setWarehouses(prev => prev.map(w => w.id === wh.id ? wh : w))
      showToast('success', `Đã cập nhật "${wh.name}"`)
    } else {
      setWarehouses(prev => [...prev, wh])
      showToast('success', `Đã thêm "${wh.name}"`)
    }
    setFormOpen(false)
    setEditId(null)
  }

  const handleEdit = (id: string) => {
    setEditId(id)
    setFormOpen(true)
  }

  // ===== RENDER =====
  return (
    <div className="min-h-screen" style={{ background: '#F7F5F2' }}>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-500 active:bg-gray-100 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">Kho & Vị trí</h1>
            <p className="text-xs text-gray-500">{warehouses.length} kho</p>
          </div>
        </div>
      </header>

      {/* Filter chips */}
      <div className="max-w-lg mx-auto px-4 pt-3 pb-2">
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {[
            { value: 'all', label: 'Tất cả' },
            { value: 'finished', label: 'Thành phẩm' },
            { value: 'raw', label: 'Nguyên liệu' },
            { value: 'mixed', label: 'Hỗn hợp' },
          ].map(f => (
            <button key={f.value} onClick={() => setFilterType(f.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap min-h-[40px] active:scale-[0.97] transition-all duration-150 ${
                filterType === f.value
                  ? 'bg-[#1B4D3E] text-white shadow-md'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto px-4 pb-28 space-y-3">
        {loading ? (
          // Skeleton
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 space-y-3 animate-pulse">
              <div className="flex gap-2"><div className="h-5 w-20 bg-gray-200 rounded" /><div className="h-5 w-16 bg-gray-200 rounded-full" /></div>
              <div className="h-4 w-48 bg-gray-200 rounded" />
              <div className="h-2 bg-gray-200 rounded-full" />
              <div className="flex gap-2">{Array.from({ length: 4 }).map((_, j) => <div key={j} className="h-6 w-20 bg-gray-200 rounded-lg" />)}</div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          // Empty state
          <div className="text-center py-16">
            <WarehouseIcon className="w-16 h-16 mx-auto text-gray-200 mb-4" />
            <h3 className="text-lg font-semibold text-gray-500 mb-1">Chưa có kho nào</h3>
            <p className="text-sm text-gray-400 mb-6">Thêm kho đầu tiên để bắt đầu quản lý</p>
            <button onClick={() => { setEditId(null); setFormOpen(true) }}
              className="px-6 py-3 bg-[#1B4D3E] text-white rounded-xl font-semibold text-sm active:scale-[0.97] transition-all inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Thêm kho
            </button>
          </div>
        ) : (
          filtered.map((wh, i) => {
            const stats = locationStats[wh.id] || { total: 0, empty: 0, inUse: 0, full: 0 }
            const tc = TYPE_COLORS[wh.type] || TYPE_COLORS.mixed
            const usagePercent = stats.total > 0 ? Math.round(((stats.total - stats.empty) / stats.total) * 100) : 0

            return (
              <div key={wh.id}
                className={`bg-white rounded-2xl shadow-sm overflow-hidden active:scale-[0.98] transition-all duration-150 cursor-pointer ${!wh.is_active ? 'opacity-50' : ''}`}
                style={{ borderLeft: `4px solid ${tc.accent}`, animationDelay: `${i * 60}ms` }}
                onClick={() => navigate(`/wms/warehouses/${wh.id}/locations`)}>
                <div className="px-4 py-4">
                  {/* Row 1: Code + Type badge + Edit */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#1B4D3E] tracking-wide"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}>{wh.code}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${tc.bg} ${tc.text} ${tc.border}`}>
                        {TYPE_LABELS[wh.type]}
                      </span>
                      {!wh.is_active && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                          Ngưng
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEdit(wh.id) }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 active:bg-gray-100">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </div>

                  {/* Row 2: Name */}
                  <h3 className="text-base font-semibold text-gray-900 mb-1">{wh.name}</h3>
                  {wh.address && <p className="text-xs text-gray-400 mb-3">{wh.address}</p>}

                  {/* Row 3: Usage bar */}
                  {stats.total > 0 && (
                    <div className="mb-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-gray-500">Sử dụng</span>
                        <span className="text-xs font-semibold text-gray-700"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}>{usagePercent}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${usagePercent}%`,
                            background: usagePercent > 80 ? '#DC2626' : usagePercent > 50 ? '#F59E0B' : '#16A34A',
                          }} />
                      </div>
                    </div>
                  )}

                  {/* Row 4: Stats chips */}
                  <div className="flex gap-2 flex-wrap">
                    <StatChip icon="📦" label="Tổng" value={stats.total} />
                    <StatChip icon="🟢" label="Trống" value={stats.empty} color="emerald" />
                    <StatChip icon="🟡" label="Đang dùng" value={stats.inUse} color="amber" />
                    <StatChip icon="🔴" label="Đầy" value={stats.full} color="red" />
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* FAB */}
      <button onClick={() => { setEditId(null); setFormOpen(true) }}
        className="fixed bottom-6 right-6 z-20 w-14 h-14 rounded-2xl bg-[#1B4D3E] text-white shadow-xl flex items-center justify-center active:scale-[0.92] transition-all"
        style={{ boxShadow: '0 8px 25px rgba(27,77,62,0.3)' }}>
        <Plus className="w-6 h-6" />
      </button>

      {/* Warehouse Form Bottom Sheet */}
      {formOpen && (
        <WarehouseFormSheet
          warehouseId={editId}
          onClose={() => { setFormOpen(false); setEditId(null) }}
          onSaved={handleSaved}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-4 right-4 z-[80] max-w-lg mx-auto px-4 py-3 rounded-xl flex items-center gap-2.5 text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ===== STAT CHIP =====
function StatChip({ icon, label, value, color }: { icon: string; label: string; value: number; color?: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium ${colors[color || ''] || 'bg-gray-50 text-gray-600'}`}>
      <span>{icon}</span> {label}: <span className="font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </span>
  )
}

// ===== WAREHOUSE FORM BOTTOM SHEET =====
function WarehouseFormSheet({ warehouseId, onClose, onSaved }: {
  warehouseId: string | null
  onClose: () => void
  onSaved: (wh: Warehouse) => void
}) {
  const isEditing = !!warehouseId
  const [form, setForm] = useState({ code: '', name: '', type: 'finished' as string, address: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(false)

  // Load existing warehouse for edit
  useEffect(() => {
    if (!warehouseId) return
    setLoadingEdit(true)
    ;(async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .eq('id', warehouseId)
        .single()

      if (data) {
        setForm({ code: data.code, name: data.name, type: data.type, address: data.address || '' })
      }
      setLoadingEdit(false)
    })()
  }, [warehouseId])

  const updateField = (f: string, v: string) => {
    setForm(prev => ({ ...prev, [f]: v }))
    if (errors[f]) setErrors(prev => ({ ...prev, [f]: '' }))
  }

  const validate = async () => {
    const e: Record<string, string> = {}
    if (!form.code.trim()) e.code = 'Vui lòng nhập mã kho'
    else {
      // Check uniqueness
      const { data } = await supabase
        .from('warehouses')
        .select('id')
        .eq('code', form.code.trim().toUpperCase())
        .neq('id', warehouseId || '')
        .maybeSingle()
      if (data) e.code = 'Mã kho đã tồn tại'
    }
    if (!form.name.trim()) e.name = 'Vui lòng nhập tên kho'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    if (!(await validate())) return
    setSaving(true)
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        type: form.type,
        address: form.address.trim() || null,
      }

      let result
      if (isEditing) {
        const { data, error } = await supabase
          .from('warehouses').update(payload).eq('id', warehouseId).select().single()
        if (error) throw error
        result = data
      } else {
        const { data, error } = await supabase
          .from('warehouses').insert(payload).select().single()
        if (error) throw error
        result = data
      }
      onSaved(result)
    } catch (err: any) {
      setErrors({ code: err.message || 'Lỗi khi lưu' })
    } finally {
      setSaving(false)
    }
  }

  if (loadingEdit) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 max-w-lg mx-auto bg-white rounded-t-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white rounded-t-3xl pt-3 pb-2 px-5 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(27,77,62,0.08)' }}>
                <WarehouseIcon className="w-5 h-5 text-[#1B4D3E]" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">{isEditing ? 'Sửa kho' : 'Thêm kho mới'}</h2>
            </div>
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 active:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="h-px bg-gray-100 mt-3" />
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5" style={{ paddingBottom: 100 }}>
          {/* Loại kho */}
          <div>
            <label className="text-sm font-semibold text-gray-700">Loại kho <span className="text-red-500">*</span></label>
            <div className="flex gap-2 mt-1.5">
              {[
                { value: 'finished', label: 'Thành phẩm', emoji: '📦' },
                { value: 'raw', label: 'Nguyên liệu', emoji: '🌿' },
                { value: 'mixed', label: 'Hỗn hợp', emoji: '🔀' },
              ].map(opt => (
                <button key={opt.value} onClick={() => updateField('type', opt.value)}
                  className={`flex-1 min-h-[48px] px-3 py-2.5 rounded-xl border-2 text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all ${
                    form.type === opt.value ? 'border-[#1B4D3E] bg-[#1B4D3E]/5 text-[#1B4D3E]' : 'border-gray-200 text-gray-500'
                  }`}>
                  <span>{opt.emoji}</span>{opt.label}
                </button>
              ))}
            </div>
          </div>

          <FormField label="Mã kho" required mono value={form.code}
            onChange={v => updateField('code', v.toUpperCase())}
            placeholder="VD: KHO-A" error={errors.code}
            helper="Mã ngắn, duy nhất — tự động viết hoa" />

          <FormField label="Tên kho" required value={form.name}
            onChange={v => updateField('name', v)}
            placeholder="VD: Kho thành phẩm A" error={errors.name} />

          <FormField label="Địa chỉ / Vị trí" value={form.address}
            onChange={v => updateField('address', v)}
            placeholder="VD: Khu A — Nhà máy Huy Anh" />
        </div>

        {/* Bottom bar */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-5 py-3.5 flex gap-3 shrink-0"
          style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}>
          <button onClick={onClose}
            className="flex-1 min-h-[52px] bg-white text-gray-700 text-sm font-semibold rounded-xl border-2 border-gray-200 active:scale-[0.97] transition-all">
            Hủy
          </button>
          <button onClick={handleSave} disabled={saving}
            className={`flex-[2] min-h-[52px] text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 active:scale-[0.97] transition-all ${
              saving ? 'bg-gray-400' : 'bg-[#1B4D3E]'
            }`}
            style={!saving ? { boxShadow: '0 4px 14px rgba(27,77,62,0.25)' } : {}}>
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Đang lưu...</>
              : <><CheckCircle2 className="w-4 h-4" /> {isEditing ? 'Lưu' : 'Thêm kho'}</>
            }
          </button>
        </div>
      </div>
    </>
  )
}

// ===== FORM FIELD =====
function FormField({ label, required, mono, value, onChange, placeholder, error, helper }: {
  label: string; required?: boolean; mono?: boolean
  value: string; onChange: (v: string) => void
  placeholder?: string; error?: string; helper?: string
}) {
  return (
    <div>
      <label className="flex items-center gap-1 text-sm font-semibold text-gray-700 mb-1.5">
        {label} {required && <span className="text-red-500 text-xs">*</span>}
      </label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full min-h-[48px] px-4 py-3 bg-white border-2 rounded-xl text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none transition-colors ${
          mono ? '' : ''
        } ${error ? 'border-red-300 bg-red-50/30 focus:border-red-400' : 'border-gray-200 focus:border-[#2D8B6E]'}`}
        style={mono ? { fontFamily: "'JetBrains Mono', monospace" } : {}} />
      {error && <p className="mt-1 text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {error}</p>}
      {helper && !error && <p className="mt-1 text-xs text-gray-400">{helper}</p>}
    </div>
  )
}