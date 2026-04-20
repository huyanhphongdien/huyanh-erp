// ============================================================================
// DEAL SERVICE — Service quản lý Deals/Giao dịch B2B
// File: src/services/b2b/dealService.ts
// Phase: E2.1.2, E2.2.2, E2.3.5
// ============================================================================

import { supabase } from '../../lib/supabase'
import {
  DEAL_STATUS_LABELS as _DEAL_STATUS_LABELS,
  DEAL_STATUS_COLORS as _DEAL_STATUS_COLORS,
  DEAL_TYPE_LABELS as _DEAL_TYPE_LABELS,
  DEAL_TYPE_COLORS as _DEAL_TYPE_COLORS,
  type DealStatus as _DealStatus,
  type DealType as _DealType,
} from '../../types/b2b.constants'

// ============================================
// TYPES — re-export để call-sites cũ không phải đổi import
// ============================================

export type DealStatus = _DealStatus
export type DealType = _DealType

export interface Deal {
  id: string
  deal_number: string
  partner_id: string
  deal_type: DealType | null
  warehouse_id: string | null
  product_name: string | null
  product_code: string | null
  quantity_kg: number | null
  unit_price: number | null
  total_amount: number | null
  total_value_vnd: number | null
  currency: string | null
  status: DealStatus
  demand_id: string | null
  offer_id: string | null
  final_price: number | null
  exchange_rate: number | null
  delivery_terms: string | null
  processing_fee_per_ton: number | null
  expected_output_rate: number | null
  notes: string | null
  booking_id: string | null
  created_at: string
  updated_at: string | null
  // Phase 4: WMS fields
  actual_drc: number | null
  actual_weight_kg: number | null
  final_value: number | null
  stock_in_count: number | null
  qc_status: string | null           // 'pending' | 'passed' | 'warning' | 'failed'
  // Deal detail fields
  expected_drc: number | null
  source_region: string | null
  rubber_type: string | null
  pickup_location_name: string | null
  price_unit: string | null          // 'wet' | 'dry'
  delivery_date: string | null
  // Lot & Rubber Intake
  lot_code: string | null
  lot_description: string | null
  rubber_intake_id: string | null
  // Rubber Region (vùng mủ)
  rubber_region: string | null
  rubber_region_lat: number | null
  rubber_region_lng: number | null
  // Nhà máy đích nhận hàng (FK public.facilities.id)
  target_facility_id: string | null
  // Joined fields
  partner?: {
    id: string
    code: string
    name: string
    tier: string
    phone: string | null
    email: string | null
  }
  // Computed
  quantity_tons?: number
}

export interface DealListParams {
  page?: number
  pageSize?: number
  search?: string
  status?: DealStatus | 'all'
  partner_id?: string
  deal_type?: DealType | 'all'
  date_from?: string
  date_to?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface PaginatedDealResponse {
  data: Deal[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface DealCreateData {
  partner_id: string
  deal_type?: DealType
  warehouse_id?: string
  product_name?: string
  product_code?: string
  quantity_kg?: number
  unit_price?: number
  total_value_vnd?: number
  currency?: string
  delivery_terms?: string
  processing_fee_per_ton?: number
  expected_output_rate?: number
  notes?: string
  booking_id?: string // ID tin nhắn booking liên kết
}

export interface DealUpdateData {
  status?: DealStatus
  final_price?: number
  delivery_terms?: string
  notes?: string
  warehouse_id?: string
}

// ============================================
// CONSTANTS
// ============================================

export const DEAL_STATUS_LABELS = _DEAL_STATUS_LABELS
export const DEAL_STATUS_COLORS = _DEAL_STATUS_COLORS
export const DEAL_TYPE_LABELS = _DEAL_TYPE_LABELS
export const DEAL_TYPE_COLORS = _DEAL_TYPE_COLORS

// ============================================
// HELPER FUNCTIONS
// ============================================

const generateDealNumber = (): string => {
  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `DL${year}${month}-${random}`
}

// ============================================
// SERVICE
// ============================================

export const dealService = {
  // ============================================
  // LIST & QUERY (E2.1.2)
  // ============================================

  /**
   * Lấy danh sách deals với filter và phân trang
   */
  async getDeals(params: DealListParams = {}): Promise<PaginatedDealResponse> {
    const {
      page = 1,
      pageSize = 10,
      search,
      status,
      partner_id,
      deal_type,
      date_from,
      date_to,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('b2b_deals')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone, email
        )
      `, { count: 'exact' })

    // Filter by status
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    // Filter by partner
    if (partner_id) {
      query = query.eq('partner_id', partner_id)
    }

    // Filter by deal_type
    if (deal_type && deal_type !== 'all') {
      query = query.eq('deal_type', deal_type)
    }

    // Filter by date range
    if (date_from) {
      query = query.gte('created_at', date_from)
    }
    if (date_to) {
      query = query.lte('created_at', date_to)
    }

    // Search by deal_number
    if (search) {
      query = query.ilike('deal_number', `%${search}%`)
    }

    // Sorting
    query = query.order(sort_by, { ascending: sort_order === 'asc' })

    // Pagination
    const { data, error, count } = await query.range(from, to)

    if (error) throw error

    // Process data
    const deals = (data || []).map(deal => ({
      ...deal,
      partner: Array.isArray(deal.partner) ? deal.partner[0] : deal.partner,
      quantity_tons: deal.quantity_kg ? deal.quantity_kg / 1000 : 0,
    })) as Deal[]

    return {
      data: deals,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  /**
   * Lấy tất cả deals (không phân trang, cho dropdown/select)
   */
  async getAllDeals(partnerId?: string): Promise<Deal[]> {
    let query = supabase
      .from('b2b_deals')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier
        )
      `)
      .order('created_at', { ascending: false })

    if (partnerId) {
      query = query.eq('partner_id', partnerId)
    }

    const { data, error } = await query

    if (error) throw error

    return (data || []).map(deal => ({
      ...deal,
      partner: Array.isArray(deal.partner) ? deal.partner[0] : deal.partner,
      quantity_tons: deal.quantity_kg ? deal.quantity_kg / 1000 : 0,
    })) as Deal[]
  },

  // ============================================
  // GET BY ID (E2.2.2)
  // ============================================

  /**
   * Lấy chi tiết deal theo ID
   */
  async getDealById(id: string): Promise<Deal | null> {
    const { data, error } = await supabase
      .from('b2b_deals')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone, email, address
        )
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    return {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
      quantity_tons: data.quantity_kg ? data.quantity_kg / 1000 : 0,
    } as Deal
  },

  /**
   * Lấy deal theo deal_number
   */
  async getDealByNumber(dealNumber: string): Promise<Deal | null> {
    const { data, error } = await supabase
      .from('b2b_deals')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier
        )
      `)
      .eq('deal_number', dealNumber)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    return {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
      quantity_tons: data.quantity_kg ? data.quantity_kg / 1000 : 0,
    } as Deal
  },

  // ============================================
  // CREATE (E2.3.5)
  // ============================================

  /**
   * Tạo deal mới
   *
   * Sprint 1 enforcement:
   *  - Gap #2: Partner phải ở status 'verified' (không accept suspended/rejected)
   *  - Gap #6: quantity_kg > 0, unit_price >= 0 (0 = gia công, không cho âm)
   */
  async createDeal(dealData: DealCreateData): Promise<Deal> {
    // ─── Gap #6: Validation amount fields ───
    if (dealData.quantity_kg !== undefined && dealData.quantity_kg !== null && dealData.quantity_kg <= 0) {
      throw new Error('Số lượng phải lớn hơn 0')
    }
    if (dealData.unit_price !== undefined && dealData.unit_price !== null && dealData.unit_price < 0) {
      throw new Error('Đơn giá không được âm')
    }
    if (dealData.total_value_vnd !== undefined && dealData.total_value_vnd !== null && dealData.total_value_vnd < 0) {
      throw new Error('Tổng giá trị deal không được âm')
    }

    // ─── Gap #2: Kiểm tra partner status ───
    const { data: partner, error: partnerError } = await supabase
      .from('b2b_partners')
      .select('id, status, name')
      .eq('id', dealData.partner_id)
      .single()
    if (partnerError || !partner) {
      throw new Error('Không tìm thấy đại lý')
    }
    if (partner.status !== 'verified') {
      const statusLabel: Record<string, string> = {
        pending: 'Chờ duyệt',
        suspended: 'Đang bị tạm ngưng',
        rejected: 'Đã bị từ chối',
      }
      throw new Error(
        `Đại lý "${partner.name}" đang ở trạng thái ${statusLabel[partner.status] || partner.status} — không thể tạo deal`,
      )
    }

    const dealNumber = generateDealNumber()

    // Calculate total if not provided
    let totalValue = dealData.total_value_vnd
    if (!totalValue && dealData.quantity_kg && dealData.unit_price) {
      totalValue = dealData.quantity_kg * dealData.unit_price
    }

    const { data, error } = await supabase
      .from('b2b_deals')
      .insert({
        deal_number: dealNumber,
        partner_id: dealData.partner_id,
        deal_type: dealData.deal_type || 'purchase',
        warehouse_id: dealData.warehouse_id,
        product_name: dealData.product_name,
        product_code: dealData.product_code,
        quantity_kg: dealData.quantity_kg,
        unit_price: dealData.unit_price,
        total_value_vnd: totalValue,
        currency: dealData.currency || 'VND',
        status: 'pending' as DealStatus,
        delivery_terms: dealData.delivery_terms,
        processing_fee_per_ton: dealData.processing_fee_per_ton,
        expected_output_rate: dealData.expected_output_rate,
        notes: dealData.notes,
        booking_id: dealData.booking_id,
      })
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier
        )
      `)
      .single()

    if (error) throw error

    return {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
      quantity_tons: data.quantity_kg ? data.quantity_kg / 1000 : 0,
    } as Deal
  },

  /**
   * Tạo deal từ booking đã xác nhận
   */
  async createDealFromBooking(
    partnerId: string,
    bookingData: {
      product_type: string
      quantity_tons: number
      price_per_kg: number
      drc_percent: number
      booking_message_id?: string
    }
  ): Promise<Deal> {
    // Kiểm tra Deal đã tồn tại cho booking này chưa (tránh trùng lặp)
    if (bookingData.booking_message_id) {
      const existing = await this.getDealByBookingId(bookingData.booking_message_id)
      if (existing) return existing
    }

    const PRODUCT_TYPE_NAMES: Record<string, string> = {
      mu_nuoc: 'Mủ nước',
      mu_tap: 'Mủ tạp',
      mu_dong: 'Mủ đông',
      mu_chen: 'Mủ chén',
      mu_to: 'Mủ tờ',
    }

    const productName = PRODUCT_TYPE_NAMES[bookingData.product_type] || bookingData.product_type

    return this.createDeal({
      partner_id: partnerId,
      deal_type: 'purchase',
      product_name: productName,
      product_code: bookingData.product_type,
      quantity_kg: bookingData.quantity_tons * 1000,
      unit_price: bookingData.price_per_kg,
      total_value_vnd: bookingData.quantity_tons * 1000 * bookingData.price_per_kg,
      notes: `DRC: ${bookingData.drc_percent}%. Tạo tự động từ phiếu chốt mủ.`,
      booking_id: bookingData.booking_message_id,
    })
  },

  /**
   * Tìm Deal theo booking message ID (tránh tạo trùng)
   */
  async getDealByBookingId(bookingMessageId: string): Promise<Deal | null> {
    const { data, error } = await supabase
      .from('b2b_deals')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier
        )
      `)
      .eq('booking_id', bookingMessageId)
      .maybeSingle()

    if (error) {
      console.error('Error checking existing deal for booking:', error)
      return null
    }
    if (!data) return null

    return {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
      quantity_tons: data.quantity_kg ? data.quantity_kg / 1000 : 0,
    } as Deal
  },

  // ============================================
  // UPDATE
  // ============================================

  /**
   * Cập nhật deal
   */
  async updateDeal(id: string, updateData: DealUpdateData): Promise<Deal> {
    const { data, error } = await supabase
      .from('b2b_deals')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier
        )
      `)
      .single()

    if (error) throw error

    // Nếu status đổi → sync DealCard trong chat (progress bar + buttons)
    if (updateData.status) {
      try {
        const { patchDealCardMetadata } = await import('./dealChatActionsService')
        await patchDealCardMetadata(id, {
          status: updateData.status,
          final_value: data.final_value ?? undefined,
          cancel_reason: updateData.status === 'cancelled' ? (updateData.notes || undefined) : undefined,
        })
      } catch (err) {
        console.error('[dealService.updateDeal] patch DealCard failed:', err)
      }
    }

    return {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
      quantity_tons: data.quantity_kg ? data.quantity_kg / 1000 : 0,
    } as Deal
  },

  /**
   * Cập nhật status deal
   */
  async updateStatus(id: string, status: DealStatus): Promise<Deal> {
    return this.updateDeal(id, { status })
  },

  /**
   * Chuyển deal sang trạng thái processing (chỉ từ pending)
   */
  async startProcessing(id: string): Promise<Deal> {
    const deal = await this.getDealById(id)
    if (!deal) throw new Error('Không tìm thấy deal')
    if (deal.status !== 'pending') {
      throw new Error(`Không thể bắt đầu xử lý deal đang ở trạng thái "${deal.status}". Chỉ deal ở "pending" mới bắt đầu được.`)
    }
    return this.updateStatus(id, 'processing')
  },

  /**
   * Kiểm tra deal đã đủ điều kiện duyệt chưa.
   * Dùng cho UI để disable nút + hiển thị lý do thiếu.
   */
  checkAcceptConditions(deal: Deal): { canAccept: boolean; missing: string[] } {
    const missing: string[] = []

    if (deal.status !== 'processing') {
      missing.push(`Deal phải ở trạng thái "Đang xử lý" (hiện: ${deal.status})`)
    }
    if (!deal.stock_in_count || deal.stock_in_count === 0) {
      missing.push('Chưa có phiếu nhập kho nào')
    }
    if (!deal.actual_weight_kg || deal.actual_weight_kg <= 0) {
      missing.push('Chưa có trọng lượng thực tế (actual_weight_kg)')
    }
    if (!deal.actual_drc || deal.actual_drc <= 0) {
      missing.push('Chưa có DRC thực tế (actual_drc)')
    }
    if (deal.qc_status === 'failed') {
      missing.push('QC đã FAIL — không thể duyệt')
    }
    if (deal.qc_status === 'pending' || !deal.qc_status) {
      missing.push('QC chưa hoàn thành')
    }

    return { canAccept: missing.length === 0, missing }
  },

  /**
   * Duyệt deal — CẦN đầy đủ điều kiện:
   *  - status = 'processing'
   *  - stock_in_count > 0 (đã có phiếu nhập kho)
   *  - actual_weight_kg > 0 (có trọng lượng thực)
   *  - actual_drc > 0 (có DRC thực)
   *  - qc_status != 'failed' và != 'pending' (QC đã xong, không fail)
   */
  async acceptDeal(id: string, finalPrice?: number): Promise<Deal> {
    const deal = await this.getDealById(id)
    if (!deal) throw new Error('Không tìm thấy deal')

    const { canAccept, missing } = this.checkAcceptConditions(deal)
    if (!canAccept) {
      throw new Error(`Chưa đủ điều kiện duyệt deal:\n- ${missing.join('\n- ')}`)
    }

    return this.updateDeal(id, {
      status: 'accepted',
      final_price: finalPrice,
    })
  },

  /**
   * Quyết toán deal — chỉ khi status='accepted'
   */
  async settleDeal(id: string): Promise<Deal> {
    const deal = await this.getDealById(id)
    if (!deal) throw new Error('Không tìm thấy deal')
    if (deal.status !== 'accepted') {
      throw new Error(`Chỉ deal đã được DUYỆT mới quyết toán được (hiện: ${deal.status}).`)
    }
    return this.updateStatus(id, 'settled')
  },

  /**
   * Hủy deal — không cho hủy khi đã 'settled'
   */
  async cancelDeal(id: string, reason?: string): Promise<Deal> {
    const deal = await this.getDealById(id)
    if (!deal) throw new Error('Không tìm thấy deal')
    if (deal.status === 'settled') {
      throw new Error('Deal đã QUYẾT TOÁN không thể hủy. Cần hủy quyết toán trước.')
    }
    if (deal.status === 'cancelled') {
      throw new Error('Deal đã ở trạng thái hủy.')
    }
    return this.updateDeal(id, {
      status: 'cancelled',
      notes: reason,
    })
  },

  // ============================================
  // DELETE
  // ============================================

  /**
   * Xóa deal (chỉ khi status = pending)
   */
  async deleteDeal(id: string): Promise<void> {
    const deal = await this.getDealById(id)
    if (!deal) throw new Error('Deal không tồn tại')
    if (deal.status !== 'pending') {
      throw new Error('Chỉ có thể xóa deal ở trạng thái "Chờ xử lý"')
    }

    const { error } = await supabase
      .from('b2b_deals')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Thống kê deals theo status
   */
  async getStatsByStatus(): Promise<Record<DealStatus, number>> {
    const { data, error } = await supabase
      .from('b2b_deals')
      .select('status')

    if (error) throw error

    const stats: Record<DealStatus, number> = {
      pending: 0,
      processing: 0,
      accepted: 0,
      settled: 0,
      cancelled: 0,
    }

    const rows = data as any[] || []
    rows.forEach((d) => {
      if (d.status && stats[d.status as DealStatus] !== undefined) {
        stats[d.status as DealStatus]++
      }
    })

    return stats
  },

  /**
   * Thống kê deals theo partner
   */
  async getStatsByPartner(partnerId: string): Promise<{
    total: number
    pending: number
    processing: number
    accepted: number
    settled: number
    totalValue: number
    totalQuantity: number
  }> {
    const { data, error } = await supabase
      .from('b2b_deals')
      .select('status, quantity_kg, total_value_vnd')
      .eq('partner_id', partnerId)

    if (error) throw error

    const stats = {
      total: data?.length || 0,
      pending: 0,
      processing: 0,
      accepted: 0,
      settled: 0,
      totalValue: 0,
      totalQuantity: 0,
    }

    const rows = data as any[] || []
    rows.forEach((d) => {
      if (d.status === 'pending') stats.pending++
      if (d.status === 'processing') stats.processing++
      if (d.status === 'accepted') stats.accepted++
      if (d.status === 'settled') stats.settled++
      stats.totalValue += d.total_value_vnd || 0
      stats.totalQuantity += (d.quantity_kg || 0) / 1000
    })

    return stats
  },

  // ============================================
  // CHAT ROOM LINK
  // ============================================

  /**
   * Lấy chat room liên quan đến deal
   */
  async getChatRoomByDeal(dealId: string): Promise<{ id: string } | null> {
    const { data, error } = await supabase
      .from('b2b_chat_rooms')
      .select('id')
      .eq('deal_id', dealId)
      .eq('is_active', true)
      .maybeSingle()

    if (error) throw error
    return data
  },

  /**
   * Lấy chat room của partner (general room)
   */
  async getChatRoomByPartner(partnerId: string): Promise<{ id: string } | null> {
    const { data, error } = await supabase
      .from('b2b_chat_rooms')
      .select('id')
      .eq('partner_id', partnerId)
      .eq('room_type', 'general')
      .eq('is_active', true)
      .maybeSingle()

    if (error) throw error
    return data
  },
}

export default dealService