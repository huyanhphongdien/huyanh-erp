// ============================================================================
// FILE: src/pages/rubber/lao/LaoShipmentPage.tsx
// MODULE: Thu mua Mủ — Huy Anh Rubber ERP
// PHASE: 3.6 — Xuất kho Lào → Nhà máy VN
// BẢNG: lao_shipments
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Loader2, Truck, Scale, Banknote,
  ChevronLeft, ChevronRight, MapPin, Clock, CheckCircle2,
  XCircle, Package, ChevronRight as ChevRight, Hash,
  Navigation, Calendar, AlertTriangle,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface LaoShipment {
  id: string
  shipment_code?: string
  shipment_date: string
  total_weight_kg?: number
  lot_codes?: string[]
  vehicle_plate?: string
  loading_cost_lak?: number
  loading_cost_bath?: number
  transport_cost_vnd?: number
  departed_at?: string
  arrived_at?: string
  arrived_date?: string
  status: string
  stock_in_id?: string
  notes?: string
  created_at: string
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
function fmtMoney(a?: number | null): string {
  if (!a) return '–'
  if (a >= 1e6) return `${(a / 1e6).toFixed(1)} tr`
  if (a >= 1e3) return `${(a / 1e3).toFixed(0)}k`
  return fmt(a)
}
function fmtDate(s?: string): string {
  if (!s) return '–'
  return new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}
function fmtDateTime(s?: string): string {
  if (!s) return '–'
  return new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function getMonthLabel(y: number, m: number) { return `Tháng ${m}/${y}` }

const STATUS_CFG: Record<string, { label: string; icon: React.ReactNode; className: string; border: string }> = {
  preparing:  { label: 'Đang chuẩn bị', icon: <Package size={12} />,       className: 'bg-yellow-50 text-yellow-700', border: '#EAB308' },
  in_transit: { label: 'Đang vận chuyển', icon: <Truck size={12} />,       className: 'bg-blue-50 text-blue-700',     border: '#2563EB' },
  arrived:    { label: 'Đã đến NM', icon: <CheckCircle2 size={12} />,      className: 'bg-emerald-50 text-emerald-700', border: '#16A34A' },
  cancelled:  { label: 'Đã hủy', icon: <XCircle size={12} />,             className: 'bg-red-50 text-red-600',       border: '#DC2626' },
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

const SummaryCards: React.FC<{ shipments: LaoShipment[] }> = ({ shipments }) => {
  const active = shipments.filter(s => s.status !== 'cancelled')
  const totalKg = active.reduce((s, sh) => s + (sh.total_weight_kg || 0), 0)
  const arrivedCount = active.filter(s => s.status === 'arrived').length
  const inTransitCount = active.filter(s => s.status === 'in_transit').length
  const totalTransportVnd = active.reduce((s, sh) => s + (sh.transport_cost_vnd || 0), 0)

  return (
    <div className="px-4 py-3 grid grid-cols-2 gap-2">
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
        <p className="text-[11px] text-gray-400">Chuyến xe</p>
        <p className="text-[18px] font-bold text-gray-800 font-mono">{active.length}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
        <p className="text-[11px] text-gray-400">Tổng KL</p>
        <p className="text-[18px] font-bold text-[#1B4D3E] font-mono">{fmtWeight(totalKg)}</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
        <p className="text-[11px] text-gray-400">Đã đến NM</p>
        <p className="text-[18px] font-bold text-emerald-600 font-mono">{arrivedCount}</p>
        {inTransitCount > 0 && <p className="text-[11px] text-blue-500">{inTransitCount} đang đi</p>}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
        <p className="text-[11px] text-gray-400">CP vận chuyển</p>
        <p className="text-[16px] font-bold text-[#E8A838] font-mono">{fmtMoney(totalTransportVnd)}</p>
      </div>
    </div>
  )
}

const ShipmentCard: React.FC<{ shipment: LaoShipment }> = ({ shipment }) => {
  const sCfg = STATUS_CFG[shipment.status] || STATUS_CFG.preparing
  const lots = shipment.lot_codes || []

  return (
    <div className="bg-white rounded-[14px] border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="flex">
        <div className="w-1 shrink-0 rounded-l-[14px]" style={{ backgroundColor: sCfg.border }} />
        <div className="flex-1 p-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-gray-900 font-mono">
                {shipment.shipment_code || `#${shipment.id.slice(0, 8)}`}
              </span>
              <span className="text-[12px] text-gray-400">{fmtDate(shipment.shipment_date)}</span>
            </div>
            <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full ${sCfg.className}`}>
              {sCfg.icon} {sCfg.label}
            </span>
          </div>

          {/* Vehicle + Weight */}
          <div className="flex items-center gap-3 text-[13px] text-gray-600 mb-2 flex-wrap">
            {shipment.vehicle_plate && (
              <span className="inline-flex items-center gap-1 font-semibold">
                <Truck className="w-4 h-4 text-gray-400" /> {shipment.vehicle_plate}
              </span>
            )}
            {shipment.total_weight_kg != null && (
              <span className="inline-flex items-center gap-1">
                <Scale className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-mono font-semibold text-[#1B4D3E]">{fmtWeight(shipment.total_weight_kg)}</span>
              </span>
            )}
          </div>

          {/* Lot codes */}
          {lots.length > 0 && (
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <Hash className="w-3 h-3 text-gray-400" />
              {lots.map((code, i) => (
                <span key={i} className="px-2 py-0.5 text-[11px] font-mono font-medium bg-gray-50 text-gray-600 rounded-md border border-gray-100">
                  {code}
                </span>
              ))}
            </div>
          )}

          {/* Timeline */}
          <div className="space-y-1 mb-2">
            {shipment.departed_at && (
              <div className="flex items-center gap-2 text-[12px]">
                <Navigation className="w-3 h-3 text-blue-500" />
                <span className="text-gray-400">Xuất phát:</span>
                <span className="font-medium text-gray-600">{fmtDateTime(shipment.departed_at)}</span>
              </div>
            )}
            {shipment.arrived_at && (
              <div className="flex items-center gap-2 text-[12px]">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span className="text-gray-400">Đến NM:</span>
                <span className="font-medium text-emerald-700">{fmtDateTime(shipment.arrived_at)}</span>
              </div>
            )}
            {shipment.status === 'in_transit' && !shipment.arrived_at && (
              <div className="flex items-center gap-2 text-[12px]">
                <Truck className="w-3 h-3 text-blue-500 animate-pulse" />
                <span className="text-blue-600 font-medium">Đang trên đường...</span>
              </div>
            )}
          </div>

          {/* Costs */}
          {((shipment.loading_cost_lak || 0) > 0 || (shipment.loading_cost_bath || 0) > 0 || (shipment.transport_cost_vnd || 0) > 0) && (
            <div className="flex items-center gap-3 text-[12px] text-gray-400 pt-2 border-t border-gray-50 flex-wrap">
              <span className="text-gray-500 font-medium">Chi phí:</span>
              {(shipment.loading_cost_lak || 0) > 0 && (
                <span className="text-emerald-600 font-mono">{fmt(shipment.loading_cost_lak)} ₭</span>
              )}
              {(shipment.loading_cost_bath || 0) > 0 && (
                <span className="text-blue-600 font-mono">{fmt(shipment.loading_cost_bath)} ฿</span>
              )}
              {(shipment.transport_cost_vnd || 0) > 0 && (
                <span className="text-[#E8A838] font-mono">{fmtMoney(shipment.transport_cost_vnd)} ₫</span>
              )}
            </div>
          )}

          {/* Notes */}
          {shipment.notes && (
            <p className="text-[12px] text-gray-400 mt-1.5 truncate">{shipment.notes}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const LaoShipmentPage: React.FC = () => {
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [shipments, setShipments] = useState<LaoShipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState('all')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

      const { data, error: qErr } = await supabase
        .from('lao_shipments')
        .select('*')
        .gte('shipment_date', startDate)
        .lt('shipment_date', endDate)
        .order('shipment_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (qErr) throw qErr
      setShipments((data || []) as LaoShipment[])
    } catch (err: unknown) {
      console.error('Lỗi tải xuất kho Lào:', err)
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { loadData() }, [loadData])

  const displayed = useMemo(() => {
    if (activeFilter === 'all') return shipments
    return shipments.filter(s => s.status === activeFilter)
  }, [shipments, activeFilter])

  const filters = [
    { key: 'all', label: 'Tất cả' },
    { key: 'preparing', label: 'Chuẩn bị' },
    { key: 'in_transit', label: 'Đang đi' },
    { key: 'arrived', label: 'Đã đến' },
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
              <h1 className="text-[17px] font-bold leading-tight">🚛 Xuất kho Lào→NM</h1>
              <p className="text-[11px] text-white/60">Vận chuyển mủ về nhà máy</p>
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

      {/* FILTER CHIPS */}
      <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-hide bg-white border-b border-gray-100">
        {filters.map(f => {
          const count = f.key === 'all' ? shipments.length : shipments.filter(s => s.status === f.key).length
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

      {!loading && !error && shipments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-6">
          <div className="w-16 h-16 mb-4 rounded-full bg-blue-50 flex items-center justify-center">
            <Truck className="w-8 h-8 text-blue-300" />
          </div>
          <h3 className="text-[15px] font-semibold text-gray-600 mb-1">Chưa có chuyến xuất kho</h3>
          <p className="text-[13px] text-gray-400 text-center max-w-[240px]">
            {getMonthLabel(year, month)} chưa có chuyến vận chuyển mủ từ Lào về nhà máy
          </p>
        </div>
      )}

      {!loading && !error && shipments.length > 0 && (
        <>
          <SummaryCards shipments={displayed} />
          <div className="px-4 pb-24 space-y-3">
            {displayed.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[13px] text-gray-400">Không có chuyến phù hợp bộ lọc</p>
              </div>
            ) : (
              displayed.map(s => <ShipmentCard key={s.id} shipment={s} />)
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default LaoShipmentPage