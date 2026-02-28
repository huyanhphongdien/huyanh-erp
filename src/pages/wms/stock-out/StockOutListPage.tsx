// ============================================================================
// FILE: src/pages/wms/stock-out/StockOutListPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P4 — Bước 4.8 — Danh sách phiếu xuất kho
// ============================================================================
// KẾT NỐI SUPABASE THẬT — không dùng mock data
// Design: Industrial Mobile-First (WMS_UI_DESIGN_GUIDE.md)
// - Filter chips + card stack + FAB
// - Data Card: border-left status color, active:scale-[0.98]
// - Touch target ≥ 48px, no hover states
// - Brand: #1B4D3E primary, #E8A838 accent
// - Font: Be Vietnam Pro body, JetBrains Mono codes/numbers
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Plus,
  PackageMinus,
  ChevronRight,
  X,
  Calendar,
  Warehouse,
  Package,
  Scale,
  User,
  Filter,
  ArrowLeft,
  Users,
  Tag,
  Loader2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface WarehouseRef {
  id: string
  code: string
  name: string
}

interface StockOutOrder {
  id: string
  code: string
  type: string
  warehouse_id: string
  warehouse?: WarehouseRef
  reason: string
  customer_name?: string | null
  customer_order_ref?: string | null
  total_quantity?: number | null
  total_weight?: number | null
  status: 'draft' | 'picking' | 'picked' | 'confirmed' | 'cancelled'
  notes?: string | null
  created_by?: string | null
  confirmed_by?: string | null
  confirmed_at?: string | null
  created_at: string
  updated_at: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_FILTERS = [
  { key: 'all', label: 'Tất cả' },
  { key: 'draft', label: 'Nháp' },
  { key: 'picking', label: 'Đang lấy' },
  { key: 'picked', label: 'Đã lấy' },
  { key: 'confirmed', label: 'Đã xuất' },
  { key: 'cancelled', label: 'Đã hủy' },
] as const

const STATUS_CONFIG: Record<string, {
  label: string
  className: string
  icon: string
  borderColor: string
}> = {
  draft: {
    label: 'Nháp',
    className: 'bg-gray-50 text-gray-600 border-gray-200 ring-gray-500/10',
    icon: '✎',
    borderColor: '#9CA3AF',
  },
  picking: {
    label: 'Đang lấy',
    className: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-600/10',
    icon: '📋',
    borderColor: '#2563EB',
  },
  picked: {
    label: 'Đã lấy',
    className: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-600/10',
    icon: '✓',
    borderColor: '#F59E0B',
  },
  confirmed: {
    label: 'Đã xuất',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-600/10',
    icon: '✔',
    borderColor: '#16A34A',
  },
  cancelled: {
    label: 'Đã hủy',
    className: 'bg-red-50 text-red-600 border-red-200 ring-red-600/10',
    icon: '✕',
    borderColor: '#DC2626',
  },
}

const REASON_LABELS: Record<string, { label: string; emoji: string; bg: string }> = {
  sale:       { label: 'Bán hàng',    emoji: '🛒', bg: 'bg-green-50 text-green-700' },
  production: { label: 'Sản xuất',    emoji: '🏭', bg: 'bg-blue-50 text-blue-600' },
  transfer:   { label: 'Chuyển kho',  emoji: '🔄', bg: 'bg-purple-50 text-purple-600' },
  blend:      { label: 'Phối trộn',   emoji: '🧫', bg: 'bg-violet-50 text-violet-600' },
  adjust:     { label: 'Điều chỉnh',  emoji: '⚙️', bg: 'bg-gray-50 text-gray-600' },
  return:     { label: 'Trả hàng',    emoji: '↩️', bg: 'bg-orange-50 text-orange-600' },
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function formatNumber(num?: number | null): string {
  if (num === undefined || num === null) return '—'
  return num.toLocaleString('vi-VN')
}

function formatWeight(kg?: number | null): string {
  if (!kg) return ''
  if (kg >= 1000) return `${(kg / 1000).toFixed(1)} tấn`
  return `${formatNumber(kg)} kg`
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Status badge */
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const conf = STATUS_CONFIG[status] || STATUS_CONFIG.draft
  return (
    <span className={`
      inline-flex items-center gap-1
      px-2.5 py-0.5
      text-[11px] font-semibold leading-none
      rounded-full border ring-1 ring-inset
      ${conf.className}
    `}>
      <span className="text-[10px]">{conf.icon}</span>
      {conf.label}
    </span>
  )
}

/** Reason tag */
const ReasonTag: React.FC<{ reason: string }> = ({ reason }) => {
  const conf = REASON_LABELS[reason] || { label: reason, emoji: '📦', bg: 'bg-gray-50 text-gray-600' }
  return (
    <span className={`
      inline-flex items-center gap-1
      px-2 py-0.5
      text-[10px] font-medium leading-none
      rounded-md
      ${conf.bg}
    `}>
      {conf.emoji} {conf.label}
    </span>
  )
}

/** Stock Out Card */
const StockOutCard: React.FC<{
  order: StockOutOrder
  onTap: (id: string) => void
}> = ({ order, onTap }) => {
  const statusConf = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft

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

          {/* Row 2: Metadata — ngày, kho, lý do */}
          <div className="flex items-center gap-2.5 text-[13px] text-gray-500 mb-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(order.created_at)}
            </span>
            <span className="text-gray-300">•</span>
            <span className="inline-flex items-center gap-1">
              <Warehouse className="w-3.5 h-3.5" />
              {order.warehouse?.name || order.warehouse?.code || '—'}
            </span>
            <ReasonTag reason={order.reason} />
          </div>

          {/* Row 3: Khách hàng (nếu có) */}
          {order.customer_name && (
            <div className="flex items-center gap-1.5 text-[13px] text-gray-600 mb-2">
              <Users className="w-3.5 h-3.5 text-gray-400" />
              <span className="font-medium">{order.customer_name}</span>
              {order.customer_order_ref && (
                <span className="text-gray-400 text-[12px]"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  · {order.customer_order_ref}
                </span>
              )}
            </div>
          )}

          {/* Row 4: Số lượng + trọng lượng */}
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
            </div>
          )}

          {/* Row 5: Ghi chú (nếu có) */}
          {order.notes && (
            <p className="text-[12px] text-gray-400 line-clamp-1 mb-2">
              📝 {order.notes}
            </p>
          )}

          {/* Row 6: Footer — người tạo + time + chevron */}
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-gray-400 inline-flex items-center gap-1">
              <User className="w-3 h-3" />
              {order.created_by || '—'}
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
          <div className="h-3.5 bg-gray-100 rounded w-16" />
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
const EmptyState: React.FC<{ onCreateNew: () => void; hasFilter: boolean }> = ({ onCreateNew, hasFilter }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6">
    <div className="w-16 h-16 mb-4 rounded-full bg-gray-50 flex items-center justify-center">
      <PackageMinus className="w-8 h-8 text-gray-300" />
    </div>
    <h3 className="text-[16px] font-semibold text-gray-700 mb-1.5">
      {hasFilter ? 'Không tìm thấy phiếu' : 'Chưa có phiếu xuất kho'}
    </h3>
    <p className="text-[13px] text-gray-400 text-center mb-6 max-w-[260px]">
      {hasFilter
        ? 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm'
        : 'Tạo phiếu xuất kho đầu tiên để bắt đầu quản lý xuất hàng'}
    </p>
    {!hasFilter && (
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
        Tạo phiếu xuất
      </button>
    )}
  </div>
)

/** Summary bar */
const SummaryBar: React.FC<{ orders: StockOutOrder[] }> = ({ orders }) => {
  const total = orders.length
  const drafts = orders.filter(o => o.status === 'draft').length
  const picking = orders.filter(o => o.status === 'picking' || o.status === 'picked').length
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
      {drafts > 0 && (
        <span className="shrink-0 inline-flex items-center gap-1 text-[12px]">
          <span className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-gray-500">{drafts} nháp</span>
        </span>
      )}
      {picking > 0 && (
        <span className="shrink-0 inline-flex items-center gap-1 text-[12px]">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-gray-500">{picking} đang xử lý</span>
        </span>
      )}
      {confirmed > 0 && (
        <span className="shrink-0 inline-flex items-center gap-1 text-[12px]">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-gray-500">{confirmed} đã xuất</span>
        </span>
      )}
      <span className="text-gray-200">|</span>
      <span
        className="shrink-0 text-[12px] font-semibold text-[#1B4D3E]"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {formatNumber(totalQty)} bành đã xuất
      </span>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const StockOutListPage: React.FC = () => {
  const navigate = useNavigate()

  // State
  const [orders, setOrders] = useState<StockOutOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [activeFilter, setActiveFilter] = useState<string>('all')

  // Load data from Supabase
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('stock_out_orders')
        .select(`
          id, code, type, warehouse_id,
          reason, customer_name, customer_order_ref,
          total_quantity, total_weight, status, notes,
          created_by, confirmed_by, confirmed_at,
          created_at, updated_at,
          warehouse:warehouses(id, code, name)
        `)
        .order('created_at', { ascending: false })
        .limit(100)

      if (!error && data) {
        setOrders(data as unknown as StockOutOrder[])
      } else if (error) {
        console.error('Lỗi tải danh sách phiếu xuất:', error)
      }
      setLoading(false)
    }
    load()
  }, [])

  // Filter + search logic
  const filteredOrders = useCallback(() => {
    let result = [...orders]

    // Status filter
    if (activeFilter !== 'all') {
      result = result.filter(o => o.status === activeFilter)
    }

    // Search
    if (searchText.trim()) {
      const term = searchText.trim().toLowerCase()
      result = result.filter(o =>
        o.code.toLowerCase().includes(term) ||
        o.customer_name?.toLowerCase().includes(term) ||
        o.customer_order_ref?.toLowerCase().includes(term) ||
        o.warehouse?.name?.toLowerCase().includes(term) ||
        o.notes?.toLowerCase().includes(term)
      )
    }

    return result
  }, [orders, activeFilter, searchText])

  const displayOrders = filteredOrders()
  const hasFilter = activeFilter !== 'all' || searchText.trim().length > 0

  // Count per status (for filter chips)
  const statusCounts: Record<string, number> = {
    all: orders.length,
    draft: orders.filter(o => o.status === 'draft').length,
    picking: orders.filter(o => o.status === 'picking').length,
    picked: orders.filter(o => o.status === 'picked').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  }

  // Handlers
  const handleTapCard = (id: string) => {
    navigate(`/wms/stock-out/${id}`)
  }

  const handleCreateNew = () => {
    navigate('/wms/stock-out/new')
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
      {/* ================================================================ */}
      {/* HEADER — sticky */}
      {/* ================================================================ */}
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
              <h1 className="text-[17px] font-bold tracking-tight">Phiếu xuất kho</h1>
              <p className="text-[11px] text-white/60">Thành phẩm</p>
            </div>
          </div>

          {/* Right: Search toggle */}
          <button
            type="button"
            onClick={() => setSearchOpen(!searchOpen)}
            className="w-10 h-10 flex items-center justify-center rounded-xl active:bg-white/10 transition-colors"
          >
            {searchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>
        </div>

        {/* Search bar — expandable */}
        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Tìm mã phiếu, khách hàng, kho..."
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
                  onClick={() => setSearchText('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-white/40" />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ================================================================ */}
      {/* FILTER CHIPS — scroll ngang */}
      {/* ================================================================ */}
      <div className="sticky top-[56px] z-20 bg-[#F7F5F2] border-b border-gray-200/60">
        <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-hide">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          {STATUS_FILTERS.map((filter) => {
            const isActive = activeFilter === filter.key
            const count = statusCounts[filter.key] || 0

            // Ẩn filter chip nếu count = 0 (trừ "Tất cả" và filter đang active)
            if (count === 0 && filter.key !== 'all' && !isActive) return null

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
                    : 'bg-white text-gray-600 border-gray-200'}
                `}
              >
                {filter.label}
                {count > 0 && (
                  <span className={`
                    text-[11px] font-semibold
                    px-1.5 py-0.5
                    rounded-full
                    ${isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-100 text-gray-500'}
                  `}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ================================================================ */}
      {/* SUMMARY BAR */}
      {/* ================================================================ */}
      {!loading && displayOrders.length > 0 && (
        <SummaryBar orders={displayOrders} />
      )}

      {/* ================================================================ */}
      {/* CONTENT — Card list */}
      {/* ================================================================ */}
      <main className="px-4 pt-3 pb-28">
        {/* Loading skeletons */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && displayOrders.length === 0 && (
          <EmptyState onCreateNew={handleCreateNew} hasFilter={hasFilter} />
        )}

        {/* Card list */}
        {!loading && displayOrders.length > 0 && (
          <div className="space-y-3">
            {displayOrders.map((order) => (
              <StockOutCard
                key={order.id}
                order={order}
                onTap={handleTapCard}
              />
            ))}
          </div>
        )}
      </main>

      {/* ================================================================ */}
      {/* FAB — Tạo phiếu mới */}
      {/* ================================================================ */}
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

export default StockOutListPage