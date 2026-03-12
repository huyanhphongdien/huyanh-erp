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
  created_at: string
  updated_at: string | null
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

    // Search
    if (search) {
      query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`)
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
   * Lấy chat room của partner
   */
  async getChatRoom(partnerId: string): Promise<{ id: string } | null> {
    const { data, error } = await supabase
      .from('b2b_chat_rooms')
      .select('id')
      .eq('partner_id', partnerId)
      .eq('room_type', 'general')
      .eq('is_active', true)
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
}

export default partnerService