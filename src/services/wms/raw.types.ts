// ============================================================================
// KHO NGUYÊN LIỆU MỦ — kiểu dữ liệu dùng chung (GĐ0)
// File: src/services/wms/raw.types.ts
//
// Mã loại mủ CHUẨN đồng bộ với bảng raw_rubber_types + hàm fn_chuan_hoa_loai_mu
// (docs/migrations/wms_nvl_p0_ma_loai_mu.sql). Mọi màn hình kho NVL dùng kiểu
// này, KHÔNG dùng RubberType cũ (10 giá trị, trùng nghĩa) trong wms.types.ts.
// ============================================================================

export type RawRubberType = 'mu_nuoc' | 'mu_dong' | 'mu_tap' | 'mu_chen' | 'mu_to' | 'khac'

export const RAW_RUBBER_TYPES: RawRubberType[] = ['mu_nuoc', 'mu_dong', 'mu_tap', 'mu_chen', 'mu_to', 'khac']

export const RAW_RUBBER_TYPE_LABELS: Record<RawRubberType, string> = {
  mu_nuoc: 'Mủ nước',
  mu_dong: 'Mủ đông',
  mu_tap: 'Mủ tạp',
  mu_chen: 'Mủ chén',
  mu_to: 'Mủ tờ',
  khac: 'Khác',
}

/** Loại nào vào sổ kho khô (khac = không). Khớp raw_rubber_types.is_raw. */
export const RAW_RUBBER_TYPE_IS_RAW: Record<RawRubberType, boolean> = {
  mu_nuoc: true, mu_dong: true, mu_tap: true, mu_chen: true, mu_to: true, khac: false,
}

/**
 * Bản TypeScript của fn_chuan_hoa_loai_mu — dùng khi hiển thị dữ liệu cũ ở client
 * (phiếu cân, lô, thưởng B2B). Sổ kho tính ở DB bằng hàm SQL, đây chỉ để hiển thị.
 */
export function chuanHoaLoaiMu(v?: string | null): RawRubberType {
  const s = (v ?? '').trim().toLowerCase()
  switch (s) {
    case 'mu_nuoc': case 'nuoc': case 'latex': case 'mủ nước': return 'mu_nuoc'
    case 'mu_dong': case 'dong': case 'mủ đông': return 'mu_dong'
    case 'mu_tap': case 'tap': case 'mủ tạp': return 'mu_tap'
    case 'mu_chen': case 'chen': case 'cup_lump': case 'mủ chén': return 'mu_chen'
    case 'mu_to': case 'to': case 'sheet': case 'mu_rss3': case 'rss': case 'mủ tờ': return 'mu_to'
    default: return 'khac'
  }
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
