// ============================================================================
// B2B RUBBER INTAKE SERVICE — Lý lịch mủ tích hợp B2B
// File: src/services/b2b/rubberIntakeB2BService.ts
// ============================================================================
// Query rubber_intake_batches với liên kết deal + b2b_partner
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface B2BRubberIntake {
  id: string
  // Source info
  source_type: 'vietnam' | 'lao_direct' | 'lao_agent'
  intake_date: string
  product_code: string
  // Weights
  gross_weight_kg: number | null
  net_weight_kg: number | null
  drc_percent: number | null
  finished_product_ton: number | null
  // Vietnam pricing
  settled_qty_ton: number | null
  settled_price_per_ton: number | null
  // Lao pricing
  purchase_qty_kg: number | null
  unit_price: number | null
  price_currency: string | null
  total_amount: number | null
  exchange_rate: number | null
  total_amount_vnd: number | null
  // Reference
  invoice_no: string | null
  vehicle_plate: string | null
  vehicle_label: string | null
  location_name: string | null
  buyer_name: string | null
  notes: string | null
  // Status
  status: 'draft' | 'confirmed' | 'settled' | 'cancelled'
  payment_status: string | null
  paid_amount: number | null
  // B2B Integration (NEW)
  deal_id: string | null
  b2b_partner_id: string | null
  lot_code: string | null
  stock_in_id: string | null
  // Relations
  supplier?: { id: string; name: string; code: string; supplier_type: string } | null
  deal?: { id: string; deal_number: string; status: string; partner_id: string } | null
  partner?: { id: string; name: string; code: string; tier: string } | null
  // Timestamps
  created_at: string
  updated_at: string
}

export interface RubberIntakeFilter {
  search?: string
  status?: string
  source_type?: string
  has_deal?: boolean // true = linked to deal, false = standalone
  partner_id?: string
  date_from?: string
  date_to?: string
  page?: number
  pageSize?: number
}

export interface RubberIntakeStats {
  total: number
  draft: number
  confirmed: number
  settled: number
  with_deal: number
  without_deal: number
  total_weight_kg: number
  total_amount: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const SOURCE_LABELS: Record<string, string> = {
  vietnam: 'Việt Nam',
  lao_direct: 'Lào (trực tiếp)',
  lao_agent: 'Lào (đại lý)',
}

export const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  confirmed: 'Đã xác nhận',
  settled: 'Đã quyết toán',
  cancelled: 'Đã hủy',
}

export const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-emerald-100 text-emerald-700',
  settled: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-600',
}

// ============================================================================
// SERVICE
// ============================================================================

const SELECT_FIELDS = `
  *,
  supplier:rubber_suppliers(id, name, code, supplier_type)
`

export const rubberIntakeB2BService = {
  /** Lấy danh sách lý lịch mủ với filter */
  async getAll(filter: RubberIntakeFilter = {}): Promise<{ data: B2BRubberIntake[]; total: number }> {
    const page = filter.page || 1
    const pageSize = filter.pageSize || 50
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('rubber_intake_batches')
      .select(SELECT_FIELDS, { count: 'exact' })
      .order('intake_date', { ascending: false })
      .range(from, to)

    if (filter.status) query = query.eq('status', filter.status)
    if (filter.source_type) query = query.eq('source_type', filter.source_type)
    if (filter.partner_id) query = query.eq('b2b_partner_id', filter.partner_id)
    if (filter.date_from) query = query.gte('intake_date', filter.date_from)
    if (filter.date_to) query = query.lte('intake_date', filter.date_to)
    if (filter.has_deal === true) query = query.not('deal_id', 'is', null)
    if (filter.has_deal === false) query = query.is('deal_id', null)

    if (filter.search) {
      query = query.or(`product_code.ilike.%${filter.search}%,invoice_no.ilike.%${filter.search}%,vehicle_plate.ilike.%${filter.search}%,lot_code.ilike.%${filter.search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('[rubberIntakeB2B] getAll error:', error)
      return { data: [], total: 0 }
    }

    // Enrich with partner info if has b2b_partner_id
    const items = (data || []).map((item: any) => ({
      ...item,
      supplier: Array.isArray(item.supplier) ? item.supplier[0] : item.supplier,
    }))

    // Fetch partner info for items with b2b_partner_id
    const partnerIds = [...new Set(items.filter(i => i.b2b_partner_id).map(i => i.b2b_partner_id))]
    let partnerMap: Record<string, any> = {}
    if (partnerIds.length > 0) {
      const { data: partners } = await supabase
        .from('b2b_partners')
        .select('id, name, code, tier')
        .in('id', partnerIds)
      if (partners) {
        partners.forEach(p => { partnerMap[p.id] = p })
      }
    }

    // Fetch deal info for items with deal_id
    const dealIds = [...new Set(items.filter(i => i.deal_id).map(i => i.deal_id))]
    let dealMap: Record<string, any> = {}
    if (dealIds.length > 0) {
      const { data: deals } = await supabase
        .from('b2b_deals')
        .select('id, deal_number, status, partner_id')
        .in('id', dealIds)
      if (deals) {
        deals.forEach(d => { dealMap[d.id] = d })
      }
    }

    const enriched: B2BRubberIntake[] = items.map(item => ({
      ...item,
      partner: item.b2b_partner_id ? partnerMap[item.b2b_partner_id] || null : null,
      deal: item.deal_id ? dealMap[item.deal_id] || null : null,
    }))

    return { data: enriched, total: count || 0 }
  },

  /** Lấy chi tiết 1 lý lịch mủ */
  async getById(id: string): Promise<B2BRubberIntake | null> {
    const { data, error } = await supabase
      .from('rubber_intake_batches')
      .select(SELECT_FIELDS)
      .eq('id', id)
      .single()

    if (error || !data) return null

    const item: any = {
      ...data,
      supplier: Array.isArray(data.supplier) ? data.supplier[0] : data.supplier,
    }

    // Fetch partner
    if (item.b2b_partner_id) {
      const { data: partner } = await supabase.from('b2b_partners').select('id, name, code, tier').eq('id', item.b2b_partner_id).single()
      item.partner = partner
    }

    // Fetch deal
    if (item.deal_id) {
      const { data: deal } = await supabase.from('b2b_deals').select('id, deal_number, status, partner_id').eq('id', item.deal_id).single()
      item.deal = deal
    }

    return item
  },

  /** Thống kê */
  async getStats(filter?: { date_from?: string; date_to?: string }): Promise<RubberIntakeStats> {
    let query = supabase.from('rubber_intake_batches').select('id, status, deal_id, net_weight_kg, total_amount')
    if (filter?.date_from) query = query.gte('intake_date', filter.date_from)
    if (filter?.date_to) query = query.lte('intake_date', filter.date_to)

    const { data } = await query
    const items = data || []

    return {
      total: items.length,
      draft: items.filter(i => i.status === 'draft').length,
      confirmed: items.filter(i => i.status === 'confirmed').length,
      settled: items.filter(i => i.status === 'settled').length,
      with_deal: items.filter(i => i.deal_id).length,
      without_deal: items.filter(i => !i.deal_id).length,
      total_weight_kg: items.reduce((s, i) => s + (i.net_weight_kg || 0), 0),
      total_amount: items.reduce((s, i) => s + (i.total_amount || 0), 0),
    }
  },

  /** Tạo lý lịch mủ từ Deal (khi accept offer) */
  async createFromDeal(params: {
    deal_id: string
    partner_id: string
    lot_code: string
    lot_description?: string
    source_type?: 'vietnam' | 'lao_direct' | 'lao_agent'
    product_code?: string
    quantity_kg: number
    drc_percent?: number
    unit_price: number
    source_region?: string
    intake_date?: string
    // EUDR traceability — copy từ Deal (đã có GPS từ booking)
    rubber_region?: string
    rubber_region_lat?: number
    rubber_region_lng?: number
  }): Promise<string | null> {
    try {
      if (!params.quantity_kg || params.quantity_kg <= 0 || !params.unit_price || params.unit_price <= 0) {
        console.error('[rubberIntakeB2B] invalid quantity or price')
        return null
      }
      const qtyTon = params.quantity_kg / 1000
      const pricePerTon = params.unit_price * 1000 // đ/kg → đ/tấn
      const totalAmount = qtyTon * pricePerTon     // tấn × đ/tấn

      const { data, error } = await supabase
        .from('rubber_intake_batches')
        .insert({
          deal_id: params.deal_id,
          b2b_partner_id: params.partner_id,
          lot_code: params.lot_code || null,
          source_type: params.source_type || 'vietnam',
          product_code: params.product_code || 'MU_CAO_SU',
          intake_date: params.intake_date || new Date().toISOString().split('T')[0],
          net_weight_kg: params.quantity_kg,
          gross_weight_kg: params.quantity_kg,
          drc_percent: params.drc_percent || null,
          settled_qty_ton: qtyTon,
          settled_price_per_ton: pricePerTon,
          total_amount: totalAmount,
          location_name: params.source_region || null,
          notes: params.lot_description || null,
          status: 'draft',
          // EUDR fields
          rubber_region: params.rubber_region || null,
          rubber_region_lat: params.rubber_region_lat || null,
          rubber_region_lng: params.rubber_region_lng || null,
          deforestation_risk_assessment: 'medium', // default — admin update sau khi verify
          // eudr_statement_ref để NULL đến khi submit TRACES
        })
        .select('id')
        .single()

      if (error) throw error
      return data?.id || null
    } catch (e) {
      console.error('[rubberIntakeB2B] createFromDeal error:', e)
      return null
    }
  },
}

export default rubberIntakeB2BService
