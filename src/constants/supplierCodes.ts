// ============================================================================
// SUPPLIER CODE CONSTANTS — Quy tắc đặt mã NCC nguyên liệu chính
// File: src/constants/supplierCodes.ts
// Ref: docs/Cách đặt mã NCC NGUYÊN LIỆU CHÍNH (1).pdf
// ============================================================================
// Quy tắc: [Vùng 2 chữ][Tên NCC 2 chữ][Số thứ tự 2 số]
// VD: QIIN01 = Quảng Trị + Nguyễn Hữu Giới + lần 01
// ============================================================================

// ============================================================================
// BẢNG 1: Mã vùng nguyên liệu (từ PDF)
// ============================================================================

export interface RegionCode {
  code: string   // 2 ký tự
  name: string   // Tên đầy đủ
  country: 'VN' | 'LA' | 'TH' | 'PH' | 'MM' | 'KH'
}

export const REGION_CODES: RegionCode[] = [
  // Việt Nam
  { code: 'GI', name: 'Gia Lai', country: 'VN' },
  { code: 'HH', name: 'Hà Tĩnh', country: 'VN' },
  { code: 'HN', name: 'Hưng Yên', country: 'VN' },
  { code: 'LU', name: 'Lai Châu', country: 'VN' },
  { code: 'LN', name: 'Lạng Sơn', country: 'VN' },
  { code: 'LI', name: 'Lào Cai', country: 'VN' },
  { code: 'NN', name: 'Nghệ An', country: 'VN' },
  { code: 'NH', name: 'Ninh Bình', country: 'VN' },
  { code: 'PN', name: 'Phú Yên', country: 'VN' },
  { code: 'QH', name: 'Quảng Bình', country: 'VN' },
  { code: 'QI', name: 'Quảng Trị', country: 'VN' },
  { code: 'TH', name: 'Tây Ninh', country: 'VN' },
  { code: 'TN', name: 'Thái Nguyên', country: 'VN' },
  { code: 'TA', name: 'Thanh Hóa', country: 'VN' },
  { code: 'TE', name: 'Thừa Thiên Huế', country: 'VN' },
  { code: 'YI', name: 'Yên Bái', country: 'VN' },
  { code: 'NG', name: 'Nghệ An (2)', country: 'VN' },
  { code: 'DN', name: 'Điện Biên', country: 'VN' },
  { code: 'BP', name: 'Bình Phước', country: 'VN' },
  { code: 'DI', name: 'Đồng Nai', country: 'VN' },
  { code: 'BR', name: 'Bà Rịa - Vũng Tàu', country: 'VN' },
  { code: 'BU', name: 'Bình Dương', country: 'VN' },
  // Quốc tế
  { code: 'LA', name: 'Lào', country: 'LA' },
  { code: 'TL', name: 'Thailand', country: 'TH' },
  { code: 'PH', name: 'Philippines', country: 'PH' },
  { code: 'MY', name: 'Myanmar', country: 'MM' },
  { code: 'CA', name: 'Cambodia', country: 'KH' },
]

// Map for quick lookup
export const REGION_CODE_MAP: Record<string, RegionCode> = Object.fromEntries(
  REGION_CODES.map(r => [r.code, r])
)

// ============================================================================
// BẢNG 3: Mã người thu mua
// ============================================================================

export interface BuyerCode {
  code: string
  name: string
}

export const BUYER_CODES: BuyerCode[] = [
  { code: 'TM', name: 'Phòng thu mua 1' },
  { code: 'TN', name: 'Trần Anh Chiến' },
  { code: 'LI', name: 'Lê Thì' },
  { code: 'NN', name: 'Nguyễn Nhật Tân' },
]

// ============================================================================
// QUY TẮC VIẾT TẮT TÊN (từ PDF)
// ============================================================================
// Ưu tiên 1: Chữ cái đầu + Chữ cái cuối cùng
// Ưu tiên 2: Chữ cái đầu + Chữ cái thứ 2
// Nếu trùng: thử thứ 3, 4, 5...

/**
 * Tạo mã viết tắt 2 ký tự từ tên (theo quy tắc PDF)
 * - Loại bỏ dấu tiếng Việt
 * - Lấy chữ cái đầu + cuối của tên (không phải họ)
 */
export function generateNameCode(fullName: string): string {
  // Loại bỏ dấu tiếng Việt
  const normalized = removeDiacritics(fullName.trim())
  // Lấy từ cuối cùng (tên)
  const parts = normalized.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'XX'

  const lastName = parts[parts.length - 1].toUpperCase()
  if (lastName.length <= 1) return lastName.padEnd(2, 'X')

  // Ưu tiên 1: chữ đầu + chữ cuối
  return lastName[0] + lastName[lastName.length - 1]
}

/**
 * Tạo mã NCC đầy đủ: [Vùng 2][Tên 2][Số 2]
 * VD: TEHG01
 */
export function generateSupplierCode(
  regionCode: string,
  supplierName: string,
  sequenceNumber: number
): string {
  const nameCode = generateNameCode(supplierName)
  const seq = String(sequenceNumber).padStart(2, '0')
  return `${regionCode}${nameCode}${seq}`
}

/**
 * Tạo mã đơn hàng: [Người mua 2][Tên NCC 2][Số 2]
 * VD: TMHG01
 */
export function generateOrderCode(
  buyerCode: string,
  supplierName: string,
  sequenceNumber: number
): string {
  const nameCode = generateNameCode(supplierName)
  const seq = String(sequenceNumber).padStart(2, '0')
  return `${buyerCode}${nameCode}${seq}`
}

/**
 * Tạo mã lô: [Mã NCC 6]-[YYMM]-[Số thứ tự 2]
 * VD: QIGI01-2604-01
 * - Mã NCC: từ partner.code
 * - YYMM: tháng tạo mã (bất biến)
 * - Số: tự tăng theo NCC trong tháng
 */
export function generateLotCode(
  partnerCode: string,
  sequenceInMonth: number,
  date?: Date
): string {
  const d = date || new Date()
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const seq = String(sequenceInMonth).padStart(2, '0')
  return `${partnerCode}-${yy}${mm}-${seq}`
}

/**
 * Parse mã lô: "QIGI01-2604-01" → { partnerCode, yymm, seq }
 */
export function parseLotCode(lotCode: string): { partnerCode: string; yymm: string; seq: number } | null {
  const parts = lotCode.split('-')
  if (parts.length < 3) return null
  return {
    partnerCode: parts[0],
    yymm: parts[1],
    seq: parseInt(parts[2], 10) || 0,
  }
}

/**
 * Parse mã NCC: "TEHG01" → { region: "TE", name: "HG", seq: 1 }
 */
export function parseSupplierCode(code: string): { region: string; name: string; seq: number } | null {
  if (!code || code.length < 6) return null
  return {
    region: code.slice(0, 2),
    name: code.slice(2, 4),
    seq: parseInt(code.slice(4), 10) || 0,
  }
}

/**
 * Detect vùng từ địa chỉ (best effort)
 */
export function detectRegionFromAddress(address: string): string | null {
  if (!address) return null
  const lower = address.toLowerCase()
  const normalized = removeDiacritics(lower)

  for (const region of REGION_CODES) {
    const regionNorm = removeDiacritics(region.name.toLowerCase())
    if (normalized.includes(regionNorm)) return region.code
  }

  // Fallback: tìm từ khóa phổ biến
  const keywords: Record<string, string> = {
    'hue': 'TE', 'phong dien': 'TE', 'nam dong': 'TE', 'a luoi': 'TE', 'huong tra': 'TE',
    'quang tri': 'QI', 'cam lo': 'QI', 'vinh linh': 'QI',
    'quang binh': 'QH', 'le thuy': 'QH',
    'gia lai': 'GI', 'binh phuoc': 'BP', 'dong nai': 'DI',
    'tay ninh': 'TH', 'lao': 'LA', 'thai': 'TL', 'cambodia': 'CA',
  }
  for (const [kw, code] of Object.entries(keywords)) {
    if (normalized.includes(kw)) return code
  }
  return null
}

// ============================================================================
// HELPER
// ============================================================================

function removeDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}
