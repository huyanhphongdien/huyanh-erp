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
import { sendSimpleEmail } from '../emailService'
import { SALES_PARTICIPANT_EMAILS } from './salesPermissionService'

const APP_URL = 'https://huyanhrubber.vn'

/** Escape HTML để chèn nội dung tin nhắn an toàn vào email. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Build email HTML báo "bạn được nhắc trong đơn". */
function buildMentionEmailHtml(p: {
  recipientName: string
  senderName: string
  orderRef: string
  excerpt: string
  link: string
}): string {
  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:linear-gradient(135deg,#1B4D3E,#2D8B6E);padding:20px 28px;border-radius:12px 12px 0 0;">
      <h2 style="color:#fff;margin:0;font-size:18px;">💬 Bạn được nhắc trong trao đổi đơn hàng</h2>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px 28px;">
      <p style="color:#374151;font-size:14px;margin:0 0 16px;">
        Kính gửi <strong>${escapeHtml(p.recipientName || 'bạn')}</strong>,
      </p>
      <p style="color:#374151;font-size:14px;margin:0 0 16px;">
        <strong>${escapeHtml(p.senderName)}</strong> vừa nhắc (@mention) bạn trong phần trao đổi của đơn hàng
        <strong style="color:#1B4D3E;">${escapeHtml(p.orderRef)}</strong>:
      </p>
      <div style="background:#f8f9fa;border-left:4px solid #1B4D3E;padding:14px 16px;border-radius:6px;margin:0 0 20px;color:#374151;font-size:14px;font-style:italic;">
        "${escapeHtml(p.excerpt)}"
      </div>
      <a href="${p.link}" style="display:inline-block;background:#1B4D3E;color:#fff;padding:12px 26px;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
        Mở trao đổi đơn hàng
      </a>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 14px;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">
        Email tự động từ hệ thống Huy Anh ERP — bạn nhận vì được nhắc tên trong đơn hàng.
      </p>
    </div>
  </div>`
}

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
  if (['phulv@huyanhrubber.com', 'yendt@huyanhrubber.com'].includes(e)) return 'review'
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

  /** Lấy 1 tin kèm join author + attachment (dùng để bù sau realtime INSERT,
   *  vì payload realtime chỉ có row thô, thiếu join → ảnh/avatar không hiện). */
  async getMessageById(id: string): Promise<SalesOrderMessage | null> {
    const { data, error } = await supabase
      .from('sales_order_messages')
      .select(`
        *,
        author:employees!sales_order_messages_author_id_fkey(id, full_name, email),
        attachment:sales_order_documents!sales_order_messages_attachment_doc_id_fkey(id, file_name, file_size, file_url, doc_type)
      `)
      .eq('id', id)
      .maybeSingle()
    if (error) return null
    return (data as unknown as SalesOrderMessage) || null
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

    // ─── Thông báo cho mỗi người được mention ───
    if (mentionedIds.length > 0) {
      const { data: order } = await supabase
        .from('sales_orders')
        .select('code, contract_no')
        .eq('id', params.salesOrderId)
        .maybeSingle()
      const orderRef = order?.contract_no || order?.code || params.salesOrderId.slice(0, 8)
      const senderName = me.full_name || me.email || 'Một ai đó'
      const fullText = params.content.trim()
      const excerpt = fullText.slice(0, 120)
      const chatLink = `/sales/orders/${params.salesOrderId}?tab=chat`

      // 1) Chuông ERP (góc trên) — gửi song song, không block reply
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
            reference_url: chatLink,
            priority: 'normal',
            metadata: {
              chat_message_id: data.id,
              order_code: orderRef,
            },
          }),
        ),
      ).catch((e) => console.error('Notification gửi thất bại:', e))

      // 2) Email cho người được mention — lấy email từ employees rồi gửi qua send-email
      void (async () => {
        const { data: recipients } = await supabase
          .from('employees')
          .select('id, full_name, email')
          .in('id', mentionedIds)
        for (const r of recipients || []) {
          if (!r?.email) continue
          await sendSimpleEmail({
            to: r.email,
            toName: r.full_name || undefined,
            subject: `💬 ${senderName} nhắc bạn trong đơn ${orderRef}`,
            html: buildMentionEmailHtml({
              recipientName: r.full_name || '',
              senderName,
              orderRef,
              excerpt: fullText.slice(0, 500),
              link: `${APP_URL}${chatLink}`,
            }),
          })
        }
      })().catch((e) => console.error('Email mention gửi thất bại:', e))
    }

    return data as SalesOrderMessage
  },

  /** Upload 1 ảnh cho chat → trả về doc_id (sales_order_documents) để gắn vào tin.
   *  Lưu ở bucket 'sales-documents' (path chat/<orderId>/...). */
  async uploadChatImage(salesOrderId: string, file: File): Promise<string> {
    const me = await getCurrentEmployee()
    const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
    const rand = Math.random().toString(36).slice(2, 8)
    // Giữ dưới prefix orders/<id>/ giống upload chứng từ (phòng storage policy giới hạn path)
    const path = `orders/${salesOrderId}/chat_${Date.now()}_${rand}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('sales-documents')
      .upload(path, file, { cacheControl: '3600', upsert: false })
    if (upErr) throw upErr

    const { data: { publicUrl } } = supabase.storage.from('sales-documents').getPublicUrl(path)

    const base = {
      sales_order_id: salesOrderId,
      doc_name: file.name || 'image',
      file_url: publicUrl,
      file_name: file.name || `image.${ext}`,
      file_size: file.size,
      is_received: true,
      received_at: new Date().toISOString(),
      uploaded_by: me?.id || null,
      sort_order: 100,
    }
    // Ưu tiên doc_type='chat_image' (không lẫn vào checklist chứng từ);
    // nếu cột bị CHECK constraint thì fallback 'other'.
    const ins = await supabase
      .from('sales_order_documents')
      .insert({ ...base, doc_type: 'chat_image' })
      .select('id')
      .single()
    if (!ins.error && ins.data) return ins.data.id as string

    const ins2 = await supabase
      .from('sales_order_documents')
      .insert({ ...base, doc_type: 'other', notes: 'chat_image' })
      .select('id')
      .single()
    if (ins2.error) throw ins2.error
    return ins2.data.id as string
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

  /** Xóa mềm (is_deleted=true) — CHỈ Admin. */
  async deleteMessage(id: string): Promise<void> {
    const me = await getCurrentEmployee()
    if (roleFromEmail(me?.email) !== 'admin') {
      throw new Error('Chỉ Admin mới được xóa tin nhắn')
    }
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

  /** Get mentionable users — CHỈ những người tham gia module Đơn hàng bán
   *  (định nghĩa trong SALES_EMAIL_ROLE_MAP của salesPermissionService).
   *  KHÔNG include toàn bộ @huyanhrubber.com (HR, sản xuất khác, etc.) */
  async getMentionableUsers(): Promise<MentionableUser[]> {
    if (SALES_PARTICIPANT_EMAILS.length === 0) return []
    const { data, error } = await supabase
      .from('employees')
      .select('id, full_name, email')
      .in('email', SALES_PARTICIPANT_EMAILS)
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
