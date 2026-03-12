// ============================================================================
// FILE: src/pages/wms/qc/QCDashboardPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P6 — Sprint 6C-1 — Dashboard QC & DRC
// ============================================================================
// Design: Industrial Mobile-First (WMS_UI_DESIGN_GUIDE.md)
// - Summary cards scroll ngang
// - Alert banner khi có lô quá hạn tái kiểm
// - Bảng DRC tổng quan + filter tabs + search
// - Touch target ≥ 48px, no hover states
// - Brand: #1B4D3E primary, #E8A838 accent
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ArrowLeft,
  Search,
  X,
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  Filter,
  Settings,
  ClipboardCheck,
  RefreshCw,
  Loader2,
  Beaker,
  TrendingUp,
  Package,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import qcService from '../../../services/wms/qcService'
import type { QCStatus } from '../../../services/wms/wms.types'
import type { DRCOverviewItem } from '../../../services/wms/qcService'

// ============================================================================
// TYPES
// ============================================================================

interface DRCStats {
  totalBatches: number
  passedCount: number
  warningCount: number
  needsBlendCount: number
  pendingCount: number
  overdueRecheckCount: number
  avgDRC: number | null
}

// ============================================================================
// CONSTANTS
// ============================================================================

const QC_STATUS_FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'passed', label: 'Đạt' },
  { key: 'warning', label: 'Cảnh báo' },
  { key: 'needs_blend', label: 'Cần blend' },
  { key: 'pending', label: 'Chờ QC' },
] as const

const QC_STATUS_CONFIG: Record<string, {
  label: string
  shortLabel: string
  className: string
  dotColor: string
  icon: string
}> = {
  passed: {
    label: 'Đạt chuẩn',
    shortLabel: 'Đạt',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotColor: 'bg-emerald-500',
    icon: '✓',
  },
  warning: {
    label: 'Cảnh báo',
    shortLabel: 'C.báo',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    dotColor: 'bg-amber-500',
    icon: '⚠',
  },
  needs_blend: {
    label: 'Cần phối trộn',
    shortLabel: 'Blend',
    className: 'bg-red-50 text-red-700 border-red-200',
    dotColor: 'bg-red-500',
    icon: '✕',
  },
  pending: {
    label: 'Chờ kiểm tra',
    shortLabel: 'Chờ',
    className: 'bg-gray-50 text-gray-600 border-gray-200',
    dotColor: 'bg-gray-400',
    icon: '◷',
  },
  failed: {
    label: 'Không đạt',
    shortLabel: 'Fail',
    className: 'bg-red-50 text-red-700 border-red-200',
    dotColor: 'bg-red-500',
    icon: '✕',
  },
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function formatDRC(val?: number | null): string {
  if (val === undefined || val === null) return '—'
  return `${val}%`
}

function formatNumber(num?: number | null): string {
  if (num === undefined || num === null) return '—'
  return num.toLocaleString('vi-VN')
}

function getDaysUntilRecheck(dateStr?: string | null): { days: number; label: string; urgent: boolean } | null {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const recheck = new Date(dateStr)
  recheck.setHours(0, 0, 0, 0)
  const diff = Math.floor((recheck.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diff < 0) return { days: Math.abs(diff), label: `Quá ${Math.abs(diff)} ngày`, urgent: true }
  if (diff === 0) return { days: 0, label: 'Hôm nay', urgent: true }
  if (diff <= 3) return { days: diff, label: `Còn ${diff} ngày`, urgent: false }
  return { days: diff, label: `${diff} ngày`, urgent: false }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** QC Status badge */
const QCBadge: React.FC<{ status: string; size?: 'sm' | 'md' }> = ({ status, size = 'sm' }) => {
  const conf = QC_STATUS_CONFIG[status] || QC_STATUS_CONFIG.pending
  const isSm = size === 'sm'
  return (
    <span
      className={`
        inline-flex items-center gap-1
        ${isSm ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]'}
        font-semibold leading-none
        rounded-full border
        ${conf.className}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${conf.dotColor}`} />
      {isSm ? conf.shortLabel : conf.label}
    </span>
  )
}

/** Summary stat card */
const StatCard: React.FC<{
  icon: React.ReactNode
  label: string
  value: string | number
  color: string
  bgColor: string
  onClick?: () => void
}> = ({ icon, label, value, color, bgColor, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`
      shrink-0 w-[130px]
      rounded-2xl p-3
      border border-gray-100
      bg-white shadow-sm
      text-left
      active:scale-[0.96] transition-transform
    `}
  >
    <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center mb-2`}>
      {icon}
    </div>
    <p
      className={`text-[22px] font-bold ${color}`}
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
    >
      {value}
    </p>
    <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{label}</p>
  </button>
)

/** Alert banner */
const AlertBanner: React.FC<{
  count: number
  onTap: () => void
}> = ({ count, onTap }) => {
  if (count <= 0) return null
  return (
    <button
      type="button"
      onClick={onTap}
      className="
        mx-4 mt-3
        flex items-center gap-3
        px-4 py-3
        bg-gradient-to-r from-amber-50 to-red-50
        border border-amber-200
        rounded-xl
        active:scale-[0.98] transition-transform
        w-[calc(100%-32px)]
        text-left
      "
    >
      <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
        <AlertTriangle className="w-5 h-5 text-red-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-red-800">
          {count} lô cần tái kiểm DRC
        </p>
        <p className="text-[11px] text-red-600/70 mt-0.5">
          Đã quá hạn — nhấn để kiểm tra
        </p>
      </div>
      <ChevronRight className="w-5 h-5 text-red-400 shrink-0" />
    </button>
  )
}

/** DRC overview card (1 batch) */
const BatchDRCCard: React.FC<{
  item: DRCOverviewItem
  onTap: (id: string) => void
}> = ({ item, onTap }) => {
  const recheckInfo = getDaysUntilRecheck(item.next_recheck_date)

  // Border color by qc_status
  const borderColors: Record<string, string> = {
    passed: '#16A34A',
    warning: '#D97706',
    needs_blend: '#DC2626',
    pending: '#9CA3AF',
    failed: '#DC2626',
  }
  const borderColor = borderColors[item.qc_status] || '#9CA3AF'

  return (
    <div
      className="
        bg-white rounded-xl shadow-sm
        border-l-[3px]
        overflow-hidden
        active:scale-[0.98] transition-transform duration-100
      "
      style={{ borderLeftColor: borderColor }}
      onClick={() => onTap(item.id)}
    >
      <div className="px-3.5 py-3">
        {/* Row 1: Batch + Status */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p
              className="text-[13px] font-bold text-gray-900 truncate"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {item.batch_no}
            </p>
            <p className="text-[12px] text-gray-500 truncate mt-0.5">
              {item.material_name}
            </p>
          </div>
          <QCBadge status={item.qc_status} />
        </div>

        {/* Row 2: DRC values + recheck */}
        <div className="flex items-center gap-4">
          {/* DRC */}
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[10px] text-gray-400 uppercase">Ban đầu</p>
              <p
                className="text-[14px] font-semibold text-gray-600"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {formatDRC(item.initial_drc)}
              </p>
            </div>
            <div className="text-gray-300">→</div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase">Hiện tại</p>
              <p
                className={`text-[14px] font-bold ${
                  item.qc_status === 'passed' ? 'text-emerald-700' :
                  item.qc_status === 'warning' ? 'text-amber-700' :
                  item.qc_status === 'needs_blend' ? 'text-red-700' :
                  'text-gray-700'
                }`}
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {formatDRC(item.latest_drc)}
              </p>
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Recheck info */}
          {recheckInfo && (
            <div className={`
              text-right px-2 py-1 rounded-lg
              ${recheckInfo.urgent
                ? 'bg-red-50'
                : 'bg-gray-50'
              }
            `}>
              <p className="text-[10px] text-gray-400 uppercase">Tái kiểm</p>
              <p className={`text-[12px] font-semibold ${recheckInfo.urgent ? 'text-red-600' : 'text-gray-600'}`}>
                {recheckInfo.label}
              </p>
            </div>
          )}
        </div>

        {/* Row 3: Meta */}
        <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
          <span>{item.warehouse_name}</span>
          <span>·</span>
          <span>{item.location_code}</span>
          <span>·</span>
          <span>{formatNumber(item.quantity_remaining)} {item.unit}</span>
        </div>
      </div>
    </div>
  )
}

/** Skeleton card */
const SkeletonCard: React.FC = () => (
  <div className="bg-white rounded-xl shadow-sm border-l-[3px] border-gray-200 p-3.5 animate-pulse">
    <div className="flex items-center justify-between mb-2">
      <div>
        <div className="h-4 bg-gray-200 rounded w-32 mb-1.5" />
        <div className="h-3 bg-gray-100 rounded w-20" />
      </div>
      <div className="h-5 bg-gray-200 rounded-full w-14" />
    </div>
    <div className="flex gap-4 mt-3">
      <div className="h-8 bg-gray-100 rounded w-16" />
      <div className="h-8 bg-gray-100 rounded w-16" />
      <div className="flex-1" />
      <div className="h-8 bg-gray-100 rounded w-20" />
    </div>
  </div>
)

// ============================================================================
// MAIN PAGE
// ============================================================================

const QCDashboardPage: React.FC = () => {
  const navigate = useNavigate()

  // State
  const [stats, setStats] = useState<DRCStats | null>(null)
  const [batches, setBatches] = useState<DRCOverviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Filters
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')

  // --------------------------------------------------------------------------
  // LOAD DATA
  // --------------------------------------------------------------------------

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)

      const [statsData, batchesData] = await Promise.all([
        qcService.getDRCStats(),
        qcService.getDRCOverview(),
      ])

      setStats(statsData)
      setBatches(batchesData)
    } catch (err: any) {
      console.error('Lỗi load QC dashboard:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Auto-refresh mỗi 60s
  useEffect(() => {
    const interval = setInterval(() => loadData(true), 60000)
    return () => clearInterval(interval)
  }, [loadData])

  // --------------------------------------------------------------------------
  // FILTER LOGIC
  // --------------------------------------------------------------------------

  const filteredBatches = useMemo(() => {
    let result = [...batches]

    // QC status filter
    if (activeFilter !== 'all') {
      result = result.filter(b => b.qc_status === activeFilter)
    }

    // Search
    if (searchText.trim()) {
      const term = searchText.trim().toLowerCase()
      result = result.filter(b =>
        b.batch_no.toLowerCase().includes(term) ||
        b.material_name.toLowerCase().includes(term) ||
        b.material_sku.toLowerCase().includes(term)
      )
    }

    return result
  }, [batches, activeFilter, searchText])

  // Count per filter
  const filterCounts = useMemo(() => ({
    all: batches.length,
    passed: batches.filter(b => b.qc_status === 'passed').length,
    warning: batches.filter(b => b.qc_status === 'warning').length,
    needs_blend: batches.filter(b => b.qc_status === 'needs_blend').length,
    pending: batches.filter(b => b.qc_status === 'pending').length,
  }), [batches])

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------

  const handleGoBack = () => navigate('/wms')
  const handleGoRecheck = () => navigate('/wms/qc/recheck')
  const handleGoConfig = () => navigate('/wms/qc/standards')
  const handleTapBatch = (batchId: string) => navigate(`/wms/qc/batch/${batchId}`)
  const handleRefresh = () => loadData(true)

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div
      className="min-h-screen bg-[#F7F5F2]"
      style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}
    >
      {/* ================================================================== */}
      {/* HEADER */}
      {/* ================================================================== */}
      <header className="sticky top-0 z-30 bg-[#1B4D3E] text-white shadow-md">
        <div className="flex items-center justify-between px-4 py-3 min-h-[56px]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGoBack}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-[17px] font-bold tracking-tight">QC & DRC</h1>
              <p className="text-[11px] text-white/60">Theo dõi chất lượng lô hàng</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(!searchOpen)}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10"
            >
              {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Tìm lô, sản phẩm, SKU..."
                autoFocus
                className="
                  w-full h-10 pl-10 pr-4
                  bg-white/10 backdrop-blur
                  text-[15px] text-white placeholder-white/40
                  rounded-xl border border-white/10
                  focus:outline-none focus:border-white/30
                "
              />
              {searchText && (
                <button
                  type="button"
                  onClick={() => setSearchText('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="w-4 h-4 text-white/40" />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ================================================================== */}
      {/* STAT CARDS — horizontal scroll */}
      {/* ================================================================== */}
      {!loading && stats && (
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex items-stretch gap-3 px-4 py-3 min-w-max">
            <StatCard
              icon={<Package className="w-4 h-4 text-[#1B4D3E]" />}
              label="Tổng lô"
              value={stats.totalBatches}
              color="text-[#1B4D3E]"
              bgColor="bg-emerald-50"
            />
            <StatCard
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              label="Đạt chuẩn"
              value={stats.passedCount}
              color="text-emerald-700"
              bgColor="bg-emerald-50"
              onClick={() => setActiveFilter('passed')}
            />
            <StatCard
              icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}
              label="Cảnh báo"
              value={stats.warningCount}
              color="text-amber-700"
              bgColor="bg-amber-50"
              onClick={() => setActiveFilter('warning')}
            />
            <StatCard
              icon={<XCircle className="w-4 h-4 text-red-600" />}
              label="Cần blend"
              value={stats.needsBlendCount}
              color="text-red-700"
              bgColor="bg-red-50"
              onClick={() => setActiveFilter('needs_blend')}
            />
            {stats.avgDRC !== null && (
              <StatCard
                icon={<TrendingUp className="w-4 h-4 text-blue-600" />}
                label="DRC TB (kho)"
                value={`${stats.avgDRC}%`}
                color="text-blue-700"
                bgColor="bg-blue-50"
              />
            )}
          </div>
        </div>
      )}

      {/* Loading stats skeleton */}
      {loading && (
        <div className="flex gap-3 px-4 py-3 overflow-hidden">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="shrink-0 w-[130px] h-[100px] bg-white rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {/* ================================================================== */}
      {/* ALERT BANNER */}
      {/* ================================================================== */}
      {!loading && stats && stats.overdueRecheckCount > 0 && (
        <AlertBanner
          count={stats.overdueRecheckCount}
          onTap={handleGoRecheck}
        />
      )}

      {/* ================================================================== */}
      {/* QUICK ACTIONS */}
      {/* ================================================================== */}
      {!loading && (
        <div className="flex items-center gap-2 px-4 mt-3">
          <button
            type="button"
            onClick={handleGoRecheck}
            className="
              flex-1 flex items-center justify-center gap-2
              px-3 py-2.5
              bg-white border border-gray-200 rounded-xl
              text-[13px] font-medium text-gray-700
              active:scale-[0.97] transition-transform
            "
          >
            <ClipboardCheck className="w-4 h-4 text-emerald-600" />
            Tái kiểm
          </button>
          <button
            type="button"
            onClick={handleGoConfig}
            className="
              flex-1 flex items-center justify-center gap-2
              px-3 py-2.5
              bg-white border border-gray-200 rounded-xl
              text-[13px] font-medium text-gray-700
              active:scale-[0.97] transition-transform
            "
          >
            <Settings className="w-4 h-4 text-gray-500" />
            Ngưỡng QC
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* FILTER CHIPS */}
      {/* ================================================================== */}
      <div className="sticky top-[56px] z-20 bg-[#F7F5F2] border-b border-gray-200/60 mt-3">
        <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-hide">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          {QC_STATUS_FILTERS.map(filter => {
            const isActive = activeFilter === filter.key
            const count = filterCounts[filter.key as keyof typeof filterCounts] ?? 0

            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={`
                  shrink-0
                  inline-flex items-center gap-1.5
                  px-3.5 py-2
                  rounded-full
                  text-[13px] font-medium
                  border min-h-[36px]
                  active:scale-[0.96] transition-all duration-150
                  ${isActive
                    ? 'bg-[#1B4D3E] text-white border-[#1B4D3E] shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200'
                  }
                `}
              >
                {filter.label}
                {count > 0 && (
                  <span className={`
                    text-[11px] font-semibold px-1.5 py-0.5 rounded-full
                    ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}
                  `}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ================================================================== */}
      {/* BATCH LIST */}
      {/* ================================================================== */}
      <main className="px-4 pt-3 pb-28">
        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty: no batches at all */}
        {!loading && batches.length === 0 && (
          <div className="flex flex-col items-center py-16 px-6">
            <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mb-4">
              <FlaskConical className="w-10 h-10 text-gray-300" />
            </div>
            <p className="text-[15px] font-medium text-gray-800 mb-1">Chưa có lô hàng</p>
            <p className="text-[13px] text-gray-500 text-center">
              Khi nhập kho thành phẩm có QC, các lô sẽ xuất hiện ở đây.
            </p>
          </div>
        )}

        {/* Empty: filter no match */}
        {!loading && batches.length > 0 && filteredBatches.length === 0 && (
          <div className="flex flex-col items-center py-12">
            <Search className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-[14px] text-gray-500">
              {searchText ? `Không tìm thấy "${searchText}"` : 'Không có lô nào ở trạng thái này'}
            </p>
            <button
              type="button"
              onClick={() => { setActiveFilter('all'); setSearchText('') }}
              className="text-[13px] text-[#2D8B6E] font-medium mt-2 active:underline"
            >
              Xem tất cả
            </button>
          </div>
        )}

        {/* Batch cards */}
        {!loading && filteredBatches.length > 0 && (
          <div className="space-y-2.5">
            {/* Count */}
            <p className="text-[12px] text-gray-400 px-1">
              {filteredBatches.length} lô
              {activeFilter !== 'all' ? ` · ${QC_STATUS_FILTERS.find(f => f.key === activeFilter)?.label}` : ''}
            </p>

            {filteredBatches.map(item => (
              <BatchDRCCard
                key={item.id}
                item={item}
                onTap={handleTapBatch}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default QCDashboardPage