// ============================================================================
// PARTNER ASSIGNMENT SERVICE — Phân công NV phụ trách Đại lý
// File: src/services/b2b/partnerAssignmentService.ts
// Migration: sprint1_08_b2b_chat_per_employee.sql
// ============================================================================
//
// Many-to-many: 1 đại lý có thể có nhiều NV (primary + backup), 1 NV phụ trách
// nhiều đại lý. UNIQUE (partner_id, user_id) — không assign trùng.
// ============================================================================

import { supabase } from '../../lib/supabase'

export interface PartnerAssignment {
  id: string
  partner_id: string
  user_id: string
  is_primary: boolean
  note: string | null
  created_at: string
  created_by: string | null
  // Joined
  partner?: { id: string; name: string; code: string; tier: string | null }
  employee?: { id: string; full_name: string; code: string | null; user_id: string }
}

export interface AssignmentCreate {
  partner_id: string
  user_id: string
  is_primary?: boolean
  note?: string | null
}

export const partnerAssignmentService = {
  /** Tất cả assignments — admin view */
  async getAll(): Promise<PartnerAssignment[]> {
    const { data, error } = await supabase
      .from('b2b_partner_assignments')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as PartnerAssignment[]
  },

  /** Assignments của 1 đại lý cụ thể */
  async getByPartner(partnerId: string): Promise<PartnerAssignment[]> {
    const { data, error } = await supabase
      .from('b2b_partner_assignments')
      .select('*')
      .eq('partner_id', partnerId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data || []) as PartnerAssignment[]
  },

  /** Assignments của 1 NV — danh sách ĐL mà NV phụ trách */
  async getByUser(userId: string): Promise<PartnerAssignment[]> {
    const { data, error } = await supabase
      .from('b2b_partner_assignments')
      .select('*')
      .eq('user_id', userId)
      .order('is_primary', { ascending: false })
    if (error) throw error
    return (data || []) as PartnerAssignment[]
  },

  /** Trả mảng partner_id mà 1 NV phụ trách (helper hot-path) */
  async getPartnerIdsByUser(userId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('b2b_partner_assignments')
      .select('partner_id')
      .eq('user_id', userId)
    if (error) throw error
    return (data || []).map(r => r.partner_id as string)
  },

  /** Kiểm tra NV có được phân công đại lý này không */
  async isAssigned(userId: string, partnerId: string): Promise<boolean> {
    const { count, error } = await supabase
      .from('b2b_partner_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('partner_id', partnerId)
    if (error) throw error
    return (count || 0) > 0
  },

  /** Tạo 1 assignment (NV nhận thêm 1 ĐL) */
  async create(input: AssignmentCreate, createdBy?: string): Promise<PartnerAssignment> {
    const { data, error } = await supabase
      .from('b2b_partner_assignments')
      .insert({
        partner_id: input.partner_id,
        user_id: input.user_id,
        is_primary: input.is_primary ?? false,
        note: input.note ?? null,
        created_by: createdBy ?? null,
      })
      .select('*')
      .single()
    if (error) throw error
    return data as PartnerAssignment
  },

  /** Bulk: gán 1 NV cho nhiều ĐL cùng lúc */
  async bulkAssignUserToPartners(userId: string, partnerIds: string[], createdBy?: string): Promise<number> {
    if (partnerIds.length === 0) return 0
    const rows = partnerIds.map(pid => ({
      partner_id: pid,
      user_id: userId,
      is_primary: false,
      created_by: createdBy ?? null,
    }))
    const { error, count } = await supabase
      .from('b2b_partner_assignments')
      .upsert(rows, { onConflict: 'partner_id,user_id', ignoreDuplicates: true, count: 'exact' })
    if (error) throw error
    return count || 0
  },

  /** Đổi flag is_primary */
  async setPrimary(id: string, isPrimary: boolean): Promise<void> {
    const { error } = await supabase
      .from('b2b_partner_assignments')
      .update({ is_primary: isPrimary })
      .eq('id', id)
    if (error) throw error
  },

  /** Xóa 1 assignment */
  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('b2b_partner_assignments')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  /** Xóa tất cả assignments của 1 cặp (partner, user) */
  async removeByPartnerUser(partnerId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('b2b_partner_assignments')
      .delete()
      .eq('partner_id', partnerId)
      .eq('user_id', userId)
    if (error) throw error
  },
}

export default partnerAssignmentService
