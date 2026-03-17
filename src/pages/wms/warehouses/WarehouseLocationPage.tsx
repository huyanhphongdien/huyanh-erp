// ============================================================================
// FILE: src/pages/wms/warehouses/WarehouseLocationPage.tsx
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P2 — Buoc 2.8 (IMPROVED) — Grid vị trí kho + batch info
// REWRITE: Tailwind -> Ant Design v6
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Card,
  Tag,
  Button,
  Space,
  Typography,
  Spin,
  Empty,
  Input,
  Segmented,
  Modal,
  Descriptions,
  Progress,
  Badge,
} from 'antd'
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  ExperimentOutlined,
  CloseOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import GradeBadge from '../../../components/wms/GradeBadge'
import { QCBadge } from '../../../components/wms/QCInputForm'

const { Title, Text } = Typography
const MONO_FONT = "'JetBrains Mono', monospace"

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
  rubber_grade?: string
}

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
  batches: LocationBatch[]
  status: 'empty' | 'partial' | 'full' | 'unavailable'
  usage_percent: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; label: string; tagColor: string }> = {
  empty:       { bg: '#D1FAE5', border: '#86EFAC', text: '#166534', label: 'Trong',      tagColor: 'green' },
  partial:     { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E', label: 'Đang dùng',  tagColor: 'orange' },
  full:        { bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B', label: 'Dây',        tagColor: 'red' },
  unavailable: { bg: '#F3F4F6', border: '#D1D5DB', text: '#9CA3AF', label: 'Không đúng', tagColor: 'default' },
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
  <Space size={12} wrap>
    {(['empty', 'partial', 'full', 'unavailable'] as const).map(s => (
      <Space key={s} size={4}>
        <div style={{
          width: 12, height: 12, borderRadius: 2,
          backgroundColor: STATUS_COLORS[s].bg,
          border: `1px solid ${STATUS_COLORS[s].border}`,
        }} />
        <Text type="secondary" style={{ fontSize: 11 }}>{STATUS_COLORS[s].label}</Text>
      </Space>
    ))}
  </Space>
)

/** Grid cell */
const LocationCell: React.FC<{
  loc: LocationWithBatches
  onTap: () => void
  compact: boolean
}> = ({ loc, onTap, compact }) => {
  const style = STATUS_COLORS[loc.status] || STATUS_COLORS.empty
  const hasBatches = loc.batches.length > 0
  const firstBatch = loc.batches[0]

  const QC_DOT_COLORS: Record<string, string> = {
    passed: '#52c41a', warning: '#faad14', failed: '#ff4d4f',
    needs_blend: '#722ed1', pending: '#999',
  }

  return (
    <div
      onClick={onTap}
      style={{
        width: '100%',
        aspectRatio: '1',
        borderRadius: 8,
        border: `2px solid ${style.border}`,
        backgroundColor: style.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        minHeight: compact ? 60 : 80,
        transition: 'transform 0.15s',
      }}
    >
      {/* Cell code */}
      <span style={{
        fontSize: 10, fontWeight: 700, lineHeight: 1,
        color: style.text, fontFamily: MONO_FONT,
      }}>
        {loc.column_name || loc.code.split('-').pop() || loc.code}
      </span>

      {hasBatches && firstBatch && (
        <>
          <span style={{ fontSize: 8, fontWeight: 500, lineHeight: 1, color: style.text, marginTop: 2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
            {firstBatch.material_sku || firstBatch.material_name.slice(0, 8)}
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1, color: style.text, marginTop: 2, fontFamily: MONO_FONT }}>
            {firstBatch.quantity_remaining > 999
              ? `${(firstBatch.quantity_remaining / 1000).toFixed(1)}k`
              : firstBatch.quantity_remaining}
          </span>

          {/* QC dot */}
          {firstBatch.qc_status && (
            <div style={{
              position: 'absolute', top: 3, right: 3,
              width: 8, height: 8, borderRadius: '50%',
              backgroundColor: QC_DOT_COLORS[firstBatch.qc_status] || '#999',
            }} />
          )}

          {/* Multiple batches indicator */}
          {loc.batches.length > 1 && (
            <div style={{
              position: 'absolute', bottom: 2, right: 3,
              background: 'rgba(255,255,255,0.8)', borderRadius: 2,
              padding: '0 3px', fontSize: 7, fontWeight: 700, color: style.text,
            }}>
              +{loc.batches.length - 1}
            </div>
          )}
        </>
      )}

      {!hasBatches && loc.status === 'empty' && (
        <span style={{ fontSize: 8, color: '#999', marginTop: 2 }}>trong</span>
      )}
    </div>
  )
}

/** Location Detail Modal */
const LocationDetailModal: React.FC<{
  loc: LocationWithBatches | null
  onClose: () => void
}> = ({ loc, onClose }) => {
  if (!loc) return null
  const style = STATUS_COLORS[loc.status] || STATUS_COLORS.empty

  return (
    <Modal
      open={!!loc}
      onCancel={onClose}
      footer={null}
      title={
        <Space>
          <div style={{
            width: 40, height: 40, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: style.bg, border: `1px solid ${style.border}`,
          }}>
            <EnvironmentOutlined style={{ fontSize: 20, color: style.text }} />
          </div>
          <div>
            <Text strong style={{ fontFamily: MONO_FONT, fontSize: 16 }}>{loc.code}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {loc.shelf ? `Ke ${loc.shelf}` : ''}
              {loc.row_name ? ` - Hang ${loc.row_name}` : ''}
              {loc.column_name ? ` - O ${loc.column_name}` : ''}
            </Text>
          </div>
        </Space>
      }
      width={480}
    >
      {/* Usage bar */}
      <div style={{ marginBottom: 16 }}>
        <Progress
          percent={Math.min(loc.usage_percent, 100)}
          strokeColor={style.border}
          format={() => <Text strong style={{ color: style.text }}>{loc.usage_percent}%</Text>}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666' }}>
          <span>Dang chua: {loc.current_quantity.toLocaleString('vi-VN')}</span>
          <span>Suc chua: {loc.capacity ? loc.capacity.toLocaleString('vi-VN') : '—'}</span>
        </div>
      </div>

      {/* Batch list */}
      {loc.batches.length === 0 ? (
        <Empty image={<InboxOutlined style={{ fontSize: 32, color: '#ccc' }} />} description="O nay dang trong" />
      ) : (
        <div>
          <Text strong style={{ fontSize: 12, color: '#555' }}>
            <InboxOutlined /> Lô hàng tai vị trí ({loc.batches.length})
          </Text>

          <Space direction="vertical" style={{ width: '100%', marginTop: 8 }} size={8}>
            {loc.batches.map(batch => (
              <Card key={batch.id} size="small" style={{ borderColor: '#f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Space size={8} align="center" style={{ marginBottom: 4 }}>
                      <Text strong style={{ fontFamily: MONO_FONT, fontSize: 13 }}>
                        {batch.batch_no}
                      </Text>
                      <QCBadge result={batch.qc_status} size="sm" />
                      {batch.rubber_grade && <GradeBadge grade={batch.rubber_grade} size="small" />}
                    </Space>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {batch.material_sku} — {batch.material_name}
                      </Text>
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Nhap: {new Date(batch.received_date).toLocaleDateString('vi-VN')}
                    </Text>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <Text strong style={{ fontFamily: MONO_FONT, fontSize: 15, color: '#1B4D3E' }}>
                      {batch.quantity_remaining.toLocaleString('vi-VN')}
                    </Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: 11 }}>{batch.material_unit}</Text>
                    </div>
                    {batch.latest_drc != null && (
                      <Space size={4} style={{ marginTop: 2 }}>
                        <ExperimentOutlined style={{ fontSize: 11, color: '#999' }} />
                        <Text type="secondary" style={{ fontFamily: MONO_FONT, fontSize: 11 }}>
                          {batch.latest_drc.toFixed(1)}%
                        </Text>
                      </Space>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </Space>
        </div>
      )}
    </Modal>
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
  // LOAD DATA
  // ========================================================================

  const loadData = useCallback(async () => {
    if (!warehouseId) return

    try {
      const { data: wh, error: whErr } = await supabase
        .from('warehouses')
        .select('id, code, name, type, address')
        .eq('id', warehouseId)
        .single()

      if (whErr) throw whErr
      setWarehouse(wh)

      const { data: locs, error: locErr } = await supabase
        .from('warehouse_locations')
        .select('*')
        .eq('warehouse_id', warehouseId)
        .order('shelf', { ascending: true })
        .order('row_name', { ascending: true })
        .order('column_name', { ascending: true })

      if (locErr) throw locErr

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
          material_unit: (b.material as any)?.unit || 'banh',
          quantity_remaining: b.quantity_remaining,
          latest_drc: b.latest_drc,
          qc_status: b.qc_status,
          received_date: b.received_date,
        }

        if (!batchMap.has(locId)) batchMap.set(locId, [])
        batchMap.get(locId)!.push(mapped)
      }

      const merged: LocationWithBatches[] = (locs || []).map(loc => {
        const locBatches = batchMap.get(loc.id) || []
        const { status, usage_percent } = computeStatus(loc)
        return { ...loc, batches: locBatches, status, usage_percent }
      })

      setLocations(merged)
    } catch (e) {
      console.error('Loi load du lieu kho:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [warehouseId])

  useEffect(() => { loadData() }, [loadData])

  const handleRefresh = () => {
    setRefreshing(true)
    loadData()
  }

  // ========================================================================
  // DERIVED
  // ========================================================================

  const shelves = useMemo(() => {
    const set = new Set<string>()
    locations.forEach(l => { if (l.shelf) set.add(l.shelf) })
    return Array.from(set).sort()
  }, [locations])

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

  const groupedByShelves = useMemo(() => {
    const map = new Map<string, LocationWithBatches[]>()
    for (const loc of filtered) {
      const key = loc.shelf || 'Không có kệ'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(loc)
    }
    return map
  }, [filtered])

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
      <div style={{ minHeight: '100vh', background: '#F7F5F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="Đang tải vị trí kho..." />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F2', display: 'flex', flexDirection: 'column' }}>
      {/* HEADER */}
      <div style={{ background: '#1B4D3E', padding: '16px', color: '#fff' }}>
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} style={{ color: '#fff' }} />
            <div>
              <Title level={5} style={{ color: '#fff', margin: 0 }}>
                {warehouse?.name || 'Kho'}
                {warehouse?.code && (
                  <Tag style={{ marginLeft: 8, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontFamily: MONO_FONT, fontSize: 11 }}>
                    {warehouse.code}
                  </Tag>
                )}
              </Title>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                {stats.total} o &bull; {stats.totalBatches} lô hàng
              </Text>
            </div>
          </Space>
          <Button
            type="text"
            icon={<ReloadOutlined spin={refreshing} />}
            onClick={handleRefresh}
            style={{ color: '#fff' }}
          />
        </Space>

        {/* Stats strip */}
        <Space size={16} style={{ marginTop: 8, overflowX: 'auto', width: '100%' }} wrap>
          {[
            { label: 'Tổng', value: stats.total, color: '#fff' },
            { label: 'Trong', value: stats.empty, color: '#86EFAC' },
            { label: 'Đang dùng', value: stats.partial, color: '#FCD34D' },
            { label: 'Dây', value: stats.full, color: '#FCA5A5' },
            { label: 'K. dung', value: stats.unavailable, color: '#9CA3AF' },
          ].map(s => (
            <Space key={s.label} size={4}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: s.color }} />
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11 }}>{s.label}:</Text>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{s.value}</Text>
            </Space>
          ))}
        </Space>
      </div>

      {/* TOOLBAR */}
      <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '10px 16px' }}>
        <Space style={{ width: '100%', marginBottom: 8 }}>
          <Input
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Tìm mã o, lo, san pham..."
            allowClear
            style={{ flex: 1 }}
          />
          <Segmented
            value={viewMode}
            onChange={(val) => setViewMode(val as 'grid' | 'list')}
            options={[
              { value: 'grid', icon: <AppstoreOutlined /> },
              { value: 'list', icon: <UnorderedListOutlined /> },
            ]}
          />
        </Space>

        {/* Shelf filter */}
        {shelves.length > 1 && (
          <Space size={6} style={{ marginBottom: 8, overflowX: 'auto', width: '100%' }} wrap>
            <Button
              size="small"
              type={filterShelf === 'all' ? 'primary' : 'default'}
              onClick={() => setFilterShelf('all')}
              style={filterShelf === 'all' ? { background: '#1B4D3E', borderColor: '#1B4D3E' } : {}}
            >
              Tat ca
            </Button>
            {shelves.map(s => (
              <Button
                key={s}
                size="small"
                type={filterShelf === s ? 'primary' : 'default'}
                onClick={() => setFilterShelf(s)}
                style={filterShelf === s ? { background: '#1B4D3E', borderColor: '#1B4D3E' } : {}}
              >
                Ke {s}
              </Button>
            ))}
          </Space>
        )}

        <Legend />
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 20 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <Empty
              image={<EnvironmentOutlined style={{ fontSize: 40, color: '#ccc' }} />}
              description={locations.length === 0 ? 'Kho chưa có vị trí nào' : 'Không tìm thấy vị trí phu hop'}
            />
          </div>
        ) : viewMode === 'grid' ? (
          // GRID VIEW
          <div style={{ padding: 16 }}>
            {Array.from(groupedByShelves.entries()).map(([shelf, locs]) => (
              <div key={shelf} style={{ marginBottom: 20 }}>
                <Text strong style={{ color: '#1B4D3E', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <AppstoreOutlined />
                  {shelf.startsWith('K') ? `Ke ${shelf}` : shelf} &bull; {locs.length} o
                </Text>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 8,
                }}>
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
          <div style={{ padding: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {filtered.map(loc => {
                const st = STATUS_COLORS[loc.status] || STATUS_COLORS.empty
                const hasBatches = loc.batches.length > 0
                return (
                  <Card
                    key={loc.id}
                    size="small"
                    hoverable
                    onClick={() => setSelectedLoc(loc)}
                    style={{ borderLeft: `4px solid ${st.border}` }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: st.bg, border: `2px solid ${st.border}`,
                        flexShrink: 0,
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: st.text, fontFamily: MONO_FONT }}>
                          {loc.column_name || loc.code.split('-').pop() || '?'}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ fontFamily: MONO_FONT, fontSize: 13 }}>{loc.code}</Text>
                        {hasBatches ? (
                          <div>
                            <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                              {loc.batches[0].material_sku} — {loc.batches[0].batch_no}
                              {loc.batches.length > 1 && ` (+${loc.batches.length - 1})`}
                            </Text>
                          </div>
                        ) : (
                          <div><Text type="secondary" style={{ fontSize: 12 }}>Trong</Text></div>
                        )}
                      </div>
                      {hasBatches && (
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <Text strong style={{ fontFamily: MONO_FONT, fontSize: 14, color: '#1B4D3E' }}>
                            {loc.batches.reduce((s, b) => s + b.quantity_remaining, 0).toLocaleString('vi-VN')}
                          </Text>
                          {loc.batches[0].latest_drc != null && (
                            <div>
                              <Text type="secondary" style={{ fontSize: 11 }}>DRC {loc.batches[0].latest_drc.toFixed(1)}%</Text>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </Card>
                )
              })}
            </Space>
          </div>
        )}
      </div>

      {/* Location Detail Modal */}
      <LocationDetailModal
        loc={selectedLoc}
        onClose={() => setSelectedLoc(null)}
      />
    </div>
  )
}

export default WarehouseLocationPage
