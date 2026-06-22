// ============================================================================
// FINANCE — Lãi vay + Lịch trả lãi (Đợt 3a)
// File: src/services/finance/interestService.ts
// ============================================================================
import { supabase } from '../../lib/supabase'
import dayjs from 'dayjs'

export type InterestFreq = 'monthly' | 'quarterly' | 'yearly' | 'end'
export type PeriodStatus = 'pending' | 'paid'
export type InterestAlert = 'overdue' | 'due' | 'soon' | 'ok' | 'paid'

export interface FinInterestPeriod {
  id: string
  loan_id: string
  period_no: number | null
  from_date: string | null
  to_date: string | null
  due_date: string
  base_amount: number | null
  rate: number | null
  interest_amount: number
  status: PeriodStatus
  paid_date: string | null
  paid_amount: number | null
  note: string | null
  created_at: string
  updated_at: string
  // join (khi list toàn bộ)
  loan?: { bank: string; loan_no: string | null } | null
}

export interface FinInterestComputed extends FinInterestPeriod {
  days_to_due: number      // due - today (>0 còn, <0 quá hạn)
  alert: InterestAlert
}

export const FREQ_LABEL: Record<InterestFreq, string> = {
  monthly: 'Hằng tháng', quarterly: 'Hằng quý', yearly: 'Hằng năm', end: 'Cuối kỳ (1 lần)',
}
export const IALERT_LABEL: Record<InterestAlert, string> = {
  overdue: 'QUÁ HẠN', due: 'Đến hạn', soon: 'Sắp đến', ok: 'Còn hạn', paid: 'Đã trả',
}
export const IALERT_COLOR: Record<InterestAlert, string> = {
  overdue: '#dc2626', due: '#ea580c', soon: '#ca8a04', ok: '#16a34a', paid: '#9ca3af',
}

const WARN_DUE = 7  // sắp đến hạn ≤7 ngày
const DUE_NOW = 3   // đến hạn ≤3 ngày

function dDiff(a: Date, b: Date): number {
  return Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86_400_000)
}

export function computePeriod(p: FinInterestPeriod, today = new Date()): FinInterestComputed {
  if (p.status === 'paid') return { ...p, days_to_due: 0, alert: 'paid' }
  const due = new Date(p.due_date + 'T00:00:00')
  const days = dDiff(due, today)
  let alert: InterestAlert = 'ok'
  if (days < 0) alert = 'overdue'
  else if (days <= DUE_NOW) alert = 'due'
  else if (days <= WARN_DUE) alert = 'soon'
  return { ...p, days_to_due: days, alert }
}

const FACTOR: Record<InterestFreq, number> = { monthly: 1 / 12, quarterly: 1 / 4, yearly: 1, end: 1 }
const STEP_MONTHS: Record<Exclude<InterestFreq, 'end'>, number> = { monthly: 1, quarterly: 3, yearly: 12 }

export interface GenerateOpts {
  freq: InterestFreq
  startDate: string        // YYYY-MM-DD (thường = ngày giải ngân)
  endDate: string          // YYYY-MM-DD (thường = ngày đáo hạn)
  base: number             // dư nợ gốc dùng tính lãi
  rate: number             // %/năm
  payDay?: number | null   // ngày trả lãi trong tháng (1–28); mặc định theo ngày endDate của kỳ
}

/** Sinh trước (KHÔNG ghi DB) danh sách kỳ lãi để xem preview. */
export function buildSchedule(o: GenerateOpts): Array<Partial<FinInterestPeriod>> {
  const out: Array<Partial<FinInterestPeriod>> = []
  const start = dayjs(o.startDate)
  const end = dayjs(o.endDate)
  if (!start.isValid() || !end.isValid() || end.isBefore(start)) return out
  const rate = Number(o.rate) || 0
  const base = Number(o.base) || 0

  if (o.freq === 'end') {
    const days = Math.max(1, end.diff(start, 'day'))
    out.push({
      period_no: 1, from_date: start.format('YYYY-MM-DD'), to_date: end.format('YYYY-MM-DD'),
      due_date: end.format('YYYY-MM-DD'), base_amount: base, rate,
      interest_amount: Math.round(base * rate / 100 * days / 365),
    })
    return out
  }

  const step = STEP_MONTHS[o.freq]
  let from = start
  let no = 1
  while (from.isBefore(end)) {
    let to = from.add(step, 'month')
    if (to.isAfter(end)) to = end
    let due = to
    if (o.payDay && o.payDay >= 1 && o.payDay <= 28) due = to.date(o.payDay)
    out.push({
      period_no: no, from_date: from.format('YYYY-MM-DD'), to_date: to.format('YYYY-MM-DD'),
      due_date: due.format('YYYY-MM-DD'), base_amount: base, rate,
      interest_amount: Math.round(base * rate / 100 * FACTOR[o.freq]),
    })
    from = to
    no++
    if (no > 240) break  // chặn vòng lặp
  }
  return out
}

export const interestService = {
  async listByLoan(loanId: string): Promise<FinInterestComputed[]> {
    const { data, error } = await supabase.from('fin_interest_periods')
      .select('*').eq('loan_id', loanId).order('due_date', { ascending: true })
    if (error) throw error
    return ((data as FinInterestPeriod[]) || []).map((p) => computePeriod(p))
  },

  /** Toàn bộ kỳ lãi (join tên khoản vay) — cho trang nhắc + dashboard. */
  async listAll(): Promise<FinInterestComputed[]> {
    const { data, error } = await supabase.from('fin_interest_periods')
      .select('*, loan:fin_loans(bank, loan_no)').order('due_date', { ascending: true })
    if (error) throw error
    return ((data as FinInterestPeriod[]) || []).map((p) => computePeriod(p))
  },

  /** Ghi cả lịch (xoá lịch pending cũ chưa trả của khoản này rồi sinh mới). */
  async generate(loanId: string, o: GenerateOpts, createdBy?: string | null): Promise<number> {
    const rows = buildSchedule(o)
    if (!rows.length) return 0
    // Xoá các kỳ CHƯA trả của khoản này để sinh lại (giữ kỳ đã trả)
    await supabase.from('fin_interest_periods').delete().eq('loan_id', loanId).eq('status', 'pending')
    const payload = rows.map((r) => ({ ...r, loan_id: loanId, status: 'pending', created_by: createdBy || null }))
    const { error } = await supabase.from('fin_interest_periods').insert(payload)
    if (error) throw error
    return rows.length
  },

  async markPaid(id: string, paid: { paid_date: string; paid_amount: number }): Promise<void> {
    const { error } = await supabase.from('fin_interest_periods')
      .update({ status: 'paid', paid_date: paid.paid_date, paid_amount: paid.paid_amount, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },
  async unpay(id: string): Promise<void> {
    const { error } = await supabase.from('fin_interest_periods')
      .update({ status: 'pending', paid_date: null, paid_amount: null, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },
  async create(input: Partial<FinInterestPeriod> & { loan_id: string; due_date: string }): Promise<void> {
    const { error } = await supabase.from('fin_interest_periods').insert({
      loan_id: input.loan_id, period_no: input.period_no ?? null,
      from_date: input.from_date || null, to_date: input.to_date || null, due_date: input.due_date,
      base_amount: input.base_amount ?? null, rate: input.rate ?? null,
      interest_amount: input.interest_amount || 0, status: input.status || 'pending', note: input.note || null,
    })
    if (error) throw error
  },
  async update(id: string, patch: Partial<FinInterestPeriod>): Promise<void> {
    const { error } = await supabase.from('fin_interest_periods')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('fin_interest_periods').delete().eq('id', id)
    if (error) throw error
  },
}
