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

/** Props formatter/parser cho antd InputNumber khi nhập VND: 35000000 ⇄ "35.000.000". */
export const vndInputProps = {
  formatter: (v: string | number | undefined) =>
    v === undefined || v === null || v === '' ? '' : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
  parser: (v: string | undefined) => (v ? Number(v.replace(/\./g, '').replace(/,/g, '')) : 0) as unknown as number,
}
