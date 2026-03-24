// ============================================================================
// FILE: src/services/wms/nvlDashboardService.ts
// MODULE: Kho NVL (WMS) — Huy Anh Rubber ERP
// MÔ TẢ: Service cho dashboard bãi nguyên liệu (NVL)
//         Query active batches từ stock_batches where material.type='raw'
// BẢNG: stock_batches, materials, batch_qc_results
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface NVLOverview {
  total_batches: number
  total_weight_kg: number
  total_weight_tons: number
  avg_drc: number | null
  pending_qc: number
  passed_qc: number
  failed_qc: number
  avg_storage_days: number
  batches_over_30_days: number
  batches_over_60_days: number
}

export interface GradeDistItem {
  grade: string
  count: number
  weight_kg: number
  percentage: number
}

export interface DailyIntakeItem {
  date: string
  weight_kg: number
  batch_count: number
}

export interface PendingQCBatch {
  id: string
  batch_no: string
  supplier_name: string
  weight: number
  days: number
}

export interface FailedQCBatch {
  id: string
  batch_no: string
  latest_drc: number
  qc_status: string
}

export interface LongStorageBatch {
  id: string
  batch_no: string
  days: number
  weight: number
}

export interface ReadyBatch {
  id: string
  batch_no: string
  grade: string
  drc: number
  weight: number
}

export interface BatchesNeedingAction {
  pending_qc: PendingQCBatch[]
  failed_qc: FailedQCBatch[]
  long_storage: LongStorageBatch[]
  ready_for_production: ReadyBatch[]
}

export interface SupplierBreakdownItem {
  supplier_name: string
  batch_count: number
  total_weight_kg: number
  avg_drc: number
}

export interface DrcDistItem {
  range: string
  count: number
}

// ============================================================================
// HELPER — Lấy tất cả active raw batches
// ============================================================================

async function fetchActiveRawBatches() {
  const { data, error } = await supabase
    .from('stock_batches')
    .select(`
      id, batch_no, status, qc_status,
      initial_quantity, quantity_remaining, unit,
      initial_drc, latest_drc,
      initial_weight, current_weight,
      rubber_grade, rubber_type,
      supplier_name, supplier_region,
      received_date, storage_days,
      created_at,
      material:materials!inner(id, sku, name, type)
    `)
    .eq('status', 'active')
    .eq('materials.type', 'raw')
    .gt('quantity_remaining', 0)

  if (error) throw error
  return data || []
}

// ============================================================================
// SERVICE
// ============================================================================

export const nvlDashboardService = {

  // --------------------------------------------------------------------------
  // GET OVERVIEW — Tổng quan KPI
  // --------------------------------------------------------------------------
  async getOverview(): Promise<NVLOverview> {
    const batches = await fetchActiveRawBatches()

    let totalWeight = 0
    let drcWeightSum = 0
    let weightForDrc = 0
    let totalStorageDays = 0
    let pendingQc = 0
    let passedQc = 0
    let failedQc = 0
    let over30 = 0
    let over60 = 0

    for (const b of batches) {
      const w = b.current_weight || b.quantity_remaining || 0
      totalWeight += w

      if (b.latest_drc && w > 0) {
        drcWeightSum += b.latest_drc * w
        weightForDrc += w
      }

      const days = b.storage_days || 0
      totalStorageDays += days
      if (days > 30) over30++
      if (days > 60) over60++

      if (b.qc_status === 'pending') pendingQc++
      else if (b.qc_status === 'passed') passedQc++
      else if (b.qc_status === 'failed' || b.qc_status === 'needs_blend') failedQc++
    }

    return {
      total_batches: batches.length,
      total_weight_kg: Math.round(totalWeight),
      total_weight_tons: Math.round(totalWeight / 100) / 10, // 1 decimal
      avg_drc: weightForDrc > 0
        ? Math.round((drcWeightSum / weightForDrc) * 100) / 100
        : null,
      pending_qc: pendingQc,
      passed_qc: passedQc,
      failed_qc: failedQc,
      avg_storage_days: batches.length > 0
        ? Math.round(totalStorageDays / batches.length)
        : 0,
      batches_over_30_days: over30,
      batches_over_60_days: over60,
    }
  },

  // --------------------------------------------------------------------------
  // GET GRADE DISTRIBUTION — Phân bố grade (pie/donut chart)
  // --------------------------------------------------------------------------
  async getGradeDistribution(): Promise<GradeDistItem[]> {
    const batches = await fetchActiveRawBatches()

    const gradeMap: Record<string, { count: number; weight_kg: number }> = {}
    let totalWeight = 0

    for (const b of batches) {
      const grade = b.rubber_grade || 'unknown'
      const w = b.current_weight || b.quantity_remaining || 0
      if (!gradeMap[grade]) gradeMap[grade] = { count: 0, weight_kg: 0 }
      gradeMap[grade].count++
      gradeMap[grade].weight_kg += w
      totalWeight += w
    }

    return Object.entries(gradeMap)
      .map(([grade, data]) => ({
        grade,
        count: data.count,
        weight_kg: Math.round(data.weight_kg),
        percentage: totalWeight > 0
          ? Math.round((data.weight_kg / totalWeight) * 1000) / 10
          : 0,
      }))
      .sort((a, b) => b.weight_kg - a.weight_kg)
  },

  // --------------------------------------------------------------------------
  // GET DAILY INTAKE — Nhập kho 7 ngày gần nhất (bar chart)
  // --------------------------------------------------------------------------
  async getDailyIntake(days: number = 7): Promise<DailyIntakeItem[]> {
    const now = new Date()
    const fromDate = new Date(now)
    fromDate.setDate(now.getDate() - days + 1)
    const fromStr = fromDate.toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('stock_batches')
      .select(`
        received_date, initial_weight, initial_quantity,
        material:materials!inner(type)
      `)
      .eq('materials.type', 'raw')
      .gte('received_date', fromStr)
      .order('received_date', { ascending: true })

    if (error) throw error

    // Group by date
    const dateMap: Record<string, { weight_kg: number; batch_count: number }> = {}

    // Pre-fill all dates
    for (let i = 0; i < days; i++) {
      const d = new Date(fromDate)
      d.setDate(fromDate.getDate() + i)
      const key = d.toISOString().split('T')[0]
      dateMap[key] = { weight_kg: 0, batch_count: 0 }
    }

    for (const b of (data || [])) {
      const key = b.received_date
      if (!dateMap[key]) dateMap[key] = { weight_kg: 0, batch_count: 0 }
      dateMap[key].weight_kg += b.initial_weight || b.initial_quantity || 0
      dateMap[key].batch_count++
    }

    return Object.entries(dateMap)
      .map(([date, d]) => ({
        date,
        weight_kg: Math.round(d.weight_kg),
        batch_count: d.batch_count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
  },

  // --------------------------------------------------------------------------
  // GET BATCHES NEEDING ACTION — Lô cần xử lý
  // --------------------------------------------------------------------------
  async getBatchesNeedingAction(): Promise<BatchesNeedingAction> {
    const batches = await fetchActiveRawBatches()
    const now = new Date()

    const pending_qc: PendingQCBatch[] = []
    const failed_qc: FailedQCBatch[] = []
    const long_storage: LongStorageBatch[] = []
    const ready_for_production: ReadyBatch[] = []

    for (const b of batches) {
      const w = b.current_weight || b.quantity_remaining || 0
      const days = b.storage_days || Math.floor(
        (now.getTime() - new Date(b.received_date || b.created_at).getTime()) /
        (1000 * 60 * 60 * 24)
      )

      if (b.qc_status === 'pending') {
        pending_qc.push({
          id: b.id,
          batch_no: b.batch_no,
          supplier_name: b.supplier_name || '—',
          weight: Math.round(w),
          days,
        })
      }

      if (b.qc_status === 'failed' || b.qc_status === 'needs_blend') {
        failed_qc.push({
          id: b.id,
          batch_no: b.batch_no,
          latest_drc: b.latest_drc || 0,
          qc_status: b.qc_status,
        })
      }

      if (days > 30) {
        long_storage.push({
          id: b.id,
          batch_no: b.batch_no,
          days,
          weight: Math.round(w),
        })
      }

      if (b.qc_status === 'passed' && b.latest_drc) {
        ready_for_production.push({
          id: b.id,
          batch_no: b.batch_no,
          grade: b.rubber_grade || '—',
          drc: b.latest_drc,
          weight: Math.round(w),
        })
      }
    }

    // Sort
    pending_qc.sort((a, b) => b.days - a.days)
    long_storage.sort((a, b) => b.days - a.days)
    ready_for_production.sort((a, b) => b.weight - a.weight)

    return { pending_qc, failed_qc, long_storage, ready_for_production }
  },

  // --------------------------------------------------------------------------
  // GET SUPPLIER BREAKDOWN — Top đại lý theo trọng lượng
  // --------------------------------------------------------------------------
  async getSupplierBreakdown(limit: number = 10): Promise<SupplierBreakdownItem[]> {
    const batches = await fetchActiveRawBatches()

    const supplierMap: Record<string, {
      batch_count: number
      total_weight_kg: number
      drcWeightSum: number
      weightForDrc: number
    }> = {}

    for (const b of batches) {
      const name = b.supplier_name || 'Không rõ'
      const w = b.current_weight || b.quantity_remaining || 0
      if (!supplierMap[name]) {
        supplierMap[name] = { batch_count: 0, total_weight_kg: 0, drcWeightSum: 0, weightForDrc: 0 }
      }
      supplierMap[name].batch_count++
      supplierMap[name].total_weight_kg += w

      if (b.latest_drc && w > 0) {
        supplierMap[name].drcWeightSum += b.latest_drc * w
        supplierMap[name].weightForDrc += w
      }
    }

    return Object.entries(supplierMap)
      .map(([supplier_name, d]) => ({
        supplier_name,
        batch_count: d.batch_count,
        total_weight_kg: Math.round(d.total_weight_kg),
        avg_drc: d.weightForDrc > 0
          ? Math.round((d.drcWeightSum / d.weightForDrc) * 100) / 100
          : 0,
      }))
      .sort((a, b) => b.total_weight_kg - a.total_weight_kg)
      .slice(0, limit)
  },

  // --------------------------------------------------------------------------
  // GET DRC DISTRIBUTION — Histogram phân bố DRC
  // --------------------------------------------------------------------------
  async getDrcDistribution(): Promise<DrcDistItem[]> {
    const batches = await fetchActiveRawBatches()

    // Ranges: <30, 30-35, 35-40, 40-45, 45-50, 50-55, 55-60, 60-65, 65-70, >70
    const ranges = [
      { label: '<30', min: 0, max: 30 },
      { label: '30-35', min: 30, max: 35 },
      { label: '35-40', min: 35, max: 40 },
      { label: '40-45', min: 40, max: 45 },
      { label: '45-50', min: 45, max: 50 },
      { label: '50-55', min: 50, max: 55 },
      { label: '55-60', min: 55, max: 60 },
      { label: '60-65', min: 60, max: 65 },
      { label: '65-70', min: 65, max: 70 },
      { label: '>70', min: 70, max: 999 },
    ]

    const counts: Record<string, number> = {}
    for (const r of ranges) counts[r.label] = 0

    for (const b of batches) {
      if (b.latest_drc == null) continue
      for (const r of ranges) {
        if (b.latest_drc >= r.min && b.latest_drc < r.max) {
          counts[r.label]++
          break
        }
      }
    }

    return ranges.map(r => ({
      range: r.label,
      count: counts[r.label],
    }))
  },
}

export default nvlDashboardService
