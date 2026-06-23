// ============================================================================
// FINANCE — Khoản vay ngân hàng (Đợt 1)
// File: src/services/finance/loanService.ts
// Bảng: fin_loans, fin_loan_repayments, fin_credit_lines (finance_loans_v1.sql)
// Trọng tâm: tính đèn "nhảy nhóm" CIC (quá hạn ≥10 ngày = nhóm 2).
// ============================================================================
import { supabase } from '../../lib/supabase'

export type LoanStatus = 'active' | 'paid' | 'cancelled'
export type CicLight = 'green' | 'yellow' | 'overdue' | 'orange' | 'red' | 'paid'

export interface FinLoan {
  id: string
  bank: string
  loan_no: string | null
  credit_line_id: string | null
  principal: number
  currency: string
  disbursed_date: string | null
  due_date: string
  interest_rate: number | null
  purpose: string | null
  sales_order_id: string | null
  paid_amount: number
  status: LoanStatus
  note: string | null
  created_at: string
  updated_at: string
}

export interface FinLoanComputed extends FinLoan {
  remaining: number      // còn lại = principal - paid_amount
  overdue_days: number   // today - due_date (>0 = quá hạn, <0 = còn X ngày)
  jump_date: string      // ngày nhảy nhóm = due_date + 10
  cic: CicLight
}

export interface FinLoanInput {
  bank: string
  loan_no?: string | null
  credit_line_id?: string | null
  principal: number
  currency?: string
  disbursed_date?: string | null
  due_date: string
  interest_rate?: number | null
  purpose?: string | null
  sales_order_id?: string | null
  note?: string | null
  status?: LoanStatus
  created_by?: string | null
}

export interface FinRepayment {
  id: string
  loan_id: string
  paid_date: string
  amount: number
  source: string | null
  note: string | null
  created_at: string
}

export const CIC_LABEL: Record<CicLight, string> = {
  green: 'An toàn', yellow: 'Sắp đến hạn', overdue: 'Quá hạn', orange: 'Sát nhảy nhóm',
  red: 'NGUY CƠ NHẢY NHÓM', paid: 'Đã tất toán',
}
export const CIC_COLOR: Record<CicLight, string> = {
  green: '#16a34a', yellow: '#ca8a04', overdue: '#f97316', orange: '#ea580c', red: '#dc2626', paid: '#9ca3af',
}
export const CIC_BG: Record<CicLight, string> = {
  green: '#f0fdf4', yellow: '#fefce8', overdue: '#fff7ed', orange: '#fff7ed', red: '#fef2f2', paid: '#f9fafb',
}

// Ngân hàng hay dùng (gợi ý dropdown — vẫn gõ tự do được)
export const BANKS = ['Agribank', 'Vietinbank', 'BIDV', 'Sacombank', 'TPBank', 'Eximbank', 'UOB', 'Seabank', 'KBank', 'MSB', 'ACB', 'CTBC']

export const JUMP_DAYS = 10  // quá hạn ≥10 ngày → nhảy nhóm 2 (CIC chuẩn)

function dayDiff(a: Date, b: Date): number {
  const ms = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
           - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round(ms / 86_400_000)
}
// Định dạng ngày theo LỊCH ĐỊA PHƯƠNG (tránh toISOString lệch -1 ngày ở UTC+7)
const pad = (n: number) => String(n).padStart(2, '0')
const toLocalISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Tính còn lại + số ngày quá hạn + đèn CIC. */
export function computeLoan(l: FinLoan, today = new Date()): FinLoanComputed {
  const remaining = Math.max(0, (Number(l.principal) || 0) - (Number(l.paid_amount) || 0))
  const due = new Date(l.due_date + 'T00:00:00')
  const overdue_days = dayDiff(today, due)          // >0 quá hạn
  const jump = new Date(due); jump.setDate(jump.getDate() + JUMP_DAYS)
  let cic: CicLight
  if (l.status === 'paid' || remaining <= 0) cic = 'paid'
  else if (overdue_days >= JUMP_DAYS) cic = 'red'       // ≥10 ngày → đã nhảy nhóm
  else if (overdue_days >= 7) cic = 'orange'            // 7–9 ngày → sát mốc
  else if (overdue_days >= 1) cic = 'overdue'           // 1–6 ngày → ĐÃ quá hạn (chưa tới mốc)
  else if (overdue_days >= -7) cic = 'yellow'           // 7 ngày trước hạn → đến hạn hôm nay
  else cic = 'green'
  return { ...l, remaining, overdue_days, jump_date: toLocalISO(jump), cic }
}

export const loanService = {
  async list(): Promise<FinLoanComputed[]> {
    const { data, error } = await supabase
      .from('fin_loans').select('*').order('due_date', { ascending: true })
    if (error) throw error
    return ((data as FinLoan[]) || []).map((l) => computeLoan(l))
  },

  async getById(id: string): Promise<FinLoanComputed | null> {
    const { data, error } = await supabase.from('fin_loans').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? computeLoan(data as FinLoan) : null
  },

  async create(input: FinLoanInput): Promise<FinLoan> {
    const { data, error } = await supabase.from('fin_loans').insert({
      bank: input.bank,
      loan_no: input.loan_no || null,
      credit_line_id: input.credit_line_id || null,
      principal: input.principal || 0,
      currency: input.currency || 'VND',
      disbursed_date: input.disbursed_date || null,
      due_date: input.due_date,
      interest_rate: input.interest_rate ?? null,
      purpose: input.purpose || null,
      sales_order_id: input.sales_order_id || null,
      note: input.note || null,
      status: input.status || 'active',
      created_by: input.created_by || null,
    }).select('*').single()
    if (error) throw error
    return data as FinLoan
  },

  async update(id: string, patch: Partial<FinLoanInput>): Promise<void> {
    const { error } = await supabase.from('fin_loans')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('fin_loans').delete().eq('id', id)
    if (error) throw error
  },

  // ── Trả nợ ──
  async listRepayments(loanId: string): Promise<FinRepayment[]> {
    const { data, error } = await supabase.from('fin_loan_repayments')
      .select('*').eq('loan_id', loanId).order('paid_date', { ascending: false })
    if (error) throw error
    return (data as FinRepayment[]) || []
  },

  async addRepayment(loanId: string, input: { paid_date: string; amount: number; source?: string; note?: string; created_by?: string | null }): Promise<void> {
    const { error } = await supabase.from('fin_loan_repayments').insert({
      loan_id: loanId, paid_date: input.paid_date, amount: input.amount,
      source: input.source || null, note: input.note || null, created_by: input.created_by || null,
    })
    if (error) throw error
  },

  async removeRepayment(id: string): Promise<void> {
    const { error } = await supabase.from('fin_loan_repayments').delete().eq('id', id)
    if (error) throw error
  },
}
