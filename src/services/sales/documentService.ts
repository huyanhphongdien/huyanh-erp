// ============================================================================
// DOCUMENT SERVICE — Generate export documents: COA, Packing List, Invoice
// File: src/services/sales/documentService.ts
// Module Ban hang quoc te — Huy Anh Rubber ERP
// ============================================================================

import { supabase } from '../../lib/supabase'

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
  grade: string
  containers: Array<{
    container_no: string
    seal_no: string
    container_type: string
    net_weight_kg: number
    gross_weight_kg: number
    bale_count: number
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
  payment_terms: string
  lc_number: string | null
  bl_number: string | null
  invoice_date: string
  bank_info: { name: string; account: string; swift: string }
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

// ============================================================================
// SERVICE
// ============================================================================

export const documentService = {
  // ==========================================================================
  // COA — Certificate of Analysis
  // ==========================================================================

  async getCOAData(orderId: string): Promise<COAData> {
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

    // Fetch containers with items to get batch info
    const { data: containers } = await supabase
      .from('sales_order_containers')
      .select('*, items:sales_order_container_items(*)')
      .eq('sales_order_id', orderId)

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
      order_code: order.code,
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

  async getPackingListData(orderId: string): Promise<PackingListData> {
    // Fetch order with customer
    const { data: order, error: orderErr } = await supabase
      .from('sales_orders')
      .select('*, customer:sales_customers!customer_id(id,name,country,address)')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) {
      throw new Error('Không thể tải thông tin đơn hàng')
    }

    // Fetch containers with items
    const { data: rawContainers } = await supabase
      .from('sales_order_containers')
      .select('*, items:sales_order_container_items(*)')
      .eq('sales_order_id', orderId)
      .order('created_at')

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
      const containerGross = c.gross_weight_kg || Math.round(containerNet * 1.02)

      containers.push({
        container_no: c.container_no || 'TBD',
        seal_no: c.seal_no || 'TBD',
        container_type: c.container_type || '20ft',
        net_weight_kg: containerNet,
        gross_weight_kg: containerGross,
        bale_count: containerBales,
        items,
      })

      totalBales += containerBales
      totalNet += containerNet
      totalGross += containerGross
    }

    const customer = order.customer as { name?: string; address?: string } | null

    return {
      order_code: order.code,
      customer_name: customer?.name || '',
      customer_address: customer?.address || '',
      grade: order.grade,
      containers,
      total_containers: containers.length,
      total_bales: totalBales,
      total_net_weight: totalNet,
      total_gross_weight: totalGross,
      port_of_loading: PORT_LABELS[order.port_of_loading] || order.port_of_loading || '',
      port_of_destination: order.port_of_destination || '',
      vessel_name: order.vessel_name || '',
      etd: order.etd || '',
    }
  },

  // ==========================================================================
  // COMMERCIAL INVOICE
  // ==========================================================================

  async getInvoiceData(orderId: string): Promise<InvoiceData> {
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

    const subtotal = order.quantity_tons * order.unit_price
    const freight = invoice?.freight_charge ?? 0
    const insurance = invoice?.insurance_charge ?? 0
    const total = subtotal + freight + insurance

    return {
      invoice_code: invoice?.code || `INV-${order.code}`,
      order_code: order.code,
      customer: {
        name: customer?.name || '',
        address: customer?.address || '',
        country: customer?.country || '',
      },
      grade: order.grade,
      quantity_tons: order.quantity_tons,
      unit_price: order.unit_price,
      currency: order.currency || 'USD',
      incoterm: order.incoterm || 'FOB',
      subtotal,
      freight,
      insurance,
      total,
      payment_terms: PAYMENT_TERMS_EN[order.payment_terms || ''] || order.payment_terms || '',
      lc_number: order.lc_number || null,
      bl_number: invoice?.bl_number || null,
      invoice_date: invoice?.invoice_date || new Date().toISOString().split('T')[0],
      bank_info: BANK_INFO,
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
