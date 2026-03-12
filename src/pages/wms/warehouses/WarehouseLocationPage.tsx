// ============================================================================
// FILE: src/pages/wms/warehouses/WarehouseLocationPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P2 — Bước 2.8 (IMPROVED) — Grid vị trí kho + batch info
// ============================================================================
// CẢI TIẾN: Join stock_batches vào mỗi ô để hiển thị:
//   - Ô nào đang chứa hàng gì (material, batch_no)
//   - DRC, QC status, số lượng còn
//   - Tap ô → Bottom Sheet chi tiết
// Design: Industrial Mobile-First (WMS_UI_DESIGN_GUIDE.md §3.4)
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ArrowLeft,
  Plus,
  X,
  Package,
  MapPin,
  FlaskConical,
  Loader2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertTriangle,
  Info,
  Eye,
  Grid3X3,
  List,
  Search,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface Warehouse {
  id: string
  code: string
  name: string
  type: string
  address?: string
}

/** Lô hàng đang nằm tại 1 vị trí */
interface LocationBatch {
  id: string
  batch_no: string
  material_id: string
  material_sku: string
  material_name: string
  material_unit: string
  quantity_remaining: number
  latest_drc: number | null
  qc_status: string
  received_date: string
}

/** Vị trí kho + danh sách lô đang chứa */
interface LocationWithBatches {
  id: string
  warehouse_id: string
  code: string
  shelf: string | null
  row_name: string | null
  column_name: string | null
  capacity: number | null
  current_quantity: number
  is_available: boolean
  created_at: string
  // Joined
  batches: LocationBatch[]
  // Computed
  status: 'empty' | 'partial' | 'full' | 'unavailable'
  usage_percent: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; label: string }> = {
  empty:       { bg: '#D1FAE5', border: '#86EFAC', text: '#166534', label: 'Trống' },
  partial:     { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E', label: 'Đang dùng' },
  full:        { bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B', label: 'Đầy' },
  unavailable: { bg: '#F3F4F6', border: '#D1D5DB', text: '#9CA3AF', label: 'Không dùng' },
}

const QC_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  passed:      { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  warning:     { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  failed:      { bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500' },
  needs_blend: { bg: 'bg-purple-50',  text: 'text-purple-700',  dot: 'bg-purple-500' },
  pending:     { bg: 'bg-gray-50',    text: 'text-gray-500',    dot: 'bg-gray-400' },
}

// ============================================================================
// HELPERS
// ============================================================================

function computeStatus(loc: { is_available: boolean; capacity: number | null; current_quantity: number }) {
  if (!loc.is_available) return { status: 'unavailable' as const, usage_percent: 0 }
  if (loc.current_quantity <= 0) return { status: 'empty' as const, usage_percent: 0 }
  if (!loc.capacity || loc.capacity <= 0) return { status: 'partial' as const, usage_percent: 50 }
  const pct = Math.round((loc.current_quantity / loc.capacity) * 100)
  if (pct >= 80) return { status: 'full' as const, usage_percent: pct }
  return { status: 'partial' as const, usage_percent: pct }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/** Legend */
const Legend: React.FC = () => (
  <div className="flex items-center gap-3 flex-wrap">
    {(['empty', 'partial', 'full', 'unavailable'] as const).map(s => (
      <div key={s} className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm border"
          style={{ backgroundColor: STATUS_COLORS[s].bg, borderColor: STATUS_COLORS[s].border }} />
        <span className="text-[11px] text-gray-500">{STATUS_COLORS[s].label}</span>
      </div>
    ))}
  </div>
)

/** Grid cell — 1 ô kho */
const LocationCell: React.FC<{
  loc: LocationWithBatches
  onTap: () => void
  compact: boolean
}> = ({ loc, onTap, compact }) => {
  const style = STATUS_COLORS[loc.status] || STATUS_COLORS.empty
  const hasBatches = loc.batches.length > 0
  const firstBatch = loc.batches[0]

  return (
    <button
      type="button"
      onClick={onTap}
      className="w-full aspect-square rounded-xl border-2 p-1.5 flex flex-col items-center justify-center
        transition-all active:scale-[0.93] relative overflow-hidden"
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
        minHeight: compact ? '60px' : '80px',
      }}
    >
      {/* Mã ô */}
      <span className="text-[10px] font-bold leading-tight"
        style={{ color: style.text, fontFamily: "'JetBrains Mono', monospace" }}>
        {loc.column_name || loc.code.split('-').pop() || loc.code}
      </span>

      {/* Batch info (if has stock) */}
      {hasBatches && firstBatch && (
        <>
          {/* Material name (truncated) */}
          <span className="text-[8px] font-medium leading-tight truncate w-full text-center mt-0.5"
            style={{ color: style.text }}>
            {firstBatch.material_sku || firstBatch.material_name.slice(0, 8)}
          </span>

          {/* Quantity */}
          <span className="text-[9px] font-bold leading-tight mt-0.5"
            style={{ color: style.text, fontFamily: "'JetBrains Mono', monospace" }}>
            {firstBatch.quantity_remaining > 999
              ? `${(firstBatch.quantity_remaining / 1000).toFixed(1)}k`
              : firstBatch.quantity_remaining}
          </span>

          {/* QC dot */}
          {firstBatch.qc_status && (
            <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${(QC_COLORS[firstBatch.qc_status] || QC_COLORS.pending).dot}`} />
          )}

          {/* Multiple batches indicator */}
          {loc.batches.length > 1 && (
            <div className="absolute bottom-0.5 right-1 bg-white/80 rounded px-1 text-[7px] font-bold"
              style={{ color: style.text }}>
              +{loc.batches.length - 1}
            </div>
          )}
        </>
      )}

      {/* Empty indicator */}
      {!hasBatches && loc.status === 'empty' && (
        <span className="text-[8px] text-gray-400 mt-0.5">trống</span>
      )}
    </button>
  )
}

/** Bottom Sheet — chi tiết vị trí */
const LocationDetail: React.FC<{
  loc: LocationWithBatches
  onClose: () => void
}> = ({ loc, onClose }) => {
  const style = STATUS_COLORS[loc.status] || STATUS_COLORS.empty

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end"
      onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-2xl max-h-[80vh] overflow-y-auto safe-bottom"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp 200ms ease-out' }}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: style.bg, borderColor: style.border }}>
                <MapPin className="w-6 h-6" style={{ color: style.text }} />
              </div>
              <div>
                <h3 className="text-[16px] font-bold text-gray-900"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {loc.code}
                </h3>
                <p className="text-[12px] text-gray-500">
                  {loc.shelf ? `Kệ ${loc.shelf}` : ''}
                  {loc.row_name ? ` · Hàng ${loc.row_name}` : ''}
                  {loc.column_name ? ` · Ô ${loc.column_name}` : ''}
                </p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Usage bar */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(loc.usage_percent, 100)}%`,
                  backgroundColor: style.border,
                }} />
            </div>
            <span className="text-[12px] font-bold" style={{ color: style.text }}>
              {loc.usage_percent}%
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
            <span>Đang chứa: {loc.current_quantity.toLocaleString('vi-VN')}</span>
            <span>Sức chứa: {loc.capacity ? loc.capacity.toLocaleString('vi-VN') : '—'}</span>
          </div>
        </div>

        {/* Batch list */}
        <div className="px-4 py-3">
          {loc.batches.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-[13px] text-gray-400">Ô này đang trống</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[12px] font-bold text-gray-700 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-gray-400" />
                Lô hàng tại vị trí ({loc.batches.length})
              </p>
              {loc.batches.map(batch => {
                const qc = QC_COLORS[batch.qc_status] || QC_COLORS.pending
                return (
                  <div key={batch.id} className="p-3 rounded-xl border border-gray-200 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[13px] font-bold text-gray-900"
                            style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                            {batch.batch_no}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${qc.bg} ${qc.text}`}>
                            {batch.qc_status === 'passed' && 'Đạt'}
                            {batch.qc_status === 'warning' && 'Cảnh báo'}
                            {batch.qc_status === 'failed' && 'Không đạt'}
                            {batch.qc_status === 'needs_blend' && 'Phối trộn'}
                            {batch.qc_status === 'pending' && 'Chờ QC'}
                          </span>
                        </div>
                        <p className="text-[12px] text-gray-600 truncate">
                          {batch.material_sku} — {batch.material_name}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Nhập: {new Date(batch.received_date).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[15px] font-bold text-[#1B4D3E]"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {batch.quantity_remaining.toLocaleString('vi-VN')}
                        </p>
                        <p className="text-[11px] text-gray-400">{batch.material_unit}</p>
                        {batch.latest_drc != null && (
                          <div className="flex items-center gap-1 justify-end mt-0.5">
                            <FlaskConical className="w-3 h-3 text-gray-400" />
                            <span className="text-[11px] text-gray-500"
                              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                              {batch.latest_drc.toFixed(1)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Bottom padding */}
        <div className="h-6" />
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const WarehouseLocationPage: React.FC = () => {
  const navigate = useNavigate()
  const { id: warehouseId } = useParams<{ id: string }>()

  // Data
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null)
  const [locations, setLocations] = useState<LocationWithBatches[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // UI
  const [selectedLoc, setSelectedLoc] = useState<LocationWithBatches | null>(null)
  const [filterShelf, setFilterShelf] = useState<string>('all')
  const [searchText, setSearchText] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // ========================================================================
  // LOAD DATA — warehouse + locations + batches
  // ========================================================================

  const loadData = useCallback(async () => {
    if (!warehouseId) return

    try {
      // 1. Load warehouse info
      const { data: wh, error: whErr } = await supabase
        .from('warehouses')
        .select('id, code, name, type, address')
        .eq('id', warehouseId)
        .single()

      if (whErr) throw whErr
      setWarehouse(wh)

      // 2. Load all locations in this warehouse
      const { data: locs, error: locErr } = await supabase
        .from('warehouse_locations')
        .select('*')
        .eq('warehouse_id', warehouseId)
        .order('shelf', { ascending: true })
        .order('row_name', { ascending: true })
        .order('column_name', { ascending: true })

      if (locErr) throw locErr

      // 3. Load ALL active batches in this warehouse (join material)
      const { data: batches, error: batchErr } = await supabase
        .from('stock_batches')
        .select(`
          id, batch_no, material_id, location_id,
          quantity_remaining, latest_drc, qc_status,
          received_date, status,
          material:materials(id, sku, name, unit)
        `)
        .eq('warehouse_id', warehouseId)
        .eq('status', 'active')
        .gt('quantity_remaining', 0)
        .order('received_date', { ascending: true })

      if (batchErr) throw batchErr

      // 4. Map batches vào locations
      const batchMap = new Map<string, LocationBatch[]>()
      for (const b of (batches || [])) {
        const locId = b.location_id
        if (!locId) continue

        const mapped: LocationBatch = {
          id: b.id,
          batch_no: b.batch_no,
          material_id: b.material_id,
          material_sku: (b.material as any)?.sku || '',
          material_name: (b.material as any)?.name || '',
          material_unit: (b.material as any)?.unit || 'bành',
          quantity_remaining: b.quantity_remaining,
          latest_drc: b.latest_drc,
          qc_status: b.qc_status,
          received_date: b.received_date,
        }

        if (!batchMap.has(locId)) batchMap.set(locId, [])
        batchMap.get(locId)!.push(mapped)
      }

      // 5. Merge
      const merged: LocationWithBatches[] = (locs || []).map(loc => {
        const locBatches = batchMap.get(loc.id) || []
        const { status, usage_percent } = computeStatus(loc)
        return {
          ...loc,
          batches: locBatches,
          status,
          usage_percent,
        }
      })

      setLocations(merged)
    } catch (e) {
      console.error('Lỗi load dữ liệu kho:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [warehouseId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleRefresh = () => {
    setRefreshing(true)
    loadData()
  }

  // ========================================================================
  // DERIVED
  // ========================================================================

  // Unique shelves
  const shelves = useMemo(() => {
    const set = new Set<string>()
    locations.forEach(l => { if (l.shelf) set.add(l.shelf) })
    return Array.from(set).sort()
  }, [locations])

  // Filtered locations
  const filtered = useMemo(() => {
    let list = locations
    if (filterShelf !== 'all') {
      list = list.filter(l => l.shelf === filterShelf)
    }
    if (searchText.trim()) {
      const term = searchText.toLowerCase().trim()
      list = list.filter(l =>
        l.code.toLowerCase().includes(term) ||
        l.batches.some(b =>
          b.batch_no.toLowerCase().includes(term) ||
          b.material_name.toLowerCase().includes(term) ||
          b.material_sku.toLowerCase().includes(term)
        )
      )
    }
    return list
  }, [locations, filterShelf, searchText])

  // Group by shelf
  const groupedByShelves = useMemo(() => {
    const map = new Map<string, LocationWithBatches[]>()
    for (const loc of filtered) {
      const key = loc.shelf || 'Không có kệ'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(loc)
    }
    return map
  }, [filtered])

  // Stats
  const stats = useMemo(() => {
    const total = locations.length
    const empty = locations.filter(l => l.status === 'empty').length
    const partial = locations.filter(l => l.status === 'partial').length
    const full = locations.filter(l => l.status === 'full').length
    const unavailable = locations.filter(l => l.status === 'unavailable').length
    const totalBatches = locations.reduce((s, l) => s + l.batches.length, 0)
    return { total, empty, partial, full, unavailable, totalBatches }
  }, [locations])

  // ========================================================================
  // RENDER
  // ========================================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center"
        style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>
        <div className="flex items-center gap-3 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Đang tải vị trí kho...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7F5F2] flex flex-col"
      style={{ fontFamily: "'Be Vietnam Pro', sans-serif" }}>

      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-[#1B4D3E] text-white safe-top">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 active:bg-white/20">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-[16px] font-bold">
              {warehouse?.name || 'Kho'}
              {warehouse?.code && (
                <span className="ml-2 text-[12px] bg-white/20 px-2 py-0.5 rounded-md font-mono">
                  {warehouse.code}
                </span>
              )}
            </h1>
            <p className="text-[12px] text-white/70">
              {stats.total} ô · {stats.totalBatches} lô hàng
            </p>
          </div>
          <button onClick={handleRefresh}
            className={`w-10 h-10 flex items-center justify-center rounded-xl bg-white/10
              ${refreshing ? 'animate-spin' : ''}`}>
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Stats strip */}
        <div className="flex items-center gap-3 px-4 pb-3 overflow-x-auto">
          {[
            { label: 'Tổng', value: stats.total, color: '#fff' },
            { label: 'Trống', value: stats.empty, color: '#86EFAC' },
            { label: 'Đang dùng', value: stats.partial, color: '#FCD34D' },
            { label: 'Đầy', value: stats.full, color: '#FCA5A5' },
            { label: 'Không dùng', value: stats.unavailable, color: '#9CA3AF' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5 shrink-0">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-[11px] text-white/80">{s.label}:</span>
              <span className="text-[12px] font-bold text-white">{s.value}</span>
            </div>
          ))}
        </div>
      </header>

      {/* TOOLBAR */}
      <div className="bg-white border-b border-gray-100 px-4 py-2.5 space-y-2">
        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Tìm mã ô, lô, sản phẩm..."
              className="w-full min-h-[40px] pl-9 pr-4 rounded-lg border border-gray-200
                text-[14px] focus:outline-none focus:border-[#2D8B6E]"
            />
          </div>
          <button
            type="button"
            onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
            className="w-10 h-10 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500"
          >
            {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
          </button>
        </div>

        {/* Shelf tabs */}
        {shelves.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              onClick={() => setFilterShelf('all')}
              className={`text-[12px] px-3 py-1.5 rounded-full border font-medium whitespace-nowrap
                ${filterShelf === 'all'
                  ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]'
                  : 'bg-white text-gray-600 border-gray-200'}`}
            >
              Tất cả
            </button>
            {shelves.map(s => (
              <button
                key={s}
                onClick={() => setFilterShelf(s)}
                className={`text-[12px] px-3 py-1.5 rounded-full border font-medium whitespace-nowrap
                  ${filterShelf === s
                    ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]'
                    : 'bg-white text-gray-600 border-gray-200'}`}
              >
                Kệ {s}
              </button>
            ))}
          </div>
        )}

        <Legend />
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto pb-20">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">
              {locations.length === 0 ? 'Kho chưa có vị trí nào' : 'Không tìm thấy vị trí phù hợp'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          // GRID VIEW — grouped by shelf
          <div className="p-4 space-y-5">
            {Array.from(groupedByShelves.entries()).map(([shelf, locs]) => (
              <div key={shelf}>
                <p className="text-[12px] font-bold text-[#1B4D3E] mb-2 flex items-center gap-1.5 sticky top-0 bg-[#F7F5F2] py-1 z-10">
                  <Grid3X3 className="w-3.5 h-3.5" />
                  {shelf.startsWith('K') ? `Kệ ${shelf}` : shelf} · {locs.length} ô
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {locs.map(loc => (
                    <LocationCell
                      key={loc.id}
                      loc={loc}
                      onTap={() => setSelectedLoc(loc)}
                      compact={locs.length > 15}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // LIST VIEW
          <div className="p-4 space-y-2">
            {filtered.map(loc => {
              const style = STATUS_COLORS[loc.status] || STATUS_COLORS.empty
              const hasBatches = loc.batches.length > 0
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => setSelectedLoc(loc)}
                  className="w-full text-left p-3 rounded-xl border bg-white border-gray-200
                    flex items-center gap-3 active:scale-[0.98] transition-all"
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: style.bg, border: `2px solid ${style.border}` }}>
                    <span className="text-[11px] font-bold"
                      style={{ color: style.text, fontFamily: "'JetBrains Mono', monospace" }}>
                      {loc.column_name || loc.code.split('-').pop() || '?'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-gray-900"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {loc.code}
                    </p>
                    {hasBatches ? (
                      <p className="text-[12px] text-gray-600 truncate">
                        {loc.batches[0].material_sku} — {loc.batches[0].batch_no}
                        {loc.batches.length > 1 && ` (+${loc.batches.length - 1})`}
                      </p>
                    ) : (
                      <p className="text-[12px] text-gray-400">Trống</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {hasBatches && (
                      <>
                        <p className="text-[14px] font-bold text-[#1B4D3E]"
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {loc.batches.reduce((s, b) => s + b.quantity_remaining, 0).toLocaleString('vi-VN')}
                        </p>
                        {loc.batches[0].latest_drc != null && (
                          <p className="text-[11px] text-gray-400">DRC {loc.batches[0].latest_drc.toFixed(1)}%</p>
                        )}
                      </>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* BOTTOM SHEET — Location detail */}
      {selectedLoc && (
        <LocationDetail loc={selectedLoc} onClose={() => setSelectedLoc(null)} />
      )}

      {/* Animation */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default WarehouseLocationPage