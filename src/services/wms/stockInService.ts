// ============================================================================
// FILE: src/services/wms/stockInService.ts
// MODULE: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
// PHASE: P3 - Bước 3.2 (tạo phiếu), 3.3 (thêm chi tiết), 3.4 (xác nhận)
// MÔ TẢ: Phiếu nhập kho - tạo, thêm chi tiết + tạo lô, xác nhận -> cập nhật tồn
// BANG: stock_in_orders, stock_in_details, stock_batches, stock_levels,
//       inventory_transactions, warehouse_locations
// PATTERN: async/await, Supabase
// ============================================================================

import { supabase } from '../../lib/supabase'
import { batchService } from './batchService'
import { recordInventoryMove } from './inventorySync'
import type {
  StockInOrder,
  StockInDetail,
  StockInFormData,
  StockInDetailFormData,
  StockInStatus,
  QCStatus,
  WMSPaginationParams,
  PaginatedResponse,
} from './wms.types'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Select string cho phiếu nhập - join details + material + batch + location */
const STOCK_IN_SELECT = `
  *,
  warehouse:warehouses(id, code, name, type),
  creator:employees!stock_in_orders_created_by_fkey(full_name),
  confirmer:employees!stock_in_orders_confirmed_by_fkey(full_name),
  details:stock_in_details(
    *,
    material:materials(id, sku, name, type, unit, weight_per_unit),
    batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status),
    location:warehouse_locations(id, code, shelf, row_name, column_name)
  )
`

/** Select cho danh sách (compact) */
const STOCK_IN_LIST_SELECT = `
  id, code, type, warehouse_id, source_type, deal_id,
  total_quantity, total_weight, status, notes,
  created_by, confirmed_by, confirmed_at,
  created_at, updated_at,
  warehouse:warehouses(id, code, name),
  creator:employees!stock_in_orders_created_by_fkey(full_name),
  confirmer:employees!stock_in_orders_confirmed_by_fkey(full_name),
  deal:b2b_deals!deal_id(id, deal_number)
`

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Tự sinh mã phiếu nhập: NK-TP-YYYYMMDD-XXX
 * VD: NK-TP-20260210-001
 */
/**
 * Validate: kho phải đúng loại (raw ↔ raw, finished ↔ finished, mixed ↔ cả 2)
 * Ngăn user nhập NVL vào kho thành phẩm hoặc ngược lại
 */
async function _assertWarehouseTypeMatches(
  warehouseId: string,
  orderType: 'raw' | 'finished',
): Promise<void> {
  const { data: wh, error } = await supabase
    .from('warehouses')
    .select('id, code, name, type')
    .eq('id', warehouseId)
    .single()
  if (error || !wh) throw new Error('Không tìm thấy kho')
  const whType = (wh as any).type as 'raw' | 'finished' | 'mixed' | null
  if (!whType || whType === 'mixed') return
  if (whType !== orderType) {
    const orderLabel = orderType === 'raw' ? 'Nguyên liệu' : 'Thành phẩm'
    const whLabel = whType === 'raw' ? 'Nguyên liệu' : 'Thành phẩm'
    throw new Error(
      `Kho "${(wh as any).name}" là kho ${whLabel}, không thể nhập/xuất hàng ${orderLabel}. Chọn kho khác hoặc dùng kho hỗn hợp (mixed).`,
    )
  }
}

async function generateCode(): Promise<string> {
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const prefix = `NK-TP-${yyyy}${mm}${dd}`

  const { data, error } = await supabase
    .from('stock_in_orders')
    .select('code')
    .like('code', `${prefix}-%`)
    .order('code', { ascending: false })
    .limit(1)

  if (error) throw error

  let seq = 1
  if (data && data.length > 0) {
    const lastCode = data[0].code
    const lastSeq = parseInt(lastCode.split('-').pop() || '0', 10)
    seq = lastSeq + 1
  }

  return `${prefix}-${String(seq).padStart(3, '0')}`
}

// ============================================================================
// SERVICE
// ============================================================================

export const stockInService = {

  // ==========================================================================
  // BƯỚC 3.2 - TẠO PHIẾU
  // ==========================================================================

  // --------------------------------------------------------------------------
  // GENERATE CODE
  // --------------------------------------------------------------------------
  generateCode,

  // --------------------------------------------------------------------------
  // CREATE - Tạo header phiếu nhập (status = draft)
  // --------------------------------------------------------------------------
  async create(data: StockInFormData, createdBy?: string): Promise<StockInOrder> {
    const orderType: 'raw' | 'finished' = (data.type || 'finished') as 'raw' | 'finished'
    await _assertWarehouseTypeMatches(data.warehouse_id, orderType)

    const code = await generateCode()

    const insertData = {
      code,
      type: orderType,
      warehouse_id: data.warehouse_id,
      source_type: data.source_type || 'production',
      production_order_id: data.production_order_id || null,
      deal_id: data.deal_id || null,
      notes: data.notes || null,
      status: 'draft' as StockInStatus,
      created_by: createdBy || null,
      total_quantity: 0,
      total_weight: 0,
    }

    const { data: order, error } = await supabase
      .from('stock_in_orders')
      .insert(insertData)
      .select(STOCK_IN_SELECT)
      .single()

    if (error) throw error
    return order as unknown as StockInOrder
  },

  // --------------------------------------------------------------------------
  // GET ALL - DS phiếu nhập, phân trang, filter
  // --------------------------------------------------------------------------
  async getAll(params: WMSPaginationParams): Promise<PaginatedResponse<StockInOrder>> {
    const {
      page = 1,
      pageSize = 20,
      search,
      status,
      warehouse_id,
      type,
      from_date,
      to_date,
    } = params

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('stock_in_orders')
      .select(STOCK_IN_LIST_SELECT, { count: 'exact' })

    if (status) query = query.eq('status', status)
    if (warehouse_id) query = query.eq('warehouse_id', warehouse_id)
    if (type) query = query.eq('type', type)
    if (from_date) query = query.gte('created_at', `${from_date}T00:00:00`)
    if (to_date) query = query.lte('created_at', `${to_date}T23:59:59`)

    if (search && search.trim()) {
      query = query.ilike('code', `%${search.trim()}%`)
    }

    query = query
      .order('created_at', { ascending: false })
      .range(from, to)

    const { data, count, error } = await query
    if (error) throw error

    const total = count ?? 0
    return {
      data: (data || []) as unknown as StockInOrder[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  },

  // --------------------------------------------------------------------------
  // GET BY ID - Chi tiết phiếu + join details -> material, batch, location
  // --------------------------------------------------------------------------
  async getById(id: string): Promise<StockInOrder | null> {
    const { data, error } = await supabase
      .from('stock_in_orders')
      .select(STOCK_IN_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data as unknown as StockInOrder
  },

  // ==========================================================================
  // BƯỚC 3.3 - THÊM / SỬA / XÓA CHI TIẾT
  // ==========================================================================

  // --------------------------------------------------------------------------
  // ADD DETAIL - Thêm chi tiết + tạo lô mới
  // --------------------------------------------------------------------------
  async addDetail(
    stockInId: string,
    detail: StockInDetailFormData
  ): Promise<StockInDetail> {
    // 1. Validate: phiếu phải ở trạng thái draft
    const { data: order, error: orderErr } = await supabase
      .from('stock_in_orders')
      .select('id, status, warehouse_id, deal_id')
      .eq('id', stockInId)
      .single()

    if (orderErr) throw orderErr
    if (!order) throw new Error('Không tìm thấy phiếu nhập kho')
    if (order.status !== 'draft') {
      throw new Error('Chỉ có thể thêm chi tiết khi phiếu ở trạng thái Nháp')
    }

    // ★ Lấy lot_code + rubber_intake_id từ deal (nếu có)
    let sourceLotCode: string | undefined
    let rubberIntakeId: string | undefined
    if (order.deal_id) {
      const { data: deal } = await supabase
        .from('b2b_deals')
        .select('lot_code, rubber_intake_id')
        .eq('id', order.deal_id)
        .single()
      if (deal) {
        sourceLotCode = deal.lot_code || undefined
        rubberIntakeId = deal.rubber_intake_id || undefined
      }
    }

    // 2. Tạo lô hàng mới (stock_batches)
    const batch = await batchService.createBatch({
      material_id: detail.material_id,
      warehouse_id: order.warehouse_id,
      location_id: detail.location_id,
      initial_quantity: detail.quantity,
      initial_drc: detail.initial_drc,
      batch_type: 'production',
      source_lot_code: sourceLotCode,
      rubber_intake_id: rubberIntakeId,
    })

    // 3. Tạo chi tiết phiếu nhập (stock_in_details)
    const insertDetail = {
      stock_in_id: stockInId,
      material_id: detail.material_id,
      batch_id: batch.id,
      location_id: detail.location_id || null,
      quantity: detail.quantity,
      weight: detail.weight || null,
      unit: 'kg',
      notes: detail.notes || null,
    }

    const { data: newDetail, error: detailErr } = await supabase
      .from('stock_in_details')
      .insert(insertDetail)
      .select(`
        *,
        material:materials(id, sku, name, type, unit, weight_per_unit),
        batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status),
        location:warehouse_locations(id, code, shelf, row_name, column_name)
      `)
      .single()

    if (detailErr) throw detailErr

    // 4. Cập nhật tổng số lượng / trọng lượng header
    await this._recalculateTotals(stockInId)

    return newDetail as unknown as StockInDetail
  },

  // --------------------------------------------------------------------------
  // REMOVE DETAIL - Xóa chi tiết (chỉ khi phiếu còn draft)
  // --------------------------------------------------------------------------
  async removeDetail(detailId: string): Promise<void> {
    // Lấy detail + kiểm tra status phiếu
    const { data: detail, error: fetchErr } = await supabase
      .from('stock_in_details')
      .select('id, stock_in_id, batch_id')
      .eq('id', detailId)
      .single()

    if (fetchErr) throw fetchErr
    if (!detail) throw new Error('Không tìm thấy chi tiết')

    // Kiểm tra phiếu draft
    const { data: order, error: orderErr } = await supabase
      .from('stock_in_orders')
      .select('status')
      .eq('id', detail.stock_in_id)
      .single()

    if (orderErr) throw orderErr
    if (order?.status !== 'draft') {
      throw new Error('Chỉ có thể xóa chi tiết khi phiếu ở trạng thái Nháp')
    }

    // Xóa lô hàng liên quan (nếu có)
    if (detail.batch_id) {
      await supabase
        .from('stock_batches')
        .delete()
        .eq('id', detail.batch_id)
    }

    // Xóa chi tiết
    const { error: deleteErr } = await supabase
      .from('stock_in_details')
      .delete()
      .eq('id', detailId)

    if (deleteErr) throw deleteErr

    // Cập nhật tổng
    await this._recalculateTotals(detail.stock_in_id)
  },

  // --------------------------------------------------------------------------
  // UPDATE DETAIL - Sửa số lượng / vị trí (chỉ khi draft)
  // --------------------------------------------------------------------------
  async updateDetail(
    detailId: string,
    data: Partial<StockInDetailFormData>
  ): Promise<StockInDetail> {
    // Lấy detail hiện tại
    const { data: existing, error: fetchErr } = await supabase
      .from('stock_in_details')
      .select('id, stock_in_id, batch_id')
      .eq('id', detailId)
      .single()

    if (fetchErr) throw fetchErr
    if (!existing) throw new Error('Không tìm thấy chi tiết')

    // Kiểm tra phiếu draft
    const { data: order, error: orderErr } = await supabase
      .from('stock_in_orders')
      .select('status')
      .eq('id', existing.stock_in_id)
      .single()

    if (orderErr) throw orderErr
    if (order?.status !== 'draft') {
      throw new Error('Chỉ có thể sửa chi tiết khi phiếu ở trạng thái Nháp')
    }

    // Update detail
    const updateData: Record<string, unknown> = {}
    if (data.quantity !== undefined) updateData.quantity = data.quantity
    if (data.weight !== undefined) updateData.weight = data.weight
    if (data.location_id !== undefined) updateData.location_id = data.location_id
    if (data.notes !== undefined) updateData.notes = data.notes

    const { data: updated, error: updateErr } = await supabase
      .from('stock_in_details')
      .update(updateData)
      .eq('id', detailId)
      .select(`
        *,
        material:materials(id, sku, name, type, unit, weight_per_unit),
        batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status),
        location:warehouse_locations(id, code, shelf, row_name, column_name)
      `)
      .single()

    if (updateErr) throw updateErr

    // Đồng bộ quantity về batch nếu thay đổi
    if (data.quantity !== undefined && existing.batch_id) {
      await supabase
        .from('stock_batches')
        .update({
          initial_quantity: data.quantity,
          quantity_remaining: data.quantity,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.batch_id)
    }

    // Đồng bộ location về batch
    if (data.location_id !== undefined && existing.batch_id) {
      await supabase
        .from('stock_batches')
        .update({
          location_id: data.location_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.batch_id)
    }

    // Cập nhật tổng
    await this._recalculateTotals(existing.stock_in_id)

    return updated as unknown as StockInDetail
  },

  // ==========================================================================
  // BƯỚC 3.4 - XÁC NHẬN NHẬP KHO
  // ==========================================================================

  // --------------------------------------------------------------------------
  // CONFIRM - Xác nhận nhập kho -> cập nhật tồn kho, ghi giao dịch
  // --------------------------------------------------------------------------
  async confirmStockIn(stockInId: string, confirmedBy: string): Promise<StockInOrder> {
    // 1. Validate: phiếu phải ở status=draft, có ít nhất 1 detail
    const { data: order, error: orderErr } = await supabase
      .from('stock_in_orders')
      .select(`
        id, code, status, warehouse_id,
        details:stock_in_details(id, material_id, batch_id, location_id, quantity, weight)
      `)
      .eq('id', stockInId)
      .single()

    if (orderErr) throw orderErr
    if (!order) throw new Error('Không tìm thấy phiếu nhập kho')
    if (order.status !== 'draft') {
      throw new Error('Chỉ có thể xác nhận phiếu ở trạng thái Nháp')
    }

    const details = (order as any).details as Array<{
      id: string
      material_id: string
      batch_id: string
      location_id: string | null
      quantity: number
      weight: number | null
    }>

    if (!details || details.length === 0) {
      throw new Error('Phiếu phải có ít nhất 1 chi tiết trước khi xác nhận')
    }

    // 2. Update header -> confirmed
    const now = new Date().toISOString()
    const { error: updateOrderErr } = await supabase
      .from('stock_in_orders')
      .update({
        status: 'confirmed' as StockInStatus,
        confirmed_by: confirmedBy,
        confirmed_at: now,
        updated_at: now,
      })
      .eq('id', stockInId)

    if (updateOrderErr) throw updateOrderErr

    // 3. Với MỖI detail -> cập nhật tồn kho
    for (const detail of details) {
      // 3a. Upsert stock_levels: tăng quantity
      await this._upsertStockLevel(
        detail.material_id,
        order.warehouse_id,
        detail.quantity
      )

      // 3b. Insert inventory_transactions (type='in')
      await supabase
        .from('inventory_transactions')
        .insert({
          material_id: detail.material_id,
          warehouse_id: order.warehouse_id,
          batch_id: detail.batch_id,
          type: 'in',
          quantity: detail.quantity,
          reference_type: 'stock_in',
          reference_id: stockInId,
          notes: `Nhập kho từ phiếu ${(order as any).code || order.id}`,
          created_by: confirmedBy,
        })

      // 3c. Update warehouse_locations.current_quantity
      if (detail.location_id) {
        await this._increaseLocationQuantity(detail.location_id, detail.quantity)
      }

      // 3d. Update stock_batches.status = 'active'
      if (detail.batch_id) {
        await supabase
          .from('stock_batches')
          .update({
            status: 'active',
            warehouse_id: order.warehouse_id,
            updated_at: now,
          })
          .eq('id', detail.batch_id)
      }
    }

    // 4. Tính total_quantity, total_weight -> update header
    await this._recalculateTotals(stockInId)

    // 5. Phase 4: Nếu có deal_id -> cập nhật deal totals + gửi thông báo chat
    const { data: orderWithDeal } = await supabase
      .from('stock_in_orders')
      .select('deal_id, code, total_weight')
      .eq('id', stockInId)
      .single()

    if (orderWithDeal?.deal_id) {
      try {
        const { dealWmsService } = await import('../b2b/dealWmsService')
        await dealWmsService.updateDealStockInTotals(orderWithDeal.deal_id)
        await dealWmsService.notifyDealChatStockIn(
          orderWithDeal.deal_id,
          orderWithDeal.code,
          orderWithDeal.total_weight || 0
        )
      } catch (err) {
        console.error('Update deal after stock-in confirm failed:', err)
        // Non-blocking: stock-in vẫn thành công
      }
    }

    // 6. Return phiếu đã xác nhận
    const confirmed = await this.getById(stockInId)
    if (!confirmed) throw new Error('Không thể tải phiếu sau khi xác nhận')
    return confirmed
  },

  // --------------------------------------------------------------------------
  // CANCEL - Hủy phiếu (chỉ draft)
  // --------------------------------------------------------------------------
  async cancelStockIn(stockInId: string): Promise<StockInOrder> {
    const { data: order, error: fetchErr } = await supabase
      .from('stock_in_orders')
      .select('id, status')
      .eq('id', stockInId)
      .single()

    if (fetchErr) throw fetchErr
    if (!order) throw new Error('Không tìm thấy phiếu nhập kho')
    if (order.status !== 'draft') {
      throw new Error('Chỉ có thể hủy phiếu ở trạng thái Nháp')
    }

    // Xóa các lô liên quan (chưa active)
    const { data: details } = await supabase
      .from('stock_in_details')
      .select('batch_id')
      .eq('stock_in_id', stockInId)

    if (details) {
      const batchIds = details
        .map(d => d.batch_id)
        .filter(Boolean) as string[]

      if (batchIds.length > 0) {
        await supabase
          .from('stock_batches')
          .delete()
          .in('id', batchIds)
      }
    }

    // Update status
    const { data: cancelled, error: updateErr } = await supabase
      .from('stock_in_orders')
      .update({
        status: 'cancelled' as StockInStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stockInId)
      .select(STOCK_IN_SELECT)
      .single()

    if (updateErr) throw updateErr
    return cancelled as unknown as StockInOrder
  },

  // ==========================================================================
  // PHASE 4 — NHẬP NHANH TỪ PHIẾU CÂN
  // ==========================================================================

  // --------------------------------------------------------------------------
  // CREATE FROM WEIGHBRIDGE TICKET — Tạo phiếu nhập + lô hàng từ phiếu cân
  // --------------------------------------------------------------------------
  async createFromWeighbridgeTicket(
    ticketId: string,
    warehouseId: string,
    yardPosition?: { zone: string; row: number; col: number }
  ): Promise<{ stockIn: any; batch: any }> {
    // 1. Get weighbridge ticket
    const { data: ticket, error: ticketErr } = await supabase
      .from('weighbridge_tickets')
      .select('*')
      .eq('id', ticketId)
      .single()

    if (ticketErr) throw ticketErr
    if (!ticket) throw new Error('Không tìm thấy phiếu cân')
    if (ticket.status !== 'completed') throw new Error('Phiếu cân chưa hoàn tất')

    // Phiếu cân luôn là NVL → kho phải là raw hoặc mixed
    await _assertWarehouseTypeMatches(warehouseId, 'raw')

    // 2. Auto generate stock-in code
    const code = await generateCode()

    // 3. Create stock_in_order
    const { data: si, error: siErr } = await supabase
      .from('stock_in_orders')
      .insert({
        code,
        type: 'raw',
        warehouse_id: warehouseId,
        source_type: 'purchase',
        deal_id: ticket.deal_id || null,
        status: 'confirmed' as StockInStatus,
        total_quantity: 1,
        total_weight: ticket.net_weight || 0,
        confirmed_at: new Date().toISOString(),
        notes: `Nhập nhanh từ phiếu cân ${ticket.code}`,
      })
      .select('id, code')
      .single()

    if (siErr) throw siErr

    // 4. Get material (first raw material)
    const { data: mat } = await supabase
      .from('materials')
      .select('id')
      .eq('type', 'raw')
      .limit(1)
      .single()

    // 5. Create batch
    const batchNo = `NVL-${(ticket.code || '').replace('CX-', '')}`
    const { data: batch, error: batchErr } = await supabase
      .from('stock_batches')
      .insert({
        batch_no: batchNo,
        material_id: mat?.id,
        warehouse_id: warehouseId,
        initial_quantity: 1,
        quantity_remaining: 1,
        initial_weight: ticket.net_weight || 0,
        current_weight: ticket.net_weight || 0,
        initial_drc: ticket.expected_drc || null,
        latest_drc: ticket.expected_drc || null,
        qc_status: 'pending' as QCStatus,
        status: 'active' as const,
        rubber_type: ticket.rubber_type || null,
        supplier_name: ticket.supplier_name || null,
        supplier_reported_drc: ticket.expected_drc || null,
        yard_zone: yardPosition?.zone || null,
        yard_row: yardPosition?.row || null,
        yard_col: yardPosition?.col || null,
        received_date: new Date().toISOString().split('T')[0],
      })
      .select('id, batch_no')
      .single()

    if (batchErr) throw batchErr

    // 6. Create stock_in_detail
    await supabase.from('stock_in_details').insert({
      stock_in_id: si!.id,
      material_id: mat?.id,
      batch_id: batch!.id,
      quantity: 1,
      weight: ticket.net_weight || 0,
      drc_value: ticket.expected_drc || null,
    })

    // 6b. Đồng bộ stock_levels + inventory_transactions cho phiếu cân
    //     (nhập NVL — delta dương). Warehouse_locations không đụng vì
    //     phiếu cân dùng yard_zone/row/col riêng, không phải bảng warehouse_locations.
    if (mat?.id && ticket.net_weight) {
      await recordInventoryMove({
        material_id: mat.id,
        warehouse_id: warehouseId,
        batch_id: batch!.id,
        delta_kg: Number(ticket.net_weight),
        type: 'weighbridge_in',
        reference_type: 'stock_in',
        reference_id: si!.id,
        notes: `Nhập NVL từ phiếu cân ${ticket.code}`,
      })
    }

    // 7. Update deal if linked
    if (ticket.deal_id) {
      try {
        const { dealWmsService } = await import('../b2b/dealWmsService')
        await dealWmsService.updateDealStockInTotals(ticket.deal_id)
      } catch { /* non-blocking */ }
    }

    return { stockIn: si, batch }
  },

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Tính lại tổng quantity / weight của phiếu
  // --------------------------------------------------------------------------
  async _recalculateTotals(stockInId: string): Promise<void> {
    const { data: details, error } = await supabase
      .from('stock_in_details')
      .select('quantity, weight')
      .eq('stock_in_id', stockInId)

    if (error) throw error

    const totalQty = (details || []).reduce((sum, d) => sum + (d.quantity || 0), 0)
    const totalWeight = (details || []).reduce((sum, d) => sum + (d.weight || 0), 0)

    await supabase
      .from('stock_in_orders')
      .update({
        total_quantity: totalQty,
        total_weight: totalWeight,
        updated_at: new Date().toISOString(),
      })
      .eq('id', stockInId)
  },

  // --------------------------------------------------------------------------
  // Upsert stock_levels: tăng quantity cho material + warehouse
  // --------------------------------------------------------------------------
  async _upsertStockLevel(
    materialId: string,
    warehouseId: string,
    quantityDelta: number
  ): Promise<void> {
    // Thử tìm record hiện tại
    const { data: existing } = await supabase
      .from('stock_levels')
      .select('id, quantity')
      .eq('material_id', materialId)
      .eq('warehouse_id', warehouseId)
      .maybeSingle()

    if (existing) {
      // Update: tăng quantity
      await supabase
        .from('stock_levels')
        .update({
          quantity: existing.quantity + quantityDelta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      // Insert mới
      await supabase
        .from('stock_levels')
        .insert({
          material_id: materialId,
          warehouse_id: warehouseId,
          quantity: quantityDelta,
        })
    }
  },

  // --------------------------------------------------------------------------
  // Tăng current_quantity của warehouse_location
  // --------------------------------------------------------------------------
  async _increaseLocationQuantity(
    locationId: string,
    quantityDelta: number
  ): Promise<void> {
    const { data: loc, error: fetchErr } = await supabase
      .from('warehouse_locations')
      .select('id, current_quantity')
      .eq('id', locationId)
      .single()

    if (fetchErr || !loc) return // Bỏ qua nếu không tìm thấy

    await supabase
      .from('warehouse_locations')
      .update({
        current_quantity: (loc.current_quantity || 0) + quantityDelta,
      })
      .eq('id', locationId)
  },
}

// ============================================================================
// STANDALONE EXPORTS
// ============================================================================

export const {
  create: createStockIn,
  getAll: getAllStockIns,
  getById: getStockInById,
  addDetail: addStockInDetail,
  removeDetail: removeStockInDetail,
  updateDetail: updateStockInDetail,
  confirmStockIn,
  cancelStockIn,
  createFromWeighbridgeTicket,
} = stockInService

export default stockInService
