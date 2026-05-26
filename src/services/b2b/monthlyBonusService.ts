// ============================================================================
// MONTHLY BONUS SERVICE — Tính toán + quản lý bonus tháng cho đại lý B2B
// File: src/services/b2b/monthlyBonusService.ts
// ============================================================================
//
// Bảng: public.b2b_monthly_bonuses
// RPC:   public.compute_monthly_bonus(uuid, int, int, text) → 1 row
//        public.recompute_quarter_bonuses(int, int)         → table
//
// Lifecycle: draft → pending_approval → approved → paid (+ cancelled bất cứ lúc)

import { supabase } from '../../lib/supabase'
import type {
  MonthlyBonus,
  MonthlyBonusStatus,
  PartnerBonusProgress,
  RubberType,
} from '../../types/b2b.types'

export interface ListMonthlyBonusParams {
  year?: number
  quarter?: 1 | 2 | 3 | 4
  month?: number
  rubber_type?: RubberType
  partner_id?: string
  status?: MonthlyBonusStatus | 'all'
  page?: number
  pageSize?: number
}

export interface ListMonthlyBonusResult {
  data: MonthlyBonus[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const monthlyBonusService = {
  // ─── Compute / Recompute ──────────────────────────────────────────────────

  /** Tính/cập nhật bonus 1 đại lý × tháng × loại mủ (gọi DB function). */
  async computeForPartnerMonth(
    partnerId: string,
    year: number,
    month: number,
    rubberType: RubberType,
  ): Promise<MonthlyBonus> {
    const { data, error } = await supabase.rpc('compute_monthly_bonus', {
      p_partner_id: partnerId,
      p_year: year,
      p_month: month,
      p_rubber_type: rubberType,
    })
    if (error) throw error
    return data as MonthlyBonus
  },

  /** Bulk recompute cả quý (TẤT CẢ đại lý có intake trong quý đó). */
  async recomputeQuarter(year: number, quarter: 1 | 2 | 3 | 4): Promise<{ row_count: number }> {
    const { data, error } = await supabase.rpc('recompute_quarter_bonuses', {
      p_year: year,
      p_quarter: quarter,
    })
    if (error) throw error
    return { row_count: (data as unknown[])?.length ?? 0 }
  },

  // ─── Listing / filtering ──────────────────────────────────────────────────

  async list(params: ListMonthlyBonusParams = {}): Promise<ListMonthlyBonusResult> {
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 50
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('b2b_monthly_bonuses')
      .select('*', { count: 'exact' })

    if (params.year) query = query.eq('year', params.year)
    if (params.month) query = query.eq('month', params.month)
    if (params.quarter) {
      const ms = (params.quarter - 1) * 3 + 1
      query = query.gte('month', ms).lte('month', ms + 2)
    }
    if (params.rubber_type) query = query.eq('rubber_type', params.rubber_type)
    if (params.partner_id) query = query.eq('partner_id', params.partner_id)
    if (params.status && params.status !== 'all') query = query.eq('status', params.status)

    const { data, count, error } = await query
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .order('total_bonus_vnd', { ascending: false })
      .range(from, to)

    if (error) throw error
    const total = count ?? 0
    return {
      data: (data ?? []) as MonthlyBonus[],
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }
  },

  async getById(id: string): Promise<MonthlyBonus | null> {
    const { data, error } = await supabase
      .from('b2b_monthly_bonuses')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data as MonthlyBonus | null
  },

  // ─── Workflow actions ─────────────────────────────────────────────────────

  async submitForApproval(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    const { error, count } = await supabase
      .from('b2b_monthly_bonuses')
      .update({ status: 'pending_approval' }, { count: 'exact' })
      .in('id', ids)
      .eq('status', 'draft')
    if (error) throw error
    return count ?? 0
  },

  async approve(ids: string[], approvedBy?: string): Promise<number> {
    if (ids.length === 0) return 0
    const { error, count } = await supabase
      .from('b2b_monthly_bonuses')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: approvedBy ?? null,
      }, { count: 'exact' })
      .in('id', ids)
      .eq('status', 'pending_approval')
    if (error) throw error
    return count ?? 0
  },

  async cancel(id: string, reason: string): Promise<MonthlyBonus> {
    const { data, error } = await supabase
      .from('b2b_monthly_bonuses')
      .update({
        status: 'cancelled',
        cancel_reason: reason,
      })
      .eq('id', id)
      .not('status', 'eq', 'paid')
      .select('*')
      .single()
    if (error) throw error
    return data as MonthlyBonus
  },

  // ─── Partner self-view (B2B Portal dùng được qua RLS) ─────────────────────

  async listForPartner(partnerId: string, year: number): Promise<MonthlyBonus[]> {
    const { data, error } = await supabase
      .from('b2b_monthly_bonuses')
      .select('*')
      .eq('partner_id', partnerId)
      .eq('year', year)
      .order('month', { ascending: false })
    if (error) throw error
    return (data ?? []) as MonthlyBonus[]
  },

  /** Progress tháng hiện tại — view v_b2b_partner_bonus_progress. */
  async getProgressForPartner(partnerId: string): Promise<PartnerBonusProgress[]> {
    const { data, error } = await supabase
      .from('v_b2b_partner_bonus_progress')
      .select('*')
      .eq('partner_id', partnerId)
    if (error) throw error
    return (data ?? []) as PartnerBonusProgress[]
  },
}

export default monthlyBonusService
