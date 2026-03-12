// ============================================================================
// FILE: src/pages/wms/qc/QCStandardsConfigPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P6 — Sprint 6B — Cấu hình ngưỡng DRC theo sản phẩm
// ============================================================================
// Design: Industrial Mobile-First (WMS_UI_DESIGN_GUIDE.md)
// - Card layout trên mobile, table trên desktop
// - Bottom-sheet modal edit
// - Touch target ≥ 48px, no hover states
// - Brand: #1B4D3E primary, #E8A838 accent
// - Font: Be Vietnam Pro body, JetBrains Mono codes/numbers
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  Settings,
  Plus,
  Pencil,
  X,
  Save,
  FlaskConical,
  AlertTriangle,
  Check,
  Loader2,
  Search,
  SlidersHorizontal,
  ChevronDown,
  RotateCcw,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import qcService from '../../../services/wms/qcService'
import type { MaterialQCStandard } from '../../../services/wms/wms.types'

// ============================================================================
// TYPES
// ============================================================================

interface MaterialOption {
  id: string
  sku: string
  name: string
  type: 'raw' | 'finished'
}

/** MaterialQCStandard từ DB + join material chỉ lấy id/sku/name */
interface StandardWithMaterial extends Omit<MaterialQCStandard, 'material'> {
  material?: {
    id: string
    sku: string
    name: string
  } | null
}

interface FormData {
  material_id: string
  drc_standard: string
  drc_min: string
  drc_max: string
  drc_warning_low: string
  drc_warning_high: string
  recheck_interval_days: string
  recheck_shortened_days: string
}

interface FormErrors {
  [key: string]: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const EMPTY_FORM: FormData = {
  material_id: '',
  drc_standard: '60',
  drc_min: '58',
  drc_max: '62',
  drc_warning_low: '59',
  drc_warning_high: '61',
  recheck_interval_days: '14',
  recheck_shortened_days: '7',
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDRC(val?: number | null): string {
  if (val === undefined || val === null) return '—'
  return `${val}%`
}

function formatDays(val?: number | null): string {
  if (val === undefined || val === null) return '—'
  return `${val} ngày`
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** DRC Gauge nhỏ — hiển thị khoảng min/warn/standard/warn/max */
const MiniDRCRange: React.FC<{
  min?: number | null
  warnLow?: number | null
  standard?: number | null
  warnHigh?: number | null
  max?: number | null
}> = ({ min, warnLow, standard, warnHigh, max }) => {
  const lo = min ?? 55
  const hi = max ?? 65
  const range = hi - lo || 10

  const pct = (val: number) => ((val - lo) / range) * 100

  const wL = warnLow ?? lo
  const wH = warnHigh ?? hi
  const std = standard ?? (lo + hi) / 2

  return (
    <div className="relative h-3 w-full rounded-full bg-red-100 overflow-hidden mt-1.5">
      {/* Warning zone */}
      <div
        className="absolute inset-y-0 bg-amber-200"
        style={{ left: `${pct(wL)}%`, width: `${pct(wH) - pct(wL)}%` }}
      />
      {/* Pass zone */}
      <div
        className="absolute inset-y-0 bg-emerald-300"
        style={{ left: `${pct(wL)}%`, width: `${pct(wH) - pct(wL)}%` }}
      />
      {/* Standard marker */}
      <div
        className="absolute inset-y-0 w-0.5 bg-emerald-700"
        style={{ left: `${pct(std)}%` }}
      />
      {/* Labels */}
      <span
        className="absolute -bottom-4 text-[9px] text-gray-400 font-mono"
        style={{ left: `${Math.max(0, pct(lo))}%` }}
      >
        {lo}
      </span>
      <span
        className="absolute -bottom-4 text-[9px] text-gray-400 font-mono"
        style={{ left: `${Math.min(95, pct(hi))}%` }}
      >
        {hi}
      </span>
    </div>
  )
}

/** Skeleton loading card */
const SkeletonCard: React.FC = () => (
  <div className="bg-white rounded-2xl p-4 shadow-sm animate-pulse">
    <div className="flex items-center gap-3 mb-3">
      <div className="w-10 h-10 bg-gray-200 rounded-xl" />
      <div className="flex-1">
        <div className="h-4 bg-gray-200 rounded w-2/3 mb-1.5" />
        <div className="h-3 bg-gray-100 rounded w-1/3" />
      </div>
    </div>
    <div className="h-3 bg-gray-100 rounded-full w-full mb-6" />
    <div className="grid grid-cols-3 gap-3">
      <div className="h-10 bg-gray-100 rounded-lg" />
      <div className="h-10 bg-gray-100 rounded-lg" />
      <div className="h-10 bg-gray-100 rounded-lg" />
    </div>
  </div>
)

/** Empty state */
const EmptyState: React.FC<{ onAdd: () => void }> = ({ onAdd }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6">
    <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mb-4">
      <SlidersHorizontal className="w-10 h-10 text-gray-300" />
    </div>
    <p className="text-[15px] font-medium text-gray-800 mb-1">Chưa có ngưỡng QC</p>
    <p className="text-[13px] text-gray-500 text-center mb-6">
      Thêm ngưỡng DRC cho sản phẩm để hệ thống tự động đánh giá chất lượng khi nhập kho và tái kiểm.
    </p>
    <button
      type="button"
      onClick={onAdd}
      className="
        inline-flex items-center gap-2
        px-5 py-3
        bg-[#1B4D3E] text-white
        rounded-xl text-[14px] font-semibold
        active:scale-[0.96] transition-transform
      "
    >
      <Plus className="w-4 h-4" />
      Thêm ngưỡng QC
    </button>
  </div>
)

// ============================================================================
// STANDARD CARD
// ============================================================================

const StandardCard: React.FC<{
  item: StandardWithMaterial
  onEdit: (item: StandardWithMaterial) => void
}> = ({ item, onEdit }) => {
  return (
    <div
      className="
        bg-white rounded-2xl shadow-sm
        border border-gray-100
        overflow-hidden
        active:scale-[0.98] transition-transform duration-100
      "
      onClick={() => onEdit(item)}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
          <FlaskConical className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-gray-900 truncate">
            {item.material?.name ?? 'Sản phẩm'}
          </p>
          <p
            className="text-[12px] text-gray-500 font-mono"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {item.material?.sku ?? '—'}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(item) }}
          className="w-9 h-9 flex items-center justify-center rounded-lg bg-gray-50 active:bg-gray-100"
        >
          <Pencil className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* DRC Gauge */}
      <div className="px-4 pb-1">
        <MiniDRCRange
          min={item.drc_min}
          warnLow={item.drc_warning_low}
          standard={item.drc_standard}
          warnHigh={item.drc_warning_high}
          max={item.drc_max}
        />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-px bg-gray-100 mt-5">
        <div className="bg-white px-3 py-2.5 text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">DRC chuẩn</p>
          <p
            className="text-[15px] font-bold text-emerald-700 mt-0.5"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {formatDRC(item.drc_standard)}
          </p>
        </div>
        <div className="bg-white px-3 py-2.5 text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Khoảng</p>
          <p
            className="text-[13px] font-semibold text-gray-700 mt-0.5"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {item.drc_min ?? '—'}–{item.drc_max ?? '—'}%
          </p>
        </div>
        <div className="bg-white px-3 py-2.5 text-center">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">Tái kiểm</p>
          <p className="text-[13px] font-semibold text-gray-700 mt-0.5">
            {formatDays(item.recheck_interval_days)}
          </p>
        </div>
      </div>

      {/* Warning zone info */}
      <div className="px-4 py-2 bg-amber-50/50 border-t border-amber-100/60">
        <p className="text-[11px] text-amber-700">
          <AlertTriangle className="w-3 h-3 inline-block mr-1 -mt-0.5" />
          Cảnh báo: {item.drc_warning_low ?? '—'}–{item.drc_warning_high ?? '—'}%
          {' · '}
          Rút ngắn TK: {formatDays(item.recheck_shortened_days)}
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// EDIT MODAL (Bottom-sheet)
// ============================================================================

const EditModal: React.FC<{
  visible: boolean
  isNew: boolean
  formData: FormData
  errors: FormErrors
  materials: MaterialOption[]
  saving: boolean
  onClose: () => void
  onChange: (field: keyof FormData, value: string) => void
  onSave: () => void
  onReset: () => void
}> = ({ visible, isNew, formData, errors, materials, saving, onClose, onChange, onSave, onReset }) => {
  if (!visible) return null

  const selectedMaterial = materials.find(m => m.id === formData.material_id)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Bottom-sheet */}
      <div
        className="
          fixed bottom-0 left-0 right-0 z-50
          bg-white rounded-t-3xl
          shadow-[0_-4px_30px_rgba(0,0,0,0.12)]
          max-h-[92vh] overflow-y-auto
          animate-[slideUp_0.3s_ease-out]
        "
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-[17px] font-bold text-gray-900">
            {isNew ? 'Thêm ngưỡng QC' : 'Sửa ngưỡng QC'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 active:bg-gray-200"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-5">

          {/* Sản phẩm */}
          {isNew ? (
            <div>
              <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                Sản phẩm <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.material_id}
                onChange={e => onChange('material_id', e.target.value)}
                className={`
                  w-full min-h-[48px] px-4 py-3
                  rounded-xl border text-[15px]
                  focus:outline-none focus:ring-1
                  ${errors.material_id
                    ? 'border-red-300 focus:border-red-400 focus:ring-red-200'
                    : 'border-gray-200 focus:border-[#2D8B6E] focus:ring-[#2D8B6E]/20'
                  }
                `}
              >
                <option value="">— Chọn sản phẩm —</option>
                {materials.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.sku} — {m.name}
                  </option>
                ))}
              </select>
              {errors.material_id && (
                <p className="text-[12px] text-red-500 mt-1">{errors.material_id}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl">
              <FlaskConical className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-[14px] font-semibold text-gray-900">
                  {selectedMaterial?.name ?? 'Sản phẩm'}
                </p>
                <p className="text-[12px] text-gray-500 font-mono">
                  {selectedMaterial?.sku ?? '—'}
                </p>
              </div>
            </div>
          )}

          {/* DRC Chuẩn */}
          <div>
            <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
              DRC chuẩn (%)
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={formData.drc_standard}
              onChange={e => onChange('drc_standard', e.target.value)}
              className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200 text-[15px] font-mono focus:outline-none focus:ring-1 focus:border-[#2D8B6E] focus:ring-[#2D8B6E]/20"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            />
          </div>

          {/* Khoảng cho phép */}
          <div>
            <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
              Khoảng cho phép (%)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-gray-400 block mb-1">Min</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={formData.drc_min}
                  onChange={e => onChange('drc_min', e.target.value)}
                  placeholder="58"
                  className={`w-full min-h-[48px] px-4 py-3 rounded-xl border text-[15px] font-mono focus:outline-none focus:ring-1 ${errors.drc_range ? 'border-red-300' : 'border-gray-200 focus:border-[#2D8B6E] focus:ring-[#2D8B6E]/20'}`}
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
              <div>
                <span className="text-[11px] text-gray-400 block mb-1">Max</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={formData.drc_max}
                  onChange={e => onChange('drc_max', e.target.value)}
                  placeholder="62"
                  className={`w-full min-h-[48px] px-4 py-3 rounded-xl border text-[15px] font-mono focus:outline-none focus:ring-1 ${errors.drc_range ? 'border-red-300' : 'border-gray-200 focus:border-[#2D8B6E] focus:ring-[#2D8B6E]/20'}`}
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
            </div>
            {errors.drc_range && (
              <p className="text-[12px] text-red-500 mt-1">{errors.drc_range}</p>
            )}
          </div>

          {/* Khoảng cảnh báo */}
          <div>
            <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
              Khoảng cảnh báo (%)
              <span className="text-[11px] text-gray-400 font-normal ml-1">
                — gần biên sẽ rút ngắn tái kiểm
              </span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-gray-400 block mb-1">Cảnh báo thấp</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={formData.drc_warning_low}
                  onChange={e => onChange('drc_warning_low', e.target.value)}
                  placeholder="59"
                  className={`w-full min-h-[48px] px-4 py-3 rounded-xl border text-[15px] font-mono focus:outline-none focus:ring-1 ${errors.drc_warning ? 'border-amber-300' : 'border-gray-200 focus:border-[#2D8B6E] focus:ring-[#2D8B6E]/20'}`}
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
              <div>
                <span className="text-[11px] text-gray-400 block mb-1">Cảnh báo cao</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={formData.drc_warning_high}
                  onChange={e => onChange('drc_warning_high', e.target.value)}
                  placeholder="61"
                  className={`w-full min-h-[48px] px-4 py-3 rounded-xl border text-[15px] font-mono focus:outline-none focus:ring-1 ${errors.drc_warning ? 'border-amber-300' : 'border-gray-200 focus:border-[#2D8B6E] focus:ring-[#2D8B6E]/20'}`}
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
            </div>
            {errors.drc_warning && (
              <p className="text-[12px] text-amber-600 mt-1">{errors.drc_warning}</p>
            )}
          </div>

          {/* Chu kỳ tái kiểm */}
          <div>
            <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">
              Chu kỳ tái kiểm (ngày)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-gray-400 block mb-1">Bình thường</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={formData.recheck_interval_days}
                  onChange={e => onChange('recheck_interval_days', e.target.value)}
                  placeholder="14"
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200 text-[15px] font-mono focus:outline-none focus:ring-1 focus:border-[#2D8B6E] focus:ring-[#2D8B6E]/20"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
              <div>
                <span className="text-[11px] text-gray-400 block mb-1">Rút ngắn (cảnh báo)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={formData.recheck_shortened_days}
                  onChange={e => onChange('recheck_shortened_days', e.target.value)}
                  placeholder="7"
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200 text-[15px] font-mono focus:outline-none focus:ring-1 focus:border-[#2D8B6E] focus:ring-[#2D8B6E]/20"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
            </div>
          </div>

          {/* Preview DRC Gauge */}
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-2">Xem trước khoảng DRC</p>
            <MiniDRCRange
              min={parseFloat(formData.drc_min) || undefined}
              warnLow={parseFloat(formData.drc_warning_low) || undefined}
              standard={parseFloat(formData.drc_standard) || undefined}
              warnHigh={parseFloat(formData.drc_warning_high) || undefined}
              max={parseFloat(formData.drc_max) || undefined}
            />
            <div className="flex items-center gap-3 mt-5 text-[10px] text-gray-400">
              <span className="flex items-center gap-1">
                <span className="w-3 h-2 bg-red-100 rounded-sm inline-block" /> Ngoài khoảng
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-2 bg-amber-200 rounded-sm inline-block" /> Cảnh báo
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-2 bg-emerald-300 rounded-sm inline-block" /> Đạt
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-3">
          {!isNew && (
            <button
              type="button"
              onClick={onReset}
              className="w-12 h-12 flex items-center justify-center rounded-xl border border-gray-200 active:bg-gray-100"
            >
              <RotateCcw className="w-5 h-5 text-gray-500" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[48px] rounded-xl border border-gray-200 text-[14px] font-medium text-gray-600 active:bg-gray-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="
              flex-1 min-h-[48px]
              rounded-xl
              bg-[#1B4D3E] text-white
              text-[14px] font-semibold
              flex items-center justify-center gap-2
              active:scale-[0.97] transition-transform
              disabled:opacity-50 disabled:active:scale-100
            "
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4" />
                {isNew ? 'Thêm' : 'Lưu'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Animation keyframe */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

const QCStandardsConfigPage: React.FC = () => {
  const navigate = useNavigate()

  // State
  const [standards, setStandards] = useState<StandardWithMaterial[]>([])
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [isNew, setIsNew] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // --------------------------------------------------------------------------
  // LOAD DATA
  // --------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    try {
      setLoading(true)

      // Load standards
      const standardsList = await qcService.getAllStandards()
      setStandards(standardsList as StandardWithMaterial[])

      // Load materials (chỉ finished goods chưa có ngưỡng cho "thêm mới")
      const { data: matData, error: matErr } = await supabase
        .from('materials')
        .select('id, sku, name, type')
        .eq('type', 'finished')
        .eq('is_active', true)
        .order('sku')

      if (matErr) throw matErr
      setMaterials(matData || [])
    } catch (err: any) {
      console.error('Lỗi load dữ liệu:', err)
      showToast('Lỗi tải dữ liệu: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // --------------------------------------------------------------------------
  // TOAST
  // --------------------------------------------------------------------------

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // --------------------------------------------------------------------------
  // MODAL HANDLERS
  // --------------------------------------------------------------------------

  const handleOpenAdd = () => {
    // Lọc SP chưa có ngưỡng
    const existingMaterialIds = standards.map(s => s.material_id)
    const availableMaterials = materials.filter(m => !existingMaterialIds.includes(m.id))

    if (availableMaterials.length === 0) {
      showToast('Tất cả sản phẩm đã có ngưỡng QC', 'error')
      return
    }

    setIsNew(true)
    setEditingId(null)
    setFormData(EMPTY_FORM)
    setFormErrors({})
    setModalOpen(true)
  }

  const handleOpenEdit = (item: StandardWithMaterial) => {
    setIsNew(false)
    setEditingId(item.material_id)
    setFormData({
      material_id: item.material_id,
      drc_standard: item.drc_standard?.toString() ?? '60',
      drc_min: item.drc_min?.toString() ?? '58',
      drc_max: item.drc_max?.toString() ?? '62',
      drc_warning_low: item.drc_warning_low?.toString() ?? '59',
      drc_warning_high: item.drc_warning_high?.toString() ?? '61',
      recheck_interval_days: item.recheck_interval_days?.toString() ?? '14',
      recheck_shortened_days: item.recheck_shortened_days?.toString() ?? '7',
    })
    setFormErrors({})
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    setModalOpen(false)
    setFormErrors({})
  }

  const handleFormChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // Clear related errors
    setFormErrors(prev => {
      const next = { ...prev }
      delete next[field]
      delete next.drc_range
      delete next.drc_warning
      return next
    })
  }

  const handleReset = () => {
    setFormData(prev => ({
      ...prev,
      drc_standard: '60',
      drc_min: '58',
      drc_max: '62',
      drc_warning_low: '59',
      drc_warning_high: '61',
      recheck_interval_days: '14',
      recheck_shortened_days: '7',
    }))
  }

  // --------------------------------------------------------------------------
  // VALIDATE & SAVE
  // --------------------------------------------------------------------------

  const validate = (): boolean => {
    const errors: FormErrors = {}

    // Material required for new
    if (isNew && !formData.material_id) {
      errors.material_id = 'Vui lòng chọn sản phẩm'
    }

    const min = parseFloat(formData.drc_min)
    const max = parseFloat(formData.drc_max)
    const warnLow = parseFloat(formData.drc_warning_low)
    const warnHigh = parseFloat(formData.drc_warning_high)
    const std = parseFloat(formData.drc_standard)

    // Range validation: min < warnLow < standard < warnHigh < max
    if (!isNaN(min) && !isNaN(max) && min >= max) {
      errors.drc_range = 'DRC Min phải nhỏ hơn Max'
    }

    if (!isNaN(warnLow) && !isNaN(warnHigh)) {
      if (warnLow >= warnHigh) {
        errors.drc_warning = 'Cảnh báo thấp phải nhỏ hơn cảnh báo cao'
      }
      if (!isNaN(min) && warnLow < min) {
        errors.drc_warning = 'Cảnh báo thấp phải ≥ DRC Min'
      }
      if (!isNaN(max) && warnHigh > max) {
        errors.drc_warning = 'Cảnh báo cao phải ≤ DRC Max'
      }
    }

    if (!isNaN(std)) {
      if (!isNaN(min) && std < min) errors.drc_range = 'DRC chuẩn phải ≥ Min'
      if (!isNaN(max) && std > max) errors.drc_range = 'DRC chuẩn phải ≤ Max'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return

    try {
      setSaving(true)
      const materialId = isNew ? formData.material_id : editingId!

      await qcService.upsertStandard(materialId, {
        drc_standard: parseFloat(formData.drc_standard) || 60,
        drc_min: parseFloat(formData.drc_min) || 58,
        drc_max: parseFloat(formData.drc_max) || 62,
        drc_warning_low: parseFloat(formData.drc_warning_low) || 59,
        drc_warning_high: parseFloat(formData.drc_warning_high) || 61,
        recheck_interval_days: parseInt(formData.recheck_interval_days) || 14,
        recheck_shortened_days: parseInt(formData.recheck_shortened_days) || 7,
      })

      showToast(isNew ? 'Đã thêm ngưỡng QC' : 'Đã cập nhật ngưỡng QC', 'success')
      handleCloseModal()
      await loadData()
    } catch (err: any) {
      console.error('Lỗi lưu:', err)
      showToast('Lỗi: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // --------------------------------------------------------------------------
  // FILTER
  // --------------------------------------------------------------------------

  const filteredStandards = searchText.trim()
    ? standards.filter(s =>
        (s.material?.name ?? '').toLowerCase().includes(searchText.toLowerCase()) ||
        (s.material?.sku ?? '').toLowerCase().includes(searchText.toLowerCase())
      )
    : standards

  // Danh sách SP chưa có ngưỡng (cho modal thêm mới)
  const existingMaterialIds = standards.map(s => s.material_id)
  const availableMaterials = materials.filter(m => !existingMaterialIds.includes(m.id))

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div
      className="min-h-screen bg-[#F7F5F2]"
      style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}
    >
      {/* ================================================================== */}
      {/* HEADER */}
      {/* ================================================================== */}
      <header className="sticky top-0 z-30 bg-[#1B4D3E] text-white shadow-md">
        <div className="flex items-center justify-between px-4 py-3 min-h-[56px]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/wms/qc')}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-[17px] font-bold tracking-tight">Ngưỡng QC</h1>
              <p className="text-[11px] text-white/60">Cấu hình DRC theo sản phẩm</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSearchOpen(!searchOpen)}
            className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10"
          >
            {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Tìm sản phẩm, SKU..."
                autoFocus
                className="
                  w-full h-10 pl-10 pr-4
                  bg-white/10 backdrop-blur
                  text-[15px] text-white placeholder-white/40
                  rounded-xl border border-white/10
                  focus:outline-none focus:border-white/30
                "
              />
              {searchText && (
                <button
                  type="button"
                  onClick={() => setSearchText('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="w-4 h-4 text-white/40" />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ================================================================== */}
      {/* SUMMARY BAR */}
      {/* ================================================================== */}
      {!loading && standards.length > 0 && (
        <div className="px-4 py-3 bg-white border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[13px] text-gray-600">
              <Settings className="w-4 h-4 text-gray-400" />
              <span>
                <strong className="text-gray-900">{standards.length}</strong> sản phẩm đã cấu hình
              </span>
            </div>
            {availableMaterials.length > 0 && (
              <span className="text-[12px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                {availableMaterials.length} SP chưa có ngưỡng
              </span>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* CONTENT */}
      {/* ================================================================== */}
      <main className="px-4 pt-3 pb-28">
        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty */}
        {!loading && standards.length === 0 && (
          <EmptyState onAdd={handleOpenAdd} />
        )}

        {/* Cards */}
        {!loading && filteredStandards.length > 0 && (
          <div className="space-y-3">
            {filteredStandards.map(item => (
              <StandardCard
                key={item.material_id}
                item={item}
                onEdit={handleOpenEdit}
              />
            ))}
          </div>
        )}

        {/* No results from search */}
        {!loading && standards.length > 0 && filteredStandards.length === 0 && searchText && (
          <div className="flex flex-col items-center py-12">
            <Search className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-[14px] text-gray-500">
              Không tìm thấy "{searchText}"
            </p>
          </div>
        )}
      </main>

      {/* ================================================================== */}
      {/* FAB */}
      {/* ================================================================== */}
      <div className="fixed bottom-6 right-4 z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="
            w-14 h-14
            flex items-center justify-center
            bg-[#E8A838] text-white
            rounded-2xl
            shadow-[0_4px_14px_rgba(232,168,56,0.4)]
            active:scale-[0.92] transition-transform duration-150
          "
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>

      {/* ================================================================== */}
      {/* EDIT MODAL */}
      {/* ================================================================== */}
      <EditModal
        visible={modalOpen}
        isNew={isNew}
        formData={formData}
        errors={formErrors}
        materials={isNew ? availableMaterials : materials}
        saving={saving}
        onClose={handleCloseModal}
        onChange={handleFormChange}
        onSave={handleSave}
        onReset={handleReset}
      />

      {/* ================================================================== */}
      {/* TOAST */}
      {/* ================================================================== */}
      {toast && (
        <div
          className={`
            fixed top-20 left-4 right-4 z-[60]
            px-4 py-3 rounded-xl shadow-lg
            flex items-center gap-2
            text-[14px] font-medium
            animate-[slideDown_0.3s_ease-out]
            ${toast.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-red-600 text-white'
            }
          `}
        >
          {toast.type === 'success'
            ? <Check className="w-5 h-5 shrink-0" />
            : <AlertTriangle className="w-5 h-5 shrink-0" />
          }
          {toast.message}
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

export default QCStandardsConfigPage