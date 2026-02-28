// ============================================================================
// FILE: src/pages/rubber/RubberPurchaseSummaryPage.tsx
// MODULE: Thu mua Mủ — Huy Anh Rubber ERP
// REDESIGN: Premium Dark Dashboard — Tổng hợp thu mua theo tháng
// BẢNG: rubber_intake_batches, lao_fund_transfers, lao_shipments, rubber_settlements
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  Truck, Package, AlertTriangle, ChevronRight as ChevR,
  Wallet, CircleDollarSign, Droplets,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface SourceData {
  source_type: string; count: number; supplier_count: number
  total_ton: number; total_kg: number
  total_amount_vnd: number; total_amount_foreign: number; currency: string
  finished_ton: number; avg_drc: number
}
interface DebtInfo { total_debt: number; suppliers_with_debt: number; total_suppliers: number }
interface FundBalance { total_lak: number; spent_lak: number; balance_lak: number; total_bath: number; spent_bath: number; balance_bath: number }
interface ShipmentInfo { count: number; total_kg: number; arrived: number; in_transit: number }

// ============================================================================
// HELPERS
// ============================================================================

function fmt(n?: number | null): string { if (n == null || n === 0) return '0'; return n.toLocaleString('vi-VN') }
function fmtTon(t?: number | null): string { if (!t) return '0T'; return `${t.toFixed(2)}T` }
function fmtWeight(kg?: number | null): string { if (!kg) return '0'; if (kg >= 1000) return `${(kg / 1000).toFixed(1)}T`; return `${fmt(Math.round(kg))} kg` }
function fmtMoney(a?: number | null): string { if (!a) return '0đ'; if (Math.abs(a) >= 1e9) return `${(a / 1e9).toFixed(2)} tỷ`; if (Math.abs(a) >= 1e6) return `${(a / 1e6).toFixed(1)} tr`; return fmt(a) + 'đ' }
function fmtForeign(a?: number | null, c?: string): string { if (!a) return '0'; const sym = c === 'BATH' ? '฿' : (c === 'LAK' || c === 'KIP') ? '₭' : ''; if (Math.abs(a) >= 1e6) return `${(a / 1e6).toFixed(1)}M ${sym}`; if (Math.abs(a) >= 1e3) return `${(a / 1e3).toFixed(0)}K ${sym}`; return fmt(a) + ` ${sym}` }
function pct(part: number, total: number): number { return total > 0 ? Math.round((part / total) * 100) : 0 }

const MONTHS_VN = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']

const SRC: Record<string, { label: string; emoji: string; gradient: string; path: string }> = {
  vietnam: { label: 'Mủ Việt Nam', emoji: '🇻🇳', gradient: 'from-[#1B4D3E] to-[#2D8B6E]', path: '/rubber/vn/batches' },
  lao_direct: { label: 'Lào trực tiếp', emoji: '🇱🇦', gradient: 'from-[#0F766E] to-[#14B8A6]', path: '/rubber/lao/purchases' },
  lao_agent: { label: 'Lào đại lý', emoji: '🤝', gradient: 'from-[#B45309] to-[#F59E0B]', path: '/rubber/lao/purchases' },
}

// ============================================================================
// MAIN
// ============================================================================

const RubberPurchaseSummaryPage: React.FC = () => {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [sources, setSources] = useState<SourceData[]>([])
  const [debt, setDebt] = useState<DebtInfo>({ total_debt: 0, suppliers_with_debt: 0, total_suppliers: 0 })
  const [fund, setFund] = useState<FundBalance>({ total_lak: 0, spent_lak: 0, balance_lak: 0, total_bath: 0, spent_bath: 0, balance_bath: 0 })
  const [ship, setShip] = useState<ShipmentInfo>({ count: 0, total_kg: 0, arrived: 0, in_transit: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const prevMonth = () => { if (month === 1) { setYear(year - 1); setMonth(12) } else setMonth(month - 1) }
  const nextMonth = () => { if (month === 12) { setYear(year + 1); setMonth(1) } else setMonth(month + 1) }

  const loadData = useCallback(async () => {
    try {
      setLoading(true); setError(null)
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

      const { data: batches, error: bErr } = await supabase
        .from('rubber_intake_batches')
        .select('source_type, supplier_id, settled_qty_ton, purchase_qty_kg, total_amount, total_amount_vnd, price_currency, finished_product_ton, drc_percent, status')
        .gte('intake_date', startDate).lt('intake_date', endDate).neq('status', 'cancelled')
      if (bErr) throw bErr

      const map: Record<string, SourceData> = {}
      const allSup = new Set<string>()
      for (const b of (batches || [])) {
        const src = b.source_type || 'vietnam'
        if (!map[src]) map[src] = { source_type: src, count: 0, supplier_count: 0, total_ton: 0, total_kg: 0, total_amount_vnd: 0, total_amount_foreign: 0, currency: '', finished_ton: 0, avg_drc: 0 }
        const e = map[src]; e.count++; e.total_ton += b.settled_qty_ton || 0; e.total_kg += b.purchase_qty_kg || 0; e.finished_ton += b.finished_product_ton || 0
        if (src === 'vietnam') { e.total_amount_vnd += b.total_amount || 0 } else { e.total_amount_foreign += b.total_amount || 0; e.total_amount_vnd += b.total_amount_vnd || 0; if (b.price_currency) e.currency = b.price_currency }
        if (b.supplier_id) allSup.add(b.supplier_id)
      }
      for (const src of Object.keys(map)) {
        const ids = new Set((batches || []).filter(b => b.source_type === src && b.supplier_id).map(b => b.supplier_id))
        map[src].supplier_count = ids.size
        const drcs = (batches || []).filter(b => b.source_type === src && b.drc_percent).map(b => b.drc_percent!)
        map[src].avg_drc = drcs.length > 0 ? drcs.reduce((a, c) => a + c, 0) / drcs.length : 0
      }
      setSources(['vietnam', 'lao_direct', 'lao_agent'].map(s => map[s]).filter(Boolean))

      const { data: stl } = await supabase.from('rubber_settlements').select('supplier_id, remaining_amount').neq('status', 'cancelled')
      const td = (stl || []).reduce((s, r) => s + (r.remaining_amount || 0), 0)
      const ds = new Set((stl || []).filter(s => (s.remaining_amount || 0) > 0).map(s => s.supplier_id))
      setDebt({ total_debt: td, suppliers_with_debt: ds.size, total_suppliers: allSup.size })

      const { data: tr } = await supabase.from('lao_fund_transfers').select('net_received_lak, net_received_bath')
      const tL = (tr || []).reduce((s, t) => s + (t.net_received_lak ?? 0), 0)
      const tB = (tr || []).reduce((s, t) => s + (t.net_received_bath ?? 0), 0)
      const { data: li } = await supabase.from('rubber_intake_batches').select('total_amount, price_currency').eq('source_type', 'lao_direct').neq('status', 'cancelled')
      let sL = 0, sB = 0
      for (const i of (li || [])) { if (i.price_currency === 'LAK' || i.price_currency === 'KIP') sL += (i.total_amount ?? 0); else if (i.price_currency === 'BATH') sB += (i.total_amount ?? 0) }
      setFund({ total_lak: tL, spent_lak: sL, balance_lak: tL - sL, total_bath: tB, spent_bath: sB, balance_bath: tB - sB })

      const { data: sh } = await supabase.from('lao_shipments').select('total_weight_kg, status').gte('shipment_date', startDate).lt('shipment_date', endDate).neq('status', 'cancelled')
      setShip({ count: (sh || []).length, total_kg: (sh || []).reduce((s, x) => s + (x.total_weight_kg || 0), 0), arrived: (sh || []).filter(s => s.status === 'arrived').length, in_transit: (sh || []).filter(s => s.status === 'in_transit').length })
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Lỗi') } finally { setLoading(false) }
  }, [year, month])

  useEffect(() => { loadData() }, [loadData])

  const grand = useMemo(() => ({
    count: sources.reduce((s, d) => s + d.count, 0),
    suppliers: sources.reduce((s, d) => s + d.supplier_count, 0),
    finished: sources.reduce((s, d) => s + d.finished_ton, 0),
    vnd: sources.reduce((s, d) => s + d.total_amount_vnd, 0),
  }), [sources])

  return (
    <div className="min-h-screen bg-[#0C0E12]" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-[#0C0E12]/95 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl text-white/60 hover:bg-white/[0.06] active:scale-95 transition-all"><ArrowLeft className="w-5 h-5" /></button>
            <div>
              <h1 className="text-[17px] font-bold text-white tracking-tight">Tổng hợp thu mua</h1>
              <p className="text-[11px] text-white/40">Dashboard — Tất cả nguồn</p>
            </div>
          </div>
          <button type="button" onClick={loadData} disabled={loading} className="w-10 h-10 flex items-center justify-center rounded-xl text-white/50 hover:bg-white/[0.06] active:scale-95 transition-all"><RefreshCw className={`w-[18px] h-[18px] ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
        <div className="flex items-center justify-center gap-2 pb-3">
          <button type="button" onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.06] active:scale-90 transition-all"><ChevronLeft className="w-5 h-5" /></button>
          <div className="min-w-[140px] text-center">
            <span className="text-[15px] font-semibold text-white">{MONTHS_VN[month]}</span>
            <span className="text-[15px] text-white/40 ml-1.5">{year}</span>
          </div>
          <button type="button" onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-lg text-white/40 hover:bg-white/[0.06] active:scale-90 transition-all"><ChevronRight className="w-5 h-5" /></button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24"><Loader2 className="w-8 h-8 text-white/30 animate-spin mb-3" /><p className="text-[13px] text-white/30">Đang tải...</p></div>
      ) : error ? (
        <div className="flex flex-col items-center py-16 px-6"><AlertTriangle className="w-10 h-10 text-red-400/60 mb-3" /><p className="text-[14px] text-red-400 mb-4">{error}</p><button type="button" onClick={loadData} className="px-5 py-2.5 bg-white/10 text-white rounded-xl text-[14px] active:scale-95">Thử lại</button></div>
      ) : (
        <div className="px-4 pt-4 pb-24 space-y-4">

          {/* HERO */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1B4D3E] via-[#1B4D3E] to-[#0F766E] p-5">
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/[0.04]" />
            <div className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full bg-white/[0.03]" />
            <div className="relative z-10">
              <p className="text-[12px] text-white/50 font-medium tracking-wide uppercase mb-4">{MONTHS_VN[month]} {year} — Tổng cộng</p>
              <div className="grid grid-cols-3 gap-4 mb-5">
                <div><p className="text-[11px] text-white/40 mb-0.5">Phiếu nhập</p><p className="text-[28px] font-bold text-white leading-none font-mono">{grand.count}</p></div>
                <div><p className="text-[11px] text-white/40 mb-0.5">NCC</p><p className="text-[28px] font-bold text-white leading-none font-mono">{grand.suppliers}</p></div>
                <div><p className="text-[11px] text-white/40 mb-0.5">Thành phẩm</p><p className="text-[28px] font-bold text-white leading-none font-mono">{fmtTon(grand.finished)}</p></div>
              </div>
              <div className="pt-4 border-t border-white/10">
                <p className="text-[11px] text-white/40 mb-1">Tổng giá trị (VND)</p>
                <p className="text-[32px] font-extrabold text-[#E8A838] leading-none font-mono tracking-tight">{fmtMoney(grand.vnd)}</p>
              </div>
            </div>
          </div>

          {/* SOURCE CARDS */}
          {sources.map(src => {
            const cfg = SRC[src.source_type] || SRC.vietnam
            const isVn = src.source_type === 'vietnam'
            const mainQty = isVn ? fmtTon(src.total_ton) : fmtWeight(src.total_kg)
            const share = grand.finished > 0 ? pct(src.finished_ton, grand.finished) : 0

            return (
              <button key={src.source_type} type="button" onClick={() => navigate(cfg.path)}
                className="w-full text-left group active:scale-[0.98] transition-transform">
                <div className="relative overflow-hidden rounded-2xl bg-[#15171C] border border-white/[0.06] hover:border-white/[0.12] transition-colors">
                  <div className={`h-1 bg-gradient-to-r ${cfg.gradient}`} />
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[20px]">{cfg.emoji}</span>
                        <div>
                          <h3 className="text-[15px] font-bold text-white">{cfg.label}</h3>
                          <p className="text-[11px] text-white/30">{src.count} phiếu · {src.supplier_count} NCC</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {share > 0 && <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-white/[0.06] text-white/50">{share}%</span>}
                        <ChevR className="w-4 h-4 text-white/20 group-hover:text-white/40" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <div>
                        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">{isVn ? 'KL chốt' : 'KL mua'}</p>
                        <p className="text-[20px] font-bold text-white font-mono leading-tight">{mainQty}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Thành phẩm</p>
                        <p className="text-[20px] font-bold text-emerald-400 font-mono leading-tight">{fmtTon(src.finished_ton)}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-0.5">Tổng tiền</p>
                        <div className="flex items-baseline gap-2">
                          <span className="text-[22px] font-bold text-[#E8A838] font-mono leading-tight">
                            {isVn ? fmtMoney(src.total_amount_vnd) : fmtForeign(src.total_amount_foreign, src.currency)}
                          </span>
                          {!isVn && src.total_amount_vnd > 0 && <span className="text-[12px] text-white/25 font-mono">≈ {fmtMoney(src.total_amount_vnd)}</span>}
                        </div>
                      </div>
                      {src.avg_drc > 0 && (
                        <div className="col-span-2 flex items-center gap-2 pt-1">
                          <Droplets className="w-3.5 h-3.5 text-white/20" />
                          <span className="text-[12px] text-white/40">DRC TB: <span className="text-white/70 font-mono font-semibold">{src.avg_drc.toFixed(1)}%</span></span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}

          {sources.length === 0 && (
            <div className="rounded-2xl bg-[#15171C] border border-white/[0.06] p-8 text-center">
              <Package className="w-10 h-10 text-white/15 mx-auto mb-3" />
              <p className="text-[14px] text-white/40">Chưa có dữ liệu thu mua tháng này</p>
            </div>
          )}

          {/* FUND + DEBT */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#15171C] border border-white/[0.06] p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center"><Wallet className="w-4 h-4 text-emerald-400" /></div>
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Tồn quỹ Lào</span>
              </div>
              <div className="space-y-2.5">
                <div>
                  <div className="flex items-center justify-between mb-0.5"><span className="text-[10px] text-white/30">₭ LAK</span><span className={`text-[14px] font-bold font-mono ${fund.balance_lak >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtForeign(fund.balance_lak, 'LAK')}</span></div>
                  {fund.total_lak > 0 && <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden"><div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${Math.min(pct(fund.spent_lak, fund.total_lak), 100)}%` }} /></div>}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-0.5"><span className="text-[10px] text-white/30">฿ BATH</span><span className={`text-[14px] font-bold font-mono ${fund.balance_bath >= 0 ? 'text-blue-400' : 'text-red-400'}`}>{fmtForeign(fund.balance_bath, 'BATH')}</span></div>
                  {fund.total_bath > 0 && <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden"><div className="h-full rounded-full bg-blue-500/60" style={{ width: `${Math.min(pct(fund.spent_bath, fund.total_bath), 100)}%` }} /></div>}
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-[#15171C] border border-white/[0.06] p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${debt.total_debt > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}><CircleDollarSign className={`w-4 h-4 ${debt.total_debt > 0 ? 'text-red-400' : 'text-emerald-400'}`} /></div>
                <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Công nợ</span>
              </div>
              <div>
                <p className="text-[10px] text-white/30 mb-0.5">Tổng nợ</p>
                <p className={`text-[18px] font-bold font-mono leading-tight mb-2 ${debt.total_debt > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{debt.total_debt > 0 ? fmtMoney(debt.total_debt) : 'Hết nợ ✓'}</p>
                <div className="flex items-center justify-between"><span className="text-[10px] text-white/30">NCC còn nợ</span><span className="text-[13px] font-bold text-white/60 font-mono">{debt.suppliers_with_debt}/{debt.total_suppliers}</span></div>
              </div>
            </div>
          </div>

          {/* SHIPMENT */}
          {ship.count > 0 && (
            <button type="button" onClick={() => navigate('/rubber/lao/shipments')} className="w-full text-left active:scale-[0.98] transition-transform group">
              <div className="rounded-2xl bg-[#15171C] border border-white/[0.06] hover:border-white/[0.12] overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-blue-600 to-purple-600" />
                <div className="p-4 flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0"><Truck className="w-5 h-5 text-blue-400" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-white mb-0.5">Vận chuyển Lào → NM</p>
                    <div className="flex items-center gap-3 text-[12px] text-white/40">
                      <span>{ship.count} chuyến</span><span className="font-mono text-white/60">{fmtWeight(ship.total_kg)}</span>
                      {ship.arrived > 0 && <span className="text-emerald-400">{ship.arrived} đã đến</span>}
                      {ship.in_transit > 0 && <span className="text-blue-400">{ship.in_transit} đang đi</span>}
                    </div>
                  </div>
                  <ChevR className="w-4 h-4 text-white/15 group-hover:text-white/30 shrink-0" />
                </div>
              </div>
            </button>
          )}

          {/* QUICK NAV */}
          <div className="rounded-2xl bg-[#15171C] border border-white/[0.06] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.04]"><span className="text-[12px] font-semibold text-white/40 uppercase tracking-wider">Truy cập nhanh</span></div>
            {[
              { icon: '🇻🇳', label: 'Chốt mủ Việt', sub: 'Bảng chốt theo tháng', path: '/rubber/vn/batches' },
              { icon: '💸', label: 'Chuyển tiền Lào', sub: 'Quỹ LAK / BATH', path: '/rubber/lao/transfers' },
              { icon: '🇱🇦', label: 'Thu mua Lào', sub: 'Trực tiếp & đại lý', path: '/rubber/lao/purchases' },
              { icon: '🚛', label: 'Xuất kho Lào→NM', sub: 'Tracking vận chuyển', path: '/rubber/lao/shipments' },
              { icon: '📋', label: 'Lý lịch phiếu', sub: 'CL.BMQT.KH.01.01', path: '/rubber/profiles' },
              { icon: '💰', label: 'Quyết toán', sub: 'Thanh toán NCC', path: '/rubber/settlements' },
            ].map((link, i) => (
              <button key={i} type="button" onClick={() => navigate(link.path)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.03] last:border-0 hover:bg-white/[0.02] active:bg-white/[0.04] transition-colors group">
                <span className="text-[18px] w-8 text-center">{link.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-white/80 group-hover:text-white transition-colors">{link.label}</p>
                  <p className="text-[11px] text-white/25">{link.sub}</p>
                </div>
                <ChevR className="w-4 h-4 text-white/10 group-hover:text-white/25" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default RubberPurchaseSummaryPage