// ============================================================================
// B2B NOTIFICATION SERVICE — Thông báo trong ERP cho sự kiện B2B
// File: src/services/b2b/b2bNotificationService.ts
// Sprint 4 (Nice-to-have): Khung cơ bản cho notification engine.
// ============================================================================
// Hiện trạng: Push vào bảng b2b_notifications (nhân viên + partner).
// Engine email/SMS sẽ wire sau (TODO). Service này chỉ write DB event để
// UI bell icon hiện badge và partner portal poll.
// ============================================================================

import { supabase } from '../../lib/supabase'

export type B2BNotificationType =
  | 'deal_accepted'
  | 'deal_settled'
  | 'deal_cancelled'
  | 'settlement_submitted'
  | 'settlement_approved'
  | 'settlement_paid'
  | 'dispute_raised'
  | 'dispute_resolved'
  | 'advance_paid'

export type B2BNotificationAudience = 'staff' | 'partner' | 'both'

export interface B2BNotification {
  id: string
  type: B2BNotificationType
  audience: B2BNotificationAudience
  partner_id: string | null
  deal_id: string | null
  settlement_id: string | null
  dispute_id: string | null
  title: string
  message: string
  link_url: string | null
  is_read: boolean
  created_by: string | null
  created_at: string
}

export interface CreateNotificationData {
  type: B2BNotificationType
  audience: B2BNotificationAudience
  partner_id?: string | null
  deal_id?: string | null
  settlement_id?: string | null
  dispute_id?: string | null
  title: string
  message: string
  link_url?: string | null
  created_by?: string | null
}

export const b2bNotificationService = {
  /**
   * Gửi 1 event notification. Best-effort — nuốt error để không block flow
   * nghiệp vụ chính. Bảng b2b_notifications nếu chưa tồn tại (migration chưa
   * chạy) sẽ log warn và trả về null.
   */
  async notify(data: CreateNotificationData): Promise<B2BNotification | null> {
    try {
      const { data: row, error } = await supabase
        .from('b2b_notifications')
        .insert({
          type: data.type,
          audience: data.audience,
          partner_id: data.partner_id ?? null,
          deal_id: data.deal_id ?? null,
          settlement_id: data.settlement_id ?? null,
          dispute_id: data.dispute_id ?? null,
          title: data.title,
          message: data.message,
          link_url: data.link_url ?? null,
          is_read: false,
          created_by: data.created_by ?? null,
        })
        .select('*')
        .single()

      if (error) {
        console.warn('[b2bNotification] insert failed (migration may be pending):', error.message)
        return null
      }
      return row as B2BNotification
    } catch (err) {
      console.error('[b2bNotification] unexpected error:', err)
      return null
    }
  },

  async listForStaff(params: { limit?: number; unread_only?: boolean } = {}): Promise<B2BNotification[]> {
    const limit = params.limit || 50
    let q = supabase
      .from('b2b_notifications')
      .select('*')
      .in('audience', ['staff', 'both'])
      .order('created_at', { ascending: false })
      .limit(limit)
    if (params.unread_only) q = q.eq('is_read', false)
    const { data, error } = await q
    if (error) { console.warn('[b2bNotification] list staff failed:', error.message); return [] }
    return (data || []) as B2BNotification[]
  },

  async listForPartner(partnerId: string, params: { limit?: number; unread_only?: boolean } = {}): Promise<B2BNotification[]> {
    const limit = params.limit || 50
    let q = supabase
      .from('b2b_notifications')
      .select('*')
      .in('audience', ['partner', 'both'])
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (params.unread_only) q = q.eq('is_read', false)
    const { data, error } = await q
    if (error) { console.warn('[b2bNotification] list partner failed:', error.message); return [] }
    return (data || []) as B2BNotification[]
  },

  async markRead(id: string): Promise<void> {
    const { error } = await supabase
      .from('b2b_notifications')
      .update({ is_read: true })
      .eq('id', id)
    if (error) console.warn('[b2bNotification] mark read failed:', error.message)
  },

  async markAllReadForStaff(): Promise<void> {
    const { error } = await supabase
      .from('b2b_notifications')
      .update({ is_read: true })
      .in('audience', ['staff', 'both'])
      .eq('is_read', false)
    if (error) console.warn('[b2bNotification] mark all read staff failed:', error.message)
  },
}

export default b2bNotificationService
