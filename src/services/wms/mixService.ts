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
  issued: 'Đã lấy · đang ở dây chuyền', returned: 'Đã trả · chờ ký', submitted: 'QS đã ký khai báo', qc_confirmed: 'QC đã duyệt', received: 'Thủ kho đã nhận', cancelled: 'Đã hủy',
}
export const MIX_ISSUE_STATUS_COLORS: Record<MixIssueStatus, string> = { issued: 'blue', returned: 'gold', submitted: 'cyan', qc_confirmed: 'purple', received: 'green', cancelled: 'red' }
export const MIX_PURPOSE_LABELS: Record<MixPurpose, string> = { chay_lai: 'Chạy lại', nang_chi_so: 'Nâng chỉ số' }

export interface MixLot {
  id: string
  code: string
  so_lo: string | null
  kg_per_banh: number
  so_banh_in: number | null
  ton_banh: number
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
  lot_so_lo: string | null
  lot_kg_per_banh: number
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
  out_by: string | null
  out_name: string | null
  kg_return: number | null
  return_at: string | null
  return_name: string | null
  kg_used: number | null
  handover_to_next: boolean
  handover_from_issue_id: string | null
  raw_lot_id: string | null
  raw_lot_ids: string[] | null
  vi_tri: MixViTri | null
  lenh_id: string | null
  lenh_code: string | null
  lenh_ma_gop: string | null
  ma_goc: string | null
  ma_goc_all: string | null
  so_banh: number | null
  gross_kg: number | null
  pallet_kg: number | null
  so_banh_tra: number | null
  return_gross_kg: number | null
  return_pallet_kg: number | null
  out_edit_at: string | null
  out_edit_by: string | null
  out_edit_name: string | null
  out_kg_truoc: number | null
  dung_het: boolean
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

/** Vị trí chèn: chèn bể slap hay chèn máy mix (sổ tay tổ ép có 2 bảng riêng) */
export type MixViTri = 'be_slap' | 'may_mix'
export const MIX_VI_TRI_LABELS: Record<MixViTri, string> = { be_slap: 'Bể Slap', may_mix: 'Máy Mix' }

/** Quy trình ký hàng chèn (30/10): bước 1 khai báo = QS · bước 2 duyệt QC · bước 3 thủ kho nhận (tạm thời chủ DN) */
export type MixBuoc = 'khai_bao' | 'duyet_qc' | 'nhan_kho'
export const MIX_BUOC_LABELS: Record<MixBuoc, string> = { khai_bao: 'Bước 1 · QS khai báo', duyet_qc: 'Bước 2 · QC duyệt', nhan_kho: 'Bước 3 · Thủ kho nhận' }
export const MIX_BUOC_MO_TA: Record<MixBuoc, string> = {
  khai_bao: 'Nhập lô chèn, lấy đầu ca, trả cuối ca, ký khai báo. Thường là QS tại xưởng.',
  duyet_qc: 'Kiểm số lấy / trả / tiêu hao và ảnh, duyệt bước 2. Phòng QC.',
  nhan_kho: 'Nhận cuối: kho chèn trừ tiêu hao, sổ ca tự điền dòng CHÈN. Thủ kho được phân công (tạm thời chủ DN); BGĐ level ≤ 3 luôn có quyền.',
}
export interface MixQuyen { khai_bao: boolean; duyet_qc: boolean; nhan_kho: boolean; la_bgd: boolean; da_phan_cong: { khai_bao: number; duyet_qc: number; nhan_kho: number } }
export const MIX_QUYEN_NONE: MixQuyen = { khai_bao: false, duyet_qc: false, nhan_kho: false, la_bgd: false, da_phan_cong: { khai_bao: 0, duyet_qc: 0, nhan_kho: 0 } }
export interface MixSigner { id: string; employee_id: string; full_name: string; email: string | null; buoc: MixBuoc; facility_id: string | null; facility_code: string | null; is_active: boolean; granted_at: string; revoked_at: string | null; notes: string | null; granted_name: string | null }
export interface NhanVienLite { id: string; full_name: string; email: string | null }

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
  loai: 'nhap_lo' | 'lay' | 'tra' | 'dieu_chinh'
  lot_code: string
  issue_code: string | null
  kg: number
  mo_ta: string | null
  nguoi: string | null
  lot_id: string
  issue_id: string | null
}

export interface ShiftLite { id: string; code: string; name: string }

/** Nguồn hàng chèn: dòng LOI/DKL của sổ ca đã nhận (còn kg chưa chuyển) */
export interface MixNguonLoi {
  line_id: string; facility_id: string; report_id: string; report_date: string; shift_id: string | null; shift_code: string | null; shift_name: string | null; team: string | null
  material_code: string; material_name: string; weight_per_unit: number | null; nhap_banh: number; nhap_kg: number | null; xuat_banh: number; xuat_kg: number | null; status: string
  da_chuyen_kg: number; con_lai_kg: number
}
/** Nguồn hàng chèn: dòng sổ QC hàng không đạt */
export interface MixNguonQc {
  reject_id: string; facility_id: string | null; ngay_sx: string; to_sx: string | null; so_lo: string | null; tinh_trang: 'CXL' | 'LOAI'; ly_do: string | null
  po_min: number | null; po_max: number | null; mv_min: number | null; mv_max: number | null; ma_nguyen_lieu: string | null; tinh_trang_xu_ly: string | null; da_chuyen: boolean; lot_code: string | null
}
/** Nguồn hàng chèn: hàng chuẩn còn trong kho TP (theo sổ ca) */
export interface MixNguonTp { facility_id: string; material_id: string; code: string; material_name: string; weight_per_unit: number | null; ton_banh: number; ton_kg: number }

const normLot = (r: any): MixLot => ({
  ...r, kg_in: num(r.kg_in), kg_used: num(r.kg_used), kg_at_line: num(r.kg_at_line), ton_kg: num(r.ton_kg), kg_per_banh: num(r.kg_per_banh) || 35, so_banh_in: numOrNull(r.so_banh_in), ton_banh: num(r.ton_banh),
  po: numOrNull(r.po), mooney: numOrNull(r.mooney), pri: numOrNull(r.pri), qc_allow_mix_pct: numOrNull(r.qc_allow_mix_pct),
  qc_allow_rerun: !!r.qc_allow_rerun, metal_cleared: !!r.metal_cleared, tuoi_ngay: num(r.tuoi_ngay), so_anh: num(r.so_anh),
})
const normIssue = (r: any): MixIssue => ({
  ...r, po: numOrNull(r.po), mooney: numOrNull(r.mooney), pri: numOrNull(r.pri), target_value: numOrNull(r.target_value),
  kg_out: num(r.kg_out), kg_return: numOrNull(r.kg_return), kg_used: numOrNull(r.kg_used), handover_to_next: !!r.handover_to_next,
  so_anh_lay: num(r.so_anh_lay), so_anh_tra: num(r.so_anh_tra), lot_kg_per_banh: num(r.lot_kg_per_banh) || 35,
  so_banh: numOrNull(r.so_banh), gross_kg: numOrNull(r.gross_kg), pallet_kg: numOrNull(r.pallet_kg),
  so_banh_tra: numOrNull(r.so_banh_tra), return_gross_kg: numOrNull(r.return_gross_kg), return_pallet_kg: numOrNull(r.return_pallet_kg), out_kg_truoc: numOrNull(r.out_kg_truoc), dung_het: !!r.dung_het,
  raw_lot_ids: Array.isArray(r.raw_lot_ids) ? r.raw_lot_ids : null, ma_goc: r.ma_goc ?? null, ma_goc_all: r.ma_goc_all ?? null,
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

  /** Nhập lô chèn gõ tay: kg hoặc số bành (kg = bành × cỡ bành, mặc định 35) */
  async createLot(input: {
    facilityId: string; sourceType: MixSourceType; sourceDesc?: string | null; grade?: string | null; kgIn: number | null; soBanhIn?: number | null; kgPerBanh?: number | null
    po?: number | null; mooney?: number | null; pri?: number | null; qcAllowMixPct?: number | null; qcAllowRerun?: boolean; metalCleared?: boolean
    receivedDate?: string | null; note?: string | null; sourceRefType?: string | null; sourceRefId?: string | null; soLo: string
  }): Promise<string> {
    const { data, error } = await supabase.rpc('fn_mix_tao_lo', {
      p_so_lo: input.soLo, p_so_banh: input.soBanhIn ?? null, p_kg_per_banh: input.kgPerBanh ?? null,
      p_facility_id: input.facilityId, p_source_type: input.sourceType, p_source_desc: input.sourceDesc ?? null, p_grade: input.grade ?? null, p_kg_in: input.kgIn ?? null,
      p_po: input.po ?? null, p_mooney: input.mooney ?? null, p_pri: input.pri ?? null, p_qc_allow_mix_pct: input.qcAllowMixPct ?? null,
      p_qc_allow_rerun: input.qcAllowRerun ?? true, p_metal_cleared: input.metalCleared ?? false, p_received_date: input.receivedDate ?? null,
      p_note: input.note ?? null, p_source_ref_type: input.sourceRefType ?? null, p_source_ref_id: input.sourceRefId ?? null,
    })
    if (error) throw new Error(dichLoiNhapKho(error))
    return String(data)
  },

  async listIssues(opts: { facilityId?: string | null; date?: string | null; status?: MixIssueStatus[] | null; lotId?: string | null; rawLotId?: string | null; chuaMa?: boolean; limit?: number } = {}): Promise<MixIssue[]> {
    let q = supabase.from('v_mix_issues').select('*').order('out_at', { ascending: false }).limit(opts.limit ?? 200)
    if (opts.facilityId) q = q.eq('facility_id', opts.facilityId)
    if (opts.date) q = q.eq('shift_date', opts.date)
    if (opts.status?.length) q = q.in('status', opts.status)
    if (opts.lotId) q = q.eq('mix_lot_id', opts.lotId)
    if (opts.rawLotId) q = q.contains('raw_lot_ids', [opts.rawLotId])          // phiếu chèn vào mã này (kể cả chèn chung nhiều mã)
    if (opts.chuaMa) q = q.is('raw_lot_id', null).neq('status', 'cancelled')
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

  /**
   * Lấy đầu ca theo sổ tay tổ ép: một phiếu = một pallet (số bành, cân cả pallet, bì pallet → kg hàng chèn = cân − bì)
   * và mang mã nguyên liệu gốc đang chạy (một hay nhiều mã, ví dụ KHMN-15 + 17). Không có mã → máy lấy theo phiếu ca.
   */
  /** Phương án B (SQL p15): tìm / tạo lô chèn ngầm theo nguồn + số lô trên bao, hoặc theo lô TP → trả id lô để lấy ngay */
  async timHoacTaoLo(input: { facilityId: string; sourceType?: MixSourceType | null; soLo?: string | null; fgLotId?: string | null; metalCleared?: boolean | null; note?: string | null }): Promise<string> {
    const { data, error } = await supabase.rpc('fn_mix_tim_hoac_tao_lo', { p_facility_id: input.facilityId, p_source_type: input.sourceType ?? null, p_so_lo: input.soLo ?? null, p_fg_lot_id: input.fgLotId ?? null, p_metal_cleared: input.metalCleared ?? null, p_note: input.note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    return String(data)
  },

  async lay(input: {
    id?: string | null; lotId: string; kg: number | null; shiftDate?: string | null; shiftId?: string | null; team?: string | null; purpose: MixPurpose
    targetIndex?: string | null; targetValue?: number | null; productionOrderId?: string | null; note?: string | null
    rawLotIds?: string[] | null; soBanh?: number | null; grossKg?: number | null; palletKg?: number | null; viTri?: MixViTri | null
    /** lô cũ chưa có số lô: người lấy gõ, máy ghi vào lô */ soLo?: string | null
  }): Promise<string> {
    const { data, error } = await supabase.rpc('fn_mix_lay', {
      p_lot_id: input.lotId, p_kg: input.kg ?? null, p_shift_date: input.shiftDate ?? null, p_shift_id: input.shiftId ?? null, p_team: input.team ?? null,
      p_purpose: input.purpose, p_target_index: input.targetIndex ?? null, p_target_value: input.targetValue ?? null,
      p_production_order_id: input.productionOrderId ?? null, p_note: input.note ?? null, p_id: input.id ?? null,
      p_raw_lot_ids: input.rawLotIds?.length ? input.rawLotIds : null, p_so_banh: input.soBanh ?? null, p_gross_kg: input.grossKg ?? null, p_pallet_kg: input.palletKg ?? null, p_vi_tri: input.viTri ?? null, p_so_lo: input.soLo ?? null,
    })
    if (error) throw new Error(dichLoiNhapKho(error))
    return String(data)
  },

  /** Tên tổ đã dùng gần đây (sổ ca ép bành + phiếu chèn) để hiện thành nút bấm */
  async listTeams(facilityId: string): Promise<string[]> {
    const from = new Date(); from.setDate(from.getDate() - 90)
    const d = from.toISOString().slice(0, 10)
    const [a, b] = await Promise.all([
      supabase.from('shift_production_reports').select('team').eq('facility_id', facilityId).gte('report_date', d).not('team', 'is', null).limit(300),
      supabase.from('mix_issues').select('team').eq('facility_id', facilityId).gte('shift_date', d).not('team', 'is', null).limit(300),
    ])
    const names = [...((a.data ?? []) as any[]), ...((b.data ?? []) as any[])].map((r) => String(r.team ?? '').trim().replace(/^(tổ|ca)\s+/i, '')).filter(Boolean)
    const count = new Map<string, number>()
    for (const n of names) count.set(n, (count.get(n) ?? 0) + 1)
    return [...count.entries()].sort((x, y) => y[1] - x[1]).map(([n]) => n).slice(0, 6)
  },

  async tra(issueId: string, kgReturn: number, handover: boolean, note?: string | null, outputBatchId?: string | null, shiftId?: string | null, team?: string | null,
    can?: { grossKg?: number | null; palletKg?: number | null; soBanhTra?: number | null; dungHet?: boolean } | null): Promise<{ kg_used: number; kg_out: number; kg_return: number; bi: number | null }> {
    const { data, error } = await supabase.rpc('fn_mix_tra', {
      p_issue_id: issueId, p_kg_return: kgReturn, p_handover: handover, p_note: note ?? null, p_output_batch_id: outputBatchId ?? null, p_shift_id: shiftId ?? null, p_team: team ?? null,
      p_gross_kg: can?.grossKg ?? null, p_pallet_kg: can?.palletKg ?? null, p_so_banh_tra: can?.soBanhTra ?? null, p_dung_het: can?.dungHet ?? false,
    })
    if (error) throw new Error(dichLoiNhapKho(error))
    const d: any = data ?? {}
    return { kg_used: num(d.kg_used), kg_out: num(d.kg_out), kg_return: num(d.kg_return), bi: numOrNull(d.bi) }
  },

  /** Sửa cân lúc lấy (bì, hàng + pallet hoặc kg, số bành) khi phiếu chưa qua bước QS ký; máy tính lại kg lấy, dây chuyền, tiêu hao */
  async suaLay(issueId: string, input: { kg?: number | null; grossKg?: number | null; palletKg?: number | null; soBanh?: number | null; note?: string | null }): Promise<{ code: string; kg_truoc: number; kg_sau: number; so_banh: number }> {
    const { data, error } = await supabase.rpc('fn_mix_sua_lay', { p_issue_id: issueId, p_kg: input.kg ?? null, p_gross_kg: input.grossKg ?? null, p_pallet_kg: input.palletKg ?? null, p_so_banh: input.soBanh ?? null, p_note: input.note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    const d: any = data ?? {}
    return { code: String(d.code ?? ''), kg_truoc: num(d.kg_truoc), kg_sau: num(d.kg_sau), so_banh: num(d.so_banh) }
  },

  /** Đổi mã nguyên liệu gốc của phiếu chèn (một hay nhiều mã; rỗng = bỏ, máy lấy theo phiếu ca) — trước khi thủ kho nhận */
  async doiMaGoc(issueId: string, rawLotIds: string[], viTri?: MixViTri | null): Promise<void> {
    const { error } = await supabase.rpc('fn_mix_doi_ma_goc', { p_issue_id: issueId, p_raw_lot_ids: rawLotIds.length ? rawLotIds : null, p_vi_tri: viTri ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
  },

  /** Quyền của người đang đăng nhập trong quy trình hàng chèn (DB quyết, xem fn_mix_duoc_ky) */
  async quyen(facilityId?: string | null): Promise<MixQuyen> {
    const { data, error } = await supabase.rpc('fn_mix_quyen', { p_facility_id: facilityId ?? null })
    if (error) throw error
    const d: any = data ?? {}
    return { ...MIX_QUYEN_NONE, ...d, da_phan_cong: { ...MIX_QUYEN_NONE.da_phan_cong, ...(d.da_phan_cong ?? {}) } }
  },

  /** Ký nhiều phiếu một chạm (cả ca); phiếu lỗi trả về trong `loi`, phiếu khác vẫn ký */
  async kyNhieu(ids: string[], buoc: 'submit' | 'qc_confirm' | 'receive'): Promise<{ so_ky: number; loi: { id: string; code: string | null; loi: string }[] }> {
    const { data, error } = await supabase.rpc('fn_mix_ky_nhieu', { p_ids: ids, p_buoc: buoc })
    if (error) throw new Error(dichLoiNhapKho(error))
    const d: any = data ?? {}
    return { so_ky: num(d.so_ky), loi: (Array.isArray(d.loi) ? d.loi : []).map((x: any) => ({ id: String(x.id), code: x.code ?? null, loi: dichLoiNhapKho({ message: String(x.loi ?? '') }) })) }
  },

  async listSigners(includeRevoked = false): Promise<MixSigner[]> {
    let q = supabase.from('v_mix_signers').select('*').order('buoc').order('full_name')
    if (!includeRevoked) q = q.eq('is_active', true)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as MixSigner[]
  },
  async timNhanVien(q: string): Promise<NhanVienLite[]> {
    let s = supabase.from('employees').select('id, full_name, email').order('full_name').limit(20)
    if (q.trim()) s = s.ilike('full_name', `%${q.trim()}%`)
    const { data, error } = await s
    if (error) throw error
    return (data ?? []) as NhanVienLite[]
  },
  /** BGĐ phân công (RLS: chỉ level ≤ 3 ghi được) */
  async grantSigner(employeeId: string, buoc: MixBuoc, facilityId: string | null, notes?: string | null): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    let by: string | null = null
    if (user) { const { data: me } = await supabase.from('employees').select('id').eq('user_id', user.id).maybeSingle(); by = me?.id ?? null }
    const { error } = await supabase.from('mix_signers').insert({ employee_id: employeeId, buoc, facility_id: facilityId, granted_by: by, notes: notes ?? null })
    if (error) throw error
  },
  async revokeSigner(id: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser()
    let by: string | null = null
    if (user) { const { data: me } = await supabase.from('employees').select('id').eq('user_id', user.id).maybeSingle(); by = me?.id ?? null }
    const { error } = await supabase.from('mix_signers').update({ is_active: false, revoked_at: new Date().toISOString(), revoked_by: by }).eq('id', id)
    if (error) throw error
  },

  async ky(issueId: string, buoc: 'submit' | 'qc_confirm' | 'receive' | 'cancel', note?: string | null): Promise<{ next_issue_id: string | null }> {
    const { data, error } = await supabase.rpc('fn_mix_ky', { p_issue_id: issueId, p_buoc: buoc, p_note: note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    return { next_issue_id: (data as any)?.next_issue_id ?? null }
  },

  /** Sửa lô chèn từ điện thoại (đã xử lý kim loại, QC cho phép, mô tả) hoặc hủy lô chưa dùng */
  async suaLo(lotId: string, patch: { metalCleared?: boolean | null; qcAllowRerun?: boolean | null; qcAllowMixPct?: number | null; sourceDesc?: string | null; grade?: string | null; note?: string | null; huy?: boolean; soLo?: string | null; kgPerBanh?: number | null }): Promise<void> {
    const { error } = await supabase.rpc('fn_mix_sua_lo', { p_lot_id: lotId, p_metal_cleared: patch.metalCleared ?? null, p_qc_allow_rerun: patch.qcAllowRerun ?? null, p_qc_allow_mix_pct: patch.qcAllowMixPct ?? null, p_source_desc: patch.sourceDesc ?? null, p_grade: patch.grade ?? null, p_note: patch.note ?? null, p_huy: patch.huy ?? false, p_so_lo: patch.soLo ?? null, p_kg_per_banh: patch.kgPerBanh ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
  },

  async listNguonLoi(facilityId: string): Promise<MixNguonLoi[]> {
    const { data, error } = await supabase.from('v_mix_nguon_loi').select('*').eq('facility_id', facilityId).gt('con_lai_kg', 0.005).order('report_date', { ascending: false }).limit(60)
    if (error) throw error
    return ((data ?? []) as any[]).map((r) => ({ ...r, weight_per_unit: numOrNull(r.weight_per_unit), nhap_banh: num(r.nhap_banh), nhap_kg: numOrNull(r.nhap_kg), xuat_banh: num(r.xuat_banh), xuat_kg: numOrNull(r.xuat_kg), da_chuyen_kg: num(r.da_chuyen_kg), con_lai_kg: num(r.con_lai_kg) }))
  },
  async listNguonQc(facilityId: string): Promise<MixNguonQc[]> {
    const { data, error } = await supabase.from('v_mix_nguon_qc').select('*').eq('facility_id', facilityId).order('ngay_sx', { ascending: false }).limit(60)
    if (error) throw error
    return ((data ?? []) as any[]).map((r) => ({ ...r, po_min: numOrNull(r.po_min), po_max: numOrNull(r.po_max), mv_min: numOrNull(r.mv_min), mv_max: numOrNull(r.mv_max), da_chuyen: !!r.da_chuyen }))
  },
  async listNguonTp(facilityId: string): Promise<MixNguonTp[]> {
    const { data, error } = await supabase.from('v_mix_nguon_tp').select('*').eq('facility_id', facilityId).order('material_name')
    if (error) throw error
    return ((data ?? []) as any[]).map((r) => ({ ...r, weight_per_unit: numOrNull(r.weight_per_unit), ton_banh: num(r.ton_banh), ton_kg: num(r.ton_kg) }))
  },
  /** LOI/DKL từ dòng sổ ca đã nhận → lô chèn (kg mặc định = phần chưa chuyển) */
  async taoLoTuSoCa(lineId: string, kg?: number | null, note?: string | null, metalCleared = false, soLo?: string | null): Promise<string> {
    const { data, error } = await supabase.rpc('fn_mix_tao_lo_tu_so_ca', { p_line_id: lineId, p_kg: kg ?? null, p_note: note ?? null, p_metal_cleared: metalCleared, p_so_lo: soLo ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    return String(data)
  },
  /** Dòng sổ QC hàng không đạt → lô chèn */
  async taoLoTuQc(rejectId: string, kg: number, note?: string | null, metalCleared = true, soLo?: string | null): Promise<string> {
    const { data, error } = await supabase.rpc('fn_mix_tao_lo_tu_qc', { p_reject_id: rejectId, p_kg: kg, p_note: note ?? null, p_metal_cleared: metalCleared, p_so_lo: soLo ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    return String(data)
  },
  /** Hàng chuẩn từ kho TP → lô chèn + ghi xuất bành vào phiếu ca nháp của ca đó */
  async layHangChuan(input: { facilityId: string; materialId: string; kg: number; shiftDate: string; shiftId: string; note?: string | null; soLo: string }): Promise<{ lot_id: string; banh: number; kg: number; material: string }> {
    const { data, error } = await supabase.rpc('fn_mix_lay_hang_chuan', { p_facility_id: input.facilityId, p_material_id: input.materialId, p_kg: input.kg, p_shift_date: input.shiftDate, p_shift_id: input.shiftId, p_note: input.note ?? null, p_so_lo: input.soLo })
    if (error) throw new Error(dichLoiNhapKho(error))
    const d: any = data ?? {}
    return { lot_id: String(d.lot_id), banh: num(d.banh), kg: num(d.kg), material: String(d.material ?? '') }
  },
  /** Kiểm kê một lô chèn: cân thực → điều chỉnh tồn, có lý do */
  async kiemKe(lotId: string, kgThuc: number, lyDo?: string | null, note?: string | null): Promise<{ code: string; kg_so: number; kg_thuc: number; chenh_kg: number }> {
    const { data, error } = await supabase.rpc('fn_mix_kiem_ke', { p_lot_id: lotId, p_kg_thuc: kgThuc, p_ly_do: lyDo ?? null, p_note: note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    const d: any = data ?? {}
    return { code: String(d.code ?? ''), kg_so: num(d.kg_so), kg_thuc: num(d.kg_thuc), chenh_kg: num(d.chenh_kg) }
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
