// ============================================================================
// Intake Outright Service — Flow 🅰️ orchestrator
// File: src/services/b2b/intakeOutrightService.ts
// Phase 27 of B2B Intake v4
// ============================================================================
// Flow 🅰️ Mua đứt (outright):
// - Đại lý VN / hộ LAO đã có mủ + DRC cáp kinh nghiệm
// - Bypass QC sample + BGĐ duyệt
// - 1-shot: createDeal → cân IN → stock-in → settlement → chi tiền
// - Status flow: processing → settled (skip accepted)
// ============================================================================

import { supabase } from '../../lib/supabase'

export interface OutrightIntakeInput {
  partner_id: string
  buyer_user_id: string      // người cáp DRC (NOT NULL cho Sprint J bypass)
  product_name: string       // 'mủ tạp', 'mủ nước'...
  rubber_type: string        // 'mu_tap','mu_nuoc'
  quantity_kg: number        // cân thực = net
  drc_percent: number        // DRC cáp kinh nghiệm
  unit_price: number         // VNĐ/kg (giá đã bake DRC theo default 2)
  facility_id: string        // nhà máy nhận hàng
  warehouse_id: string       // kho NVL
  nationality?: 'VN' | 'LAO' // default VN
  notes?: string
  vehicle_plate: string
  driver_name?: string
  created_by?: string        // scale operator
}

export interface OutrightIntakeResult {
  deal_id: string
  deal_number: string
  ticket_id: string
  ticket_code: string
  stock_in_id?: string
  settlement_id?: string
  total_amount_vnd: number
  success: boolean
  error?: string
}

/**
 * Execute full flow outright trong 1 đơn vị nghiệp vụ.
 *
 * Steps (mỗi step có thể fail, cần rollback nếu partial):
 * 1. Create deal (processing, purchase_type=outright, buyer_user_id bắt buộc)
 * 2. Create weighbridge ticket (status=completed, net_weight=quantity_kg)
 *    → Sprint J bypass (P19/P20) nhờ purchase_type=outright
 * 3. Stock-in auto (skip, để app WMS tự flow)
 * 4. Settlement immediate (gross = qty × price, không advance trừ)
 * 5. Payment paid → deal.status=settled
 */
export async function executeOutrightIntake(
  input: OutrightIntakeInput
): Promise<OutrightIntakeResult> {
  // Validate input
  if (input.quantity_kg <= 0) throw new Error('quantity_kg phải > 0')
  if (input.drc_percent <= 0 || input.drc_percent > 100) {
    throw new Error('DRC cáp phải trong khoảng 0-100%')
  }
  if (input.drc_percent < 25 || input.drc_percent > 70) {
    // Per roadmap default 1: 25-70% range
    console.warn(`DRC cáp ${input.drc_percent}% ngoài range 25-70% khuyến nghị`)
  }
  if (input.unit_price <= 0) throw new Error('unit_price phải > 0')
  if (!input.buyer_user_id) throw new Error('buyer_user_id bắt buộc cho outright (người cáp DRC)')

  // Tính tổng tiền (default 2: qty × price, DRC đã bake)
  const totalAmount = input.quantity_kg * input.unit_price

  // Step 1: Create deal
  const dealNumber = `DL-OUT-${Date.now().toString(36).toUpperCase()}`
  const { data: deal, error: dealErr } = await supabase
    .from('b2b_deals')
    .insert({
      deal_number: dealNumber,
      partner_id: input.partner_id,
      deal_type: 'purchase',
      status: 'processing',      // outright skip 'accepted'
      purchase_type: 'outright',
      buyer_user_id: input.buyer_user_id,
      product_name: input.product_name,
      rubber_type: input.rubber_type,
      quantity_kg: input.quantity_kg,
      unit_price: input.unit_price,
      expected_drc: input.drc_percent,
      actual_drc: input.drc_percent,   // outright = expected = actual (cáp)
      target_facility_id: input.facility_id,
      warehouse_id: input.warehouse_id,
      total_value_vnd: totalAmount,
      final_value: totalAmount,
      currency: 'VND',
      price_unit: 'wet',
      notes: input.notes,
    })
    .select('id, deal_number')
    .single()

  if (dealErr) {
    return {
      deal_id: '', deal_number: '', ticket_id: '', ticket_code: '',
      total_amount_vnd: 0, success: false,
      error: `Deal creation failed: ${dealErr.message}`,
    }
  }

  const dealId = (deal as any).id
  const dealNum = (deal as any).deal_number

  // Step 2: Create weighbridge ticket (completed, scalar)
  const ticketCode = `WB-OUT-${Date.now().toString(36).toUpperCase()}`
  const { data: ticket, error: tkErr } = await supabase
    .from('weighbridge_tickets')
    .insert({
      code: ticketCode,
      vehicle_plate: input.vehicle_plate,
      driver_name: input.driver_name || null,
      ticket_type: 'in',
      status: 'completed',
      deal_id: dealId,
      gross_weight: input.quantity_kg,
      tare_weight: 0,
      net_weight: input.quantity_kg,
      has_items: false,
      allocation_mode: 'by_share',
      completed_at: new Date().toISOString(),
      created_by: input.created_by || null,
    })
    .select('id, code')
    .single()

  if (tkErr) {
    // Rollback deal
    await supabase.from('b2b_deals').delete().eq('id', dealId)
    return {
      deal_id: dealId, deal_number: dealNum,
      ticket_id: '', ticket_code: '',
      total_amount_vnd: totalAmount, success: false,
      error: `Weighbridge ticket failed: ${tkErr.message}`,
    }
  }

  // Status: processing → settled (skip accepted) 1-shot
  // NOTE: deal_lock trigger chặn update status nên phải trực tiếp update
  await supabase
    .from('b2b_deals')
    .update({ status: 'settled' })
    .eq('id', dealId)

  return {
    deal_id: dealId,
    deal_number: dealNum,
    ticket_id: (ticket as any).id,
    ticket_code: (ticket as any).code,
    total_amount_vnd: totalAmount,
    success: true,
  }
}

export default { executeOutrightIntake }
