// ============================================================================
// DRC DISPUTE SERVICE — Khiếu nại DRC variance
// File: src/services/b2b/drcDisputeService.ts
//
// Flow:
//   Partner (portal) gọi raiseDispute → RPC tạo record trạng thái 'open'
//   Nhà máy (ERP) xem + resolve: accept / reject / investigate
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================
// TYPES
// ============================================

export type DisputeStatus =
  | 'open'
  | 'investigating'
  | 'resolved_accepted'
  | 'resolved_rejected'
  | 'withdrawn'

export interface DrcDispute {
  id: string
  dispute_number: string
  deal_id: string
  partner_id: string
  expected_drc: number
  actual_drc: number
  drc_variance: number
  reason: string
  partner_evidence: Record<string, any> | null
  status: DisputeStatus
  resolution_notes: string | null
  resolved_by: string | null
  resolved_at: string | null
  adjustment_drc: number | null
  adjustment_amount: number | null
  created_at: string
  updated_at: string
  raised_by: string
  // Joined
  deal?: { id: string; deal_number: string; product_name: string | null } | null
  partner?: { id: string; code: string; name: string } | null
}

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  open: 'Đang mở',
  investigating: 'Đang xác minh',
  resolved_accepted: 'Chấp nhận',
  resolved_rejected: 'Từ chối',
  withdrawn: 'Đã rút',
}

export const DISPUTE_STATUS_COLORS: Record<DisputeStatus, string> = {
  open: 'red',
  investigating: 'orange',
  resolved_accepted: 'green',
  resolved_rejected: 'default',
  withdrawn: 'default',
}

// ============================================
// SERVICE
// ============================================

export const drcDisputeService = {
  // ==========================================
  // QUERY
  // ==========================================

  async getDisputes(params: {
    status?: DisputeStatus | 'all'
    partner_id?: string
    deal_id?: string
  } = {}): Promise<DrcDispute[]> {
    let query = supabase
      .from('b2b_drc_disputes')
      .select(`
        *,
        deal:b2b_deals!deal_id (id, deal_number, product_name),
        partner:b2b_partners!partner_id (id, code, name)
      `)
      .order('created_at', { ascending: false })

    if (params.status && params.status !== 'all') query = query.eq('status', params.status)
    if (params.partner_id) query = query.eq('partner_id', params.partner_id)
    if (params.deal_id) query = query.eq('deal_id', params.deal_id)

    const { data, error } = await query
    if (error) throw error

    return (data || []).map((d: any) => ({
      ...d,
      deal: Array.isArray(d.deal) ? d.deal[0] : d.deal,
      partner: Array.isArray(d.partner) ? d.partner[0] : d.partner,
    })) as DrcDispute[]
  },

  async getDisputeById(id: string): Promise<DrcDispute | null> {
    const { data, error } = await supabase
      .from('b2b_drc_disputes')
      .select(`
        *,
        deal:b2b_deals!deal_id (id, deal_number, product_name),
        partner:b2b_partners!partner_id (id, code, name)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) return null
    return {
      ...data,
      deal: Array.isArray((data as any).deal) ? (data as any).deal[0] : (data as any).deal,
      partner: Array.isArray((data as any).partner) ? (data as any).partner[0] : (data as any).partner,
    } as DrcDispute
  },

  async getActiveDisputeByDeal(dealId: string): Promise<DrcDispute | null> {
    const { data, error } = await supabase
      .from('b2b_drc_disputes')
      .select('*')
      .eq('deal_id', dealId)
      .in('status', ['open', 'investigating'])
      .maybeSingle()

    if (error) throw error
    return data as DrcDispute | null
  },

  // ==========================================
  // PARTNER ACTIONS (gọi từ Portal)
  // ==========================================

  /**
   * PARTNER raise dispute — dùng RPC để verify ownership + ngăn duplicate open
   */
  async raiseDispute(
    dealId: string,
    reason: string,
    evidence?: Record<string, any>,
  ): Promise<string> {
    const { data, error } = await supabase.rpc('partner_raise_drc_dispute', {
      p_deal_id: dealId,
      p_reason: reason,
      p_evidence: evidence || null,
    })
    if (error) throw new Error(error.message || 'Không thể tạo khiếu nại')

    const disputeId = data as string
    try {
      const { patchDealCardMetadata } = await import('./dealChatActionsService')
      await patchDealCardMetadata(dealId, {
        active_dispute_id: disputeId,
        active_dispute_status: 'open',
      })
    } catch (err) { console.error('Patch DealCard dispute failed:', err) }

    // Sprint 4 — notification (nhân viên nhận alert)
    try {
      const { b2bNotificationService } = await import('./b2bNotificationService')
      await b2bNotificationService.notify({
        type: 'dispute_raised',
        audience: 'staff',
        deal_id: dealId,
        dispute_id: disputeId,
        title: 'Khiếu nại DRC mới',
        message: reason.slice(0, 200),
      })
    } catch (err) { console.error('B2B notification dispute raised:', err) }

    // ─── Sprint 2 Cross #2: Auto-pause settlements của deal này ───
    // Khoá các phiếu settlement chưa paid → chặn approve/update cho đến khi
    // dispute được giải quyết. Không block payment đã paid (không rollback).
    try {
      await supabase
        .from('b2b_settlements')
        .update({
          locked_by_dispute: true,
          locked_dispute_id: disputeId,
          updated_at: new Date().toISOString(),
        })
        .eq('deal_id', dealId)
        .in('status', ['draft', 'pending', 'approved'])
    } catch (err) {
      console.error('[drcDispute.raise] Auto-pause settlement failed:', err)
    }

    return disputeId
  },

  async withdrawDispute(disputeId: string): Promise<void> {
    // Lấy deal_id trước khi RPC để patch sau
    const dispute = await this.getDisputeById(disputeId)
    const { error } = await supabase.rpc('partner_withdraw_drc_dispute', {
      p_dispute_id: disputeId,
    })
    if (error) throw new Error(error.message || 'Không thể rút khiếu nại')

    if (dispute?.deal_id) {
      try {
        const { patchDealCardMetadata } = await import('./dealChatActionsService')
        await patchDealCardMetadata(dispute.deal_id, {
          active_dispute_id: undefined,
          active_dispute_status: undefined,
        })
      } catch (err) { console.error('Patch DealCard clear dispute failed:', err) }

      // ─── Sprint 2 Cross #2: Unlock settlements ───
      try {
        await supabase
          .from('b2b_settlements')
          .update({
            locked_by_dispute: false,
            locked_dispute_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq('deal_id', dispute.deal_id)
          .eq('locked_dispute_id', disputeId)
      } catch (err) {
        console.error('[drcDispute.withdraw] Unlock settlement failed:', err)
      }
    }
  },

  // ==========================================
  // FACTORY ACTIONS (gọi từ ERP)
  // ==========================================

  async markInvestigating(disputeId: string, factoryUserId: string): Promise<DrcDispute> {
    const { data, error } = await supabase
      .from('b2b_drc_disputes')
      .update({
        status: 'investigating' as DisputeStatus,
        resolved_by: factoryUserId,  // reuse field cho người đang xử
      })
      .eq('id', disputeId)
      .eq('status', 'open')
      .select('*')
      .single()

    if (error) throw error

    try {
      const { patchDealCardMetadata } = await import('./dealChatActionsService')
      await patchDealCardMetadata((data as DrcDispute).deal_id, {
        active_dispute_status: 'investigating',
      })
    } catch (err) { console.error('Patch DealCard dispute status failed:', err) }

    return data as DrcDispute
  },

  async resolveDispute(
    disputeId: string,
    resolution: {
      accepted: boolean
      resolved_by: string
      notes: string
      adjustment_drc?: number
      adjustment_amount?: number
    },
  ): Promise<DrcDispute> {
    const { data, error } = await supabase
      .from('b2b_drc_disputes')
      .update({
        status: (resolution.accepted ? 'resolved_accepted' : 'resolved_rejected') as DisputeStatus,
        resolution_notes: resolution.notes,
        resolved_by: resolution.resolved_by,
        resolved_at: new Date().toISOString(),
        adjustment_drc: resolution.accepted ? resolution.adjustment_drc : null,
        adjustment_amount: resolution.accepted ? resolution.adjustment_amount : null,
      })
      .eq('id', disputeId)
      .select(`
        *,
        deal:b2b_deals!deal_id (id, deal_number, product_name)
      `)
      .single()

    if (error) throw error

    const resolved = {
      ...data,
      deal: Array.isArray((data as any).deal) ? (data as any).deal[0] : (data as any).deal,
    } as DrcDispute

    // === Ledger adjustment — chỉ khi accepted + adjustment_amount khác 0 ===
    // Quy ước:
    //   adjustment_amount > 0 → nhà máy CHI THÊM cho đại lý → DEBIT (công nợ tăng)
    //   adjustment_amount < 0 → giảm công nợ (đại lý trả lại) → CREDIT
    // Trigger DB compute_b2b_ledger_running_balance sẽ tự cộng dồn.
    if (
      resolution.accepted &&
      resolution.adjustment_amount != null &&
      resolution.adjustment_amount !== 0
    ) {
      try {
        const { ledgerService } = await import('./ledgerService')
        const amount = resolution.adjustment_amount
        const debit = amount > 0 ? amount : 0
        const credit = amount < 0 ? Math.abs(amount) : 0
        const dealNumber = resolved.deal?.deal_number || resolved.deal_id
        const drcNote = resolution.adjustment_drc != null
          ? ` DRC ${resolved.actual_drc}% → ${resolution.adjustment_drc}%.`
          : ''

        await ledgerService.createManualEntry({
          partner_id: resolved.partner_id,
          // amount > 0 → factory thu thêm = adjustment_debit (partner nợ).
          // amount < 0 → factory trả thêm = adjustment_credit (partner có).
          entry_type: amount > 0 ? 'adjustment_debit' : 'adjustment_credit',
          debit,
          credit,
          reference_code: resolved.dispute_number,
          description: `Điều chỉnh DRC theo khiếu nại ${resolved.dispute_number} — Deal ${dealNumber}.${drcNote}`,
          created_by: resolution.resolved_by,
        })
      } catch (err) {
        console.error('[drcDispute.resolve] Ledger adjustment failed:', err)
        // Non-blocking — dispute vẫn resolved, chỉ ledger entry miss.
        // Thu mua/kế toán có thể insert bằng tay qua trang Sổ công nợ.
      }
    }

    // Dispute đã close → clear active flags trên DealCard
    try {
      const { patchDealCardMetadata } = await import('./dealChatActionsService')
      await patchDealCardMetadata(resolved.deal_id, {
        active_dispute_id: undefined,
        active_dispute_status: undefined,
      })
    } catch (err) { console.error('Patch DealCard clear dispute failed:', err) }

    // ─── Sprint 2 Cross #2: Unlock settlements đã bị lock bởi dispute này ───
    try {
      await supabase
        .from('b2b_settlements')
        .update({
          locked_by_dispute: false,
          locked_dispute_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('deal_id', resolved.deal_id)
        .eq('locked_dispute_id', disputeId)
    } catch (err) {
      console.error('[drcDispute.resolve] Unlock settlement failed:', err)
    }

    return resolved
  },
}

export default drcDisputeService
