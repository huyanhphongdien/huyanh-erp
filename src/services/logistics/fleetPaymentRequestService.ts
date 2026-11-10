// ============================================================================
// FLEET PAYMENT REQUEST SERVICE — Đề nghị thanh toán chi phí xe cho tài xế (Đợt 2, 10/11/2026)
// File: src/services/logistics/fleetPaymentRequestService.ts
//
// Áp mẫu "Đề nghị thanh toán" của thanh toán mủ (paymentRequestService, TMMN-…) cho chi phí xe:
// 1 phiếu = 1 tài xế × 1 kỳ. Dòng chuyến = chi được tính của chuyến (quy đổi VNĐ, KHÔNG gồm cước
// thuê xe ngoài); dòng tạm ứng = khấu trừ (âm); tiền thực chi = net_amount. Trạng thái
// draft → submitted → approved → paid (+ cancelled) y như thanh toán mủ. Gom chuyến/tạm ứng thì
// ghi fleet_payment_request_id lên dispatch_orders / driver_advances (chặn gom hai lần);
// huỷ hoặc xoá nháp thì nhả. Duyệt phiếu → khoá chi phí các chuyến (cost_status = reviewed).
// Migration: docs/migrations/fleet_costs_p2_payment_requests.sql.
// ============================================================================

import { supabase } from '../../lib/supabase'
import { EXPENSE_KIND_LABELS, monthRange, type ExpenseKind, type TripCostRow } from './fleetCostService'

export type FleetPrStatus = 'draft' | 'submitted' | 'approved' | 'paid' | 'cancelled'
export type FleetPrLineType = 'trip' | 'advance' | 'manual'
export type FleetPrPaymentMethod = 'cash' | 'transfer_company' | 'transfer_fund'

export const FLEET_PR_STATUS_LABELS: Record<FleetPrStatus, string> = {
  draft: 'Nháp', submitted: 'Đã gửi', approved: 'Đã duyệt', paid: 'Đã chi', cancelled: 'Đã huỷ',
}
export const FLEET_PR_STATUS_COLORS: Record<FleetPrStatus, string> = {
  draft: 'default', submitted: 'gold', approved: 'blue', paid: 'green', cancelled: 'red',
}
export const FLEET_PR_METHOD_LABELS: Record<FleetPrPaymentMethod, string> = {
  cash: 'Tiền mặt', transfer_company: 'Chuyển khoản Cty', transfer_fund: 'Chuyển khoản quỹ',
}

export interface FleetPaymentRequest {
  id: string
  code: string
  request_date: string
  period_ym: string | null
  driver_id: string | null
  payee_name: string | null
  payment_method: FleetPrPaymentMethod
  payee_account: string | null
  title: string | null
  reason: string | null
  note: string | null
  status: FleetPrStatus
  total_expense: number
  total_advance: number
  net_amount: number
  line_count: number
  created_by: string | null
  submitted_at: string | null
  approved_at: string | null
  approved_by: string | null
  paid_at: string | null
  paid_by: string | null
  created_at: string
  updated_at: string
  driver?: { id: string; full_name: string; phone: string | null } | null
  created_by_name?: string | null
  approved_by_name?: string | null
  paid_by_name?: string | null
}

export interface FleetPaymentRequestLine {
  id: string
  request_id: string
  line_type: FleetPrLineType
  dispatch_order_id: string | null
  advance_id: string | null
  description: string
  unit: string | null
  qty: number
  unit_price: number | null
  amount: number
  note: string | null
  sort_order: number
  dispatch_order?: { id: string; code: string; dispatch_date: string } | null
  advance?: { id: string; code: string; advance_date: string } | null
}

export interface BuildDraftInput {
  driverId: string
  ym: string                       // 'YYYY-MM'
  /** chuyến muốn gom; bỏ trống = mọi chuyến trong kỳ có chi phí và chưa gom */
  dispatchOrderIds?: string[]
  /** tạm ứng muốn khấu trừ; bỏ trống = mọi tạm ứng chưa đối soát đến hết kỳ */
  advanceIds?: string[]
  request_date?: string
  payment_method?: FleetPrPaymentMethod
  payee_account?: string | null
  note?: string | null
}

const num = (v: unknown): number => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0)
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

const REQUEST_SELECT = '*, driver:fleet_drivers!driver_id(id, full_name, phone)'
const LINE_SELECT = '*, dispatch_order:dispatch_orders!dispatch_order_id(id, code, dispatch_date), advance:driver_advances!advance_id(id, code, advance_date)'

async function currentUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

async function namesByUid(uids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const ids = Array.from(new Set(uids.filter((x): x is string => !!x)))
  if (!ids.length) return {}
  const { data } = await supabase.from('employees').select('user_id, full_name').in('user_id', ids)
  const out: Record<string, string> = {}
  for (const r of data || []) if (r.user_id) out[r.user_id] = r.full_name
  return out
}

function normalizeRequest(row: any): FleetPaymentRequest {
  return {
    ...row,
    total_expense: num(row.total_expense), total_advance: num(row.total_advance), net_amount: num(row.net_amount), line_count: num(row.line_count),
    driver: Array.isArray(row.driver) ? row.driver[0] || null : row.driver ?? null,
  }
}
function normalizeLine(row: any): FleetPaymentRequestLine {
  return {
    ...row, qty: num(row.qty), unit_price: numOrNull(row.unit_price), amount: num(row.amount), sort_order: num(row.sort_order),
    dispatch_order: Array.isArray(row.dispatch_order) ? row.dispatch_order[0] || null : row.dispatch_order ?? null,
    advance: Array.isArray(row.advance) ? row.advance[0] || null : row.advance ?? null,
  }
}

const fmtD = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}` }
const fmtDm = (iso: string) => { const [, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}` }

/** Nội dung dòng chuyến in trên phiếu: mã lệnh · hành trình · ngày đi–về. */
export function tripLineDescription(t: TripCostRow): string {
  const route = t.route_name || [t.pickup_location, t.destination].filter(Boolean).join(' → ') || ''
  const days = t.return_date && t.return_date !== t.dispatch_date ? `${fmtDm(t.dispatch_date)}–${fmtDm(t.return_date)}` : fmtDm(t.dispatch_date)
  return `Chi phí chuyến ${t.code}${route ? ` · ${route}` : ''} (${days})`
}
/** Ghi chú dòng chuyến: các loại chi + km. */
export function tripLineNote(t: TripCostRow): string {
  const kinds = (t.kinds || '').split(',').filter(Boolean).map((k) => EXPENSE_KIND_LABELS[k as ExpenseKind] || k).join(', ')
  return [kinds, t.trip_km != null ? `${Math.round(t.trip_km).toLocaleString('vi-VN')} km` : '', t.counted_lak ? `có ${Math.round(t.counted_lak).toLocaleString('vi-VN')} LAK quy đổi` : ''].filter(Boolean).join(' · ')
}

// ============================================================================
// GOM CHUYẾN + TẠM ỨNG KHẢ DỤNG
// ============================================================================

export interface AvailableForRequest {
  trips: TripCostRow[]            // chuyến trong kỳ của tài xế, có chi phí, chưa gom
  advances: { id: string; code: string; advance_date: string; amount: number; currency: string; fx_rate_vnd: number | null; amount_vnd: number; dispatch_order_code: string | null }[]
}

async function listAvailable(driverId: string, ym: string): Promise<AvailableForRequest> {
  const r = monthRange(ym)
  const [tripRes, advRes] = await Promise.all([
    supabase.from('v_fleet_cost_trips').select('*').eq('driver_id', driverId).gte('dispatch_date', r.from).lte('dispatch_date', r.to)
      .gt('n_expenses', 0).is('fleet_payment_request_id', null).order('dispatch_date'),
    supabase.from('driver_advances').select('id, code, advance_date, amount, currency, fx_rate_vnd, dispatch_order:dispatch_orders!dispatch_order_id(code)')
      .eq('driver_id', driverId).lte('advance_date', r.to).is('fleet_payment_request_id', null).order('advance_date'),
  ])
  if (tripRes.error) throw tripRes.error
  if (advRes.error) throw advRes.error
  const trips = (tripRes.data || []).map((row: any) => ({
    ...row, counted_driver_vnd_equiv: num(row.counted_driver_vnd_equiv), counted_vnd_equiv: num(row.counted_vnd_equiv), counted_lak: num(row.counted_lak),
    trip_km: numOrNull(row.trip_km), n_expenses: num(row.n_expenses), n_missing_receipt: num(row.n_missing_receipt),
  })) as TripCostRow[]
  const advances = (advRes.data || []).map((a: any) => {
    const amount = num(a.amount); const rate = numOrNull(a.fx_rate_vnd)
    return {
      id: a.id, code: a.code, advance_date: a.advance_date, amount, currency: a.currency, fx_rate_vnd: rate,
      amount_vnd: a.currency === 'VND' ? amount : Math.round(amount * (rate || 0)),
      dispatch_order_code: (Array.isArray(a.dispatch_order) ? a.dispatch_order[0] : a.dispatch_order)?.code ?? null,
    }
  })
  return { trips, advances }
}

// ============================================================================
// TẠO NHÁP (gom) — best-effort atomic: lỗi giữa chừng → xoá header + nhả liên kết
// ============================================================================

async function buildDraft(input: BuildDraftInput): Promise<FleetPaymentRequest> {
  const avail = await listAvailable(input.driverId, input.ym)
  const trips = input.dispatchOrderIds ? avail.trips.filter((t) => input.dispatchOrderIds!.includes(t.dispatch_order_id)) : avail.trips
  const advances = input.advanceIds ? avail.advances.filter((a) => input.advanceIds!.includes(a.id)) : avail.advances
  if (!trips.length && !advances.length) throw new Error('Không có chuyến có chi phí hay tạm ứng nào chưa gom trong kỳ này')
  const lakAdvNoRate = advances.find((a) => a.currency === 'LAK' && !a.fx_rate_vnd)
  if (lakAdvNoRate) throw new Error(`Tạm ứng ${lakAdvNoRate.code} bằng LAK chưa có tỷ giá — sửa tạm ứng trước khi gom`)

  const { data: drv } = await supabase.from('fleet_drivers').select('full_name').eq('id', input.driverId).single()
  const uid = await currentUid()
  const [y, m] = input.ym.split('-')
  const { data: req, error: reqErr } = await supabase.from('fleet_payment_requests').insert({
    request_date: input.request_date || new Date().toISOString().slice(0, 10),
    period_ym: input.ym,
    driver_id: input.driverId,
    payee_name: drv?.full_name || null,
    payment_method: input.payment_method || 'cash',
    payee_account: input.payee_account ?? null,
    title: `Chi phí đội xe tháng ${m}/${y} · ${drv?.full_name || ''}`.trim(),
    reason: `Thanh toán chi phí đi đường các chuyến xe tháng ${m}/${y} của tài xế ${drv?.full_name || ''}`.trim(),
    note: input.note ?? null,
    created_by: uid,
    status: 'draft',
  }).select(REQUEST_SELECT).single()
  if (reqErr) throw reqErr

  try {
    const lines = [
      ...trips.map((t, i) => ({
        request_id: req.id, line_type: 'trip', dispatch_order_id: t.dispatch_order_id, description: tripLineDescription(t),
        unit: 'chuyến', qty: 1, unit_price: Math.round(t.counted_driver_vnd_equiv), amount: Math.round(t.counted_driver_vnd_equiv), note: tripLineNote(t), sort_order: i,
      })),
      ...advances.map((a, i) => ({
        request_id: req.id, line_type: 'advance', advance_id: a.id,
        description: `Trừ tạm ứng ${a.code} ngày ${fmtD(a.advance_date)}${a.dispatch_order_code ? ` (chuyến ${a.dispatch_order_code})` : ''}`,
        unit: 'phiếu', qty: 1, unit_price: a.amount_vnd, amount: -a.amount_vnd,
        note: a.currency === 'LAK' ? `${Math.round(a.amount).toLocaleString('vi-VN')} LAK × ${a.fx_rate_vnd}` : null, sort_order: 100 + i,
      })),
    ].filter((l) => l.amount !== 0)
    if (lines.length) {
      const { error: lErr } = await supabase.from('fleet_payment_request_lines').insert(lines)
      if (lErr) throw lErr
    }
    if (trips.length) {
      const { error } = await supabase.from('dispatch_orders').update({ fleet_payment_request_id: req.id }).in('id', trips.map((t) => t.dispatch_order_id)).is('fleet_payment_request_id', null)
      if (error) throw error
    }
    if (advances.length) {
      const { error } = await supabase.from('driver_advances').update({ fleet_payment_request_id: req.id }).in('id', advances.map((a) => a.id)).is('fleet_payment_request_id', null)
      if (error) throw error
    }
  } catch (e) {
    await releaseLinks(req.id)
    await supabase.from('fleet_payment_requests').delete().eq('id', req.id)
    throw e
  }
  const fresh = await getById(req.id)
  return fresh!.request
}

async function releaseLinks(requestId: string): Promise<void> {
  await supabase.from('dispatch_orders').update({ fleet_payment_request_id: null }).eq('fleet_payment_request_id', requestId)
  await supabase.from('driver_advances').update({ fleet_payment_request_id: null }).eq('fleet_payment_request_id', requestId)
}

// ============================================================================
// ĐỌC
// ============================================================================

async function list(params: { status?: FleetPrStatus; ym?: string; driverId?: string | null; limit?: number } = {}): Promise<FleetPaymentRequest[]> {
  let q = supabase.from('fleet_payment_requests').select(REQUEST_SELECT).order('request_date', { ascending: false }).order('code', { ascending: false }).limit(params.limit || 200)
  if (params.status) q = q.eq('status', params.status)
  if (params.ym) q = q.eq('period_ym', params.ym)
  if (params.driverId) q = q.eq('driver_id', params.driverId)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(normalizeRequest)
}

async function getById(id: string): Promise<{ request: FleetPaymentRequest; lines: FleetPaymentRequestLine[] } | null> {
  const { data, error } = await supabase.from('fleet_payment_requests').select(REQUEST_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  const { data: lines, error: lErr } = await supabase.from('fleet_payment_request_lines').select(LINE_SELECT).eq('request_id', id).order('sort_order').order('created_at')
  if (lErr) throw lErr
  const request = normalizeRequest(data)
  const names = await namesByUid([request.created_by, request.approved_by, request.paid_by])
  request.created_by_name = request.created_by ? names[request.created_by] || null : null
  request.approved_by_name = request.approved_by ? names[request.approved_by] || null : null
  request.paid_by_name = request.paid_by ? names[request.paid_by] || null : null
  return { request, lines: (lines || []).map(normalizeLine) }
}

// ============================================================================
// SỬA (chỉ khi nháp — DB cũng chặn dòng)
// ============================================================================

async function updateRequest(id: string, patch: Partial<Pick<FleetPaymentRequest, 'request_date' | 'payee_name' | 'payment_method' | 'payee_account' | 'title' | 'reason' | 'note'>>): Promise<void> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = v === '' ? null : v
  const { error } = await supabase.from('fleet_payment_requests').update(out).eq('id', id)
  if (error) throw error
}

async function addManualLine(requestId: string, input: { description: string; amount: number; unit?: string; qty?: number; note?: string | null }): Promise<void> {
  if (!(input.amount > 0)) throw new Error('Số tiền phải lớn hơn 0')
  const { error } = await supabase.from('fleet_payment_request_lines').insert({
    request_id: requestId, line_type: 'manual', description: input.description.trim(), unit: input.unit || 'khoản', qty: input.qty ?? 1,
    unit_price: input.amount, amount: input.amount, note: input.note?.trim() || null, sort_order: 50,
  })
  if (error) throw error
}

async function updateLine(lineId: string, patch: { description?: string; amount?: number; note?: string | null }): Promise<void> {
  const out: Record<string, unknown> = {}
  if (patch.description !== undefined) out.description = patch.description.trim()
  if (patch.note !== undefined) out.note = patch.note?.trim() || null
  if (patch.amount !== undefined) { out.amount = patch.amount; out.unit_price = Math.abs(patch.amount) }
  const { error } = await supabase.from('fleet_payment_request_lines').update(out).eq('id', lineId)
  if (error) throw error
}

/** Bỏ dòng khỏi phiếu nháp; chuyến / tạm ứng của dòng được nhả để gom phiếu khác. */
async function removeLine(line: FleetPaymentRequestLine): Promise<void> {
  const { error } = await supabase.from('fleet_payment_request_lines').delete().eq('id', line.id)
  if (error) throw error
  if (line.dispatch_order_id) await supabase.from('dispatch_orders').update({ fleet_payment_request_id: null }).eq('id', line.dispatch_order_id).eq('fleet_payment_request_id', line.request_id)
  if (line.advance_id) await supabase.from('driver_advances').update({ fleet_payment_request_id: null }).eq('id', line.advance_id).eq('fleet_payment_request_id', line.request_id)
}

async function remove(id: string): Promise<void> {
  const res = await getById(id)
  if (!res) return
  if (res.request.status !== 'draft') throw new Error('Chỉ xoá được phiếu Nháp (phiếu khác thì Huỷ)')
  await releaseLinks(id)
  const { error } = await supabase.from('fleet_payment_requests').delete().eq('id', id)
  if (error) throw error
}

// ============================================================================
// WORKFLOW — như thanh toán mủ
// ============================================================================

async function _setStatus(id: string, next: FleetPrStatus, from: FleetPrStatus[], extra: Record<string, unknown> = {}): Promise<FleetPaymentRequest> {
  const { data, error } = await supabase.from('fleet_payment_requests').update({ status: next, ...extra }).eq('id', id).in('status', from).select(REQUEST_SELECT).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Không chuyển được trạng thái (phiếu đã bị đổi ở nơi khác?)')
  return normalizeRequest(data)
}

async function submit(id: string): Promise<FleetPaymentRequest> {
  const res = await getById(id)
  if (!res) throw new Error('Không tìm thấy phiếu')
  if (!res.lines.length) throw new Error('Phiếu chưa có dòng nào')
  return _setStatus(id, 'submitted', ['draft'], { submitted_at: new Date().toISOString() })
}

/** Duyệt: khoá chi phí các chuyến trong phiếu (cost_status = reviewed) để số không đổi sau duyệt. */
async function approve(id: string): Promise<FleetPaymentRequest> {
  const uid = await currentUid()
  const req = await _setStatus(id, 'approved', ['submitted'], { approved_at: new Date().toISOString(), approved_by: uid })
  await supabase.from('dispatch_orders')
    .update({ cost_status: 'reviewed', cost_reviewed_by: uid, cost_reviewed_at: new Date().toISOString() })
    .eq('fleet_payment_request_id', id).eq('cost_status', 'open')
  return req
}

async function revertToDraft(id: string): Promise<FleetPaymentRequest> {
  return _setStatus(id, 'draft', ['submitted', 'approved'], { submitted_at: null, approved_at: null, approved_by: null })
}

/** Huỷ: nhả chuyến + tạm ứng để gom phiếu khác (chi phí chuyến đã khoá vẫn khoá). */
async function cancel(id: string): Promise<FleetPaymentRequest> {
  const req = await _setStatus(id, 'cancelled', ['draft', 'submitted', 'approved'])
  await releaseLinks(id)
  return req
}

async function markPaid(id: string): Promise<FleetPaymentRequest> {
  const uid = await currentUid()
  return _setStatus(id, 'paid', ['approved'], { paid_at: new Date().toISOString(), paid_by: uid })
}

export const fleetPaymentRequestService = {
  listAvailable, buildDraft, list, getById, updateRequest, addManualLine, updateLine, removeLine, remove,
  submit, approve, revertToDraft, cancel, markPaid,
}
export default fleetPaymentRequestService
