// ============================================================================
// STOCK ALLOCATION SERVICE
// File: src/services/sales/stockAllocationService.ts
//
// Cho phép Sales order lấy thành phẩm trực tiếp từ kho (Make-to-Stock)
// thay vì bắt buộc qua Lệnh sản xuất (Make-to-Order).
//
// Design decisions (confirmed 2026-04-14):
//   - Hybrid: MTO và MTS song song, user chọn từng đơn
//   - Manual pick: user chọn từng lô
//   - All-or-nothing: sum(allocated) phải >= order.quantity_kg
//   - Hard commit: trừ thẳng stock_batches.quantity_remaining
//   - N-N container linkage (set after allocation via assignToContainer)
// ============================================================================

import { supabase } from '../../lib/supabase'

export type AllocationStatus = 'reserved' | 'packed' | 'shipped' | 'released'

export interface StockAllocation {
  id: string
  sales_order_id: string
  stock_batch_id: string
  container_id?: string | null
  quantity_kg: number
  allocated_at: string
  allocated_by?: string | null
  status: AllocationStatus
  released_at?: string | null
  released_by?: string | null
  release_reason?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
  // Join fields
  stock_batch?: {
    id: string
    batch_no: string
    rubber_grade?: string | null
    latest_drc?: number | null
    quantity_remaining?: number | null
    qc_status?: string | null
    batch_type?: string | null
    received_date?: string | null
  } | null
  container?: {
    id: string
    container_no?: string | null
    seal_no?: string | null
  } | null
}

export interface AvailableBatch {
  id: string
  batch_no: string
  rubber_grade: string | null
  latest_drc: number | null
  quantity_remaining: number
  qc_status: string | null
  received_date: string | null
  warehouse_id: string | null
  location_id: string | null
  batch_type: string | null
}

export interface AllocationRequest {
  stock_batch_id: string
  quantity_kg: number
}

// ============================================================================
// Helpers
// ============================================================================

function throwIfError<T>(result: { data: T | null; error: any }, defaultMsg: string): T {
  if (result.error) {
    console.error(`[stockAllocationService] ${defaultMsg}:`, result.error)
    throw new Error(`${defaultMsg}: ${result.error.message || 'unknown error'}`)
  }
  if (result.data === null) {
    throw new Error(`${defaultMsg}: no data returned`)
  }
  return result.data
}

// ============================================================================
// SERVICE
// ============================================================================

export const stockAllocationService = {

  /**
   * Query kho có sẵn thành phẩm cùng grade + DRC range + QC passed + còn tồn
   */
  async findAvailable(params: {
    rubber_grade: string
    drc_min?: number | null
    drc_max?: number | null
    exclude_batch_ids?: string[]
  }): Promise<AvailableBatch[]> {
    let query = supabase
      .from('stock_batches')
      .select(`
        id, batch_no, rubber_grade, latest_drc, quantity_remaining,
        qc_status, received_date, warehouse_id, location_id, batch_type
      `)
      .eq('rubber_grade', params.rubber_grade)
      .eq('status', 'active')
      .gt('quantity_remaining', 0)
      .in('qc_status', ['passed', 'pending'])  // passed ưu tiên, pending cho phép nếu chấp nhận
      .order('received_date', { ascending: true })  // FIFO default sort

    if (params.drc_min != null) query = query.gte('latest_drc', params.drc_min)
    if (params.drc_max != null) query = query.lte('latest_drc', params.drc_max)
    if (params.exclude_batch_ids && params.exclude_batch_ids.length > 0) {
      query = query.not('id', 'in', `(${params.exclude_batch_ids.join(',')})`)
    }

    const { data, error } = await query
    if (error) throw error
    return (data || []) as AvailableBatch[]
  },

  /**
   * List allocations của 1 đơn (join stock_batch + container để hiển thị)
   */
  async listByOrder(salesOrderId: string): Promise<StockAllocation[]> {
    const { data, error } = await supabase
      .from('sales_order_stock_allocations')
      .select(`
        *,
        stock_batch:stock_batches!stock_batch_id (
          id, batch_no, rubber_grade, latest_drc, quantity_remaining,
          qc_status, batch_type, received_date
        ),
        container:sales_order_containers!container_id (
          id, container_no, seal_no
        )
      `)
      .eq('sales_order_id', salesOrderId)
      .neq('status', 'released')
      .order('allocated_at', { ascending: true })

    if (error) throw error
    return (data || []) as StockAllocation[]
  },

  /**
   * Tính tổng đã allocate cho 1 đơn (loại released)
   */
  async getTotalAllocated(salesOrderId: string): Promise<number> {
    const { data, error } = await supabase
      .from('sales_order_stock_allocations')
      .select('quantity_kg')
      .eq('sales_order_id', salesOrderId)
      .neq('status', 'released')
    if (error) throw error
    return (data || []).reduce((s: number, r: any) => s + Number(r.quantity_kg || 0), 0)
  },

  /**
   * ALLOCATE — cấp phát stock cho sales order (all-or-nothing + hard commit)
   *
   * Flow:
   *   1. Validate sales_order exists, status in (confirmed, producing, ready)
   *   2. Validate tổng allocated_request + existing_allocations >= order.quantity_kg
   *      (all-or-nothing)
   *   3. Validate từng batch có đủ quantity_remaining
   *   4. Trừ stock_batches.quantity_remaining (hard commit)
   *   5. INSERT allocations + inventory_transactions
   *   6. Auto-bump sales_orders.status: confirmed → ready
   */
  async allocateToOrder(
    salesOrderId: string,
    requests: AllocationRequest[],
    allocatedBy?: string | null,
  ): Promise<StockAllocation[]> {
    if (requests.length === 0) {
      throw new Error('Phải chọn ít nhất 1 lô hàng')
    }

    // 1. Đọc sales_order
    const { data: order, error: orderErr } = await supabase
      .from('sales_orders')
      .select('id, code, quantity_kg, quantity_tons, status, grade, drc_min, drc_max')
      .eq('id', salesOrderId)
      .single()
    if (orderErr || !order) throw new Error('Không tìm thấy đơn hàng')

    if (!['confirmed', 'producing', 'ready'].includes(order.status)) {
      throw new Error(`Không thể cấp phát khi đơn ở trạng thái "${order.status}"`)
    }

    const targetKg = Number(order.quantity_kg || (order.quantity_tons || 0) * 1000)
    if (targetKg <= 0) throw new Error('Đơn hàng chưa có số lượng hợp lệ')

    // 2. Đọc các allocations đang active để check all-or-nothing
    const existingTotal = await this.getTotalAllocated(salesOrderId)
    const requestedTotal = requests.reduce((s, r) => s + Number(r.quantity_kg || 0), 0)
    const newTotal = existingTotal + requestedTotal

    if (newTotal < targetKg) {
      throw new Error(
        `Cấp phát không đủ: cần ${targetKg} kg, đã có ${existingTotal} kg, cấp thêm ${requestedTotal} kg → tổng ${newTotal} kg (còn thiếu ${targetKg - newTotal} kg). Chọn thêm lô.`,
      )
    }
    if (newTotal > targetKg * 1.05) {
      throw new Error(
        `Cấp phát vượt mức: cần ${targetKg} kg, tổng đang chọn ${newTotal} kg (vượt hơn 5%). Giảm bớt hoặc chia nhỏ đơn.`,
      )
    }

    // 3. Validate từng batch có đủ quantity + đúng grade
    const batchIds = requests.map(r => r.stock_batch_id)
    const { data: batches, error: batchErr } = await supabase
      .from('stock_batches')
      .select('id, batch_no, rubber_grade, quantity_remaining, qc_status, status, material_id, warehouse_id')
      .in('id', batchIds)
    if (batchErr) throw batchErr
    if (!batches || batches.length !== batchIds.length) {
      throw new Error('Một số lô không tồn tại')
    }

    const batchMap = new Map<string, any>(batches.map(b => [b.id, b]))

    for (const req of requests) {
      const batch = batchMap.get(req.stock_batch_id)
      if (!batch) throw new Error(`Không tìm thấy lô ${req.stock_batch_id}`)
      if (batch.status !== 'active') {
        throw new Error(`Lô ${batch.batch_no} đang ở trạng thái ${batch.status}, không thể cấp phát`)
      }
      if (Number(batch.quantity_remaining) < Number(req.quantity_kg)) {
        throw new Error(
          `Lô ${batch.batch_no} không đủ: cần ${req.quantity_kg} kg, còn ${batch.quantity_remaining} kg`,
        )
      }
      // Warn if grade mismatch (still allow but log)
      if (order.grade && batch.rubber_grade && batch.rubber_grade !== order.grade) {
        console.warn(
          `[allocateToOrder] Grade mismatch for batch ${batch.batch_no}: order=${order.grade}, batch=${batch.rubber_grade}`,
        )
      }
    }

    // 4. Hard commit: trừ quantity_remaining cho từng batch + INSERT allocations
    const now = new Date().toISOString()
    const createdAllocations: StockAllocation[] = []

    for (const req of requests) {
      const batch = batchMap.get(req.stock_batch_id)
      const newQty = Math.max(0, Number(batch.quantity_remaining) - Number(req.quantity_kg))

      // Trừ stock_batch
      await supabase
        .from('stock_batches')
        .update({
          quantity_remaining: newQty,
          current_weight: newQty,
          status: newQty === 0 ? 'depleted' : 'active',
          updated_at: now,
        })
        .eq('id', req.stock_batch_id)

      // INSERT allocation
      const alloc = throwIfError(
        await supabase
          .from('sales_order_stock_allocations')
          .insert({
            sales_order_id: salesOrderId,
            stock_batch_id: req.stock_batch_id,
            quantity_kg: req.quantity_kg,
            allocated_by: allocatedBy || null,
            status: 'reserved',
          })
          .select('*')
          .single(),
        'Không thể tạo allocation',
      )
      createdAllocations.push(alloc as unknown as StockAllocation)

      // Inventory transaction
      await supabase.from('inventory_transactions').insert({
        material_id: batch.material_id,
        warehouse_id: batch.warehouse_id,
        batch_id: req.stock_batch_id,
        type: 'sales_allocation',
        quantity: -Number(req.quantity_kg),
        reference_type: 'sales_order',
        reference_id: salesOrderId,
        notes: `Cấp phát cho đơn ${order.code}`,
        created_at: now,
      })
    }

    // 5. Auto-bump sales_orders.status: confirmed → ready (skip producing)
    if (order.status === 'confirmed') {
      try {
        const { salesOrderService } = await import('./salesOrderService')
        // Cần đi qua producing trước vì VALID_TRANSITIONS chỉ cho phép forward 1 bước
        await salesOrderService.updateStatus(salesOrderId, 'producing')
        await salesOrderService.updateStatus(salesOrderId, 'ready')
      } catch (e) {
        console.error('[allocateToOrder] Failed to bump sales status:', e)
      }
    }

    return createdAllocations
  },

  /**
   * RELEASE — hoàn lại 1 allocation về kho
   * Không thể release khi đã shipped
   */
  async releaseAllocation(allocationId: string, reason?: string, releasedBy?: string | null): Promise<void> {
    const { data: alloc, error: fetchErr } = await supabase
      .from('sales_order_stock_allocations')
      .select('id, status, stock_batch_id, quantity_kg, sales_order_id')
      .eq('id', allocationId)
      .single()
    if (fetchErr || !alloc) throw new Error('Không tìm thấy allocation')

    if (alloc.status === 'shipped') {
      throw new Error('Không thể release allocation đã shipped — hàng đã xuất khỏi kho')
    }
    if (alloc.status === 'released') {
      throw new Error('Allocation đã được release trước đó')
    }

    // Restore stock_batch quantity_remaining
    const { data: batch } = await supabase
      .from('stock_batches')
      .select('quantity_remaining, material_id, warehouse_id')
      .eq('id', alloc.stock_batch_id)
      .single()
    if (batch) {
      const restoredQty = Number(batch.quantity_remaining) + Number(alloc.quantity_kg)
      const now = new Date().toISOString()
      await supabase
        .from('stock_batches')
        .update({
          quantity_remaining: restoredQty,
          current_weight: restoredQty,
          status: 'active',
          updated_at: now,
        })
        .eq('id', alloc.stock_batch_id)

      await supabase.from('inventory_transactions').insert({
        material_id: batch.material_id,
        warehouse_id: batch.warehouse_id,
        batch_id: alloc.stock_batch_id,
        type: 'sales_release',
        quantity: Number(alloc.quantity_kg),
        reference_type: 'sales_order',
        reference_id: alloc.sales_order_id,
        notes: `Release allocation: ${reason || 'Không rõ lý do'}`,
        created_at: now,
      })
    }

    // Mark allocation released
    await supabase
      .from('sales_order_stock_allocations')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        released_by: releasedBy || null,
        release_reason: reason || null,
      })
      .eq('id', allocationId)
  },

  /**
   * RELEASE ALL — hoàn lại tất cả allocations của 1 đơn
   * Gọi khi cancel đơn hoặc khi user muốn re-pick từ đầu
   */
  async releaseAllByOrder(salesOrderId: string, reason?: string, releasedBy?: string | null): Promise<number> {
    const { data: allocs } = await supabase
      .from('sales_order_stock_allocations')
      .select('id, status')
      .eq('sales_order_id', salesOrderId)
      .in('status', ['reserved', 'packed'])  // shipped không release được

    if (!allocs || allocs.length === 0) return 0

    let releasedCount = 0
    for (const alloc of allocs) {
      try {
        await this.releaseAllocation(alloc.id, reason, releasedBy)
        releasedCount++
      } catch (e) {
        console.error(`[releaseAllByOrder] Failed to release ${alloc.id}:`, e)
      }
    }
    return releasedCount
  },

  /**
   * ASSIGN TO CONTAINER — gán 1 allocation vào 1 container cụ thể
   * N-N: 1 container có thể chứa nhiều allocations
   */
  async assignToContainer(allocationId: string, containerId: string | null): Promise<void> {
    const { error } = await supabase
      .from('sales_order_stock_allocations')
      .update({
        container_id: containerId,
        status: containerId ? 'packed' : 'reserved',
      })
      .eq('id', allocationId)
    if (error) throw error
  },

  /**
   * Đánh dấu đã ship (gọi khi Logistics bấm "Xuất hàng")
   * Không restore stock vì hàng đã ra khỏi kho thật sự
   */
  async markAllShippedForOrder(salesOrderId: string): Promise<void> {
    const { error } = await supabase
      .from('sales_order_stock_allocations')
      .update({ status: 'shipped' })
      .eq('sales_order_id', salesOrderId)
      .in('status', ['reserved', 'packed'])
    if (error) throw error
  },
}
