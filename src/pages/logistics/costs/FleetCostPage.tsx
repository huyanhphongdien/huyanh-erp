// ============================================================================
// FleetCostPage — Sổ chi phí đội xe (/logistics/costs)
// File: src/pages/logistics/costs/FleetCostPage.tsx
//
// Thay "Form theo dõi chi phí tài xế.xlsx": chọn tháng (+ tài xế / xe) → tab theo tài xế
// (1 dòng = 1 lệnh, đúng bố cục form, cuối bảng tạm ứng − chi được tính = còn lại), theo xe
// (₫/km), theo loại chi, sổ tạm ứng, chờ duyệt. Xuất .xlsx đúng mẫu (fleetCostExcel.ts).
// Mọi số đọc từ v_fleet_cost_trips / v_fleet_cost_month; trang chỉ cộng cột để hiển thị.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Card, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Segmented, Select, Space, Table, Tabs, Tag, Typography, message,
} from 'antd'
import type { TableProps } from 'antd'
import { DeleteOutlined, FileExcelOutlined, PlusOutlined, ReloadOutlined, LockOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useAuthStore } from '../../../stores/authStore'
import { fleetService, type FleetDriver, type FleetVehicle } from '../../../services/logistics/fleetService'
import { TRIP_TYPE_LABELS, type TripType } from '../../../services/logistics/dispatchService'
import {
  fleetCostService, EXPENSE_KIND_LABELS, HIRE_KIND_LABEL, fmtAmt, fmtMoney,
  type DriverAdvance, type ExpenseKind, type MonthCostRow, type MonthExpenseRow, type TripCostRow,
} from '../../../services/logistics/fleetCostService'
import { exportFleetCostMonth, type DriverSheet } from '../../../services/logistics/fleetCostExcel'

const { Title, Text } = Typography
const MONO: React.CSSProperties = { fontFamily: "'JetBrains Mono', Consolas, monospace", fontVariantNumeric: 'tabular-nums' }
const HIRED_LABEL = 'Xe thuê ngoài / không gắn tài xế'
const fmtD = (iso?: string | null) => (iso ? dayjs(iso).format('DD/MM') : '–')
const thousands = {
  formatter: (v: string | number | undefined) => (v === undefined || v === null || v === '' ? '' : `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')),
  parser: (v: string | undefined) => (v ? v.replace(/\./g, '') : '') as unknown as number,
}

/** Hai đồng tiền trên 2 dòng: VNĐ trên, LAK dưới (bỏ dòng 0). */
function Pair({ vnd, lak, tone }: { vnd: number; lak: number; tone?: string }) {
  if (!vnd && !lak) return <Text type="secondary">–</Text>
  return (
    <div style={{ textAlign: 'right', ...MONO, color: tone }}>
      {vnd ? <div>{fmtAmt(vnd)} ₫</div> : null}
      {lak ? <div style={{ fontSize: 12, color: '#6b7280' }}>{fmtAmt(lak)} LAK</div> : null}
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <Card size="small" style={{ minWidth: 150, flex: 1 }}>
      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: tone || '#1B4D3E', ...MONO, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#6b7280' }}>{sub}</div>}
    </Card>
  )
}

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
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [advOpen, setAdvOpen] = useState(false)
  const [advForm] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [lastLak, setLastLak] = useState<number | null>(null)

  useEffect(() => {
    fleetService.listDrivers({ active: true }).then(setDrivers).catch(() => setDrivers([]))
    fleetService.listVehicles({ kind: 'tractor', active: true }).then(setVehicles).catch(() => setVehicles([]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, m, e, a, rate] = await Promise.all([
        fleetCostService.listTrips({ ym, driverId, tractorVehicleId: vehicleId }),
        fleetCostService.listMonth(ym),
        fleetCostService.listMonthExpenses(ym),
        fleetCostService.listAdvances({ ym, driverId: driverId || undefined }),
        fleetCostService.lastLakRate(),
      ])
      setTrips(t); setMonthRows(m); setMonthExp(e); setAdvances(a); setLastLak(rate)
    } catch (err: any) {
      message.error('Lỗi tải sổ chi phí: ' + (err?.message || err))
    } finally { setLoading(false) }
  }, [ym, driverId, vehicleId])

  useEffect(() => { load() }, [load])

  // ── KPI (theo bộ lọc đang xem) ────────────────────────────────────────────
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
    return { n: trips.length, km, counted, countedLak, countedEq, perKm: km > 0 ? countedEqKm / km : 0, uncounted, uncountedLak, adv, advLak, bal, balLak, pending, missing }
  }, [trips, monthRows, driverId])

  // ── Tổng theo tài xế (pivot 2 đồng tiền) ──────────────────────────────────
  const driverSummary = useMemo(() => {
    const map = new Map<string, { key: string; driver_id: string | null; name: string; trips: number; advVnd: number; advLak: number; cVnd: number; cLak: number; uVnd: number; uLak: number; balVnd: number; balLak: number }>()
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
  type V = { key: string; plate: string; trips: number; km: number; kinds: Record<string, number>; total: number }
  const byVehicle = useMemo(() => {
    const map = new Map<string, V>()
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

  const vehicleColumns: NonNullable<TableProps<V>['columns']> = [
    { title: 'Đầu kéo', dataIndex: 'plate', render: (v: string) => <b style={MONO}>{v}</b> },
    { title: 'Chuyến', dataIndex: 'trips', width: 80, align: 'right' },
    { title: 'Km', dataIndex: 'km', width: 90, align: 'right', render: (v: number) => <span style={MONO}>{fmtAmt(v)}</span> },
    ...(['fuel', 'toll', 'port', 'loading', 'meals', 'repair', 'border', 'parking', 'other', 'hire'] as const).map((k) => ({
      title: k === 'hire' ? HIRE_KIND_LABEL : EXPENSE_KIND_LABELS[k], key: k, width: 110, align: 'right' as const,
      render: (_: unknown, r: V) => <span style={MONO}>{r.kinds[k] ? fmtAmt(r.kinds[k]) : ''}</span>,
    })),
    { title: 'Tổng ₫ (quy đổi)', dataIndex: 'total', width: 130, align: 'right', render: (v: number) => <b style={MONO}>{fmtAmt(v)}</b> },
    { title: '₫ / km', width: 90, align: 'right', render: (_: unknown, r: V) => <span style={MONO}>{r.km > 0 ? fmtAmt(r.total / r.km) : '–'}</span> },
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
    } catch (e: any) {
      message.error('Lỗi xuất Excel: ' + (e?.message || e))
    } finally { setExporting(false) }
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

  // ── Cột bảng chuyến (bố cục form) ─────────────────────────────────────────
  const tripColumns = [
    { title: 'Lệnh', dataIndex: 'code', width: 118, fixed: 'left' as const, render: (v: string, t: TripCostRow) => <a style={MONO} onClick={() => navigate(`/logistics/dispatch/${t.dispatch_order_id}`)}>{v}</a> },
    { title: 'Tài xế', dataIndex: 'driver_name', width: 140, render: (v: string | null, t: TripCostRow) => v || (t.is_hired ? <Tag color="purple">thuê ngoài</Tag> : '–') },
    { title: 'Đi', dataIndex: 'dispatch_date', width: 60, render: fmtD },
    { title: 'Về', dataIndex: 'return_date', width: 60, render: fmtD },
    { title: 'Ngày', dataIndex: 'trip_days', width: 56, align: 'right' as const, render: (v: number | null) => v ?? '–' },
    { title: 'Xe / moóc', width: 150, render: (_: unknown, t: TripCostRow) => <span style={{ fontSize: 12, ...MONO }}>{t.tractor_plate || '–'}{t.trailer_plate ? ` / ${t.trailer_plate}` : ''}</span> },
    { title: 'Km đi', dataIndex: 'odometer_start_km', width: 84, align: 'right' as const, render: (v: number | null) => <span style={MONO}>{v != null ? fmtAmt(v) : '–'}</span> },
    { title: 'Km về', dataIndex: 'odometer_end_km', width: 84, align: 'right' as const, render: (v: number | null) => <span style={MONO}>{v != null ? fmtAmt(v) : '–'}</span> },
    { title: 'Km', dataIndex: 'trip_km', width: 64, align: 'right' as const, render: (v: number | null) => <b style={MONO}>{v != null ? fmtAmt(v) : '–'}</b> },
    { title: 'Hành trình', width: 190, render: (_: unknown, t: TripCostRow) => t.route_name || [t.pickup_location, t.destination].filter(Boolean).join(' → ') || <Text type="secondary">–</Text> },
    { title: 'Chuẩn', dataIndex: 'standard_days', width: 60, align: 'right' as const, render: (v: number | null) => v ?? '–' },
    { title: 'Vượt', dataIndex: 'over_days', width: 56, align: 'right' as const, render: (v: number | null) => v ? <b style={{ color: '#b45309' }}>+{v}</b> : (v === 0 ? <span style={{ color: '#15803d' }}>0</span> : '–') },
    { title: 'Nội dung công việc', width: 190, render: (_: unknown, t: TripCostRow) => {
      // "Lý do" của lệnh thường chính là tên loại chuyến ("Xuất hàng đi cảng") → không lặp lại
      const typeLabel = TRIP_TYPE_LABELS[t.trip_type as TripType] || t.trip_type
      const reason = t.reason && t.reason.trim().toLowerCase() !== typeLabel.toLowerCase() ? t.reason.trim() : ''
      return <span style={{ fontSize: 12 }}>{[typeLabel, t.customer_name, reason].filter(Boolean).join(' · ')}</span>
    } },
    { title: 'Nội dung chi', width: 180, render: (_: unknown, t: TripCostRow) => <span style={{ fontSize: 12 }}>{[(t.kinds || '').split(',').filter(Boolean).map((k) => EXPENSE_KIND_LABELS[k as ExpenseKind] || k).join(', '), t.is_hired && t.hire_cost ? HIRE_KIND_LABEL : ''].filter(Boolean).join(', ') || '–'}</span> },
    { title: 'Tạm ứng', width: 120, align: 'right' as const, render: (_: unknown, t: TripCostRow) => <Pair vnd={t.adv_vnd} lak={t.adv_lak} /> },
    { title: 'Chi được tính', width: 130, align: 'right' as const, onCell: () => ({ style: { background: '#F0F9F4' } }), render: (_: unknown, t: TripCostRow) => <Pair vnd={t.counted_vnd} lak={t.counted_lak} tone="#1B4D3E" /> },
    { title: 'Không được tính', width: 130, align: 'right' as const, onCell: () => ({ style: { background: '#FEF2F2' } }), render: (_: unknown, t: TripCostRow) => <Pair vnd={t.uncounted_vnd} lak={t.uncounted_lak} tone="#b91c1c" /> },
    { title: 'Trạng thái', width: 120, render: (_: unknown, t: TripCostRow) => t.cost_status === 'reviewed'
      ? <Tag icon={<LockOutlined />} color="green">đã duyệt</Tag>
      : t.n_expenses > 0 ? <Tag color="gold">chờ duyệt</Tag> : <Tag>chưa nhập</Tag> },
    { title: 'Ghi chú', width: 160, render: (_: unknown, t: TripCostRow) => <span style={{ fontSize: 12 }}>{[t.n_missing_receipt ? `${t.n_missing_receipt} khoản thiếu chứng từ` : '', t.cost_note || ''].filter(Boolean).join(' · ') || ''}</span> },
  ]

  const summaryTotals = useMemo(() => ({
    days: trips.reduce((s, t) => s + (t.trip_days || 0), 0),
    km: kpi.km,
    advVnd: trips.reduce((s, t) => s + t.adv_vnd, 0), advLak: trips.reduce((s, t) => s + t.adv_lak, 0),
    cVnd: kpi.counted, cLak: kpi.countedLak, uVnd: kpi.uncounted, uLak: kpi.uncountedLak,
  }), [trips, kpi])

  const driverRowsForFilter = driverSummary.filter((r) => (driverId ? r.driver_id === driverId : true))

  return (
    <div style={{ padding: 20, maxWidth: 1680, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <Title level={3} style={{ margin: 0 }}>Sổ chi phí đội xe</Title>
        <Space wrap>
          <DatePicker picker="month" value={month} onChange={(d) => d && setMonth(d.startOf('month'))} format="MM/YYYY" allowClear={false} />
          <Select allowClear showSearch placeholder="Tài xế" style={{ width: 200 }} value={driverId || undefined} onChange={(v) => setDriverId(v || null)}
            options={drivers.map((d) => ({ value: d.id, label: d.full_name }))} filterOption={(i, o) => String(o?.label || '').toLowerCase().includes(i.toLowerCase())} />
          <Select allowClear showSearch placeholder="Đầu kéo" style={{ width: 150 }} value={vehicleId || undefined} onChange={(v) => setVehicleId(v || null)}
            options={vehicles.map((v) => ({ value: v.id, label: v.plate }))} filterOption={(i, o) => String(o?.label || '').toLowerCase().includes(i.toLowerCase())} />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
          <Button icon={<FileExcelOutlined />} onClick={doExport} loading={exporting} disabled={!trips.length} style={{ background: '#E8A838', borderColor: '#E8A838', color: '#0D2E25', fontWeight: 600 }}>Xuất Excel (đúng mẫu form)</Button>
        </Space>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <Kpi label="Chuyến" value={kpi.n} sub={`${trips.filter((t) => t.is_hired).length} thuê ngoài`} />
        <Kpi label="Km" value={fmtAmt(kpi.km)} sub="theo đồng hồ" />
        <Kpi label="Chi được tính" value={`${fmtAmt(kpi.counted)} ₫`} sub={kpi.countedLak ? `+ ${fmtAmt(kpi.countedLak)} LAK · quy đổi ${fmtAmt(kpi.countedEq)} ₫` : 'công ty chịu'} />
        <Kpi label="Không được tính" value={`${fmtAmt(kpi.uncounted)} ₫`} sub={kpi.uncountedLak ? `+ ${fmtAmt(kpi.uncountedLak)} LAK` : 'tài xế chịu'} tone="#b45309" />
        <Kpi label="Tạm ứng" value={`${fmtAmt(kpi.adv)} ₫`} sub={kpi.advLak ? `+ ${fmtAmt(kpi.advLak)} LAK` : 'trong tháng'} />
        <Kpi label="Còn lại" value={`${fmtAmt(kpi.bal)} ₫`} sub={kpi.balLak ? `+ ${fmtAmt(kpi.balLak)} LAK` : (kpi.bal >= 0 ? 'tài xế hoàn' : 'chi thêm cho tài xế')} tone={kpi.bal >= 0 ? '#15803d' : '#b91c1c'} />
        <Kpi label="₫ / km" value={fmtAmt(kpi.perKm)} sub="chi được tính ÷ km (chuyến có km)" />
        <Kpi label="Chờ duyệt" value={kpi.pending} sub={kpi.missing ? `${kpi.missing} khoản thiếu chứng từ` : 'chuyến có chi phí chưa duyệt'} tone={kpi.pending ? '#b45309' : '#15803d'} />
      </div>

      <Card>
        <Tabs activeKey={tab} onChange={setTab} items={[
          {
            key: 'driver', label: 'Theo tài xế',
            children: (
              <>
                <Table size="small" rowKey="key" pagination={false} dataSource={driverRowsForFilter} style={{ marginBottom: 16 }}
                  onRow={(r) => ({ onClick: () => setDriverId(r.driver_id), style: { cursor: r.driver_id ? 'pointer' : 'default' } })}
                  columns={[
                    { title: 'Tài xế', dataIndex: 'name', render: (v: string) => <b>{v}</b> },
                    { title: 'Chuyến có chi', dataIndex: 'trips', width: 110, align: 'right' as const },
                    { title: 'Tạm ứng', width: 140, align: 'right' as const, render: (_: unknown, r) => <Pair vnd={r.advVnd} lak={r.advLak} /> },
                    { title: 'Chi được tính', width: 140, align: 'right' as const, render: (_: unknown, r) => <Pair vnd={r.cVnd} lak={r.cLak} tone="#1B4D3E" /> },
                    { title: 'Không được tính', width: 140, align: 'right' as const, render: (_: unknown, r) => <Pair vnd={r.uVnd} lak={r.uLak} tone="#b91c1c" /> },
                    { title: 'Còn lại (tạm ứng − chi)', width: 170, align: 'right' as const, render: (_: unknown, r) => <Pair vnd={r.balVnd} lak={r.balLak} tone={r.balVnd >= 0 ? '#15803d' : '#b91c1c'} /> },
                  ]}
                  locale={{ emptyText: 'Tháng này chưa có khoản chi hay tạm ứng nào' }} />
                <Table rowKey="dispatch_order_id" size="small" loading={loading} pagination={false} dataSource={trips} columns={tripColumns as any} scroll={{ x: 2300 }}
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
                        <Table.Summary.Cell index={6} align="right"><Pair vnd={summaryTotals.cVnd} lak={summaryTotals.cLak} tone="#1B4D3E" /></Table.Summary.Cell>
                        <Table.Summary.Cell index={7} align="right"><Pair vnd={summaryTotals.uVnd} lak={summaryTotals.uLak} tone="#b91c1c" /></Table.Summary.Cell>
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
          {
            key: 'vehicle', label: 'Theo xe',
            children: (
              <Table size="small" rowKey="key" pagination={false} dataSource={byVehicle} scroll={{ x: 1100 }} columns={vehicleColumns}
                locale={{ emptyText: 'Không có chuyến' }} />
            ),
          },
          {
            key: 'kind', label: 'Theo loại chi',
            children: (
              <Table size="small" rowKey="key" pagination={false} dataSource={byKind}
                columns={[
                  { title: 'Loại chi', dataIndex: 'label', render: (v: string) => <b>{v}</b> },
                  { title: 'Số khoản', dataIndex: 'n', width: 90, align: 'right' as const },
                  { title: 'Được tính VNĐ', dataIndex: 'vnd', width: 150, align: 'right' as const, render: (v: number) => <span style={MONO}>{v ? fmtAmt(v) : ''}</span> },
                  { title: 'Được tính LAK', dataIndex: 'lak', width: 150, align: 'right' as const, render: (v: number) => <span style={MONO}>{v ? fmtAmt(v) : ''}</span> },
                  { title: 'Quy đổi ₫', dataIndex: 'eq', width: 150, align: 'right' as const, render: (v: number) => <b style={MONO}>{fmtAmt(v)}</b> },
                  { title: 'Tỷ trọng', width: 100, align: 'right' as const, render: (_: unknown, r: { eq: number }) => kpi.countedEq ? `${(r.eq / kpi.countedEq * 100).toFixed(1)} %` : '' },
                  { title: 'Không được tính (₫)', dataIndex: 'uncounted', width: 150, align: 'right' as const, render: (v: number) => <span style={{ ...MONO, color: '#b91c1c' }}>{v ? fmtAmt(v) : ''}</span> },
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
                <Table size="small" rowKey="id" pagination={false} dataSource={advances}
                  columns={[
                    { title: 'Phiếu', dataIndex: 'code', width: 120, render: (v: string) => <span style={MONO}>{v}</span> },
                    { title: 'Ngày', dataIndex: 'advance_date', width: 90, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
                    { title: 'Tài xế', width: 180, render: (_: unknown, a: DriverAdvance) => a.driver?.full_name || '–' },
                    { title: 'Số tiền', width: 150, align: 'right' as const, render: (_: unknown, a: DriverAdvance) => <b style={MONO}>{fmtMoney(a.amount, a.currency)}</b> },
                    { title: 'Chuyến', width: 130, render: (_: unknown, a: DriverAdvance) => a.dispatch_order ? <a style={MONO} onClick={() => navigate(`/logistics/dispatch/${a.dispatch_order!.id}`)}>{a.dispatch_order.code}</a> : <Text type="secondary">chưa gắn</Text> },
                    { title: 'Người chi', dataIndex: 'paid_by_name', width: 150, render: (v: string | null) => v || '–' },
                    { title: 'Ghi chú', dataIndex: 'note', render: (v: string | null) => v || '' },
                    { title: '', width: 50, render: (_: unknown, a: DriverAdvance) => (
                      <Popconfirm title={`Xoá tạm ứng ${a.code}?`} onConfirm={async () => { try { await fleetCostService.removeAdvance(a.id); load() } catch (e: any) { message.error('Lỗi: ' + (e?.message || e)) } }} okText="Xoá" cancelText="Huỷ">
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    ) },
                  ]}
                  locale={{ emptyText: 'Chưa có tạm ứng trong tháng' }} />
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>Số dư theo tài xế xem ở tab "Theo tài xế" (tạm ứng − chi được tính). Sổ này chưa nối quỹ tiền mặt.</Text>
              </>
            ),
          },
          {
            key: 'pending', label: <span>Chờ duyệt {kpi.pending ? <Tag color="gold" style={{ marginLeft: 4 }}>{kpi.pending}</Tag> : null}</span>,
            children: (
              <Table size="small" rowKey="dispatch_order_id" pagination={false} dataSource={trips.filter((t) => t.n_expenses > 0 && t.cost_status === 'open')}
                columns={[
                  { title: 'Lệnh', dataIndex: 'code', width: 130, render: (v: string, t: TripCostRow) => <a style={MONO} onClick={() => navigate(`/logistics/dispatch/${t.dispatch_order_id}`)}>{v}</a> },
                  { title: 'Ngày đi', dataIndex: 'dispatch_date', width: 90, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
                  { title: 'Tài xế', dataIndex: 'driver_name', width: 160, render: (v: string | null) => v || '–' },
                  { title: 'Xe', dataIndex: 'tractor_plate', width: 110, render: (v: string | null) => <span style={MONO}>{v || '–'}</span> },
                  { title: 'Số khoản', dataIndex: 'n_expenses', width: 90, align: 'right' as const },
                  { title: 'Chi được tính', width: 140, align: 'right' as const, render: (_: unknown, t: TripCostRow) => <Pair vnd={t.counted_vnd} lak={t.counted_lak} tone="#1B4D3E" /> },
                  { title: 'Thiếu chứng từ', dataIndex: 'n_missing_receipt', width: 120, align: 'right' as const, render: (v: number) => v ? <Tag color="orange">{v} khoản</Tag> : <Tag color="green">đủ</Tag> },
                  { title: '', render: (_: unknown, t: TripCostRow) => <Button size="small" onClick={() => navigate(`/logistics/dispatch/${t.dispatch_order_id}`)}>Mở để duyệt</Button> },
                ]}
                locale={{ emptyText: 'Không có chuyến nào chờ duyệt' }} />
            ),
          },
        ]} />
      </Card>

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
          {advCurrencyWatch === 'LAK' && <Form.Item name="fx_rate_vnd" label="1 LAK = ? ₫ (tham khảo)" style={{ width: 200 }}><InputNumber min={0.0001} step={0.01} style={{ width: '100%' }} /></Form.Item>}
          <Form.Item name="dispatch_order_id" label="Gắn chuyến (tuỳ chọn)">
            <Select allowClear showSearch placeholder="Lệnh trong tháng của tài xế này"
              options={trips.filter((t) => !advDriverWatch || t.driver_id === advDriverWatch).map((t) => ({ value: t.dispatch_order_id, label: `${t.code} · ${dayjs(t.dispatch_date).format('DD/MM')} · ${t.destination || t.route_name || TRIP_TYPE_LABELS[t.trip_type as TripType] || ''}` }))}
              filterOption={(i, o) => String(o?.label || '').toLowerCase().includes(i.toLowerCase())} />
          </Form.Item>
          <Form.Item name="paid_by_name" label="Người chi tiền"><Input maxLength={100} /></Form.Item>
          <Form.Item name="note" label="Ghi chú"><Input maxLength={300} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

