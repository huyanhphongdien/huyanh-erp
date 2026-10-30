// ============================================================================
// KHO NGUYÊN LIỆU MỦ — lệnh xuất cho sản xuất (GĐ2)
// File: src/services/wms/rawIssueService.ts
//
// Gợi ý FIFO tính ở client từ v_raw_stock_balance (lô tồn lâu nhất trước, ràng buộc
// % mủ tạp). Tạo lệnh / ghi kg cân / ký đều gọi hàm DB; chỉ chữ ký "thủ kho nhận"
// mới trừ sổ kho khô. Cột numeric về client là CHUỖI → bọc num().
// ============================================================================

import { supabase } from '../../lib/supabase'
import { dichLoiNhapKho, rawStockService, type RawBatchBalance } from './rawStockService'
import type { RawRubberType, RawRubberGroup } from './raw.types'

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v ?? 0); return Number.isFinite(n) ? n : 0 }
const numOrNull = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

export type RawIssueStatus = 'draft' | 'submitted' | 'qc_confirmed' | 'received' | 'cancelled'
export type RawIssuePurpose = 'production' | 'sale' | 'transfer'

export const RAW_ISSUE_STATUS_LABELS: Record<RawIssueStatus, string> = {
  draft: 'Nháp · đang cân', submitted: 'Bên giao đã ký', qc_confirmed: 'QS đã xác nhận', received: 'Thủ kho đã nhận · đã trừ sổ', cancelled: 'Đã hủy',
}
export const RAW_ISSUE_STATUS_COLORS: Record<RawIssueStatus, string> = {
  draft: 'default', submitted: 'blue', qc_confirmed: 'gold', received: 'green', cancelled: 'red',
}
export const RAW_ISSUE_PURPOSE_LABELS: Record<RawIssuePurpose, string> = {
  production: 'Xuất sản xuất', sale: 'Xuất bán (hàng thương mại)', transfer: 'Chuyển kho đi',
}

export interface RawIssueOrder {
  id: string
  code: string
  facility_id: string
  facility_code: string | null
  muc_dich: RawIssuePurpose
  production_order_id: string | null
  production_code: string | null
  production_grade: string | null
  target_grade: string | null
  nhu_cau_kho_kg: number | null
  max_tap_pct: number | null
  status: RawIssueStatus
  submitted_at: string | null
  submitted_name: string | null
  qc_confirmed_at: string | null
  qc_confirmed_name: string | null
  received_at: string | null
  received_name: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  note: string | null
  created_at: string
  so_dong: number
  planned_wet_kg: number
  planned_dry_kg: number
  actual_wet_kg: number | null
  actual_dry_kg: number | null
  so_dong_chua_can: number
}

export interface RawIssueLine {
  id: string
  order_id: string
  line_no: number
  batch_id: string
  batch_no: string
  rubber_type: RawRubberType
  rubber_type_name: string
  nhom: RawRubberGroup
  supplier_name: string | null
  planned_wet_kg: number
  planned_drc_pct: number
  planned_dry_kg: number
  actual_wet_kg: number | null
  actual_drc_pct: number | null
  actual_dry_kg: number | null
  weighed_at: string | null
  note: string | null
  ton_wet_kg: number | null
  ton_dry_kg: number | null
  ton_drc_pct: number | null
  tuoi_ngay: number | null
}

export interface ProductionOrderLite {
  id: string
  code: string
  status: string
  target_grade: string | null
  product_type: string | null
  target_quantity: number | null
  scheduled_start_date: string | null
}

export interface FifoPick extends RawBatchBalance {
  selected: boolean
  planned_wet_kg: number
}

function normalizeOrder(r: any): RawIssueOrder {
  return {
    ...r,
    nhu_cau_kho_kg: numOrNull(r.nhu_cau_kho_kg), max_tap_pct: numOrNull(r.max_tap_pct),
    so_dong: num(r.so_dong), planned_wet_kg: num(r.planned_wet_kg), planned_dry_kg: num(r.planned_dry_kg),
    actual_wet_kg: numOrNull(r.actual_wet_kg), actual_dry_kg: numOrNull(r.actual_dry_kg), so_dong_chua_can: num(r.so_dong_chua_can),
  }
}
function normalizeLine(r: any): RawIssueLine {
  return {
    ...r,
    line_no: num(r.line_no), planned_wet_kg: num(r.planned_wet_kg), planned_drc_pct: num(r.planned_drc_pct), planned_dry_kg: num(r.planned_dry_kg),
    actual_wet_kg: numOrNull(r.actual_wet_kg), actual_drc_pct: numOrNull(r.actual_drc_pct), actual_dry_kg: numOrNull(r.actual_dry_kg),
    ton_wet_kg: numOrNull(r.ton_wet_kg), ton_dry_kg: numOrNull(r.ton_dry_kg), ton_drc_pct: numOrNull(r.ton_drc_pct), tuoi_ngay: numOrNull(r.tuoi_ngay),
  }
}

export const rawIssueService = {
  async list(opts: { facilityId?: string | null; status?: RawIssueStatus | 'open' | null; limit?: number } = {}): Promise<RawIssueOrder[]> {
    let q = supabase.from('v_raw_issue_orders').select('*').order('created_at', { ascending: false })
    if (opts.facilityId) q = q.eq('facility_id', opts.facilityId)
    if (opts.status === 'open') q = q.in('status', ['draft', 'submitted', 'qc_confirmed'])
    else if (opts.status) q = q.eq('status', opts.status)
    q = q.limit(opts.limit ?? 100)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(normalizeOrder)
  },

  async get(id: string): Promise<{ order: RawIssueOrder; lines: RawIssueLine[] } | null> {
    const [{ data: o, error: e1 }, { data: ls, error: e2 }] = await Promise.all([
      supabase.from('v_raw_issue_orders').select('*').eq('id', id).maybeSingle(),
      supabase.from('v_raw_issue_lines').select('*').eq('order_id', id).order('line_no'),
    ])
    if (e1) throw e1
    if (e2) throw e2
    if (!o) return null
    return { order: normalizeOrder(o), lines: (ls ?? []).map(normalizeLine) }
  },

  /** Lệnh sản xuất đang mở để gắn vào lệnh xuất */
  async listProductionOrders(): Promise<ProductionOrderLite[]> {
    const { data, error } = await supabase
      .from('production_orders')
      .select('id, code, status, target_grade, product_type, target_quantity, scheduled_start_date')
      .in('status', ['draft', 'scheduled', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(60)
    if (error) throw error
    return (data ?? []).map((r: any) => ({ ...r, target_quantity: numOrNull(r.target_quantity) }))
  },

  /**
   * Gợi ý FIFO: lô tồn lâu nhất trước, chỉ loại cho phép, tick đến khi đủ nhu cầu khô.
   * Lô mủ tạp bị bỏ qua nếu thêm vào làm % tạp vượt giới hạn (sẽ thử lô khác).
   */
  async goiYFifo(opts: { facilityId: string; rubberTypes: RawRubberType[]; needDryKg: number; maxTapPct?: number | null }): Promise<FifoPick[]> {
    const lots = (await rawStockService.getBatches({ facilityId: opts.facilityId, limit: 1000 }))
      .filter((b) => opts.rubberTypes.includes(b.rubber_type) && b.nguon_hang !== 'thuong_mai')
      .sort((a, b) => b.tuoi_ngay - a.tuoi_ngay)
    const picks: FifoPick[] = lots.map((b) => ({ ...b, selected: false, planned_wet_kg: b.wet_kg }))
    let dry = 0, tap = 0
    const maxTap = opts.maxTapPct ?? null
    for (const p of picks) {
      if (dry >= opts.needDryKg) break
      const nextDry = dry + p.dry_kg
      const nextTap = tap + (p.rubber_type === 'mu_tap' ? p.dry_kg : 0)
      if (maxTap !== null && nextDry > 0 && (100 * nextTap) / nextDry > maxTap && p.rubber_type === 'mu_tap') continue
      p.selected = true; dry = nextDry; tap = nextTap
    }
    return picks
  },

  tongHop(picks: FifoPick[], needDryKg: number) {
    const sel = picks.filter((p) => p.selected)
    const wet = sel.reduce((s, p) => s + p.planned_wet_kg, 0)
    const dry = sel.reduce((s, p) => s + (p.drc_pct ?? 0) * p.planned_wet_kg / 100, 0)
    const tap = sel.reduce((s, p) => s + (p.rubber_type === 'mu_tap' ? (p.drc_pct ?? 0) * p.planned_wet_kg / 100 : 0), 0)
    return {
      soLo: sel.length, wet, dry, tapPct: dry > 0 ? (100 * tap) / dry : 0,
      pct: needDryKg > 0 ? (100 * dry) / needDryKg : 0, chenh: dry - needDryKg,
      drcBq: wet > 0 ? (100 * dry) / wet : null, tuoiMax: sel.reduce((m, p) => Math.max(m, p.tuoi_ngay), 0),
    }
  },

  async create(input: {
    facilityId: string; mucDich: RawIssuePurpose; productionOrderId?: string | null; targetGrade?: string | null
    needDryKg?: number | null; maxTapPct?: number | null; note?: string | null
    lines: Array<{ batch_id: string; planned_wet_kg: number }>
  }): Promise<string> {
    const { data, error } = await supabase.rpc('fn_nvl_tao_lenh_xuat', {
      p_facility_id: input.facilityId, p_muc_dich: input.mucDich, p_production_order_id: input.productionOrderId ?? null,
      p_target_grade: input.targetGrade ?? null, p_nhu_cau_kho_kg: input.needDryKg ?? null, p_max_tap_pct: input.maxTapPct ?? null,
      p_note: input.note ?? null, p_lines: input.lines,
    })
    if (error) throw new Error(dichLoiNhapKho(error))
    return String(data)
  },

  async ghiCan(lineId: string, actualWetKg: number, note?: string | null): Promise<void> {
    const { error } = await supabase.rpc('fn_nvl_ghi_can_xuat', { p_line_id: lineId, p_actual_wet_kg: actualWetKg, p_note: note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
  },

  async ky(orderId: string, buoc: 'submit' | 'qc_confirm' | 'receive' | 'cancel', note?: string | null): Promise<{ so_dong: number; uot_kg: number; kho_kg: number }> {
    const { data, error } = await supabase.rpc('fn_nvl_ky_lenh_xuat', { p_order_id: orderId, p_buoc: buoc, p_note: note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    return { so_dong: num((data as any)?.so_dong), uot_kg: num((data as any)?.uot_kg), kho_kg: num((data as any)?.kho_kg) }
  },
}

export default rawIssueService
