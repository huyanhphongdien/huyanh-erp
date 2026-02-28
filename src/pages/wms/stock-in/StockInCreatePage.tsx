// ============================================================================
// FILE: src/pages/wms/stock-in/StockInCreatePage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P3 — Bước 3.8 — Form tạo phiếu nhập kho (Step Wizard 3 bước)
// ============================================================================
// KẾT NỐI SUPABASE THẬT — không dùng mock data
// Design: Industrial Mobile-First (WMS_UI_DESIGN_GUIDE.md)
// UPDATE: Tích hợp LocationPicker (3.9) + QCInputForm (3.10)
// ============================================================================

import React, { useState, useMemo, useEffect } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  X,
  Package,
  Warehouse as WarehouseIcon,
  Scale,
  FileText,
  AlertTriangle,
  CircleCheck,
  Trash2,
  Save,
  Factory,
  ShoppingCart,
  TestTubes,
  ArrowRightLeft,
  SlidersHorizontal,
  Loader2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import stockInService from '../../../services/wms/stockInService'
import { useAuthStore } from '../../../stores/authStore'
import LocationPicker from '../../../components/wms/LocationPicker'
import type { LocationData } from '../../../components/wms/LocationPicker'
import QCInputForm, { QCBadge } from '../../../components/wms/QCInputForm'
import type { QCFormData, QCResultType } from '../../../components/wms/QCInputForm'

// ============================================================================
// TYPES
// ============================================================================

interface WarehouseOption {
  id: string
  code: string
  name: string
  type: string
}

interface MaterialOption {
  id: string
  sku: string
  name: string
  unit: string
  weight_per_unit: number | null
}

interface DetailItem {
  tempId: string
  material_id: string
  material?: MaterialOption
  quantity: number
  weight: number
  location_id?: string
  location?: LocationData
  drc_value?: number
  qc_result?: QCResultType
  qc_message?: string
  notes?: string
}

type SourceType = 'production' | 'purchase' | 'blend' | 'transfer' | 'adjust'

interface FormHeader {
  warehouse_id: string
  source_type: SourceType
  notes: string
}

// ============================================================================
// SOURCE TYPE CONFIG
// ============================================================================

const SOURCE_TYPES: { value: SourceType; label: string; icon: React.ReactNode }[] = [
  { value: 'production', label: 'Sản xuất', icon: <Factory className="w-4 h-4" /> },
  { value: 'purchase', label: 'Mua hàng', icon: <ShoppingCart className="w-4 h-4" /> },
  { value: 'blend', label: 'Phối trộn', icon: <TestTubes className="w-4 h-4" /> },
  { value: 'transfer', label: 'Chuyển kho', icon: <ArrowRightLeft className="w-4 h-4" /> },
  { value: 'adjust', label: 'Điều chỉnh', icon: <SlidersHorizontal className="w-4 h-4" /> },
]

// ============================================================================
// ADD DETAIL FORM (BOTTOM SHEET)
// — Tích hợp LocationPicker (3.9) + QCInputForm (3.10)
// ============================================================================

const AddDetailForm: React.FC<{
  warehouseId: string
  onSubmit: (item: DetailItem) => void
  onCancel: () => void
}> = ({ warehouseId, onSubmit, onCancel }) => {
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [loadingMat, setLoadingMat] = useState(true)

  const [materialId, setMaterialId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null)
  const [qcData, setQcData] = useState<QCFormData | null>(null)
  const [itemNotes, setItemNotes] = useState('')

  // Load materials (finished goods)
  useEffect(() => {
    const load = async () => {
      setLoadingMat(true)
      const { data, error } = await supabase
        .from('materials')
        .select('id, sku, name, unit, weight_per_unit')
        .eq('is_active', true)
        .order('name')
      if (!error && data) setMaterials(data)
      setLoadingMat(false)
    }
    load()
  }, [])

  const selectedMaterial = materials.find(m => m.id === materialId)
  const qtyNum = parseFloat(quantity) || 0
  const weightCalc = selectedMaterial?.weight_per_unit ? qtyNum * selectedMaterial.weight_per_unit : 0
  const canSubmit = materialId && qtyNum > 0 && qcData !== null

  const handleSubmit = () => {
    if (!canSubmit || !qcData) return
    const item: DetailItem = {
      tempId: `temp-${Date.now()}`,
      material_id: materialId,
      material: selectedMaterial,
      quantity: qtyNum,
      weight: weightCalc,
      location_id: selectedLocation?.id || undefined,
      location: selectedLocation || undefined,
      drc_value: qcData.drc_value,
      qc_result: qcData.qc_result,
      qc_message: qcData.qc_message,
      notes: itemNotes || qcData.notes || undefined,
    }
    onSubmit(item)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg bg-white rounded-t-2xl max-h-[90vh] overflow-y-auto"
        style={{ animation: 'sheetUp 300ms cubic-bezier(0.34,1.56,0.64,1)' }}
      >
        {/* Handle */}
        <div className="sticky top-0 z-10 bg-white pt-3 pb-2 px-5 border-b border-gray-100 rounded-t-2xl">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">
              <Package className="w-5 h-5 inline mr-2 text-[#2D8B6E]" />
              Thêm sản phẩm
            </h3>
            <button onClick={onCancel} className="p-2 -mr-2 text-gray-400 active:scale-90">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Material select */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Package className="w-4 h-4 text-gray-400" />
              Sản phẩm <span className="text-red-500">*</span>
            </label>
            {loadingMat ? (
              <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
            ) : (
              <select
                value={materialId}
                onChange={e => setMaterialId(e.target.value)}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200 bg-white
                  text-[15px] focus:outline-none focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20
                  appearance-none"
              >
                <option value="">— Chọn sản phẩm —</option>
                {materials.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.sku} — {m.name} ({m.unit})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Scale className="w-4 h-4 text-gray-400" />
              Số lượng ({selectedMaterial?.unit || 'bành'}) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="0"
              className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200
                text-[15px] focus:outline-none focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            />
            {weightCalc > 0 && (
              <p className="text-xs text-gray-500 mt-1"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                ≈ {weightCalc.toLocaleString('vi-VN')} kg
              </p>
            )}
          </div>

          {/* ── Location Picker (Bước 3.9) ── */}
          <LocationPicker
            warehouse_id={warehouseId}
            selectedId={selectedLocation?.id}
            onSelect={(loc) => setSelectedLocation(loc)}
            mode="stock-in"
            showSearch={true}
            showShelfFilter={true}
            showSummary={true}
            showLegend={true}
          />

          {/* ── QC Input Form (Bước 3.10) ── */}
          <QCInputForm
            material_id={materialId}
            onChange={setQcData}
            required
            showAdvanced
            showNotes={false}
          />

          {/* Notes (cho dòng chi tiết, tách biệt với QC notes) */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Ghi chú</label>
            <input type="text" value={itemNotes} onChange={e => setItemNotes(e.target.value)}
              placeholder="Ghi chú cho dòng này..."
              className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-gray-200 text-[14px]
                focus:outline-none focus:border-[#2D8B6E]"
            />
          </div>
        </div>

        {/* Submit bar */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex gap-3"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={onCancel}
            className="flex-1 min-h-[48px] text-[14px] font-medium text-gray-600 rounded-xl border border-gray-200
              active:scale-[0.97] transition-transform">
            Hủy
          </button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit}
            className={`flex-[2] min-h-[48px] inline-flex items-center justify-center gap-2 text-[14px] font-bold
              text-white rounded-xl active:scale-[0.97] transition-transform
              ${canSubmit ? 'bg-[#2D8B6E]' : 'bg-gray-300 cursor-not-allowed'}`}>
            <Check className="w-4 h-4" />
            Thêm vào phiếu
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// DETAIL CARD
// ============================================================================

const DetailCard: React.FC<{
  item: DetailItem
  index: number
  onRemove: () => void
}> = ({ item, index, onRemove }) => {
  const borderColor =
    item.qc_result === 'failed' ? 'border-l-red-500' :
    item.qc_result === 'warning' ? 'border-l-amber-500' :
    'border-l-emerald-500'

  return (
    <div className={`bg-white rounded-xl border border-gray-100 border-l-4 ${borderColor} shadow-sm overflow-hidden
      active:scale-[0.98] transition-transform`}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <span className="text-xs text-gray-400 font-medium">#{index + 1}</span>
            <h4 className="text-[15px] font-bold text-gray-900">
              {item.material?.sku || '—'} — {item.material?.name || '—'}
            </h4>
          </div>
          <button onClick={onRemove} className="p-1.5 text-gray-300 active:text-red-500">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-gray-600">
          <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            📦 {item.quantity} {item.material?.unit || 'bành'}
          </span>
          {item.weight > 0 && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              ⚖️ {item.weight.toLocaleString('vi-VN')} kg
            </span>
          )}
          {item.location && <span>📍 {item.location.code}</span>}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[13px] text-gray-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            DRC: {item.drc_value?.toFixed(1)}%
          </span>
          <QCBadge result={item.qc_result} message={item.qc_message} />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const StockInCreatePage: React.FC = () => {
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const STEPS = ['Thông tin', 'Chi tiết', 'Xác nhận']

  const [header, setHeader] = useState<FormHeader>({
    warehouse_id: '',
    source_type: 'production',
    notes: '',
  })

  const [details, setDetails] = useState<DetailItem[]>([])
  const [showAddForm, setShowAddForm] = useState(false)

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [loadingWarehouses, setLoadingWarehouses] = useState(true)

  // ✅ Lấy employee_id từ authStore (KHÔNG dùng auth UUID)
  const { user: authUser } = useAuthStore()
  const currentUserId = authUser?.employee_id || null

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successCode, setSuccessCode] = useState<string | null>(null)

  // Load warehouses
  useEffect(() => {
    const load = async () => {
      setLoadingWarehouses(true)
      const { data, error } = await supabase
        .from('warehouses')
        .select('id, code, name, type')
        .eq('is_active', true)
        .order('code')
      if (!error && data) setWarehouses(data)
      setLoadingWarehouses(false)
    }
    load()
  }, [])

  const selectedWarehouse = warehouses.find(w => w.id === header.warehouse_id)
  const totalQty = useMemo(() => details.reduce((s, d) => s + d.quantity, 0), [details])
  const totalWeight = useMemo(() => details.reduce((s, d) => s + d.weight, 0), [details])
  const hasFailedQC = details.some(d => d.qc_result === 'failed')

  const validateStep1 = (): boolean => !!header.warehouse_id
  const validateStep2 = (): boolean =>
    details.length > 0 && details.every(d => d.drc_value && d.drc_value > 0)

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2)
    else if (step === 2 && validateStep2()) setStep(3)
  }

  const handleBack = () => {
    setError(null)
    if (step > 1) setStep(step - 1)
    else navigate('/wms/stock-in')
  }

  const handleAddDetail = (item: DetailItem) => {
    setDetails(prev => [...prev, item])
    setShowAddForm(false)
  }

  const handleRemoveDetail = (tempId: string) => {
    setDetails(prev => prev.filter(d => d.tempId !== tempId))
  }

  // ========================================================================
  // LƯU NHÁP
  // ========================================================================
  const handleSaveDraft = async () => {
    if (!currentUserId) {
      setError('Chưa xác định được người dùng đang đăng nhập')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const order = await stockInService.create({
        type: 'finished',
        warehouse_id: header.warehouse_id,
        source_type: header.source_type,
        notes: header.notes || undefined,
      }, currentUserId)

      for (const item of details) {
        await stockInService.addDetail(order.id, {
          material_id: item.material_id,
          quantity: item.quantity,
          weight: item.weight,
          location_id: item.location_id,
          initial_drc: item.drc_value,
          notes: item.notes,
        })
      }

      setSuccessCode(order.code)
      setTimeout(() => navigate('/wms/stock-in'), 1500)
    } catch (err: any) {
      console.error('Lỗi lưu nháp:', err)
      setError(err.message || 'Có lỗi xảy ra khi lưu phiếu')
    } finally {
      setSaving(false)
    }
  }

  // ========================================================================
  // XÁC NHẬN NHẬP KHO
  // ========================================================================
  const handleConfirm = async () => {
    if (hasFailedQC) {
      setError('Không thể xác nhận — có lô không đạt QC')
      return
    }
    if (!currentUserId) {
      setError('Chưa xác định được người dùng đang đăng nhập')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const order = await stockInService.create({
        type: 'finished',
        warehouse_id: header.warehouse_id,
        source_type: header.source_type,
        notes: header.notes || undefined,
      }, currentUserId)

      for (const item of details) {
        await stockInService.addDetail(order.id, {
          material_id: item.material_id,
          quantity: item.quantity,
          weight: item.weight,
          location_id: item.location_id,
          initial_drc: item.drc_value,
          notes: item.notes,
        })
      }

      const confirmed = await stockInService.confirmStockIn(order.id, currentUserId)
      setSuccessCode(confirmed.code)
      setTimeout(() => navigate('/wms/stock-in'), 1500)
    } catch (err: any) {
      console.error('Lỗi xác nhận nhập kho:', err)
      setError(err.message || 'Có lỗi xảy ra khi xác nhận nhập kho')
    } finally {
      setSaving(false)
    }
  }

  // ========================================================================
  // SUCCESS OVERLAY
  // ========================================================================
  if (successCode) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center p-6"
        style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center"
          style={{ animation: 'fadeIn 300ms ease-out' }}>
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CircleCheck className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Thành công!</h2>
          <p className="text-gray-600 text-sm mb-1">Phiếu nhập kho đã được tạo</p>
          <p className="font-bold text-[#1B4D3E] text-lg mb-6"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {successCode}
          </p>
          <button onClick={() => navigate('/wms/stock-in')}
            className="w-full min-h-[48px] bg-[#2D8B6E] text-white font-bold rounded-xl
              active:scale-[0.97] transition-transform">
            Về danh sách
          </button>
        </div>
      </div>
    )
  }

  // ========================================================================
  // RENDER
  // ========================================================================
  return (
    <div className="min-h-screen bg-[#F7F5F2] flex flex-col"
      style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>

      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-[#1B4D3E] text-white px-4 py-3 shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="p-2 -ml-2 active:scale-90 transition-transform">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-bold">Tạo phiếu nhập kho</h1>
            <p className="text-xs text-white/70">Thành phẩm</p>
          </div>
        </div>
      </header>

      {/* STEP INDICATOR */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          {STEPS.map((s, i) => {
            const stepNum = i + 1
            const isActive = step === stepNum
            const isDone = step > stepNum
            return (
              <React.Fragment key={s}>
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                    ${isDone ? 'bg-[#2D8B6E] text-white' : isActive ? 'bg-[#1B4D3E] text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {isDone ? <Check className="w-3.5 h-3.5" /> : stepNum}
                  </div>
                  <span className={`text-sm ${isActive ? 'font-bold text-gray-900' : 'text-gray-400'}`}>{s}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 rounded ${isDone ? 'bg-[#2D8B6E]' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2"
          style={{ animation: 'slideDown 200ms ease-out' }}>
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-red-700 font-medium">{error}</p>
            <button onClick={() => setError(null)} className="text-xs text-red-500 underline mt-1">Đóng</button>
          </div>
        </div>
      )}

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto pb-24">

        {/* STEP 1: THÔNG TIN */}
        {step === 1 && (
          <div className="p-4 space-y-5 max-w-lg mx-auto">
            {/* Kho nhận */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                <WarehouseIcon className="w-4 h-4 text-gray-400" />
                Kho nhận <span className="text-red-500">*</span>
              </label>
              {loadingWarehouses ? (
                <div className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              ) : (
                <select
                  value={header.warehouse_id}
                  onChange={e => setHeader(h => ({ ...h, warehouse_id: e.target.value }))}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200 bg-white
                    text-[15px] focus:outline-none focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/20
                    appearance-none"
                >
                  <option value="">— Chọn kho nhận —</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                  ))}
                </select>
              )}
              {!header.warehouse_id && (
                <p className="text-xs text-gray-400 mt-1">Chọn kho để tiếp tục</p>
              )}
            </div>

            {/* Nguồn nhập */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Nguồn nhập</label>
              <div className="flex flex-wrap gap-2">
                {SOURCE_TYPES.map(st => (
                  <button key={st.value} type="button"
                    onClick={() => setHeader(h => ({ ...h, source_type: st.value }))}
                    className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[13px] font-medium
                      border transition-all active:scale-95
                      ${header.source_type === st.value
                        ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]'
                        : 'bg-white text-gray-600 border-gray-200'
                      }`}>
                    {st.icon} {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ghi chú */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                <FileText className="w-4 h-4 text-gray-400" />
                Ghi chú
              </label>
              <textarea
                value={header.notes}
                onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
                placeholder="Ghi chú cho phiếu nhập kho..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-[15px]
                  resize-none focus:outline-none focus:border-[#2D8B6E]"
              />
            </div>
          </div>
        )}

        {/* STEP 2: CHI TIẾT */}
        {step === 2 && (
          <div className="p-4 space-y-4 max-w-lg mx-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-700">Chi tiết ({details.length} dòng)</h3>
              <div className="text-xs text-gray-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {totalQty > 0 && `${totalQty} | ${totalWeight.toLocaleString('vi-VN')} kg`}
              </div>
            </div>
            {details.map((item, i) => (
              <DetailCard key={item.tempId} item={item} index={i}
                onRemove={() => handleRemoveDetail(item.tempId)} />
            ))}
            {details.length === 0 && (
              <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400 mb-1">Chưa có sản phẩm nào</p>
                <p className="text-xs text-gray-300">Nhấn nút bên dưới để thêm</p>
              </div>
            )}
            <button type="button" onClick={() => setShowAddForm(true)}
              className="w-full min-h-[48px] flex items-center justify-center gap-2 border-2 border-dashed
                border-gray-300 rounded-xl text-[14px] font-medium text-gray-500
                active:scale-[0.97] transition-transform active:border-[#2D8B6E] active:text-[#2D8B6E]">
              <Plus className="w-4 h-4" />
              Thêm sản phẩm
            </button>
          </div>
        )}

        {/* STEP 3: XÁC NHẬN */}
        {step === 3 && (
          <div className="p-4 space-y-4 max-w-lg mx-auto">
            {/* Thông tin phiếu */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Thông tin phiếu</h3>
              <div className="space-y-2 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-gray-500">Kho nhận</span>
                  <span className="font-medium text-gray-900">
                    {selectedWarehouse?.code} — {selectedWarehouse?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Nguồn</span>
                  <span className="font-medium text-gray-900">
                    {SOURCE_TYPES.find(s => s.value === header.source_type)?.label}
                  </span>
                </div>
                {header.notes && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Ghi chú</span>
                    <span className="text-gray-700 text-right max-w-[60%]">{header.notes}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
                <p className="text-xs text-gray-400 mb-1">Tổng số lượng</p>
                <p className="text-2xl font-bold text-[#1B4D3E]"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}>{totalQty}</p>
                <p className="text-xs text-gray-400">sản phẩm</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
                <p className="text-xs text-gray-400 mb-1">Tổng khối lượng</p>
                <p className="text-2xl font-bold text-[#1B4D3E]"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {totalWeight.toLocaleString('vi-VN')}
                </p>
                <p className="text-xs text-gray-400">kg</p>
              </div>
            </div>

            {/* QC warning */}
            {hasFailedQC && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-red-700 font-bold">Có lô không đạt QC!</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Quay lại bước 2 để xóa hoặc sửa lô không đạt trước khi xác nhận.
                  </p>
                </div>
              </div>
            )}

            {/* Detail summary */}
            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-2">Chi tiết ({details.length} dòng)</h3>
              <div className="space-y-2">
                {details.map((item) => (
                  <div key={item.tempId}
                    className="bg-white rounded-lg border border-gray-100 p-3 flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-gray-900">
                        {item.material?.sku} — {item.material?.name}
                      </p>
                      <p className="text-[12px] text-gray-500"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {item.quantity} {item.material?.unit} · DRC {item.drc_value?.toFixed(1)}%
                        {item.location && ` · ${item.location.code}`}
                      </p>
                    </div>
                    <QCBadge result={item.qc_result} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM ACTION BAR */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200
        shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-20"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex gap-3">
          {step === 1 && (
            <>
              <button onClick={() => navigate('/wms/stock-in')}
                className="flex-1 min-h-[48px] text-[14px] font-medium text-gray-600 rounded-xl border border-gray-200
                  active:scale-[0.97] transition-transform">
                Hủy
              </button>
              <button onClick={handleNext} disabled={!validateStep1()}
                className={`flex-[2] min-h-[48px] inline-flex items-center justify-center gap-2 text-[14px] font-bold
                  text-white rounded-xl active:scale-[0.97] transition-transform
                  ${validateStep1() ? 'bg-[#2D8B6E]' : 'bg-gray-300 cursor-not-allowed'}`}>
                Tiếp theo <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <button onClick={handleBack}
                className="min-h-[48px] px-4 text-[14px] font-medium text-gray-600 rounded-xl border border-gray-200
                  active:scale-[0.97] transition-transform">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button onClick={handleSaveDraft} disabled={saving || details.length === 0}
                className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 text-[14px] font-medium
                  text-gray-700 rounded-xl border border-gray-200 active:scale-[0.97] transition-transform">
                <Save className="w-4 h-4" />
                Lưu nháp
              </button>
              <button onClick={handleNext} disabled={!validateStep2()}
                className={`flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 text-[14px] font-bold
                  text-white rounded-xl active:scale-[0.97] transition-transform
                  ${validateStep2() ? 'bg-[#2D8B6E]' : 'bg-gray-300 cursor-not-allowed'}`}>
                Xem lại <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === 3 && (
            <>
              <button onClick={handleBack}
                className="min-h-[48px] px-4 text-[14px] font-medium text-gray-600 rounded-xl border border-gray-200
                  active:scale-[0.97] transition-transform">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button onClick={handleSaveDraft} disabled={saving}
                className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 text-[14px] font-medium
                  text-gray-700 rounded-xl border border-gray-200 active:scale-[0.97] transition-transform">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Lưu nháp
              </button>
              <button onClick={handleConfirm} disabled={saving || hasFailedQC}
                className={`flex-[1.5] min-h-[48px] inline-flex items-center justify-center gap-2 text-[14px] font-bold
                  text-white rounded-xl active:scale-[0.97] transition-transform
                  ${saving || hasFailedQC
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-[#E8A838] shadow-[0_2px_8px_rgba(232,168,56,0.3)]'
                  }`}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? 'Đang xử lý...' : 'Xác nhận nhập kho'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ADD DETAIL BOTTOM SHEET */}
      {showAddForm && (
        <AddDetailForm
          warehouseId={header.warehouse_id}
          onSubmit={handleAddDetail}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* ANIMATIONS */}
      <style>{`
        @keyframes sheetUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default StockInCreatePage