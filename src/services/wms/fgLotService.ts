// ============================================================================
// LÔ THÀNH PHẨM (GĐ7): số lô S2308AB — nối sổ ca ↔ sổ QC ↔ hàng chèn ↔ xuất kho TP
// File: src/services/wms/fgLotService.ts
// ============================================================================

import { supabase } from '../../lib/supabase'
import { dichLoiNhapKho } from './rawStockService'

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v ?? 0); return Number.isFinite(n) ? n : 0 }
const numOrNull = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

export type FgQcStatus = 'chua_kiem' | 'dat' | 'cxl' | 'loai'
export type FgLotStatus = 'ton' | 'het' | 'huy'
export const FG_QC_LABELS: Record<FgQcStatus, string> = { chua_kiem: 'Chưa kiểm', dat: 'Đạt', cxl: 'Chờ xử lý', loai: 'Loại' }
export const FG_QC_CHIP: Record<FgQcStatus, string> = { chua_kiem: 'mut', dat: 'ok', cxl: 'amb', loai: 'red' }

export interface FgLot {
  id: string
  facility_id: string
  facility_code: string | null
  so_lo: string
  material_id: string
  material_code: string
  material_name: string
  sort_order: number | null
  report_id: string | null
  report_status: string | null
  shift_date: string
  shift_id: string | null
  shift_name: string | null
  team: string | null
  so_banh: number
  kg_per_banh: number
  kg: number
  raw_lot_id: string | null
  ma_nvl: string | null
  co_chen: boolean
  tu_fg_lot_id: string | null
  tu_so_lo: string | null
  qc_status: FgQcStatus
  qc_po_min: number | null; qc_po_max: number | null; qc_mv_min: number | null; qc_mv_max: number | null
  qc_ly_do: string | null; qc_note: string | null; qc_at: string | null; qc_name: string | null
  so_banh_da_xuat: number
  so_banh_chen: number
  ton_banh: number
  ton_kg: number
  so_lo_chen: number
  status: FgLotStatus
  note: string | null
  created_name: string | null
  created_at: string
}

export interface FgStockByMaterial { facility_id: string; material_id: string; material_code: string; material_name: string; sort_order: number | null; kg_per_banh: number; dat_banh: number; chua_kiem_banh: number; loi_banh: number; ton_banh: number; ton_kg: number; so_lo: number }
export interface FgDoiChieu { facility_id: string; material_id: string; material_code: string; material_name: string; ton_theo_lo_banh: number; ton_theo_so_ca_banh: number; lech_banh: number }

const norm = (r: any): FgLot => ({
  ...r, so_banh: num(r.so_banh), kg_per_banh: num(r.kg_per_banh), kg: num(r.kg), co_chen: !!r.co_chen, sort_order: numOrNull(r.sort_order),
  qc_po_min: numOrNull(r.qc_po_min), qc_po_max: numOrNull(r.qc_po_max), qc_mv_min: numOrNull(r.qc_mv_min), qc_mv_max: numOrNull(r.qc_mv_max),
  so_banh_da_xuat: num(r.so_banh_da_xuat), so_banh_chen: num(r.so_banh_chen), ton_banh: num(r.ton_banh), ton_kg: num(r.ton_kg), so_lo_chen: num(r.so_lo_chen),
})

/** Gợi ý số lô kế tiếp: tăng số cuối của số lô gần nhất (S2308AB → S2309AB) */
export function goiYSoLoKeTiep(last: string | null | undefined): string {
  if (!last) return ''
  const m = last.match(/^(.*?)(\d+)([A-Z]*)$/)
  if (!m) return ''
  const n = String(Number(m[2]) + 1).padStart(m[2].length, '0')
  return `${m[1]}${n}${m[3]}`
}

export const fgLotService = {
  async list(facilityId: string, opts: { date?: string | null; status?: FgLotStatus[] | null; qc?: FgQcStatus[] | null; materialId?: string | null; rawLotId?: string | null; onlyTon?: boolean; limit?: number } = {}): Promise<FgLot[]> {
    let q = supabase.from('v_fg_lots').select('*').eq('facility_id', facilityId).order('shift_date', { ascending: false }).order('created_at', { ascending: false }).limit(opts.limit ?? 200)
    if (opts.date) q = q.eq('shift_date', opts.date)
    if (opts.status?.length) q = q.in('status', opts.status)
    if (opts.qc?.length) q = q.in('qc_status', opts.qc)
    if (opts.materialId) q = q.eq('material_id', opts.materialId)
    if (opts.rawLotId) q = q.eq('raw_lot_id', opts.rawLotId)
    if (opts.onlyTon) q = q.gt('ton_banh', 0)
    const { data, error } = await q
    if (error) throw error
    return ((data ?? []) as any[]).map(norm)
  },

  async get(id: string): Promise<FgLot | null> {
    const { data, error } = await supabase.from('v_fg_lots').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? norm(data) : null
  },

  async findBySoLo(facilityId: string, soLo: string): Promise<FgLot | null> {
    const { data, error } = await supabase.from('v_fg_lots').select('*').eq('facility_id', facilityId).ilike('so_lo', soLo.replace(/\s+/g, '').toUpperCase()).maybeSingle()
    if (error) throw error
    return data ? norm(data) : null
  },

  async taoLo(input: { facilityId: string; soLo: string; materialId: string; soBanh: number; shiftDate: string; shiftId: string; team?: string | null; rawLotId?: string | null; coChen?: boolean; note?: string | null; tuFgLotId?: string | null }): Promise<string> {
    const { data, error } = await supabase.rpc('fn_fg_tao_lo', {
      p_facility_id: input.facilityId, p_so_lo: input.soLo, p_material_id: input.materialId, p_so_banh: input.soBanh, p_shift_date: input.shiftDate, p_shift_id: input.shiftId,
      p_team: input.team ?? null, p_raw_lot_id: input.rawLotId ?? null, p_co_chen: input.coChen ?? false, p_note: input.note ?? null, p_tu_fg_lot_id: input.tuFgLotId ?? null,
    })
    if (error) throw new Error(dichLoiNhapKho(error))
    return String(data)
  },

  async huy(id: string, lyDo?: string | null): Promise<void> {
    const { error } = await supabase.rpc('fn_fg_huy_lo', { p_id: id, p_ly_do: lyDo ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
  },

  async qc(id: string, ketQua: 'dat' | 'cxl' | 'loai', opts: { poMin?: number | null; poMax?: number | null; mvMin?: number | null; mvMax?: number | null; lyDo?: string | null; note?: string | null } = {}): Promise<void> {
    const { error } = await supabase.rpc('fn_fg_qc', { p_id: id, p_ket_qua: ketQua, p_po_min: opts.poMin ?? null, p_po_max: opts.poMax ?? null, p_mv_min: opts.mvMin ?? null, p_mv_max: opts.mvMax ?? null, p_ly_do: opts.lyDo ?? null, p_note: opts.note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
  },

  /** Lô lỗi → kho chèn (trả về id lô chèn) */
  async chuyenChen(id: string, soBanh?: number | null, note?: string | null, metalCleared?: boolean | null): Promise<string> {
    const { data, error } = await supabase.rpc('fn_mix_tao_lo_tu_fg', { p_fg_lot_id: id, p_so_banh: soBanh ?? null, p_note: note ?? null, p_metal_cleared: metalCleared ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    return String(data)
  },

  async xuat(id: string, soBanh: number, dispatchLineId?: string | null, note?: string | null): Promise<{ so_lo: string; banh: number; kg: number; con_banh: number }> {
    const { data, error } = await supabase.rpc('fn_fg_xuat', { p_fg_lot_id: id, p_so_banh: soBanh, p_dispatch_line_id: dispatchLineId ?? null, p_note: note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    const d: any = data ?? {}
    return { so_lo: String(d.so_lo ?? ''), banh: num(d.banh), kg: num(d.kg), con_banh: num(d.con_banh) }
  },

  async stockByMaterial(facilityId: string): Promise<FgStockByMaterial[]> {
    const { data, error } = await supabase.from('v_fg_stock_by_material').select('*').eq('facility_id', facilityId).order('sort_order')
    if (error) throw error
    return ((data ?? []) as any[]).map((r) => ({ ...r, sort_order: numOrNull(r.sort_order), kg_per_banh: num(r.kg_per_banh), dat_banh: num(r.dat_banh), chua_kiem_banh: num(r.chua_kiem_banh), loi_banh: num(r.loi_banh), ton_banh: num(r.ton_banh), ton_kg: num(r.ton_kg), so_lo: num(r.so_lo) }))
  },

  async doiChieuSoCa(facilityId: string): Promise<FgDoiChieu[]> {
    const { data, error } = await supabase.from('v_fg_doi_chieu_so_ca').select('*').eq('facility_id', facilityId)
    if (error) throw error
    return ((data ?? []) as any[]).map((r) => ({ ...r, ton_theo_lo_banh: num(r.ton_theo_lo_banh), ton_theo_so_ca_banh: num(r.ton_theo_so_ca_banh), lech_banh: num(r.lech_banh) }))
  },
}

export default fgLotService
