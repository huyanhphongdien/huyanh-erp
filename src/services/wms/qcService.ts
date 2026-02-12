// ============================================================================
// FILE: src/services/wms/qcService.ts
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P3 — Bước 3.6 (QC đầu vào), sẽ mở rộng ở P6
// MÔ TẢ: Kiểm tra chất lượng — QC initial khi nhập kho, evaluate DRC,
//         tái kiểm tra, lịch sử QC, quản lý ngưỡng tiêu chuẩn
// BẢNG: batch_qc_results, material_qc_standards, stock_batches
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  BatchQCResult,
  MaterialQCStandard,
  QCStatus,
  QCResult,
  QCCheckType,
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

/** Kết quả trả về khi thêm QC — dùng trong StockInCreatePage */
export interface QCAddResult {
  qcResult: BatchQCResult
  evaluation: QCEvaluation
}

/** Params cho danh sách lô cần tái kiểm */
export interface RecheckListParams {
  warehouse_id?: string
  material_id?: string
  include_overdue?: boolean  // mặc định true
  days_ahead?: number        // bao nhiêu ngày tới (mặc định 7)
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
  // GET STANDARD WITH DEFAULTS — Luôn trả về standard (dùng defaults nếu chưa có)
  // Dùng trong QCInputForm component
  // --------------------------------------------------------------------------
  async getStandardOrDefault(materialId: string): Promise<MaterialQCStandard> {
    const standard = await this.getStandard(materialId)
    if (standard) return standard

    return {
      id: '',
      material_id: materialId,
      ...DEFAULT_STANDARD,
      created_at: '',
      updated_at: '',
    } as MaterialQCStandard
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
  // DELETE STANDARD — Xóa ngưỡng QC (quay về mặc định)
  // --------------------------------------------------------------------------
  async deleteStandard(materialId: string): Promise<void> {
    const { error } = await supabase
      .from('material_qc_standards')
      .delete()
      .eq('material_id', materialId)

    if (error) throw error
  },

  // --------------------------------------------------------------------------
  // EVALUATE DRC — So sánh DRC với ngưỡng → trả kết quả
  // Pure function, không gọi DB — dùng được cả frontend lẫn service
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
  // EVALUATE DRC QUICK — Evaluate nhanh chỉ cần material_id + drc
  // Dùng trong QCInputForm để hiển thị badge realtime
  // --------------------------------------------------------------------------
  async evaluateDRCForMaterial(
    materialId: string,
    drcValue: number
  ): Promise<QCEvaluation> {
    const standard = await this.getStandard(materialId)
    return this.evaluateDRC(drcValue, standard)
  },

  // --------------------------------------------------------------------------
  // ADD INITIAL QC — QC đầu vào khi nhập kho (CORE P3)
  // --------------------------------------------------------------------------
  async addInitialQC(data: AddQCData): Promise<QCAddResult> {
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
    const isInitial = (data.check_type || 'initial') === 'initial'
    const batchUpdate: Record<string, unknown> = {
      latest_drc: drc_value,
      last_qc_date: today.toISOString().split('T')[0],
      qc_status: evaluation.qc_status,
      next_recheck_date: nextRecheckStr,
      updated_at: new Date().toISOString(),
    }
    // Chỉ set initial_drc khi lần đầu
    if (isInitial) {
      batchUpdate.initial_drc = drc_value
    }

    const { error: updateErr } = await supabase
      .from('stock_batches')
      .update(batchUpdate)
      .eq('id', batch_id)

    if (updateErr) throw updateErr

    return {
      qcResult: qcResult as unknown as BatchQCResult,
      evaluation,
    }
  },

  // --------------------------------------------------------------------------
  // ADD RECHECK QC — Tái kiểm tra DRC (dùng ở P6, nhưng logic giống initial)
  // --------------------------------------------------------------------------
  async addRecheckQC(data: AddQCData): Promise<QCAddResult> {
    return this.addInitialQC({
      ...data,
      check_type: 'recheck',
    })
  },

  // --------------------------------------------------------------------------
  // ADD BLEND QC — QC sau phối trộn (dùng ở P9)
  // --------------------------------------------------------------------------
  async addBlendQC(data: AddQCData): Promise<QCAddResult> {
    return this.addInitialQC({
      ...data,
      check_type: 'blend',
    })
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
  // GET LATEST QC — Lấy kết quả QC gần nhất của 1 lô
  // --------------------------------------------------------------------------
  async getLatestQC(batchId: string): Promise<BatchQCResult | null> {
    const { data, error } = await supabase
      .from('batch_qc_results')
      .select('*')
      .eq('batch_id', batchId)
      .order('tested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data as BatchQCResult | null
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

  // --------------------------------------------------------------------------
  // GET BATCHES NEEDING RECHECK — DS lô cần tái kiểm (cho dashboard P5/P6)
  // --------------------------------------------------------------------------
  async getBatchesNeedingRecheck(params?: RecheckListParams): Promise<StockBatchWithRecheck[]> {
    const {
      warehouse_id,
      material_id,
      include_overdue = true,
      days_ahead = 7,
    } = params || {}

    const today = new Date()
    const futureDate = new Date(today)
    futureDate.setDate(today.getDate() + days_ahead)
    const futureDateStr = futureDate.toISOString().split('T')[0]
    const todayStr = today.toISOString().split('T')[0]

    let query = supabase
      .from('stock_batches')
      .select(`
        *,
        material:materials(id, sku, name, type),
        warehouse:warehouses(id, code, name),
        location:warehouse_locations(id, code, shelf)
      `)
      .eq('status', 'active')
      .in('qc_status', ['passed', 'warning'])

    // Filter: next_recheck_date <= futureDate (sắp đến hạn)
    query = query.lte('next_recheck_date', futureDateStr)

    // Nếu không include overdue thì chỉ lấy từ hôm nay
    if (!include_overdue) {
      query = query.gte('next_recheck_date', todayStr)
    }

    if (warehouse_id) {
      query = query.eq('warehouse_id', warehouse_id)
    }
    if (material_id) {
      query = query.eq('material_id', material_id)
    }

    query = query.order('next_recheck_date', { ascending: true })

    const { data, error } = await query
    if (error) throw error

    // Thêm computed field: days_until_recheck, is_overdue
    return (data || []).map((batch: Record<string, unknown>) => {
      const recheckDate = batch.next_recheck_date as string
      const diffMs = new Date(recheckDate).getTime() - today.getTime()
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

      return {
        ...batch,
        days_until_recheck: diffDays,
        is_overdue: diffDays < 0,
      }
    }) as unknown as StockBatchWithRecheck[]
  },

  // --------------------------------------------------------------------------
  // GET QC SUMMARY — Thống kê QC overview (cho dashboard P5)
  // --------------------------------------------------------------------------
  async getQCSummary(warehouseId?: string): Promise<QCSummary> {
    let query = supabase
      .from('stock_batches')
      .select('id, qc_status, next_recheck_date')
      .eq('status', 'active')

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId)
    }

    const { data, error } = await query
    if (error) throw error

    const batches = data || []
    const today = new Date().toISOString().split('T')[0]

    return {
      total_active_batches: batches.length,
      passed: batches.filter((b: { qc_status: string }) => b.qc_status === 'passed').length,
      warning: batches.filter((b: { qc_status: string }) => b.qc_status === 'warning').length,
      failed: batches.filter((b: { qc_status: string }) => b.qc_status === 'failed').length,
      needs_blend: batches.filter((b: { qc_status: string }) => b.qc_status === 'needs_blend').length,
      pending: batches.filter((b: { qc_status: string }) => b.qc_status === 'pending').length,
      overdue_recheck: batches.filter((b: { next_recheck_date?: string }) =>
        b.next_recheck_date && b.next_recheck_date < today
      ).length,
    }
  },
}

// ============================================================================
// HELPER TYPES (không export ra wms.types vì chỉ dùng trong service/dashboard)
// ============================================================================

import type { StockBatch } from './wms.types'

export interface StockBatchWithRecheck extends StockBatch {
  days_until_recheck: number
  is_overdue: boolean
}

export interface QCSummary {
  total_active_batches: number
  passed: number
  warning: number
  failed: number
  needs_blend: number
  pending: number
  overdue_recheck: number
}

// ============================================================================
// STANDALONE EXPORTS — cho import trực tiếp
// ============================================================================

export const {
  getStandard: getQCStandard,
  getStandardOrDefault: getQCStandardOrDefault,
  upsertStandard: upsertQCStandard,
  deleteStandard: deleteQCStandard,
  evaluateDRC,
  evaluateDRCForMaterial,
  addInitialQC,
  addRecheckQC,
  addBlendQC,
  getQCHistory,
  getLatestQC,
  getAllStandards: getAllQCStandards,
  getBatchesNeedingRecheck,
  getQCSummary,
} = qcService

export default qcService