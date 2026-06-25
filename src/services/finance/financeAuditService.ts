// ============================================================================
// Nhật ký kiểm toán MODULE TÀI CHÍNH — query bảng fin_audit_log (CHỈ ADMIN).
// Bảng + trigger ở docs/migrations/finance_audit_log_v1.sql (RLS admin-only).
// Tái dùng kiểu AuditLogEntry của auditLogService cho đồng nhất.
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { AuditLogEntry, AuditLogListParams } from '../auditLogService'

export type { AuditLogEntry, AuditLogListParams } from '../auditLogService'

const TABLE = 'fin_audit_log'

export const financeAuditService = {
  async getList(params: AuditLogListParams = {}): Promise<{ data: AuditLogEntry[]; total: number }> {
    const {
      page = 1, pageSize = 50, tableName, recordCode, recordId,
      changedByEmail, action, dateFrom, dateTo,
    } = params

    let q = supabase.from(TABLE).select('*', { count: 'exact' })
    if (tableName) q = q.eq('table_name', tableName)
    if (recordCode) q = q.ilike('record_code', `%${recordCode}%`)
    if (recordId) q = q.eq('record_id', recordId)
    if (changedByEmail) q = q.ilike('changed_by_email', `%${changedByEmail}%`)
    if (action && action !== 'all') q = q.eq('action', action)
    if (dateFrom) q = q.gte('changed_at', dateFrom + 'T00:00:00Z')
    if (dateTo) q = q.lte('changed_at', dateTo + 'T23:59:59Z')

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const { data, error, count } = await q.order('changed_at', { ascending: false }).range(from, to)
    if (error) throw new Error('Không thể tải nhật ký tài chính: ' + error.message)
    return { data: (data || []) as AuditLogEntry[], total: count || 0 }
  },

  async getStats(): Promise<{ today: number; last_7d: number; last_30d: number; by_action: { INSERT: number; UPDATE: number; DELETE: number } }> {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const d7 = new Date(now.getTime() - 7 * 86400000).toISOString()
    const d30 = new Date(now.getTime() - 30 * 86400000).toISOString()

    const [{ count: today }, { count: l7 }, { count: l30 }] = await Promise.all([
      supabase.from(TABLE).select('id', { count: 'exact', head: true }).gte('changed_at', todayStart),
      supabase.from(TABLE).select('id', { count: 'exact', head: true }).gte('changed_at', d7),
      supabase.from(TABLE).select('id', { count: 'exact', head: true }).gte('changed_at', d30),
    ])
    const [{ count: ins }, { count: upd }, { count: del }] = await Promise.all([
      supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('action', 'INSERT').gte('changed_at', d30),
      supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('action', 'UPDATE').gte('changed_at', d30),
      supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('action', 'DELETE').gte('changed_at', d30),
    ])
    return {
      today: today || 0, last_7d: l7 || 0, last_30d: l30 || 0,
      by_action: { INSERT: ins || 0, UPDATE: upd || 0, DELETE: del || 0 },
    }
  },
}

// ── Nhãn bảng fin_* → tên tiếng Việt ──
export const FIN_TABLE_LABELS: Record<string, string> = {
  fin_loans: '💰 Khoản vay',
  fin_deposits: '🏦 Tiền gửi',
  fin_credit_lines: '📊 Hạn mức',
  fin_collaterals: '🏛 Tài sản ĐB',
  fin_interest_periods: '٪ Kỳ lãi',
  fin_loan_repayments: '💲 Trả nợ',
  fin_receivables: '📥 Phải thu',
  fin_cash_balances: '💵 Tồn quỹ',
  fin_recurring_payables: '📤 Phải nộp',
  fin_attachments: '📎 Đính kèm',
}

// ── Nhãn field → tiếng Việt (cho phần diff cũ → mới) ──
export const FIN_FIELD_LABELS: Record<string, string> = {
  bank: 'Ngân hàng', bank_name: 'Ngân hàng',
  loan_no: 'Số khế ước', deposit_no: 'Số HĐTG', contract_no: 'Số HĐ', credit_line_no: 'Số HĐTD',
  amount: 'Số tiền', principal: 'Dư nợ gốc', principal_amount: 'Dư nợ gốc', limit_amount: 'Hạn mức',
  interest_rate: 'Lãi suất', currency: 'Tiền tệ', status: 'Trạng thái', notes: 'Ghi chú', note: 'Ghi chú',
  disbursement_date: 'Ngày giải ngân', due_date: 'Ngày đến hạn', start_date: 'Từ ngày', end_date: 'Đến ngày',
  deposit_date: 'Ngày gửi', maturity_date: 'Ngày đáo hạn',
  credit_line_id: 'Thuộc hạn mức', secured_credit_line_id: 'Đảm bảo cho hạn mức', loan_id: 'Khoản vay',
  customer_name: 'Khách hàng', buyer_name: 'Khách hàng', term_days: 'Số ngày nợ', atd: 'ATD', etd: 'ETD',
  value_usd: 'Giá trị (USD)', received_date: 'Ngày tiền về', collect_due_date: 'Hạn thu',
  appraised_value: 'Định giá', secured_value: 'Giá trị bảo đảm', asset_name: 'Tên tài sản', asset_type: 'Loại tài sản',
  balance_vnd: 'Số dư VNĐ', balance_usd: 'Số dư USD', as_of_date: 'Cập nhật ngày',
  pay_day: 'Ngày nộp', est_amount: 'Số tiền ước', category: 'Nhóm', name: 'Tên',
  paid: 'Đã trả', is_paid: 'Đã trả', paid_at: 'Ngày trả', period_no: 'Kỳ', interest_amount: 'Tiền lãi',
  freq: 'Kỳ trả', interest_freq: 'Kỳ trả lãi', interest_day: 'Ngày trả lãi',
}

// Format changed_fields dùng nhãn tài chính (thay cho formatChangedFields của auditLogService)
export function formatFinChanges(changed: Record<string, { old: any; new: any }> | null, maxFields = 3): string {
  if (!changed || Object.keys(changed).length === 0) return '—'
  const entries = Object.entries(changed).slice(0, maxFields)
  const parts = entries.map(([f, { old: o, new: n }]) => `${FIN_FIELD_LABELS[f] || f}: ${fmtVal(o)} → ${fmtVal(n)}`)
  const more = Object.keys(changed).length - maxFields
  if (more > 0) parts.push(`(+${more} trường nữa)`)
  return parts.join('; ')
}

function fmtVal(v: any): string {
  if (v === null || v === undefined || v === 'null') return '∅'
  if (typeof v === 'string') return v.length > 30 ? `"${v.slice(0, 27)}…"` : `"${v}"`
  if (typeof v === 'number') return v.toLocaleString('vi-VN')
  if (typeof v === 'boolean') return v ? 'có' : 'không'
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 30)
  return String(v)
}
