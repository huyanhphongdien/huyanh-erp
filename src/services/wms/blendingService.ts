// ============================================================================
// BLENDING SERVICE
// File: src/services/wms/blendingService.ts
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
// Phase: P9 - Phối trộn (Blending)
// Mô tả: Quản lý lệnh phối trộn, mô phỏng DRC, QC
// Bảng: blend_orders, blend_order_items, blend_qc_results
// ============================================================================

import { supabase } from '../../lib/supabase'
import { rubberGradeService } from './rubberGradeService'
import { adjustLevelsAndLocation } from './inventorySync'
import type {
  BlendOrder,
  BlendOrderItem,
  BlendQCResult,
  BlendSimulationResult,
  BlendOrderFormData,
  BlendStatus,
  StockBatch,
  WMSPaginationParams,
  PaginatedResponse,
} from './wms.types'

// ============================================================================
// CONSTANTS
// ============================================================================

const BLEND_ORDER_SELECT = `
  *,
  output_batch:stock_batches!blend_orders_output_batch_id_fkey(id, batch_no, initial_drc, latest_drc, rubber_grade, quantity_remaining),
  items:blend_order_items(
    *,
    source_batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status, quantity_remaining, rubber_grade, material:materials(id, sku, name))
  ),
  qc_results:blend_qc_results(*)
`

const BLEND_ORDER_LIST_SELECT = `
  id, code, target_grade, target_drc, target_quantity_kg,
  actual_drc, actual_quantity_kg, result_grade, grade_meets_target,
  simulated_drc, simulated_quantity_kg,
  status, output_batch_id, notes,
  blended_by, blended_at, approved_by, approved_at,
  created_by, created_at, updated_at
`

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Tự sinh mã lệnh phối trộn: BL-{GRADE}-{YYYYMMDD}-{SEQ}
 * VD: BL-SVR10-20260317-001
 */
async function generateCode(grade: string): Promise<string> {
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const gradeClean = grade.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const prefix = `BL-${gradeClean}-${yyyy}${mm}${dd}`

  const { data, error } = await supabase
    .from('blend_orders')
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

export const blendingService = {

  // --------------------------------------------------------------------------
  // CODE GENERATION
  // --------------------------------------------------------------------------
  generateCode,

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  async create(data: BlendOrderFormData, createdBy?: string): Promise<BlendOrder> {
    const code = await generateCode(data.target_grade)

    const insertData = {
      code,
      target_grade: data.target_grade,
      target_drc: data.target_drc,
      target_quantity_kg: data.target_quantity_kg,
      notes: data.notes || null,
      status: 'draft' as BlendStatus,
      created_by: createdBy || null,
    }

    const { data: order, error } = await supabase
      .from('blend_orders')
      .insert(insertData)
      .select(BLEND_ORDER_SELECT)
      .single()

    if (error) throw error
    return order as unknown as BlendOrder
  },

  async getById(id: string): Promise<BlendOrder | null> {
    const { data, error } = await supabase
      .from('blend_orders')
      .select(BLEND_ORDER_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data as unknown as BlendOrder
  },

  async getAll(params?: WMSPaginationParams): Promise<PaginatedResponse<BlendOrder>> {
    const {
      page = 1,
      pageSize = 20,
      search,
      status,
      from_date,
      to_date,
    } = params || { page: 1, pageSize: 20 }

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = supabase
      .from('blend_orders')
      .select(BLEND_ORDER_LIST_SELECT, { count: 'exact' })

    if (status) query = query.eq('status', status)
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
      data: (data || []) as unknown as BlendOrder[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  },

  // --------------------------------------------------------------------------
  // ITEMS
  // --------------------------------------------------------------------------

  async addItem(blendId: string, batchId: string, quantityKg: number): Promise<BlendOrderItem> {
    // Get batch info for denormalized fields
    const { data: batch, error: batchErr } = await supabase
      .from('stock_batches')
      .select('id, batch_no, latest_drc, initial_drc, rubber_grade, material:materials(id, name)')
      .eq('id', batchId)
      .single()

    if (batchErr) throw batchErr

    const batchDrc = batch?.latest_drc || batch?.initial_drc || 0
    const materialData = batch?.material as unknown as { id: string; name: string } | null

    const insertData = {
      blend_order_id: blendId,
      source_batch_id: batchId,
      quantity_kg: quantityKg,
      batch_drc: batchDrc,
      batch_no: batch?.batch_no || null,
      material_name: materialData?.name || null,
      rubber_grade: batch?.rubber_grade || null,
    }

    const { data: item, error } = await supabase
      .from('blend_order_items')
      .insert(insertData)
      .select(`
        *,
        source_batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status, quantity_remaining, rubber_grade, material:materials(id, sku, name))
      `)
      .single()

    if (error) throw error
    return item as unknown as BlendOrderItem
  },

  async removeItem(itemId: string): Promise<void> {
    const { error } = await supabase
      .from('blend_order_items')
      .delete()
      .eq('id', itemId)

    if (error) throw error
  },

  // --------------------------------------------------------------------------
  // SIMULATION (CORE FEATURE)
  // --------------------------------------------------------------------------

  /**
   * Pure function: simulate blending from items without DB
   * simulated_drc = sum(qty_i * drc_i) / sum(qty_i)
   */
  simulateFromItems(
    items: Array<{ quantity_kg: number; drc: number; batch_id: string; batch_no: string; rubber_grade?: string }>,
    targetDrc: number,
    targetGrade: string,
  ): BlendSimulationResult {
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity_kg, 0)

    if (totalQuantity === 0) {
      return {
        items: [],
        total_quantity_kg: 0,
        simulated_drc: 0,
        simulated_grade: '',
        meets_target: false,
        target_drc: targetDrc,
        target_grade: targetGrade,
      }
    }

    const weightedDrcSum = items.reduce((sum, item) => sum + item.quantity_kg * item.drc, 0)
    const simulatedDrc = Math.round((weightedDrcSum / totalQuantity) * 100) / 100

    const simulatedGrade = rubberGradeService.classifyByDRC(simulatedDrc)

    // Determine if meets target: within reasonable tolerance based on grade
    // Use +/- 2% tolerance from target DRC
    const tolerance = 2
    const meetsTarget = simulatedDrc >= (targetDrc - tolerance) && simulatedDrc <= (targetDrc + tolerance)

    const simulatedItems = items.map(item => ({
      batch_id: item.batch_id,
      batch_no: item.batch_no,
      quantity_kg: item.quantity_kg,
      drc: item.drc,
      percentage: Math.round((item.quantity_kg / totalQuantity) * 10000) / 100,
      drc_contribution: Math.round((item.quantity_kg * item.drc / totalQuantity) * 100) / 100,
      rubber_grade: item.rubber_grade,
    }))

    return {
      items: simulatedItems,
      total_quantity_kg: totalQuantity,
      simulated_drc: simulatedDrc,
      simulated_grade: simulatedGrade,
      meets_target: meetsTarget,
      target_drc: targetDrc,
      target_grade: targetGrade,
    }
  },

  /**
   * Simulate from DB: load items, calculate DRC, update blend_order
   */
  async simulate(blendId: string): Promise<BlendSimulationResult> {
    // Load blend order with items
    const { data: order, error: orderErr } = await supabase
      .from('blend_orders')
      .select(`
        id, target_grade, target_drc, target_quantity_kg,
        items:blend_order_items(
          id, source_batch_id, quantity_kg, batch_drc, batch_no, rubber_grade,
          source_batch:stock_batches(id, batch_no, latest_drc, initial_drc, rubber_grade)
        )
      `)
      .eq('id', blendId)
      .single()

    if (orderErr) throw orderErr
    if (!order) throw new Error('Không tìm thấy lệnh phối trộn')

    const items = ((order as any).items || []).map((item: any) => ({
      batch_id: item.source_batch_id,
      batch_no: item.batch_no || item.source_batch?.batch_no || '',
      quantity_kg: item.quantity_kg,
      drc: item.batch_drc || item.source_batch?.latest_drc || item.source_batch?.initial_drc || 0,
      rubber_grade: item.rubber_grade || item.source_batch?.rubber_grade,
    }))

    const result = this.simulateFromItems(items, (order as any).target_drc, (order as any).target_grade)

    // Update blend order with simulation results
    const now = new Date().toISOString()
    const { error: updateErr } = await supabase
      .from('blend_orders')
      .update({
        simulated_drc: result.simulated_drc,
        simulated_quantity_kg: result.total_quantity_kg,
        status: 'simulated' as BlendStatus,
        updated_at: now,
      })
      .eq('id', blendId)

    if (updateErr) throw updateErr

    // Update items with percentage and drc_contribution
    for (const simItem of result.items) {
      await supabase
        .from('blend_order_items')
        .update({
          percentage: simItem.percentage,
          drc_contribution: simItem.drc_contribution,
        })
        .eq('blend_order_id', blendId)
        .eq('source_batch_id', simItem.batch_id)
    }

    return result
  },

  // --------------------------------------------------------------------------
  // WORKFLOW
  // --------------------------------------------------------------------------

  async approve(blendId: string, approvedBy: string): Promise<BlendOrder> {
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('blend_orders')
      .update({
        status: 'approved' as BlendStatus,
        approved_by: approvedBy,
        approved_at: now,
        updated_at: now,
      })
      .eq('id', blendId)
      .select(BLEND_ORDER_SELECT)
      .single()

    if (error) throw error
    return data as unknown as BlendOrder
  },

  async startBlending(blendId: string, blendedBy: string): Promise<BlendOrder> {
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('blend_orders')
      .update({
        status: 'in_progress' as BlendStatus,
        blended_by: blendedBy,
        blended_at: now,
        updated_at: now,
      })
      .eq('id', blendId)
      .select(BLEND_ORDER_SELECT)
      .single()

    if (error) throw error
    return data as unknown as BlendOrder
  },

  async completeBlending(blendId: string, data: {
    actual_quantity_kg: number
    output_warehouse_id: string
    output_location_id?: string
  }): Promise<BlendOrder> {
    // 1. Load blend order with items
    const { data: order, error: orderErr } = await supabase
      .from('blend_orders')
      .select(`
        id, code, target_grade, target_drc, simulated_drc,
        items:blend_order_items(
          id, source_batch_id, quantity_kg, batch_drc,
          source_batch:stock_batches(id, batch_no, material_id, warehouse_id, location_id, latest_drc, initial_drc)
        )
      `)
      .eq('id', blendId)
      .single()

    if (orderErr) throw orderErr
    if (!order) throw new Error('Không tìm thấy lệnh phối trộn')

    const items = (order as any).items || []
    if (items.length === 0) throw new Error('Lệnh phối trộn không có nguyên liệu')

    const now = new Date().toISOString()

    // 2. Calculate actual weighted DRC
    const totalQty = items.reduce((sum: number, item: any) => sum + item.quantity_kg, 0)
    const weightedDrcSum = items.reduce((sum: number, item: any) => {
      const drc = item.batch_drc || item.source_batch?.latest_drc || item.source_batch?.initial_drc || 0
      return sum + item.quantity_kg * drc
    }, 0)
    const actualDrc = totalQty > 0 ? Math.round((weightedDrcSum / totalQty) * 100) / 100 : 0
    const resultGrade = rubberGradeService.classifyByDRC(actualDrc)

    // 3. Reduce source batch quantities
    for (const item of items) {
      const { error: reduceErr } = await supabase.rpc('reduce_batch_quantity', {
        p_batch_id: item.source_batch_id,
        p_quantity: item.quantity_kg,
      }).maybeSingle()

      // If RPC doesn't exist, fallback to manual update
      if (reduceErr) {
        const { data: currentBatch } = await supabase
          .from('stock_batches')
          .select('quantity_remaining')
          .eq('id', item.source_batch_id)
          .single()

        if (currentBatch) {
          const newQty = Math.max(0, currentBatch.quantity_remaining - item.quantity_kg)
          await supabase
            .from('stock_batches')
            .update({
              quantity_remaining: newQty,
              status: newQty === 0 ? 'depleted' : 'active',
              updated_at: now,
            })
            .eq('id', item.source_batch_id)
        }
      }

      // Insert blend_out inventory transaction — dùng warehouse gốc của
      // source batch để stock_levels/kho nguồn bị trừ đúng chỗ (KHÔNG dùng
      // output_warehouse_id — đó là kho đích của lô output mới).
      const srcMaterialId = item.source_batch?.material_id
      const srcWarehouseId = item.source_batch?.warehouse_id
      const srcLocationId = item.source_batch?.location_id || null

      await supabase
        .from('inventory_transactions')
        .insert({
          material_id: srcMaterialId,
          warehouse_id: srcWarehouseId,
          batch_id: item.source_batch_id,
          type: 'blend_out',
          quantity: -item.quantity_kg,
          reference_type: 'blend_order',
          reference_id: blendId,
          notes: `Phối trộn: ${(order as any).code}`,
          created_at: now,
        })

      // Đồng bộ stock_levels + warehouse_locations kho nguồn (xuất)
      await adjustLevelsAndLocation({
        material_id: srcMaterialId,
        warehouse_id: srcWarehouseId,
        location_id: srcLocationId,
        delta_kg: -Number(item.quantity_kg),
      })
    }

    // 4. Create output stock_batch
    // Use material_id from first source batch
    const firstMaterialId = items[0]?.source_batch?.material_id
    const batchNo = `PT-BL-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')}`

    const { data: newBatch, error: batchErr } = await supabase
      .from('stock_batches')
      .insert({
        batch_no: batchNo,
        material_id: firstMaterialId,
        warehouse_id: data.output_warehouse_id,
        location_id: data.output_location_id || null,
        initial_quantity: data.actual_quantity_kg,
        quantity_remaining: data.actual_quantity_kg,
        unit: 'kg',
        initial_drc: actualDrc,
        latest_drc: actualDrc,
        qc_status: 'pending',
        batch_type: 'blend',
        blend_source_order_id: blendId,
        received_date: now.split('T')[0],
        status: 'active',
        rubber_grade: resultGrade,
        dry_weight: rubberGradeService.calculateDryWeight(data.actual_quantity_kg, actualDrc),
        initial_weight: data.actual_quantity_kg,
        current_weight: data.actual_quantity_kg,
        weight_loss: 0,
        contamination_status: 'clean',
        storage_days: 0,
      })
      .select('id, batch_no')
      .single()

    if (batchErr) throw batchErr

    // Insert blend_in inventory transaction
    await supabase
      .from('inventory_transactions')
      .insert({
        material_id: firstMaterialId,
        warehouse_id: data.output_warehouse_id,
        batch_id: newBatch.id,
        type: 'blend_in',
        quantity: data.actual_quantity_kg,
        reference_type: 'blend_order',
        reference_id: blendId,
        notes: `Phối trộn: ${(order as any).code} — lô mới: ${newBatch.batch_no}`,
        created_at: now,
      })

    // Đồng bộ stock_levels + warehouse_locations kho đích (nhập lô output)
    await adjustLevelsAndLocation({
      material_id: firstMaterialId,
      warehouse_id: data.output_warehouse_id,
      location_id: data.output_location_id || null,
      delta_kg: Number(data.actual_quantity_kg),
    })

    // 5. Update blend order
    const tolerance = 2
    const gradeMeetsTarget = actualDrc >= ((order as any).target_drc - tolerance)
      && actualDrc <= ((order as any).target_drc + tolerance)

    const { data: updated, error: updateErr } = await supabase
      .from('blend_orders')
      .update({
        status: 'completed' as BlendStatus,
        actual_drc: actualDrc,
        actual_quantity_kg: data.actual_quantity_kg,
        result_grade: resultGrade,
        grade_meets_target: gradeMeetsTarget,
        output_batch_id: newBatch.id,
        output_warehouse_id: data.output_warehouse_id,
        output_location_id: data.output_location_id || null,
        updated_at: now,
      })
      .eq('id', blendId)
      .select(BLEND_ORDER_SELECT)
      .single()

    if (updateErr) throw updateErr
    return updated as unknown as BlendOrder
  },

  async cancelBlending(blendId: string): Promise<BlendOrder> {
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('blend_orders')
      .update({
        status: 'cancelled' as BlendStatus,
        updated_at: now,
      })
      .eq('id', blendId)
      .select(BLEND_ORDER_SELECT)
      .single()

    if (error) throw error
    return data as unknown as BlendOrder
  },

  // --------------------------------------------------------------------------
  // QC
  // --------------------------------------------------------------------------

  async recordQC(blendId: string, qcData: {
    drc_value?: number
    moisture_content?: number
    volatile_matter?: number
    ash_content?: number
    nitrogen_content?: number
    dirt_content?: number
    pri_value?: number
    mooney_value?: number
    color_lovibond?: number
    metal_content?: number
    tester_id?: string
    notes?: string
  }): Promise<BlendQCResult> {
    // Determine grade from DRC
    let grade_determined: string | null = null
    let grade_meets_target: boolean | null = null

    if (qcData.drc_value != null) {
      grade_determined = rubberGradeService.classifyByDRC(qcData.drc_value)

      // Check against blend target
      const { data: blendOrder } = await supabase
        .from('blend_orders')
        .select('target_grade, target_drc')
        .eq('id', blendId)
        .single()

      if (blendOrder) {
        const tolerance = 2
        grade_meets_target = qcData.drc_value >= (blendOrder.target_drc - tolerance)
          && qcData.drc_value <= (blendOrder.target_drc + tolerance)
      }
    }

    // Determine result
    let result: 'passed' | 'warning' | 'failed'
    if (grade_meets_target === false) {
      result = 'warning'
    } else if (qcData.moisture_content != null && qcData.moisture_content > 0.8) {
      result = 'failed'
    } else {
      result = 'passed'
    }

    const now = new Date().toISOString()

    const insertData = {
      blend_order_id: blendId,
      drc_value: qcData.drc_value ?? null,
      moisture_content: qcData.moisture_content ?? null,
      volatile_matter: qcData.volatile_matter ?? null,
      ash_content: qcData.ash_content ?? null,
      nitrogen_content: qcData.nitrogen_content ?? null,
      dirt_content: qcData.dirt_content ?? null,
      pri_value: qcData.pri_value ?? null,
      mooney_value: qcData.mooney_value ?? null,
      color_lovibond: qcData.color_lovibond ?? null,
      metal_content: qcData.metal_content ?? null,
      grade_determined,
      grade_meets_target,
      result,
      tester_id: qcData.tester_id ?? null,
      tested_at: now,
      notes: qcData.notes ?? null,
    }

    const { data: qcResult, error } = await supabase
      .from('blend_qc_results')
      .insert(insertData)
      .select('*')
      .single()

    if (error) throw error

    // Update blend order with QC result
    if (qcData.drc_value != null) {
      await supabase
        .from('blend_orders')
        .update({
          actual_drc: qcData.drc_value,
          result_grade: grade_determined,
          grade_meets_target,
          updated_at: now,
        })
        .eq('id', blendId)
    }

    return qcResult as unknown as BlendQCResult
  },

  // --------------------------------------------------------------------------
  // QUERIES
  // --------------------------------------------------------------------------

  /**
   * Get batches that need blending (qc_status='needs_blend' or active batches)
   */
  async getBatchesNeedingBlend(): Promise<StockBatch[]> {
    const { data, error } = await supabase
      .from('stock_batches')
      .select(`
        id, batch_no, material_id, warehouse_id,
        initial_quantity, quantity_remaining, unit,
        initial_drc, latest_drc, qc_status,
        batch_type, rubber_grade, rubber_type,
        supplier_name, status,
        created_at, updated_at,
        material:materials(id, sku, name)
      `)
      .eq('status', 'active')
      .gt('quantity_remaining', 0)
      .in('qc_status', ['needs_blend', 'passed', 'warning', 'pending'])
      .order('qc_status', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []) as unknown as StockBatch[]
  },

  /**
   * Suggest partner batches for blending to reach target DRC
   * For a given batch, find other batches that when blended would reach targetDrc
   */
  async getSuggestedBlends(batchId: string, targetDrc: number): Promise<Array<{
    partner_batch_id: string
    partner_batch_no: string
    partner_drc: number
    suggested_ratio: number
    expected_result_drc: number
  }>> {
    // Get the source batch
    const { data: sourceBatch, error: srcErr } = await supabase
      .from('stock_batches')
      .select('id, batch_no, latest_drc, initial_drc, quantity_remaining')
      .eq('id', batchId)
      .single()

    if (srcErr) throw srcErr
    if (!sourceBatch) throw new Error('Không tìm thấy lô')

    const sourceDrc = sourceBatch.latest_drc || sourceBatch.initial_drc || 0

    // Get all active batches with DRC info (exclude source batch)
    const { data: candidates, error: candErr } = await supabase
      .from('stock_batches')
      .select('id, batch_no, latest_drc, initial_drc, quantity_remaining')
      .eq('status', 'active')
      .gt('quantity_remaining', 0)
      .neq('id', batchId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (candErr) throw candErr

    const suggestions: Array<{
      partner_batch_id: string
      partner_batch_no: string
      partner_drc: number
      suggested_ratio: number
      expected_result_drc: number
    }> = []

    for (const candidate of (candidates || [])) {
      const partnerDrc = candidate.latest_drc || candidate.initial_drc || 0
      if (partnerDrc === 0) continue

      // Calculate ratio: (targetDrc - partnerDrc) / (sourceDrc - partnerDrc)
      // source_ratio * sourceDrc + partner_ratio * partnerDrc = targetDrc
      // where source_ratio + partner_ratio = 1
      // source_ratio = (targetDrc - partnerDrc) / (sourceDrc - partnerDrc)
      const drcDiff = sourceDrc - partnerDrc
      if (Math.abs(drcDiff) < 0.01) continue // same DRC, skip

      const sourceRatio = (targetDrc - partnerDrc) / drcDiff
      if (sourceRatio <= 0 || sourceRatio >= 1) continue // impossible blend

      const partnerRatio = 1 - sourceRatio
      const expectedDrc = Math.round((sourceRatio * sourceDrc + partnerRatio * partnerDrc) * 100) / 100

      suggestions.push({
        partner_batch_id: candidate.id,
        partner_batch_no: candidate.batch_no,
        partner_drc: partnerDrc,
        suggested_ratio: Math.round(partnerRatio * 10000) / 100,
        expected_result_drc: expectedDrc,
      })
    }

    // Sort by how close the result DRC is to target
    suggestions.sort((a, b) =>
      Math.abs(a.expected_result_drc - targetDrc) - Math.abs(b.expected_result_drc - targetDrc)
    )

    return suggestions.slice(0, 20)
  },
}

export default blendingService
