// ============================================================================
// FINANCE — Tồn quỹ 112 + Khoản phải nộp định kỳ (Đợt 5)
// File: src/services/finance/cashService.ts
// ============================================================================
import { supabase } from '../../lib/supabase'

export interface FinCashBalance {
  id: string
  bank: string
  account_no: string | null
  vnd: number | null
  usd: number | null
  kip: number | null
  as_of_date: string | null
  note: string | null
  sort_order: number | null
  updated_at: string
}

export type PayableCategory = 'thue_tc' | 'dien' | 'bao_hiem' | 'lai_vay' | 'thue' | 'khac'

export interface FinRecurringPayable {
  id: string
  name: string
  category: string | null
  due_day: number | null
  due_rule: string | null
  amount_est: number | null
  bank: string | null
  active: boolean
  note: string | null
  sort_order: number | null
  created_at: string
  updated_at: string
}

export interface FinPayableComputed extends FinRecurringPayable {
  next_due: string | null    // YYYY-MM-DD lần tới
  days_to_due: number        // next_due - today
  alert: 'due' | 'soon' | 'ok'
}

export const CATEGORY_LABEL: Record<string, string> = {
  thue_tc: 'Thuê tài chính', dien: 'Tiền điện', bao_hiem: 'Bảo hiểm', lai_vay: 'Lãi vay', thue: 'Thuế', khac: 'Khác',
}

function dDiff(a: Date, b: Date): number {
  return Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86_400_000)
}

/** Ngày phải nộp kế tiếp dựa trên due_day (ngày trong tháng). */
export function nextDueFromDay(due_day: number | null, today = new Date()): string | null {
  if (!due_day || due_day < 1 || due_day > 31) return null
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate()
  let target = new Date(y, m, Math.min(due_day, daysInMonth(y, m)))
  if (target.getDate() < d) { const nm = m + 1; target = new Date(y, nm, Math.min(due_day, daysInMonth(y, nm))) }
  return target.toISOString().slice(0, 10)
}
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }

export function computePayable(p: FinRecurringPayable, today = new Date()): FinPayableComputed {
  const next_due = nextDueFromDay(p.due_day, today)
  const days = next_due ? dDiff(new Date(next_due + 'T00:00:00'), today) : 9999
  const alert: FinPayableComputed['alert'] = days <= 3 ? 'due' : days <= 7 ? 'soon' : 'ok'
  return { ...p, next_due, days_to_due: days, alert }
}

export const cashService = {
  // ── Tồn quỹ ──
  async listBalances(): Promise<FinCashBalance[]> {
    const { data, error } = await supabase.from('fin_cash_balances').select('*').order('sort_order', { ascending: true }).order('bank', { ascending: true })
    if (error) throw error
    return (data as FinCashBalance[]) || []
  },
  async saveBalance(input: Partial<FinCashBalance> & { bank: string }): Promise<void> {
    const payload = {
      bank: input.bank, account_no: input.account_no || null,
      vnd: input.vnd ?? 0, usd: input.usd ?? 0, kip: input.kip ?? 0,
      as_of_date: input.as_of_date || null, note: input.note || null, sort_order: input.sort_order ?? 0,
      updated_at: new Date().toISOString(),
    }
    if (input.id) { const { error } = await supabase.from('fin_cash_balances').update(payload).eq('id', input.id); if (error) throw error }
    else { const { error } = await supabase.from('fin_cash_balances').insert(payload); if (error) throw error }
  },
  async removeBalance(id: string): Promise<void> {
    const { error } = await supabase.from('fin_cash_balances').delete().eq('id', id); if (error) throw error
  },

  // ── Phải nộp định kỳ ──
  async listPayables(): Promise<FinPayableComputed[]> {
    const { data, error } = await supabase.from('fin_recurring_payables').select('*').order('sort_order', { ascending: true })
    if (error) throw error
    return ((data as FinRecurringPayable[]) || []).map((p) => computePayable(p))
  },
  async savePayable(input: Partial<FinRecurringPayable> & { name: string }): Promise<void> {
    const payload = {
      name: input.name, category: input.category || null, due_day: input.due_day ?? null,
      due_rule: input.due_rule || null, amount_est: input.amount_est ?? null, bank: input.bank || null,
      active: input.active ?? true, note: input.note || null, sort_order: input.sort_order ?? 0,
      updated_at: new Date().toISOString(),
    }
    if (input.id) { const { error } = await supabase.from('fin_recurring_payables').update(payload).eq('id', input.id); if (error) throw error }
    else { const { error } = await supabase.from('fin_recurring_payables').insert(payload); if (error) throw error }
  },
  async removePayable(id: string): Promise<void> {
    const { error } = await supabase.from('fin_recurring_payables').delete().eq('id', id); if (error) throw error
  },
}
