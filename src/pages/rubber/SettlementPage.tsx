// ============================================================================
// FILE: src/pages/rubber/RubberSettlementPage.tsx
// MODULE: Thu mua Mủ — Huy Anh Rubber ERP
// PHASE: 3.6 — Quyết toán thanh toán
// BẢNG: rubber_settlements + rubber_suppliers
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Loader2, Search, X,
  ChevronLeft, ChevronRight, Scale, Banknote, Users,
  CheckCircle2, Clock, XCircle, FileText, ChevronRight as ChevR,
  AlertTriangle, Wallet, TrendingDown, CreditCard,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface Settlement {
  id: string
  settlement_code: string
  source_type: string
  settlement_date: string
  batch_ids?: string[]
  weighed_kg?: number
  drc_percent?: number
  finished_product_ton?: number
  total_qty_ton?: number
  unit_price?: number
  currency?: string
  exchange_rate?: number
  total_amount?: number
  total_amount_vnd?: number
  paid_amount?: number
  remaining_amount?: number
  payment_status: string
  payment_method?: string
  status: string
  notes?: string
  created_at: string
  supplier?: { id: string; code: string; name: string; country?: string }
}

// ============================================================================
// HELPERS
// ============================================================================

function fmt(n?: number | null): string {
  if (n == null || n === 0) return '–'
  return n.toLocaleString('vi-VN')
}
function fmtMoney(a?: number | null): string {
  if (!a) return '–'
  if (Math.abs(a) >= 1e9) return `${(a / 1e9).toFixed(2)} tỷ`
  if (Math.abs(a) >= 1e6) return `${(a / 1e6).toFixed(1)} tr`
  return fmt(a)
}
function fmtTon(t?: number | null): string {
  if (!t) return '–'
  return `${t.toFixed(3)}T`
}
function fmtDate(s?: string): string {
  if (!s) return '–'
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}
function getMonthLabel(y: number, m: number) { return `Tháng ${m}/${y}` }

const SOURCE_CFG: Record<string, { label: string; flag: string }> = {
  vietnam: { label: 'Việt', flag: '🇻🇳' },
  lao_direct: { label: 'Lào TT', flag: '🇱🇦' },
  lao_agent: { label: 'Lào ĐL', flag: '🤝' },
}

const STATUS_CFG: Record<string, { label: string; className: string; border: string }> = {
  draft:        { label: 'Nháp',     className: 'bg-gray-100 text-gray-600',      border: '#9CA3AF' },
  approved:     { label: 'Đã duyệt', className: 'bg-blue-50 text-blue-700',       border: '#2563EB' },
  partial_paid: { label: 'TT 1 phần', className: 'bg-yellow-50 text-yellow-700',  border: '#EAB308' },
  paid:         { label: 'Đã TT',    className: 'bg-emerald-50 text-emerald-700', border: '#16A34A' },
  closed:       { label: 'Đã đóng',  className: 'bg-emerald-50 text-emerald-700', border: '#16A34A' },
  cancelled:    { label: 'Đã hủy',   className: 'bg-red-50 text-red-600',         border: '#DC2626' },
}

const PAYMENT_CFG: Record<string, { label: string; className: string }> = {
  unpaid:  { label: '⏳ Chưa TT',   className: 'text-orange-600' },
  partial: { label: '🔶 TT 1 phần', className: 'text-yellow-700' },
  paid:    { label: '✅ Đã TT',     className: 'text-emerald-600' },
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

const SettlementCard: React.FC<{
  item: Settlement; onTap: (id: string) => void
}> = ({ item, onTap }) => {
  const sCfg = STATUS_CFG[item.status] || STATUS_CFG.draft
  const pCfg = PAYMENT_CFG[item.payment_status] || PAYMENT_CFG.unpaid
  const srcCfg = SOURCE_CFG[item.source_type] || SOURCE_CFG.vietnam
  const paidPct = item.total_amount_vnd && item.total_amount_vnd > 0
    ? ((item.paid_amount || 0) / item.total_amount_vnd) * 100 : 0

  return (
    <button type="button" onClick={() => onTap(item.id)}
      className="w-full text-left bg-white rounded-[14px] border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:scale-[0.98] transition-transform overflow-hidden">
      <div className="flex">
        <div className="w-1 shrink-0 rounded-l-[14px]" style={{ backgroundColor: sCfg.border }} />
        <div className="flex-1 p-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[14px] font-bold text-gray-900 font-mono truncate">{item.settlement_code}</span>
              <span className="text-[12px]">{srcCfg.flag}</span>
              <span className="text-[12px] text-gray-400">{fmtDate(item.settlement_date)}</span>
            </div>
            <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full ${sCfg.className}`}>
              {sCfg.label}
            </span>
          </div>

          {/* Supplier */}
          <div className="flex items-center gap-2 text-[13px] text-gray-500 mb-2">
            <Users className="w-3.5 h-3.5" />
            <span className="truncate">{item.supplier?.name || '–'}</span>
            <span className="text-[12px] font-mono text-gray-400">{item.supplier?.code}</span>
          </div>

          {/* Numbers */}
          <div className="flex items-center gap-4 text-[13px] mb-2">
            {item.total_qty_ton != null && (
              <span className="text-gray-500">KL: <span className="font-mono font-semibold text-[#1B4D3E]">{fmtTon(item.total_qty_ton)}</span></span>
            )}
            {item.drc_percent != null && (
              <span className="text-gray-500">DRC: <span className="font-mono font-semibold">{item.drc_percent}%</span></span>
            )}
            {item.finished_product_ton != null && (
              <span className="text-gray-500">TP: <span className="font-mono font-semibold text-emerald-700">{fmtTon(item.finished_product_ton)}</span></span>
            )}
          </div>

          {/* Amount + progress */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[16px] font-bold font-mono text-[#E8A838]">{fmtMoney(item.total_amount_vnd)}</span>
              <span className={`text-[11px] font-medium ${pCfg.className}`}>{pCfg.label}</span>
            </div>
            {(item.total_amount_vnd || 0) > 0 && (
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-300 ${
                  paidPct >= 100 ? 'bg-emerald-400' : paidPct > 0 ? 'bg-yellow-400' : 'bg-gray-200'
                }`} style={{ width: `${Math.min(paidPct, 100)}%` }} />
              </div>
            )}
            <div className="flex items-center justify-between mt-1 text-[11px] text-gray-400">
              <span>Đã TT: {fmtMoney(item.paid_amount)}</span>
              <span>Còn nợ: {fmtMoney(item.remaining_amount)}</span>
            </div>
          </div>

          {/* Payment method */}
          {item.payment_method && (
            <div className="flex items-center gap-2 text-[12px] text-gray-400">
              <CreditCard className="w-3 h-3" />
              <span>{item.payment_method === 'bank_transfer' ? 'Chuyển khoản' : item.payment_method === 'cash' ? 'Tiền mặt' : 'Hỗn hợp'}</span>
              {item.currency && item.currency !== 'VND' && (
                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-50 rounded">{item.currency}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center pr-3">
          <ChevR className="w-4 h-4 text-gray-300" />
        </div>
      </div>
    </button>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const RubberSettlementPage: React.FC = () => {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [settlements, setSettlements] = useState<Settlement[]>([])
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
      const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

      const { data, error: qErr } = await supabase
        .from('rubber_settlements')
        .select(`
          *,
          supplier:rubber_suppliers(id, code, name, country)
        `)
        .gte('settlement_date', startDate)
        .lt('settlement_date', endDate)
        .order('settlement_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (qErr) throw qErr
      setSettlements((data || []) as unknown as Settlement[])
    } catch (err: unknown) {
      console.error('Lỗi tải quyết toán:', err)
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { loadData() }, [loadData])

  const displayed = useMemo(() => {
    let list = [...settlements]
    if (activeFilter === 'unpaid') list = list.filter(s => s.payment_status === 'unpaid' || s.payment_status === 'partial')
    else if (activeFilter === 'paid') list = list.filter(s => s.payment_status === 'paid')
    else if (activeFilter !== 'all') list = list.filter(s => s.status === activeFilter)

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase()
      list = list.filter(s =>
        s.settlement_code?.toLowerCase().includes(q) ||
        s.supplier?.name?.toLowerCase().includes(q) ||
        s.supplier?.code?.toLowerCase().includes(q)
      )
    }
    return list
  }, [settlements, activeFilter, searchText])

  const summary = useMemo(() => ({
    count: settlements.length,
    total_vnd: settlements.reduce((s, st) => s + (st.total_amount_vnd || 0), 0),
    paid_vnd: settlements.reduce((s, st) => s + (st.paid_amount || 0), 0),
    remaining: settlements.reduce((s, st) => s + (st.remaining_amount || 0), 0),
  }), [settlements])

  const filters = [
    { key: 'all', label: 'Tất cả' },
    { key: 'unpaid', label: 'Còn nợ' },
    { key: 'paid', label: 'Đã TT' },
    { key: 'draft', label: 'Nháp' },
    { key: 'approved', label: 'Đã duyệt' },
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
              <h1 className="text-[17px] font-bold leading-tight">💰 Quyết toán TT</h1>
              <p className="text-[11px] text-white/60">Thanh toán NCC mủ</p>
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
                placeholder="Tìm mã QT, NCC..."
                className="w-full pl-10 pr-10 py-2.5 bg-white/10 border border-white/20 rounded-xl text-[15px] text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
                autoFocus />
            </div>
          </div>
        )}
      </div>

      <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />

      {/* FILTER */}
      <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-hide bg-white border-b border-gray-100">
        {filters.map(f => {
          let count = 0
          if (f.key === 'all') count = settlements.length
          else if (f.key === 'unpaid') count = settlements.filter(s => s.payment_status === 'unpaid' || s.payment_status === 'partial').length
          else if (f.key === 'paid') count = settlements.filter(s => s.payment_status === 'paid').length
          else count = settlements.filter(s => s.status === f.key).length

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

      {/* CONTENT */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#1B4D3E] animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <AlertTriangle className="w-10 h-10 text-red-300 mb-3" />
          <p className="text-[14px] text-red-500 mb-3">{error}</p>
          <button type="button" onClick={loadData}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1B4D3E] text-white rounded-xl text-[14px] font-semibold active:scale-[0.97]">
            <RefreshCw className="w-4 h-4" /> Thử lại
          </button>
        </div>
      )}

      {!loading && !error && settlements.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-6">
          <Wallet className="w-12 h-12 text-gray-300 mb-3" />
          <h3 className="text-[15px] font-semibold text-gray-600 mb-1">Chưa có quyết toán</h3>
          <p className="text-[13px] text-gray-400 text-center max-w-[240px]">
            {getMonthLabel(year, month)} chưa có phiếu quyết toán nào
          </p>
        </div>
      )}

      {!loading && !error && settlements.length > 0 && (
        <>
          {/* Summary */}
          <div className="px-4 py-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="text-center">
                  <p className="text-[11px] text-gray-400">Phiếu QT</p>
                  <p className="text-[18px] font-bold font-mono text-gray-800">{summary.count}</p>
                </div>
                <div className="text-center">
                  <p className="text-[11px] text-gray-400">Tổng giá trị</p>
                  <p className="text-[18px] font-bold font-mono text-[#E8A838]">{fmtMoney(summary.total_vnd)}</p>
                </div>
              </div>
              {summary.total_vnd > 0 && (
                <>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden mb-1.5">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                      style={{ width: `${Math.min((summary.paid_vnd / summary.total_vnd) * 100, 100)}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[12px] text-gray-400">
                    <span>Đã TT: <span className="text-emerald-600 font-semibold">{fmtMoney(summary.paid_vnd)}</span></span>
                    <span>Còn nợ: <span className="text-red-500 font-semibold">{fmtMoney(summary.remaining)}</span></span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="px-4 pb-24 space-y-3">
            {displayed.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[13px] text-gray-400">Không tìm thấy kết quả</p>
              </div>
            ) : (
              displayed.map(s => <SettlementCard key={s.id} item={s} onTap={(id) => navigate(`/rubber/settlements/${id}`)} />)
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default RubberSettlementPage