// ============================================================================
// DEAL CONFIRM SERVICE — Xử lý xác nhận Deal từ Chat
// File: src/services/b2b/dealConfirmService.ts
//
// Luồng: BookingCard → ConfirmDealModal → confirmDealFromChat()
//   Step 1: Tạo Deal (b2b_deals)
//   Step 2: Tạo Advance nếu có (status='approved')
//           → gọi advanceService.markPaid() — nơi DUY NHẤT ghi ledger (tránh double entry)
//   Step 3: Update booking message metadata → confirmed
//   Step 4: Gửi DealCard message trong chat
//   Step 5: Update deal totals
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { ConfirmDealFormData, ConfirmDealResult, DealCardMetadata } from '../../types/b2b.types'
import { PRODUCT_TYPE_LABELS } from './chatMessageService'

// ============================================
// TYPES
// ============================================

export interface ConfirmDealContext {
  bookingMessageId: string
  partnerId: string
  roomId: string
  confirmedBy: string      // employee_id hoặc partner_user_id
  lotCode?: string         // Mã lô từ booking (optional)
  rubberRegion?: string    // Vùng mủ từ booking
  rubberRegionLat?: number
  rubberRegionLng?: number
  confirmerType: 'factory' | 'partner'
  bookingCode?: string     // Mã phiếu chốt gốc
}

// ============================================
// HELPERS
// ============================================

const generateDealNumber = (): string => {
  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `DL${year}${month}-${random}`
}

const generateAdvanceNumber = (): string => {
  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `TU${year}${month}-${random}`
}

// ============================================
// Facility map — 3 nhà máy Huy Anh (hardcode để tránh RLS lookup fail silent).
// ID khớp với public.facilities prod. Sync với portal src/constants/facilities.ts.
// ============================================
const FACILITY_MAP: Record<string, { code: string; name: string }> = {
  '755ae776-3be6-47b8-b1d0-d15b61789f24': { code: 'PD',  name: 'Phong Điền (HQ)' },
  '9bc1467c-0cbe-4982-abc1-192c61ef7dca': { code: 'TL',  name: 'Tân Lâm' },
  '67b45068-6e7c-4888-b8b3-49721bb9cb96': { code: 'LAO', name: 'Lào' },
}

function resolveFacilityInfoSync(
  facilityId: string | undefined,
): { code?: string; name?: string } {
  if (!facilityId) return {}
  return FACILITY_MAP[facilityId] || {}
}

export function calculateEstimatedValue(data: {
  quantity_tons: number
  price_per_kg: number
  price_unit: 'wet' | 'dry'
  drc_percent: number
}): number {
  const { quantity_tons, price_per_kg, price_unit, drc_percent } = data
  if (price_unit === 'wet') {
    return Math.round(quantity_tons * 1000 * price_per_kg)
  } else {
    return Math.round(quantity_tons * 1000 * (drc_percent / 100) * price_per_kg)
  }
}

// ============================================
// MAIN SERVICE
// ============================================

export const dealConfirmService = {

  /**
   * Xác nhận Deal từ Chat — flow chính
   */
  async confirmDealFromChat(
    formData: ConfirmDealFormData,
    context: ConfirmDealContext,
  ): Promise<ConfirmDealResult> {

    // === Pre-check: Booking chưa được confirm? ===
    const { data: existingMsg } = await supabase
      .from('b2b_chat_messages')
      .select('metadata')
      .eq('id', context.bookingMessageId)
      .single()

    if (existingMsg?.metadata?.booking?.status === 'confirmed') {
      throw new Error('Phiếu chốt này đã được xác nhận trước đó')
    }

    // Pre-check: Chưa có deal cho booking này?
    const { data: existingDeal } = await supabase
      .from('b2b_deals')
      .select('id, deal_number')
      .eq('booking_id', context.bookingMessageId)
      .maybeSingle()

    if (existingDeal) {
      throw new Error(`Deal ${existingDeal.deal_number} đã tồn tại cho phiếu chốt này`)
    }

    // === Step 1: Tạo Deal ===
    const dealNumber = generateDealNumber()
    const productName = PRODUCT_TYPE_LABELS[formData.product_type] || formData.product_type
    const estimatedValue = calculateEstimatedValue({
      quantity_tons: formData.agreed_quantity_tons,
      price_per_kg: formData.agreed_price,
      price_unit: formData.price_unit,
      drc_percent: formData.expected_drc,
    })

    // ★ Generate lot_code BEFORE insert
    let generatedLotCode: string | null = context.lotCode || null
    try {
      const { data: partnerForLot } = await supabase.from('b2b_partners').select('code').eq('id', context.partnerId).single()
      if (partnerForLot?.code) {
        const { partnerService: ps } = await import('./partnerService')
        generatedLotCode = await ps.generateNextLotCode(partnerForLot.code)
      }
    } catch (e) { console.error('[dealConfirm] lot_code gen error:', e) }

    const { data: deal, error: dealError } = await supabase
      .from('b2b_deals')
      .insert({
        deal_number: dealNumber,
        partner_id: context.partnerId,
        deal_type: formData.deal_type || 'purchase',
        product_name: productName,
        product_code: formData.product_type,
        quantity_kg: formData.agreed_quantity_tons * 1000,
        unit_price: formData.agreed_price,
        total_value_vnd: formData.deal_type === 'processing' ? 0 : estimatedValue,
        currency: 'VND',
        status: 'processing',
        expected_drc: formData.expected_drc,
        rubber_type: formData.product_type,
        price_unit: formData.price_unit,
        source_region: formData.pickup_location || null,
        pickup_location_name: formData.pickup_location || null,
        delivery_date: formData.delivery_date || null,
        lot_code: generatedLotCode,
        // Rubber region from booking (if available)
        rubber_region: context.rubberRegion || null,
        rubber_region_lat: context.rubberRegionLat || null,
        rubber_region_lng: context.rubberRegionLng || null,
        // Nhà máy đích (kế thừa từ booking, có thể override ở ConfirmDealModal)
        target_facility_id: formData.target_facility_id || null,
        // Notes chỉ chứa ghi chú thực sự
        notes: formData.deal_notes || null,
        booking_id: context.bookingMessageId,
      })
      .select('*')
      .single()

    if (dealError) throw new Error(`Không thể tạo Deal: ${dealError.message}`)

    const result: ConfirmDealResult = {
      deal: {
        id: deal.id,
        deal_number: deal.deal_number,
        status: deal.status,
        estimated_value: estimatedValue,
      },
    }

    let totalAdvanced = 0

    // === Step 2: Tạo Advance (nếu có) ===
    // Gia công: không cho tạm ứng
    if (formData.deal_type === 'processing' && formData.has_advance && formData.advance_amount && formData.advance_amount > 0) {
      console.warn('Gia công không hỗ trợ tạm ứng — bỏ qua tạo advance')
    } else if (formData.has_advance && formData.advance_amount && formData.advance_amount > 0) {
      try {
        const advanceNumber = generateAdvanceNumber()
        const purpose = [
          `Tạm ứng khi xác nhận deal ${dealNumber}`,
          formData.advance_receiver_name ? `Người nhận: ${formData.advance_receiver_name}` : '',
          formData.advance_receiver_phone ? `SĐT: ${formData.advance_receiver_phone}` : '',
          formData.advance_notes || '',
        ].filter(Boolean).join('. ')

        // Step 2a: Tạo advance ở trạng thái 'approved' (chưa chi)
        const { data: advance, error: advError } = await supabase
          .from('b2b_advances')
          .insert({
            advance_number: advanceNumber,
            deal_id: deal.id,
            partner_id: context.partnerId,
            amount: formData.advance_amount,
            currency: 'VND',
            amount_vnd: formData.advance_amount,
            payment_date: new Date().toISOString().split('T')[0],
            payment_method: formData.advance_payment_method || 'cash',
            purpose,
            status: 'approved',
            requested_by: context.confirmedBy,
            approved_by: context.confirmedBy,
            approved_at: new Date().toISOString(),
          })
          .select('*')
          .single()

        if (advError) {
          console.error('Advance creation failed (deal still created):', advError)
        } else {
          // Step 2b: Gọi markPaid — đây là nơi DUY NHẤT ghi ledger cho advance
          // (tránh double entry nếu ghi ledger trực tiếp ở đây + markPaid)
          try {
            const { advanceService } = await import('./advanceService')
            const paidAdvance = await advanceService.markPaid(advance.id, context.confirmedBy)
            totalAdvanced = paidAdvance.amount_vnd || paidAdvance.amount || 0
            result.advance = {
              id: paidAdvance.id,
              advance_number: paidAdvance.advance_number,
              amount: paidAdvance.amount,
            }
          } catch (err) {
            console.error('markPaid failed (advance created but ledger not written):', err)
          }
        }
      } catch (err) {
        console.error('Advance creation error:', err)
      }
    }

    // === Step 4: Update booking message → confirmed ===
    try {
      const { data: bookingMsg } = await supabase
        .from('b2b_chat_messages')
        .select('metadata')
        .eq('id', context.bookingMessageId)
        .single()

      if (bookingMsg) {
        await supabase
          .from('b2b_chat_messages')
          .update({
            metadata: {
              ...bookingMsg.metadata,
              booking: {
                ...bookingMsg.metadata?.booking,
                status: 'confirmed',
                deal_id: deal.id,
                deal_number: dealNumber,
              },
            },
          })
          .eq('id', context.bookingMessageId)
      }
    } catch (err) {
      console.error('Update booking message error:', err)
    }

    // === Step 5: Gửi DealCard message trong chat ===
    // Nếu admin override facility khác booking → formData có id nhưng
    // code/name có thể rỗng → lookup từ FACILITY_MAP (sync, không RLS).
    let facilityCode = formData.target_facility_code
    let facilityName = formData.target_facility_name
    if (formData.target_facility_id && (!facilityCode || !facilityName)) {
      const info = resolveFacilityInfoSync(formData.target_facility_id)
      facilityCode = facilityCode || info.code
      facilityName = facilityName || info.name
    }

    const dealMetadata: DealCardMetadata = {
      deal_id: deal.id,
      deal_number: dealNumber,
      status: 'processing',
      booking_code: context.bookingCode,
      product_type: formData.product_type,
      quantity_kg: formData.agreed_quantity_tons * 1000,
      expected_drc: formData.expected_drc,
      agreed_price: formData.agreed_price,
      price_unit: formData.price_unit,
      estimated_value: estimatedValue,
      pickup_location: formData.pickup_location,
      target_facility_id: formData.target_facility_id,
      target_facility_code: facilityCode,
      target_facility_name: facilityName,
      total_advanced: totalAdvanced,
      balance_due: estimatedValue - totalAdvanced,
    }

    // ⚠️ supabase-js KHÔNG throw khi RLS/constraint reject — mà trả { data, error }.
    // Phải destructure + check error, không được wrap thuần try/catch (sẽ bị nuốt lỗi).
    const { error: dealMsgError } = await supabase
      .from('b2b_chat_messages')
      .insert({
        room_id: context.roomId,
        sender_type: context.confirmerType,
        sender_id: context.confirmedBy,
        message_type: 'deal',
        content: `🤝 Deal ${dealNumber} đã được tạo`,
        metadata: { deal: dealMetadata },
        attachments: [],
      })

    if (dealMsgError) {
      console.error('[dealConfirm] INSERT DealCard message failed:', dealMsgError)
      throw new Error(
        `Deal ${dealNumber} đã tạo nhưng KHÔNG gửi được DealCard vào chat: ${dealMsgError.message}`,
      )
    }

    // Update room last_message_at
    await supabase
      .from('b2b_chat_rooms')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', context.roomId)

    // === Step 6: Update deal totals ===
    if (totalAdvanced > 0) {
      try {
        await supabase
          .from('b2b_deals')
          .update({
            total_advanced: totalAdvanced,
            balance_due: estimatedValue - totalAdvanced,
            updated_at: new Date().toISOString(),
          })
          .eq('id', deal.id)
      } catch (err) {
        console.error('Update deal totals error:', err)
      }
    }

    return result
  },
}

export default dealConfirmService
