// ============================================================================
// SALES PRODUCTION SERVICE — Lien ket Don hang ban voi Lenh san xuat
// File: src/services/sales/salesProductionService.ts
// Module: Ban hang quoc te + San xuat — Huy Anh Rubber ERP
// Primary color: #1B4D3E
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface NvlAvailability {
  grade: string
  required_kg: number          // Can bao nhieu NVL (tinh tu yield)
  available_kg: number         // NVL kha dung trong kho
  suitable_batches: Array<{
    batch_id: string
    batch_no: string
    weight_kg: number
    drc: number
    qc_status: string
    warehouse_name: string
    days_in_stock: number
  }>
  is_sufficient: boolean       // Du NVL khong?
  shortage_kg: number          // Thieu bao nhieu
}

export interface ProductionPlan {
  sales_order_id: string
  target_grade: string
  target_quantity_kg: number
  estimated_yield: number      // % tu production_material_specs
  required_nvl_kg: number      // = target / yield
  recommended_batches: Array<{
    batch_id: string
    batch_no: string
    weight_kg: number
    drc: number
  }>
}

export interface ProductionProgress {
  production_order: any | null
  stages: Array<{
    number: number
    name: string
    status: string
    started_at: string | null
    completed_at: string | null
  }>
  overall_progress: number  // 0-100%
  is_completed: boolean
}

// ============================================================================
// STAGE NAMES
// ============================================================================

const STAGE_NAMES: Record<number, string> = {
  1: 'Rửa',
  2: 'Tán/Kéo',
  3: 'Sấy',
  4: 'Ép',
  5: 'Đóng gói',
}

// ============================================================================
// SERVICE
// ============================================================================

export const salesProductionService = {

  // --------------------------------------------------------------------------
  // CHECK NVL AVAILABILITY
  // 1. Get grade from sales order
  // 2. Get expected yield from production_material_specs for that grade
  // 3. Calculate required NVL = order.quantity_kg / (yield / 100)
  // 4. Find suitable batches: status='active', qc_status='passed',
  //    DRC within optimal range from production_material_specs
  // 5. Sort by received_date ASC (FIFO)
  // --------------------------------------------------------------------------

  async checkNvlAvailability(salesOrderId: string): Promise<NvlAvailability> {
    // 1. Get sales order
    const { data: order, error: orderErr } = await supabase
      .from('sales_orders')
      .select('id, grade, quantity_kg, quantity_tons, drc_min, drc_max')
      .eq('id', salesOrderId)
      .single()

    if (orderErr || !order) {
      throw new Error('Không tìm thấy đơn hàng')
    }

    const grade = order.grade
    const targetKg = order.quantity_kg || (order.quantity_tons * 1000)

    // 2. Get material spec for yield estimation
    const { data: spec } = await supabase
      .from('production_material_specs')
      .select('expected_yield_percent, optimal_input_drc_min, optimal_input_drc_max')
      .eq('target_product_grade', grade)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    const yieldPercent = spec?.expected_yield_percent || 85
    const optimalDrcMin = spec?.optimal_input_drc_min || 50
    const optimalDrcMax = spec?.optimal_input_drc_max || 80

    // 3. Calculate required NVL
    const requiredKg = Math.ceil(targetKg / (yieldPercent / 100))

    // 4. Find suitable batches
    let batchQuery = supabase
      .from('stock_batches')
      .select(`
        id,
        batch_no,
        quantity_remaining,
        latest_drc,
        initial_drc,
        qc_status,
        received_date,
        warehouse:warehouses(name)
      `)
      .eq('status', 'active')
      .eq('qc_status', 'passed')
      .gt('quantity_remaining', 0)
      .gte('latest_drc', optimalDrcMin)
      .lte('latest_drc', optimalDrcMax)
      .order('received_date', { ascending: true })

    const { data: batches, error: batchErr } = await batchQuery

    if (batchErr) {
      throw new Error(`Không thể tải danh sách lô hàng: ${batchErr.message}`)
    }

    const now = new Date()
    const suitableBatches = (batches || []).map((b: any) => {
      const receivedDate = b.received_date ? new Date(b.received_date) : now
      const daysInStock = Math.floor((now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24))

      return {
        batch_id: b.id,
        batch_no: b.batch_no,
        weight_kg: b.quantity_remaining || 0,
        drc: b.latest_drc || b.initial_drc || 0,
        qc_status: b.qc_status,
        warehouse_name: b.warehouse?.name || 'N/A',
        days_in_stock: daysInStock,
      }
    })

    const availableKg = suitableBatches.reduce((sum, b) => sum + b.weight_kg, 0)
    const shortageKg = Math.max(0, requiredKg - availableKg)

    return {
      grade,
      required_kg: requiredKg,
      available_kg: availableKg,
      suitable_batches: suitableBatches,
      is_sufficient: availableKg >= requiredKg,
      shortage_kg: shortageKg,
    }
  },

  // --------------------------------------------------------------------------
  // CREATE PRODUCTION ORDER FROM SALES ORDER
  // --------------------------------------------------------------------------

  async createProductionFromSalesOrder(
    salesOrderId: string,
    selectedBatchIds?: string[],
  ): Promise<any> {
    // 1. Get sales order with customer info
    const { data: order, error: orderErr } = await supabase
      .from('sales_orders')
      .select(`
        *,
        customer:sales_customers!customer_id(id, code, name)
      `)
      .eq('id', salesOrderId)
      .single()

    if (orderErr || !order) {
      throw new Error('Không tìm thấy đơn hàng')
    }

    if (order.production_order_id) {
      throw new Error('Đơn hàng đã có lệnh sản xuất')
    }

    // 2. Check NVL availability
    const nvl = await salesProductionService.checkNvlAvailability(salesOrderId)

    // Determine which batches to use
    let batchesToUse = nvl.suitable_batches
    if (selectedBatchIds && selectedBatchIds.length > 0) {
      batchesToUse = nvl.suitable_batches.filter(b =>
        selectedBatchIds.includes(b.batch_id)
      )
    }

    // 3. Generate production order code
    const timestamp = Date.now().toString(36).toUpperCase()
    const code = `LSX-SO-${timestamp}`

    // 4. Create production order
    const { data: prodOrder, error: poErr } = await supabase
      .from('production_orders')
      .insert({
        code,
        product_type: order.grade,
        target_quantity: order.quantity_kg || (order.quantity_tons * 1000),
        target_grade: order.grade,
        target_drc_min: order.drc_min || null,
        target_drc_max: order.drc_max || null,
        notes: `Sản xuất cho đơn hàng ${order.code} — KH: ${(order as any).customer?.name || 'N/A'}`,
        status: 'draft',
      })
      .select('*')
      .single()

    if (poErr || !prodOrder) {
      throw new Error(`Không thể tạo lệnh sản xuất: ${poErr?.message}`)
    }

    // 5. Add production order items from batches
    if (batchesToUse.length > 0) {
      const targetKg = order.quantity_kg || (order.quantity_tons * 1000)
      let remainingNeeded = nvl.required_kg
      const itemsToInsert = []

      for (const batch of batchesToUse) {
        if (remainingNeeded <= 0) break
        const allocateKg = Math.min(batch.weight_kg, remainingNeeded)
        itemsToInsert.push({
          production_order_id: prodOrder.id,
          source_batch_id: batch.batch_id,
          required_quantity: allocateKg,
          allocated_quantity: allocateKg,
        })
        remainingNeeded -= allocateKg
      }

      if (itemsToInsert.length > 0) {
        const { error: itemsErr } = await supabase
          .from('production_order_items')
          .insert(itemsToInsert)

        if (itemsErr) {
          console.error('Lỗi thêm NVL vào lệnh SX:', itemsErr)
        }
      }
    }

    // 6. Update sales order with production_order_id and status
    const { error: updateErr } = await supabase
      .from('sales_orders')
      .update({
        production_order_id: prodOrder.id,
        status: 'producing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', salesOrderId)

    if (updateErr) {
      throw new Error(`Không thể cập nhật đơn hàng: ${updateErr.message}`)
    }

    return prodOrder
  },

  // --------------------------------------------------------------------------
  // GET PRODUCTION PROGRESS
  // --------------------------------------------------------------------------

  async getProductionProgress(salesOrderId: string): Promise<ProductionProgress | null> {
    // Get sales order
    const { data: order, error: orderErr } = await supabase
      .from('sales_orders')
      .select('id, production_order_id, status')
      .eq('id', salesOrderId)
      .single()

    if (orderErr || !order || !order.production_order_id) {
      return null
    }

    // Get production order
    const { data: prodOrder, error: poErr } = await supabase
      .from('production_orders')
      .select('*')
      .eq('id', order.production_order_id)
      .single()

    if (poErr || !prodOrder) {
      return null
    }

    // Get stages
    const { data: stageData } = await supabase
      .from('production_stage_progress')
      .select('*')
      .eq('production_order_id', order.production_order_id)
      .order('stage_number', { ascending: true })

    const stages = (stageData || []).map((s: any) => ({
      number: s.stage_number,
      name: STAGE_NAMES[s.stage_number] || `Công đoạn ${s.stage_number}`,
      status: s.status,
      started_at: s.started_at,
      completed_at: s.completed_at,
    }))

    // If no stage records yet, return default 5 stages
    if (stages.length === 0) {
      for (let i = 1; i <= 5; i++) {
        stages.push({
          number: i,
          name: STAGE_NAMES[i],
          status: 'pending',
          started_at: null,
          completed_at: null,
        })
      }
    }

    // Calculate overall progress
    const totalStages = 5
    const completedStages = stages.filter((s: any) => s.status === 'completed').length
    const inProgressStages = stages.filter((s: any) => s.status === 'in_progress').length

    let overallProgress = Math.round(
      ((completedStages + inProgressStages * 0.5) / totalStages) * 100
    )

    const isCompleted = prodOrder.status === 'completed'
    if (isCompleted) overallProgress = 100

    return {
      production_order: prodOrder,
      stages,
      overall_progress: overallProgress,
      is_completed: isCompleted,
    }
  },

  // --------------------------------------------------------------------------
  // CHECK AND UPDATE STATUS
  // --------------------------------------------------------------------------

  async checkAndUpdateStatus(salesOrderId: string): Promise<void> {
    const progress = await salesProductionService.getProductionProgress(salesOrderId)
    if (!progress) return

    if (progress.is_completed) {
      // Auto-update sales order to 'ready'
      const { data: order } = await supabase
        .from('sales_orders')
        .select('id, status')
        .eq('id', salesOrderId)
        .single()

      if (order && order.status === 'producing') {
        await supabase
          .from('sales_orders')
          .update({
            status: 'ready',
            updated_at: new Date().toISOString(),
          })
          .eq('id', salesOrderId)
      }
    }
  },
}

export default salesProductionService
