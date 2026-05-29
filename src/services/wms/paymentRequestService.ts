// ============================================================================
// FILE: src/services/wms/paymentRequestService.ts
// MODULE: WMS / Nhập kho mủ — Đề nghị thanh toán (Payment Request) — ĐỢT 1
// MÔ TẢ: Gom phiếu cân (weighbridge_tickets) → 1 đề nghị thanh toán nhiều dòng,
//         CRUD phiếu + dòng, sinh mã TMMN-YYMM-seq.
// QUYẾT ĐỊNH: PA1 — đề nghị thanh toán là cửa chi tiền duy nhất (cả deal lẫn lẻ).
// BẢNG: payment_requests, payment_request_lines, weighbridge_tickets.payment_request_id
// ============================================================================

import { supabase } from '../../lib/supabase'

export type PaymentRequestStatus = 'draft' | 'submitted' | 'approved' | 'paid' | 'cancelled'
export type PaymentLineSource = 'deal' | 'supplier' | 'manual'
export type PaymentCurrency = 'VND' | 'KIP' | 'THB'

export interface PaymentRequest {
  id: string
  code: string
  facility_id: string | null
  request_date: string
  rubber_type: string | null
  title: string | null
  status: PaymentRequestStatus
  currency: PaymentCurrency
  total_weight: number
  total_amount: number
  line_count: number
  note: string | null
  created_by: string | null
  submitted_at: string | null
  approved_at: string | null
  approved_by: string | null
  paid_at: string | null
  paid_by: string | null
  created_at: string
  updated_at: string
  facility?: { id: string; code: string; name: string } | null
}

export interface PaymentRequestLine {
  id: string
  payment_request_id: string
  ticket_id: string | null
  source_type: PaymentLineSource
  deal_id: string | null
  partner_id: string | null
  supplier_id: string | null
  payee_name: string
  payee_note: string | null
  rubber_type: string | null
  vehicle_plate: string | null
  weight: number
  unit_price: number
  amount: number
  note: string | null
  sort_order: number
  created_at: string
  updated_at: string
  // resolved cho hiển thị (không lưu DB):
  deal_number?: string | null
}

/** Phiếu cân khả dụng để gom vào đề nghị (đã hoàn tất, chưa thuộc đề nghị nào). */
export interface AvailableTicket {
  id: string
  code: string
  vehicle_plate: string | null
  rubber_type: string | null
  net_weight: number
  unit_price: number
  price_unit: 'wet' | 'dry' | null
  deal_id: string | null
  partner_id: string | null
  supplier_id: string | null
  supplier_name: string | null
  completed_at: string | null
  facility_id: string | null
  // resolved:
  source_type: PaymentLineSource
  payee_name: string
  deal_number: string | null
  suggested_amount: number
}

export interface ListAvailableParams {
  facility_id?: string | null
  date_from?: string   // YYYY-MM-DD (theo completed_at)
  date_to?: string
  rubber_type?: string
}

export interface LineInput {
  ticket_id?: string | null
  source_type?: PaymentLineSource
  deal_id?: string | null
  partner_id?: string | null
  supplier_id?: string | null
  payee_name: string
  payee_note?: string | null
  rubber_type?: string | null
  vehicle_plate?: string | null
  weight: number
  unit_price: number
  amount: number
  note?: string | null
  sort_order?: number
}

export interface CreatePaymentRequestInput {
  facility_id?: string | null
  request_date?: string
  rubber_type?: string | null
  title?: string | null
  currency?: PaymentCurrency
  note?: string | null
  created_by?: string | null
  lines: LineInput[]
}

const REQUEST_SELECT = `
  *,
  facility:facilities!facility_id(id, code, name)
`

// ============================================================================
// HELPERS — resolve tên người nhận từ deal/partner
// ============================================================================

/** Batch lấy tên đại lý từ view b2b_partners theo id. */
async function fetchPartnerNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return map
  const { data } = await supabase
    .from('b2b_partners')
    .select('id, name')
    .in('id', unique)
  for (const r of (data || []) as Array<{ id: string; name: string }>) {
    map.set(r.id, r.name)
  }
  return map
}

/** Batch lấy số deal từ b2b_deals theo id. */
async function fetchDealNumbers(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return map
  const { data } = await supabase
    .from('b2b_deals')
    .select('id, deal_number')
    .in('id', unique)
  for (const r of (data || []) as Array<{ id: string; deal_number: string }>) {
    map.set(r.id, r.deal_number)
  }
  return map
}

function deriveSource(t: { deal_id?: string | null; supplier_id?: string | null }): PaymentLineSource {
  if (t.deal_id) return 'deal'
  if (t.supplier_id) return 'supplier'
  return 'manual'
}

// ============================================================================
// SINH MÃ PHIẾU — {PREFIX}-{YYMM}-{seq}
// ============================================================================

async function generateCode(prefix = 'TMMN', when = new Date()): Promise<string> {
  const yy = String(when.getFullYear()).slice(-2)
  const mm = String(when.getMonth() + 1).padStart(2, '0')
  const head = `${prefix}-${yy}${mm}-`

  const { data, error } = await supabase
    .from('payment_requests')
    .select('code')
    .like('code', `${head}%`)
    .order('code', { ascending: false })
    .limit(1)

  if (error) throw error

  let next = 1
  if (data && data.length > 0) {
    const last = parseInt(data[0].code.split('-').pop() || '0', 10)
    next = last + 1
  }
  return `${head}${String(next).padStart(3, '0')}`
}

// ============================================================================
// GOM PHIẾU CÂN KHẢ DỤNG
// ============================================================================

async function listAvailableTickets(params: ListAvailableParams = {}): Promise<AvailableTicket[]> {
  // Lọc theo created_at để KHỚP với "Ngày giờ" của trang Phiếu cân (WeighbridgeListPage
  // dùng created_at). Phiếu demo "Hoàn tất" có thể completed_at null → tránh lọc trượt.
  let q = supabase
    .from('weighbridge_tickets')
    .select(`
      id, code, vehicle_plate, rubber_type, net_weight, unit_price, price_unit,
      deal_id, partner_id, supplier_id, supplier_name, completed_at, created_at, facility_id
    `)
    .eq('status', 'completed')
    .is('payment_request_id', null)
    .order('created_at', { ascending: true })

  if (params.facility_id) q = q.eq('facility_id', params.facility_id)
  if (params.rubber_type) q = q.eq('rubber_type', params.rubber_type)
  if (params.date_from) q = q.gte('created_at', params.date_from)
  if (params.date_to) q = q.lte('created_at', `${params.date_to}T23:59:59.999Z`)

  const { data, error } = await q
  if (error) throw error
  const rows = (data || []) as any[]

  const partnerNames = await fetchPartnerNames(rows.map(r => r.partner_id).filter(Boolean))
  const dealNumbers = await fetchDealNumbers(rows.map(r => r.deal_id).filter(Boolean))

  return rows.map((r): AvailableTicket => {
    const source = deriveSource(r)
    const weight = Number(r.net_weight) || 0
    const price = Number(r.unit_price) || 0
    const payee =
      source === 'deal'
        ? (r.partner_id ? partnerNames.get(r.partner_id) || '' : '')
        : source === 'supplier'
          ? (r.supplier_name || '')
          : ''
    return {
      id: r.id,
      code: r.code,
      vehicle_plate: r.vehicle_plate ?? null,
      rubber_type: r.rubber_type ?? null,
      net_weight: weight,
      unit_price: price,
      price_unit: r.price_unit ?? null,
      deal_id: r.deal_id ?? null,
      partner_id: r.partner_id ?? null,
      supplier_id: r.supplier_id ?? null,
      supplier_name: r.supplier_name ?? null,
      completed_at: r.completed_at ?? null,
      facility_id: r.facility_id ?? null,
      source_type: source,
      payee_name: payee,
      deal_number: r.deal_id ? dealNumbers.get(r.deal_id) || null : null,
      suggested_amount: Math.round(weight * price),
    }
  })
}

/** Tiện ích: build LineInput[] từ phiếu cân đã chọn (prefill mặc định). */
function ticketsToLines(tickets: AvailableTicket[]): LineInput[] {
  return tickets.map((t, i): LineInput => ({
    ticket_id: t.id,
    source_type: t.source_type,
    deal_id: t.deal_id,
    partner_id: t.partner_id,
    supplier_id: t.supplier_id,
    payee_name: t.payee_name,
    rubber_type: t.rubber_type,
    vehicle_plate: t.vehicle_plate,
    weight: t.net_weight,
    unit_price: t.unit_price,
    amount: t.suggested_amount,
    sort_order: i,
  }))
}

// ============================================================================
// CRUD ĐỀ NGHỊ
// ============================================================================

async function create(input: CreatePaymentRequestInput): Promise<PaymentRequest> {
  const code = await generateCode()

  const { data: req, error: reqErr } = await supabase
    .from('payment_requests')
    .insert({
      code,
      facility_id: input.facility_id || null,
      request_date: input.request_date || new Date().toISOString().slice(0, 10),
      rubber_type: input.rubber_type || null,
      title: input.title || null,
      currency: input.currency || 'VND',
      note: input.note || null,
      created_by: input.created_by || null,
      status: 'draft' as PaymentRequestStatus,
    })
    .select(REQUEST_SELECT)
    .single()

  if (reqErr) throw reqErr

  if (input.lines.length > 0) {
    const payload = input.lines.map((l, i) => ({
      payment_request_id: req.id,
      ticket_id: l.ticket_id || null,
      source_type: l.source_type || (l.ticket_id ? 'supplier' : 'manual'),
      deal_id: l.deal_id || null,
      partner_id: l.partner_id || null,
      supplier_id: l.supplier_id || null,
      payee_name: l.payee_name,
      payee_note: l.payee_note || null,
      rubber_type: l.rubber_type || null,
      vehicle_plate: l.vehicle_plate || null,
      weight: l.weight || 0,
      unit_price: l.unit_price || 0,
      amount: l.amount || 0,
      note: l.note || null,
      sort_order: l.sort_order ?? i,
    }))
    const { error: lineErr } = await supabase.from('payment_request_lines').insert(payload)
    if (lineErr) throw lineErr

    // Đánh dấu phiếu cân đã gom (chống gom trùng)
    const ticketIds = input.lines.map(l => l.ticket_id).filter(Boolean) as string[]
    if (ticketIds.length > 0) {
      await supabase
        .from('weighbridge_tickets')
        .update({ payment_request_id: req.id })
        .in('id', ticketIds)
    }
  }

  // Đọc lại để có totals (trigger đã cập nhật)
  return (await getById(req.id))?.request as PaymentRequest
}

async function list(params: {
  facility_id?: string | null
  status?: PaymentRequestStatus
  date_from?: string
  date_to?: string
  search?: string
  limit?: number
} = {}): Promise<PaymentRequest[]> {
  let q = supabase
    .from('payment_requests')
    .select(REQUEST_SELECT)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 100)

  if (params.facility_id) q = q.eq('facility_id', params.facility_id)
  if (params.status) q = q.eq('status', params.status)
  if (params.date_from) q = q.gte('request_date', params.date_from)
  if (params.date_to) q = q.lte('request_date', params.date_to)
  if (params.search) q = q.or(`code.ilike.%${params.search}%,title.ilike.%${params.search}%`)

  const { data, error } = await q
  if (error) throw error
  return (data || []).map(normalizeRequest)
}

async function getById(id: string): Promise<{ request: PaymentRequest; lines: PaymentRequestLine[] } | null> {
  const { data: req, error } = await supabase
    .from('payment_requests')
    .select(REQUEST_SELECT)
    .eq('id', id)
    .single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }

  const { data: lineRows, error: lineErr } = await supabase
    .from('payment_request_lines')
    .select('*')
    .eq('payment_request_id', id)
    .order('sort_order', { ascending: true })
  if (lineErr) throw lineErr

  const lines = (lineRows || []) as PaymentRequestLine[]
  const dealNumbers = await fetchDealNumbers(lines.map(l => l.deal_id || '').filter(Boolean))
  for (const l of lines) {
    l.deal_number = l.deal_id ? dealNumbers.get(l.deal_id) || null : null
  }

  return { request: normalizeRequest(req), lines }
}

async function updateRequest(
  id: string,
  patch: Partial<Pick<PaymentRequest, 'title' | 'note' | 'request_date' | 'rubber_type' | 'currency' | 'status' | 'facility_id'>>
): Promise<PaymentRequest> {
  const { data, error } = await supabase
    .from('payment_requests')
    .update(patch)
    .eq('id', id)
    .select(REQUEST_SELECT)
    .single()
  if (error) throw error
  return normalizeRequest(data)
}

async function updateLine(
  lineId: string,
  patch: Partial<Pick<PaymentRequestLine, 'payee_name' | 'payee_note' | 'weight' | 'unit_price' | 'amount' | 'note' | 'rubber_type' | 'vehicle_plate' | 'sort_order'>>
): Promise<PaymentRequestLine> {
  const { data, error } = await supabase
    .from('payment_request_lines')
    .update(patch)
    .eq('id', lineId)
    .select('*')
    .single()
  if (error) throw error
  return data as PaymentRequestLine
}

async function addLine(requestId: string, line: LineInput): Promise<PaymentRequestLine> {
  const { data, error } = await supabase
    .from('payment_request_lines')
    .insert({
      payment_request_id: requestId,
      ticket_id: line.ticket_id || null,
      source_type: line.source_type || (line.ticket_id ? 'supplier' : 'manual'),
      deal_id: line.deal_id || null,
      partner_id: line.partner_id || null,
      supplier_id: line.supplier_id || null,
      payee_name: line.payee_name,
      payee_note: line.payee_note || null,
      rubber_type: line.rubber_type || null,
      vehicle_plate: line.vehicle_plate || null,
      weight: line.weight || 0,
      unit_price: line.unit_price || 0,
      amount: line.amount || 0,
      note: line.note || null,
      sort_order: line.sort_order ?? 9999,
    })
    .select('*')
    .single()
  if (error) throw error

  if (line.ticket_id) {
    await supabase
      .from('weighbridge_tickets')
      .update({ payment_request_id: requestId })
      .eq('id', line.ticket_id)
  }
  return data as PaymentRequestLine
}

async function removeLine(lineId: string): Promise<void> {
  // Giải phóng phiếu cân nếu dòng gắn ticket
  const { data: line } = await supabase
    .from('payment_request_lines')
    .select('ticket_id')
    .eq('id', lineId)
    .maybeSingle()

  const { error } = await supabase.from('payment_request_lines').delete().eq('id', lineId)
  if (error) throw error

  if (line?.ticket_id) {
    await supabase
      .from('weighbridge_tickets')
      .update({ payment_request_id: null })
      .eq('id', line.ticket_id)
  }
}

async function remove(id: string): Promise<void> {
  // Giải phóng toàn bộ phiếu cân đã gom
  await supabase
    .from('weighbridge_tickets')
    .update({ payment_request_id: null })
    .eq('payment_request_id', id)

  const { error } = await supabase.from('payment_requests').delete().eq('id', id)
  if (error) throw error
}

// ============================================================================
// WORKFLOW DUYỆT (ĐỢT 2) — draft → submitted → approved → paid (+ cancelled)
// ============================================================================

async function _setStatus(
  id: string,
  next: PaymentRequestStatus,
  fromStatuses: PaymentRequestStatus[],
  extra: Record<string, any> = {}
): Promise<PaymentRequest> {
  let q = supabase
    .from('payment_requests')
    .update({ status: next, ...extra })
    .eq('id', id)
  if (fromStatuses.length) q = q.in('status', fromStatuses)
  const { data, error } = await q.select(REQUEST_SELECT).single()
  if (error) throw error
  if (!data) throw new Error('Không thể chuyển trạng thái (sai trạng thái nguồn?)')
  return normalizeRequest(data)
}

async function submit(id: string): Promise<PaymentRequest> {
  return _setStatus(id, 'submitted', ['draft'], { submitted_at: new Date().toISOString() })
}

async function approve(id: string, userId?: string | null): Promise<PaymentRequest> {
  return _setStatus(id, 'approved', ['submitted'], {
    approved_at: new Date().toISOString(),
    approved_by: userId || null,
  })
}

async function revertToDraft(id: string): Promise<PaymentRequest> {
  return _setStatus(id, 'draft', ['submitted', 'approved'], {
    submitted_at: null, approved_at: null, approved_by: null,
  })
}

async function cancel(id: string): Promise<PaymentRequest> {
  return _setStatus(id, 'cancelled', ['draft', 'submitted', 'approved'])
}

/**
 * Đánh dấu ĐÃ CHI + ghi sổ công nợ (PA1 — đây là cửa chi tiền duy nhất).
 *  - Dòng deal/partner → bút toán b2b_partner_ledger 'payment_paid' (credit), gộp theo partner.
 *  - Dòng mua lẻ (supplier) → cập nhật rubber_intake_batches.paid_amount/payment_status (best-effort qua ticket).
 * Idempotent: ledger theo reference_code; gọi lại an toàn.
 */
async function markPaid(id: string, userId?: string | null): Promise<PaymentRequest> {
  const res = await getById(id)
  if (!res) throw new Error('Không tìm thấy đề nghị')
  const { request, lines } = res
  if (request.status === 'paid') return request
  if (request.status !== 'approved') throw new Error('Chỉ chi khi phiếu ở trạng thái "Đã duyệt"')

  // 1) Ledger payment_paid cho dòng deal/partner — gộp theo partner
  const partnerSums = new Map<string, number>()
  for (const l of lines) {
    if (l.source_type === 'deal' && l.partner_id && (l.amount || 0) > 0) {
      partnerSums.set(l.partner_id, (partnerSums.get(l.partner_id) || 0) + l.amount)
    }
  }
  if (partnerSums.size > 0) {
    const { ledgerService } = await import('../b2b/ledgerService')
    for (const [partnerId, amount] of partnerSums) {
      await ledgerService.createManualEntry({
        partner_id: partnerId,
        entry_type: 'payment_paid',
        debit: 0,
        credit: amount,
        reference_code: `${request.code}-PR-${partnerId}`,
        description: `Chi theo đề nghị thanh toán ${request.code}`,
        entry_date: request.request_date,
        created_by: userId || undefined,
      })
    }
  }

  // 2) Mua lẻ → đánh dấu lô đã trả (best-effort, no-op nếu không có batch liên kết)
  const supplierTicketIds = lines
    .filter(l => l.source_type === 'supplier' && l.ticket_id)
    .map(l => l.ticket_id as string)
  if (supplierTicketIds.length > 0) {
    const { data: batches } = await supabase
      .from('rubber_intake_batches')
      .select('id, total_amount')
      .in('weighbridge_ticket_id', supplierTicketIds)
    for (const b of (batches || []) as Array<{ id: string; total_amount: number | null }>) {
      await supabase
        .from('rubber_intake_batches')
        .update({ paid_amount: b.total_amount ?? 0, payment_status: 'paid' })
        .eq('id', b.id)
    }
  }

  // 3) Set paid
  const { data, error } = await supabase
    .from('payment_requests')
    .update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: userId || null })
    .eq('id', id)
    .select(REQUEST_SELECT)
    .single()
  if (error) throw error
  return normalizeRequest(data)
}

// ============================================================================
// NORMALIZE
// ============================================================================

function normalizeRequest(row: any): PaymentRequest {
  return {
    ...row,
    total_weight: Number(row.total_weight) || 0,
    total_amount: Number(row.total_amount) || 0,
    line_count: Number(row.line_count) || 0,
    facility: Array.isArray(row.facility) ? row.facility[0] || null : row.facility,
  } as PaymentRequest
}

// ============================================================================
// EXPORT
// ============================================================================

export const paymentRequestService = {
  generateCode,
  listAvailableTickets,
  ticketsToLines,
  create,
  list,
  getById,
  updateRequest,
  updateLine,
  addLine,
  removeLine,
  remove,
  submit,
  approve,
  revertToDraft,
  cancel,
  markPaid,
}

export default paymentRequestService
