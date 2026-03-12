// ============================================================================
// ADVANCE SERVICE — Service quản lý Tạm ứng B2B
// File: src/services/b2b/advanceService.ts
// Phase: E5
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================
// TYPES
// ============================================

export type AdvanceStatus = 'pending' | 'approved' | 'paid' | 'rejected'
export type PaymentMethod = 'cash' | 'bank_transfer' | 'check'

export interface Advance {
  id: string
  deal_id: string
  partner_id: string
  advance_number: string
  amount: number
  currency: string
  exchange_rate: number | null
  amount_vnd: number | null
  payment_date: string
  payment_method: string
  bank_reference: string | null
  purpose: string | null
  status: AdvanceStatus
  requested_by: string | null
  approved_by: string | null
  approved_at: string | null
  paid_by: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
  // Joined
  partner?: {
    id: string
    code: string
    name: string
    tier: string
    phone: string | null
  }
  deal?: {
    id: string
    deal_number: string
    product_name: string | null
  }
}

export interface AdvanceListParams {
  page?: number
  pageSize?: number
  search?: string
  status?: AdvanceStatus | 'all'
  partner_id?: string
  deal_id?: string
  date_from?: string
  date_to?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface PaginatedAdvanceResponse {
  data: Advance[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface AdvanceCreateData {
  deal_id: string
  partner_id: string
  amount: number
  currency?: string
  exchange_rate?: number
  amount_vnd?: number
  payment_date: string
  payment_method: string
  bank_reference?: string
  purpose?: string
  requested_by?: string
}

// ============================================
// CONSTANTS
// ============================================

export const ADVANCE_STATUS_LABELS: Record<AdvanceStatus, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  paid: 'Đã chi',
  rejected: 'Từ chối',
}

export const ADVANCE_STATUS_COLORS: Record<AdvanceStatus, string> = {
  pending: 'orange',
  approved: 'green',
  paid: 'blue',
  rejected: 'red',
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  check: 'Séc',
}

// ============================================
// HELPER
// ============================================

const generateAdvanceNumber = (): string => {
  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `TU${year}${month}-${random}`
}

// ============================================
// SERVICE
// ============================================

export const advanceService = {
  // ============================================
  // LIST & QUERY
  // ============================================

  async getAdvances(params: AdvanceListParams = {}): Promise<PaginatedAdvanceResponse> {
    const {
      page = 1,
      pageSize = 10,
      search,
      status,
      partner_id,
      deal_id,
      date_from,
      date_to,
      sort_by = 'created_at',
      sort_order = 'desc',
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('b2b_advances')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone
        ),
        deal:b2b_deals!deal_id (
          id, deal_number, product_name
        )
      `, { count: 'exact' })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    if (partner_id) {
      query = query.eq('partner_id', partner_id)
    }
    if (deal_id) {
      query = query.eq('deal_id', deal_id)
    }
    if (date_from) {
      query = query.gte('payment_date', date_from)
    }
    if (date_to) {
      query = query.lte('payment_date', date_to)
    }
    if (search) {
      query = query.ilike('advance_number', `%${search}%`)
    }

    query = query.order(sort_by, { ascending: sort_order === 'asc' })

    const { data, error, count } = await query.range(from, to)

    if (error) throw error

    const advances = (data || []).map(a => ({
      ...a,
      partner: Array.isArray(a.partner) ? a.partner[0] : a.partner,
      deal: Array.isArray(a.deal) ? a.deal[0] : a.deal,
    })) as Advance[]

    return {
      data: advances,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  async getAdvanceById(id: string): Promise<Advance | null> {
    const { data, error } = await supabase
      .from('b2b_advances')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone
        ),
        deal:b2b_deals!deal_id (
          id, deal_number, product_name
        )
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    return {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
      deal: Array.isArray(data.deal) ? data.deal[0] : data.deal,
    } as Advance
  },

  async getAdvancesByPartner(partnerId: string): Promise<Advance[]> {
    const { data, error } = await supabase
      .from('b2b_advances')
      .select(`
        *,
        deal:b2b_deals!deal_id (
          id, deal_number, product_name
        )
      `)
      .eq('partner_id', partnerId)
      .order('payment_date', { ascending: false })

    if (error) throw error

    return (data || []).map(a => ({
      ...a,
      deal: Array.isArray(a.deal) ? a.deal[0] : a.deal,
    })) as Advance[]
  },

  async getAdvancesByDeal(dealId: string): Promise<Advance[]> {
    const { data, error } = await supabase
      .from('b2b_advances')
      .select('*')
      .eq('deal_id', dealId)
      .order('payment_date', { ascending: false })

    if (error) throw error
    return (data || []) as Advance[]
  },

  /**
   * Lấy tạm ứng chưa được link vào settlement (cho dropdown chọn khi tạo QT)
   */
  async getUnlinkedAdvances(partnerId: string): Promise<Advance[]> {
    // Get all paid advances for this partner
    const { data: advances, error } = await supabase
      .from('b2b_advances')
      .select('*')
      .eq('partner_id', partnerId)
      .eq('status', 'paid')
      .order('payment_date', { ascending: false })

    if (error) throw error

    // Get already linked advance IDs
    const { data: linked } = await supabase
      .from('b2b_settlement_advances')
      .select('advance_id')

    const linkedIds = new Set((linked || []).map((l: any) => l.advance_id))

    return (advances || []).filter((a: any) => !linkedIds.has(a.id)) as Advance[]
  },

  // ============================================
  // CREATE
  // ============================================

  async createAdvance(advanceData: AdvanceCreateData): Promise<Advance> {
    const advanceNumber = generateAdvanceNumber()

    const { data, error } = await supabase
      .from('b2b_advances')
      .insert({
        advance_number: advanceNumber,
        deal_id: advanceData.deal_id,
        partner_id: advanceData.partner_id,
        amount: advanceData.amount,
        currency: advanceData.currency || 'VND',
        exchange_rate: advanceData.exchange_rate,
        amount_vnd: advanceData.amount_vnd || advanceData.amount,
        payment_date: advanceData.payment_date,
        payment_method: advanceData.payment_method,
        bank_reference: advanceData.bank_reference,
        purpose: advanceData.purpose,
        status: 'pending' as AdvanceStatus,
        requested_by: advanceData.requested_by,
      })
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone
        ),
        deal:b2b_deals!deal_id (
          id, deal_number, product_name
        )
      `)
      .single()

    if (error) throw error

    return {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
      deal: Array.isArray(data.deal) ? data.deal[0] : data.deal,
    } as Advance
  },

  // ============================================
  // STATUS TRANSITIONS
  // ============================================

  async approveAdvance(id: string, approvedBy: string): Promise<Advance> {
    const { data, error } = await supabase
      .from('b2b_advances')
      .update({
        status: 'approved' as AdvanceStatus,
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return data as Advance
  },

  async markPaid(id: string, paidBy: string, bankReference?: string): Promise<Advance> {
    const { data, error } = await supabase
      .from('b2b_advances')
      .update({
        status: 'paid' as AdvanceStatus,
        paid_by: paidBy,
        paid_at: new Date().toISOString(),
        bank_reference: bankReference,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return data as Advance
  },

  async rejectAdvance(id: string): Promise<Advance> {
    const { data, error } = await supabase
      .from('b2b_advances')
      .update({
        status: 'rejected' as AdvanceStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return data as Advance
  },

  // ============================================
  // DELETE
  // ============================================

  async deleteAdvance(id: string): Promise<void> {
    const advance = await this.getAdvanceById(id)
    if (!advance) throw new Error('Phiếu tạm ứng không tồn tại')
    if (advance.status !== 'pending') {
      throw new Error('Chỉ có thể xóa phiếu tạm ứng ở trạng thái "Chờ duyệt"')
    }

    const { error } = await supabase
      .from('b2b_advances')
      .delete()
      .eq('id', id)

    if (error) throw error
  },

  // ============================================
  // STATISTICS
  // ============================================

  async getStatsByStatus(): Promise<Record<AdvanceStatus, number>> {
    const { data, error } = await supabase
      .from('b2b_advances')
      .select('status')

    if (error) throw error

    const stats: Record<AdvanceStatus, number> = {
      pending: 0,
      approved: 0,
      paid: 0,
      rejected: 0,
    }

    for (const row of (data || []) as any[]) {
      if (row.status && stats[row.status as AdvanceStatus] !== undefined) {
        stats[row.status as AdvanceStatus]++
      }
    }

    return stats
  },

  async getTotalByPartner(partnerId: string): Promise<{ total: number; paid: number; pending: number }> {
    const { data, error } = await supabase
      .from('b2b_advances')
      .select('amount, status')
      .eq('partner_id', partnerId)

    if (error) throw error

    const result = { total: 0, paid: 0, pending: 0 }
    for (const row of (data || []) as any[]) {
      result.total += row.amount || 0
      if (row.status === 'paid') result.paid += row.amount || 0
      if (row.status === 'pending' || row.status === 'approved') result.pending += row.amount || 0
    }

    return result
  },
}

export default advanceService
