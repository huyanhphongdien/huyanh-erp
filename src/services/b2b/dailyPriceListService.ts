// ============================================================================
// Daily Price List Service — CRUD + getCurrent cho flow farmer_walkin + outright
// File: src/services/b2b/dailyPriceListService.ts
// Phase 22 of B2B Intake v4
// ============================================================================
// Use case:
// - Flow 🅲 farmer_walkin: nhà máy set giá nền hàng ngày cho hộ nông dân
// - Flow 🅰️ outright: scale operator tra giá cáp nhanh
// - tstzrange EXCLUDE chống overlap (xem Phase 5 migration)
// ============================================================================

import { supabase } from '../../lib/supabase'

export interface DailyPrice {
  id: string
  effective_from: string
  effective_to: string | null
  product_code: string
  base_price_per_kg: number
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface CreatePriceInput {
  product_code: string
  base_price_per_kg: number
  effective_from?: string   // default NOW()
  effective_to?: string | null
  notes?: string | null
}

/**
 * Lấy giá hiện tại của 1 product tại thời điểm `at` (default NOW()).
 * Return null nếu không có giá khả dụng.
 */
export async function getCurrentPrice(
  productCode: string,
  at: Date = new Date()
): Promise<DailyPrice | null> {
  const atIso = at.toISOString()
  const { data, error } = await supabase
    .from('daily_price_list')
    .select('*')
    .eq('product_code', productCode)
    .lte('effective_from', atIso)
    .or(`effective_to.is.null,effective_to.gt.${atIso}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Get current price failed: ${error.message}`)
  return data as DailyPrice | null
}

/**
 * List giá của 1 product theo thời gian (mới → cũ).
 */
export async function listPriceHistory(
  productCode: string,
  limit = 50
): Promise<DailyPrice[]> {
  const { data, error } = await supabase
    .from('daily_price_list')
    .select('*')
    .eq('product_code', productCode)
    .order('effective_from', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`List history failed: ${error.message}`)
  return (data || []) as DailyPrice[]
}

/**
 * List tất cả giá hiện hành (effective_to IS NULL hoặc > NOW).
 */
export async function listCurrentAll(): Promise<DailyPrice[]> {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('daily_price_list')
    .select('*')
    .lte('effective_from', nowIso)
    .or(`effective_to.is.null,effective_to.gt.${nowIso}`)
    .order('product_code')

  if (error) throw new Error(`List current failed: ${error.message}`)
  return (data || []) as DailyPrice[]
}

/**
 * Tạo giá mới. tstzrange EXCLUDE sẽ reject nếu overlap với row hiện có.
 *
 * Pattern phổ biến: admin muốn set giá mới → phải close row cũ trước:
 * 1. close old: UPDATE set effective_to = NOW() WHERE product_code=X AND effective_to IS NULL
 * 2. create new: effective_from = NOW(), effective_to = NULL
 *
 * Helper `setNewPrice()` làm cả 2 trong 1 call.
 */
export async function createPrice(input: CreatePriceInput): Promise<DailyPrice> {
  const payload = {
    product_code: input.product_code,
    base_price_per_kg: input.base_price_per_kg,
    effective_from: input.effective_from || new Date().toISOString(),
    effective_to: input.effective_to || null,
    notes: input.notes || null,
  }

  const { data, error } = await supabase
    .from('daily_price_list')
    .insert(payload)
    .select()
    .single()

  if (error) {
    if (error.message.includes('no_overlap_price_range')) {
      throw new Error(
        `Đã có giá khả dụng cho ${input.product_code} trong khoảng thời gian này. ` +
        `Dùng setNewPrice() để tự động close giá cũ trước.`
      )
    }
    throw new Error(`Create price failed: ${error.message}`)
  }
  return data as DailyPrice
}

/**
 * Set giá mới = close old (effective_to = NOW()) + create new.
 * Atomic thông qua 2 operations sequential (Supabase không có transaction trong client).
 */
export async function setNewPrice(input: CreatePriceInput): Promise<DailyPrice> {
  const fromIso = input.effective_from || new Date().toISOString()

  // Step 1: close row cũ (effective_to = NULL → = fromIso)
  await supabase
    .from('daily_price_list')
    .update({ effective_to: fromIso })
    .eq('product_code', input.product_code)
    .is('effective_to', null)

  // Step 2: insert mới
  return createPrice({ ...input, effective_from: fromIso })
}

/**
 * Update giá (thường chỉ đổi notes hoặc base_price_per_kg khi nhập sai).
 */
export async function updatePrice(id: string, changes: Partial<CreatePriceInput>): Promise<DailyPrice> {
  const { data, error } = await supabase
    .from('daily_price_list')
    .update(changes)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`Update price failed: ${error.message}`)
  return data as DailyPrice
}

/**
 * Xóa giá (hardcap nếu đã dùng — TODO: check settlements reference).
 */
export async function deletePrice(id: string): Promise<void> {
  const { error } = await supabase
    .from('daily_price_list')
    .delete()
    .eq('id', id)
  if (error) throw new Error(`Delete price failed: ${error.message}`)
}

export default {
  getCurrentPrice,
  listPriceHistory,
  listCurrentAll,
  createPrice,
  setNewPrice,
  updatePrice,
  deletePrice,
}
