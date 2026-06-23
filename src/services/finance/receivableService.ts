// ============================================================================
// FINANCE — Phải thu khách hàng (Đợt 4)
// File: src/services/finance/receivableService.ts
// ============================================================================
import { supabase } from '../../lib/supabase'

export type ARStatus = 'pending' | 'received'
export type ARAlert = 'received' | 'overdue' | 'due' | 'soon' | 'ok'
export type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90p'

export interface FinReceivable {
  id: string
  sales_order_id: string | null
  buyer_name: string
  contract_no: string | null
  commodity: string | null
  currency: string
  amount: number
  amount_received: number | null
  etd: string | null
  atd: string | null
  term_days: number | null
  due_date: string | null
  doc_sent_date: string | null
  doc_tracking: string | null
  bank: string | null
  received_date: string | null
  status: ARStatus
  note: string | null
  created_at: string
  updated_at: string
}

export interface FinReceivableComputed extends FinReceivable {
  remaining: number          // còn phải thu = amount - amount_received
  effective_due: string | null
  days_to_due: number        // due - today (>0 còn, <0 quá hạn)
  alert: ARAlert
  aging: AgingBucket         // tuổi nợ (theo ngày quá hạn)
}

export const AR_ALERT_LABEL: Record<ARAlert, string> = {
  received: 'Đã thu', overdue: 'QUÁ HẠN', due: 'Sắp về (≤7d)', soon: 'Sắp về (≤30d)', ok: 'Trong hạn',
}
export const AR_ALERT_COLOR: Record<ARAlert, string> = {
  received: '#16a34a', overdue: '#dc2626', due: '#ea580c', soon: '#ca8a04', ok: '#475569',
}
export const AGING_LABEL: Record<AgingBucket, string> = {
  current: 'Trong hạn', d1_30: 'Quá 1–30', d31_60: 'Quá 31–60', d61_90: 'Quá 61–90', d90p: 'Quá >90',
}

const WARN_DUE = 7
const WARN_SOON = 30

function dDiff(a: Date, b: Date): number {
  return Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86_400_000)
}
function addDays(s: string, n: number): string {
  const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function computeAR(r: FinReceivable, today = new Date()): FinReceivableComputed {
  const remaining = Math.max(0, (Number(r.amount) || 0) - (Number(r.amount_received) || 0))
  const isReceived = r.status === 'received' || !!r.received_date || remaining <= 0
  // hạn thu = due_date, hoặc (atd||etd) + term_days
  let effective_due = r.due_date
  if (!effective_due && (r.atd || r.etd) && r.term_days) effective_due = addDays((r.atd || r.etd) as string, r.term_days)
  else if (!effective_due) effective_due = r.atd || r.etd
  const due = effective_due ? new Date(effective_due + 'T00:00:00') : null
  const days = due ? dDiff(due, today) : 9999
  let alert: ARAlert
  if (isReceived) alert = 'received'
  else if (days < 0) alert = 'overdue'
  else if (days <= WARN_DUE) alert = 'due'
  else if (days <= WARN_SOON) alert = 'soon'
  else alert = 'ok'
  const over = -days
  let aging: AgingBucket = 'current'
  if (!isReceived && over > 0) aging = over <= 30 ? 'd1_30' : over <= 60 ? 'd31_60' : over <= 90 ? 'd61_90' : 'd90p'
  return { ...r, remaining, effective_due, days_to_due: days, alert, aging }
}

export type FinReceivableInput = Partial<Omit<FinReceivable, 'id' | 'created_at' | 'updated_at'>> & {
  buyer_name: string; created_by?: string | null
}

export const receivableService = {
  async list(): Promise<FinReceivableComputed[]> {
    const { data, error } = await supabase.from('fin_receivables').select('*').order('due_date', { ascending: true, nullsFirst: false })
    if (error) throw error
    return ((data as FinReceivable[]) || []).map((r) => computeAR(r))
  },

  async create(input: FinReceivableInput): Promise<FinReceivable> {
    const { data, error } = await supabase.from('fin_receivables').insert({
      sales_order_id: input.sales_order_id || null, buyer_name: input.buyer_name,
      contract_no: input.contract_no || null, commodity: input.commodity || null,
      currency: input.currency || 'USD', amount: input.amount || 0, amount_received: input.amount_received ?? 0,
      etd: input.etd || null, atd: input.atd || null, term_days: input.term_days ?? null, due_date: input.due_date || null,
      doc_sent_date: input.doc_sent_date || null, doc_tracking: input.doc_tracking || null, bank: input.bank || null,
      received_date: input.received_date || null, status: input.status || 'pending', note: input.note || null,
      created_by: input.created_by || null,
    }).select('*').single()
    if (error) throw error
    return data as FinReceivable
  },

  async update(id: string, patch: Partial<FinReceivableInput>): Promise<void> {
    const { error } = await supabase.from('fin_receivables')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('fin_receivables').delete().eq('id', id)
    if (error) throw error
  },
}
