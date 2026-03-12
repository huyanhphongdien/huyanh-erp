// ============================================================================
// FILE: src/pages/wms/weighbridge/WeighbridgeListPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P7 — Sprint 7C — Lịch sử cân xe
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  Scale,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Truck,
  Calendar,
  X,
  Loader2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import weighbridgeService from '../../../services/wms/weighbridgeService'
import type { WeighbridgeTicket, TicketType, WeighbridgeStatus, PaginatedResponse } from '../../../services/wms/wms.types'

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_CONFIG: Record<WeighbridgeStatus, { label: string; color: string; bg: string; dot: string }> = {
  weighing_gross: { label: 'Chờ cân L1', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  weighing_tare: { label: 'Chờ cân L2', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  completed: { label: 'Hoàn tất', color: 'text-green-700', bg: 'bg-green-50 border-green-200', dot: 'bg-green-500' },
  cancelled: { label: 'Đã hủy', color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'weighing_gross', label: 'Chờ cân L1' },
  { value: 'weighing_tare', label: 'Chờ cân L2' },
  { value: 'completed', label: 'Hoàn tất' },
  { value: 'cancelled', label: 'Đã hủy' },
]

const TYPE_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'in', label: 'Xe vào' },
  { value: 'out', label: 'Xe ra' },
]

// ============================================================================
// COMPONENT
// ============================================================================

export default function WeighbridgeListPage() {
  const navigate = useNavigate()

  // State
  const [data, setData] = useState<PaginatedResponse<WeighbridgeTicket> | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 15

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Stats
  const [stats, setStats] = useState<{
    totalTickets: number
    completedToday: number
    inProgress: number
    totalNetWeight: number
  } | null>(null)

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await weighbridgeService.getAll({
        page,
        pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        ticket_type: (typeFilter as TicketType) || undefined,
      })
      setData(result)
    } catch (err) {
      console.error('Load weighbridge list error:', err)
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, typeFilter, fromDate, toDate])

  const loadStats = useCallback(async () => {
    try {
      const s = await weighbridgeService.getStats()
      setStats(s)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    loadStats()
  }, [])

  function handleSearch() {
    setPage(1)
    loadData()
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('')
    setTypeFilter('')
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  const hasFilters = search || statusFilter || typeFilter || fromDate || toDate

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1B4D3E] text-white px-4 py-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/wms/weighbridge')} className="p-2 -ml-2 rounded-lg hover:bg-white/10 active:bg-white/20">
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Lịch sử cân xe</h1>
            <p className="text-xs text-white/70">
              {data ? `${data.total} phiếu` : 'Đang tải...'}
            </p>
          </div>
          <button
            onClick={() => { loadData(); loadStats() }}
            className="p-2 rounded-lg hover:bg-white/10 active:bg-white/20"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-white rounded-xl p-3 border border-gray-200 text-center">
              <p className="text-lg font-bold text-gray-900">{stats.inProgress}</p>
              <p className="text-[11px] text-gray-500">Đang cân</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-200 text-center">
              <p className="text-lg font-bold text-green-600">{stats.completedToday}</p>
              <p className="text-[11px] text-gray-500">Hôm nay</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-200 text-center">
              <p className="text-lg font-bold text-blue-600">{stats.totalTickets}</p>
              <p className="text-[11px] text-gray-500">Tổng phiếu</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-gray-200 text-center">
              <p className="text-lg font-bold text-[#1B4D3E]">
                {stats.totalNetWeight >= 1000 ? `${(stats.totalNetWeight / 1000).toFixed(1)}t` : `${stats.totalNetWeight}kg`}
              </p>
              <p className="text-[11px] text-gray-500">Tấn nay</p>
            </div>
          </div>
        )}

        {/* Search & Filter */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Tìm mã phiếu, biển số, tài xế..."
                className="w-full h-12 pl-10 pr-4 text-[15px] bg-white border border-gray-300 rounded-xl focus:border-[#1B4D3E] outline-none"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`h-12 px-3 rounded-xl border flex items-center gap-1.5 text-sm font-medium ${hasFilters ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]' : 'bg-white text-gray-600 border-gray-300'}`}
            >
              <Filter size={16} />
              Lọc
              {hasFilters && <span className="w-2 h-2 bg-amber-400 rounded-full" />}
            </button>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Trạng thái</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
                    className="w-full h-10 px-2 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:border-[#1B4D3E] outline-none"
                  >
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Loại</label>
                  <select
                    value={typeFilter}
                    onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
                    className="w-full h-10 px-2 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:border-[#1B4D3E] outline-none"
                  >
                    {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Từ ngày</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
                    className="w-full h-10 px-2 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:border-[#1B4D3E] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Đến ngày</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => { setToDate(e.target.value); setPage(1) }}
                    className="w-full h-10 px-2 text-sm bg-gray-50 border border-gray-300 rounded-lg focus:border-[#1B4D3E] outline-none"
                  />
                </div>
              </div>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-red-600 font-medium flex items-center gap-1"
                >
                  <X size={14} /> Xóa bộ lọc
                </button>
              )}
            </div>
          )}
        </div>

        {/* List */}
        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-gray-400" />
          </div>
        ) : data && data.data.length === 0 ? (
          <div className="text-center py-16">
            <Scale size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">Chưa có phiếu cân nào</p>
            <p className="text-sm text-gray-400 mt-1">
              {hasFilters ? 'Thử thay đổi bộ lọc' : 'Bắt đầu bằng cách tạo phiếu cân mới'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {data?.data.map(ticket => {
              const sc = STATUS_CONFIG[ticket.status]
              return (
                <button
                  key={ticket.id}
                  onClick={() => {
                    if (ticket.status === 'completed' || ticket.status === 'cancelled') {
                      navigate(`/wms/weighbridge/${ticket.id}`)
                    } else {
                      navigate('/wms/weighbridge')
                    }
                  }}
                  className="w-full bg-white rounded-xl p-4 border border-gray-200 active:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${sc.bg} border`}>
                      <div className={`w-2.5 h-2.5 rounded-full ${sc.dot}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-gray-900 text-[15px]">{ticket.vehicle_plate}</span>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${sc.bg} ${sc.color} border`}>
                          {sc.label}
                        </span>
                        <span className="text-[11px] text-gray-400">{ticket.ticket_type === 'in' ? '📥 Vào' : '📤 Ra'}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {ticket.code} • {ticket.driver_name || 'Không tài xế'}
                      </p>

                      {/* Weight info */}
                      {ticket.status === 'completed' && ticket.net_weight != null && (
                        <div className="flex items-center gap-3 mt-1.5 text-xs">
                          <span className="text-gray-500">G: {ticket.gross_weight?.toLocaleString()}</span>
                          <span className="text-gray-500">T: {ticket.tare_weight?.toLocaleString()}</span>
                          <span className="font-bold text-green-700 text-sm">NET: {ticket.net_weight.toLocaleString()} kg</span>
                        </div>
                      )}
                    </div>

                    {/* Time */}
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-gray-400">
                        {new Date(ticket.created_at).toLocaleDateString('vi-VN')}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {new Date(ticket.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-4">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center disabled:opacity-30"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm text-gray-600 px-3">
              {page} / {data.totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              className="w-10 h-10 rounded-lg border border-gray-300 flex items-center justify-center disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}