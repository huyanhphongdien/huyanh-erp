// ============================================================================
// PARTNER SERVICE — Service quản lý Partners/Đại lý B2B
// File: src/services/b2b/partnerService.ts
// Phase: E4
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================
// TYPES
// ============================================

export type PartnerType = 'dealer' | 'supplier' | 'both'
export type PartnerStatus = 'pending' | 'verified' | 'suspended' | 'rejected'
export type PartnerTier = 'new' | 'bronze' | 'silver' | 'gold' | 'diamond'

export interface Partner {
  id: string
  code: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  partner_type: PartnerType
  tier: PartnerTier
  status: PartnerStatus
  is_active: boolean
  region_code: string | null
  supplier_name_code: string | null
  created_at: string
  updated_at: string | null
  // Sprint 1.1 (TL): proxy partner — đại lý đầu mối nhận tiền hộ
  /** ID đại lý đầu mối nhận tiền hộ. NULL = trả trực tiếp partner này. */
  payment_proxy_partner_id?: string | null
  /** Tên gọi khác (vd biệt danh) — operator dễ nhận diện. */
  contact_alias_name?: string | null
  /** Cờ "đại lý này đứng tên nhận tiền hộ người khác". */
  is_payment_proxy?: boolean | null
  // Computed stats
  unread_count?: number
  deals_count?: number
  deals_processing?: number
  total_quantity?: number
  total_value?: number
}

export interface PartnerListParams {
  page?: number
  pageSize?: number
  search?: string
  tier?: PartnerTier | 'all'
  status?: PartnerStatus | 'all'
  partner_type?: PartnerType | 'all'
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface PaginatedPartnerResponse {
  data: Partner[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface PartnerStats {
  totalDeals: number
  dealsProcessing: number
  totalQuantity: number // tấn
  totalValue: number // VNĐ
  unreadMessages: number
}

// ============================================
// CONSTANTS
// ============================================

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  dealer: 'Đại lý',
  supplier: 'Nhà cung cấp',
  both: 'Đại lý & NCC',
}

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  pending: 'Chờ duyệt',
  verified: 'Đã xác minh',
  suspended: 'Tạm ngưng',
  rejected: 'Từ chối',
}

export const PARTNER_STATUS_COLORS: Record<PartnerStatus, string> = {
  pending: 'orange',
  verified: 'green',
  suspended: 'red',
  rejected: 'default',
}

export const TIER_LABELS: Record<PartnerTier, string> = {
  diamond: 'Kim cương',
  gold: 'Vàng',
  silver: 'Bạc',
  bronze: 'Đồng',
  new: 'Mới',
}

export const TIER_COLORS: Record<PartnerTier, string> = {
  diamond: 'purple',
  gold: 'gold',
  silver: 'default',
  bronze: 'orange',
  new: 'cyan',
}

export const TIER_ICONS: Record<PartnerTier, string> = {
  diamond: '💎',
  gold: '🥇',
  silver: '🥈',
  bronze: '🥉',
  new: '🆕',
}

// ============================================
// SERVICE
// ============================================

export const partnerService = {

  /**
   * Tạo mã lô tiếp theo cho NCC: [Mã NCC HAC-13]-[YYMM]-[Số]
   * VD: 8999100012346-2604-01, 8999100012346-2604-02...
   * (Phase 7+: partnerCode giờ là mã HAC-13 13 chữ số — đồng bộ với business_partners.)
   */
  async generateNextLotCode(partnerCode: string): Promise<string> {
    const now = new Date()
    const yy = String(now.getFullYear()).slice(-2)
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const prefix = `${partnerCode}-${yy}${mm}-`

    // Tìm lot_code lớn nhất trong tháng này cho NCC này
    const { data: existing } = await supabase
      .from('rubber_intake_batches')
      .select('lot_code')
      .ilike('lot_code', `${prefix}%`)
      .order('lot_code', { ascending: false })
      .limit(1)

    let nextSeq = 1
    if (existing && existing.length > 0 && existing[0].lot_code) {
      const lastSeq = parseInt(existing[0].lot_code.slice(-2), 10)
      if (!isNaN(lastSeq)) nextSeq = lastSeq + 1
    }

    // Cũng check trong b2b_demand_offers
    const { data: offerExisting } = await supabase
      .from('b2b_demand_offers')
      .select('lot_code')
      .ilike('lot_code', `${prefix}%`)
      .order('lot_code', { ascending: false })
      .limit(1)

    if (offerExisting && offerExisting.length > 0 && offerExisting[0].lot_code) {
      const offerSeq = parseInt(offerExisting[0].lot_code.slice(-2), 10)
      if (!isNaN(offerSeq) && offerSeq >= nextSeq) nextSeq = offerSeq + 1
    }

    return `${prefix}${String(nextSeq).padStart(2, '0')}`
  },

  // ============================================
  // LIST & QUERY
  // ============================================

  /**
   * Lấy danh sách partners với filter và phân trang
   */
  async getPartners(params: PartnerListParams = {}): Promise<PaginatedPartnerResponse> {
    const {
      page = 1,
      pageSize = 12,
      search,
      tier,
      status,
      partner_type,
      sort_by = 'name',
      sort_order = 'asc',
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('b2b_partners')
      .select('*', { count: 'exact' })

    // Filter by tier
    if (tier && tier !== 'all') {
      query = query.eq('tier', tier)
    }

    // Filter by status
    if (status && status !== 'all') {
      query = query.eq('status', status)
    } else {
      // Default: only active & verified
      query = query.eq('is_active', true)
    }

    // Filter by partner_type
    if (partner_type && partner_type !== 'all') {
      query = query.eq('partner_type', partner_type)
    }

    // Search — hỗ trợ cả TEHG01 (legacy) và HAC-13 (8999-1-XXXXXXX-X)
    if (search) {
      const { normalizeHac13 } = await import('../../lib/hac13')
      const normalized = normalizeHac13(search)
      if (/^\d{13}$/.test(normalized)) {
        // Tìm BP có hac13_code này → bp_id → b2b_partners WHERE bp_id = ...
        const { data: bp } = await supabase
          .from('business_partners')
          .select('id')
          .eq('hac13_code', normalized)
          .maybeSingle()
        if (bp) {
          query = query.eq('bp_id', bp.id)
        } else {
          // Không match HAC-13 → fallback tìm theo legacy code
          query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%,national_id.ilike.%${search}%`)
        }
      } else {
        query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%,national_id.ilike.%${search}%`)
      }
    }

    // Sorting
    query = query.order(sort_by, { ascending: sort_order === 'asc' })

    // Pagination
    const { data, error, count } = await query.range(from, to)

    if (error) throw error

    return {
      data: (data || []) as Partner[],
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  /**
   * Lấy tất cả partners active (cho dropdown)
   */
  async getAllActive(): Promise<Partner[]> {
    const { data, error } = await supabase
      .from('b2b_partners')
      .select('*')
      .eq('status', 'verified')
      .eq('is_active', true)
      .order('name')

    if (error) throw error
    return (data || []) as Partner[]
  },

  /**
   * Lấy partners với stats (unread, deals count)
   */
  async getPartnersWithStats(params: PartnerListParams = {}): Promise<Partner[]> {
    const response = await this.getPartners(params)
    
    // Get stats for each partner
    const partnersWithStats = await Promise.all(
      response.data.map(async (partner) => {
        const stats = await this.getPartnerStats(partner.id)
        return {
          ...partner,
          unread_count: stats.unreadMessages,
          deals_count: stats.totalDeals,
          deals_processing: stats.dealsProcessing,
          total_quantity: stats.totalQuantity,
          total_value: stats.totalValue,
        }
      })
    )

    return partnersWithStats
  },

  // ============================================
  // GET BY ID
  // ============================================

  /**
   * Lấy partner theo ID
   */
  async getPartnerById(id: string): Promise<Partner | null> {
    const { data, error } = await supabase
      .from('b2b_partners')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data as Partner | null
  },

  /**
   * Lấy partner theo code
   */
  async getPartnerByCode(code: string): Promise<Partner | null> {
    const { data, error } = await supabase
      .from('b2b_partners')
      .select('*')
      .eq('code', code)
      .maybeSingle()

    if (error) throw error
    return data as Partner | null
  },

  // ============================================
  // STATS
  // ============================================

  /**
   * Lấy thống kê của 1 partner
   */
  async getPartnerStats(partnerId: string): Promise<PartnerStats> {
    // Get deals stats
    const { data: deals } = await supabase
      .from('b2b_deals')
      .select('status, quantity_kg, total_value_vnd')
      .eq('partner_id', partnerId)

    const totalDeals = deals?.length || 0
    const dealsProcessing = deals?.filter(d => d.status === 'processing').length || 0
    const totalQuantity = (deals || []).reduce((sum, d) => sum + (d.quantity_kg || 0), 0) / 1000
    const totalValue = (deals || []).reduce((sum, d) => sum + (d.total_value_vnd || 0), 0)

    // Get unread messages count
    const { data: rooms } = await supabase
      .from('b2b_chat_rooms')
      .select('id')
      .eq('partner_id', partnerId)
      .eq('is_active', true)

    let unreadMessages = 0
    if (rooms && rooms.length > 0) {
      const roomIds = rooms.map(r => r.id)
      const { count } = await supabase
        .from('b2b_chat_messages')
        .select('id', { count: 'exact', head: true })
        .in('room_id', roomIds)
        .eq('sender_type', 'partner')
        .is('read_at', null)
        .is('deleted_at', null)

      unreadMessages = count || 0
    }

    return {
      totalDeals,
      dealsProcessing,
      totalQuantity: Math.round(totalQuantity * 10) / 10,
      totalValue,
      unreadMessages,
    }
  },

  /**
   * Đếm unread messages cho 1 partner
   */
  async getUnreadCount(partnerId: string): Promise<number> {
    const { data: rooms } = await supabase
      .from('b2b_chat_rooms')
      .select('id')
      .eq('partner_id', partnerId)
      .eq('is_active', true)

    if (!rooms || rooms.length === 0) return 0

    const roomIds = rooms.map(r => r.id)
    const { count, error } = await supabase
      .from('b2b_chat_messages')
      .select('id', { count: 'exact', head: true })
      .in('room_id', roomIds)
      .eq('sender_type', 'partner')
      .is('read_at', null)
      .is('deleted_at', null)

    if (error) return 0
    return count || 0
  },

  /**
   * Đếm deals đang xử lý cho 1 partner
   */
  async getDealsProcessingCount(partnerId: string): Promise<number> {
    const { count, error } = await supabase
      .from('b2b_deals')
      .select('id', { count: 'exact', head: true })
      .eq('partner_id', partnerId)
      .eq('status', 'processing')

    if (error) return 0
    return count || 0
  },

  // ============================================
  // CHAT ROOM
  // ============================================

  /**
   * @deprecated sprint1_08: dùng chatRoomService.getOrCreate(partnerId, userId) để
   * mở/tạo room cho NV đang login. Hàm này trả room ĐẦU TIÊN bất kể assigned_user_id,
   * dễ gây nhầm vì 1 partner giờ có thể có nhiều rooms (mỗi NV 1 cái).
   */
  async getChatRoom(partnerId: string): Promise<{ id: string } | null> {
    const { data, error } = await supabase
      .from('b2b_chat_rooms')
      .select('id')
      .eq('partner_id', partnerId)
      .eq('room_type', 'general')
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) return null
    return data
  },

  // ============================================
  // DEALS
  // ============================================

  /**
   * Lấy deals của partner
   */
  async getPartnerDeals(partnerId: string, status?: string): Promise<unknown[]> {
    let query = supabase
      .from('b2b_deals')
      .select('*')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  },

  // ============================================
  // TIER MANAGEMENT
  // ============================================

  /**
   * Cập nhật tier của partner
   */
  async updateTier(partnerId: string, tier: PartnerTier): Promise<Partner> {
    const { data, error } = await supabase
      .from('b2b_partners')
      .update({ tier, updated_at: new Date().toISOString() })
      .eq('id', partnerId)
      .select()
      .single()

    if (error) throw error
    return data as Partner
  },

  /**
   * Cập nhật status của partner
   */
  async updateStatus(partnerId: string, status: PartnerStatus): Promise<Partner> {
    const { data, error } = await supabase
      .from('b2b_partners')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', partnerId)
      .select()
      .single()

    if (error) throw error
    return data as Partner
  },

  /**
   * Bổ sung / sửa THÔNG TIN ĐỊNH DANH của đại lý.
   * CHỈ field master an toàn (tên, SĐT, CCCD, địa chỉ, email, hạng, loại) —
   * KHÔNG đụng dữ liệu giao dịch (phiếu cân, công nợ, deal tham chiếu qua id).
   * Chỉ ghi field được truyền (undefined = bỏ qua) để tránh xoá nhầm dữ liệu.
   */
  async updateInfo(partnerId: string, fields: {
    name?: string
    phone?: string | null
    national_id?: string | null
    address?: string | null
    email?: string | null
    tier?: PartnerTier
    partner_type?: PartnerType
  }): Promise<Partner> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) payload[k] = val
    }
    const { data, error } = await supabase
      .from('b2b_partners')
      .update(payload)
      .eq('id', partnerId)
      .select()
      .single()
    if (error) throw error
    return data as Partner
  },

  /**
   * Sprint 1.1 (TL): Cập nhật proxy partner + biệt danh + cờ proxy.
   * Cho phép null hoá tất cả 3 field (set về NULL/false).
   */
  async updateProxyAndAlias(
    partnerId: string,
    patch: {
      payment_proxy_partner_id?: string | null
      contact_alias_name?: string | null
      is_payment_proxy?: boolean
    },
  ): Promise<Partner> {
    const { data, error } = await supabase
      .from('b2b_partners')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', partnerId)
      .select()
      .single()

    if (error) throw error
    return data as Partner
  },
}

export default partnerService