// ============================================================================
// FINANCE — Hợp đồng tiền gửi (HĐTG) — Đợt 2
// File: src/services/finance/depositService.ts
// Bảng: fin_deposits (finance_deposits_v1.sql). Đèn = nhắc TÁI TỤC trước đáo hạn.
// ============================================================================
import { supabase } from '../../lib/supabase'

export type DepositStatus = 'active' | 'closed'
export type DepositAlert = 'ok' | 'soon' | 'due' | 'overdue' | 'closed'

export interface FinDeposit {
  id: string
  bank: string
  deposit_no: string | null
  holder: string | null
  amount: number
  currency: string
  deposit_date: string | null
  maturity_date: string | null
  reopen_date: string | null
  extended_to: string | null
  interest_rate: number | null
  term: string | null
  expected_interest: number | null
  purpose: string | null        // dam_bao_vay | thuong
  status: DepositStatus
  note: string | null
  created_at: string
  updated_at: string
}

export interface FinDepositComputed extends FinDeposit {
  effective_maturity: string | null   // gia hạn nếu có, không thì đến hạn
  days_to_maturity: number | null      // effective - today (>0 còn, <0 quá hạn)
  alert: DepositAlert
}

export type FinDepositInput = Partial<Omit<FinDeposit, 'id' | 'created_at' | 'updated_at'>> & {
  bank: string; amount: number; created_by?: string | null
}

export const ALERT_LABEL: Record<DepositAlert, string> = {
  ok: 'Còn hạn', soon: 'Sắp đáo hạn', due: 'Đáo hạn tuần này', overdue: 'QUÁ HẠN — tái tục gấp', closed: 'Đã tất toán',
}
export const ALERT_COLOR: Record<DepositAlert, string> = {
  ok: '#16a34a', soon: '#ca8a04', due: '#ea580c', overdue: '#dc2626', closed: '#9ca3af',
}
export const ALERT_BG: Record<DepositAlert, string> = {
  ok: '#f0fdf4', soon: '#fefce8', due: '#fff7ed', overdue: '#fef2f2', closed: '#f9fafb',
}

function dayDiff(a: Date, b: Date): number {
  const ms = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
           - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round(ms / 86_400_000)
}

export function computeDeposit(d: FinDeposit, today = new Date()): FinDepositComputed {
  const eff = d.extended_to || d.maturity_date
  let days: number | null = null
  let alert: DepositAlert
  if (d.status === 'closed') alert = 'closed'
  else if (!eff) { alert = 'ok' }
  else {
    days = dayDiff(new Date(eff + 'T00:00:00'), today)  // >0 còn X ngày
    if (days < 0) alert = 'overdue'
    else if (days <= 7) alert = 'due'
    else if (days <= 30) alert = 'soon'
    else alert = 'ok'
  }
  return { ...d, effective_maturity: eff, days_to_maturity: days, alert }
}

export const depositService = {
  async list(): Promise<FinDepositComputed[]> {
    const { data, error } = await supabase.from('fin_deposits').select('*').order('maturity_date', { ascending: true })
    if (error) throw error
    return ((data as FinDeposit[]) || []).map((d) => computeDeposit(d))
  },

  async create(input: FinDepositInput): Promise<FinDeposit> {
    const { data, error } = await supabase.from('fin_deposits').insert({
      bank: input.bank, deposit_no: input.deposit_no || null, holder: input.holder || null,
      amount: input.amount || 0, currency: input.currency || 'VND',
      deposit_date: input.deposit_date || null, maturity_date: input.maturity_date || null,
      reopen_date: input.reopen_date || null, extended_to: input.extended_to || null,
      interest_rate: input.interest_rate ?? null, term: input.term || null,
      expected_interest: input.expected_interest ?? null, purpose: input.purpose || 'dam_bao_vay',
      status: input.status || 'active', note: input.note || null, created_by: input.created_by || null,
    }).select('*').single()
    if (error) throw error
    return data as FinDeposit
  },

  async update(id: string, patch: Partial<FinDepositInput>): Promise<void> {
    const { error } = await supabase.from('fin_deposits')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('fin_deposits').delete().eq('id', id)
    if (error) throw error
  },
}
