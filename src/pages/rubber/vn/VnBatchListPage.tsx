// ============================================================================
// FILE: src/pages/rubber/vn/VnBatchListPage.tsx
// MODULE: Thu mua Mủ — Huy Anh Rubber ERP
// PHASE: 3.6 — Bảng chốt mủ Việt theo tháng
// BẢNG: rubber_intake_batches (source_type = 'vietnam')
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Search, X, ChevronLeft, ChevronRight, RefreshCw,
  Loader2, Scale, Banknote, Users, FileText, Truck, Hash,
  Droplets, ClipboardList, ChevronDown, ChevronUp,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

// ============================================================================
// TYPES (inline — không phụ thuộc rubber.types)
// ============================================================================

interface VnBatch {
  id: string
  intake_date: string
  supplier_id?: string
  product_code?: string
  settled_qty_ton?: number
  settled_price_per_ton?: number
  total_amount?: number
  gross_weight_kg?: number
  net_weight_kg?: number
  drc_percent?: number
  finished_product_ton?: number
  avg_unit_price?: number
  invoice_no?: string
  vehicle_plate?: string
  vehicle_label?: string
  status: string
  payment_status: string
  paid_amount?: number
  notes?: string
  created_at: string
  supplier?: { id: string; code: string; name: string }
}

// ============================================================================
// HELPERS
// ============================================================================

function fmt(n?: number | null): string {
  if (n == null || n === 0) return '–'
  return n.toLocaleString('vi-VN')
}
function fmtTon(t?: number | null): string {
  if (!t) return '–'
  return `${t.toFixed(3)}T`
}
function fmtMoney(a?: number | null): string {
  if (!a) return '–'
  if (a >= 1e9) return `${(a / 1e9).toFixed(2)} tỷ`
  if (a >= 1e6) return `${(a / 1e6).toFixed(1)} tr`
  return fmt(a)
}
function fmtWeight(kg?: number | null): string {
  if (!kg) return '–'
  return `${fmt(Math.round(kg))} kg`
}
function fmtDate(s?: string): string {
  if (!s) return '–'
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}
function fmtPercent(p?: number | null): string {
  if (!p) return '–'
  return `${p.toFixed(1)}%`
}
function getMonthLabel(y: number, m: number): string {
  return `Tháng ${m}/${y}`
}

const STATUS_CFG: Record<string, { label: string; className: string; border: string }> = {
  draft:     { label: 'Nháp',    className: 'bg-gray-100 text-gray-600',    border: '#9CA3AF' },
  confirmed: { label: 'Đã XN',   className: 'bg-blue-50 text-blue-700',     border: '#2563EB' },
  settled:   { label: 'Đã chốt', className: 'bg-emerald-50 text-emerald-700', border: '#16A34A' },
  cancelled: { label: 'Đã hủy',  className: 'bg-red-50 text-red-600',       border: '#DC2626' },
}

const PAYMENT_CFG: Record<string, { label: string; className: string }> = {
  unpaid:  { label: 'Chưa TT',    className: 'text-orange-600' },
  partial: { label: 'TT 1 phần',  className: 'text-yellow-700' },
  paid:    { label: 'Đã TT',      className: 'text-emerald-600' },
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const MonthPicker: React.FC<{
  year: number; month: number
  onChange: (y: number, m: number) => void
}> = ({ year, month, onChange }) => (
  <div className="flex items-center justify-center gap-1 py-2 bg-white border-b border-gray-100">
    <button type="button"
      onClick={() => month === 1 ? onChange(year - 1, 12) : onChange(year, month - 1)}
      className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100">
      <ChevronLeft className="w-5 h-5 text-gray-600" />
    </button>
    <span className="text-[15px] font-bold text-gray-900 min-w-[120px] text-center">
      {getMonthLabel(year, month)}
    </span>
    <button type="button"
      onClick={() => month === 12 ? onChange(year + 1, 1) : onChange(year, month + 1)}
      className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100">
      <ChevronRight className="w-5 h-5 text-gray-600" />
    </button>
  </div>
)

const SummaryCards: React.FC<{ batches: VnBatch[] }> = ({ batches }) => {
  const active = batches.filter(b => b.status !== 'cancelled')
  const supplierIds = new Set(active.map(b => b.supplier_id).filter(Boolean))
  const totalTon = active.reduce((s, b) => s + (b.settled_qty_ton || 0), 0)
  const totalFinished = active.reduce((s, b) => s + (b.finished_product_ton || 0), 0)
  const totalAmount = active.reduce((s, b) => s + (b.total_amount || 0), 0)

  return (
    <div className="px-4 py-3 grid grid-cols-2 gap-2">
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
        <p className="text-[11px] text-gray-400">NCC</p>
        <p className="text-[18px] font-bold text-gray-800 font-mono">{supplierIds.size}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
        <p className="text-[11px] text-gray-400">KL chốt</p>
        <p className="text-[18px] font-bold text-[#1B4D3E] font-mono">{fmtTon(totalTon)}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
        <p className="text-[11px] text-gray-400">TP nhập kho</p>
        <p className="text-[18px] font-bold text-emerald-700 font-mono">{fmtTon(totalFinished)}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
        <p className="text-[11px] text-gray-400">Tổng tiền</p>
        <p className="text-[16px] font-bold text-[#E8A838] font-mono">{fmtMoney(totalAmount)}</p>
      </div>
    </div>
  )
}

const BatchCard: React.FC<{
  batch: VnBatch
  onTap: (id: string) => void
}> = ({ batch, onTap }) => {
  const sCfg = STATUS_CFG[batch.status] || STATUS_CFG.draft
  const pCfg = PAYMENT_CFG[batch.payment_status] || PAYMENT_CFG.unpaid

  return (
    <button type="button" onClick={() => onTap(batch.id)}
      className="w-full text-left bg-white rounded-[14px] border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:scale-[0.98] transition-transform overflow-hidden">
      <div className="flex">
        <div className="w-1 shrink-0 rounded-l-[14px]" style={{ backgroundColor: sCfg.border }} />
        <div className="flex-1 p-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[15px] font-bold text-gray-900 font-mono truncate">
                {batch.product_code || `#${batch.id.slice(0, 8)}`}
              </span>
              <span className="text-[12px] text-gray-400">{fmtDate(batch.intake_date)}</span>
            </div>
            <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full ${sCfg.className}`}>
              {sCfg.label}
            </span>
          </div>

          {/* NCC */}
          <div className="flex items-center gap-2 text-[13px] text-gray-500 mb-2">
            <Users className="w-3.5 h-3.5" />
            <span className="truncate max-w-[200px]">{batch.supplier?.name || '–'}</span>
            {batch.invoice_no && (
              <>
                <span className="text-gray-200">•</span>
                <span className="inline-flex items-center gap-1 text-[12px]">
                  <FileText className="w-3 h-3" /> {batch.invoice_no}
                </span>
              </>
            )}
          </div>

          {/* Numbers */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-[13px]">
              {batch.settled_qty_ton != null && (
                <span className="inline-flex items-center gap-1">
                  <Scale className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-mono font-semibold text-[#1B4D3E]">{fmtTon(batch.settled_qty_ton)}</span>
                </span>
              )}
              {batch.settled_price_per_ton != null && (
                <span className="inline-flex items-center gap-1">
                  <Banknote className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-mono font-semibold text-gray-700">{fmtMoney(batch.settled_price_per_ton)}/T</span>
                </span>
              )}
              {batch.drc_percent != null && (
                <span className="inline-flex items-center gap-1">
                  <Droplets className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-mono font-semibold text-gray-600">{fmtPercent(batch.drc_percent)}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {batch.total_amount != null && batch.total_amount > 0 && (
                <span className="text-[14px] font-bold text-[#E8A838] font-mono">{fmtMoney(batch.total_amount)}</span>
              )}
            </div>
          </div>

          {/* Detail row */}
          {(batch.gross_weight_kg || batch.finished_product_ton || batch.vehicle_plate) && (
            <div className="flex items-center gap-3 mt-2 text-[12px] text-gray-400 flex-wrap">
              {batch.gross_weight_kg != null && (
                <span>KLm: {fmtWeight(batch.gross_weight_kg)}</span>
              )}
              {batch.net_weight_kg != null && (
                <span>KLn: {fmtWeight(batch.net_weight_kg)}</span>
              )}
              {batch.finished_product_ton != null && (
                <span className="text-emerald-600 font-medium">TP: {fmtTon(batch.finished_product_ton)}</span>
              )}
              {batch.vehicle_plate && (
                <span className="inline-flex items-center gap-1">
                  <Truck className="w-3 h-3" /> {batch.vehicle_plate}
                </span>
              )}
            </div>
          )}

          {/* Payment */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
            <span className={`text-[11px] font-medium ${pCfg.className}`}>{pCfg.label}</span>
            {batch.paid_amount != null && batch.paid_amount > 0 && (
              <span className="text-[11px] text-gray-400 font-mono">Đã TT: {fmtMoney(batch.paid_amount)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center pr-3">
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </div>
      </div>
    </button>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const VnBatchListPage: React.FC = () => {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [batches, setBatches] = useState<VnBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, '0')}-01`

      const { data, error: queryErr } = await supabase
        .from('rubber_intake_batches')
        .select(`
          id, intake_date, supplier_id, product_code,
          settled_qty_ton, settled_price_per_ton, total_amount,
          gross_weight_kg, net_weight_kg, drc_percent, finished_product_ton,
          avg_unit_price, invoice_no, vehicle_plate, vehicle_label,
          status, payment_status, paid_amount, notes, created_at,
          supplier:rubber_suppliers(id, code, name)
        `)
        .eq('source_type', 'vietnam')
        .gte('intake_date', startDate)
        .lt('intake_date', endDate)
        .order('intake_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (queryErr) throw queryErr
      setBatches((data || []) as unknown as VnBatch[])
    } catch (err: unknown) {
      console.error('Lỗi tải chốt mủ Việt:', err)
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { loadData() }, [loadData])

  // Filter + search
  const displayed = useMemo(() => {
    let list = [...batches]
    if (activeFilter !== 'all') list = list.filter(b => b.status === activeFilter)
    if (searchText.trim()) {
      const s = searchText.trim().toLowerCase()
      list = list.filter(b =>
        b.supplier?.name?.toLowerCase().includes(s) ||
        b.product_code?.toLowerCase().includes(s) ||
        b.invoice_no?.toLowerCase().includes(s) ||
        b.vehicle_plate?.toLowerCase().includes(s)
      )
    }
    return list
  }, [batches, activeFilter, searchText])

  const handleTap = (id: string) => navigate(`/rubber/intake/${id}`)
  const changeMonth = (y: number, m: number) => { setYear(y); setMonth(m) }

  const filters = [
    { key: 'all', label: 'Tất cả' },
    { key: 'draft', label: 'Nháp' },
    { key: 'confirmed', label: 'Đã XN' },
    { key: 'settled', label: 'Đã chốt' },
  ]

  return (
    <div className="min-h-screen bg-[#F7F5F2]" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-[#1B4D3E] text-white">
        <div className="flex items-center justify-between px-4 py-3 min-h-[56px]">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10 -ml-2">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-[17px] font-bold leading-tight">🇻🇳 Chốt mủ Việt</h1>
              <p className="text-[11px] text-white/60">Bảng chốt theo tháng</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={loadData} disabled={loading}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10">
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchText('') }}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10">
              {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
                placeholder="Tìm NCC, mã hàng, hoá đơn..."
                className="w-full pl-10 pr-10 py-2.5 bg-white/10 border border-white/20 rounded-xl text-[15px] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
                autoFocus />
              {searchText && (
                <button type="button" onClick={() => setSearchText('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-white/20">
                  <X className="w-3 h-3 text-white" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MONTH PICKER */}
      <MonthPicker year={year} month={month} onChange={changeMonth} />

      {/* FILTER CHIPS */}
      <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-hide bg-white border-b border-gray-100">
        {filters.map(f => {
          const count = f.key === 'all' ? batches.length : batches.filter(b => b.status === f.key).length
          return (
            <button key={f.key} type="button" onClick={() => setActiveFilter(f.key)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium border transition-all min-h-[36px] ${
                activeFilter === f.key
                  ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]'
                  : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'
              }`}>
              {f.label} {count > 0 && <span className="ml-1 text-[11px] opacity-70">({count})</span>}
            </button>
          )
        })}
      </div>

      {/* CONTENT */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#1B4D3E] animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <p className="text-[14px] text-red-500 mb-3">{error}</p>
          <button type="button" onClick={loadData}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1B4D3E] text-white rounded-xl text-[14px] font-semibold active:scale-[0.97]">
            <RefreshCw className="w-4 h-4" /> Thử lại
          </button>
        </div>
      )}

      {!loading && !error && batches.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-6">
          <div className="w-16 h-16 mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <span className="text-3xl">🇻🇳</span>
          </div>
          <h3 className="text-[15px] font-semibold text-gray-600 mb-1">Chưa có đợt nhập mủ Việt</h3>
          <p className="text-[13px] text-gray-400 text-center max-w-[240px]">
            {getMonthLabel(year, month)} chưa có dữ liệu chốt mủ Việt Nam
          </p>
        </div>
      )}

      {!loading && !error && batches.length > 0 && (
        <>
          <SummaryCards batches={displayed} />
          <div className="px-4 pb-24 space-y-3">
            {displayed.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[13px] text-gray-400">Không tìm thấy kết quả phù hợp</p>
              </div>
            ) : (
              displayed.map(b => <BatchCard key={b.id} batch={b} onTap={handleTap} />)
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default VnBatchListPage