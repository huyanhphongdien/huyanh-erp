// ============================================================================
// ADVANCED DATA TABLE — Professional grid with filter row + export Excel
// File: src/components/common/AdvancedDataTable.tsx
// Features: column filters, date range, sort, export, row expand, status badges
// ============================================================================

import { useState, useMemo, useCallback } from 'react'
import { Input, Select, DatePicker, Button, Tag, Tooltip, Space, Typography, Dropdown } from 'antd'
import {
  SearchOutlined, DownloadOutlined, FilterOutlined, ClearOutlined,
  SortAscendingOutlined, SortDescendingOutlined, ReloadOutlined,
  ExpandOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'

const { Text } = Typography
const { RangePicker } = DatePicker

// ============================================================================
// TYPES
// ============================================================================

export interface ColumnDef<T = any> {
  key: string
  title: string
  dataIndex?: string | string[]
  width?: number | string
  minWidth?: number
  fixed?: 'left' | 'right'
  sortable?: boolean
  filterable?: boolean
  filterType?: 'text' | 'select' | 'number' | 'date'
  filterOptions?: { value: string; label: string }[]
  render?: (value: any, record: T, index: number) => React.ReactNode
  exportRender?: (value: any, record: T) => string | number  // plain text for Excel
  align?: 'left' | 'center' | 'right'
  ellipsis?: boolean
}

export interface AdvancedDataTableProps<T = any> {
  columns: ColumnDef<T>[]
  dataSource: T[]
  rowKey: string | ((record: T) => string)
  loading?: boolean
  title?: string
  dateRangeField?: string  // field name for global date range filter
  onRefresh?: () => void
  onRowClick?: (record: T) => void
  expandedRowRender?: (record: T) => React.ReactNode
  exportFileName?: string
  pageSize?: number
  headerExtra?: React.ReactNode
  emptyText?: string
  statusField?: string
  statusColorMap?: Record<string, { label: string; color: string }>
}

// ============================================================================
// HELPERS
// ============================================================================

function getNestedValue(obj: any, path: string | string[]): any {
  if (Array.isArray(path)) return path.reduce((o, k) => o?.[k], obj)
  return path.split('.').reduce((o, k) => o?.[k], obj)
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AdvancedDataTable<T extends Record<string, any>>({
  columns,
  dataSource,
  rowKey,
  loading = false,
  title,
  dateRangeField,
  onRefresh,
  onRowClick,
  expandedRowRender,
  exportFileName = 'export',
  pageSize = 50,
  headerExtra,
  emptyText = 'Không có dữ liệu',
  statusField,
  statusColorMap,
}: AdvancedDataTableProps<T>) {
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)

  const getRowKey = useCallback((record: T) => {
    return typeof rowKey === 'function' ? rowKey(record) : String(record[rowKey])
  }, [rowKey])

  // ── Filter + Sort data ──
  const filteredData = useMemo(() => {
    let data = [...dataSource]

    // Date range filter
    if (dateRange && dateRangeField && dateRange[0] && dateRange[1]) {
      const start = dateRange[0].startOf('day').valueOf()
      const end = dateRange[1].endOf('day').valueOf()
      data = data.filter(row => {
        const val = getNestedValue(row, dateRangeField)
        if (!val) return false
        const ts = new Date(val).getTime()
        return ts >= start && ts <= end
      })
    }

    // Column filters
    Object.entries(filters).forEach(([key, filterVal]) => {
      if (!filterVal) return
      const col = columns.find(c => c.key === key)
      if (!col) return
      const path = col.dataIndex || col.key
      data = data.filter(row => {
        const val = getNestedValue(row, path)
        if (val == null) return false
        if (col.filterType === 'select') return String(val) === filterVal
        if (col.filterType === 'number') return String(val).includes(filterVal)
        return String(val).toLowerCase().includes(filterVal.toLowerCase())
      })
    })

    // Sort
    if (sortKey) {
      const col = columns.find(c => c.key === sortKey)
      const path = col?.dataIndex || sortKey
      data.sort((a, b) => {
        const va = getNestedValue(a, path)
        const vb = getNestedValue(b, path)
        if (va == null && vb == null) return 0
        if (va == null) return 1
        if (vb == null) return -1
        const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'vi')
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return data
  }, [dataSource, filters, sortKey, sortDir, dateRange, dateRangeField, columns])

  const pagedData = useMemo(() => filteredData.slice(0, (page + 1) * pageSize), [filteredData, page, pageSize])
  const hasMore = filteredData.length > pagedData.length

  // ── Export Excel ──
  const handleExport = useCallback(async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet(title || 'Data')

    // Header row
    const headers = columns.map(c => c.title)
    const headerRow = ws.addRow(headers)
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B4D3E' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = { bottom: { style: 'thin' } }
    })

    // Data rows
    filteredData.forEach(row => {
      const values = columns.map(col => {
        if (col.exportRender) return col.exportRender(getNestedValue(row, col.dataIndex || col.key), row)
        const val = getNestedValue(row, col.dataIndex || col.key)
        if (val == null) return ''
        return val
      })
      ws.addRow(values)
    })

    // Auto-width
    ws.columns.forEach((col, i) => {
      const maxLen = Math.max(headers[i]?.length || 10, ...filteredData.slice(0, 50).map(row => {
        const val = getNestedValue(row, columns[i]?.dataIndex || columns[i]?.key)
        return String(val || '').length
      }))
      col.width = Math.min(40, Math.max(12, maxLen + 2))
    })

    // Download
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${exportFileName}_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [columns, filteredData, title, exportFileName])

  const clearFilters = () => { setFilters({}); setDateRange(null); setSortKey(null); setPage(0) }
  const hasActiveFilters = Object.values(filters).some(Boolean) || dateRange

  const toggleExpand = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      {/* ═══ TOOLBAR ═══ */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: '#fafafa' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
          {title && <Text strong style={{ fontSize: 15, color: '#1B4D3E' }}>{title}</Text>}
          <Tag color="blue">{filteredData.length} / {dataSource.length}</Tag>
          {headerExtra}
        </div>
        <Space wrap size={8}>
          {dateRangeField && (
            <RangePicker
              size="small"
              value={dateRange as any}
              onChange={(dates) => { setDateRange(dates as any); setPage(0) }}
              format="DD/MM/YYYY"
              placeholder={['Từ ngày', 'Đến ngày']}
              style={{ width: 240 }}
              allowClear
            />
          )}
          {hasActiveFilters && (
            <Tooltip title="Xóa bộ lọc">
              <Button size="small" icon={<ClearOutlined />} onClick={clearFilters} danger>Xóa lọc</Button>
            </Tooltip>
          )}
          {onRefresh && (
            <Tooltip title="Tải lại">
              <Button size="small" icon={<ReloadOutlined />} onClick={onRefresh} loading={loading} />
            </Tooltip>
          )}
          <Button size="small" icon={<DownloadOutlined />} onClick={handleExport} type="primary" style={{ background: '#1B4D3E', borderColor: '#1B4D3E' }}>
            Xuất Excel
          </Button>
        </Space>
      </div>

      {/* ═══ TABLE ═══ */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          {/* Header */}
          <thead>
            <tr style={{ background: '#1B4D3E' }}>
              {expandedRowRender && <th style={{ width: 36, padding: '8px 4px', borderRight: '1px solid rgba(255,255,255,0.15)' }} />}
              {columns.map(col => (
                <th key={col.key}
                  style={{
                    padding: '10px 8px', color: '#fff', fontSize: 12, fontWeight: 600,
                    textAlign: (col.align || 'left') as any, whiteSpace: 'nowrap',
                    width: col.width, minWidth: col.minWidth || 60,
                    borderRight: '1px solid rgba(255,255,255,0.15)',
                    cursor: col.sortable ? 'pointer' : 'default',
                    userSelect: 'none',
                  }}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start' }}>
                    {col.title}
                    {col.sortable && sortKey === col.key && (
                      sortDir === 'asc'
                        ? <SortAscendingOutlined style={{ fontSize: 11 }} />
                        : <SortDescendingOutlined style={{ fontSize: 11 }} />
                    )}
                  </div>
                </th>
              ))}
            </tr>

            {/* Filter row */}
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #1B4D3E' }}>
              {expandedRowRender && <td style={{ padding: 4, borderRight: '1px solid #e5e7eb' }} />}
              {columns.map(col => (
                <td key={col.key} style={{ padding: '4px 4px', borderRight: '1px solid #e5e7eb' }}>
                  {col.filterable !== false && (
                    col.filterType === 'select' && col.filterOptions ? (
                      <Select
                        size="small"
                        value={filters[col.key] || undefined}
                        onChange={v => { setFilters(prev => ({ ...prev, [col.key]: v || '' })); setPage(0) }}
                        placeholder="Tất cả"
                        style={{ width: '100%', fontSize: 11 }}
                        allowClear
                        options={col.filterOptions}
                      />
                    ) : (
                      <Input
                        size="small"
                        value={filters[col.key] || ''}
                        onChange={e => { setFilters(prev => ({ ...prev, [col.key]: e.target.value })); setPage(0) }}
                        placeholder="Lọc..."
                        style={{ fontSize: 11 }}
                        allowClear
                        prefix={<SearchOutlined style={{ fontSize: 10, color: '#bbb' }} />}
                      />
                    )
                  )}
                </td>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + (expandedRowRender ? 1 : 0)} style={{ textAlign: 'center', padding: 40, color: '#999' }}>Đang tải...</td></tr>
            ) : pagedData.length === 0 ? (
              <tr><td colSpan={columns.length + (expandedRowRender ? 1 : 0)} style={{ textAlign: 'center', padding: 40, color: '#999' }}>{emptyText}</td></tr>
            ) : (
              pagedData.map((row, idx) => {
                const key = getRowKey(row)
                const isExpanded = expandedRows.has(key)
                return (
                  <>
                    <tr key={key}
                      style={{
                        background: idx % 2 === 0 ? '#fff' : '#fafafa',
                        cursor: onRowClick ? 'pointer' : 'default',
                        borderBottom: '1px solid #f0f0f0',
                      }}
                      onClick={() => onRowClick?.(row)}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f0fdf4')}
                      onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafafa')}
                    >
                      {expandedRowRender && (
                        <td style={{ padding: '6px 4px', textAlign: 'center', borderRight: '1px solid #f0f0f0', cursor: 'pointer' }}
                          onClick={e => { e.stopPropagation(); toggleExpand(key) }}>
                          <span style={{ fontSize: 10, color: '#999', transition: 'transform 0.2s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                        </td>
                      )}
                      {columns.map(col => {
                        const val = getNestedValue(row, col.dataIndex || col.key)
                        return (
                          <td key={col.key} style={{
                            padding: '8px 8px', fontSize: 12,
                            textAlign: (col.align || 'left') as any,
                            borderRight: '1px solid #f5f5f5',
                            maxWidth: col.width || 'auto',
                            overflow: col.ellipsis ? 'hidden' : 'visible',
                            textOverflow: col.ellipsis ? 'ellipsis' : 'clip',
                            whiteSpace: col.ellipsis ? 'nowrap' : 'normal',
                          }}>
                            {col.render ? col.render(val, row, idx) : (val ?? '—')}
                          </td>
                        )
                      })}
                    </tr>
                    {expandedRowRender && isExpanded && (
                      <tr key={`${key}-expand`}>
                        <td colSpan={columns.length + 1} style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                          {expandedRowRender(row)}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ═══ FOOTER ═══ */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fafafa', fontSize: 12, color: '#888' }}>
        <span>Hiện {pagedData.length} / {filteredData.length} dòng</span>
        {hasMore && (
          <Button size="small" type="link" onClick={() => setPage(p => p + 1)}>
            Xem thêm {Math.min(pageSize, filteredData.length - pagedData.length)} dòng
          </Button>
        )}
      </div>
    </div>
  )
}
