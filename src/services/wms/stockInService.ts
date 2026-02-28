// ============================================================================
// FILE: src/services/wms/stockInService.ts
// MODULE: Kho ThÃ nh Pháº©m (WMS) â€” Huy Anh Rubber ERP
// PHASE: P3 â€” BÆ°á»›c 3.2 (táº¡o phiáº¿u), 3.3 (thÃªm chi tiáº¿t), 3.4 (xÃ¡c nháº­n)
// MÃ” Táº¢: Phiáº¿u nháº­p kho â€” táº¡o, thÃªm chi tiáº¿t + táº¡o lÃ´, xÃ¡c nháº­n â†’ cáº­p nháº­t tá»“n
// Báº¢NG: stock_in_orders, stock_in_details, stock_batches, stock_levels,
//        inventory_transactions, warehouse_locations
// PATTERN: async/await, Supabase
// ============================================================================

import { supabase } from '../../lib/supabase'
import { batchService } from './batchService'
import type {
  StockInOrder,
  StockInDetail,
  StockInFormData,
  StockInDetailFormData,
  StockInStatus,
  WMSPaginationParams,
  PaginatedResponse,
} from './wms.types'

// ============================================================================
// CONSTANTS
// ============================================================================

/** Select string cho phiáº¿u nháº­p â€” join details + material + batch + location */
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

/** Select cho danh sÃ¡ch (compact) */
const STOCK_IN_LIST_SELECT = `
  id, code, type, warehouse_id, source_type,
  total_quantity, total_weight, status, notes,
  created_by, confirmed_by, confirmed_at,
  created_at, updated_at,
  warehouse:warehouses(id, code, name),
  creator:employees!stock_in_orders_created_by_fkey(full_name),
  confirmer:employees!stock_in_orders_confirmed_by_fkey(full_name)
`

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Tá»± sinh mÃ£ phiáº¿u nháº­p: NK-TP-YYYYMMDD-XXX
 * VD: NK-TP-20260210-001
 */
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
  // BÆ¯á»šC 3.2 â€” Táº O PHIáº¾U
  // ==========================================================================

  // --------------------------------------------------------------------------
  // GENERATE CODE
  // --------------------------------------------------------------------------
  generateCode,

  // --------------------------------------------------------------------------
  // CREATE â€” Táº¡o header phiáº¿u nháº­p (status = draft)
  // --------------------------------------------------------------------------
  async create(data: StockInFormData, createdBy?: string): Promise<StockInOrder> {
    const code = await generateCode()

    const insertData = {
      code,
      type: data.type || 'finished',
      warehouse_id: data.warehouse_id,
      source_type: data.source_type || 'production',
      production_order_id: data.production_order_id || null,
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
  // GET ALL â€” DS phiáº¿u nháº­p, phÃ¢n trang, filter
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
  // GET BY ID â€” Chi tiáº¿t phiáº¿u + join details â†’ material, batch, location
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
  // BÆ¯á»šC 3.3 â€” THÃŠM / Sá»¬A / XÃ“A CHI TIáº¾T
  // ==========================================================================

  // --------------------------------------------------------------------------
  // ADD DETAIL â€” ThÃªm chi tiáº¿t + táº¡o lÃ´ má»›i
  // --------------------------------------------------------------------------
  async addDetail(
    stockInId: string,
    detail: StockInDetailFormData
  ): Promise<StockInDetail> {
    // 1. Validate: phiáº¿u pháº£i á»Ÿ tráº¡ng thÃ¡i draft
    const { data: order, error: orderErr } = await supabase
      .from('stock_in_orders')
      .select('id, status, warehouse_id')
      .eq('id', stockInId)
      .single()

    if (orderErr) throw orderErr
    if (!order) throw new Error('KhÃ´ng tÃ¬m tháº¥y phiáº¿u nháº­p kho')
    if (order.status !== 'draft') {
      throw new Error('Chá»‰ cÃ³ thá»ƒ thÃªm chi tiáº¿t khi phiáº¿u á»Ÿ tráº¡ng thÃ¡i NhÃ¡p')
    }

    // 2. Táº¡o lÃ´ hÃ ng má»›i (stock_batches)
    const batch = await batchService.createBatch({
      material_id: detail.material_id,
      warehouse_id: order.warehouse_id,
      location_id: detail.location_id,
      initial_quantity: detail.quantity,
      initial_drc: detail.initial_drc,
      batch_type: 'production',
    })

    // 3. Táº¡o chi tiáº¿t phiáº¿u nháº­p (stock_in_details)
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

    // 4. Cáº­p nháº­t tá»•ng sá»‘ lÆ°á»£ng / trá»ng lÆ°á»£ng header
    await this._recalculateTotals(stockInId)

    return newDetail as unknown as StockInDetail
  },

  // --------------------------------------------------------------------------
  // REMOVE DETAIL â€” XÃ³a chi tiáº¿t (chá»‰ khi phiáº¿u cÃ²n draft)
  // --------------------------------------------------------------------------
  async removeDetail(detailId: string): Promise<void> {
    // Láº¥y detail + kiá»ƒm tra status phiáº¿u
    const { data: detail, error: fetchErr } = await supabase
      .from('stock_in_details')
      .select('id, stock_in_id, batch_id')
      .eq('id', detailId)
      .single()

    if (fetchErr) throw fetchErr
    if (!detail) throw new Error('KhÃ´ng tÃ¬m tháº¥y chi tiáº¿t')

    // Kiá»ƒm tra phiáº¿u draft
    const { data: order, error: orderErr } = await supabase
      .from('stock_in_orders')
      .select('status')
      .eq('id', detail.stock_in_id)
      .single()

    if (orderErr) throw orderErr
    if (order?.status !== 'draft') {
      throw new Error('Chá»‰ cÃ³ thá»ƒ xÃ³a chi tiáº¿t khi phiáº¿u á»Ÿ tráº¡ng thÃ¡i NhÃ¡p')
    }

    // XÃ³a lÃ´ hÃ ng liÃªn quan (náº¿u cÃ³)
    if (detail.batch_id) {
      await supabase
        .from('stock_batches')
        .delete()
        .eq('id', detail.batch_id)
    }

    // XÃ³a chi tiáº¿t
    const { error: deleteErr } = await supabase
      .from('stock_in_details')
      .delete()
      .eq('id', detailId)

    if (deleteErr) throw deleteErr

    // Cáº­p nháº­t tá»•ng
    await this._recalculateTotals(detail.stock_in_id)
  },

  // --------------------------------------------------------------------------
  // UPDATE DETAIL â€” Sá»­a sá»‘ lÆ°á»£ng / vá»‹ trÃ­ (chá»‰ khi draft)
  // --------------------------------------------------------------------------
  async updateDetail(
    detailId: string,
    data: Partial<StockInDetailFormData>
  ): Promise<StockInDetail> {
    // Láº¥y detail hiá»‡n táº¡i
    const { data: existing, error: fetchErr } = await supabase
      .from('stock_in_details')
      .select('id, stock_in_id, batch_id')
      .eq('id', detailId)
      .single()

    if (fetchErr) throw fetchErr
    if (!existing) throw new Error('KhÃ´ng tÃ¬m tháº¥y chi tiáº¿t')

    // Kiá»ƒm tra phiáº¿u draft
    const { data: order, error: orderErr } = await supabase
      .from('stock_in_orders')
      .select('status')
      .eq('id', existing.stock_in_id)
      .single()

    if (orderErr) throw orderErr
    if (order?.status !== 'draft') {
      throw new Error('Chá»‰ cÃ³ thá»ƒ sá»­a chi tiáº¿t khi phiáº¿u á»Ÿ tráº¡ng thÃ¡i NhÃ¡p')
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

    // Äá»“ng bá»™ quantity vá» batch náº¿u thay Ä‘á»•i
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

    // Äá»“ng bá»™ location vá» batch
    if (data.location_id !== undefined && existing.batch_id) {
      await supabase
        .from('stock_batches')
        .update({
          location_id: data.location_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.batch_id)
    }

    // Cáº­p nháº­t tá»•ng
    await this._recalculateTotals(existing.stock_in_id)

    return updated as unknown as StockInDetail
  },

  // ==========================================================================
  // BÆ¯á»šC 3.4 â€” XÃC NHáº¬N NHáº¬P KHO
  // ==========================================================================

  // --------------------------------------------------------------------------
  // CONFIRM â€” XÃ¡c nháº­n nháº­p kho â†’ cáº­p nháº­t tá»“n kho, ghi giao dá»‹ch
  // --------------------------------------------------------------------------
  async confirmStockIn(stockInId: string, confirmedBy: string): Promise<StockInOrder> {
    // 1. Validate: phiáº¿u pháº£i á»Ÿ status=draft, cÃ³ Ã­t nháº¥t 1 detail
    const { data: order, error: orderErr } = await supabase
      .from('stock_in_orders')
      .select(`
        id, status, warehouse_id,
        details:stock_in_details(id, material_id, batch_id, location_id, quantity, weight)
      `)
      .eq('id', stockInId)
      .single()

    if (orderErr) throw orderErr
    if (!order) throw new Error('KhÃ´ng tÃ¬m tháº¥y phiáº¿u nháº­p kho')
    if (order.status !== 'draft') {
      throw new Error('Chá»‰ cÃ³ thá»ƒ xÃ¡c nháº­n phiáº¿u á»Ÿ tráº¡ng thÃ¡i NhÃ¡p')
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
      throw new Error('Phiáº¿u pháº£i cÃ³ Ã­t nháº¥t 1 chi tiáº¿t trÆ°á»›c khi xÃ¡c nháº­n')
    }

    // 2. Update header â†’ confirmed
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

    // 3. Vá»›i Má»–I detail â†’ cáº­p nháº­t tá»“n kho
    for (const detail of details) {
      // 3a. Upsert stock_levels: tÄƒng quantity
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
          notes: `Nháº­p kho tá»« phiáº¿u ${order.id}`,
          created_by: confirmedBy,
        })

      // 3c. Update warehouse_locations.current_quantity
      if (detail.location_id) {
        await this._increaseLocationQuantity(detail.location_id, detail.quantity)
      }

      // 3d. Update stock_batches.status = 'active' (Ä‘áº£m báº£o)
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

    // 4. TÃ­nh total_quantity, total_weight â†’ update header
    await this._recalculateTotals(stockInId)

    // 5. Return phiáº¿u Ä‘Ã£ xÃ¡c nháº­n
    const confirmed = await this.getById(stockInId)
    if (!confirmed) throw new Error('KhÃ´ng thá»ƒ táº£i phiáº¿u sau khi xÃ¡c nháº­n')
    return confirmed
  },

  // --------------------------------------------------------------------------
  // CANCEL â€” Há»§y phiáº¿u (chá»‰ draft)
  // --------------------------------------------------------------------------
  async cancelStockIn(stockInId: string): Promise<StockInOrder> {
    const { data: order, error: fetchErr } = await supabase
      .from('stock_in_orders')
      .select('id, status')
      .eq('id', stockInId)
      .single()

    if (fetchErr) throw fetchErr
    if (!order) throw new Error('KhÃ´ng tÃ¬m tháº¥y phiáº¿u nháº­p kho')
    if (order.status !== 'draft') {
      throw new Error('Chá»‰ cÃ³ thá»ƒ há»§y phiáº¿u á»Ÿ tráº¡ng thÃ¡i NhÃ¡p')
    }

    // XÃ³a cÃ¡c lÃ´ liÃªn quan (chÆ°a active)
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
  // PRIVATE HELPERS
  // ==========================================================================

  // --------------------------------------------------------------------------
  // TÃ­nh láº¡i tá»•ng quantity / weight cá»§a phiáº¿u
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
  // Upsert stock_levels: tÄƒng quantity cho material + warehouse
  // --------------------------------------------------------------------------
  async _upsertStockLevel(
    materialId: string,
    warehouseId: string,
    quantityDelta: number
  ): Promise<void> {
    // Thá»­ tÃ¬m record hiá»‡n táº¡i
    const { data: existing } = await supabase
      .from('stock_levels')
      .select('id, quantity')
      .eq('material_id', materialId)
      .eq('warehouse_id', warehouseId)
      .maybeSingle()

    if (existing) {
      // Update: tÄƒng quantity
      await supabase
        .from('stock_levels')
        .update({
          quantity: existing.quantity + quantityDelta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      // Insert má»›i
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
  // TÄƒng current_quantity cá»§a warehouse_location
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

    if (fetchErr || !loc) return // Bá» qua náº¿u khÃ´ng tÃ¬m tháº¥y

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
} = stockInService

export default stockInService