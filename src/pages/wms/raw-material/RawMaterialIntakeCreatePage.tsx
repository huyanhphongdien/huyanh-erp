// ============================================================================
// FILE: src/pages/wms/raw-material/RawMaterialIntakeCreatePage.tsx
// MODULE: Kho Nguyên Liệu (WMS) — Huy Anh Rubber ERP
// PHASE: P3-RAW — Form tạo phiếu nhập NVL (Step Wizard 4 bước)
// ============================================================================
// KẾT NỐI SUPABASE THẬT — không dùng mock data
// Design: Industrial Mobile-First (WMS_UI_DESIGN_GUIDE.md)
// ============================================================================

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import {
  ArrowLeft, ArrowRight, Check, Plus, X, Package,
  Warehouse as WarehouseIcon, MapPin, FlaskConical, Scale,
  FileText, ChevronDown, ChevronUp, AlertTriangle, CircleCheck,
  CircleX, Trash2, Save, Truck, CalendarDays, Building2,
  ClipboardList, Loader2, Weight, Info,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
// Path: src/pages/wms/raw-material/ → 3 levels up to src/
import { supabase } from '../../../lib/supabase'
import stockInService from '../../../services/wms/stockInService'

// ============================================================================
// TYPES
// ============================================================================

interface WarehouseOption {
  id: string; code: string; name: string; type: string
}
interface SupplierOption {
  id: string; code: string; name: string; phone?: string; address?: string
}
interface PurchaseOrderOption {
  id: string; code: string; status: string; total_amount?: number; created_at: string
}
interface MaterialOption {
  id: string; sku: string; name: string; unit: string
  weight_per_unit: number | null; category_id?: string
  category?: { id: string; name: string; code?: string }
  shelf_life_days?: number | null
}
interface LocationOption {
  id: string; code: string; shelf: string | null
  row_name: string | null; column_name: string | null
  capacity: number | null; current_quantity: number; is_available: boolean
}
interface QCStandard {
  drc_standard: number | null; drc_min: number | null
  drc_max: number | null; drc_warning_low: number | null
  drc_warning_high: number | null
}
type QCResult = 'passed' | 'warning' | 'failed'

interface DetailItem {
  tempId: string; material_id: string; material?: MaterialOption
  quantity: number; weight: number; location_id?: string
  location?: LocationOption; drc_value?: number
  qc_result?: QCResult; qc_message?: string
  expiry_date?: string; notes?: string
}
interface FormHeader {
  warehouse_id: string; supplier_id: string; purchase_order_id: string
  vehicle_plate: string; gross_weight: string; tare_weight: string; notes: string
}

// ============================================================================
// DRC GAUGE + QC BADGE + LOCATION GRID (same as StockInCreatePage)
// ============================================================================

const DRCGauge: React.FC<{ value: number; standard?: QCStandard | null }> = ({ value, standard }) => {
  if (!standard || standard.drc_min == null || standard.drc_max == null) return null
  const min = standard.drc_min, max = standard.drc_max
  const range = max - min, padding = range * 0.5
  const displayMin = min - padding, displayMax = max + padding, displayRange = displayMax - displayMin
  const getPos = (v: number) => Math.max(0, Math.min(100, ((v - displayMin) / displayRange) * 100))
  const safeStart = getPos(min), safeEnd = getPos(max), markerPos = getPos(value)
  const warnLow = standard.drc_warning_low != null ? getPos(standard.drc_warning_low) : safeStart
  const warnHigh = standard.drc_warning_high != null ? getPos(standard.drc_warning_high) : safeEnd
  return (
    <div className="mt-2">
      <div className="relative h-6 rounded-full overflow-hidden bg-red-100">
        <div className="absolute top-0 bottom-0 bg-amber-100" style={{ left: `${warnLow}%`, width: `${safeStart - warnLow}%` }} />
        <div className="absolute top-0 bottom-0 bg-amber-100" style={{ left: `${safeEnd}%`, width: `${warnHigh - safeEnd}%` }} />
        <div className="absolute top-0 bottom-0 bg-emerald-100" style={{ left: `${safeStart}%`, width: `${safeEnd - safeStart}%` }} />
        <div className="absolute top-0 bottom-0 w-0.5 bg-gray-800 transition-all duration-500" style={{ left: `${markerPos}%` }}>
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-bold whitespace-nowrap"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}>{value.toFixed(1)}%</div>
        </div>
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-gray-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        <span>{displayMin.toFixed(0)}</span><span>{min.toFixed(0)}</span>
        <span>{(standard.drc_standard ?? ((min + max) / 2)).toFixed(0)}</span>
        <span>{max.toFixed(0)}</span><span>{displayMax.toFixed(0)}</span>
      </div>
    </div>
  )
}

const QCBadge: React.FC<{ result: QCResult | undefined; message?: string }> = ({ result, message }) => {
  if (!result) return null
  const cfg = {
    passed: { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: <CircleCheck className="w-3.5 h-3.5" />, label: 'Đạt' },
    warning: { bg: 'bg-amber-50 border-amber-200 text-amber-700', icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'Cảnh báo' },
    failed: { bg: 'bg-red-50 border-red-200 text-red-700', icon: <CircleX className="w-3.5 h-3.5" />, label: 'Không đạt' },
  }
  const c = cfg[result]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full border ${c.bg}`}>
      {c.icon} {c.label}{message && <span className="font-normal ml-1">· {message}</span>}
    </span>
  )
}

const LocationGrid: React.FC<{
  locations: LocationOption[]; selectedId?: string
  onSelect: (loc: LocationOption) => void; loading?: boolean
}> = ({ locations, selectedId, onSelect, loading }) => {
  if (loading) return (
    <div className="grid grid-cols-5 gap-1.5">
      {Array.from({ length: 15 }).map((_, i) => <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />)}
    </div>
  )
  if (locations.length === 0) return <div className="text-center py-6 text-gray-400 text-sm">Chưa có vị trí nào</div>
  const shelves = [...new Set(locations.map(l => l.shelf || 'K?'))].sort()
  return (
    <div className="space-y-3">
      {shelves.map(shelf => {
        const locs = locations.filter(l => (l.shelf || 'K?') === shelf)
        return (
          <div key={shelf}>
            <div className="text-xs font-semibold text-gray-500 mb-1">Kệ {shelf}</div>
            <div className="grid grid-cols-5 gap-1.5">
              {locs.map(loc => {
                const fill = loc.capacity ? (loc.current_quantity / loc.capacity) * 100 : 0
                const sel = selectedId === loc.id, dis = !loc.is_available
                let bg = 'bg-[#D1FAE5]'
                if (dis) bg = 'bg-gray-100'
                else if (fill >= 80) bg = 'bg-[#FEE2E2]'
                else if (fill > 0) bg = 'bg-[#FEF3C7]'
                return (
                  <button key={loc.id} type="button" disabled={dis} onClick={() => onSelect(loc)}
                    className={`relative h-14 rounded-lg text-center flex flex-col items-center justify-center text-[10px] font-medium transition-all active:scale-95 ${bg} ${sel ? 'ring-2 ring-[#E8A838] ring-offset-1 scale-105' : ''} ${dis ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <span className="font-bold text-[11px] text-gray-700">{loc.code}</span>
                    {loc.capacity && !dis && <span className="text-gray-500 text-[9px]">{loc.current_quantity}/{loc.capacity}</span>}
                    {sel && <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#E8A838] rounded-full flex items-center justify-center"><Check className="w-2.5 h-2.5 text-white" /></div>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const NetWeightDisplay: React.FC<{ gross: string; tare: string }> = ({ gross, tare }) => {
  const g = parseFloat(gross) || 0, t = parseFloat(tare) || 0, net = g > 0 && t > 0 ? g - t : 0
  if (net <= 0) return null
  return (
    <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
      <div className="flex items-center gap-2 mb-1">
        <Weight className="w-4 h-4 text-emerald-600" />
        <span className="text-sm font-bold text-emerald-700">Trọng lượng hàng (Net)</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-emerald-700" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{net.toLocaleString('vi-VN')}</span>
        <span className="text-sm text-emerald-600">kg</span>
      </div>
      <p className="text-[11px] text-emerald-500 mt-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        {g.toLocaleString('vi-VN')} − {t.toLocaleString('vi-VN')} = {net.toLocaleString('vi-VN')} kg
      </p>
    </div>
  )
}

// ============================================================================
// ADD DETAIL FORM (BOTTOM SHEET)
// ============================================================================

const AddDetailForm: React.FC<{
  warehouseId: string; onSubmit: (item: DetailItem) => void; onCancel: () => void
}> = ({ warehouseId, onSubmit, onCancel }) => {
  const [materials, setMaterials] = useState<MaterialOption[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [loadingMat, setLoadingMat] = useState(true)
  const [loadingLoc, setLoadingLoc] = useState(true)
  const [materialId, setMaterialId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [locationId, setLocationId] = useState('')
  const [drcValue, setDrcValue] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [showQC, setShowQC] = useState(false)
  const [priValue, setPriValue] = useState('')
  const [mooneyValue, setMooneyValue] = useState('')
  const [ashContent, setAshContent] = useState('')
  const [nitrogenContent, setNitrogenContent] = useState('')
  const [qcStandard, setQcStandard] = useState<QCStandard | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoadingMat(true)
      const { data, error } = await supabase.from('materials')
        .select('id, sku, name, unit, weight_per_unit, category_id, shelf_life_days, category:material_categories(id, name, code)')
        .eq('material_type', 'raw').eq('is_active', true).order('name')
      if (!error && data) {
        const mapped = data.map((m: any) => ({
          ...m,
          category: Array.isArray(m.category) ? m.category[0] || null : m.category,
        }))
        setMaterials(mapped as MaterialOption[])
      }
      setLoadingMat(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!warehouseId) return
    const load = async () => {
      setLoadingLoc(true)
      const { data, error } = await supabase.from('warehouse_locations')
        .select('id, code, shelf, row_name, column_name, capacity, current_quantity, is_available')
        .eq('warehouse_id', warehouseId).order('code')
      if (!error && data) setLocations(data)
      setLoadingLoc(false)
    }
    load()
  }, [warehouseId])

  useEffect(() => {
    if (!materialId) { setQcStandard(null); return }
    const load = async () => {
      const { data } = await supabase.from('material_qc_standards')
        .select('drc_standard, drc_min, drc_max, drc_warning_low, drc_warning_high')
        .eq('material_id', materialId).maybeSingle()
      setQcStandard(data || null)
    }
    load()
  }, [materialId])

  useEffect(() => {
    const mat = materials.find(m => m.id === materialId)
    if (mat?.shelf_life_days && mat.shelf_life_days > 0 && !expiryDate) {
      const exp = new Date(); exp.setDate(exp.getDate() + mat.shelf_life_days)
      setExpiryDate(exp.toISOString().split('T')[0])
    }
  }, [materialId, materials])

  const selectedMaterial = materials.find(m => m.id === materialId)
  const isRubber = useMemo(() => {
    if (!selectedMaterial) return false
    const n = selectedMaterial.name.toLowerCase()
    const c = selectedMaterial.category?.name?.toLowerCase() || ''
    return n.includes('mủ') || n.includes('cao su') || n.includes('svr') || n.includes('latex') || c.includes('mủ') || c.includes('cao su')
  }, [selectedMaterial])

  const evaluateDRC = useCallback((drc: number): { result: QCResult; message: string } => {
    if (!qcStandard || qcStandard.drc_min == null || qcStandard.drc_max == null)
      return { result: 'passed', message: 'Chưa có ngưỡng — mặc định Đạt' }
    if (drc < qcStandard.drc_min || drc > qcStandard.drc_max)
      return { result: 'failed', message: `Ngoài khoảng ${qcStandard.drc_min}–${qcStandard.drc_max}%` }
    if (qcStandard.drc_warning_low != null && drc < qcStandard.drc_warning_low)
      return { result: 'warning', message: `Gần biên dưới (${qcStandard.drc_warning_low}%)` }
    if (qcStandard.drc_warning_high != null && drc > qcStandard.drc_warning_high)
      return { result: 'warning', message: `Gần biên trên (${qcStandard.drc_warning_high}%)` }
    return { result: 'passed', message: 'Trong khoảng chuẩn' }
  }, [qcStandard])

  const drcNum = parseFloat(drcValue)
  const qcEval = !isNaN(drcNum) && drcNum > 0 ? evaluateDRC(drcNum) : null
  const selLoc = locations.find(l => l.id === locationId)
  const qty = parseFloat(quantity) || 0
  const wt = selectedMaterial?.weight_per_unit ? qty * selectedMaterial.weight_per_unit : 0
  const drcOk = isRubber ? (!isNaN(drcNum) && drcNum > 0) : true
  const canSubmit = materialId && qty > 0 && drcOk

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      tempId: `temp-${Date.now()}`, material_id: materialId, material: selectedMaterial,
      quantity: qty, weight: wt, location_id: locationId || undefined, location: selLoc || undefined,
      drc_value: !isNaN(drcNum) && drcNum > 0 ? drcNum : undefined,
      qc_result: qcEval?.result, qc_message: qcEval?.message,
      expiry_date: expiryDate || undefined, notes: notes || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl max-h-[90vh] overflow-y-auto"
        style={{ animation: 'sheetUp 300ms cubic-bezier(0.34,1.56,0.64,1)' }}>
        {/* Handle */}
        <div className="sticky top-0 z-10 bg-white pt-3 pb-2 px-5 border-b border-gray-100 rounded-t-2xl">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">
              <Package className="w-5 h-5 inline mr-2 text-[#E8A838]" />Thêm nguyên liệu
            </h3>
            <button onClick={onCancel} className="p-2 -mr-2 text-gray-400 active:scale-90"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Material select */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <Package className="w-4 h-4 text-gray-400" />Nguyên liệu <span className="text-red-500">*</span>
            </label>
            {loadingMat ? <div className="h-12 bg-gray-100 rounded-xl animate-pulse" /> : (
              <select value={materialId} onChange={e => { setMaterialId(e.target.value); setDrcValue(''); setExpiryDate('') }}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200 bg-white text-[15px] focus:outline-none focus:border-[#E8A838] focus:ring-1 focus:ring-[#E8A838]/20 appearance-none">
                <option value="">— Chọn nguyên liệu —</option>
                {materials.map(m => <option key={m.id} value={m.id}>{m.sku || m.name} — {m.name} ({m.unit})</option>)}
              </select>
            )}
            {selectedMaterial?.category && (
              <p className="text-xs text-gray-400 mt-1">Nhóm: {selectedMaterial.category.name}{isRubber && ' · DRC bắt buộc'}</p>
            )}
          </div>

          {/* Quantity + Weight */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                <Scale className="w-4 h-4 text-gray-400" />Số lượng <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input type="number" inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0"
                  className="w-full min-h-[48px] px-3 pr-12 py-3 rounded-xl border border-gray-200 text-[15px] focus:outline-none focus:border-[#E8A838] focus:ring-1 focus:ring-[#E8A838]/20"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">{selectedMaterial?.unit || 'kg'}</span>
              </div>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                <Weight className="w-4 h-4 text-gray-400" />Trọng lượng
              </label>
              <div className="relative">
                <input type="text" readOnly value={wt > 0 ? wt.toLocaleString('vi-VN') : '—'}
                  className="w-full min-h-[48px] px-3 pr-10 py-3 rounded-xl border border-gray-200 bg-gray-50 text-[15px] text-gray-500"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">kg</span>
              </div>
            </div>
          </div>

          {/* Expiry */}
          {selectedMaterial?.shelf_life_days && selectedMaterial.shelf_life_days > 0 && (
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                <CalendarDays className="w-4 h-4 text-gray-400" />Hạn sử dụng
              </label>
              <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200 text-[15px] focus:outline-none focus:border-[#E8A838]" />
              <p className="text-[10px] text-gray-400 mt-1">Tự tính: {selectedMaterial.shelf_life_days} ngày</p>
            </div>
          )}

          {/* Location */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
              <MapPin className="w-4 h-4 text-gray-400" />Vị trí kho
            </label>
            <LocationGrid locations={locations} selectedId={locationId}
              onSelect={loc => setLocationId(loc.id === locationId ? '' : loc.id)} loading={loadingLoc} />
          </div>

          {/* QC Section */}
          <div className={`p-3.5 rounded-xl border ${isRubber ? 'bg-amber-50/50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
            <label className="flex items-center gap-1.5 text-sm font-bold text-gray-800 mb-2">
              <FlaskConical className="w-4 h-4 text-gray-500" />Kiểm tra chất lượng
              {isRubber && <span className="text-red-500 text-xs">*Bắt buộc</span>}
              {!isRubber && materialId && <span className="text-gray-400 text-xs font-normal">Tùy chọn</span>}
            </label>
            <div className="mb-2">
              <label className="block text-[12px] text-gray-500 mb-1">DRC (%) {isRubber && <span className="text-red-500">*</span>}</label>
              <div className="relative">
                <input type="number" inputMode="decimal" step="0.1" value={drcValue} onChange={e => setDrcValue(e.target.value)}
                  placeholder={isRubber ? '60.0' : 'Không bắt buộc'}
                  className={`w-full min-h-[48px] px-4 py-3 rounded-xl border text-[20px] font-bold focus:outline-none focus:ring-1
                    ${qcEval?.result === 'failed' ? 'border-red-300 focus:border-red-400 focus:ring-red-200 text-red-700'
                      : qcEval?.result === 'warning' ? 'border-amber-300 focus:border-amber-400 focus:ring-amber-200 text-amber-700'
                        : qcEval?.result === 'passed' ? 'border-emerald-300 focus:border-emerald-400 focus:ring-emerald-200 text-emerald-700'
                          : 'border-gray-200 focus:border-[#E8A838] focus:ring-[#E8A838]/20'}`}
                  style={{ fontFamily: "'JetBrains Mono', monospace" }} />
                {qcEval && <div className="absolute right-3 top-1/2 -translate-y-1/2"><QCBadge result={qcEval.result} /></div>}
              </div>
              {qcStandard && <p className="text-xs text-gray-500 mt-1">Chuẩn: {qcStandard.drc_standard ?? '—'}% · Khoảng: {qcStandard.drc_min}–{qcStandard.drc_max}%</p>}
              {qcEval && !isNaN(drcNum) && <DRCGauge value={drcNum} standard={qcStandard} />}
            </div>
            <button type="button" onClick={() => setShowQC(!showQC)} className="flex items-center gap-1.5 text-sm text-gray-500 active:text-gray-700 mt-2">
              {showQC ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}Chỉ số phụ (PRI, Mooney, Tro, N₂)
            </button>
            {showQC && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                {[{ l: 'PRI', v: priValue, s: setPriValue }, { l: 'Mooney', v: mooneyValue, s: setMooneyValue },
                  { l: 'Tro (%)', v: ashContent, s: setAshContent }, { l: 'N₂ (%)', v: nitrogenContent, s: setNitrogenContent }
                ].map(f => (
                  <div key={f.l}><label className="text-xs text-gray-500 mb-1 block">{f.l}</label>
                    <input type="number" inputMode="decimal" step="0.01" value={f.v} onChange={e => f.s(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-200 text-[14px] focus:outline-none focus:border-[#E8A838]"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }} /></div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">Ghi chú</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ghi chú..."
              className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-gray-200 text-[14px] focus:outline-none focus:border-[#E8A838]" />
          </div>
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex gap-3"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={onCancel}
            className="flex-1 min-h-[48px] text-[14px] font-medium text-gray-600 rounded-xl border border-gray-200 active:scale-[0.97] transition-transform">Hủy</button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit}
            className={`flex-[2] min-h-[48px] inline-flex items-center justify-center gap-2 text-[14px] font-bold text-white rounded-xl active:scale-[0.97] transition-transform ${canSubmit ? 'bg-[#E8A838]' : 'bg-gray-300 cursor-not-allowed'}`}>
            <Check className="w-4 h-4" />Thêm vào phiếu
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// DETAIL CARD
// ============================================================================

const DetailCard: React.FC<{ item: DetailItem; index: number; onRemove: () => void }> = ({ item, index, onRemove }) => {
  const bc = item.qc_result === 'failed' ? 'border-l-red-500' : item.qc_result === 'warning' ? 'border-l-amber-500' : item.drc_value ? 'border-l-emerald-500' : 'border-l-blue-400'
  return (
    <div className={`bg-white rounded-xl border border-gray-100 border-l-4 ${bc} shadow-sm overflow-hidden active:scale-[0.98] transition-transform`}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <span className="text-xs text-gray-400 font-medium">#{index + 1}</span>
            <h4 className="text-[15px] font-bold text-gray-900">{item.material?.name || '—'}</h4>
            {item.material?.category && <span className="text-[11px] text-gray-400">{item.material.category.name}</span>}
          </div>
          <button onClick={onRemove} className="p-1.5 text-gray-300 active:text-red-500"><Trash2 className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-gray-600">
          <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>📦 {item.quantity} {item.material?.unit || 'kg'}</span>
          {item.weight > 0 && <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>⚖️ {item.weight.toLocaleString('vi-VN')} kg</span>}
          {item.location && <span>📍 {item.location.code}</span>}
          {item.expiry_date && <span>📅 HSD: {new Date(item.expiry_date).toLocaleDateString('vi-VN')}</span>}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {item.drc_value ? (
            <><span className="text-[13px] text-gray-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>DRC: {item.drc_value?.toFixed(1)}%</span><QCBadge result={item.qc_result} message={item.qc_message} /></>
          ) : <span className="text-[12px] text-gray-400 italic">Không kiểm DRC</span>}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const RawMaterialIntakeCreatePage: React.FC = () => {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const STEPS = ['NCC & PO', 'Cân xe', 'Chi tiết', 'Xác nhận']

  const [header, setHeader] = useState<FormHeader>({
    warehouse_id: '', supplier_id: '', purchase_order_id: '',
    vehicle_plate: '', gross_weight: '', tare_weight: '', notes: '',
  })
  const [details, setDetails] = useState<DetailItem[]>([])
  const [showAddForm, setShowAddForm] = useState(false)

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderOption[]>([])
  const [loadingWarehouses, setLoadingWarehouses] = useState(true)
  const [loadingSuppliers, setLoadingSuppliers] = useState(true)
  const [loadingPOs, setLoadingPOs] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successCode, setSuccessCode] = useState<string | null>(null)

  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id || null)) }, [])

  useEffect(() => {
    const load = async () => {
      setLoadingWarehouses(true)
      const { data } = await supabase.from('warehouses').select('id, code, name, type').eq('is_active', true).in('type', ['raw', 'mixed']).order('code')
      if (data) setWarehouses(data)
      setLoadingWarehouses(false)
    }
    load()
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoadingSuppliers(true)
      const { data } = await supabase.from('suppliers').select('id, code, name, phone, address').eq('is_active', true).order('name')
      if (data) setSuppliers(data)
      setLoadingSuppliers(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!header.supplier_id) { setPurchaseOrders([]); return }
    const load = async () => {
      setLoadingPOs(true)
      const { data } = await supabase.from('purchase_orders').select('id, code, status, total_amount, created_at')
        .eq('supplier_id', header.supplier_id).in('status', ['confirmed', 'partial', 'approved']).order('created_at', { ascending: false }).limit(20)
      if (data) setPurchaseOrders(data)
      setLoadingPOs(false)
    }
    load()
  }, [header.supplier_id])

  const selWh = warehouses.find(w => w.id === header.warehouse_id)
  const selSup = suppliers.find(s => s.id === header.supplier_id)
  const gross = parseFloat(header.gross_weight) || 0
  const tare = parseFloat(header.tare_weight) || 0
  const net = gross > 0 && tare > 0 ? gross - tare : 0
  const totalQty = useMemo(() => details.reduce((s, d) => s + d.quantity, 0), [details])
  const totalWt = useMemo(() => details.reduce((s, d) => s + d.weight, 0), [details])
  const hasFail = details.some(d => d.qc_result === 'failed')

  const v1 = (): boolean => !!header.warehouse_id && !!header.supplier_id
  const v3 = (): boolean => details.length > 0

  const handleNext = () => {
    if (step === 1 && v1()) setStep(2)
    else if (step === 2) setStep(3)
    else if (step === 3 && v3()) setStep(4)
  }
  const handleBack = () => { setError(null); if (step > 1) setStep(step - 1); else navigate('/wms/raw-material') }

  const handleSaveDraft = async () => {
    if (!currentUserId) { setError('Chưa xác định được người dùng'); return }
    setSaving(true); setError(null)
    try {
      const order = await stockInService.create({
        type: 'raw', warehouse_id: header.warehouse_id, source_type: 'purchase',
        notes: [header.notes, selSup ? `NCC: ${selSup.name}` : '', header.vehicle_plate ? `Xe: ${header.vehicle_plate}` : '',
          net > 0 ? `Cân: ${gross}-${tare}=${net}kg` : ''].filter(Boolean).join(' | ') || undefined,
      }, currentUserId)
      for (const item of details) {
        await stockInService.addDetail(order.id, {
          material_id: item.material_id, quantity: item.quantity, weight: item.weight,
          location_id: item.location_id, initial_drc: item.drc_value, notes: item.notes,
        })
      }
      setSuccessCode(order.code); setTimeout(() => navigate('/wms/raw-material'), 1500)
    } catch (err: any) { setError(err.message || 'Lỗi lưu phiếu') } finally { setSaving(false) }
  }

  const handleConfirm = async () => {
    if (hasFail) { setError('Có NVL không đạt QC'); return }
    if (!currentUserId) { setError('Chưa xác định được người dùng'); return }
    setSaving(true); setError(null)
    try {
      const poCode = purchaseOrders.find(p => p.id === header.purchase_order_id)?.code
      const order = await stockInService.create({
        type: 'raw', warehouse_id: header.warehouse_id, source_type: 'purchase',
        notes: [header.notes, selSup ? `NCC: ${selSup.name}` : '', poCode ? `PO: ${poCode}` : '',
          header.vehicle_plate ? `Xe: ${header.vehicle_plate}` : '',
          net > 0 ? `Cân: ${gross}−${tare}=${net}kg` : ''].filter(Boolean).join(' | ') || undefined,
      }, currentUserId)
      for (const item of details) {
        await stockInService.addDetail(order.id, { material_id: item.material_id, quantity: item.quantity, weight: item.weight, location_id: item.location_id, initial_drc: item.drc_value, notes: item.notes })
      }
      const confirmed = await stockInService.confirmStockIn(order.id, currentUserId)
      setSuccessCode(confirmed.code); setTimeout(() => navigate('/wms/raw-material'), 1500)
    } catch (err: any) { setError(err.message || 'Lỗi xác nhận') } finally { setSaving(false) }
  }

  // SUCCESS
  if (successCode) return (
    <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center p-6" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center" style={{ animation: 'fadeIn 300ms ease-out' }}>
        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4"><CircleCheck className="w-8 h-8 text-emerald-600" /></div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Thành công!</h2>
        <p className="text-gray-600 text-sm mb-1">Phiếu nhập NVL đã được tạo</p>
        <p className="font-bold text-[#8B5E3C] text-lg mb-6" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{successCode}</p>
        <button onClick={() => navigate('/wms/raw-material')} className="w-full min-h-[48px] bg-[#E8A838] text-white font-bold rounded-xl active:scale-[0.97] transition-transform">Về danh sách</button>
      </div>
    </div>
  )

  // RENDER
  return (
    <div className="min-h-screen bg-[#F7F5F2] flex flex-col" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-[#8B5E3C] text-white px-4 py-3 shadow-md">
        <div className="flex items-center gap-3">
          <button onClick={handleBack} className="p-2 -ml-2 active:scale-90 transition-transform"><ArrowLeft className="w-5 h-5" /></button>
          <div><h1 className="text-base font-bold">Nhập nguyên liệu</h1><p className="text-xs text-white/70">Kho nguyên vật liệu</p></div>
        </div>
      </header>

      {/* STEP INDICATOR */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          {STEPS.map((s, i) => {
            const n = i + 1, active = step === n, done = step > n
            return (
              <React.Fragment key={s}>
                <div className="flex items-center gap-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${done ? 'bg-[#E8A838] text-white' : active ? 'bg-[#8B5E3C] text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {done ? <Check className="w-3.5 h-3.5" /> : n}
                  </div>
                  <span className={`text-[12px] ${active ? 'font-bold text-gray-900' : 'text-gray-400'}`}>{s}</span>
                </div>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1.5 rounded ${done ? 'bg-[#E8A838]' : 'bg-gray-200'}`} />}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2" style={{ animation: 'slideDown 200ms ease-out' }}>
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div><p className="text-sm text-red-700 font-medium">{error}</p><button onClick={() => setError(null)} className="text-xs text-red-500 underline mt-1">Đóng</button></div>
        </div>
      )}

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto pb-24">
        {/* STEP 1: NCC & PO */}
        {step === 1 && (
          <div className="p-4 space-y-5 max-w-lg mx-auto">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5"><WarehouseIcon className="w-4 h-4 text-gray-400" />Kho nhận <span className="text-red-500">*</span></label>
              {loadingWarehouses ? <div className="h-12 bg-gray-100 rounded-xl animate-pulse" /> : (
                <select value={header.warehouse_id} onChange={e => setHeader(h => ({ ...h, warehouse_id: e.target.value }))}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200 bg-white text-[15px] focus:outline-none focus:border-[#E8A838] focus:ring-1 focus:ring-[#E8A838]/20 appearance-none">
                  <option value="">— Chọn kho nhận NVL —</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5"><Building2 className="w-4 h-4 text-gray-400" />Nhà cung cấp <span className="text-red-500">*</span></label>
              {loadingSuppliers ? <div className="h-12 bg-gray-100 rounded-xl animate-pulse" /> : (
                <select value={header.supplier_id} onChange={e => setHeader(h => ({ ...h, supplier_id: e.target.value, purchase_order_id: '' }))}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200 bg-white text-[15px] focus:outline-none focus:border-[#E8A838] focus:ring-1 focus:ring-[#E8A838]/20 appearance-none">
                  <option value="">— Chọn nhà cung cấp —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.code ? `${s.code} — ` : ''}{s.name}</option>)}
                </select>
              )}
              {selSup && (
                <div className="mt-2 p-2.5 bg-blue-50 rounded-lg border border-blue-100">
                  <p className="text-[13px] font-medium text-blue-800">{selSup.name}</p>
                  {selSup.phone && <p className="text-[11px] text-blue-600">📞 {selSup.phone}</p>}
                  {selSup.address && <p className="text-[11px] text-blue-600 mt-0.5">📍 {selSup.address}</p>}
                </div>
              )}
            </div>
            {header.supplier_id && (
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5"><ClipboardList className="w-4 h-4 text-gray-400" />Đơn mua hàng (PO) <span className="text-gray-400 text-xs font-normal">Tùy chọn</span></label>
                {loadingPOs ? <div className="h-12 bg-gray-100 rounded-xl animate-pulse" /> : purchaseOrders.length > 0 ? (
                  <select value={header.purchase_order_id} onChange={e => setHeader(h => ({ ...h, purchase_order_id: e.target.value }))}
                    className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200 bg-white text-[15px] focus:outline-none focus:border-[#E8A838] focus:ring-1 focus:ring-[#E8A838]/20 appearance-none">
                    <option value="">— Không liên kết PO —</option>
                    {purchaseOrders.map(po => <option key={po.id} value={po.id}>{po.code} — {po.status} — {new Date(po.created_at).toLocaleDateString('vi-VN')}</option>)}
                  </select>
                ) : <div className="p-3 bg-gray-50 rounded-xl text-center"><p className="text-sm text-gray-400">Không có PO cho NCC này</p></div>}
              </div>
            )}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5"><FileText className="w-4 h-4 text-gray-400" />Ghi chú</label>
              <textarea value={header.notes} onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))} placeholder="Ghi chú..." rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-[15px] resize-none focus:outline-none focus:border-[#E8A838]" />
            </div>
          </div>
        )}

        {/* STEP 2: CÂN XE */}
        {step === 2 && (
          <div className="p-4 space-y-5 max-w-lg mx-auto">
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <div><p className="text-sm text-blue-700 font-medium">Thông tin cân xe</p><p className="text-xs text-blue-600 mt-0.5">Nhập thông tin cân xe nếu có. Bước này không bắt buộc.</p></div>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5"><Truck className="w-4 h-4 text-gray-400" />Biển số xe</label>
              <input type="text" value={header.vehicle_plate} onChange={e => setHeader(h => ({ ...h, vehicle_plate: e.target.value.toUpperCase() }))} placeholder="VD: 43H-12345"
                className="w-full min-h-[48px] px-4 py-3 rounded-xl border border-gray-200 text-[15px] uppercase tracking-wider focus:outline-none focus:border-[#E8A838] focus:ring-1 focus:ring-[#E8A838]/20"
                style={{ fontFamily: "'JetBrains Mono', monospace" }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5"><Scale className="w-4 h-4 text-gray-400" />Cân L1 (Gross)</label>
                <div className="relative">
                  <input type="number" inputMode="decimal" value={header.gross_weight} onChange={e => setHeader(h => ({ ...h, gross_weight: e.target.value }))} placeholder="0"
                    className="w-full min-h-[48px] px-3 pr-10 py-3 rounded-xl border border-gray-200 text-[15px] focus:outline-none focus:border-[#E8A838] focus:ring-1 focus:ring-[#E8A838]/20"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">kg</span>
                </div><p className="text-[10px] text-gray-400 mt-1">Xe có hàng</p>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5"><Scale className="w-4 h-4 text-gray-400" />Cân L2 (Tare)</label>
                <div className="relative">
                  <input type="number" inputMode="decimal" value={header.tare_weight} onChange={e => setHeader(h => ({ ...h, tare_weight: e.target.value }))} placeholder="0"
                    className="w-full min-h-[48px] px-3 pr-10 py-3 rounded-xl border border-gray-200 text-[15px] focus:outline-none focus:border-[#E8A838] focus:ring-1 focus:ring-[#E8A838]/20"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-gray-400">kg</span>
                </div><p className="text-[10px] text-gray-400 mt-1">Xe không hàng</p>
              </div>
            </div>
            <NetWeightDisplay gross={header.gross_weight} tare={header.tare_weight} />
            {selSup && (
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-xs text-gray-400 mb-1">Nhà cung cấp</p>
                <p className="text-sm font-medium text-gray-800">{selSup.name}</p>
                {header.purchase_order_id && <p className="text-xs text-gray-500 mt-1">PO: {purchaseOrders.find(p => p.id === header.purchase_order_id)?.code}</p>}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: CHI TIẾT NVL */}
        {step === 3 && (
          <div className="p-4 space-y-4 max-w-lg mx-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-700">Chi tiết NVL ({details.length} dòng)</h3>
              <div className="text-xs text-gray-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{totalQty > 0 && `${totalQty} | ${totalWt.toLocaleString('vi-VN')} kg`}</div>
            </div>
            {details.map((item, i) => <DetailCard key={item.tempId} item={item} index={i} onRemove={() => setDetails(p => p.filter(d => d.tempId !== item.tempId))} />)}
            {details.length === 0 && (
              <div className="text-center py-12"><Package className="w-12 h-12 text-gray-200 mx-auto mb-3" /><p className="text-sm text-gray-400 mb-1">Chưa có nguyên liệu nào</p><p className="text-xs text-gray-300">Nhấn nút bên dưới để thêm</p></div>
            )}
            <button type="button" onClick={() => setShowAddForm(true)}
              className="w-full min-h-[48px] flex items-center justify-center gap-2 text-[14px] font-bold text-[#E8A838] rounded-xl border-2 border-dashed border-[#E8A838]/30 bg-[#E8A838]/5 active:scale-[0.97] transition-transform">
              <Plus className="w-4 h-4" />Thêm nguyên liệu
            </button>
            {net > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                <p className="text-xs text-amber-600 font-medium mb-1">Tham khảo cân xe</p>
                <p className="text-sm text-amber-800" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  Net: {net.toLocaleString('vi-VN')} kg
                  {totalWt > 0 && <span className={`ml-2 ${Math.abs(net - totalWt) / net > 0.05 ? 'text-red-600 font-bold' : 'text-emerald-600'}`}>
                    (Chênh: {(net - totalWt).toLocaleString('vi-VN')} kg = {((net - totalWt) / net * 100).toFixed(1)}%)
                  </span>}
                </p>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: XÁC NHẬN */}
        {step === 4 && (
          <div className="p-4 space-y-5 max-w-lg mx-auto">
            <div className="grid grid-cols-3 gap-3">
              {[{ l: 'Số dòng', v: details.length, u: 'nguyên liệu' }, { l: 'Tổng SL', v: totalQty, u: 'đơn vị' }, { l: 'Tổng KL', v: totalWt.toLocaleString('vi-VN'), u: 'kg' }].map(c => (
                <div key={c.l} className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
                  <p className="text-xs text-gray-400 mb-1">{c.l}</p>
                  <p className="text-2xl font-bold text-[#8B5E3C]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{c.v}</p>
                  <p className="text-xs text-gray-400">{c.u}</p>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Kho nhận</span><span className="font-medium text-gray-800">{selWh?.code} — {selWh?.name}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">NCC</span><span className="font-medium text-gray-800">{selSup?.name}</span></div>
              {header.purchase_order_id && <div className="flex justify-between text-sm"><span className="text-gray-500">PO</span><span className="font-medium text-blue-700" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{purchaseOrders.find(p => p.id === header.purchase_order_id)?.code}</span></div>}
              {header.vehicle_plate && <div className="flex justify-between text-sm"><span className="text-gray-500">Xe</span><span className="font-bold text-gray-800 tracking-wider" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{header.vehicle_plate}</span></div>}
              {net > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Cân xe (Net)</span><span className="font-bold text-emerald-700" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{net.toLocaleString('vi-VN')} kg</span></div>}
            </div>
            {hasFail && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div><p className="text-sm text-red-700 font-bold">Có NVL không đạt QC!</p><p className="text-xs text-red-600 mt-0.5">Quay lại bước 3 để sửa.</p></div>
              </div>
            )}
            {net > 0 && totalWt > 0 && (
              <div className={`p-3 rounded-xl border flex items-start gap-2 ${Math.abs(net - totalWt) / net > 0.05 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <Scale className={`w-4 h-4 mt-0.5 shrink-0 ${Math.abs(net - totalWt) / net > 0.05 ? 'text-amber-500' : 'text-emerald-500'}`} />
                <div>
                  <p className={`text-sm font-medium ${Math.abs(net - totalWt) / net > 0.05 ? 'text-amber-700' : 'text-emerald-700'}`}>So sánh cân xe vs chi tiết</p>
                  <p className="text-xs mt-0.5" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Cân xe: {net.toLocaleString('vi-VN')} kg | Chi tiết: {totalWt.toLocaleString('vi-VN')} kg | Chênh: {Math.abs(net - totalWt).toLocaleString('vi-VN')} kg ({((net - totalWt) / net * 100).toFixed(1)}%)</p>
                </div>
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-2">Chi tiết ({details.length} dòng)</h3>
              <div className="space-y-2">
                {details.map(item => (
                  <div key={item.tempId} className="bg-white rounded-lg border border-gray-100 p-3 flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-gray-900">{item.material?.name}</p>
                      <p className="text-[12px] text-gray-500" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {item.quantity} {item.material?.unit}{item.drc_value ? ` · DRC ${item.drc_value.toFixed(1)}%` : ''}{item.location ? ` · ${item.location.code}` : ''}
                      </p>
                    </div>
                    {item.qc_result ? <QCBadge result={item.qc_result} /> : <span className="text-[11px] text-gray-300">—</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM ACTION BAR */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-20"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="max-w-lg mx-auto px-4 py-3 flex gap-3">
          {step === 1 && (<>
            <button onClick={() => navigate('/wms/raw-material')} className="flex-1 min-h-[48px] text-[14px] font-medium text-gray-600 rounded-xl border border-gray-200 active:scale-[0.97] transition-transform">Hủy</button>
            <button onClick={handleNext} disabled={!v1()} className={`flex-[2] min-h-[48px] inline-flex items-center justify-center gap-2 text-[14px] font-bold text-white rounded-xl active:scale-[0.97] transition-transform ${v1() ? 'bg-[#E8A838]' : 'bg-gray-300 cursor-not-allowed'}`}>Tiếp theo <ArrowRight className="w-4 h-4" /></button>
          </>)}
          {step === 2 && (<>
            <button onClick={handleBack} className="min-h-[48px] px-4 text-[14px] font-medium text-gray-600 rounded-xl border border-gray-200 active:scale-[0.97] transition-transform"><ArrowLeft className="w-4 h-4" /></button>
            <button onClick={handleNext} className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 text-[14px] font-bold text-white rounded-xl bg-[#E8A838] active:scale-[0.97] transition-transform">
              {header.vehicle_plate || header.gross_weight ? 'Tiếp theo' : 'Bỏ qua'} <ArrowRight className="w-4 h-4" />
            </button>
          </>)}
          {step === 3 && (<>
            <button onClick={handleBack} className="min-h-[48px] px-4 text-[14px] font-medium text-gray-600 rounded-xl border border-gray-200 active:scale-[0.97] transition-transform"><ArrowLeft className="w-4 h-4" /></button>
            <button onClick={handleSaveDraft} disabled={saving || details.length === 0} className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 text-[14px] font-medium text-gray-700 rounded-xl border border-gray-200 active:scale-[0.97] transition-transform"><Save className="w-4 h-4" />Lưu nháp</button>
            <button onClick={handleNext} disabled={!v3()} className={`flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 text-[14px] font-bold text-white rounded-xl active:scale-[0.97] transition-transform ${v3() ? 'bg-[#E8A838]' : 'bg-gray-300 cursor-not-allowed'}`}>Xem lại <ArrowRight className="w-4 h-4" /></button>
          </>)}
          {step === 4 && (<>
            <button onClick={handleBack} className="min-h-[48px] px-4 text-[14px] font-medium text-gray-600 rounded-xl border border-gray-200 active:scale-[0.97] transition-transform"><ArrowLeft className="w-4 h-4" /></button>
            <button onClick={handleSaveDraft} disabled={saving} className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 text-[14px] font-medium text-gray-700 rounded-xl border border-gray-200 active:scale-[0.97] transition-transform">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Lưu nháp
            </button>
            <button onClick={handleConfirm} disabled={saving || hasFail}
              className={`flex-[1.5] min-h-[48px] inline-flex items-center justify-center gap-2 text-[14px] font-bold text-white rounded-xl active:scale-[0.97] transition-transform ${saving || hasFail ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#E8A838] shadow-[0_2px_8px_rgba(232,168,56,0.3)]'}`}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? 'Đang xử lý...' : 'Xác nhận nhập kho'}
            </button>
          </>)}
        </div>
      </div>

      {/* ADD DETAIL BOTTOM SHEET */}
      {showAddForm && <AddDetailForm warehouseId={header.warehouse_id} onSubmit={item => { setDetails(p => [...p, item]); setShowAddForm(false) }} onCancel={() => setShowAddForm(false)} />}

      {/* ANIMATIONS */}
      <style>{`
        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}

export default RawMaterialIntakeCreatePage