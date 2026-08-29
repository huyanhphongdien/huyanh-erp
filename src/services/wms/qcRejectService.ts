// ============================================================================
// FILE: src/services/wms/qcRejectService.ts
// MODULE: Kho (WMS) — M6 Sổ QC theo dõi hàng không đạt
// MÔ TẢ: Số hoá cuốn sổ in sẵn QC đang giữ và ghi tay. Tám cột, đúng thứ tự giấy.
// BẢNG: qc_reject_log · view v_qc_reject_theo_lo
//
// GIÁ TRỊ THẬT CỦA CUỐN SỔ NẰM Ở CỘT "MÃ NG.LIỆU"
//   Nó ghi mã LÔ BÃI (TMHG-26, TMNL-01…). Tức nhà máy ĐÃ truy ngược hàng hỏng về lô
//   nguyên liệu đầu vào, bằng tay, trên giấy. Sợi dây đó nối "lô mủ mua của ai" với
//   "bao nhiêu bành phải tái chế" — không có nó thì người giao hàng tốt và người giao
//   hàng xấu nhận cùng một giá. `getTheoLo()` chỉ làm nhanh việc họ đã làm đúng.
//
// ⚠ BỐN ĐIỀU CỐ Ý KHÔNG LÀM (rút từ chính tờ sổ, xem `wms_m6_p1_*.sql`):
//   1. `toSx` là CHỮ TỰ DO, không phải khoá ngoại sang `shifts`. Sổ ca ghi ca bằng SỐ,
//      sổ QC ghi bằng TÊN TỔ MÀU ('Vàng','Đen'). Hai cuốn, hai cách gọi.
//   2. `tinhTrangXuLy` KHÔNG bắt buộc — trên giấy trống 13/13 dòng.
//   3. `soLo` không ràng buộc định dạng — ba dạng đang cùng tồn tại trên giấy.
//   4. `maNguyenLieu` cho phép NULL = "như dòng trên" (8/13 dòng dùng dấu nháy lặp).
//
// ⚠ Po KHÁC PRI. Nhà máy đo Po 30–36,5 còn PRI 70–79. "Po 250-295" trên sổ nghĩa là
//   25,0–29,5. Đừng bao giờ nhét Po vào cột `pri_value` của các bảng QC khác.
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

/**
 * Hai giá trị của cột "Tình trạng" — MỘT trường, không phải hai ô tick.
 *
 * ⚠ CXL ("chờ xử lý") KHÔNG có nghĩa "đã biết hỏng, đang chờ đem đi xử lý". Chủ doanh nghiệp
 *   xác nhận 29/08/2026: đó là **trạng thái CHƯA PHÂN LOẠI — QC chưa có kết quả test từ
 *   phòng lab**. Một lô CXL có thể hoá ra vẫn đạt. Đừng đếm CXL như hàng hỏng.
 */
export type QCTinhTrang = 'CXL' | 'LOAI'

export const TINH_TRANG_LABEL: Record<QCTinhTrang, string> = {
  CXL: 'Chờ kết quả lab',
  LOAI: 'Loại',
}

export const TINH_TRANG_COLOR: Record<QCTinhTrang, string> = {
  CXL: 'gold',
  LOAI: 'red',
}

export interface QCReject {
  id: string
  facilityId: string | null
  ngaySx: string
  /** Cột "Ca làm việc" của sổ QC — thực tế ghi TÊN TỔ ('Vàng','Đen'). */
  toSx: string | null
  soLo: string | null
  tinhTrang: QCTinhTrang
  lyDo: string | null
  poMin: number | null
  poMax: number | null
  mvMin: number | null
  mvMax: number | null
  /** Mã LÔ BÃI nguyên liệu, đúng như trên giấy. NULL = dấu nháy lặp ("như dòng trên"). */
  maNguyenLieu: string | null
  /**
   * Mã có hiệu lực: của chính dòng đó, hoặc mã gần nhất phía trên nếu dòng bỏ trống.
   * ⚠ Do VIEW `v_qc_reject_log` suy ra, KHÔNG tính lại ở đây. Trước 29/08/2026 luật này
   *   nằm ở hai nơi — TypeScript suy còn SQL thì không — và cùng một cuốn sổ cho ra hai
   *   con số: màn hình nói TMHG-26 xuất hiện 3 lần, thống kê nói 2.
   */
  maNguyenLieuHieuLuc: string | null
  ghiChu: string | null
  tinhTrangXuLy: string | null
  createdAt: string
}

/** Ô nhập: KHÔNG có `maNguyenLieuHieuLuc` — đó là giá trị view suy ra, không ai gõ. */
export type QCRejectInput = Omit<QCReject, 'id' | 'createdAt' | 'maNguyenLieuHieuLuc'>

/**
 * Ba đường xử lý hàng không đạt, theo lời chủ doanh nghiệp 29/08/2026:
 * Po thấp → CẢ HAI đường (trộn / chạy lò lại), tuỳ lô. DKL → xử lý kim loại TRƯỚC, rồi mới
 * vào một trong hai đường đó. **QC là người quyết**, sau khi có kết quả lab.
 *
 * ⚠ Đây là GỢI Ý, không phải ràng buộc. Cột `tinh_trang_xu_ly` vẫn là chữ tự do: mới đọc
 *   được MỘT trang sổ và trang đó trống 13/13 dòng, nên chưa ai biết đủ tập giá trị thật.
 *   Ràng buộc bây giờ là ép nhà máy chọn trong một danh sách tôi đoán ra.
 */
export const CACH_XU_LY_GOI_Y = [
  'Phối trộn vào lô tốt',
  'Chạy lò lại',
  'Xử lý kim loại rồi chạy lại',
  'Xử lý kim loại rồi phối trộn',
] as const

/** Vòng tái chế trong một ngày ở một nhà máy. */
export interface VongTaiChe {
  ngay: string
  loiLamRaBanh: number
  dklLamRaBanh: number
  khongDatLamRaBanh: number
  khongDatDemXuLyBanh: number
  datLamRaBanh: number
  tongNhapBanh: number
  tyLeKhongDatPc: number | null
  /** true = sản lượng "đạt" ngày đó CÓ lẫn hàng chạy lại, tờ giấy không tách được nguồn. */
  coTaiCheTrongKy: boolean
}

/** Một lô bãi và số lần nó sinh ra hàng không đạt. */
export interface QCTheoLo {
  maNguyenLieu: string
  soLan: number
  /** Trong số đó, bao nhiêu dòng là suy từ dấu nháy lặp chứ không ghi thẳng. */
  soLanKeThua: number
  soLanLoai: number
  soLanChoXuLy: number
  poThapNhat: number | null
  poCaoNhat: number | null
  lanDau: string
  lanGanNhat: string
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * PostgREST trả `numeric` về dưới dạng CHUỖI. Cộng dồn bằng `+=` trên chuỗi là NỐI
 * CHUỖI chứ không báo lỗi — cùng lý do salesLotService và shiftBookService đều bọc num().
 */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

// ============================================================================
// SERVICE
// ============================================================================

export const qcRejectService = {
  async list(opts?: { facilityId?: string; tuNgay?: string; denNgay?: string; limit?: number }): Promise<QCReject[]> {
    let q = supabase
      // Đọc VIEW, không đọc bảng — view là nơi dấu nháy lặp được suy ra.
      .from('v_qc_reject_log')
      .select('*')
      .order('ngay_sx', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(opts?.limit ?? 200)
    if (opts?.facilityId) q = q.eq('facility_id', opts.facilityId)
    if (opts?.tuNgay) q = q.gte('ngay_sx', opts.tuNgay)
    if (opts?.denNgay) q = q.lte('ngay_sx', opts.denNgay)
    const { data, error } = await q
    if (error) throw error
    return (data || []).map(map1)
  },

  async create(input: QCRejectInput, employeeId?: string | null): Promise<QCReject> {
    const { data, error } = await supabase
      .from('qc_reject_log')
      .insert({ ...toRow(input), created_by: employeeId ?? null })
      .select('*')
      .single()
    if (error) throw error
    return map1(data)
  },

  async update(id: string, patch: Partial<QCRejectInput>): Promise<void> {
    const body: Record<string, unknown> = { ...toRow(patch), updated_at: new Date().toISOString() }
    const { error } = await supabase.from('qc_reject_log').update(body).eq('id', id)
    if (error) throw error
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('qc_reject_log').delete().eq('id', id)
    if (error) throw error
  },

  /**
   * Lô bãi nào sinh ra nhiều hàng không đạt nhất — câu hỏi đáng tiền nhất của cuốn sổ.
   *
   * ⚠ Gộp theo CHUỖI mã. Mã lô ở cân đang gõ tự do (18/967 phiếu có mã, và cùng một lô
   *   đã bị gõ 3 kiểu khác nhau) ⇒ một lô có thể bị tách thành mấy dòng ở đây. Đó là lỗi
   *   của khâu nhập ở cân, không phải của view; sửa đúng chỗ là đổi ô đó thành danh sách chọn.
   */
  async getTheoLo(facilityId?: string): Promise<QCTheoLo[]> {
    let q = supabase
      .from('v_qc_reject_theo_lo')
      .select('*')
      .order('so_lan', { ascending: false })
    if (facilityId) q = q.eq('facility_id', facilityId)
    const { data, error } = await q
    if (error) throw error
    return (data || []).map((r: Record<string, unknown>) => ({
      maNguyenLieu: String(r.ma_nguyen_lieu ?? ''),
      soLan: num(r.so_lan),
      soLanKeThua: num(r.so_lan_ke_thua),
      soLanLoai: num(r.so_lan_loai),
      soLanChoXuLy: num(r.so_lan_cho_xu_ly),
      poThapNhat: numOrNull(r.po_thap_nhat),
      poCaoNhat: numOrNull(r.po_cao_nhat),
      lanDau: String(r.lan_dau ?? ''),
      lanGanNhat: String(r.lan_gan_nhat ?? ''),
    }))
  },

  /**
   * Vòng tái chế: hàng không đạt làm ra, đem đi xử lý, và hàng đạt làm ra — theo ngày.
   *
   * ⚠ ĐỪNG tính hiệu suất tái chế từ mấy con số này. Tờ giấy ghi "xuất 432 LOI" và ghi
   *   "nhập 400 STD" nhưng KHÔNG ghi rằng 400 đó từ 432 kia — ca nào vừa chạy nguyên liệu
   *   mới vừa chạy hàng tái chế thì không tách được. Cờ `coTaiCheTrongKy` bật là để nói
   *   ra điều đó, không phải để bỏ qua.
   */
  async getVongTaiChe(facilityId?: string, tuNgay?: string): Promise<VongTaiChe[]> {
    let q = supabase
      .from('v_vong_tai_che')
      .select('*')
      .order('ngay', { ascending: false })
      .limit(180)
    if (facilityId) q = q.eq('facility_id', facilityId)
    if (tuNgay) q = q.gte('ngay', tuNgay)
    const { data, error } = await q
    if (error) throw error
    return (data || []).map((r: Record<string, unknown>) => ({
      ngay: String(r.ngay ?? ''),
      loiLamRaBanh: num(r.loi_lam_ra_banh),
      dklLamRaBanh: num(r.dkl_lam_ra_banh),
      khongDatLamRaBanh: num(r.khong_dat_lam_ra_banh),
      khongDatDemXuLyBanh: num(r.khong_dat_dem_xu_ly_banh),
      datLamRaBanh: num(r.dat_lam_ra_banh),
      tongNhapBanh: num(r.tong_nhap_banh),
      tyLeKhongDatPc: numOrNull(r.ty_le_khong_dat_pc),
      coTaiCheTrongKy: Boolean(r.co_tai_che_trong_ky),
    }))
  },

  /** Gợi ý mã lô bãi đã từng gõ, để người sau chọn lại thay vì gõ ra kiểu thứ tư. */
  async goiYMaNguyenLieu(): Promise<string[]> {
    const { data, error } = await supabase
      .from('qc_reject_log')
      .select('ma_nguyen_lieu')
      .not('ma_nguyen_lieu', 'is', null)
      .order('ngay_sx', { ascending: false })
      .limit(300)
    if (error) throw error
    return [...new Set((data || []).map((r: Record<string, unknown>) => String(r.ma_nguyen_lieu)))]
  },
}

// ============================================================================
// MAPPERS
// ============================================================================

function map1(r: Record<string, unknown>): QCReject {
  return {
    id: String(r.id),
    facilityId: (r.facility_id as string) ?? null,
    ngaySx: String(r.ngay_sx ?? ''),
    toSx: (r.to_sx as string) ?? null,
    soLo: (r.so_lo as string) ?? null,
    tinhTrang: (r.tinh_trang as QCTinhTrang) ?? 'CXL',
    lyDo: (r.ly_do as string) ?? null,
    poMin: numOrNull(r.po_min),
    poMax: numOrNull(r.po_max),
    mvMin: numOrNull(r.mv_min),
    mvMax: numOrNull(r.mv_max),
    maNguyenLieu: (r.ma_nguyen_lieu as string) ?? null,
    maNguyenLieuHieuLuc: (r.ma_nguyen_lieu_hieu_luc as string) ?? (r.ma_nguyen_lieu as string) ?? null,
    ghiChu: (r.ghi_chu as string) ?? null,
    tinhTrangXuLy: (r.tinh_trang_xu_ly as string) ?? null,
    createdAt: String(r.created_at ?? ''),
  }
}

/** Chỉ gửi lên những khoá thật sự có trong patch — tránh xoá trắng cột không định sửa. */
function toRow(v: Partial<QCRejectInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (v.facilityId !== undefined) out.facility_id = v.facilityId
  if (v.ngaySx !== undefined) out.ngay_sx = v.ngaySx
  if (v.toSx !== undefined) out.to_sx = v.toSx || null
  if (v.soLo !== undefined) out.so_lo = v.soLo || null
  if (v.tinhTrang !== undefined) out.tinh_trang = v.tinhTrang
  if (v.lyDo !== undefined) out.ly_do = v.lyDo || null
  if (v.poMin !== undefined) out.po_min = v.poMin
  if (v.poMax !== undefined) out.po_max = v.poMax
  if (v.mvMin !== undefined) out.mv_min = v.mvMin
  if (v.mvMax !== undefined) out.mv_max = v.mvMax
  if (v.maNguyenLieu !== undefined) out.ma_nguyen_lieu = v.maNguyenLieu || null
  if (v.ghiChu !== undefined) out.ghi_chu = v.ghiChu || null
  if (v.tinhTrangXuLy !== undefined) out.tinh_trang_xu_ly = v.tinhTrangXuLy || null
  return out
}

export default qcRejectService
