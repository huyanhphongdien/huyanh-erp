// ============================================================================
// DEMAND SERVICE — Service quan ly Nhu cau mua B2B
// File: src/services/b2b/demandService.ts
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================
// TYPES
// ============================================

export type DemandStatus = 'draft' | 'published' | 'partially_filled' | 'filled' | 'closed' | 'cancelled'
export type DemandType = 'purchase' | 'processing'
export type OfferStatus = 'pending' | 'submitted' | 'accepted' | 'rejected' | 'withdrawn'

export interface Demand {
  id: string
  code: string
  demand_type: DemandType
  product_type: string
  product_name: string
  quantity_kg: number
  quantity_filled_kg: number
  drc_min: number | null
  drc_max: number | null
  price_min: number | null
  price_max: number | null
  preferred_regions: string[] | null
  deadline: string | null
  delivery_from: string | null
  delivery_to: string | null
  warehouse_id: string | null
  status: DemandStatus
  processing_fee_per_ton: number | null
  expected_output_rate: number | null
  target_grade: string | null
  notes: string | null
  internal_notes: string | null
  priority: string
  published_at: string | null
  created_at: string
  updated_at: string
  // computed
  offers_count?: number
  pending_offers_count?: number
}

export interface DemandOffer {
  id: string
  demand_id: string
  partner_id: string
  offered_quantity_kg: number
  offered_price: number
  offered_drc: number | null
  offered_delivery_date: string | null
  rubber_type: string | null
  source_region: string | null
  status: OfferStatus
  deal_id: string | null
  rejected_reason: string | null
  notes: string | null
  created_at: string
  // Lot info (multi-lot support)
  lot_code: string | null
  lot_description: string | null
  lot_drc: number | null
  lot_source: string | null
  partner?: { id: string; name: string; code: string; tier: string; phone: string | null }
}

export interface DemandListParams {
  page?: number
  pageSize?: number
  search?: string
  status?: DemandStatus | 'all'
  demand_type?: DemandType | 'all'
  priority?: string | 'all'
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface PaginatedDemandResponse {
  data: Demand[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface DemandCreateData {
  demand_type: DemandType
  product_type: string
  product_name: string
  quantity_kg: number
  drc_min?: number | null
  drc_max?: number | null
  price_min?: number | null
  price_max?: number | null
  preferred_regions?: string[] | null
  deadline?: string | null
  delivery_from?: string | null
  delivery_to?: string | null
  warehouse_id?: string | null
  processing_fee_per_ton?: number | null
  expected_output_rate?: number | null
  target_grade?: string | null
  notes?: string | null
  internal_notes?: string | null
  priority?: string
}

export interface DemandUpdateData {
  demand_type?: DemandType
  product_type?: string
  product_name?: string
  quantity_kg?: number
  drc_min?: number | null
  drc_max?: number | null
  price_min?: number | null
  price_max?: number | null
  preferred_regions?: string[] | null
  deadline?: string | null
  delivery_from?: string | null
  delivery_to?: string | null
  warehouse_id?: string | null
  processing_fee_per_ton?: number | null
  expected_output_rate?: number | null
  target_grade?: string | null
  notes?: string | null
  internal_notes?: string | null
  priority?: string
  status?: DemandStatus
}

// ============================================
// CONSTANTS
// ============================================

export const DEMAND_STATUS_LABELS: Record<DemandStatus, string> = {
  draft: 'Nháp',
  published: 'Đang đăng',
  partially_filled: 'Đủ một phần',
  filled: 'Đã đủ',
  closed: 'Đã đóng',
  cancelled: 'Đã hủy',
}

export const DEMAND_STATUS_COLORS: Record<DemandStatus, string> = {
  draft: 'default',
  published: 'blue',
  partially_filled: 'orange',
  filled: 'green',
  closed: 'purple',
  cancelled: 'red',
}

export const DEMAND_TYPE_LABELS: Record<DemandType, string> = {
  purchase: 'Mua đứt',
  processing: 'Gia công',
}

export const DEMAND_TYPE_COLORS: Record<DemandType, string> = {
  purchase: 'orange',
  processing: 'purple',
}

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  pending: 'Chờ duyệt',
  submitted: 'Chờ duyệt',
  accepted: 'Đã chấp nhận',
  rejected: 'Đã từ chối',
  withdrawn: 'Đã rút',
}

export const OFFER_STATUS_COLORS: Record<OfferStatus, string> = {
  pending: 'orange',
  submitted: 'orange',
  accepted: 'green',
  rejected: 'red',
  withdrawn: 'default',
}

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Thấp',
  normal: 'Bình thường',
  high: 'Cao',
  urgent: 'Khẩn cấp',
}

export const PRIORITY_COLORS: Record<string, string> = {
  low: 'default',
  normal: 'blue',
  high: 'orange',
  urgent: 'red',
}

// Re-export từ constants chung — đảm bảo đồng bộ toàn hệ thống
export { PRODUCT_TYPE_FLAT_OPTIONS as PRODUCT_TYPE_OPTIONS, PRODUCT_TYPE_LABELS as PRODUCT_TYPE_NAMES } from '../../constants/rubberProducts'

export const REGION_OPTIONS = [
  'Bình Phước',
  'Tây Ninh',
  'Đồng Nai',
  'Gia Lai',
  'Lào',
  'Campuchia',
  'Thái Lan',
]

// ============================================
// HELPER FUNCTIONS
// ============================================

const generateCode = (): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const day = now.getDate().toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 5).toUpperCase()
  return `NCM-${year}${month}${day}-${random}`
}

// ============================================
// SERVICE
// ============================================

export const demandService = {
  // ============================================
  // CODE GENERATION
  // ============================================

  generateCode,

  // ============================================
  // CREATE
  // ============================================

  async create(data: DemandCreateData): Promise<Demand> {
    const code = generateCode()

    const { data: result, error } = await supabase
      .from('b2b_demands')
      .insert({
        code,
        demand_type: data.demand_type,
        product_type: data.product_type,
        product_name: data.product_name,
        quantity_kg: data.quantity_kg,
        quantity_filled_kg: 0,
        drc_min: data.drc_min || null,
        drc_max: data.drc_max || null,
        price_min: data.price_min || null,
        price_max: data.price_max || null,
        preferred_regions: data.preferred_regions || null,
        deadline: data.deadline || null,
        delivery_from: data.delivery_from || null,
        delivery_to: data.delivery_to || null,
        warehouse_id: data.warehouse_id || null,
        status: 'draft' as DemandStatus,
        processing_fee_per_ton: data.processing_fee_per_ton || null,
        expected_output_rate: data.expected_output_rate || null,
        target_grade: data.target_grade || null,
        notes: data.notes || null,
        internal_notes: data.internal_notes || null,
        priority: data.priority || 'normal',
      })
      .select('*')
      .single()

    if (error) throw error
    return result as Demand
  },

  // ============================================
  // UPDATE
  // ============================================

  async update(id: string, data: DemandUpdateData): Promise<Demand> {
    const { data: result, error } = await supabase
      .from('b2b_demands')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return result as Demand
  },

  // ============================================
  // LIST & QUERY
  // ============================================

  async getList(params: DemandListParams = {}): Promise<PaginatedDemandResponse> {
    const {
      page = 1,
      pageSize = 10,
      search,
      status,
      demand_type,
      priority,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('b2b_demands')
      .select('*', { count: 'exact' })

    // Filter by status
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    // Filter by demand_type
    if (demand_type && demand_type !== 'all') {
      query = query.eq('demand_type', demand_type)
    }

    // Filter by priority
    if (priority && priority !== 'all') {
      query = query.eq('priority', priority)
    }

    // Search by code or product_name
    if (search) {
      query = query.or(`code.ilike.%${search}%,product_name.ilike.%${search}%`)
    }

    // Sorting
    query = query.order(sort_by, { ascending: sort_order === 'asc' })

    // Pagination
    const { data, error, count } = await query.range(from, to)

    if (error) throw error

    // Fetch offers counts for each demand
    const demands = data || []
    const demandIds = demands.map(d => d.id)

    let offersData: any[] = []
    if (demandIds.length > 0) {
      const { data: offers, error: offersError } = await supabase
        .from('b2b_demand_offers')
        .select('demand_id, status')
        .in('demand_id', demandIds)

      if (!offersError && offers) {
        offersData = offers
      }
    }

    const demandsWithCounts = demands.map(demand => {
      const demandOffers = offersData.filter(o => o.demand_id === demand.id)
      return {
        ...demand,
        offers_count: demandOffers.length,
        pending_offers_count: demandOffers.filter(o => o.status === 'pending' || o.status === 'submitted').length,
      }
    }) as Demand[]

    return {
      data: demandsWithCounts,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  // ============================================
  // GET BY ID
  // ============================================

  async getById(id: string): Promise<Demand | null> {
    const { data, error } = await supabase
      .from('b2b_demands')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    // Get offers count
    const { data: offers } = await supabase
      .from('b2b_demand_offers')
      .select('id, status')
      .eq('demand_id', id)

    return {
      ...data,
      offers_count: offers?.length || 0,
      pending_offers_count: offers?.filter(o => o.status === 'pending' || o.status === 'submitted').length || 0,
    } as Demand
  },

  // ============================================
  // STATUS TRANSITIONS
  // ============================================

  async publish(id: string): Promise<Demand> {
    const { data, error } = await supabase
      .from('b2b_demands')
      .update({
        status: 'published' as DemandStatus,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return data as Demand
  },

  async close(id: string): Promise<Demand> {
    const { data, error } = await supabase
      .from('b2b_demands')
      .update({
        status: 'closed' as DemandStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return data as Demand
  },

  async cancel(id: string): Promise<Demand> {
    const { data, error } = await supabase
      .from('b2b_demands')
      .update({
        status: 'cancelled' as DemandStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return data as Demand
  },

  // ============================================
  // DELETE
  // ============================================

  async delete(id: string): Promise<void> {
    const demand = await this.getById(id)
    if (!demand) throw new Error('Nhu cầu không tồn tại')
    if (demand.status !== 'draft') {
      throw new Error('Chỉ có thể xóa nhu cầu ở trạng thái "Nháp"')
    }

    const { error } = await supabase
      .from('b2b_demands')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // ============================================
  // OFFERS
  // ============================================

  async getOffers(demandId: string): Promise<DemandOffer[]> {
    // FK b2b_demand_offers.partner_id → b2b.partners đã được tạo trong migration
    // phase 1.3 → PostgREST giờ detect được embedded resource.
    const { data, error } = await supabase
      .from('b2b_demand_offers')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, name, code, tier, phone
        )
      `)
      .eq('demand_id', demandId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return (data || []).map(offer => ({
      ...offer,
      partner: Array.isArray(offer.partner) ? offer.partner[0] : offer.partner,
    })) as DemandOffer[]
  },

  async acceptOffer(offerId: string, demandId: string): Promise<{ offer: DemandOffer; deal: any }> {
    // 1. Get the offer + partner via PostgREST embedded resource
    // (FK đã tạo trong migration phase 1.3 — PostgREST detect được)
    const { data: rawOffer, error: offerError } = await supabase
      .from('b2b_demand_offers')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, name, code, tier, phone
        )
      `)
      .eq('id', offerId)
      .single()

    if (offerError) throw offerError
    const offer = {
      ...rawOffer,
      partner: Array.isArray(rawOffer.partner) ? rawOffer.partner[0] : rawOffer.partner,
    }

    // ★ Idempotency check: already accepted?
    if (offer.status === 'accepted') {
      throw new Error('Chào giá này đã được chấp nhận trước đó')
    }
    if (offer.deal_id) {
      throw new Error('Chào giá này đã có Deal liên kết')
    }

    // 2. Get the demand
    const demand = await this.getById(demandId)
    if (!demand) throw new Error('Nhu cầu không tồn tại')

    // ★ V2: Đảo thứ tự — TẠO DEAL TRƯỚC, update offer status SAU.
    // Lý do: nếu deal insert fail mà offer đã marked 'accepted' thì offer bị
    // mồ côi (status='accepted' nhưng không có deal_id). Thứ tự mới đảm bảo:
    // - Deal tạo fail → offer vẫn ở 'submitted', user retry được
    // - Deal tạo OK → offer được update accepted + deal_id trong cùng request

    // 3. Tạo Deal từ offer
    const dealNumber = `DL${new Date().getFullYear().toString().slice(-2)}${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

    // total_value: qty_kg × price_per_kg (price luôn là đ/kg từ offer)
    const totalValueVnd = offer.offered_quantity_kg * offer.offered_price

    // Generate lot_code BEFORE insert (tách ra để tránh async issue)
    let generatedLotCode: string | null = offer.lot_code || null
    try {
      const partnerData = Array.isArray(offer.partner) ? offer.partner[0] : offer.partner
      if (partnerData?.code) {
        const { partnerService: ps } = await import('./partnerService')
        generatedLotCode = await ps.generateNextLotCode(partnerData.code)
      }
    } catch (e) { console.error('[acceptOffer] lot_code gen error:', e) }

    const { data: deal, error: dealError } = await supabase
      .from('b2b_deals')
      .insert({
        deal_number: dealNumber,
        partner_id: offer.partner_id,
        deal_type: demand.demand_type === 'purchase' ? 'purchase' : 'processing',
        product_name: demand.product_name,
        quantity_kg: offer.offered_quantity_kg,
        unit_price: offer.offered_price,
        total_value_vnd: totalValueVnd,
        // ★ V3: 'pending' OK sau migration 14/04 (DB CHECK đã sync với code TS).
        status: 'pending',
        demand_id: demandId,
        // ★ V3: offer_id OK sau migration 14/04 — FK đã trỏ về public.b2b_demand_offers
        offer_id: offerId,
        processing_fee_per_ton: demand.processing_fee_per_ton || null,
        expected_output_rate: demand.expected_output_rate || null,
        notes: `Tạo từ chào giá cho nhu cầu ${demand.code}`,
        lot_code: generatedLotCode,
        lot_description: offer.lot_description || null,
        source_region: offer.source_region || null,
        expected_drc: offer.lot_drc || offer.offered_drc || null,
      })
      .select('*')
      .single()

    if (dealError) throw dealError

    // 4. Update offer: status + deal_id (chỉ chạy khi deal insert OK)
    const { error: updateOfferError } = await supabase
      .from('b2b_demand_offers')
      .update({
        status: 'accepted' as OfferStatus,
        deal_id: deal.id,
      })
      .eq('id', offerId)

    if (updateOfferError) {
      // Rollback: xóa deal vừa tạo để tránh deal mồ côi không có offer link
      console.error('[acceptOffer] offer update failed, rolling back deal:', updateOfferError)
      await supabase.from('b2b_deals').delete().eq('id', deal.id)
      throw updateOfferError
    }

    // ★ 5b. Auto-create rubber_intake_batch (Lý lịch mủ)
    try {
      const { rubberIntakeB2BService } = await import('./rubberIntakeB2BService')
      const intakeId = await rubberIntakeB2BService.createFromDeal({
        deal_id: deal.id,
        partner_id: offer.partner_id,
        lot_code: deal.lot_code || dealNumber,
        lot_description: offer.lot_description || offer.notes || undefined,
        product_code: demand.product_name || 'MU_CAO_SU',
        quantity_kg: offer.offered_quantity_kg,
        drc_percent: offer.lot_drc || offer.offered_drc || undefined,
        unit_price: offer.offered_price,
        source_region: offer.source_region || undefined,
        intake_date: offer.offered_delivery_date || undefined,
      })
      // Link back: deal → rubber_intake
      if (intakeId) {
        await supabase.from('b2b_deals').update({ rubber_intake_id: intakeId }).eq('id', deal.id)
      } else {
        console.warn('[demandService] rubber intake created but returned null id for deal:', deal.id)
      }
    } catch (e) { console.error('[demandService] auto-create rubber intake error:', e) }

    // 6. Update demand quantity_filled_kg
    const newFilledKg = (demand.quantity_filled_kg || 0) + offer.offered_quantity_kg
    const newStatus: DemandStatus = newFilledKg >= demand.quantity_kg ? 'filled' : 'partially_filled'

    await supabase
      .from('b2b_demands')
      .update({
        quantity_filled_kg: newFilledKg,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', demandId)

    return {
      offer: {
        ...offer,
        partner: Array.isArray(offer.partner) ? offer.partner[0] : offer.partner,
        status: 'accepted',
        deal_id: deal.id,
      } as DemandOffer,
      deal,
    }
  },

  async rejectOffer(offerId: string, reason: string): Promise<void> {
    const { error } = await supabase
      .from('b2b_demand_offers')
      .update({
        status: 'rejected' as OfferStatus,
        rejected_reason: reason,
      })
      .eq('id', offerId)

    if (error) throw error
  },

  // ============================================
  // LINKED DEALS
  // ============================================

  async getLinkedDeals(demandId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('b2b_deals')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier
        )
      `)
      .eq('demand_id', demandId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return (data || []).map(deal => ({
      ...deal,
      partner: Array.isArray(deal.partner) ? deal.partner[0] : deal.partner,
    }))
  },

  // ============================================
  // STATISTICS
  // ============================================

  async getStats(): Promise<{ total: number; published: number; filled: number; closed: number }> {
    const { data, error } = await supabase
      .from('b2b_demands')
      .select('status')

    if (error) throw error

    const rows = data || []
    return {
      total: rows.length,
      published: rows.filter(d => d.status === 'published').length,
      filled: rows.filter(d => d.status === 'filled').length,
      closed: rows.filter(d => d.status === 'closed').length,
    }
  },
}

export default demandService
