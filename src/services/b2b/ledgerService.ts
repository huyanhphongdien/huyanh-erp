// ============================================================================
// LEDGER SERVICE — Service quản lý Sổ công nợ đối tác
// File: src/services/b2b/ledgerService.ts
// Phase: E5
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================
// TYPES
// ============================================

export type LedgerEntryType = 'settlement' | 'advance' | 'payment' | 'adjustment' | 'opening_balance'

export interface LedgerEntry {
  id: string
  partner_id: string
  entry_type: LedgerEntryType
  debit: number
  credit: number
  running_balance: number
  settlement_id: string | null
  advance_id: string | null
  payment_id: string | null
  reference_code: string | null
  description: string
  entry_date: string
  period_month: number | null
  period_year: number | null
  created_by: string | null
  created_at: string
  // Joined
  partner?: {
    id: string
    code: string
    name: string
    tier: string
    phone: string | null
  }
}

export interface LedgerListParams {
  partner_id?: string
  page?: number
  pageSize?: number
  entry_type?: LedgerEntryType | 'all'
  date_from?: string
  date_to?: string
  period_month?: number
  period_year?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface PaginatedLedgerResponse {
  data: LedgerEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface PartnerBalance {
  partner_id: string
  partner_code: string
  partner_name: string
  partner_tier: string
  total_debit: number
  total_credit: number
  balance: number
  last_entry_date: string | null
}

export interface LedgerCreateData {
  partner_id: string
  entry_type: LedgerEntryType
  debit?: number
  credit?: number
  reference_code?: string
  description: string
  entry_date?: string
  created_by?: string
}

export interface BalanceSummary {
  total_debit: number
  total_credit: number
  net_balance: number
  partner_count: number
}

export interface AgingItem {
  partner_id: string
  partner_name: string
  partner_code: string
  partner_tier: string
  current: number    // 0-30 days
  days_30: number    // 31-60 days
  days_60: number    // 61-90 days
  days_90: number    // 90+ days
  total: number
}

// ============================================
// CONSTANTS
// ============================================

export const ENTRY_TYPE_LABELS: Record<LedgerEntryType, string> = {
  settlement: 'Quyết toán',
  advance: 'Tạm ứng',
  payment: 'Thanh toán',
  adjustment: 'Điều chỉnh',
  opening_balance: 'Số dư đầu kỳ',
}

export const ENTRY_TYPE_COLORS: Record<LedgerEntryType, string> = {
  settlement: 'blue',
  advance: 'orange',
  payment: 'green',
  adjustment: 'purple',
  opening_balance: 'default',
}

// ============================================
// SERVICE
// ============================================

export const ledgerService = {
  // ============================================
  // LIST & QUERY
  // ============================================

  /**
   * Lấy danh sách entries của sổ công nợ
   */
  async getEntries(params: LedgerListParams = {}): Promise<PaginatedLedgerResponse> {
    const {
      partner_id,
      page = 1,
      pageSize = 20,
      entry_type,
      date_from,
      date_to,
      period_month,
      period_year,
      sort_by = 'entry_date',
      sort_order = 'desc',
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('b2b_partner_ledger')
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone
        )
      `, { count: 'exact' })

    if (partner_id) {
      query = query.eq('partner_id', partner_id)
    }

    if (entry_type && entry_type !== 'all') {
      query = query.eq('entry_type', entry_type)
    }

    if (date_from) {
      query = query.gte('entry_date', date_from)
    }
    if (date_to) {
      query = query.lte('entry_date', date_to)
    }

    if (period_month) {
      query = query.eq('period_month', period_month)
    }
    if (period_year) {
      query = query.eq('period_year', period_year)
    }

    query = query.order(sort_by, { ascending: sort_order === 'asc' })

    const { data, error, count } = await query.range(from, to)

    if (error) throw error

    const entries = (data || []).map(entry => ({
      ...entry,
      partner: Array.isArray(entry.partner) ? entry.partner[0] : entry.partner,
    })) as LedgerEntry[]

    return {
      data: entries,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    }
  },

  /**
   * Lấy số dư công nợ của 1 partner
   */
  async getPartnerBalance(partnerId: string): Promise<{ total_debit: number; total_credit: number; balance: number }> {
    const { data, error } = await supabase
      .from('b2b_partner_ledger')
      .select('debit, credit, running_balance')
      .eq('partner_id', partnerId)
      .order('entry_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    if (!data) {
      return { total_debit: 0, total_credit: 0, balance: 0 }
    }

    // Get totals
    const { data: totals, error: totalsError } = await supabase
      .from('b2b_partner_ledger')
      .select('debit, credit')
      .eq('partner_id', partnerId)

    if (totalsError) throw totalsError

    const rows = totals || []
    const total_debit = rows.reduce((sum: number, r: any) => sum + (r.debit || 0), 0)
    const total_credit = rows.reduce((sum: number, r: any) => sum + (r.credit || 0), 0)

    return {
      total_debit,
      total_credit,
      balance: data.running_balance || (total_debit - total_credit),
    }
  },

  /**
   * Lấy số dư công nợ tất cả partners
   */
  async getAllPartnerBalances(): Promise<PartnerBalance[]> {
    const { data, error } = await supabase
      .from('b2b_partner_ledger')
      .select(`
        partner_id, debit, credit, entry_date,
        partner:b2b_partners!partner_id (
          id, code, name, tier
        )
      `)
      .order('entry_date', { ascending: false })

    if (error) throw error

    // Group by partner
    const partnerMap = new Map<string, PartnerBalance>()

    for (const row of (data || []) as any[]) {
      const partner = Array.isArray(row.partner) ? row.partner[0] : row.partner
      if (!partner) continue

      const existing = partnerMap.get(row.partner_id)
      if (existing) {
        existing.total_debit += row.debit || 0
        existing.total_credit += row.credit || 0
        existing.balance = existing.total_debit - existing.total_credit
        // last_entry_date already set (ordered desc)
      } else {
        partnerMap.set(row.partner_id, {
          partner_id: row.partner_id,
          partner_code: partner.code || '',
          partner_name: partner.name || '',
          partner_tier: partner.tier || 'new',
          total_debit: row.debit || 0,
          total_credit: row.credit || 0,
          balance: (row.debit || 0) - (row.credit || 0),
          last_entry_date: row.entry_date,
        })
      }
    }

    return Array.from(partnerMap.values())
  },

  // ============================================
  // CREATE MANUAL ENTRY
  // ============================================

  /**
   * Tạo bút toán điều chỉnh thủ công
   */
  async createManualEntry(entryData: LedgerCreateData): Promise<LedgerEntry> {
    const now = new Date()
    const entryDateStr = entryData.entry_date || now.toISOString().split('T')[0]
    const entryDate = new Date(entryDateStr)

    const { data, error } = await supabase
      .from('b2b_partner_ledger')
      .insert({
        partner_id: entryData.partner_id,
        entry_type: entryData.entry_type || 'adjustment',
        debit: entryData.debit || 0,
        credit: entryData.credit || 0,
        reference_code: entryData.reference_code,
        description: entryData.description,
        entry_date: entryDateStr,
        period_month: entryDate.getMonth() + 1,
        period_year: entryDate.getFullYear(),
        created_by: entryData.created_by,
      })
      .select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone
        )
      `)
      .single()

    if (error) throw error

    return {
      ...data,
      partner: Array.isArray(data.partner) ? data.partner[0] : data.partner,
    } as LedgerEntry
  },

  // ============================================
  // REPORTS
  // ============================================

  /**
   * Tổng hợp số dư
   */
  async getBalanceSummary(periodYear?: number, periodMonth?: number): Promise<BalanceSummary> {
    let query = supabase
      .from('b2b_partner_ledger')
      .select('partner_id, debit, credit')

    if (periodYear) {
      query = query.eq('period_year', periodYear)
    }
    if (periodMonth) {
      query = query.eq('period_month', periodMonth)
    }

    const { data, error } = await query

    if (error) throw error

    const rows = data || []
    const partnerIds = new Set(rows.map((r: any) => r.partner_id))
    const total_debit = rows.reduce((sum: number, r: any) => sum + (r.debit || 0), 0)
    const total_credit = rows.reduce((sum: number, r: any) => sum + (r.credit || 0), 0)

    return {
      total_debit,
      total_credit,
      net_balance: total_debit - total_credit,
      partner_count: partnerIds.size,
    }
  },

  /**
   * Báo cáo tuổi nợ (aging report)
   */
  async getAgingReport(): Promise<AgingItem[]> {
    const { data, error } = await supabase
      .from('b2b_partner_ledger')
      .select(`
        partner_id, debit, credit, entry_date,
        partner:b2b_partners!partner_id (
          id, code, name, tier
        )
      `)

    if (error) throw error

    const now = new Date()
    const partnerMap = new Map<string, AgingItem>()

    for (const row of (data || []) as any[]) {
      const partner = Array.isArray(row.partner) ? row.partner[0] : row.partner
      if (!partner) continue

      const entryDate = new Date(row.entry_date)
      const daysDiff = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24))
      const netAmount = (row.debit || 0) - (row.credit || 0)

      if (!partnerMap.has(row.partner_id)) {
        partnerMap.set(row.partner_id, {
          partner_id: row.partner_id,
          partner_name: partner.name || '',
          partner_code: partner.code || '',
          partner_tier: partner.tier || 'new',
          current: 0,
          days_30: 0,
          days_60: 0,
          days_90: 0,
          total: 0,
        })
      }

      const item = partnerMap.get(row.partner_id)!
      item.total += netAmount

      if (daysDiff <= 30) {
        item.current += netAmount
      } else if (daysDiff <= 60) {
        item.days_30 += netAmount
      } else if (daysDiff <= 90) {
        item.days_60 += netAmount
      } else {
        item.days_90 += netAmount
      }
    }

    return Array.from(partnerMap.values()).filter(item => item.total !== 0)
  },
}

export default ledgerService
