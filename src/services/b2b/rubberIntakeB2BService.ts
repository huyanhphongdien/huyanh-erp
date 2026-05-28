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
  /** Loại mủ (HAC bonus): 'tap' = mủ tạp, 'nuoc' = mủ nước. NULL = chưa phân loại → bonus = 0. */
  rubber_type: 'tap' | 'nuoc' | null
  /** Loại mủ thô (5 loại chi tiết): mu_nuoc, mu_tap, mu_dong, mu_chen, mu_to. */
  raw_rubber_type: 'mu_nuoc' | 'mu_tap' | 'mu_dong' | 'mu_chen' | 'mu_to' | null
  facility_id: string | null
  // Weights
  gross_weight_kg: number | null
  net_weight_kg: number | null
  drc_percent: number | null
  /** KL khô = net × drc/100. Generated column trong DB (sprint1_04). */
  dry_weight_kg: number | null
  /** Số đo metrolac/lactometer tại cân lần 2 (Tân Lâm flow). */
  field_dot_reading: number | null
  /** Mã LLM gộp xe (vd "TMMN-07 XE 1 (19/05)"). */
  consolidation_code: string | null
  /** Số PNK auto-sequence per (facility, year). */
  pnk_number: number | null
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
  facility?: { id: string; code: string; name: string } | null
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
  facility_id?: string
  raw_rubber_type?: 'mu_nuoc' | 'mu_tap' | 'mu_dong' | 'mu_chen' | 'mu_to'
  consolidation_code?: string
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
  total_dry_weight_kg: number
  total_amount: number
}

// ============================================================================
// AGGREGATED STATS — Tab "Thống kê" trên /b2b/rubber-intake
// ============================================================================

export interface DailyIntakePoint {
  date: string // YYYY-MM-DD
  count: number
  net_kg: number
  dry_kg: number
  amount: number
  avg_drc: number | null
}

export interface PartnerAggregate {
  partner_id: string
  name: string
  code: string
  tier: string | null
  count: number
  net_kg: number
  dry_kg: number
  amount: number
  avg_drc: number | null
}

export interface RegionAggregate {
  name: string // location_name hoặc 'Không xác định'
  count: number
  net_kg: number
  dry_kg: number
  amount: number
}

export interface RawTypeAggregate {
  type: string // mu_nuoc | mu_tap | mu_dong | mu_chen | mu_to | unclassified
  count: number
  net_kg: number
  dry_kg: number
  amount: number
}

export interface AggregatedIntakeStats {
  totals: {
    count: number
    net_kg: number
    dry_kg: number
    amount: number
    avg_drc: number | null
    avg_price_per_dry_kg: number | null
  }
  daily: DailyIntakePoint[]
  byPartner: PartnerAggregate[]
  byRegion: RegionAggregate[]
  byRawType: RawTypeAggregate[]
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

// Không dùng PostgREST embedded supplier join: rubber_suppliers có thể không tồn tại
// trong mọi môi trường (mig hac13_06 là CONDITIONAL). Fetch supplier riêng — đồng nhất
// với partner + deal — để tránh silent fail nuốt toàn bộ list khi join lỗi.
const SELECT_FIELDS = '*'

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
    if (filter.facility_id) query = query.eq('facility_id', filter.facility_id)
    if (filter.raw_rubber_type) query = query.eq('raw_rubber_type', filter.raw_rubber_type)
    if (filter.consolidation_code) query = query.eq('consolidation_code', filter.consolidation_code)
    if (filter.date_from) query = query.gte('intake_date', filter.date_from)
    if (filter.date_to) query = query.lte('intake_date', filter.date_to)
    if (filter.has_deal === true) query = query.not('deal_id', 'is', null)
    if (filter.has_deal === false) query = query.is('deal_id', null)

    if (filter.search) {
      query = query.or(`product_code.ilike.%${filter.search}%,invoice_no.ilike.%${filter.search}%,vehicle_plate.ilike.%${filter.search}%,lot_code.ilike.%${filter.search}%,consolidation_code.ilike.%${filter.search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('[rubberIntakeB2B] getAll error:', error)
      throw new Error(`Không tải được lý lịch mủ: ${error.message}`)
    }

    const items = (data || []) as any[]

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

    // Fetch supplier info for items with supplier_id (best-effort: bảng có thể không tồn tại)
    const supplierIds = [...new Set(items.filter(i => i.supplier_id).map(i => i.supplier_id))]
    let supplierMap: Record<string, any> = {}
    if (supplierIds.length > 0) {
      const { data: suppliers, error: supErr } = await supabase
        .from('rubber_suppliers')
        .select('id, name, code, supplier_type')
        .in('id', supplierIds)
      if (supErr) {
        // Bảng có thể không tồn tại trong môi trường — bỏ qua, không vỡ list
        console.warn('[rubberIntakeB2B] supplier fetch skipped:', supErr.message)
      } else if (suppliers) {
        suppliers.forEach(s => { supplierMap[s.id] = s })
      }
    }

    // Fetch facility info
    const facilityIds = [...new Set(items.filter(i => i.facility_id).map(i => i.facility_id))]
    let facilityMap: Record<string, any> = {}
    if (facilityIds.length > 0) {
      const { data: facilities } = await supabase
        .from('facilities')
        .select('id, code, name')
        .in('id', facilityIds)
      if (facilities) {
        facilities.forEach(f => { facilityMap[f.id] = f })
      }
    }

    const enriched: B2BRubberIntake[] = items.map(item => ({
      ...item,
      partner: item.b2b_partner_id ? partnerMap[item.b2b_partner_id] || null : null,
      deal: item.deal_id ? dealMap[item.deal_id] || null : null,
      supplier: item.supplier_id ? supplierMap[item.supplier_id] || null : null,
      facility: item.facility_id ? facilityMap[item.facility_id] || null : null,
    }))

    return { data: enriched, total: count || 0 }
  },

  /** Lấy chi tiết 1 lý lịch mủ */
  async getById(id: string): Promise<B2BRubberIntake | null> {
    const { data, error } = await supabase
      .from('rubber_intake_batches')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) return null

    const item: any = { ...data }

    if (item.b2b_partner_id) {
      const { data: partner } = await supabase.from('b2b_partners').select('id, name, code, tier').eq('id', item.b2b_partner_id).single()
      item.partner = partner
    }

    if (item.deal_id) {
      const { data: deal } = await supabase.from('b2b_deals').select('id, deal_number, status, partner_id').eq('id', item.deal_id).single()
      item.deal = deal
    }

    if (item.supplier_id) {
      const { data: supplier, error: supErr } = await supabase
        .from('rubber_suppliers')
        .select('id, name, code, supplier_type')
        .eq('id', item.supplier_id)
        .maybeSingle()
      if (supErr) console.warn('[rubberIntakeB2B] supplier fetch skipped:', supErr.message)
      else item.supplier = supplier
    }

    if (item.facility_id) {
      const { data: facility } = await supabase.from('facilities').select('id, code, name').eq('id', item.facility_id).single()
      item.facility = facility
    }

    return item
  },

  /** Thống kê */
  async getStats(filter?: { date_from?: string; date_to?: string; facility_id?: string; raw_rubber_type?: string }): Promise<RubberIntakeStats> {
    let query = supabase.from('rubber_intake_batches').select('id, status, deal_id, net_weight_kg, dry_weight_kg, total_amount')
    if (filter?.date_from) query = query.gte('intake_date', filter.date_from)
    if (filter?.date_to) query = query.lte('intake_date', filter.date_to)
    if (filter?.facility_id) query = query.eq('facility_id', filter.facility_id)
    if (filter?.raw_rubber_type) query = query.eq('raw_rubber_type', filter.raw_rubber_type)

    const { data } = await query
    const items = (data || []) as any[]

    return {
      total: items.length,
      draft: items.filter(i => i.status === 'draft').length,
      confirmed: items.filter(i => i.status === 'confirmed').length,
      settled: items.filter(i => i.status === 'settled').length,
      with_deal: items.filter(i => i.deal_id).length,
      without_deal: items.filter(i => !i.deal_id).length,
      total_weight_kg: items.reduce((s, i) => s + (i.net_weight_kg || 0), 0),
      total_dry_weight_kg: items.reduce((s, i) => s + (i.dry_weight_kg || 0), 0),
      total_amount: items.reduce((s, i) => s + (i.total_amount || 0), 0),
    }
  },

  /**
   * Thống kê tổng hợp cho tab "Thống kê" — gom theo ngày / đại lý / vùng / loại mủ.
   * Fetch tất cả batches trong date range (limit 5000), aggregate client-side.
   */
  async getAggregatedStats(filter: {
    date_from: string
    date_to: string
    facility_id?: string
    raw_rubber_type?: 'mu_nuoc' | 'mu_tap' | 'mu_dong' | 'mu_chen' | 'mu_to'
    partner_id?: string
    search?: string
  }): Promise<AggregatedIntakeStats> {
    let query = supabase
      .from('rubber_intake_batches')
      .select('id, intake_date, b2b_partner_id, location_name, raw_rubber_type, net_weight_kg, dry_weight_kg, drc_percent, total_amount, lot_code, product_code, invoice_no, vehicle_plate, consolidation_code')
      .gte('intake_date', filter.date_from)
      .lte('intake_date', filter.date_to)
      .limit(5000)

    if (filter.facility_id) query = query.eq('facility_id', filter.facility_id)
    if (filter.raw_rubber_type) query = query.eq('raw_rubber_type', filter.raw_rubber_type)
    if (filter.partner_id) query = query.eq('b2b_partner_id', filter.partner_id)
    if (filter.search) {
      query = query.or(`product_code.ilike.%${filter.search}%,invoice_no.ilike.%${filter.search}%,vehicle_plate.ilike.%${filter.search}%,lot_code.ilike.%${filter.search}%,consolidation_code.ilike.%${filter.search}%,location_name.ilike.%${filter.search}%`)
    }

    const { data, error } = await query
    if (error) {
      console.error('[rubberIntakeB2B] getAggregatedStats error:', error)
      throw new Error(`Không tải được thống kê: ${error.message}`)
    }

    const items = (data || []) as any[]

    // Fetch partner info batch
    const partnerIds = [...new Set(items.filter(i => i.b2b_partner_id).map(i => i.b2b_partner_id))]
    const partnerMap: Record<string, { id: string; name: string; code: string; tier: string | null }> = {}
    if (partnerIds.length > 0) {
      const { data: partners } = await supabase
        .from('b2b_partners')
        .select('id, name, code, tier')
        .in('id', partnerIds)
      if (partners) partners.forEach(p => { partnerMap[p.id] = p as any })
    }

    // Helper: dry weight (fallback compute từ net × drc nếu DB chưa generate)
    const dryOf = (item: any): number => {
      if (item.dry_weight_kg != null) return Number(item.dry_weight_kg) || 0
      if (item.net_weight_kg != null && item.drc_percent != null) {
        return (Number(item.net_weight_kg) || 0) * (Number(item.drc_percent) || 0) / 100
      }
      return 0
    }

    // Totals
    let totalNet = 0, totalDry = 0, totalAmount = 0
    let drcSum = 0, drcCount = 0
    for (const it of items) {
      totalNet += Number(it.net_weight_kg) || 0
      totalDry += dryOf(it)
      totalAmount += Number(it.total_amount) || 0
      if (it.drc_percent != null) {
        drcSum += Number(it.drc_percent) || 0
        drcCount++
      }
    }
    const avgDrc = drcCount > 0 ? drcSum / drcCount : null
    const avgPricePerDryKg = totalDry > 0 ? totalAmount / totalDry : null

    // Daily aggregation
    const dailyMap = new Map<string, { count: number; net: number; dry: number; amount: number; drcSum: number; drcCount: number }>()
    for (const it of items) {
      const d = (it.intake_date as string).slice(0, 10)
      const slot = dailyMap.get(d) || { count: 0, net: 0, dry: 0, amount: 0, drcSum: 0, drcCount: 0 }
      slot.count++
      slot.net += Number(it.net_weight_kg) || 0
      slot.dry += dryOf(it)
      slot.amount += Number(it.total_amount) || 0
      if (it.drc_percent != null) { slot.drcSum += Number(it.drc_percent) || 0; slot.drcCount++ }
      dailyMap.set(d, slot)
    }
    const daily: DailyIntakePoint[] = [...dailyMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, s]) => ({
        date,
        count: s.count,
        net_kg: s.net,
        dry_kg: s.dry,
        amount: s.amount,
        avg_drc: s.drcCount > 0 ? s.drcSum / s.drcCount : null,
      }))

    // Partner aggregation
    const partnerAggMap = new Map<string, { count: number; net: number; dry: number; amount: number; drcSum: number; drcCount: number }>()
    for (const it of items) {
      if (!it.b2b_partner_id) continue
      const slot = partnerAggMap.get(it.b2b_partner_id) || { count: 0, net: 0, dry: 0, amount: 0, drcSum: 0, drcCount: 0 }
      slot.count++
      slot.net += Number(it.net_weight_kg) || 0
      slot.dry += dryOf(it)
      slot.amount += Number(it.total_amount) || 0
      if (it.drc_percent != null) { slot.drcSum += Number(it.drc_percent) || 0; slot.drcCount++ }
      partnerAggMap.set(it.b2b_partner_id, slot)
    }
    const byPartner: PartnerAggregate[] = [...partnerAggMap.entries()]
      .map(([pid, s]) => {
        const p = partnerMap[pid] || { id: pid, name: '(Không rõ)', code: '', tier: null }
        return {
          partner_id: pid,
          name: p.name,
          code: p.code,
          tier: p.tier,
          count: s.count,
          net_kg: s.net,
          dry_kg: s.dry,
          amount: s.amount,
          avg_drc: s.drcCount > 0 ? s.drcSum / s.drcCount : null,
        }
      })
      .sort((a, b) => b.dry_kg - a.dry_kg)

    // Region aggregation (theo location_name)
    const regionMap = new Map<string, { count: number; net: number; dry: number; amount: number }>()
    for (const it of items) {
      const name = (it.location_name as string)?.trim() || 'Không xác định'
      const slot = regionMap.get(name) || { count: 0, net: 0, dry: 0, amount: 0 }
      slot.count++
      slot.net += Number(it.net_weight_kg) || 0
      slot.dry += dryOf(it)
      slot.amount += Number(it.total_amount) || 0
      regionMap.set(name, slot)
    }
    const byRegion: RegionAggregate[] = [...regionMap.entries()]
      .map(([name, s]) => ({ name, count: s.count, net_kg: s.net, dry_kg: s.dry, amount: s.amount }))
      .sort((a, b) => b.dry_kg - a.dry_kg)

    // Raw type aggregation
    const rawMap = new Map<string, { count: number; net: number; dry: number; amount: number }>()
    for (const it of items) {
      const t = (it.raw_rubber_type as string) || 'unclassified'
      const slot = rawMap.get(t) || { count: 0, net: 0, dry: 0, amount: 0 }
      slot.count++
      slot.net += Number(it.net_weight_kg) || 0
      slot.dry += dryOf(it)
      slot.amount += Number(it.total_amount) || 0
      rawMap.set(t, slot)
    }
    const byRawType: RawTypeAggregate[] = [...rawMap.entries()]
      .map(([type, s]) => ({ type, count: s.count, net_kg: s.net, dry_kg: s.dry, amount: s.amount }))
      .sort((a, b) => b.dry_kg - a.dry_kg)

    return {
      totals: {
        count: items.length,
        net_kg: totalNet,
        dry_kg: totalDry,
        amount: totalAmount,
        avg_drc: avgDrc,
        avg_price_per_dry_kg: avgPricePerDryKg,
      },
      daily,
      byPartner,
      byRegion,
      byRawType,
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
    /** Loại mủ — bắt buộc nếu muốn batch này tính bonus đại lý (quy chế T1/2026 tạp + T6/2026 nước). */
    rubber_type?: 'tap' | 'nuoc' | null
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
          rubber_type: params.rubber_type ?? null,
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
