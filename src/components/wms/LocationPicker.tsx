// ============================================================================
// LOCATION PICKER — Ant Design + Grid warehouse visualization
// File: src/components/wms/LocationPicker.tsx
// Rewrite: Tailwind -> Ant Design shell, keep custom grid cells
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Input,
  Spin,
  Empty,
  Alert,
  Space,
  Tag,
  Segmented,
  Typography,
  Button,
  Progress,
  Tooltip,
} from 'antd'
import {
  EnvironmentOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  CheckCircleFilled,
  CloseOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import { supabase } from '../../lib/supabase'

const { Text } = Typography

// ============================================================================
// TYPES (giu nguyen interface de backward-compatible)
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
export type PickerMode = 'stock-in' | 'stock-out'

export interface LocationPickerProps {
  warehouse_id: string
  selectedId?: string
  onSelect: (location: LocationData | null) => void
  mode?: PickerMode
  multiSelect?: boolean
  selectedIds?: string[]
  onMultiSelect?: (locations: LocationData[]) => void
  label?: string
  showLegend?: boolean
  showSearch?: boolean
  showShelfFilter?: boolean
  showSummary?: boolean
  className?: string
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

const STATUS_CONFIG: Record<LocationStatus, { bg: string; color: string; label: string }> = {
  empty: { bg: '#D1FAE5', color: '#059669', label: 'Trống' },
  partial: { bg: '#FEF3C7', color: '#D97706', label: 'Đang dùng' },
  full: { bg: '#FEE2E2', color: '#DC2626', label: 'Đầy' },
  unavailable: { bg: '#F3F4F6', color: '#9CA3AF', label: 'Không KD' },
}

function isSelectable(loc: LocationData, mode: PickerMode): boolean {
  if (!loc.is_available) return false
  const status = getLocationStatus(loc)
  if (mode === 'stock-in') {
    // Không cho chọn nếu đã đầy (current_qty >= capacity)
    if (loc.capacity && loc.capacity > 0 && loc.current_quantity >= loc.capacity) {
      return false
    }
    return status === 'empty' || status === 'partial'
  }
  return status === 'partial' || status === 'full'
}

function getFillPercent(loc: LocationData): number {
  if (!loc.capacity || loc.capacity <= 0) return 0
  return Math.round((loc.current_quantity / loc.capacity) * 100)
}

// ============================================================================
// GRID CELL — Keep custom rendering (domain-specific)
// ============================================================================

const GridCell: React.FC<{
  location: LocationData
  isSelected: boolean
  selectable: boolean
  disabled?: boolean
  onSelect: () => void
}> = ({ location, isSelected, selectable, disabled, onSelect }) => {
  const status = getLocationStatus(location)
  const cfg = STATUS_CONFIG[status]
  const fillPct = getFillPercent(location)

  return (
    <Tooltip
      title={
        <div>
          <div style={{ fontWeight: 600 }}>{location.code}</div>
          <div>{cfg.label}</div>
          {location.capacity ? (
            <div>{location.current_quantity}/{location.capacity} ({fillPct}%)</div>
          ) : location.current_quantity > 0 ? (
            <div>Đang chứa: {location.current_quantity}</div>
          ) : null}
          {location.shelf && <div>Ke: {location.shelf}{location.row_name ? ` · Hang: ${location.row_name}` : ''}{location.column_name ? ` · O: ${location.column_name}` : ''}</div>}
        </div>
      }
      placement="top"
    >
      <button
        type="button"
        disabled={disabled || !selectable}
        onClick={onSelect}
        style={{
          position: 'relative',
          width: '100%',
          height: 56,
          borderRadius: 8,
          border: isSelected ? '2px solid #2D8B6E' : '1px solid transparent',
          background: isSelected ? `${cfg.bg}` : cfg.bg,
          boxShadow: isSelected ? '0 0 0 2px rgba(45,139,110,0.2)' : undefined,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: selectable && !disabled ? 'pointer' : 'not-allowed',
          opacity: selectable && !disabled ? 1 : 0.4,
          transition: 'all 0.15s',
          transform: isSelected ? 'scale(1.05)' : undefined,
          overflow: 'hidden',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 11, color: isSelected ? '#1B4D3E' : cfg.color, lineHeight: 1.2 }}>
          {location.code.replace(/^[A-Z]+-/, '')}
        </span>
        {location.capacity && location.is_available ? (
          <span style={{ fontSize: 9, marginTop: 2, color: '#888' }}>
            {location.current_quantity}/{location.capacity}
          </span>
        ) : location.current_quantity > 0 && location.is_available ? (
          <span style={{ fontSize: 9, marginTop: 2, color: '#888' }}>
            {location.current_quantity}
          </span>
        ) : null}

        {/* Fill bar */}
        {location.capacity && location.is_available && fillPct > 0 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(0,0,0,0.05)' }}>
            <div style={{ height: '100%', width: `${Math.min(fillPct, 100)}%`, background: fillPct >= 80 ? '#EF4444' : '#F59E0B', borderRadius: '0 0 8px 8px' }} />
          </div>
        )}

        {/* Selected check */}
        {isSelected && (
          <div style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, background: '#2D8B6E', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircleFilled style={{ color: 'white', fontSize: 12 }} />
          </div>
        )}
      </button>
    </Tooltip>
  )
}

// ============================================================================
// LIST ITEM
// ============================================================================

const ListItem: React.FC<{
  location: LocationData
  isSelected: boolean
  selectable: boolean
  disabled?: boolean
  onSelect: () => void
}> = ({ location, isSelected, selectable, disabled, onSelect }) => {
  const status = getLocationStatus(location)
  const cfg = STATUS_CONFIG[status]
  const fillPct = getFillPercent(location)

  return (
    <div
      onClick={selectable && !disabled ? onSelect : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderRadius: 8,
        cursor: selectable && !disabled ? 'pointer' : 'not-allowed',
        opacity: selectable && !disabled ? 1 : 0.4,
        background: isSelected ? 'rgba(27,77,62,0.05)' : 'white',
        border: isSelected ? '1px solid #2D8B6E' : '1px solid transparent',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Space size={8}>
          <Text strong style={{ fontSize: 13 }}>{location.code}</Text>
          <Tag style={{ fontSize: 9, margin: 0, borderRadius: 4, padding: '0 4px' }} color={status === 'empty' ? 'green' : status === 'partial' ? 'orange' : status === 'full' ? 'red' : 'default'}>
            {cfg.label}
          </Tag>
        </Space>
        {location.capacity ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Progress percent={fillPct} size="small" showInfo={false} style={{ flex: 1, maxWidth: 120 }} strokeColor={fillPct >= 80 ? '#EF4444' : fillPct > 0 ? '#F59E0B' : '#10B981'} />
            <Text type="secondary" style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
              {location.current_quantity}/{location.capacity}
            </Text>
          </div>
        ) : (
          <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 2 }}>
            {location.current_quantity > 0 ? `Đang chứa: ${location.current_quantity}` : 'Trống'}
          </Text>
        )}
      </div>
      {isSelected && <CheckCircleFilled style={{ color: '#2D8B6E', fontSize: 18 }} />}
    </div>
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
  disabled = false,
}) => {
  const [locations, setLocations] = useState<LocationData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [activeShelf, setActiveShelf] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<string>('grid')
  const [collapsed, setCollapsed] = useState(false)

  // Load locations
  const loadLocations = useCallback(async () => {
    if (!warehouse_id) { setLocations([]); return }
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
    } finally {
      setLoading(false)
    }
  }, [warehouse_id])

  useEffect(() => {
    loadLocations()
    setActiveShelf(null)
    setSearchText('')
    setCollapsed(false)
  }, [loadLocations])

  // Computed
  const shelves = useMemo(() => {
    const set = new Set<string>()
    locations.forEach(l => { if (l.shelf) set.add(l.shelf) })
    return [...set].sort()
  }, [locations])

  const filteredLocations = useMemo(() => {
    let result = locations
    if (activeShelf) result = result.filter(l => l.shelf === activeShelf)
    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim()
      result = result.filter(l => l.code.toLowerCase().includes(q))
    }
    return result
  }, [locations, activeShelf, searchText])

  const groupedByShelf = useMemo(() => {
    const groups: Record<string, LocationData[]> = {}
    filteredLocations.forEach(loc => {
      const shelf = loc.shelf || 'Khác'
      if (!groups[shelf]) groups[shelf] = []
      groups[shelf].push(loc)
    })
    return groups
  }, [filteredLocations])

  const summary = useMemo(() => {
    const r = { empty: 0, partial: 0, full: 0, unavailable: 0 }
    locations.forEach(l => { r[getLocationStatus(l)]++ })
    return r
  }, [locations])

  // Handlers
  const handleSelect = (loc: LocationData) => {
    if (disabled) return
    if (multiSelect && onMultiSelect) {
      const currentIds = new Set(selectedIds)
      if (currentIds.has(loc.id)) currentIds.delete(loc.id)
      else currentIds.add(loc.id)
      onMultiSelect(locations.filter(l => currentIds.has(l.id)))
    } else {
      onSelect(selectedId === loc.id ? null : loc)
    }
  }

  const isLocationSelected = (locId: string) => {
    if (multiSelect) return selectedIds.includes(locId)
    return selectedId === locId
  }

  const selectedLocation = selectedId ? locations.find(l => l.id === selectedId) : null

  // No warehouse
  if (!warehouse_id) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="Vui lòng chọn kho trước"
        style={{ padding: 24 }}
      />
    )
  }

  // Loading
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 32 }}>
        <Spin />
        <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>Đang tải vị trí kho...</div>
      </div>
    )
  }

  // Error
  if (error) {
    return (
      <Alert
        type="error"
        message={error}
        showIcon
        action={<Button size="small" onClick={loadLocations} icon={<ReloadOutlined />}>Thử lại</Button>}
        style={{ borderRadius: 8 }}
      />
    )
  }

  // Empty
  if (locations.length === 0) {
    return <Empty description="Chưa có vị trí nào trong kho này" style={{ padding: 24 }} />
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Space
          style={{ cursor: 'pointer' }}
          onClick={() => setCollapsed(!collapsed)}
        >
          <EnvironmentOutlined style={{ color: '#1B4D3E' }} />
          <Text strong>{label}</Text>
          {selectedLocation && (
            <Tag color="blue" style={{ margin: 0 }}>{selectedLocation.code}</Tag>
          )}
          {multiSelect && selectedIds.length > 0 && (
            <Tag color="blue" style={{ margin: 0 }}>{selectedIds.length} vị trí</Tag>
          )}
        </Space>
        {!collapsed && (
          <Segmented
            size="small"
            value={viewMode}
            onChange={v => setViewMode(v as string)}
            options={[
              { value: 'grid', icon: <AppstoreOutlined /> },
              { value: 'list', icon: <UnorderedListOutlined /> },
            ]}
          />
        )}
      </div>

      {/* Collapsed: show selected only */}
      {collapsed && selectedLocation && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'rgba(27,77,62,0.05)', borderRadius: 8, marginBottom: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_CONFIG[getLocationStatus(selectedLocation)].color }} />
          <Text style={{ fontSize: 13, fontWeight: 500 }}>{selectedLocation.code}</Text>
          {selectedLocation.capacity && (
            <Text type="secondary" style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
              {selectedLocation.current_quantity}/{selectedLocation.capacity}
            </Text>
          )}
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => onSelect(null)} style={{ marginLeft: 'auto' }} />
        </div>
      )}

      {/* Content */}
      {!collapsed && (
        <>
          {/* Summary */}
          {showSummary && (
            <Space size="middle" style={{ fontSize: 11, marginBottom: 8 }}>
              <Text type="secondary">Tổng: {locations.length}</Text>
              <Text style={{ color: '#059669', fontWeight: 600 }}>{summary.empty} trống</Text>
              <Text style={{ color: '#D97706', fontWeight: 600 }}>{summary.partial} dùng</Text>
              <Text style={{ color: '#DC2626', fontWeight: 600 }}>{summary.full} đầy</Text>
              {summary.unavailable > 0 && <Text type="secondary">{summary.unavailable} N/A</Text>}
            </Space>
          )}

          {/* Search + Shelf filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            {showSearch && (
              <Input.Search
                placeholder="Tìm mã vị trí..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                allowClear
                size="small"
                style={{ maxWidth: 200 }}
              />
            )}
            {showShelfFilter && shelves.length > 1 && (
              <Space size={4} wrap>
                <Tag.CheckableTag
                  checked={!activeShelf}
                  onChange={() => setActiveShelf(null)}
                  style={{ borderRadius: 6, fontSize: 11 }}
                >
                  Tất cả
                </Tag.CheckableTag>
                {shelves.map(shelf => (
                  <Tag.CheckableTag
                    key={shelf}
                    checked={activeShelf === shelf}
                    onChange={() => setActiveShelf(activeShelf === shelf ? null : shelf)}
                    style={{ borderRadius: 6, fontSize: 11 }}
                  >
                    {shelf}
                  </Tag.CheckableTag>
                ))}
              </Space>
            )}
          </div>

          {/* Legend */}
          {showLegend && (
            <Space size="middle" style={{ fontSize: 10, marginBottom: 8 }}>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                const canSelect = mode === 'stock-in'
                  ? (key === 'empty' || key === 'partial')
                  : (key === 'partial' || key === 'full')
                return (
                  <Space key={key} size={4} style={{ opacity: canSelect ? 1 : 0.4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: cfg.bg, border: `1px solid ${cfg.color}` }} />
                    <span>{cfg.label}{canSelect ? ' ✓' : ''}</span>
                  </Space>
                )
              })}
            </Space>
          )}

          {/* No results */}
          {filteredLocations.length === 0 && (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không tìm thấy vị trí phù hợp" />
          )}

          {/* GRID VIEW */}
          {viewMode === 'grid' && filteredLocations.length > 0 && (
            <div>
              {Object.entries(groupedByShelf).map(([shelf, locs]) => (
                <div key={shelf} style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Ke {shelf}
                    <span style={{ fontWeight: 400, marginLeft: 4, color: '#bbb' }}>
                      ({locs.filter(l => isSelectable(l, mode)).length} có thể chọn)
                    </span>
                  </Text>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                    {locs.map(loc => (
                      <GridCell
                        key={loc.id}
                        location={loc}
                        isSelected={isLocationSelected(loc.id)}
                        selectable={isSelectable(loc, mode)}
                        disabled={disabled}
                        onSelect={() => handleSelect(loc)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* LIST VIEW */}
          {viewMode === 'list' && filteredLocations.length > 0 && (
            <div>
              {Object.entries(groupedByShelf).map(([shelf, locs]) => (
                <div key={shelf} style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    Ke {shelf}
                  </Text>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                </div>
              ))}
            </div>
          )}

          {/* Helper text */}
          <div style={{ fontSize: 10, color: '#bbb', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <InfoCircleOutlined />
            {mode === 'stock-in'
              ? 'Chọn ô trống hoặc chưa đầy để nhập kho. Hover để xem chi tiết.'
              : 'Chọn ô có hàng để xuất kho. Hệ thống ưu tiên FIFO.'}
          </div>
        </>
      )}
    </div>
  )
}

export default LocationPicker
