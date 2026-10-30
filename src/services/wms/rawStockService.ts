// ============================================================================
// KHO NGUYÊN LIỆU MỦ — sổ kho khô, nhập kho từ phiếu cân, tồn, cảnh báo (GĐ1)
// File: src/services/wms/rawStockService.ts
//
// Mọi con số kg khô TÍNH Ở DB (raw_stock_ledger + view); service chỉ đọc view
// và gọi hàm. Nhập kho = fn_nhap_kho_tu_phieu_can (một giao dịch, tách lô theo
// dòng phiếu, từ chối khi thiếu DRC). Sau khi DB nhập xong, service ghi thêm
// stock_in_orders + inventory_transactions như luồng cũ để các báo cáo WMS
// đang có không bị thiếu (best-effort, không chặn).
// Cột numeric về client là CHUỖI → bọc num().
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { RawRubberType, RawRubberGroup, RawLotSource } from './raw.types'

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ----------------------------------------------------------------------------
// TYPES (khớp view)
// ----------------------------------------------------------------------------
export interface RawStockByType {
  facility_id: string
  facility_code: string | null
  rubber_type: RawRubberType
  rubber_type_name: string
  nhom: RawRubberGroup
  so_lo: number
  wet_kg: number
  dry_kg: number
  drc_pct: number | null
  tuoi_bq_ngay: number | null
  tuoi_max_ngay: number | null
  so_lo_qua_tuoi: number
  so_lo_ton_dau_uoc: number
}

export interface RawBatchBalance {
  batch_id: string
  batch_no: string
  facility_id: string
  facility_code: string | null
  rubber_type: RawRubberType
  rubber_type_name: string
  nhom: RawRubberGroup
  supplier_name: string | null
  nguon_hang: RawLotSource | null
  ton_dau_uoc: boolean
  batch_status: string
  qc_status: string | null
  received_date: string | null
  weighbridge_ticket_id: string | null
  ticket_line_no: number | null
  warehouse_id: string | null
  wet_kg: number
  dry_kg: number
  drc_pct: number | null
  tuoi_ngay: number
  raw_lot_id?: string | null
  ma_nvl?: string | null
  xe_no?: string | null
  ngay_can_lai: string | null
  ngay_tu_lan_do: number
  so_dong_so: number
  cap_nhat: string
}

export type RawLedgerTxnType =
  | 'opening' | 'in' | 'in_transfer'
  | 'out_production' | 'out_sale' | 'out_transfer'
  | 'recheck_adjust' | 'stocktake_adjust'

export const RAW_TXN_LABELS: Record<RawLedgerTxnType, string> = {
  opening: 'Tồn đầu mở sổ',
  in: 'Nhập từ phiếu cân',
  in_transfer: 'Nhận chuyển kho',
  out_production: 'Xuất sản xuất',
  out_sale: 'Xuất bán',
  out_transfer: 'Chuyển kho đi',
  recheck_adjust: 'Cân lại / DRC lại',
  stocktake_adjust: 'Điều chỉnh kiểm kê',
}

export interface RawLedgerRow {
  id: string
  facility_id: string
  batch_id: string
  rubber_type: RawRubberType
  txn_type: RawLedgerTxnType
  txn_date: string
  wet_kg: number
  drc_pct: number | null
  dry_kg: number
  ref_type: string | null
  ref_id: string | null
  ref_line: number | null
  note: string | null
  created_by: string | null
  created_at: string
}

export interface RawIntakeQueueRow {
  ticket_id: string
  code: string
  facility_id: string | null
  facility_code: string | null
  ticket_type: string
  status: string
  completed_at: string | null
  vehicle_plate: string | null
  driver_name: string | null
  supplier_name: string | null
  source_type: string | null
  rubber_type_goc: string | null
  rubber_type: RawRubberType
  rubber_type_name: string | null
  nhom: RawRubberGroup | null
  net_weight: number
  expected_drc: number | null
  qc_actual_drc: number | null
  qc_status: string | null
  drc_dung: number | null
  so_dong_lo: number
  wet_kg_dong: number | null
  san_sang: boolean
  ly_do_cho: 'ok' | 'cho_drc' | 'loai_mu_la'
  dry_kg_du_kien: number | null
  lech_drc_ncc: number | null
  da_nhap: boolean
  batch_no: string | null
}

export interface RawAlert {
  facility_id: string | null
  loai: 'qua_tuoi' | 'cho_drc' | 'loai_mu_la' | 'lech_drc_ncc' | 'ton_dau_uoc' | 'den_han_can_lai' | 'lech_kho'
  muc: 'cao' | 'vua' | 'thap'
  batch_id: string | null
  batch_no: string | null
  ticket_id: string | null
  ticket_code: string | null
  tieu_de: string
  chi_tiet: string | null
  gia_tri: number | null
}

export interface RawDailyFlow {
  facility_id: string
  txn_date: string
  nhap_kho_kg: number
  mo_so_kho_kg: number
  xuat_kho_kg: number
  dieu_chinh_kho_kg: number
  so_dong: number
}

export interface OpeningStagingRow {
  id: string
  facility_code: string
  batch_code: string
  rubber_type: string
  ma_chuan: string
  wet_kg: number
  drc_pct: number | null
  drc_estimated: boolean
  intake_date: string | null
  dry_kg: number
  loi: string[]
  processed_at: string | null
  batch_id?: string | null
}

export interface OpeningRowInput {
  facility_code: string
  batch_code: string | null
  rubber_type: string
  wet_kg: number
  drc_pct: number | null
  drc_estimated: boolean
  intake_date: string | null
  supplier_name: string | null
  ticket_code: string | null
  note: string | null
}

export interface NhapKhoResult {
  batch_id: string
  batch_no: string
  rubber_type: RawRubberType
  wet_kg: number
  drc_pct: number
  dry_kg: number
}

/** Mã lỗi hàm DB → câu tiếng Việt cho người dùng */
export function dichLoiNhapKho(err: unknown): string {
  const msg = String((err as any)?.message ?? err ?? '')
  const m = msg.match(/(THIEU_NGUON|MA_DANG_CHAY_LENH_KHAC|THIEU_MA_LENH|KHONG_TIM_THAY_PHIEU|PHIEU_CHUA_HOAN_TAT|PHIEU_KHONG_PHAI_NHAP|THIEU_NHA_MAY|DA_NHAP|KHONG_CO_QUYEN_NHAN|KHONG_CO_QUYEN_GHI_DRC|KHONG_CO_QUYEN|DRC_KHONG_HOP_LE|DA_GHI_SO|THIEU_KHO_NVL|LOAI_MU_LA|THIEU_KHOI_LUONG|THIEU_DRC|TRUOC_NGAY_MO_SO|LENH_TRONG|KHONG_TIM_THAY_LO|LO_KHAC_NHA_MAY|LO_DA_HET|VUOT_TON|KHONG_TIM_THAY_DONG|LENH_DA_GUI_KY|KHONG_TIM_THAY_LENH|SAI_TRANG_THAI|THIEU_KG_CAN|DA_TRU_SO|BUOC_KHONG_HOP_LE|CAN_LY_DO|DANG_CO_KIEM_KE_MO|KHO_TRONG|KHONG_TIM_THAY_KIEM_KE|CON_LO_CHUA_DEM|DA_DUYET|KY_DA_KHOA|DKL_CHUA_XU_LY|TRA_QUA_LAY|THIEU_ANH|THIEU_CA|CON_PHIEU_CAN_CHO_NHAP|PHIEU_CA_CHUA_MO|PHIEU_CA_DA_KY|THIEU_CO_BANH|DA_CHUYEN_HET|LO_NVL_CHI_SUA_QUA_SO_KHO|THIEU_MA_NVL|MA_KHONG_HOP_LE|THIEU_SO_LO|TRUNG_SO_LO|LO_TP_CHUA_QC|LO_TP_KHONG_DU)(?::([^\n"]*))?/)
  if (!m) return msg || 'Lỗi không xác định'
  const chi_tiet = m[2] ? ` (${m[2]})` : ''
  switch (m[1]) {
    case 'KHONG_TIM_THAY_PHIEU': return 'Không tìm thấy phiếu'
    case 'PHIEU_CHUA_HOAN_TAT': return `Phiếu cân chưa hoàn tất${chi_tiet}`
    case 'PHIEU_KHONG_PHAI_NHAP': return `Phiếu không phải phiếu nhập${chi_tiet}`
    case 'THIEU_NHA_MAY': return `Phiếu chưa gắn nhà máy${chi_tiet}`
    case 'DA_NHAP': return `Phiếu đã nhập kho rồi${chi_tiet}`
    case 'KHONG_CO_QUYEN_NHAN': return 'Bạn không có quyền "thủ kho nhận" ở nhà máy này'
    case 'THIEU_KHO_NVL': return 'Nhà máy chưa có kho nguyên liệu (warehouse type raw)'
    case 'LOAI_MU_LA': return `Loại mủ lạ, không nhập được${chi_tiet}`
    case 'THIEU_KHOI_LUONG': return `Thiếu khối lượng${chi_tiet}`
    case 'THIEU_DRC': return `Thiếu DRC, chưa nhập kho được${chi_tiet}`
    case 'TRUOC_NGAY_MO_SO': return `Phiếu cân trước ngày mở sổ, hàng đã nằm trong tồn đầu${chi_tiet}`
    case 'KHONG_CO_QUYEN_GHI_DRC': return 'Chỉ QC, thủ kho NVL hoặc BGĐ mới ghi DRC vào phiếu'
    case 'DRC_KHONG_HOP_LE': return `DRC không hợp lệ${chi_tiet}`
    case 'DA_GHI_SO': return `Dòng đã ghi sổ, không xóa được${chi_tiet}`
    case 'KHONG_CO_QUYEN': return `Bạn không có quyền thực hiện bước này${chi_tiet}`
    case 'LENH_TRONG': return 'Lệnh xuất chưa có lô nào'
    case 'KHONG_TIM_THAY_LO': return `Không tìm thấy lô${chi_tiet}`
    case 'LO_KHAC_NHA_MAY': return `Lô thuộc nhà máy khác${chi_tiet}`
    case 'LO_DA_HET': return `Lô đã hết hàng${chi_tiet}`
    case 'VUOT_TON': return `Lấy nhiều hơn tồn của lô${chi_tiet}`
    case 'KHONG_TIM_THAY_DONG': return 'Không tìm thấy dòng lệnh xuất'
    case 'LENH_DA_GUI_KY': return `Lệnh đã gửi ký, không sửa kg cân nữa${chi_tiet}`
    case 'KHONG_TIM_THAY_LENH': return 'Không tìm thấy lệnh xuất'
    case 'SAI_TRANG_THAI': return `Lệnh không ở trạng thái phù hợp cho bước này${chi_tiet}`
    case 'THIEU_KG_CAN': return `Còn dòng chưa ghi kg cân thực${chi_tiet}`
    case 'DA_TRU_SO': return `Lệnh đã trừ sổ, không hủy được${chi_tiet}`
    case 'BUOC_KHONG_HOP_LE': return `Bước ký không hợp lệ${chi_tiet}`
    case 'CAN_LY_DO': return `Lệch khô vượt ngưỡng, phải ghi lý do${chi_tiet}`
    case 'DANG_CO_KIEM_KE_MO': return 'Nhà máy đang có phiếu kiểm kê chưa duyệt, xử lý xong rồi tạo mới'
    case 'KHO_TRONG': return 'Kho không có lô nào còn hàng để kiểm kê'
    case 'KHONG_TIM_THAY_KIEM_KE': return 'Không tìm thấy phiếu kiểm kê'
    case 'CON_LO_CHUA_DEM': return `Còn lô chưa đếm${chi_tiet}`
    case 'DA_DUYET': return `Phiếu đã duyệt, không hủy được${chi_tiet}`
    case 'KY_DA_KHOA': return `Kỳ đã khóa sổ, không ghi lùi ngày được${chi_tiet}`
    case 'DKL_CHUA_XU_LY': return `Lô dính kim loại chưa đánh dấu đã xử lý, không lấy chèn được${chi_tiet}`
    case 'TRA_QUA_LAY': return `Kg trả nhiều hơn kg lấy${chi_tiet}`
    case 'THIEU_CA': return `Phiếu chưa có ca, chọn ca trước${chi_tiet}`
    case 'CON_PHIEU_CAN_CHO_NHAP': return `Còn ${m[2] || ''} phiếu cân sẵn sàng chưa nhập kho. Nhập hết trước khi kiểm kê, hoặc xác nhận bỏ qua`
    case 'PHIEU_CA_CHUA_MO': return `Tổ chưa mở phiếu ca của ca này; mở phiếu ca (nháp) rồi lấy hàng chuẩn${chi_tiet}`
    case 'PHIEU_CA_DA_KY': return `Phiếu ca của ca này đã ký, ghi vào phiếu ca sau${chi_tiet}`
    case 'THIEU_CO_BANH': return `Chủng loại chưa khai cỡ bành (kg/bành), BGĐ cập nhật danh mục vật liệu${chi_tiet}`
    case 'DA_CHUYEN_HET': return `Dòng này đã chuyển hết sang kho chèn${chi_tiet}`
    case 'THIEU_MA_NVL': return `Phiếu chưa có mã nguyên liệu, chọn hoặc tạo mã rồi nhận${chi_tiet}`
    case 'MA_KHONG_HOP_LE': return `Mã không hợp lệ${chi_tiet}`
    case 'THIEU_SO_LO': return `Thiếu số lô${chi_tiet}`
    case 'TRUNG_SO_LO': return `Số lô đã có rồi${chi_tiet}`
    case 'LO_TP_CHUA_QC': return `Lô chưa bị QC đánh CXL / Loại, không chuyển chèn được${chi_tiet}`
    case 'LO_TP_KHONG_DU': return `Lô không đủ bành${chi_tiet}`
    case 'LO_NVL_CHI_SUA_QUA_SO_KHO': return `Lô NVL chỉ sửa được qua sổ kho (cân lại / kiểm kê / lệnh xuất)${chi_tiet}`
    case 'THIEU_ANH': return `Thiếu ảnh bắt buộc, chụp đủ rồi mới ký${chi_tiet.replace('mix_issue_out', 'lúc lấy').replace('mix_issue_return', 'lúc trả').replace('toan_canh', 'toàn cảnh').replace('man_hinh_can', 'màn hình cân')}`
    case 'THIEU_NGUON': return `Chưa chọn nguồn hàng chèn${chi_tiet}`
    case 'MA_DANG_CHAY_LENH_KHAC': return `Mã đang nằm trong lệnh khác${chi_tiet}`
    case 'THIEU_MA_LENH': return `Chưa chọn mã cho lệnh${chi_tiet}`
    default: return msg
  }
}

// ----------------------------------------------------------------------------
// SERVICE
// ----------------------------------------------------------------------------
export const rawStockService = {
  /** Tồn theo loại (nhà máy = undefined → mọi nhà máy, cộng theo loại) */
  async getBalanceByType(facilityId?: string | null): Promise<RawStockByType[]> {
    let q = supabase.from('v_raw_stock_by_type').select('*')
    if (facilityId) q = q.eq('facility_id', facilityId)
    const { data, error } = await q
    if (error) throw error
    const rows = (data ?? []).map((r: any): RawStockByType => ({
      ...r,
      so_lo: num(r.so_lo), wet_kg: num(r.wet_kg), dry_kg: num(r.dry_kg), drc_pct: numOrNull(r.drc_pct),
      tuoi_bq_ngay: numOrNull(r.tuoi_bq_ngay), tuoi_max_ngay: numOrNull(r.tuoi_max_ngay),
      so_lo_qua_tuoi: num(r.so_lo_qua_tuoi), so_lo_ton_dau_uoc: num(r.so_lo_ton_dau_uoc),
    }))
    if (facilityId) return rows
    // Gộp nhiều nhà máy về một dòng / loại
    const byType = new Map<string, RawStockByType>()
    for (const r of rows) {
      const cur = byType.get(r.rubber_type)
      if (!cur) { byType.set(r.rubber_type, { ...r, facility_id: '', facility_code: null }); continue }
      const wet = cur.wet_kg + r.wet_kg, dry = cur.dry_kg + r.dry_kg
      byType.set(r.rubber_type, {
        ...cur, so_lo: cur.so_lo + r.so_lo, wet_kg: wet, dry_kg: dry,
        drc_pct: wet > 0 ? Math.round((100 * dry / wet) * 100) / 100 : null,
        tuoi_bq_ngay: cur.so_lo + r.so_lo > 0
          ? Math.round(((cur.tuoi_bq_ngay ?? 0) * cur.so_lo + (r.tuoi_bq_ngay ?? 0) * r.so_lo) / (cur.so_lo + r.so_lo) * 10) / 10
          : null,
        tuoi_max_ngay: Math.max(cur.tuoi_max_ngay ?? 0, r.tuoi_max_ngay ?? 0),
        so_lo_qua_tuoi: cur.so_lo_qua_tuoi + r.so_lo_qua_tuoi,
        so_lo_ton_dau_uoc: cur.so_lo_ton_dau_uoc + r.so_lo_ton_dau_uoc,
      })
    }
    return Array.from(byType.values())
  },

  /** Lô còn hàng (mặc định) hoặc cả lô đã hết */
  async getBatches(opts: {
    facilityId?: string | null
    rubberType?: RawRubberType | null
    includeEmpty?: boolean
    search?: string
    limit?: number
  } = {}): Promise<RawBatchBalance[]> {
    let q = supabase.from('v_raw_stock_balance').select('*').order('received_date', { ascending: true })
    if (opts.facilityId) q = q.eq('facility_id', opts.facilityId)
    if (opts.rubberType) q = q.eq('rubber_type', opts.rubberType)
    if (!opts.includeEmpty) q = q.gt('dry_kg', 0.005)
    if (opts.search?.trim()) {
      const s = opts.search.trim()
      q = q.or(`batch_no.ilike.%${s}%,supplier_name.ilike.%${s}%`)
    }
    if (opts.limit) q = q.limit(opts.limit)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map(normalizeBatch)
  },

  async getBatch(batchId: string): Promise<RawBatchBalance | null> {
    const { data, error } = await supabase.from('v_raw_stock_balance').select('*').eq('batch_id', batchId).maybeSingle()
    if (error) throw error
    return data ? normalizeBatch(data) : null
  },

  async getLedger(batchId: string): Promise<RawLedgerRow[]> {
    const { data, error } = await supabase
      .from('raw_stock_ledger').select('*').eq('batch_id', batchId)
      .order('txn_date', { ascending: true }).order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []).map((r: any): RawLedgerRow => ({
      ...r, wet_kg: num(r.wet_kg), drc_pct: numOrNull(r.drc_pct), dry_kg: num(r.dry_kg),
    }))
  },

  /** Phiếu cân vào đã hoàn tất — mặc định chỉ phiếu chưa vào sổ */
  async getIntakeQueue(opts: {
    facilityId?: string | null
    includeDone?: boolean
    fromDate?: string
    toDate?: string
    limit?: number
  } = {}): Promise<RawIntakeQueueRow[]> {
    let q = supabase.from('v_raw_intake_queue').select('*').order('completed_at', { ascending: false })
    if (opts.facilityId) q = q.eq('facility_id', opts.facilityId)
    if (!opts.includeDone) q = q.eq('da_nhap', false)
    if (opts.fromDate) q = q.gte('completed_at', opts.fromDate)
    if (opts.toDate) q = q.lte('completed_at', opts.toDate)
    q = q.limit(opts.limit ?? 200)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []).map((r: any): RawIntakeQueueRow => ({
      ...r,
      net_weight: num(r.net_weight), expected_drc: numOrNull(r.expected_drc), qc_actual_drc: numOrNull(r.qc_actual_drc),
      drc_dung: numOrNull(r.drc_dung), so_dong_lo: num(r.so_dong_lo), wet_kg_dong: numOrNull(r.wet_kg_dong),
      dry_kg_du_kien: numOrNull(r.dry_kg_du_kien), lech_drc_ncc: numOrNull(r.lech_drc_ncc),
      san_sang: !!r.san_sang, da_nhap: !!r.da_nhap,
    }))
  },

  /**
   * NHẬP KHO: gọi hàm DB (một giao dịch). Trả danh sách lô đã tạo.
   * Sau đó ghi stock_in_orders + inventory_transactions như luồng cũ (best-effort).
   */
  async nhapKho(ticketId: string, opts: { warehouseId?: string | null; nguonHang?: RawLotSource | null; rawLotId?: string | null; ma?: string | null } = {}): Promise<NhapKhoResult[]> {
    const { data, error } = await supabase.rpc('fn_nhap_kho_tu_phieu_can', {
      p_ticket_id: ticketId,
      p_warehouse_id: opts.warehouseId ?? null,
      p_nguon_hang: opts.nguonHang ?? null,
      p_raw_lot_id: opts.rawLotId ?? null,
      p_ma: opts.ma ?? null,
    })
    if (error) throw new Error(dichLoiNhapKho(error))
    const batches: NhapKhoResult[] = ((data ?? []) as any[]).map((b) => ({
      batch_id: b.batch_id, batch_no: b.batch_no, rubber_type: b.rubber_type,
      wet_kg: num(b.wet_kg), drc_pct: num(b.drc_pct), dry_kg: num(b.dry_kg),
    }))
    // 2026-10-30 (audit T1): không đồng bộ sang sổ vật tư cũ nữa — kho vật tư đã rút khỏi module, sổ kho khô là nguồn duy nhất
    return batches
  },

  /** Mở sổ tồn đầu từ raw_opening_stock_staging (dòng không lỗi, chưa xử lý) */
  /** GĐ6: gán / đổi mã nguyên liệu cho một lô xe */
  async ganMa(batchId: string, rawLotId: string, xe?: string | null): Promise<void> {
    const { error } = await supabase.rpc('fn_nvl_gan_ma_lo_xe', { p_batch_id: batchId, p_raw_lot_id: rawLotId, p_xe: xe ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
  },

  async moSoTonDau(facilityCode?: string | null): Promise<{ so_lo: number; kho_kg: number }> {
    const { data, error } = await supabase.rpc('fn_mo_so_ton_dau', { p_facility_code: facilityCode ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
    return { so_lo: num((data as any)?.so_lo), kho_kg: num((data as any)?.kho_kg) }
  },

  async getOpeningStaging(): Promise<OpeningStagingRow[]> {
    const [{ data, error }, { data: ids }] = await Promise.all([
      supabase.from('v_raw_opening_stock_check').select('*').order('facility_code').order('batch_code'),
      supabase.from('raw_opening_stock_staging').select('id, batch_id'),
    ])
    if (error) throw error
    const batchById = new Map<string, string | null>((ids ?? []).map((r: any) => [r.id, r.batch_id ?? null]))
    return (data ?? []).map((r: any): OpeningStagingRow => ({
      ...r, wet_kg: num(r.wet_kg), drc_pct: numOrNull(r.drc_pct), dry_kg: num(r.dry_kg),
      drc_estimated: !!r.drc_estimated, loi: Array.isArray(r.loi) ? r.loi : [], batch_id: batchById.get(r.id) ?? null,
    }))
  },

  /** Thêm một dòng tồn đầu (chưa ghi sổ). Mã lô trống → DB tự đặt TD-<NM>-<loại>-<yymmdd>-<n>. */
  async addOpeningRow(input: OpeningRowInput): Promise<void> {
    let batchCode = input.batch_code
    if (!batchCode) {
      const { data, error } = await supabase.rpc('fn_nvl_ma_lo_ton_dau', { p_facility_code: input.facility_code, p_rubber_type: input.rubber_type })
      if (error) throw new Error(dichLoiNhapKho(error))
      batchCode = String(data)
    }
    const { data: { user } } = await supabase.auth.getUser()
    let createdBy: string | null = null
    if (user) {
      const { data: me } = await supabase.from('employees').select('id').eq('user_id', user.id).maybeSingle()
      createdBy = me?.id ?? null
    }
    const { error } = await supabase.from('raw_opening_stock_staging').insert({
      facility_code: input.facility_code.toUpperCase(), batch_code: batchCode, rubber_type: input.rubber_type,
      wet_kg: input.wet_kg, drc_pct: input.drc_pct, drc_estimated: input.drc_estimated, intake_date: input.intake_date,
      supplier_name: input.supplier_name, ticket_code: input.ticket_code, note: input.note, created_by: createdBy,
    })
    if (error) throw new Error(dichLoiNhapKho(error))
  },

  async deleteOpeningRow(id: string): Promise<void> {
    const { error } = await supabase.rpc('fn_nvl_xoa_dong_ton_dau', { p_id: id })
    if (error) throw new Error(dichLoiNhapKho(error))
  },

  /** Lab / thủ kho / BGĐ ghi DRC đo vào phiếu cân chưa vào sổ (PD chưa có thói quen ghi DRC tại cân). */
  async ghiDrcPhieu(ticketId: string, drc: number, note?: string | null): Promise<void> {
    const { error } = await supabase.rpc('fn_nvl_ghi_drc_phieu', { p_ticket_id: ticketId, p_drc: drc, p_note: note ?? null })
    if (error) throw new Error(dichLoiNhapKho(error))
  },

  async getAlerts(facilityId?: string | null): Promise<RawAlert[]> {
    let q = supabase.from('v_raw_alerts').select('*')
    if (facilityId) q = q.eq('facility_id', facilityId)
    const { data, error } = await q
    if (error) throw error
    const order: Record<string, number> = { cao: 0, vua: 1, thap: 2 }
    return ((data ?? []) as any[])
      .map((r) => ({ ...r, gia_tri: numOrNull(r.gia_tri) }) as RawAlert)
      .sort((a, b) => (order[a.muc] ?? 9) - (order[b.muc] ?? 9))
  },

  async getDailyFlow(facilityId: string | null | undefined, days = 14): Promise<RawDailyFlow[]> {
    const from = new Date(); from.setDate(from.getDate() - (days - 1))
    const fromStr = from.toISOString().slice(0, 10)
    let q = supabase.from('v_raw_daily_flow').select('*').gte('txn_date', fromStr).order('txn_date')
    if (facilityId) q = q.eq('facility_id', facilityId)
    const { data, error } = await q
    if (error) throw error
    // Gộp theo ngày (nhiều nhà máy) + điền ngày trống
    const byDay = new Map<string, RawDailyFlow>()
    for (const r of (data ?? []) as any[]) {
      const cur = byDay.get(r.txn_date) ?? { facility_id: facilityId ?? '', txn_date: r.txn_date, nhap_kho_kg: 0, mo_so_kho_kg: 0, xuat_kho_kg: 0, dieu_chinh_kho_kg: 0, so_dong: 0 }
      cur.nhap_kho_kg += num(r.nhap_kho_kg); cur.mo_so_kho_kg += num(r.mo_so_kho_kg)
      cur.xuat_kho_kg += num(r.xuat_kho_kg); cur.dieu_chinh_kho_kg += num(r.dieu_chinh_kho_kg); cur.so_dong += num(r.so_dong)
      byDay.set(r.txn_date, cur)
    }
    const out: RawDailyFlow[] = []
    for (let i = 0; i < days; i++) {
      const d = new Date(from); d.setDate(from.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      out.push(byDay.get(key) ?? { facility_id: facilityId ?? '', txn_date: key, nhap_kho_kg: 0, mo_so_kho_kg: 0, xuat_kho_kg: 0, dieu_chinh_kho_kg: 0, so_dong: 0 })
    }
    return out
  },

  /** Tổng hợp nhanh cho thẻ chỉ số của tổng quan */
  async getOverviewStats(facilityId?: string | null): Promise<{
    dry_kg: number; wet_kg: number; so_lo: number; drc_pct: number | null; tuoi_bq: number | null;
    so_lo_qua_tuoi: number; nhap_hom_nay_kho_kg: number; nhap_hom_nay_so_phieu: number; cho_nhap_so_phieu: number; cho_drc_so_phieu: number
  }> {
    const [byType, queue, flow] = await Promise.all([
      this.getBalanceByType(facilityId),
      this.getIntakeQueue({ facilityId, includeDone: true, fromDate: new Date().toISOString().slice(0, 10) }),
      this.getDailyFlow(facilityId, 1),
    ])
    const wet = byType.reduce((s, r) => s + r.wet_kg, 0)
    const dry = byType.reduce((s, r) => s + r.dry_kg, 0)
    const soLo = byType.reduce((s, r) => s + r.so_lo, 0)
    const tuoiW = byType.reduce((s, r) => s + (r.tuoi_bq_ngay ?? 0) * r.so_lo, 0)
    return {
      dry_kg: dry, wet_kg: wet, so_lo: soLo,
      drc_pct: wet > 0 ? Math.round((100 * dry / wet) * 10) / 10 : null,
      tuoi_bq: soLo > 0 ? Math.round(tuoiW / soLo) : null,
      so_lo_qua_tuoi: byType.reduce((s, r) => s + r.so_lo_qua_tuoi, 0),
      nhap_hom_nay_kho_kg: flow[0]?.nhap_kho_kg ?? 0,
      nhap_hom_nay_so_phieu: queue.filter((q) => q.da_nhap).length,
      cho_nhap_so_phieu: queue.filter((q) => !q.da_nhap && q.san_sang).length,
      cho_drc_so_phieu: queue.filter((q) => !q.da_nhap && !q.san_sang).length,
    }
  },
}

function normalizeBatch(r: any): RawBatchBalance {
  return {
    ...r,
    wet_kg: num(r.wet_kg), dry_kg: num(r.dry_kg), drc_pct: numOrNull(r.drc_pct),
    tuoi_ngay: num(r.tuoi_ngay), ngay_tu_lan_do: num(r.ngay_tu_lan_do), so_dong_so: num(r.so_dong_so),
    ticket_line_no: numOrNull(r.ticket_line_no), ton_dau_uoc: !!r.ton_dau_uoc,
  }
}

/**
 * Giữ các báo cáo WMS cũ: một stock_in_orders cho phiếu + inventory_transactions
 * cho từng lô. Không chặn nếu lỗi — sổ kho khô mới là nguồn sự thật của kho NVL.
 */
export default rawStockService
