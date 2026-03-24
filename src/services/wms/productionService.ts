// ============================================================================
// PRODUCTION SERVICE
// File: src/services/wms/productionService.ts
// Module: Kho Thành Phẩm (WMS) - Huy Anh Rubber ERP
// Phase: P8 - Lệnh sản xuất
// Mô tả: Quản lý lệnh sản xuất, công đoạn, output batches, QC
// Bảng: production_orders, production_order_items, production_stage_progress,
//       production_output_batches, production_qc_results,
//       production_facilities, production_material_specs
// ============================================================================

import { supabase } from '../../lib/supabase'
import { rubberGradeService } from './rubberGradeService'
import { STAGE_NAMES } from './wms.types'
import type {
  ProductionOrder,
  ProductionOrderItem,
  ProductionStageProgress,
  ProductionOutputBatch,
  ProductionQCResult,
  ProductionFacility,
  ProductionMaterialSpec,
  ProductionOrderFormData,
  ProductionStatus,
  StageStatus,
  WMSPaginationParams,
  PaginatedResponse,
} from './wms.types'

// ============================================================================
// CONSTANTS
// ============================================================================

const PRODUCTION_ORDER_SELECT = `
  *,
  facility:production_facilities(id, code, name, max_batch_size_kg, is_active),
  items:production_order_items(
    *,
    source_batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status, quantity_remaining)
  ),
  stages:production_stage_progress(*),
  output_batches:production_output_batches(
    *,
    stock_batch:stock_batches(id, batch_no),
    material:materials(id, sku, name),
    qc_results:production_qc_results(*)
  )
`

const PRODUCTION_ORDER_LIST_SELECT = `
  id, code, product_type, target_quantity, actual_quantity, yield_percent,
  target_grade, status, stage_current, stage_status,
  scheduled_start_date, actual_start_date, actual_end_date,
  final_grade, final_drc, notes,
  created_by, created_at, updated_at,
  facility:production_facilities(id, code, name)
`

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Tự sinh mã lệnh sản xuất: PO-{GRADE}-{YYYYMMDD}-{SEQ}
 * VD: PO-SVR10-20260317-001
 */
async function generateCode(grade: string): Promise<string> {
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const gradeClean = grade.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const prefix = `PO-${gradeClean}-${yyyy}${mm}${dd}`

  const { data, error } = await supabase
    .from('production_orders')
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

export const productionService = {

  // --------------------------------------------------------------------------
  // CODE GENERATION
  // --------------------------------------------------------------------------
  generateCode,

  // --------------------------------------------------------------------------
  // CRUD
  // --------------------------------------------------------------------------

  async create(data: ProductionOrderFormData, createdBy?: string): Promise<ProductionOrder> {
    const code = await generateCode(data.target_grade || data.product_type)

    const insertData = {
      code,
      product_type: data.product_type,
      target_quantity: data.target_quantity,
      target_grade: data.target_grade || null,
      target_drc_min: data.target_drc_min || null,
      target_drc_max: data.target_drc_max || null,
      facility_id: data.facility_id || null,
      supervisor_id: data.supervisor_id || null,
      scheduled_start_date: data.scheduled_start_date || null,
      notes: data.notes || null,
      status: 'draft' as ProductionStatus,
      created_by: createdBy || null,
    }

    const { data: order, error } = await supabase
      .from('production_orders')
      .insert(insertData)
      .select(PRODUCTION_ORDER_SELECT)
      .single()

    if (error) throw error
    return order as unknown as ProductionOrder
  },

  async getById(id: string): Promise<ProductionOrder | null> {
    const { data, error } = await supabase
      .from('production_orders')
      .select(PRODUCTION_ORDER_SELECT)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return data as unknown as ProductionOrder
  },

  async getAll(params?: WMSPaginationParams): Promise<PaginatedResponse<ProductionOrder>> {
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
      .from('production_orders')
      .select(PRODUCTION_ORDER_LIST_SELECT, { count: 'exact' })

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
      data: (data || []) as unknown as ProductionOrder[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  },

  async update(id: string, data: Partial<ProductionOrder>): Promise<ProductionOrder> {
    const { data: updated, error } = await supabase
      .from('production_orders')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(PRODUCTION_ORDER_SELECT)
      .single()

    if (error) throw error
    return updated as unknown as ProductionOrder
  },

  // --------------------------------------------------------------------------
  // INPUT BATCH MANAGEMENT
  // --------------------------------------------------------------------------

  async addInputBatch(poId: string, batchId: string, quantity: number): Promise<ProductionOrderItem> {
    const insertData = {
      production_order_id: poId,
      source_batch_id: batchId,
      required_quantity: quantity,
      allocated_quantity: quantity,
    }

    const { data, error } = await supabase
      .from('production_order_items')
      .insert(insertData)
      .select(`
        *,
        source_batch:stock_batches(id, batch_no, initial_drc, latest_drc, qc_status, quantity_remaining)
      `)
      .single()

    if (error) throw error
    return data as unknown as ProductionOrderItem
  },

  async removeInputBatch(itemId: string): Promise<void> {
    const { error } = await supabase
      .from('production_order_items')
      .delete()
      .eq('id', itemId)

    if (error) throw error
  },

  // --------------------------------------------------------------------------
  // PRODUCTION WORKFLOW
  // --------------------------------------------------------------------------

  async startProduction(poId: string): Promise<ProductionOrder> {
    // 1. Validate order exists and is draft/scheduled
    const { data: order, error: fetchErr } = await supabase
      .from('production_orders')
      .select('id, status')
      .eq('id', poId)
      .single()

    if (fetchErr) throw fetchErr
    if (!order) throw new Error('Không tìm thấy lệnh sản xuất')
    if (order.status !== 'draft' && order.status !== 'scheduled') {
      throw new Error('Chỉ có thể bắt đầu khi lệnh ở trạng thái Nhập hoặc Đã lên lịch')
    }

    const now = new Date().toISOString()

    // 2. Create 5 stage records
    const stageRecords = []
    for (let i = 1; i <= 5; i++) {
      stageRecords.push({
        production_order_id: poId,
        stage_number: i,
        stage_name: STAGE_NAMES[i],
        status: (i === 1 ? 'in_progress' : 'pending') as StageStatus,
        started_at: i === 1 ? now : null,
      })
    }

    const { error: stageErr } = await supabase
      .from('production_stage_progress')
      .insert(stageRecords)

    if (stageErr) throw stageErr

    // 3. Update order status
    const { data: updated, error: updateErr } = await supabase
      .from('production_orders')
      .update({
        status: 'in_progress' as ProductionStatus,
        stage_current: 1,
        stage_status: 'in_progress',
        actual_start_date: now,
        updated_at: now,
      })
      .eq('id', poId)
      .select(PRODUCTION_ORDER_SELECT)
      .single()

    if (updateErr) throw updateErr
    return updated as unknown as ProductionOrder
  },

  async completeStage(poId: string, stageNumber: number, data: {
    input_quantity?: number
    output_quantity?: number
    input_drc?: number
    output_drc?: number
    temperature_avg?: number
    humidity_avg?: number
    operator_id?: string
    qc_checkpoint_passed?: boolean
    qc_notes?: string
    notes?: string
  }): Promise<ProductionStageProgress> {
    const now = new Date().toISOString()

    // Calculate weight_loss_kg and drc_change
    let weight_loss_kg: number | null = null
    let drc_change: number | null = null

    if (data.input_quantity != null && data.output_quantity != null) {
      weight_loss_kg = Math.round((data.input_quantity - data.output_quantity) * 100) / 100
    }

    if (data.input_drc != null && data.output_drc != null) {
      drc_change = Math.round((data.output_drc - data.input_drc) * 100) / 100
    }

    // Calculate duration_hours from started_at
    const { data: stage, error: fetchErr } = await supabase
      .from('production_stage_progress')
      .select('id, started_at')
      .eq('production_order_id', poId)
      .eq('stage_number', stageNumber)
      .single()

    if (fetchErr) throw fetchErr
    if (!stage) throw new Error(`Không tìm thấy công đoạn ${stageNumber}`)

    let duration_hours: number | null = null
    if (stage.started_at) {
      const startTime = new Date(stage.started_at).getTime()
      const endTime = new Date(now).getTime()
      duration_hours = Math.round(((endTime - startTime) / (1000 * 60 * 60)) * 100) / 100
    }

    // Update stage record
    const { data: updated, error: updateErr } = await supabase
      .from('production_stage_progress')
      .update({
        status: 'completed' as StageStatus,
        completed_at: now,
        duration_hours,
        input_quantity: data.input_quantity ?? null,
        output_quantity: data.output_quantity ?? null,
        weight_loss_kg,
        input_drc: data.input_drc ?? null,
        output_drc: data.output_drc ?? null,
        drc_change,
        temperature_avg: data.temperature_avg ?? null,
        humidity_avg: data.humidity_avg ?? null,
        operator_id: data.operator_id ?? null,
        qc_checkpoint_passed: data.qc_checkpoint_passed ?? null,
        qc_notes: data.qc_notes ?? null,
        notes: data.notes ?? null,
      })
      .eq('id', stage.id)
      .select('*')
      .single()

    if (updateErr) throw updateErr

    // Advance stage_current on the production order
    const nextStage = stageNumber + 1
    if (nextStage <= 5) {
      // Start next stage
      await supabase
        .from('production_stage_progress')
        .update({
          status: 'in_progress' as StageStatus,
          started_at: now,
        })
        .eq('production_order_id', poId)
        .eq('stage_number', nextStage)

      await supabase
        .from('production_orders')
        .update({
          stage_current: nextStage,
          stage_status: 'in_progress',
          updated_at: now,
        })
        .eq('id', poId)
    } else {
      // All stages completed
      await supabase
        .from('production_orders')
        .update({
          stage_current: 5,
          stage_status: 'completed',
          updated_at: now,
        })
        .eq('id', poId)
    }

    return updated as unknown as ProductionStageProgress
  },

  async completeProduction(poId: string, data: {
    actual_quantity: number
    final_grade: string
    final_drc: number
  }): Promise<ProductionOrder> {
    const now = new Date().toISOString()

    // Calculate yield_percent from total input
    const { data: items, error: itemsErr } = await supabase
      .from('production_order_items')
      .select('required_quantity')
      .eq('production_order_id', poId)

    if (itemsErr) throw itemsErr

    const totalInput = (items || []).reduce((sum, item) => sum + (item.required_quantity || 0), 0)
    const yield_percent = totalInput > 0
      ? Math.round((data.actual_quantity / totalInput) * 10000) / 100
      : null

    const { data: updated, error } = await supabase
      .from('production_orders')
      .update({
        status: 'completed' as ProductionStatus,
        actual_quantity: data.actual_quantity,
        final_grade: data.final_grade,
        final_drc: data.final_drc,
        yield_percent,
        actual_end_date: now,
        updated_at: now,
      })
      .eq('id', poId)
      .select(PRODUCTION_ORDER_SELECT)
      .single()

    if (error) throw error
    return updated as unknown as ProductionOrder
  },

  async cancelProduction(poId: string, reason?: string): Promise<ProductionOrder> {
    const now = new Date().toISOString()

    const { data: updated, error } = await supabase
      .from('production_orders')
      .update({
        status: 'cancelled' as ProductionStatus,
        notes: reason || null,
        updated_at: now,
      })
      .eq('id', poId)
      .select(PRODUCTION_ORDER_SELECT)
      .single()

    if (error) throw error
    return updated as unknown as ProductionOrder
  },

  // --------------------------------------------------------------------------
  // OUTPUT BATCHES
  // --------------------------------------------------------------------------

  async createOutputBatch(poId: string, data: {
    material_id: string
    quantity_produced: number
    final_grade?: string
    final_drc?: number
    warehouse_id?: string
    location_id?: string
  }): Promise<ProductionOutputBatch> {
    const insertData = {
      production_order_id: poId,
      material_id: data.material_id,
      quantity_produced: data.quantity_produced,
      final_grade: data.final_grade || null,
      final_drc: data.final_drc || null,
      warehouse_id: data.warehouse_id || null,
      location_id: data.location_id || null,
      bale_count: Math.floor(data.quantity_produced / 33.33),
      status: 'created' as const,
    }

    const { data: batch, error } = await supabase
      .from('production_output_batches')
      .insert(insertData)
      .select(`
        *,
        stock_batch:stock_batches(id, batch_no),
        material:materials(id, sku, name),
        qc_results:production_qc_results(*)
      `)
      .single()

    if (error) throw error
    return batch as unknown as ProductionOutputBatch
  },

  async recordOutputQC(outputBatchId: string, data: {
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
  }): Promise<ProductionQCResult> {
    // Determine grade from DRC
    let grade_determined: string | null = null
    let grade_meets_target: boolean | null = null

    if (data.drc_value != null) {
      grade_determined = rubberGradeService.classifyByDRC(data.drc_value)

      // Check if grade meets target from production order
      const { data: outputBatch } = await supabase
        .from('production_output_batches')
        .select('production_order_id, final_grade')
        .eq('id', outputBatchId)
        .single()

      if (outputBatch) {
        const { data: po } = await supabase
          .from('production_orders')
          .select('target_grade')
          .eq('id', outputBatch.production_order_id)
          .single()

        if (po?.target_grade) {
          grade_meets_target = grade_determined === po.target_grade
        }
      }
    }

    // Determine result based on grade match and QC values
    let result: 'passed' | 'warning' | 'failed'
    if (grade_meets_target === false) {
      result = 'warning'
    } else if (data.moisture_content != null && data.moisture_content > 0.8) {
      result = 'failed'
    } else {
      result = 'passed'
    }

    const now = new Date().toISOString()

    const insertData = {
      output_batch_id: outputBatchId,
      drc_value: data.drc_value ?? null,
      moisture_content: data.moisture_content ?? null,
      volatile_matter: data.volatile_matter ?? null,
      ash_content: data.ash_content ?? null,
      nitrogen_content: data.nitrogen_content ?? null,
      dirt_content: data.dirt_content ?? null,
      pri_value: data.pri_value ?? null,
      mooney_value: data.mooney_value ?? null,
      color_lovibond: data.color_lovibond ?? null,
      metal_content: data.metal_content ?? null,
      grade_determined,
      grade_meets_target,
      result,
      tester_id: data.tester_id ?? null,
      tested_at: now,
      notes: data.notes ?? null,
    }

    const { data: qcResult, error } = await supabase
      .from('production_qc_results')
      .insert(insertData)
      .select('*')
      .single()

    if (error) throw error

    // Update output batch status based on QC result
    const newStatus = result === 'failed' ? 'qc_failed' : 'qc_passed'
    await supabase
      .from('production_output_batches')
      .update({
        status: newStatus,
        final_grade: grade_determined || undefined,
        final_drc: data.drc_value || undefined,
        final_moisture: data.moisture_content || undefined,
        updated_at: now,
      })
      .eq('id', outputBatchId)

    return qcResult as unknown as ProductionQCResult
  },

  // --------------------------------------------------------------------------
  // QUERIES
  // --------------------------------------------------------------------------

  async getStages(poId: string): Promise<ProductionStageProgress[]> {
    const { data, error } = await supabase
      .from('production_stage_progress')
      .select('*')
      .eq('production_order_id', poId)
      .order('stage_number', { ascending: true })

    if (error) throw error
    return (data || []) as unknown as ProductionStageProgress[]
  },

  async getOutputBatches(poId: string): Promise<ProductionOutputBatch[]> {
    const { data, error } = await supabase
      .from('production_output_batches')
      .select(`
        *,
        stock_batch:stock_batches(id, batch_no),
        material:materials(id, sku, name),
        qc_results:production_qc_results(*)
      `)
      .eq('production_order_id', poId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []) as unknown as ProductionOutputBatch[]
  },

  async getInProgress(): Promise<ProductionOrder[]> {
    const { data, error } = await supabase
      .from('production_orders')
      .select(PRODUCTION_ORDER_LIST_SELECT)
      .eq('status', 'in_progress')
      .order('actual_start_date', { ascending: true })

    if (error) throw error
    return (data || []) as unknown as ProductionOrder[]
  },

  async getFacilities(): Promise<ProductionFacility[]> {
    const { data, error } = await supabase
      .from('production_facilities')
      .select('*')
      .eq('is_active', true)
      .order('code', { ascending: true })

    if (error) throw error
    return (data || []) as unknown as ProductionFacility[]
  },

  async getMaterialSpecs(): Promise<ProductionMaterialSpec[]> {
    const { data, error } = await supabase
      .from('production_material_specs')
      .select('*')
      .eq('is_active', true)
      .order('target_product_grade', { ascending: true })

    if (error) throw error
    return (data || []) as unknown as ProductionMaterialSpec[]
  },

  async getSpecByGrade(grade: string): Promise<ProductionMaterialSpec | null> {
    const { data, error } = await supabase
      .from('production_material_specs')
      .select('*')
      .eq('target_product_grade', grade)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data as unknown as ProductionMaterialSpec | null
  },
}

export default productionService
