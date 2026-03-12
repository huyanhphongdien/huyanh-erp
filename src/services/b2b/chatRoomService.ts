// ============================================================================
// B2B CHAT ROOM SERVICE — Quản lý phòng chat phía ERP (Factory side)
// File: src/services/b2b/chatRoomService.ts
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================
// INTERFACES
// ============================================

export type RoomType = 'general' | 'deal' | 'support'
export type RoomStatus = 'active' | 'closed'
export type PartnerTier = 'new' | 'bronze' | 'silver' | 'gold' | 'diamond'

export interface ChatRoom {
  id: string
  partner_id: string
  deal_id: string | null
  demand_id: string | null
  room_type: RoomType
  room_name: string | null
  status: RoomStatus
  is_active: boolean
  last_message_at: string | null
  message_count: number
  created_by: string | null
  created_at: string
  // Joined fields
  partner?: {
    id: string
    code: string
    name: string
    tier: PartnerTier
    phone: string | null
    email: string | null
  }
  // Computed
  unread_count?: number
  last_message?: {
    content: string
    sender_type: 'factory' | 'partner' | 'system'
    sent_at: string
    message_type: string
  }
}

export interface ChatRoomListParams {
  page?: number
  pageSize?: number
  search?: string
  filter?: 'all' | 'unread' | PartnerTier
  room_type?: RoomType | 'all'
}

export interface PaginatedChatRoomResponse {
  data: ChatRoom[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ChatRoomCreateData {
  partner_id: string
  deal_id?: string
  demand_id?: string
  room_type: RoomType
  room_name?: string
  created_by: string
}

// ============================================
// CONSTANTS
// ============================================

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  general: 'Chung',
  deal: 'Giao dịch',
  support: 'Hỗ trợ',
}

export const ROOM_TYPE_COLORS: Record<RoomType, string> = {
  general: 'blue',
  deal: 'green',
  support: 'orange',
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

// ============================================
// SERVICE
// ============================================

export const chatRoomService = {
  /**
   * Lấy danh sách phòng chat với thông tin partner và unread count
   * Dùng public view b2b_chat_rooms vì schema b2b không truy cập được từ client
   */
  async getRooms(params: ChatRoomListParams = {}): Promise<PaginatedChatRoomResponse> {
    const page = params.page || 1
    const pageSize = params.pageSize || 20
    const { search, filter, room_type } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // Query qua public view
    let query = supabase
      .from('b2b_chat_rooms')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id,
          code,
          name,
          tier,
          phone,
          email
        )
      `, { count: 'exact' })
      .eq('is_active', true)

    // Filter theo room_type
    if (room_type && room_type !== 'all') {
      query = query.eq('room_type', room_type)
    }

    // Filter theo tier
    if (filter && filter !== 'all' && filter !== 'unread') {
      // Filter theo tier của partner - cần dùng inner query
      // Tạm thời skip vì cần RPC function
    }

    // Tìm kiếm theo tên partner hoặc room_name
    if (search) {
      query = query.or(`room_name.ilike.%${search}%`)
    }

    // Order by last_message_at DESC, rooms có tin mới nhất lên đầu
    query = query.order('last_message_at', { ascending: false, nullsFirst: false })

    const { data, error, count } = await query.range(from, to)

    if (error) throw error

    // Lấy unread count cho mỗi room
    const roomsWithUnread = await Promise.all(
      (data || []).map(async (room) => {
        const unreadCount = await this.getUnreadCountByRoom(room.id)
        const lastMessage = await this.getLastMessage(room.id)
        
        return {
          ...room,
          // Supabase join trả về array, extract first element
          partner: Array.isArray(room.partner) ? room.partner[0] : room.partner,
          unread_count: unreadCount,
          last_message: lastMessage,
        } as ChatRoom
      })
    )

    // Nếu filter = 'unread', chỉ giữ rooms có tin chưa đọc
    let filteredRooms = roomsWithUnread
    if (filter === 'unread') {
      filteredRooms = roomsWithUnread.filter(r => (r.unread_count || 0) > 0)
    }

    return {
      data: filteredRooms,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  /**
   * Lấy tất cả rooms active (không phân trang)
   */
  async getAllActive(): Promise<ChatRoom[]> {
    const { data, error } = await supabase
      .from('b2b_chat_rooms')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id,
          code,
          name,
          tier,
          phone,
          email
        )
      `)
      .eq('is_active', true)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (error) throw error

    return (data || []).map(room => ({
      ...room,
      partner: Array.isArray(room.partner) ? room.partner[0] : room.partner,
    })) as ChatRoom[]
  },

  /**
   * Lấy room theo ID
   */
  async getById(id: string): Promise<ChatRoom | null> {
    const { data, error } = await supabase
      .from('b2b_chat_rooms')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id,
          code,
          name,
          tier,
          phone,
          email
        )
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    const unreadCount = await this.getUnreadCountByRoom(id)

    return {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
      unread_count: unreadCount,
    } as ChatRoom
  },

  /**
   * Lấy room theo partner_id (general room)
   */
  async getByPartnerId(partnerId: string): Promise<ChatRoom | null> {
    const { data, error } = await supabase
      .from('b2b_chat_rooms')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id,
          code,
          name,
          tier,
          phone,
          email
        )
      `)
      .eq('partner_id', partnerId)
      .eq('room_type', 'general')
      .eq('is_active', true)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    return {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
    } as ChatRoom
  },

  /**
   * Tạo phòng chat mới
   */
  async create(roomData: ChatRoomCreateData): Promise<ChatRoom> {
    // Kiểm tra đã có room general với partner này chưa
    if (roomData.room_type === 'general') {
      const existing = await this.getByPartnerId(roomData.partner_id)
      if (existing) {
        return existing
      }
    }

    const { data, error } = await supabase
      .from('b2b_chat_rooms')
      .insert({
        ...roomData,
        status: 'active' as RoomStatus,
        is_active: true,
        message_count: 0,
      })
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id,
          code,
          name,
          tier,
          phone,
          email
        )
      `)
      .single()

    if (error) throw error

    return {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
    } as ChatRoom
  },

  /**
   * Đóng phòng chat
   */
  async closeRoom(id: string): Promise<void> {
    const { error } = await supabase
      .from('b2b_chat_rooms')
      .update({ status: 'closed' as RoomStatus })
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Mở lại phòng chat
   */
  async reopenRoom(id: string): Promise<void> {
    const { error } = await supabase
      .from('b2b_chat_rooms')
      .update({ status: 'active' as RoomStatus })
      .eq('id', id)

    if (error) throw error
  },

  // ============================================
  // UNREAD COUNT
  // ============================================

  /**
   * Đếm tin nhắn chưa đọc của 1 room (từ partner gửi)
   */
  async getUnreadCountByRoom(roomId: string): Promise<number> {
    const { count, error } = await supabase
      .from('b2b_chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomId)
      .eq('sender_type', 'partner')
      .is('read_at', null)
      .is('deleted_at', null)

    if (error) {
      console.error('Error counting unread:', error)
      return 0
    }

    return count || 0
  },

  /**
   * Tổng tin nhắn chưa đọc (tất cả rooms)
   */
  async getTotalUnreadCount(): Promise<number> {
    const { count, error } = await supabase
      .from('b2b_chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('sender_type', 'partner')
      .is('read_at', null)
      .is('deleted_at', null)

    if (error) {
      console.error('Error counting total unread:', error)
      return 0
    }

    return count || 0
  },

  /**
   * Lấy tin nhắn cuối cùng của room
   */
  async getLastMessage(roomId: string): Promise<ChatRoom['last_message'] | null> {
    const { data, error } = await supabase
      .from('b2b_chat_messages')
      .select('content, sender_type, sent_at, message_type')
      .eq('room_id', roomId)
      .is('deleted_at', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return null

    return {
      content: data.content,
      sender_type: data.sender_type as 'factory' | 'partner' | 'system',
      sent_at: data.sent_at,
      message_type: data.message_type,
    }
  },

  // ============================================
  // REALTIME SUBSCRIPTION HELPERS
  // ============================================

  /**
   * Subscribe to room updates
   * Lưu ý: Phải dùng schema: 'b2b' cho realtime
   */
  subscribeToRooms(
    callback: (payload: { eventType: string; new: ChatRoom; old: ChatRoom }) => void
  ) {
    return supabase
      .channel('b2b-chat-rooms')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'b2b',
          table: 'chat_rooms',
        },
        (payload) => {
          callback({
            eventType: payload.eventType,
            new: payload.new as ChatRoom,
            old: payload.old as ChatRoom,
          })
        }
      )
      .subscribe()
  },

  /**
   * Subscribe to new messages (để update last_message)
   */
  subscribeToMessages(
    callback: (payload: { eventType: string; new: unknown; old: unknown }) => void
  ) {
    return supabase
      .channel('b2b-chat-messages-all')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'b2b',
          table: 'chat_messages',
        },
        (payload) => {
          callback({
            eventType: payload.eventType,
            new: payload.new,
            old: payload.old,
          })
        }
      )
      .subscribe()
  },

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Thống kê rooms theo tier
   */
  async getStatsByTier(): Promise<Record<PartnerTier, number>> {
    const rooms = await this.getAllActive()
    
    const stats: Record<PartnerTier, number> = {
      diamond: 0,
      gold: 0,
      silver: 0,
      bronze: 0,
      new: 0,
    }

    rooms.forEach(room => {
      if (room.partner?.tier) {
        stats[room.partner.tier]++
      }
    })

    return stats
  },

  /**
   * Thống kê rooms có tin chưa đọc
   */
  async getRoomsWithUnread(): Promise<ChatRoom[]> {
    const rooms = await this.getAllActive()
    
    const roomsWithUnread = await Promise.all(
      rooms.map(async (room) => {
        const unreadCount = await this.getUnreadCountByRoom(room.id)
        return { ...room, unread_count: unreadCount }
      })
    )

    return roomsWithUnread.filter(r => (r.unread_count || 0) > 0)
  },
}

export default chatRoomService