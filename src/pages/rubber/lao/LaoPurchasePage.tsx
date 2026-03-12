// ============================================================================
// FILE: src/pages/rubber/lao/LaoPurchasePage.tsx
// MODULE: Thu mua Mủ — Huy Anh Rubber ERP
// PHASE: 3.6 — Thu mua Lào trực tiếp
// BẢNG: rubber_intake_batches (source_type = 'lao_direct')
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Search, X, ChevronLeft, ChevronRight, RefreshCw,
  Loader2, Scale, Banknote, Users, Truck, MapPin,
  User, ChevronRight as ChevRight, Droplets, ClipboardList,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface LaoBatch {
  id: string
  intake_date: string
  supplier_id?: string
  product_code?: string
  purchase_qty_kg?: number
  unit_price?: number
  price_currency?: string
  total_amount?: number
  gross_weight_kg?: number
  net_weight_kg?: number
  drc_percent?: number
  finished_product_ton?: number
  location_name?: string
  buyer_name?: string
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
function fmtWeight(kg?: number | null): string {
  if (!kg) return '–'
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}T`
  return `${fmt(Math.round(kg))} kg`
}
function fmtMoney(a?: number | null, c?: string): string {
  if (!a) return '–'
  const symbol = c === 'BATH' ? ' ฿' : c === 'LAK' || c === 'KIP' ? ' ₭' : ''
  if (Math.abs(a) >= 1e9) return `${(a / 1e9).toFixed(1)}B${symbol}`
  if (Math.abs(a) >= 1e6) return `${(a / 1e6).toFixed(1)}M${symbol}`
  if (Math.abs(a) >= 1e3) return `${(a / 1e3).toFixed(0)}K${symbol}`
  return fmt(a) + symbol
}
function fmtDate(s?: string): string {
  if (!s) return '–'
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}
function getMonthLabel(y: number, m: number) { return `Tháng ${m}/${y}` }

const STATUS_CFG: Record<string, { label: string; className: string; border: string }> = {
  draft:     { label: 'Nháp',    className: 'bg-gray-100 text-gray-600',      border: '#9CA3AF' },
  confirmed: { label: 'Đã XN',   className: 'bg-emerald-50 text-emerald-700', border: '#16A34A' },
  settled:   { label: 'Đã QT',   className: 'bg-blue-50 text-blue-700',       border: '#2563EB' },
  cancelled: { label: 'Đã hủy',  className: 'bg-red-50 text-red-600',         border: '#DC2626' },
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const MonthPicker: React.FC<{
  year: number; month: number; onChange: (y: number, m: number) => void
}> = ({ year, month, onChange }) => (
  <div className="flex items-center justify-center gap-1 py-2 bg-white border-b border-gray-100">
    <button type="button" onClick={() => month === 1 ? onChange(year - 1, 12) : onChange(year, month - 1)}
      className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100">
      <ChevronLeft className="w-5 h-5 text-gray-600" />
    </button>
    <span className="text-[15px] font-bold text-gray-900 min-w-[120px] text-center">{getMonthLabel(year, month)}</span>
    <button type="button" onClick={() => month === 12 ? onChange(year + 1, 1) : onChange(year, month + 1)}
      className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100">
      <ChevronRight className="w-5 h-5 text-gray-600" />
    </button>
  </div>
)

const SummaryCards: React.FC<{ batches: LaoBatch[] }> = ({ batches }) => {
  const active = batches.filter(b => b.status !== 'cancelled')
  const totalKg = active.reduce((s, b) => s + (b.purchase_qty_kg || 0), 0)
  const totalLak = active.filter(b => b.price_currency === 'LAK' || b.price_currency === 'KIP').reduce((s, b) => s + (b.total_amount || 0), 0)
  const totalBath = active.filter(b => b.price_currency === 'BATH').reduce((s, b) => s + (b.total_amount || 0), 0)
  const locations = new Set(active.map(b => b.location_name).filter(Boolean))

  return (
    <div className="px-4 py-3 grid grid-cols-2 gap-2">
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
        <p className="text-[11px] text-gray-400">Đợt mua</p>
        <p className="text-[18px] font-bold text-gray-800 font-mono">{active.length}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
        <p className="text-[11px] text-gray-400">Tổng KG</p>
        <p className="text-[18px] font-bold text-[#1B4D3E] font-mono">{fmtWeight(totalKg)}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
        <p className="text-[11px] text-gray-400">Tổng ₭ LAK</p>
        <p className="text-[16px] font-bold text-emerald-700 font-mono">{fmtMoney(totalLak, 'LAK')}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
        <p className="text-[11px] text-gray-400">Tổng ฿ BATH</p>
        <p className="text-[16px] font-bold text-blue-700 font-mono">{fmtMoney(totalBath, 'BATH')}</p>
      </div>
    </div>
  )
}

const PurchaseCard: React.FC<{
  batch: LaoBatch; onTap: (id: string) => void
}> = ({ batch, onTap }) => {
  const sCfg = STATUS_CFG[batch.status] || STATUS_CFG.draft
  const currencyColor = batch.price_currency === 'BATH' ? 'text-blue-700' : 'text-emerald-700'
  const displayName = batch.supplier?.name || batch.buyer_name || '–'

  return (
    <button type="button" onClick={() => onTap(batch.id)}
      className="w-full text-left bg-white rounded-[14px] border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:scale-[0.98] transition-transform overflow-hidden">
      <div className="flex">
        <div className="w-1 shrink-0 rounded-l-[14px]" style={{ backgroundColor: sCfg.border }} />
        <div className="flex-1 p-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[14px] font-bold text-gray-900 font-mono truncate">
                {batch.product_code || `#${batch.id.slice(0, 8)}`}
              </span>
              <span className="text-[12px] text-gray-400">{fmtDate(batch.intake_date)}</span>
            </div>
            <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full ${sCfg.className}`}>
              {sCfg.label}
            </span>
          </div>

          {/* NCC + Location */}
          <div className="flex items-center gap-3 text-[13px] text-gray-500 mb-2 flex-wrap">
            <span className="inline-flex items-center gap-1 truncate max-w-[150px]">
              <Users className="w-3.5 h-3.5" /> {displayName}
            </span>
            {batch.location_name && (
              <span className="inline-flex items-center gap-1 truncate max-w-[120px]">
                <MapPin className="w-3.5 h-3.5" /> {batch.location_name}
              </span>
            )}
            {batch.buyer_name && batch.supplier?.name && (
              <span className="inline-flex items-center gap-1 text-[12px]">
                <User className="w-3 h-3" /> {batch.buyer_name}
              </span>
            )}
          </div>

          {/* Numbers */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-[13px]">
              {batch.purchase_qty_kg != null && (
                <span className="inline-flex items-center gap-1">
                  <Scale className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-mono font-semibold text-gray-700">{fmtWeight(batch.purchase_qty_kg)}</span>
                </span>
              )}
              {batch.unit_price != null && (
                <span className="inline-flex items-center gap-1">
                  <Banknote className="w-3.5 h-3.5 text-gray-400" />
                  <span className={`font-mono font-semibold ${currencyColor}`}>{fmt(batch.unit_price)}/kg</span>
                </span>
              )}
              {batch.drc_percent != null && (
                <span className="inline-flex items-center gap-1">
                  <Droplets className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-mono text-gray-600">{batch.drc_percent}%</span>
                </span>
              )}
            </div>
            {batch.total_amount != null && batch.total_amount > 0 && (
              <span className={`text-[14px] font-bold font-mono ${currencyColor}`}>
                {fmtMoney(batch.total_amount, batch.price_currency)}
              </span>
            )}
          </div>

          {/* Vehicle */}
          {batch.vehicle_plate && (
            <div className="flex items-center gap-2 mt-2 text-[12px] text-gray-400">
              <Truck className="w-3 h-3" />
              <span>{batch.vehicle_plate} {batch.vehicle_label || ''}</span>
            </div>
          )}
        </div>
        <div className="flex items-center pr-3">
          <ChevRight className="w-4 h-4 text-gray-300" />
        </div>
      </div>
    </button>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const LaoPurchasePage: React.FC = () => {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [batches, setBatches] = useState<LaoBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

      const { data, error: qErr } = await supabase
        .from('rubber_intake_batches')
        .select(`
          id, intake_date, supplier_id, product_code,
          purchase_qty_kg, unit_price, price_currency, total_amount,
          gross_weight_kg, net_weight_kg, drc_percent, finished_product_ton,
          location_name, buyer_name, vehicle_plate, vehicle_label,
          status, payment_status, paid_amount, notes, created_at,
          supplier:rubber_suppliers(id, code, name)
        `)
        .eq('source_type', 'lao_direct')
        .gte('intake_date', startDate)
        .lt('intake_date', endDate)
        .order('intake_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (qErr) throw qErr
      setBatches((data || []) as unknown as LaoBatch[])
    } catch (err: unknown) {
      console.error('Lỗi tải thu mua Lào:', err)
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { loadData() }, [loadData])

  // Locations for filter
  const usedLocations = useMemo(() => {
    const set = new Set(batches.map(b => b.location_name).filter(Boolean) as string[])
    return Array.from(set).sort()
  }, [batches])

  // Filter + search
  const displayed = useMemo(() => {
    let list = [...batches]
    if (activeFilter !== 'all') list = list.filter(b => b.status === activeFilter)
    if (locationFilter) list = list.filter(b => b.location_name === locationFilter)
    if (searchText.trim()) {
      const s = searchText.trim().toLowerCase()
      list = list.filter(b =>
        b.supplier?.name?.toLowerCase().includes(s) ||
        b.product_code?.toLowerCase().includes(s) ||
        b.location_name?.toLowerCase().includes(s) ||
        b.buyer_name?.toLowerCase().includes(s) ||
        b.vehicle_plate?.toLowerCase().includes(s)
      )
    }
    return list
  }, [batches, activeFilter, locationFilter, searchText])

  const handleTap = (id: string) => navigate(`/rubber/intake/${id}`)

  const filters = [
    { key: 'all', label: 'Tất cả' },
    { key: 'draft', label: 'Nháp' },
    { key: 'confirmed', label: 'Đã XN' },
    { key: 'settled', label: 'Đã QT' },
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
              <h1 className="text-[17px] font-bold leading-tight">🇱🇦 Thu mua Lào</h1>
              <p className="text-[11px] text-white/60">Trực tiếp — Đa tiền tệ</p>
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
                placeholder="Tìm NCC, địa điểm, người mua..."
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
      <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />

      {/* FILTER CHIPS */}
      <div className="px-4 py-2.5 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide mb-2">
          {filters.map(f => {
            const count = f.key === 'all' ? batches.length : batches.filter(b => b.status === f.key).length
            return (
              <button key={f.key} type="button" onClick={() => setActiveFilter(f.key)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium border transition-all min-h-[36px] ${
                  activeFilter === f.key ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]' : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'
                }`}>
                {f.label} {count > 0 && <span className="ml-1 text-[11px] opacity-70">({count})</span>}
              </button>
            )
          })}
        </div>

        {/* Location filter */}
        {usedLocations.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <button type="button" onClick={() => setLocationFilter('')}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-[12px] font-medium ${
                !locationFilter ? 'bg-blue-50 text-blue-700' : 'text-gray-500 active:bg-gray-50'
              }`}>
              Tất cả
            </button>
            {usedLocations.map(loc => (
              <button key={loc} type="button" onClick={() => setLocationFilter(locationFilter === loc ? '' : loc)}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-[12px] font-medium ${
                  locationFilter === loc ? 'bg-blue-50 text-blue-700' : 'text-gray-500 active:bg-gray-50'
                }`}>
                {loc}
              </button>
            ))}
          </div>
        )}
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
          <div className="w-16 h-16 mb-4 rounded-full bg-emerald-50 flex items-center justify-center">
            <span className="text-3xl">🇱🇦</span>
          </div>
          <h3 className="text-[15px] font-semibold text-gray-600 mb-1">Chưa có đợt thu mua Lào</h3>
          <p className="text-[13px] text-gray-400 text-center max-w-[240px]">
            {getMonthLabel(year, month)} chưa có dữ liệu thu mua trực tiếp tại Lào
          </p>
        </div>
      )}

      {!loading && !error && batches.length > 0 && (
        <>
          <SummaryCards batches={displayed} />
          <div className="px-4 pb-24 space-y-3">
            {displayed.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[13px] text-gray-400">Không tìm thấy kết quả</p>
              </div>
            ) : (
              displayed.map(b => <PurchaseCard key={b.id} batch={b} onTap={handleTap} />)
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default LaoPurchasePage