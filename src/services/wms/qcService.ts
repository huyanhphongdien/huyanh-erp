// ============================================================================
// FILE: src/services/wms/qcService.ts
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P3 (QC đầu vào) + P6 (QC Tracking & DRC)
// MÔ TẢ: Kiểm tra chất lượng — QC initial, tái kiểm, DRC tracking
// BẢNG: batch_qc_results, material_qc_standards, stock_batches
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  BatchQCResult,
  MaterialQCStandard,
  QCStatus,
  QCResult,
  QCCheckType,
  StockBatch,
} from './wms.types'

// ============================================================================
// TYPES
// ============================================================================

export interface QCEvaluation {
  result: QCResult           // 'passed' | 'warning' | 'failed'
  qc_status: QCStatus       // mapping sang batch qc_status
  message: string            // mô tả kết quả
  next_recheck_days: number  // số ngày đến lần tái kiểm
}

export interface AddQCData {
  batch_id: string
  drc_value: number
  pri_value?: number
  mooney_value?: number
  ash_content?: number
  nitrogen_content?: number
  check_type?: QCCheckType
  tester_id?: string
  notes?: string
}

/** Bước 6A-1: Lô cần tái kiểm (có thêm thông tin join) */
export interface RecheckBatchItem {
  id: string
  batch_no: string
  material_id: string
  material_name: string
  material_sku: string
  warehouse_id?: string
  warehouse_name?: string
  location_id?: string
  location_code?: string
  initial_drc?: number
  latest_drc?: number
  qc_status: QCStatus
  last_qc_date?: string
  next_recheck_date?: string
  days_overdue: number        // số ngày quá hạn (>0 = quá hạn)
  quantity_remaining: number
  unit: string
  received_date: string
}

/** Bước 6A-3: Tổng quan DRC tất cả lô active */
export interface DRCOverviewItem {
  id: string
  batch_no: string
  material_id: string
  material_name: string
  material_sku: string
  warehouse_name?: string
  location_code?: string
  initial_drc?: number
  latest_drc?: number
  qc_status: QCStatus
  last_qc_date?: string
  next_recheck_date?: string
  quantity_remaining: number
  unit: string
  received_date: string
  status: string
}

/** Bước 6A-4: Thống kê QC theo sản phẩm */
export interface QCSummaryByMaterial {
  material_id: string
  material_name: string
  material_sku: string
  total_batches: number
  passed_count: number
  warning_count: number
  needs_blend_count: number
  pending_count: number
  avg_drc: number | null       // DRC trung bình (weighted by quantity)
  min_drc: number | null
  max_drc: number | null
  total_quantity: number
  batches_due_recheck: number  // số lô sắp/quá hạn tái kiểm
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Ngưỡng mặc định khi chưa có material_qc_standards */
const DEFAULT_STANDARD: Omit<MaterialQCStandard, 'id' | 'material_id' | 'created_at' | 'updated_at'> = {
  drc_standard: 60,
  drc_min: 58,
  drc_max: 62,
  drc_warning_low: 59,
  drc_warning_high: 61,
  recheck_interval_days: 14,
  recheck_shortened_days: 7,
}

// ============================================================================
// SERVICE
// ============================================================================

export const qcService = {

  // ==========================================================================
  //  PHASE 3 — CÁC HÀM CƠ BẢN (ĐÃ CÓ)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // GET STANDARD — Lấy ngưỡng DRC theo sản phẩm
  // --------------------------------------------------------------------------
  async getStandard(materialId: string): Promise<MaterialQCStandard | null> {
    const { data, error } = await supabase
      .from('material_qc_standards')
      .select('*')
      .eq('material_id', materialId)
      .maybeSingle()

    if (error) throw error
    return data as MaterialQCStandard | null
  },

  // --------------------------------------------------------------------------
  // UPSERT STANDARD — Tạo / sửa ngưỡng DRC cho sản phẩm
  // --------------------------------------------------------------------------
  async upsertStandard(
    materialId: string,
    data: Partial<Omit<MaterialQCStandard, 'id' | 'material_id' | 'created_at' | 'updated_at'>>
  ): Promise<MaterialQCStandard> {
    const existing = await this.getStandard(materialId)

    if (existing) {
      const { data: updated, error } = await supabase
        .from('material_qc_standards')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('material_id', materialId)
        .select('*')
        .single()

      if (error) throw error
      return updated as unknown as MaterialQCStandard
    } else {
      const { data: created, error } = await supabase
        .from('material_qc_standards')
        .insert({
          material_id: materialId,
          ...DEFAULT_STANDARD,
          ...data,
        })
        .select('*')
        .single()

      if (error) throw error
      return created as unknown as MaterialQCStandard
    }
  },

  // --------------------------------------------------------------------------
  // EVALUATE DRC — So sánh DRC với ngưỡng → trả kết quả
  // --------------------------------------------------------------------------
  evaluateDRC(
    drcValue: number,
    standard: MaterialQCStandard | null
  ): QCEvaluation {
    const std = standard || DEFAULT_STANDARD as MaterialQCStandard

    const drcMin = std.drc_min ?? 58
    const drcMax = std.drc_max ?? 62
    const warnLow = std.drc_warning_low ?? 59
    const warnHigh = std.drc_warning_high ?? 61
    const recheckNormal = std.recheck_interval_days ?? 14
    const recheckShort = std.recheck_shortened_days ?? 7

    // Ngoài khoảng cho phép → FAILED
    if (drcValue < drcMin || drcValue > drcMax) {
      return {
        result: 'failed',
        qc_status: 'needs_blend',
        message: `DRC ${drcValue}% ngoài khoảng cho phép (${drcMin}–${drcMax}%). Cần phối trộn.`,
        next_recheck_days: recheckShort,
      }
    }

    // Trong vùng cảnh báo → WARNING
    if (drcValue < warnLow || drcValue > warnHigh) {
      return {
        result: 'warning',
        qc_status: 'warning',
        message: `DRC ${drcValue}% gần biên (cảnh báo ${warnLow}–${warnHigh}%). Rút ngắn tái kiểm.`,
        next_recheck_days: recheckShort,
      }
    }

    // Trong khoảng tốt → PASSED
    return {
      result: 'passed',
      qc_status: 'passed',
      message: `DRC ${drcValue}% đạt chuẩn (${warnLow}–${warnHigh}%).`,
      next_recheck_days: recheckNormal,
    }
  },

  // --------------------------------------------------------------------------
  // ADD INITIAL QC — QC đầu vào khi nhập kho (CORE P3)
  // --------------------------------------------------------------------------
  async addInitialQC(data: AddQCData): Promise<{
    qcResult: BatchQCResult
    evaluation: QCEvaluation
  }> {
    const { batch_id, drc_value, tester_id } = data

    // 1. Lấy batch → material_id
    const { data: batch, error: batchErr } = await supabase
      .from('stock_batches')
      .select('id, material_id')
      .eq('id', batch_id)
      .single()

    if (batchErr) throw batchErr
    if (!batch) throw new Error('Không tìm thấy lô hàng')

    // 2. Lấy ngưỡng QC theo material
    const standard = await this.getStandard(batch.material_id)

    // 3. Evaluate DRC
    const evaluation = this.evaluateDRC(drc_value, standard)

    // 4. Tính next_recheck_date
    const today = new Date()
    const nextRecheck = new Date(today)
    nextRecheck.setDate(today.getDate() + evaluation.next_recheck_days)
    const nextRecheckStr = nextRecheck.toISOString().split('T')[0]

    // 5. Insert batch_qc_results
    const { data: qcResult, error: qcErr } = await supabase
      .from('batch_qc_results')
      .insert({
        batch_id,
        drc_value,
        pri_value: data.pri_value || null,
        mooney_value: data.mooney_value || null,
        ash_content: data.ash_content || null,
        nitrogen_content: data.nitrogen_content || null,
        result: evaluation.result,
        check_type: data.check_type || 'initial',
        tester_id: tester_id || null,
        notes: data.notes || evaluation.message,
        tested_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (qcErr) throw qcErr

    // 6. Update stock_batches: DRC + QC status + recheck date
    const { error: updateErr } = await supabase
      .from('stock_batches')
      .update({
        initial_drc: drc_value,
        latest_drc: drc_value,
        last_qc_date: today.toISOString().split('T')[0],
        qc_status: evaluation.qc_status,
        next_recheck_date: nextRecheckStr,
        updated_at: new Date().toISOString(),
      })
      .eq('id', batch_id)

    if (updateErr) throw updateErr

    return {
      qcResult: qcResult as unknown as BatchQCResult,
      evaluation,
    }
  },

  // --------------------------------------------------------------------------
  // GET QC HISTORY — Lịch sử QC của 1 lô (cho chart P6)
  // --------------------------------------------------------------------------
  async getQCHistory(batchId: string): Promise<BatchQCResult[]> {
    const { data, error } = await supabase
      .from('batch_qc_results')
      .select('*')
      .eq('batch_id', batchId)
      .order('tested_at', { ascending: true })

    if (error) throw error
    return (data || []) as unknown as BatchQCResult[]
  },

  // --------------------------------------------------------------------------
  // GET ALL STANDARDS — DS ngưỡng QC (cho trang config P6)
  // --------------------------------------------------------------------------
  async getAllStandards(): Promise<MaterialQCStandard[]> {
    const { data, error } = await supabase
      .from('material_qc_standards')
      .select(`
        *,
        material:materials(id, sku, name)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []) as unknown as MaterialQCStandard[]
  },

  // ==========================================================================
  //  PHASE 6 — SPRINT 6A: TÁI KIỂM & DRC TRACKING
  // ==========================================================================

  // --------------------------------------------------------------------------
  // 6A-1: GET BATCHES DUE RECHECK — DS lô cần tái kiểm DRC
  // --------------------------------------------------------------------------
  async getBatchesDueRecheck(options?: {
    warehouse_id?: string
    include_upcoming_days?: number  // bao gồm lô sắp đến hạn trong X ngày
  }): Promise<RecheckBatchItem[]> {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    // Nếu include_upcoming_days > 0, lấy thêm lô sắp đến hạn
    const upcomingDays = options?.include_upcoming_days ?? 0
    const cutoffDate = new Date(today)
    cutoffDate.setDate(today.getDate() + upcomingDays)
    const cutoffStr = cutoffDate.toISOString().split('T')[0]

    let query = supabase
      .from('stock_batches')
      .select(`
        id, batch_no, material_id, warehouse_id, location_id,
        initial_drc, latest_drc, qc_status, last_qc_date, next_recheck_date,
        quantity_remaining, unit, received_date, status,
        material:materials(id, sku, name),
        warehouse:warehouses(id, name),
        location:warehouse_locations(id, code)
      `)
      .eq('status', 'active')
      .not('qc_status', 'eq', 'failed')           // Không lấy lô đã failed hoàn toàn
      .not('next_recheck_date', 'is', null)         // Phải có ngày tái kiểm
      .lte('next_recheck_date', cutoffStr)          // Đến hạn hoặc quá hạn
      .order('next_recheck_date', { ascending: true })

    // Filter theo kho nếu có
    if (options?.warehouse_id) {
      query = query.eq('warehouse_id', options.warehouse_id)
    }

    const { data, error } = await query

    if (error) throw error

    // Map kết quả + tính days_overdue
    return (data || []).map((batch: any) => {
      const recheckDate = batch.next_recheck_date
        ? new Date(batch.next_recheck_date)
        : today
      const diffMs = today.getTime() - recheckDate.getTime()
      const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      return {
        id: batch.id,
        batch_no: batch.batch_no,
        material_id: batch.material_id,
        material_name: batch.material?.name ?? '—',
        material_sku: batch.material?.sku ?? '—',
        warehouse_id: batch.warehouse_id,
        warehouse_name: batch.warehouse?.name ?? '—',
        location_id: batch.location_id,
        location_code: batch.location?.code ?? '—',
        initial_drc: batch.initial_drc,
        latest_drc: batch.latest_drc,
        qc_status: batch.qc_status as QCStatus,
        last_qc_date: batch.last_qc_date,
        next_recheck_date: batch.next_recheck_date,
        days_overdue: Math.max(0, daysOverdue),   // 0 nếu chưa quá hạn
        quantity_remaining: batch.quantity_remaining,
        unit: batch.unit,
        received_date: batch.received_date,
      } as RecheckBatchItem
    })
  },

  // --------------------------------------------------------------------------
  // 6A-2: ADD RECHECK RESULT — Nhập kết quả tái kiểm DRC
  // --------------------------------------------------------------------------
  async addRecheckResult(data: {
    batch_id: string
    drc_value: number
    pri_value?: number
    mooney_value?: number
    ash_content?: number
    nitrogen_content?: number
    tester_id?: string
    notes?: string
  }): Promise<{
    qcResult: BatchQCResult
    evaluation: QCEvaluation
    batchUpdated: boolean
  }> {
    const { batch_id, drc_value, tester_id } = data

    // 1. Lấy batch → material_id (validate lô còn active)
    const { data: batch, error: batchErr } = await supabase
      .from('stock_batches')
      .select('id, material_id, status, qc_status')
      .eq('id', batch_id)
      .single()

    if (batchErr) throw batchErr
    if (!batch) throw new Error('Không tìm thấy lô hàng')
    if (batch.status !== 'active') {
      throw new Error(`Lô hàng không ở trạng thái active (hiện tại: ${batch.status})`)
    }

    // 2. Lấy ngưỡng QC theo material
    const standard = await this.getStandard(batch.material_id)

    // 3. Evaluate DRC
    const evaluation = this.evaluateDRC(drc_value, standard)

    // 4. Tính next_recheck_date
    const today = new Date()
    let nextRecheckStr: string | null = null

    if (evaluation.result === 'failed') {
      // Failed → set needs_blend, không cần tái kiểm nữa (chờ blend)
      nextRecheckStr = null
    } else {
      const nextRecheck = new Date(today)
      nextRecheck.setDate(today.getDate() + evaluation.next_recheck_days)
      nextRecheckStr = nextRecheck.toISOString().split('T')[0]
    }

    // 5. Insert batch_qc_results (check_type = 'recheck')
    const { data: qcResult, error: qcErr } = await supabase
      .from('batch_qc_results')
      .insert({
        batch_id,
        drc_value,
        pri_value: data.pri_value || null,
        mooney_value: data.mooney_value || null,
        ash_content: data.ash_content || null,
        nitrogen_content: data.nitrogen_content || null,
        result: evaluation.result,
        check_type: 'recheck' as QCCheckType,
        tester_id: tester_id || null,
        notes: data.notes || evaluation.message,
        tested_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (qcErr) throw qcErr

    // 6. Update stock_batches
    //    - KHÔNG update initial_drc (giữ nguyên DRC ban đầu)
    //    - Update latest_drc, last_qc_date, qc_status, next_recheck_date
    const updateData: Record<string, any> = {
      latest_drc: drc_value,
      last_qc_date: today.toISOString().split('T')[0],
      qc_status: evaluation.qc_status,
      updated_at: new Date().toISOString(),
    }

    // next_recheck_date: null nếu failed (chờ blend), ngày mới nếu passed/warning
    if (nextRecheckStr) {
      updateData.next_recheck_date = nextRecheckStr
    } else {
      updateData.next_recheck_date = null
    }

    const { error: updateErr } = await supabase
      .from('stock_batches')
      .update(updateData)
      .eq('id', batch_id)

    if (updateErr) throw updateErr

    return {
      qcResult: qcResult as unknown as BatchQCResult,
      evaluation,
      batchUpdated: true,
    }
  },

  // --------------------------------------------------------------------------
  // 6A-3: GET DRC OVERVIEW — Tổng quan DRC tất cả lô active (cho Dashboard)
  // --------------------------------------------------------------------------
  async getDRCOverview(options?: {
    warehouse_id?: string
    material_id?: string
    qc_status?: QCStatus
    search?: string
  }): Promise<DRCOverviewItem[]> {
    let query = supabase
      .from('stock_batches')
      .select(`
        id, batch_no, material_id, warehouse_id, location_id,
        initial_drc, latest_drc, qc_status, last_qc_date, next_recheck_date,
        quantity_remaining, unit, received_date, status,
        material:materials(id, sku, name),
        warehouse:warehouses(id, name),
        location:warehouse_locations(id, code)
      `)
      .eq('status', 'active')
      .gt('quantity_remaining', 0)
      .order('next_recheck_date', { ascending: true, nullsFirst: false })

    // Filters
    if (options?.warehouse_id) {
      query = query.eq('warehouse_id', options.warehouse_id)
    }
    if (options?.material_id) {
      query = query.eq('material_id', options.material_id)
    }
    if (options?.qc_status) {
      query = query.eq('qc_status', options.qc_status)
    }
    if (options?.search) {
      query = query.or(`batch_no.ilike.%${options.search}%`)
    }

    const { data, error } = await query

    if (error) throw error

    return (data || []).map((batch: any) => ({
      id: batch.id,
      batch_no: batch.batch_no,
      material_id: batch.material_id,
      material_name: batch.material?.name ?? '—',
      material_sku: batch.material?.sku ?? '—',
      warehouse_name: batch.warehouse?.name ?? '—',
      location_code: batch.location?.code ?? '—',
      initial_drc: batch.initial_drc,
      latest_drc: batch.latest_drc,
      qc_status: batch.qc_status as QCStatus,
      last_qc_date: batch.last_qc_date,
      next_recheck_date: batch.next_recheck_date,
      quantity_remaining: batch.quantity_remaining,
      unit: batch.unit,
      received_date: batch.received_date,
      status: batch.status,
    } as DRCOverviewItem))
  },

  // --------------------------------------------------------------------------
  // 6A-3b: GET DRC STATS — Thống kê nhanh cho Dashboard cards
  // --------------------------------------------------------------------------
  async getDRCStats(warehouseId?: string): Promise<{
    totalBatches: number
    passedCount: number
    warningCount: number
    needsBlendCount: number
    pendingCount: number
    overdueRecheckCount: number
    avgDRC: number | null
  }> {
    let query = supabase
      .from('stock_batches')
      .select('id, qc_status, latest_drc, next_recheck_date, quantity_remaining')
      .eq('status', 'active')
      .gt('quantity_remaining', 0)

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId)
    }

    const { data, error } = await query

    if (error) throw error

    const batches = data || []
    const todayStr = new Date().toISOString().split('T')[0]

    // Tính DRC trung bình có trọng số (weighted by quantity_remaining)
    let totalWeightedDRC = 0
    let totalQty = 0
    for (const b of batches) {
      if (b.latest_drc != null && b.quantity_remaining > 0) {
        totalWeightedDRC += b.latest_drc * b.quantity_remaining
        totalQty += b.quantity_remaining
      }
    }

    return {
      totalBatches: batches.length,
      passedCount: batches.filter(b => b.qc_status === 'passed').length,
      warningCount: batches.filter(b => b.qc_status === 'warning').length,
      needsBlendCount: batches.filter(b => b.qc_status === 'needs_blend').length,
      pendingCount: batches.filter(b => b.qc_status === 'pending').length,
      overdueRecheckCount: batches.filter(b =>
        b.next_recheck_date && b.next_recheck_date <= todayStr
      ).length,
      avgDRC: totalQty > 0 ? Math.round((totalWeightedDRC / totalQty) * 100) / 100 : null,
    }
  },

  // --------------------------------------------------------------------------
  // 6A-4: GET QC SUMMARY BY MATERIAL — Thống kê QC theo sản phẩm
  // --------------------------------------------------------------------------
  async getQCSummaryByMaterial(materialId: string): Promise<QCSummaryByMaterial | null> {
    // 1. Lấy thông tin material
    const { data: material, error: matErr } = await supabase
      .from('materials')
      .select('id, sku, name')
      .eq('id', materialId)
      .single()

    if (matErr) throw matErr
    if (!material) return null

    // 2. Lấy tất cả lô active của material này
    const { data: batches, error: batchErr } = await supabase
      .from('stock_batches')
      .select('id, qc_status, latest_drc, quantity_remaining, next_recheck_date')
      .eq('material_id', materialId)
      .eq('status', 'active')
      .gt('quantity_remaining', 0)

    if (batchErr) throw batchErr

    const all = batches || []
    const todayStr = new Date().toISOString().split('T')[0]

    // 3. Tính thống kê
    const drcValues = all
      .filter(b => b.latest_drc != null)
      .map(b => b.latest_drc as number)

    // DRC trung bình có trọng số
    let totalWeightedDRC = 0
    let totalQty = 0
    for (const b of all) {
      if (b.latest_drc != null && b.quantity_remaining > 0) {
        totalWeightedDRC += b.latest_drc * b.quantity_remaining
        totalQty += b.quantity_remaining
      }
    }

    return {
      material_id: materialId,
      material_name: material.name,
      material_sku: material.sku,
      total_batches: all.length,
      passed_count: all.filter(b => b.qc_status === 'passed').length,
      warning_count: all.filter(b => b.qc_status === 'warning').length,
      needs_blend_count: all.filter(b => b.qc_status === 'needs_blend').length,
      pending_count: all.filter(b => b.qc_status === 'pending').length,
      avg_drc: totalQty > 0 ? Math.round((totalWeightedDRC / totalQty) * 100) / 100 : null,
      min_drc: drcValues.length > 0 ? Math.min(...drcValues) : null,
      max_drc: drcValues.length > 0 ? Math.max(...drcValues) : null,
      total_quantity: totalQty,
      batches_due_recheck: all.filter(b =>
        b.next_recheck_date && b.next_recheck_date <= todayStr
      ).length,
    }
  },

  // --------------------------------------------------------------------------
  // 6A-4b: GET QC SUMMARY ALL MATERIALS — Thống kê QC tất cả SP (cho report)
  // --------------------------------------------------------------------------
  async getQCSummaryAllMaterials(): Promise<QCSummaryByMaterial[]> {
    // 1. Lấy tất cả lô active có DRC
    const { data: batches, error } = await supabase
      .from('stock_batches')
      .select(`
        id, material_id, qc_status, latest_drc, 
        quantity_remaining, next_recheck_date,
        material:materials(id, sku, name)
      `)
      .eq('status', 'active')
      .gt('quantity_remaining', 0)

    if (error) throw error

    const all = batches || []
    const todayStr = new Date().toISOString().split('T')[0]

    // 2. Group by material_id
    const grouped: Record<string, typeof all> = {}
    for (const b of all) {
      if (!grouped[b.material_id]) grouped[b.material_id] = []
      grouped[b.material_id].push(b)
    }

    // 3. Build summary cho mỗi SP
    const summaries: QCSummaryByMaterial[] = []

    for (const [materialId, materialBatches] of Object.entries(grouped)) {
      const firstBatch: any = materialBatches[0]
      const drcValues = materialBatches
        .filter(b => b.latest_drc != null)
        .map(b => b.latest_drc as number)

      let totalWeightedDRC = 0
      let totalQty = 0
      for (const b of materialBatches) {
        if (b.latest_drc != null && b.quantity_remaining > 0) {
          totalWeightedDRC += b.latest_drc * b.quantity_remaining
          totalQty += b.quantity_remaining
        }
      }

      summaries.push({
        material_id: materialId,
        material_name: firstBatch.material?.name ?? '—',
        material_sku: firstBatch.material?.sku ?? '—',
        total_batches: materialBatches.length,
        passed_count: materialBatches.filter(b => b.qc_status === 'passed').length,
        warning_count: materialBatches.filter(b => b.qc_status === 'warning').length,
        needs_blend_count: materialBatches.filter(b => b.qc_status === 'needs_blend').length,
        pending_count: materialBatches.filter(b => b.qc_status === 'pending').length,
        avg_drc: totalQty > 0 ? Math.round((totalWeightedDRC / totalQty) * 100) / 100 : null,
        min_drc: drcValues.length > 0 ? Math.min(...drcValues) : null,
        max_drc: drcValues.length > 0 ? Math.max(...drcValues) : null,
        total_quantity: totalQty,
        batches_due_recheck: materialBatches.filter(b =>
          b.next_recheck_date && b.next_recheck_date <= todayStr
        ).length,
      })
    }

    // Sort: SP có nhiều lô needs_blend/warning trước
    summaries.sort((a, b) =>
      (b.needs_blend_count + b.warning_count) - (a.needs_blend_count + a.warning_count)
    )

    return summaries
  },
}

// ============================================================================
// STANDALONE EXPORTS
// ============================================================================

export const {
  // Phase 3
  getStandard: getQCStandard,
  upsertStandard: upsertQCStandard,
  evaluateDRC,
  addInitialQC,
  getQCHistory,
  getAllStandards: getAllQCStandards,
  // Phase 6 — Sprint 6A
  getBatchesDueRecheck,
  addRecheckResult,
  getDRCOverview,
  getDRCStats,
  getQCSummaryByMaterial,
  getQCSummaryAllMaterials,
} = qcService

export default qcService