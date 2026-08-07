// ============================================================================
// LC NEGOTIATION SERVICE — Đơn đề nghị chiết khấu / thương lượng L/C (GĐ 4)
// File: src/services/sales/lcNegotiationService.ts
// Bảng: sales_order_lc_negotiations (1–1 với đơn).
// ============================================================================

import { supabase } from '../../lib/supabase'

export type PaymentMethod = 'lc' | 'dp' | 'da'

export interface LcNegotiation {
  id?: string
  sales_order_id: string
  method?: PaymentMethod          // 'lc' = L/C (BM03) | 'dp' = Nhờ thu D/P (BM08) | 'da' = D/A
  bank_id: string | null
  issuing_bank: string | null     // L/C: NH phát hành · D/P: NH nhờ thu (NH người mua)
  lc_number: string | null
  lc_date: string | null
  negotiate_pct: number | null
  negotiate_amount: number | null
  interest_rate: number | null
  term_days: number | null
  submitted_date: string | null
  status: string
  notes: string | null
}

export const lcNegotiationService = {
  async getByOrder(orderId: string): Promise<LcNegotiation | null> {
    const { data, error } = await supabase
      .from('sales_order_lc_negotiations')
      .select('*')
      .eq('sales_order_id', orderId)
      .maybeSingle()
    if (error) throw error
    return data as LcNegotiation | null
  },

  async upsert(orderId: string, patch: Partial<LcNegotiation>): Promise<LcNegotiation> {
    const row = { ...patch, sales_order_id: orderId, updated_at: new Date().toISOString() }
    const { data, error } = await supabase
      .from('sales_order_lc_negotiations')
      .upsert(row, { onConflict: 'sales_order_id' })
      .select('*')
      .single()
    if (error) throw error
    return data as LcNegotiation
  },
}

export default lcNegotiationService
