// ============================================================================
// Intake Walk-in Service — Flow 🅲 orchestrator
// File: src/services/b2b/intakeWalkinService.ts
// Phase 28 of B2B Intake v4
// ============================================================================
// Flow 🅲 Farmer walk-in:
// - Hộ nông dân VN không đăng ký trước, đến cân tại nhà máy
// - QC đo DRC tại cân, tra giá ngày từ daily_price_list
// - Chi tiền mặt ngay, bypass QC sample + BGĐ (như outright)
// - Status flow: processing → settled
// ============================================================================

import { supabase } from '../../lib/supabase'
import { quickCreateHousehold, type HouseholdInput } from './partnerQuickCreateService'
import { getCurrentPrice } from './dailyPriceListService'

export interface WalkinIntakeInput {
  // Household — dùng existing partner_id hoặc household info (quick-create)
  partner_id?: string                    // nếu đã biết
  household?: HouseholdInput             // nếu tạo mới

  // QC tại cân
  qc_user_id: string                     // người đo DRC (bắt buộc)
  drc_measured: number                   // DRC đo thực tế tại cân

  // Weighing
  product_name: string                   // 'mủ tạp', 'mủ nước'...
  rubber_type: string
  net_weight_kg: number                  // cân thực
  vehicle_plate: string
  driver_name?: string

  // Pricing — tự lookup từ daily_price_list theo rubber_type
  // Nếu override: dùng unit_price_override (thương lượng ngoại lệ)
  unit_price_override?: number

  // Context
  facility_id: string
  warehouse_id: string
  created_by?: string
  notes?: string
}

export interface WalkinIntakeResult {
  deal_id: string
  deal_number: string
  partner_id: string
  partner_code: string
  partner_is_new: boolean
  ticket_id: string
  ticket_code: string
  unit_price_vnd: number
  total_amount_vnd: number
  success: boolean
  error?: string
}

/**
 * Execute full walk-in intake.
 *
 * Steps:
 * 1. Resolve partner (reuse existing hoặc quick-create household)
 * 2. Validate QC user + DRC
 * 3. Lookup daily price (hoặc dùng override)
 * 4. Create deal (purchase_type=farmer_walkin, status=processing)
 * 5. Create weighbridge ticket (status=completed)
 * 6. Update deal.status=settled (1-shot)
 */
export async function executeWalkinIntake(
  input: WalkinIntakeInput
): Promise<WalkinIntakeResult> {
  // Validate
  if (!input.qc_user_id) {
    throw new Error('qc_user_id bắt buộc cho walk-in (người đo DRC tại cân)')
  }
  if (input.drc_measured <= 0 || input.drc_measured > 100) {
    throw new Error('DRC measured phải trong khoảng 0-100%')
  }
  if (input.net_weight_kg <= 0) {
    throw new Error('net_weight_kg phải > 0')
  }

  // Step 1: Resolve partner
  let partnerId: string
  let partnerCode: string
  let partnerIsNew = false

  if (input.partner_id) {
    const { data: p } = await supabase
      .from('b2b_partners')
      .select('id, code')
      .eq('id', input.partner_id)
      .maybeSingle()
    if (!p) throw new Error(`Partner ${input.partner_id} không tồn tại`)
    partnerId = (p as any).id
    partnerCode = (p as any).code
  } else if (input.household) {
    const hh = await quickCreateHousehold(input.household)
    partnerId = hh.id
    partnerCode = hh.code
    partnerIsNew = hh.is_new
  } else {
    throw new Error('Cần partner_id hoặc household info')
  }

  // Step 2: Lookup unit_price
  let unitPrice: number
  if (input.unit_price_override !== undefined && input.unit_price_override !== null) {
    unitPrice = input.unit_price_override
  } else {
    const priceRow = await getCurrentPrice(input.rubber_type)
    if (!priceRow) {
      throw new Error(
        `Chưa có giá ngày cho ${input.rubber_type}. ` +
        `Admin cần nhập daily_price_list trước, hoặc truyền unit_price_override.`
      )
    }
    unitPrice = priceRow.base_price_per_kg
  }

  // Flow walkin: total = qty × drc_measured/100 × price (per default 2 cho walkin/flow B)
  // BUT default 2 chỉ rõ cho flow 1 outright. Walkin default theo roadmap § 3.4 E5:
  // "Flow 3: weight × (drc_qc / 100) × price_daily"
  const totalAmount = Math.round(input.net_weight_kg * (input.drc_measured / 100) * unitPrice)

  // Step 3: Create deal
  const dealNumber = `DL-WI-${Date.now().toString(36).toUpperCase()}`
  const { data: deal, error: dealErr } = await supabase
    .from('b2b_deals')
    .insert({
      deal_number: dealNumber,
      partner_id: partnerId,
      deal_type: 'purchase',
      status: 'processing',
      purchase_type: 'farmer_walkin',
      qc_user_id: input.qc_user_id,
      buyer_user_id: input.qc_user_id,   // walk-in: QC cũng là buyer record-keeper
      product_name: input.product_name,
      rubber_type: input.rubber_type,
      quantity_kg: input.net_weight_kg,
      unit_price: unitPrice,
      expected_drc: input.drc_measured,
      actual_drc: input.drc_measured,
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
      deal_id: '', deal_number: '',
      partner_id: partnerId, partner_code: partnerCode, partner_is_new: partnerIsNew,
      ticket_id: '', ticket_code: '',
      unit_price_vnd: unitPrice, total_amount_vnd: totalAmount,
      success: false, error: `Deal creation failed: ${dealErr.message}`,
    }
  }

  const dealId = (deal as any).id
  const dealNum = (deal as any).deal_number

  // Step 4: Create weighbridge ticket
  const ticketCode = `WB-WI-${Date.now().toString(36).toUpperCase()}`
  const { data: ticket, error: tkErr } = await supabase
    .from('weighbridge_tickets')
    .insert({
      code: ticketCode,
      vehicle_plate: input.vehicle_plate,
      driver_name: input.driver_name || null,
      ticket_type: 'in',
      status: 'completed',
      deal_id: dealId,
      gross_weight: input.net_weight_kg,
      tare_weight: 0,
      net_weight: input.net_weight_kg,
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
      partner_id: partnerId, partner_code: partnerCode, partner_is_new: partnerIsNew,
      ticket_id: '', ticket_code: '',
      unit_price_vnd: unitPrice, total_amount_vnd: totalAmount,
      success: false, error: `Ticket failed: ${tkErr.message}`,
    }
  }

  // Step 5: Update status → settled
  await supabase.from('b2b_deals').update({ status: 'settled' }).eq('id', dealId)

  return {
    deal_id: dealId,
    deal_number: dealNum,
    partner_id: partnerId,
    partner_code: partnerCode,
    partner_is_new: partnerIsNew,
    ticket_id: (ticket as any).id,
    ticket_code: (ticket as any).code,
    unit_price_vnd: unitPrice,
    total_amount_vnd: totalAmount,
    success: true,
  }
}

export default { executeWalkinIntake }
