// ============================================================================
// FILE: src/pages/wms/stock-out/StockOutCreatePage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P4 — Bước 4.5 — Form tạo phiếu xuất kho (Step Wizard 3 bước)
// ============================================================================
// KẾT NỐI SUPABASE THẬT — không dùng mock data
// Design: Industrial Mobile-First (WMS_UI_DESIGN_GUIDE.md)
// ============================================================================
// LUỒNG MỚI:
//   Step 1: Chọn kho + Lý do xuất + Khách hàng
//   Step 2: Xem hàng tồn trong kho → chọn lô, vị trí, số lượng
//           Hỗ trợ lô passed + warning + needs_blend (cho phối trộn / bán DRC thấp)
//   Step 3: Xem lại tổng hợp → Lưu nháp / Xác nhận xuất
// ============================================================================

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  X,
  Package,
  Warehouse as WarehouseIcon,
  MapPin,
  FlaskConical,
  Scale,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CircleCheck,
  CircleX,
  Trash2,
  Save,
  Loader2,
  Tag,
  Users,
  ShoppingCart,
  ArrowRightLeft,
  Beaker,
  SlidersHorizontal,
  RotateCcw,
  Search,
  Info,
  Filter,
  Layers,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface WarehouseOption {
  id: string
  code: string
  name: string
  type: string
}

/** Lô hàng tồn trong kho — từ stock_batches */
interface BatchStock {
  id: string
  batch_no: string
  material_id: string
  material_sku: string
  material_name: string
  material_unit: string
  weight_per_unit: number | null
  warehouse_id: string
  location_id: string | null
  location_code: string | null
  location_shelf: string | null
  location_row: string | null
  location_col: string | null
  quantity_remaining: number
  initial_drc: number | null
  latest_drc: number | null
  qc_status: string       // passed | warning | failed | needs_blend | pending
  received_date: string
  status: string
}

/** Dòng chi tiết xuất (user chọn) */
interface OutItem {
  tempId: string
  batch_id: string
  batch_no: string
  material_id: string
  material_name: string
  material_sku: string
  material_unit: string
  weight_per_unit: number | null
  location_id: string | null
  location_code: string | null
  quantity: number        // SL xuất
  max_quantity: number    // SL tối đa (quantity_remaining)
  weight: number
  latest_drc: number | null
  qc_status: string
}

type StockOutReason = 'sale' | 'production' | 'transfer' | 'blend' | 'adjust' | 'return'

interface FormHeader {
  warehouse_id: string
  reason: StockOutReason
  customer_name: string
  customer_order_ref: string
  notes: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const REASONS: { value: StockOutReason; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'sale', label: 'Bán hàng', icon: <ShoppingCart className="w-4 h-4" />, desc: 'Xuất bán cho khách' },
  { value: 'transfer', label: 'Chuyển kho', icon: <ArrowRightLeft className="w-4 h-4" />, desc: 'Chuyển sang kho khác' },
  { value: 'blend', label: 'Phối trộn', icon: <Beaker className="w-4 h-4" />, desc: 'Đưa đi phối trộn DRC' },
  { value: 'adjust', label: 'Điều chỉnh', icon: <SlidersHorizontal className="w-4 h-4" />, desc: 'Điều chỉnh tồn kho' },
  { value: 'return', label: 'Trả hàng', icon: <RotateCcw className="w-4 h-4" />, desc: 'Trả lại NCC/SX' },
]

const QC_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  passed:      { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Đạt' },
  warning:     { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   label: 'Cảnh báo' },
  failed:      { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',     label: 'Không đạt' },
  needs_blend: { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200',  label: 'Cần phối trộn' },
  pending:     { bg: 'bg-gray-50',    text: 'text-gray-500',    border: 'border-gray-200',    label: 'Chờ QC' },
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Badge QC status */
const QCBadge: React.FC<{ status: string; size?: 'sm' | 'md' }> = ({ status, size = 'sm' }) => {
  const style = QC_COLORS[status] || QC_COLORS.pending
  const cls = size === 'sm'
    ? `text-[11px] px-2 py-0.5 rounded-full font-semibold border ${style.bg} ${style.text} ${style.border}`
    : `text-[13px] px-3 py-1 rounded-full font-semibold border ${style.bg} ${style.text} ${style.border}`
  return <span className={cls}>{style.label}</span>
}

/** Step indicator — 3 bước */
const StepBar: React.FC<{ step: number; steps: string[] }> = ({ step, steps }) => (
  <div className="flex items-center gap-1 px-4 py-3">
    {steps.map((label, i) => {
      const num = i + 1
      const isActive = num === step
      const isDone = num < step
      return (
        <React.Fragment key={i}>
          {i > 0 && (
            <div className={`flex-1 h-0.5 ${isDone ? 'bg-[#2D8B6E]' : 'bg-gray-200'}`} />
          )}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className={`
              w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold
              ${isDone ? 'bg-[#2D8B6E] text-white' : isActive ? 'bg-[#1B4D3E] text-white' : 'bg-gray-200 text-gray-400'}
            `}>
              {isDone ? <Check className="w-3.5 h-3.5" /> : num}
            </div>
            <span className={`text-[12px] font-medium ${isActive ? 'text-[#1B4D3E]' : isDone ? 'text-[#2D8B6E]' : 'text-gray-400'}`}>
              {label}
            </span>
          </div>
        </React.Fragment>
      )
    })}
  </div>
)

/** Card hiển thị 1 lô hàng tồn — để user tap chọn */
const BatchCard: React.FC<{
  batch: BatchStock
  isSelected: boolean
  onTap: () => void
}> = ({ batch, isSelected, onTap }) => {
  const qcStyle = QC_COLORS[batch.qc_status] || QC_COLORS.pending
  const locationStr = batch.location_code
    ? `${batch.location_code}${batch.location_shelf ? ` · Kệ ${batch.location_shelf}` : ''}${batch.location_row ? ` · ${batch.location_row}` : ''}`
    : 'Chưa gán vị trí'

  return (
    <button
      type="button"
      onClick={onTap}
      className={`
        w-full text-left p-3.5 rounded-xl border-2 transition-all active:scale-[0.98]
        ${isSelected
          ? 'border-[#2D8B6E] bg-[#2D8B6E]/5 ring-1 ring-[#2D8B6E]/20'
          : 'border-gray-200 bg-white hover:border-gray-300'}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Batch no + QC badge */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[13px] font-bold text-gray-900"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {batch.batch_no}
            </span>
            <QCBadge status={batch.qc_status} />
          </div>

          {/* Material */}
          <p className="text-[13px] text-gray-700 font-medium truncate">
            {batch.material_sku} — {batch.material_name}
          </p>

          {/* Location */}
          <div className="flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
            <span className="text-[12px] text-gray-500 truncate">{locationStr}</span>
          </div>
        </div>

        {/* Quantity + DRC */}
        <div className="text-right shrink-0">
          <p className="text-[15px] font-bold text-[#1B4D3E]"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {batch.quantity_remaining.toLocaleString('vi-VN')}
          </p>
          <p className="text-[11px] text-gray-500">{batch.material_unit}</p>
          {batch.latest_drc != null && (
            <p className="text-[11px] text-gray-400 mt-0.5"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              DRC {batch.latest_drc.toFixed(1)}%
            </p>
          )}
        </div>
      </div>

      {isSelected && (
        <div className="mt-2 pt-2 border-t border-[#2D8B6E]/20 flex items-center gap-1">
          <CircleCheck className="w-4 h-4 text-[#2D8B6E]" />
          <span className="text-[12px] font-medium text-[#2D8B6E]">Đã chọn</span>
        </div>
      )}
    </button>
  )
}

/** Card hiển thị dòng chi tiết xuất đã thêm */
const OutItemCard: React.FC<{
  item: OutItem
  onChangeQty: (tempId: string, qty: number) => void
  onRemove: (tempId: string) => void
}> = ({ item, onChangeQty, onRemove }) => {
  const qcStyle = QC_COLORS[item.qc_status] || QC_COLORS.pending
  const isWarning = item.qc_status === 'warning' || item.qc_status === 'needs_blend' || item.qc_status === 'failed' || item.qc_status === 'pending'

  return (
    <div className={`
      p-3.5 rounded-xl border bg-white
      ${isWarning ? `border-l-4 ${qcStyle.border}` : 'border-gray-200'}
    `}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[13px] font-bold text-gray-900"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {item.batch_no}
            </span>
            <QCBadge status={item.qc_status} />
          </div>
          <p className="text-[12px] text-gray-600 truncate">{item.material_sku} — {item.material_name}</p>
          {item.location_code && (
            <div className="flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-gray-400" />
              <span className="text-[11px] text-gray-500">{item.location_code}</span>
            </div>
          )}
          {item.latest_drc != null && (
            <p className="text-[11px] text-gray-400 mt-0.5">DRC: {item.latest_drc.toFixed(1)}%</p>
          )}
        </div>

        <button type="button" onClick={() => onRemove(item.tempId)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 active:scale-90">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Quantity input */}
      <div className="mt-2.5 flex items-center gap-3">
        <label className="text-[12px] text-gray-500 shrink-0">SL xuất:</label>
        <input
          type="number"
          inputMode="numeric"
          value={item.quantity || ''}
          onChange={e => {
            const val = Math.min(Number(e.target.value) || 0, item.max_quantity)
            onChangeQty(item.tempId, val)
          }}
          placeholder="0"
          className="flex-1 min-h-[40px] px-3 py-2 rounded-lg border border-gray-200 text-[14px]
            focus:outline-none focus:border-[#2D8B6E] text-right"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        />
        <span className="text-[12px] text-gray-500 shrink-0 w-12">
          / {item.max_quantity.toLocaleString('vi-VN')}
        </span>
      </div>

      {item.weight > 0 && (
        <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
          <Scale className="w-3 h-3" />
          Ước tính: {item.weight.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg
        </p>
      )}

      {/* Cảnh báo nếu không đạt QC */}
      {isWarning && (
        <div className={`mt-2 flex items-start gap-1.5 px-2.5 py-2 rounded-lg ${qcStyle.bg}`}>
          <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${qcStyle.text}`} />
          <span className={`text-[11px] ${qcStyle.text}`}>
            {item.qc_status === 'failed' && 'Lô không đạt QC — chỉ xuất để phối trộn hoặc bán cho khách chấp nhận DRC thấp'}
            {item.qc_status === 'warning' && 'Lô cảnh báo DRC — kiểm tra trước khi xuất'}
            {item.qc_status === 'needs_blend' && 'Lô cần phối trộn — nên kết hợp với lô DRC cao hơn'}
            {item.qc_status === 'pending' && 'Lô chưa kiểm tra QC — nên QC trước khi xuất'}
          </span>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const StockOutCreatePage: React.FC = () => {
  const navigate = useNavigate()

  // Step wizard
  const [step, setStep] = useState(1)
  const STEPS = ['Chọn kho', 'Chọn hàng', 'Xác nhận']

  // Step 1: Header
  const [header, setHeader] = useState<FormHeader>({
    warehouse_id: '',
    reason: 'sale',
    customer_name: '',
    customer_order_ref: '',
    notes: '',
  })

  // Step 2: Stock in warehouse + selected items
  const [batchStocks, setBatchStocks] = useState<BatchStock[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [outItems, setOutItems] = useState<OutItem[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)

  // Filters for Step 2
  const [searchText, setSearchText] = useState('')
  const [filterQC, setFilterQC] = useState<string>('all')  // all | passed | warning | failed | needs_blend
  const [filterMaterial, setFilterMaterial] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(true)

  // Data loading
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const [loadingWarehouses, setLoadingWarehouses] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)  // employee.id (not auth uid)

  // Submission
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successCode, setSuccessCode] = useState<string | null>(null)

  // ========================================================================
  // LOAD DATA
  // ========================================================================

  // Load current user → resolve employee.id from auth.user.id
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Tìm employee.id từ user_id (auth UUID)
      const { data: emp, error: empErr } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!empErr && emp) {
        setCurrentUserId(emp.id)
        console.log('[StockOut] Employee ID:', emp.id, '(from auth:', user.id, ')')
      } else {
        // Fallback: nếu không tìm thấy employee, thử dùng auth uid
        // (chỉ hoạt động nếu FK cho phép hoặc không có FK)
        console.warn('[StockOut] Employee not found for auth user:', user.id, empErr)
        setCurrentUserId(user.id)
      }
    }
    getUser()
  }, [])

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

  // Load batch stocks when warehouse changes
  const loadBatchStocks = useCallback(async (warehouseId: string) => {
    if (!warehouseId) return
    setLoadingBatches(true)
    try {
      // DEBUG: Query 1 — tìm TẤT CẢ batches trong warehouse (không filter status)
      const { data: allBatches, error: debugErr } = await supabase
        .from('stock_batches')
        .select('id, batch_no, warehouse_id, status, qc_status, quantity_remaining, location_id')
        .eq('warehouse_id', warehouseId)

      console.log('[StockOut] DEBUG all batches in warehouse:', warehouseId, allBatches)

      // Query chính: active + quantity > 0
      const { data, error: err } = await supabase
        .from('stock_batches')
        .select(`
          id, batch_no, material_id, warehouse_id, location_id,
          quantity_remaining, initial_drc, latest_drc, qc_status,
          received_date, status,
          material:materials(id, sku, name, unit, weight_per_unit),
          location:warehouse_locations(id, code, shelf, row_name, column_name)
        `)
        .eq('warehouse_id', warehouseId)
        .eq('status', 'active')
        .gt('quantity_remaining', 0)
        .order('received_date', { ascending: true })  // FIFO

      if (err) throw err

      console.log('[StockOut] Filtered batches (active, qty>0):', data?.length, data)

      const mapped: BatchStock[] = (data || []).map((row: any) => ({
        id: row.id,
        batch_no: row.batch_no,
        material_id: row.material_id,
        material_sku: row.material?.sku || '',
        material_name: row.material?.name || '',
        material_unit: row.material?.unit || 'bành',
        weight_per_unit: row.material?.weight_per_unit || null,
        warehouse_id: row.warehouse_id,
        location_id: row.location?.id || null,
        location_code: row.location?.code || null,
        location_shelf: row.location?.shelf || null,
        location_row: row.location?.row_name || null,
        location_col: row.location?.column_name || null,
        quantity_remaining: row.quantity_remaining,
        initial_drc: row.initial_drc,
        latest_drc: row.latest_drc,
        qc_status: row.qc_status,
        received_date: row.received_date,
        status: row.status,
      }))

      setBatchStocks(mapped)

      // Debug: nếu có batch trong warehouse nhưng mapped = 0
      if (mapped.length === 0 && allBatches && allBatches.length > 0) {
        console.warn('[StockOut] ⚠️ Batches exist but none matched filters!', {
          allBatchStatuses: allBatches.map(b => ({ id: b.id, status: b.status, qc: b.qc_status, qty: b.quantity_remaining })),
          query: 'status=active AND quantity_remaining > 0',
        })
      }
    } catch (e) {
      console.error('Lỗi load tồn kho:', e)
      setBatchStocks([])
    } finally {
      setLoadingBatches(false)
    }
  }, [])

  // When warehouse changes in Step 1, preload batches
  useEffect(() => {
    if (header.warehouse_id) {
      loadBatchStocks(header.warehouse_id)
    } else {
      setBatchStocks([])
    }
  }, [header.warehouse_id, loadBatchStocks])

  // ========================================================================
  // DERIVED
  // ========================================================================

  const selectedWarehouse = warehouses.find(w => w.id === header.warehouse_id)

  // Unique materials for filter dropdown
  const materialOptions = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>()
    batchStocks.forEach(b => {
      if (!map.has(b.material_id)) {
        map.set(b.material_id, { id: b.material_id, label: `${b.material_sku} — ${b.material_name}` })
      }
    })
    return Array.from(map.values())
  }, [batchStocks])

  // Filtered batch list
  const filteredBatches = useMemo(() => {
    let list = batchStocks

    // Exclude batches already added to outItems
    const addedBatchIds = new Set(outItems.map(i => i.batch_id))
    list = list.filter(b => !addedBatchIds.has(b.id))

    // QC filter
    if (filterQC !== 'all') {
      list = list.filter(b => b.qc_status === filterQC)
    }
    // Không loại trừ pending — hiển thị tất cả để user thấy, chỉ cảnh báo khi xuất

    // Debug
    console.log('[StockOut] Filter:', { filterQC, filterMaterial, searchText, total: batchStocks.length, afterExclude: list.length })

    // Material filter
    if (filterMaterial !== 'all') {
      list = list.filter(b => b.material_id === filterMaterial)
    }

    // Search
    if (searchText.trim()) {
      const term = searchText.toLowerCase().trim()
      list = list.filter(b =>
        b.batch_no.toLowerCase().includes(term) ||
        b.material_name.toLowerCase().includes(term) ||
        b.material_sku.toLowerCase().includes(term) ||
        (b.location_code || '').toLowerCase().includes(term)
      )
    }

    return list
  }, [batchStocks, outItems, filterQC, filterMaterial, searchText])

  // Totals
  const totalQty = useMemo(() => outItems.reduce((s, i) => s + i.quantity, 0), [outItems])
  const totalWeight = useMemo(() => outItems.reduce((s, i) => s + i.weight, 0), [outItems])
  const hasNonPassedItems = outItems.some(i => i.qc_status !== 'passed')

  // Cảnh báo cho lô pending (chưa QC)
  const hasPendingItems = outItems.some(i => i.qc_status === 'pending')

  // ========================================================================
  // HANDLERS
  // ========================================================================

  // Validation
  const validateStep1 = (): boolean => !!header.warehouse_id
  const validateStep2 = (): boolean => outItems.length > 0 && outItems.every(i => i.quantity > 0)

  // Navigation
  const handleNext = () => {
    setError(null)
    if (step === 1 && validateStep1()) setStep(2)
    else if (step === 2 && validateStep2()) setStep(3)
  }

  const handleBack = () => {
    setError(null)
    if (step > 1) setStep(step - 1)
    else navigate('/wms/stock-out')
  }

  // Add batch to outItems
  const handleAddBatch = (batch: BatchStock) => {
    // Nếu đã thêm rồi thì bỏ qua
    if (outItems.some(i => i.batch_id === batch.id)) return

    const defaultQty = batch.quantity_remaining
    const weight = batch.weight_per_unit
      ? defaultQty * batch.weight_per_unit
      : 0

    const newItem: OutItem = {
      tempId: `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      batch_id: batch.id,
      batch_no: batch.batch_no,
      material_id: batch.material_id,
      material_name: batch.material_name,
      material_sku: batch.material_sku,
      material_unit: batch.material_unit,
      weight_per_unit: batch.weight_per_unit,
      location_id: batch.location_id,
      location_code: batch.location_code,
      quantity: defaultQty,
      max_quantity: batch.quantity_remaining,
      weight,
      latest_drc: batch.latest_drc,
      qc_status: batch.qc_status,
    }

    setOutItems(prev => [...prev, newItem])
    setSelectedBatchId(null) // reset selection
  }

  // Change quantity of an out item
  const handleChangeQty = (tempId: string, qty: number) => {
    setOutItems(prev => prev.map(i => {
      if (i.tempId !== tempId) return i
      const weight = i.weight_per_unit ? qty * i.weight_per_unit : 0
      return { ...i, quantity: qty, weight }
    }))
  }

  // Remove out item
  const handleRemoveItem = (tempId: string) => {
    setOutItems(prev => prev.filter(i => i.tempId !== tempId))
  }

  // ========================================================================
  // SAVE / CONFIRM
  // ========================================================================

  /** Tạo mã phiếu xuất: XK-TP-YYYYMMDD-XXX */
  const generateCode = async (): Promise<string> => {
    const now = new Date()
    const yyyy = String(now.getFullYear())
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const prefix = `XK-TP-${yyyy}${mm}${dd}`

    const { data, error: err } = await supabase
      .from('stock_out_orders')
      .select('code')
      .like('code', `${prefix}-%`)
      .order('code', { ascending: false })
      .limit(1)

    if (err) throw err

    let seq = 1
    if (data && data.length > 0) {
      const lastSeq = parseInt(data[0].code.split('-').pop() || '0', 10)
      seq = lastSeq + 1
    }

    return `${prefix}-${String(seq).padStart(3, '0')}`
  }

  /** Lưu nháp */
  const handleSaveDraft = async () => {
    if (!currentUserId) {
      setError('Chưa xác định được người dùng đang đăng nhập')
      return
    }
    setSaving(true)
    setError(null)

    try {
      const code = await generateCode()

      // 1. Tạo header
      const { data: order, error: hErr } = await supabase
        .from('stock_out_orders')
        .insert({
          code,
          type: 'finished',
          warehouse_id: header.warehouse_id,
          reason: header.reason,
          customer_name: header.customer_name || null,
          customer_order_ref: header.customer_order_ref || null,
          total_quantity: totalQty,
          total_weight: totalWeight > 0 ? totalWeight : null,
          status: 'draft',
          notes: header.notes || null,
          created_by: currentUserId,
        })
        .select('id, code')
        .single()

      if (hErr) throw hErr

      // 2. Thêm details
      const details = outItems.map(item => ({
        stock_out_id: order.id,
        material_id: item.material_id,
        batch_id: item.batch_id,
        location_id: item.location_id || null,
        quantity: item.quantity,
        weight: item.weight > 0 ? item.weight : null,
        picking_status: 'pending',
      }))

      const { error: dErr } = await supabase
        .from('stock_out_details')
        .insert(details)

      if (dErr) throw dErr

      setSuccessCode(order.code)
      setTimeout(() => navigate('/wms/stock-out'), 1500)
    } catch (err: any) {
      console.error('Lỗi lưu nháp:', err)
      setError(err.message || 'Có lỗi xảy ra khi lưu phiếu')
    } finally {
      setSaving(false)
    }
  }

  /** Xác nhận xuất kho (tạo + confirm luôn) */
  const handleConfirm = async () => {
    if (!currentUserId) {
      setError('Chưa xác định được người dùng đang đăng nhập')
      return
    }
    setSaving(true)
    setError(null)

    try {
      const code = await generateCode()

      // 1. Tạo header
      const { data: order, error: hErr } = await supabase
        .from('stock_out_orders')
        .insert({
          code,
          type: 'finished',
          warehouse_id: header.warehouse_id,
          reason: header.reason,
          customer_name: header.customer_name || null,
          customer_order_ref: header.customer_order_ref || null,
          total_quantity: totalQty,
          total_weight: totalWeight > 0 ? totalWeight : null,
          status: 'confirmed',
          notes: header.notes || null,
          created_by: currentUserId,
          confirmed_by: currentUserId,
          confirmed_at: new Date().toISOString(),
        })
        .select('id, code')
        .single()

      if (hErr) throw hErr

      // 2. Thêm details (đã picked)
      const details = outItems.map(item => ({
        stock_out_id: order.id,
        material_id: item.material_id,
        batch_id: item.batch_id,
        location_id: item.location_id || null,
        quantity: item.quantity,
        weight: item.weight > 0 ? item.weight : null,
        picking_status: 'picked',
        picked_at: new Date().toISOString(),
        picked_by: currentUserId,
      }))

      const { error: dErr } = await supabase
        .from('stock_out_details')
        .insert(details)

      if (dErr) throw dErr

      // 3. Cập nhật stock_batches, stock_levels, inventory_transactions
      for (const item of outItems) {
        // 3a. Giảm quantity_remaining trong stock_batches
        const { data: batch, error: bErr } = await supabase
          .from('stock_batches')
          .select('quantity_remaining')
          .eq('id', item.batch_id)
          .single()

        if (bErr) throw bErr

        const newQty = batch.quantity_remaining - item.quantity
        const updateData: Record<string, any> = {
          quantity_remaining: newQty,
          updated_at: new Date().toISOString(),
        }
        if (newQty <= 0) updateData.status = 'depleted'

        const { error: uErr } = await supabase
          .from('stock_batches')
          .update(updateData)
          .eq('id', item.batch_id)

        if (uErr) throw uErr

        // 3b. Giảm stock_levels
        const { data: sl, error: slErr } = await supabase
          .from('stock_levels')
          .select('id, quantity')
          .eq('material_id', item.material_id)
          .eq('warehouse_id', header.warehouse_id)
          .maybeSingle()

        if (slErr) throw slErr

        if (sl) {
          const { error: slUpErr } = await supabase
            .from('stock_levels')
            .update({
              quantity: sl.quantity - item.quantity,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sl.id)

          if (slUpErr) throw slUpErr
        }

        // 3c. Giảm warehouse_locations.current_quantity (nếu có location)
        if (item.location_id) {
          const { data: loc, error: locErr } = await supabase
            .from('warehouse_locations')
            .select('id, current_quantity')
            .eq('id', item.location_id)
            .maybeSingle()

          if (!locErr && loc) {
            await supabase
              .from('warehouse_locations')
              .update({
                current_quantity: Math.max(0, loc.current_quantity - item.quantity),
              })
              .eq('id', loc.id)
          }
        }

        // 3d. Insert inventory_transactions
        const { error: txErr } = await supabase
          .from('inventory_transactions')
          .insert({
            material_id: item.material_id,
            warehouse_id: header.warehouse_id,
            batch_id: item.batch_id,
            type: 'out',
            quantity: -item.quantity,
            reference_type: 'stock_out',
            reference_id: order.id,
            notes: `Xuất kho: ${code}`,
            created_by: currentUserId,
          })

        if (txErr) throw txErr
      }

      setSuccessCode(order.code)
      setTimeout(() => navigate('/wms/stock-out'), 1500)
    } catch (err: any) {
      console.error('Lỗi xác nhận xuất kho:', err)
      setError(err.message || 'Có lỗi xảy ra khi xác nhận xuất kho')
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
          <p className="text-gray-600 text-sm mb-1">Phiếu xuất kho đã được tạo</p>
          <p className="font-bold text-[#1B4D3E] text-lg mb-6"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {successCode}
          </p>
          <button
            onClick={() => navigate('/wms/stock-out')}
            className="w-full min-h-[48px] bg-[#2D8B6E] text-white font-bold rounded-xl
              active:scale-[0.97] transition-transform"
          >
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
    <div
      className="min-h-screen bg-[#F7F5F2] flex flex-col"
      style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}
    >
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-[#1B4D3E] text-white safe-top">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={handleBack}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 active:bg-white/20">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-[16px] font-bold">Tạo phiếu xuất kho</h1>
            {selectedWarehouse && (
              <p className="text-[12px] text-white/70">Kho: {selectedWarehouse.code} — {selectedWarehouse.name}</p>
            )}
          </div>
          {outItems.length > 0 && (
            <div className="bg-white/20 rounded-lg px-2.5 py-1 text-center">
              <p className="text-[14px] font-bold"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {outItems.length}
              </p>
              <p className="text-[10px] text-white/70">dòng</p>
            </div>
          )}
        </div>
        <StepBar step={step} steps={STEPS} />
      </header>

      {/* ERROR */}
      {error && (
        <div className="mx-4 mt-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2">
          <CircleX className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-[13px] text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4 text-red-400" />
          </button>
        </div>
      )}

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto pb-32">

        {/* ================================================================ */}
        {/* STEP 1: CHỌN KHO + LÝ DO */}
        {/* ================================================================ */}
        {step === 1 && (
          <div className="p-4 space-y-5">
            {/* Warehouse selection */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">
                <WarehouseIcon className="w-4 h-4 text-gray-400" />
                Chọn kho xuất <span className="text-red-500">*</span>
              </label>

              {loadingWarehouses ? (
                <div className="flex items-center gap-2 py-8 justify-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Đang tải danh sách kho...</span>
                </div>
              ) : (
                <div className="grid gap-2.5">
                  {warehouses.map(w => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => setHeader(h => ({ ...h, warehouse_id: w.id }))}
                      className={`
                        flex items-center gap-3 p-4 rounded-xl border-2 transition-all
                        active:scale-[0.98]
                        ${header.warehouse_id === w.id
                          ? 'border-[#2D8B6E] bg-[#2D8B6E]/5 ring-1 ring-[#2D8B6E]/20'
                          : 'border-gray-200 bg-white'}
                      `}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        header.warehouse_id === w.id ? 'bg-[#2D8B6E]/10' : 'bg-gray-50'
                      }`}>
                        <WarehouseIcon className={`w-5 h-5 ${
                          header.warehouse_id === w.id ? 'text-[#2D8B6E]' : 'text-gray-400'
                        }`} />
                      </div>
                      <div className="flex-1 text-left">
                        <p className={`text-[14px] font-bold ${
                          header.warehouse_id === w.id ? 'text-[#1B4D3E]' : 'text-gray-800'
                        }`}>
                          {w.code}
                        </p>
                        <p className="text-[12px] text-gray-500">{w.name}</p>
                      </div>
                      {header.warehouse_id === w.id && (
                        <CircleCheck className="w-5 h-5 text-[#2D8B6E]" />
                      )}
                      {/* Hiển thị tổng lô tồn nếu đã load */}
                      {header.warehouse_id === w.id && batchStocks.length > 0 && (
                        <div className="bg-[#2D8B6E]/10 rounded-lg px-2 py-1">
                          <p className="text-[12px] font-bold text-[#1B4D3E]"
                            style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            {batchStocks.length} lô
                          </p>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">
                <Tag className="w-4 h-4 text-gray-400" />
                Lý do xuất
              </label>
              <div className="grid grid-cols-3 gap-2">
                {REASONS.map(r => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setHeader(h => ({ ...h, reason: r.value }))}
                    className={`
                      min-h-[56px] px-3 py-2.5 rounded-xl border-2
                      flex flex-col items-center justify-center gap-1
                      text-[12px] font-medium
                      active:scale-[0.95] transition-all
                      ${header.reason === r.value
                        ? 'border-[#2D8B6E] bg-[#2D8B6E]/5 text-[#1B4D3E]'
                        : 'border-gray-200 bg-white text-gray-600'}
                    `}
                  >
                    {r.icon}
                    <span>{r.label}</span>
                  </button>
                ))}
              </div>
              {/* Hint cho phối trộn */}
              {header.reason === 'blend' && (
                <div className="mt-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200 flex items-start gap-2">
                  <Info className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                  <span className="text-[12px] text-purple-700">
                    Khi xuất phối trộn, bạn có thể chọn cả lô không đạt QC hoặc cần phối trộn
                  </span>
                </div>
              )}
            </div>

            {/* Customer info (only for sale) */}
            {(header.reason === 'sale') && (
              <div className="space-y-3">
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                    <Users className="w-4 h-4 text-gray-400" />
                    Khách hàng
                  </label>
                  <input
                    type="text"
                    value={header.customer_name}
                    onChange={e => setHeader(h => ({ ...h, customer_name: e.target.value }))}
                    placeholder="Tên khách hàng..."
                    className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-gray-200
                      text-[15px] bg-white focus:outline-none focus:border-[#2D8B6E]"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                    <FileText className="w-4 h-4 text-gray-400" />
                    Số đơn hàng / Ref
                  </label>
                  <input
                    type="text"
                    value={header.customer_order_ref}
                    onChange={e => setHeader(h => ({ ...h, customer_order_ref: e.target.value }))}
                    placeholder="PO-2026-..."
                    className="w-full min-h-[44px] px-4 py-3 rounded-xl border border-gray-200
                      text-[15px] bg-white focus:outline-none focus:border-[#2D8B6E]"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  />
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-1.5">
                <FileText className="w-4 h-4 text-gray-400" />
                Ghi chú
              </label>
              <textarea
                value={header.notes}
                onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))}
                placeholder="Ghi chú thêm..."
                rows={2}
                className="w-full px-4 py-3 rounded-xl border border-gray-200
                  text-[15px] bg-white focus:outline-none focus:border-[#2D8B6E] resize-none"
              />
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 2: CHỌN HÀNG TỒN KHO */}
        {/* ================================================================ */}
        {step === 2 && (
          <div className="space-y-0">
            {/* Kho đã chọn — compact info */}
            <div className="bg-white border-b border-gray-100 px-4 py-2.5 flex items-center gap-2">
              <WarehouseIcon className="w-4 h-4 text-[#2D8B6E]" />
              <span className="text-[13px] font-medium text-[#1B4D3E]">
                {selectedWarehouse?.code} — {selectedWarehouse?.name}
              </span>
              <span className="ml-auto text-[12px] text-gray-400"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {batchStocks.length} lô tồn
              </span>
            </div>

            {/* Search + filter bar */}
            <div className="bg-white px-4 py-3 border-b border-gray-100 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    placeholder="Tìm mã lô, sản phẩm, vị trí..."
                    className="w-full min-h-[40px] pl-9 pr-4 rounded-lg border border-gray-200
                      text-[14px] focus:outline-none focus:border-[#2D8B6E]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className={`
                    w-10 h-10 flex items-center justify-center rounded-lg border
                    ${showFilters ? 'border-[#2D8B6E] bg-[#2D8B6E]/5 text-[#2D8B6E]' : 'border-gray-200 text-gray-400'}
                  `}
                >
                  <Filter className="w-4 h-4" />
                </button>
              </div>

              {/* Expandable filters */}
              {showFilters && (
                <div className="flex flex-wrap gap-2">
                  {/* QC filter chips */}
                  {['all', 'passed', 'warning', 'needs_blend', 'failed', 'pending'].map(qc => (
                    <button
                      key={qc}
                      type="button"
                      onClick={() => setFilterQC(qc)}
                      className={`
                        text-[11px] px-2.5 py-1.5 rounded-full border font-medium
                        ${filterQC === qc
                          ? qc === 'all'
                            ? 'bg-gray-800 text-white border-gray-800'
                            : `${(QC_COLORS[qc] || QC_COLORS.pending).bg} ${(QC_COLORS[qc] || QC_COLORS.pending).text} ${(QC_COLORS[qc] || QC_COLORS.pending).border}`
                          : 'bg-white text-gray-500 border-gray-200'}
                      `}
                    >
                      {qc === 'all' ? 'Tất cả QC' : (QC_COLORS[qc] || QC_COLORS.pending).label}
                    </button>
                  ))}

                  {/* Material filter */}
                  {materialOptions.length > 1 && (
                    <select
                      value={filterMaterial}
                      onChange={e => setFilterMaterial(e.target.value)}
                      className="text-[12px] px-2.5 py-1.5 rounded-full border border-gray-200
                        bg-white text-gray-600 appearance-none pr-6"
                    >
                      <option value="all">Tất cả SP</option>
                      {materialOptions.map(m => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            {/* Đã chọn (compact summary) */}
            {outItems.length > 0 && (
              <div className="bg-[#2D8B6E]/5 border-b border-[#2D8B6E]/10 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => setStep(2)} // scroll to list
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#2D8B6E]" />
                    <span className="text-[13px] font-medium text-[#1B4D3E]">
                      Đã chọn {outItems.length} lô
                    </span>
                  </div>
                  <span className="text-[13px] font-bold text-[#1B4D3E]"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {totalQty.toLocaleString('vi-VN')} {outItems[0]?.material_unit || 'bành'}
                  </span>
                </button>
              </div>
            )}

            {/* Batch list */}
            <div className="p-4 space-y-2.5">
              <p className="text-[12px] text-gray-500 font-medium flex items-center gap-1">
                <Layers className="w-3 h-3" />
                Hàng tồn — FIFO (lô cũ trước) — Chạm để chọn
              </p>

              {/* Debug info — tạm thời để kiểm tra */}
              {batchStocks.length > 0 && filteredBatches.length === 0 && (
                <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-[12px] text-blue-700">
                  <p className="font-bold">🔍 Debug: {batchStocks.length} lô tồn nhưng bộ lọc trả 0</p>
                  <p>QC status các lô: {batchStocks.map(b => `${b.batch_no}→${b.qc_status}`).join(', ')}</p>
                  <p>Filter hiện tại: QC={filterQC}, SP={filterMaterial}</p>
                  <button type="button" onClick={() => { setFilterQC('all'); setFilterMaterial('all'); setSearchText('') }}
                    className="mt-1 px-3 py-1 bg-blue-600 text-white rounded-lg font-bold">
                    Bỏ tất cả filter
                  </button>
                </div>
              )}

              {loadingBatches ? (
                <div className="flex items-center gap-2 py-12 justify-center text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Đang tải hàng tồn...</span>
                </div>
              ) : filteredBatches.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">
                    {batchStocks.length === 0
                      ? 'Kho này chưa có hàng tồn'
                      : searchText || filterQC !== 'all' || filterMaterial !== 'all'
                        ? 'Không tìm thấy lô phù hợp'
                        : 'Tất cả lô đã được thêm vào phiếu'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredBatches.map(batch => (
                    <BatchCard
                      key={batch.id}
                      batch={batch}
                      isSelected={selectedBatchId === batch.id}
                      onTap={() => {
                        if (selectedBatchId === batch.id) {
                          // Double tap → add
                          handleAddBatch(batch)
                        } else {
                          setSelectedBatchId(batch.id)
                        }
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Add selected batch button */}
              {selectedBatchId && (
                <div className="sticky bottom-24 z-10">
                  <button
                    type="button"
                    onClick={() => {
                      const batch = batchStocks.find(b => b.id === selectedBatchId)
                      if (batch) handleAddBatch(batch)
                    }}
                    className="w-full min-h-[48px] bg-[#2D8B6E] text-white font-bold rounded-xl
                      flex items-center justify-center gap-2 shadow-lg shadow-[#2D8B6E]/30
                      active:scale-[0.97] transition-transform"
                  >
                    <Plus className="w-5 h-5" />
                    Thêm lô vào phiếu xuất
                  </button>
                </div>
              )}

              {/* Selected items list */}
              {outItems.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200 space-y-2.5">
                  <p className="text-[12px] text-gray-700 font-bold flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-[#2D8B6E]" />
                    Danh sách xuất ({outItems.length} lô)
                  </p>
                  {outItems.map(item => (
                    <OutItemCard
                      key={item.tempId}
                      item={item}
                      onChangeQty={handleChangeQty}
                      onRemove={handleRemoveItem}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 3: XÁC NHẬN */}
        {/* ================================================================ */}
        {step === 3 && (
          <div className="p-4 space-y-4">
            {/* Summary header */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="text-[14px] font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-400" />
                Thông tin phiếu xuất
              </h3>

              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <p className="text-gray-500">Kho xuất</p>
                  <p className="font-bold text-gray-900">{selectedWarehouse?.code}</p>
                  <p className="text-[12px] text-gray-500">{selectedWarehouse?.name}</p>
                </div>
                <div>
                  <p className="text-gray-500">Lý do</p>
                  <p className="font-bold text-gray-900">
                    {REASONS.find(r => r.value === header.reason)?.label}
                  </p>
                </div>
                {header.customer_name && (
                  <div>
                    <p className="text-gray-500">Khách hàng</p>
                    <p className="font-bold text-gray-900">{header.customer_name}</p>
                  </div>
                )}
                {header.customer_order_ref && (
                  <div>
                    <p className="text-gray-500">Số đơn hàng</p>
                    <p className="font-bold text-gray-900"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {header.customer_order_ref}
                    </p>
                  </div>
                )}
              </div>

              {header.notes && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-[12px] text-gray-500">Ghi chú: {header.notes}</p>
                </div>
              )}
            </div>

            {/* Summary totals */}
            <div className="bg-[#1B4D3E] rounded-xl p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] text-white/70">Tổng số lượng</p>
                  <p className="text-[20px] font-bold"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {totalQty.toLocaleString('vi-VN')}
                    <span className="text-[13px] font-normal text-white/60 ml-1">
                      {outItems[0]?.material_unit || 'bành'}
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[12px] text-white/70">Ước tính KL</p>
                  <p className="text-[16px] font-bold"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {totalWeight > 0 ? `${totalWeight.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg` : '—'}
                  </p>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-white/20 flex items-center gap-4">
                <p className="text-[12px] text-white/70">
                  {outItems.length} lô · {new Set(outItems.map(i => i.material_id)).size} sản phẩm
                </p>
              </div>
            </div>

            {/* Warning for non-passed QC */}
            {hasNonPassedItems && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-bold text-amber-800">Có lô chưa đạt QC trong phiếu</p>
                  <p className="text-[12px] text-amber-700 mt-1">
                    Phiếu này bao gồm {outItems.filter(i => i.qc_status !== 'passed').length} lô
                    chưa đạt QC ({outItems.filter(i => i.qc_status !== 'passed').map(i => (QC_COLORS[i.qc_status] || QC_COLORS.pending).label).join(', ')}).
                    {header.reason === 'blend'
                      ? ' Điều này phù hợp cho mục đích phối trộn.'
                      : ' Đảm bảo khách hàng đã chấp nhận mức DRC này.'
                    }
                  </p>
                </div>
              </div>
            )}

            {/* Detail items */}
            <div className="space-y-2">
              <p className="text-[13px] font-bold text-gray-700 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-gray-400" />
                Chi tiết xuất kho
              </p>
              {outItems.map((item, idx) => (
                <div key={item.tempId}
                  className={`
                    p-3 rounded-xl border bg-white
                    ${item.qc_status !== 'passed' ? `border-l-4 ${(QC_COLORS[item.qc_status] || QC_COLORS.pending).border}` : 'border-gray-200'}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center
                        text-[11px] font-bold text-gray-500 shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[13px] font-bold text-gray-900 truncate"
                            style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            {item.batch_no}
                          </span>
                          <QCBadge status={item.qc_status} />
                        </div>
                        <p className="text-[11px] text-gray-500 truncate">{item.material_sku} — {item.material_name}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-[14px] font-bold text-[#1B4D3E]"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {item.quantity.toLocaleString('vi-VN')}
                      </p>
                      <p className="text-[11px] text-gray-400">{item.material_unit}</p>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-gray-400">
                    {item.location_code && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" />{item.location_code}
                      </span>
                    )}
                    {item.latest_drc != null && (
                      <span>DRC: {item.latest_drc.toFixed(1)}%</span>
                    )}
                    {item.weight > 0 && (
                      <span>{item.weight.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* BOTTOM ACTION BAR */}
      {/* ================================================================ */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 safe-bottom z-20">
        {step === 1 && (
          <button
            type="button"
            onClick={handleNext}
            disabled={!validateStep1()}
            className={`
              w-full min-h-[52px] rounded-xl font-bold text-[15px]
              flex items-center justify-center gap-2
              transition-all active:scale-[0.97]
              ${validateStep1()
                ? 'bg-[#1B4D3E] text-white'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
            `}
          >
            Tiếp: Chọn hàng xuất
            <ArrowRight className="w-5 h-5" />
          </button>
        )}

        {step === 2 && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="min-h-[52px] px-5 rounded-xl border-2 border-gray-300 text-gray-600 font-bold
                flex items-center justify-center active:scale-[0.97]"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!validateStep2()}
              className={`
                flex-1 min-h-[52px] rounded-xl font-bold text-[15px]
                flex items-center justify-center gap-2
                transition-all active:scale-[0.97]
                ${validateStep2()
                  ? 'bg-[#1B4D3E] text-white'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
              `}
            >
              Xem lại ({outItems.length} lô)
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="min-h-[52px] px-5 rounded-xl border-2 border-gray-300 text-gray-600 font-bold
                flex items-center justify-center active:scale-[0.97]"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving}
              className="min-h-[52px] px-5 rounded-xl border-2 border-[#2D8B6E] text-[#2D8B6E] font-bold
                flex items-center justify-center gap-1.5 active:scale-[0.97]"
            >
              <Save className="w-4 h-4" />
              Nháp
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              className={`
                flex-1 min-h-[52px] rounded-xl font-bold text-[15px]
                flex items-center justify-center gap-2
                transition-all active:scale-[0.97]
                ${saving ? 'bg-gray-300 text-gray-500' : 'bg-[#1B4D3E] text-white'}
              `}
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  <CircleCheck className="w-5 h-5" />
                  Xác nhận xuất
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Keyframe animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default StockOutCreatePage