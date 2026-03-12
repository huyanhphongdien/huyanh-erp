// ============================================================================
// FILE: src/components/wms/LocationPicker.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P3 — Bước 3.9: Component chọn vị trí kho (tái sử dụng P3 + P4)
// MÔ TẢ: Grid hiển thị các ô theo kệ, chọn vị trí nhập/xuất kho
// PATTERN: Mobile-first, Industrial WMS UI, Glove-friendly 48px+ targets
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  MapPin,
  Check,
  Search,
  ChevronDown,
  ChevronUp,
  Package,
  Loader2,
  Grid3X3,
  List,
  X,
  AlertCircle,
  Info,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface LocationData {
  id: string
  code: string
  shelf: string | null
  row_name: string | null
  column_name: string | null
  capacity: number | null
  current_quantity: number
  is_available: boolean
}

export type LocationStatus = 'empty' | 'partial' | 'full' | 'unavailable'

export type ViewMode = 'grid' | 'list'

/** Mode nhập kho (cho phép ô trống + partial) hoặc xuất kho (chỉ ô có hàng) */
export type PickerMode = 'stock-in' | 'stock-out'

export interface LocationPickerProps {
  /** ID kho — bắt buộc */
  warehouse_id: string
  /** Vị trí đang chọn */
  selectedId?: string
  /** Callback khi chọn/bỏ chọn vị trí */
  onSelect: (location: LocationData | null) => void
  /** Mode: stock-in cho phép ô trống, stock-out chỉ cho ô có hàng */
  mode?: PickerMode
  /** Cho phép chọn nhiều (dùng cho picking P4) */
  multiSelect?: boolean
  /** Danh sách ID đã chọn (khi multiSelect=true) */
  selectedIds?: string[]
  /** Callback khi chọn nhiều */
  onMultiSelect?: (locations: LocationData[]) => void
  /** Label hiển thị phía trên */
  label?: string
  /** Có hiển thị legend không */
  showLegend?: boolean
  /** Có hiển thị search không */
  showSearch?: boolean
  /** Có hiển thị shelf filter không */
  showShelfFilter?: boolean
  /** Có hiển thị tổng quan summary không */
  showSummary?: boolean
  /** Custom class cho container */
  className?: string
  /** Disabled toàn bộ */
  disabled?: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

function getLocationStatus(loc: LocationData): LocationStatus {
  if (!loc.is_available) return 'unavailable'
  if (!loc.capacity || loc.capacity <= 0) {
    return loc.current_quantity > 0 ? 'partial' : 'empty'
  }
  const pct = (loc.current_quantity / loc.capacity) * 100
  if (pct === 0) return 'empty'
  if (pct >= 80) return 'full'
  return 'partial'
}

function getStatusConfig(status: LocationStatus) {
  switch (status) {
    case 'empty':
      return {
        bg: 'bg-[#D1FAE5]',
        bgSelected: 'bg-emerald-200',
        border: 'border-emerald-300',
        text: 'text-emerald-800',
        label: 'Trống',
        dot: 'bg-emerald-400',
      }
    case 'partial':
      return {
        bg: 'bg-[#FEF3C7]',
        bgSelected: 'bg-amber-200',
        border: 'border-amber-300',
        text: 'text-amber-800',
        label: 'Đang dùng',
        dot: 'bg-amber-400',
      }
    case 'full':
      return {
        bg: 'bg-[#FEE2E2]',
        bgSelected: 'bg-red-200',
        border: 'border-red-300',
        text: 'text-red-700',
        label: 'Đầy',
        dot: 'bg-red-400',
      }
    case 'unavailable':
      return {
        bg: 'bg-gray-100',
        bgSelected: 'bg-gray-200',
        border: 'border-gray-300',
        text: 'text-gray-400',
        label: 'Không KD',
        dot: 'bg-gray-400',
      }
  }
}

/** Kiểm tra ô có thể chọn dựa trên mode */
function isSelectable(loc: LocationData, mode: PickerMode): boolean {
  if (!loc.is_available) return false
  const status = getLocationStatus(loc)

  if (mode === 'stock-in') {
    // Nhập kho: cho phép ô trống + partial (chưa đầy)
    return status === 'empty' || status === 'partial'
  } else {
    // Xuất kho: chỉ cho phép ô có hàng
    return status === 'partial' || status === 'full'
  }
}

function getFillPercent(loc: LocationData): number {
  if (!loc.capacity || loc.capacity <= 0) return 0
  return Math.round((loc.current_quantity / loc.capacity) * 100)
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Legend — giải thích màu sắc */
const Legend: React.FC<{ mode: PickerMode }> = ({ mode }) => {
  const items = mode === 'stock-in'
    ? [
        { status: 'empty' as LocationStatus, selectable: true },
        { status: 'partial' as LocationStatus, selectable: true },
        { status: 'full' as LocationStatus, selectable: false },
        { status: 'unavailable' as LocationStatus, selectable: false },
      ]
    : [
        { status: 'partial' as LocationStatus, selectable: true },
        { status: 'full' as LocationStatus, selectable: true },
        { status: 'empty' as LocationStatus, selectable: false },
        { status: 'unavailable' as LocationStatus, selectable: false },
      ]

  return (
    <div className="flex flex-wrap gap-3 px-1">
      {items.map(({ status, selectable }) => {
        const cfg = getStatusConfig(status)
        return (
          <div key={status} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded-sm ${cfg.dot} ${!selectable ? 'opacity-40' : ''}`} />
            <span className={`text-[11px] ${selectable ? 'text-gray-700' : 'text-gray-400'}`}>
              {cfg.label}
              {selectable && ' ✓'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Summary bar — tổng quan kho */
const SummaryBar: React.FC<{ locations: LocationData[] }> = ({ locations }) => {
  const counts = useMemo(() => {
    const result = { empty: 0, partial: 0, full: 0, unavailable: 0 }
    locations.forEach(loc => {
      result[getLocationStatus(loc)]++
    })
    return result
  }, [locations])

  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="text-gray-500 font-medium">Tổng: {locations.length}</span>
      <span className="text-emerald-600 font-semibold">{counts.empty} trống</span>
      <span className="text-amber-600 font-semibold">{counts.partial} dùng</span>
      <span className="text-red-600 font-semibold">{counts.full} đầy</span>
      {counts.unavailable > 0 && (
        <span className="text-gray-400">{counts.unavailable} N/A</span>
      )}
    </div>
  )
}

/** Location Tooltip — thông tin chi tiết ô */
const LocationTooltip: React.FC<{
  location: LocationData
  onClose: () => void
}> = ({ location, onClose }) => {
  const status = getLocationStatus(location)
  const cfg = getStatusConfig(status)
  const fillPct = getFillPercent(location)

  return (
    <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48
                    bg-white rounded-xl shadow-lg border border-gray-200 p-3
                    animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Arrow */}
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 
                      bg-white border-b border-r border-gray-200 rotate-45" />
      
      <button
        type="button"
        onClick={onClose}
        className="absolute top-1.5 right-1.5 w-5 h-5 flex items-center justify-center
                   text-gray-400 hover:text-gray-600 rounded-full"
      >
        <X className="w-3 h-3" />
      </button>

      <div className="flex items-center gap-2 mb-2">
        <MapPin className="w-3.5 h-3.5 text-[#1B4D3E]" />
        <span className="font-bold text-sm text-gray-800">{location.code}</span>
        <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${cfg.bg} ${cfg.text}`}>
          {cfg.label}
        </span>
      </div>

      {location.capacity ? (
        <>
          <div className="flex justify-between text-[11px] text-gray-500 mb-1">
            <span>Sức chứa</span>
            <span className="font-mono font-medium text-gray-700">
              {location.current_quantity}/{location.capacity}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                fillPct >= 80 ? 'bg-red-400' : fillPct > 0 ? 'bg-amber-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${Math.min(fillPct, 100)}%` }}
            />
          </div>
          <div className="text-right text-[10px] text-gray-400 mt-0.5">{fillPct}%</div>
        </>
      ) : (
        <div className="text-[11px] text-gray-400">
          <Package className="w-3 h-3 inline mr-1" />
          {location.current_quantity > 0
            ? `Đang chứa: ${location.current_quantity}`
            : 'Chưa có hàng'}
        </div>
      )}

      {location.shelf && (
        <div className="text-[10px] text-gray-400 mt-1.5">
          Kệ: {location.shelf}
          {location.row_name && ` · Hàng: ${location.row_name}`}
          {location.column_name && ` · Ô: ${location.column_name}`}
        </div>
      )}
    </div>
  )
}

/** Grid Cell — một ô vị trí trong grid */
const GridCell: React.FC<{
  location: LocationData
  isSelected: boolean
  selectable: boolean
  disabled?: boolean
  showTooltip: boolean
  onSelect: () => void
  onToggleTooltip: () => void
  onCloseTooltip: () => void
}> = ({ location, isSelected, selectable, disabled, showTooltip, onSelect, onToggleTooltip, onCloseTooltip }) => {
  const status = getLocationStatus(location)
  const cfg = getStatusConfig(status)
  const fillPct = getFillPercent(location)

  const handleClick = () => {
    if (disabled || !selectable) return
    onSelect()
  }

  const handleLongPress = () => {
    onToggleTooltip()
  }

  // Long press detection
  const [pressTimer, setPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null)

  const handleTouchStart = () => {
    const timer = setTimeout(handleLongPress, 500)
    setPressTimer(timer)
  }

  const handleTouchEnd = () => {
    if (pressTimer) {
      clearTimeout(pressTimer)
      setPressTimer(null)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled || !selectable}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={handleLongPress}
        onMouseLeave={onCloseTooltip}
        className={`
          relative w-full h-[56px] rounded-lg
          flex flex-col items-center justify-center
          text-[10px] font-medium transition-all duration-150
          border
          ${isSelected
            ? `${cfg.bgSelected} ring-2 ring-[#2D8B6E] ring-offset-1 scale-[1.05] border-[#2D8B6E] shadow-md`
            : `${cfg.bg} border-transparent hover:border-gray-300`
          }
          ${!selectable || disabled
            ? 'opacity-40 cursor-not-allowed'
            : 'cursor-pointer active:scale-95'
          }
        `}
      >
        {/* Mã vị trí */}
        <span className={`font-bold text-[11px] leading-tight ${isSelected ? 'text-[#1B4D3E]' : cfg.text}`}>
          {location.code.replace(/^[A-Z]+-/, '')}
        </span>

        {/* Fill indicator */}
        {location.capacity && location.is_available ? (
          <span className={`text-[9px] mt-0.5 ${isSelected ? 'text-[#1B4D3E]/70' : 'text-gray-500'}`}>
            {location.current_quantity}/{location.capacity}
          </span>
        ) : location.current_quantity > 0 && location.is_available ? (
          <span className={`text-[9px] mt-0.5 ${isSelected ? 'text-[#1B4D3E]/70' : 'text-gray-500'}`}>
            {location.current_quantity}
          </span>
        ) : null}

        {/* Fill bar (bottom) */}
        {location.capacity && location.is_available && fillPct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] rounded-b-lg overflow-hidden bg-black/5">
            <div
              className={`h-full transition-all ${
                fillPct >= 80 ? 'bg-red-400' : 'bg-amber-400'
              }`}
              style={{ width: `${Math.min(fillPct, 100)}%` }}
            />
          </div>
        )}

        {/* Selected checkmark */}
        {isSelected && (
          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#2D8B6E] rounded-full 
                          flex items-center justify-center shadow-sm">
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </div>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <LocationTooltip location={location} onClose={onCloseTooltip} />
      )}
    </div>
  )
}

/** List Item — hiển thị dạng danh sách */
const ListItem: React.FC<{
  location: LocationData
  isSelected: boolean
  selectable: boolean
  disabled?: boolean
  onSelect: () => void
}> = ({ location, isSelected, selectable, disabled, onSelect }) => {
  const status = getLocationStatus(location)
  const cfg = getStatusConfig(status)
  const fillPct = getFillPercent(location)

  return (
    <button
      type="button"
      disabled={disabled || !selectable}
      onClick={onSelect}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
        transition-all duration-150 text-left
        ${isSelected
          ? 'bg-[#1B4D3E]/5 ring-1 ring-[#2D8B6E]'
          : 'bg-white hover:bg-gray-50'
        }
        ${!selectable || disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'cursor-pointer active:scale-[0.98]'
        }
      `}
    >
      {/* Status dot */}
      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${cfg.dot} ${isSelected ? 'ring-2 ring-[#2D8B6E] ring-offset-1' : ''}`} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[13px] text-gray-800">{location.code}</span>
          <span className={`px-1.5 py-0.5 text-[9px] font-semibold rounded-full ${cfg.bg} ${cfg.text}`}>
            {cfg.label}
          </span>
        </div>
        {location.capacity ? (
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
              <div
                className={`h-full rounded-full ${
                  fillPct >= 80 ? 'bg-red-400' : fillPct > 0 ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
                style={{ width: `${Math.min(fillPct, 100)}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-gray-500">
              {location.current_quantity}/{location.capacity} ({fillPct}%)
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-gray-400 mt-0.5 block">
            {location.current_quantity > 0 ? `Đang chứa: ${location.current_quantity}` : 'Trống'}
          </span>
        )}
      </div>

      {/* Selected check */}
      {isSelected && (
        <div className="w-6 h-6 bg-[#2D8B6E] rounded-full flex items-center justify-center flex-shrink-0">
          <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
        </div>
      )}
    </button>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const LocationPicker: React.FC<LocationPickerProps> = ({
  warehouse_id,
  selectedId,
  onSelect,
  mode = 'stock-in',
  multiSelect = false,
  selectedIds = [],
  onMultiSelect,
  label = 'Chọn vị trí kho',
  showLegend = true,
  showSearch = true,
  showShelfFilter = true,
  showSummary = true,
  className = '',
  disabled = false,
}) => {
  // State
  const [locations, setLocations] = useState<LocationData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [activeShelf, setActiveShelf] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [tooltipId, setTooltipId] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  // ------------------------------------------------------------------
  // LOAD LOCATIONS
  // ------------------------------------------------------------------
  const loadLocations = useCallback(async () => {
    if (!warehouse_id) {
      setLocations([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchErr } = await supabase
        .from('warehouse_locations')
        .select('id, code, shelf, row_name, column_name, capacity, current_quantity, is_available')
        .eq('warehouse_id', warehouse_id)
        .order('shelf', { ascending: true })
        .order('row_name', { ascending: true })
        .order('column_name', { ascending: true })

      if (fetchErr) throw fetchErr
      setLocations((data || []) as LocationData[])
    } catch (err) {
      console.error('LocationPicker: load error', err)
      setError('Không thể tải vị trí kho')
      setLocations([])
    } finally {
      setLoading(false)
    }
  }, [warehouse_id])

  useEffect(() => {
    loadLocations()
    // Reset selection state when warehouse changes
    setActiveShelf(null)
    setSearchText('')
    setTooltipId(null)
    setCollapsed(false)
  }, [loadLocations])

  // ------------------------------------------------------------------
  // COMPUTED DATA
  // ------------------------------------------------------------------

  /** Danh sách kệ */
  const shelves = useMemo(() => {
    const set = new Set<string>()
    locations.forEach(l => {
      if (l.shelf) set.add(l.shelf)
    })
    return [...set].sort()
  }, [locations])

  /** Locations sau filter */
  const filteredLocations = useMemo(() => {
    let result = locations

    // Filter by shelf
    if (activeShelf) {
      result = result.filter(l => l.shelf === activeShelf)
    }

    // Filter by search
    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim()
      result = result.filter(l => l.code.toLowerCase().includes(q))
    }

    return result
  }, [locations, activeShelf, searchText])

  /** Locations grouped by shelf */
  const groupedByShelf = useMemo(() => {
    const groups: Record<string, LocationData[]> = {}
    filteredLocations.forEach(loc => {
      const shelf = loc.shelf || 'Khác'
      if (!groups[shelf]) groups[shelf] = []
      groups[shelf].push(loc)
    })
    return groups
  }, [filteredLocations])

  // ------------------------------------------------------------------
  // HANDLERS
  // ------------------------------------------------------------------

  const handleSelect = (loc: LocationData) => {
    if (disabled) return

    if (multiSelect && onMultiSelect) {
      const currentIds = new Set(selectedIds)
      if (currentIds.has(loc.id)) {
        currentIds.delete(loc.id)
      } else {
        currentIds.add(loc.id)
      }
      const selected = locations.filter(l => currentIds.has(l.id))
      onMultiSelect(selected)
    } else {
      // Toggle: bấm lại → bỏ chọn
      if (selectedId === loc.id) {
        onSelect(null)
      } else {
        onSelect(loc)
      }
    }
  }

  const isLocationSelected = (locId: string) => {
    if (multiSelect) return selectedIds.includes(locId)
    return selectedId === locId
  }

  // ------------------------------------------------------------------
  // RENDER: NO WAREHOUSE
  // ------------------------------------------------------------------

  if (!warehouse_id) {
    return (
      <div className={`rounded-xl border border-dashed border-gray-300 p-6 text-center ${className}`}>
        <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-400">Vui lòng chọn kho trước</p>
      </div>
    )
  }

  // ------------------------------------------------------------------
  // RENDER: LOADING
  // ------------------------------------------------------------------

  if (loading) {
    return (
      <div className={`space-y-3 ${className}`}>
        {label && (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#1B4D3E]" />
            <span className="text-sm font-semibold text-gray-700">{label}</span>
          </div>
        )}
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="h-[56px] rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------------
  // RENDER: ERROR
  // ------------------------------------------------------------------

  if (error) {
    return (
      <div className={`rounded-xl border border-red-200 bg-red-50 p-4 ${className}`}>
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
        <button
          type="button"
          onClick={loadLocations}
          className="mt-2 text-xs text-red-500 underline"
        >
          Thử lại
        </button>
      </div>
    )
  }

  // ------------------------------------------------------------------
  // RENDER: EMPTY
  // ------------------------------------------------------------------

  if (locations.length === 0) {
    return (
      <div className={`rounded-xl border border-dashed border-gray-300 p-6 text-center ${className}`}>
        <Grid3X3 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-400">Chưa có vị trí nào trong kho này</p>
        <p className="text-xs text-gray-300 mt-1">Vào Quản lý kho để tạo vị trí</p>
      </div>
    )
  }

  // ------------------------------------------------------------------
  // RENDER: MAIN
  // ------------------------------------------------------------------

  const selectedLocation = selectedId ? locations.find(l => l.id === selectedId) : null

  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-700
                     active:opacity-70 transition-opacity"
        >
          <MapPin className="w-4 h-4 text-[#1B4D3E]" />
          <span>{label}</span>
          {selectedLocation && (
            <span className="px-2 py-0.5 text-[11px] font-bold text-[#1B4D3E] bg-[#1B4D3E]/10 rounded-full">
              {selectedLocation.code}
            </span>
          )}
          {multiSelect && selectedIds.length > 0 && (
            <span className="px-2 py-0.5 text-[11px] font-bold text-[#1B4D3E] bg-[#1B4D3E]/10 rounded-full">
              {selectedIds.length} vị trí
            </span>
          )}
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {/* View mode toggle */}
        {!collapsed && (
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-[#1B4D3E] shadow-sm'
                  : 'text-gray-400'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-[#1B4D3E] shadow-sm'
                  : 'text-gray-400'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Collapsed: show selected only ── */}
      {collapsed && selectedLocation && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#1B4D3E]/5 rounded-lg">
          <div className={`w-3 h-3 rounded-full ${getStatusConfig(getLocationStatus(selectedLocation)).dot}`} />
          <span className="text-sm font-medium text-gray-700">{selectedLocation.code}</span>
          {selectedLocation.capacity && (
            <span className="text-xs font-mono text-gray-500">
              {selectedLocation.current_quantity}/{selectedLocation.capacity}
            </span>
          )}
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="ml-auto text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Content (when not collapsed) ── */}
      {!collapsed && (
        <>
          {/* Summary */}
          {showSummary && <SummaryBar locations={locations} />}

          {/* Search + Shelf Filter */}
          <div className="flex items-center gap-2">
            {/* Search */}
            {showSearch && (
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm mã vị trí..."
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  className="w-full h-9 pl-8 pr-3 text-[13px] bg-gray-50 border border-gray-200
                             rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2D8B6E] focus:border-[#2D8B6E]"
                />
                {searchText && (
                  <button
                    type="button"
                    onClick={() => setSearchText('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Shelf Filter Chips */}
            {showShelfFilter && shelves.length > 1 && (
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setActiveShelf(null)}
                  className={`flex-shrink-0 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg
                    transition-colors whitespace-nowrap
                    ${!activeShelf
                      ? 'bg-[#1B4D3E] text-white'
                      : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                    }`}
                >
                  Tất cả
                </button>
                {shelves.map(shelf => (
                  <button
                    key={shelf}
                    type="button"
                    onClick={() => setActiveShelf(activeShelf === shelf ? null : shelf)}
                    className={`flex-shrink-0 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg
                      transition-colors whitespace-nowrap
                      ${activeShelf === shelf
                        ? 'bg-[#1B4D3E] text-white'
                        : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                      }`}
                  >
                    {shelf}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Legend */}
          {showLegend && <Legend mode={mode} />}

          {/* No results */}
          {filteredLocations.length === 0 && (
            <div className="text-center py-4 text-gray-400 text-sm">
              <Info className="w-5 h-5 mx-auto mb-1" />
              Không tìm thấy vị trí phù hợp
            </div>
          )}

          {/* ── GRID VIEW ── */}
          {viewMode === 'grid' && filteredLocations.length > 0 && (
            <div className="space-y-3">
              {Object.entries(groupedByShelf).map(([shelf, locs]) => (
                <div key={shelf}>
                  <div className="text-[11px] font-semibold text-gray-500 mb-1.5 px-0.5">
                    Kệ {shelf}
                    <span className="font-normal text-gray-400 ml-1">
                      ({locs.filter(l => isSelectable(l, mode)).length} có thể chọn)
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {locs.map(loc => (
                      <GridCell
                        key={loc.id}
                        location={loc}
                        isSelected={isLocationSelected(loc.id)}
                        selectable={isSelectable(loc, mode)}
                        disabled={disabled}
                        showTooltip={tooltipId === loc.id}
                        onSelect={() => handleSelect(loc)}
                        onToggleTooltip={() => setTooltipId(tooltipId === loc.id ? null : loc.id)}
                        onCloseTooltip={() => setTooltipId(null)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── LIST VIEW ── */}
          {viewMode === 'list' && filteredLocations.length > 0 && (
            <div className="space-y-1">
              {Object.entries(groupedByShelf).map(([shelf, locs]) => (
                <div key={shelf}>
                  <div className="text-[11px] font-semibold text-gray-500 mb-1 px-1 mt-2 first:mt-0">
                    Kệ {shelf}
                  </div>
                  {locs.map(loc => (
                    <ListItem
                      key={loc.id}
                      location={loc}
                      isSelected={isLocationSelected(loc.id)}
                      selectable={isSelectable(loc, mode)}
                      disabled={disabled}
                      onSelect={() => handleSelect(loc)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Helper text */}
          {mode === 'stock-in' && (
            <p className="text-[10px] text-gray-400 flex items-center gap-1 px-1">
              <Info className="w-3 h-3 flex-shrink-0" />
              Chọn ô trống hoặc chưa đầy để nhập kho. Giữ/hover để xem chi tiết.
            </p>
          )}
          {mode === 'stock-out' && (
            <p className="text-[10px] text-gray-400 flex items-center gap-1 px-1">
              <Info className="w-3 h-3 flex-shrink-0" />
              Chọn ô có hàng để xuất kho. Hệ thống ưu tiên FIFO (lô cũ trước).
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default LocationPicker