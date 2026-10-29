// ============================================================================
// KHO NGUYÊN LIỆU MỦ — ngưỡng theo nhà máy (GĐ0)
// File: src/services/wms/rawSettingsService.ts
//
// Đọc raw_settings qua fn_raw_setting(facility) — dòng nhà máy, không có thì
// dòng mặc định. Màn hình KHÔNG gõ cứng ngưỡng; đổi ngưỡng = BGĐ sửa bảng.
// Cột numeric về client là CHUỖI (PostgREST) → bọc num() như shiftBookService.
// ============================================================================

import { supabase } from '../../lib/supabase'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from './raw.types'

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function normalize(row: any): RawSettings {
  const d = RAW_SETTINGS_DEFAULT
  return {
    id: row?.id ?? '',
    facility_id: row?.facility_id ?? null,
    tuoi_lo_canh_bao_ngay: num(row?.tuoi_lo_canh_bao_ngay, d.tuoi_lo_canh_bao_ngay),
    chu_ky_can_lai_ngay: num(row?.chu_ky_can_lai_ngay, d.chu_ky_can_lai_ngay),
    can_lai_truoc_xuat_ngay: num(row?.can_lai_truoc_xuat_ngay, d.can_lai_truoc_xuat_ngay),
    nguong_lech_kho_pct: num(row?.nguong_lech_kho_pct, d.nguong_lech_kho_pct),
    nguong_lech_drc_ncc_diem: num(row?.nguong_lech_drc_ncc_diem, d.nguong_lech_drc_ncc_diem),
    gioi_han_chen_pct: (row?.gioi_han_chen_pct && typeof row.gioi_han_chen_pct === 'object')
      ? Object.fromEntries(Object.entries(row.gioi_han_chen_pct).map(([k, v]) => [k, num(v, 0)]))
      : d.gioi_han_chen_pct,
    chen_ban_giao_ca: row?.chen_ban_giao_ca ?? d.chen_ban_giao_ca,
    anh_bat_buoc: Array.isArray(row?.anh_bat_buoc) ? row.anh_bat_buoc.map(String) : d.anh_bat_buoc,
    ngay_mo_so: row?.ngay_mo_so ? String(row.ngay_mo_so).slice(0, 10) : null,
    notes: row?.notes ?? null,
    updated_at: row?.updated_at ?? '',
  }
}

const cache = new Map<string, { at: number; value: RawSettings }>()
const TTL_MS = 60_000

export const rawSettingsService = {
  /** Ngưỡng cho nhà máy (null = mặc định). Cache 60 giây, lỗi thì trả mặc định. */
  async getForFacility(facilityId?: string | null, opts?: { fresh?: boolean }): Promise<RawSettings> {
    const key = facilityId ?? '*'
    const hit = cache.get(key)
    if (!opts?.fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value
    const { data, error } = await supabase.rpc('fn_raw_setting', { p_facility_id: facilityId ?? null })
    if (error) throw error
    const value = normalize(Array.isArray(data) ? data[0] : data)
    cache.set(key, { at: Date.now(), value })
    return value
  },

  async listAll(): Promise<RawSettings[]> {
    const { data, error } = await supabase.from('raw_settings').select('*').order('facility_id', { nullsFirst: true })
    if (error) throw error
    return (data ?? []).map(normalize)
  },

  /** BGĐ sửa ngưỡng. Chỉ gửi các cột đổi. */
  async update(id: string, patch: Partial<Omit<RawSettings, 'id' | 'facility_id' | 'updated_at'>>): Promise<void> {
    const { error } = await supabase.from('raw_settings').update(patch).eq('id', id)
    if (error) throw error
    cache.clear()
  },

  /** % chèn tối đa cho một grade (SVR_10 …); grade lạ → 0 (không cho chèn). */
  gioiHanChen(settings: RawSettings, grade?: string | null): number {
    if (!grade) return 0
    const v = settings.gioi_han_chen_pct[grade]
    return typeof v === 'number' ? v : 0
  },
}
