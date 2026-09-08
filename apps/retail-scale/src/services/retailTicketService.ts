// ============================================================================
// RETAIL TICKET SERVICE — tạo/đọc/chốt/huỷ phiếu CÂN MỦ LẺ
// File: apps/retail-scale/src/services/retailTicketService.ts
//
// QUY TRÌNH (owner chốt 2026-09-08): cân xong → CHỜ cán bộ đo DRC → có kết quả → nhập
// DRC + đơn giá → in phiếu. Nhiều hộ có thể chờ song song.
//
// MÔ HÌNH DỮ LIỆU:
//   • Phiếu    = 1 row `weighbridge_tickets`, ticket_type='retail', has_items=false.
//       - status='pending_drc'  → đã cân, CHỜ DRC (chưa giá/tiền, chưa in, KHÔNG lọt Đề
//         nghị thanh toán vì ERP chỉ gom status='completed').
//       - status='completed'    → đã nhập DRC + giá → có thành tiền → in + vào chi tiền.
//   • Từng bao = N row `weighbridge_ticket_lots` (bảng đã mở quyền cho role anon).
//
// TIỀN = kg tươi × DRC% × đơn giá (price_unit='dry'). ERP (paymentRequestService.
// billableWeight) đọc THẲNG price_unit + qc_actual_drc trên phiếu → số chi KHỚP số in.
//
// BA THỨ TUYỆT ĐỐI KHÔNG ĐƯỢC ĐỔI (mỗi thứ có trigger/luồng tiền phía sau):
//   1. has_items = false → trigger trg_ticket_allocate_on_weigh KHÔNG chạy (bật true là
//      nó ghi đè khối lượng từng dòng theo prorata, xoá mất số cân thật).
//   2. net_weight = Σ net_kg các bao — Đề nghị thanh toán đọc net_weight của HEADER.
//   3. facility_id + rubber_type + price_unit PHẢI có đủ — thiếu là phiếu không gom được.
// ============================================================================

import { supabase } from '@erp/lib/supabase'
import { computeAmount, normalizeDrc, priceUnitFor, DEFAULT_VEHICLE } from '@/lib/retail'

export interface RetailLot {
  gross_kg: number
  tare_kg: number
  net_kg: number
  container_count?: number | null
  container_type?: string | null
  note?: string | null
}

/** Dữ liệu lúc CÂN (chưa có DRC/giá — nhập ở bước chốt). */
export interface CreatePendingTicketInput {
  facility_id: string | null
  facility_code: string | null
  /** Tên khách lẻ — KHÔNG bắt buộc CCCD. Ghi vào supplier_name (kế toán lấy làm người nhận tiền). */
  customer_name: string
  customer_phone?: string | null
  /** Chỉ set khi chọn từ danh bạ đối tác đã có (khách quen). Khách vãng lai để null. */
  partner_id?: string | null
  vehicle_plate?: string | null
  rubber_type: string
  lots: RetailLot[]
  notes?: string | null
  operator_id?: string | null
}

/** Dữ liệu lúc CHỐT DRC (sau khi lab báo kết quả). */
export interface FinalizeTicketInput {
  drc: number
  unit_price: number
  operator_id?: string | null
}

export interface RetailTicket {
  id: string
  code: string
  vehicle_plate: string | null
  driver_name: string | null
  driver_phone: string | null
  supplier_name: string | null
  partner_id: string | null
  rubber_type: string | null
  price_unit: string | null
  unit_price: number | null
  qc_actual_drc: number | null
  gross_weight: number | null
  tare_weight: number | null
  net_weight: number | null
  estimated_value: number | null
  status: string
  notes: string | null
  facility_id: string | null
  payment_request_id: string | null
  completed_at: string | null
  created_at: string
  created_by: string | null
}

export interface RetailTicketLot {
  id: string
  ticket_id: string
  lot_code: string | null
  rubber_type: string | null
  net_kg: number
  gross_kg: number | null
  tare_kg: number
  container_count: number | null
  container_type: string | null
  sort_order: number
  note: string | null
}

const TICKET_COLS = `
  id, code, vehicle_plate, driver_name, driver_phone, supplier_name, partner_id,
  rubber_type, price_unit, unit_price, qc_actual_drc,
  gross_weight, tare_weight, net_weight, estimated_value,
  status, notes, facility_id, payment_request_id, completed_at, created_at, created_by
`

/**
 * Sinh mã phiếu: ML-<MÃ NM>-YYYYMMDD-NNN  (ML = Mủ Lẻ).
 *
 * Cố ý dùng prefix RIÊNG, không dùng CX- của cân xe: generateCode của cân xe đếm bằng
 * SELECT-max-rồi-+1 (không có sequence), 2 app cùng đếm trên 1 prefix là đụng mã.
 *
 * Vẫn còn race nếu 2 bàn cân lẻ bấm Lưu trong cùng mili-giây → có retry ở createPendingTicket().
 */
async function generateCode(facilityCode?: string | null): Promise<string> {
  const now = new Date()
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const fac = (facilityCode || '').toUpperCase().trim()
  const prefix = fac ? `ML-${fac}-${ymd}-` : `ML-${ymd}-`

  const { data, error } = await supabase
    .from('weighbridge_tickets')
    .select('code')
    .like('code', `${prefix}%`)
    .order('code', { ascending: false })
    .limit(1)

  if (error) throw error

  let next = 1
  if (data && data.length > 0) {
    const last = parseInt(String(data[0].code).split('-').pop() || '0', 10)
    if (Number.isFinite(last)) next = last + 1
  }
  return `${prefix}${String(next).padStart(3, '0')}`
}

function sum(nums: number[]): number {
  // Làm tròn 2 số lẻ để không tích luỹ sai số dấu phẩy động qua 20-30 bao.
  return Math.round(nums.reduce((s, n) => s + (Number(n) || 0), 0) * 100) / 100
}

/**
 * Tạo phiếu mủ lẻ Ở TRẠNG THÁI CHỜ DRC (status='pending_drc'): đã cân xong các bao nhưng
 * CHƯA có DRC/đơn giá/thành tiền → CHƯA in, CHƯA lọt vào Đề nghị thanh toán (ERP chỉ gom
 * status='completed'). Cán bộ đo DRC xong → gọi finalizeTicket() để chốt.
 *
 * 1 ticket + N dòng bao. Rollback tay nếu insert dòng bao lỗi (Supabase không có transaction).
 */
export async function createPendingTicket(input: CreatePendingTicketInput): Promise<RetailTicket> {
  if (!input.customer_name?.trim()) throw new Error('Chưa nhập tên khách')
  if (!input.lots.length) throw new Error('Chưa cân bao nào')

  // ⚠ CHẶN CỨNG: phiếu KHÔNG có facility_id sẽ VĨNH VIỄN không gom được vào Đề nghị thanh
  // toán — màn gom bắt buộc chọn nhà máy và lọc `.eq('facility_id', ...)`, mà `=` không bao
  // giờ khớp NULL. Thà không lưu được và báo lỗi ngay còn hơn tạo một phiếu chết.
  if (!input.facility_id) {
    throw new Error(
      'Chưa xác định được nhà máy — KHÔNG lưu phiếu (phiếu thiếu nhà máy sẽ không gom được ' +
      'vào Đề nghị thanh toán). Kiểm tra kết nối mạng và biến VITE_FACILITY_CODE.',
    )
  }

  // Dòng bao có khối lượng thực ≤ 0 (bì ≥ số cân) làm TỔNG kg và tiền in cho khách THẤP hơn
  // thực tế. Chặn theo TỪNG dòng, không chỉ kiểm tổng.
  const badLot = input.lots.findIndex(l => !((Number(l.net_kg) || 0) > 0))
  if (badLot >= 0) {
    throw new Error(`Bao ${badLot + 1} có khối lượng thực ≤ 0 — kiểm tra lại số cân / bì`)
  }

  const netTotal = sum(input.lots.map(l => l.net_kg))
  if (!(netTotal > 0)) throw new Error('Tổng khối lượng phải lớn hơn 0')

  const grossTotal = sum(input.lots.map(l => l.gross_kg))
  const tareTotal = sum(input.lots.map(l => l.tare_kg))
  const nowIso = new Date().toISOString()
  const name = input.customer_name.trim()

  // Thử tối đa 3 lần nếu đụng mã (2 bàn cân bấm Lưu cùng lúc).
  let lastErr: unknown = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = await generateCode(input.facility_code)
    const { data, error } = await supabase
      .from('weighbridge_tickets')
      .insert({
        code,
        ticket_type: 'retail',
        status: 'pending_drc',   // ⏳ CHỜ DRC — ERP chỉ gom 'completed' nên chưa lọt vào chi tiền
        source_type: 'retail',
        facility_id: input.facility_id,
        // vehicle_plate NOT NULL trên DB → luôn có giá trị, mặc định 'XE MÁY'.
        vehicle_plate: (input.vehicle_plate?.trim() || DEFAULT_VEHICLE).toUpperCase().slice(0, 20),
        // Ghi tên khách vào CẢ driver_name lẫn supplier_name: màn cũ ERP hiện driver_name,
        // còn Đề nghị thanh toán lấy supplier_name làm người nhận tiền.
        driver_name: name,
        driver_phone: input.customer_phone?.trim() || null,
        supplier_name: name,
        partner_id: input.partner_id || null,
        rubber_type: input.rubber_type,
        price_unit: priceUnitFor(input.rubber_type),   // 'dry' — trả theo mủ khô
        unit_price: 0,                 // nhập ở bước chốt DRC
        qc_actual_drc: null,           // nhập ở bước chốt DRC
        gross_weight: grossTotal,
        tare_weight: tareTotal,
        net_weight: netTotal,
        actual_net_weight: netTotal,
        deduction_kg: 0,
        estimated_value: 0,            // tính ở bước chốt DRC
        has_items: false,             // ⚠ xem ghi chú đầu file — đổi thành true là mất số cân thật
        allocation_mode: 'by_share',
        notes: input.notes?.trim() || null,
        created_by: input.operator_id || null,
        gross_weighed_by: input.operator_id || null,
        gross_weighed_at: nowIso,
        completed_at: null,           // CHƯA hoàn tất
      })
      .select(TICKET_COLS)
      .single()

    if (!error && data) {
      const ticket = data as unknown as RetailTicket
      try {
        await replaceLots(ticket.id, input.rubber_type, input.lots)
      } catch (lotErr) {
        // ROLLBACK TAY (Supabase client không có transaction).
        // ⚠ supabase-js KHÔNG throw khi delete lỗi — nó trả { error }. Phải kiểm CẢ error LẪN
        // số dòng thực sự bị xoá (RLS siết lại có thể khớp 0 dòng mà vẫn trả 200/error=null).
        const { data: gone, error: delErr } = await supabase
          .from('weighbridge_tickets')
          .delete()
          .eq('id', ticket.id)
          .select('id')

        if (!delErr && Array.isArray(gone) && gone.length === 1) {
          throw new Error(
            `Lưu chi tiết bao thất bại nên đã huỷ phiếu ${ticket.code}: ${(lotErr as Error).message}`,
          )
        }

        // Xoá không được → hạ status xuống 'cancelled' (biến khỏi mọi queue).
        const { data: cancelled } = await supabase
          .from('weighbridge_tickets')
          .update({ status: 'cancelled', notes: 'TỰ HUỶ: lưu chi tiết bao thất bại' })
          .eq('id', ticket.id)
          .select('id')

        if (Array.isArray(cancelled) && cancelled.length === 1) {
          throw new Error(
            `Lưu chi tiết bao thất bại, đã huỷ phiếu ${ticket.code}: ${(lotErr as Error).message}`,
          )
        }

        // Không xoá được, cũng không huỷ được → phiếu "ma" còn nguyên trong DB. Gắn
        // fatalTicketCode để UI KHOÁ nút Lưu (phiếu chờ chưa có tiền nên rủi ro thấp hơn phiếu
        // completed, nhưng vẫn không cho bấm lại kẻo sinh phiếu thứ hai).
        const fatal = new Error(
          `⚠ Phiếu ${ticket.code} ĐÃ TẠO nhưng chưa huỷ được. ĐỪNG bấm Lưu lại — ` +
          `báo kỹ thuật gỡ phiếu ${ticket.code}. (Lỗi gốc: ${(lotErr as Error).message})`,
        ) as Error & { fatalTicketCode?: string }
        fatal.fatalTicketCode = ticket.code
        throw fatal
      }
      return ticket
    }

    lastErr = error
    // 23505 = trùng khoá (mã phiếu). Chỉ trường hợp này mới thử lại.
    const isDuplicate = (error as { code?: string } | null)?.code === '23505'
    if (!isDuplicate) break
  }

  throw new Error(`Không tạo được phiếu: ${(lastErr as Error | null)?.message || 'lỗi không rõ'}`)
}

/**
 * CHỐT DRC + đơn giá cho phiếu đang chờ → tính tiền → chuyển 'completed' (mới in + vào chi tiền).
 * Guard nằm TRONG câu UPDATE (.eq('status','pending_drc')) để không chốt trùng khi 2 màn cùng mở.
 */
export async function finalizeTicket(id: string, input: FinalizeTicketInput): Promise<RetailTicket> {
  if (!(input.unit_price > 0)) throw new Error('Chưa nhập đơn giá')

  const t = await getTicket(id)
  if (!t) throw new Error('Không tìm thấy phiếu')
  if (t.status === 'completed') throw new Error('Phiếu đã chốt DRC + in rồi')
  if (t.status === 'cancelled') throw new Error('Phiếu đã huỷ')
  if (t.status !== 'pending_drc') throw new Error(`Phiếu không ở trạng thái chờ DRC (đang: ${t.status})`)

  const priceUnit = priceUnitFor(t.rubber_type)          // 'dry'
  const drc = priceUnit === 'dry' ? normalizeDrc(input.drc) : null
  if (priceUnit === 'dry' && !(drc && drc > 0)) throw new Error('Phải nhập DRC % (lớn hơn 0)')

  const net = Number(t.net_weight) || 0
  const { rounded } = computeAmount({
    netKg: net,
    rubberType: t.rubber_type,
    unitPrice: input.unit_price,
    drc,
  })

  const nowIso = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('weighbridge_tickets')
    .update({
      status: 'completed',
      price_unit: priceUnit,
      unit_price: input.unit_price,
      qc_actual_drc: drc,
      qc_drc_source: 'manual',
      estimated_value: rounded,
      completed_at: nowIso,
    })
    .eq('id', id)
    .eq('status', 'pending_drc')
    .is('payment_request_id', null)
    .select(TICKET_COLS)

  if (error) throw error
  if (!updated || updated.length === 0) {
    throw new Error('Không chốt được: phiếu vừa bị chốt/huỷ ở nơi khác. Bấm Tải lại để xem trạng thái mới.')
  }
  return updated[0] as unknown as RetailTicket
}

/**
 * Ghi lại toàn bộ dòng bao của 1 phiếu (xoá hết rồi insert lại).
 */
export async function replaceLots(ticketId: string, rubberType: string, lots: RetailLot[]): Promise<void> {
  const { error: delErr } = await supabase
    .from('weighbridge_ticket_lots')
    .delete()
    .eq('ticket_id', ticketId)
  if (delErr) throw delErr

  if (!lots.length) return

  const rows = lots.map((l, i) => ({
    ticket_id: ticketId,
    lot_code: `Bao ${i + 1}`,
    rubber_type: rubberType,
    gross_kg: l.gross_kg,
    tare_kg: l.tare_kg ?? 0,
    net_kg: l.net_kg,
    container_count: l.container_count ?? null,
    container_type: l.container_type ?? null,
    sort_order: i + 1,
    is_derived: false,
    note: l.note ?? null,
  }))

  const { error } = await supabase.from('weighbridge_ticket_lots').insert(rows)
  if (error) throw error
}

export async function getTicket(id: string): Promise<RetailTicket | null> {
  const { data, error } = await supabase
    .from('weighbridge_tickets')
    .select(TICKET_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as RetailTicket) || null
}

export async function getLots(ticketId: string): Promise<RetailTicketLot[]> {
  const { data, error } = await supabase
    .from('weighbridge_ticket_lots')
    .select('id, ticket_id, lot_code, rubber_type, net_kg, gross_kg, tare_kg, container_count, container_type, sort_order, note')
    .eq('ticket_id', ticketId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data || []) as unknown as RetailTicketLot[]
}

export interface ListParams {
  facility_id?: string | null
  date?: string | null       // YYYY-MM-DD theo giờ VN
  search?: string
  includeCancelled?: boolean
  limit?: number
}

/**
 * Danh sách phiếu mủ lẻ trong 1 ngày.
 * ⚠ Lọc ngày theo mốc GIỜ VN (+07:00) — mủ lẻ chủ yếu cân sáng sớm.
 */
export async function listTickets(params: ListParams = {}): Promise<RetailTicket[]> {
  let q = supabase
    .from('weighbridge_tickets')
    .select(TICKET_COLS)
    .eq('ticket_type', 'retail')
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 200)

  if (params.facility_id) q = q.eq('facility_id', params.facility_id)
  if (!params.includeCancelled) q = q.neq('status', 'cancelled')
  if (params.date) {
    q = q.gte('created_at', `${params.date}T00:00:00+07:00`)
    q = q.lte('created_at', `${params.date}T23:59:59.999+07:00`)
  }

  const { data, error } = await q
  if (error) throw error
  let rows = (data || []) as unknown as RetailTicket[]

  const s = params.search?.trim().toLowerCase()
  if (s) {
    rows = rows.filter(t =>
      [t.code, t.supplier_name, t.driver_phone, t.vehicle_plate]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(s)),
    )
  }
  return rows
}

/**
 * Phiếu ĐANG CHỜ DRC — KHÔNG lọc ngày: phiếu cân hôm qua mà nay mới có DRC vẫn phải hiện,
 * đừng để mắc kẹt ngoài danh sách. Sắp cũ → mới để hộ chờ lâu nhất lên đầu.
 */
export async function listPendingDrc(facilityId?: string | null): Promise<RetailTicket[]> {
  let q = supabase
    .from('weighbridge_tickets')
    .select(TICKET_COLS)
    .eq('ticket_type', 'retail')
    .eq('status', 'pending_drc')
    .order('created_at', { ascending: true })
    .limit(200)
  if (facilityId) q = q.eq('facility_id', facilityId)
  const { data, error } = await q
  if (error) throw error
  return (data || []) as unknown as RetailTicket[]
}

/**
 * Huỷ phiếu. KHÔNG xoá — giữ dấu vết để đối chiếu cuối ngày. Huỷ được cả phiếu chờ DRC lẫn
 * phiếu completed CHƯA vào Đề nghị thanh toán. Đã vào ĐNTT thì chặn.
 */
export async function cancelTicket(id: string, reason: string, operatorId?: string | null): Promise<void> {
  if (!reason?.trim()) throw new Error('Phải nhập lý do huỷ')

  const t = await getTicket(id)
  if (!t) throw new Error('Không tìm thấy phiếu')
  if (t.payment_request_id) {
    throw new Error('Phiếu đã nằm trong Đề nghị thanh toán — báo kế toán gỡ khỏi đề nghị trước khi huỷ.')
  }
  if (t.status === 'cancelled') return

  const stamp = `[HUỶ ${new Date().toLocaleString('vi-VN')}${operatorId ? ` bởi ${operatorId}` : ''}] ${reason.trim()}`

  // Guard PHẢI nằm trong chính câu UPDATE: giữa lúc đọc và lúc ghi còn cả hộp thoại nhập lý do
  // (vài chục giây) — thừa sức để kế toán gom phiếu này vào Đề nghị thanh toán. Cho phép huỷ
  // cả 'completed' lẫn 'pending_drc'. `.select('id')` để phân biệt "đã cập nhật" với "0 dòng".
  const { data: updated, error } = await supabase
    .from('weighbridge_tickets')
    .update({
      status: 'cancelled',
      notes: t.notes ? `${t.notes}\n${stamp}` : stamp,
    })
    .eq('id', id)
    .in('status', ['completed', 'pending_drc'])
    .is('payment_request_id', null)
    .select('id')

  if (error) throw error
  if (!updated || updated.length === 0) {
    throw new Error(
      'Không huỷ được: phiếu vừa được gom vào Đề nghị thanh toán hoặc đã huỷ trước đó. ' +
      'Bấm Tải lại để xem trạng thái mới nhất.',
    )
  }
}

export default {
  createPendingTicket,
  finalizeTicket,
  replaceLots,
  getTicket,
  getLots,
  listTickets,
  listPendingDrc,
  cancelTicket,
}
