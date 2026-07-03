// ============================================================================
// B2B STATS PAGE — Tab "Thống kê" cạnh Dashboard (/b2b/stats)
// File: src/pages/b2b/rubber-intake/B2BRubberIntakeStatsPage.tsx
// ============================================================================
// Thống kê mủ mua được: Hôm nay / Tuần / Tháng / Quý / Năm / Tùy chọn
// Gom theo Ngày/Tuần/Tháng (áp cho chart + Excel)
// KPIs + biểu đồ + pie loại mủ + top đại lý + top vùng + xuất Excel
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Typography, Card, Row, Col, Space, Segmented, DatePicker, Select, Input,
  Statistic, Table, Tag, Button, Spin, Empty, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ReloadOutlined, DownloadOutlined, SearchOutlined, FilterOutlined,
  CalendarOutlined,
} from '@ant-design/icons'
import { Factory } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts'
import dayjs, { type Dayjs } from 'dayjs'

import {
  rubberIntakeB2BService,
  type AggregatedIntakeStats,
  type PartnerAggregate,
  type RegionAggregate,
} from '../../../services/b2b/rubberIntakeB2BService'
import { facilityService, type Facility } from '../../../services/wms/facilityService'
import { partnerService } from '../../../services/b2b/partnerService'
import type { Partner } from '../../../services/b2b/partnerService'
import { RAW_RUBBER_TYPE_LABELS, type RawRubberType } from '../../../services/b2b/intakeManualEntryService'
import { B2BSectionTabs, DASHBOARD_TABS } from '../../../components/b2b/B2BSectionTabs'

const { Title, Text } = Typography
const { RangePicker } = DatePicker

type TimeRange = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom'
type Grouping = 'day' | 'week' | 'month'

const GROUPING_LABEL: Record<Grouping, string> = { day: 'Ngày', week: 'Tuần', month: 'Tháng' }

/** Quý hiện tại: start = tháng đầu quý, end = hôm nay */
function quarterStart(d: dayjs.Dayjs): dayjs.Dayjs {
  const qStartMonth = Math.floor(d.month() / 3) * 3
  return d.month(qStartMonth).startOf('month')
}

/** Thứ Hai của tuần chứa ngày d (ISO-ish, tuần bắt đầu T2). */
function mondayOf(d: dayjs.Dayjs): dayjs.Dayjs {
  const dow = (d.day() + 6) % 7 // 0 = Monday
  return d.subtract(dow, 'day').startOf('day')
}

/** Key + label gom nhóm 1 ngày theo grouping. */
function bucketOf(dateStr: string, g: Grouping): { key: string; label: string } {
  const d = dayjs(dateStr)
  if (g === 'month') return { key: d.format('YYYY-MM'), label: d.format('MM/YYYY') }
  if (g === 'week') {
    const mon = mondayOf(d)
    return { key: mon.format('YYYY-MM-DD'), label: `Tuần ${mon.format('DD/MM')}` }
  }
  return { key: d.format('YYYY-MM-DD'), label: d.format('DD/MM') }
}

export interface GroupedPoint {
  key: string
  label: string
  count: number
  net_kg: number
  dry_kg: number
  amount: number
  avg_drc: number | null
}

/** Gom các điểm ngày (từ service) thành bucket Ngày/Tuần/Tháng. DRC TB = trung bình có trọng số theo số phiếu. */
function buildGroupedSeries(
  daily: { date: string; count: number; net_kg: number; dry_kg: number; amount: number; avg_drc: number | null }[],
  g: Grouping,
): GroupedPoint[] {
  const map = new Map<string, GroupedPoint & { _drcW: number; _drcN: number }>()
  for (const d of daily) {
    const { key, label } = bucketOf(d.date, g)
    const slot = map.get(key) || { key, label, count: 0, net_kg: 0, dry_kg: 0, amount: 0, avg_drc: null, _drcW: 0, _drcN: 0 }
    slot.count += d.count
    slot.net_kg += d.net_kg
    slot.dry_kg += d.dry_kg
    slot.amount += d.amount
    if (d.avg_drc != null) { slot._drcW += d.avg_drc * d.count; slot._drcN += d.count }
    map.set(key, slot)
  }
  return [...map.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ _drcW, _drcN, ...rest }) => ({
      ...rest,
      avg_drc: _drcN > 0 ? _drcW / _drcN : null,
    }))
}

const RAW_TYPE_COLOR: Record<string, string> = {
  mu_nuoc: '#3B82F6',
  mu_tap: '#F59E0B',
  mu_dong: '#06B6D4',
  mu_chen: '#8B5CF6',
  mu_to: '#EF4444',
  unclassified: '#94A3B8',
}

const RAW_TYPE_ICON: Record<string, string> = {
  mu_nuoc: '💧',
  mu_tap: '🪨',
  mu_dong: '🧊',
  mu_chen: '🥣',
  mu_to: '📄',
  unclassified: '❓',
}

// ============================================================================
// EXCEL EXPORT — header công ty + định dạng đẹp (ExcelJS)
// ============================================================================

const COMPANY_NAME = 'CÔNG TY CAO SU HUY ANH – PHONG ĐIỀN'
const EXCEL_DARK = 'FF1B4D3E'

interface SheetCol {
  title: string
  numFmt?: string
  total?: 'sum' | 'avg'
  align?: 'left' | 'center' | 'right'
}

/** Thêm 1 sheet có header công ty + tiêu đề + meta lọc + bảng style + dòng TỔNG. */
function addReportSheet(
  wb: any,
  opts: {
    name: string
    subtitle: string
    meta: string[]
    columns: SheetCol[]
    rows: (string | number)[][]
    colWidths?: number[]   // override độ rộng cột (vd sheet KPI cần cột rộng)
    noFilter?: boolean     // bỏ auto-filter (sheet KPI tổng quan)
  },
) {
  const ws = wb.addWorksheet(opts.name)
  const colCount = opts.columns.length

  // ── 1. Độ rộng cột (tính trước để biết bề ngang banner) ──
  const widths = opts.columns.map((c, i) => {
    if (opts.colWidths?.[i]) return opts.colWidths[i]
    const lens = opts.rows.map(r => {
      const v = r[i]
      return typeof v === 'number' ? Math.round(v).toLocaleString('vi-VN').length : String(v ?? '').length
    })
    const maxLen = Math.max(c.title?.length || 10, ...lens, 0)
    return Math.min(46, Math.max(12, maxLen + 2))
  })
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // ── 2. Vùng gộp banner — nới đủ rộng cho dòng dài nhất (công ty/tiêu đề/meta) ──
  const longest = Math.max(COMPANY_NAME.length, opts.subtitle.length, ...opts.meta.map(m => m.length))
  let span = colCount
  let acc = widths.reduce((a, b) => a + b, 0)
  while (acc < longest + 2 && span < colCount + 8) {
    span++
    ws.getColumn(span).width = 14
    acc += 14
  }

  // ── 3. Khối tiêu đề (công ty / tiêu đề / meta) — gộp ngang theo span ──
  const titleRows = [
    { text: COMPANY_NAME, font: { bold: true, size: 14, color: { argb: EXCEL_DARK } }, h: 24 },
    { text: opts.subtitle, font: { bold: true, size: 12, color: { argb: 'FF111111' } }, h: 18 },
    ...opts.meta.map(m => ({ text: m, font: { italic: true, size: 10, color: { argb: 'FF555555' } }, h: 16 })),
  ]
  titleRows.forEach((tr, i) => {
    const row = ws.addRow([tr.text])
    ws.mergeCells(i + 1, 1, i + 1, span)
    const cell = ws.getCell(i + 1, 1)
    cell.font = tr.font
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    row.height = tr.h
  })
  ws.addRow([]) // dòng trống ngăn cách
  const headerRowIdx = titleRows.length + 2

  // ── Header bảng ──
  const hr = ws.addRow(opts.columns.map(c => c.title))
  hr.height = 18
  hr.eachCell((cell: any, col: number) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_DARK } }
    cell.alignment = { horizontal: opts.columns[col - 1]?.align || 'center', vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF14402F' } } }
  })

  // ── Data rows ──
  opts.rows.forEach((row, idx) => {
    const dr = ws.addRow(row)
    dr.eachCell((cell: any, col: number) => {
      const c = opts.columns[col - 1]
      if (typeof cell.value === 'number') {
        cell.numFmt = c?.numFmt || '#,##0'
        cell.alignment = { horizontal: 'right' }
      } else if (c?.align) {
        cell.alignment = { horizontal: c.align }
      }
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F7F5' } }
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE6E6E6' } } }
    })
  })

  // ── Dòng TỔNG ──
  if (opts.columns.some(c => c.total) && opts.rows.length > 0) {
    const totals: (string | number)[] = opts.columns.map((c, i) => {
      if (!c.total) return ''
      const nums = opts.rows.map(r => r[i]).filter((v): v is number => typeof v === 'number')
      if (!nums.length) return ''
      const sum = nums.reduce((a, b) => a + b, 0)
      return c.total === 'avg' ? sum / nums.length : sum
    })
    const labelIdx = opts.columns.findIndex(c => !c.total)
    if (labelIdx >= 0 && totals[labelIdx] === '') totals[labelIdx] = `TỔNG (${opts.rows.length})`
    const tr = ws.addRow(totals)
    tr.eachCell((cell: any, col: number) => {
      cell.font = { bold: true, color: { argb: EXCEL_DARK } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCEAE3' } }
      cell.border = { top: { style: 'double', color: { argb: EXCEL_DARK } } }
      if (typeof cell.value === 'number') {
        cell.numFmt = opts.columns[col - 1]?.numFmt || '#,##0'
        cell.alignment = { horizontal: 'right' }
      }
    })
  }

  // ── Đông cứng tiêu đề + auto-filter ──
  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }]
  if (!opts.noFilter) {
    ws.autoFilter = { from: { row: headerRowIdx, column: 1 }, to: { row: headerRowIdx, column: colCount } }
  }
  return ws
}

export default function B2BRubberIntakeStatsPage() {
  const [data, setData] = useState<AggregatedIntakeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [timeRange, setTimeRange] = useState<TimeRange>('month')
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()])
  const [grouping, setGrouping] = useState<Grouping>('day')
  const [facilityFilter, setFacilityFilter] = useState<string>('')
  const [rawTypeFilter, setRawTypeFilter] = useState<RawRubberType | ''>('')
  const [partnerFilter, setPartnerFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [chartMetric, setChartMetric] = useState<'count' | 'dry' | 'amount'>('dry')

  // Reference data
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [partners, setPartners] = useState<Partner[]>([])

  // ── Resolved date range (preset "kỳ này" → từ đầu kỳ đến hôm nay)
  const dateRange = useMemo<[string, string]>(() => {
    const today = dayjs().format('YYYY-MM-DD')
    if (timeRange === 'today') return [today, today]
    if (timeRange === 'week') return [mondayOf(dayjs()).format('YYYY-MM-DD'), today]
    if (timeRange === 'month') return [dayjs().startOf('month').format('YYYY-MM-DD'), today]
    if (timeRange === 'quarter') return [quarterStart(dayjs()).format('YYYY-MM-DD'), today]
    if (timeRange === 'year') return [dayjs().startOf('year').format('YYYY-MM-DD'), today]
    return [customRange[0].format('YYYY-MM-DD'), customRange[1].format('YYYY-MM-DD')]
  }, [timeRange, customRange])

  // ── Auto-set grouping mặc định hợp lý khi đổi kỳ (user vẫn override được)
  useEffect(() => {
    if (timeRange === 'today' || timeRange === 'week' || timeRange === 'month') setGrouping('day')
    else if (timeRange === 'quarter') setGrouping('week')
    else if (timeRange === 'year') setGrouping('month')
  }, [timeRange])

  // Load reference data
  useEffect(() => {
    facilityService.getAllActive().then(setFacilities).catch(() => setFacilities([]))
    partnerService.getAllActive().then(setPartners).catch(() => setPartners([]))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await rubberIntakeB2BService.getAggregatedStats({
        date_from: dateRange[0],
        date_to: dateRange[1],
        facility_id: facilityFilter || undefined,
        raw_rubber_type: rawTypeFilter || undefined,
        partner_id: partnerFilter || undefined,
        search: search || undefined,
      })
      setData(res)
    } catch (e: any) {
      setError(e?.message || 'Lỗi tải thống kê')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [dateRange, facilityFilter, rawTypeFilter, partnerFilter, search])

  useEffect(() => { fetchData() }, [fetchData])

  // Debounce search
  useEffect(() => {
    const t = setTimeout(fetchData, 400)
    return () => clearTimeout(t)
  }, [search])

  // ── Export Excel (ExcelJS — header công ty + định dạng số + dòng tổng) ──
  const handleExport = async () => {
    if (!data) {
      message.warning('Chưa có dữ liệu để xuất')
      return
    }
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Huy Anh ERP'

      const facLabel = facilityFilter ? (facilities.find(f => f.id === facilityFilter)?.code || facilityFilter) : 'Tất cả'
      const rtLabel = rawTypeFilter ? RAW_RUBBER_TYPE_LABELS[rawTypeFilter] : 'Tất cả'
      const pnLabel = partnerFilter ? (partners.find(p => p.id === partnerFilter)?.name || '') : 'Tất cả'
      const meta = [
        `Kỳ: ${dayjs(dateRange[0]).format('DD/MM/YYYY')} → ${dayjs(dateRange[1]).format('DD/MM/YYYY')} · Gom theo: ${GROUPING_LABEL[grouping]}`,
        `Nhà máy: ${facLabel} · Loại mủ: ${rtLabel} · Đại lý: ${pnLabel}`,
      ]
      const fmtInt = (n: number) => Math.round(n).toLocaleString('vi-VN')

      // Sheet 1: Tổng quan (KPI — giá trị dạng chuỗi có đơn vị cho dễ đọc)
      addReportSheet(wb, {
        name: 'Tổng quan',
        subtitle: 'THỐNG KÊ MỦ MUA',
        meta,
        colWidths: [30, 24],
        noFilter: true,
        columns: [{ title: 'Chỉ tiêu' }, { title: 'Giá trị', align: 'right' }],
        rows: [
          ['Số phiếu', fmtInt(data.totals.count)],
          ['Tổng KL tươi', `${fmtInt(data.totals.net_kg)} kg`],
          ['Tổng KL khô', `${fmtInt(data.totals.dry_kg)} kg`],
          ['DRC trung bình', data.totals.avg_drc != null ? `${data.totals.avg_drc.toFixed(2)} %` : '—'],
          ['Tổng giá trị', `${fmtInt(data.totals.amount)} đ`],
          ['Giá TB / kg khô', data.totals.avg_price_per_dry_kg != null ? `${fmtInt(data.totals.avg_price_per_dry_kg)} đ` : '—'],
        ],
      })

      // Sheet 2: Theo kỳ
      const grouped = buildGroupedSeries(data.daily, grouping)
      const periodCol = GROUPING_LABEL[grouping]
      addReportSheet(wb, {
        name: `Theo ${periodCol}`,
        subtitle: 'THỐNG KÊ MỦ MUA',
        meta,
        columns: [
          { title: periodCol },
          { title: 'Số phiếu', numFmt: '#,##0', total: 'sum', align: 'right' },
          { title: 'KL tươi (kg)', numFmt: '#,##0', total: 'sum', align: 'right' },
          { title: 'KL khô (kg)', numFmt: '#,##0', total: 'sum', align: 'right' },
          { title: 'DRC TB (%)', numFmt: '0.0', align: 'right' },
          { title: 'Giá trị (đ)', numFmt: '#,##0', total: 'sum', align: 'right' },
        ],
        rows: grouped.map(d => [
          d.label, d.count, Math.round(d.net_kg), Math.round(d.dry_kg),
          d.avg_drc != null ? Number(d.avg_drc.toFixed(2)) : '', Math.round(d.amount),
        ]),
      })

      // Sheet 3: Top đại lý
      addReportSheet(wb, {
        name: 'Top đại lý',
        subtitle: 'THỐNG KÊ MỦ MUA',
        meta,
        columns: [
          { title: 'Mã đại lý' }, { title: 'Tên đại lý' }, { title: 'Hạng', align: 'center' },
          { title: 'Số phiếu', numFmt: '#,##0', total: 'sum', align: 'right' },
          { title: 'KL tươi (kg)', numFmt: '#,##0', total: 'sum', align: 'right' },
          { title: 'KL khô (kg)', numFmt: '#,##0', total: 'sum', align: 'right' },
          { title: 'Khô từ Deal (kg)', numFmt: '#,##0', total: 'sum', align: 'right' },
          { title: 'Khô bộc phát (kg)', numFmt: '#,##0', total: 'sum', align: 'right' },
          { title: 'DRC TB (%)', numFmt: '0.0', align: 'right' },
          { title: 'Giá trị (đ)', numFmt: '#,##0', total: 'sum', align: 'right' },
        ],
        rows: data.byPartner.map(p => [
          p.code, p.name, p.tier || '', p.count, Math.round(p.net_kg), Math.round(p.dry_kg),
          Math.round(p.deal_dry_kg || 0), Math.round(p.adhoc_dry_kg || 0),
          p.avg_drc != null ? Number(p.avg_drc.toFixed(2)) : '', Math.round(p.amount),
        ]),
      })

      // Sheet 4: Top vùng
      addReportSheet(wb, {
        name: 'Top vùng',
        subtitle: 'THỐNG KÊ MỦ MUA',
        meta,
        columns: [
          { title: 'Vùng nguyên liệu' },
          { title: 'Số phiếu', numFmt: '#,##0', total: 'sum', align: 'right' },
          { title: 'KL tươi (kg)', numFmt: '#,##0', total: 'sum', align: 'right' },
          { title: 'KL khô (kg)', numFmt: '#,##0', total: 'sum', align: 'right' },
          { title: 'Giá trị (đ)', numFmt: '#,##0', total: 'sum', align: 'right' },
        ],
        rows: data.byRegion.map(r => [
          r.name, r.count, Math.round(r.net_kg), Math.round(r.dry_kg), Math.round(r.amount),
        ]),
      })

      // Sheet 5: Loại mủ
      addReportSheet(wb, {
        name: 'Loại mủ',
        subtitle: 'THỐNG KÊ MỦ MUA',
        meta,
        columns: [
          { title: 'Loại mủ' },
          { title: 'Số phiếu', numFmt: '#,##0', total: 'sum', align: 'right' },
          { title: 'KL tươi (kg)', numFmt: '#,##0', total: 'sum', align: 'right' },
          { title: 'KL khô (kg)', numFmt: '#,##0', total: 'sum', align: 'right' },
          { title: 'Giá trị (đ)', numFmt: '#,##0', total: 'sum', align: 'right' },
        ],
        rows: data.byRawType.map(r => [
          r.type === 'unclassified' ? 'Chưa phân loại' : (RAW_RUBBER_TYPE_LABELS[r.type as RawRubberType] || r.type),
          r.count, Math.round(r.net_kg), Math.round(r.dry_kg), Math.round(r.amount),
        ]),
      })

      const fileName = `Thong-ke-mu-mua_${dateRange[0]}_${dateRange[1]}.xlsx`
      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      message.success(`Đã xuất ${fileName}`)
    } catch (e: any) {
      message.error('Xuất Excel thất bại: ' + (e?.message || ''))
    }
  }

  // ── Chart data (gom theo Ngày/Tuần/Tháng) ──
  const chartData = useMemo(() => {
    if (!data) return []
    return buildGroupedSeries(data.daily, grouping).map(d => ({
      date: d.label,
      count: d.count,
      dry: Math.round(d.dry_kg / 100) / 10, // tấn 1 chữ số
      amount: Math.round(d.amount / 1_000_000), // triệu
    }))
  }, [data, grouping])

  const pieData = useMemo(() => {
    if (!data) return []
    return data.byRawType
      .filter(r => r.dry_kg > 0)
      .map(r => ({
        name: r.type === 'unclassified' ? 'Chưa phân loại' : (RAW_RUBBER_TYPE_LABELS[r.type as RawRubberType] || r.type),
        value: Math.round(r.dry_kg / 100) / 10,
        type: r.type,
      }))
  }, [data])

  // ── Table columns ──
  const partnerColumns: ColumnsType<PartnerAggregate> = [
    { title: '#', width: 40, render: (_, __, i) => <Text strong>{i + 1}</Text> },
    {
      title: 'Đại lý',
      render: (_, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>{r.code}</Text>
          {r.tier && <Tag style={{ marginLeft: 6, fontSize: 10 }} color="purple">{r.tier}</Tag>}
        </div>
      ),
    },
    { title: 'Phiếu', dataIndex: 'count', width: 70, align: 'right',
      sorter: (a, b) => a.count - b.count },
    { title: 'KL khô (T)', dataIndex: 'dry_kg', width: 100, align: 'right',
      render: v => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0F766E' }}>{(v / 1000).toFixed(2)}</span>,
      sorter: (a, b) => a.dry_kg - b.dry_kg, defaultSortOrder: 'descend' },
    { title: 'Deal (T khô)', dataIndex: 'deal_dry_kg', width: 100, align: 'right',
      render: v => <span style={{ fontFamily: 'monospace', color: '#15803D' }}>{((v || 0) / 1000).toFixed(2)}</span>,
      sorter: (a, b) => a.deal_dry_kg - b.deal_dry_kg },
    { title: 'Bộc phát (T khô)', dataIndex: 'adhoc_dry_kg', width: 120, align: 'right',
      render: v => <span style={{ fontFamily: 'monospace', color: '#1D4ED8' }}>{((v || 0) / 1000).toFixed(2)}</span>,
      sorter: (a, b) => a.adhoc_dry_kg - b.adhoc_dry_kg },
    { title: 'DRC TB', dataIndex: 'avg_drc', width: 80, align: 'right',
      render: v => v != null ? <span style={{ color: '#15803D' }}>{v.toFixed(1)}%</span> : '—' },
    { title: 'Giá trị', dataIndex: 'amount', width: 100, align: 'right',
      render: v => v ? <span style={{ fontFamily: 'monospace', color: '#92400E' }}>{(v / 1_000_000).toFixed(1)}M</span> : '—',
      sorter: (a, b) => a.amount - b.amount },
  ]

  const regionColumns: ColumnsType<RegionAggregate> = [
    { title: '#', width: 40, render: (_, __, i) => <Text strong>{i + 1}</Text> },
    { title: 'Vùng nguyên liệu', dataIndex: 'name', render: v => <Text strong>{v}</Text> },
    { title: 'Phiếu', dataIndex: 'count', width: 70, align: 'right',
      sorter: (a, b) => a.count - b.count },
    { title: 'KL khô (T)', dataIndex: 'dry_kg', width: 100, align: 'right',
      render: v => <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0F766E' }}>{(v / 1000).toFixed(2)}</span>,
      sorter: (a, b) => a.dry_kg - b.dry_kg, defaultSortOrder: 'descend' },
    { title: 'Giá trị', dataIndex: 'amount', width: 100, align: 'right',
      render: v => v ? <span style={{ fontFamily: 'monospace', color: '#92400E' }}>{(v / 1_000_000).toFixed(1)}M</span> : '—' },
  ]

  // ── RENDER ──
  return (
    <div style={{ padding: 24 }}>
      <B2BSectionTabs tabs={DASHBOARD_TABS} active="stats" />

      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>Thống kê mủ mua</Title>
          <Text type="secondary">
            {dayjs(dateRange[0]).format('DD/MM/YYYY')} → {dayjs(dateRange[1]).format('DD/MM/YYYY')}
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined spin={loading} />} onClick={fetchData}>Làm mới</Button>
            <Button type="primary" icon={<DownloadOutlined />} onClick={handleExport}>Xuất Excel</Button>
          </Space>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ borderRadius: 12, marginBottom: 16 }}
        title={<Space><FilterOutlined /><Text strong>Bộ lọc</Text></Space>}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {/* Time range */}
          <Row gutter={12} align="middle">
            <Col>
              <Space size={4}>
                <CalendarOutlined />
                <Text type="secondary" style={{ fontSize: 12 }}>KHOẢNG:</Text>
              </Space>
            </Col>
            <Col>
              <Segmented<TimeRange>
                value={timeRange}
                onChange={(v) => setTimeRange(v)}
                options={[
                  { label: 'Hôm nay', value: 'today' },
                  { label: 'Tuần này', value: 'week' },
                  { label: 'Tháng này', value: 'month' },
                  { label: 'Quý này', value: 'quarter' },
                  { label: 'Năm nay', value: 'year' },
                  { label: 'Tùy chọn', value: 'custom' },
                ]}
              />
            </Col>
            {timeRange === 'custom' && (
              <Col>
                <RangePicker
                  value={customRange}
                  onChange={(v) => v && v[0] && v[1] && setCustomRange([v[0], v[1]])}
                  format="DD/MM/YYYY"
                  allowClear={false}
                />
              </Col>
            )}
            <Col>
              <Space size={4}>
                <Text type="secondary" style={{ fontSize: 12 }}>GOM THEO:</Text>
                <Segmented<Grouping>
                  size="small"
                  value={grouping}
                  onChange={(v) => setGrouping(v)}
                  options={[
                    { label: 'Ngày', value: 'day' },
                    { label: 'Tuần', value: 'week' },
                    { label: 'Tháng', value: 'month' },
                  ]}
                />
              </Space>
            </Col>
            <Col flex="auto" />
            <Col>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm vùng, mã lô, biển xe..."
                prefix={<SearchOutlined />}
                allowClear
                style={{ width: 280 }}
              />
            </Col>
          </Row>

          {/* Other filters */}
          <Row gutter={12}>
            {facilities.length > 1 && (
              <Col>
                <Space size={4} wrap>
                  <Text type="secondary" style={{ fontSize: 11 }}>NHÀ MÁY:</Text>
                  <Tag.CheckableTag checked={facilityFilter === ''} onChange={() => setFacilityFilter('')}>
                    Tất cả
                  </Tag.CheckableTag>
                  {facilities.map(f => (
                    <Tag.CheckableTag
                      key={f.id}
                      checked={facilityFilter === f.id}
                      onChange={() => setFacilityFilter(facilityFilter === f.id ? '' : f.id)}
                    >
                      <Factory size={10} style={{ display: 'inline', marginRight: 3 }} /> {f.code}
                    </Tag.CheckableTag>
                  ))}
                </Space>
              </Col>
            )}
            <Col>
              <Space size={4} wrap>
                <Text type="secondary" style={{ fontSize: 11 }}>LOẠI MỦ:</Text>
                <Tag.CheckableTag checked={rawTypeFilter === ''} onChange={() => setRawTypeFilter('')}>
                  Tất cả
                </Tag.CheckableTag>
                {(['mu_nuoc', 'mu_tap'] as RawRubberType[]).map(rt => (
                  <Tag.CheckableTag
                    key={rt}
                    checked={rawTypeFilter === rt}
                    onChange={() => setRawTypeFilter(rawTypeFilter === rt ? '' : rt)}
                  >
                    {RAW_TYPE_ICON[rt]} {RAW_RUBBER_TYPE_LABELS[rt]}
                  </Tag.CheckableTag>
                ))}
              </Space>
            </Col>
            <Col flex="auto" />
            <Col>
              <Select
                value={partnerFilter || undefined}
                onChange={(v) => setPartnerFilter(v || '')}
                placeholder="Lọc theo đại lý..."
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: 240 }}
                options={partners.map(p => ({
                  value: p.id,
                  label: `${p.name} (${p.code})`,
                }))}
              />
            </Col>
          </Row>
        </Space>
      </Card>

      {error && (
        <Card style={{ marginBottom: 12, background: '#FEF2F2', borderColor: '#FECACA' }}>
          <Text type="danger" strong>Không tải được thống kê: </Text>
          <Text type="danger">{error}</Text>
        </Card>
      )}

      {/* KPIs */}
      <Spin spinning={loading}>
        {data && (
          <>
            <Row gutter={12} style={{ marginBottom: 16 }}>
              <Col xs={12} sm={8} md={4}>
                <Card size="small" style={{ borderRadius: 12, borderTop: '3px solid #1B4D3E' }}>
                  <Statistic title="Số phiếu" value={data.totals.count} valueStyle={{ fontSize: 22, color: '#1B4D3E' }} />
                </Card>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Card size="small" style={{ borderRadius: 12, borderTop: '3px solid #15803D' }}>
                  <Statistic title="KL tươi" value={data.totals.net_kg / 1000} precision={2} suffix="T"
                    valueStyle={{ color: '#15803D', fontSize: 22 }} />
                </Card>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Card size="small" style={{ borderRadius: 12, borderTop: '3px solid #0F766E' }}>
                  <Statistic title="KL khô" value={data.totals.dry_kg / 1000} precision={2} suffix="T"
                    valueStyle={{ color: '#0F766E', fontSize: 22 }} />
                </Card>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Card size="small" style={{ borderRadius: 12, borderTop: '3px solid #8B5CF6' }}>
                  <Statistic title="DRC TB"
                    value={data.totals.avg_drc ?? 0}
                    precision={1}
                    suffix="%"
                    valueStyle={{ color: '#8B5CF6', fontSize: 22 }} />
                </Card>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Card size="small" style={{ borderRadius: 12, borderTop: '3px solid #D97706' }}>
                  <Statistic title="Giá trị" value={data.totals.amount / 1_000_000} precision={1} suffix=" tr đ"
                    valueStyle={{ color: '#D97706', fontSize: 22 }} />
                </Card>
              </Col>
              <Col xs={12} sm={8} md={4}>
                <Card size="small" style={{ borderRadius: 12, borderTop: '3px solid #06B6D4' }}>
                  <Statistic title="Giá TB / kg khô"
                    value={data.totals.avg_price_per_dry_kg ?? 0}
                    precision={0}
                    suffix=" đ"
                    valueStyle={{ color: '#06B6D4', fontSize: 22 }} />
                </Card>
              </Col>
            </Row>

            {/* Charts */}
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={24} lg={16}>
                <Card
                  size="small"
                  style={{ borderRadius: 12 }}
                  title={
                    <Space>
                      <Text strong>Biểu đồ theo {GROUPING_LABEL[grouping].toLowerCase()}</Text>
                      <Segmented
                        size="small"
                        value={chartMetric}
                        onChange={(v) => setChartMetric(v as any)}
                        options={[
                          { label: 'KL khô (T)', value: 'dry' },
                          { label: 'Số phiếu', value: 'count' },
                          { label: 'Giá trị (tr)', value: 'amount' },
                        ]}
                      />
                    </Space>
                  }
                >
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <RechartsTooltip
                          formatter={(v: any) => {
                            if (chartMetric === 'dry') return [`${v} T`, 'KL khô']
                            if (chartMetric === 'amount') return [`${v} tr đ`, 'Giá trị']
                            return [v, 'Số phiếu']
                          }}
                          contentStyle={{ borderRadius: 8 }}
                        />
                        <Bar
                          dataKey={chartMetric}
                          fill={chartMetric === 'dry' ? '#0F766E' : chartMetric === 'amount' ? '#D97706' : '#1B4D3E'}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <Empty description="Không có dữ liệu trong khoảng" style={{ padding: 40 }} />
                  )}
                </Card>
              </Col>

              <Col xs={24} lg={8}>
                <Card size="small" style={{ borderRadius: 12 }} title={<Text strong>Cơ cấu loại mủ (theo KL khô)</Text>}>
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {pieData.map((entry) => (
                            <Cell key={entry.type} fill={RAW_TYPE_COLOR[entry.type] || '#94A3B8'} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(v: any, name: any) => [`${v} T`, name]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <Empty description="Không có dữ liệu" style={{ padding: 40 }} />
                  )}
                </Card>
              </Col>
            </Row>

            {/* Top tables */}
            <Row gutter={16}>
              <Col xs={24} lg={12}>
                <Card
                  size="small"
                  style={{ borderRadius: 12 }}
                  title={<Text strong>Top đại lý (theo KL khô)</Text>}
                  extra={<Text type="secondary" style={{ fontSize: 11 }}>{data.byPartner.length} đại lý</Text>}
                  styles={{ body: { padding: 0 } }}
                >
                  <Table<PartnerAggregate>
                    dataSource={data.byPartner.slice(0, 20)}
                    columns={partnerColumns}
                    rowKey="partner_id"
                    pagination={false}
                    size="small"
                    locale={{ emptyText: <Empty description="Chưa có dữ liệu đại lý" /> }}
                  />
                </Card>
              </Col>

              <Col xs={24} lg={12}>
                <Card
                  size="small"
                  style={{ borderRadius: 12 }}
                  title={<Text strong>Top vùng nguyên liệu</Text>}
                  extra={<Text type="secondary" style={{ fontSize: 11 }}>{data.byRegion.length} vùng</Text>}
                  styles={{ body: { padding: 0 } }}
                >
                  <Table<RegionAggregate>
                    dataSource={data.byRegion.slice(0, 20)}
                    columns={regionColumns}
                    rowKey="name"
                    pagination={false}
                    size="small"
                    locale={{ emptyText: <Empty description="Chưa có dữ liệu vùng" /> }}
                  />
                </Card>
              </Col>
            </Row>
          </>
        )}
      </Spin>
    </div>
  )
}
