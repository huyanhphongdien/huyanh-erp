// ============================================================================
// FILE: src/services/wms/xuatKhoDoiChieuService.ts
// MODULE: Kho (WMS) — M4 Xuất bán → trừ kho
// MÔ TẢ: Đối chiếu theo NGÀY: lệnh điều xe nói bao nhiêu bành rời nhà máy ↔ sổ ca ghi
//        xuất bao nhiêu. CHỈ ĐỌC — không ghi gì, không trừ kho.
// VIEW: v_xuat_kho_tu_lenh_dieu_xe · v_doi_chieu_xuat_kho
//
// VÌ SAO CHỈ ĐỐI CHIẾU
//   Sổ ca trừ kho theo (nhà máy, mã hàng, số bành). Chuỗi điều xe có NGÀY và SỐ BÀNH rất
//   tốt nhưng THIẾU hai chiều còn lại: không bảng nào có `material_id` (grade là chữ tự do,
//   10 cách viết, và "SVR_10" không phân biệt nổi 4 mã SWG/ATC/JK/STD), và không có
//   `facility_id` ở đâu cả (86/131 container không có bằng chứng nhà máy).
//   Trừ kho tự động lúc này là bịa ra hai con số. Xem `wms_m4_p1_doi_chieu_xuat_kho.sql`.
//
// ⚠ ĐỪNG viết hàm nào ghi vào `shift_production_lines.xuat_banh`. Sổ ca đã ký là sổ cái
//   duy nhất; máy và người mà dùng chung một ô thì ai ghi sau thắng, và bất đồng biến mất
//   không dấu vết — trong khi con số của người mới là con số có chữ ký.
//
// ⚠ ĐỪNG bật đường `stock_out_orders` / `inventory_transactions` cho việc này. Đường đó đã
//   có đủ schema + service + trang nhưng 0 dòng, và nó đếm KG theo lô còn sổ ca đếm BÀNH
//   theo 24 mã ⇒ hai cán cân chạy song song, không bao giờ bằng nhau.
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

/** Một ngày: lệnh điều xe nói gì, sổ ca ghi gì, lệch bao nhiêu. */
export interface DoiChieuNgay {
  ngay: string
  soContainer: number
  banhTheoLenh: number
  kgTheoLenh: number
  banhTheoSoCa: number
  kgTheoSoCa: number
  lechBanh: number
  soPhieuCa: number
  soPhieuDaNhan: number
  /** Số dòng lệnh có kg/bành không khớp cỡ bành nào — dữ liệu sai, cần người sửa. */
  coKgBatThuong: number
  /** Số dòng lệnh mà số bành trên lệnh khác số bành trên container. */
  coLechSoBanh: number
  /** Số container đã phát lệnh nhưng chưa chốt "đã giao" (thường do bỏ trống cân thật). */
  coChuaChotGiao: number
}

/** Hàng rời nhà máy trong một ngày, tách theo loại ghi trên lệnh. */
export interface XuatTheoLoai {
  ngay: string
  loaiHang: string
  soContainer: number
  soBanh: number
  kgDinhMuc: number
  kgCanThat: number | null
  kgMoiBanh: number | null
  soDongKgBatThuong: number
  soDongLechSoBanh: number
  soContChuaChotGiao: number
}

// ============================================================================
// HELPERS
// ============================================================================

/** PostgREST trả `numeric` về dạng CHUỖI — cộng dồn bằng `+=` là nối chuỗi, không báo lỗi. */
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// ============================================================================
// SERVICE
// ============================================================================

export const xuatKhoDoiChieuService = {
  async getDoiChieu(opts?: { tuNgay?: string; denNgay?: string; limit?: number }): Promise<DoiChieuNgay[]> {
    let q = supabase
      .from('v_doi_chieu_xuat_kho')
      .select('*')
      .order('ngay', { ascending: false })
      .limit(opts?.limit ?? 120)
    if (opts?.tuNgay) q = q.gte('ngay', opts.tuNgay)
    if (opts?.denNgay) q = q.lte('ngay', opts.denNgay)
    const { data, error } = await q
    if (error) throw error
    return (data || []).map((r: Record<string, unknown>) => ({
      ngay: String(r.ngay ?? ''),
      soContainer: num(r.so_container),
      banhTheoLenh: num(r.banh_theo_lenh),
      kgTheoLenh: num(r.kg_theo_lenh),
      banhTheoSoCa: num(r.banh_theo_so_ca),
      kgTheoSoCa: num(r.kg_theo_so_ca),
      lechBanh: num(r.lech_banh),
      soPhieuCa: num(r.so_phieu_ca),
      soPhieuDaNhan: num(r.so_phieu_da_nhan),
      coKgBatThuong: num(r.co_kg_bat_thuong),
      coLechSoBanh: num(r.co_lech_so_banh),
      coChuaChotGiao: num(r.co_chua_chot_giao),
    }))
  },

  /** Chi tiết một ngày: hàng rời nhà máy tách theo loại ghi trên lệnh điều xe. */
  async getChiTietNgay(ngay: string): Promise<XuatTheoLoai[]> {
    const { data, error } = await supabase
      .from('v_xuat_kho_tu_lenh_dieu_xe')
      .select('*')
      .eq('ngay', ngay)
      .order('so_banh', { ascending: false })
    if (error) throw error
    return (data || []).map((r: Record<string, unknown>) => ({
      ngay: String(r.ngay ?? ''),
      loaiHang: String(r.loai_hang ?? ''),
      soContainer: num(r.so_container),
      soBanh: num(r.so_banh),
      kgDinhMuc: num(r.kg_dinh_muc),
      kgCanThat: numOrNull(r.kg_can_that),
      kgMoiBanh: numOrNull(r.kg_moi_banh),
      soDongKgBatThuong: num(r.so_dong_kg_bat_thuong),
      soDongLechSoBanh: num(r.so_dong_lech_so_banh),
      soContChuaChotGiao: num(r.so_cont_chua_chot_giao),
    }))
  },
}

export default xuatKhoDoiChieuService
