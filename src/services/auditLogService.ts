// ============================================================================
// Audit Log Service — Query log sự kiện (admin/BGĐ only)
// File: src/services/auditLogService.ts
// ============================================================================

import { supabase } from '../lib/supabase'

export interface AuditLogEntry {
  id: string
  table_name: string
  record_id: string
  record_code: string | null
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  changed_by_user_id: string | null
  changed_by_email: string | null
  changed_by_name: string | null
  changed_at: string
  changed_fields: Record<string, { old: any; new: any }> | null
  old_values: Record<string, any> | null
  new_values: Record<string, any> | null
  client_info: string | null
}

export interface AuditLogListParams {
  page?: number
  pageSize?: number
  tableName?: string                 // vd 'sales_orders'
  recordCode?: string                 // search theo SO-2026-XXXX
  recordId?: string                   // exact UUID
  changedByEmail?: string             // search theo email người sửa
  action?: 'INSERT' | 'UPDATE' | 'DELETE' | 'all'
  dateFrom?: string                   // YYYY-MM-DD
  dateTo?: string
}

export const auditLogService = {
  // ==========================================================================
  // GET LIST với filter + pagination
  // ==========================================================================
  async getList(
    params: AuditLogListParams = {},
  ): Promise<{ data: AuditLogEntry[]; total: number }> {
    const {
      page = 1,
      pageSize = 50,
      tableName,
      recordCode,
      recordId,
      changedByEmail,
      action,
      dateFrom,
      dateTo,
    } = params

    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })

    if (tableName) query = query.eq('table_name', tableName)
    if (recordCode) query = query.ilike('record_code', `%${recordCode}%`)
    if (recordId) query = query.eq('record_id', recordId)
    if (changedByEmail) query = query.ilike('changed_by_email', `%${changedByEmail}%`)
    if (action && action !== 'all') query = query.eq('action', action)
    if (dateFrom) query = query.gte('changed_at', dateFrom + 'T00:00:00Z')
    if (dateTo) query = query.lte('changed_at', dateTo + 'T23:59:59Z')

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await query
      .order('changed_at', { ascending: false })
      .range(from, to)

    if (error) {
      throw new Error('Không thể tải audit log: ' + error.message)
    }

    return {
      data: (data || []) as AuditLogEntry[],
      total: count || 0,
    }
  },

  // ==========================================================================
  // GET BY RECORD — tất cả changes của 1 record cụ thể
  // ==========================================================================
  async getByRecord(tableName: string, recordId: string): Promise<AuditLogEntry[]> {
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('table_name', tableName)
      .eq('record_id', recordId)
      .order('changed_at', { ascending: false })

    if (error) {
      throw new Error('Không thể tải lịch sử thay đổi: ' + error.message)
    }

    return (data || []) as AuditLogEntry[]
  },

  // ==========================================================================
  // STATS — Tổng quan cho dashboard
  // ==========================================================================
  async getStats(): Promise<{
    today: number
    last_7d: number
    last_30d: number
    by_action: { INSERT: number; UPDATE: number; DELETE: number }
  }> {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const day7Ago = new Date(now.getTime() - 7 * 86400000).toISOString()
    const day30Ago = new Date(now.getTime() - 30 * 86400000).toISOString()

    const [{ count: today }, { count: last7 }, { count: last30 }] = await Promise.all([
      supabase.from('audit_log').select('id', { count: 'exact', head: true }).gte('changed_at', todayStart),
      supabase.from('audit_log').select('id', { count: 'exact', head: true }).gte('changed_at', day7Ago),
      supabase.from('audit_log').select('id', { count: 'exact', head: true }).gte('changed_at', day30Ago),
    ])

    const [{ count: ins }, { count: upd }, { count: del }] = await Promise.all([
      supabase.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'INSERT').gte('changed_at', day30Ago),
      supabase.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'UPDATE').gte('changed_at', day30Ago),
      supabase.from('audit_log').select('id', { count: 'exact', head: true }).eq('action', 'DELETE').gte('changed_at', day30Ago),
    ])

    return {
      today: today || 0,
      last_7d: last7 || 0,
      last_30d: last30 || 0,
      by_action: { INSERT: ins || 0, UPDATE: upd || 0, DELETE: del || 0 },
    }
  },
}

// ============================================================================
// Helper: format changed_fields thành text dễ đọc
// ============================================================================
export function formatChangedFields(
  changedFields: Record<string, { old: any; new: any }> | null,
  maxFields = 5,
): string {
  if (!changedFields || Object.keys(changedFields).length === 0) return '—'
  const entries = Object.entries(changedFields).slice(0, maxFields)
  const parts = entries.map(([field, { old: o, new: n }]) => {
    const oStr = formatValue(o)
    const nStr = formatValue(n)
    return `${FIELD_LABELS[field] || field}: ${oStr} → ${nStr}`
  })
  const more = Object.keys(changedFields).length - maxFields
  if (more > 0) parts.push(`(+${more} field nữa)`)
  return parts.join('; ')
}

function formatValue(v: any): string {
  if (v === null || v === undefined || v === 'null') return '∅'
  if (typeof v === 'string') {
    if (v.length > 30) return `"${v.substring(0, 27)}..."`
    return `"${v}"`
  }
  if (typeof v === 'number') return v.toLocaleString('vi-VN')
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'object') return JSON.stringify(v).substring(0, 30)
  return String(v)
}

// Map field name → tên hiển thị tiếng Việt cho các field quan trọng
const FIELD_LABELS: Record<string, string> = {
  status: 'Trạng thái',
  current_stage: 'Bộ phận',
  current_owner_id: 'Owner',
  contract_no: 'Số HĐ',
  customer_id: 'Khách hàng',
  grade: 'Grade',
  quantity_tons: 'Số lượng (tấn)',
  unit_price: 'Đơn giá',
  total_value_usd: 'Thành tiền',
  delivery_date: 'Hạn giao',
  etd: 'ETD',
  eta: 'ETA',
  is_locked: 'Khóa HĐ',
  notes: 'Ghi chú',
  internal_notes: 'Ghi chú nội bộ',
  bl_received: 'BL đã nhận',
  bl_number: 'Số B/L',
  booking_reference: 'Số BKG',
  bank_name: 'Ngân hàng',
  payment_terms: 'Điều khoản TT',
  exchange_rate: 'Tỷ giá',
  ready_date: 'Sẵn hàng',
  shipped_at: 'Ngày xuất',
  confirmed_at: 'Ngày xác nhận',
  confirmed_by: 'Người xác nhận',
  locked_at: 'Khóa lúc',
  locked_by: 'Khóa bởi',
  stage_started_at: 'Bắt đầu stage',
  stage_sla_hours: 'SLA stage',
}
