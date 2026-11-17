// ============================================================================
// Tiền tệ đơn hàng bán — USD (xuất khẩu) hoặc VND (bán nội địa). Thêm 25/09/2026.
//
// Quy ước dữ liệu (sales_orders / sales_order_items):
//   • `currency`     = đồng tiền của đơn; `unit_price` tính theo đồng tiền đó (/tấn).
//   • USD: total_value_usd = tấn × giá; total_value_vnd = usd × exchange_rate (nếu có tỷ giá).
//   • VND: total_value_vnd = tấn × giá (số thật trên HĐ); total_value_usd = vnd ÷ exchange_rate
//     — là SỐ QUY ĐỔI để công nợ (v_ar_aging_rows), sổ lô, dashboard vẫn cộng chung một đơn vị.
//     Vì vậy đơn VND BẮT BUỘC có tỷ giá lúc tạo.
// Mọi màn hiển thị lấy nhãn/định dạng từ đây, không tự ghi "$".
// ============================================================================

export type SalesCurrency = 'USD' | 'VND'

export const SALES_CURRENCY_OPTIONS: { value: SalesCurrency; label: string }[] = [
  { value: 'USD', label: 'USD — xuất khẩu' },
  { value: 'VND', label: 'VNĐ — bán nội địa' },
]

export const isVnd = (currency?: string | null): boolean =>
  (currency || 'USD').toUpperCase() === 'VND'

/** Nhãn cột đơn giá: "$/tấn" hoặc "₫/tấn". */
export const priceUnitLabel = (currency?: string | null): string =>
  isVnd(currency) ? '₫/tấn' : '$/tấn'

export const currencySymbol = (currency?: string | null): string => (isVnd(currency) ? '₫' : '$')

/**
 * Định dạng tiền theo đồng tiền của đơn.
 *   USD → "$1,924.00" (2 số lẻ mặc định) · VND → "35.000.000 ₫" (không số lẻ)
 *   compact → "$1.2M" / "$45K" · "1,23 tỷ" / "35 tr"
 */
export function fmtMoney(
  v: number | null | undefined,
  currency?: string | null,
  opts: { compact?: boolean; decimals?: number; dash?: string } = {},
): string {
  const dash = opts.dash ?? '—'
  if (v == null || Number.isNaN(Number(v))) return dash
  const n = Number(v)
  if (isVnd(currency)) {
    if (opts.compact) {
      if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`
      if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`
    }
    return `${Math.round(n).toLocaleString('vi-VN')} ₫`
  }
  if (opts.compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
    if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`
    return `$${Math.round(n)}`
  }
  const decimals = opts.decimals ?? 2
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

/** Số tiền của đơn theo đúng đồng tiền của đơn (VND đọc total_value_vnd, USD đọc total_value_usd). */
export function orderTotalInCurrency(o: {
  currency?: string | null
  total_value_usd?: number | null
  total_value_vnd?: number | null
  quantity_tons?: number | null
  unit_price?: number | null
}): number {
  const fallback = (Number(o.quantity_tons) || 0) * (Number(o.unit_price) || 0)
  if (isVnd(o.currency)) return o.total_value_vnd != null ? Number(o.total_value_vnd) : fallback
  return o.total_value_usd != null ? Number(o.total_value_usd) : fallback
}

/** Quy đổi một số tiền theo đồng tiền của đơn sang USD (VND ÷ tỷ giá; không tỷ giá → 0). */
export function toUsdEquivalent(amount: number, currency?: string | null, exchangeRate?: number | null): number {
  if (!isVnd(currency)) return amount
  const rate = Number(exchangeRate) || 0
  return rate > 0 ? Math.round((amount / rate) * 100) / 100 : 0
}

/**
 * Tỷ giá quy đổi đơn VNĐ phải là số đồng của 1 USD. Gõ "1" thì USD quy đổi = nguyên số VNĐ và công nợ/dashboard
 * (cộng bằng USD) phình hàng tỷ đô. Khoảng rộng — chỉ để bắt gõ nhầm, không phải kiểm tỷ giá thị trường.
 */
export const VND_PER_USD_MIN = 10_000
export const VND_PER_USD_MAX = 50_000
export function vndRateError(rate: number | null | undefined): string | null {
  const r = Number(rate) || 0
  if (r <= 0) return 'Đơn bán nội địa (VNĐ) phải nhập tỷ giá VND/USD để quy đổi báo cáo'
  if (r < VND_PER_USD_MIN || r > VND_PER_USD_MAX) {
    return `Tỷ giá ${r.toLocaleString('vi-VN')} VND/USD không hợp lý — gõ số đồng của 1 USD (vd 25.400)`
  }
  return null
}

/**
 * Cặp tổng ghi vào sales_orders từ (đồng tiền, tấn, đơn giá, tỷ giá).
 * USD: {usd: tấn×giá, vnd: usd×tỷ giá | null} · VND: {vnd: tấn×giá, usd: vnd÷tỷ giá | null}
 */
export function orderTotals(
  currency: string | null | undefined,
  quantityTons: number,
  unitPrice: number,
  exchangeRate?: number | null,
): { total_value_usd: number | null; total_value_vnd: number | null } {
  const amount = (Number(quantityTons) || 0) * (Number(unitPrice) || 0)
  const rate = Number(exchangeRate) || 0
  if (isVnd(currency)) {
    return {
      total_value_vnd: Math.round(amount),
      total_value_usd: rate > 0 ? Math.round((amount / rate) * 100) / 100 : null,
    }
  }
  return {
    total_value_usd: amount,
    total_value_vnd: rate > 0 ? Math.round(amount * rate) : null,
  }
}

/**
 * Props formatter/parser cho antd InputNumber khi nhập VND: 35000000 ⇄ "35.000.000", 25385.5 ⇄ "25.385,5".
 * Kiểu Việt: chấm ngăn nghìn, PHẨY thập phân. Bản cũ chèn chấm cả vào phần lẻ ("15.239.902.5") rồi parser xoá mọi
 * chấm → rời ô thành ×10 (tỷ giá lẻ, thành tiền = SL lẻ × giá). Ô trống → null (không ép 0).
 */
export const vndInputProps = {
  formatter: (v: string | number | undefined) => {
    if (v === undefined || v === null || v === '') return ''
    const [i, f] = String(v).split('.')
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f !== undefined ? `,${f}` : '')
  },
  parser: (v: string | undefined) => {
    let s = (v ?? '').replace(/[^\d.,-]/g, '')
    if (s === '' || s === '-') return '' as unknown as number
    const commas = (s.match(/,/g) || []).length
    if (commas > 1) s = s.replace(/,/g, '')                              // "1,234,567" kiểu Anh: phẩy ngăn nghìn
    else if (commas === 1) s = s.replace(/\./g, '').replace(',', '.')    // "25.385,5": chấm nghìn, phẩy lẻ
    else {
      // Chỉ có chấm: nhóm nghìn Việt luôn đủ 3 số — nhóm cuối khác 3 số ("25385.5", "25.385.5") là dấu thập phân
      const parts = s.split('.')
      const last = parts[parts.length - 1]
      s = parts.length > 1 && last.length !== 3 ? `${parts.slice(0, -1).join('')}.${last}` : parts.join('')
    }
    const n = Number(s)
    return (Number.isFinite(n) ? n : '') as unknown as number
  },
}
