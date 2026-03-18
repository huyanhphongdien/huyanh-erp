// ============================================================================
// AUTO SETTLEMENT SERVICE — Tự động tạo Quyết toán từ Deal
// File: src/services/b2b/autoSettlementService.ts
// Phase: E5
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { Settlement, SettlementCreateData } from './settlementService'

// ============================================
// TYPES
// ============================================

export interface AutoSettlementResult {
  settlement: Settlement
  summary: {
    actual_weight_kg: number
    actual_drc: number
    price_per_kg: number
    final_value: number
    total_advanced: number
    balance_due: number
    stock_in_count: number
  }
}

// ============================================
// HELPER
// ============================================

const generateSettlementCode = (): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const day = now.getDate().toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 5).toUpperCase()
  return `QT-${year}${month}${day}-${random}`
}

// ============================================
// SERVICE
// ============================================

export const autoSettlementService = {
  /**
   * Tạo phiếu Quyết toán tự động từ Deal đã duyệt
   * - Lấy thông tin deal (actual_drc, actual_weight_kg, unit_price, final_price, partner_id)
   * - Lấy các phiếu nhập kho confirmed
   * - Tính final_value = actual_weight_kg × (actual_drc/100) × (final_price || unit_price)
   * - Lấy các phiếu tạm ứng đã chi (paid)
   * - Tính balance_due = final_value - total_advanced
   * - Tạo settlement draft + settlement items
   */
  async createAutoSettlement(dealId: string): Promise<AutoSettlementResult> {
    // ─── 1. Lấy thông tin Deal ───
    const { data: deal, error: dealError } = await supabase
      .from('b2b_deals')
      .select(`
        id, deal_number, partner_id, product_name, product_code,
        quantity_kg, unit_price, final_price, deal_type,
        actual_drc, actual_weight_kg, final_value,
        partner:b2b_partners!partner_id ( id, code, name )
      `)
      .eq('id', dealId)
      .single()

    if (dealError) throw new Error(`Không thể lấy thông tin Deal: ${dealError.message}`)
    if (!deal) throw new Error('Deal không tồn tại')

    const actualDrc = deal.actual_drc
    const actualWeightKg = deal.actual_weight_kg || 0

    if (!actualDrc) {
      throw new Error('Deal chưa có dữ liệu DRC thực tế. Vui lòng kiểm tra QC trước khi quyết toán.')
    }

    if (actualWeightKg <= 0) {
      throw new Error('Deal chưa có trọng lượng thực tế. Vui lòng kiểm tra phiếu nhập kho.')
    }

    // ─── 2. Lấy phiếu nhập kho confirmed cho Deal ───
    const { data: stockIns, error: stockInError } = await supabase
      .from('stock_in_orders')
      .select('id, code, total_weight, total_quantity, confirmed_at, created_at')
      .eq('deal_id', dealId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: true })

    if (stockInError) throw new Error(`Không thể lấy phiếu nhập kho: ${stockInError.message}`)

    const confirmedStockIns = stockIns || []
    const stockInIds = confirmedStockIns.map(si => si.id)

    // ─── 3. Tính giá trị thực tế ───
    const pricePerKg = deal.final_price || deal.unit_price || 0
    const finalValue = Math.round(actualWeightKg * (actualDrc / 100) * pricePerKg)

    // ─── 4. Lấy tạm ứng đã chi (paid) cho Deal ───
    const { data: advances, error: advError } = await supabase
      .from('b2b_advances')
      .select('id, amount, payment_date, advance_number, notes')
      .eq('deal_id', dealId)
      .eq('status', 'paid')
      .order('payment_date', { ascending: true })

    if (advError) throw new Error(`Không thể lấy tạm ứng: ${advError.message}`)

    const paidAdvances = advances || []
    const totalAdvanced = paidAdvances.reduce((sum, a) => sum + (a.amount || 0), 0)

    // ─── 5. Tính số dư phải trả ───
    const balanceDue = finalValue - totalAdvanced

    // ─── 6. Tạo settlement code ───
    const code = generateSettlementCode()

    // ─── 7. Xác định khoảng ngày cân ───
    let weighDateStart: string | null = null
    let weighDateEnd: string | null = null
    if (confirmedStockIns.length > 0) {
      weighDateStart = confirmedStockIns[0].confirmed_at || confirmedStockIns[0].created_at
      const last = confirmedStockIns[confirmedStockIns.length - 1]
      weighDateEnd = last.confirmed_at || last.created_at
    }

    // ─── 8. Lấy user hiện tại ───
    const { data: { user } } = await supabase.auth.getUser()
    const createdBy = user?.id || 'system'

    // ─── 9. Tạo settlement record ───
    const { data: settlement, error: createError } = await supabase
      .from('b2b_settlements')
      .insert({
        code,
        partner_id: deal.partner_id,
        deal_id: dealId,
        intake_ids: stockInIds,
        settlement_type: (deal.deal_type === 'sale' ? 'sale' : deal.deal_type === 'processing' ? 'processing' : 'purchase') as 'purchase' | 'sale' | 'processing',
        product_type: deal.product_name,
        weighed_kg: actualWeightKg,
        finished_kg: Math.round(actualWeightKg * (actualDrc / 100) * 100) / 100,
        drc_percent: actualDrc,
        approved_price: pricePerKg,
        gross_amount: finalValue,
        total_advance: totalAdvanced,
        total_paid_post: 0,
        remaining_amount: balanceDue,
        vehicle_plates: [],
        weigh_date_start: weighDateStart,
        weigh_date_end: weighDateEnd,
        stock_in_date: weighDateStart,
        status: 'draft',
        notes: `Tạo tự động từ Deal ${deal.deal_number}`,
        created_by: createdBy,
      })
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone, email
        )
      `)
      .single()

    if (createError) throw new Error(`Không thể tạo phiếu quyết toán: ${createError.message}`)

    // ─── 10. Tạo settlement items từ các phiếu nhập kho ───
    if (confirmedStockIns.length > 0) {
      const items = confirmedStockIns.map(si => ({
        settlement_id: settlement.id,
        item_type: 'stock_in',
        description: `Phiếu nhập kho ${si.code} — ${(si.total_weight || 0).toLocaleString()} kg`,
        quantity: si.total_quantity || null,
        unit_price: pricePerKg || null,
        amount: Math.round((si.total_weight || 0) * (actualDrc / 100) * pricePerKg),
        is_credit: false,
        notes: null,
      }))

      const { error: itemsError } = await supabase
        .from('b2b_settlement_items')
        .insert(items)

      if (itemsError) {
        console.error('Lỗi tạo settlement items:', itemsError)
      }
    }

    // ─── 11. Link tạm ứng vào settlement ───
    if (paidAdvances.length > 0) {
      const advanceLinks = paidAdvances.map((adv, idx) => ({
        settlement_id: settlement.id,
        advance_id: adv.id,
        advance_date: adv.payment_date,
        amount: adv.amount,
        notes: adv.notes || `Tạm ứng ${adv.advance_number}`,
        sort_order: idx,
      }))

      const { error: advLinkError } = await supabase
        .from('b2b_settlement_advances')
        .insert(advanceLinks)

      if (advLinkError) {
        console.error('Lỗi link tạm ứng:', advLinkError)
      }
    }

    // ─── 12. Trả kết quả ───
    const result: AutoSettlementResult = {
      settlement: {
        ...settlement,
        partner: Array.isArray(settlement.partner) ? settlement.partner[0] : settlement.partner,
      } as Settlement,
      summary: {
        actual_weight_kg: actualWeightKg,
        actual_drc: actualDrc,
        price_per_kg: pricePerKg,
        final_value: finalValue,
        total_advanced: totalAdvanced,
        balance_due: balanceDue,
        stock_in_count: confirmedStockIns.length,
      },
    }

    return result
  },

  /**
   * Kiểm tra xem Deal đã có settlement chưa (tránh tạo trùng)
   */
  async getExistingSettlement(dealId: string): Promise<Settlement | null> {
    const { data, error } = await supabase
      .from('b2b_settlements')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone, email
        )
      `)
      .eq('deal_id', dealId)
      .neq('status', 'cancelled')
      .maybeSingle()

    if (error) {
      console.error('Lỗi kiểm tra settlement:', error)
      return null
    }
    if (!data) return null

    return {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
    } as Settlement
  },
}

export default autoSettlementService
