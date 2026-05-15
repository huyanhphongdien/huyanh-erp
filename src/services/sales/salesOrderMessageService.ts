// ============================================================================
// SALES ORDER MESSAGE SERVICE — Chat trao đổi trong đơn
// File: src/services/sales/salesOrderMessageService.ts
//
// CRUD bảng sales_order_messages + Supabase realtime subscribe.
// Tham khảo project_comments (đã có) với extra: attachment, pin, realtime.
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createNotification } from '../notificationService'

export type MessageType = 'user' | 'system' | 'event'
export type MessageAuthorRole =
  | 'sale' | 'review' | 'sign' | 'logistics' | 'production' | 'admin' | 'system' | null

export interface SalesOrderMessage {
  id: string
  sales_order_id: string

  content: string
  message_type: MessageType

  author_id: string | null
  author_role: MessageAuthorRole

  parent_message_id: string | null
  mentioned_ids: string[]
  attachment_doc_id: string | null

  is_pinned: boolean
  pinned_at: string | null
  pinned_by: string | null

  is_edited: boolean
  edited_at: string | null
  is_deleted: boolean

  created_at: string
  updated_at: string

  // Joins (optional, fetched separately)
  author?: {
    id: string
    full_name: string
    email?: string
    avatar_url?: string | null
  } | null
  attachment?: {
    id: string
    file_name: string | null
    file_size: number | null
    file_url: string | null
    doc_type: string | null
  } | null
  replies?: SalesOrderMessage[]
}

export interface MentionableUser {
  id: string
  full_name: string
  email: string
  role_label: string
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

async function getCurrentEmployee(): Promise<{ id: string; full_name?: string; email?: string } | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('employees')
    .select('id, full_name, email')
    .eq('user_id', user.id)
    .maybeSingle()
  return data || null
}

function roleFromEmail(email?: string | null): MessageAuthorRole {
  const e = (email || '').toLowerCase()
  if (e === 'sales@huyanhrubber.com') return 'sale'
  if (e === 'phulv@huyanhrubber.com') return 'review'
  if (['trunglxh@huyanhrubber.com', 'huylv@huyanhrubber.com'].includes(e)) return 'sign'
  if (['logistics@huyanhrubber.com', 'anhlp@huyanhrubber.com', 'nhungtt@huyanhrubber.com'].includes(e))
    return 'logistics'
  if (['nhanlt@huyanhrubber.com', 'tannv@huyanhrubber.com'].includes(e)) return 'production'
  if (['minhld@huyanhrubber.com', 'thuyht@huyanhrubber.com'].includes(e)) return 'admin'
  return null
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export const salesOrderMessageService = {
  /** List tất cả messages của đơn (sorted by created_at ASC). */
  async listByOrder(salesOrderId: string): Promise<SalesOrderMessage[]> {
    const { data, error } = await supabase
      .from('sales_order_messages')
      .select(`
        *,
        author:employees!sales_order_messages_author_id_fkey(id, full_name, email),
        attachment:sales_order_documents!sales_order_messages_attachment_doc_id_fkey(id, file_name, file_size, file_url, doc_type)
      `)
      .eq('sales_order_id', salesOrderId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data as unknown as SalesOrderMessage[]) || []
  },

  /** Gửi tin user. Tự gửi notification cho mỗi người được @mention. */
  async sendMessage(params: {
    salesOrderId: string
    content: string
    parentMessageId?: string | null
    mentionedIds?: string[]
    attachmentDocId?: string | null
  }): Promise<SalesOrderMessage> {
    const me = await getCurrentEmployee()
    if (!me) throw new Error('Không xác định được nhân viên')

    const role = roleFromEmail(me.email)
    const mentionedIds = (params.mentionedIds || []).filter((id) => id && id !== me.id)

    const { data, error } = await supabase
      .from('sales_order_messages')
      .insert({
        sales_order_id: params.salesOrderId,
        content: params.content.trim(),
        message_type: 'user',
        author_id: me.id,
        author_role: role,
        parent_message_id: params.parentMessageId || null,
        mentioned_ids: mentionedIds,
        attachment_doc_id: params.attachmentDocId || null,
      })
      .select('*')
      .single()
    if (error) throw error

    // ─── Notify mỗi người được mention (chuông góc trên ERP) ───
    if (mentionedIds.length > 0) {
      const { data: order } = await supabase
        .from('sales_orders')
        .select('code, contract_no')
        .eq('id', params.salesOrderId)
        .maybeSingle()
      const orderRef = order?.contract_no || order?.code || params.salesOrderId.slice(0, 8)
      const senderName = me.full_name || me.email || 'Một ai đó'
      const excerpt = params.content.trim().slice(0, 120)

      // Gửi song song (không await để không block reply)
      void Promise.all(
        mentionedIds.map((recipientId) =>
          createNotification({
            recipient_id: recipientId,
            sender_id: me.id,
            module: 'system',
            notification_type: 'system_announcement',
            title: `💬 ${senderName} mention bạn trong đơn ${orderRef}`,
            message: excerpt,
            reference_id: params.salesOrderId,
            reference_type: 'sales_order_chat',
            reference_url: `/sales/orders/${params.salesOrderId}?tab=chat`,
            priority: 'normal',
            metadata: {
              chat_message_id: data.id,
              order_code: orderRef,
            },
          }),
        ),
      ).catch((e) => console.error('Notification gửi thất bại:', e))
    }

    return data as SalesOrderMessage
  },

  /** Edit tin của mình. */
  async editMessage(id: string, newContent: string): Promise<SalesOrderMessage> {
    const { data, error } = await supabase
      .from('sales_order_messages')
      .update({
        content: newContent.trim(),
        is_edited: true,
        edited_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as SalesOrderMessage
  },

  /** Xóa mềm (is_deleted=true). */
  async deleteMessage(id: string): Promise<void> {
    const { error } = await supabase
      .from('sales_order_messages')
      .update({ is_deleted: true })
      .eq('id', id)
    if (error) throw error
  },

  /** Ghim/bỏ ghim — admin only (RLS guard). */
  async togglePin(id: string, pin: boolean): Promise<SalesOrderMessage> {
    const me = await getCurrentEmployee()
    const { data, error } = await supabase
      .from('sales_order_messages')
      .update({
        is_pinned: pin,
        pinned_at: pin ? new Date().toISOString() : null,
        pinned_by: pin ? me?.id : null,
      })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as SalesOrderMessage
  },

  /** List pinned messages. */
  async listPinned(salesOrderId: string): Promise<SalesOrderMessage[]> {
    const { data, error } = await supabase
      .from('sales_order_messages')
      .select(`
        *,
        author:employees!sales_order_messages_author_id_fkey(id, full_name, email)
      `)
      .eq('sales_order_id', salesOrderId)
      .eq('is_pinned', true)
      .eq('is_deleted', false)
      .order('pinned_at', { ascending: false })
    if (error) throw error
    return (data as unknown as SalesOrderMessage[]) || []
  },

  /** Subscribe realtime — gọi cb khi có INSERT/UPDATE/DELETE.
   *  Return channel để caller unsubscribe khi unmount. */
  subscribe(
    salesOrderId: string,
    callback: (msg: SalesOrderMessage, event: 'INSERT' | 'UPDATE' | 'DELETE') => void,
  ): RealtimeChannel {
    const channel = supabase
      .channel(`sales-order-messages-${salesOrderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales_order_messages',
          filter: `sales_order_id=eq.${salesOrderId}`,
        },
        (payload) => {
          const event = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
          const row = (payload.new || payload.old) as SalesOrderMessage
          if (row) callback(row, event)
        },
      )
      .subscribe()
    return channel
  },

  /** Count unread messages (sau timestamp). */
  async countUnread(salesOrderId: string, lastReadAt: string | null): Promise<number> {
    let query = supabase
      .from('sales_order_messages')
      .select('id', { count: 'exact', head: true })
      .eq('sales_order_id', salesOrderId)
      .eq('is_deleted', false)
    if (lastReadAt) query = query.gt('created_at', lastReadAt)
    const { count, error } = await query
    if (error) return 0
    return count || 0
  },

  /** Get all mentionable users (employees có email Huy Anh). */
  async getMentionableUsers(): Promise<MentionableUser[]> {
    const { data, error } = await supabase
      .from('employees')
      .select('id, full_name, email')
      .ilike('email', '%@huyanhrubber.com')
      .order('full_name', { ascending: true })
    if (error) return []
    return (data || []).map((e) => ({
      id: e.id,
      full_name: e.full_name || '',
      email: e.email || '',
      role_label: (() => {
        const r = roleFromEmail(e.email)
        return r === 'sale' ? 'Sale'
          : r === 'review' ? 'Kiểm tra'
          : r === 'sign' ? 'Trình ký'
          : r === 'logistics' ? 'Logistics'
          : r === 'production' ? 'Sản xuất'
          : r === 'admin' ? 'Admin'
          : 'Khác'
      })(),
    }))
  },
}

export { roleFromEmail }
