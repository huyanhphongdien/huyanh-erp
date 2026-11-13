// ============================================================================
// DispatchCostSection — khối "Hành trình & chi phí chuyến" trong chi tiết Lệnh điều động.
// File: src/pages/logistics/dispatch/DispatchCostSection.tsx
//
// HC-TH nhập sau khi xe về: ngày về, km đồng hồ, hành trình (danh mục fleet_routes hoặc gõ tay),
// từng khoản chi (VND | LAK, cờ "được tính", ảnh hoá đơn), tạm ứng gắn chuyến. Kế toán bấm
// "Duyệt & khoá" → trigger DB chặn mọi sửa/xoá khoản chi và chứng từ (mở lại mới sửa được).
// Cước thuê xe ngoài (hire_cost trên lệnh) hiện như một dòng chỉ-đọc, view đã cộng sẵn.
// Số tổng đọc từ v_fleet_cost_trips qua fleetCostService.getTripCost — không tự cộng ở đây.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AutoComplete, Button, Card, DatePicker, Descriptions, Form, Image, Input, InputNumber, Modal, Popconfirm,
  Segmented, Select, Space, Switch, Table, Tag, Tooltip, Typography, Upload, message,
} from 'antd'
import type { UploadFile } from 'antd'
import {
  CheckCircleOutlined, DeleteOutlined, EditOutlined, FilePdfOutlined, LockOutlined, PaperClipOutlined, PlusOutlined,
  TableOutlined, UnlockOutlined, UploadOutlined, WalletOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useAuthStore } from '../../../stores/authStore'
import type { DispatchOrder } from '../../../services/logistics/dispatchService'
import {
  fleetCostService, EXPENSE_KINDS, EXPENSE_KIND_LABELS, HIRE_KIND_LABEL, RECEIPT_ACCEPT, RECEIPT_MAX_BYTES, fmtAmt, fmtMoney,
  type CostCurrency, type DispatchExpense, type DispatchExpenseFile, type DriverAdvance, type ExpenseInput, type ExpenseKind,
  type FleetRoute, type TripCostRow,
  COUNTED_SUB, UNCOUNTED_LABEL, UNCOUNTED_SUB,
} from '../../../services/logistics/fleetCostService'
import { FLEET_PR_STATUS_LABELS, type FleetPrStatus } from '../../../services/logistics/fleetPaymentRequestService'
import { useNavigate } from 'react-router-dom'
import { AMBER, BRAND_DARK, GOLD, INK_2, Kpi, MONO, OK, thousands } from '../costs/fleetCostUi'

const { Text } = Typography
const toIso = (d?: Dayjs | null) => (d ? d.format('YYYY-MM-DD') : null)
const fmtD = (iso?: string | null) => (iso ? dayjs(iso).format('DD/MM/YYYY') : '–')

interface Props {
  order: DispatchOrder
}

// ── Nhập nhanh: chép cả phiếu chi của tài xế thành nhiều khoản một lần ──────
type QuickRow = { key: number; kind: ExpenseKind; description: string; amount: number | null; currency: CostCurrency; counted: boolean; reason: string }
/** Gợi ý nội dung theo loại chi — bấm chọn hoặc gõ, rút ngắn thao tác khi chép phiếu. */
const DESC_SUGGEST: Record<ExpenseKind, string[]> = {
  fuel: ['Dầu Petrolimex', 'Dầu PVOil', 'Đổ dầu dọc đường'],
  toll: ['Vé BOT', 'Phí cao tốc', 'Vé cầu đường'],
  port: ['Nâng hạ container', 'Phí cầu cảng', 'Hạ container rỗng'],
  loading: ['Bốc xếp hàng', 'Công bốc vác'],
  meals: ['Ăn ở dọc đường', 'Cơm tài xế', 'Nghỉ đêm'],
  repair: ['Vá lốp', 'Sửa xe dọc đường', 'Thay lốp'],
  border: ['Phí biên giới', 'Thủ tục hải quan', 'Phí cửa khẩu'],
  parking: ['Gửi xe qua đêm', 'Rửa xe', 'Bãi đỗ xe'],
  other: [],
}
/** Dòng mồi khi mở Nhập nhanh: phủ loại chi thường gặp của một chuyến. */
const QUICK_SEED: ExpenseKind[] = ['fuel', 'toll', 'meals', 'parking']
let quickKeySeq = 1
const emptyQuickRow = (kind: ExpenseKind = 'other'): QuickRow => ({ key: quickKeySeq++, kind, description: '', amount: null, currency: 'VND', counted: true, reason: '' })
/** Luôn chừa đúng một dòng trống ở cuối để gõ tiếp như bảng tính (không phải bấm "Thêm dòng"). */
const withTrailingBlank = (rows: QuickRow[]): QuickRow[] => {
  const last = rows[rows.length - 1]
  return !last || last.amount != null || last.description.trim() !== '' ? [...rows, emptyQuickRow()] : rows
}

type ExpenseFormValues = {
  kind: ExpenseKind
  expense_date: Dayjs
  description?: string
  amount: number
  currency: CostCurrency
  fx_rate_vnd?: number
  counted: boolean
  uncounted_reason?: string
  note?: string
}

export default function DispatchCostSection({ order }: Props) {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [trip, setTrip] = useState<TripCostRow | null>(null)
  const [expenses, setExpenses] = useState<DispatchExpense[]>([])
  const [advances, setAdvances] = useState<DriverAdvance[]>([])
  const [routes, setRoutes] = useState<FleetRoute[]>([])
  const [loading, setLoading] = useState(true)
  const [lastLak, setLastLak] = useState<number | null>(null)

  const [tripOpen, setTripOpen] = useState(false)
  const [tripForm] = Form.useForm()
  const [expOpen, setExpOpen] = useState(false)
  const [editing, setEditing] = useState<DispatchExpense | null>(null)
  const [expForm] = Form.useForm<ExpenseFormValues>()
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([])
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickRows, setQuickRows] = useState<QuickRow[]>([])
  const [quickRate, setQuickRate] = useState<number | null>(null)
  const [quickDate, setQuickDate] = useState<Dayjs | null>(null)
  const [quickFormTotal, setQuickFormTotal] = useState<number | null>(null)
  const [advOpen, setAdvOpen] = useState(false)
  const [advForm] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  const inPr = !!trip?.fleet_payment_request_id && trip?.payment_request_status !== 'cancelled'
  // Khoá sửa khi kế toán đã duyệt HOẶC chuyến đã gom vào đề nghị thanh toán (số tiền đã chép sang phiếu;
  // muốn sửa thì bỏ chuyến khỏi phiếu nháp trước). DB cũng chặn ở trigger.
  const reviewed = trip?.cost_status === 'reviewed' || inPr
  const canReview = true   // menu VẬN TẢI đã gate theo phòng; duyệt dành cho kế toán/BGĐ (chưa siết thêm ở Đợt 1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [res, rs, rate] = await Promise.all([fleetCostService.getTripCost(order.id), fleetCostService.listRoutes(), fleetCostService.lastLakRate()])
      setTrip(res.trip); setExpenses(res.expenses); setAdvances(res.advances); setRoutes(rs); setLastLak(rate)
    } catch (e: any) {
      message.error('Lỗi tải chi phí chuyến: ' + (e?.message || e))
    } finally {
      setLoading(false)
    }
  }, [order.id])

  useEffect(() => { load() }, [load])

  // ── Hành trình ────────────────────────────────────────────────────────────
  const openTrip = () => {
    tripForm.setFieldsValue({
      route_name: trip?.route_name || '',
      return_date: trip?.return_date ? dayjs(trip.return_date) : null,
      odometer_start_km: trip?.odometer_start_km ?? null,
      odometer_end_km: trip?.odometer_end_km ?? null,
      standard_days: trip?.standard_days ?? null,
    })
    setTripOpen(true)
  }
  const saveTrip = async () => {
    const v = await tripForm.validateFields()
    const route = routes.find((r) => r.name === (v.route_name || '').trim())
    setSaving(true)
    try {
      await fleetCostService.updateTripInfo(order.id, {
        route_name: (v.route_name || '').trim() || null,
        route_id: route?.id ?? null,
        return_date: toIso(v.return_date),
        odometer_start_km: v.odometer_start_km ?? null,
        odometer_end_km: v.odometer_end_km ?? null,
        standard_days: v.standard_days ?? null,
      })
      message.success('Đã lưu hành trình')
      setTripOpen(false); load()
    } catch (e: any) {
      message.error('Lỗi lưu: ' + (e?.message || e))
    } finally { setSaving(false) }
  }

  // ── Khoản chi ─────────────────────────────────────────────────────────────
  const openExpense = (x?: DispatchExpense) => {
    setEditing(x || null)
    setPendingFiles([])
    expForm.setFieldsValue(x ? {
      kind: x.kind, expense_date: dayjs(x.expense_date), description: x.description || '', amount: x.amount, currency: x.currency,
      fx_rate_vnd: x.fx_rate_vnd ?? lastLak ?? undefined, counted: x.counted, uncounted_reason: x.uncounted_reason || '', note: x.note || '',
    } : {
      kind: 'fuel', expense_date: dayjs(order.dispatch_date), description: '', amount: undefined as unknown as number, currency: 'VND',
      fx_rate_vnd: lastLak ?? undefined, counted: true, uncounted_reason: '', note: '',
    })
    setExpOpen(true)
  }
  const saveExpense = async (addMore = false) => {
    const v = await expForm.validateFields()
    const input: ExpenseInput = {
      dispatch_order_id: order.id, kind: v.kind, expense_date: toIso(v.expense_date), description: v.description, amount: v.amount,
      currency: v.currency, fx_rate_vnd: v.currency === 'LAK' ? v.fx_rate_vnd : null, counted: v.counted, uncounted_reason: v.uncounted_reason, note: v.note,
    }
    setSaving(true)
    try {
      const saved = editing ? await fleetCostService.updateExpense(editing.id, input) : await fleetCostService.addExpense(input)
      let failed = 0
      for (const f of pendingFiles) {
        const raw = f.originFileObj as File | undefined
        if (!raw) continue
        try { await fleetCostService.uploadReceipt(saved, raw, order.code) } catch { failed++ }
      }
      message.success(editing ? 'Đã sửa khoản chi' : 'Đã thêm khoản chi' + (failed ? ` (${failed} chứng từ tải lỗi)` : ''))
      if (addMore) { setEditing(null); setPendingFiles([]); expForm.setFieldsValue({ description: '', amount: undefined as unknown as number, note: '' }) }
      else setExpOpen(false)
      load()
    } catch (e: any) {
      message.error('Lỗi lưu khoản chi: ' + (e?.message || e))
    } finally { setSaving(false) }
  }
  const toggleCounted = async (x: DispatchExpense, counted: boolean) => {
    if (!counted) { openExpense({ ...x, counted: false }); return }   // tắt "được tính" → mở hộp để ghi lý do
    try { await fleetCostService.updateExpense(x.id, { counted: true }); load() }
    catch (e: any) { message.error('Lỗi: ' + (e?.message || e)) }
  }
  const deleteExpense = async (x: DispatchExpense) => {
    try { await fleetCostService.removeExpense(x); message.success('Đã xoá khoản chi'); load() }
    catch (e: any) { message.error('Lỗi xoá: ' + (e?.message || e)) }
  }
  const uploadTo = async (x: DispatchExpense, file: File) => {
    setUploadingId(x.id)
    try { await fleetCostService.uploadReceipt(x, file, order.code); load() }
    catch (e: any) { message.error('Lỗi tải chứng từ: ' + (e?.message || e)) }
    finally { setUploadingId(null) }
  }
  const deleteFile = async (f: DispatchExpenseFile) => {
    try { await fleetCostService.removeReceipt(f); load() }
    catch (e: any) { message.error('Lỗi xoá chứng từ: ' + (e?.message || e)) }
  }

  // ── Nhập nhanh ────────────────────────────────────────────────────────────
  const editQuick = (i: number, patch: Partial<QuickRow>) => setQuickRows((rs) => withTrailingBlank(rs.map((x, j) => (j === i ? { ...x, ...patch } : x))))
  const openQuick = () => {
    setQuickRows(withTrailingBlank(QUICK_SEED.map((k) => emptyQuickRow(k))))
    setQuickRate(lastLak)
    setQuickDate(dayjs(trip?.return_date || order.dispatch_date))
    setQuickFormTotal(null)
    setQuickOpen(true)
  }
  const saveQuick = async () => {
    const rows = quickRows.filter((r) => r.amount && r.amount > 0)
    if (!rows.length) { message.warning('Chưa có dòng nào có số tiền'); return }
    if (rows.some((r) => r.currency === 'LAK') && !(quickRate && quickRate > 0)) { message.warning('Có dòng LAK: nhập tỷ giá LAK → VNĐ'); return }
    setSaving(true)
    try {
      await fleetCostService.addExpenses(rows.map((r) => ({
        dispatch_order_id: order.id, kind: r.kind, description: r.description, amount: r.amount!, currency: r.currency,
        fx_rate_vnd: r.currency === 'LAK' ? quickRate : null, counted: r.counted, uncounted_reason: r.counted ? null : r.reason,
        expense_date: toIso(quickDate) || order.dispatch_date,
      })))
      message.success(`Đã lưu ${rows.length} khoản chi`)
      setQuickOpen(false); load()
    } catch (e: any) {
      message.error('Lỗi lưu: ' + (e?.message || e))
    } finally { setSaving(false) }
  }

  // ── Tạm ứng gắn chuyến ────────────────────────────────────────────────────
  const openAdvance = () => {
    advForm.setFieldsValue({ advance_date: dayjs(order.dispatch_date), amount: undefined, currency: 'VND', fx_rate_vnd: lastLak ?? undefined, paid_by_name: user?.full_name || '', note: '' })
    setAdvOpen(true)
  }
  const saveAdvance = async () => {
    const v = await advForm.validateFields()
    if (!order.driver_id) { message.error('Lệnh chưa gắn tài xế trong danh mục (xe thuê ngoài không tạm ứng qua sổ này)'); return }
    setSaving(true)
    try {
      await fleetCostService.addAdvance({ driver_id: order.driver_id, advance_date: toIso(v.advance_date), amount: v.amount, currency: v.currency, fx_rate_vnd: v.currency === 'LAK' ? v.fx_rate_vnd : null, dispatch_order_id: order.id, paid_by_name: v.paid_by_name, note: v.note })
      message.success('Đã ghi tạm ứng')
      setAdvOpen(false); load()
    } catch (e: any) {
      message.error('Lỗi ghi tạm ứng: ' + (e?.message || e))
    } finally { setSaving(false) }
  }
  const deleteAdvance = async (a: DriverAdvance) => {
    try { await fleetCostService.removeAdvance(a.id); load() }
    catch (e: any) { message.error('Lỗi xoá: ' + (e?.message || e)) }
  }

  // ── Duyệt / khoá ──────────────────────────────────────────────────────────
  const setReviewed = async (next: boolean) => {
    try {
      await fleetCostService.setCostStatus(order.id, next ? 'reviewed' : 'open')
      message.success(next ? 'Đã duyệt và khoá chi phí chuyến' : 'Đã mở lại để sửa')
      load()
    } catch (e: any) { message.error('Lỗi: ' + (e?.message || e)) }
  }

  // ── Bảng khoản chi ────────────────────────────────────────────────────────
  type Row = DispatchExpense | { id: 'hire'; hire: true }
  const rows: Row[] = useMemo(() => {
    const base: Row[] = [...expenses]
    if (order.is_hired && (order.hire_cost || 0) > 0) base.unshift({ id: 'hire', hire: true })
    return base
  }, [expenses, order.is_hired, order.hire_cost])

  const columns = [
    { title: '#', key: 'idx', width: 40, render: (_: unknown, __: Row, i: number) => i + 1 },
    { title: 'Loại chi', key: 'kind', width: 170, render: (_: unknown, r: Row) => 'hire' in r
      ? <Tag color="purple">{HIRE_KIND_LABEL}</Tag>
      : <Tag>{EXPENSE_KIND_LABELS[r.kind]}</Tag> },
    { title: 'Nội dung', key: 'desc', render: (_: unknown, r: Row) => 'hire' in r
      ? <span>{order.hire_company || 'Xe thuê ngoài'} <Text type="secondary" style={{ fontSize: 12 }}>· lấy từ lệnh (sửa ở Sửa lệnh)</Text></span>
      : <div>
          <div>{r.description || <Text type="secondary">–</Text>}</div>
          {(r.note || (!r.counted && r.uncounted_reason)) && <div style={{ fontSize: 12, color: '#6b7280' }}>{!r.counted && r.uncounted_reason ? `Chưa thông qua: ${r.uncounted_reason}` : r.note}</div>}
        </div> },
    { title: 'Ngày', key: 'date', width: 96, render: (_: unknown, r: Row) => 'hire' in r ? fmtD(order.dispatch_date) : fmtD(r.expense_date) },
    { title: 'Số tiền', key: 'amount', width: 150, align: 'right' as const, render: (_: unknown, r: Row) => 'hire' in r
      ? <b style={MONO}>{fmtMoney(order.hire_cost)}</b>
      : <div style={{ textAlign: 'right' }}>
          <b style={MONO}>{fmtMoney(r.amount, r.currency)}</b>
          {r.currency === 'LAK' && <div style={{ fontSize: 11, color: '#6b7280', ...MONO }}>≈ {fmtAmt(r.amount_vnd)} ₫ · {r.fx_rate_vnd}</div>}
        </div> },
    { title: <Tooltip title="Bật: khoản chi theo quy định, tính vào chuyến và đề nghị thanh toán. Tắt: chưa thông qua — ngoài quy định hoặc chưa có quyết định, chờ BGĐ / kế toán (không phải tài xế chịu)."><span>Được tính <QuestionCircleOutlined style={{ color: '#9ca3af' }} /></span></Tooltip>,
      key: 'counted', width: 110, align: 'center' as const, render: (_: unknown, r: Row) => 'hire' in r
      ? <Tag color="green">có</Tag>
      : <Switch size="small" checked={r.counted} disabled={reviewed} checkedChildren="có" unCheckedChildren="chờ" onChange={(v) => toggleCounted(r, v)} /> },
    { title: 'Chứng từ', key: 'files', width: 210, render: (_: unknown, r: Row) => {
      if ('hire' in r) return <Text type="secondary">–</Text>
      const imgs = r.files.filter((f) => (f.mime || '').startsWith('image/'))
      const pdfs = r.files.filter((f) => !(f.mime || '').startsWith('image/'))
      return (
        <Space size={4} wrap>
          <Image.PreviewGroup>
            {imgs.map((f) => (
              <span key={f.id} style={{ position: 'relative', display: 'inline-block' }}>
                <Image src={f.public_url} width={40} height={30} style={{ objectFit: 'cover', borderRadius: 4 }} />
                {!reviewed && <Popconfirm title="Xoá chứng từ này?" onConfirm={() => deleteFile(f)} okText="Xoá" cancelText="Huỷ">
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ position: 'absolute', top: -8, right: -10, fontSize: 10, padding: 0, height: 18, width: 18 }} />
                </Popconfirm>}
              </span>
            ))}
          </Image.PreviewGroup>
          {pdfs.map((f) => <a key={f.id} href={f.public_url} target="_blank" rel="noreferrer" title={f.file_name || 'PDF'}><FilePdfOutlined style={{ fontSize: 20, color: '#dc2626' }} /></a>)}
          {!reviewed && (
            <Upload accept={RECEIPT_ACCEPT} multiple showUploadList={false} beforeUpload={(f) => { if (f.size > RECEIPT_MAX_BYTES) { message.error('File quá 10 MB'); return Upload.LIST_IGNORE } uploadTo(r, f); return false }}>
              <Tooltip title="Tải ảnh hoá đơn / PDF"><Button size="small" icon={<UploadOutlined />} loading={uploadingId === r.id} /></Tooltip>
            </Upload>
          )}
          {r.counted && !r.files.length && <Tag color="orange" style={{ margin: 0 }}>thiếu CT</Tag>}
        </Space>
      )
    } },
    { title: 'Người nhập', key: 'by', width: 130, render: (_: unknown, r: Row) => 'hire' in r ? '' : <span style={{ fontSize: 12, color: '#6b7280' }}>{r.created_by_name || '–'}<br />{dayjs(r.created_at).format('DD/MM HH:mm')}</span> },
    { title: '', key: 'act', width: 80, render: (_: unknown, r: Row) => 'hire' in r || reviewed ? null : (
      <Space size={0}>
        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openExpense(r)} />
        <Popconfirm title="Xoá khoản chi này?" onConfirm={() => deleteExpense(r)} okText="Xoá" cancelText="Huỷ">
          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    ) },
  ]

  const tripDays = trip?.trip_days
  const overDays = trip?.over_days
  const currencyWatch = Form.useWatch('currency', expForm)
  const countedWatch = Form.useWatch('counted', expForm)
  const advCurrencyWatch = Form.useWatch('currency', advForm)
  const hasLakQuick = quickRows.some((r) => r.currency === 'LAK' && r.amount)
  // Tổng tiền đang nhập ở lưới Nhập nhanh — hiện sống để HC-TH đối chiếu với tổng trên phiếu giấy.
  const quickVnd = quickRows.reduce((s, r) => s + (r.currency === 'VND' && r.amount ? r.amount : 0), 0)
  const quickLak = quickRows.reduce((s, r) => s + (r.currency === 'LAK' && r.amount ? r.amount : 0), 0)
  const quickCount = quickRows.filter((r) => r.amount && r.amount > 0).length
  const quickEquiv = quickVnd + (quickRate && quickRate > 0 ? quickLak * quickRate : 0)
  const quickDiff = quickFormTotal != null ? Math.round(quickEquiv - quickFormTotal) : null

  return (
    <Card
      loading={loading && !trip}
      style={{ marginTop: 16 }}
      title={<Space wrap size={8}>
        <span style={{ fontWeight: 700 }}>🧾 Hành trình &amp; chi phí chuyến</span>
        {trip?.cost_status === 'reviewed'
          ? <Tag icon={<LockOutlined />} color="green" style={{ margin: 0 }}>Đã duyệt{trip?.cost_reviewed_at ? ` · ${dayjs(trip.cost_reviewed_at).format('DD/MM HH:mm')}` : ''}</Tag>
          : <Tag color={expenses.length ? 'gold' : 'default'} style={{ margin: 0 }}>{expenses.length ? 'Chờ kế toán duyệt' : 'Chưa nhập chi phí'}</Tag>}
        {trip?.payment_request_code && (
          <Tag color="geekblue" style={{ margin: 0, cursor: 'pointer', ...MONO }} onClick={() => navigate(`/logistics/costs/payment-requests/${trip.fleet_payment_request_id}`)}>
            ĐNTT {trip.payment_request_code} · {FLEET_PR_STATUS_LABELS[trip.payment_request_status as FleetPrStatus] || trip.payment_request_status}
          </Tag>
        )}
      </Space>}
      extra={<Space wrap>
        <Button icon={<EditOutlined />} onClick={openTrip} disabled={reviewed}
          style={!reviewed && !trip?.return_date ? { borderColor: GOLD, color: AMBER, fontWeight: 600 } : undefined}>
          {trip?.return_date ? 'Sửa hành trình' : 'Nhập ngày về & km'}
        </Button>
        <Button icon={<PlusOutlined />} onClick={() => openExpense()} disabled={reviewed}>Thêm một khoản</Button>
        <Button type="primary" icon={<TableOutlined />} onClick={openQuick} disabled={reviewed}>Nhập nhanh cả phiếu</Button>
      </Space>}
    >
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 5 }} style={{ marginBottom: 14 }} labelStyle={{ fontWeight: 600, fontSize: 12 }}>
        <Descriptions.Item label="Ngày đi">{fmtD(order.dispatch_date)}</Descriptions.Item>
        <Descriptions.Item label="Ngày về">{fmtD(trip?.return_date)}</Descriptions.Item>
        <Descriptions.Item label="Tổng ngày đi và về"><b>{tripDays ?? '–'}</b></Descriptions.Item>
        <Descriptions.Item label="Hành trình" span={2}>{trip?.route_name || <Text type="secondary">chưa ghi</Text>}</Descriptions.Item>
        <Descriptions.Item label="Km đồng hồ lúc đi"><span style={MONO}>{trip?.odometer_start_km != null ? fmtAmt(trip.odometer_start_km) : '–'}</span></Descriptions.Item>
        <Descriptions.Item label="Km đồng hồ lúc về"><span style={MONO}>{trip?.odometer_end_km != null ? fmtAmt(trip.odometer_end_km) : '–'}</span></Descriptions.Item>
        <Descriptions.Item label="Km chuyến"><b style={MONO}>{trip?.trip_km != null ? fmtAmt(trip.trip_km) : '–'}</b></Descriptions.Item>
        <Descriptions.Item label="Số ngày chuẩn">{trip?.standard_days ?? '–'}</Descriptions.Item>
        <Descriptions.Item label="Vượt thời gian">{overDays != null ? <b style={{ color: overDays > 0 ? AMBER : OK }}>{overDays > 0 ? `+${overDays} ngày` : 'không'}</b> : '–'}</Descriptions.Item>
      </Descriptions>

      <Table className="fleet-table" rowKey="id" size="small" pagination={false} columns={columns as any} dataSource={rows} scroll={{ x: 960 }}
        locale={{ emptyText: 'Chưa có khoản chi. Bấm "Nhập nhanh cả phiếu" để chép cả phiếu tài xế một lần, hoặc "Thêm một khoản" kèm ảnh hoá đơn.' }}
      />
      {trip && (expenses.length > 0 || (order.is_hired && order.hire_cost)) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <Kpi label="Tổng chi chuyến" value={`${fmtAmt(trip.counted_vnd_equiv + trip.uncounted_vnd_equiv)} ₫`} sub={`${expenses.length} khoản${order.is_hired && order.hire_cost ? ' + cước thuê' : ''} · quy đổi VNĐ`} tone={BRAND_DARK} />
          <Kpi label="Chi được tính" value={`${fmtAmt(trip.counted_vnd)} ₫`} sub={trip.counted_lak ? `+ ${fmtAmt(trip.counted_lak)} LAK · quy đổi tất cả ${fmtAmt(trip.counted_vnd_equiv)} ₫` : COUNTED_SUB} />
          <Kpi label={UNCOUNTED_LABEL} value={`${fmtAmt(trip.uncounted_vnd)} ₫`} sub={trip.uncounted_lak ? `+ ${fmtAmt(trip.uncounted_lak)} LAK · ${UNCOUNTED_SUB}` : UNCOUNTED_SUB} tone={trip.uncounted_vnd || trip.uncounted_lak ? AMBER : INK_2} />
          <Kpi label="Chứng từ" value={trip.n_missing_receipt ? `thiếu ${trip.n_missing_receipt}` : 'đủ'} sub={`${expenses.filter((e) => e.files.length).length}/${expenses.length} khoản có ảnh`} tone={trip.n_missing_receipt ? AMBER : OK} />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <Space wrap size={6}>
          <WalletOutlined />
          <Text strong>Tạm ứng gắn chuyến:</Text>
          {advances.length === 0 && <Text type="secondary">chưa có</Text>}
          {advances.map((a) => (
            <Tag key={a.id} closable={!reviewed} onClose={(e) => { e.preventDefault(); deleteAdvance(a) }} style={{ margin: 0 }}>
              <span style={MONO}>{a.code}</span> · {fmtD(a.advance_date)} · <b style={MONO}>{fmtMoney(a.amount, a.currency)}</b>{a.paid_by_name ? ` · ${a.paid_by_name}` : ''}
            </Tag>
          ))}
          {trip && (trip.adv_vnd > 0 || trip.adv_lak > 0) && (
            <Text type="secondary">→ còn lại sau chuyến <b style={{ ...MONO, color: trip.adv_vnd - trip.counted_vnd >= 0 ? OK : AMBER }}>
              {fmtMoney(trip.adv_vnd - trip.counted_vnd)}{trip.adv_lak || trip.counted_lak ? ` · ${fmtMoney(trip.adv_lak - trip.counted_lak, 'LAK')}` : ''}</b> (đối soát chính thức theo tháng ở Sổ chi phí)</Text>
          )}
          {!reviewed && <Button size="small" icon={<PlusOutlined />} onClick={openAdvance} disabled={!order.driver_id}>Gắn tạm ứng</Button>}
        </Space>
        {canReview && (trip?.cost_status === 'reviewed'
          ? (inPr ? <Text type="secondary" style={{ fontSize: 12 }}>Đã duyệt qua đề nghị thanh toán.</Text> : <Popconfirm title="Mở lại để sửa chi phí chuyến này?" onConfirm={() => setReviewed(false)} okText="Mở lại" cancelText="Huỷ">
              <Button icon={<UnlockOutlined />}>Mở lại</Button>
            </Popconfirm>)
          : inPr
            ? <Text type="secondary" style={{ fontSize: 12 }}>Chuyến đang nằm trong đề nghị thanh toán — duyệt ở phiếu đó.</Text>
            : <Popconfirm title={`Duyệt ${expenses.length} khoản chi và khoá chuyến này?`} description="Sau khi khoá không sửa/xoá khoản chi và chứng từ được nữa." onConfirm={() => setReviewed(true)} okText="Duyệt & khoá" cancelText="Huỷ" disabled={!expenses.length && !(order.is_hired && order.hire_cost)}>
              <Button type="primary" icon={<CheckCircleOutlined />} style={expenses.length || (order.is_hired && order.hire_cost) ? { background: GOLD, borderColor: GOLD, color: '#0D2E25', fontWeight: 600 } : undefined} disabled={!expenses.length && !(order.is_hired && order.hire_cost)}>Kế toán duyệt &amp; khoá</Button>
            </Popconfirm>)}
      </div>

      {/* ── Modal: hành trình ── */}
      <Modal title="Hành trình & km của chuyến" open={tripOpen} onOk={saveTrip} confirmLoading={saving} onCancel={() => setTripOpen(false)} okText="Lưu" cancelText="Huỷ" destroyOnHidden>
        <Form form={tripForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="route_name" label="Hành trình" extra="Chọn trong danh mục (tự điền số ngày chuẩn) hoặc gõ tay cho chuyến lạ.">
            <AutoComplete options={routes.map((r) => ({ value: r.name, label: `${r.name}${r.standard_days != null ? ` · ${r.standard_days} ngày` : ''}${r.est_km ? ` · ~${r.est_km} km` : ''}` }))}
              filterOption={(input, opt) => String(opt?.value || '').toLowerCase().includes(input.toLowerCase())}
              onSelect={(val: string) => { const r = routes.find((x) => x.name === val); if (r?.standard_days != null) tripForm.setFieldValue('standard_days', r.standard_days) }}
              placeholder="VD: Phong Điền → Cảng Tiên Sa, Đà Nẵng" />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="return_date" label="Ngày về" style={{ flex: 1 }}>
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs(order.dispatch_date), 'day')} />
            </Form.Item>
            <Form.Item name="standard_days" label="Số ngày chuẩn" style={{ width: 140 }}><InputNumber min={0} step={0.5} style={{ width: '100%' }} /></Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="odometer_start_km" label="Km đồng hồ lúc đi" style={{ flex: 1 }}><InputNumber min={0} {...thousands} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="odometer_end_km" label="Km đồng hồ lúc về" style={{ flex: 1 }}
              rules={[({ getFieldValue }) => ({ validator: (_, v) => v != null && getFieldValue('odometer_start_km') != null && v < getFieldValue('odometer_start_km') ? Promise.reject(new Error('Phải ≥ km lúc đi')) : Promise.resolve() })]}>
              <InputNumber min={0} {...thousands} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>Ngày đi lấy theo ngày điều động ({fmtD(order.dispatch_date)}). Tổng ngày = về − đi + 1. Km chuyến = về − đi.</Text>
        </Form>
      </Modal>

      {/* ── Modal: khoản chi ── */}
      <Modal title={editing ? 'Sửa khoản chi' : `Thêm khoản chi · ${order.code}`} open={expOpen} onCancel={() => setExpOpen(false)} destroyOnHidden width={620}
        footer={<Space>
          <Button onClick={() => setExpOpen(false)}>Huỷ</Button>
          {!editing && <Button onClick={() => saveExpense(true)} loading={saving}>Lưu &amp; thêm tiếp</Button>}
          <Button type="primary" onClick={() => saveExpense(false)} loading={saving}>Lưu</Button>
        </Space>}>
        <Form form={expForm} layout="vertical" style={{ marginTop: 12 }} initialValues={{ counted: true, currency: 'VND' }}>
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="kind" label="Loại chi" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={EXPENSE_KINDS.map((k) => ({ value: k, label: EXPENSE_KIND_LABELS[k] }))} />
            </Form.Item>
            <Form.Item name="expense_date" label="Ngày chi" rules={[{ required: true }]} style={{ width: 160 }}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
          </Space>
          <Form.Item name="description" label="Nội dung"><Input placeholder="VD: Petrolimex Phong Điền · 95 lít" maxLength={200} /></Form.Item>
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="amount" label="Số tiền" rules={[{ required: true, message: 'Nhập số tiền' }, { type: 'number', min: 1, message: 'Phải > 0' }]} style={{ flex: 1 }}>
              <InputNumber min={0} {...thousands} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="currency" label="Đồng tiền" style={{ width: 150 }}><Segmented options={['VND', 'LAK']} /></Form.Item>
            {currencyWatch === 'LAK' && (
              <Form.Item name="fx_rate_vnd" label="1 LAK = ? ₫" rules={[{ required: true, message: 'Nhập tỷ giá' }]} style={{ width: 130 }} extra={lastLak ? `gần nhất ${lastLak}` : undefined}>
                <InputNumber min={0.0001} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            )}
          </Space>
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="counted" label="Khoản chi theo quy định (được tính)" valuePropName="checked" style={{ width: 250 }} extra="tắt = chưa thông qua, chờ quyết định"><Switch checkedChildren="được tính" unCheckedChildren="chờ duyệt" /></Form.Item>
            {countedWatch === false && <Form.Item name="uncounted_reason" label="Vì sao chưa thông qua" rules={[{ required: true, message: 'Ghi vì sao khoản này chưa thông qua' }]} style={{ flex: 1 }}><Input maxLength={200} placeholder="ngoài danh mục quy định / chờ BGĐ, kế toán quyết định" /></Form.Item>}
          </Space>
          <Form.Item label="Ảnh hoá đơn / phiếu (nhiều ảnh, PDF được)">
            <Upload.Dragger accept={RECEIPT_ACCEPT} multiple fileList={pendingFiles} listType="picture"
              beforeUpload={(f) => { if (f.size > RECEIPT_MAX_BYTES) { message.error(`${f.name}: quá 10 MB`); return Upload.LIST_IGNORE } return false }}
              onChange={({ fileList }) => setPendingFiles(fileList)} style={{ padding: 4 }}>
              <p style={{ margin: 0 }}><PaperClipOutlined /> Kéo thả hoặc bấm để chọn. Ảnh tự nén trước khi lưu.</p>
            </Upload.Dragger>
            {editing && editing.files.length > 0 && <Text type="secondary" style={{ fontSize: 12 }}>Đã có {editing.files.length} chứng từ — xem/xoá ở bảng.</Text>}
          </Form.Item>
          <Form.Item name="note" label="Ghi chú"><Input maxLength={300} /></Form.Item>
        </Form>
      </Modal>

      {/* ── Modal: nhập nhanh ── */}
      <Modal title={`Nhập nhanh từ phiếu tài xế · ${order.code}`} open={quickOpen} onOk={saveQuick} confirmLoading={saving} onCancel={() => setQuickOpen(false)}
        okText={quickCount ? `Lưu ${quickCount} khoản · ${fmtAmt(quickEquiv)} ₫` : 'Lưu'} okButtonProps={{ disabled: !quickCount }} cancelText="Huỷ" width={880} destroyOnHidden>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text type="secondary">Mỗi dòng một khoản. Gõ xong một dòng, máy tự mở dòng trống kế tiếp. Chứng từ tải thêm ở bảng sau khi lưu.</Text>
          <Space size={6}><Text style={{ fontSize: 13 }}>Ngày chi chung</Text><DatePicker size="small" format="DD/MM/YYYY" value={quickDate} allowClear={false} onChange={(d) => setQuickDate(d)} /></Space>
        </div>
        <Table className="fleet-table" size="small" pagination={false} rowKey="key" dataSource={quickRows}
          columns={[
            { title: 'Loại chi', width: 160, render: (_: unknown, r, i) => <Select size="small" value={r.kind} style={{ width: '100%' }} options={EXPENSE_KINDS.map((k) => ({ value: k, label: EXPENSE_KIND_LABELS[k] }))} onChange={(v) => editQuick(i, { kind: v })} /> },
            { title: 'Nội dung', render: (_: unknown, r, i) => (
              <div>
                <AutoComplete size="small" style={{ width: '100%' }} value={r.description} options={DESC_SUGGEST[r.kind].map((v) => ({ value: v }))}
                  filterOption={(input, opt) => String(opt?.value || '').toLowerCase().includes(input.toLowerCase())}
                  onChange={(v) => editQuick(i, { description: v })} placeholder={EXPENSE_KIND_LABELS[r.kind]} />
                {!r.counted && <Input size="small" style={{ marginTop: 4 }} value={r.reason} onChange={(e) => editQuick(i, { reason: e.target.value })} placeholder="Vì sao chưa thông qua (tuỳ chọn)" prefix={<Tag color="orange" style={{ margin: 0 }}>chờ</Tag>} />}
              </div>
            ) },
            { title: 'Số tiền', width: 150, align: 'right' as const, render: (_: unknown, r, i) => <InputNumber size="small" min={0} {...thousands} value={r.amount ?? undefined} style={{ width: '100%' }} onChange={(v) => editQuick(i, { amount: v == null ? null : Number(v) })} onPressEnter={() => setQuickRows((rs) => withTrailingBlank(rs))} addonAfter={r.currency === 'LAK' ? 'K' : '₫'} /> },
            { title: 'Đ.tiền', width: 104, render: (_: unknown, r, i) => <Segmented size="small" value={r.currency} options={['VND', 'LAK']} onChange={(v) => editQuick(i, { currency: v as CostCurrency })} /> },
            { title: <Tooltip title="Bật = khoản chi theo quy định, tính vào chuyến. Tắt = chưa thông qua, chờ quyết định (không phải tài xế chịu)."><span>Tính <QuestionCircleOutlined style={{ color: '#9ca3af' }} /></span></Tooltip>, width: 72, align: 'center' as const, render: (_: unknown, r, i) => <Switch size="small" checked={r.counted} checkedChildren="có" unCheckedChildren="chờ" onChange={(v) => editQuick(i, { counted: v })} /> },
            { title: '', width: 40, render: (_: unknown, __, i) => <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setQuickRows((rs) => withTrailingBlank(rs.filter((_, j) => j !== i)))} /> },
          ]} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <Space wrap>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setQuickRows((rs) => [...rs, emptyQuickRow()])}>Thêm dòng</Button>
            {hasLakQuick && <Space size={4}><Text>Tỷ giá 1 LAK = </Text><InputNumber size="small" min={0.0001} step={0.01} value={quickRate ?? undefined} onChange={(v) => setQuickRate(v == null ? null : Number(v))} /><Text>₫</Text></Space>}
          </Space>
          <div style={{ background: '#f8faf9', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 14px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <span><Text type="secondary" style={{ fontSize: 12 }}>Đang nhập </Text><b style={MONO}>{quickCount}</b><Text type="secondary" style={{ fontSize: 12 }}> khoản</Text></span>
            <span><Text type="secondary" style={{ fontSize: 12 }}>Tổng </Text><b style={{ ...MONO, color: BRAND_DARK, fontSize: 15 }}>{fmtAmt(quickVnd)} ₫</b>{quickLak > 0 && <b style={{ ...MONO, color: INK_2 }}> + {fmtAmt(quickLak)} LAK</b>}</span>
            <Space size={6}><Text style={{ fontSize: 12 }}>Tổng trên phiếu</Text><InputNumber size="small" min={0} {...thousands} value={quickFormTotal ?? undefined} onChange={(v) => setQuickFormTotal(v == null ? null : Number(v))} style={{ width: 130 }} placeholder="đối chiếu" />
              {quickDiff != null && (Math.abs(quickDiff) < 1
                ? <Tag color="green" style={{ margin: 0 }}><CheckCircleOutlined /> khớp</Tag>
                : <Tag color="red" style={{ margin: 0, ...MONO }}>lệch {fmtAmt(Math.abs(quickDiff))} ₫ {quickDiff > 0 ? '(nhập dư)' : '(còn thiếu)'}</Tag>)}
            </Space>
          </div>
        </div>
      </Modal>

      {/* ── Modal: tạm ứng ── */}
      <Modal title={`Tạm ứng cho ${order.driver_name || 'tài xế'} · ${order.code}`} open={advOpen} onOk={saveAdvance} confirmLoading={saving} onCancel={() => setAdvOpen(false)} okText="Ghi tạm ứng" cancelText="Huỷ" destroyOnHidden>
        <Form form={advForm} layout="vertical" style={{ marginTop: 12 }} initialValues={{ currency: 'VND' }}>
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name="advance_date" label="Ngày chi" rules={[{ required: true }]} style={{ width: 160 }}><DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="amount" label="Số tiền" rules={[{ required: true, message: 'Nhập số tiền' }, { type: 'number', min: 1, message: 'Phải > 0' }]} style={{ flex: 1 }}><InputNumber min={0} {...thousands} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="currency" label="Đồng tiền" style={{ width: 150 }}><Segmented options={['VND', 'LAK']} /></Form.Item>
          </Space>
          {advCurrencyWatch === 'LAK' && <Form.Item name="fx_rate_vnd" label="1 LAK = ? ₫ (tham khảo)" style={{ width: 200 }}><InputNumber min={0.0001} step={0.01} style={{ width: '100%' }} /></Form.Item>}
          <Form.Item name="paid_by_name" label="Người chi tiền"><Input maxLength={100} /></Form.Item>
          <Form.Item name="note" label="Ghi chú"><Input maxLength={300} /></Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
