// ============================================================================
// KHO NGUYÊN LIỆU MỦ — báo cáo cân đối tháng + hao ướt theo tuổi (GĐ3)
// File: src/services/wms/rawReportService.ts
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { RawRubberType, RawRubberGroup } from './raw.types'

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v ?? 0); return Number.isFinite(n) ? n : 0 }
const numOrNull = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

export interface RawBalanceRow {
  rubber_type: RawRubberType
  rubber_type_name: string
  nhom: RawRubberGroup
  ton_dau_kho: number
  mo_so_kho: number
  nhap_kho: number
  xuat_sx_kho: number
  xuat_khac_kho: number
  dieu_chinh_kho: number
  ton_cuoi_kho: number
  kiem_ke_kho: number | null
  chenh_kho: number | null
  chenh_pct: number | null
  ton_dau_uot: number
  nhap_uot: number
  xuat_uot: number
  dieu_chinh_uot: number
  ton_cuoi_uot: number
  so_lo_cuoi: number
}

export interface WetLossByAge {
  facility_id: string
  rubber_type: RawRubberType
  nhom_tuoi: string
  thu_tu: number
  so_lan: number
  hao_uot_pct: number | null
  drc_tang_diem: number | null
  kho_lech_pct: number | null
}

export const rawReportService = {
  /** Cân đối kg khô theo loại trong tháng (p_month = ngày bất kỳ trong tháng, YYYY-MM-DD) */
  async balanceMonth(facilityId: string, month: string): Promise<RawBalanceRow[]> {
    const { data, error } = await supabase.rpc('fn_raw_balance_month', { p_facility_id: facilityId, p_month: month })
    if (error) throw error
    return ((data ?? []) as any[]).map((r): RawBalanceRow => ({
      ...r,
      ton_dau_kho: num(r.ton_dau_kho), mo_so_kho: num(r.mo_so_kho), nhap_kho: num(r.nhap_kho), xuat_sx_kho: num(r.xuat_sx_kho),
      xuat_khac_kho: num(r.xuat_khac_kho), dieu_chinh_kho: num(r.dieu_chinh_kho), ton_cuoi_kho: num(r.ton_cuoi_kho),
      kiem_ke_kho: numOrNull(r.kiem_ke_kho), chenh_kho: numOrNull(r.chenh_kho), chenh_pct: numOrNull(r.chenh_pct),
      ton_dau_uot: num(r.ton_dau_uot), nhap_uot: num(r.nhap_uot), xuat_uot: num(r.xuat_uot), dieu_chinh_uot: num(r.dieu_chinh_uot),
      ton_cuoi_uot: num(r.ton_cuoi_uot), so_lo_cuoi: num(r.so_lo_cuoi),
    }))
  },

  async wetLossByAge(facilityId?: string | null, rubberType?: RawRubberType | null): Promise<WetLossByAge[]> {
    let q = supabase.from('v_raw_wet_loss_by_age').select('*').order('thu_tu')
    if (facilityId) q = q.eq('facility_id', facilityId)
    if (rubberType) q = q.eq('rubber_type', rubberType)
    const { data, error } = await q
    if (error) throw error
    return ((data ?? []) as any[]).map((r): WetLossByAge => ({
      ...r, thu_tu: num(r.thu_tu), so_lan: num(r.so_lan), hao_uot_pct: numOrNull(r.hao_uot_pct), drc_tang_diem: numOrNull(r.drc_tang_diem), kho_lech_pct: numOrNull(r.kho_lech_pct),
    }))
  },

  /** Xuất CSV (UTF-8 BOM để Excel đọc tiếng Việt) */
  toCsv(rows: RawBalanceRow[], monthLabel: string, facilityCode: string): string {
    const head = ['Loại hàng', 'Nhóm', 'Tồn đầu khô', 'Mở sổ', 'Nhập khô', 'Xuất SX khô', 'Xuất khác khô', 'Điều chỉnh khô', 'Tồn cuối sổ khô', 'Kiểm kê khô', 'Chênh khô', 'Chênh %', 'Tồn đầu ướt', 'Nhập ướt', 'Xuất ướt', 'Điều chỉnh ướt', 'Tồn cuối ướt', 'Số lô cuối']
    const lines = rows.map((r) => [
      r.rubber_type_name, r.nhom, r.ton_dau_kho, r.mo_so_kho, r.nhap_kho, r.xuat_sx_kho, r.xuat_khac_kho, r.dieu_chinh_kho, r.ton_cuoi_kho,
      r.kiem_ke_kho ?? '', r.chenh_kho ?? '', r.chenh_pct ?? '', r.ton_dau_uot, r.nhap_uot, r.xuat_uot, r.dieu_chinh_uot, r.ton_cuoi_uot, r.so_lo_cuoi,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    return '﻿' + [`"Cân đối kho NVL ${facilityCode} · ${monthLabel}"`, head.map((h) => `"${h}"`).join(','), ...lines].join('\r\n')
  },
}

export default rawReportService
