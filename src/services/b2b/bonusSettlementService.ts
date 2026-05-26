// ============================================================================
// BONUS SETTLEMENT SERVICE — Tạo phiếu chi quý từ bonus đã duyệt
// File: src/services/b2b/bonusSettlementService.ts
// ============================================================================
//
// Theo quy chế: cuối quý gom 3 tháng bonus đã approved → 1 phiếu b2b_settlements
//   (1 partner, 1 quý, có thể có cả mủ tạp + mủ nước trong cùng phiếu).
// Phiếu chi này chỉ có item_type='bonus' (không có deal_id chính).
//
// Sau khi tạo settlement → update b2b_monthly_bonuses.paid_settlement_id + status='paid'.

import { supabase } from '../../lib/supabase'
import type { MonthlyBonus, RubberType } from '../../types/b2b.types'

export interface QuarterlyBonusBundle {
  partner_id: string
  bp_id: string | null
  year: number
  quarter: 1 | 2 | 3 | 4
  bonuses: MonthlyBonus[]
  total_bonus_vnd: number
}

export interface CreateQuarterlySettlementResult {
  settlement_id: string
  settlement_code: string | null
  partner_id: string
  total_bonus_vnd: number
  bonus_count: number
}

export const bonusSettlementService = {
  /**
   * Lấy danh sách bonus đã approved trong 1 quý CHƯA tạo phiếu chi —
   * gom theo partner để admin xem trước khi click "Tạo phiếu chi".
   */
  async getApprovedBundlesForQuarter(year: number, quarter: 1 | 2 | 3 | 4): Promise<QuarterlyBonusBundle[]> {
    const ms = (quarter - 1) * 3 + 1
    const { data, error } = await supabase
      .from('b2b_monthly_bonuses')
      .select('*')
      .eq('year', year)
      .gte('month', ms)
      .lte('month', ms + 2)
      .eq('status', 'approved')
      .is('paid_settlement_id', null)
      .order('partner_id', { ascending: true })
      .order('month', { ascending: true })

    if (error) throw error
    const rows = (data ?? []) as MonthlyBonus[]

    // Group by partner_id
    const byPartner = new Map<string, MonthlyBonus[]>()
    for (const b of rows) {
      const arr = byPartner.get(b.partner_id) ?? []
      arr.push(b)
      byPartner.set(b.partner_id, arr)
    }

    return Array.from(byPartner.entries()).map(([pid, bonuses]) => ({
      partner_id: pid,
      bp_id: bonuses[0]?.bp_id ?? null,
      year,
      quarter,
      bonuses,
      total_bonus_vnd: bonuses.reduce((s, b) => s + Number(b.total_bonus_vnd || 0), 0),
    }))
  },

  /**
   * Tạo phiếu chi quý cho 1 partner.
   *
   * Insert vào b2b.settlements với:
   *   - partner_id, code = `BONUS-{partner_code}-{year}Q{quarter}`
   *   - status = 'draft', created_by = employee_id của user hiện tại
   *   - gross_amount = sum bonus
   *
   * Insert b2b_settlement_items cho mỗi tháng × loại mủ:
   *   item_type='bonus', description, quantity=volume_tons, unit_price=bonus_per_ton,
   *   amount=total_bonus_vnd, is_credit=true
   *
   * Link back: update b2b_monthly_bonuses.paid_settlement_id.
   */
  async createQuarterlySettlement(
    bundle: QuarterlyBonusBundle,
    partnerCode: string,
  ): Promise<CreateQuarterlySettlementResult> {
    if (bundle.bonuses.length === 0) {
      throw new Error('Không có bonus nào để tạo phiếu chi.')
    }

    // Lấy employee_id của user hiện tại (b2b.settlements.created_by NOT NULL)
    const createdBy = await getCurrentEmployeeId()
    if (!createdBy) {
      throw new Error('Không xác định được nhân viên hiện tại (employees.user_id không khớp auth.user). Vui lòng login lại hoặc kiểm tra account.')
    }

    const settlementCode = `BONUS-${partnerCode}-${bundle.year}Q${bundle.quarter}`

    // Step 1: Tạo settlement header
    const { data: settlement, error: sErr } = await supabase
      .from('b2b_settlements')
      .insert({
        code: settlementCode,
        partner_id: bundle.partner_id,
        deal_id: null,                       // bonus settlement không gắn deal cụ thể
        status: 'draft',
        weighed_kg: 0,
        finished_kg: 0,
        drc_percent: 0,
        approved_price: 0,
        created_by: createdBy,
        notes: `Phiếu chi thưởng sản lượng Q${bundle.quarter}/${bundle.year} — ${bundle.bonuses.length} tháng × loại mủ.`,
      })
      .select('id, code')
      .single()
    if (sErr) throw sErr
    const settlementId = (settlement as { id: string }).id

    // Step 2: Insert settlement_items
    const items = bundle.bonuses.map((b) => ({
      settlement_id: settlementId,
      item_type: 'bonus',
      description: `Thưởng SL T${b.month}/${b.year} — mủ ${rubberLabel(b.rubber_type)} — ${b.tier_applied ?? 'N/A'}`,
      quantity: b.volume_tons,
      unit_price: b.bonus_per_ton,
      amount: b.total_bonus_vnd,
      is_credit: true,
      notes: `Bonus ID: ${b.id}`,
    }))

    const { error: iErr } = await supabase.from('b2b_settlement_items').insert(items)
    if (iErr) throw iErr

    // Step 3: Link back vào monthly_bonuses
    const { error: linkErr } = await supabase
      .from('b2b_monthly_bonuses')
      .update({ paid_settlement_id: settlementId })
      .in('id', bundle.bonuses.map((b) => b.id))
    if (linkErr) throw linkErr

    return {
      settlement_id: settlementId,
      settlement_code: (settlement as { code: string }).code ?? settlementCode,
      partner_id: bundle.partner_id,
      total_bonus_vnd: bundle.total_bonus_vnd,
      bonus_count: bundle.bonuses.length,
    }
  },

  /** Khi kế toán đã chi → update bonus rows status='paid' + paid_at. */
  async markBonusesPaid(settlementId: string): Promise<number> {
    const { error, count } = await supabase
      .from('b2b_monthly_bonuses')
      .update({ status: 'paid', paid_at: new Date().toISOString() }, { count: 'exact' })
      .eq('paid_settlement_id', settlementId)
      .eq('status', 'approved')
    if (error) throw error
    return count ?? 0
  },
}

function rubberLabel(t: RubberType): string {
  return t === 'tap' ? 'tạp' : 'nước'
}

/** Lấy employee_id của user đang đăng nhập (map từ auth.uid). */
async function getCurrentEmployeeId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: emp } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    return (emp as { id: string } | null)?.id ?? null
  } catch {
    return null
  }
}

export default bonusSettlementService
