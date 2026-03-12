// ============================================================================
// PAYMENT SERVICE — Service quản lý Thanh toán quyết toán B2B
// File: src/services/b2b/paymentService.ts
// Phase: E5
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================
// TYPES
// ============================================

export type PaymentMethod = 'bank_transfer' | 'cash' | 'check'

export interface SettlementPayment {
  id: string
  settlement_id: string
  payment_date: string
  amount: number
  payment_method: PaymentMethod
  recipient_name: string | null
  bank_account: string | null
  bank_name: string | null
  account_holder: string | null
  company_account: string | null
  company_bank: string | null
  company_name: string | null
  notes: string | null
  receipt_url: string | null
  created_by: string
  created_at: string
  // Joined
  settlement?: {
    id: string
    code: string
    partner_id: string
    gross_amount: number | null
    remaining_amount: number | null
    status: string
  }
}

export interface PaymentListParams {
  page?: number
  pageSize?: number
  settlement_id?: string
  partner_id?: string
  payment_method?: PaymentMethod | 'all'
  date_from?: string
  date_to?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface PaginatedPaymentResponse {
  data: SettlementPayment[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface PaymentCreateData {
  settlement_id: string
  amount: number
  payment_date?: string
  payment_method?: PaymentMethod
  recipient_name?: string
  bank_account?: string
  bank_name?: string
  account_holder?: string
  company_account?: string
  company_bank?: string
  company_name?: string
  notes?: string
  receipt_url?: string
  created_by: string
}

// ============================================
// CONSTANTS
// ============================================

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'Chuyển khoản',
  cash: 'Tiền mặt',
  check: 'Séc',
}

export const PAYMENT_METHOD_COLORS: Record<PaymentMethod, string> = {
  bank_transfer: 'blue',
  cash: 'green',
  check: 'orange',
}

// ============================================
// SERVICE
// ============================================

export const paymentService = {
  // ============================================
  // LIST & QUERY
  // ============================================

  async getPayments(params: PaymentListParams = {}): Promise<PaginatedPaymentResponse> {
    const {
      page = 1,
      pageSize = 10,
      settlement_id,
      partner_id,
      payment_method,
      date_from,
      date_to,
      sort_by = 'payment_date',
      sort_order = 'desc',
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('b2b_settlement_payments')
      .select(`
        *,
        settlement:b2b_settlements!settlement_id (
          id, code, partner_id, gross_amount, remaining_amount, status
        )
      `, { count: 'exact' })

    if (settlement_id) {
      query = query.eq('settlement_id', settlement_id)
    }

    if (payment_method && payment_method !== 'all') {
      query = query.eq('payment_method', payment_method)
    }

    if (date_from) {
      query = query.gte('payment_date', date_from)
    }
    if (date_to) {
      query = query.lte('payment_date', date_to)
    }

    query = query.order(sort_by, { ascending: sort_order === 'asc' })

    const { data, error, count } = await query.range(from, to)

    if (error) throw error

    let payments = (data || []).map(p => ({
      ...p,
      settlement: Array.isArray(p.settlement) ? p.settlement[0] : p.settlement,
    })) as SettlementPayment[]

    // Filter by partner_id through settlement if needed
    if (partner_id) {
      payments = payments.filter(p => p.settlement?.partner_id === partner_id)
    }

    return {
      data: payments,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  async getPaymentsBySettlement(settlementId: string): Promise<SettlementPayment[]> {
    const { data, error } = await supabase
      .from('b2b_settlement_payments')
      .select('*')
      .eq('settlement_id', settlementId)
      .order('payment_date', { ascending: false })

    if (error) throw error
    return (data || []) as SettlementPayment[]
  },

  // ============================================
  // CREATE
  // ============================================

  async createPayment(paymentData: PaymentCreateData): Promise<SettlementPayment> {
    const { data, error } = await supabase
      .from('b2b_settlement_payments')
      .insert({
        settlement_id: paymentData.settlement_id,
        amount: paymentData.amount,
        payment_date: paymentData.payment_date || new Date().toISOString().split('T')[0],
        payment_method: paymentData.payment_method || 'bank_transfer',
        recipient_name: paymentData.recipient_name,
        bank_account: paymentData.bank_account,
        bank_name: paymentData.bank_name,
        account_holder: paymentData.account_holder,
        company_account: paymentData.company_account,
        company_bank: paymentData.company_bank,
        company_name: paymentData.company_name,
        notes: paymentData.notes,
        receipt_url: paymentData.receipt_url,
        created_by: paymentData.created_by,
      })
      .select('*')
      .single()

    if (error) throw error

    // Update settlement total_paid_post and remaining_amount
    await this._recalcSettlementPaid(paymentData.settlement_id)

    return data as SettlementPayment
  },

  // ============================================
  // DELETE
  // ============================================

  async deletePayment(id: string, settlementId: string): Promise<void> {
    const { error } = await supabase
      .from('b2b_settlement_payments')
      .delete()
      .eq('id', id)

    if (error) throw error

    await this._recalcSettlementPaid(settlementId)
  },

  // ============================================
  // HELPERS
  // ============================================

  async _recalcSettlementPaid(settlementId: string): Promise<void> {
    const { data } = await supabase
      .from('b2b_settlement_payments')
      .select('amount')
      .eq('settlement_id', settlementId)

    const totalPaid = (data || []).reduce((sum: number, p: any) => sum + (p.amount || 0), 0)

    // Get settlement to calc remaining
    const { data: settlement } = await supabase
      .from('b2b_settlements')
      .select('gross_amount, total_advance')
      .eq('id', settlementId)
      .single()

    const grossAmount = settlement?.gross_amount || 0
    const totalAdvance = settlement?.total_advance || 0

    await supabase
      .from('b2b_settlements')
      .update({
        total_paid_post: totalPaid,
        remaining_amount: grossAmount - totalAdvance - totalPaid,
        updated_at: new Date().toISOString(),
      })
      .eq('id', settlementId)
  },

  // ============================================
  // SUMMARY
  // ============================================

  async getPaymentSummary(partnerId: string): Promise<{
    total_paid: number
    payment_count: number
    last_payment_date: string | null
  }> {
    const { data, error } = await supabase
      .from('b2b_settlement_payments')
      .select(`
        amount, payment_date,
        settlement:b2b_settlements!settlement_id (partner_id)
      `)
      .order('payment_date', { ascending: false })

    if (error) throw error

    const payments = (data || []).filter((p: any) => {
      const settlement = Array.isArray(p.settlement) ? p.settlement[0] : p.settlement
      return settlement?.partner_id === partnerId
    })

    return {
      total_paid: payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0),
      payment_count: payments.length,
      last_payment_date: payments.length > 0 ? payments[0].payment_date : null,
    }
  },
}

export default paymentService
