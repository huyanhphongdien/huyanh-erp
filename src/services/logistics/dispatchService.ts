// ============================================================================
// FILE: src/services/logistics/dispatchService.ts
// MODULE: Vận tải / Lệnh điều động — nối Đơn hàng bán → Lệnh → Trạm cân
// BẢNG: dispatch_orders, dispatch_order_lines
// Mã: LDD-{YYMM}-{seq}. Snapshot tài xế/xe để in chứng từ.
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { FleetVehicle, FleetDriver } from './fleetService'

export type DispatchStatus = 'draft' | 'dispatched' | 'in_transit' | 'completed' | 'cancelled'
export type TripType = 'port' | 'lao' | 'internal' | 'other' | 'trading' | 'fetch_mu'

export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  draft: 'Nháp',
  dispatched: 'Đã điều xe',
  in_transit: 'Đang vận chuyển',
  completed: 'Hoàn tất',
  cancelled: 'Đã huỷ',
}

export const TRIP_TYPE_LABELS: Record<TripType, string> = {
  port: 'Xuất hàng đi cảng',
  trading: 'Hàng thương mại',      // mua của nhà máy khác → bốc TẠI NHÀ MÁY ĐÓ → giao khách
  fetch_mu: 'Đi lấy mủ (NM khác)', // Đợt 2: đi lấy mủ TL/Lào về PĐ — cân 2 đầu ở PĐ
  lao: 'Đi Lào',
  internal: 'Nội bộ',
  other: 'Khác',
}

/** Chuyến ĐI LẤY MỦ (TL→PĐ) — khai pallet mang đi trên lệnh; app cân cân 2 đầu ở PĐ. */
export const isFetchMuTrip = (t?: TripType | string | null): boolean => t === 'fetch_mu'

/** Nhãn loại mủ dự kiến (chuyến đi lấy mủ) — đồng bộ options ở DispatchCreatePage + app cân. */
export const FETCH_RUBBER_LABELS: Record<string, string> = {
  mu_tap: 'Mủ tạp',
  mu_nuoc: 'Mủ nước',
  mu_dong: 'Mủ đông',
  mu_to: 'Mủ tờ',
  mu_rss3: 'Mủ RSS3',
}

/** Kg pallet mang đi = nhựa×10 + sắt×50. */
export const palletOutKg = (plastic?: number | null, steel?: number | null): number =>
  (Number(plastic) || 0) * 10 + (Number(steel) || 0) * 50

/**
 * Chuyến CHỞ CONTAINER → dùng bảng cont/seal đầy đủ + gắn được Đơn hàng bán.
 *  - 'port'    = hàng nhà, bốc tại kho Huy Anh → cảng.
 *  - 'trading' = hàng thương mại: mua của nhà máy khác → bốc TẠI NHÀ MÁY ĐÓ → giao khách.
 * Các loại còn lại (lao/internal/other) = chuyến thường → bảng gọn.
 * ⚠ Dùng helper này thay cho `trip_type === 'port'` ở MỌI page — nếu không, chọn
 *   'trading' sẽ mất bảng container + nút "Tạo từ Đơn hàng bán".
 */
export const CONTAINER_TRIP_TYPES: TripType[] = ['port', 'trading']
export const isContainerTrip = (t?: TripType | string | null): boolean =>
  CONTAINER_TRIP_TYPES.includes((t ?? 'port') as TripType)

export interface DispatchOrder {
  id: string
  code: string
  dispatch_date: string
  trip_type: TripType
  reason: string | null
  is_hired: boolean
  hire_company: string | null
  hire_cost: number | null
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
  pickup_location: string | null   // điểm BỐC hàng (null = kho Huy Anh)
  pickup_contact: string | null    // người/SĐT tại điểm bốc
  // Đợt 2 — pallet MANG ĐI (chuyến đi lấy mủ); app cân pre-fill cân lần 1
  pallet_plastic_out?: number | null
  pallet_steel_out?: number | null
  pallet_kg_out?: number | null
  fetch_rubber_type?: string | null   // loại mủ dự kiến lấy — app cân điền sẵn
  fetch_lot_code?: string | null      // mã lô dự kiến lấy — app cân điền sẵn
  // 4-lần-cân đối chiếu (đi lấy mủ): pallet CÒN TRÊN XE rời TL + KL mủ 2 trạm
  pallet_plastic_return?: number | null
  pallet_steel_return?: number | null
  pallet_kg_return?: number | null
  tl_ticket_id?: string | null
  tl_net_kg?: number | null
  tl_weighed_at?: string | null
  pd_net_kg?: number | null
  pd_weighed_at?: string | null
  fetch_tl_skipped?: boolean | null   // xe container — TL không cân được, chỉ PĐ cân
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
  weight_kg: number            // KL net (kế hoạch) — từ sales_order_containers.net_weight_kg
  gross_weight_kg: number | null  // KL gross (GW) — người ra lệnh nhập, ghi ngược về container
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
  gross_weight_kg?: number | null
  sales_order_container_id?: string | null
  note?: string | null
  sort_order?: number
}

export interface CreateDispatchInput {
  dispatch_date?: string
  trip_type?: TripType
  reason?: string | null
  // Thuê ngoài: is_hired=true → nhập tay biển số/tài xế (các trường *_plate / driver_*)
  is_hired?: boolean
  hire_company?: string | null
  hire_cost?: number | null
  tractor_plate?: string | null
  trailer_plate?: string | null
  driver_name?: string | null
  driver_phone?: string | null
  tractor_vehicle_id?: string | null
  trailer_vehicle_id?: string | null
  driver_id?: string | null
  contract_ref?: string | null
  customer_name?: string | null
  destination?: string | null
  pickup_location?: string | null
  pickup_contact?: string | null
  pallet_plastic_out?: number | null
  pallet_steel_out?: number | null
  pallet_kg_out?: number | null
  fetch_rubber_type?: string | null
  fetch_lot_code?: string | null
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
  const hired = !!input.is_hired
  // Thuê ngoài → snapshot từ NHẬP TAY; xe nhà → snapshot từ danh mục.
  const snapshot = hired
    ? {
        tractor_plate: input.tractor_plate || null, trailer_plate: input.trailer_plate || null,
        driver_name: input.driver_name || null, driver_phone: input.driver_phone || null,
        driver_license_no: null, driver_id_no: null, driver_dob: null, driver_address: null,
      }
    : await resolveSnapshot(input)

  const { data: order, error } = await supabase
    .from('dispatch_orders')
    .insert({
      code,
      dispatch_date: input.dispatch_date || new Date().toISOString().slice(0, 10),
      trip_type: input.trip_type || 'port',
      reason: input.reason || null,
      is_hired: hired,
      hire_company: hired ? (input.hire_company || null) : null,
      hire_cost: hired ? (input.hire_cost ?? null) : null,
      tractor_vehicle_id: hired ? null : (input.tractor_vehicle_id || null),
      trailer_vehicle_id: hired ? null : (input.trailer_vehicle_id || null),
      driver_id: hired ? null : (input.driver_id || null),
      contract_ref: input.contract_ref || null,
      customer_name: input.customer_name || null,
      destination: input.destination || null,
      // Chỉ gửi khi CÓ giá trị: nếu code lỡ deploy trước khi chạy migration
      // dispatch_pickup_location.sql, payload không mang key lạ → PostgREST không
      // báo PGRST204 "column not found" làm chết TOÀN BỘ việc tạo lệnh điều động.
      ...(input.pickup_location ? { pickup_location: input.pickup_location } : {}),
      ...(input.pickup_contact ? { pickup_contact: input.pickup_contact } : {}),
      // Đợt 2: pallet mang đi — chỉ gửi key khi có (an toàn nếu deploy trước migration)
      ...(input.pallet_plastic_out != null ? { pallet_plastic_out: input.pallet_plastic_out } : {}),
      ...(input.pallet_steel_out != null ? { pallet_steel_out: input.pallet_steel_out } : {}),
      ...(input.pallet_kg_out != null ? { pallet_kg_out: input.pallet_kg_out } : {}),
      ...(input.fetch_rubber_type ? { fetch_rubber_type: input.fetch_rubber_type } : {}),
      ...(input.fetch_lot_code ? { fetch_lot_code: input.fetch_lot_code } : {}),
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
      // GW nhập lúc tạo → ghi ngược về container cho Packing List
      for (const l of input.lines) await pushGrossToContainer(l)
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
  // update() an toàn sẵn: chỉ set key khi patch có mặt (!== undefined).
  const keys = ['dispatch_date', 'trip_type', 'reason', 'contract_ref', 'customer_name', 'destination',
    'pickup_location', 'pickup_contact', 'pallet_plastic_out', 'pallet_steel_out', 'pallet_kg_out',
    'fetch_rubber_type', 'fetch_lot_code',
    'recipient_name', 'recipient_phone', 'sales_order_id', 'note', 'is_hired', 'hire_company', 'hire_cost'] as const
  for (const k of keys) {
    if ((patch as any)[k] !== undefined) out[k] = (patch as any)[k] === '' ? null : (patch as any)[k]
  }
  if (patch.is_hired === true) {
    // Thuê ngoài: bỏ FK đội xe, snapshot từ nhập tay
    out.tractor_vehicle_id = null; out.trailer_vehicle_id = null; out.driver_id = null
    out.tractor_plate = patch.tractor_plate || null
    out.trailer_plate = patch.trailer_plate || null
    out.driver_name = patch.driver_name || null
    out.driver_phone = patch.driver_phone || null
    out.driver_license_no = null; out.driver_id_no = null; out.driver_dob = null; out.driver_address = null
  } else {
    if (patch.is_hired === false) { out.hire_company = null; out.hire_cost = null }
    if (patch.tractor_vehicle_id !== undefined) out.tractor_vehicle_id = patch.tractor_vehicle_id || null
    if (patch.trailer_vehicle_id !== undefined) out.trailer_vehicle_id = patch.trailer_vehicle_id || null
    if (patch.driver_id !== undefined) out.driver_id = patch.driver_id || null
    // Đổi xe/tài xế (xe nhà) → cập nhật snapshot từ danh mục
    if (patch.tractor_vehicle_id !== undefined || patch.trailer_vehicle_id !== undefined || patch.driver_id !== undefined) {
      Object.assign(out, await resolveSnapshot({
        tractor_vehicle_id: patch.tractor_vehicle_id ?? null,
        trailer_vehicle_id: patch.trailer_vehicle_id ?? null,
        driver_id: patch.driver_id ?? null,
      }))
    }
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
    gross_weight_kg: l.gross_weight_kg ?? null,
    sales_order_container_id: l.sales_order_container_id || null,
    note: l.note || null,
    sort_order: l.sort_order ?? i,
  }
}

// GW người ra lệnh nhập → ghi ngược về container của đơn hàng (để Packing List/B/L dùng đúng).
// Best-effort: lỗi không làm hỏng việc lưu lệnh.
async function pushGrossToContainer(l: DispatchLineInput): Promise<void> {
  if (!l.sales_order_container_id || l.gross_weight_kg == null) return
  try {
    await supabase.from('sales_order_containers')
      .update({ gross_weight_kg: l.gross_weight_kg })
      .eq('id', l.sales_order_container_id)
  } catch { /* best-effort */ }
}

async function addLine(orderId: string, line: DispatchLineInput): Promise<DispatchLine> {
  const { data, error } = await supabase.from('dispatch_order_lines').insert(lineToRow(orderId, line, 9999)).select('*').single()
  if (error) throw error
  await pushGrossToContainer(line)
  return normalizeLine(data)
}

async function updateLine(lineId: string, patch: DispatchLineInput): Promise<DispatchLine> {
  const out: Record<string, any> = {}
  const keys = ['route', 'lot_code', 'grade', 'container_no', 'seal_no', 'package_count', 'weight_kg', 'gross_weight_kg', 'note', 'sort_order'] as const
  for (const k of keys) {
    if ((patch as any)[k] !== undefined) out[k] = (patch as any)[k] === '' ? null : (patch as any)[k]
  }
  const { data, error } = await supabase.from('dispatch_order_lines').update(out).eq('id', lineId).select('*').single()
  if (error) throw error
  await pushGrossToContainer(patch)
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
 * Trạng thái container coi như ĐÃ RA KHỎI KHO mà không cần dòng lệnh điều động.
 * Hàng đi bằng phiếu cân/xuất kho chỉ set cột status, không sinh dòng lệnh.
 * `loaded` KHÔNG nằm đây: mới lên xe, chưa rời kho.
 *
 * ⚠⚠ DANH SÁCH NÀY TỒN TẠI Ở HAI NƠI, VÀ KHÔNG CÓ CÁCH NÀO GỘP ĐƯỢC:
 *   1. Hằng này — dùng cho getDeliveryStatus (tab Đóng gói, bảng lô, dựng lệnh điều động)
 *      và cho stageOfContainer trong lotTracking.ts.
 *   2. Chuỗi gõ cứng trong docs/migrations/sales_lots_p5_progress_union.sql — view
 *      v_sales_order_lot_progress_all, nuôi getLotProgressForOrders (badge Kanban,
 *      cột "Còn thiếu (tấn)", Sổ lô, file Excel).
 *
 * THÊM MỘT TRẠNG THÁI VÀO ĐÂY MÀ QUÊN SỬA VIEW = tab Đóng gói đổi, badge Kanban không đổi.
 * Đó đúng là kiểu lệch mà Đợt 2 vừa gỡ. Sửa thì sửa CẢ HAI, cùng một lúc.
 */
export const DELIVERED_CONTAINER_STATUSES = ['shipped', 'delivered'] as const

/**
 * ĐỊNH NGHĨA DUY NHẤT "container đã giao". Gộp HAI đường, thiếu một là hai màn hình lệch:
 *  - 'delivered'    = đã cân xuất (dòng lệnh có actual_weight_kg)
 *                     HOẶC container mang status thuộc DELIVERED_CONTAINER_STATUSES
 *                     (đi bằng phiếu cân/xuất kho, không qua lệnh điều động)
 *  - 'dispatching'  = đã vào lệnh nhưng chưa cân
 *  - (không có key) = chưa điều động, chưa giao
 *
 * Ném lỗi nếu truy vấn hỏng — KHÔNG trả về map thiếu. Xem lý do ở trong thân hàm.
 */
async function getDeliveryStatus(containerIds: string[]): Promise<Record<string, DeliveryState>> {
  const map: Record<string, DeliveryState> = {}
  const ids = [...new Set((containerIds || []).filter(Boolean))]
  if (ids.length === 0) return map

  // Chunk 120 cho ĐỒNG BỘ với các hàm khác trong file. Đây là PHÒNG XA, không phải đang
  // chữa lỗi: đơn nhiều container nhất hiện có 25 cont ≈ URL 1.127 ký tự, còn xa ngưỡng
  // ~8.000; điểm gãy khoảng 201 cont/đơn.
  for (let i = 0; i < ids.length; i += 120) {
    const { data, error } = await supabase
      .from('dispatch_order_lines')
      .select('sales_order_container_id, actual_weight_kg')
      .in('sales_order_container_id', ids.slice(i, i + 120))
    // Nuốt lỗi ở đây biến hỏng "tất cả hoặc không" (nhìn là thấy) thành hỏng "thiếu một
    // phần" (trông vẫn hợp lý). Nguy nhất ở buildFromSalesOrder: map thiếu → container ĐÃ
    // GIAO lọt vào lệnh điều động mới mà không ai biết.
    if (error) throw error
    for (const r of (data || []) as Array<{ sales_order_container_id: string | null; actual_weight_kg: number | null }>) {
      const cid = r.sales_order_container_id
      if (!cid) continue
      if (r.actual_weight_kg != null) map[cid] = 'delivered'
      else if (map[cid] !== 'delivered') map[cid] = 'dispatching'
    }
  }

  // ⚠ VẾ THỨ HAI — BẮT BUỘC, nếu không hai màn hình sẽ nói khác nhau.
  // Hàng đi bằng phiếu cân/xuất kho KHÔNG sinh dòng lệnh điều động, mà set thẳng
  // sales_order_containers.status. getLotProgressForOrders đã bù vế này từ lâu, còn hàm
  // này thì chưa — nên badge Kanban và bảng lô tab Đóng gói ăn hai tập "đã giao" KHÁC NHAU.
  //
  // VÌ SAO HÔM NAY CHÚNG VẪN KHỚP (đo 26/08/2026: 92 cont shipped đều nằm trong 133 cont
  // đã cân, 0 ngoại lệ): KHÔNG phải may mắn — dispatchService.markWeighed ghi status
  // 'shipped' NGAY SAU khi ghi actual_weight_kg, nên với đường đó shipped ⊆ đã-cân là
  // quan hệ nhân quả.
  //
  // NGÒI NỔ THẬT nằm ở đường khác: stockOutService.processContainerShipment set 'shipped'
  // mà KHÔNG sinh dòng lệnh, và nó được gọi từ app cân xe với GUARD KHÁC hàm ghi cân
  // (một bên cần đơn bán + container, bên kia cần lệnh điều động + dòng lệnh). Người vận
  // hành chọn đơn và container mà không chọn lệnh là sinh ngay ca lệch.
  for (let i = 0; i < ids.length; i += 120) {
    const { data, error } = await supabase
      .from('sales_order_containers')
      .select('id')
      .in('id', ids.slice(i, i + 120))
      .in('status', DELIVERED_CONTAINER_STATUSES as unknown as string[])
    if (error) throw error
    for (const r of (data || []) as Array<{ id: string }>) {
      map[r.id] = 'delivered'
    }
  }
  return map
}

/**
 * Các LỆNH ĐIỀU ĐỘNG đã chở những container này — để tab Đóng gói hiện chip bấm
 * được: thấy "đã giao" là biết luôn đi bằng lệnh nào, khỏi mò sang module Vận tải.
 */
async function getDispatchOrdersForContainers(containerIds: string[]): Promise<Array<{ id: string; code: string }>> {
  const ids = [...new Set((containerIds || []).filter(Boolean))]
  if (ids.length === 0) return []
  const doIds = new Set<string>()
  for (let i = 0; i < ids.length; i += 120) {
    const { data } = await supabase
      .from('dispatch_order_lines')
      .select('dispatch_order_id')
      .in('sales_order_container_id', ids.slice(i, i + 120))
    for (const r of (data || []) as Array<{ dispatch_order_id: string | null }>) {
      if (r.dispatch_order_id) doIds.add(r.dispatch_order_id)
    }
  }
  if (doIds.size === 0) return []
  const { data } = await supabase
    .from('dispatch_orders')
    .select('id, code')
    .in('id', [...doIds])
  return ((data || []) as Array<{ id: string; code: string }>)
    .sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * Tiến độ lô của 1 đơn — cho danh sách (3 view) + cột "Còn thiếu (tấn)" + dòng TỔNG.
 * KL để ở KG (nguồn gốc); quy ra tấn bằng deliveredTons()/remainingTons() bên dưới,
 * để MÀN HÌNH và EXCEL luôn dùng CHUNG một công thức (không thể lệch nhau).
 */
/**
 * Tiến độ GIAO của MỘT lô. Đã được tính sẵn trong vòng lặp, trước đây bị vứt đi.
 *
 * ⚠ netKg* là KHỐI LƯỢNG, KHÔNG phải mẫu số tiền. Tuyệt đối không nhân nó với đơn giá
 * để ra "trị giá lô" — đó đúng là bug prorata đã gỡ 26/08/2026 (HA20260059 lô 1 ra
 * $473.760 thay vì $50.820 trên Invoice). Mẫu số tiền duy nhất là
 * sales_order_lots.value_usd, đọc qua salesLotService / v_sales_order_lot_payments.
 * Lý do sâu hơn: net_weight_kg bị containerService._recalcContainerTotals ghi đè mỗi
 * lần gán container, nên nó ĐỔI sau khi hoá đơn đã phát cho khách.
 */
export interface LotProgressRow {
  lotNo: number
  contsTotal: number
  contsDelivered: number
  netKgTotal: number
  netKgDelivered: number
}

export interface LotProgress {
  contsTotal: number
  contsDelivered: number
  lotsTotal: number
  lotsDelivered: number
  /**
   * Chi tiết GIAO HÀNG của từng lô, sắp theo số lô tăng dần. Cho phép vẽ dải chip lô mà
   * KHÔNG cần thêm truy vấn nào — dữ liệu vốn đã có trong cùng vòng lặp.
   *
   * Tên là `deliveryByLot` chứ không phải `lots` là CỐ Ý: getLotBreakdown() cũng trả một
   * mảng tên `lots` nhưng đó là TIỀN theo lô. KanbanCard cầm đồng thời cả hai; hai mảng
   * cùng tên cạnh nhau là công thức để đọc nhầm.
   *
   * Chỉ chứa lô ĐÃ gán lot_no. Phần chưa gán nằm ở contsNoLot / netKgNoLot, để bất biến
   * tự phát biểu:  Σ contsTotal + contsNoLot === contsTotal của đơn
   *                Σ netKgTotal + netKgNoLot === plannedKg
   */
  deliveryByLot: LotProgressRow[]
  /** Container chưa gán lô — đo 27/08/2026: 107/212 cont. Không có nó thì tổng cấp lô không khớp đơn. */
  contsNoLot: number
  contsNoLotDelivered: number
  netKgNoLot: number
  netKgNoLotDelivered: number
  plannedKg: number           // Σ net_weight_kg của MỌI container trong đơn
  deliveredKg: number         // Σ net_weight_kg của container ĐÃ giao
  contsWithKg: number         // số container CÓ net_weight_kg (để ước lượng)
  deliveredContsNoKg: number  // container đã giao nhưng CHƯA nhập net_weight_kg
  /** Lệnh điều động đã chở container của đơn này → cho bấm nhảy sang xem. */
  dispatchOrders: Array<{ id: string; code: string }>
}

/** Trạng thái đơn coi như ĐÃ GIAO XONG → không còn thiếu gì nữa. */
const DELIVERED_ORDER_STATUSES = new Set(['delivered', 'shipped', 'invoiced', 'paid'])

/**
 * KL đã giao (tấn). `estimated` = có container đã giao mà chưa nhập KL → phải ước lượng.
 * KL lấy net_weight_kg (KL hàng trong cont) — KHÔNG lấy actual_weight_kg của cân
 * (số cân gồm cả pallet/bao bì). actual_weight_kg chỉ là CỜ "đã cân = đã giao".
 */
export function deliveredTons(
  qtyTons?: number | null, p?: LotProgress, status?: string | null,
): { tons: number; estimated: boolean } {
  const q = qtyTons || 0
  // ĐÃ GIAO XONG (theo trạng thái đơn, hoặc mọi container đã giao) → coi như giao ĐỦ
  // hợp đồng. BẮT BUỘC: 38 đơn giao qua phiếu cân/xuất kho không có dữ liệu container
  // → nếu để "đã giao = 0" thì banner ra "SL 100 · Đã giao 0 · Còn thiếu 0", cộng không
  // khớp. Kẹp ở đây để LUÔN có: SL = Đã giao + Còn thiếu.
  if ((status && DELIVERED_ORDER_STATUSES.has(status)) ||
      (p && p.contsTotal > 0 && p.contsDelivered === p.contsTotal)) {
    return { tons: q, estimated: false }
  }
  if (!p || p.contsTotal === 0) return { tons: 0, estimated: false }
  const known = (p.deliveredKg || 0) / 1000
  if (!p.deliveredContsNoKg) return { tons: known, estimated: false }
  // Ước lượng cho cont đã giao mà thiếu KL: ưu tiên KL TB của các cont ĐÃ CÓ KL;
  // nếu cả đơn chưa cont nào có KL thì mới chia đều theo SL hợp đồng.
  const avg = p.contsWithKg > 0
    ? (p.plannedKg / p.contsWithKg) / 1000
    : (qtyTons || 0) / p.contsTotal
  return { tons: known + p.deliveredContsNoKg * avg, estimated: true }
}

/**
 * KL còn thiếu (tấn) = SL hợp đồng − đã giao, KẸP về 0 khi:
 *  - đơn đã ở trạng thái giao xong (delivered/shipped/invoiced/paid), HOẶC
 *  - mọi container của đơn đã giao.
 * ⚠ BẮT BUỘC: 38 đơn đã giao xong KHÔNG có dòng lệnh điều động (giao qua phiếu cân /
 *   xuất kho, hoặc giao trước khi có module Lệnh điều động). Không kẹp theo trạng thái
 *   thì chúng bị tính thiếu NGUYÊN hợp đồng → tổng "còn thiếu" thổi phồng.
 */
export function remainingTons(qtyTons?: number | null, p?: LotProgress, status?: string | null): number {
  // deliveredTons đã tự kẹp "giao đủ" cho 2 trường hợp trên → luôn có SL = Đã giao + Còn thiếu.
  return Math.max(0, (qtyTons || 0) - deliveredTons(qtyTons, p, status).tons)
}

/**
 * Tiến độ lô CHO NHIỀU ĐƠN cùng lúc — dùng ở list/kanban/split + dòng TỔNG + Excel.
 *
 * Luật "đã giao" KHÔNG nằm ở file này nữa, nó nằm trong view
 * v_sales_order_lot_progress_all (docs/migrations/sales_lots_p5_progress_union.sql):
 *   container ĐÃ GIAO = có dòng lệnh điều động với actual_weight_kg != null,
 *                       HOẶC status ∈ ('shipped','delivered')
 * Xem cảnh báo ở DELIVERED_CONTAINER_STATUSES: danh sách trạng thái tồn tại ở HAI nơi.
 *
 *  - 1 lô "đã giao" khi mọi container của lô đã giao.
 */
async function getLotProgressForOrders(orderIds: string[]): Promise<Record<string, LotProgress>> {
  const out: Record<string, LotProgress> = {}
  const ids = [...new Set((orderIds || []).filter(Boolean))]
  if (ids.length === 0) return out

  // ─── ĐỌC TỪ VIEW, KHÔNG TỰ TÍNH ─────────────────────────────────────────────
  // Trước 26/08/2026 hàm này chạy 3 vòng gọi mạng NỐI TIẾP (container → dòng lệnh xe →
  // mã lệnh), mỗi vòng lại chunk, tổng cộng tới 5 request cho một lần mở danh sách.
  // Nay còn 2 truy vấn chạy SONG SONG, và quan trọng hơn: luật "đã giao" nằm TRỌN trong
  // migration sales_lots_p5_progress_union.sql thay vì được chép lại bằng TypeScript.
  //
  // ⚠ Đơn KHÔNG có container sẽ không có khoá trong kết quả — giống hệt bản cũ.
  // Nơi gọi phải chịu được `undefined` (KanbanCard đang kiểm `lp && lp.contsTotal > 0`).
  // Mọi cột số khai `number | string` và đi qua n(): PostgREST hôm nay trả `numeric` dưới
  // dạng số không ngoặc kép (đã kiểm raw JSON), nhưng đủ kiểu cấu hình/phiên bản trả về
  // chuỗi — và `+=` trên chuỗi là NỐI CHUỖI chứ không báo lỗi. salesLotService cũng bọc
  // num() cho cả họ view này; giữ nhất quán.
  type ProgRow = {
    sales_order_id: string
    lot_no: number | null
    container_count: number | string
    containers_delivered: number | string
    net_kg_total: number | string
    net_kg_delivered: number | string
    conts_with_kg: number | string
    delivered_conts_no_kg: number | string
  }
  type CodeRow = { sales_order_id: string; dispatch_orders: Array<{ id: string; code: string }> | null }

  async function chunked<T>(run: (slice: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
    const acc: T[] = []
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await run(ids.slice(i, i + 100))
      // Ném lỗi thay vì trả kết quả thiếu: thiếu một phần thì con số "còn thiếu (tấn)"
      // vẫn hiện ra và trông hợp lý, không ai biết là sai.
      if (error) throw error
      acc.push(...((data || []) as T[]))
    }
    return acc
  }

  const [progRows, codeRows] = await Promise.all([
    chunked<ProgRow>((s) => supabase
      .from('v_sales_order_lot_progress_all')
      .select('sales_order_id, lot_no, container_count, containers_delivered, net_kg_total, net_kg_delivered, conts_with_kg, delivered_conts_no_kg')
      .in('sales_order_id', s)),
    chunked<CodeRow>((s) => supabase
      .from('v_sales_order_dispatch_codes')
      .select('sales_order_id, dispatch_orders')
      .in('sales_order_id', s)),
  ])

  const codesByOrder = new Map<string, Array<{ id: string; code: string }>>()
  for (const r of codeRows) {
    if (Array.isArray(r.dispatch_orders)) codesByOrder.set(r.sales_order_id, r.dispatch_orders)
  }

  // Gom các rổ (lô, và rổ lot_no NULL) về từng đơn.
  const byOrder = new Map<string, ProgRow[]>()
  for (const r of progRows) {
    if (!byOrder.has(r.sales_order_id)) byOrder.set(r.sales_order_id, [])
    byOrder.get(r.sales_order_id)!.push(r)
  }

  const n = (v: number | string | null | undefined): number => Number(v ?? 0)

  for (const [oid, buckets] of byOrder) {
    let contsTotal = 0, contsDelivered = 0, plannedKg = 0, deliveredKg = 0
    let contsWithKg = 0, deliveredContsNoKg = 0
    let contsNoLot = 0, contsNoLotDelivered = 0, netKgNoLot = 0, netKgNoLotDelivered = 0
    const lotRows: LotProgressRow[] = []

    for (const b of buckets) {
      contsTotal += n(b.container_count)
      contsDelivered += n(b.containers_delivered)
      plannedKg += n(b.net_kg_total)
      deliveredKg += n(b.net_kg_delivered)
      contsWithKg += n(b.conts_with_kg)
      deliveredContsNoKg += n(b.delivered_conts_no_kg)

      if (b.lot_no == null) {
        contsNoLot = n(b.container_count)
        contsNoLotDelivered = n(b.containers_delivered)
        netKgNoLot = n(b.net_kg_total)
        netKgNoLotDelivered = n(b.net_kg_delivered)
      } else {
        lotRows.push({
          lotNo: b.lot_no,
          contsTotal: n(b.container_count),
          contsDelivered: n(b.containers_delivered),
          netKgTotal: n(b.net_kg_total),
          netKgDelivered: n(b.net_kg_delivered),
        })
      }
    }

    lotRows.sort((a, b) => a.lotNo - b.lotNo)   // vị trí là danh tính của lô

    out[oid] = {
      contsTotal,
      contsDelivered,
      lotsTotal: lotRows.length,
      lotsDelivered: lotRows.filter((L) => L.contsTotal > 0 && L.contsDelivered === L.contsTotal).length,
      deliveryByLot: lotRows,
      contsNoLot, contsNoLotDelivered, netKgNoLot, netKgNoLotDelivered,
      plannedKg, deliveredKg, contsWithKg, deliveredContsNoKg,
      dispatchOrders: codesByOrder.get(oid) ?? [],
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
    .order('dispatch_date', { ascending: false })
    .limit(100)
  if (error) throw error
  // Ẩn lệnh ĐÃ CÂN XONG (đã gắn phiếu cân) cho đỡ rối — lọc Ở JS để TUYỆT ĐỐI
  // không làm vỡ/rỗng query nếu cột weighbridge_ticket_id vắng/giá trị lạ.
  return (data || [])
    .filter((r: { weighbridge_ticket_id?: string | null }) => !r.weighbridge_ticket_id)
    .map(normalizeOrder)
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
 * Đợt 2 (đi lấy mủ TL→PĐ): sau khi cân XONG ở app cân, gắn phiếu cân vào lệnh
 * → lệnh biến khỏi danh sách chọn ở app cân (listForWeighing lọc weighbridge_ticket_id).
 * Chuyến fetch không có dòng hàng nên không đi qua syncWeighing — dùng hàm này.
 * Idempotent: chỉ set nếu lệnh chưa gắn phiếu nào (phiếu cân đầu tiên thắng).
 */
async function markFetchWeighed(orderId: string, ticketId: string): Promise<void> {
  await supabase
    .from('dispatch_orders')
    .update({ weighbridge_ticket_id: ticketId })
    .eq('id', orderId)
    .is('weighbridge_ticket_id', null)
}

/**
 * Đợt 2 (đi lấy mủ): lấy nhanh SỐ PALLET MANG ĐI của lệnh — dùng cho app cân
 * điền sẵn pallet lần 1. Query GỌN (chỉ 2 cột, KHÔNG đọc dispatch_order_lines /
 * embed sales_orders) qua client dispatchService — client này đọc được
 * dispatch_orders (listForWeighing chứng minh). Lỗi → trả 0 (không chặn cân).
 */
async function getFetchPallet(orderId: string): Promise<{ plastic: number; steel: number }> {
  const { data, error } = await supabase
    .from('dispatch_orders')
    .select('pallet_plastic_out, pallet_steel_out')
    .eq('id', orderId)
    .maybeSingle()
  if (error) { console.warn('[getFetchPallet]', error.message); return { plastic: 0, steel: 0 } }
  return {
    plastic: Number((data as any)?.pallet_plastic_out || 0),
    steel: Number((data as any)?.pallet_steel_out || 0),
  }
}

/**
 * 4-lần-cân: TÂN LÂM cân xong (cân 2+3) → ghi KL mủ TL + pallet CÒN TRÊN XE rời TL
 * vào lệnh. KHÔNG ẩn lệnh (PĐ còn cân lần về). pallet_return dùng cho PĐ cân lần 2.
 */
async function saveTlWeigh(orderId: string, p: {
  ticketId: string; netKg: number; palletPlastic: number; palletSteel: number; weighedAt: string
}): Promise<void> {
  const kg = (p.palletPlastic || 0) * 10 + (p.palletSteel || 0) * 50
  await supabase.from('dispatch_orders').update({
    tl_ticket_id: p.ticketId,
    tl_net_kg: p.netKg,
    tl_weighed_at: p.weighedAt,
    pallet_plastic_return: p.palletPlastic || 0,
    pallet_steel_return: p.palletSteel || 0,
    pallet_kg_return: kg,
  }).eq('id', orderId)
}

/**
 * Xe container: TL không cân được → đánh dấu bỏ cân TL (chỉ PĐ cân).
 * Vẫn LƯU số pallet CÒN TRÊN XE rời TL (đếm tay, không cân) để PĐ đối chiếu.
 */
async function markTlSkipped(orderId: string, pallet?: { plastic: number; steel: number }): Promise<void> {
  const upd: Record<string, any> = { fetch_tl_skipped: true }
  if (pallet) {
    upd.pallet_plastic_return = pallet.plastic || 0
    upd.pallet_steel_return = pallet.steel || 0
    upd.pallet_kg_return = (pallet.plastic || 0) * 10 + (pallet.steel || 0) * 50
  }
  await supabase.from('dispatch_orders').update(upd).eq('id', orderId)
}

/** 4-lần-cân: PHONG ĐIỀN cân về xong (cân 4) → ghi KL mủ PĐ vào lệnh. */
async function savePdWeigh(orderId: string, netKg: number, weighedAt: string): Promise<void> {
  await supabase.from('dispatch_orders').update({
    pd_net_kg: netKg,
    pd_weighed_at: weighedAt,
  }).eq('id', orderId)
}

/** PĐ cân lần 2 đọc pallet RỜI TL (TL đã khai) để điền sẵn + KL mủ TL để đối chiếu. */
async function getFetchReturnPallet(orderId: string): Promise<{ plastic: number; steel: number; tlNetKg: number | null }> {
  const { data, error } = await supabase
    .from('dispatch_orders')
    .select('pallet_plastic_return, pallet_steel_return, tl_net_kg')
    .eq('id', orderId)
    .maybeSingle()
  if (error) { console.warn('[getFetchReturnPallet]', error.message); return { plastic: 0, steel: 0, tlNetKg: null } }
  return {
    plastic: Number((data as any)?.pallet_plastic_return || 0),
    steel: Number((data as any)?.pallet_steel_return || 0),
    tlNetKg: (data as any)?.tl_net_kg != null ? Number((data as any).tl_net_kg) : null,
  }
}

/** Báo cáo đi lấy mủ: danh sách chuyến fetch_mu (kèm pallet + KL 2 trạm) để tổng hợp + sổ pallet. */
async function listFetchReport(params: { date_from?: string; date_to?: string } = {}): Promise<DispatchOrder[]> {
  let q = supabase.from('dispatch_orders').select(ORDER_SELECT)
    .eq('trip_type', 'fetch_mu')
    .order('dispatch_date', { ascending: false })
    .limit(500)
  if (params.date_from) q = q.gte('dispatch_date', params.date_from)
  if (params.date_to) q = q.lte('dispatch_date', params.date_to)
  const { data, error } = await q
  if (error) throw error
  return (data || []).map(normalizeOrder)
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
      gross_weight_kg: c.gross_weight_kg != null ? Number(c.gross_weight_kg) : null, // prefill nếu container đã có GW
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
  contract_no: string | null
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
        contract_no: so.contract_no || null,
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
    gross_weight_kg: row.gross_weight_kg != null ? Number(row.gross_weight_kg) : null,
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
  markFetchWeighed,
  getFetchPallet,
  saveTlWeigh,
  savePdWeigh,
  markTlSkipped,
  getFetchReturnPallet,
  listFetchReport,
  markWeighed,
  getDeliveryStatus,
  getLotProgressForOrders,
  getDispatchOrdersForContainers,
}

export default dispatchService

export type { FleetVehicle, FleetDriver }
