// ============================================================================
// KHO NGUYÊN LIỆU MỦ — kiểu dữ liệu dùng chung (GĐ0)
// File: src/services/wms/raw.types.ts
//
// Mã loại hàng CHUẨN đồng bộ với bảng raw_rubber_types + hàm fn_chuan_hoa_loai_mu
// (docs/migrations/wms_nvl_p0_ma_loai_mu.sql + _v2_thanh_pham.sql).
// Hai nhóm: mủ thô (phải đo DRC) và thành phẩm từ nhà máy khác / mua ngoài
// (SVR, RSS, mủ ly tâm — DRC mặc định). "Hàng thương mại" là NGUỒN của lô,
// không phải loại hàng (xem RawLotSource).
// Mọi màn hình kho NVL dùng kiểu này, KHÔNG dùng RubberType cũ trong wms.types.ts.
// ============================================================================

export type RawRubberGroup = 'mu_tho' | 'thanh_pham' | 'tong_hop' | 'khac'

export type RawRubberType =
  | 'mu_nuoc' | 'mu_dong' | 'mu_tap' | 'mu_chen' | 'mu_to'
  | 'svr_3l' | 'svr_l' | 'svr_5' | 'svr_10' | 'svr_20' | 'svr_cv50' | 'svr_cv60'
  | 'rss_1' | 'rss_3' | 'latex_60'
  | 'sbr_1502'
  | 'khac'

export const RAW_RUBBER_TYPES: RawRubberType[] = [
  'mu_nuoc', 'mu_dong', 'mu_tap', 'mu_chen', 'mu_to',
  'svr_3l', 'svr_l', 'svr_5', 'svr_10', 'svr_20', 'svr_cv50', 'svr_cv60',
  'rss_1', 'rss_3', 'latex_60',
  'sbr_1502',
  'khac',
]

export const RAW_RUBBER_TYPE_LABELS: Record<RawRubberType, string> = {
  mu_nuoc: 'Mủ nước',
  mu_dong: 'Mủ đông',
  mu_tap: 'Mủ tạp',
  mu_chen: 'Mủ chén',
  mu_to: 'Mủ tờ (chưa phân hạng)',
  svr_3l: 'SVR 3L',
  svr_l: 'SVR L',
  svr_5: 'SVR 5',
  svr_10: 'SVR 10',
  svr_20: 'SVR 20',
  svr_cv50: 'SVR CV50',
  svr_cv60: 'SVR CV60',
  rss_1: 'RSS 1',
  rss_3: 'RSS 3',
  latex_60: 'Mủ ly tâm 60 %',
  sbr_1502: 'SBR 1502 (cao su tổng hợp)',
  khac: 'Khác',
}

export const RAW_RUBBER_TYPE_GROUP: Record<RawRubberType, RawRubberGroup> = {
  mu_nuoc: 'mu_tho', mu_dong: 'mu_tho', mu_tap: 'mu_tho', mu_chen: 'mu_tho', mu_to: 'mu_tho',
  svr_3l: 'thanh_pham', svr_l: 'thanh_pham', svr_5: 'thanh_pham', svr_10: 'thanh_pham', svr_20: 'thanh_pham',
  svr_cv50: 'thanh_pham', svr_cv60: 'thanh_pham', rss_1: 'thanh_pham', rss_3: 'thanh_pham', latex_60: 'thanh_pham',
  sbr_1502: 'tong_hop',
  khac: 'khac',
}

export const RAW_RUBBER_GROUP_LABELS: Record<RawRubberGroup, string> = {
  mu_tho: 'Mủ thô',
  thanh_pham: 'Thành phẩm (NM khác / mua ngoài)',
  tong_hop: 'Cao su tổng hợp (SBR…)',
  khac: 'Khác',
}

/** DRC dùng cho sổ khô khi phiếu không có DRC đo. null = bắt buộc đo (mủ thô). Khớp raw_rubber_types.drc_mac_dinh. */
export const RAW_RUBBER_TYPE_DEFAULT_DRC: Record<RawRubberType, number | null> = {
  mu_nuoc: null, mu_dong: null, mu_tap: null, mu_chen: null, mu_to: null,
  svr_3l: 100, svr_l: 100, svr_5: 100, svr_10: 100, svr_20: 100, svr_cv50: 100, svr_cv60: 100,
  rss_1: 100, rss_3: 100, latex_60: 60,
  sbr_1502: 100,
  khac: null,
}

/** Loại nào vào sổ kho khô (khac = không). Khớp raw_rubber_types.is_raw. */
export const RAW_RUBBER_TYPE_IS_RAW: Record<RawRubberType, boolean> = Object.fromEntries(
  RAW_RUBBER_TYPES.map((t) => [t, t !== 'khac']),
) as Record<RawRubberType, boolean>

/**
 * Bản TypeScript của fn_chuan_hoa_loai_mu (v2) — dùng khi hiển thị dữ liệu cũ ở client
 * (phiếu cân, lô, thưởng B2B, grade). Sổ kho tính ở DB bằng hàm SQL, đây chỉ để hiển thị.
 */
export function chuanHoaLoaiMu(v?: string | null): RawRubberType {
  const s = (v ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (['mu_nuoc', 'nuoc', 'latex', 'mủ_nước'].includes(s)) return 'mu_nuoc'
  if (['mu_dong', 'dong', 'mủ_đông'].includes(s)) return 'mu_dong'
  if (['mu_tap', 'tap', 'mủ_tạp'].includes(s)) return 'mu_tap'
  if (['mu_chen', 'chen', 'cup_lump', 'mủ_chén'].includes(s)) return 'mu_chen'
  if (['mu_to', 'to', 'sheet', 'mủ_tờ'].includes(s)) return 'mu_to'
  if (/^svr_?3l$/.test(s)) return 'svr_3l'
  if (/^svr_?l$/.test(s)) return 'svr_l'
  if (/^svr_?5$/.test(s)) return 'svr_5'
  if (/^svr_?10$/.test(s)) return 'svr_10'
  if (/^svr_?20$/.test(s)) return 'svr_20'
  if (/^svr_?cv_?50$/.test(s)) return 'svr_cv50'
  if (/^svr_?cv_?60$/.test(s)) return 'svr_cv60'
  if (/^(mu_)?rss_?1$/.test(s)) return 'rss_1'
  if (/^(mu_)?rss_?3$/.test(s) || s === 'rss') return 'rss_3'
  if (/^latex_?60$/.test(s) || s === 'mu_ly_tam' || s === 'mủ_ly_tâm') return 'latex_60'
  if (/^sbr_?1502$/.test(s) || s === 'sbr') return 'sbr_1502'
  return 'khac'
}

/**
 * Nguồn của một lô trong kho NVL (ghi ở lô từ GĐ1, không phải loại hàng).
 * thuong_mai = hàng mua về bán lại / không qua chế biến → xuất bán, không xuất sản xuất.
 */
export type RawLotSource = 'nong_ho' | 'dai_ly' | 'nha_may_khac' | 'thuong_mai' | 'chuyen_kho' | 'khac'

export const RAW_LOT_SOURCE_LABELS: Record<RawLotSource, string> = {
  nong_ho: 'Nông hộ / tiểu điền',
  dai_ly: 'Đại lý / thương lái',
  nha_may_khac: 'Nhà máy khác (mua thành phẩm)',
  thuong_mai: 'Hàng thương mại (mua về bán lại)',
  chuyen_kho: 'Chuyển kho nội bộ (TL / Lào / PD)',
  khac: 'Khác',
}

// ----------------------------------------------------------------------------
// Ngưỡng theo nhà máy — bảng raw_settings (wms_nvl_p0_cau_hinh.sql)
// ----------------------------------------------------------------------------
export interface RawSettings {
  id: string
  facility_id: string | null
  tuoi_lo_canh_bao_ngay: number
  chu_ky_can_lai_ngay: number
  can_lai_truoc_xuat_ngay: number
  nguong_lech_kho_pct: number
  nguong_lech_drc_ncc_diem: number
  /** { SVR_10: 20, SVR_3L: 10, ... } — % chèn tối đa theo grade */
  gioi_han_chen_pct: Record<string, number>
  chen_ban_giao_ca: boolean
  /** ['toan_canh','man_hinh_can'] */
  anh_bat_buoc: string[]
  notes: string | null
  updated_at: string
}

/** Giá trị dự phòng khi chưa đọc được DB — khớp DEFAULT trong migration. */
export const RAW_SETTINGS_DEFAULT: RawSettings = {
  id: '',
  facility_id: null,
  tuoi_lo_canh_bao_ngay: 20,
  chu_ky_can_lai_ngay: 7,
  can_lai_truoc_xuat_ngay: 3,
  nguong_lech_kho_pct: 0.5,
  nguong_lech_drc_ncc_diem: 3,
  gioi_han_chen_pct: { SVR_10: 20, SVR_20: 20, SVR_3L: 10, SVR_L: 10, SVR_5: 10, SVR_CV50: 0, SVR_CV60: 0 },
  chen_ban_giao_ca: true,
  anh_bat_buoc: ['toan_canh', 'man_hinh_can'],
  notes: null,
  updated_at: '',
}

// ----------------------------------------------------------------------------
// Chữ ký / quyền — fn_nvl_quyen (wms_nvl_p0_thu_kho_nvl.sql)
// ----------------------------------------------------------------------------
export type RawSignStep = 'submit' | 'qc_confirm' | 'receive' | 'approve_adjust' | 'cancel'

export interface RawPermissions {
  submit: boolean
  qc_confirm: boolean
  receive: boolean
  approve_adjust: boolean
  cancel: boolean
  /** Người đang đăng nhập có trong raw_store_keepers (cho nhà máy đang xem) */
  la_thu_kho: boolean
  la_qc: boolean
  la_bgd: boolean
  /** Đã chỉ định ít nhất một thủ kho chưa — false thì bước "nhận" đang MỞ cho mọi người */
  co_thu_kho: boolean
}

export const RAW_PERMISSIONS_NONE: RawPermissions = {
  submit: false, qc_confirm: false, receive: false, approve_adjust: false, cancel: false,
  la_thu_kho: false, la_qc: false, la_bgd: false, co_thu_kho: false,
}

export interface RawStoreKeeper {
  id: string
  employee_id: string
  facility_id: string | null
  granted_at: string
  revoked_at: string | null
  is_active: boolean
  notes: string | null
  employee?: { full_name: string | null; email: string | null } | null
  facility?: { code: string; name: string } | null
}

export const RAW_PHOTO_KIND_LABELS: Record<string, string> = {
  toan_canh: 'Toàn cảnh',
  man_hinh_can: 'Màn hình cân',
  bo_sung: 'Bổ sung',
}
