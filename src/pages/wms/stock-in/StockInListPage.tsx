// ============================================================================
// FILE: src/pages/wms/stock-in/StockInListPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P3 — Bước 3.7 (StockInListPage)
// ============================================================================
// KẾT NỐI SUPABASE THẬT — sử dụng stockInService.getAll()
// Hiển thị tên nhân viên từ join employees (creator/confirmer)
// Design: Industrial Mobile-First (WMS_UI_DESIGN_GUIDE.md)
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Plus,
  PackagePlus,
  ChevronRight,
  X,
  Calendar,
  Warehouse,
  Package,
  Scale,
  User,
  Filter,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import stockInService from '../../../services/wms/stockInService'
import type { StockInOrder } from '../../../services/wms/wms.types'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Status filter chips */
const STATUS_FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'draft', label: 'Nháp' },
  { key: 'confirmed', label: 'Đã nhập' },
  { key: 'cancelled', label: 'Đã hủy' },
] as const

/** Status badge config */
const STATUS_CONFIG: Record<string, {
  label: string
  className: string
  icon: string
  borderColor: string
}> = {
  draft: {
    label: 'Nháp',
    className: 'bg-gray-50 text-gray-600 border-gray-200 ring-gray-200/50',
    icon: '✏️',
    borderColor: '#9CA3AF',
  },
  confirmed: {
    label: 'Đã nhập',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-200/50',
    icon: '✅',
    borderColor: '#10B981',
  },
  cancelled: {
    label: 'Đã hủy',
    className: 'bg-red-50 text-red-600 border-red-200 ring-red-200/50',
    icon: '❌',
    borderColor: '#EF4444',
  },
}

/** Source type labels */
const SOURCE_LABELS: Record<string, string> = {
  production: 'Sản xuất',
  purchase: 'Mua hàng',
  blend: 'Phối trộn',
  transfer: 'Chuyển kho',
  adjust: 'Điều chỉnh',
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function formatNumber(num?: number): string {
  if (num === undefined || num === null) return '—'
  return num.toLocaleString('vi-VN')
}

function formatWeight(kg?: number): string {
  if (!kg) return ''
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} tấn`
  return `${formatNumber(kg)} kg`
}

/** Lấy tên người tạo từ join creator */
function getCreatorName(order: StockInOrder): string {
  if (order.creator?.full_name) return order.creator.full_name
  return order.created_by || '—'
}

/** Lấy tên người xác nhận từ join confirmer */
function getConfirmerName(order: StockInOrder): string {
  if (order.confirmer?.full_name) return order.confirmer.full_name
  return order.confirmed_by || '—'
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Status badge */
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const conf = STATUS_CONFIG[status] || STATUS_CONFIG.draft
  return (
    <span
      className={`
        inline-flex items-center gap-1
        px-2.5 py-0.5
        text-[11px] font-semibold leading-none
        rounded-full border ring-1 ring-inset
        ${conf.className}
      `}
    >
      <span className="text-[10px]">{conf.icon}</span>
      {conf.label}
    </span>
  )
}

/** Source type tag */
const SourceTag: React.FC<{ sourceType: string }> = ({ sourceType }) => {
  const label = SOURCE_LABELS[sourceType] || sourceType
  const isProduction = sourceType === 'production'
  return (
    <span
      className={`
        inline-flex items-center gap-0.5
        px-2 py-0.5
        text-[11px] font-medium
        rounded-full
        ${isProduction
          ? 'bg-blue-50 text-blue-600'
          : 'bg-purple-50 text-purple-600'
        }
      `}
    >
      {isProduction ? '🏭' : '🛒'} {label}
    </span>
  )
}

/** Stock In Card — Data card theo WMS design guide */
const StockInCard: React.FC<{
  order: StockInOrder
  onTap: (id: string) => void
}> = ({ order, onTap }) => {
  const statusConf = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft
  const detailCount = order.details?.length

  return (
    <button
      type="button"
      onClick={() => onTap(order.id)}
      className="
        w-full text-left
        bg-white
        rounded-[14px]
        border border-gray-100
        shadow-[0_1px_2px_rgba(0,0,0,0.05)]
        active:scale-[0.98] transition-transform duration-150
        overflow-hidden
      "
    >
      <div className="flex">
        {/* Border-left status color */}
        <div
          className="w-1 shrink-0 rounded-l-[14px]"
          style={{ backgroundColor: statusConf.borderColor }}
        />

        <div className="flex-1 p-4">
          {/* Row 1: Mã phiếu + Status badge */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <span
              className="text-[15px] font-bold text-gray-900 tracking-tight"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {order.code}
            </span>
            <StatusBadge status={order.status} />
          </div>

          {/* Row 2: Metadata — ngày, kho, nguồn */}
          <div className="flex items-center gap-3 text-[13px] text-gray-500 mb-2.5">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(order.created_at)}
            </span>
            <span className="text-gray-300">•</span>
            <span className="inline-flex items-center gap-1">
              <Warehouse className="w-3.5 h-3.5" />
              {order.warehouse?.name || order.warehouse_id}
            </span>
            <SourceTag sourceType={order.source_type} />
          </div>

          {/* Row 3: Số lượng + trọng lượng */}
          {(order.total_quantity != null && order.total_quantity > 0) && (
            <div className="flex items-center gap-4 mb-2">
              <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-gray-800">
                <Package className="w-4 h-4 text-[#1B4D3E]" />
                <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatNumber(order.total_quantity)}
                </span>
                <span className="text-[12px] font-normal text-gray-500">bành</span>
              </span>
              {order.total_weight != null && order.total_weight > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-500">
                  <Scale className="w-3.5 h-3.5" />
                  {formatWeight(order.total_weight)}
                </span>
              )}
              {detailCount != null && detailCount > 0 && (
                <span className="text-[12px] text-gray-400">
                  {detailCount} dòng
                </span>
              )}
            </div>
          )}

          {/* Row 4: Ghi chú (nếu có) */}
          {order.notes && (
            <p className="text-[12px] text-gray-400 line-clamp-1 mb-2">
              📝 {order.notes}
            </p>
          )}

          {/* Row 5: Người tạo + time + chevron */}
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-gray-400 inline-flex items-center gap-1">
              <User className="w-3 h-3" />
              {getCreatorName(order)}
            </span>
            <div className="flex items-center gap-1.5 text-[12px] text-gray-400">
              <span>{formatTime(order.created_at)}</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

/** Skeleton loading card */
const SkeletonCard: React.FC = () => (
  <div className="bg-white rounded-[14px] border border-gray-100 shadow-[0_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
    <div className="flex">
      <div className="w-1 shrink-0 bg-gray-200 rounded-l-[14px]" />
      <div className="flex-1 p-4 space-y-3 animate-pulse">
        <div className="flex justify-between">
          <div className="h-4 bg-gray-200 rounded w-44" />
          <div className="h-5 bg-gray-200 rounded-full w-16" />
        </div>
        <div className="flex gap-3">
          <div className="h-3.5 bg-gray-100 rounded w-16" />
          <div className="h-3.5 bg-gray-100 rounded w-28" />
        </div>
        <div className="flex gap-4">
          <div className="h-4 bg-gray-100 rounded w-20" />
          <div className="h-4 bg-gray-100 rounded w-16" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 bg-gray-100 rounded w-24" />
          <div className="h-3 bg-gray-100 rounded w-12" />
        </div>
      </div>
    </div>
  </div>
)

/** Empty state */
const EmptyState: React.FC<{ onCreateNew: () => void }> = ({ onCreateNew }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6">
    <div className="w-16 h-16 mb-4 rounded-full bg-gray-50 flex items-center justify-center">
      <PackagePlus className="w-8 h-8 text-gray-300" />
    </div>
    <h3
      className="text-[16px] font-semibold text-gray-700 mb-1.5"
      style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}
    >
      Chưa có phiếu nhập kho
    </h3>
    <p className="text-[13px] text-gray-400 text-center mb-6 max-w-[260px]">
      Tạo phiếu nhập kho đầu tiên để bắt đầu quản lý thành phẩm
    </p>
    <button
      type="button"
      onClick={onCreateNew}
      className="
        inline-flex items-center gap-2
        px-5 py-3
        bg-[#1B4D3E] text-white
        rounded-xl
        text-[14px] font-semibold
        active:scale-[0.97] transition-transform duration-150
        min-h-[48px]
      "
    >
      <Plus className="w-5 h-5" />
      Tạo phiếu nhập
    </button>
  </div>
)

/** Summary bar — thống kê nhanh */
const SummaryBar: React.FC<{ orders: StockInOrder[], total: number }> = ({ orders, total }) => {
  const drafts = orders.filter(o => o.status === 'draft').length
  const confirmed = orders.filter(o => o.status === 'confirmed').length
  const totalQty = orders
    .filter(o => o.status === 'confirmed')
    .reduce((sum, o) => sum + (o.total_quantity || 0), 0)

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-white border-b border-gray-100 overflow-x-auto scrollbar-hide">
      <span className="shrink-0 text-[12px] text-gray-500 font-medium">
        {total} phiếu
      </span>
      <span className="text-gray-200">|</span>
      <span className="shrink-0 inline-flex items-center gap-1 text-[12px]">
        <span className="w-2 h-2 rounded-full bg-gray-400" />
        <span className="text-gray-500">{drafts} nháp</span>
      </span>
      <span className="shrink-0 inline-flex items-center gap-1 text-[12px]">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-gray-500">{confirmed} đã nhập</span>
      </span>
      {totalQty > 0 && (
        <>
          <span className="text-gray-200">|</span>
          <span
            className="shrink-0 text-[12px] text-[#1B4D3E] font-semibold"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            Σ {formatNumber(totalQty)} bành
          </span>
        </>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const StockInListPage: React.FC = () => {
  const navigate = useNavigate()

  // State
  const [orders, setOrders] = useState<StockInOrder[]>([])
  const [totalOrders, setTotalOrders] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('all')

  // Load data từ Supabase thật
  const loadOrders = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    try {
      const result = await stockInService.getAll({
        page: 1,
        pageSize: 50,
        status: activeFilter !== 'all' ? activeFilter : undefined,
        search: searchText.trim() || undefined,
      })

      setOrders(result.data)
      setTotalOrders(result.total)
    } catch (err: any) {
      console.error('Lỗi tải danh sách phiếu nhập:', err)
      setLoadError(err.message || 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [activeFilter, searchText])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Debounce search
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const handleSearchChange = (value: string) => {
    setSearchText(value)
    if (searchTimeout) clearTimeout(searchTimeout)
    setSearchTimeout(setTimeout(() => {
      // loadOrders sẽ tự chạy nhờ dependency searchText
    }, 400))
  }

  // Local filter cho hiển thị (client-side fallback)
  const displayOrders = orders

  // Handlers
  const handleTapCard = (id: string) => {
    navigate(`/wms/stock-in/${id}`)
  }

  const handleCreateNew = () => {
    navigate('/wms/stock-in/new')
  }

  const handleGoBack = () => {
    navigate('/wms')
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div
      className="min-h-screen bg-[#F7F5F2]"
      style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}
    >
      {/* ================================================================== */}
      {/* HEADER — sticky */}
      {/* ================================================================== */}
      <header className="sticky top-0 z-30 bg-[#1B4D3E] text-white shadow-md">
        <div className="flex items-center justify-between px-4 py-3 min-h-[56px]">
          {/* Left: Back + Title */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGoBack}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-[17px] font-bold tracking-tight">Phiếu nhập kho</h1>
              <p className="text-[11px] text-white/60">Thành phẩm</p>
            </div>
          </div>

          {/* Right: Refresh + Search toggle */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => loadOrders()}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10 transition-colors"
            >
              <RefreshCw className={`w-4.5 h-4.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen(!searchOpen)}
              className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10 transition-colors"
            >
              {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Search bar — expandable */}
        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Tìm mã phiếu, kho, ghi chú..."
                autoFocus
                className="
                  w-full h-10
                  pl-10 pr-4
                  bg-white/10 backdrop-blur
                  text-[15px] text-white placeholder-white/40
                  rounded-xl border border-white/10
                  focus:outline-none focus:border-white/30
                "
              />
              {searchText && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-white/40" />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ================================================================== */}
      {/* FILTER CHIPS — scroll ngang */}
      {/* ================================================================== */}
      <div className="sticky top-[56px] z-20 bg-[#F7F5F2] border-b border-gray-200/60">
        <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-hide">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          {STATUS_FILTERS.map((filter) => {
            const isActive = activeFilter === filter.key

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
                  border
                  min-h-[36px]
                  active:scale-[0.96] transition-all duration-150
                  ${isActive
                    ? 'bg-[#1B4D3E] text-white border-[#1B4D3E] shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200'
                  }
                `}
              >
                {filter.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ================================================================== */}
      {/* SUMMARY BAR */}
      {/* ================================================================== */}
      {!loading && displayOrders.length > 0 && (
        <SummaryBar orders={displayOrders} total={totalOrders} />
      )}

      {/* ================================================================== */}
      {/* ERROR STATE */}
      {/* ================================================================== */}
      {loadError && (
        <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-700 font-medium">{loadError}</p>
          <button
            onClick={() => loadOrders()}
            className="mt-2 text-sm text-red-600 underline"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* CONTENT — Card list */}
      {/* ================================================================== */}
      <main className="px-4 pt-3 pb-28">
        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && !loadError && displayOrders.length === 0 && (
          <EmptyState onCreateNew={handleCreateNew} />
        )}

        {/* Card list */}
        {!loading && displayOrders.length > 0 && (
          <div className="space-y-3">
            {displayOrders.map((order) => (
              <StockInCard
                key={order.id}
                order={order}
                onTap={handleTapCard}
              />
            ))}
          </div>
        )}
      </main>

      {/* ================================================================== */}
      {/* FAB — Tạo phiếu mới */}
      {/* ================================================================== */}
      <div className="fixed bottom-6 right-4 z-40" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <button
          type="button"
          onClick={handleCreateNew}
          className="
            w-14 h-14
            flex items-center justify-center
            bg-[#E8A838] text-white
            rounded-2xl
            shadow-[0_4px_14px_rgba(232,168,56,0.4)]
            active:scale-[0.92] transition-transform duration-150
          "
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}

export default StockInListPage