// ============================================================================
// HÀNG CHÈN (MIX) — kho chèn, phiếu chèn theo ca (GĐ4)
// File: src/services/wms/mixService.ts
// ============================================================================

import { supabase } from '../../lib/supabase'
import { dichLoiNhapKho } from './rawStockService'

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v ?? 0); return Number.isFinite(n) ? n : 0 }
const numOrNull = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

export type MixSourceType = 'loi' | 'dkl' | 'std' | 'mua_ngoai' | 'khac'
export type MixLotStatus = 'available' | 'in_use' | 'depleted' | 'cancelled'
export type MixIssueStatus = 'issued' | 'returned' | 'submitted' | 'qc_confirmed' | 'received' | 'cancelled'
export type MixPurpose = 'chay_lai' | 'nang_chi_so'

export const MIX_SOURCE_LABELS: Record<MixSourceType, string> = {
  loi: 'Hàng lỗi (LOI)', dkl: 'Dính kim loại (DKL)', std: 'Hàng chuẩn (kho TP)', mua_ngoai: 'Mua ngoài', khac: 'Khác',
}
export const MIX_LOT_STATUS_LABELS: Record<MixLotStatus, string> = { available: 'Sẵn sàng', in_use: 'Đang dùng dở', depleted: 'Đã hết', cancelled: 'Đã hủy' }
export const MIX_LOT_STATUS_COLORS: Record<MixLotStatus, string> = { available: 'green', in_use: 'blue', depleted: 'default', cancelled: 'red' }
export const MIX_ISSUE_STATUS_LABELS: Record<MixIssueStatus, string> = {
  issued: 'Đã lấy · đang ở dây chuyền', returned: 'Đã trả · chờ ký', submitted: 'Bên giao đã ký', qc_confirmed: 'QS đã xác nhận', received: 'Thủ kho đã nhận', cancelled: 'Đã hủy',
}
export const MIX_ISSUE_STATUS_COLORS: Record<MixIssueStatus, string> = { issued: 'blue', returned: 'gold', submitted: 'cyan', qc_confirmed: 'purple', received: 'green', cancelled: 'red' }
export const MIX_PURPOSE_LABELS: Record<MixPurpose, string> = { chay_lai: 'Chạy lại', nang_chi_so: 'Nâng chỉ số' }

export interface MixLot {
  id: string
  code: string
  facility_id: string
  facility_code: string | null
  source_type: MixSourceType
  source_desc: string | null
  source_ref_type: string | null
  source_ref_id: string | null
  grade: string | null
  kg_in: number
  kg_used: number
  kg_at_line: number
  ton_kg: number
  po: number | null
  mooney: number | null
  pri: number | null
  qc_allow_mix_pct: number | null
  qc_allow_rerun: boolean
  metal_cleared: boolean
  status: MixLotStatus
  received_date: string
  tuoi_ngay: number
  note: string | null
  created_name: string | null
  so_anh: number
  created_at: string
}

export interface MixIssue {
  id: string
  code: string
  facility_id: string
  facility_code: string | null
  mix_lot_id: string
  lot_code: string
  source_type: MixSourceType
  source_desc: string | null
  lot_grade: string | null
  po: number | null
  mooney: number | null
  pri: number | null
  shift_date: string
  shift_id: string | null
  shift_code: string | null
  shift_name: string | null
  team: string | null
  purpose: MixPurpose
  target_index: string | null
  target_value: number | null
  kg_out: number
  out_at: string
  out_name: string | null
  kg_return: number | null
  return_at: string | null
  return_name: string | null
  kg_used: number | null
  handover_to_next: boolean
  handover_from_issue_id: string | null
  production_order_id: string | null
  production_code: string | null
  output_batch_id: string | null
  output_batch_no: string | null
  status: MixIssueStatus
  submitted_name: string | null
  submitted_at: string | null
  qc_confirmed_name: string | null
  qc_confirmed_at: string | null
  received_name: string | null
  received_at: string | null
  cancel_reason: string | null
  note: string | null
  so_anh_lay: number
  so_anh_tra: number
  thieu_anh: string | null
  created_at: string
}

export interface MixBalance {
  facility_id: string
  facility_code: string | null
  so_lo: number
  tai_kho_kg: number
  o_day_chuyen_kg: number
  tong_con_kg: number
  nhap_thang_kg: number
  tieu_hao_tong_kg: number
}

export interface MixMovement {
  facility_id: string
  thoi_diem: string
  loai: 'nhap_lo' | 'lay' | 'tra'
  lot_code: string
  issue_code: string | null
  kg: number
  mo_ta: string | null
  nguoi: string | null
  lot_id: string
  issue_id: string | null
}

export interface ShiftLite { id: string; code: string; name: string }

const normLot = (r: any): MixLot => ({
  ...r, kg_in: num(r.kg_in), kg_used: num(r.kg_used), kg_at_line: num(r.kg_at_line), ton_kg: num(r.ton_kg),
  po: numOrNull(r.po), mooney: numOrNull(r.mooney), pri: numOrNull(r.pri), qc_allow_mix_pct: numOrNull(r.qc_allow_mix_pct),
  qc_allow_rerun: !!r.qc_allow_rerun, metal_cleared: !!r.metal_cleared, tuoi_ngay: num(r.tuoi_ngay), so_anh: num(r.so_anh),
})
const normIssue = (r: any): MixIssue => ({
  ...r, po: numOrNull(r.po), mooney: numOrNull(r.mooney), pri: numOrNull(r.pri), target_value: numOrNull(r.target_value),
  kg_out: num(r.kg_out), kg_return: numOrNull(r.kg_return), kg_used: numOrNull(r.kg_used), handover_to_next: !!r.handover_to_next,
  so_anh_lay: num(r.so_anh_lay), so_anh_tra: num(r.so_anh_tra),
})

export const mixService = {
  async listLots(facilityId?: string | null, includeDone = false): Promise<MixLot[]> {
    let q = supabase.from('v_mix_lots').select('*').order('received_date', { ascending: true })
    if (facilityId) q = q.eq('facility_id', facilityId)
    if (!includeDone) q = q.in('status', ['available', 'in_use'])
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(normLot)
  },

  async getLot(id: string): Promise<MixLot | null> {
    const { data, error } = await supabase.from('v_mix_lots').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? normLot(data) : null
  },

  async findLotByCode(code: string): Promise<MixLot | null> {
    const { data, error } = await supabase.from('v_mix_lots').select('*').ilike('code', code.trim()).maybeSingle()
    if (error) throw error
    return data ? normLot(data) : null
  },

  async createLot(input: {
    facilityId: string; sourceType: MixSourceType; sourceDesc?: string | null; grade?: string | null; kgIn: number
    po?: number | null; mooney?: number | null; pri?: number | null; qcAllowMixPct?: number | null; qcAllowRerun?: boolean; metalCleared?: boolean
    receivedDate?: string | null; note?: string | null; sourceRefType?: string | null; sourceRefId?: string | null
  }): Promise<string> {
    const { data, error } = await supabase.rpc('fn_mix_tao_lo', {
      p_facility_id: input.facilityId, p_source_type: input.sourceType, p_source_desc: input.sourceDesc ?? null, p_grade: input.grade ?? null, p_kg_in: input.kgIn,
      p_po: input.po ?? null, p_mooney: input.mooney ?? null, p_pri: input.pri ?? null, p_qc_allow_mix_pct: input.qcAllowMixPct ?? null,
      p_qc_allow_rerun: input.qcAllowRerun ?? true, p_metal_cleared: input.metalCleared ?? false, p_received_date: input.receivedDate ?? null,
      p_note: input.note ?? null, p_source_ref_type: input.sourceRefType ?? null, p_source_ref_id: input.sourceRefId ?? null,
    })
    if (error) throw new Error(dichLoiNhapKho(error))
    return String(data)
  },

  async listIssues(opts: { facilityId?: string | null; date?: string | null; status?: MixIssueStatus[] | null; lotId?: string | null; limit?: number } = {}): Promise<MixIssue[]> {
    let q = supabase.from('v_mix_issues').select('*').order('out_at', { ascending: false }).limit(opts.limit ?? 200)
    if (opts.facilityId) q = q.eq('facility_id', opts.facilityId)
    if (opts.date) q = q.eq('shift_date', opts.date)
    if (opts.status?.length) q = q.in('status', opts.status)
    if (opts.lotId) q = q.eq('mix_lot_id', opts.lotId)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(normIssue)
  },

  async getIssue(id: string): Promise<MixIssue | null> {
    const { data, error } = await supabase.from('v_mix_issues').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? normIssue(data) : null
  },

  async findIssueByCode(code: string): Promise<MixIssue | null> {
    const { data, error } = await supabase.from('v_mix_issues').select('*').ilike('code', code.trim()).maybeSingle()
    if (error) throw error
    return data ? normIssue(data) : null
  },

  async lay(input: { lotId: string; kg: number; shiftDate?: string | null; shiftId?: string | null; team?: string | null; purpose: MixPurpose; targetIndex?: string | null; targetValue?: number | null; productionOrderId?: string | null; note?: string | null }): Promise<string> {
    const { data, error } = await supabase.rpc('fn_mix_lay', {
      p_lot_id: input.lotId, p_kg: input.kg, p_shift_date: input.shiftDate ?? null, p_shift_id: input.shiftId ?? null, p_team: input.team ?? null,
      p_purpose: input.purpose, p_target_index: input.targetIndex ?? null, p_target_value: input.targetValue ?? null,
      p_production_order_id: input.productionOrderId ?? null, p_note: input.note ?? null,
    })
    if (error) throw new Error(dichLoiNhapKho(error))
    return String(data)
  },

  async tra(issueId: string, kgReturn: number, handover: boolean, note?: string | null, outputBatchId?: string | null): Promise<{ kg_used: number }> {
    const { data, error } = await supabase.rpc('fn_mix_tra', { p_issue_id: issueId, p_kg_return: kgReturn, p_handover: handover, p_note: note ?? null, p_output_batch_id: outputBatchId ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    return { kg_used: num((data as any)?.kg_used) }
  },

  async ky(issueId: string, buoc: 'submit' | 'qc_confirm' | 'receive' | 'cancel', note?: string | null): Promise<{ next_issue_id: string | null }> {
    const { data, error } = await supabase.rpc('fn_mix_ky', { p_issue_id: issueId, p_buoc: buoc, p_note: note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    return { next_issue_id: (data as any)?.next_issue_id ?? null }
  },

  async balance(facilityId: string): Promise<MixBalance | null> {
    const { data, error } = await supabase.from('v_mix_balance').select('*').eq('facility_id', facilityId).maybeSingle()
    if (error) throw error
    if (!data) return null
    const r: any = data
    return { ...r, so_lo: num(r.so_lo), tai_kho_kg: num(r.tai_kho_kg), o_day_chuyen_kg: num(r.o_day_chuyen_kg), tong_con_kg: num(r.tong_con_kg), nhap_thang_kg: num(r.nhap_thang_kg), tieu_hao_tong_kg: num(r.tieu_hao_tong_kg) }
  },

  async movements(facilityId: string, days = 14): Promise<MixMovement[]> {
    const from = new Date(); from.setDate(from.getDate() - days)
    const { data, error } = await supabase.from('v_mix_movements').select('*').eq('facility_id', facilityId).gte('thoi_diem', from.toISOString()).order('thoi_diem', { ascending: false })
    if (error) throw error
    return ((data ?? []) as any[]).map((r) => ({ ...r, kg: num(r.kg) }))
  },

  async listShifts(): Promise<ShiftLite[]> {
    const { data, error } = await supabase.from('shifts').select('*').order('code')
    if (error) return []
    return ((data ?? []) as any[]).map((r) => ({ id: r.id, code: String(r.code ?? ''), name: String(r.name ?? r.code ?? '') }))
  },
}

export default mixService
