// ============================================================================
// FleetCostPage — Sổ chi phí đội xe (/logistics/costs)
// File: src/pages/logistics/costs/FleetCostPage.tsx
//
// Thay "Form theo dõi chi phí tài xế.xlsx": chọn tháng (+ tài xế / xe) → tab theo tài xế
// (1 dòng = 1 lệnh, đúng bố cục form, cuối bảng tạm ứng − chi được tính = còn lại), theo xe
// (₫/km), theo loại chi, sổ tạm ứng, chờ duyệt, ĐỀ NGHỊ THANH TOÁN (Đợt 2: gom chuyến + tạm ứng
// của một tài xế thành phiếu TTDX-… đi luồng Gửi → Duyệt → Chi như thanh toán mủ).
// Xuất .xlsx đúng mẫu (fleetCostExcel.ts). Mọi số đọc từ v_fleet_cost_trips / v_fleet_cost_month.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Space, Table, Tabs, Tag, Tooltip, Typography, message,
} from 'antd'
import type { TableProps } from 'antd'
import {
  CarOutlined, DeleteOutlined, DollarOutlined, FileExcelOutlined, FileTextOutlined, LockOutlined, PlusOutlined, ReloadOutlined, WalletOutlined, WarningOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useAuthStore } from '../../../stores/authStore'
import { fleetService, type FleetDriver, type FleetVehicle } from '../../../services/logistics/fleetService'
import { TRIP_TYPE_LABELS, type TripType } from '../../../services/logistics/dispatchService'
import {
  fleetCostService, EXPENSE_KIND_LABELS, HIRE_KIND_LABEL, fmtAmt, fmtMoney,
  type DriverAdvance, type ExpenseKind, type MonthCostRow, type MonthExpenseRow, type TripCostRow,
} from '../../../services/logistics/fleetCostService'
import {
  fleetPaymentRequestService, FLEET_PR_METHOD_LABELS, FLEET_PR_STATUS_LABELS,
  type AvailableForRequest, type FleetPaymentRequest, type FleetPrPaymentMethod, type FleetPrStatus,
} from '../../../services/logistics/fleetPaymentRequestService'
import { exportFleetCostMonth, type DriverSheet } from '../../../services/logistics/fleetCostExcel'
import { AMBER, BRAND, GOLD, INK_2, Kpi, MONO, OK, PageHeader, Pair, PrStatusTag, RED, Th, thousands } from './fleetCostUi'

const { Text } = Typography
const HIRED_LABEL = 'Xe thuê ngoài / không gắn tài xế'
/** Tên cột ngắn cho bảng theo xe (tên đầy đủ hiện ở tooltip) — tránh tiêu đề 2–3 dòng. */
const KIND_SHORT: Record<string, string> = { fuel: 'Dầu', toll: 'BOT', port: 'Cầu cảng', loading: 'Bốc xếp', meals: 'Ăn ở', repair: 'Sửa chữa', border: 'Biên giới', parking: 'Gửi/rửa xe', other: 'Khác', hire: 'Thuê ngoài' }
const fmtD = (iso?: string | null) => (iso ? dayjs(iso).format('DD/MM') : '–')
const fmtDate = (iso?: string | null) => (iso ? dayjs(iso).format('DD/MM/YYYY') : '–')

type VehicleRow = { key: string; plate: string; trips: number; km: number; kinds: Record<string, number>; total: number }
type DriverRow = { key: string; driver_id: string | null; name: string; trips: number; advVnd: number; advLak: number; cVnd: number; cLak: number; uVnd: number; uLak: number; balVnd: number; balLak: number }
type AvailAdvance = AvailableForRequest['advances'][number]

export default function FleetCostPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf('month'))
  const ym = month.format('YYYY-MM')
  const [driverId, setDriverId] = useState<string | null>(null)
  const [vehicleId, setVehicleId] = useState<string | null>(null)
  const [tab, setTab] = useState('driver')

  const [drivers, setDrivers] = useState<FleetDriver[]>([])
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [trips, setTrips] = useState<TripCostRow[]>([])
  const [monthRows, setMonthRows] = useState<MonthCostRow[]>([])
  const [monthExp, setMonthExp] = useState<MonthExpenseRow[]>([])
  const [advances, setAdvances] = useState<DriverAdvance[]>([])
  const [requests, setRequests] = useState<FleetPaymentRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [lastLak, setLastLak] = useState<number | null>(null)

  const [advOpen, setAdvOpen] = useState(false)
  const [advForm] = Form.useForm()
  const [saving, setSaving] = useState(false)

  // Lập đề nghị thanh toán
  const [prOpen, setPrOpen] = useState(false)
  const [prAvail, setPrAvail] = useState<AvailableForRequest | null>(null)
  const [prTrips, setPrTrips] = useState<string[]>([])
  const [prAdvs, setPrAdvs] = useState<string[]>([])
  const [prForm] = Form.useForm()

  useEffect(() => {
    fleetService.listDrivers({ active: true }).then(setDrivers).catch(() => setDrivers([]))
    fleetService.listVehicles({ kind: 'tractor', active: true }).then(setVehicles).catch(() => setVehicles([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, m, e, a, rate, prs] = await Promise.all([
        fleetCostService.listTrips({ ym, driverId, tractorVehicleId: vehicleId }),
        fleetCostService.listMonth(ym),
        fleetCostService.listMonthExpenses(ym),
        fleetCostService.listAdvances({ ym, driverId: driverId || undefined }),
        fleetCostService.lastLakRate(),
        fleetPaymentRequestService.list({ ym, driverId }),
      ])
      setTrips(t); setMonthRows(m); setMonthExp(e); setAdvances(a); setLastLak(rate); setRequests(prs)
    } catch (err: any) {
      message.error('Lỗi tải sổ chi phí: ' + (err?.message || err))
    } finally { setLoading(false) }
  }, [ym, driverId, vehicleId])
  useEffect(() => { load() }, [load])

  // ── KPI (theo bộ lọc) ─────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const km = trips.reduce((s, t) => s + (t.trip_km || 0), 0)
    const kmTrips = trips.filter((t) => t.trip_km != null)
    const counted = trips.reduce((s, t) => s + t.counted_vnd, 0)
    const countedLak = trips.reduce((s, t) => s + t.counted_lak, 0)
    const countedEq = trips.reduce((s, t) => s + t.counted_vnd_equiv, 0)
    const countedEqKm = kmTrips.reduce((s, t) => s + t.counted_vnd_equiv, 0)
    const uncounted = trips.reduce((s, t) => s + t.uncounted_vnd, 0)
    const uncountedLak = trips.reduce((s, t) => s + t.uncounted_lak, 0)
    const mrows = monthRows.filter((r) => (driverId ? r.driver_id === driverId : true))
    const adv = mrows.filter((r) => r.currency === 'VND').reduce((s, r) => s + r.advanced, 0)
    const advLak = mrows.filter((r) => r.currency === 'LAK').reduce((s, r) => s + r.advanced, 0)
    const bal = mrows.filter((r) => r.currency === 'VND').reduce((s, r) => s + r.balance, 0)
    const balLak = mrows.filter((r) => r.currency === 'LAK').reduce((s, r) => s + r.balance, 0)
    const pending = trips.filter((t) => t.n_expenses > 0 && t.cost_status === 'open').length
    const missing = trips.reduce((s, t) => s + t.n_missing_receipt, 0)
    const notRequested = trips.filter((t) => t.n_expenses > 0 && !t.fleet_payment_request_id && t.driver_id).length
    return { n: trips.length, km, counted, countedLak, countedEq, perKm: km > 0 ? countedEqKm / km : 0, uncounted, uncountedLak, adv, advLak, bal, balLak, pending, missing, notRequested }
  }, [trips, monthRows, driverId])

  // ── Tổng theo tài xế ──────────────────────────────────────────────────────
  const driverSummary = useMemo<DriverRow[]>(() => {
    const map = new Map<string, DriverRow>()
    for (const r of monthRows) {
      const key = r.driver_id || '__hired'
      const row = map.get(key) || { key, driver_id: r.driver_id, name: r.driver_name || HIRED_LABEL, trips: 0, advVnd: 0, advLak: 0, cVnd: 0, cLak: 0, uVnd: 0, uLak: 0, balVnd: 0, balLak: 0 }
      if (r.currency === 'VND') { row.advVnd += r.advanced; row.cVnd += r.counted; row.uVnd += r.uncounted; row.balVnd += r.balance }
      else { row.advLak += r.advanced; row.cLak += r.counted; row.uLak += r.uncounted; row.balLak += r.balance }
      row.trips = Math.max(row.trips, r.n_trips_with_cost)
      map.set(key, row)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  }, [monthRows])

  // ── Theo xe ───────────────────────────────────────────────────────────────
  const byVehicle = useMemo<VehicleRow[]>(() => {
    const map = new Map<string, VehicleRow>()
    for (const t of trips) {
      const key = t.is_hired ? '__hired' : (t.tractor_plate || '—')
      const v = map.get(key) || { key, plate: t.is_hired ? 'Xe thuê ngoài' : (t.tractor_plate || '—'), trips: 0, km: 0, kinds: {}, total: 0 }
      v.trips += 1; v.km += t.trip_km || 0; v.total += t.counted_vnd_equiv
      if (t.is_hired && t.hire_cost) v.kinds.hire = (v.kinds.hire || 0) + t.hire_cost
      map.set(key, v)
    }
    const tripIds = new Set(trips.map((t) => t.dispatch_order_id))
    for (const e of monthExp) {
      if (!e.counted || !tripIds.has(e.dispatch_order_id)) continue
      const key = e.order.is_hired ? '__hired' : (e.order.tractor_plate || '—')
      const v = map.get(key); if (!v) continue
      v.kinds[e.kind] = (v.kinds[e.kind] || 0) + e.amount_vnd
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [trips, monthExp])

  const vehicleColumns: NonNullable<TableProps<VehicleRow>['columns']> = [
    { title: 'Đầu kéo', dataIndex: 'plate', fixed: 'left', width: 130, render: (v: string) => <b style={MONO}>{v}</b> },
    { title: 'Chuyến', dataIndex: 'trips', width: 80, align: 'right' },
    { title: 'Km', dataIndex: 'km', width: 90, align: 'right', render: (v: number) => <span style={MONO}>{fmtAmt(v)}</span> },
    ...(['fuel', 'toll', 'port', 'loading', 'meals', 'repair', 'border', 'parking', 'other', 'hire'] as const).map((k) => ({
      title: <Tooltip title={k === 'hire' ? HIRE_KIND_LABEL : EXPENSE_KIND_LABELS[k]}><span>{KIND_SHORT[k]}</span></Tooltip>, key: k, width: 104, align: 'right' as const,
      render: (_: unknown, r: VehicleRow) => <span style={MONO}>{r.kinds[k] ? fmtAmt(r.kinds[k]) : ''}</span>,
    })),
    { title: <Th main="Tổng" sub="₫ quy đổi" />, dataIndex: 'total', width: 130, align: 'right', render: (v: number) => <b style={MONO}>{fmtAmt(v)}</b> },
    { title: '₫ / km', width: 90, align: 'right', render: (_: unknown, r: VehicleRow) => <span style={MONO}>{r.km > 0 ? fmtAmt(r.total / r.km) : '–'}</span> },
  ]

  // ── Theo loại chi ─────────────────────────────────────────────────────────
  const byKind = useMemo(() => {
    const tripIds = new Set(trips.map((t) => t.dispatch_order_id))
    const map = new Map<string, { key: string; label: string; n: number; vnd: number; lak: number; eq: number; uncounted: number }>()
    for (const e of monthExp) {
      if (!tripIds.has(e.dispatch_order_id)) continue
      const row = map.get(e.kind) || { key: e.kind, label: EXPENSE_KIND_LABELS[e.kind] || e.kind, n: 0, vnd: 0, lak: 0, eq: 0, uncounted: 0 }
      row.n += 1
      if (e.counted) { if (e.currency === 'VND') row.vnd += e.amount; else row.lak += e.amount; row.eq += e.amount_vnd }
      else row.uncounted += e.amount_vnd
      map.set(e.kind, row)
    }
    const hire = trips.filter((t) => t.is_hired && t.hire_cost).reduce((s, t) => s + (t.hire_cost || 0), 0)
    if (hire) map.set('hire', { key: 'hire', label: HIRE_KIND_LABEL, n: trips.filter((t) => t.is_hired && t.hire_cost).length, vnd: hire, lak: 0, eq: hire, uncounted: 0 })
    return Array.from(map.values()).sort((a, b) => b.eq - a.eq)
  }, [trips, monthExp])

  // ── Xuất Excel ────────────────────────────────────────────────────────────
  const doExport = async () => {
    setExporting(true)
    try {
      const groups = new Map<string, TripCostRow[]>()
      for (const t of trips) {
        const name = t.driver_name || (t.is_hired ? 'Xe thue ngoai' : 'Chua gan tai xe')
        groups.set(name, [...(groups.get(name) || []), t])
      }
      const sheets: DriverSheet[] = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'vi')).map(([driverName, rows]) => ({ driverName, trips: rows }))
      await exportFleetCostMonth({ ym, sheets })
    } catch (e: any) { message.error('Lỗi xuất Excel: ' + (e?.message || e)) }
    finally { setExporting(false) }
  }

  // ── Tạm ứng ───────────────────────────────────────────────────────────────
  const openAdvance = () => {
    advForm.setFieldsValue({ driver_id: driverId || undefined, advance_date: dayjs(), amount: undefined, currency: 'VND', fx_rate_vnd: lastLak ?? undefined, dispatch_order_id: undefined, paid_by_name: user?.full_name || '', note: '' })
    setAdvOpen(true)
  }
  const saveAdvance = async () => {
    const v = await advForm.validateFields()
    setSaving(true)
    try {
      await fleetCostService.addAdvance({ driver_id: v.driver_id, advance_date: v.advance_date.format('YYYY-MM-DD'), amount: v.amount, currency: v.currency, fx_rate_vnd: v.currency === 'LAK' ? v.fx_rate_vnd : null, dispatch_order_id: v.dispatch_order_id || null, paid_by_name: v.paid_by_name, note: v.note })
      message.success('Đã ghi tạm ứng'); setAdvOpen(false); load()
    } catch (e: any) { message.error('Lỗi: ' + (e?.message || e)) }
    finally { setSaving(false) }
  }
  const advDriverWatch = Form.useWatch('driver_id', advForm)
  const advCurrencyWatch = Form.useWatch('currency', advForm)

  // ── Lập đề nghị thanh toán ────────────────────────────────────────────────
  const openPr = async () => {
    if (!driverId) { message.info('Chọn một tài xế ở bộ lọc trước'); return }
    try {
      const a = await fleetPaymentRequestService.listAvailable(driverId, ym)
      setPrAvail(a); setPrTrips(a.trips.map((t) => t.dispatch_order_id)); setPrAdvs(a.advances.map((x) => x.id))
      prForm.setFieldsValue({ request_date: dayjs(), payment_method: 'cash', payee_account: '' })
      setPrOpen(true)
    } catch (e: any) { message.error('Lỗi: ' + (e?.message || e)) }
  }
  const prTotals = useMemo(() => {
    if (!prAvail) return { exp: 0, adv: 0 }
    const exp = prAvail.trips.filter((t) => prTrips.includes(t.dispatch_order_id)).reduce((s, t) => s + t.counted_driver_vnd_equiv, 0)
    const adv = prAvail.advances.filter((a) => prAdvs.includes(a.id)).reduce((s, a) => s + a.amount_vnd, 0)
    return { exp, adv }
  }, [prAvail, prTrips, prAdvs])
  const createPr = async () => {
    const v = await prForm.validateFields()
    if (!prTrips.length && !prAdvs.length) { message.warning('Chọn ít nhất một chuyến hoặc tạm ứng'); return }
    setSaving(true)
    try {
      const req = await fleetPaymentRequestService.buildDraft({
        driverId: driverId!, ym, dispatchOrderIds: prTrips, advanceIds: prAdvs,
        request_date: v.request_date.format('YYYY-MM-DD'), payment_method: v.payment_method, payee_account: v.payee_account || null,
      })
      message.success(`Đã lập phiếu nháp ${req.code}`)
      setPrOpen(false)
      navigate(`/logistics/costs/payment-requests/${req.id}`)
    } catch (e: any) { message.error('Lỗi lập phiếu: ' + (e?.message || e)) }
    finally { setSaving(false) }
  }

  // ── Cột bảng chuyến (bố cục form) ─────────────────────────────────────────
  const tripColumns = [
    { title: 'Lệnh', dataIndex: 'code', width: 118, fixed: 'left' as const, render: (v: string, t: TripCostRow) => <a style={{ ...MONO, fontWeight: 600 }} onClick={() => navigate(`/logistics/dispatch/${t.dispatch_order_id}`)}>{v}</a> },
    { title: 'Tài xế', dataIndex: 'driver_name', width: 140, render: (v: string | null, t: TripCostRow) => v || (t.is_hired ? <Tag color="purple" style={{ margin: 0 }}>thuê ngoài</Tag> : '–') },
    { title: 'Đi', dataIndex: 'dispatch_date', width: 66, render: fmtD },
    { title: 'Về', dataIndex: 'return_date', width: 66, render: fmtD },
    { title: 'Ngày', dataIndex: 'trip_days', width: 66, align: 'right' as const, render: (v: number | null) => v ?? '–' },
    { title: 'Xe / moóc', width: 150, render: (_: unknown, t: TripCostRow) => <span style={{ fontSize: 12, ...MONO }}>{t.tractor_plate || '–'}{t.trailer_plate ? ` / ${t.trailer_plate}` : ''}</span> },
    { title: <Th main="Km đi" sub="đồng hồ" />, dataIndex: 'odometer_start_km', width: 96, align: 'right' as const, render: (v: number | null) => <span style={MONO}>{v != null ? fmtAmt(v) : '–'}</span> },
    { title: <Th main="Km về" sub="đồng hồ" />, dataIndex: 'odometer_end_km', width: 96, align: 'right' as const, render: (v: number | null) => <span style={MONO}>{v != null ? fmtAmt(v) : '–'}</span> },
    { title: 'Km', dataIndex: 'trip_km', width: 64, align: 'right' as const, render: (v: number | null) => <b style={MONO}>{v != null ? fmtAmt(v) : '–'}</b> },
    { title: 'Hành trình', width: 190, render: (_: unknown, t: TripCostRow) => t.route_name || [t.pickup_location, t.destination].filter(Boolean).join(' → ') || <Text type="secondary">–</Text> },
    { title: <Th main="Chuẩn" sub="ngày" />, dataIndex: 'standard_days', width: 78, align: 'right' as const, render: (v: number | null) => v ?? '–' },
    { title: <Th main="Vượt" sub="ngày" />, dataIndex: 'over_days', width: 72, align: 'right' as const, render: (v: number | null) => v ? <b style={{ color: AMBER }}>+{v}</b> : (v === 0 ? <span style={{ color: OK }}>0</span> : '–') },
    { title: 'Nội dung công việc', width: 190, render: (_: unknown, t: TripCostRow) => {
      const typeLabel = TRIP_TYPE_LABELS[t.trip_type as TripType] || t.trip_type
      const reason = t.reason && t.reason.trim().toLowerCase() !== typeLabel.toLowerCase() ? t.reason.trim() : ''
      return <span style={{ fontSize: 12 }}>{[typeLabel, t.customer_name, reason].filter(Boolean).join(' · ')}</span>
    } },
    { title: 'Nội dung chi', width: 180, render: (_: unknown, t: TripCostRow) => <span style={{ fontSize: 12 }}>{[(t.kinds || '').split(',').filter(Boolean).map((k) => EXPENSE_KIND_LABELS[k as ExpenseKind] || k).join(', '), t.is_hired && t.hire_cost ? HIRE_KIND_LABEL : ''].filter(Boolean).join(', ') || '–'}</span> },
    { title: <Th main="Tạm ứng" sub="gắn chuyến" />, width: 130, align: 'right' as const, render: (_: unknown, t: TripCostRow) => <Pair vnd={t.adv_vnd} lak={t.adv_lak} /> },
    { title: <Th main="Chi được tính" sub="công ty chịu" />, width: 150, align: 'right' as const, onCell: () => ({ style: { background: '#F0F9F4' } }), render: (_: unknown, t: TripCostRow) => <Pair vnd={t.counted_vnd} lak={t.counted_lak} tone={BRAND} bold /> },
    { title: <Th main="Không được tính" sub="tài xế chịu" />, width: 160, align: 'right' as const, onCell: () => ({ style: { background: '#FEF2F2' } }), render: (_: unknown, t: TripCostRow) => <Pair vnd={t.uncounted_vnd} lak={t.uncounted_lak} tone={RED} /> },
    { title: 'Trạng thái', width: 150, render: (_: unknown, t: TripCostRow) => (
      <Space size={4} wrap>
        {t.cost_status === 'reviewed' ? <Tag icon={<LockOutlined />} color="green" style={{ margin: 0 }}>đã duyệt</Tag> : t.n_expenses > 0 ? <Tag color="gold" style={{ margin: 0 }}>chờ duyệt</Tag> : <Tag style={{ margin: 0 }}>chưa nhập</Tag>}
        {t.payment_request_code && <Tooltip title={`Đề nghị thanh toán · ${FLEET_PR_STATUS_LABELS[t.payment_request_status as FleetPrStatus] || t.payment_request_status}`}><Tag color="geekblue" style={{ margin: 0, cursor: 'pointer', ...MONO }} onClick={() => navigate(`/logistics/costs/payment-requests/${t.fleet_payment_request_id}`)}>{t.payment_request_code}</Tag></Tooltip>}
      </Space>
    ) },
    { title: 'Ghi chú', width: 160, render: (_: unknown, t: TripCostRow) => <span style={{ fontSize: 12 }}>{[t.n_missing_receipt ? `${t.n_missing_receipt} khoản thiếu chứng từ` : '', t.cost_note || ''].filter(Boolean).join(' · ') || ''}</span> },
  ]

  const summaryTotals = useMemo(() => ({
    days: trips.reduce((s, t) => s + (t.trip_days || 0), 0), km: kpi.km,
    advVnd: trips.reduce((s, t) => s + t.adv_vnd, 0), advLak: trips.reduce((s, t) => s + t.adv_lak, 0),
    cVnd: kpi.counted, cLak: kpi.countedLak, uVnd: kpi.uncounted, uLak: kpi.uncountedLak,
  }), [trips, kpi])

  const driverRowsForFilter = driverSummary.filter((r) => (driverId ? r.driver_id === driverId : true))
  const selectedDriver = drivers.find((d) => d.id === driverId)

  const prColumns = [
    { title: 'Số phiếu', dataIndex: 'code', width: 130, render: (v: string, r: FleetPaymentRequest) => <a style={{ ...MONO, fontWeight: 600 }} onClick={() => navigate(`/logistics/costs/payment-requests/${r.id}`)}>{v}</a> },
    { title: 'Ngày', dataIndex: 'request_date', width: 100, render: fmtDate },
    { title: 'Kỳ', dataIndex: 'period_ym', width: 80, render: (v: string | null) => v ? `${v.slice(5, 7)}/${v.slice(0, 4)}` : '–' },
    { title: 'Tài xế', width: 170, render: (_: unknown, r: FleetPaymentRequest) => r.payee_name || r.driver?.full_name || '–' },
    { title: 'Tiêu đề', dataIndex: 'title', render: (v: string | null) => <span style={{ fontSize: 12.5 }}>{v || ''}</span> },
    { title: 'Chi được tính', dataIndex: 'total_expense', width: 130, align: 'right' as const, render: (v: number) => <span style={MONO}>{fmtAmt(v)} ₫</span> },
    { title: 'Trừ tạm ứng', dataIndex: 'total_advance', width: 120, align: 'right' as const, render: (v: number) => <span style={{ ...MONO, color: AMBER }}>{v ? `−${fmtAmt(v)} ₫` : ''}</span> },
    { title: 'Thực chi', dataIndex: 'net_amount', width: 130, align: 'right' as const, render: (v: number) => <b style={{ ...MONO, color: v < 0 ? RED : OK }}>{v < 0 ? '−' : ''}{fmtAmt(Math.abs(v))} ₫</b> },
    { title: 'Trạng thái', dataIndex: 'status', width: 100, render: (v: FleetPrStatus) => <PrStatusTag status={v} /> },
    { title: '', width: 90, render: (_: unknown, r: FleetPaymentRequest) => <Button size="small" onClick={() => navigate(`/logistics/costs/payment-requests/${r.id}`)}>Mở</Button> },
  ]

  return (
    <div style={{ padding: 20, maxWidth: 1680, margin: '0 auto' }}>
      <PageHeader
        title="Sổ chi phí đội xe"
        subtitle={<>Tháng <b>{month.format('MM/YYYY')}</b> · {trips.length} lệnh điều động{selectedDriver ? <> · tài xế <b>{selectedDriver.full_name}</b></> : ''} · một dòng = một chuyến, đúng bố cục form theo dõi chi phí tài xế</>}
        extra={(
          <Space wrap>
            <DatePicker picker="month" value={month} onChange={(d) => d && setMonth(d.startOf('month'))} format="MM/YYYY" allowClear={false} />
            <Select allowClear showSearch placeholder="Tài xế" style={{ width: 200 }} value={driverId || undefined} onChange={(v) => setDriverId(v || null)}
              options={drivers.map((d) => ({ value: d.id, label: d.full_name }))} filterOption={(i, o) => String(o?.label || '').toLowerCase().includes(i.toLowerCase())} />
            <Select allowClear showSearch placeholder="Đầu kéo" style={{ width: 150 }} value={vehicleId || undefined} onChange={(v) => setVehicleId(v || null)}
              options={vehicles.map((v) => ({ value: v.id, label: v.plate }))} filterOption={(i, o) => String(o?.label || '').toLowerCase().includes(i.toLowerCase())} />
            <Tooltip title="Tải lại"><Button icon={<ReloadOutlined />} onClick={load} loading={loading} /></Tooltip>
            <Button icon={<FileExcelOutlined />} onClick={doExport} loading={exporting} disabled={!trips.length}>Xuất Excel</Button>
            <Tooltip title={driverId ? 'Gom chuyến có chi phí + tạm ứng của tài xế này thành phiếu đề nghị thanh toán' : 'Chọn một tài xế trước'}>
              <Button type="primary" icon={<FileTextOutlined />} onClick={openPr} disabled={!driverId} style={driverId ? { background: GOLD, borderColor: GOLD, color: '#0D2E25', fontWeight: 600 } : undefined}>Lập đề nghị thanh toán</Button>
            </Tooltip>
          </Space>
        )}
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Kpi label="Chuyến" value={kpi.n} sub={`${trips.filter((t) => t.is_hired).length} thuê ngoài · ${fmtAmt(kpi.km)} km`} icon={<CarOutlined />} />
        <Kpi label="Chi được tính" value={`${fmtAmt(kpi.counted)} ₫`} sub={kpi.countedLak ? `+ ${fmtAmt(kpi.countedLak)} LAK · quy đổi ${fmtAmt(kpi.countedEq)} ₫` : 'công ty chịu'} icon={<DollarOutlined />} />
        <Kpi label="Không được tính" value={`${fmtAmt(kpi.uncounted)} ₫`} sub={kpi.uncountedLak ? `+ ${fmtAmt(kpi.uncountedLak)} LAK` : 'tài xế chịu'} tone={AMBER} />
        <Kpi label="Tạm ứng" value={`${fmtAmt(kpi.adv)} ₫`} sub={kpi.advLak ? `+ ${fmtAmt(kpi.advLak)} LAK` : 'trong tháng'} icon={<WalletOutlined />} />
        <Kpi label="Còn lại" value={`${fmtAmt(Math.abs(kpi.bal))} ₫`} sub={kpi.balLak ? `+ ${fmtAmt(kpi.balLak)} LAK` : (kpi.bal >= 0 ? 'tài xế hoàn / cấn kỳ sau' : 'chi thêm cho tài xế')} tone={kpi.bal >= 0 ? OK : RED} />
        <Kpi label="₫ / km" value={fmtAmt(kpi.perKm)} sub="chi được tính ÷ km đã ghi" />
        <Kpi label="Chờ xử lý" value={kpi.pending} sub={`${kpi.notRequested} chuyến chưa lập đề nghị${kpi.missing ? ` · ${kpi.missing} khoản thiếu chứng từ` : ''}`} tone={kpi.pending ? AMBER : OK} icon={kpi.missing ? <WarningOutlined /> : undefined} />
      </div>

      <Card styles={{ body: { paddingTop: 8 } }}>
        <Tabs activeKey={tab} onChange={setTab} items={[
          {
            key: 'driver', label: 'Theo tài xế',
            children: (
              <>
                <Table className="fleet-table" size="small" rowKey="key" pagination={false} dataSource={driverRowsForFilter} style={{ marginBottom: 16 }}
                  onRow={(r) => ({ onClick: () => setDriverId(r.driver_id), style: { cursor: r.driver_id ? 'pointer' : 'default' } })}
                  columns={[
                    { title: 'Tài xế', dataIndex: 'name', render: (v: string) => <b>{v}</b> },
                    { title: 'Chuyến có chi', dataIndex: 'trips', width: 130, align: 'right' as const },
                    { title: 'Tạm ứng', width: 140, align: 'right' as const, render: (_: unknown, r: DriverRow) => <Pair vnd={r.advVnd} lak={r.advLak} /> },
                    { title: 'Chi được tính', width: 150, align: 'right' as const, render: (_: unknown, r: DriverRow) => <Pair vnd={r.cVnd} lak={r.cLak} tone={BRAND} bold /> },
                    { title: 'Không được tính', width: 160, align: 'right' as const, render: (_: unknown, r: DriverRow) => <Pair vnd={r.uVnd} lak={r.uLak} tone={RED} /> },
                    { title: <Th main="Còn lại" sub="tạm ứng − chi được tính" />, width: 180, align: 'right' as const, render: (_: unknown, r: DriverRow) => <Pair vnd={r.balVnd} lak={r.balLak} tone={r.balVnd >= 0 ? OK : RED} bold /> },
                  ]}
                  locale={{ emptyText: 'Tháng này chưa có khoản chi hay tạm ứng nào' }} />
                <Table className="fleet-table" rowKey="dispatch_order_id" size="small" loading={loading} pagination={false} dataSource={trips} columns={tripColumns as any} scroll={{ x: 2500 }}
                  locale={{ emptyText: 'Không có lệnh điều động trong tháng (theo bộ lọc)' }}
                  summary={() => trips.length ? (
                    <Table.Summary fixed>
                      <Table.Summary.Row style={{ background: '#F9FAFB', fontWeight: 700 }}>
                        <Table.Summary.Cell index={0} colSpan={4}>TỔNG · {trips.length} lệnh</Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right"><span style={MONO}>{summaryTotals.days || ''}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={2} colSpan={3} />
                        <Table.Summary.Cell index={3} align="right"><span style={MONO}>{fmtAmt(summaryTotals.km)}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={4} colSpan={5} />
                        <Table.Summary.Cell index={5} align="right"><Pair vnd={summaryTotals.advVnd} lak={summaryTotals.advLak} /></Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="right"><Pair vnd={summaryTotals.cVnd} lak={summaryTotals.cLak} tone={BRAND} bold /></Table.Summary.Cell>
                        <Table.Summary.Cell index={7} align="right"><Pair vnd={summaryTotals.uVnd} lak={summaryTotals.uLak} tone={RED} /></Table.Summary.Cell>
                        <Table.Summary.Cell index={8} colSpan={2} />
                      </Table.Summary.Row>
                    </Table.Summary>
                  ) : null} />
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                  Tạm ứng ở dòng chuyến chỉ là phần gắn vào lệnh; đối soát chính thức là bảng trên (theo tháng, theo tài xế, gồm cả tạm ứng không gắn chuyến). Số ngày = về − đi + 1. Km = đồng hồ về − đồng hồ đi.
                </Text>
              </>
            ),
          },
          { key: 'vehicle', label: 'Theo xe', children: <Table className="fleet-table" size="small" rowKey="key" pagination={false} dataSource={byVehicle} scroll={{ x: 1500 }} columns={vehicleColumns} locale={{ emptyText: 'Không có chuyến' }} /> },
          {
            key: 'kind', label: 'Theo loại chi',
            children: (
              <Table className="fleet-table" size="small" rowKey="key" pagination={false} dataSource={byKind}
                columns={[
                  { title: 'Loại chi', dataIndex: 'label', render: (v: string) => <b>{v}</b> },
                  { title: 'Số khoản', dataIndex: 'n', width: 90, align: 'right' as const },
                  { title: <Th main="Được tính" sub="VNĐ" />, dataIndex: 'vnd', width: 140, align: 'right' as const, render: (v: number) => <span style={MONO}>{v ? fmtAmt(v) : ''}</span> },
                  { title: <Th main="Được tính" sub="LAK" />, dataIndex: 'lak', width: 140, align: 'right' as const, render: (v: number) => <span style={MONO}>{v ? fmtAmt(v) : ''}</span> },
                  { title: <Th main="Quy đổi" sub="₫" />, dataIndex: 'eq', width: 140, align: 'right' as const, render: (v: number) => <b style={MONO}>{fmtAmt(v)}</b> },
                  { title: 'Tỷ trọng', width: 100, align: 'right' as const, render: (_: unknown, r: { eq: number }) => kpi.countedEq ? `${(r.eq / kpi.countedEq * 100).toFixed(1)} %` : '' },
                  { title: <Th main="Không tính" sub="₫ · tài xế chịu" />, dataIndex: 'uncounted', width: 150, align: 'right' as const, render: (v: number) => <span style={{ ...MONO, color: RED }}>{v ? fmtAmt(v) : ''}</span> },
                ]}
                locale={{ emptyText: 'Không có khoản chi' }} />
            ),
          },
          {
            key: 'advance', label: 'Tạm ứng',
            children: (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={openAdvance}>Chi tạm ứng</Button>
                </div>
                <Table className="fleet-table" size="small" rowKey="id" pagination={false} dataSource={advances}
                  columns={[
                    { title: 'Phiếu', dataIndex: 'code', width: 120, render: (v: string) => <span style={{ ...MONO, fontWeight: 600 }}>{v}</span> },
                    { title: 'Ngày', dataIndex: 'advance_date', width: 100, render: fmtDate },
                    { title: 'Tài xế', width: 180, render: (_: unknown, a: DriverAdvance) => a.driver?.full_name || '–' },
                    { title: 'Số tiền', width: 150, align: 'right' as const, render: (_: unknown, a: DriverAdvance) => <b style={MONO}>{fmtMoney(a.amount, a.currency)}</b> },
                    { title: 'Chuyến', width: 130, render: (_: unknown, a: DriverAdvance) => a.dispatch_order ? <a style={MONO} onClick={() => navigate(`/logistics/dispatch/${a.dispatch_order!.id}`)}>{a.dispatch_order.code}</a> : <Text type="secondary">chưa gắn</Text> },
                    { title: 'Đối soát', width: 130, render: (_: unknown, a: DriverAdvance) => a.fleet_payment_request_id ? <Tag color="geekblue" style={{ margin: 0 }}>đã vào ĐNTT</Tag> : <Tag style={{ margin: 0 }}>chưa</Tag> },
                    { title: 'Người chi', dataIndex: 'paid_by_name', width: 150, render: (v: string | null) => v || '–' },
                    { title: 'Ghi chú', dataIndex: 'note', render: (v: string | null) => v || '' },
                    { title: '', width: 50, render: (_: unknown, a: DriverAdvance) => a.fleet_payment_request_id ? null : (
                      <Popconfirm title={`Xoá tạm ứng ${a.code}?`} onConfirm={async () => { try { await fleetCostService.removeAdvance(a.id); load() } catch (e: any) { message.error('Lỗi: ' + (e?.message || e)) } }} okText="Xoá" cancelText="Huỷ">
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    ) },
                  ]}
                  locale={{ emptyText: 'Chưa có tạm ứng trong tháng' }} />
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>Số dư theo tài xế xem ở tab "Theo tài xế". Tạm ứng được khấu trừ khi lập đề nghị thanh toán. Sổ này chưa nối quỹ tiền mặt.</Text>
              </>
            ),
          },
          {
            key: 'pending', label: <span>Chờ duyệt {kpi.pending ? <Tag color="gold" style={{ marginLeft: 4 }}>{kpi.pending}</Tag> : null}</span>,
            children: (
              <Table className="fleet-table" size="small" rowKey="dispatch_order_id" pagination={false} dataSource={trips.filter((t) => t.n_expenses > 0 && t.cost_status === 'open')}
                columns={[
                  { title: 'Lệnh', dataIndex: 'code', width: 130, render: (v: string, t: TripCostRow) => <a style={{ ...MONO, fontWeight: 600 }} onClick={() => navigate(`/logistics/dispatch/${t.dispatch_order_id}`)}>{v}</a> },
                  { title: 'Ngày đi', dataIndex: 'dispatch_date', width: 100, render: fmtDate },
                  { title: 'Tài xế', dataIndex: 'driver_name', width: 160, render: (v: string | null) => v || '–' },
                  { title: 'Xe', dataIndex: 'tractor_plate', width: 110, render: (v: string | null) => <span style={MONO}>{v || '–'}</span> },
                  { title: 'Số khoản', dataIndex: 'n_expenses', width: 90, align: 'right' as const },
                  { title: 'Chi được tính', width: 150, align: 'right' as const, render: (_: unknown, t: TripCostRow) => <Pair vnd={t.counted_vnd} lak={t.counted_lak} tone={BRAND} bold /> },
                  { title: 'Chứng từ', dataIndex: 'n_missing_receipt', width: 120, render: (v: number) => v ? <Tag color="orange" style={{ margin: 0 }}>thiếu {v}</Tag> : <Tag color="green" style={{ margin: 0 }}>đủ</Tag> },
                  { title: 'ĐNTT', width: 130, render: (_: unknown, t: TripCostRow) => t.payment_request_code ? <Tag color="geekblue" style={{ margin: 0, ...MONO }}>{t.payment_request_code}</Tag> : <Text type="secondary">chưa lập</Text> },
                  { title: '', render: (_: unknown, t: TripCostRow) => <Button size="small" onClick={() => navigate(`/logistics/dispatch/${t.dispatch_order_id}`)}>Mở lệnh</Button> },
                ]}
                locale={{ emptyText: 'Không có chuyến nào chờ duyệt' }} />
            ),
          },
          {
            key: 'pr', label: <span>Đề nghị thanh toán {requests.length ? <Tag style={{ marginLeft: 4 }}>{requests.length}</Tag> : null}</span>,
            children: (
              <>
                <Alert type="info" showIcon style={{ marginBottom: 10 }} message="Một phiếu = một tài xế × một kỳ: gom chuyến có chi phí + tạm ứng chưa đối soát → Gửi duyệt → Kế toán duyệt (khoá chi phí chuyến) → Đánh dấu đã chi. In A4 cùng mẫu với đề nghị thanh toán mủ." />
                <Table className="fleet-table" size="small" rowKey="id" pagination={false} dataSource={requests} columns={prColumns as any} scroll={{ x: 1200 }}
                  locale={{ emptyText: 'Chưa có đề nghị thanh toán cho kỳ này. Chọn tài xế rồi bấm "Lập đề nghị thanh toán".' }} />
              </>
            ),
          },
        ]} />
      </Card>

      {/* ── Modal: chi tạm ứng ── */}
      <Modal title="Chi tạm ứng cho tài xế" open={advOpen} onOk={saveAdvance} confirmLoading={saving} onCancel={() => setAdvOpen(false)} okText="Ghi tạm ứng" cancelText="Huỷ" destroyOnHidden>
        <Form form={advForm} layout="vertical" style={{ marginTop: 12 }} initialValues={{ currency: 'VND' }}>
          <Form.Item name="driver_id" label="Tài xế" rules={[{ required: true, message: 'Chọn tài xế' }]}>
            <Select showSearch options={drivers.map((d) => ({ value: d.id, label: d.full_name }))} filterOption={(i, o) => String(o?.label || '').toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="advance_date" label="Ngày chi" rules={[{ required: true }]} style={{ width: 160 }}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="amount" label="Số tiền" rules={[{ required: true, message: 'Nhập số tiền' }, { type: 'number', min: 1, message: 'Phải > 0' }]} style={{ flex: 1 }}><InputNumber min={0} {...thousands} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="currency" label="Đồng tiền" style={{ width: 150 }}><Segmented options={['VND', 'LAK']} /></Form.Item>
          </Space>
          {advCurrencyWatch === 'LAK' && <Form.Item name="fx_rate_vnd" label="1 LAK = ? ₫" rules={[{ required: true, message: 'Cần tỷ giá để khấu trừ khi thanh toán' }]} style={{ width: 200 }}><InputNumber min={0.0001} step={0.01} style={{ width: '100%' }} /></Form.Item>}
          <Form.Item name="dispatch_order_id" label="Gắn chuyến (tuỳ chọn)">
            <Select allowClear showSearch placeholder="Lệnh trong tháng của tài xế này"
              options={trips.filter((t) => !advDriverWatch || t.driver_id === advDriverWatch).map((t) => ({ value: t.dispatch_order_id, label: `${t.code} · ${dayjs(t.dispatch_date).format('DD/MM')} · ${t.destination || t.route_name || TRIP_TYPE_LABELS[t.trip_type as TripType] || ''}` }))}
              filterOption={(i, o) => String(o?.label || '').toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
          <Form.Item name="paid_by_name" label="Người chi tiền"><Input maxLength={100} /></Form.Item>
          <Form.Item name="note" label="Ghi chú"><Input maxLength={300} /></Form.Item>
        </Form>
      </Modal>

      {/* ── Modal: lập đề nghị thanh toán ── */}
      <Modal title={`Lập đề nghị thanh toán · ${selectedDriver?.full_name || ''} · tháng ${month.format('MM/YYYY')}`} open={prOpen} onOk={createPr} confirmLoading={saving} onCancel={() => setPrOpen(false)} okText="Tạo phiếu nháp" cancelText="Huỷ" width={900} destroyOnHidden>
        {prAvail && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0 14px' }}>
              <Kpi label="Chi được tính" value={`${fmtAmt(prTotals.exp)} ₫`} sub={`${prTrips.length}/${prAvail.trips.length} chuyến chọn`} />
              <Kpi label="Trừ tạm ứng" value={`${fmtAmt(prTotals.adv)} ₫`} sub={`${prAdvs.length}/${prAvail.advances.length} phiếu chọn`} tone={AMBER} />
              <Kpi label={prTotals.exp - prTotals.adv < 0 ? 'Tài xế nộp lại' : 'Thực chi'} value={`${fmtAmt(Math.abs(prTotals.exp - prTotals.adv))} ₫`} tone={prTotals.exp - prTotals.adv < 0 ? RED : OK} />
            </div>
            <Form form={prForm} layout="inline" style={{ marginBottom: 12 }} initialValues={{ payment_method: 'cash' }}>
              <Form.Item name="request_date" label="Ngày phiếu" rules={[{ required: true }]}><DatePicker format="DD/MM/YYYY" /></Form.Item>
              <Form.Item name="payment_method" label="Hình thức">
                <Select style={{ width: 190 }} options={(Object.keys(FLEET_PR_METHOD_LABELS) as FleetPrPaymentMethod[]).map((k) => ({ value: k, label: FLEET_PR_METHOD_LABELS[k] }))} />
              </Form.Item>
              <Form.Item name="payee_account" label="Tài khoản nhận"><Input placeholder="nếu chuyển khoản" style={{ width: 220 }} /></Form.Item>
            </Form>
            <Text strong>Chuyến có chi phí, chưa gom ({prAvail.trips.length})</Text>
            <Table className="fleet-table" size="small" rowKey="dispatch_order_id" pagination={false} dataSource={prAvail.trips} style={{ marginBottom: 12, marginTop: 6 }}
              rowSelection={{ selectedRowKeys: prTrips, onChange: (keys) => setPrTrips(keys as string[]) }}
              columns={[
                { title: 'Lệnh', dataIndex: 'code', width: 120, render: (v: string) => <span style={{ ...MONO, fontWeight: 600 }}>{v}</span> },
                { title: 'Đi – về', width: 110, render: (_: unknown, t: TripCostRow) => `${fmtD(t.dispatch_date)}${t.return_date ? ` – ${fmtD(t.return_date)}` : ''}` },
                { title: 'Hành trình', render: (_: unknown, t: TripCostRow) => t.route_name || [t.pickup_location, t.destination].filter(Boolean).join(' → ') || '–' },
                { title: 'Khoản', dataIndex: 'n_expenses', width: 70, align: 'right' as const },
                { title: 'Duyệt CP', width: 100, render: (_: unknown, t: TripCostRow) => t.cost_status === 'reviewed' ? <Tag color="green" style={{ margin: 0 }}>đã khoá</Tag> : <Tag color="gold" style={{ margin: 0 }}>chưa</Tag> },
                { title: 'Chi được tính (₫)', width: 150, align: 'right' as const, render: (_: unknown, t: TripCostRow) => <b style={MONO}>{fmtAmt(t.counted_driver_vnd_equiv)}</b> },
              ]}
              locale={{ emptyText: 'Không còn chuyến nào chưa gom trong kỳ' }} />
            <Text strong>Tạm ứng chưa đối soát ({prAvail.advances.length})</Text>
            <Table className="fleet-table" size="small" rowKey="id" pagination={false} dataSource={prAvail.advances} style={{ marginTop: 6 }}
              rowSelection={{ selectedRowKeys: prAdvs, onChange: (keys) => setPrAdvs(keys as string[]) }}
              columns={[
                { title: 'Phiếu', dataIndex: 'code', width: 120, render: (v: string) => <span style={{ ...MONO, fontWeight: 600 }}>{v}</span> },
                { title: 'Ngày', dataIndex: 'advance_date', width: 100, render: fmtDate },
                { title: 'Chuyến', dataIndex: 'dispatch_order_code', render: (v: string | null) => v ? <span style={MONO}>{v}</span> : <Text type="secondary">không gắn</Text> },
                { title: 'Số tiền', width: 160, align: 'right' as const, render: (_: unknown, a: AvailAdvance) => <span style={MONO}>{fmtMoney(a.amount, a.currency as 'VND' | 'LAK')}</span> },
                { title: 'Khấu trừ (₫)', width: 130, align: 'right' as const, render: (_: unknown, a: AvailAdvance) => <b style={{ ...MONO, color: AMBER }}>−{fmtAmt(a.amount_vnd)}</b> },
              ]}
              locale={{ emptyText: 'Không có tạm ứng chưa đối soát' }} />
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>Tạm ứng gồm cả phiếu kỳ trước chưa đối soát. Bỏ chọn phiếu nào muốn giữ sang kỳ sau. Cước thuê xe ngoài không vào phiếu của tài xế.</Text>
          </>
        )}
      </Modal>
    </div>
  )
}
