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
  ExpandOutlined, EyeOutlined,
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
  exportNumFmt?: string       // Excel number format cho cột số (vd '#,##0'); auto nếu bỏ trống
  summary?: 'sum' | 'avg'     // hiện tổng/trung bình ở dòng TỔNG cuối file export
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
  onViewDetail?: (record: T) => void
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
  onViewDetail,
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
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
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
    wb.creator = 'Huy Anh ERP'
    // Freeze title (row 1) + header (row 2)
    const ws = wb.addWorksheet(title || 'Data', { views: [{ state: 'frozen', ySplit: 2 }] })

    const colCount = columns.length
    const DARK = 'FF1B4D3E'

    // Pre-compute exported cell values (1 lần) để vừa render vừa detect kiểu số.
    const cellAt = (row: T, col: ColumnDef<T>) =>
      col.exportRender
        ? col.exportRender(getNestedValue(row, col.dataIndex || col.key), row)
        : (getNestedValue(row, col.dataIndex || col.key) ?? '')
    const exportRows = filteredData.map(row => columns.map(col => cellAt(row, col)))

    // Cột số = mọi giá trị non-empty đều là number.
    const isNumeric = columns.map((_, i) =>
      exportRows.some(r => typeof r[i] === 'number') &&
      exportRows.every(r => r[i] === '' || r[i] == null || typeof r[i] === 'number'),
    )
    const numFmtFor = (i: number) => columns[i]?.exportNumFmt || '#,##0.##'

    // ── Row 1: Tiêu đề + meta (gộp ô) ──
    ws.addRow([`${title || exportFileName} — ${filteredData.length} dòng · ${dayjs().format('DD/MM/YYYY HH:mm')}`])
    ws.mergeCells(1, 1, 1, colCount)
    const titleCell = ws.getCell(1, 1)
    titleCell.font = { bold: true, size: 13, color: { argb: DARK } }
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' }
    ws.getRow(1).height = 22

    // ── Row 2: Header ──
    const headerRow = ws.addRow(columns.map(c => c.title))
    headerRow.height = 18
    headerRow.eachCell((cell, col) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } }
      cell.alignment = { horizontal: columns[col - 1]?.align || 'center', vertical: 'middle', wrapText: true }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF14402F' } } }
    })

    // ── Data rows ──
    exportRows.forEach((vals, idx) => {
      const r = ws.addRow(vals)
      r.eachCell((cell, col) => {
        const c = columns[col - 1]
        if (isNumeric[col - 1]) {
          cell.numFmt = numFmtFor(col - 1)
          cell.alignment = { horizontal: 'right' }
        } else if (c?.align) {
          cell.alignment = { horizontal: c.align }
        }
        if (idx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F7F5' } }
        }
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE6E6E6' } } }
      })
    })

    // ── Dòng TỔNG (nếu có cột summary) ──
    const hasSummary = columns.some(c => c.summary)
    if (hasSummary && exportRows.length > 0) {
      const totalVals: (string | number)[] = columns.map((c, i) => {
        if (!c.summary || !isNumeric[i]) return ''
        const nums = exportRows.map(r => r[i]).filter((v): v is number => typeof v === 'number')
        if (nums.length === 0) return ''
        const sum = nums.reduce((a, b) => a + b, 0)
        return c.summary === 'avg' ? sum / nums.length : sum
      })
      // Nhãn "TỔNG" đặt ở cột đầu tiên không phải summary
      const labelIdx = columns.findIndex(c => !c.summary)
      if (labelIdx >= 0 && totalVals[labelIdx] === '') totalVals[labelIdx] = `TỔNG (${exportRows.length} dòng)`
      const totalRow = ws.addRow(totalVals)
      totalRow.eachCell((cell, col) => {
        cell.font = { bold: true, color: { argb: DARK } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCEAE3' } }
        cell.border = { top: { style: 'double', color: { argb: DARK } } }
        if (isNumeric[col - 1]) {
          cell.numFmt = numFmtFor(col - 1)
          cell.alignment = { horizontal: 'right' }
        }
      })
    }

    // ── AutoFilter trên header (row 2) ──
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: colCount } }

    // ── Auto-width (cân nhắc cả số đã format dấu phẩy) ──
    ws.columns.forEach((col, i) => {
      const lens = exportRows.map(r => {
        const v = r[i]
        return typeof v === 'number' ? Math.round(v).toLocaleString('vi-VN').length : String(v ?? '').length
      })
      const maxLen = Math.max(columns[i]?.title?.length || 10, ...lens, 0)
      col.width = Math.min(42, Math.max(12, maxLen + 2))
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
                        background: hoveredRow === key ? '#f0fdf4' : idx % 2 === 0 ? '#fff' : '#fafafa',
                        cursor: onRowClick || onViewDetail ? 'pointer' : 'default',
                        borderBottom: '1px solid #f0f0f0',
                        position: 'relative',
                      }}
                      onClick={() => onRowClick?.(row)}
                      onMouseEnter={() => setHoveredRow(key)}
                      onMouseLeave={() => setHoveredRow(null)}
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
                      {/* Floating detail button — toggles expand if expandedRowRender exists, else calls onViewDetail */}
                      {(onViewDetail || expandedRowRender) && (
                        <td style={{ position: 'relative', width: 0, padding: 0, border: 'none', overflow: 'visible' }}>
                          <div
                            onClick={(e) => {
                              e.stopPropagation()
                              if (expandedRowRender) toggleExpand(key)
                              else onViewDetail?.(row)
                            }}
                            style={{
                              position: 'absolute',
                              right: 12,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 2px 8px rgba(27,77,62,0.4)',
                              cursor: 'pointer',
                              opacity: hoveredRow === key || isExpanded ? 1 : 0,
                              transition: 'opacity 0.15s, transform 0.15s',
                              zIndex: 5,
                              background: isExpanded ? '#059669' : '#1B4D3E',
                            }}
                            title={isExpanded ? 'Thu gọn' : 'Xem chi tiết'}
                          >
                            {isExpanded
                              ? <ExpandOutlined style={{ fontSize: 12, transform: 'rotate(45deg)' }} />
                              : <EyeOutlined style={{ fontSize: 14 }} />}
                          </div>
                        </td>
                      )}
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
