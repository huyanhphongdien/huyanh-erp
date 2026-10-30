// ============================================================================
// KHO NGUYÊN LIỆU MỦ — cân lại / DRC định kỳ (GĐ2)
// File: src/services/wms/rawRecheckService.ts
// fn_nvl_can_lai ghi dòng recheck_adjust (chênh ướt / khô), weight_check_logs cũ,
// và cập nhật lô. Lệch khô quá ngưỡng thì DB bắt ghi lý do (CAN_LY_DO).
// ============================================================================

import { supabase } from '../../lib/supabase'
import { dichLoiNhapKho, type RawBatchBalance } from './rawStockService'

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v ?? 0); return Number.isFinite(n) ? n : 0 }
const numOrNull = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

export interface RecheckDue extends RawBatchBalance {
  chu_ky_can_lai_ngay: number
  can_lai_truoc_xuat_ngay: number
  qua_chu_ky: boolean
  qua_han_ngay: number
}

export interface DryVariance {
  ledger_id: string
  facility_id: string
  batch_id: string
  batch_no: string
  rubber_type: string
  rubber_type_name: string
  txn_date: string
  txn_type: string
  chenh_uot_kg: number
  chenh_kho_kg: number
  lech_kho_pct: number
  ly_do: string | null
  note: string | null
  nguoi_ghi: string | null
}

export interface CanLaiResult {
  batch_no: string
  wet_truoc: number; wet_sau: number
  drc_truoc: number; drc_sau: number
  kho_truoc: number; kho_sau: number
  lech_kho_pct: number | null
  vuot_nguong: boolean
}

export const rawRecheckService = {
  async listDue(facilityId?: string | null): Promise<RecheckDue[]> {
    let q = supabase.from('v_raw_recheck_due').select('*').order('ngay_tu_lan_do', { ascending: false })
    if (facilityId) q = q.eq('facility_id', facilityId)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r: any): RecheckDue => ({
      ...r, wet_kg: num(r.wet_kg), dry_kg: num(r.dry_kg), drc_pct: numOrNull(r.drc_pct), tuoi_ngay: num(r.tuoi_ngay),
      ngay_tu_lan_do: num(r.ngay_tu_lan_do), so_dong_so: num(r.so_dong_so), ticket_line_no: numOrNull(r.ticket_line_no),
      ton_dau_uoc: !!r.ton_dau_uoc, chu_ky_can_lai_ngay: num(r.chu_ky_can_lai_ngay), can_lai_truoc_xuat_ngay: num(r.can_lai_truoc_xuat_ngay),
      qua_chu_ky: !!r.qua_chu_ky, qua_han_ngay: num(r.qua_han_ngay),
    }))
  },

  async listVariance(facilityId?: string | null): Promise<DryVariance[]> {
    let q = supabase.from('v_raw_dry_variance').select('*').order('txn_date', { ascending: false })
    if (facilityId) q = q.eq('facility_id', facilityId)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r: any): DryVariance => ({ ...r, chenh_uot_kg: num(r.chenh_uot_kg), chenh_kho_kg: num(r.chenh_kho_kg), lech_kho_pct: num(r.lech_kho_pct) }))
  },

  /** Xem trước chênh lệch trước khi ghi (tính ở client, cùng công thức với DB) */
  preview(batch: RawBatchBalance, wetKg: number, drcPct: number | null, nguongPct: number) {
    const drc = drcPct ?? batch.drc_pct ?? 0
    const khoSau = Math.round(wetKg * drc) / 100
    const lech = batch.dry_kg > 0 ? (100 * (khoSau - batch.dry_kg)) / batch.dry_kg : null
    return {
      khoSau, chenhUot: wetKg - batch.wet_kg, chenhKho: khoSau - batch.dry_kg, lechPct: lech,
      chenhUotPct: batch.wet_kg > 0 ? (100 * (wetKg - batch.wet_kg)) / batch.wet_kg : null,
      vuotNguong: lech !== null && Math.abs(lech) > nguongPct,
    }
  },

  async canLai(batchId: string, wetKg: number, drcPct: number | null, lyDo?: string | null, note?: string | null): Promise<CanLaiResult> {
    const { data, error } = await supabase.rpc('fn_nvl_can_lai', {
      p_batch_id: batchId, p_wet_kg: wetKg, p_drc_pct: drcPct ?? null, p_ly_do: lyDo ?? null, p_note: note ?? null,
    })
    if (error) throw new Error(dichLoiNhapKho(error))
    const d = (data ?? {}) as any
    return {
      batch_no: d.batch_no, wet_truoc: num(d.wet_truoc), wet_sau: num(d.wet_sau), drc_truoc: num(d.drc_truoc), drc_sau: num(d.drc_sau),
      kho_truoc: num(d.kho_truoc), kho_sau: num(d.kho_sau), lech_kho_pct: numOrNull(d.lech_kho_pct), vuot_nguong: !!d.vuot_nguong,
    }
  },
}

export default rawRecheckService
