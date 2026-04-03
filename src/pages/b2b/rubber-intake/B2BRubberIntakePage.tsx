// ============================================================================
// B2B RUBBER INTAKE PAGE — Lý lịch mủ tích hợp B2B Thu mua
// File: src/pages/b2b/rubber-intake/B2BRubberIntakePage.tsx
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileCheck, Search, Filter, RefreshCw, ChevronRight,
  Package, Scale, Droplets, DollarSign, Truck, Link2, MapPin,
} from 'lucide-react'
import {
  rubberIntakeB2BService,
  type B2BRubberIntake,
  type RubberIntakeFilter,
  type RubberIntakeStats,
  SOURCE_LABELS, STATUS_LABELS, STATUS_COLORS,
} from '../../../services/b2b/rubberIntakeB2BService'

// ============================================================================
// INTAKE CARD
// ============================================================================

function IntakeCard({ item, onClick }: { item: B2BRubberIntake; onClick: () => void }) {
  const weight = item.settled_qty_ton || (item.net_weight_kg ? item.net_weight_kg / 1000 : 0)
  const amount = item.total_amount || (item.settled_qty_ton && item.settled_price_per_ton ? item.settled_qty_ton * item.settled_price_per_ton : 0)
  const statusClass = STATUS_COLORS[item.status] || STATUS_COLORS.draft
  const hasDeal = !!item.deal_id

  return (
    <button onClick={onClick} className="w-full text-left bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md hover:border-gray-200 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {item.lot_code && (
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{item.lot_code}</span>
          )}
          <span className="text-xs font-medium text-gray-500">{item.product_code}</span>
          {item.invoice_no && <span className="text-[10px] text-gray-400">#{item.invoice_no}</span>}
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusClass}`}>
          {STATUS_LABELS[item.status]}
        </span>
      </div>

      {/* Date + Source */}
      <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
        <span>{new Date(item.intake_date).toLocaleDateString('vi-VN')}</span>
        <span>•</span>
        <span>{SOURCE_LABELS[item.source_type] || item.source_type}</span>
        {item.location_name && (
          <>
            <span>•</span>
            <span className="flex items-center gap-0.5"><MapPin size={10} />{item.location_name}</span>
          </>
        )}
      </div>

      {/* Supplier / Partner */}
      <div className="mb-3">
        {item.partner ? (
          <div className="flex items-center gap-2">
            <Link2 size={13} className="text-blue-500" />
            <span className="text-sm font-semibold text-gray-800">{item.partner.name}</span>
            <span className="text-[10px] text-gray-400">{item.partner.code}</span>
            {item.partner.tier && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">
                {item.partner.tier === 'diamond' ? '💎' : item.partner.tier === 'gold' ? '🥇' : item.partner.tier === 'silver' ? '🥈' : '🆕'}
              </span>
            )}
          </div>
        ) : item.supplier ? (
          <div className="flex items-center gap-2">
            <Package size={13} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">{item.supplier.name}</span>
            <span className="text-[10px] text-gray-400">{item.supplier.code}</span>
          </div>
        ) : (
          <span className="text-sm text-gray-400">Chưa có NCC</span>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-1.5 bg-gray-50 rounded-lg">
          <div className="text-xs font-bold text-gray-700">{weight.toFixed(1)}T</div>
          <div className="text-[9px] text-gray-400">Khối lượng</div>
        </div>
        {item.drc_percent && (
          <div className="text-center p-1.5 bg-emerald-50 rounded-lg">
            <div className="text-xs font-bold text-emerald-700">{item.drc_percent}%</div>
            <div className="text-[9px] text-emerald-500">DRC</div>
          </div>
        )}
        {amount > 0 && (
          <div className="text-center p-1.5 bg-amber-50 rounded-lg">
            <div className="text-xs font-bold text-amber-700">{(amount / 1_000_000).toFixed(1)}M</div>
            <div className="text-[9px] text-amber-500">Giá trị</div>
          </div>
        )}
      </div>

      {/* Deal link */}
      {item.deal && (
        <div className="mt-2 pt-2 border-t border-gray-50 flex items-center gap-2 text-[11px]">
          <Link2 size={12} className="text-blue-500" />
          <span className="text-blue-600 font-medium">Deal {item.deal.deal_number}</span>
          <span className="text-gray-400">— {item.deal.status}</span>
        </div>
      )}

      {/* Vehicle */}
      {item.vehicle_plate && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-400">
          <Truck size={11} /> {item.vehicle_plate} {item.vehicle_label && `(${item.vehicle_label})`}
        </div>
      )}
    </button>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function B2BRubberIntakePage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<B2BRubberIntake[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<RubberIntakeStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [dealFilter, setDealFilter] = useState<'all' | 'linked' | 'standalone'>('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const filter: RubberIntakeFilter = {
      search: search || undefined,
      status: statusFilter || undefined,
      source_type: sourceFilter || undefined,
      has_deal: dealFilter === 'linked' ? true : dealFilter === 'standalone' ? false : undefined,
      pageSize: 100,
    }
    const [result, statsResult] = await Promise.all([
      rubberIntakeB2BService.getAll(filter),
      rubberIntakeB2BService.getStats(),
    ])
    setItems(result.data)
    setTotal(result.total)
    setStats(statsResult)
    setLoading(false)
  }, [search, statusFilter, sourceFilter, dealFilter])

  useEffect(() => { fetchData() }, [fetchData])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(fetchData, 300)
    return () => clearTimeout(t)
  }, [search])

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <FileCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Lý lịch mủ</h1>
            <p className="text-xs text-gray-500">Quản lý lý lịch mủ — Tích hợp B2B Thu mua</p>
          </div>
        </div>
        <button onClick={fetchData} className="p-2.5 text-gray-500 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
            <div className="text-xs text-gray-500">Tổng phiếu</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.with_deal}</div>
            <div className="text-xs text-blue-500">Liên kết Deal</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className="text-2xl font-bold text-emerald-600">{(stats.total_weight_kg / 1000).toFixed(1)}T</div>
            <div className="text-xs text-emerald-500">Tổng KL</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className="text-2xl font-bold text-amber-600">{(stats.total_amount / 1_000_000).toFixed(0)}M</div>
            <div className="text-xs text-amber-500">Giá trị</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm mã lô, product code, invoice, biển xe..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm min-h-[44px]"
          />
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {/* Status */}
          {['', 'draft', 'confirmed', 'settled'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${statusFilter === s ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s ? STATUS_LABELS[s] : 'Tất cả TT'}
            </button>
          ))}
          <div className="w-px bg-gray-200 mx-1" />
          {/* Deal link */}
          {[
            { key: 'all', label: 'Tất cả' },
            { key: 'linked', label: '🔗 Có Deal' },
            { key: 'standalone', label: '📦 Độc lập' },
          ].map(f => (
            <button key={f.key} onClick={() => setDealFilter(f.key as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${dealFilter === f.key ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileCheck className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium mb-1">Chưa có lý lịch mủ</p>
          <p className="text-sm">Lý lịch mủ sẽ được tạo tự động khi chấp nhận báo giá lô</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-400">{total} phiếu</p>
          {items.map(item => (
            <IntakeCard
              key={item.id}
              item={item}
              onClick={() => navigate(`/b2b/rubber-intake/${item.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
