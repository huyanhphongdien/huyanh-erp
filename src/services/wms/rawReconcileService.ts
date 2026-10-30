// ============================================================================
// KHO NGUYÊN LIỆU MỦ — đối chiếu giấy – máy (GĐ5, giai đoạn chạy song song)
// File: src/services/wms/rawReconcileService.ts
// Thủ kho ghi tồn ƯỚT sổ giấy theo loại mủ vào ngày X; máy tính tồn sổ máy đến ngày X
// (fn_raw_ton_den_ngay) và lệch % so với ngưỡng nguong_lech_kho_pct. Không đụng sổ máy.
// ============================================================================

import { supabase } from '../../lib/supabase'
import { dichLoiNhapKho } from './rawStockService'

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v ?? 0); return Number.isFinite(n) ? n : 0 }
const numOrNull = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

export interface RawReconcileRow {
  id: string
  facility_id: string
  facility_code: string | null
  ngay: string
  rubber_type: string
  rubber_type_name: string
  giay_wet_kg: number
  giay_dry_kg: number | null
  may_wet_kg: number | null
  may_dry_kg: number | null
  may_drc_pct: number | null
  lech_wet_kg: number
  lech_wet_pct: number | null
  lech_dry_kg: number | null
  nguong_pct: number
  vuot_nguong: boolean
  ly_do: string | null
  note: string | null
  nguoi_ghi: string | null
  created_at: string
  updated_at: string
}

export interface RawTonDenNgay {
  rubber_type: string
  rubber_type_name: string
  so_lo: number
  wet_kg: number
  dry_kg: number
  drc_pct: number | null
}

export interface RawTypeLite { code: string; name: string; nhom: string | null }

export const rawReconcileService = {
  async list(facilityId: string, opts: { from?: string; to?: string; limit?: number } = {}): Promise<RawReconcileRow[]> {
    let q = supabase.from('v_raw_doi_chieu').select('*').eq('facility_id', facilityId).order('ngay', { ascending: false }).order('rubber_type_name').limit(opts.limit ?? 400)
    if (opts.from) q = q.gte('ngay', opts.from)
    if (opts.to) q = q.lte('ngay', opts.to)
    const { data, error } = await q
    if (error) throw error
    return ((data ?? []) as any[]).map((r) => ({
      ...r, giay_wet_kg: num(r.giay_wet_kg), giay_dry_kg: numOrNull(r.giay_dry_kg), may_wet_kg: numOrNull(r.may_wet_kg), may_dry_kg: numOrNull(r.may_dry_kg),
      may_drc_pct: numOrNull(r.may_drc_pct), lech_wet_kg: num(r.lech_wet_kg), lech_wet_pct: numOrNull(r.lech_wet_pct), lech_dry_kg: numOrNull(r.lech_dry_kg),
      nguong_pct: num(r.nguong_pct), vuot_nguong: !!r.vuot_nguong,
    }))
  },

  async tonDenNgay(facilityId: string, ngay: string): Promise<RawTonDenNgay[]> {
    const { data, error } = await supabase.rpc('fn_raw_ton_den_ngay', { p_facility_id: facilityId, p_ngay: ngay })
    if (error) throw error
    return ((data ?? []) as any[]).map((r) => ({ ...r, so_lo: num(r.so_lo), wet_kg: num(r.wet_kg), dry_kg: num(r.dry_kg), drc_pct: numOrNull(r.drc_pct) }))
  },

  async listTypes(): Promise<RawTypeLite[]> {
    const { data, error } = await supabase.from('raw_rubber_types').select('code, name, nhom').order('name')
    if (error) throw error
    return ((data ?? []) as any[]).map((r) => ({ code: String(r.code), name: String(r.name ?? r.code), nhom: r.nhom ?? null }))
  },

  async ghi(input: { facilityId: string; ngay: string; rubberType: string; giayWetKg: number; giayDryKg?: number | null; lyDo?: string | null; note?: string | null }): Promise<string> {
    const { data, error } = await supabase.rpc('fn_nvl_ghi_doi_chieu', {
      p_facility_id: input.facilityId, p_ngay: input.ngay, p_rubber_type: input.rubberType, p_giay_wet_kg: input.giayWetKg,
      p_giay_dry_kg: input.giayDryKg ?? null, p_ly_do: input.lyDo ?? null, p_note: input.note ?? null,
    })
    if (error) throw new Error(dichLoiNhapKho(error))
    return String(data)
  },

  async xoa(id: string): Promise<void> {
    const { error } = await supabase.rpc('fn_nvl_xoa_doi_chieu', { p_id: id })
    if (error) throw new Error(dichLoiNhapKho(error))
  },

  toCsv(rows: RawReconcileRow[]): string {
    const head = ['Ngày', 'Loại mủ', 'Giấy ướt (kg)', 'Máy ướt (kg)', 'Lệch (kg)', 'Lệch (%)', 'Máy khô (kg)', 'DRC máy', 'Vượt ngưỡng', 'Lý do', 'Người ghi']
    const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const lines = rows.map((r) => [r.ngay, r.rubber_type_name, r.giay_wet_kg, r.may_wet_kg ?? '', r.lech_wet_kg, r.lech_wet_pct ?? '', r.may_dry_kg ?? '', r.may_drc_pct ?? '', r.vuot_nguong ? 'X' : '', r.ly_do ?? '', r.nguoi_ghi ?? ''].map(esc).join(','))
    return '﻿' + [head.join(','), ...lines].join('\n')
  },
}

export default rawReconcileService
