// ============================================================================
// Intake Production Service — Flow 🅱️ orchestrator
// File: src/services/b2b/intakeProductionService.ts
// Phase 29 of B2B Intake v4
// ============================================================================
// Flow 🅱️ DRC-after-production:
// - Đại lý (tier ≥ silver) giao mủ → QC sample → BGĐ duyệt → SX → QC actual → quyết toán
// - Khác outright/walkin ở chỗ: KHÔNG chi tiền tại cân, chờ sản xuất xong
// - Có tạm ứng tier-based
// - Status flow: processing → accepted → settled
// ============================================================================

import { supabase } from '../../lib/supabase'
import { ADVANCE_MAX_PERCENT_BY_TIER } from './advanceService'

export interface ProductionIntakeInput {
  partner_id: string                     // phải có tier ≥ silver
  qc_user_id: string                     // QC mẫu (bắt buộc)
  product_name: string
  rubber_type: string
  quantity_kg: number                    // net đã cân
  sample_drc: number                     // DRC mẫu QC (chưa phải actual)
  expected_price: number                 // đơn giá thương lượng VNĐ/kg

  // Context
  facility_id: string
  warehouse_id: string
  vehicle_plate: string
  driver_name?: string

  // Production options
  production_mode?: 'pooled' | 'isolated'  // default 'pooled'
  production_sla_days?: number             // default 7

  // Advance optional
  request_advance?: boolean
  advance_amount_vnd?: number

  notes?: string
  created_by?: string
}

export interface ProductionIntakeResult {
  deal_id: string
  deal_number: string
  ticket_id: string
  ticket_code: string
  advance_id?: string
  advance_max_allowed_vnd: number
  estimated_gross_vnd: number
  success: boolean
  error?: string
}

/**
 * Execute intake flow B — bước đầu (cân + nhập kho + optional advance).
 * KHÔNG tạo settlement ở đây — phải đợi sản xuất xong mới trigger
 * productionOutputHookService.onProductionFinish(deal_id, finished_kg).
 */
export async function executeProductionIntake(
  input: ProductionIntakeInput
): Promise<ProductionIntakeResult> {
  // Validate
  if (input.quantity_kg <= 0) throw new Error('quantity_kg phải > 0')
  if (input.sample_drc <= 0 || input.sample_drc > 100) {
    throw new Error('sample_drc phải trong 0-100%')
  }
  if (input.expected_price <= 0) throw new Error('expected_price phải > 0')
  if (!input.qc_user_id) throw new Error('qc_user_id bắt buộc')

  // Lookup partner tier
  const { data: partner } = await supabase
    .from('b2b_partners')
    .select('tier')
    .eq('id', input.partner_id)
    .maybeSingle()
  const tier = (partner as any)?.tier || 'new'
  if (!['silver', 'gold', 'diamond'].includes(tier)) {
    console.warn(
      `Partner tier=${tier} < silver — flow drc_after thường yêu cầu tier ≥ silver. ` +
      `Continue anyway (roadmap không strict).`
    )
  }

  const mode = input.production_mode || 'pooled'
  const slaDays = input.production_sla_days || 7

  // Estimated gross (dùng sample_drc, actual sẽ khác)
  const estimatedGross = Math.round(input.quantity_kg * (input.sample_drc / 100) * input.expected_price)

  // Advance max theo tier
  const maxAdvancePct = ADVANCE_MAX_PERCENT_BY_TIER[tier] ?? ADVANCE_MAX_PERCENT_BY_TIER.new
  const maxAdvance = Math.round(estimatedGross * maxAdvancePct)

  // Step 1: Create deal (processing)
  const dealNumber = `DL-PCB-${Date.now().toString(36).toUpperCase()}`
  const { data: deal, error: dealErr } = await supabase
    .from('b2b_deals')
    .insert({
      deal_number: dealNumber,
      partner_id: input.partner_id,
      deal_type: 'purchase',
      status: 'processing',
      purchase_type: 'drc_after_production',
      qc_user_id: input.qc_user_id,
      product_name: input.product_name,
      rubber_type: input.rubber_type,
      quantity_kg: input.quantity_kg,
      unit_price: input.expected_price,
      expected_drc: input.sample_drc,
      sample_drc: input.sample_drc,
      // actual_drc: NULL → sẽ set khi production xong
      target_facility_id: input.facility_id,
      warehouse_id: input.warehouse_id,
      total_value_vnd: estimatedGross,
      final_value: estimatedGross,
      currency: 'VND',
      price_unit: 'dry',
      production_mode: mode,
      production_sla_days: slaDays,
      notes: input.notes,
    })
    .select('id, deal_number')
    .single()

  if (dealErr) {
    return {
      deal_id: '', deal_number: '',
      ticket_id: '', ticket_code: '',
      advance_max_allowed_vnd: maxAdvance,
      estimated_gross_vnd: estimatedGross,
      success: false, error: `Deal failed: ${dealErr.message}`,
    }
  }

  const dealId = (deal as any).id
  const dealNum = (deal as any).deal_number

  // Step 2: Weighbridge ticket
  const ticketCode = `WB-PCB-${Date.now().toString(36).toUpperCase()}`
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
    await supabase.from('b2b_deals').delete().eq('id', dealId)
    return {
      deal_id: dealId, deal_number: dealNum,
      ticket_id: '', ticket_code: '',
      advance_max_allowed_vnd: maxAdvance, estimated_gross_vnd: estimatedGross,
      success: false, error: `Ticket failed: ${tkErr.message}`,
    }
  }

  // Step 3: Status processing → accepted (cần BGĐ duyệt, nhưng ở đây orchestrator
  // có thể auto-accept nếu trust QC user. Thực tế sẽ có UI action riêng.)
  // Để flow lifecycle chính xác, giữ status='processing' ở đây.
  // Caller (BGĐ UI) sẽ gọi UPDATE status='accepted' riêng.

  let advanceId: string | undefined
  if (input.request_advance && input.advance_amount_vnd && input.advance_amount_vnd > 0) {
    // Chỉ tạo advance nếu amount ≤ max (tier guard trong advanceService.createAdvance)
    // Nhưng advance yêu cầu deal.status=accepted per Sprint J — bỏ qua ở đây,
    // caller phải create sau khi accepted.
    console.log('Advance request noted, caller phải tạo sau khi deal accepted')
  }

  return {
    deal_id: dealId,
    deal_number: dealNum,
    ticket_id: (ticket as any).id,
    ticket_code: (ticket as any).code,
    advance_id: advanceId,
    advance_max_allowed_vnd: maxAdvance,
    estimated_gross_vnd: estimatedGross,
    success: true,
  }
}

// ============================================================================
// Production Output Hook — gọi khi sản xuất xong ra TP
// ============================================================================

export interface ProductionFinishInput {
  deal_id: string
  finished_product_kg: number           // KL TP sau SX
  // actual_drc tự compute: finished / input × 100
  // (bỏ qua nếu muốn override, vd pool mode tính theo pool average)
  actual_drc_override?: number
}

export interface ProductionFinishResult {
  deal_id: string
  actual_drc: number
  final_gross_vnd: number
  dispute_auto_raised: boolean
  success: boolean
  error?: string
}

/**
 * Gọi khi production xong — compute actual_drc + update deal + trigger
 * auto_raise_drc_dispute (P16) sẽ fire nếu variance > 3%.
 */
export async function onProductionFinish(
  input: ProductionFinishInput
): Promise<ProductionFinishResult> {
  if (input.finished_product_kg <= 0) throw new Error('finished_product_kg phải > 0')

  // Load deal
  const { data: deal } = await supabase
    .from('b2b_deals')
    .select('id, quantity_kg, sample_drc, unit_price, status, purchase_type')
    .eq('id', input.deal_id)
    .maybeSingle()

  if (!deal) throw new Error(`Deal ${input.deal_id} không tồn tại`)

  const d = deal as any
  if (d.purchase_type !== 'drc_after_production') {
    throw new Error(`Hook chỉ gọi cho drc_after_production, deal này: ${d.purchase_type}`)
  }
  if (d.status !== 'accepted') {
    throw new Error(`Deal phải ở status=accepted mới gọi onFinish (hiện tại: ${d.status})`)
  }

  // Compute actual_drc
  const actualDrc = input.actual_drc_override ?? (input.finished_product_kg / d.quantity_kg * 100)

  // Validate DRC range
  if (actualDrc < 0 || actualDrc > 100) {
    throw new Error(`actual_drc=${actualDrc.toFixed(2)}% ngoài 0-100%`)
  }

  // Compute final gross
  const finalGross = Math.round(d.quantity_kg * (actualDrc / 100) * d.unit_price)

  // Update deal — trigger P16 (auto_raise_drc_dispute) sẽ fire
  const { error } = await supabase
    .from('b2b_deals')
    .update({
      actual_drc: Number(actualDrc.toFixed(2)),
      finished_product_kg: input.finished_product_kg,
      final_value: finalGross,
    })
    .eq('id', input.deal_id)

  if (error) {
    return {
      deal_id: input.deal_id,
      actual_drc: actualDrc,
      final_gross_vnd: finalGross,
      dispute_auto_raised: false,
      success: false,
      error: `Update failed: ${error.message}`,
    }
  }

  // Check dispute auto-raised
  const { data: disputes } = await supabase
    .from('b2b_drc_disputes')
    .select('id')
    .eq('deal_id', input.deal_id)
    .eq('status', 'open')
  const disputeRaised = (disputes || []).length > 0

  return {
    deal_id: input.deal_id,
    actual_drc: Number(actualDrc.toFixed(2)),
    final_gross_vnd: finalGross,
    dispute_auto_raised: disputeRaised,
    success: true,
  }
}

export default { executeProductionIntake, onProductionFinish }
