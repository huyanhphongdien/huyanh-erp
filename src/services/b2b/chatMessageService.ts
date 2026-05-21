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

export interface NegotiationHistoryEntry {
  actor_id: string
  actor_name?: string
  actor_role?: 'factory' | 'partner'
  counter_price: number
  notes: string
  ts: string
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
  rubber_region?: string
  rubber_region_lat?: number
  rubber_region_lng?: number
  notes?: string
  status: 'pending' | 'confirmed' | 'negotiating' | 'rejected'
  counter_price?: number
  negotiation_notes?: string
  /** Append-only thread lưu mỗi lần ai thương lượng. UI BookingCard render <details>. */
  negotiation_history?: NegotiationHistoryEntry[]
  /** Optimistic locking — increment mỗi lần update để chống race condition */
  negotiation_version?: number
  /** Deadline thương lượng (ISO). UI render countdown */
  negotiation_expires_at?: string
  // Nhà máy đích nhận hàng (đồng bộ với portal)
  target_facility_id?: string
  target_facility_code?: string
  target_facility_name?: string
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

    // Note: message_count increment removed — was calling a non-existent RPC
    // function causing 404 errors. Count can be derived from messages if needed.

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
   * Cập nhật trạng thái booking — có optimistic locking + history.
   * @param expectedVersion Nếu truyền + version DB khác → throw conflict
   * @param historyEntry Đẩy thêm 1 row vào negotiation_history
   */
  async updateBookingStatus(
    messageId: string,
    status: BookingMetadata['status'],
    counterPrice?: number,
    negotiationNotes?: string,
    options?: {
      expectedVersion?: number
      historyEntry?: NegotiationHistoryEntry
    },
  ): Promise<ChatMessage> {
    const original = await this.getById(messageId)
    if (!original) throw new Error('Tin nhắn không tồn tại')
    if (original.message_type !== 'booking') throw new Error('Không phải phiếu chốt mủ')

    const booking = original.metadata?.booking
    if (!booking) throw new Error('Không có dữ liệu booking')

    // Lock-state guard: phiếu đã confirmed/rejected → không cho update.
    // Tránh case 2 phía cùng confirm hoặc thương lượng sau khi Deal đã tạo.
    if (booking.status === 'confirmed') {
      throw new Error('Phiếu đã chốt thành Deal — không thể thay đổi. Vui lòng tạo phiếu mới.')
    }
    if (booking.status === 'rejected' && status !== 'rejected') {
      throw new Error('Phiếu đã bị từ chối — không thể thay đổi. Vui lòng tạo phiếu mới.')
    }

    // Optimistic locking — chống race condition khi 2 user cùng negotiate
    const currentVersion = booking.negotiation_version || 0
    if (options?.expectedVersion !== undefined && options.expectedVersion !== currentVersion) {
      throw new Error(
        `Bên kia vừa cập nhật phiếu (version ${currentVersion} thay vì ${options.expectedVersion}). Vui lòng tải lại để xem.`,
      )
    }

    const newHistory: NegotiationHistoryEntry[] = options?.historyEntry
      ? [...(booking.negotiation_history || []), options.historyEntry]
      : (booking.negotiation_history || [])

    const { data, error } = await supabase
      .from('b2b_chat_messages')
      .update({
        metadata: {
          ...original.metadata,
          booking: {
            ...booking,
            status,
            counter_price: counterPrice ?? booking.counter_price,
            negotiation_notes: negotiationNotes ?? booking.negotiation_notes,
            negotiation_history: newHistory,
            negotiation_version: currentVersion + 1,
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
   * Thương lượng booking (đề xuất giá mới).
   * - Push 1 entry vào negotiation_history
   * - Optimistic locking qua expectedVersion (cảnh báo conflict nếu race)
   * - Validate counterPrice trong khoảng 0.5x - 2x price_per_kg gốc
   * - Notes BẮT BUỘC (min 10 ký tự) — frontend đã validate, đây là backup
   */
  async negotiateBooking(
    messageId: string,
    counterPrice: number,
    notes: string,
    actorInfo?: { id: string; name?: string; role?: 'factory' | 'partner' },
  ): Promise<ChatMessage> {
    if (!notes || notes.trim().length < 10) {
      throw new Error('Lý do thương lượng phải có ít nhất 10 ký tự')
    }
    const original = await this.getById(messageId)
    if (!original) throw new Error('Tin nhắn không tồn tại')
    const booking = original.metadata?.booking
    if (!booking) throw new Error('Không có dữ liệu booking')

    // Validate counter-price range
    const basePrice = booking.counter_price || booking.price_per_kg
    if (counterPrice > basePrice * 2) {
      throw new Error(
        `Giá đề xuất quá cao (>${(basePrice * 2).toLocaleString('vi-VN')} đ/kg = 2× giá hiện tại)`,
      )
    }
    if (counterPrice < basePrice * 0.5) {
      throw new Error(
        `Giá đề xuất quá thấp (<${(basePrice * 0.5).toLocaleString('vi-VN')} đ/kg = 50% giá hiện tại)`,
      )
    }

    const historyEntry: NegotiationHistoryEntry = {
      actor_id: actorInfo?.id || 'unknown',
      actor_name: actorInfo?.name,
      actor_role: actorInfo?.role,
      counter_price: counterPrice,
      notes: notes.trim(),
      ts: new Date().toISOString(),
    }
    const result = await this.updateBookingStatus(
      messageId,
      'negotiating',
      counterPrice,
      notes,
      {
        expectedVersion: booking.negotiation_version || 0,
        historyEntry,
      },
    )

    // ─── Insert system message kèm vào chat (hiện trong timeline) ───
    // Đại lý (portal) đã làm tương tự ở handleNegotiateBooking. Factory phải
    // có để chat thread visibility đầy đủ — KHÔNG giới hạn vòng.
    try {
      const priceUnitLabel = booking.price_unit === 'dry' ? 'kg khô' : 'kg ướt'
      const roundNo = (booking.negotiation_history?.length || 0) + 1
      await supabase.from('b2b_chat_messages').insert({
        room_id: original.room_id,
        sender_id: actorInfo?.id || null,
        sender_type: 'factory',
        content: `💬 Vòng ${roundNo} — Nhà máy đề xuất thương lượng phiếu #${booking.code || ''}\nGiá: ${counterPrice.toLocaleString('vi-VN')} VNĐ/${priceUnitLabel}\nLý do: ${notes.trim()}`,
        message_type: 'system',
        reply_to_id: messageId,
        metadata: {
          action: 'booking_counter',
          booking_message_id: messageId,
          counter_price: counterPrice,
          note: notes.trim(),
          round_no: roundNo,
        },
        sent_at: new Date().toISOString(),
      })
      // Bump room last_message_at để chat list hiện trên cùng
      await supabase.from('b2b_chat_rooms')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', original.room_id)
    } catch (e) {
      console.error('Insert system message fail:', e)
      // Không throw — main update đã thành công, system message là bonus
    }

    return result
  },

  // ============================================
  // REALTIME SUBSCRIPTION
  // ============================================

  /**
   * Subscribe to messages of a specific room với AUTO-RECONNECT.
   *
   * Base table là b2b.chat_messages (public.b2b_chat_messages chỉ là VIEW
   * không publish realtime được). Subscription phải trỏ vào base table
   * với schema:'b2b'. Migration đi kèm add b2b.chat_messages vào
   * supabase_realtime publication:
   *   docs/migrations/b2b_chat_realtime_publication.sql
   *
   * Trả về subscription object với .unsubscribe() thay vì channel trực tiếp.
   * Tự động reconnect khi mất kết nối (exponential backoff, max 30s).
   */
  subscribeToRoom(
    roomId: string,
    callbacks: {
      onInsert?: (message: ChatMessage) => void
      onUpdate?: (message: ChatMessage) => void
      onDelete?: (message: ChatMessage) => void
      onStatusChange?: (status: 'connected' | 'disconnected' | 'reconnecting') => void
    }
  ) {
    let currentChannel: ReturnType<typeof supabase.channel> | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let retryCount = 0
    let unsubscribed = false
    const MAX_BACKOFF_MS = 30000

    const connect = () => {
      if (unsubscribed) return

      // Unique channel name mỗi lần connect để tránh reuse stale channel
      const channelName = `chat-room-${roomId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

      currentChannel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'b2b',
            table: 'chat_messages',
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => callbacks.onInsert?.(payload.new as ChatMessage)
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'b2b',
            table: 'chat_messages',
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => callbacks.onUpdate?.(payload.new as ChatMessage)
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'b2b',
            table: 'chat_messages',
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => callbacks.onDelete?.(payload.old as ChatMessage)
        )
        .subscribe((status) => {
          if (unsubscribed) return

          if (status === 'SUBSCRIBED') {
            if (retryCount > 0) {
              console.log(`[chat-realtime] reconnected after ${retryCount} attempts`)
            }
            retryCount = 0
            callbacks.onStatusChange?.('connected')
            return
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            callbacks.onStatusChange?.(retryCount === 0 ? 'disconnected' : 'reconnecting')

            // Tháo channel cũ trước khi reconnect
            if (currentChannel) {
              supabase.removeChannel(currentChannel)
              currentChannel = null
            }

            // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (cap)
            const delay = Math.min(1000 * Math.pow(2, retryCount), MAX_BACKOFF_MS)
            retryCount++

            console.warn(
              `[chat-realtime] lost — status: ${status}. Reconnect in ${delay}ms (attempt ${retryCount})`
            )

            reconnectTimer = setTimeout(() => {
              reconnectTimer = null
              connect()
            }, delay)
          }
        })
    }

    connect()

    // Auto reconnect khi tab active trở lại (user quay lại từ tab khác)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !unsubscribed) {
        // Force reconnect nếu channel không healthy
        const state = (currentChannel as any)?.state
        if (state !== 'joined' && state !== 'joining') {
          console.log('[chat-realtime] tab visible — force reconnect')
          retryCount = 0 // Reset backoff
          if (reconnectTimer) {
            clearTimeout(reconnectTimer)
            reconnectTimer = null
          }
          if (currentChannel) {
            supabase.removeChannel(currentChannel)
            currentChannel = null
          }
          connect()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return {
      unsubscribe: () => {
        unsubscribed = true
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
        if (currentChannel) {
          supabase.removeChannel(currentChannel)
          currentChannel = null
        }
      },
    }
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