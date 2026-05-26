// ============================================================================
// BONUS RULES SERVICE — Quản lý quy chế thưởng đại lý (cấu hình ngưỡng + mức)
// File: src/services/b2b/bonusRulesService.ts
// ============================================================================
//
// Bảng: public.b2b_bonus_rules
//
// Mỗi rule = 1 bậc của 1 loại mủ trong 1 effective period.
// Khi quy chế đổi (vd: T1/2027), set effective_to cho rule cũ + insert rule mới.

import { supabase } from '../../lib/supabase'
import type { BonusRule, RubberType } from '../../types/b2b.types'

export interface CreateBonusRuleInput {
  rubber_type: RubberType
  tier_label: string
  threshold_min_tons: number
  threshold_max_tons?: number | null
  bonus_per_ton_vnd: number
  effective_from: string                 // 'YYYY-MM-DD'
  effective_to?: string | null
  sort_order?: number
  notes?: string | null
}

export interface ListRulesParams {
  rubber_type?: RubberType
  /** Chỉ trả rule còn hiệu lực tại as_of_date (default: hôm nay). */
  activeAt?: string                       // 'YYYY-MM-DD'
  /** True = trả tất cả (cả expired). */
  includeExpired?: boolean
}

export const bonusRulesService = {
  /** List rules với filter rubber_type + effective period. */
  async list(params: ListRulesParams = {}): Promise<BonusRule[]> {
    let query = supabase
      .from('b2b_bonus_rules')
      .select('*')
      .order('rubber_type', { ascending: true })
      .order('sort_order', { ascending: false })

    if (params.rubber_type) {
      query = query.eq('rubber_type', params.rubber_type)
    }

    if (!params.includeExpired) {
      const asOf = params.activeAt ?? new Date().toISOString().slice(0, 10)
      query = query
        .lte('effective_from', asOf)
        .or(`effective_to.is.null,effective_to.gte.${asOf}`)
    }

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as BonusRule[]
  },

  /** Lấy 1 rule cho preview. */
  async getById(id: string): Promise<BonusRule | null> {
    const { data, error } = await supabase
      .from('b2b_bonus_rules')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data as BonusRule | null
  },

  /**
   * Tạo rule mới.
   * Lưu ý: KHÔNG tự động set effective_to cho rule cũ — caller cần làm bằng update()
   * nếu muốn "expire" rule trước đó.
   */
  async create(input: CreateBonusRuleInput): Promise<BonusRule> {
    const { data, error } = await supabase
      .from('b2b_bonus_rules')
      .insert({
        rubber_type: input.rubber_type,
        tier_label: input.tier_label,
        threshold_min_tons: input.threshold_min_tons,
        threshold_max_tons: input.threshold_max_tons ?? null,
        bonus_per_ton_vnd: input.bonus_per_ton_vnd,
        effective_from: input.effective_from,
        effective_to: input.effective_to ?? null,
        sort_order: input.sort_order ?? 0,
        notes: input.notes ?? null,
      })
      .select('*')
      .single()
    if (error) throw error
    return data as BonusRule
  },

  /** Update rule (typical use: set effective_to để "expire" rule cũ). */
  async update(id: string, patch: Partial<CreateBonusRuleInput>): Promise<BonusRule> {
    const { data, error } = await supabase
      .from('b2b_bonus_rules')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as BonusRule
  },

  /**
   * Tiện ích: expire toàn bộ rule cũ + insert tập rule mới (transactional via RPC).
   * Hiện chưa có RPC — gọi sequentially. Nếu fail giữa chừng → cần manual fix.
   */
  async replaceRulesForRubberType(
    rubberType: RubberType,
    expireDate: string,
    newRules: CreateBonusRuleInput[],
  ): Promise<BonusRule[]> {
    // Expire rule cũ
    const { error: upErr } = await supabase
      .from('b2b_bonus_rules')
      .update({ effective_to: expireDate })
      .eq('rubber_type', rubberType)
      .is('effective_to', null)
    if (upErr) throw upErr

    // Insert mới
    const inserted: BonusRule[] = []
    for (const r of newRules) {
      const row = await this.create({ ...r, rubber_type: rubberType })
      inserted.push(row)
    }
    return inserted
  },

  /** Xoá rule (chỉ khi chưa được tham chiếu bởi b2b_monthly_bonuses.matched_rule_id). */
  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('b2b_bonus_rules').delete().eq('id', id)
    if (error) throw error
  },
}

export default bonusRulesService
