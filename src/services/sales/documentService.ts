// ============================================================================
// DOCUMENT SERVICE — Generate export documents: COA, Packing List, Invoice
// File: src/services/sales/documentService.ts
// Module Ban hang quoc te — Huy Anh Rubber ERP
// ============================================================================

import { supabase } from '../../lib/supabase'
import { soDisplayCode } from './salesTypes'

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
  order_code: string
  buyer_name: string
  consignee: string
  grade: string
  containers: Array<{
    container_no: string
    seal_no: string
    bale_count: number
    net_weight_kg: number
    tare_weight_kg: number
    gross_weight_kg: number
  }>
  total_bales: number
  total_net: number
  total_tare: number
  total_gross: number
  vessel_name: string
  bl_number: string | null
  bl_date: string | null
  port_of_loading: string
  port_of_destination: string
  etd: string
  shipping_marks: string
}

export interface InvoiceData {
  invoice_code: string
  order_code: string
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
  payment_terms: string
  lc_number: string | null
  bl_number: string | null
  invoice_date: string
  bank_info: { account_name: string; name: string; account: string; address: string; swift: string }
  // GĐ2 — từ hồ sơ chứng từ khách (sales_customer_export_profiles)
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

const BANK_INFO = {
  name: 'Vietcombank - Chi nhanh Hue',
  account: '0491000XXXXXX',
  swift: 'BFTVVNVX009',
}

const PORT_LABELS: Record<string, string> = {
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

// GĐ2 — nạp hồ sơ chứng từ khách + ngân hàng thụ hưởng đã chọn
async function loadExportProfile(customerId: string | null | undefined): Promise<{ profile: any; bank: any }> {
  if (!customerId) return { profile: null, bank: null }
  const { data: profile } = await supabase
    .from('sales_customer_export_profiles')
    .select('*')
    .eq('customer_id', customerId)
    .maybeSingle()
  let bank: any = null
  if (profile?.preferred_bank_id) {
    const { data } = await supabase
      .from('company_banks')
      .select('*')
      .eq('id', profile.preferred_bank_id)
      .maybeSingle()
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

// Consignee theo TỪNG ĐƠN/LÔ: L/C → "THE ORDER OF {NH phát hành}" (đổi theo mỗi L/C),
// còn lại (D/P/D/A/T-T) → consignee mặc định ở hồ sơ khách.
async function resolveConsignee(orderId: string, profile: any, lotNo?: number): Promise<string> {
  const { data: neg } = await supabase
    .from('sales_order_lc_negotiations')
    .select('method, issuing_bank')
    .eq('sales_order_id', orderId)
    .eq('lot_no', lotNo || 0)
    .maybeSingle()
  const clean = (s: string) => (s || '').replace(/\s*\(SWIFT[^)]*\)\s*/i, '').trim()
  if ((neg?.method || 'lc') === 'lc' && neg?.issuing_bank) {
    const b = clean(neg.issuing_bank)
    return /^(THE|TO)\s+ORDER/i.test(b) ? b : `THE ORDER OF ${b}`
  }
  return profile?.consignee_name || ''
}

// L/C date của đơn/lô (từ bảng thương lượng) — cho dòng "LC NO ... DATE:" trong PKL
async function loadLcDate(orderId: string, lotNo?: number): Promise<string | null> {
  const { data } = await supabase
    .from('sales_order_lc_negotiations')
    .select('lc_date')
    .eq('sales_order_id', orderId)
    .eq('lot_no', lotNo || 0)
    .maybeSingle()
  return data?.lc_date || null
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
      test_date: new Date().toISOString().split('T')[0],
      result,
    }
  },

  // ==========================================================================
  // PACKING LIST
  // ==========================================================================

  async getPackingListData(orderId: string, lotNo = 0): Promise<PackingListData> {
    // Fetch order with customer
    const { data: order, error: orderErr } = await supabase
      .from('sales_orders')
      .select('*, customer:sales_customers!customer_id(id,name,country,address)')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) {
      throw new Error('Không thể tải thông tin đơn hàng')
    }

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
      const containerNet = c.net_weight_kg || items.reduce((s: number, i: { weight_kg: number }) => s + i.weight_kg, 0)
      // Gross thiếu → bằng Net (bao bì bành không đáng kể, khớp mẫu gốc); KHÔNG ước lượng ×1.02
      const containerGross = c.gross_weight_kg || containerNet

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
    const lcDate = await loadLcDate(orderId, lotNo)
    const orderQty = order.quantity_tons || 0
    const qtyTons = lotNo ? (totalNet / 1000) : orderQty
    const packingStyle = order.packing_desc || profile?.default_packing_desc || ''

    return {
      order_code: soDisplayCode(order) + (lotNo ? ` — Lô ${lotNo}` : ''),
      customer_name: customer?.name || '',
      customer_address: customer?.address || '',
      buyer_name: profile?.buyer_legal_name || customer?.name || '',
      buyer_address: profile?.buyer_address || customer?.address || '',
      consignee: await resolveConsignee(orderId, profile, lotNo),
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
      // Khớp HỆT sheet PKL
      pkl_no: `${soDisplayCode(order)}/PL${lotNo ? `/L${lotNo}` : ''}`,
      date: order.invoice_date || new Date().toISOString().split('T')[0],
      invoice_code: order.invoice_no || `${soDisplayCode(order)}/CI`,
      bl_number: booking?.bl_number || order.bl_number || null,
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
      lc_number: order.lc_number || null,
      lc_date: lcDate,
      invoice_extra_lines: order.invoice_extra_lines || profile?.default_invoice_extra_lines || '',
      po_number: order.customer_po || null,
      attn_contacts: profile?.attn_contacts || '',
    }
  },

  // ==========================================================================
  // WEIGHT LIST
  // ==========================================================================

  async getWeightListData(orderId: string, lotNo = 0): Promise<WeightListData> {
    const { data: order, error } = await supabase
      .from('sales_orders')
      .select('*, customer:sales_customers!customer_id(id,name,address)')
      .eq('id', orderId)
      .single()
    if (error || !order) throw new Error('Không thể tải thông tin đơn hàng')

    const booking = await loadLotBooking(orderId, lotNo)
    let wlQ = supabase
      .from('sales_order_containers')
      .select('container_no,seal_no,bale_count,net_weight_kg,tare_weight_kg,gross_weight_kg, items:sales_order_container_items(weight_kg)')
      .eq('sales_order_id', orderId)
    if (lotNo) wlQ = wlQ.eq('lot_no', lotNo)
    const { data: rawContainers } = await wlQ.order('created_at')

    const { profile } = await loadExportProfile(order.customer_id)
    const { data: invoice } = await supabase
      .from('sales_invoices')
      .select('bl_number')
      .eq('sales_order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const containers = (rawContainers || []).map((c) => {
      // Fallback net theo item (khớp getPackingListData — tránh 2 chứng từ lệch nhau)
      const itemNet = ((c as { items?: Array<{ weight_kg?: number }> }).items || [])
        .reduce((s, i) => s + (i.weight_kg || 0), 0)
      const net = c.net_weight_kg || itemNet
      const tare = c.tare_weight_kg || 0
      // gross: ưu tiên số thật; thiếu → net + tare (nếu có tare) hoặc = net (KHÔNG ước lượng ×1.02)
      const gross = c.gross_weight_kg || (tare > 0 ? net + tare : net)
      // tare hiển thị: thiếu tare nhưng có gross → gross − net (giữ net + tare = gross)
      const tareShown = tare > 0 ? tare : Math.max(0, gross - net)
      return {
        container_no: c.container_no || 'TBD',
        seal_no: c.seal_no || 'TBD',
        bale_count: c.bale_count || 0,
        net_weight_kg: net,
        tare_weight_kg: tareShown,
        gross_weight_kg: gross,
      }
    })
    const sum = (f: 'bale_count' | 'net_weight_kg' | 'tare_weight_kg' | 'gross_weight_kg') =>
      containers.reduce((s, c) => s + (c[f] || 0), 0)

    const customer = order.customer as { name?: string } | null
    return {
      order_code: soDisplayCode(order) + (lotNo ? ` — Lô ${lotNo}` : ''),
      buyer_name: profile?.buyer_legal_name || customer?.name || '',
      consignee: await resolveConsignee(orderId, profile, lotNo),
      grade: order.grade,
      containers,
      total_bales: sum('bale_count'),
      total_net: sum('net_weight_kg'),
      total_tare: sum('tare_weight_kg'),
      total_gross: sum('gross_weight_kg'),
      vessel_name: booking?.vessel_name || order.vessel_name || '',
      bl_number: booking?.bl_number || order.bl_number || invoice?.bl_number || null,
      bl_date: order.bl_date || null,
      port_of_loading: booking?.port_of_loading || PORT_LABELS[order.port_of_loading] || order.port_of_loading || '',
      port_of_destination: booking?.port_of_destination || order.port_of_destination || '',
      etd: booking?.etd || order.etd || '',
      shipping_marks: order.shipping_marks || profile?.shipping_marks || '',
    }
  },

  // ==========================================================================
  // COMMERCIAL INVOICE
  // ==========================================================================

  async getInvoiceData(orderId: string, lotNo = 0): Promise<InvoiceData> {
    // Fetch order with customer
    const { data: order, error: orderErr } = await supabase
      .from('sales_orders')
      .select('*, customer:sales_customers!customer_id(id,name,country,address)')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) {
      throw new Error('Không thể tải thông tin đơn hàng')
    }

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

    // Khối lượng theo LÔ (lot_no) nếu chọn lô; không thì cả đơn
    let contQ = supabase.from('sales_order_containers').select('net_weight_kg,gross_weight_kg,bale_count,container_type').eq('sales_order_id', orderId)
    if (lotNo) contQ = contQ.eq('lot_no', lotNo)
    const { data: wlCont } = await contQ
    const conts = wlCont || []
    const sumNet = conts.reduce((s, c) => s + (c.net_weight_kg || 0), 0)
    const sumGross = conts.reduce((s, c) => s + (c.gross_weight_kg || c.net_weight_kg || 0), 0)
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
    const hsRaw = /RSS/i.test(g) ? '40012100' : /SVR|TSNR/i.test(g) ? '40012200' : '40012900'
    const hsCode = `${hsRaw.slice(0, 4)}.${hsRaw.slice(4, 6)}.${hsRaw.slice(6, 8)}`
    // Cước & bảo hiểm: cả đơn nhập ở ShippingTab; theo lô → chia tỷ lệ theo số lượng
    const frOrder = order.freight_amount ?? invoice?.freight_charge ?? 0
    const insOrder = order.insurance_amount ?? invoice?.insurance_charge ?? 0
    const lotFrac = lotNo && orderQty > 0 ? Math.min(1, qtyTons / orderQty) : 1
    const freight = Math.round(frOrder * lotFrac * 100) / 100
    const insurance = Math.round(insOrder * lotFrac * 100) / 100
    // Khớp mẫu gốc: đơn giá đã là CIF → TOTAL = trị giá CIF; cước+BH TRỪ ra "THE COST" (số Hối phiếu draw)
    const total = subtotal
    const theCost = subtotal - freight - insurance
    const lotSuffix = lotNo ? `/L${lotNo}` : ''

    return {
      invoice_code: (order.invoice_no || invoice?.code || `INV-${order.code}`) + lotSuffix,
      order_code: soDisplayCode(order) + (lotNo ? ` — Lô ${lotNo}` : ''),
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
      payment_terms: profile?.default_payment_term || PAYMENT_TERMS_EN[order.payment_terms || ''] || order.payment_terms || '',
      lc_number: order.lc_number || null,
      // B/L: lô → từ booking của lô; cả đơn → order.bl_number
      bl_number: booking?.bl_number || order.bl_number || invoice?.bl_number || null,
      invoice_date: order.invoice_date || invoice?.invoice_date || new Date().toISOString().split('T')[0],
      bank_info: bank
        ? { account_name: bank.account_name || 'HUY ANH RUBBER COMPANY LIMITED', name: bank.bank_name, account: bank.account_no, address: bank.bank_address || '', swift: bank.swift_code || '' }
        : { account_name: 'HUY ANH RUBBER COMPANY LIMITED', name: BANK_INFO.name, account: BANK_INFO.account, address: '', swift: BANK_INFO.swift },
      // GĐ2 — hồ sơ chứng từ khách
      buyer_name: profile?.buyer_legal_name || customer?.name || '',
      buyer_address: profile?.buyer_address || customer?.address || '',
      consignee: await resolveConsignee(orderId, profile, lotNo),
      consignee_address: profile?.consignee_address || '',
      notify_party: profile?.notify_party || profile?.buyer_legal_name || customer?.name || '',
      notify_address: profile?.notify_address || '',
      shipping_marks: order.shipping_marks || profile?.shipping_marks || '',
      attn_contacts: profile?.attn_contacts || '',
      po_number: order.customer_po || null,
      // Vận đơn — lô → từ booking của lô; cả đơn → order
      port_of_loading: booking?.port_of_loading || PORT_LABELS[order.port_of_loading] || order.port_of_loading || '',
      port_of_destination: booking?.port_of_destination || order.port_of_destination || order.port_of_discharge || '',
      vessel_name: booking?.vessel_name || order.vessel_name || '',
      voyage_number: booking?.voyage_no || order.voyage_number || '',
      etd: booking?.etd || order.etd || '',
      bl_date: order.bl_date || null,
      net_weight_kg: netKg,
      gross_weight_kg: grossKg,
      hs_code: hsCode,
      country_of_origin: 'VIET NAM',
      // Khớp HỆT sheet INV
      shipment_date: order.bl_date || booking?.etd || order.etd || '',
      proforma_no: `${soDisplayCode(order)}/PR.CI`,
      proforma_date: order.proforma_date || '',
      packing_desc: packingLine,
      total_packing: totalPacking,
      item_no: order.item_no || profile?.default_item_no || '',
      invoice_extra_lines: order.invoice_extra_lines || profile?.default_invoice_extra_lines || '',
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
    const base = inv.order_code.split(' — ')[0]
    return {
      cert_no: `${base}${lotNo ? `/L${lotNo}` : ''}/BC`,
      date: inv.invoice_date,
      buyer_name: inv.buyer_name,
      buyer_address: inv.buyer_address,
      buyer_email: email,
      bl_number: inv.bl_number || '',
      shipped_on_board: inv.bl_date || '',
      vessel: inv.vessel_name,
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
    const base = inv.order_code.split(' — ')[0]
    return {
      cert_no: `${base}${lotNo ? `/L${lotNo}` : ''}/NW`,
      date: inv.invoice_date,
      // "buyer" trên Non-Wood = consignee (to order of NH), giống mẫu gốc
      buyer_name: inv.consignee || inv.buyer_name,
      buyer_address: inv.consignee_address || inv.buyer_address,
      commodity: `${inv.quantity_tons} MT - NATURAL RUBBER ${gradeLabel}`,
      grade_label: gradeLabel,
      quantity_tons: inv.quantity_tons,
      country_of_origin: inv.country_of_origin,
      net_weight_kg: inv.net_weight_kg,
      gross_weight_kg: inv.gross_weight_kg,
      vessel: inv.vessel_name,
      port_of_loading: inv.port_of_loading,
      port_of_destination: inv.port_of_destination,
      bl_number: inv.bl_number || '',
      contract_no: base,
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
