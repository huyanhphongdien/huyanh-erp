// ============================================================================
// DEAL CONFIRM SERVICE — Xử lý xác nhận Deal từ Chat
// File: src/services/b2b/dealConfirmService.ts
//
// Luồng: BookingCard → ConfirmDealModal → confirmDealFromChat()
//   Step 1: Tạo Deal (b2b_deals)
//   Step 2: Tạo Advance nếu có (b2b_advances)
//   Step 3: Ghi Ledger nếu có advance (b2b_partner_ledger)
//   Step 4: Update booking message metadata → confirmed
//   Step 5: Gửi DealCard message trong chat
//   Step 6: Update deal totals
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

    const { data: deal, error: dealError } = await supabase
      .from('b2b_deals')
      .insert({
        deal_number: dealNumber,
        partner_id: context.partnerId,
        deal_type: 'purchase',
        product_name: productName,
        product_code: formData.product_type,
        quantity_kg: formData.agreed_quantity_tons * 1000,
        unit_price: formData.agreed_price,
        total_value_vnd: estimatedValue,
        currency: 'VND',
        status: 'processing',
        notes: [
          `DRC dự kiến: ${formData.expected_drc}%`,
          `Loại giá: ${formData.price_unit === 'wet' ? 'Giá ướt' : 'Giá khô'}`,
          formData.pickup_location ? `Địa điểm: ${formData.pickup_location}` : '',
          formData.delivery_date ? `Giao dự kiến: ${formData.delivery_date}` : '',
          formData.deal_notes || '',
        ].filter(Boolean).join('. '),
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
    if (formData.has_advance && formData.advance_amount && formData.advance_amount > 0) {
      try {
        const advanceNumber = generateAdvanceNumber()
        const purpose = [
          `Tạm ứng khi xác nhận deal ${dealNumber}`,
          formData.advance_receiver_name ? `Người nhận: ${formData.advance_receiver_name}` : '',
          formData.advance_receiver_phone ? `SĐT: ${formData.advance_receiver_phone}` : '',
          formData.advance_notes || '',
        ].filter(Boolean).join('. ')

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
            status: 'paid',
            requested_by: context.confirmedBy,
            paid_by: context.confirmedBy,
            paid_at: new Date().toISOString(),
          })
          .select('*')
          .single()

        if (advError) {
          console.error('Advance creation failed (deal still created):', advError)
        } else {
          totalAdvanced = formData.advance_amount
          result.advance = {
            id: advance.id,
            advance_number: advance.advance_number,
            amount: advance.amount,
          }

          // === Step 3: Ghi Ledger ===
          try {
            const now = new Date()
            const { data: ledgerEntry, error: ledgerError } = await supabase
              .from('b2b_partner_ledger')
              .insert({
                partner_id: context.partnerId,
                entry_type: 'advance',
                debit: 0,
                credit: formData.advance_amount,
                advance_id: advance.id,
                reference_code: advanceNumber,
                description: `Tạm ứng khi xác nhận deal ${dealNumber}`,
                entry_date: now.toISOString().split('T')[0],
                period_month: now.getMonth() + 1,
                period_year: now.getFullYear(),
                created_by: context.confirmedBy,
              })
              .select('id, credit')
              .single()

            if (ledgerError) {
              console.error('Ledger entry failed:', ledgerError)
            } else {
              result.ledgerEntry = {
                id: ledgerEntry.id,
                credit: ledgerEntry.credit,
              }
            }
          } catch (err) {
            console.error('Ledger entry error:', err)
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
      total_advanced: totalAdvanced,
      balance_due: estimatedValue - totalAdvanced,
    }

    try {
      await supabase
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

      // Update room last_message_at
      await supabase
        .from('b2b_chat_rooms')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', context.roomId)
    } catch (err) {
      console.error('Send deal message error:', err)
    }

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
