// ============================================================================
// FILE: src/pages/wms/rubber-intake/RubberIntakeListPage.tsx
// MODULE: Lý Lịch Mủ — Huy Anh Rubber ERP
// PHASE: P3.5 — Bước 3.5.8
// ============================================================================
// SUPABASE THẬT — bảng rubber_intake_batches
// Design: Industrial Mobile-First, brand #1B4D3E, accent #E8A838
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Search,
  ChevronRight,
  X,
  Calendar,
  Scale,
  Users,
  ArrowLeft,
  Truck,
  ClipboardList,
  FlaskConical,
  Loader2,
  RefreshCw,
  MapPin,
  Banknote,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import rubberIntakeService from '../../../services/rubber/rubberIntakeService'
import type { RubberIntake } from '../../../services/rubber/rubberIntakeService'

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'draft', label: 'Nháp' },
  { key: 'confirmed', label: 'Đã XN' },
  { key: 'cancelled', label: 'Đã hủy' },
] as const

const STATUS_CONFIG: Record<string, {
  label: string; className: string; icon: string; borderColor: string
}> = {
  draft: { label: 'Nháp', className: 'bg-gray-50 text-gray-600 border-gray-200 ring-gray-500/10', icon: '✎', borderColor: '#9CA3AF' },
  confirmed: { label: 'Đã XN', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-600/10', icon: '✓', borderColor: '#16A34A' },
  settled: { label: 'Đã chốt', className: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-600/10', icon: '✓', borderColor: '#2563EB' },
  cancelled: { label: 'Đã hủy', className: 'bg-red-50 text-red-600 border-red-200 ring-red-600/10', icon: '✕', borderColor: '#DC2626' },
}

const PAYMENT_CONFIG: Record<string, { label: string; className: string }> = {
  unpaid: { label: 'Chưa TT', className: 'bg-orange-50 text-orange-600' },
  partial: { label: 'TT 1 phần', className: 'bg-yellow-50 text-yellow-700' },
  paid: { label: 'Đã TT', className: 'bg-emerald-50 text-emerald-600' },
}

const SOURCE_CONFIG: Record<string, { label: string; flag: string }> = {
  vietnam: { label: 'Việt Nam', flag: '🇻🇳' },
  lao_direct: { label: 'Lào TT', flag: '🇱🇦' },
  lao_agent: { label: 'Lào ĐL', flag: '🤝' },
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateStr?: string): string {
  if (!dateStr) return '–'
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function formatNumber(num?: number | null): string {
  if (num === undefined || num === null) return '–'
  return num.toLocaleString('vi-VN')
}

function formatWeight(kg?: number | null): string {
  if (!kg) return '–'
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)}T`
  return `${formatNumber(Math.round(kg))} kg`
}

function formatTon(ton?: number | null): string {
  if (!ton) return '–'
  return `${ton.toFixed(2)}T`
}

function formatCurrency(amount?: number | null): string {
  if (!amount) return '–'
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}tỷ`
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}tr`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k`
  return formatNumber(amount)
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const conf = STATUS_CONFIG[status] || STATUS_CONFIG.draft
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold leading-none rounded-full border ring-1 ring-inset ${conf.className}`}>
      <span className="text-[10px]">{conf.icon}</span>
      {conf.label}
    </span>
  )
}

const PaymentBadge: React.FC<{ paymentStatus: string }> = ({ paymentStatus }) => {
  const conf = PAYMENT_CONFIG[paymentStatus] || PAYMENT_CONFIG.unpaid
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-md ${conf.className}`}>
      {conf.label}
    </span>
  )
}

const SourceTag: React.FC<{ sourceType: string }> = ({ sourceType }) => {
  const conf = SOURCE_CONFIG[sourceType] || SOURCE_CONFIG.vietnam
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-md bg-blue-50 text-blue-600">
      {conf.flag} {conf.label}
    </span>
  )
}

/** Intake Card */
const IntakeCard: React.FC<{
  intake: RubberIntake
  onTap: (id: string) => void
}> = ({ intake, onTap }) => {
  const statusConf = STATUS_CONFIG[intake.status] || STATUS_CONFIG.draft

  // Display info
  const displayName = intake.supplier?.name || intake.buyer_name || intake.location_name || '–'
  const displayWeight = intake.net_weight_kg
    ? formatWeight(intake.net_weight_kg)
    : intake.gross_weight_kg
      ? formatWeight(intake.gross_weight_kg)
      : intake.settled_qty_ton
        ? formatTon(intake.settled_qty_ton)
        : '–'

  return (
    <button
      type="button"
      onClick={() => onTap(intake.id)}
      className="w-full text-left bg-white rounded-[14px] border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:scale-[0.98] transition-transform duration-150 overflow-hidden"
    >
      <div className="flex">
        <div className="w-1 shrink-0 rounded-l-[14px]" style={{ backgroundColor: statusConf.borderColor }} />

        <div className="flex-1 p-4">
          {/* Row 1: Product code / Invoice + Status */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[15px] font-bold text-gray-900 tracking-tight truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {intake.product_code || intake.invoice_no || `#${intake.id.slice(0, 8)}`}
              </span>
              <SourceTag sourceType={intake.source_type} />
            </div>
            <StatusBadge status={intake.status} />
          </div>

          {/* Row 2: NCC + Ngày */}
          <div className="flex items-center gap-3 text-[13px] text-gray-500 mb-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(intake.intake_date)}
            </span>
            <span className="text-gray-300">•</span>
            <span className="inline-flex items-center gap-1 truncate max-w-[180px]">
              <Users className="w-3.5 h-3.5" />
              {displayName}
            </span>
          </div>

          {/* Row 3: KL + DRC + Amount */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-[13px]">
              <span className="inline-flex items-center gap-1">
                <Scale className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-semibold text-gray-800" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {displayWeight}
                </span>
              </span>
              {intake.drc_percent ? (
                <span className="inline-flex items-center gap-1">
                  <FlaskConical className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-semibold text-[#1B4D3E]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {intake.drc_percent}%
                  </span>
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {intake.total_amount ? (
                <span className="text-[14px] font-bold text-[#E8A838]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatCurrency(intake.total_amount)}
                </span>
              ) : null}
              <PaymentBadge paymentStatus={intake.payment_status} />
            </div>
          </div>

          {/* Row 4: Vehicle / location */}
          {(intake.vehicle_plate || intake.location_name) && (
            <div className="flex items-center gap-3 mt-2 text-[12px] text-gray-400">
              {intake.vehicle_plate && (
                <span className="inline-flex items-center gap-1">
                  <Truck className="w-3 h-3" />
                  {intake.vehicle_plate} {intake.vehicle_label || ''}
                </span>
              )}
              {intake.location_name && (
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3" />
                  {intake.location_name}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center pr-3">
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </div>
      </div>
    </button>
  )
}

const SkeletonCard: React.FC = () => (
  <div className="bg-white rounded-[14px] border border-gray-100 overflow-hidden animate-pulse">
    <div className="flex">
      <div className="w-1 shrink-0 bg-gray-200 rounded-l-[14px]" />
      <div className="flex-1 p-4 space-y-3">
        <div className="flex justify-between"><div className="h-5 bg-gray-100 rounded w-36" /><div className="h-5 bg-gray-100 rounded w-16" /></div>
        <div className="flex gap-3"><div className="h-3.5 bg-gray-100 rounded w-16" /><div className="h-3.5 bg-gray-100 rounded w-28" /></div>
        <div className="flex justify-between"><div className="flex gap-4"><div className="h-4 bg-gray-100 rounded w-20" /><div className="h-4 bg-gray-100 rounded w-14" /></div><div className="h-4 bg-gray-100 rounded w-16" /></div>
      </div>
    </div>
  </div>
)

const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-16 px-6">
    <div className="w-16 h-16 mb-4 rounded-full bg-gray-50 flex items-center justify-center">
      <ClipboardList className="w-8 h-8 text-gray-300" />
    </div>
    <h3 className="text-[16px] font-semibold text-gray-700 mb-1.5" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
      Chưa có phiếu nhập mủ
    </h3>
    <p className="text-[13px] text-gray-400 text-center max-w-[260px]">
      Phiếu nhập mủ sẽ hiện ở đây khi có dữ liệu trong bảng rubber_intake_batches
    </p>
  </div>
)

const SummaryBar: React.FC<{ intakes: RubberIntake[] }> = ({ intakes }) => {
  const total = intakes.length
  const drafts = intakes.filter(o => o.status === 'draft').length
  const confirmed = intakes.filter(o => o.status === 'confirmed').length
  const totalAmount = intakes.filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + (o.total_amount || 0), 0)

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-gray-100 overflow-x-auto scrollbar-hide">
      <span className="shrink-0 text-[12px] text-gray-500 font-medium">{total} phiếu</span>
      <span className="text-gray-200">|</span>
      <span className="shrink-0 inline-flex items-center gap-1 text-[12px]">
        <span className="w-2 h-2 rounded-full bg-gray-400" />
        <span className="text-gray-500">{drafts} nháp</span>
      </span>
      <span className="shrink-0 inline-flex items-center gap-1 text-[12px]">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-gray-500">{confirmed} đã XN</span>
      </span>
      {totalAmount > 0 && (
        <>
          <span className="text-gray-200">|</span>
          <span className="shrink-0 text-[12px] font-semibold text-[#E8A838]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {formatCurrency(totalAmount)}
          </span>
        </>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const RubberIntakeListPage: React.FC = () => {
  const navigate = useNavigate()
  const [intakes, setIntakes] = useState<RubberIntake[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [total, setTotal] = useState(0)

  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300)
    return () => clearTimeout(timer)
  }, [searchText])

  const fetchIntakes = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)

      const result = await rubberIntakeService.getAll({
        page: 1,
        pageSize: 50,
        status: activeFilter !== 'all' ? activeFilter : undefined,
        search: debouncedSearch || undefined,
      })

      setIntakes(result.data)
      setTotal(result.total)
    } catch (err: unknown) {
      console.error('Lỗi tải phiếu nhập mủ:', err)
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeFilter, debouncedSearch])

  useEffect(() => { fetchIntakes() }, [fetchIntakes])

  const hasActiveFilter = activeFilter !== 'all' || debouncedSearch.trim().length > 0

  const handleResetFilters = () => { setActiveFilter('all'); setSearchText(''); setSearchOpen(false) }
  const handleTapCard = (id: string) => { navigate(`/rubber/intake/${id}`) }

  return (
    <div className="min-h-screen bg-[#F7F5F2]" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-3 min-h-[56px]">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100 -ml-2">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
            </button>
            <div>
              <h1 className="text-[17px] font-bold text-gray-900 leading-tight">Phiếu nhập mủ</h1>
              <p className="text-[12px] text-gray-400 leading-tight">{total > 0 ? `${total} phiếu` : 'Lý lịch mủ'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => fetchIntakes(true)} disabled={refreshing} className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100">
              <RefreshCw className={`w-5 h-5 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearchText('') }} className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-gray-100">
              {searchOpen ? <X className="w-5 h-5 text-gray-500" /> : <Search className="w-5 h-5 text-gray-500" />}
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
                placeholder="Tìm mã hàng, biển số, hoá đơn..."
                className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[15px] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B4D3E]/20 focus:border-[#1B4D3E]"
                autoFocus
              />
              {searchText && (
                <button type="button" onClick={() => setSearchText('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 active:bg-gray-300">
                  <X className="w-3 h-3 text-gray-500" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 px-4 pb-2.5 overflow-x-auto scrollbar-hide">
          {STATUS_FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setActiveFilter(f.key)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium border transition-all duration-150 min-h-[36px] ${
                activeFilter === f.key ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]' : 'bg-white text-gray-600 border-gray-200 active:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
          {hasActiveFilter && (
            <button type="button" onClick={handleResetFilters} className="shrink-0 px-3 py-1.5 text-[12px] text-red-500 font-medium active:text-red-700">
              Xóa lọc
            </button>
          )}
        </div>
      </div>

      {!loading && intakes.length > 0 && <SummaryBar intakes={intakes} />}

      <div className="px-4 pt-3 pb-24 space-y-3">
        {loading && <div className="space-y-3">{[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}</div>}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-12 px-6">
            <div className="w-14 h-14 mb-3 rounded-full bg-red-50 flex items-center justify-center">
              <X className="w-7 h-7 text-red-400" />
            </div>
            <h3 className="text-[15px] font-semibold text-gray-700 mb-1">Lỗi tải dữ liệu</h3>
            <p className="text-[13px] text-gray-400 text-center mb-4 max-w-[260px]">{error}</p>
            <button type="button" onClick={() => fetchIntakes()} className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1B4D3E] text-white rounded-xl text-[14px] font-semibold active:scale-[0.97] transition-transform">
              <RefreshCw className="w-4 h-4" /> Thử lại
            </button>
          </div>
        )}

        {!loading && !error && intakes.length === 0 && <EmptyState />}

        {!loading && !error && intakes.map((intake) => (
          <IntakeCard key={intake.id} intake={intake} onTap={handleTapCard} />
        ))}
      </div>
    </div>
  )
}

export default RubberIntakeListPage