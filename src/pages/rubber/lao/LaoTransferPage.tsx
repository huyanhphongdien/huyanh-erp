// ============================================================================
// FILE: src/pages/rubber/lao/LaoTransferPage.tsx
// MODULE: Thu mua Mủ — Huy Anh Rubber ERP
// PHASE: 3.6 — Chuyển tiền Lào
// BẢNG: lao_fund_transfers + rubber_intake_batches (tính tồn quỹ)
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Loader2, Wallet, Banknote,
  ChevronLeft, ChevronRight, Hash, Calendar, User,
  FileText, CreditCard, ArrowUpRight, TrendingDown,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface FundTransfer {
  id: string
  transfer_code?: string
  transfer_date: string
  amount_lak: number
  fee_lak: number
  net_received_lak: number
  amount_bath: number
  fee_bath: number
  net_received_bath: number
  transfer_method?: string
  reference_no?: string
  receiver_name?: string
  notes?: string
  created_at: string
}

interface Balance {
  total_lak: number
  spent_lak: number
  balance_lak: number
  total_bath: number
  spent_bath: number
  balance_bath: number
}

// ============================================================================
// HELPERS
// ============================================================================

function fmt(n?: number | null): string {
  if (n == null || n === 0) return '0'
  return n.toLocaleString('vi-VN')
}
function fmtShort(n?: number | null): string {
  if (!n) return '0'
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return fmt(n)
}
function fmtDate(s?: string): string {
  if (!s) return '–'
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function getMonthLabel(y: number, m: number) { return `Tháng ${m}/${y}` }

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

const BalanceCards: React.FC<{ balance: Balance }> = ({ balance }) => {
  const lakColor = balance.balance_lak >= 0 ? 'text-emerald-600' : 'text-red-600'
  const bathColor = balance.balance_bath >= 0 ? 'text-emerald-600' : 'text-red-600'

  return (
    <div className="px-4 py-3 space-y-2">
      {/* LAK */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-bold text-gray-700">₭ LAK (Kíp Lào)</span>
          <span className={`text-[20px] font-bold font-mono ${lakColor}`}>{fmtShort(balance.balance_lak)} ₭</span>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-gray-400">
          <span className="inline-flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3 text-emerald-500" /> Chuyển: {fmtShort(balance.total_lak)}
          </span>
          <span className="inline-flex items-center gap-1">
            <TrendingDown className="w-3 h-3 text-red-400" /> Chi: {fmtShort(balance.spent_lak)}
          </span>
        </div>
        {balance.total_lak > 0 && (
          <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
              style={{ width: `${Math.min((balance.spent_lak / balance.total_lak) * 100, 100)}%` }} />
          </div>
        )}
      </div>

      {/* BATH */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-bold text-gray-700">฿ BATH (Bạt Thái)</span>
          <span className={`text-[20px] font-bold font-mono ${bathColor}`}>{fmtShort(balance.balance_bath)} ฿</span>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-gray-400">
          <span className="inline-flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3 text-emerald-500" /> Chuyển: {fmtShort(balance.total_bath)}
          </span>
          <span className="inline-flex items-center gap-1">
            <TrendingDown className="w-3 h-3 text-red-400" /> Chi: {fmtShort(balance.spent_bath)}
          </span>
        </div>
        {balance.total_bath > 0 && (
          <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
              style={{ width: `${Math.min((balance.spent_bath / balance.total_bath) * 100, 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

const TransferCard: React.FC<{ transfer: FundTransfer }> = ({ transfer }) => {
  const hasLak = (transfer.amount_lak || 0) > 0
  const hasBath = (transfer.amount_bath || 0) > 0

  return (
    <div className="bg-white rounded-[14px] border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-gray-900 font-mono">
              {transfer.transfer_code || `#${transfer.id.slice(0, 8)}`}
            </span>
            <span className="text-[12px] text-gray-400">{fmtDate(transfer.transfer_date)}</span>
          </div>
          {transfer.transfer_method && (
            <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-50 text-blue-600">
              {transfer.transfer_method === 'bank_transfer' ? 'CK' : transfer.transfer_method === 'cash' ? 'TM' : transfer.transfer_method}
            </span>
          )}
        </div>

        {/* Amounts */}
        <div className="space-y-2">
          {hasLak && (
            <div className="flex items-center justify-between py-2 px-3 bg-emerald-50/50 rounded-lg">
              <div className="text-[12px] text-gray-500">
                <span className="font-semibold text-emerald-700">₭ LAK</span>
                {transfer.fee_lak > 0 && <span className="ml-2 text-gray-400">Phí: {fmt(transfer.fee_lak)}</span>}
              </div>
              <div className="text-right">
                <p className="text-[15px] font-bold font-mono text-emerald-700">{fmt(transfer.net_received_lak)} ₭</p>
                {transfer.fee_lak > 0 && (
                  <p className="text-[11px] text-gray-400 font-mono">Gửi: {fmt(transfer.amount_lak)}</p>
                )}
              </div>
            </div>
          )}

          {hasBath && (
            <div className="flex items-center justify-between py-2 px-3 bg-blue-50/50 rounded-lg">
              <div className="text-[12px] text-gray-500">
                <span className="font-semibold text-blue-700">฿ BATH</span>
                {transfer.fee_bath > 0 && <span className="ml-2 text-gray-400">Phí: {fmt(transfer.fee_bath)}</span>}
              </div>
              <div className="text-right">
                <p className="text-[15px] font-bold font-mono text-blue-700">{fmt(transfer.net_received_bath)} ฿</p>
                {transfer.fee_bath > 0 && (
                  <p className="text-[11px] text-gray-400 font-mono">Gửi: {fmt(transfer.amount_bath)}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 mt-2.5 text-[12px] text-gray-400 flex-wrap">
          {transfer.receiver_name && (
            <span className="inline-flex items-center gap-1">
              <User className="w-3 h-3" /> {transfer.receiver_name}
            </span>
          )}
          {transfer.reference_no && (
            <span className="inline-flex items-center gap-1">
              <Hash className="w-3 h-3" /> {transfer.reference_no}
            </span>
          )}
          {transfer.notes && (
            <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
              <FileText className="w-3 h-3" /> {transfer.notes}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const LaoTransferPage: React.FC = () => {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [transfers, setTransfers] = useState<FundTransfer[]>([])
  const [balance, setBalance] = useState<Balance>({
    total_lak: 0, spent_lak: 0, balance_lak: 0,
    total_bath: 0, spent_bath: 0, balance_bath: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

      // 1. Transfers for this month
      const { data: tData, error: tErr } = await supabase
        .from('lao_fund_transfers')
        .select('*')
        .gte('transfer_date', startDate)
        .lt('transfer_date', endDate)
        .order('transfer_date', { ascending: false })

      if (tErr) throw tErr
      setTransfers((tData || []) as FundTransfer[])

      // 2. Balance (all time)
      const { data: allTransfers, error: atErr } = await supabase
        .from('lao_fund_transfers')
        .select('net_received_lak, net_received_bath')

      if (atErr) throw atErr

      const totalLak = (allTransfers || []).reduce((s, t) => s + (t.net_received_lak ?? 0), 0)
      const totalBath = (allTransfers || []).reduce((s, t) => s + (t.net_received_bath ?? 0), 0)

      // Spending from lao_direct intakes
      const { data: intakes, error: iErr } = await supabase
        .from('rubber_intake_batches')
        .select('total_amount, price_currency')
        .eq('source_type', 'lao_direct')
        .neq('status', 'cancelled')

      if (iErr) throw iErr

      let spentLak = 0, spentBath = 0
      for (const i of (intakes || [])) {
        if (i.price_currency === 'LAK' || i.price_currency === 'KIP') spentLak += (i.total_amount ?? 0)
        else if (i.price_currency === 'BATH') spentBath += (i.total_amount ?? 0)
      }

      setBalance({
        total_lak: totalLak, spent_lak: spentLak, balance_lak: totalLak - spentLak,
        total_bath: totalBath, spent_bath: spentBath, balance_bath: totalBath - spentBath,
      })
    } catch (err: unknown) {
      console.error('Lỗi tải chuyển tiền Lào:', err)
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { loadData() }, [loadData])

  // Month total
  const monthSummary = useMemo(() => ({
    count: transfers.length,
    lak: transfers.reduce((s, t) => s + (t.net_received_lak || 0), 0),
    bath: transfers.reduce((s, t) => s + (t.net_received_bath || 0), 0),
  }), [transfers])

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
              <h1 className="text-[17px] font-bold leading-tight">🇱🇦 Chuyển tiền Lào</h1>
              <p className="text-[11px] text-white/60">Quỹ thu mua LAK / BATH</p>
            </div>
          </div>
          <button type="button" onClick={loadData} disabled={loading}
            className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* MONTH PICKER */}
      <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m) }} />

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

      {!loading && !error && (
        <>
          {/* Balance cards (toàn bộ, không theo tháng) */}
          <BalanceCards balance={balance} />

          {/* Month summary */}
          {transfers.length > 0 && (
            <div className="mx-4 mb-3 bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between">
              <span className="text-[13px] text-gray-500">{getMonthLabel(year, month)}: {transfers.length} phiếu</span>
              <div className="flex items-center gap-3 text-[13px] font-mono font-semibold">
                {monthSummary.lak > 0 && <span className="text-emerald-700">{fmtShort(monthSummary.lak)} ₭</span>}
                {monthSummary.bath > 0 && <span className="text-blue-700">{fmtShort(monthSummary.bath)} ฿</span>}
              </div>
            </div>
          )}

          {/* Transfer list */}
          {transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <Wallet className="w-12 h-12 text-gray-300 mb-3" />
              <h3 className="text-[15px] font-semibold text-gray-600 mb-1">Chưa có phiếu chuyển tiền</h3>
              <p className="text-[13px] text-gray-400 text-center max-w-[240px]">
                {getMonthLabel(year, month)} chưa có chuyển tiền nào sang Lào
              </p>
            </div>
          ) : (
            <div className="px-4 pb-24 space-y-3">
              {transfers.map(t => <TransferCard key={t.id} transfer={t} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default LaoTransferPage