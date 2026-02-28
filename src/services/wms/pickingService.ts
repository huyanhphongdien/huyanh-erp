// ============================================================================
// FILE: src/services/wms/pickingService.ts
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P4 — Bước 4.1 (pickingService)
// MÔ TẢ: FIFO Picking — tự động chọn lô cũ nhất trước, validate QC,
//         quản lý trạng thái picking cho nhân viên kho
// BẢNG: stock_batches, stock_out_details, warehouse_locations
// PATTERN: async/await, Supabase
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  StockBatch,
  PickingStatus,
} from './wms.types'

// ============================================================================
// TYPES
// ============================================================================

/** Một dòng trong picking list (1 lô cụ thể cần lấy) */
export interface PickingItem {
  batch_id: string
  batch_no: string
  material_id: string
  location_id: string | null
  location_code: string | null
  location_detail: string | null     // "Kệ 1 · Hàng A · Ô 3"
  warehouse_id: string | null
  quantity: number                   // SL cần lấy từ lô này
  weight: number | null              // Trọng lượng tương ứng
  qc_status: string
  latest_drc: number | null
  received_date: string              // Để hiển thị FIFO order
  batch_remaining: number            // SL còn lại trong lô (trước khi lấy)
}

/** Kết quả generate picking list */
export interface PickingListResult {
  items: PickingItem[]
  total_quantity: number
  total_weight: number | null
  fulfilled: boolean                 // true nếu đủ hàng
  shortage: number                   // SL thiếu (nếu không đủ)
}

/** Options cho generatePickingList */
export interface PickingOptions {
  /** Chỉ lấy lô đã passed QC (default: true) */
  qc_passed_only?: boolean
  /** Cho phép lấy lô warning (default: false) */
  allow_warning?: boolean
  /** Exclude các batch_id cụ thể (VD: đã được pick trong phiếu khác) */
  exclude_batch_ids?: string[]
}

// ============================================================================
// SERVICE
// ============================================================================

export const pickingService = {

  // --------------------------------------------------------------------------
  // GENERATE PICKING LIST — FIFO
  // Chọn lô cũ nhất trước (received_date ASC) cho đến khi đủ SL yêu cầu
  // --------------------------------------------------------------------------
  async generatePickingList(
    materialId: string,
    warehouseId: string,
    requestedQty: number,
    options: PickingOptions = {}
  ): Promise<PickingListResult> {
    const {
      qc_passed_only = true,
      allow_warning = false,
      exclude_batch_ids = [],
    } = options

    // 1. Query lô còn hàng, sắp theo FIFO (received_date ASC)
    let query = supabase
      .from('stock_batches')
      .select(`
        id, batch_no, material_id, warehouse_id, location_id,
        quantity_remaining, unit,
        initial_drc, latest_drc, qc_status,
        received_date, status,
        location:warehouse_locations(id, code, shelf, row_name, column_name)
      `)
      .eq('material_id', materialId)
      .eq('warehouse_id', warehouseId)
      .eq('status', 'active')
      .gt('quantity_remaining', 0)

    // Filter QC
    if (qc_passed_only) {
      if (allow_warning) {
        query = query.in('qc_status', ['passed', 'warning'])
      } else {
        query = query.eq('qc_status', 'passed')
      }
    }

    // Exclude batches đã dùng
    if (exclude_batch_ids.length > 0) {
      query = query.not('id', 'in', `(${exclude_batch_ids.join(',')})`)
    }

    // FIFO: lô cũ nhất trước
    query = query.order('received_date', { ascending: true })

    const { data: batches, error } = await query
    if (error) throw error

    if (!batches || batches.length === 0) {
      return {
        items: [],
        total_quantity: 0,
        total_weight: null,
        fulfilled: false,
        shortage: requestedQty,
      }
    }

    // 2. Loop FIFO: lấy từng lô cho đến khi đủ
    const items: PickingItem[] = []
    let remaining = requestedQty
    let totalWeight = 0

    for (const batch of batches) {
      if (remaining <= 0) break

      const batchQty = batch.quantity_remaining
      const takeQty = Math.min(batchQty, remaining)

      // Tính weight tương ứng (nếu có weight_per_unit)
      // Lấy từ material hoặc tính proportional
      const weight = takeQty // Tạm dùng quantity = weight (kg)

      // Build location detail string
      const loc = batch.location as any
      let locationDetail: string | null = null
      if (loc) {
        const parts = [
          loc.shelf ? `Kệ ${loc.shelf}` : null,
          loc.row_name ? `Hàng ${loc.row_name}` : null,
          loc.column_name ? `Ô ${loc.column_name}` : null,
        ].filter(Boolean)
        locationDetail = parts.length > 0 ? parts.join(' · ') : loc.code || null
      }

      items.push({
        batch_id: batch.id,
        batch_no: batch.batch_no,
        material_id: batch.material_id,
        location_id: batch.location_id || null,
        location_code: loc?.code || null,
        location_detail: locationDetail,
        warehouse_id: batch.warehouse_id,
        quantity: takeQty,
        weight: weight,
        qc_status: batch.qc_status,
        latest_drc: batch.latest_drc,
        received_date: batch.received_date,
        batch_remaining: batchQty,
      })

      totalWeight += weight
      remaining -= takeQty
    }

    return {
      items,
      total_quantity: requestedQty - remaining,
      total_weight: totalWeight,
      fulfilled: remaining <= 0,
      shortage: Math.max(0, remaining),
    }
  },

  // --------------------------------------------------------------------------
  // CHECK AVAILABILITY — Kiểm tra tồn kho đủ để xuất không
  // Dùng trước khi tạo phiếu xuất (quick check)
  // --------------------------------------------------------------------------
  async checkAvailability(
    materialId: string,
    warehouseId: string,
    requestedQty: number,
    options: PickingOptions = {}
  ): Promise<{
    available: number
    sufficient: boolean
    shortage: number
    batch_count: number
  }> {
    const {
      qc_passed_only = true,
      allow_warning = false,
    } = options

    let query = supabase
      .from('stock_batches')
      .select('quantity_remaining')
      .eq('material_id', materialId)
      .eq('warehouse_id', warehouseId)
      .eq('status', 'active')
      .gt('quantity_remaining', 0)

    if (qc_passed_only) {
      if (allow_warning) {
        query = query.in('qc_status', ['passed', 'warning'])
      } else {
        query = query.eq('qc_status', 'passed')
      }
    }

    const { data, error } = await query
    if (error) throw error

    const batches = data || []
    const available = batches.reduce((sum, b) => sum + (b.quantity_remaining || 0), 0)

    return {
      available,
      sufficient: available >= requestedQty,
      shortage: Math.max(0, requestedQty - available),
      batch_count: batches.length,
    }
  },

  // --------------------------------------------------------------------------
  // UPDATE PICKING STATUS — NV kho swipe xác nhận đã lấy
  // --------------------------------------------------------------------------
  async updatePickingStatus(
    detailId: string,
    status: PickingStatus,
    pickedBy?: string
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      picking_status: status,
    }

    if (status === 'picked') {
      updateData.picked_at = new Date().toISOString()
      updateData.picked_by = pickedBy || null
    }

    // Reset nếu chuyển về pending
    if (status === 'pending') {
      updateData.picked_at = null
      updateData.picked_by = null
    }

    const { error } = await supabase
      .from('stock_out_details')
      .update(updateData)
      .eq('id', detailId)

    if (error) throw error
  },

  // --------------------------------------------------------------------------
  // BATCH UPDATE PICKING STATUS — Update nhiều dòng cùng lúc
  // --------------------------------------------------------------------------
  async batchUpdatePickingStatus(
    detailIds: string[],
    status: PickingStatus,
    pickedBy?: string
  ): Promise<void> {
    if (detailIds.length === 0) return

    const updateData: Record<string, unknown> = {
      picking_status: status,
    }

    if (status === 'picked') {
      updateData.picked_at = new Date().toISOString()
      updateData.picked_by = pickedBy || null
    }

    const { error } = await supabase
      .from('stock_out_details')
      .update(updateData)
      .in('id', detailIds)

    if (error) throw error
  },

  // --------------------------------------------------------------------------
  // GET PICKING PROGRESS — Tiến độ picking của 1 phiếu xuất
  // --------------------------------------------------------------------------
  async getPickingProgress(stockOutId: string): Promise<{
    total: number
    picked: number
    skipped: number
    pending: number
    progress_percent: number
    all_picked: boolean
  }> {
    const { data, error } = await supabase
      .from('stock_out_details')
      .select('id, picking_status')
      .eq('stock_out_id', stockOutId)

    if (error) throw error

    const details = data || []
    const total = details.length
    const picked = details.filter(d => d.picking_status === 'picked').length
    const skipped = details.filter(d => d.picking_status === 'skipped').length
    const pending = details.filter(d => d.picking_status === 'pending' || d.picking_status === 'picking').length

    return {
      total,
      picked,
      skipped,
      pending,
      progress_percent: total > 0 ? Math.round((picked / total) * 100) : 0,
      all_picked: pending === 0 && total > 0,
    }
  },

  // --------------------------------------------------------------------------
  // GET PICKING DETAILS — Chi tiết picking của 1 phiếu (cho PickingListPage)
  // --------------------------------------------------------------------------
  async getPickingDetails(stockOutId: string): Promise<Array<{
    id: string
    stock_out_id: string
    material_id: string
    batch_id: string
    location_id: string | null
    quantity: number
    weight: number | null
    picking_status: PickingStatus
    picked_at: string | null
    picked_by: string | null
    notes: string | null
    material: { id: string; sku: string; name: string; unit: string } | null
    batch: {
      id: string
      batch_no: string
      qc_status: string
      latest_drc: number | null
      received_date: string
    } | null
    location: {
      id: string
      code: string
      shelf: string | null
      row_name: string | null
      column_name: string | null
    } | null
  }>> {
    const { data, error } = await supabase
      .from('stock_out_details')
      .select(`
        *,
        material:materials(id, sku, name, unit),
        batch:stock_batches(id, batch_no, qc_status, latest_drc, received_date),
        location:warehouse_locations(id, code, shelf, row_name, column_name)
      `)
      .eq('stock_out_id', stockOutId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return (data || []) as any
  },
}

// ============================================================================
// STANDALONE EXPORTS
// ============================================================================

export const {
  generatePickingList,
  checkAvailability,
  updatePickingStatus,
  batchUpdatePickingStatus,
  getPickingProgress,
  getPickingDetails,
} = pickingService

export default pickingService