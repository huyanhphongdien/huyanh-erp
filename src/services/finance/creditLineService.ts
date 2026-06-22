// ============================================================================
// FINANCE — Hạn mức tín dụng (HĐTD) — Đợt 2b
// File: src/services/finance/creditLineService.ts
// Trục nối: HĐTG đảm bảo Hạn mức ← → Khoản vay rút từ Hạn mức (còn room).
// ============================================================================
import { supabase } from '../../lib/supabase'
import { loanService, type FinLoanComputed } from './loanService'
import { depositService, type FinDepositComputed } from './depositService'

export type LineType = 'vay' | 'chiet_khau' | 'thau_chi' | 'lc' | 'khac'

export interface FinCreditLine {
  id: string
  bank: string
  contract_no: string | null
  line_type: string | null
  limit_amount: number | null
  currency: string
  from_date: string | null
  to_date: string | null
  interest_rate: number | null
  status: string
  note: string | null
  created_at: string
  updated_at: string
}

export interface FinCreditLineComputed extends FinCreditLine {
  used: number          // tổng dư nợ khoản vay đang rút từ hạn mức
  secured: number       // tổng tiền gửi đảm bảo hạn mức
  room: number          // hạn mức - đã dùng
  loanCount: number
  depositCount: number
  loans: FinLoanComputed[]
  deposits: FinDepositComputed[]
}

export type FinCreditLineInput = Partial<Omit<FinCreditLine, 'id' | 'created_at' | 'updated_at'>> & {
  bank: string; created_by?: string | null
}

export const LINE_TYPE_LABEL: Record<string, string> = {
  vay: 'Vay vốn', chiet_khau: 'Chiết khấu BCT', thau_chi: 'Thấu chi', lc: 'L/C', khac: 'Khác',
}

function computeLine(cl: FinCreditLine, loans: FinLoanComputed[], deposits: FinDepositComputed[]): FinCreditLineComputed {
  const ls = loans.filter((l) => l.credit_line_id === cl.id)
  const ds = deposits.filter((d) => d.secured_credit_line_id === cl.id && d.status !== 'closed')
  const used = ls.filter((l) => l.status !== 'paid').reduce((s, l) => s + l.remaining, 0)
  const secured = ds.reduce((s, d) => s + (d.amount || 0), 0)
  const limit = Number(cl.limit_amount) || 0
  return { ...cl, used, secured, room: limit - used, loanCount: ls.length, depositCount: ds.length, loans: ls, deposits: ds }
}

async function listRaw(): Promise<FinCreditLine[]> {
  const { data, error } = await supabase.from('fin_credit_lines').select('*').order('bank', { ascending: true })
  if (error) throw error
  return (data as FinCreditLine[]) || []
}

export const creditLineService = {
  list: listRaw,

  /** Hạn mức + đã tính dư nợ đang rút / tiền gửi đảm bảo / room. */
  async listComputed(): Promise<FinCreditLineComputed[]> {
    const [cls, loans, deposits] = await Promise.all([listRaw(), loanService.list(), depositService.list()])
    return cls.map((cl) => computeLine(cl, loans, deposits))
  },

  async create(input: FinCreditLineInput): Promise<FinCreditLine> {
    const { data, error } = await supabase.from('fin_credit_lines').insert({
      bank: input.bank, contract_no: input.contract_no || null, line_type: input.line_type || 'vay',
      limit_amount: input.limit_amount ?? null, currency: input.currency || 'VND',
      from_date: input.from_date || null, to_date: input.to_date || null,
      interest_rate: input.interest_rate ?? null, status: input.status || 'active',
      note: input.note || null, created_by: input.created_by || null,
    }).select('*').single()
    if (error) throw error
    return data as FinCreditLine
  },

  async update(id: string, patch: Partial<FinCreditLineInput>): Promise<void> {
    const { error } = await supabase.from('fin_credit_lines')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('fin_credit_lines').delete().eq('id', id)
    if (error) throw error
  },
}
