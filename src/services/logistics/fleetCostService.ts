// ============================================================================
// FLEET COST SERVICE — Chi phí đội xe quản lý qua Lệnh điều động (Đợt 1, 10/11/2026)
// File: src/services/logistics/fleetCostService.ts
//
// Số hoá "Form theo dõi chi phí tài xế.xlsx": 1 chuyến = 1 dispatch_orders. HC-TH nhập
// ngày về, km đồng hồ, hành trình và từng khoản chi (VND | LAK, cờ "được tính"); tạm ứng
// ghi sổ riêng; cuối tháng đối soát tạm ứng − chi được tính theo tài xế.
// Mọi con số tổng hợp đọc từ 2 view v_fleet_cost_trips / v_fleet_cost_month (SQL là nguồn
// sự thật duy nhất; trang chỉ hiển thị). Migration: docs/migrations/fleet_costs_p1.sql.
// Chưa có: lương chuyến, giá vốn vận chuyển theo đơn hàng.
// ============================================================================

import { supabase } from '../../lib/supabase'
import { compressImage } from '../../lib/imageCompress'

// ============================================================================
// TYPES & LABELS
// ============================================================================

export type ExpenseKind = 'fuel' | 'toll' | 'port' | 'loading' | 'meals' | 'repair' | 'border' | 'parking' | 'other'
export type CostCurrency = 'VND' | 'LAK'
export type CostStatus = 'open' | 'reviewed'

export const EXPENSE_KIND_LABELS: Record<ExpenseKind, string> = {
  fuel: 'Dầu',
  toll: 'Phí đường / BOT',
  port: 'Cầu cảng / nâng hạ',
  loading: 'Bốc xếp',
  meals: 'Ăn ở',
  repair: 'Sửa chữa / lốp',
  border: 'Phí biên giới, hải quan',
  parking: 'Gửi xe, rửa xe',
  other: 'Khác',
}
export const EXPENSE_KINDS = Object.keys(EXPENSE_KIND_LABELS) as ExpenseKind[]
/** Cước thuê xe ngoài: KHÔNG phải dòng chi, lấy từ dispatch_orders.hire_cost (view tự cộng). */
export const HIRE_KIND = 'hire' as const
export const HIRE_KIND_LABEL = 'Cước thuê xe ngoài'
export const COST_STATUS_LABELS: Record<CostStatus, string> = { open: 'Đang nhập', reviewed: 'Đã duyệt' }
/** Cờ `counted` của khoản chi (owner chỉnh 10/11/2026):
 *  true  = khoản chi TRONG danh mục chi phí công ty đã quy định → tính vào chuyến, vào đề nghị thanh toán.
 *  false = CHƯA THÔNG QUA — ngoài quy định hoặc chưa có quyết định, chờ BGĐ / kế toán; KHÔNG có nghĩa tài xế chịu.
 *  Đừng viết lại chữ "tài xế chịu" ở màn nào. */
export const COUNTED_LABEL = 'Được tính'
export const COUNTED_SUB = 'theo quy định'
export const UNCOUNTED_LABEL = 'Chưa thông qua'
export const UNCOUNTED_SUB = 'ngoài quy định · chờ quyết định'

/** Thư mục trong bucket invoice-images (bucket đã có policy authenticated insert/delete, public read). */
const RECEIPT_BUCKET = 'invoice-images'
const RECEIPT_PREFIX = 'fleet-receipts'
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024
export const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,application/pdf'

export interface FleetRoute {
  id: string
  name: string
  origin: string | null
  destination: string | null
  est_km: number | null
  standard_days: number | null
  note: string | null
  active: boolean
}

export interface DispatchExpenseFile {
  id: string
  expense_id: string
  storage_path: string
  public_url: string
  file_name: string | null
  mime: string | null
  size_bytes: number | null
  uploaded_by: string | null
  created_at: string
}

export interface DispatchExpense {
  id: string
  dispatch_order_id: string
  driver_id: string | null
  expense_date: string
  kind: ExpenseKind
  description: string | null
  amount: number
  currency: CostCurrency
  fx_rate_vnd: number | null
  amount_vnd: number
  counted: boolean
  uncounted_reason: string | null
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  files: DispatchExpenseFile[]
  /** tên người nhập (tra từ employees.user_id) */
  created_by_name?: string | null
}

export interface DriverAdvance {
  id: string
  code: string
  driver_id: string
  advance_date: string
  amount: number
  currency: CostCurrency
  fx_rate_vnd: number | null
  dispatch_order_id: string | null
  paid_by_name: string | null
  note: string | null
  created_by: string | null
  created_at: string
  /** Đợt 2: tạm ứng đã khấu trừ ở đề nghị thanh toán nào (null = chưa đối soát) */
  fleet_payment_request_id?: string | null
  driver?: { id: string; full_name: string } | null
  dispatch_order?: { id: string; code: string; dispatch_date: string } | null
}

/** 1 dòng của v_fleet_cost_trips = 1 lệnh (đã loại lệnh huỷ). */
export interface TripCostRow {
  dispatch_order_id: string
  code: string
  dispatch_date: string
  return_date: string | null
  ym: string
  trip_type: string
  status: string
  driver_id: string | null
  driver_name: string | null
  tractor_vehicle_id: string | null
  tractor_plate: string | null
  trailer_plate: string | null
  is_hired: boolean
  hire_company: string | null
  hire_cost: number | null
  customer_name: string | null
  destination: string | null
  pickup_location: string | null
  reason: string | null
  total_weight: number
  route_name: string | null
  standard_days: number | null
  odometer_start_km: number | null
  odometer_end_km: number | null
  trip_km: number | null
  trip_days: number | null
  over_days: number | null
  cost_status: CostStatus
  cost_reviewed_by: string | null
  cost_reviewed_at: string | null
  cost_note: string | null
  counted_vnd: number
  counted_lak: number
  uncounted_vnd: number
  uncounted_lak: number
  counted_vnd_equiv: number
  uncounted_vnd_equiv: number
  n_expenses: number
  n_missing_receipt: number
  kinds: string | null
  adv_vnd: number
  adv_lak: number
  /** Đợt 2: phần TÀI XẾ được thanh toán (quy đổi VNĐ, KHÔNG gồm cước thuê xe ngoài) */
  counted_driver_vnd_equiv: number
  /** Đợt 2: chuyến đã gom vào đề nghị thanh toán nào */
  fleet_payment_request_id: string | null
  payment_request_code: string | null
  payment_request_status: string | null
}

/** 1 dòng của v_fleet_cost_month = tài xế × tháng × đồng tiền. driver_id null = xe thuê ngoài / lệnh không gắn tài xế. */
export interface MonthCostRow {
  driver_id: string | null
  driver_name: string | null
  ym: string
  currency: CostCurrency
  counted: number
  uncounted: number
  advanced: number
  balance: number
  n_trips_with_cost: number
}

/** Khoản chi kèm thông tin lệnh — cho tab theo xe / theo loại chi. */
export interface MonthExpenseRow {
  id: string
  dispatch_order_id: string
  kind: ExpenseKind
  amount: number
  currency: CostCurrency
  amount_vnd: number
  counted: boolean
  expense_date: string
  order: { code: string; dispatch_date: string; driver_id: string | null; driver_name: string | null; tractor_vehicle_id: string | null; tractor_plate: string | null; is_hired: boolean }
}

export interface TripInfoInput {
  return_date?: string | null
  odometer_start_km?: number | null
  odometer_end_km?: number | null
  route_id?: string | null
  route_name?: string | null
  standard_days?: number | null
}

export interface ExpenseInput {
  dispatch_order_id: string
  expense_date?: string | null
  kind: ExpenseKind
  description?: string | null
  amount: number
  currency?: CostCurrency
  fx_rate_vnd?: number | null
  counted?: boolean
  uncounted_reason?: string | null
  note?: string | null
}

export interface AdvanceInput {
  driver_id: string
  advance_date?: string | null
  amount: number
  currency?: CostCurrency
  fx_rate_vnd?: number | null
  dispatch_order_id?: string | null
  paid_by_name?: string | null
  note?: string | null
}

// ============================================================================
// HELPERS
// ============================================================================

const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0)
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

/** "1.234.567" — tiền không lẻ (cả VNĐ lẫn LAK). */
export const fmtAmt = (v: number | null | undefined): string => (v == null ? '' : Math.round(v).toLocaleString('vi-VN'))
export const fmtMoney = (v: number | null | undefined, cur: CostCurrency = 'VND'): string => {
  if (v == null) return ''
  return cur === 'VND' ? `${fmtAmt(v)} ₫` : `${fmtAmt(v)} LAK`
}
/** Tháng "YYYY-MM" → khoảng ngày [from, to] */
export const monthRange = (ym: string): { from: string; to: string } => {
  const [y, m] = ym.split('-').map(Number)
  const from = `${ym}-01`
  const last = new Date(y, m, 0).getDate()
  return { from, to: `${ym}-${String(last).padStart(2, '0')}` }
}
export const ymOf = (iso: string): string => iso.slice(0, 7)

async function currentUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

function normalizeExpense(row: any): DispatchExpense {
  return {
    ...row,
    amount: num(row.amount),
    fx_rate_vnd: numOrNull(row.fx_rate_vnd),
    amount_vnd: num(row.amount_vnd),
    counted: !!row.counted,
    files: Array.isArray(row.files) ? row.files.map((f: any) => ({ ...f, size_bytes: numOrNull(f.size_bytes) })) : [],
  }
}

function normalizeAdvance(row: any): DriverAdvance {
  return {
    ...row,
    amount: num(row.amount),
    fx_rate_vnd: numOrNull(row.fx_rate_vnd),
    driver: Array.isArray(row.driver) ? row.driver[0] || null : row.driver ?? null,
    dispatch_order: Array.isArray(row.dispatch_order) ? row.dispatch_order[0] || null : row.dispatch_order ?? null,
  }
}

function normalizeTrip(row: any): TripCostRow {
  const n = (k: string) => num(row[k])
  return {
    ...row,
    is_hired: !!row.is_hired,
    hire_cost: numOrNull(row.hire_cost),
    total_weight: n('total_weight'),
    standard_days: numOrNull(row.standard_days),
    odometer_start_km: numOrNull(row.odometer_start_km),
    odometer_end_km: numOrNull(row.odometer_end_km),
    trip_km: numOrNull(row.trip_km),
    trip_days: numOrNull(row.trip_days),
    over_days: numOrNull(row.over_days),
    counted_vnd: n('counted_vnd'), counted_lak: n('counted_lak'),
    uncounted_vnd: n('uncounted_vnd'), uncounted_lak: n('uncounted_lak'),
    counted_vnd_equiv: n('counted_vnd_equiv'), uncounted_vnd_equiv: n('uncounted_vnd_equiv'),
    n_expenses: n('n_expenses'), n_missing_receipt: n('n_missing_receipt'),
    adv_vnd: n('adv_vnd'), adv_lak: n('adv_lak'),
    counted_driver_vnd_equiv: n('counted_driver_vnd_equiv'),
    fleet_payment_request_id: row.fleet_payment_request_id ?? null,
    payment_request_code: row.payment_request_code ?? null,
    payment_request_status: row.payment_request_status ?? null,
  }
}

/** Tên người theo auth uid (employees.user_id) — cho cột "người nhập". */
async function namesByUid(uids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(uids.filter((x): x is string => !!x)))
  if (!ids.length) return {}
  const { data } = await supabase.from('employees').select('user_id, full_name').in('user_id', ids)
  const out: Record<string, string> = {}
  for (const r of data || []) if (r.user_id) out[r.user_id] = r.full_name
  return out
}

// ============================================================================
// HÀNH TRÌNH
// ============================================================================

async function listRoutes(activeOnly = true): Promise<FleetRoute[]> {
  let q = supabase.from('fleet_routes').select('*').order('name')
  if (activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map((r: any) => ({ ...r, est_km: numOrNull(r.est_km), standard_days: numOrNull(r.standard_days) }))
}

async function saveRoute(input: Partial<FleetRoute> & { name: string }): Promise<FleetRoute> {
  const row = {
    name: input.name.trim(), origin: input.origin ?? null, destination: input.destination ?? null,
    est_km: input.est_km ?? null, standard_days: input.standard_days ?? null, note: input.note ?? null,
    active: input.active ?? true, updated_at: new Date().toISOString(),
  }
  const q = input.id
    ? supabase.from('fleet_routes').update(row).eq('id', input.id)
    : supabase.from('fleet_routes').insert(row)
  const { data, error } = await q.select('*').single()
  if (error) throw error
  return data as FleetRoute
}

// ============================================================================
// CHUYẾN: thông tin hành trình + khoản chi + tạm ứng của một lệnh
// ============================================================================

const EXPENSE_SELECT = '*, files:dispatch_expense_files(*)'

async function getTripCost(orderId: string): Promise<{ trip: TripCostRow | null; expenses: DispatchExpense[]; advances: DriverAdvance[] }> {
  const [tripRes, expRes, advRes] = await Promise.all([
    supabase.from('v_fleet_cost_trips').select('*').eq('dispatch_order_id', orderId).maybeSingle(),
    supabase.from('dispatch_expenses').select(EXPENSE_SELECT).eq('dispatch_order_id', orderId).order('expense_date').order('created_at'),
    supabase.from('driver_advances').select('*, driver:fleet_drivers!driver_id(id, full_name)').eq('dispatch_order_id', orderId).order('advance_date'),
  ])
  if (tripRes.error) throw tripRes.error
  if (expRes.error) throw expRes.error
  if (advRes.error) throw advRes.error
  const expenses = (expRes.data || []).map(normalizeExpense)
  const names = await namesByUid(expenses.map((e) => e.created_by))
  for (const e of expenses) e.created_by_name = e.created_by ? names[e.created_by] || null : null
  return {
    trip: tripRes.data ? normalizeTrip(tripRes.data) : null,
    expenses,
    advances: (advRes.data || []).map(normalizeAdvance),
  }
}

/** Ngày về / km đồng hồ / hành trình / số ngày chuẩn. Chỉ set key có mặt. */
async function updateTripInfo(orderId: string, input: TripInfoInput): Promise<void> {
  const out: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const keys: (keyof TripInfoInput)[] = ['return_date', 'odometer_start_km', 'odometer_end_km', 'route_id', 'route_name', 'standard_days']
  for (const k of keys) if (input[k] !== undefined) out[k] = input[k] === '' ? null : input[k]
  if (out.odometer_start_km != null && out.odometer_end_km != null && Number(out.odometer_end_km) < Number(out.odometer_start_km)) {
    throw new Error('Km đồng hồ lúc về phải lớn hơn hoặc bằng lúc đi')
  }
  const { error } = await supabase.from('dispatch_orders').update(out).eq('id', orderId)
  if (error) throw error
}

// ============================================================================
// KHOẢN CHI
// ============================================================================

function expenseRow(input: ExpenseInput, uid: string | null) {
  const currency: CostCurrency = input.currency || 'VND'
  if (!(input.amount > 0)) throw new Error('Số tiền phải lớn hơn 0')
  if (currency === 'LAK' && !(Number(input.fx_rate_vnd) > 0)) throw new Error('Khoản chi bằng LAK cần tỷ giá LAK → VNĐ')
  return {
    dispatch_order_id: input.dispatch_order_id,
    expense_date: input.expense_date || new Date().toISOString().slice(0, 10),
    kind: input.kind,
    description: input.description?.trim() || null,
    amount: input.amount,
    currency,
    fx_rate_vnd: currency === 'LAK' ? input.fx_rate_vnd : null,
    counted: input.counted ?? true,
    uncounted_reason: input.counted === false ? (input.uncounted_reason?.trim() || null) : null,
    note: input.note?.trim() || null,
    created_by: uid,
  }
}

async function addExpense(input: ExpenseInput): Promise<DispatchExpense> {
  const uid = await currentUid()
  const { data, error } = await supabase.from('dispatch_expenses').insert(expenseRow(input, uid)).select(EXPENSE_SELECT).single()
  if (error) throw error
  return normalizeExpense(data)
}

/** Nhập nhanh nhiều khoản một lần (lưới từ phiếu giấy). */
async function addExpenses(inputs: ExpenseInput[]): Promise<DispatchExpense[]> {
  if (!inputs.length) return []
  const uid = await currentUid()
  const rows = inputs.map((i) => expenseRow(i, uid))
  const { data, error } = await supabase.from('dispatch_expenses').insert(rows).select(EXPENSE_SELECT)
  if (error) throw error
  return (data || []).map(normalizeExpense)
}

async function updateExpense(id: string, patch: Partial<ExpenseInput>): Promise<DispatchExpense> {
  const out: Record<string, unknown> = {}
  const keys: (keyof ExpenseInput)[] = ['expense_date', 'kind', 'description', 'amount', 'currency', 'fx_rate_vnd', 'counted', 'uncounted_reason', 'note']
  for (const k of keys) if (patch[k] !== undefined) out[k] = patch[k] === '' ? null : patch[k]
  if (out.amount !== undefined && !(Number(out.amount) > 0)) throw new Error('Số tiền phải lớn hơn 0')
  if (out.currency === 'LAK' && out.fx_rate_vnd !== undefined && !(Number(out.fx_rate_vnd) > 0)) throw new Error('Khoản chi bằng LAK cần tỷ giá LAK → VNĐ')
  const { data, error } = await supabase.from('dispatch_expenses').update(out).eq('id', id).select(EXPENSE_SELECT).single()
  if (error) throw error
  return normalizeExpense(data)
}

async function removeExpense(expense: DispatchExpense): Promise<void> {
  // Xoá dòng DB TRƯỚC: nếu lệnh đã duyệt, trigger chặn ở đây và ảnh vẫn còn nguyên.
  // DB cascade chỉ xoá dòng dispatch_expense_files, object trong storage phải xoá tay sau.
  const paths = expense.files.map((f) => f.storage_path)
  const { error } = await supabase.from('dispatch_expenses').delete().eq('id', expense.id)
  if (error) throw error
  if (paths.length) await supabase.storage.from(RECEIPT_BUCKET).remove(paths)
}

// ============================================================================
// CHỨNG TỪ (ảnh hoá đơn / phiếu)
// ============================================================================

const safeName = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80)

async function uploadReceipt(expense: { id: string; dispatch_order_id: string }, file: File, orderCode?: string | null): Promise<DispatchExpenseFile> {
  if (file.size > RECEIPT_MAX_BYTES) throw new Error('File quá 10 MB')
  const isPdf = file.type === 'application/pdf'
  const blob = isPdf ? file : await compressImage(file, { maxDim: 1800, quality: 0.75 })
  const ext = isPdf ? 'pdf' : 'jpg'
  const path = `${RECEIPT_PREFIX}/${orderCode || expense.dispatch_order_id}/${expense.id}/${Date.now()}-${safeName(file.name.replace(/\.[^.]+$/, ''))}.${ext}`
  const { error: upErr } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, blob, { contentType: isPdf ? 'application/pdf' : (blob.type || 'image/jpeg'), upsert: false })
  if (upErr) throw new Error(`Tải chứng từ lên thất bại: ${upErr.message}`)
  const publicUrl = supabase.storage.from(RECEIPT_BUCKET).getPublicUrl(path).data.publicUrl
  const uid = await currentUid()
  const { data, error } = await supabase.from('dispatch_expense_files').insert({
    expense_id: expense.id, storage_path: path, public_url: publicUrl, file_name: file.name,
    mime: isPdf ? 'application/pdf' : (blob.type || 'image/jpeg'), size_bytes: blob.size, uploaded_by: uid,
  }).select('*').single()
  if (error) {
    await supabase.storage.from(RECEIPT_BUCKET).remove([path])
    throw error
  }
  return data as DispatchExpenseFile
}

async function removeReceipt(file: DispatchExpenseFile): Promise<void> {
  const { error } = await supabase.from('dispatch_expense_files').delete().eq('id', file.id)
  if (error) throw error   // trigger khoá sẽ chặn ở đây nếu lệnh đã duyệt → object vẫn còn
  await supabase.storage.from(RECEIPT_BUCKET).remove([file.storage_path])
}

// ============================================================================
// DUYỆT / KHOÁ
// ============================================================================

async function setCostStatus(orderId: string, status: CostStatus, note?: string | null): Promise<void> {
  const uid = await currentUid()
  const { error } = await supabase.from('dispatch_orders').update({
    cost_status: status,
    cost_reviewed_by: status === 'reviewed' ? uid : null,
    cost_reviewed_at: status === 'reviewed' ? new Date().toISOString() : null,
    ...(note !== undefined ? { cost_note: note } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', orderId)
  if (error) throw error
}

// ============================================================================
// TẠM ỨNG
// ============================================================================

const ADVANCE_SELECT = '*, driver:fleet_drivers!driver_id(id, full_name), dispatch_order:dispatch_orders!dispatch_order_id(id, code, dispatch_date)'

async function listAdvances(params: { ym?: string; driverId?: string } = {}): Promise<DriverAdvance[]> {
  let q = supabase.from('driver_advances').select(ADVANCE_SELECT).order('advance_date', { ascending: false }).order('created_at', { ascending: false })
  if (params.ym) { const r = monthRange(params.ym); q = q.gte('advance_date', r.from).lte('advance_date', r.to) }
  if (params.driverId) q = q.eq('driver_id', params.driverId)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(normalizeAdvance)
}

async function addAdvance(input: AdvanceInput): Promise<DriverAdvance> {
  if (!(input.amount > 0)) throw new Error('Số tiền tạm ứng phải lớn hơn 0')
  const currency: CostCurrency = input.currency || 'VND'
  const uid = await currentUid()
  const { data, error } = await supabase.from('driver_advances').insert({
    driver_id: input.driver_id,
    advance_date: input.advance_date || new Date().toISOString().slice(0, 10),
    amount: input.amount, currency,
    fx_rate_vnd: currency === 'LAK' ? (input.fx_rate_vnd ?? null) : null,
    dispatch_order_id: input.dispatch_order_id ?? null,
    paid_by_name: input.paid_by_name?.trim() || null,
    note: input.note?.trim() || null,
    created_by: uid,
  }).select(ADVANCE_SELECT).single()
  if (error) throw error
  return normalizeAdvance(data)
}

async function removeAdvance(id: string): Promise<void> {
  const { error } = await supabase.from('driver_advances').delete().eq('id', id)
  if (error) throw error
}

// ============================================================================
// SỔ THÁNG (trang /logistics/costs)
// ============================================================================

async function listTrips(params: { ym: string; driverId?: string | null; tractorVehicleId?: string | null; costStatus?: CostStatus | null; onlyWithCost?: boolean }): Promise<TripCostRow[]> {
  const r = monthRange(params.ym)
  let q = supabase.from('v_fleet_cost_trips').select('*').gte('dispatch_date', r.from).lte('dispatch_date', r.to)
    .order('dispatch_date').order('code')
  if (params.driverId) q = q.eq('driver_id', params.driverId)
  if (params.tractorVehicleId) q = q.eq('tractor_vehicle_id', params.tractorVehicleId)
  if (params.costStatus) q = q.eq('cost_status', params.costStatus)
  if (params.onlyWithCost) q = q.gt('n_expenses', 0)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(normalizeTrip)
}

async function listMonth(ym: string): Promise<MonthCostRow[]> {
  const { data, error } = await supabase.from('v_fleet_cost_month').select('*').eq('ym', ym).order('driver_name')
  if (error) throw error
  return (data || []).map((r: any) => ({
    ...r, counted: num(r.counted), uncounted: num(r.uncounted), advanced: num(r.advanced), balance: num(r.balance), n_trips_with_cost: num(r.n_trips_with_cost),
  }))
}

/** Khoản chi của tháng (theo ngày đi của lệnh) kèm xe/tài xế — tab theo xe, theo loại chi. */
async function listMonthExpenses(ym: string): Promise<MonthExpenseRow[]> {
  // Tháng tính theo NGÀY ĐI của lệnh (như form). Lấy id lệnh trong tháng từ view (đã loại lệnh huỷ)
  // rồi .in() — tránh filter trên bảng lồng của PostgREST (cú pháp dễ sai, khó đọc).
  const r = monthRange(ym)
  const { data: orders, error: oErr } = await supabase.from('v_fleet_cost_trips')
    .select('dispatch_order_id, code, dispatch_date, driver_id, driver_name, tractor_vehicle_id, tractor_plate, is_hired')
    .gte('dispatch_date', r.from).lte('dispatch_date', r.to)
  if (oErr) throw oErr
  const byId = new Map<string, MonthExpenseRow['order']>()
  for (const o of orders || []) byId.set(o.dispatch_order_id, { code: o.code, dispatch_date: o.dispatch_date, driver_id: o.driver_id, driver_name: o.driver_name, tractor_vehicle_id: o.tractor_vehicle_id, tractor_plate: o.tractor_plate, is_hired: !!o.is_hired })
  const ids = Array.from(byId.keys())
  if (!ids.length) return []
  const out: MonthExpenseRow[] = []
  for (let i = 0; i < ids.length; i += 100) {   // chia lô 100 id để URL không quá dài
    const { data, error } = await supabase.from('dispatch_expenses')
      .select('id, dispatch_order_id, kind, amount, currency, amount_vnd, counted, expense_date')
      .in('dispatch_order_id', ids.slice(i, i + 100))
    if (error) throw error
    for (const x of data || []) {
      const order = byId.get(x.dispatch_order_id)
      if (order) out.push({ ...x, amount: num(x.amount), amount_vnd: num(x.amount_vnd), counted: !!x.counted, order })
    }
  }
  return out
}

/** Tỷ giá LAK → VNĐ dùng gần nhất (điền sẵn ô tỷ giá). */
async function lastLakRate(): Promise<number | null> {
  const { data } = await supabase.from('dispatch_expenses').select('fx_rate_vnd').eq('currency', 'LAK').not('fx_rate_vnd', 'is', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (data?.fx_rate_vnd) return Number(data.fx_rate_vnd)
  const { data: a } = await supabase.from('driver_advances').select('fx_rate_vnd').eq('currency', 'LAK').not('fx_rate_vnd', 'is', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return a?.fx_rate_vnd ? Number(a.fx_rate_vnd) : null
}

export const fleetCostService = {
  listRoutes, saveRoute,
  getTripCost, updateTripInfo,
  addExpense, addExpenses, updateExpense, removeExpense,
  uploadReceipt, removeReceipt,
  setCostStatus,
  listAdvances, addAdvance, removeAdvance,
  listTrips, listMonth, listMonthExpenses, lastLakRate,
}

export default fleetCostService
