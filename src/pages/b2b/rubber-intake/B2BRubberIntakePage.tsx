// ============================================================================
// B2B RUBBER INTAKE PAGE — Lý lịch mủ tích hợp B2B Thu mua
// File: src/pages/b2b/rubber-intake/B2BRubberIntakePage.tsx
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileCheck, Search, RefreshCw,
  Package, Truck, Link2, MapPin, Factory, Flame, Layers, ChevronRight,
} from 'lucide-react'
import {
  rubberIntakeB2BService,
  type B2BRubberIntake,
  type RubberIntakeFilter,
  type RubberIntakeStats,
  SOURCE_LABELS, STATUS_LABELS, STATUS_COLORS,
} from '../../../services/b2b/rubberIntakeB2BService'
import { facilityService, type Facility } from '../../../services/wms/facilityService'
import { RAW_RUBBER_TYPE_LABELS, type RawRubberType } from '../../../services/b2b/intakeManualEntryService'
import { B2BSectionTabs, INTAKE_TABS } from '../../../components/b2b/B2BSectionTabs'
import { Typography } from 'antd'

const { Title, Text } = Typography

// ============================================================================
// INTAKE CARD
// ============================================================================

function IntakeCard({ item, onClick }: { item: B2BRubberIntake; onClick: () => void }) {
  const netKg = item.net_weight_kg || 0
  const weight = item.settled_qty_ton || (netKg ? netKg / 1000 : 0)
  const amount = item.total_amount || (item.settled_qty_ton && item.settled_price_per_ton ? item.settled_qty_ton * item.settled_price_per_ton : 0)
  const statusClass = STATUS_COLORS[item.status] || STATUS_COLORS.draft
  const dryKg = item.dry_weight_kg ?? (item.drc_percent != null && netKg ? Math.round(netKg * item.drc_percent / 100 * 100) / 100 : null)
  const rawLabel = item.raw_rubber_type ? RAW_RUBBER_TYPE_LABELS[item.raw_rubber_type as RawRubberType] : null
  const isNuoc = item.raw_rubber_type === 'mu_nuoc'

  return (
    <button onClick={onClick} className="w-full text-left bg-white rounded-xl border border-gray-100 p-4 hover:shadow-md hover:border-gray-200 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {item.pnk_number != null && (
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">PNK #{item.pnk_number}</span>
          )}
          {item.lot_code && (
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{item.lot_code}</span>
          )}
          {rawLabel && (
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
              {isNuoc ? '💧' : '🪨'} {rawLabel}
            </span>
          )}
          {item.facility && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 flex items-center gap-0.5">
              <Factory size={10} /> {item.facility.code}
            </span>
          )}
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
        {item.consolidation_code && (
          <>
            <span>•</span>
            <span className="text-purple-600 font-medium">LLM: {item.consolidation_code}</span>
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

      {/* Metrics — 5 cột nếu là mủ nước (có ĐỐT/DRC/KL khô), 3 cột nếu khác */}
      <div className={`grid gap-2 ${isNuoc || item.drc_percent != null ? 'grid-cols-2 sm:grid-cols-5' : 'grid-cols-3'}`}>
        <div className="text-center p-1.5 bg-gray-50 rounded-lg">
          <div className="text-xs font-bold text-gray-700 tabular-nums">{weight.toFixed(2)}T</div>
          <div className="text-[9px] text-gray-400">Net (tươi)</div>
        </div>
        {item.field_dot_reading != null && (
          <div className="text-center p-1.5 bg-orange-50 rounded-lg">
            <div className="text-xs font-bold text-orange-700 tabular-nums flex items-center justify-center gap-0.5">
              <Flame size={10} /> {item.field_dot_reading}
            </div>
            <div className="text-[9px] text-orange-500">ĐỐT</div>
          </div>
        )}
        {item.drc_percent != null && (
          <div className="text-center p-1.5 bg-emerald-50 rounded-lg">
            <div className="text-xs font-bold text-emerald-700 tabular-nums">{item.drc_percent}%</div>
            <div className="text-[9px] text-emerald-500">DRC</div>
          </div>
        )}
        {dryKg != null && (
          <div className="text-center p-1.5 bg-teal-50 rounded-lg">
            <div className="text-xs font-bold text-teal-700 tabular-nums">{(dryKg / 1000).toFixed(2)}T</div>
            <div className="text-[9px] text-teal-600">KL khô</div>
          </div>
        )}
        {amount > 0 && (
          <div className="text-center p-1.5 bg-amber-50 rounded-lg">
            <div className="text-xs font-bold text-amber-700 tabular-nums">{(amount / 1_000_000).toFixed(1)}M</div>
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
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [dealFilter, setDealFilter] = useState<'all' | 'linked' | 'standalone'>('all')
  const [facilityFilter, setFacilityFilter] = useState<string>('')
  const [rawTypeFilter, setRawTypeFilter] = useState<RawRubberType | ''>('')
  const [facilities, setFacilities] = useState<Facility[]>([])
  // Sprint 3.4 — tab view mode
  const [viewMode, setViewMode] = useState<'list' | 'llm'>('list')
  const [llmExpanded, setLlmExpanded] = useState<Record<string, boolean>>({})

  // Load facilities dropdown once
  useEffect(() => {
    facilityService.getAllActive().then(setFacilities).catch(() => setFacilities([]))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    const filter: RubberIntakeFilter = {
      search: search || undefined,
      status: statusFilter || undefined,
      source_type: sourceFilter || undefined,
      facility_id: facilityFilter || undefined,
      raw_rubber_type: rawTypeFilter || undefined,
      has_deal: dealFilter === 'linked' ? true : dealFilter === 'standalone' ? false : undefined,
      pageSize: 100,
    }
    try {
      const [result, statsResult] = await Promise.all([
        rubberIntakeB2BService.getAll(filter),
        rubberIntakeB2BService.getStats({
          facility_id: facilityFilter || undefined,
          raw_rubber_type: rawTypeFilter || undefined,
        }),
      ])
      setItems(result.data)
      setTotal(result.total)
      setStats(statsResult)
    } catch (e: any) {
      setError(e?.message || 'Lỗi không xác định khi tải lý lịch mủ')
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter, sourceFilter, dealFilter, facilityFilter, rawTypeFilter])

  useEffect(() => { fetchData() }, [fetchData])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(fetchData, 300)
    return () => clearTimeout(t)
  }, [search])

  return (
    <div style={{ padding: 24 }}>
      {/* Section tabs — switch giữa 3 page intake */}
      <B2BSectionTabs tabs={INTAKE_TABS} active="intake-list" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <Title level={3} style={{ margin: 0 }}>Nhập kho mủ</Title>
          <Text type="secondary">Lý lịch mủ, phiếu cân, nhập tay — gom 1 chỗ</Text>
        </div>
        <button onClick={fetchData} className="p-2.5 text-gray-500 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className="text-2xl font-bold text-gray-800 tabular-nums">{stats.total}</div>
            <div className="text-xs text-gray-500">Tổng phiếu</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className="text-2xl font-bold text-blue-600 tabular-nums">{stats.with_deal}</div>
            <div className="text-xs text-blue-500">Liên kết Deal</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className="text-2xl font-bold text-emerald-600 tabular-nums">{(stats.total_weight_kg / 1000).toFixed(1)}T</div>
            <div className="text-xs text-emerald-500">Tổng KL tươi</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className="text-2xl font-bold text-teal-600 tabular-nums">{(stats.total_dry_weight_kg / 1000).toFixed(1)}T</div>
            <div className="text-xs text-teal-500">Tổng KL khô</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-3 text-center col-span-2 sm:col-span-1">
            <div className="text-2xl font-bold text-amber-600 tabular-nums">{(stats.total_amount / 1_000_000).toFixed(0)}M</div>
            <div className="text-xs text-amber-500">Giá trị</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm mã lô, product code, invoice, biển xe, mã LLM..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm min-h-[44px]"
          />
        </div>

        {/* Facility chips */}
        {facilities.length > 1 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Nhà máy:</span>
            <button onClick={() => setFacilityFilter('')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${facilityFilter === '' ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>
              Tất cả
            </button>
            {facilities.map(f => (
              <button key={f.id} onClick={() => setFacilityFilter(f.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${facilityFilter === f.id ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}>
                <Factory size={11} /> {f.code}
              </button>
            ))}
          </div>
        )}

        {/* Raw rubber type chips */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Loại mủ:</span>
          <button onClick={() => setRawTypeFilter('')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${rawTypeFilter === '' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
            Tất cả
          </button>
          {(['mu_nuoc', 'mu_tap', 'mu_dong', 'mu_chen', 'mu_to'] as RawRubberType[]).map(rt => (
            <button key={rt} onClick={() => setRawTypeFilter(rt)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${rawTypeFilter === rt ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
              {rt === 'mu_nuoc' ? '💧' : '🪨'} {RAW_RUBBER_TYPE_LABELS[rt]}
            </button>
          ))}
        </div>

        {/* Status + Deal chips */}
        <div className="flex flex-wrap gap-2">
          {['', 'draft', 'confirmed', 'settled'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${statusFilter === s ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {s ? STATUS_LABELS[s] : 'Tất cả TT'}
            </button>
          ))}
          <div className="w-px bg-gray-200 mx-1" />
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

      {/* View mode toggle */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setViewMode('list')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
            viewMode === 'list' ? 'bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <FileCheck size={14} /> Theo phiếu ({total})
        </button>
        <button
          onClick={() => setViewMode('llm')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
            viewMode === 'llm' ? 'bg-purple-600 text-white' : 'bg-white border border-purple-200 text-purple-700 hover:bg-purple-50'
          }`}
        >
          <Layers size={14} /> Theo LLM (gộp xe)
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">
          <div className="font-semibold mb-1">Không tải được danh sách</div>
          <div className="text-xs text-red-600">{error}</div>
        </div>
      )}

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
      ) : viewMode === 'list' ? (
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
      ) : (
        <LlmGroupView
          items={items}
          expanded={llmExpanded}
          onToggle={(code) => setLlmExpanded(prev => ({ ...prev, [code]: !prev[code] }))}
          onClickItem={(id) => navigate(`/b2b/rubber-intake/${id}`)}
        />
      )}
    </div>
  )
}

// ============================================================================
// LLM GROUP VIEW — Tab "Theo LLM" gộp xe theo consolidation_code
// ============================================================================

function LlmGroupView({
  items,
  expanded,
  onToggle,
  onClickItem,
}: {
  items: B2BRubberIntake[]
  expanded: Record<string, boolean>
  onToggle: (code: string) => void
  onClickItem: (id: string) => void
}) {
  // Group by consolidation_code; null/empty = "Không gộp"
  const groups = new Map<string, B2BRubberIntake[]>()
  for (const item of items) {
    const code = item.consolidation_code || '__none__'
    if (!groups.has(code)) groups.set(code, [])
    groups.get(code)!.push(item)
  }
  // Sort: groups có code lên trên, "không gộp" cuối
  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (a === '__none__') return 1
    if (b === '__none__') return -1
    return a.localeCompare(b)
  })

  if (sortedKeys.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Layers className="w-16 h-16 mx-auto mb-4 opacity-20" />
        <p className="text-lg font-medium mb-1">Chưa có mã LLM gộp xe</p>
        <p className="text-sm">Mã LLM được nhập khi cân hoặc khi tạo phiếu tay</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">{groups.size} nhóm LLM • {items.length} phiếu</p>
      {sortedKeys.map(code => {
        const groupItems = groups.get(code)!
        const isNone = code === '__none__'
        const totalNet = groupItems.reduce((s, x) => s + (x.net_weight_kg || 0), 0)
        const totalDry = groupItems.reduce((s, x) => s + (x.dry_weight_kg || 0), 0)
        const totalAmount = groupItems.reduce((s, x) => s + (x.total_amount || 0), 0)
        const isOpen = !!expanded[code]
        // Partners trong nhóm
        const partnerNames = [...new Set(groupItems.map(x => x.partner?.name).filter(Boolean))]

        return (
          <div key={code} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {/* Group header */}
            <button
              onClick={() => onToggle(code)}
              className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {isNone ? (
                      <span className="text-xs text-gray-400 italic">Phiếu không gộp xe</span>
                    ) : (
                      <span className="text-sm font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                        <Layers size={11} className="inline mr-1" /> {code}
                      </span>
                    )}
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {groupItems.length} phiếu
                    </span>
                  </div>
                  {partnerNames.length > 0 && (
                    <div className="text-xs text-gray-500 truncate">
                      {partnerNames.slice(0, 3).join(', ')}{partnerNames.length > 3 ? ` +${partnerNames.length - 3}` : ''}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <div className="text-sm font-bold text-emerald-700 tabular-nums">{(totalNet / 1000).toFixed(2)}T</div>
                    <div className="text-[10px] text-gray-400">Tươi</div>
                  </div>
                  {totalDry > 0 && (
                    <div>
                      <div className="text-sm font-bold text-teal-700 tabular-nums">{(totalDry / 1000).toFixed(2)}T</div>
                      <div className="text-[10px] text-gray-400">Khô</div>
                    </div>
                  )}
                  {totalAmount > 0 && (
                    <div>
                      <div className="text-sm font-bold text-amber-700 tabular-nums">{(totalAmount / 1_000_000).toFixed(1)}M</div>
                      <div className="text-[10px] text-gray-400">đ</div>
                    </div>
                  )}
                  <ChevronRight size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </div>
              </div>
            </button>

            {/* Group body — sub-list khi expanded */}
            {isOpen && (
              <div className="border-t border-gray-100 p-3 space-y-2 bg-gray-50/50">
                {groupItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => onClickItem(item.id)}
                    className="w-full text-left bg-white rounded-lg border border-gray-100 p-3 hover:shadow-sm hover:border-gray-200 transition-all"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {item.pnk_number != null && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">PNK #{item.pnk_number}</span>
                        )}
                        {item.vehicle_plate && (
                          <span className="text-xs text-gray-700 flex items-center gap-0.5">
                            <Truck size={11} /> {item.vehicle_plate}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          {new Date(item.intake_date).toLocaleDateString('vi-VN')}
                        </span>
                        {item.partner && (
                          <span className="text-xs font-medium text-gray-700 truncate">{item.partner.name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-right text-xs">
                        <div className="tabular-nums">
                          <strong className="text-gray-800">{((item.net_weight_kg || 0) / 1000).toFixed(2)}T</strong>
                          <span className="text-gray-400 mx-1">•</span>
                          {item.drc_percent != null ? (
                            <span className="text-emerald-700">{item.drc_percent}%</span>
                          ) : <span className="text-gray-400">— DRC</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
