// ============================================================================
// INVENTORY SYNC — Helper tập trung đồng bộ bảng tổng hợp tồn kho
// File: src/services/wms/inventorySync.ts
//
// MỤC ĐÍCH: Mọi thao tác nhập/xuất kho phải đảm bảo 4 bảng đồng bộ:
//   1. stock_batches         — lô hàng gốc (caller xử lý)
//   2. stock_levels          — tổng tồn theo material × warehouse
//   3. inventory_transactions— audit trail
//   4. warehouse_locations   — tồn theo vị trí vật lý
//
// Helper này lo bảng (2), (3), (4). Caller chịu trách nhiệm (1) vì logic
// batch khác nhau (tạo mới vs update qty vs depleted vs cancelled).
//
// NGUYÊN TẮC: Nhập NVL ↔ Xuất NVL, Nhập TP ↔ Xuất TP — sum phải cân bằng
// theo từng (material_id, warehouse_id).
// ============================================================================

import { supabase } from '../../lib/supabase'

export type InventoryTxType =
  | 'in'                          // Nhập kho thủ công
  | 'out'                         // Xuất kho thủ công
  | 'weighbridge_in'              // Nhập NVL từ phiếu cân
  | 'production_in'               // TP về kho sau hoàn thành SX
  | 'production_out'              // Xuất NVL cho lệnh SX
  | 'production_cancel_restore'   // Hoàn NVL khi hủy lệnh SX
  | 'production_cancel_out'       // Xóa TP khi hủy lệnh SX đã complete
  | 'blend_in'                    // Output lô phối trộn
  | 'blend_out'                   // Xuất NVL cho phối trộn
  | 'sales_allocation'            // MTS allocate từ kho cho sales
  | 'sales_release'               // Hoàn allocation về kho
  | 'adjust'                      // Điều chỉnh kiểm kê

export interface RecordMoveParams {
  material_id: string | null | undefined
  warehouse_id: string | null | undefined
  location_id?: string | null
  batch_id?: string | null
  delta_kg: number                 // + nhập, - xuất
  type: InventoryTxType
  reference_type: string           // 'stock_in' | 'production_order' | 'sales_order' | 'blend_order' | ...
  reference_id: string
  notes?: string | null
  created_by?: string | null
}

/**
 * Ghi 1 thao tác nhập/xuất kho — insert inventory_transactions + sync
 * stock_levels + warehouse_locations trong 1 call.
 *
 * Caller ĐÃ phải cập nhật stock_batches trước (tạo mới / trừ quantity_remaining).
 * Hàm này KHÔNG đụng stock_batches.
 */
export async function recordInventoryMove(params: RecordMoveParams): Promise<void> {
  const {
    material_id,
    warehouse_id,
    location_id,
    batch_id,
    delta_kg,
    type,
    reference_type,
    reference_id,
    notes,
    created_by,
  } = params

  if (!delta_kg) return

  // 1. Insert inventory_transactions (dùng quantity có dấu: âm xuất, dương nhập)
  await supabase.from('inventory_transactions').insert({
    material_id: material_id || null,
    warehouse_id: warehouse_id || null,
    batch_id: batch_id || null,
    type,
    quantity: delta_kg,
    reference_type,
    reference_id,
    notes: notes || null,
    created_by: created_by || null,
    created_at: new Date().toISOString(),
  })

  // 2-3. Sync levels + location (không đụng stock_batches)
  await adjustLevelsAndLocation({
    material_id,
    warehouse_id,
    location_id,
    delta_kg,
  })
}

/**
 * Chỉ sync stock_levels + warehouse_locations (không ghi transaction).
 * Dùng khi caller đã tự ghi inventory_transactions rồi — tránh double insert.
 */
export async function adjustLevelsAndLocation(args: {
  material_id: string | null | undefined
  warehouse_id: string | null | undefined
  location_id?: string | null
  delta_kg: number
}): Promise<void> {
  const { material_id, warehouse_id, location_id, delta_kg } = args
  if (!material_id || !warehouse_id || !delta_kg) return

  // stock_levels upsert
  const { data: existing } = await supabase
    .from('stock_levels')
    .select('id, quantity')
    .eq('material_id', material_id)
    .eq('warehouse_id', warehouse_id)
    .maybeSingle()

  if (existing) {
    const newQty = Math.max(0, Number(existing.quantity || 0) + delta_kg)
    await supabase
      .from('stock_levels')
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else if (delta_kg > 0) {
    await supabase
      .from('stock_levels')
      .insert({ material_id, warehouse_id, quantity: delta_kg })
  }

  // warehouse_locations.current_quantity adjust
  if (location_id) {
    const { data: loc } = await supabase
      .from('warehouse_locations')
      .select('id, current_quantity')
      .eq('id', location_id)
      .maybeSingle()
    if (loc) {
      const newLocQty = Math.max(0, Number(loc.current_quantity || 0) + delta_kg)
      await supabase
        .from('warehouse_locations')
        .update({ current_quantity: newLocQty })
        .eq('id', location_id)
    }
  }
}
