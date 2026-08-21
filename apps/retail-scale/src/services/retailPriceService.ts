// ============================================================================
// RETAIL PRICE SERVICE — đơn giá cho phiếu mủ lẻ
// File: apps/retail-scale/src/services/retailPriceService.ts
//
// BA NGUỒN GIÁ, theo thứ tự ưu tiên khi gợi ý cho thao tác viên:
//   1. Bảng giá ngày của ERP (b2b.daily_price_list qua view public.b2b_daily_price_list)
//      → nguồn CHÍNH THỨC, do kế toán đặt. App chỉ ĐỌC.
//   2. Giá gõ gần nhất cho loại mủ đó, lưu localStorage của chính máy này.
//      → cần thiết vì bảng giá ngày hiện ĐANG RỖNG (kiểm tra live 2026-08-21); không có
//        nguồn 2 thì mỗi phiếu phải gõ lại giá từ đầu.
//   3. Không có gì → để trống, bắt thao tác viên nhập.
//
// Dù gợi ý từ đâu, giá CUỐI CÙNG luôn là số thao tác viên xác nhận trên màn hình và được
// ghi vào weighbridge_tickets.unit_price — đó là số in cho khách và cũng là số kế toán
// thấy ở Đề nghị thanh toán (price_source='retail').
//
// ⚠ Nếu app đọc bảng giá ra RỖNG mà không báo lỗi: nhiều khả năng chưa chạy migration
//   retail_scale_p3_daily_price_anon.sql (RLS của b2b.daily_price_list chặn role anon).
// ============================================================================

import { supabase } from '@erp/lib/supabase'

const LAST_PRICE_KEY = 'rs_last_price'

export interface PriceSuggestion {
  price: number
  source: 'daily' | 'last_used'
  /** Mô tả ngắn hiện trên UI, ví dụ "Giá ngày 21/08" hoặc "Giá gõ lần trước". */
  label: string
}

/** Đọc giá ngày hiện hành của 1 loại mủ. Trả null nếu chưa đặt giá (hoặc bị RLS chặn). */
export async function fetchDailyPrice(rubberType: string): Promise<number | null> {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('b2b_daily_price_list')
    .select('base_price_per_kg, effective_from')
    .eq('product_code', rubberType)
    .lte('effective_from', nowIso)
    .or(`effective_to.is.null,effective_to.gt.${nowIso}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    // Không throw: thiếu giá ngày KHÔNG được phép chặn việc cân.
    console.warn('[retailPrice] Không đọc được bảng giá ngày:', error.message)
    return null
  }
  const p = data ? Number((data as { base_price_per_kg: number }).base_price_per_kg) : NaN
  return Number.isFinite(p) && p > 0 ? p : null
}

function readLastPrices(): Record<string, number> {
  try {
    const raw = localStorage.getItem(LAST_PRICE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

/** Nhớ giá vừa dùng cho loại mủ này trên máy trạm — lần cân sau tự điền. */
export function rememberPrice(rubberType: string, price: number): void {
  if (!(price > 0)) return
  try {
    const all = readLastPrices()
    all[rubberType] = price
    localStorage.setItem(LAST_PRICE_KEY, JSON.stringify(all))
  } catch {
    /* localStorage bị chặn — bỏ qua, không ảnh hưởng việc cân */
  }
}

export function getLastUsedPrice(rubberType: string): number | null {
  const p = readLastPrices()[rubberType]
  return Number.isFinite(p) && p > 0 ? p : null
}

/** Gợi ý giá cho 1 loại mủ theo thứ tự ưu tiên ở đầu file. */
export async function suggestPrice(rubberType: string): Promise<PriceSuggestion | null> {
  const daily = await fetchDailyPrice(rubberType)
  if (daily) {
    const d = new Date()
    const label = `Giá ngày ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
    return { price: daily, source: 'daily', label }
  }
  const last = getLastUsedPrice(rubberType)
  if (last) return { price: last, source: 'last_used', label: 'Giá gõ lần trước' }
  return null
}

export default { fetchDailyPrice, suggestPrice, rememberPrice, getLastUsedPrice }
