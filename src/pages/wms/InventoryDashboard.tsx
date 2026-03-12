// ============================================================================
// FILE: src/pages/wms/InventoryDashboard.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P5 — Bước 5.4: Dashboard tồn kho — TRANG CHÍNH WMS
// MÔ TẢ: Cards tổng quan, bảng tồn kho, bar chart, alert cards, quick links
// UI: Mobile-first, Industrial theme, Manager View
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package, Warehouse, AlertTriangle, TrendingUp, TrendingDown,
  ArrowRight, RefreshCw, Search, Filter, ChevronDown, ChevronRight,
  Plus, Minus, BarChart3, Bell, ClipboardCheck, ArrowDownToLine,
  ArrowUpFromLine, Loader2, X
} from 'lucide-react'
import { inventoryService, type StockSummaryItem, type InventoryOverview } from '../../services/wms/inventoryService'
import { alertService, type StockAlert } from '../../services/wms/alertService'

// ============================================================================
// COMPONENT
// ============================================================================

const InventoryDashboard = () => {
  const navigate = useNavigate()

  // State
  const [overview, setOverview] = useState<InventoryOverview | null>(null)
  const [stockSummary, setStockSummary] = useState<StockSummaryItem[]>([])
  const [alerts, setAlerts] = useState<StockAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --------------------------------------------------------------------------
  // DATA LOADING
  // --------------------------------------------------------------------------

  const loadData = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)

      const [overviewData, summaryData, alertsData] = await Promise.all([
        inventoryService.getOverview(),
        inventoryService.getStockSummary({ type: 'finished' }),
        alertService.checkAllAlerts(),
      ])

      setOverview(overviewData)
      setStockSummary(summaryData)
      setAlerts(alertsData)
    } catch (err: any) {
      console.error('Dashboard load error:', err)
      setError(err.message || 'Lỗi tải dữ liệu')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // --------------------------------------------------------------------------
  // FILTERED DATA
  // --------------------------------------------------------------------------

  const filteredSummary = stockSummary.filter(item => {
    // Search
    if (searchText) {
      const s = searchText.toLowerCase()
      if (!item.material.name?.toLowerCase().includes(s) &&
          !item.material.sku?.toLowerCase().includes(s)) {
        return false
      }
    }
    // Filter status
    if (filterStatus !== 'all' && item.stock_status !== filterStatus) {
      return false
    }
    return true
  })

  const topAlerts = alerts.slice(0, 5) // Hiển thị 5 cảnh báo đầu

  // --------------------------------------------------------------------------
  // RENDER HELPERS
  // --------------------------------------------------------------------------

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'normal': return 'bg-emerald-100 text-emerald-700'
      case 'low': return 'bg-red-100 text-red-700'
      case 'over': return 'bg-amber-100 text-amber-700'
      case 'out_of_stock': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'normal': return 'Bình thường'
      case 'low': return 'Tồn thấp'
      case 'over': return 'Vượt mức'
      case 'out_of_stock': return 'Hết hàng'
      default: return status
    }
  }

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'high': return 'border-l-red-500 bg-red-50'
      case 'medium': return 'border-l-amber-500 bg-amber-50'
      case 'low': return 'border-l-blue-500 bg-blue-50'
      default: return 'border-l-gray-400 bg-gray-50'
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return '🔴'
      case 'medium': return '🟡'
      case 'low': return '🟢'
      default: return '⚪'
    }
  }

  // --------------------------------------------------------------------------
  // LOADING STATE
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#1B4D3E] mx-auto mb-3" />
          <p className="text-sm text-gray-500">Đang tải dữ liệu kho...</p>
        </div>
      </div>
    )
  }

  // --------------------------------------------------------------------------
  // MAIN RENDER
  // --------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#F7F5F2]">

      {/* ========== HEADER ========== */}
      <div className="bg-[#1B4D3E] text-white px-4 pt-[env(safe-area-inset-top)] pb-4">
        <div className="flex items-center justify-between pt-3">
          <div>
            <h1 className="text-lg font-bold" style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
              Dashboard Kho Thành Phẩm
            </h1>
            <p className="text-xs text-white/60 mt-0.5">
              Cập nhật: {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="w-10 h-10 flex items-center justify-center rounded-full
              bg-white/10 active:bg-white/20 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ========== ERROR ========== */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={() => setError(null)}>
            <X className="w-4 h-4 text-red-400" />
          </button>
        </div>
      )}

      <div className="px-4 pb-[100px]">

        {/* ========== OVERVIEW CARDS ========== */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          {/* Tổng sản phẩm */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#1B4D3E]/10 flex items-center justify-center">
                <Package className="w-4 h-4 text-[#1B4D3E]" />
              </div>
            </div>
            <p className="text-2xl font-bold text-[#1B4D3E]"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {overview?.total_materials || 0}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Loại sản phẩm</p>
          </div>

          {/* Tổng số lượng */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#2D8B6E]/10 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-[#2D8B6E]" />
              </div>
            </div>
            <p className="text-2xl font-bold text-[#1B4D3E]"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {(overview?.total_quantity || 0).toLocaleString('vi-VN')}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Tổng tồn (bành)</p>
          </div>

          {/* Tổng khối lượng */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#E8A838]/10 flex items-center justify-center">
                <Warehouse className="w-4 h-4 text-[#E8A838]" />
              </div>
            </div>
            <p className="text-2xl font-bold text-[#1B4D3E]"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {((overview?.total_weight || 0) / 1000).toFixed(1)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Tổng tồn (tấn)</p>
          </div>

          {/* Cảnh báo */}
          <button
            onClick={() => navigate('/wms/alerts')}
            className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm text-left
              active:scale-[0.97] transition-transform"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center
                ${(overview?.total_alerts || 0) > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
                <Bell className={`w-4 h-4 ${(overview?.total_alerts || 0) > 0 ? 'text-red-500' : 'text-green-500'}`} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${(overview?.total_alerts || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {overview?.total_alerts || 0}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Cảnh báo</p>
          </button>
        </div>

        {/* ========== QUICK ACTIONS ========== */}
        <div className="mt-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Thao tác nhanh
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => navigate('/wms/stock-in/new')}
              className="flex items-center gap-2 px-4 py-3 bg-[#1B4D3E] text-white
                rounded-xl text-sm font-medium whitespace-nowrap shrink-0
                active:scale-[0.97] transition-transform shadow-sm"
            >
              <ArrowDownToLine className="w-4 h-4" />
              Nhập kho
            </button>
            <button
              onClick={() => navigate('/wms/stock-out/new')}
              className="flex items-center gap-2 px-4 py-3 bg-[#E8A838] text-white
                rounded-xl text-sm font-medium whitespace-nowrap shrink-0
                active:scale-[0.97] transition-transform shadow-sm"
            >
              <ArrowUpFromLine className="w-4 h-4" />
              Xuất kho
            </button>
            <button
              onClick={() => navigate('/wms/stock-check')}
              className="flex items-center gap-2 px-4 py-3 bg-white text-gray-700
                rounded-xl text-sm font-medium whitespace-nowrap shrink-0 border border-gray-200
                active:scale-[0.97] transition-transform"
            >
              <ClipboardCheck className="w-4 h-4" />
              Kiểm kê
            </button>
          </div>
        </div>

        {/* ========== ALERTS SECTION ========== */}
        {topAlerts.length > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Cảnh báo ({alerts.length})
              </h2>
              {alerts.length > 5 && (
                <button
                  onClick={() => navigate('/wms/alerts')}
                  className="text-xs text-[#2D8B6E] font-medium flex items-center gap-1"
                >
                  Xem tất cả <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="space-y-2">
              {topAlerts.map(alert => (
                <div
                  key={alert.id}
                  className={`border-l-4 rounded-xl p-3 ${getSeverityStyle(alert.severity)}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm mt-0.5">{getSeverityIcon(alert.severity)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 leading-tight">
                        {alert.message}
                      </p>
                      {alert.detail && (
                        <p className="text-xs text-gray-500 mt-0.5">{alert.detail}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========== STOCK SUMMARY TABLE ========== */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Tồn kho theo sản phẩm
            </h2>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-colors
                ${showFilters ? 'bg-[#1B4D3E] text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>

          {/* Search + Filters */}
          {showFilters && (
            <div className="mb-3 space-y-2"
              style={{ animation: 'slideDown 0.2s ease-out' }}
            >
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  placeholder="Tìm theo tên, SKU..."
                  className="w-full pl-10 pr-4 py-3 text-[15px] bg-white border border-gray-200
                    rounded-xl focus:outline-none focus:border-[#2D8B6E] focus:ring-1 focus:ring-[#2D8B6E]/30"
                />
              </div>

              {/* Status filter chips */}
              <div className="flex gap-2 flex-wrap">
                {[
                  { key: 'all', label: 'Tất cả' },
                  { key: 'low', label: '⚠️ Tồn thấp' },
                  { key: 'over', label: '📈 Vượt mức' },
                  { key: 'out_of_stock', label: '🚫 Hết hàng' },
                  { key: 'normal', label: '✅ Bình thường' },
                ].map(chip => (
                  <button
                    key={chip.key}
                    onClick={() => setFilterStatus(chip.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                      ${filterStatus === chip.key
                        ? 'bg-[#1B4D3E] text-white'
                        : 'bg-white text-gray-600 border border-gray-200'}`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stock Cards */}
          <div className="space-y-2">
            {filteredSummary.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
                <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Không tìm thấy sản phẩm nào</p>
              </div>
            ) : (
              filteredSummary.map(item => (
                <button
                  key={item.material_id}
                  onClick={() => navigate(`/wms/inventory/${item.material_id}`)}
                  className="w-full bg-white rounded-xl border border-gray-100 p-4 text-left
                    shadow-sm active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-800 truncate">
                          {item.material.name}
                        </p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold
                          ${getStatusColor(item.stock_status)}`}>
                          {getStatusLabel(item.stock_status)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.material.sku} • {item.material.unit}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                  </div>

                  {/* Số liệu */}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase">Tồn kho</p>
                      <p className="text-lg font-bold text-[#1B4D3E]"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {item.total_quantity.toLocaleString('vi-VN')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase">Khối lượng</p>
                      <p className="text-sm font-semibold text-gray-700"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {item.total_weight.toLocaleString('vi-VN')} kg
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase">Kho</p>
                      <p className="text-sm text-gray-600">
                        {item.warehouse_breakdown.length} kho
                      </p>
                    </div>
                  </div>

                  {/* Progress bar: tồn vs min/max */}
                  {item.min_stock > 0 && (
                    <div className="mt-2">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500
                            ${item.stock_status === 'low' || item.stock_status === 'out_of_stock'
                              ? 'bg-red-500'
                              : item.stock_status === 'over'
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'}`}
                          style={{
                            width: `${Math.min(100, (item.total_quantity / (item.max_stock || item.min_stock * 3)) * 100)}%`
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-[9px] text-gray-400">Min: {item.min_stock}</span>
                        {item.max_stock && (
                          <span className="text-[9px] text-gray-400">Max: {item.max_stock}</span>
                        )}
                      </div>
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ========== ANIMATIONS ========== */}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default InventoryDashboard