// ============================================================================
// KHO NVL — MÃ NGUYÊN LIỆU (GĐ6): tầng gom các lô xe, đơn vị nhà máy chạy máy
// File: src/services/wms/rawLotService.ts
// ============================================================================

import { supabase } from '../../lib/supabase'
import { dichLoiNhapKho } from './rawStockService'

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v ?? 0); return Number.isFinite(n) ? n : 0 }
const numOrNull = (v: unknown): number | null => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

export type RawLotTrangThai = 'trong' | 'san_sang' | 'dang_chay' | 'da_chay_xong' | 'dong' | 'huy'
export const RAW_LOT_TRANG_THAI_LABELS: Record<RawLotTrangThai, string> = {
  trong: 'Chưa có hàng', san_sang: 'Sẵn sàng', dang_chay: 'Đang chạy', da_chay_xong: 'Đã chạy xong', dong: 'Đã đóng', huy: 'Đã hủy',
}
export const RAW_LOT_TRANG_THAI_CHIP: Record<RawLotTrangThai, string> = { trong: 'mut', san_sang: 'ok', dang_chay: 'amb', da_chay_xong: 'mut', dong: 'mut', huy: 'red' }

export interface RawLotBalance {
  raw_lot_id: string
  facility_id: string
  facility_code: string | null
  ma: string
  nguon: string
  so: number | null
  status: 'mo' | 'dong' | 'huy'
  note: string | null
  rubber_type: string | null
  rubber_type_name: string
  so_xe: number
  so_xe_con_hang: number
  wet_kg: number
  dry_kg: number
  drc_pct: number | null
  ngay_dau: string | null
  ngay_cuoi: string | null
  tuoi_ngay: number | null
  ngay_tu_lan_do_max: number | null
  nhap_kho_kg: number | null
  xuat_sx_kho_kg: number | null
  dieu_chinh_kho_kg: number | null
  trang_thai: RawLotTrangThai
  /** đang chạy theo sổ mã đang chạy từ lúc nào (null = không ghi sổ) */
  dang_chay_tu: string | null
  created_at: string
}

/** Sổ mã đang chạy (v_raw_lot_runs): một dòng cho mỗi đợt chạy, ended_at null = đang chạy */
export interface RawLotRun { id: string; facility_id: string; raw_lot_id: string; ma: string; nguon: string; started_at: string; ended_at: string | null; note: string | null; started_name: string | null; ended_name: string | null; dang_chay: boolean }

export interface MaGoiY { ticket_id: string; ma_goc: string | null; ma: string | null; nguon: string | null; so: number | null; xe: string | null; raw_lot_id: string | null; raw_lot_status: string | null }
export interface MaParse { ma: string; nguon: string; so: number | null; xe: string | null }

export interface RawLotYield {
  raw_lot_id: string; facility_id: string; ma: string; nguon: string; rubber_type_name: string; trang_thai: RawLotTrangThai; so_xe: number
  wet_kg: number; dry_kg: number; nhap_kho_kg: number | null; xuat_sx_kho_kg: number | null; ngay_dau: string | null; ngay_cuoi: string | null
  so_ca: number; tp_dat_kg: number; loi_dkl_kg: number; chen_tieu_hao_kg: number; hieu_suat_pct: number | null; ty_le_loi_pct: number | null
}

/** Hàng chèn đã vào từng mã gốc (v_raw_lot_chen): chỉ phiếu thủ kho đã nhận; phiếu chèn chung nhiều mã thì kg chia đều */
export interface RawLotChenChiTiet { lot_code: string; so_lo: string | null; vi_tri: 'be_slap' | 'may_mix' | null; source_type: string; grade: string | null; desc: string | null; kg: number; so_banh: number | null; so_phieu: number; co_chung: boolean }
export interface RawLotChen {
  raw_lot_id: string; facility_id: string; ma: string; rubber_type_name: string; trang_thai: RawLotTrangThai; xuat_sx_kho_kg: number | null
  chen_kg: number; so_phieu_chen: number; so_banh_chen: number; chen_be_kg: number; chen_mix_kg: number; chen_loi_kg: number; chen_dkl_kg: number; chen_chuan_kg: number; chen_khac_kg: number; ty_le_chen_pct: number | null
  chi_tiet: RawLotChenChiTiet[]
}

const normChen = (r: any): RawLotChen => ({
  ...r, xuat_sx_kho_kg: numOrNull(r.xuat_sx_kho_kg), chen_kg: num(r.chen_kg), so_phieu_chen: num(r.so_phieu_chen), so_banh_chen: num(r.so_banh_chen),
  chen_be_kg: num(r.chen_be_kg), chen_mix_kg: num(r.chen_mix_kg), chen_loi_kg: num(r.chen_loi_kg), chen_dkl_kg: num(r.chen_dkl_kg), chen_chuan_kg: num(r.chen_chuan_kg), chen_khac_kg: num(r.chen_khac_kg), ty_le_chen_pct: numOrNull(r.ty_le_chen_pct),
  chi_tiet: (Array.isArray(r.chi_tiet) ? r.chi_tiet : []).map((d: any) => ({ ...d, kg: num(d.kg), so_banh: numOrNull(d.so_banh), so_phieu: num(d.so_phieu), co_chung: !!d.co_chung })),
})

const normLot = (r: any): RawLotBalance => ({
  ...r, so: numOrNull(r.so), so_xe: num(r.so_xe), so_xe_con_hang: num(r.so_xe_con_hang), wet_kg: num(r.wet_kg), dry_kg: num(r.dry_kg), drc_pct: numOrNull(r.drc_pct),
  tuoi_ngay: numOrNull(r.tuoi_ngay), ngay_tu_lan_do_max: numOrNull(r.ngay_tu_lan_do_max), nhap_kho_kg: numOrNull(r.nhap_kho_kg), xuat_sx_kho_kg: numOrNull(r.xuat_sx_kho_kg), dieu_chinh_kho_kg: numOrNull(r.dieu_chinh_kho_kg),
})

export const rawLotService = {
  /** Mã của nhà máy; mặc định chỉ mã đang mở (mo) — kể cả đã chạy xong để tra cứu */
  async list(facilityId: string, opts: { includeClosed?: boolean; onlyWithStock?: boolean } = {}): Promise<RawLotBalance[]> {
    let q = supabase.from('v_raw_lot_balance').select('*').eq('facility_id', facilityId).order('ngay_cuoi', { ascending: false, nullsFirst: false }).order('ma')
    if (!opts.includeClosed) q = q.eq('status', 'mo')
    if (opts.onlyWithStock) q = q.gt('dry_kg', 0.005)
    const { data, error } = await q
    if (error) throw error
    return ((data ?? []) as any[]).map(normLot)
  },

  async get(id: string): Promise<RawLotBalance | null> {
    const { data, error } = await supabase.from('v_raw_lot_balance').select('*').eq('raw_lot_id', id).maybeSingle()
    if (error) throw error
    return data ? normLot(data) : null
  },

  /** Sổ mã đang chạy của nhà máy (mặc định chỉ dòng đang chạy) */
  async runs(facilityId: string, opts: { all?: boolean; limit?: number } = {}): Promise<RawLotRun[]> {
    let q = supabase.from('v_raw_lot_runs').select('*').eq('facility_id', facilityId).order('started_at', { ascending: false }).limit(opts.limit ?? 50)
    if (!opts.all) q = q.is('ended_at', null)
    const { data, error } = await q
    if (error) throw error
    return ((data ?? []) as any[]).map((r) => ({ ...r, dang_chay: !!r.dang_chay }))
  },
  /** id các mã đang chạy lúc này */
  async dangChay(facilityId: string): Promise<string[]> {
    return (await this.runs(facilityId)).map((r) => r.raw_lot_id)
  },
  /** Khai mã bắt đầu chạy; thayThe = kết thúc các mã khác đang chạy */
  async batDauChay(rawLotId: string, thayThe = false, note?: string | null): Promise<{ ma: string; da_chay: boolean }> {
    const { data, error } = await supabase.rpc('fn_nvl_bat_dau_chay', { p_raw_lot_id: rawLotId, p_thay_the: thayThe, p_note: note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    const d: any = data ?? {}
    return { ma: String(d.ma ?? ''), da_chay: !!d.da_chay }
  },
  async ketThucChay(rawLotId: string, note?: string | null): Promise<void> {
    const { error } = await supabase.rpc('fn_nvl_ket_thuc_chay', { p_raw_lot_id: rawLotId, p_note: note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
  },

  /** Chuẩn hoá chữ gõ → mã (gọi DB để dùng chung bảng bí danh) */
  async parse(text: string): Promise<MaParse | null> {
    const { data, error } = await supabase.rpc('fn_chuan_hoa_ma_nvl', { p_text: text })
    if (error) throw error
    const r = (Array.isArray(data) ? data[0] : data) as any
    return r?.ma ? { ma: String(r.ma), nguon: String(r.nguon), so: numOrNull(r.so), xe: r.xe ?? null } : null
  },

  /** Mã gợi ý cho một loạt phiếu cân (đọc từ ô mã LLM gộp) */
  async goiY(ticketIds: string[]): Promise<Record<string, MaGoiY>> {
    if (!ticketIds.length) return {}
    const out: Record<string, MaGoiY> = {}
    for (let i = 0; i < ticketIds.length; i += 100) {
      const { data, error } = await supabase.from('v_raw_intake_ma_goi_y').select('*').in('ticket_id', ticketIds.slice(i, i + 100))
      if (error) throw error
      for (const r of (data ?? []) as any[]) out[r.ticket_id] = { ...r, so: numOrNull(r.so) }
    }
    return out
  },

  /** Danh sách nguồn (TMHG, LASI…) + số lớn nhất đã dùng, để gợi ý mã mới */
  async nguon(facilityId: string): Promise<{ nguon: string; so_max: number; lan_cuoi: string | null }[]> {
    const { data, error } = await supabase.from('raw_lots').select('nguon, so, created_at').eq('facility_id', facilityId).neq('status', 'huy')
    if (error) throw error
    const m = new Map<string, { nguon: string; so_max: number; lan_cuoi: string | null }>()
    for (const r of (data ?? []) as any[]) {
      const cur = m.get(r.nguon) ?? { nguon: r.nguon, so_max: 0, lan_cuoi: null }
      cur.so_max = Math.max(cur.so_max, num(r.so)); if (!cur.lan_cuoi || r.created_at > cur.lan_cuoi) cur.lan_cuoi = r.created_at
      m.set(r.nguon, cur)
    }
    return [...m.values()].sort((a, b) => (b.lan_cuoi ?? '').localeCompare(a.lan_cuoi ?? ''))
  },

  async layHoacTao(facilityId: string, ma: string, rubberType?: string | null): Promise<string> {
    const { data, error } = await supabase.rpc('fn_nvl_lay_hoac_tao_ma', { p_facility_id: facilityId, p_ma: ma, p_rubber_type: rubberType ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    return String(data)
  },

  async sua(id: string, patch: { status?: 'mo' | 'dong' | 'huy'; note?: string | null; rubberType?: string | null }): Promise<void> {
    const { error } = await supabase.rpc('fn_nvl_sua_ma', { p_id: id, p_status: patch.status ?? null, p_note: patch.note ?? null, p_rubber_type: patch.rubberType ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
  },

  /** Lệnh xuất cả mã (mọi lô xe còn hàng) */
  async taoLenhXuatTheoMa(input: { facilityId: string; rawLotId: string; mucDich?: 'production' | 'sale' | 'transfer'; productionOrderId?: string | null; note?: string | null }): Promise<string> {
    const { data, error } = await supabase.rpc('fn_nvl_tao_lenh_xuat_theo_ma', { p_facility_id: input.facilityId, p_raw_lot_id: input.rawLotId, p_muc_dich: input.mucDich ?? 'production', p_production_order_id: input.productionOrderId ?? null, p_note: input.note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    return String(data)
  },

  /** Một số cân cho cả mã → máy chia về từng lô xe */
  async ghiCanTheoMa(orderId: string, tongWetKg: number, note?: string | null): Promise<{ code: string; so_dong: number; tong_wet_kg: number; ton_truoc_kg: number }> {
    const { data, error } = await supabase.rpc('fn_nvl_ghi_can_xuat_ma', { p_order_id: orderId, p_tong_wet_kg: tongWetKg, p_note: note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    const d: any = data ?? {}
    return { code: String(d.code ?? ''), so_dong: num(d.so_dong), tong_wet_kg: num(d.tong_wet_kg), ton_truoc_kg: num(d.ton_truoc_kg) }
  },

  /** Chèn gom theo mã gốc (kg, số bành, theo loại lô chèn, % chèn, chi tiết từng lô); mặc định chỉ mã đã có chèn */
  async chen(facilityId: string, opts: { all?: boolean } = {}): Promise<RawLotChen[]> {
    let q = supabase.from('v_raw_lot_chen').select('*').eq('facility_id', facilityId).order('chen_kg', { ascending: false })
    if (!opts.all) q = q.gt('chen_kg', 0)
    const { data, error } = await q
    if (error) throw error
    return ((data ?? []) as any[]).map(normChen)
  },

  /** Mã có thể chèn vào: đang mở, ưu tiên đang chạy rồi sẵn sàng */
  async maDangChay(facilityId: string): Promise<RawLotBalance[]> {
    const l = await this.list(facilityId)
    const rank: Record<string, number> = { dang_chay: 0, san_sang: 1, trong: 2, da_chay_xong: 3 }   // 'trong' = mã mới tạo, chưa gán lô xe: vẫn chọn được
    return l.filter((x) => x.trang_thai in rank).sort((a, b) => rank[a.trang_thai] - rank[b.trang_thai] || (b.ngay_cuoi ?? '').localeCompare(a.ngay_cuoi ?? ''))
  },

  async yield(facilityId: string, limit = 60): Promise<RawLotYield[]> {
    const { data, error } = await supabase.from('v_raw_lot_yield').select('*').eq('facility_id', facilityId).order('ngay_cuoi', { ascending: false, nullsFirst: false }).limit(limit)
    if (error) throw error
    return ((data ?? []) as any[]).map((r) => ({ ...r, so_xe: num(r.so_xe), wet_kg: num(r.wet_kg), dry_kg: num(r.dry_kg), nhap_kho_kg: numOrNull(r.nhap_kho_kg), xuat_sx_kho_kg: numOrNull(r.xuat_sx_kho_kg), so_ca: num(r.so_ca), tp_dat_kg: num(r.tp_dat_kg), loi_dkl_kg: num(r.loi_dkl_kg), chen_tieu_hao_kg: num(r.chen_tieu_hao_kg), hieu_suat_pct: numOrNull(r.hieu_suat_pct), ty_le_loi_pct: numOrNull(r.ty_le_loi_pct) }))
  },
}

export default rawLotService
