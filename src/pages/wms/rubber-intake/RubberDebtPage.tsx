// ============================================================================
// FILE: src/pages/wms/rubber-intake/RubberDebtPage.tsx
// MODULE: Lý Lịch Mủ — Huy Anh Rubber ERP
// PHASE: P3.5 — Bước 3.5.12 — Công nợ NCC mủ
// BẢNG: rubber_intake_batches, rubber_suppliers
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Wallet, Users, Search, X, RefreshCw, Loader2,
  ChevronRight, Banknote, Scale, FileText, AlertTriangle,
  CheckCircle2, Clock, TrendingDown, Filter,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface SupplierDebt {
  supplier_id: string
  supplier_name: string
  supplier_code: string
  supplier_type: string
  country: string
  total_intakes: number
  total_amount: number
  total_paid: number
  total_debt: number
  unpaid_count: number
  partial_count: number
  last_intake_date: string | null
}

type FilterMode = 'all' | 'has_debt' | 'no_debt'

// ============================================================================
// HELPERS
// ============================================================================

function fmtMoney(a?: number | null): string {
  if (!a || a === 0) return '0đ'
  if (Math.abs(a) >= 1_000_000_000) return `${(a / 1_000_000_000).toFixed(2)} tỷ`
  if (Math.abs(a) >= 1_000_000) return `${(a / 1_000_000).toFixed(1)} tr`
  if (Math.abs(a) >= 1_000) return `${(a / 1_000).toFixed(0)}k`
  return a.toLocaleString('vi-VN') + 'đ'
}

function fmtDate(s?: string | null): string {
  if (!s) return '–'
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const TYPE_CFG: Record<string, { label: string; icon: string }> = {
  tieu_dien: { label: 'Tiểu điền', icon: '🌿' },
  dai_ly: { label: 'Đại lý', icon: '🏪' },
  nong_truong: { label: 'Nông trường', icon: '🏭' },
  cong_ty: { label: 'Công ty', icon: '🏢' },
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const DebtSummaryBar: React.FC<{ suppliers: SupplierDebt[] }> = ({ suppliers }) => {
  const totalDebt = suppliers.reduce((s, d) => s + d.total_debt, 0)
  const totalAmount = suppliers.reduce((s, d) => s + d.total_amount, 0)
  const totalPaid = suppliers.reduce((s, d) => s + d.total_paid, 0)
  const debtCount = suppliers.filter(d => d.total_debt > 0).length

  return (
    <div className="px-4 py-3 space-y-2">
      {/* Main debt */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-4 text-center">
          <p className="text-[12px] text-gray-400 mb-1">Tổng công nợ</p>
          <p className={`text-[28px] font-bold font-mono ${totalDebt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {totalDebt > 0 ? fmtMoney(totalDebt) : 'Hết nợ ✓'}
          </p>
          <p className="text-[12px] text-gray-400 mt-1">
            {debtCount > 0 ? `${debtCount} NCC còn nợ` : 'Tất cả NCC đã thanh toán'}
          </p>
        </div>

        {/* Progress bar */}
        {totalAmount > 0 && (
          <div className="px-4 pb-4">
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min((totalPaid / totalAmount) * 100, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-400">
              <span>Đã TT: {fmtMoney(totalPaid)}</span>
              <span>Tổng: {fmtMoney(totalAmount)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
          <p className="text-[11px] text-gray-400">NCC</p>
          <p className="text-[16px] font-bold text-gray-800 font-mono">{suppliers.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
          <p className="text-[11px] text-gray-400">Còn nợ</p>
          <p className="text-[16px] font-bold text-red-600 font-mono">{debtCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-2.5 text-center">
          <p className="text-[11px] text-gray-400">Hết nợ</p>
          <p className="text-[16px] font-bold text-emerald-600 font-mono">{suppliers.length - debtCount}</p>
        </div>
      </div>
    </div>
  )
}

const SupplierDebtCard: React.FC<{
  data: SupplierDebt
  onTap: (id: string) => void
}> = ({ data, onTap }) => {
  const hasDebt = data.total_debt > 0
  const paidPct = data.total_amount > 0 ? (data.total_paid / data.total_amount) * 100 : 100
  const typeCfg = TYPE_CFG[data.supplier_type] || TYPE_CFG.tieu_dien

  return (
    <button type="button" onClick={() => onTap(data.supplier_id)}
      className="w-full text-left bg-white rounded-[14px] border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:scale-[0.98] transition-transform overflow-hidden">
      <div className="flex">
        <div className={`w-1 shrink-0 rounded-l-[14px] ${hasDebt ? 'bg-red-400' : 'bg-emerald-400'}`} />

        <div className="flex-1 p-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[13px]">{typeCfg.icon}</span>
              <span className="text-[15px] font-bold text-gray-900 truncate">{data.supplier_name}</span>
              {data.country === 'LA' && <span className="text-[12px]">🇱🇦</span>}
            </div>
            <span className="shrink-0 text-[12px] font-mono text-gray-400">{data.supplier_code}</span>
          </div>

          {/* Debt amount */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              {hasDebt ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-red-50 text-red-600">
                  <TrendingDown size={11} /> Còn nợ
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 size={11} /> Hết nợ
                </span>
              )}
              {data.unpaid_count > 0 && (
                <span className="text-[11px] text-orange-500">{data.unpaid_count} chưa TT</span>
              )}
              {data.partial_count > 0 && (
                <span className="text-[11px] text-yellow-600">{data.partial_count} TT 1 phần</span>
              )}
            </div>
            <span className={`text-[16px] font-bold font-mono ${hasDebt ? 'text-red-600' : 'text-emerald-600'}`}>
              {hasDebt ? fmtMoney(data.total_debt) : '0đ'}
            </span>
          </div>

          {/* Progress bar */}
          {data.total_amount > 0 && (
            <div className="mb-2">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    paidPct >= 100 ? 'bg-emerald-400' : paidPct >= 50 ? 'bg-yellow-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${Math.min(paidPct, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1 text-[11px] text-gray-400">
                <span>Đã TT: {fmtMoney(data.total_paid)}</span>
                <span>Tổng: {fmtMoney(data.total_amount)}</span>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between text-[12px] text-gray-400">
            <span className="inline-flex items-center gap-1">
              <FileText className="w-3 h-3" /> {data.total_intakes} phiếu
            </span>
            {data.last_intake_date && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> Gần nhất: {fmtDate(data.last_intake_date)}
              </span>
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

const RubberDebtPage: React.FC = () => {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState<SupplierDebt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  const fetchDebt = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Query all non-cancelled intakes grouped by supplier
      const { data: intakes, error: intakeErr } = await supabase
        .from('rubber_intake_batches')
        .select(`
          supplier_id,
          total_amount,
          paid_amount,
          payment_status,
          status,
          intake_date,
          supplier:rubber_suppliers(id, code, name, supplier_type, country)
        `)
        .neq('status', 'cancelled')
        .not('supplier_id', 'is', null)

      if (intakeErr) throw intakeErr

      // Group by supplier
      const map = new Map<string, SupplierDebt>()

      for (const row of (intakes || [])) {
        const s = row.supplier as any
        if (!s?.id) continue

        if (!map.has(s.id)) {
          map.set(s.id, {
            supplier_id: s.id,
            supplier_name: s.name || '–',
            supplier_code: s.code || '–',
            supplier_type: s.supplier_type || 'tieu_dien',
            country: s.country || 'VN',
            total_intakes: 0,
            total_amount: 0,
            total_paid: 0,
            total_debt: 0,
            unpaid_count: 0,
            partial_count: 0,
            last_intake_date: null,
          })
        }

        const entry = map.get(s.id)!
        entry.total_intakes++
        entry.total_amount += row.total_amount || 0
        entry.total_paid += row.paid_amount || 0

        if (row.payment_status === 'unpaid') entry.unpaid_count++
        if (row.payment_status === 'partial') entry.partial_count++

        if (!entry.last_intake_date || (row.intake_date && row.intake_date > entry.last_intake_date)) {
          entry.last_intake_date = row.intake_date
        }
      }

      // Calculate debt
      const result = Array.from(map.values()).map(d => ({
        ...d,
        total_debt: Math.max(0, d.total_amount - d.total_paid),
      }))

      // Sort: debt DESC, then by name
      result.sort((a, b) => b.total_debt - a.total_debt || a.supplier_name.localeCompare(b.supplier_name))

      setSuppliers(result)
    } catch (err: unknown) {
      console.error('Lỗi tải công nợ:', err)
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDebt() }, [fetchDebt])

  // Filter + Search
  const filtered = useMemo(() => {
    let list = suppliers

    if (filterMode === 'has_debt') list = list.filter(d => d.total_debt > 0)
    if (filterMode === 'no_debt') list = list.filter(d => d.total_debt <= 0)

    if (searchText.trim()) {
      const s = searchText.trim().toLowerCase()
      list = list.filter(d =>
        d.supplier_name.toLowerCase().includes(s) ||
        d.supplier_code.toLowerCase().includes(s)
      )
    }

    return list
  }, [suppliers, filterMode, searchText])

  const handleTapSupplier = (id: string) => {
    navigate(`/rubber/suppliers/${id}`)
  }

  return (
    <div className="min-h-screen bg-[#F7F5F2]" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-3 min-h-[56px]">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100 -ml-2">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <div>
              <h1 className="text-[17px] font-bold text-gray-900 leading-tight">Công nợ NCC mủ</h1>
              <p className="text-[12px] text-gray-400 leading-tight">Theo dõi thanh toán</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={fetchDebt} disabled={loading}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100">
              <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchText('') }}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100">
              {searchOpen ? <X className="w-5 h-5 text-gray-500" /> : <Search className="w-5 h-5 text-gray-500" />}
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
                placeholder="Tìm NCC..."
                className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[15px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/20 focus:border-[#1B4D3E]"
                autoFocus />
              {searchText && (
                <button type="button" onClick={() => setSearchText('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-200">
                  <X className="w-3 h-3 text-gray-500" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filter chips */}
        <div className="flex items-center gap-2 px-4 pb-2.5 overflow-x-auto scrollbar-hide">
          {[
            { key: 'all' as FilterMode, label: 'Tất cả' },
            { key: 'has_debt' as FilterMode, label: 'Còn nợ' },
            { key: 'no_debt' as FilterMode, label: 'Hết nợ' },
          ].map(f => (
            <button key={f.key} type="button" onClick={() => setFilterMode(f.key)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium border transition-all min-h-[36px] ${
                filterMode === f.key
                  ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]'
                  : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
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
          <button type="button" onClick={fetchDebt}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1B4D3E] text-white rounded-xl text-[14px] font-semibold active:scale-[0.97]">
            <RefreshCw className="w-4 h-4" /> Thử lại
          </button>
        </div>
      )}

      {!loading && !error && suppliers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-6">
          <Wallet className="w-12 h-12 text-gray-300 mb-3" />
          <h3 className="text-[15px] font-semibold text-gray-600 mb-1">Chưa có dữ liệu công nợ</h3>
          <p className="text-[13px] text-gray-400 text-center max-w-[240px]">
            Công nợ sẽ hiện khi có phiếu nhập mủ liên kết NCC
          </p>
        </div>
      )}

      {!loading && !error && suppliers.length > 0 && (
        <>
          <DebtSummaryBar suppliers={filtered} />

          <div className="px-4 pb-24 space-y-3">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center py-8">
                <Search className="w-8 h-8 text-gray-300 mb-2" />
                <p className="text-[13px] text-gray-400">Không tìm thấy NCC phù hợp</p>
              </div>
            ) : (
              filtered.map(d => (
                <SupplierDebtCard key={d.supplier_id} data={d} onTap={handleTapSupplier} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default RubberDebtPage