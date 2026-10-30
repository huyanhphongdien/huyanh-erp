// ============================================================================
// KHO NGUYÊN LIỆU MỦ — kiểm kê (GĐ3)
// File: src/services/wms/rawStocktakeService.ts
// Tạo phiếu = chụp sổ; thủ kho đếm; BGĐ / người duyệt ghi sổ stocktake_adjust + khóa kỳ.
// ============================================================================

import { supabase } from '../../lib/supabase'
import { dichLoiNhapKho } from './rawStockService'
import type { RawRubberType, RawRubberGroup } from './raw.types'

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v ?? 0); return Number.isFinite(n) ? n : 0 }
const numOrNull = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

export type RawStocktakeStatus = 'draft' | 'counted' | 'approved' | 'cancelled'
export const RAW_STOCKTAKE_STATUS_LABELS: Record<RawStocktakeStatus, string> = {
  draft: 'Đang đếm', counted: 'Đếm xong · chờ duyệt', approved: 'Đã duyệt · đã ghi sổ', cancelled: 'Đã hủy',
}
export const RAW_STOCKTAKE_STATUS_COLORS: Record<RawStocktakeStatus, string> = { draft: 'blue', counted: 'gold', approved: 'green', cancelled: 'red' }

export interface RawStocktake {
  id: string
  code: string
  facility_id: string
  facility_code: string | null
  ngay_kiem_ke: string
  status: RawStocktakeStatus
  note: string | null
  counted_at: string | null
  counted_name: string | null
  approved_at: string | null
  approved_name: string | null
  created_at: string
  so_lo: number
  so_lo_chua_dem: number
  book_dry_kg: number
  counted_dry_kg: number | null
  chenh_kho_kg: number | null
  so_lo_lech: number
}

export interface RawStocktakeLine {
  id: string
  stocktake_id: string
  batch_id: string
  batch_no: string
  supplier_name: string | null
  rubber_type: RawRubberType
  rubber_type_name: string
  nhom: RawRubberGroup
  tuoi_ngay: number | null
  book_wet_kg: number
  book_drc_pct: number | null
  book_dry_kg: number
  counted_wet_kg: number | null
  counted_drc_pct: number | null
  counted_dry_kg: number | null
  chenh_uot_kg: number | null
  chenh_kho_kg: number | null
  lech_kho_pct: number | null
  ly_do: string | null
  note: string | null
  counted_at: string | null
  now_wet_kg: number | null
  now_dry_kg: number | null
}

const normStocktake = (r: any): RawStocktake => ({
  ...r, so_lo: num(r.so_lo), so_lo_chua_dem: num(r.so_lo_chua_dem), book_dry_kg: num(r.book_dry_kg),
  counted_dry_kg: numOrNull(r.counted_dry_kg), chenh_kho_kg: numOrNull(r.chenh_kho_kg), so_lo_lech: num(r.so_lo_lech),
})
const normLine = (r: any): RawStocktakeLine => ({
  ...r, tuoi_ngay: numOrNull(r.tuoi_ngay), book_wet_kg: num(r.book_wet_kg), book_drc_pct: numOrNull(r.book_drc_pct), book_dry_kg: num(r.book_dry_kg),
  counted_wet_kg: numOrNull(r.counted_wet_kg), counted_drc_pct: numOrNull(r.counted_drc_pct), counted_dry_kg: numOrNull(r.counted_dry_kg),
  chenh_uot_kg: numOrNull(r.chenh_uot_kg), chenh_kho_kg: numOrNull(r.chenh_kho_kg), lech_kho_pct: numOrNull(r.lech_kho_pct),
  now_wet_kg: numOrNull(r.now_wet_kg), now_dry_kg: numOrNull(r.now_dry_kg),
})

export const rawStocktakeService = {
  async list(facilityId?: string | null, limit = 50): Promise<RawStocktake[]> {
    let q = supabase.from('v_raw_stocktakes').select('*').order('created_at', { ascending: false }).limit(limit)
    if (facilityId) q = q.eq('facility_id', facilityId)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(normStocktake)
  },

  async get(id: string): Promise<{ stocktake: RawStocktake; lines: RawStocktakeLine[] } | null> {
    const [{ data: s, error: e1 }, { data: ls, error: e2 }] = await Promise.all([
      supabase.from('v_raw_stocktakes').select('*').eq('id', id).maybeSingle(),
      supabase.from('v_raw_stocktake_lines').select('*').eq('stocktake_id', id).order('batch_no'),
    ])
    if (e1) throw e1
    if (e2) throw e2
    if (!s) return null
    return { stocktake: normStocktake(s), lines: (ls ?? []).map(normLine) }
  },

  async create(facilityId: string, ngay: string, note?: string | null): Promise<string> {
    const { data, error } = await supabase.rpc('fn_nvl_tao_kiem_ke', { p_facility_id: facilityId, p_ngay: ngay, p_note: note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    return String(data)
  },

  async ghiDem(lineId: string, countedWetKg: number, countedDrc: number | null, lyDo?: string | null, note?: string | null): Promise<{ counted_dry_kg: number; chenh_kho_kg: number; lech_kho_pct: number | null; vuot_nguong: boolean }> {
    const { data, error } = await supabase.rpc('fn_nvl_ghi_dem_kiem_ke', {
      p_line_id: lineId, p_counted_wet_kg: countedWetKg, p_counted_drc_pct: countedDrc, p_ly_do: lyDo ?? null, p_note: note ?? null,
    })
    if (error) throw new Error(dichLoiNhapKho(error))
    const d = (data ?? {}) as any
    return { counted_dry_kg: num(d.counted_dry_kg), chenh_kho_kg: num(d.chenh_kho_kg), lech_kho_pct: numOrNull(d.lech_kho_pct), vuot_nguong: !!d.vuot_nguong }
  },

  async ky(id: string, buoc: 'count_done' | 'approve' | 'cancel', note?: string | null): Promise<{ so_lo_dieu_chinh: number; chenh_kho_kg: number }> {
    const { data, error } = await supabase.rpc('fn_nvl_ky_kiem_ke', { p_stocktake_id: id, p_buoc: buoc, p_note: note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    return { so_lo_dieu_chinh: num((data as any)?.so_lo_dieu_chinh), chenh_kho_kg: num((data as any)?.chenh_kho_kg) }
  },
}

export default rawStocktakeService
