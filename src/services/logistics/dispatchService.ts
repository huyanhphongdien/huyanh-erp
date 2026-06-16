// ============================================================================
// FILE: src/services/logistics/dispatchService.ts
// MODULE: Vận tải / Lệnh điều động — nối Đơn hàng bán → Lệnh → Trạm cân
// BẢNG: dispatch_orders, dispatch_order_lines
// Mã: LDD-{YYMM}-{seq}. Snapshot tài xế/xe để in chứng từ.
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { FleetVehicle, FleetDriver } from './fleetService'

export type DispatchStatus = 'draft' | 'dispatched' | 'in_transit' | 'completed' | 'cancelled'
export type TripType = 'port' | 'lao' | 'internal' | 'other'

export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  draft: 'Nháp',
  dispatched: 'Đã điều xe',
  in_transit: 'Đang vận chuyển',
  completed: 'Hoàn tất',
  cancelled: 'Đã huỷ',
}

export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  port: 'Xuất hàng đi cảng',
  lao: 'Đi Lào',
  internal: 'Nội bộ',
  other: 'Khác',
}

export interface DispatchOrder {
  id: string
  code: string
  dispatch_date: string
  trip_type: TripType
  reason: string | null
  tractor_vehicle_id: string | null
  trailer_vehicle_id: string | null
  driver_id: string | null
  tractor_plate: string | null
  trailer_plate: string | null
  driver_name: string | null
  driver_phone: string | null
  driver_license_no: string | null
  driver_id_no: string | null
  driver_dob: string | null
  driver_address: string | null
  contract_ref: string | null
  customer_name: string | null
  destination: string | null
  recipient_name: string | null
  recipient_phone: string | null
  sales_order_id: string | null
  weighbridge_ticket_id: string | null
  status: DispatchStatus
  total_lines: number
  total_weight: number
  note: string | null
  created_by: string | null
  dispatched_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  // resolved
  sales_order?: { id: string; code: string; contract_no: string | null } | null
}

export interface DispatchLine {
  id: string
  dispatch_order_id: string
  route: string | null
  lot_code: string | null
  grade: string | null
  container_no: string | null
  seal_no: string | null
  package_count: number | null
  weight_kg: number
  sales_order_container_id: string | null
  actual_weight_kg: number | null
  actual_seal_no: string | null
  note: string | null
  sort_order: number
}

export interface DispatchLineInput {
  route?: string | null
  lot_code?: string | null
  grade?: string | null
  container_no?: string | null
  seal_no?: string | null
  package_count?: number | null
  weight_kg?: number
  sales_order_container_id?: string | null
  note?: string | null
  sort_order?: number
}

export interface CreateDispatchInput {
  dispatch_date?: string
  trip_type?: TripType
  reason?: string | null
  tractor_vehicle_id?: string | null
  trailer_vehicle_id?: string | null
  driver_id?: string | null
  contract_ref?: string | null
  customer_name?: string | null
  destination?: string | null
  recipient_name?: string | null
  recipient_phone?: string | null
  sales_order_id?: string | null
  note?: string | null
  created_by?: string | null
  lines: DispatchLineInput[]
}

/** Đơn hàng bán rút gọn để chọn khi lập lệnh. */
export interface SalesOrderOption {
  id: string
  code: string
  contract_no: string | null
  customer_name: string | null
  grade: string | null
  incoterm: string | null
  port_of_destination: string | null
  status: string | null
  container_count: number
}

const ORDER_SELECT = `
  *,
  sales_order:sales_orders!sales_order_id(id, code, contract_no)
`

// ============================================================================
// SINH MÃ — LDD-{YYMM}-{seq}
// ============================================================================

async function generateCode(when = new Date()): Promise<string> {
  const yy = String(when.getFullYear()).slice(-2)
  const mm = String(when.getMonth() + 1).padStart(2, '0')
  const head = `LDD-${yy}${mm}-`
  const { data, error } = await supabase
    .from('dispatch_orders')
    .select('code')
    .like('code', `${head}%`)
    .order('code', { ascending: false })
    .limit(1)
  if (error) throw error
  let next = 1
  if (data && data.length > 0) {
    next = parseInt(data[0].code.split('-').pop() || '0', 10) + 1
  }
  return `${head}${String(next).padStart(3, '0')}`
}

// ============================================================================
// SNAPSHOT tài xế/xe — đọc danh mục, copy vào header để in chứng từ
// ============================================================================

async function resolveSnapshot(input: {
  tractor_vehicle_id?: string | null
  trailer_vehicle_id?: string | null
  driver_id?: string | null
}): Promise<Record<string, any>> {
  const out: Record<string, any> = {}

  const vehicleIds = [input.tractor_vehicle_id, input.trailer_vehicle_id].filter(Boolean) as string[]
  if (vehicleIds.length > 0) {
    const { data } = await supabase.from('fleet_vehicles').select('id, plate').in('id', vehicleIds)
    const map = new Map((data || []).map((v: any) => [v.id, v.plate]))
    out.tractor_plate = input.tractor_vehicle_id ? map.get(input.tractor_vehicle_id) || null : null
    out.trailer_plate = input.trailer_vehicle_id ? map.get(input.trailer_vehicle_id) || null : null
  }

  if (input.driver_id) {
    const { data: d } = await supabase
      .from('fleet_drivers')
      .select('full_name, phone, license_no, id_no, dob, address')
      .eq('id', input.driver_id)
      .maybeSingle()
    if (d) {
      out.driver_name = d.full_name || null
      out.driver_phone = d.phone || null
      out.driver_license_no = d.license_no || null
      out.driver_id_no = d.id_no || null
      out.driver_dob = d.dob || null
      out.driver_address = d.address || null
    }
  }
  return out
}

// ============================================================================
// CRUD LỆNH
// ============================================================================

async function list(params: {
  status?: DispatchStatus
  date_from?: string
  date_to?: string
  search?: string
  limit?: number
} = {}): Promise<DispatchOrder[]> {
  let q = supabase.from('dispatch_orders').select(ORDER_SELECT).order('created_at', { ascending: false }).limit(params.limit ?? 100)
  if (params.status) q = q.eq('status', params.status)
  if (params.date_from) q = q.gte('dispatch_date', params.date_from)
  if (params.date_to) q = q.lte('dispatch_date', params.date_to)
  if (params.search) q = q.or(`code.ilike.%${params.search}%,tractor_plate.ilike.%${params.search}%,driver_name.ilike.%${params.search}%,customer_name.ilike.%${params.search}%`)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(normalizeOrder)
}

async function getById(id: string): Promise<{ order: DispatchOrder; lines: DispatchLine[] } | null> {
  const { data: order, error } = await supabase.from('dispatch_orders').select(ORDER_SELECT).eq('id', id).single()
  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  const { data: lineRows, error: lineErr } = await supabase
    .from('dispatch_order_lines')
    .select('*')
    .eq('dispatch_order_id', id)
    .order('sort_order', { ascending: true })
  if (lineErr) throw lineErr
  return { order: normalizeOrder(order), lines: (lineRows || []).map(normalizeLine) }
}

async function create(input: CreateDispatchInput): Promise<DispatchOrder> {
  const code = await generateCode()
  const snapshot = await resolveSnapshot(input)

  const { data: order, error } = await supabase
    .from('dispatch_orders')
    .insert({
      code,
      dispatch_date: input.dispatch_date || new Date().toISOString().slice(0, 10),
      trip_type: input.trip_type || 'port',
      reason: input.reason || null,
      tractor_vehicle_id: input.tractor_vehicle_id || null,
      trailer_vehicle_id: input.trailer_vehicle_id || null,
      driver_id: input.driver_id || null,
      contract_ref: input.contract_ref || null,
      customer_name: input.customer_name || null,
      destination: input.destination || null,
      recipient_name: input.recipient_name || null,
      recipient_phone: input.recipient_phone || null,
      sales_order_id: input.sales_order_id || null,
      note: input.note || null,
      created_by: input.created_by || null,
      status: 'draft' as DispatchStatus,
      ...snapshot,
    })
    .select(ORDER_SELECT)
    .single()
  if (error) throw error

  if (input.lines.length > 0) {
    try {
      const payload = input.lines.map((l, i) => lineToRow(order.id, l, i))
      const { error: lineErr } = await supabase.from('dispatch_order_lines').insert(payload)
      if (lineErr) throw lineErr
    } catch (err) {
      await supabase.from('dispatch_orders').delete().eq('id', order.id)
      throw err
    }
  }

  return (await getById(order.id))!.order
}

async function update(
  id: string,
  patch: Partial<CreateDispatchInput> & { tractor_vehicle_id?: string | null; trailer_vehicle_id?: string | null; driver_id?: string | null }
): Promise<DispatchOrder> {
  const out: Record<string, any> = {}
  const keys = ['dispatch_date', 'trip_type', 'reason', 'tractor_vehicle_id', 'trailer_vehicle_id', 'driver_id',
    'contract_ref', 'customer_name', 'destination', 'recipient_name', 'recipient_phone', 'sales_order_id', 'note'] as const
  for (const k of keys) {
    if ((patch as any)[k] !== undefined) out[k] = (patch as any)[k] === '' ? null : (patch as any)[k]
  }
  // Nếu đổi xe/tài xế → cập nhật snapshot
  if (patch.tractor_vehicle_id !== undefined || patch.trailer_vehicle_id !== undefined || patch.driver_id !== undefined) {
    const snapshot = await resolveSnapshot({
      tractor_vehicle_id: patch.tractor_vehicle_id ?? null,
      trailer_vehicle_id: patch.trailer_vehicle_id ?? null,
      driver_id: patch.driver_id ?? null,
    })
    Object.assign(out, snapshot)
  }
  const { data, error } = await supabase.from('dispatch_orders').update(out).eq('id', id).select(ORDER_SELECT).single()
  if (error) throw error
  return normalizeOrder(data)
}

async function remove(id: string): Promise<void> {
  const { error } = await supabase.from('dispatch_orders').delete().eq('id', id)
  if (error) throw error
}

// ============================================================================
// DÒNG
// ============================================================================

function lineToRow(orderId: string, l: DispatchLineInput, i: number): Record<string, any> {
  return {
    dispatch_order_id: orderId,
    route: l.route || null,
    lot_code: l.lot_code || null,
    grade: l.grade || null,
    container_no: l.container_no || null,
    seal_no: l.seal_no || null,
    package_count: l.package_count ?? null,
    weight_kg: l.weight_kg || 0,
    sales_order_container_id: l.sales_order_container_id || null,
    note: l.note || null,
    sort_order: l.sort_order ?? i,
  }
}

async function addLine(orderId: string, line: DispatchLineInput): Promise<DispatchLine> {
  const { data, error } = await supabase.from('dispatch_order_lines').insert(lineToRow(orderId, line, 9999)).select('*').single()
  if (error) throw error
  return normalizeLine(data)
}

async function updateLine(lineId: string, patch: DispatchLineInput): Promise<DispatchLine> {
  const out: Record<string, any> = {}
  const keys = ['route', 'lot_code', 'grade', 'container_no', 'seal_no', 'package_count', 'weight_kg', 'note', 'sort_order'] as const
  for (const k of keys) {
    if ((patch as any)[k] !== undefined) out[k] = (patch as any)[k] === '' ? null : (patch as any)[k]
  }
  const { data, error } = await supabase.from('dispatch_order_lines').update(out).eq('id', lineId).select('*').single()
  if (error) throw error
  return normalizeLine(data)
}

async function removeLine(lineId: string): Promise<void> {
  const { error } = await supabase.from('dispatch_order_lines').delete().eq('id', lineId)
  if (error) throw error
}

// ============================================================================
// WORKFLOW TRẠNG THÁI
// ============================================================================

async function setStatus(id: string, next: DispatchStatus): Promise<DispatchOrder> {
  const extra: Record<string, any> = { status: next }
  if (next === 'dispatched') extra.dispatched_at = new Date().toISOString()
  if (next === 'completed') extra.completed_at = new Date().toISOString()
  const { data, error } = await supabase.from('dispatch_orders').update(extra).eq('id', id).select(ORDER_SELECT).single()
  if (error) throw error
  return normalizeOrder(data)
}

// ============================================================================
// TÍCH HỢP TRẠM CÂN (ĐỢT 2) — cân XUẤT chọn lệnh → đồng bộ KL/seal thực
// ============================================================================

export type DeliveryState = 'delivered' | 'dispatching'

/**
 * Trạng thái giao của từng container (theo dispatch_order_lines):
 *  - 'delivered'   = đã cân xuất (dòng lệnh có actual_weight_kg).
 *  - 'dispatching' = đã vào lệnh nhưng chưa cân.
 *  - (không có key) = chưa điều động (chưa giao).
 */
async function getDeliveryStatus(containerIds: string[]): Promise<Record<string, DeliveryState>> {
  const map: Record<string, DeliveryState> = {}
  const ids = [...new Set((containerIds || []).filter(Boolean))]
  if (ids.length === 0) return map
  const { data } = await supabase
    .from('dispatch_order_lines')
    .select('sales_order_container_id, actual_weight_kg')
    .in('sales_order_container_id', ids)
  for (const r of (data || []) as Array<{ sales_order_container_id: string | null; actual_weight_kg: number | null }>) {
    const cid = r.sales_order_container_id
    if (!cid) continue
    if (r.actual_weight_kg != null) map[cid] = 'delivered'
    else if (map[cid] !== 'delivered') map[cid] = 'dispatching'
  }
  return map
}

/** Tiến độ lô của 1 đơn — cho danh sách (3 view): bao nhiêu cont/lô, đã giao bao nhiêu. */
export interface LotProgress {
  contsTotal: number
  contsDelivered: number
  lotsTotal: number
  lotsDelivered: number
}

/**
 * Tiến độ lô CHO NHIỀU ĐƠN cùng lúc (2 query batch) — dùng ở list/kanban/split.
 *  - đã giao container = có dòng lệnh điều động với actual_weight_kg.
 *  - 1 lô "đã giao" khi mọi container của lô đã giao.
 */
async function getLotProgressForOrders(orderIds: string[]): Promise<Record<string, LotProgress>> {
  const out: Record<string, LotProgress> = {}
  const ids = [...new Set((orderIds || []).filter(Boolean))]
  if (ids.length === 0) return out

  const { data: conts } = await supabase
    .from('sales_order_containers')
    .select('id, sales_order_id, lot_no')
    .in('sales_order_id', ids)
  const rows = (conts || []) as Array<{ id: string; sales_order_id: string; lot_no: number | null }>
  if (rows.length === 0) return out

  // container đã giao — chunk IN tránh URL quá dài
  const contIds = rows.map((r) => r.id)
  const deliveredSet = new Set<string>()
  for (let i = 0; i < contIds.length; i += 120) {
    const chunk = contIds.slice(i, i + 120)
    const { data: lines } = await supabase
      .from('dispatch_order_lines')
      .select('sales_order_container_id, actual_weight_kg')
      .in('sales_order_container_id', chunk)
    for (const l of (lines || []) as Array<{ sales_order_container_id: string | null; actual_weight_kg: number | null }>) {
      if (l.actual_weight_kg != null && l.sales_order_container_id) deliveredSet.add(l.sales_order_container_id)
    }
  }

  const byOrder = new Map<string, Array<{ id: string; lot: number | null }>>()
  for (const r of rows) {
    if (!byOrder.has(r.sales_order_id)) byOrder.set(r.sales_order_id, [])
    byOrder.get(r.sales_order_id)!.push({ id: r.id, lot: r.lot_no })
  }
  for (const [oid, cs] of byOrder) {
    const lots = new Map<number, { total: number; delivered: number }>()
    for (const c of cs) {
      if (c.lot == null) continue
      if (!lots.has(c.lot)) lots.set(c.lot, { total: 0, delivered: 0 })
      const L = lots.get(c.lot)!
      L.total++
      if (deliveredSet.has(c.id)) L.delivered++
    }
    out[oid] = {
      contsTotal: cs.length,
      contsDelivered: cs.filter((c) => deliveredSet.has(c.id)).length,
      lotsTotal: lots.size,
      lotsDelivered: [...lots.values()].filter((L) => L.total > 0 && L.delivered === L.total).length,
    }
  }
  return out
}

/** Danh sách lệnh CÒN HIỆU LỰC để chọn khi cân XUẤT (bỏ completed/cancelled). */
async function listForWeighing(): Promise<DispatchOrder[]> {
  const { data, error } = await supabase
    .from('dispatch_orders')
    .select(ORDER_SELECT)
    .not('status', 'in', '(completed,cancelled)')
    // Ẩn lệnh ĐÃ CÂN XONG (đã gắn phiếu cân ở lần hoàn tất) cho đỡ rối danh sách.
    .is('weighbridge_ticket_id', null)
    .order('dispatch_date', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data || []).map(normalizeOrder)
}

/**
 * Đồng bộ kết quả cân thực tế về lệnh điều động.
 * 1 LỆNH = 1 XE = TẤT CẢ container của lệnh → cân 1 lần (cả xe) → áp cho HẾT các dòng.
 *  - KL net CHIA theo tỉ lệ KL kế hoạch từng dòng (tổng khớp đúng net; dòng cuối nhận
 *    phần dư để không lệch do làm tròn). Kế hoạch trống → chia đều.
 *  - actual_seal_no lấy theo seal kế hoạch của từng container.
 *  - Gắn weighbridge_ticket_id vào lệnh (set nếu còn trống — phiếu cân đầu tiên).
 * Best-effort: lỗi không chặn nghiệp vụ cân.
 */
async function syncWeighing(params: {
  orderId: string
  lineIds: string[]
  ticketId: string
  netWeight: number
}): Promise<void> {
  const ids = (params.lineIds || []).filter(Boolean)
  if (ids.length > 0) {
    const { data: rows } = await supabase
      .from('dispatch_order_lines')
      .select('id, weight_kg, seal_no')
      .in('id', ids)
    const lines = (rows || []) as Array<{ id: string; weight_kg: number | null; seal_no: string | null }>
    const totalPlanned = lines.reduce((s, l) => s + (Number(l.weight_kg) || 0), 0)
    let distributed = 0
    for (let i = 0; i < lines.length; i++) {
      const planned = Number(lines[i].weight_kg) || 0
      const actual = i === lines.length - 1
        ? params.netWeight - distributed
        : (totalPlanned > 0
            ? Math.round(params.netWeight * planned / totalPlanned)
            : Math.round(params.netWeight / lines.length))
      distributed += actual
      await supabase
        .from('dispatch_order_lines')
        .update({ actual_weight_kg: actual, actual_seal_no: lines[i].seal_no || null })
        .eq('id', lines[i].id)
    }
  }
  await supabase
    .from('dispatch_orders')
    .update({ weighbridge_ticket_id: params.ticketId })
    .eq('id', params.orderId)
    .is('weighbridge_ticket_id', null)
}

/**
 * Đánh dấu thủ công lệnh "đã cân" (khi trạm cân đã cân thực tế nhưng không nối
 * lệnh, hoặc cân trước khi có tính năng nối). Theo nguyên tắc "đã cân là được"
 * (KHÔNG so KL): set actual_weight_kg = KL kế hoạch cho các dòng CHƯA cân, để
 * Đơn hàng bán tự suy ra "đã giao" (getDeliveryStatus/lot badges đọc cột này).
 * Trả về số dòng vừa đánh dấu.
 */
async function markWeighed(orderId: string): Promise<number> {
  const { data: rows } = await supabase
    .from('dispatch_order_lines')
    .select('id, weight_kg, seal_no, actual_weight_kg, sales_order_container_id')
    .eq('dispatch_order_id', orderId)
  const lines = (rows || []) as Array<{
    id: string; weight_kg: number | null; seal_no: string | null
    actual_weight_kg: number | null; sales_order_container_id: string | null
  }>
  let marked = 0
  const containerIds: string[] = []
  for (const l of lines) {
    if (l.sales_order_container_id) containerIds.push(l.sales_order_container_id)
    if (l.actual_weight_kg != null) continue // đã cân rồi → giữ nguyên
    await supabase
      .from('dispatch_order_lines')
      .update({ actual_weight_kg: l.weight_kg ?? 0, actual_seal_no: l.seal_no || null })
      .eq('id', l.id)
    marked++
  }
  // Container liên kết → đánh dấu "Đã xuất" (shipped) cho khớp với "đã giao",
  // tránh đơn hiện GIAO HÀNG=Đã giao mà TRẠNG THÁI vẫn "Đang lên kế hoạch".
  const uniq = [...new Set(containerIds)]
  if (uniq.length > 0) {
    await supabase
      .from('sales_order_containers')
      .update({ status: 'shipped' })
      .in('id', uniq)
      .neq('status', 'shipped')
  }
  return marked
}

// ============================================================================
// TÍCH HỢP ĐƠN HÀNG BÁN
// ============================================================================

/** Danh sách đơn hàng bán để chọn khi lập lệnh (kèm số container). */
async function listSalesOrderOptions(search?: string): Promise<SalesOrderOption[]> {
  let q = supabase
    .from('sales_orders')
    .select(`
      id, code, contract_no, grade, incoterm, port_of_destination, status,
      customer:sales_customers!customer_id(name, short_name),
      sales_order_containers(id)
    `)
    .not('status', 'in', '(cancelled)')
    .order('created_at', { ascending: false })
    .limit(50)
  if (search) q = q.or(`code.ilike.%${search}%,contract_no.ilike.%${search}%,grade.ilike.%${search}%`)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map((r: any): SalesOrderOption => {
    const cust = Array.isArray(r.customer) ? r.customer[0] : r.customer
    return {
      id: r.id,
      code: r.code,
      contract_no: r.contract_no ?? null,
      customer_name: cust?.short_name || cust?.name || null,
      grade: r.grade ?? null,
      incoterm: r.incoterm ?? null,
      port_of_destination: r.port_of_destination ?? null,
      status: r.status ?? null,
      container_count: Array.isArray(r.sales_order_containers) ? r.sales_order_containers.length : 0,
    }
  })
}

/**
 * Lấy thông tin SO + đổ container thành dòng lệnh (prefill, KHÔNG ghi DB).
 * Trả về { header, lines } để form điền sẵn.
 */
async function buildFromSalesOrder(soId: string): Promise<{
  header: Partial<CreateDispatchInput>
  lines: DispatchLineInput[]
}> {
  const { data: so, error } = await supabase
    .from('sales_orders')
    .select(`
      id, code, contract_no, grade, incoterm, port_of_destination,
      customer:sales_customers!customer_id(name, short_name)
    `)
    .eq('id', soId)
    .single()
  if (error) throw error
  const cust = Array.isArray(so.customer) ? so.customer[0] : so.customer

  // grade nằm ở sales_order_container_items (container không có cột grade riêng)
  const { data: containers, error: cErr } = await supabase
    .from('sales_order_containers')
    .select('id, container_no, seal_no, net_weight_kg, gross_weight_kg, bale_count, lot_no, items:sales_order_container_items(grade)')
    .eq('sales_order_id', soId)
    .order('lot_no', { ascending: true, nullsFirst: false })
    .order('container_no', { ascending: true })
  if (cErr) throw cErr

  // CHỈ đổ container CHƯA điều động (tránh điều trùng container đã vào lệnh khác/đã giao).
  const delivery = await getDeliveryStatus((containers || []).map((c: any) => c.id))
  const available = (containers || []).filter((c: any) => !delivery[c.id])

  const lines: DispatchLineInput[] = available.map((c: any, i: number) => {
    const itemGrade = Array.isArray(c.items) ? c.items.find((x: any) => x.grade)?.grade : null
    return {
      grade: itemGrade || so.grade || null,
      lot_code: c.lot_no != null ? `Lot ${c.lot_no}` : null,
      container_no: c.container_no || null,
      seal_no: c.seal_no || null,
      package_count: c.bale_count ?? null,
      weight_kg: Number(c.net_weight_kg) || Number(c.gross_weight_kg) || 0,
      sales_order_container_id: c.id,
      sort_order: i,
    }
  })

  return {
    header: {
      sales_order_id: so.id,
      customer_name: cust?.short_name || cust?.name || null,
      destination: so.port_of_destination || null,
      contract_ref: so.contract_no || so.code || null,
      trip_type: 'port',
    },
    lines,
  }
}

/** Đơn hàng đã gắn vào lệnh (gồm danh sách container của đơn) — dùng cho thẻ đơn + edit mode. */
export interface AttachedSalesOrder {
  id: string
  code: string
  customer_name: string | null
  destination: string | null
  contract_ref: string | null
  containerIds: string[]
}

/**
 * Dựng lại danh sách đơn (kèm container của từng đơn) từ các container_id.
 * Dùng khi MỞ LẠI lệnh để sửa — để hiện đúng các thẻ đơn đã gắn + cho gỡ từng đơn.
 */
async function ordersFromContainerIds(containerIds: string[]): Promise<AttachedSalesOrder[]> {
  const ids = [...new Set((containerIds || []).filter(Boolean))]
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('sales_order_containers')
    .select(`
      id, sales_order_id,
      so:sales_orders!sales_order_id(
        id, code, contract_no, port_of_destination,
        customer:sales_customers!customer_id(name, short_name)
      )
    `)
    .in('id', ids)
  if (error) throw error
  const byOrder = new Map<string, AttachedSalesOrder>()
  for (const row of (data || []) as any[]) {
    const so = Array.isArray(row.so) ? row.so[0] : row.so
    if (!so) continue
    if (!byOrder.has(so.id)) {
      const cust = Array.isArray(so.customer) ? so.customer[0] : so.customer
      byOrder.set(so.id, {
        id: so.id,
        code: so.code,
        customer_name: cust?.short_name || cust?.name || null,
        destination: so.port_of_destination || null,
        contract_ref: so.contract_no || so.code || null,
        containerIds: [],
      })
    }
    byOrder.get(so.id)!.containerIds.push(row.id)
  }
  return [...byOrder.values()]
}

// ============================================================================
// NORMALIZE
// ============================================================================

function normalizeOrder(row: any): DispatchOrder {
  return {
    ...row,
    total_weight: Number(row.total_weight) || 0,
    total_lines: Number(row.total_lines) || 0,
    sales_order: Array.isArray(row.sales_order) ? row.sales_order[0] || null : row.sales_order,
  } as DispatchOrder
}

function normalizeLine(row: any): DispatchLine {
  return {
    ...row,
    weight_kg: Number(row.weight_kg) || 0,
    actual_weight_kg: row.actual_weight_kg != null ? Number(row.actual_weight_kg) : null,
    package_count: row.package_count != null ? Number(row.package_count) : null,
  } as DispatchLine
}

// ============================================================================
// EXPORT
// ============================================================================

export const dispatchService = {
  generateCode,
  list,
  getById,
  create,
  update,
  remove,
  addLine,
  updateLine,
  removeLine,
  setStatus,
  listSalesOrderOptions,
  buildFromSalesOrder,
  ordersFromContainerIds,
  listForWeighing,
  syncWeighing,
  markWeighed,
  getDeliveryStatus,
  getLotProgressForOrders,
}

export default dispatchService

export type { FleetVehicle, FleetDriver }
