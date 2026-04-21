// ============================================================================
// DEAL CHAT ACTIONS SERVICE — Xử lý actions trên DealCard trong Chat
// File: src/services/b2b/dealChatActionsService.ts
//
// 2 actions chính:
//   1. addAdvanceFromChat() — Ứng thêm tiền cho Deal
//   2. recordDeliveryFromChat() — Ghi nhận giao hàng cho Deal
//
// Mỗi action: tạo record → ghi ledger (nếu cần) → update deal → gửi message
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { AddAdvanceFormData } from '../../components/b2b/AddAdvanceModal'
import type { RecordDeliveryFormData } from '../../components/b2b/RecordDeliveryModal'
import type { DealCardMetadata } from '../../types/b2b.types'

// ============================================
// TYPES
// ============================================

export interface DealChatActionContext {
  dealId: string
  dealNumber: string
  partnerId: string
  roomId: string
  actionBy: string          // employee_id hoặc partner_user_id
  actionByType: 'factory' | 'partner'
}

export interface AddAdvanceResult {
  advance_id: string
  advance_number: string
  amount: number
  new_total_advanced: number
  new_balance_due: number
}

export interface RecordDeliveryResult {
  delivery_id: string
  quantity_kg: number
  delivery_date: string
}

// ============================================
// HELPERS
// ============================================

const generateAdvanceNumber = (): string => {
  const now = new Date()
  const year = now.getFullYear().toString().slice(-2)
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `TU${year}${month}-${random}`
}

const formatCurrency = (value: number): string => {
  return value.toLocaleString('vi-VN')
}

// ============================================
// SHARED HELPER — Patch tất cả DealCard message metadata của 1 deal
// Dùng bởi: addAdvance, notifyStockIn, notifyQc, notifySettlement, cancelDeal...
//
// Thay đổi UPDATE này được Supabase realtime broadcast cho mọi client đang
// subscribe room → DealCard UI auto-update mà không cần F5.
// Yêu cầu: b2b.chat_messages có REPLICA IDENTITY FULL (migration đã chạy).
// ============================================

export async function patchDealCardMetadata(
  dealId: string,
  patch: Partial<DealCardMetadata>,
): Promise<void> {
  try {
    // JSONB contains filter — chỉ lấy đúng các DealCard message của deal này
    // thay vì quét toàn bộ message_type='deal'.
    const { data: dealMessages } = await supabase
      .from('b2b_chat_messages')
      .select('id, metadata')
      .eq('message_type', 'deal')
      .contains('metadata', { deal: { deal_id: dealId } })

    for (const msg of (dealMessages || [])) {
      const meta = msg.metadata as any
      if (meta?.deal?.deal_id !== dealId) continue  // extra guard
      await supabase
        .from('b2b_chat_messages')
        .update({
          metadata: {
            ...msg.metadata,
            deal: { ...meta.deal, ...patch },
          },
        })
        .eq('id', msg.id)
    }
  } catch (err) {
    console.error('[patchDealCardMetadata] failed:', err)
  }
}

// ============================================
// SERVICE
// ============================================

export const dealChatActionsService = {

  // ================================================================
  // 1. ỨNG THÊM TIỀN (Add Advance)
  // ================================================================
  // Step 1: Lấy deal hiện tại → check status
  // Step 2: Tạo advance record (b2b_advances)
  // Step 3: Ghi ledger (b2b_partner_ledger)
  // Step 4: Update deal totals (total_advanced, balance_due)
  // Step 5: Update DealCard message metadata
  // Step 6: Gửi thông báo advance trong chat
  // ================================================================

  async addAdvanceFromChat(
    formData: AddAdvanceFormData,
    context: DealChatActionContext,
  ): Promise<AddAdvanceResult> {

    // Step 1: Lấy deal hiện tại
    const { data: deal, error: dealError } = await supabase
      .from('b2b_deals')
      .select('id, deal_number, status, total_value_vnd, total_advanced, balance_due')
      .eq('id', context.dealId)
      .single()

    if (dealError || !deal) throw new Error('Không tìm thấy Deal')
    if (deal.status === 'settled' || deal.status === 'cancelled') {
      throw new Error('Deal đã quyết toán hoặc đã hủy, không thể ứng thêm')
    }

    // Step 2: Tạo advance
    const advanceNumber = generateAdvanceNumber()
    const purpose = [
      `Ứng thêm cho deal ${context.dealNumber}`,
      formData.receiver_name ? `Người nhận: ${formData.receiver_name}` : '',
      formData.receiver_phone ? `SĐT: ${formData.receiver_phone}` : '',
      formData.notes || '',
    ].filter(Boolean).join('. ')

    const { data: advance, error: advError } = await supabase
      .from('b2b_advances')
      .insert({
        advance_number: advanceNumber,
        deal_id: context.dealId,
        partner_id: context.partnerId,
        amount: formData.amount,
        currency: 'VND',
        amount_vnd: formData.amount,
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: formData.payment_method,
        purpose,
        status: 'paid',
        requested_by: context.actionBy,
        paid_by: context.actionBy,
        paid_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (advError) throw new Error(`Không thể tạo phiếu tạm ứng: ${advError.message}`)

    // Step 3: Ghi ledger — Gap #8 idempotent qua ledgerService
    try {
      const { ledgerService } = await import('./ledgerService')
      await ledgerService.createManualEntry({
        partner_id: context.partnerId,
        entry_type: 'advance',
        debit: 0,
        credit: formData.amount,
        reference_code: advanceNumber,
        description: `Ứng thêm cho deal ${context.dealNumber}`,
        created_by: context.actionBy,
      })
    } catch (err) {
      console.error('Ledger entry for advance failed:', err)
    }

    // Step 4: Update deal totals
    const newTotalAdvanced = (deal.total_advanced || 0) + formData.amount
    const estimatedValue = deal.total_value_vnd || 0
    const newBalanceDue = estimatedValue - newTotalAdvanced

    await supabase
      .from('b2b_deals')
      .update({
        total_advanced: newTotalAdvanced,
        balance_due: newBalanceDue,
        updated_at: new Date().toISOString(),
      })
      .eq('id', context.dealId)

    // Step 5: Update DealCard message metadata (tìm message deal gần nhất)
    try {
      const { data: dealMessages } = await supabase
        .from('b2b_chat_messages')
        .select('id, metadata')
        .eq('room_id', context.roomId)
        .eq('message_type', 'deal')
        .order('sent_at', { ascending: false })

      // Update tất cả DealCard messages cho deal này
      for (const msg of (dealMessages || [])) {
        const meta = msg.metadata as any
        if (meta?.deal?.deal_id === context.dealId) {
          await supabase
            .from('b2b_chat_messages')
            .update({
              metadata: {
                ...msg.metadata,
                deal: {
                  ...meta.deal,
                  total_advanced: newTotalAdvanced,
                  balance_due: newBalanceDue,
                },
              },
            })
            .eq('id', msg.id)
        }
      }
    } catch (err) {
      console.error('Update deal message metadata failed:', err)
    }

    // Step 6: Gửi thông báo trong chat
    try {
      await supabase
        .from('b2b_chat_messages')
        .insert({
          room_id: context.roomId,
          sender_type: context.actionByType,
          sender_id: context.actionBy,
          message_type: 'system',
          content: `💰 Ứng thêm ${formatCurrency(formData.amount)} VNĐ cho Deal ${context.dealNumber} (${advanceNumber})`,
          metadata: {
            advance_id: advance.id,
            advance_number: advanceNumber,
            deal_id: context.dealId,
            deal_number: context.dealNumber,
            amount: formData.amount,
          },
          attachments: [],
        })

      await supabase
        .from('b2b_chat_rooms')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', context.roomId)
    } catch (err) {
      console.error('Send advance notification error:', err)
    }

    return {
      advance_id: advance.id,
      advance_number: advanceNumber,
      amount: formData.amount,
      new_total_advanced: newTotalAdvanced,
      new_balance_due: newBalanceDue,
    }
  },

  // ================================================================
  // 2. GHI NHẬN GIAO HÀNG (Record Delivery)
  // ================================================================
  // Step 1: Lấy deal hiện tại → check status
  // Step 2: Gửi message giao hàng trong chat (system message)
  // Step 3: Update deal notes
  // ================================================================

  async recordDeliveryFromChat(
    formData: RecordDeliveryFormData,
    context: DealChatActionContext,
  ): Promise<RecordDeliveryResult> {

    // Step 1: Lấy deal hiện tại
    const { data: deal, error: dealError } = await supabase
      .from('b2b_deals')
      .select('id, deal_number, status, notes')
      .eq('id', context.dealId)
      .single()

    if (dealError || !deal) throw new Error('Không tìm thấy Deal')
    if (deal.status === 'settled' || deal.status === 'cancelled') {
      throw new Error('Deal đã quyết toán hoặc đã hủy')
    }

    // Step 2: Gửi message ghi nhận giao hàng
    const deliveryInfo = [
      `📦 Ghi nhận giao hàng — Deal ${context.dealNumber}`,
      `Khối lượng: ${formatCurrency(formData.quantity_kg)} kg`,
      formData.drc_at_delivery ? `DRC tại giao: ${formData.drc_at_delivery}%` : '',
      `Ngày giao: ${formData.delivery_date}`,
      formData.vehicle_plate ? `Xe: ${formData.vehicle_plate}` : '',
      formData.driver_name ? `Tài xế: ${formData.driver_name}` : '',
      formData.notes || '',
    ].filter(Boolean).join('\n')

    const { data: msg, error: msgError } = await supabase
      .from('b2b_chat_messages')
      .insert({
        room_id: context.roomId,
        sender_type: context.actionByType,
        sender_id: context.actionBy,
        message_type: 'system',
        content: deliveryInfo,
        metadata: {
          delivery: {
            deal_id: context.dealId,
            deal_number: context.dealNumber,
            quantity_kg: formData.quantity_kg,
            drc_at_delivery: formData.drc_at_delivery,
            delivery_date: formData.delivery_date,
            vehicle_plate: formData.vehicle_plate,
            driver_name: formData.driver_name,
            driver_phone: formData.driver_phone,
            notes: formData.notes,
          },
        },
        attachments: [],
      })
      .select('id')
      .single()

    if (msgError) throw new Error(`Không thể ghi nhận giao hàng: ${msgError.message}`)

    // Update room last_message_at
    await supabase
      .from('b2b_chat_rooms')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', context.roomId)

    // Step 3: Append delivery info to deal notes
    try {
      const deliveryNote = [
        `[Giao ${formData.delivery_date}]`,
        `${formatCurrency(formData.quantity_kg)} kg`,
        formData.drc_at_delivery ? `DRC ${formData.drc_at_delivery}%` : '',
        formData.vehicle_plate ? `Xe ${formData.vehicle_plate}` : '',
      ].filter(Boolean).join(' — ')

      const existingNotes = deal.notes || ''
      const updatedNotes = existingNotes
        ? `${existingNotes}\n${deliveryNote}`
        : deliveryNote

      await supabase
        .from('b2b_deals')
        .update({
          notes: updatedNotes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', context.dealId)
    } catch (err) {
      console.error('Update deal notes error:', err)
    }

    return {
      delivery_id: msg.id,
      quantity_kg: formData.quantity_kg,
      delivery_date: formData.delivery_date,
    }
  },
}

export default dealChatActionsService
