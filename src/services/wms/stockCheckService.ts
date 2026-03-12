// ============================================================================
// FILE: src/services/wms/stockCheckService.ts
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P5 — Bước 5.3: Kiểm kê tồn kho
// MÔ TẢ: Tạo đợt kiểm kê, nhập SL thực tế, so sánh chênh lệch,
//         tạo phiếu điều chỉnh (inventory_transactions type='adjust')
// BẢNG: stock_batches, stock_levels, inventory_transactions, warehouse_locations
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  StockBatch,
  WMSPaginationParams,
  PaginatedResponse,
} from './wms.types'

// ============================================================================
// TYPES
// ============================================================================

export type StockCheckStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled'

/** Đợt kiểm kê */
export interface StockCheck {
  id: string
  code: string                    // "KK-YYYYMMDD-XXX"
  warehouse_id: string
  warehouse_name?: string
  status: StockCheckStatus
  total_items: number
  total_discrepancy: number       // tổng số dòng có chênh lệch
  notes?: string
  created_by?: string
  completed_by?: string
  completed_at?: string
  created_at: string
  updated_at: string
  items?: StockCheckItem[]
}

/** Chi tiết 1 dòng kiểm kê */
export interface StockCheckItem {
  id: string
  stock_check_id: string
  batch_id: string
  batch_no?: string
  material_id: string
  material_name?: string
  material_sku?: string
  location_id?: string
  location_code?: string
  system_quantity: number         // SL trên hệ thống
  actual_quantity?: number        // SL thực tế (nhập bởi NV)
  discrepancy: number             // = actual - system
  notes?: string
  checked_by?: string
  checked_at?: string
}

export interface CreateStockCheckData {
  warehouse_id: string
  notes?: string
  created_by?: string
}

export interface UpdateCheckItemData {
  actual_quantity: number
  notes?: string
  checked_by?: string
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Sinh mã kiểm kê: KK-YYYYMMDD-XXX
 */
async function generateCode(): Promise<string> {
  const today = new Date()
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '')
  const prefix = `KK-${dateStr}`

  // Tìm sequence cao nhất trong ngày (nếu lưu trong DB)
  // Đơn giản: dùng random 3 chữ số
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
  return `${prefix}-${seq}`
}

// ============================================================================
// SERVICE
// ============================================================================

export const stockCheckService = {

  // --------------------------------------------------------------------------
  // TẠO ĐỢT KIỂM KÊ
  // --------------------------------------------------------------------------

  /**
   * Tạo đợt kiểm kê cho 1 kho
   * Tự động lấy tất cả batches active → tạo danh sách items
   */
  async createStockCheck(data: CreateStockCheckData): Promise<StockCheck> {
    const code = await generateCode()

    // 1. Lấy tất cả batches active trong kho
    const { data: batches, error: batchErr } = await supabase
      .from('stock_batches')
      .select(`
        id, batch_no, material_id, quantity_remaining, location_id,
        material:materials(id, sku, name),
        location:warehouse_locations(id, code)
      `)
      .eq('warehouse_id', data.warehouse_id)
      .eq('status', 'active')
      .gt('quantity_remaining', 0)
      .order('received_date', { ascending: true })

    if (batchErr) throw batchErr

    if (!batches || batches.length === 0) {
      throw new Error('Kho này không có lô hàng nào để kiểm kê')
    }

    // 2. Tạo header — lưu vào local state (không tạo bảng riêng trong DB)
    // Trong production, nên tạo bảng stock_checks + stock_check_items
    // Hiện tại dùng localStorage pattern rồi ghi adjust vào inventory_transactions

    const stockCheck: StockCheck = {
      id: crypto.randomUUID(),
      code,
      warehouse_id: data.warehouse_id,
      status: 'draft',
      total_items: batches.length,
      total_discrepancy: 0,
      notes: data.notes,
      created_by: data.created_by,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: (batches as any[]).map(b => ({
        id: crypto.randomUUID(),
        stock_check_id: '', // sẽ set sau
        batch_id: b.id,
        batch_no: b.batch_no,
        material_id: b.material_id,
        material_name: b.material?.name,
        material_sku: b.material?.sku,
        location_id: b.location_id,
        location_code: b.location?.code,
        system_quantity: b.quantity_remaining,
        actual_quantity: undefined,
        discrepancy: 0,
        notes: undefined,
      })),
    }

    // Set stock_check_id cho items
    stockCheck.items = stockCheck.items?.map(item => ({
      ...item,
      stock_check_id: stockCheck.id,
    }))

    return stockCheck
  },

  // --------------------------------------------------------------------------
  // CẬP NHẬT SỐ LƯỢNG THỰC TẾ
  // --------------------------------------------------------------------------

  /**
   * Cập nhật SL thực tế cho 1 item kiểm kê
   * Trả về item đã cập nhật với discrepancy
   */
  updateCheckItem(item: StockCheckItem, data: UpdateCheckItemData): StockCheckItem {
    return {
      ...item,
      actual_quantity: data.actual_quantity,
      discrepancy: data.actual_quantity - item.system_quantity,
      notes: data.notes || item.notes,
      checked_by: data.checked_by,
      checked_at: new Date().toISOString(),
    }
  },

  // --------------------------------------------------------------------------
  // HOÀN TẤT KIỂM KÊ — TẠO PHIẾU ĐIỀU CHỈNH
  // --------------------------------------------------------------------------

  /**
   * Finalize: so sánh thực tế vs hệ thống → tạo adjust transactions
   */
  async finalizeStockCheck(
    stockCheck: StockCheck,
    confirmedBy: string
  ): Promise<{
    adjustments: number
    transactions_created: number
  }> {
    const items = stockCheck.items || []

    // Validate: tất cả items phải có actual_quantity
    const unchecked = items.filter(i => i.actual_quantity === undefined || i.actual_quantity === null)
    if (unchecked.length > 0) {
      throw new Error(`Còn ${unchecked.length} dòng chưa kiểm tra. Vui lòng nhập SL thực tế cho tất cả lô.`)
    }

    // Tìm items có chênh lệch
    const discrepancies = items.filter(i => i.discrepancy !== 0)

    if (discrepancies.length === 0) {
      return { adjustments: 0, transactions_created: 0 }
    }

    let transCount = 0

    for (const item of discrepancies) {
      const delta = item.discrepancy // actual - system (+ nếu thừa, - nếu thiếu)

      // 1. Điều chỉnh stock_batches.quantity_remaining
      const { error: batchErr } = await supabase.rpc('increment_field', {
        table_name: 'stock_batches',
        field_name: 'quantity_remaining',
        row_id: item.batch_id,
        delta_value: delta,
      })

      // Fallback nếu không có RPC function
      if (batchErr) {
        // Đọc giá trị hiện tại rồi update
        const { data: batch } = await supabase
          .from('stock_batches')
          .select('quantity_remaining')
          .eq('id', item.batch_id)
          .single()

        if (batch) {
          const newQty = Math.max(0, (batch.quantity_remaining || 0) + delta)
          await supabase
            .from('stock_batches')
            .update({
              quantity_remaining: newQty,
              status: newQty <= 0 ? 'depleted' : 'active',
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.batch_id)
        }
      }

      // 2. Điều chỉnh stock_levels
      const { data: level } = await supabase
        .from('stock_levels')
        .select('id, quantity')
        .eq('material_id', item.material_id)
        .eq('warehouse_id', stockCheck.warehouse_id)
        .single()

      if (level) {
        await supabase
          .from('stock_levels')
          .update({
            quantity: Math.max(0, (level.quantity || 0) + delta),
            updated_at: new Date().toISOString(),
          })
          .eq('id', level.id)
      }

      // 3. Điều chỉnh warehouse_locations (nếu có location)
      if (item.location_id) {
        const { data: loc } = await supabase
          .from('warehouse_locations')
          .select('id, current_quantity')
          .eq('id', item.location_id)
          .single()

        if (loc) {
          await supabase
            .from('warehouse_locations')
            .update({
              current_quantity: Math.max(0, (loc.current_quantity || 0) + delta),
            })
            .eq('id', item.location_id)
        }
      }

      // 4. Ghi inventory_transaction type='adjust'
      await supabase.from('inventory_transactions').insert({
        material_id: item.material_id,
        warehouse_id: stockCheck.warehouse_id,
        batch_id: item.batch_id,
        type: 'adjust',
        quantity: delta,
        reference_type: 'stock_check',
        reference_id: stockCheck.id,
        notes: `Kiểm kê ${stockCheck.code}: ${delta > 0 ? 'thừa' : 'thiếu'} ${Math.abs(delta)} (Hệ thống: ${item.system_quantity}, Thực tế: ${item.actual_quantity})`,
        created_by: confirmedBy,
      })

      transCount++
    }

    return {
      adjustments: discrepancies.length,
      transactions_created: transCount,
    }
  },

  // --------------------------------------------------------------------------
  // TÓM TẮT CHÊNH LỆCH
  // --------------------------------------------------------------------------

  /**
   * Tính tóm tắt chênh lệch kiểm kê
   */
  summarizeDiscrepancy(items: StockCheckItem[]): {
    total_items: number
    checked_items: number
    match_count: number
    surplus_count: number       // thừa
    shortage_count: number      // thiếu
    total_surplus: number       // tổng SL thừa
    total_shortage: number      // tổng SL thiếu
  } {
    const checked = items.filter(i => i.actual_quantity !== undefined && i.actual_quantity !== null)
    const surpluses = checked.filter(i => i.discrepancy > 0)
    const shortages = checked.filter(i => i.discrepancy < 0)

    return {
      total_items: items.length,
      checked_items: checked.length,
      match_count: checked.filter(i => i.discrepancy === 0).length,
      surplus_count: surpluses.length,
      shortage_count: shortages.length,
      total_surplus: surpluses.reduce((sum, i) => sum + i.discrepancy, 0),
      total_shortage: Math.abs(shortages.reduce((sum, i) => sum + i.discrepancy, 0)),
    }
  },
}

export default stockCheckService