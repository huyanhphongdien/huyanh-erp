// ============================================================================
// DOCUMENT SERVICE — Generate export documents: COA, Packing List, Invoice
// File: src/services/sales/documentService.ts
// Module Ban hang quoc te — Huy Anh Rubber ERP
//
// Đơn mua tiếp + Các bên (sales_family_parties_p1, 17/11/2026):
//   • BUYER luôn là người mua · CONSIGNEE/NOTIFY + tên NH dự phòng (bank_hint) theo MỘT hàm resolveOrderParties
//   • Ô "CONTRACT NO." = contractNoForDocs (đợt mua tiếp in số HĐ gốc); SỐ CHỨNG TỪ (PKL/WL/BC/NW/PI) vẫn theo số đơn
//   • Đơn mua thẳng không có người nhận / chữ ghi đè → in y như trước
// ============================================================================

import { supabase } from '../../lib/supabase'
import { soDisplayCode, contractNoForDocs, contractDateForDocs } from './salesTypes'
import { salesOrderService } from './salesOrderService'
import {
  resolveOrderParties, isToOrder,
  type ResolvedOrderParties, type ConsigneeSource, type NotifySource, type PartyNegotiationInput,
} from './orderParties'

// ============================================================================
// INTERFACES
// ============================================================================

export interface COAData {
  order_code: string
  customer_name: string
  grade: string
  quantity_tons: number
  batch_results: Array<{
    batch_no: string
    drc: number
    moisture: number
    volatile: number
    ash: number
    nitrogen: number
    dirt: number
    pri: number | null
    mooney: number | null
    color: number | null
  }>
  grade_standard: {
    drc_min: number
    moisture_max: number
    dirt_max: number
    ash_max: number
    nitrogen_max: number
    volatile_max: number
    pri_min: number | null
    mooney_max: number | null
    color_lovibond_max: number | null
  }
  test_date: string
  result: 'PASS' | 'FAIL'
}

export interface PackingListData {
  order_code: string
  customer_name: string
  customer_address: string
  buyer_name: string
  buyer_address: string
  consignee: string
  // Khối CONSIGNEE/NOTIFY (resolveOrderParties) — chỉ in khi show_parties_block (đơn có người nhận / chữ ghi đè)
  consignee_address?: string
  notify_party?: string
  notify_address?: string
  consignee_source?: ConsigneeSource
  notify_source?: NotifySource
  show_parties_block?: boolean
  shipping_marks: string
  grade: string
  containers: Array<{
    container_no: string
    seal_no: string
    container_type: string
    net_weight_kg: number
    gross_weight_kg: number
    bale_count: number
    lot_no: number | null
    items: Array<{
      batch_no: string
      bale_from: number
      bale_to: number
      bale_count: number
      weight_kg: number
    }>
  }>
  total_containers: number
  total_bales: number
  total_net_weight: number
  total_gross_weight: number
  port_of_loading: string
  port_of_destination: string
  vessel_name: string
  etd: string
  // Khớp HỆT sheet PKL: header ref invoice + ô mô tả (dùng chung Invoice)
  pkl_no: string
  date: string
  invoice_code: string
  bl_number: string | null
  voyage_number: string
  quantity_tons: number
  net_weight_kg: number
  gross_weight_kg: number
  hs_code: string
  country_of_origin: string
  incoterm: string
  proforma_no: string
  proforma_date: string
  packing_desc: string
  total_packing: string
  item_no: string
  lc_number: string | null
  lc_date: string | null
  invoice_extra_lines: string
  po_number: string | null
  attn_contacts: string
}

export interface WeightListData {
  // Khớp HỆT sheet WL (HA20260080.xlsm): khối info dọc + bảng container có cột PALLET
  wl_no: string
  date: string
  order_code: string
  buyer_name: string
  consignee: string          // ô CONSIGNEE — resolveOrderParties (ghi đè → L/C → người nhận → hồ sơ người mua)
  consignee_address: string
  consignee_source?: ConsigneeSource
  grade: string
  packing_desc: string
  total_packing: string
  net_weight_kg: number    // tổng net (dòng NET WEIGHT trong khối info)
  gross_weight_kg: number  // tổng gross
  containers: Array<{
    container_no: string
    seal_no: string
    pallet_count: number | null
    net_weight_kg: number
    gross_weight_kg: number
    lot_no: number | null
  }>
  total_pallet: number
  total_net: number
  total_gross: number
  vessel_name: string
  voyage_number: string
  bl_number: string | null
  bl_date: string | null
  lc_number: string | null
  lc_date: string | null
  port_of_loading: string
  port_of_destination: string
  etd: string
  shipping_marks: string
}

export interface InvoiceData {
  invoice_code: string
  /** SỐ ĐƠN (soDisplayCode) — gốc số các chứng từ BC/NW/ĐNCK. KHÔNG kèm chữ ' — Lô n' (từng lọt lên ô CONTRACT NO). */
  order_code: string
  /** Ô "CONTRACT NO." / "Số hợp đồng" (contractNoForDocs): đợt mua tiếp in số HĐ GỐC khi docs_cite_root; còn lại = số đơn. */
  contract_no_doc?: string
  /** Ngày HĐ đi cùng contract_no_doc (contractDateForDocs) — ĐNCK "ngày HĐ". */
  contract_date_doc?: string
  /** Tên NH cho Hối phiếu / ĐNCK / Đơn thương lượng khi bảng thương lượng chưa ghi NH: phần sau 'TO THE ORDER OF'
   *  của Consignee → ''. KHÔNG BAO GIỜ là tên người nhận/người mua (thay cho vế dự phòng inv.consignee cũ). */
  bank_hint?: string
  consignee_source?: ConsigneeSource
  notify_source?: NotifySource
  /** Invoice/PKL in khối CONSIGNEE/NOTIFY: chỉ khi đơn có người nhận hoặc chữ ghi đè, và người mua không bật
   *  "chứng từ trung tính" (hide_receiver_on_invoice). Đơn mua thẳng → false → in y như trước. */
  show_parties_block?: boolean
  customer: { name: string; address: string; country: string }
  grade: string
  quantity_tons: number
  unit_price: number
  currency: string
  incoterm: string
  subtotal: number
  freight: number
  insurance: number
  total: number
  the_cost: number
  method: 'lc' | 'dp' | 'da'   // D/P/D/A: invoice KHÔNG tách Cước/BH/FOB (draw = tổng CIF)
  payment_terms: string
  lc_number: string | null
  bl_number: string | null
  invoice_date: string
  bank_info: { account_name: string; name: string; account: string; address: string; swift: string }
  // GĐ2 — BUYER từ hồ sơ chứng từ người mua (sales_customer_export_profiles); CONSIGNEE/NOTIFY từ resolveOrderParties
  buyer_name: string
  buyer_address: string
  consignee: string
  consignee_address: string
  notify_party: string
  notify_address: string
  shipping_marks: string
  attn_contacts: string
  po_number: string | null
  // Vận đơn — hiển thị trên Invoice (cảng/tàu/ngày)
  port_of_loading: string
  port_of_destination: string
  vessel_name: string
  shipping_line: string          // hãng tàu (cho ĐNCK "Hãng vận chuyển")
  voyage_number: string
  etd: string
  bl_date: string | null
  // Thông số hàng (khớp mẫu gốc): khối lượng + HS code + xuất xứ
  net_weight_kg: number
  gross_weight_kg: number
  hs_code: string
  country_of_origin: string
  // Khớp HỆT sheet INV (HA20260080.xlsm): ô mô tả hàng chi tiết
  shipment_date: string          // cột SHIPMENT DATE (ngày lên tàu = B/L date, thiếu → ETD)
  proforma_no: string            // "AS PER PROFORMA INVOICE NO.<mã>/PR.CI"
  proforma_date: string          // "DATED <proforma_date>"
  contract_date?: string         // Ngày HĐ (KHÁC ngày Proforma) — dùng cho ĐNCK
  packing_desc: string           // dòng PACKING đầy đủ, vd "35 KG/BALE. LOOSE BALES. 600 BALES/01X20'"
  total_packing: string          // dòng TOTAL PACKING, vd "3000 BALES/05X20'"
  item_no: string                // ITEM NO. (mã hàng của khách)
  invoice_extra_lines: string    // dòng mô tả riêng theo khách (BOI REG NO, BANK NAME…), mỗi dòng 1 mục
}

// GĐ5 — 2 chứng từ người bán TỰ KHAI (khớp mẫu gốc HA20260080.xlsm)
export interface BeneficiaryCertData {
  cert_no: string
  date: string
  buyer_name: string
  buyer_address: string
  buyer_email: string
  bl_number: string
  shipped_on_board: string
  vessel: string
  port_of_loading: string
  port_of_destination: string
  lc_number: string
  lc_date: string
}

export interface NonWoodCertData {
  cert_no: string
  date: string
  buyer_name: string
  buyer_address: string
  commodity: string
  grade_label: string
  quantity_tons: number
  country_of_origin: string
  packing_desc: string
  total_packing: string
  net_weight_kg: number
  gross_weight_kg: number
  vessel: string
  port_of_loading: string
  port_of_destination: string
  bl_number: string
  contract_no: string
  invoice_no: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PORT_LABELS: Record<string, string> = {
  // 26 đơn chọn "Any port, Viet Nam" (PORT_OF_LOADING_OPTIONS) từng in thô mã 'ANY_PORT_VN' lên chứng từ
  ANY_PORT_VN: 'Any port, Viet Nam',
  HCM_CAT_LAI: 'Cat Lai Port, Ho Chi Minh City, Vietnam',
  HCM_HIEP_PHUOC: 'Hiep Phuoc Port, Ho Chi Minh City, Vietnam',
  VUNG_TAU: 'Cai Mep Port, Vung Tau, Vietnam',
  QUY_NHON: 'Quy Nhon Port, Vietnam',
  DA_NANG: 'Da Nang Port, Vietnam',
  HAI_PHONG: 'Hai Phong Port, Vietnam',
}

const PAYMENT_TERMS_EN: Record<string, string> = {
  LC_30: 'Irrevocable L/C at sight, 30 days',
  LC_60: 'Irrevocable L/C at sight, 60 days',
  LC_90: 'Irrevocable L/C at sight, 90 days',
  TT_30: 'T/T 30% in advance, balance against B/L',
  TT_60: 'T/T 60% in advance, balance against B/L',
  CAD: 'Cash Against Documents',
  DP: 'Documents against Payment',
}

// Embed ĐƠN GỐC (đợt mua tiếp) — ghi theo TÊN CỘT. ⚠ Đừng viết `sales_orders!parent_order_id(...)`: khoá ngoại tự
// tham chiếu nên PostgREST hiểu ngược thành "các đơn con" và trả MẢNG (cùng chuỗi với salesOrderService).
const PARENT_EMBED = 'parent:parent_order_id(id,code,contract_no,contract_date,customer_id,currency,status)'
const ORDER_DOC_SELECT = '*, customer:sales_customers!customer_id(id,name,country,address)'

/**
 * Đơn + người mua cho chứng từ. Đã chạy migration sales_family_parties_p1 → kèm `parent` (embed đơn gốc, cho ô
 * CONTRACT NO.) + `ship_to` (người nhận — truy vấn thứ hai theo id vì ship_to_customer_id KHÔNG có FK).
 * Chưa migration → select y như cũ (không thêm cột/embed nào).
 */
async function loadDocOrder(orderId: string): Promise<any> {
  const ready = await salesOrderService.familyPartiesReady()
  const sel = (ready ? `${ORDER_DOC_SELECT}, ${PARENT_EMBED}` : ORDER_DOC_SELECT) as typeof ORDER_DOC_SELECT
  const { data: order, error } = await supabase
    .from('sales_orders')
    .select(sel)
    .eq('id', orderId)
    .single()
  if (error || !order) throw new Error('Không thể tải thông tin đơn hàng')
  if (!ready) return order
  const [withShipTo] = await salesOrderService.attachShipTo([order as { ship_to_customer_id?: string | null }])
  return withShipTo
}

// Hồ sơ chứng từ của 1 khách (người mua hoặc người nhận). Lỗi tải → NÉM: nuốt lỗi thì chứng từ in sai bên
// (mất Consignee hồ sơ, hoặc lộ người nhận của người mua đã bật "chứng từ trung tính").
async function loadProfileOnly(customerId: string | null | undefined): Promise<any> {
  if (!customerId) return null
  const { data, error } = await supabase
    .from('sales_customer_export_profiles')
    .select('*')
    .eq('customer_id', customerId)
    .maybeSingle()
  if (error) throw error
  return data
}

// GĐ2 — nạp hồ sơ chứng từ khách + ngân hàng thụ hưởng đã chọn
async function loadExportProfile(customerId: string | null | undefined): Promise<{ profile: any; bank: any }> {
  if (!customerId) return { profile: null, bank: null }
  const profile = await loadProfileOnly(customerId)
  let bank: any = null
  if (profile?.preferred_bank_id) {
    const { data, error } = await supabase
      .from('company_banks')
      .select('*')
      .eq('id', profile.preferred_bank_id)
      .maybeSingle()
    if (error) throw error
    bank = data
  }
  return { profile, bank }
}

// Booking (B/L · tàu · ETD · cảng) của 1 LÔ — null nếu không theo lô. Dùng để bộ chứng
// từ theo lô lấy đúng B/L/tàu của lô đó (mỗi lô ship riêng).
async function loadLotBooking(orderId: string, lotNo?: number): Promise<any> {
  if (!lotNo) return null
  const { data } = await supabase
    .from('sales_order_bookings')
    .select('*')
    .eq('sales_order_id', orderId)
    .eq('lot_no', lotNo)
    .maybeSingle()
  return data
}

// Dòng bảng thương lượng của đơn/lô (lot_no = lotNo || 0) — MỘT lần đọc cho cả L/C số/ngày lẫn NH phát hành / nhờ thu.
type DocNegotiation = PartyNegotiationInput & { lc_number?: string | null; lc_date?: string | null }
async function loadNegotiation(orderId: string, lotNo?: number): Promise<DocNegotiation | null> {
  const { data, error } = await supabase
    .from('sales_order_lc_negotiations')
    .select('method, issuing_bank, issuing_bank_address, lc_number, lc_date')
    .eq('sales_order_id', orderId)
    .eq('lot_no', lotNo || 0)
    .maybeSingle()
  if (error) throw error
  return (data as DocNegotiation | null) ?? null
}

// L/C số + ngày của đơn/lô (CÙNG nguồn = bảng thương lượng) — cho dòng "LC NO ... DATE:"
function lcInfoOf(neg: DocNegotiation | null): { lc_number: string | null; lc_date: string | null; method: 'lc' | 'dp' | 'da' } {
  return { lc_number: neg?.lc_number || null, lc_date: neg?.lc_date || null, method: (neg?.method as 'lc' | 'dp' | 'da') || 'lc' }
}

/**
 * CÁC BÊN của chứng từ — MỘT hàm suy resolveOrderParties (thay resolveConsignee cũ, regex cũ biến
 * 'TO THE ORDER OF X' thành 'THE ORDER OF TO THE ORDER OF X'). Có người nhận → nạp thêm hồ sơ chứng từ của người
 * nhận (tên pháp lý + địa chỉ). Đơn mua thẳng không có chữ ghi đè → Consignee/Notify y như code cũ.
 */
async function loadDocParties(order: any, buyerProfile: any, neg: DocNegotiation | null, lotNo: number): Promise<ResolvedOrderParties> {
  const via = !!order?.ship_to_customer_id && order.ship_to_customer_id !== order.customer_id
  const shipToProfile = via ? await loadProfileOnly(order.ship_to_customer_id) : null
  return resolveOrderParties({
    order,
    buyer: order?.customer ?? null,
    buyerProfile,
    shipTo: order?.ship_to ?? null,
    shipToProfile,
    negotiation: neg,
    lotNo,
  })
}

// Địa chỉ ô CONSIGNEE. Đơn mua thẳng chưa có Consignee (nguồn 'none'): code cũ vẫn in consignee_address của hồ sơ
// người mua dù tên trống → giữ y như hôm nay.
function consigneeAddressOf(p: ResolvedOrderParties, buyerProfile: any): string {
  if (p.consignee.address) return p.consignee.address
  return p.consignee.source === 'none' && !p.viaIntermediary ? (buyerProfile?.consignee_address || '') : ''
}

// ── Helper thuần (khớp mẫu) — dùng chung getInvoiceData / getPackingListData / getWeightListData ──
type ContLite = { bale_count?: number | null; container_type?: string | null }
// HS code có dấu chấm: SVR/TSNR→4001.22.00, RSS→4001.21.00, khác→4001.29.00
function hsCodeDotted(grade: string): string {
  const g = grade || ''
  const raw = /RSS/i.test(g) ? '40012100' : /SVR|TSNR/i.test(g) ? '40012200' : '40012900'
  return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`
}
const contSizeOf = (conts: ContLite[]) => (/40/.test(String(conts[0]?.container_type || '')) ? "40'" : "20'")
// Dòng PACKING: "<kiểu> <bao/cont> BALES/01X<size>"
function packingLineFrom(style: string, conts: ContLite[]): string {
  const n = conts.length
  const totalBales = conts.reduce((s, c) => s + (c.bale_count || 0), 0)
  const perCont = n ? Math.round(totalBales / n) : 0
  return [style, perCont ? `${perCont} BALES/01X${contSizeOf(conts)}` : ''].filter(Boolean).join(' ').trim()
}
// Dòng TOTAL PACKING: "<tổng bao> BALES/<số cont>X<size>"
function totalPackingFrom(conts: ContLite[]): string {
  const n = conts.length
  const totalBales = conts.reduce((s, c) => s + (c.bale_count || 0), 0)
  return (totalBales && n) ? `${totalBales} BALES/${String(n).padStart(2, '0')}X${contSizeOf(conts)}` : ''
}

// ============================================================================
// SERVICE
// ============================================================================

export const documentService = {
  // ==========================================================================
  // LÔ — danh sách lot_no của đơn (để sinh bộ chứng từ theo lô)
  // ==========================================================================
  async listLots(orderId: string): Promise<number[]> {
    const { data } = await supabase
      .from('sales_order_containers')
      .select('lot_no')
      .eq('sales_order_id', orderId)
      .not('lot_no', 'is', null)
    const set = new Set<number>()
    for (const r of data || []) if (r.lot_no) set.add(r.lot_no as number)
    return Array.from(set).sort((a, b) => a - b)
  },

  // ==========================================================================
  // COA — Certificate of Analysis
  // ==========================================================================

  async getCOAData(orderId: string, lotNo = 0): Promise<COAData> {
    // Fetch order with customer
    const { data: order, error: orderErr } = await supabase
      .from('sales_orders')
      .select('*, customer:sales_customers!customer_id(id,name,country,address)')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) {
      throw new Error('Không thể tải thông tin đơn hàng')
    }

    // Fetch grade standard
    const { data: standard } = await supabase
      .from('rubber_grade_standards')
      .select('drc_min,moisture_max,dirt_max,ash_max,nitrogen_max,volatile_matter_max,pri_min,mooney_max,color_lovibond_max')
      .eq('grade', order.grade)
      .maybeSingle()

    // Fetch containers with items to get batch info — lọc theo lô nếu chọn
    let coaQ = supabase
      .from('sales_order_containers')
      .select('*, items:sales_order_container_items(*)')
      .eq('sales_order_id', orderId)
    if (lotNo) coaQ = coaQ.eq('lot_no', lotNo)
    const { data: containers } = await coaQ

    // Collect unique batch IDs
    const batchIds = new Set<string>()
    for (const c of containers || []) {
      for (const item of (c as { items?: Array<{ batch_id?: string }> }).items || []) {
        if (item.batch_id) batchIds.add(item.batch_id)
      }
    }

    // Fetch QC results for those batches
    const batchResults: COAData['batch_results'] = []

    if (batchIds.size > 0) {
      const { data: batches } = await supabase
        .from('stock_batches')
        .select('batch_no,drc,moisture,volatile_matter,ash,nitrogen,dirt,pri,mooney,color_lovibond')
        .in('id', Array.from(batchIds))

      if (batches) {
        for (const b of batches) {
          batchResults.push({
            batch_no: b.batch_no || '',
            drc: b.drc ?? 0,
            moisture: b.moisture ?? 0,
            volatile: b.volatile_matter ?? 0,
            ash: b.ash ?? 0,
            nitrogen: b.nitrogen ?? 0,
            dirt: b.dirt ?? 0,
            pri: b.pri ?? null,
            mooney: b.mooney ?? null,
            color: b.color_lovibond ?? null,
          })
        }
      }
    }

    // If no batch results, build from order specs (fallback)
    if (batchResults.length === 0) {
      batchResults.push({
        batch_no: 'COMPOSITE',
        drc: order.drc_min ?? 0,
        moisture: order.moisture_max ? order.moisture_max * 0.8 : 0,
        volatile: order.volatile_max ? order.volatile_max * 0.8 : 0,
        ash: order.ash_max ? order.ash_max * 0.7 : 0,
        nitrogen: order.nitrogen_max ? order.nitrogen_max * 0.7 : 0,
        dirt: order.dirt_max ? order.dirt_max * 0.5 : 0,
        pri: order.pri_min ? order.pri_min + 10 : null,
        mooney: null,
        color: null,
      })
    }

    // Calculate average results across batches
    const avgDrc = batchResults.reduce((s, b) => s + b.drc, 0) / batchResults.length
    const avgMoisture = batchResults.reduce((s, b) => s + b.moisture, 0) / batchResults.length
    const avgDirt = batchResults.reduce((s, b) => s + b.dirt, 0) / batchResults.length
    const avgAsh = batchResults.reduce((s, b) => s + b.ash, 0) / batchResults.length
    const avgNitrogen = batchResults.reduce((s, b) => s + b.nitrogen, 0) / batchResults.length
    const avgVolatile = batchResults.reduce((s, b) => s + b.volatile, 0) / batchResults.length

    // Build grade standard
    const gradeStandard: COAData['grade_standard'] = {
      drc_min: standard?.drc_min ?? order.drc_min ?? 0,
      moisture_max: standard?.moisture_max ?? order.moisture_max ?? 0.8,
      dirt_max: standard?.dirt_max ?? order.dirt_max ?? 0.05,
      ash_max: standard?.ash_max ?? order.ash_max ?? 1.0,
      nitrogen_max: standard?.nitrogen_max ?? order.nitrogen_max ?? 0.6,
      volatile_max: standard?.volatile_matter_max ?? order.volatile_max ?? 0.8,
      pri_min: standard?.pri_min ?? order.pri_min ?? null,
      mooney_max: standard?.mooney_max ?? null,
      color_lovibond_max: standard?.color_lovibond_max ?? null,
    }

    // Determine PASS / FAIL
    let result: 'PASS' | 'FAIL' = 'PASS'
    if (avgDrc < gradeStandard.drc_min) result = 'FAIL'
    if (avgMoisture > gradeStandard.moisture_max) result = 'FAIL'
    if (avgDirt > gradeStandard.dirt_max) result = 'FAIL'
    if (avgAsh > gradeStandard.ash_max) result = 'FAIL'
    if (avgNitrogen > gradeStandard.nitrogen_max) result = 'FAIL'
    if (avgVolatile > gradeStandard.volatile_max) result = 'FAIL'

    const customer = order.customer as { name?: string } | null

    return {
      order_code: soDisplayCode(order),
      customer_name: customer?.name || '',
      grade: order.grade,
      quantity_tons: order.quantity_tons,
      batch_results: batchResults,
      grade_standard: gradeStandard,
      test_date: new Date().toLocaleDateString('sv-SE'),
      result,
    }
  },

  // ==========================================================================
  // PACKING LIST
  // ==========================================================================

  async getPackingListData(orderId: string, lotNo = 0): Promise<PackingListData> {
    // Đơn + người mua (+ đơn gốc + người nhận khi đã migration)
    const order = await loadDocOrder(orderId)

    const booking = await loadLotBooking(orderId, lotNo)
    // Fetch containers with items — lọc theo LÔ nếu chọn
    let pklQ = supabase
      .from('sales_order_containers')
      .select('*, items:sales_order_container_items(*)')
      .eq('sales_order_id', orderId)
    if (lotNo) pklQ = pklQ.eq('lot_no', lotNo)
    // Sắp theo lô rồi theo thời gian → NO trong bảng container restart đúng theo từng lô
    const { data: rawContainers } = await pklQ.order('lot_no', { ascending: true, nullsFirst: true }).order('created_at')

    const containers: PackingListData['containers'] = []
    let totalBales = 0
    let totalNet = 0
    let totalGross = 0

    for (const c of rawContainers || []) {
      const items = ((c as { items?: Array<Record<string, unknown>> }).items || []).map((item) => ({
        batch_no: (item.batch_no as string) || '',
        bale_from: (item.bale_from as number) || 0,
        bale_to: (item.bale_to as number) || 0,
        bale_count: (item.bale_count as number) || 0,
        weight_kg: (item.weight_kg as number) || 0,
      }))

      const containerBales = c.bale_count || items.reduce((s: number, i: { bale_count: number }) => s + i.bale_count, 0)
      // Làm tròn/cont (khớp Weight List + Invoice) — cột container cộng đúng bằng TOTAL
      const containerNet = Math.round(c.net_weight_kg || items.reduce((s: number, i: { weight_kg: number }) => s + i.weight_kg, 0))
      // Gross thiếu → bằng Net (bao bì bành không đáng kể, khớp mẫu gốc); KHÔNG ước lượng ×1.02
      const containerGross = Math.round(c.gross_weight_kg || containerNet)

      containers.push({
        container_no: c.container_no || 'TBD',
        seal_no: c.seal_no || 'TBD',
        container_type: c.container_type || '20ft',
        net_weight_kg: containerNet,
        gross_weight_kg: containerGross,
        bale_count: containerBales,
        lot_no: c.lot_no ?? null,
        items,
      })

      totalBales += containerBales
      totalNet += containerNet
      totalGross += containerGross
    }

    const customer = order.customer as { name?: string; address?: string } | null
    const { profile } = await loadExportProfile(order.customer_id)
    const neg = await loadNegotiation(orderId, lotNo)
    const lcInfo = lcInfoOf(neg)
    const parties = await loadDocParties(order, profile, neg, lotNo)
    // Nạp hóa đơn (cùng nguồn getInvoiceData) → invoice_code/bl/ngày KHỚP giữa các chứng từ 1 bộ
    const { data: invoice } = await supabase
      .from('sales_invoices')
      .select('code,bl_number,invoice_date')
      .eq('sales_order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const orderQty = order.quantity_tons || 0
    const qtyTons = lotNo ? (totalNet / 1000) : orderQty
    const packingStyle = order.packing_desc || profile?.default_packing_desc || ''

    return {
      order_code: soDisplayCode(order) + (lotNo ? ` — Lô ${lotNo}` : ''),
      customer_name: customer?.name || '',
      customer_address: customer?.address || '',
      buyer_name: profile?.buyer_legal_name || customer?.name || '',
      buyer_address: profile?.buyer_address || customer?.address || '',
      consignee: parties.consignee.name,
      consignee_address: consigneeAddressOf(parties, profile),
      notify_party: parties.notify.name,
      notify_address: parties.notify.address,
      consignee_source: parties.consignee.source,
      notify_source: parties.notify.source,
      show_parties_block: parties.showPartiesBlock,
      shipping_marks: order.shipping_marks || profile?.shipping_marks || '',
      grade: order.grade,
      containers,
      total_containers: containers.length,
      total_bales: totalBales,
      total_net_weight: totalNet,
      total_gross_weight: totalGross,
      port_of_loading: booking?.port_of_loading || PORT_LABELS[order.port_of_loading] || order.port_of_loading || '',
      port_of_destination: booking?.port_of_destination || order.port_of_destination || order.port_of_discharge || '',
      vessel_name: booking?.vessel_name || order.vessel_name || '',
      etd: booking?.etd || order.etd || '',
      // Khớp HỆT sheet PKL; invoice_code/bl/ngày/LC MIRROR getInvoiceData → 1 bộ khớp nhau
      pkl_no: `${soDisplayCode(order)}/PL${lotNo ? `/L${lotNo}` : ''}`,
      date: order.invoice_date || invoice?.invoice_date || new Date().toLocaleDateString('sv-SE'),
      invoice_code: (order.invoice_no || invoice?.code || `INV-${order.code}`) + (lotNo ? `/L${lotNo}` : ''),
      bl_number: booking?.bl_number || order.bl_number || invoice?.bl_number || null,
      voyage_number: booking?.voyage_no || order.voyage_number || '',
      quantity_tons: qtyTons,
      net_weight_kg: totalNet || Math.round(qtyTons * 1000),
      gross_weight_kg: totalGross || totalNet || Math.round(qtyTons * 1000),
      hs_code: hsCodeDotted(order.grade || ''),
      country_of_origin: 'VIET NAM',
      incoterm: order.incoterm || 'CIF',
      proforma_no: `${soDisplayCode(order)}/PR.CI`,
      proforma_date: order.proforma_date || '',
      packing_desc: packingLineFrom(packingStyle, containers),
      total_packing: totalPackingFrom(containers),
      item_no: order.item_no || profile?.default_item_no || '',
      lc_number: lcInfo.lc_number || order.lc_number,
      lc_date: lcInfo.lc_date,
      invoice_extra_lines: order.invoice_extra_lines || profile?.default_invoice_extra_lines || '',
      po_number: order.customer_po || null,
      attn_contacts: profile?.attn_contacts || '',
    }
  },

  // ==========================================================================
  // WEIGHT LIST
  // ==========================================================================

  async getWeightListData(orderId: string, lotNo = 0): Promise<WeightListData> {
    const order = await loadDocOrder(orderId)

    const booking = await loadLotBooking(orderId, lotNo)
    const neg = await loadNegotiation(orderId, lotNo)
    const lcInfo = lcInfoOf(neg)
    let wlQ = supabase
      .from('sales_order_containers')
      .select('container_no,seal_no,bale_count,pallet_count,container_type,lot_no,net_weight_kg,tare_weight_kg,gross_weight_kg, items:sales_order_container_items(weight_kg)')
      .eq('sales_order_id', orderId)
    if (lotNo) wlQ = wlQ.eq('lot_no', lotNo)
    // Sắp theo lô → NO trong bảng restart đúng theo từng lô (khớp PKL)
    const { data: rawContainers } = await wlQ.order('lot_no', { ascending: true, nullsFirst: true }).order('created_at')

    const { profile } = await loadExportProfile(order.customer_id)
    const parties = await loadDocParties(order, profile, neg, lotNo)
    const { data: invoice } = await supabase
      .from('sales_invoices')
      .select('code,bl_number,invoice_date')
      .eq('sales_order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const rawArr = rawContainers || []
    const containers = rawArr.map((c) => {
      const itemNet = ((c as { items?: Array<{ weight_kg?: number }> }).items || [])
        .reduce((s, i) => s + (i.weight_kg || 0), 0)
      const net = c.net_weight_kg || itemNet
      // gross fallback = net (KHÔNG cộng tare) — thống nhất với PKL/Invoice để 3 chứng từ khớp
      const gross = c.gross_weight_kg || net
      return {
        container_no: c.container_no || 'TBD',
        seal_no: c.seal_no || 'TBD',
        pallet_count: c.pallet_count ?? null,
        // Làm tròn từng container 1 lần → cột NET/GROSS cộng khớp hàng TOTAL (không lệch do làm tròn)
        net_weight_kg: Math.round(net),
        gross_weight_kg: Math.round(gross),
        lot_no: c.lot_no ?? null,
      }
    })
    // Tổng = cộng các giá trị ĐÃ làm tròn → khối info + hàng TOTAL luôn khớp nhau
    const totalNet = containers.reduce((s, c) => s + c.net_weight_kg, 0)
    const totalGross = containers.reduce((s, c) => s + c.gross_weight_kg, 0)
    const totalPallet = containers.reduce((s, c) => s + (c.pallet_count || 0), 0)

    const customer = order.customer as { name?: string; address?: string } | null
    const packingStyle = order.packing_desc || profile?.default_packing_desc || ''
    return {
      wl_no: `${soDisplayCode(order)}/WL${lotNo ? `/L${lotNo}` : ''}`,
      date: order.invoice_date || invoice?.invoice_date || new Date().toLocaleDateString('sv-SE'),
      order_code: soDisplayCode(order) + (lotNo ? ` — Lô ${lotNo}` : ''),
      buyer_name: profile?.buyer_legal_name || customer?.name || '',
      // Ô CONSIGNEE/ADDRESS theo resolveOrderParties (trước đây chỉ hồ sơ người mua) — đơn mua thẳng in y như cũ
      consignee: parties.consignee.name,
      consignee_address: consigneeAddressOf(parties, profile),
      consignee_source: parties.consignee.source,
      grade: order.grade,
      packing_desc: packingLineFrom(packingStyle, rawArr),
      total_packing: totalPackingFrom(rawArr),
      // Khối info NET/GROSS = ĐÚNG tổng bảng (không dùng ước lượng qtyTons) → 2 vùng luôn nhất quán
      net_weight_kg: totalNet,
      gross_weight_kg: totalGross,
      containers,
      total_pallet: totalPallet,
      total_net: totalNet,
      total_gross: totalGross,
      vessel_name: booking?.vessel_name || order.vessel_name || '',
      voyage_number: booking?.voyage_no || order.voyage_number || '',
      bl_number: booking?.bl_number || order.bl_number || invoice?.bl_number || null,
      bl_date: booking?.bl_date || order.bl_date || null,
      lc_number: lcInfo.lc_number || order.lc_number,
      lc_date: lcInfo.lc_date,
      port_of_loading: booking?.port_of_loading || PORT_LABELS[order.port_of_loading] || order.port_of_loading || '',
      port_of_destination: booking?.port_of_destination || order.port_of_destination || order.port_of_discharge || '',
      etd: booking?.etd || order.etd || '',
      shipping_marks: order.shipping_marks || profile?.shipping_marks || '',
    }
  },

  // ==========================================================================
  // COMMERCIAL INVOICE
  // ==========================================================================

  async getInvoiceData(orderId: string, lotNo = 0): Promise<InvoiceData> {
    // Đơn + người mua (+ đơn gốc cho ô CONTRACT NO. + người nhận khi đã migration)
    const order = await loadDocOrder(orderId)

    // Check if there is an invoice
    const { data: invoice } = await supabase
      .from('sales_invoices')
      .select('*')
      .eq('sales_order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const customer = order.customer as { name?: string; address?: string; country?: string } | null
    const { profile, bank } = await loadExportProfile(order.customer_id)
    const booking = await loadLotBooking(orderId, lotNo)
    const neg = await loadNegotiation(orderId, lotNo)
    const lcInfo = lcInfoOf(neg)
    const parties = await loadDocParties(order, profile, neg, lotNo)

    // Khối lượng theo LÔ (lot_no) nếu chọn lô; không thì cả đơn
    let contQ = supabase.from('sales_order_containers').select('net_weight_kg,gross_weight_kg,bale_count,container_type').eq('sales_order_id', orderId)
    if (lotNo) contQ = contQ.eq('lot_no', lotNo)
    const { data: wlCont } = await contQ
    const conts = wlCont || []
    const sumNet = conts.reduce((s, c) => s + Math.round(c.net_weight_kg || 0), 0)   // làm tròn/cont (khớp Weight List)
    const sumGross = conts.reduce((s, c) => s + Math.round(c.gross_weight_kg || c.net_weight_kg || 0), 0)
    // Tổng net THỰC của CẢ đơn (mọi lô) — mẫu số chia cước/BH cho đúng (Σ các lô = cước đơn)
    const { data: allNetC } = await supabase.from('sales_order_containers').select('net_weight_kg').eq('sales_order_id', orderId)
    const totalOrderNet = (allNetC || []).reduce((s, c) => s + Math.round(c.net_weight_kg || 0), 0)
    // Đóng gói (khớp mẫu): PACKING = "<kiểu> <bao/cont> BALES/01X<size>", TOTAL PACKING = "<tổng bao> BALES/<số cont>X<size>"
    const contCount = conts.length
    const totalBales = conts.reduce((s, c) => s + (c.bale_count || 0), 0)
    const balesPerCont = contCount ? Math.round(totalBales / contCount) : 0
    const contSize = /40/.test(String(conts[0]?.container_type || '')) ? "40'" : "20'"
    const pad2 = (n: number) => String(n).padStart(2, '0')
    const packingStyle = order.packing_desc || profile?.default_packing_desc || ''
    const packingLine = [packingStyle, balesPerCont ? `${balesPerCont} BALES/01X${contSize}` : ''].filter(Boolean).join(' ').trim()
    const totalPacking = (totalBales && contCount) ? `${totalBales} BALES/${pad2(contCount)}X${contSize}` : ''
    const orderQty = order.quantity_tons || 0
    // Số lượng (MT): lô → tổng net lô / 1000; cả đơn → theo đơn
    const qtyTons = lotNo ? (sumNet / 1000) : orderQty
    const netKg = sumNet || Math.round(qtyTons * 1000)
    const grossKg = sumGross || netKg
    const subtotal = qtyTons * order.unit_price
    // HS code theo loại mủ (SVR/TSNR=40012200, RSS=40012100, khác=40012900) → định dạng có dấu chấm "4001.22.00" khớp mẫu
    const g = order.grade || ''
    const hsRaw = /LATEX/i.test(g) ? '40011000' : /RSS/i.test(g) ? '40012100' : /SVR|TSNR/i.test(g) ? '40012200' : '40012900'
    const hsCode = `${hsRaw.slice(0, 4)}.${hsRaw.slice(4, 6)}.${hsRaw.slice(6, 8)}`
    // Cước & bảo hiểm: cả đơn nhập ở ShippingTab; theo lô → chia tỷ lệ theo số lượng
    const frOrder = order.freight_amount ?? invoice?.freight_charge ?? 0
    const insOrder = order.insurance_amount ?? invoice?.insurance_charge ?? 0
    const lotFrac = lotNo && totalOrderNet > 0 ? (sumNet / totalOrderNet) : 1   // theo tổng net THỰC → Σ lô = cước đơn
    const freight = Math.round(frOrder * lotFrac * 100) / 100
    const insurance = Math.round(insOrder * lotFrac * 100) / 100
    // Khớp mẫu gốc: đơn giá đã là CIF → TOTAL = trị giá CIF; cước+BH TRỪ ra "THE COST" (số Hối phiếu draw)
    const total = subtotal
    const theCost = subtotal - freight - insurance
    const lotSuffix = lotNo ? `/L${lotNo}` : ''

    return {
      invoice_code: (order.invoice_no || invoice?.code || `INV-${order.code}`) + lotSuffix,
      // Số đơn trần — chữ tiếng Việt ' — Lô n' cũ lọt lên ô CONTRACT NO của hoá đơn xuất khẩu theo lô (lô đã có ở số Invoice /Ln)
      order_code: soDisplayCode(order),
      contract_no_doc: contractNoForDocs(order),
      contract_date_doc: contractDateForDocs(order) || '',
      bank_hint: parties.bankHint,
      consignee_source: parties.consignee.source,
      notify_source: parties.notify.source,
      show_parties_block: parties.showPartiesBlock,
      customer: {
        name: customer?.name || '',
        address: customer?.address || '',
        country: customer?.country || '',
      },
      grade: order.grade,
      quantity_tons: qtyTons,
      unit_price: order.unit_price,
      currency: order.currency || 'USD',
      incoterm: order.incoterm || 'FOB',
      subtotal,
      freight,
      insurance,
      total,
      the_cost: theCost,
      method: lcInfo.method,
      payment_terms: profile?.default_payment_term || PAYMENT_TERMS_EN[order.payment_terms || ''] || order.payment_terms || '',
      lc_number: lcInfo.lc_number || order.lc_number,
      // B/L: lô → từ booking của lô; cả đơn → order.bl_number
      bl_number: booking?.bl_number || order.bl_number || invoice?.bl_number || null,
      invoice_date: order.invoice_date || invoice?.invoice_date || new Date().toLocaleDateString('sv-SE'),
      // Chưa chọn NH thụ hưởng → để TRỐNG (đừng in số TK/SWIFT GIẢ); readiness bankItem sẽ cảnh báo
      bank_info: bank
        ? { account_name: bank.account_name || 'HUY ANH RUBBER COMPANY LIMITED', name: bank.bank_name, account: bank.account_no, address: bank.bank_address || '', swift: bank.swift_code || '' }
        : { account_name: 'HUY ANH RUBBER COMPANY LIMITED', name: '', account: '', address: '', swift: '' },
      // GĐ2 — BUYER LUÔN là người mua (hồ sơ chứng từ người mua); CONSIGNEE/NOTIFY theo resolveOrderParties
      buyer_name: profile?.buyer_legal_name || customer?.name || '',
      buyer_address: profile?.buyer_address || customer?.address || '',
      consignee: parties.consignee.name,
      consignee_address: consigneeAddressOf(parties, profile),
      notify_party: parties.notify.name,
      notify_address: parties.notify.address,
      shipping_marks: order.shipping_marks || profile?.shipping_marks || '',
      attn_contacts: profile?.attn_contacts || '',
      po_number: order.customer_po || null,
      // Vận đơn — lô → từ booking của lô; cả đơn → order
      port_of_loading: booking?.port_of_loading || PORT_LABELS[order.port_of_loading] || order.port_of_loading || '',
      port_of_destination: booking?.port_of_destination || order.port_of_destination || order.port_of_discharge || '',
      vessel_name: booking?.vessel_name || order.vessel_name || '',
      shipping_line: booking?.shipping_line || order.shipping_line || '',   // hãng tàu (cho ĐNCK)
      voyage_number: booking?.voyage_no || order.voyage_number || '',
      etd: booking?.etd || order.etd || '',
      bl_date: booking?.bl_date || order.bl_date || null,
      net_weight_kg: netKg,
      gross_weight_kg: grossKg,
      hs_code: hsCode,
      country_of_origin: 'VIET NAM',
      // Khớp HỆT sheet INV — ngày lên tàu = ngày B/L của LÔ (thiếu → ETD)
      shipment_date: booking?.bl_date || order.bl_date || booking?.etd || order.etd || '',
      proforma_no: `${soDisplayCode(order)}/PR.CI`,
      proforma_date: order.proforma_date || '',
      packing_desc: packingLine,
      total_packing: totalPacking,
      item_no: order.item_no || profile?.default_item_no || '',
      invoice_extra_lines: order.invoice_extra_lines || profile?.default_invoice_extra_lines || '',
      contract_date: order.contract_date || '',   // Ngày HĐ (KHÁC ngày Proforma) — cho ĐNCK
    }
  },

  // ==========================================================================
  // BENEFICIARY'S CERTIFICATE — người bán tự khai (đã email bộ copy cho khách)
  // ==========================================================================

  async getBeneficiaryCertData(orderId: string, lotNo = 0): Promise<BeneficiaryCertData> {
    const inv = await this.getInvoiceData(orderId, lotNo)
    const { data: neg } = await supabase
      .from('sales_order_lc_negotiations')
      .select('lc_number,lc_date')
      .eq('sales_order_id', orderId)
      .eq('lot_no', lotNo || 0)
      .maybeSingle()
    const { data: row } = await supabase
      .from('sales_orders')
      .select('customer:sales_customers!customer_id(email)')
      .eq('id', orderId)
      .maybeSingle()
    const email = (row?.customer as { email?: string } | null)?.email || ''
    const base = inv.order_code   // số đơn (của đợt) — số chứng từ theo đợt, KHÔNG theo HĐ gốc
    return {
      cert_no: `${base}${lotNo ? `/L${lotNo}` : ''}/BC`,
      date: inv.invoice_date,
      buyer_name: inv.buyer_name,
      buyer_address: inv.buyer_address,
      buyer_email: email,
      bl_number: inv.bl_number || '',
      shipped_on_board: inv.bl_date || '',
      vessel: `${inv.vessel_name || ''}${inv.voyage_number ? ' ' + inv.voyage_number : ''}`.trim(),
      port_of_loading: inv.port_of_loading,
      port_of_destination: inv.port_of_destination,
      lc_number: inv.lc_number || neg?.lc_number || '',
      lc_date: neg?.lc_date || '',
    }
  },

  // ==========================================================================
  // NON-WOOD PACKING CERTIFICATE — người bán tự khai (không dùng bao bì gỗ)
  // ==========================================================================

  async getNonWoodCertData(orderId: string, lotNo = 0): Promise<NonWoodCertData> {
    const inv = await this.getInvoiceData(orderId, lotNo)
    const gradeLabel = (inv.grade || '').replace(/_/g, ' ')
    const base = inv.order_code   // số đơn (của đợt)
    // Consignee là NGƯỜI NHẬN THẬT (tên người nhận / chữ gõ riêng KHÔNG phải dạng "TO ORDER…") → THE BUYER = người
    // nhận + địa chỉ CỦA người nhận. Còn lại (NH / TO ORDER / hồ sơ người mua / trống) → giữ mẹo cũ bên dưới.
    const realReceiver = !!inv.consignee && !isToOrder(inv.consignee)
      && (inv.consignee_source === 'receiver' || inv.consignee_source === 'order_override')
    return {
      cert_no: `${base}${lotNo ? `/L${lotNo}` : ''}/NW`,
      date: inv.invoice_date,
      // "buyer" trên Non-Wood = consignee (to order of NH); ADDRESS = tên+địa chỉ người mua thật (khớp mẫu).
      // Chỉ ghép tên vào ADDRESS khi THE BUYER là consignee (khác người mua) — tránh lặp tên khi D/P.
      buyer_name: realReceiver ? inv.consignee : (inv.consignee || inv.buyer_name),
      buyer_address: realReceiver
        ? inv.consignee_address
        : (inv.consignee ? [inv.buyer_name, inv.buyer_address].filter(Boolean).join(', ') : inv.buyer_address),
      commodity: `${inv.quantity_tons.toFixed(2).replace(/\.00$/, '')} MT - NATURAL RUBBER ${gradeLabel}`,
      grade_label: gradeLabel,
      quantity_tons: inv.quantity_tons,
      country_of_origin: inv.country_of_origin,
      packing_desc: inv.packing_desc,
      total_packing: inv.total_packing,
      net_weight_kg: inv.net_weight_kg,
      gross_weight_kg: inv.gross_weight_kg,
      vessel: `${inv.vessel_name || ''}${inv.voyage_number ? ' ' + inv.voyage_number : ''}`.trim(),
      port_of_loading: inv.port_of_loading,
      port_of_destination: inv.port_of_destination,
      bl_number: inv.bl_number || '',
      // Số HĐ KÝ: đợt mua tiếp in số HĐ gốc (docs_cite_root) — số chứng từ (cert_no) vẫn theo số đợt
      contract_no: inv.contract_no_doc || base,
      invoice_no: inv.invoice_code,
    }
  },

  // ==========================================================================
  // MARK GENERATED — Update sales_orders flags
  // ==========================================================================

  async markGenerated(orderId: string, docType: 'coa' | 'packing_list' | 'invoice'): Promise<void> {
    const fieldMap: Record<string, string> = {
      coa: 'coa_generated',
      packing_list: 'packing_list_generated',
      invoice: 'invoice_generated',
    }

    const field = fieldMap[docType]
    if (!field) return

    const { error } = await supabase
      .from('sales_orders')
      .update({ [field]: true, updated_at: new Date().toISOString() })
      .eq('id', orderId)

    if (error) {
      throw new Error(`Không thể cập nhật trạng thái chung tu: ${error.message}`)
    }
  },
}

export default documentService
