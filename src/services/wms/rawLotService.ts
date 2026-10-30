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

/** Tổng kết một mã (fn_nvl_tong_ket_ma): NVL vào / chèn / TP / theo ca / đợt chạy / người nhận BGĐ — dùng cho nút Kết thúc mã + mail */
export interface RawLotTongKetCa { shift_date: string; shift_name: string; team: string | null; so_lan: number; kg_lay: number; kg_tra: number; tieu_hao: number; da_nhan: number; chua_tra: number; cho_ky: number }
/** Lệnh chạy (SQL p13): một đợt chạy máy gồm 1..n mã gộp; nhiều lệnh chạy song song được */
export interface LenhChay {
  id: string; facility_id: string; facility_code: string | null; code: string; raw_lot_ids: string[]; ma_gop: string; so_ma: number
  started_at: string; ended_at: string | null; note: string | null; started_name: string | null; ended_name: string | null; dang_chay: boolean
  chen_kg: number; so_phieu: number; phieu_mo: number; tieu_hao_cho_ky: number
}
export interface RawLotTongKetMa { ma: string; rubber_type_name: string; so_xe: number; wet_kg: number; dry_kg: number; drc_pct: number | null; nhap_kho_kg: number | null; xuat_sx_kho_kg: number | null; ngay_dau: string | null; ngay_cuoi: string | null }
export interface RawLotTongKet {
  /** có khi tổng kết theo lệnh: mã = ma_gop, ma_list = từng mã */
  lenh_id?: string | null; lenh_code?: string | null; ma_list?: RawLotTongKetMa[]
  raw_lot_id: string; ma: string; nguon: string; facility_code: string; rubber_type_name: string; trang_thai: RawLotTrangThai; dang_chay: boolean
  so_xe: number; wet_kg: number; dry_kg: number; drc_pct: number | null; nhap_kho_kg: number | null; xuat_sx_kho_kg: number | null; ngay_dau: string | null; ngay_cuoi: string | null
  so_ca_ep: number | null; tp_dat_kg: number | null; loi_dkl_kg: number | null; hieu_suat_pct: number | null; ty_le_loi_pct: number | null
  chen: { chen_kg: number; so_phieu: number; so_banh: number; be_kg: number; mix_kg: number; bt_kg: number; loi_kg: number; dkl_kg: number; chuan_kg: number; khac_kg: number; ty_le_pct: number | null; chi_tiet: RawLotChenChiTiet[] } | null
  phieu: { tong: number; chua_tra: number; cho_ky: number; da_nhan: number; so_ca: number; kg_lay: number; kg_tra: number; tieu_hao: number; tieu_hao_da_nhan: number; so_banh: number; be_slap: number; may_mix: number; bang_tai: number; lan_dau: string | null; lan_cuoi: string | null }
  theo_ca: RawLotTongKetCa[]
  dot_chay: { started_at: string; ended_at: string | null; started_name: string | null; ended_name: string | null; note: string | null }[]
  bgd: { name: string; email: string; chuc_vu: string | null }[]
  nguoi_lap: { name: string; email: string | null } | null
  luc: string
}

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
  chen_kg: number; so_phieu_chen: number; so_banh_chen: number; chen_be_kg: number; chen_mix_kg: number; chen_bt_kg: number; chen_loi_kg: number; chen_dkl_kg: number; chen_chuan_kg: number; chen_khac_kg: number; ty_le_chen_pct: number | null
  chi_tiet: RawLotChenChiTiet[]
}

const normChen = (r: any): RawLotChen => ({
  ...r, xuat_sx_kho_kg: numOrNull(r.xuat_sx_kho_kg), chen_kg: num(r.chen_kg), so_phieu_chen: num(r.so_phieu_chen), so_banh_chen: num(r.so_banh_chen),
  chen_be_kg: num(r.chen_be_kg), chen_mix_kg: num(r.chen_mix_kg), chen_bt_kg: num(r.chen_bt_kg), chen_loi_kg: num(r.chen_loi_kg), chen_dkl_kg: num(r.chen_dkl_kg), chen_chuan_kg: num(r.chen_chuan_kg), chen_khac_kg: num(r.chen_khac_kg), ty_le_chen_pct: numOrNull(r.ty_le_chen_pct),
  chi_tiet: (Array.isArray(r.chi_tiet) ? r.chi_tiet : []).map((d: any) => ({ ...d, kg: num(d.kg), so_banh: numOrNull(d.so_banh), so_phieu: num(d.so_phieu), co_chung: !!d.co_chung })),
})

const normLot = (r: any): RawLotBalance => ({
  ...r, so: numOrNull(r.so), so_xe: num(r.so_xe), so_xe_con_hang: num(r.so_xe_con_hang), wet_kg: num(r.wet_kg), dry_kg: num(r.dry_kg), drc_pct: numOrNull(r.drc_pct),
  tuoi_ngay: numOrNull(r.tuoi_ngay), ngay_tu_lan_do_max: numOrNull(r.ngay_tu_lan_do_max), nhap_kho_kg: numOrNull(r.nhap_kho_kg), xuat_sx_kho_kg: numOrNull(r.xuat_sx_kho_kg), dieu_chinh_kho_kg: numOrNull(r.dieu_chinh_kho_kg),
})

const normLenh = (r: any): LenhChay => ({
  ...r, raw_lot_ids: Array.isArray(r.raw_lot_ids) ? r.raw_lot_ids.map(String) : [], so_ma: num(r.so_ma), dang_chay: !!r.dang_chay,
  chen_kg: num(r.chen_kg), so_phieu: num(r.so_phieu), phieu_mo: num(r.phieu_mo), tieu_hao_cho_ky: num(r.tieu_hao_cho_ky),
})
const normTongKet = (r: any): RawLotTongKet => {
  const c = r.chen
  const p = r.phieu ?? {}
  return {
    ...r, dang_chay: !!r.dang_chay, so_xe: num(r.so_xe), wet_kg: num(r.wet_kg), dry_kg: num(r.dry_kg), drc_pct: numOrNull(r.drc_pct), nhap_kho_kg: numOrNull(r.nhap_kho_kg), xuat_sx_kho_kg: numOrNull(r.xuat_sx_kho_kg),
    so_ca_ep: numOrNull(r.so_ca_ep), tp_dat_kg: numOrNull(r.tp_dat_kg), loi_dkl_kg: numOrNull(r.loi_dkl_kg), hieu_suat_pct: numOrNull(r.hieu_suat_pct), ty_le_loi_pct: numOrNull(r.ty_le_loi_pct),
    ma_list: Array.isArray(r.ma_list) ? r.ma_list.map((m: any) => ({ ...m, so_xe: num(m.so_xe), wet_kg: num(m.wet_kg), dry_kg: num(m.dry_kg), drc_pct: numOrNull(m.drc_pct), nhap_kho_kg: numOrNull(m.nhap_kho_kg), xuat_sx_kho_kg: numOrNull(m.xuat_sx_kho_kg) })) : undefined,
    chen: c ? { chen_kg: num(c.chen_kg), so_phieu: num(c.so_phieu), so_banh: num(c.so_banh), be_kg: num(c.be_kg), mix_kg: num(c.mix_kg), bt_kg: num(c.bt_kg), loi_kg: num(c.loi_kg), dkl_kg: num(c.dkl_kg), chuan_kg: num(c.chuan_kg), khac_kg: num(c.khac_kg), ty_le_pct: numOrNull(c.ty_le_pct),
      chi_tiet: (Array.isArray(c.chi_tiet) ? c.chi_tiet : []).map((d: any) => ({ ...d, kg: num(d.kg), so_banh: numOrNull(d.so_banh), so_phieu: num(d.so_phieu), co_chung: !!d.co_chung })) } : null,
    phieu: { tong: num(p.tong), chua_tra: num(p.chua_tra), cho_ky: num(p.cho_ky), da_nhan: num(p.da_nhan), so_ca: num(p.so_ca), kg_lay: num(p.kg_lay), kg_tra: num(p.kg_tra), tieu_hao: num(p.tieu_hao), tieu_hao_da_nhan: num(p.tieu_hao_da_nhan),
      so_banh: num(p.so_banh), be_slap: num(p.be_slap), may_mix: num(p.may_mix), bang_tai: num(p.bang_tai), lan_dau: p.lan_dau ?? null, lan_cuoi: p.lan_cuoi ?? null },
    theo_ca: (Array.isArray(r.theo_ca) ? r.theo_ca : []).map((x: any) => ({ ...x, so_lan: num(x.so_lan), kg_lay: num(x.kg_lay), kg_tra: num(x.kg_tra), tieu_hao: num(x.tieu_hao), da_nhan: num(x.da_nhan), chua_tra: num(x.chua_tra), cho_ky: num(x.cho_ky) })),
    dot_chay: Array.isArray(r.dot_chay) ? r.dot_chay : [],
    bgd: Array.isArray(r.bgd) ? r.bgd : [],
    nguoi_lap: r.nguoi_lap ?? null,
    luc: r.luc ?? new Date().toISOString(),
  }
}

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
  /** Khai mã bắt đầu chạy; thayThe (mặc định) = kết thúc các mã khác đang chạy; da_thay = các mã vừa bị kết thúc */
  async batDauChay(rawLotId: string, thayThe = true, note?: string | null): Promise<{ ma: string; da_chay: boolean; da_thay: string[] }> {
    const { data, error } = await supabase.rpc('fn_nvl_bat_dau_chay', { p_raw_lot_id: rawLotId, p_thay_the: thayThe, p_note: note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    const d: any = data ?? {}
    return { ma: String(d.ma ?? ''), da_chay: !!d.da_chay, da_thay: Array.isArray(d.da_thay) ? d.da_thay.map(String) : [] }
  },
  async ketThucChay(rawLotId: string, note?: string | null): Promise<void> {
    const { error } = await supabase.rpc('fn_nvl_ket_thuc_chay', { p_raw_lot_id: rawLotId, p_note: note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
  },
  /** Tổng kết mã (NVL vào, chèn, TP, theo ca, đợt chạy, BGĐ nhận mail) — SQL p12 */
  async tongKetMa(rawLotId: string): Promise<RawLotTongKet> {
    const { data, error } = await supabase.rpc('fn_nvl_tong_ket_ma', { p_raw_lot_id: rawLotId })
    if (error) throw new Error(dichLoiNhapKho(error))
    return normTongKet(data ?? {})
  },
  /** Tổng kết một LỆNH (gộp mã) — SQL p13 */
  async tongKetLenh(lenhId: string): Promise<RawLotTongKet> {
    const { data, error } = await supabase.rpc('fn_nvl_tong_ket_lenh', { p_lenh_id: lenhId })
    if (error) throw new Error(dichLoiNhapKho(error))
    return normTongKet(data ?? {})
  },
  /** Lệnh chạy của nhà máy (mặc định chỉ lệnh đang chạy) */
  async lenh(facilityId: string, opts: { all?: boolean; limit?: number } = {}): Promise<LenhChay[]> {
    let q = supabase.from('v_nvl_lenh_chay').select('*').eq('facility_id', facilityId).order('started_at', { ascending: false }).limit(opts.limit ?? 50)
    if (!opts.all) q = q.is('ended_at', null)
    const { data, error } = await q
    if (error) throw error
    return ((data ?? []) as any[]).map(normLenh)
  },
  async lenhDangChay(facilityId: string): Promise<LenhChay[]> { return this.lenh(facilityId) },
  /** Bắt đầu lệnh 1..n mã: thayThe (mặc định) kết thúc lệnh cũ · thayThe=false chạy song song · gopVao = gộp thêm mã vào lệnh đang chạy */
  async batDauLenh(rawLotIds: string[], opts: { thayThe?: boolean; gopVao?: string | null; note?: string | null } = {}): Promise<{ lenh_id: string; code: string; ma_gop: string; da_chay: boolean; gop: boolean; da_thay: string[]; da_gan: number }> {
    const { data, error } = await supabase.rpc('fn_nvl_bat_dau_lenh', { p_raw_lot_ids: rawLotIds, p_thay_the: opts.thayThe ?? true, p_gop_vao: opts.gopVao ?? null, p_note: opts.note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    const d: any = data ?? {}
    return { lenh_id: String(d.lenh_id ?? ''), code: String(d.code ?? ''), ma_gop: String(d.ma_gop ?? ''), da_chay: !!d.da_chay, gop: !!d.gop, da_thay: Array.isArray(d.da_thay) ? d.da_thay.map(String) : [], da_gan: Number(d.da_gan ?? 0) }
  },
  async ketThucLenh(lenhId: string, note?: string | null): Promise<{ code: string; ma_gop: string }> {
    const { data, error } = await supabase.rpc('fn_nvl_ket_thuc_lenh', { p_lenh_id: lenhId, p_note: note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    const d: any = data ?? {}
    return { code: String(d.code ?? ''), ma_gop: String(d.ma_gop ?? '') }
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
