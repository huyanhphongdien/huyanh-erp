// ============================================================================
// RETAIL TICKET SERVICE — tạo/đọc/huỷ phiếu CÂN MỦ LẺ
// File: apps/retail-scale/src/services/retailTicketService.ts
//
// MÔ HÌNH DỮ LIỆU (đã kiểm chứng trên DB thật 2026-08-21):
//   • Phiếu     = 1 row `weighbridge_tickets` với ticket_type='retail', status='completed'
//   • Từng bao  = N row `weighbridge_ticket_lots` (bảng này đã mở quyền cho role anon)
//
// VÌ SAO KHÔNG DÙNG weighbridgeService.create():
//   Hàm đó thiết kế cho CÂN 2 LẦN (weighing_gross → weighing_tare → complete), insert 9 cột
//   rồi phải UPDATE thêm 5-7 lần. Cân mủ lẻ là CÂN 1 LẦN, đã biết hết số liệu ngay khi bấm
//   Lưu ⇒ insert MỘT PHÁT đủ cột, không để phiếu ở trạng thái nửa vời nếu update sau lỗi.
//
// BA THỨ TUYỆT ĐỐI KHÔNG ĐƯỢC ĐỔI (mỗi thứ đều có trigger/luồng tiền phía sau):
//   1. has_items = false → trigger trg_ticket_allocate_on_weigh KHÔNG chạy. Nếu bật true,
//      trigger sẽ GHI ĐÈ khối lượng từng dòng theo tỷ lệ prorata và xoá mất số cân thật.
//   2. net_weight = Σ net_kg các bao (đã trừ bì). Đề nghị thanh toán đọc net_weight của
//      HEADER, không cộng từ bảng con — ghi thiếu là kế toán chi 0 đồng.
//   3. facility_id + rubber_type + price_unit + unit_price PHẢI có đủ. Màn gom Đề nghị
//      thanh toán bắt buộc chọn nhà máy; thiếu facility_id thì phiếu vĩnh viễn không gom
//      được (đúng lỗi mà intakeWalkinService đang mắc).
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

export interface CreateRetailTicketInput {
  facility_id: string | null
  facility_code: string | null
  /** Tên khách lẻ — KHÔNG bắt buộc CCCD. Ghi vào supplier_name (kế toán lấy làm người nhận tiền). */
  customer_name: string
  customer_phone?: string | null
  /** Chỉ set khi chọn từ danh bạ đối tác đã có (khách quen). Khách vãng lai để null. */
  partner_id?: string | null
  vehicle_plate?: string | null
  rubber_type: string
  unit_price: number
  /** Chỉ dùng cho mủ nước (price_unit='dry'). Mủ tạp để null. */
  drc_percent?: number | null
  lots: RetailLot[]
  notes?: string | null
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
 * Vẫn còn race nếu 2 bàn cân lẻ bấm Lưu trong cùng mili-giây → có retry ở createTicket().
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
 * Tạo phiếu mủ lẻ hoàn chỉnh: 1 ticket + N dòng bao, trả về phiếu đã lưu.
 * Nếu insert dòng bao lỗi → XOÁ phiếu vừa tạo (rollback tay, Supabase client không có
 * transaction) để không để lại phiếu 0 bao trong queue chi tiền.
 */
export async function createRetailTicket(input: CreateRetailTicketInput): Promise<RetailTicket> {
  if (!input.customer_name?.trim()) throw new Error('Chưa nhập tên khách')
  if (!input.lots.length) throw new Error('Chưa cân bao nào')
  if (!(input.unit_price > 0)) throw new Error('Chưa nhập đơn giá')

  // ⚠ CHẶN CỨNG: phiếu KHÔNG có facility_id sẽ VĨNH VIỄN không gom được vào Đề nghị thanh
  // toán — màn gom bắt buộc chọn nhà máy và lọc `.eq('facility_id', ...)`, mà `=` không bao
  // giờ khớp NULL. Khách cầm phiếu mà không ai chi được tiền, chỉ sửa được bằng UPDATE tay.
  // Thà không lưu được và báo lỗi ngay còn hơn in ra một tờ phiếu chết.
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
  const priceUnit = priceUnitFor(input.rubber_type)
  // qc_actual_drc là numeric(5,2) — DB sẽ cắt còn 2 số lẻ. Cắt SỚM ở đây để tiền in cho
  // khách bằng đúng tiền kế toán tính lại từ DRC đã lưu.
  const drc = priceUnit === 'dry' ? normalizeDrc(input.drc_percent) : null
  const { rounded } = computeAmount({
    netKg: netTotal,
    rubberType: input.rubber_type,
    unitPrice: input.unit_price,
    drc,
  })

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
        status: 'completed',
        source_type: 'retail',
        facility_id: input.facility_id,
        // vehicle_plate NOT NULL trên DB → luôn có giá trị, mặc định 'XE MÁY'.
        // .slice SAU .toUpperCase: toUpperCase có thể làm chuỗi dài ra (ß → SS).
        vehicle_plate: (input.vehicle_plate?.trim() || DEFAULT_VEHICLE).toUpperCase().slice(0, 20),
        // Ghi tên khách vào CẢ driver_name lẫn supplier_name: các màn hình cũ của ERP
        // hiển thị driver_name, còn Đề nghị thanh toán lấy supplier_name làm người nhận tiền.
        driver_name: name,
        driver_phone: input.customer_phone?.trim() || null,
        supplier_name: name,
        partner_id: input.partner_id || null,
        rubber_type: input.rubber_type,
        price_unit: priceUnit,
        unit_price: input.unit_price,
        qc_actual_drc: drc,
        gross_weight: grossTotal,
        tare_weight: tareTotal,
        net_weight: netTotal,
        actual_net_weight: netTotal,
        deduction_kg: 0,
        estimated_value: rounded,
        has_items: false,        // ⚠ xem ghi chú đầu file — đổi thành true là mất số cân thật
        allocation_mode: 'by_share',
        notes: input.notes?.trim() || null,
        created_by: input.operator_id || null,
        gross_weighed_by: input.operator_id || null,
        gross_weighed_at: nowIso,
        completed_at: nowIso,
      })
      .select(TICKET_COLS)
      .single()

    if (!error && data) {
      const ticket = data as unknown as RetailTicket
      try {
        await replaceLots(ticket.id, input.rubber_type, input.lots)
      } catch (lotErr) {
        // ROLLBACK TAY (Supabase client không có transaction).
        //
        // ⚠ supabase-js KHÔNG throw khi delete lỗi — nó trả { error }. Nếu bỏ qua kết quả,
        // app sẽ KHẲNG ĐỊNH SAI là "đã huỷ phiếu" trong khi row vẫn nằm đó với đủ
        // net_weight + unit_price + estimated_value và payment_request_id = NULL, tức đủ điều
        // kiện lọt vào queue chi tiền. Thao tác viên bấm Lưu lại → phiếu thứ hai → CHI 2 LẦN.
        // Phải kiểm CẢ error LẪN số dòng thực sự bị xoá (RLS siết lại có thể khớp 0 dòng mà
        // vẫn trả 200/error=null).
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

        // Xoá không được → hạ status xuống 'cancelled'. Đây mới là biện pháp chặn tiền:
        // listAvailableTickets lọc status='completed' nên phiếu cancelled biến khỏi queue chi.
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

        // Không xoá được, cũng không huỷ được → phiếu "ma" còn nguyên tiền trong DB.
        // Gắn `fatalTicketCode` để UI KHOÁ nút Lưu: bấm lại là sinh phiếu thứ hai và kế
        // toán chi 2 lần cho một xe mủ. Đây là nhánh duy nhất KHÔNG được phép thử lại.
        const fatal = new Error(
          `⚠ Phiếu ${ticket.code} ĐÃ TẠO nhưng chưa huỷ được. ĐỪNG bấm Lưu lại — ` +
          `báo kế toán loại phiếu ${ticket.code} khỏi Đề nghị thanh toán. ` +
          `(Lỗi gốc: ${(lotErr as Error).message})`,
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
 * Ghi lại toàn bộ dòng bao của 1 phiếu (xoá hết rồi insert lại).
 * Dùng đúng pattern của app cân xe với weighbridge_ticket_lots — tránh phải đối chiếu
 * từng dòng và tránh lệch sort_order khi khách bỏ bớt bao.
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
 * Danh sách phiếu mủ lẻ.
 * ⚠ Lọc ngày theo mốc GIỜ VN (+07:00). Dùng chuỗi ngày trần như ERP đang làm sẽ để lọt
 * phiếu cân sáng sớm — mà mủ lẻ chủ yếu cân sáng sớm.
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
 * Huỷ phiếu. KHÔNG xoá — giữ dấu vết để đối chiếu cuối ngày.
 * Chặn cứng nếu phiếu đã được gom vào Đề nghị thanh toán: lúc đó tiền đã vào quy trình chi,
 * huỷ ở đây sẽ làm chứng từ kế toán trỏ vào phiếu ma.
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

  // Guard PHẢI nằm trong chính câu UPDATE, không chỉ ở lần đọc phía trên: giữa lúc đọc và
  // lúc ghi còn cả một hộp thoại nhập lý do (vài chục giây) — thừa sức để kế toán gom phiếu
  // này vào Đề nghị thanh toán. Huỷ trúng phiếu đã gom = chứng từ chi trỏ vào phiếu ma.
  // `.select('id')` để phân biệt "đã cập nhật" với "khớp 0 dòng" — không có nó thì UPDATE
  // trượt vẫn báo thành công.
  const { data: updated, error } = await supabase
    .from('weighbridge_tickets')
    .update({
      status: 'cancelled',
      notes: t.notes ? `${t.notes}\n${stamp}` : stamp,
    })
    .eq('id', id)
    .eq('status', 'completed')
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
  createRetailTicket,
  replaceLots,
  getTicket,
  getLots,
  listTickets,
  cancelTicket,
}
