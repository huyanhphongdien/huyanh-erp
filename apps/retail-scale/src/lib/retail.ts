// ============================================================================
// Hằng số + công thức tiền cho app Cân mủ lẻ
// File: apps/retail-scale/src/lib/retail.ts
//
// ⚠ MỌI công thức ở đây PHẢI khớp tuyệt đối với ERP, vì phiếu mủ lẻ sẽ chảy vào
//   Đề nghị thanh toán (src/services/wms/paymentRequestService.ts). Lệch công thức =
//   số tiền in cho khách khác số kế toán chi ⇒ cãi nhau tại quầy.
//   Nguồn đối chiếu: billableWeight() và roundThousand() trong paymentRequestService.
// ============================================================================

/** Loại mủ mua lẻ. Giá trị PHẢI thuộc bộ 5 loại chuẩn của hệ thống
 *  ('mu_nuoc','mu_tap','mu_dong','mu_chen','mu_to') — dùng chung với rubber_intake_batches. */
export const RETAIL_RUBBER_TYPES = [
  { value: 'mu_tap', label: 'Mủ tạp', icon: '🪨' },
  { value: 'mu_dong', label: 'Mủ đông', icon: '🧊' },
  { value: 'mu_chen', label: 'Mủ chén', icon: '🥣' },
  { value: 'mu_nuoc', label: 'Mủ nước', icon: '💧' },
] as const

export type RetailRubberType = (typeof RETAIL_RUBBER_TYPES)[number]['value']

export function rubberLabel(v: string | null | undefined): string {
  const hit = RETAIL_RUBBER_TYPES.find(r => r.value === v)
  return hit ? `${hit.icon} ${hit.label}` : (v || '—')
}

/** Loại bì hay gặp ở điểm cân lẻ. Text tự do — danh sách chỉ để bấm nhanh. */
export const CONTAINER_TYPES = ['Bao', 'Rổ', 'Thùng', 'Xô', 'Đổ đống'] as const

/**
 * Đơn vị giá suy từ LOẠI MỦ — quy tắc gốc của hệ thống (apps/weighbridge/WeighingPage:
 * `rubberType === 'mu_nuoc' ? 'dry' : 'wet'`).
 *   mu_nuoc → 'dry' : giá tính trên kg KHÔ ⇒ phải nhân DRC
 *   còn lại → 'wet' : giá tính trên kg TƯƠI ⇒ KHÔNG nhân DRC
 *
 * ⚠ Đừng bắt chước src/services/b2b/intakeWalkinService.ts — file đó nhân DRC cho MỌI
 *   loại mủ (kể cả mủ tạp), lệch ~2.5 lần so với luồng chi tiền thật. Đó là bug của
 *   flow walk-in cũ, không phải chuẩn.
 */
export function priceUnitFor(rubberType: string | null | undefined): 'wet' | 'dry' {
  return rubberType === 'mu_nuoc' ? 'dry' : 'wet'
}

/** KL tính tiền. Bản sao 1:1 của billableWeight() trong paymentRequestService.ts. */
export function billableWeight(netKg: number, priceUnit: 'wet' | 'dry', drc: number | null): number {
  if (priceUnit === 'dry') {
    if (!drc || drc <= 0) return 0
    return Math.round((netKg * drc) / 100 * 100) / 100
  }
  return netKg
}

/** Tiền chính xác tới ĐỒNG (= roundDong của ERP). */
export function roundDong(n: number): number {
  return Math.round(n || 0)
}

/** SỐ THỰC CHI — làm tròn tới NGHÌN (≥500 lên 1.000). Bản sao roundThousand() của ERP. */
export function roundThousand(n: number): number {
  return Math.round((n || 0) / 1000) * 1000
}

/**
 * Chuẩn hoá DRC về 2 số lẻ.
 * `weighbridge_tickets.qc_actual_drc` là numeric(5,2) — DB SẼ cắt còn 2 số lẻ. Nếu app tính
 * tiền bằng số chưa cắt thì tiền in cho khách lệch với tiền kế toán tính lại từ DRC đã lưu.
 * Cắt sớm ở đây để mọi nơi (hiển thị, tính tiền, ghi DB) dùng CÙNG một con số.
 *
 * Đây là lưới an toàn — lớp chặn CHÍNH là `precision={2}` trên ô nhập DRC (làm tròn bằng
 * chuỗi, khớp half-up của Postgres). Math.round(d*100)/100 chạy trên double nên đúng biên
 * .xx5 có thể lệch 0.01 so với Postgres.
 */
export function normalizeDrc(d: number | null | undefined): number | null {
  if (d == null || !Number.isFinite(d)) return null
  return Math.round(d * 100) / 100
}

/** Tính tiền 1 phiếu mủ lẻ: trả cả số chính xác lẫn số làm tròn nghìn (số thực chi). */
export function computeAmount(opts: {
  netKg: number
  rubberType: string | null | undefined
  unitPrice: number
  drc?: number | null
}): { billableKg: number; exact: number; rounded: number; priceUnit: 'wet' | 'dry'; drc: number | null } {
  const priceUnit = priceUnitFor(opts.rubberType)
  const drc = normalizeDrc(opts.drc ?? null)
  const billableKg = billableWeight(opts.netKg, priceUnit, drc)
  const exact = roundDong(billableKg * (opts.unitPrice || 0))
  return { billableKg, exact, rounded: roundThousand(exact), priceUnit, drc }
}

export const fmtKg = (n: number | null | undefined): string =>
  (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })

export const fmtVnd = (n: number | null | undefined): string =>
  `${(Number(n) || 0).toLocaleString('vi-VN')} ₫`

/** Biển số quy ước khi khách đi xe máy / gánh bộ.
 *  weighbridge_tickets.vehicle_plate là NOT NULL (kiểm tra live 2026-08-21) và ta CỐ Ý
 *  không nới ràng buộc đó — nó vẫn cần thiết cho luồng cân xe đang chạy production. */
export const DEFAULT_VEHICLE = 'XE MÁY'

// ─── Đọc số tiền bằng chữ ────────────────────────────────────────────────────
// COPY NGUYÊN VĂN từ src/pages/wms/rubber-intake/PaymentRequestPrintPage.tsx (dòng 32-63)
// — cố ý không "viết lại cho đẹp": phiếu 80mm của khách và chứng từ chi của kế toán phải
// đọc RA CÙNG MỘT CHUỖI. Sửa ở đây thì phải sửa cả bên kia.
export function readVietnameseNumber(num: number): string {
  if (!num || num <= 0) return 'Không'
  const ds = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín']
  const readTriple = (n: number, full: boolean): string => {
    const tr = Math.floor(n / 100)
    const ch = Math.floor((n % 100) / 10)
    const dv = n % 10
    let s = ''
    if (full || tr > 0) s += ds[tr] + ' trăm'
    if (ch === 0) {
      if (dv > 0) s += (s ? ' lẻ ' : '') + ds[dv]
    } else {
      s += (s ? ' ' : '') + (ch === 1 ? 'mười' : ds[ch] + ' mươi')
      if (dv === 1 && ch > 1) s += ' mốt'
      else if (dv === 5 && ch > 0) s += ' lăm'
      else if (dv > 0) s += ' ' + ds[dv]
    }
    return s.trim()
  }
  const units = ['', ' nghìn', ' triệu', ' tỷ']
  const groups: number[] = []
  let n = Math.round(num)
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000) }
  let out = ''
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue
    out += (out ? ' ' : '') + readTriple(groups[i], i < groups.length - 1) + units[i]
  }
  out = out.trim().replace(/\s+/g, ' ')
  return out.charAt(0).toUpperCase() + out.slice(1)
}
