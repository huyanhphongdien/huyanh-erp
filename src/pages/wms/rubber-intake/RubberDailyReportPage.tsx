// ============================================================================
// FILE: src/pages/wms/rubber-intake/RubberDailyReportPage.tsx
// MODULE: Lý Lịch Mủ — Huy Anh Rubber ERP
// PHASE: P3.5 — Bước 3.5.10 — Báo cáo nhập mủ theo ngày
// BẢNG: rubber_intake_batches (qua rubberIntakeService)
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Calendar, Scale, Droplets, Banknote, Users,
  Truck, ChevronLeft, ChevronRight, RefreshCw, Loader2,
  FileBarChart, ClipboardList, MapPin, FlaskConical, Hash,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import rubberIntakeService from '../../../services/rubber/rubberIntakeService'
import type { RubberIntake } from '../../../services/rubber/rubberIntakeService'

// ============================================================================
// HELPERS
// ============================================================================

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDateVN(s: string): string {
  const d = new Date(s + 'T00:00:00')
  const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
  return `${days[d.getDay()]}, ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
}

function shiftDate(dateStr: string, delta: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

function fmt(n?: number | null): string {
  if (n === undefined || n === null || n === 0) return '–'
  return n.toLocaleString('vi-VN')
}

function fmtWeight(kg?: number | null): string {
  if (!kg) return '–'
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} tấn`
  return `${fmt(Math.round(kg))} kg`
}

function fmtTon(t?: number | null): string {
  if (!t) return '–'
  return `${t.toFixed(3)} tấn`
}

function fmtMoney(a?: number | null): string {
  if (!a) return '–'
  if (a >= 1_000_000_000) return `${(a / 1_000_000_000).toFixed(2)} tỷ`
  if (a >= 1_000_000) return `${(a / 1_000_000).toFixed(1)} tr`
  if (a >= 1_000) return `${(a / 1_000).toFixed(0)}k`
  return fmt(a)
}

function fmtPercent(p?: number | null): string {
  if (!p) return '–'
  return `${p.toFixed(1)}%`
}

const SOURCE_CFG: Record<string, { label: string; flag: string; color: string }> = {
  vietnam: { label: 'Việt', flag: '🇻🇳', color: '#1B4D3E' },
  lao_direct: { label: 'Lào TT', flag: '🇱🇦', color: '#2D8B6E' },
  lao_agent: { label: 'Lào ĐL', flag: '🤝', color: '#E8A838' },
}

const STATUS_CFG: Record<string, { label: string; className: string }> = {
  draft: { label: 'Nháp', className: 'bg-gray-100 text-gray-600' },
  confirmed: { label: 'Đã XN', className: 'bg-emerald-50 text-emerald-700' },
  settled: { label: 'Đã chốt', className: 'bg-blue-50 text-blue-700' },
  cancelled: { label: 'Đã hủy', className: 'bg-red-50 text-red-600' },
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Date picker row */
const DatePicker: React.FC<{
  date: string
  onChange: (d: string) => void
  loading: boolean
}> = ({ date, onChange, loading }) => {
  const isToday = date === todayStr()
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
      <button type="button" onClick={() => onChange(shiftDate(date, -1))}
        className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100">
        <ChevronLeft className="w-5 h-5 text-gray-600" />
      </button>

      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[15px] font-bold text-gray-900">{formatDateVN(date)}</span>
        {isToday && <span className="text-[11px] text-emerald-600 font-medium">Hôm nay</span>}
      </div>

      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(shiftDate(date, 1))}
          disabled={date >= todayStr()}
          className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100 disabled:opacity-30">
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
        {!isToday && (
          <button type="button" onClick={() => onChange(todayStr())}
            className="px-3 py-1.5 text-[12px] font-medium text-[#1B4D3E] bg-emerald-50 rounded-lg active:bg-emerald-100">
            Hôm nay
          </button>
        )}
      </div>
    </div>
  )
}

/** Summary cards */
const SummaryCards: React.FC<{
  intakes: RubberIntake[]
  summary: { count: number; total_gross: number; total_net: number; total_finished: number; total_amount: number; supplier_count: number }
}> = ({ intakes, summary }) => {
  const activeIntakes = intakes.filter(i => i.status !== 'cancelled')

  // Group by source_type
  const bySource = useMemo(() => {
    const map: Record<string, { count: number; net: number; amount: number }> = {}
    activeIntakes.forEach(i => {
      const src = i.source_type || 'vietnam'
      if (!map[src]) map[src] = { count: 0, net: 0, amount: 0 }
      map[src].count++
      map[src].net += i.net_weight_kg || 0
      map[src].amount += i.total_amount || 0
    })
    return map
  }, [activeIntakes])

  return (
    <div className="px-4 py-3 space-y-3">
      {/* Main summary row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <p className="text-[11px] text-gray-400 mb-0.5">Phiếu nhập</p>
          <p className="text-[20px] font-bold text-[#1B4D3E]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {summary.count}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <p className="text-[11px] text-gray-400 mb-0.5">NCC</p>
          <p className="text-[20px] font-bold text-gray-800" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {summary.supplier_count}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <p className="text-[11px] text-gray-400 mb-0.5">Tổng tiền</p>
          <p className="text-[16px] font-bold text-[#E8A838]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtMoney(summary.total_amount)}
          </p>
        </div>
      </div>

      {/* Weight summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <p className="text-[11px] text-gray-400 mb-0.5">KL tươi</p>
          <p className="text-[14px] font-bold text-gray-700" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtWeight(summary.total_gross)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <p className="text-[11px] text-gray-400 mb-0.5">KL nhập</p>
          <p className="text-[14px] font-bold text-[#1B4D3E]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtWeight(summary.total_net)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
          <p className="text-[11px] text-gray-400 mb-0.5">Thành phẩm</p>
          <p className="text-[14px] font-bold text-emerald-700" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {fmtTon(summary.total_finished)}
          </p>
        </div>
      </div>

      {/* Source breakdown */}
      {Object.keys(bySource).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-50 flex items-center gap-2">
            <FileBarChart size={14} className="text-gray-400" />
            <span className="text-[12px] font-semibold text-gray-500">Theo nguồn</span>
          </div>
          <div className="divide-y divide-gray-50">
            {Object.entries(bySource).map(([src, data]) => {
              const cfg = SOURCE_CFG[src] || SOURCE_CFG.vietnam
              return (
                <div key={src} className="flex items-center justify-between px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px]">{cfg.flag}</span>
                    <span className="text-[13px] font-medium text-gray-700">{cfg.label}</span>
                    <span className="text-[11px] text-gray-400">{data.count} phiếu</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-mono font-semibold" style={{ color: cfg.color }}>
                      {fmtWeight(data.net)}
                    </span>
                    <span className="text-[12px] font-mono font-bold text-[#E8A838]">
                      {fmtMoney(data.amount)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** Intake row in table */
const IntakeRow: React.FC<{
  intake: RubberIntake
  index: number
  onTap: (id: string) => void
}> = ({ intake, index, onTap }) => {
  const srcCfg = SOURCE_CFG[intake.source_type] || SOURCE_CFG.vietnam
  const statusCfg = STATUS_CFG[intake.status] || STATUS_CFG.draft
  const displayName = intake.supplier?.name || intake.buyer_name || intake.location_name || '–'

  return (
    <button type="button" onClick={() => onTap(intake.id)}
      className="w-full text-left bg-white border-b border-gray-50 last:border-0 active:bg-gray-50 transition-colors">
      <div className="px-4 py-3">
        {/* Row header */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[12px] font-bold text-gray-300 w-5 shrink-0">{index + 1}</span>
            <span className="text-[14px] font-bold text-gray-800 font-mono truncate">
              {intake.product_code || intake.invoice_no || `#${intake.id.slice(0, 8)}`}
            </span>
            <span className="text-[11px] shrink-0">{srcCfg.flag}</span>
          </div>
          <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full ${statusCfg.className}`}>
            {statusCfg.label}
          </span>
        </div>

        {/* NCC + Vehicle */}
        <div className="flex items-center gap-3 text-[12px] text-gray-500 mb-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 truncate max-w-[160px]">
            <Users className="w-3 h-3" /> {displayName}
          </span>
          {intake.vehicle_plate && (
            <span className="inline-flex items-center gap-1">
              <Truck className="w-3 h-3" /> {intake.vehicle_plate}
            </span>
          )}
        </div>

        {/* Numbers row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-[13px]">
            {intake.net_weight_kg != null && (
              <span className="inline-flex items-center gap-1">
                <Scale className="w-3 h-3 text-gray-400" />
                <span className="font-mono font-semibold text-gray-700">{fmtWeight(intake.net_weight_kg)}</span>
              </span>
            )}
            {intake.gross_weight_kg != null && !intake.net_weight_kg && (
              <span className="inline-flex items-center gap-1">
                <Scale className="w-3 h-3 text-gray-400" />
                <span className="font-mono font-semibold text-gray-700">{fmtWeight(intake.gross_weight_kg)}</span>
              </span>
            )}
            {intake.drc_percent != null && (
              <span className="inline-flex items-center gap-1">
                <FlaskConical className="w-3 h-3 text-gray-400" />
                <span className="font-mono font-semibold text-[#1B4D3E]">{fmtPercent(intake.drc_percent)}</span>
              </span>
            )}
            {intake.finished_product_ton != null && (
              <span className="inline-flex items-center gap-1">
                <Droplets className="w-3 h-3 text-gray-400" />
                <span className="font-mono font-semibold text-emerald-700">{fmtTon(intake.finished_product_ton)}</span>
              </span>
            )}
          </div>
          {intake.total_amount != null && intake.total_amount > 0 && (
            <span className="text-[13px] font-mono font-bold text-[#E8A838]">
              {fmtMoney(intake.total_amount)}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

/** Empty state */
const EmptyDay: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-16 px-6">
    <div className="w-16 h-16 mb-4 rounded-full bg-gray-50 flex items-center justify-center">
      <ClipboardList className="w-8 h-8 text-gray-300" />
    </div>
    <h3 className="text-[15px] font-semibold text-gray-600 mb-1">Không có phiếu nhập</h3>
    <p className="text-[13px] text-gray-400 text-center max-w-[240px]">
      Ngày này chưa có phiếu nhập mủ nào trong hệ thống
    </p>
  </div>
)

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const RubberDailyReportPage: React.FC = () => {
  const navigate = useNavigate()
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [intakes, setIntakes] = useState<RubberIntake[]>([])
  const [summary, setSummary] = useState({
    count: 0, total_gross: 0, total_net: 0, total_finished: 0, total_amount: 0, supplier_count: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await rubberIntakeService.getDailyReport(selectedDate)
      setIntakes(result.intakes)
      setSummary(result.summary)
    } catch (err: unknown) {
      console.error('Lỗi tải báo cáo ngày:', err)
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => { fetchReport() }, [fetchReport])

  const handleTapIntake = (id: string) => {
    navigate(`/rubber/intake/${id}`)
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
              <h1 className="text-[17px] font-bold text-gray-900 leading-tight">Báo cáo ngày</h1>
              <p className="text-[12px] text-gray-400 leading-tight">Tổng hợp nhập mủ theo ngày</p>
            </div>
          </div>
          <button type="button" onClick={fetchReport}
            className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100">
            <RefreshCw className={`w-5 h-5 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* DATE PICKER */}
      <DatePicker date={selectedDate} onChange={setSelectedDate} loading={loading} />

      {/* CONTENT */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#1B4D3E] animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-12 px-6">
          <p className="text-[14px] text-red-500 mb-3">{error}</p>
          <button type="button" onClick={fetchReport}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1B4D3E] text-white rounded-xl text-[14px] font-semibold active:scale-[0.97]">
            <RefreshCw className="w-4 h-4" /> Thử lại
          </button>
        </div>
      )}

      {!loading && !error && intakes.length === 0 && <EmptyDay />}

      {!loading && !error && intakes.length > 0 && (
        <>
          {/* Summary */}
          <SummaryCards intakes={intakes} summary={summary} />

          {/* Intake list */}
          <div className="mx-4 mb-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList size={16} className="text-[#1B4D3E]" />
                <span className="text-[14px] font-bold text-gray-900">Chi tiết phiếu nhập</span>
              </div>
              <span className="text-[12px] text-gray-400">{intakes.length} phiếu</span>
            </div>
            <div>
              {intakes.map((intake, idx) => (
                <IntakeRow key={intake.id} intake={intake} index={idx} onTap={handleTapIntake} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default RubberDailyReportPage