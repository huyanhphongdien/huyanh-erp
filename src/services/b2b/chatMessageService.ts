// ============================================================================
// B2B CHAT MESSAGE SERVICE — Quản lý tin nhắn chat phía ERP (Factory side)
// File: src/services/b2b/chatMessageService.ts
// Phase: E1.2.3, E1.4.2, E1.4.4
// ============================================================================

import { supabase } from '../../lib/supabase'
import { dealService, type Deal } from './dealService'

// ============================================
// INTERFACES
// ============================================

export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'booking' | 'deal' | 'quotation' | 'system'
export type SenderType = 'factory' | 'partner' | 'system'

export interface ChatAttachment {
  url: string
  path: string
  fileName: string
  fileSize: number
  fileType: string
  width?: number
  height?: number
  duration?: number // For audio
  caption?: string
}

export interface BookingMetadata {
  code: string
  product_type: 'mu_nuoc' | 'mu_tap' | 'mu_dong' | 'mu_chen' | 'mu_to'
  quantity_tons: number
  drc_percent: number
  price_per_kg: number
  price_unit: 'wet' | 'dry'
  estimated_value: number
  pickup_location?: string
  delivery_date: string
  lot_code?: string
  notes?: string
  status: 'pending' | 'confirmed' | 'negotiating' | 'rejected'
  counter_price?: number
  negotiation_notes?: string
}

export interface MessageMetadata {
  // Booking
  booking?: BookingMetadata
  // Deal (sau khi confirm booking → tạo deal)
  deal?: import('../../types/b2b.types').DealCardMetadata
  // Pin
  pinned?: boolean
  pinned_at?: string
  pinned_by?: string
  // Edit
  edited?: boolean
  original_content?: string
  // Recall
  recalled?: boolean
  recalled_at?: string
  // Forward
  forwarded?: boolean
  forwarded_from?: string
}

export interface ChatMessage {
  id: string
  room_id: string
  sender_id: string
  sender_type: SenderType
  content: string
  message_type: MessageType
  attachments: ChatAttachment[] | null
  metadata: MessageMetadata | null
  reply_to_id: string | null
  sent_at: string
  edited_at: string | null
  deleted_at: string | null
  read_at: string | null
  // Joined fields
  reply_to?: ChatMessage | null
  sender_name?: string
}

export interface SendMessageData {
  room_id: string
  sender_id: string // employee_id
  content: string
  message_type?: MessageType
  attachments?: ChatAttachment[]
  metadata?: MessageMetadata
  reply_to_id?: string
}

export interface MessageListParams {
  room_id: string
  limit?: number
  before?: string // cursor pagination - get messages before this ID
  after?: string  // get messages after this ID
}

export interface PaginatedMessageResponse {
  data: ChatMessage[]
  hasMore: boolean
  oldestId: string | null
  newestId: string | null
}

// ============================================
// CONSTANTS
// ============================================

export const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  text: 'Văn bản',
  image: 'Hình ảnh',
  file: 'Tệp đính kèm',
  audio: 'Tin nhắn thoại',
  booking: 'Phiếu chốt mủ',
  deal: 'Deal',
  quotation: 'Báo giá',
  system: 'Hệ thống',
}

// Re-export từ constants chung — đảm bảo đồng bộ toàn hệ thống
export { PRODUCT_TYPE_LABELS } from '../../constants/rubberProducts'

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  negotiating: 'Đang thương lượng',
  rejected: 'Đã từ chối',
}

export const BOOKING_STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  confirmed: 'green',
  negotiating: 'blue',
  rejected: 'red',
}

// ============================================
// SERVICE
// ============================================

export const chatMessageService = {
  /**
   * Lấy danh sách tin nhắn của room (có phân trang cursor-based)
   */
  async getMessages(params: MessageListParams): Promise<PaginatedMessageResponse> {
    const { room_id, limit = 50, before, after } = params

    let query = supabase
      .from('b2b_chat_messages')
      .select('*')
      .eq('room_id', room_id)
      .is('deleted_at', null)
      .order('sent_at', { ascending: false })
      .limit(limit + 1) // +1 để check hasMore

    // Cursor pagination
    if (before) {
      // Lấy tin cũ hơn (scroll up)
      const { data: beforeMsg } = await supabase
        .from('b2b_chat_messages')
        .select('sent_at')
        .eq('id', before)
        .single()
      
      if (beforeMsg) {
        query = query.lt('sent_at', beforeMsg.sent_at)
      }
    }

    if (after) {
      // Lấy tin mới hơn (realtime)
      const { data: afterMsg } = await supabase
        .from('b2b_chat_messages')
        .select('sent_at')
        .eq('id', after)
        .single()
      
      if (afterMsg) {
        query = query.gt('sent_at', afterMsg.sent_at)
      }
    }

    const { data, error } = await query

    if (error) throw error

    const messages = data || []
    const hasMore = messages.length > limit
    
    // Remove extra message used for hasMore check
    if (hasMore) {
      messages.pop()
    }

    // Reverse để có thứ tự chronological (cũ → mới)
    const sortedMessages = messages.reverse()

    return {
      data: sortedMessages as ChatMessage[],
      hasMore,
      oldestId: sortedMessages[0]?.id || null,
      newestId: sortedMessages[sortedMessages.length - 1]?.id || null,
    }
  },

  /**
   * Lấy tin nhắn theo ID
   */
  async getById(id: string): Promise<ChatMessage | null> {
    const { data, error } = await supabase
      .from('b2b_chat_messages')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data as ChatMessage | null
  },

  /**
   * Gửi tin nhắn mới (từ Factory/ERP side)
   */
  async sendMessage(messageData: SendMessageData): Promise<ChatMessage> {
    const { data, error } = await supabase
      .from('b2b_chat_messages')
      .insert({
        room_id: messageData.room_id,
        sender_id: messageData.sender_id,
        sender_type: 'factory' as SenderType, // ERP side luôn là 'factory'
        content: messageData.content,
        message_type: messageData.message_type || 'text',
        attachments: messageData.attachments || null,
        metadata: messageData.metadata || null,
        reply_to_id: messageData.reply_to_id || null,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    // Update room's last_message_at
    await supabase
      .from('b2b_chat_rooms')
      .update({
        last_message_at: new Date().toISOString(),
      })
      .eq('id', messageData.room_id)

    // Increment message count via RPC (if available), otherwise skip
    const { error: rpcError } = await supabase.rpc('increment_message_count', { row_id: messageData.room_id })
    if (rpcError) {
      // RPC not available — message_count sẽ được tính từ view hoặc trigger
      console.warn('increment_message_count RPC not available:', rpcError.message)
    }

    return data as ChatMessage
  },

  /**
   * Chỉnh sửa tin nhắn
   */
  async editMessage(id: string, newContent: string): Promise<ChatMessage> {
    // Lấy tin nhắn gốc
    const original = await this.getById(id)
    if (!original) throw new Error('Tin nhắn không tồn tại')

    const { data, error } = await supabase
      .from('b2b_chat_messages')
      .update({
        content: newContent,
        edited_at: new Date().toISOString(),
        metadata: {
          ...original.metadata,
          edited: true,
          original_content: original.metadata?.original_content || original.content,
        },
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as ChatMessage
  },

  /**
   * Thu hồi tin nhắn (Recall)
   */
  async recallMessage(id: string): Promise<ChatMessage> {
    const original = await this.getById(id)
    if (!original) throw new Error('Tin nhắn không tồn tại')

    const { data, error } = await supabase
      .from('b2b_chat_messages')
      .update({
        content: 'Tin nhắn đã được thu hồi',
        metadata: {
          ...original.metadata,
          recalled: true,
          recalled_at: new Date().toISOString(),
          original_content: original.content,
        },
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as ChatMessage
  },

  /**
   * Xóa tin nhắn (soft delete)
   */
  async deleteMessage(id: string): Promise<void> {
    const { error } = await supabase
      .from('b2b_chat_messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw error
  },

  /**
   * Ghim/Bỏ ghim tin nhắn
   */
  async togglePinMessage(id: string, pinnedBy: string): Promise<ChatMessage> {
    const original = await this.getById(id)
    if (!original) throw new Error('Tin nhắn không tồn tại')

    const isPinned = original.metadata?.pinned || false

    const { data, error } = await supabase
      .from('b2b_chat_messages')
      .update({
        metadata: {
          ...original.metadata,
          pinned: !isPinned,
          pinned_at: !isPinned ? new Date().toISOString() : null,
          pinned_by: !isPinned ? pinnedBy : null,
        },
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data as ChatMessage
  },

  /**
   * Lấy tin nhắn đã ghim của room
   */
  async getPinnedMessages(roomId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('b2b_chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .is('deleted_at', null)
      .not('metadata->pinned', 'is', null)
      .eq('metadata->pinned', true)
      .order('metadata->pinned_at', { ascending: false })

    if (error) throw error
    return (data || []) as ChatMessage[]
  },

  // ============================================
  // MARK AS READ (E1.4)
  // ============================================

  /**
   * Đánh dấu đã đọc tất cả tin nhắn của partner trong room
   */
  async markAsRead(roomId: string): Promise<number> {
    const { data, error } = await supabase
      .from('b2b_chat_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('room_id', roomId)
      .eq('sender_type', 'partner')
      .is('read_at', null)
      .select('id')

    if (error) throw error
    return data?.length || 0
  },

  /**
   * Đánh dấu đã đọc 1 tin nhắn cụ thể
   */
  async markMessageAsRead(id: string): Promise<void> {
    const { error } = await supabase
      .from('b2b_chat_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .is('read_at', null)

    if (error) throw error
  },

  /**
   * Đếm tin chưa đọc của room (từ partner gửi)
   */
  async getUnreadCount(roomId: string): Promise<number> {
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
   * Tổng tin chưa đọc (tất cả rooms)
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

  // ============================================
  // BOOKING (Phiếu chốt mủ) - E1.3.3
  // ============================================

  /**
   * Cập nhật trạng thái booking
   */
  async updateBookingStatus(
    messageId: string, 
    status: BookingMetadata['status'],
    counterPrice?: number,
    negotiationNotes?: string
  ): Promise<ChatMessage> {
    const original = await this.getById(messageId)
    if (!original) throw new Error('Tin nhắn không tồn tại')
    if (original.message_type !== 'booking') throw new Error('Không phải phiếu chốt mủ')

    const booking = original.metadata?.booking
    if (!booking) throw new Error('Không có dữ liệu booking')

    const { data, error } = await supabase
      .from('b2b_chat_messages')
      .update({
        metadata: {
          ...original.metadata,
          booking: {
            ...booking,
            status,
            counter_price: counterPrice || booking.counter_price,
            negotiation_notes: negotiationNotes || booking.negotiation_notes,
          },
        },
      })
      .eq('id', messageId)
      .select()
      .single()

    if (error) throw error
    return data as ChatMessage
  },

  /**
   * Xác nhận booking và tự động tạo Deal
   */
  async confirmBooking(messageId: string, partnerId: string): Promise<{ message: ChatMessage; deal: Deal }> {
    // 1. Cập nhật trạng thái booking → confirmed
    const confirmedMessage = await this.updateBookingStatus(messageId, 'confirmed')

    // 2. Lấy booking data từ metadata
    const booking = confirmedMessage.metadata?.booking
    if (!booking) throw new Error('Không có dữ liệu booking')

    // 3. Tự động tạo Deal từ booking (với booking_message_id để tránh trùng)
    const deal = await dealService.createDealFromBooking(partnerId, {
      product_type: booking.product_type,
      quantity_tons: booking.quantity_tons,
      price_per_kg: booking.price_per_kg,
      drc_percent: booking.drc_percent,
      booking_message_id: messageId,
    })

    return { message: confirmedMessage, deal }
  },

  /**
   * Từ chối booking
   */
  async rejectBooking(messageId: string, reason?: string): Promise<ChatMessage> {
    return this.updateBookingStatus(messageId, 'rejected', undefined, reason)
  },

  /**
   * Thương lượng booking (đề xuất giá mới)
   */
  async negotiateBooking(
    messageId: string, 
    counterPrice: number, 
    notes?: string
  ): Promise<ChatMessage> {
    return this.updateBookingStatus(messageId, 'negotiating', counterPrice, notes)
  },

  // ============================================
  // REALTIME SUBSCRIPTION
  // ============================================

  /**
   * Subscribe to messages of a specific room
   * Lưu ý: Phải dùng schema: 'b2b' cho realtime
   */
  subscribeToRoom(
    roomId: string,
    callbacks: {
      onInsert?: (message: ChatMessage) => void
      onUpdate?: (message: ChatMessage) => void
      onDelete?: (message: ChatMessage) => void
    }
  ) {
    return supabase
      .channel(`chat-room-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'b2b',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          callbacks.onInsert?.(payload.new as ChatMessage)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'b2b',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          callbacks.onUpdate?.(payload.new as ChatMessage)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'b2b',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          callbacks.onDelete?.(payload.old as ChatMessage)
        }
      )
      .subscribe()
  },

  // ============================================
  // SEARCH
  // ============================================

  /**
   * Tìm kiếm tin nhắn trong room
   */
  async searchMessages(roomId: string, searchText: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('b2b_chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .is('deleted_at', null)
      .ilike('content', `%${searchText}%`)
      .order('sent_at', { ascending: false })
      .limit(50)

    if (error) throw error
    return (data || []) as ChatMessage[]
  },
}

export default chatMessageService