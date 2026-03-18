// ============================================================================
// RUBBER PRODUCT TYPES — Danh sách loại mủ cao su dùng chung toàn hệ thống
// File: src/constants/rubberProducts.ts
// Dùng cho: B2B (Booking, Deal, Demand), WMS (Stock-In, QC), App Cân Xe
// ============================================================================

/**
 * Loại mủ nguyên liệu (từ đại lý)
 */
export const RAW_RUBBER_TYPES = {
  mu_nuoc: 'Mủ nước',
  mu_tap: 'Mủ tạp',
  mu_dong: 'Mủ đông',
  mu_chen: 'Mủ chén',
  mu_to: 'Mủ tờ',
} as const

/**
 * Loại thành phẩm SVR (sau sản xuất)
 */
export const SVR_GRADES = {
  svr_3l: 'SVR 3L',
  svr_5: 'SVR 5',
  svr_10: 'SVR 10',
  svr_20: 'SVR 20',
  svr_cv60: 'SVR CV60',
} as const

/**
 * Tất cả loại sản phẩm (NVL + TP)
 * Dùng cho Booking, Deal, Demand, Stock-In
 */
export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  ...RAW_RUBBER_TYPES,
  ...SVR_GRADES,
}

/**
 * Options cho Select/Dropdown — nhóm theo loại
 */
export const PRODUCT_TYPE_OPTIONS = [
  {
    label: 'Nguyên liệu',
    options: Object.entries(RAW_RUBBER_TYPES).map(([value, label]) => ({
      value,
      label,
    })),
  },
  {
    label: 'Thành phẩm SVR',
    options: Object.entries(SVR_GRADES).map(([value, label]) => ({
      value,
      label,
    })),
  },
]

/**
 * Options phẳng (không nhóm) — cho filter, tags
 */
export const PRODUCT_TYPE_FLAT_OPTIONS = Object.entries(PRODUCT_TYPE_LABELS).map(
  ([value, label]) => ({ value, label })
)

/**
 * Chỉ nguyên liệu — cho Stock-In, Cân xe, Booking
 */
export const RAW_RUBBER_OPTIONS = Object.entries(RAW_RUBBER_TYPES).map(
  ([value, label]) => ({ value, label })
)

/**
 * Chỉ thành phẩm — cho Stock-Out, Production
 */
export const SVR_GRADE_OPTIONS = Object.entries(SVR_GRADES).map(
  ([value, label]) => ({ value, label })
)

/**
 * Lấy label từ product_type code
 */
export const getProductLabel = (code: string): string => {
  return PRODUCT_TYPE_LABELS[code] || code
}

/**
 * Kiểm tra có phải nguyên liệu không
 */
export const isRawMaterial = (code: string): boolean => {
  return code in RAW_RUBBER_TYPES
}

/**
 * Kiểm tra có phải thành phẩm SVR không
 */
export const isSvrGrade = (code: string): boolean => {
  return code in SVR_GRADES
}
