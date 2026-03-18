// ============================================================================
// DEAL-PRODUCTION BRIDGE SERVICE
// File: src/services/b2b/dealProductionService.ts
// Phase: 4.8 — Lien ket B2B Deals voi WMS Production Orders
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================
// TYPES
// ============================================

export interface DealProductionSummary {
  production_order_id: string
  code: string
  target_grade: string
  target_quantity: number
  actual_quantity: number | null
  status: string
  stage_current: number
  yield_percent: number | null
  created_at: string
}

export interface DealProductionOverview {
  total_orders: number
  in_progress: number
  completed: number
  total_output_kg: number
  avg_yield: number | null
}

// ============================================
// SERVICE
// ============================================

export const dealProductionService = {

  /**
   * Lay danh sach lenh san xuat su dung nguyen lieu tu Deal nay
   * Chuoi lien ket: deal -> stock_in_orders -> stock_in_details -> batch_id
   *                 -> production_order_items.source_batch_id -> production_orders
   */
  async getProductionOrdersByDeal(dealId: string): Promise<DealProductionSummary[]> {
    // 1. Lay stock_in_ids thuoc deal
    const { data: stockIns } = await supabase
      .from('stock_in_orders')
      .select('id')
      .eq('deal_id', dealId)
      .eq('status', 'confirmed')

    const stockInIds = (stockIns || []).map((s: any) => s.id)
    if (stockInIds.length === 0) return []

    // 2. Lay batch_ids tu stock_in_details
    const { data: details } = await supabase
      .from('stock_in_details')
      .select('batch_id')
      .in('stock_in_id', stockInIds)
      .not('batch_id', 'is', null)

    const batchIds = [...new Set((details || []).map((d: any) => d.batch_id).filter(Boolean))]
    if (batchIds.length === 0) return []

    // 3. Lay production_order_items co source_batch_id trong batchIds
    const { data: poItems } = await supabase
      .from('production_order_items')
      .select('production_order_id')
      .in('source_batch_id', batchIds)

    const poIds = [...new Set((poItems || []).map((item: any) => item.production_order_id))]
    if (poIds.length === 0) return []

    // 4. Lay production_orders
    const { data: orders, error } = await supabase
      .from('production_orders')
      .select('id, code, target_grade, target_quantity, actual_quantity, status, stage_current, yield_percent, created_at')
      .in('id', poIds)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('getProductionOrdersByDeal error:', error)
      return []
    }

    return (orders || []).map((o: any) => ({
      production_order_id: o.id,
      code: o.code,
      target_grade: o.target_grade || '-',
      target_quantity: o.target_quantity || 0,
      actual_quantity: o.actual_quantity,
      status: o.status,
      stage_current: o.stage_current || 0,
      yield_percent: o.yield_percent,
      created_at: o.created_at,
    }))
  },

  /**
   * Tong hop thong ke san xuat cho 1 Deal
   */
  async getProductionOverview(dealId: string): Promise<DealProductionOverview> {
    const orders = await this.getProductionOrdersByDeal(dealId)

    const inProgress = orders.filter(o => o.status === 'in_progress').length
    const completed = orders.filter(o => o.status === 'completed').length
    const totalOutputKg = orders.reduce((sum, o) => sum + (o.actual_quantity || 0), 0)

    // Tinh trung binh yield tu cac lenh da hoan thanh
    const completedOrders = orders.filter(o => o.yield_percent != null)
    const avgYield = completedOrders.length > 0
      ? Math.round(
          completedOrders.reduce((sum, o) => sum + (o.yield_percent || 0), 0) / completedOrders.length * 100
        ) / 100
      : null

    return {
      total_orders: orders.length,
      in_progress: inProgress,
      completed,
      total_output_kg: totalOutputKg,
      avg_yield: avgYield,
    }
  },
}
