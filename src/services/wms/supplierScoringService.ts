// ============================================================================
// SUPPLIER SCORING SERVICE
// File: src/services/wms/supplierScoringService.ts
// Module: Kho (WMS) - Huy Anh Rubber ERP
// Phase 10: Supplier Scoring Dashboard
// Mô tả: Chấm điểm nhà cung cấp dựa trên DRC, độ ổn định, tỷ lệ QC đạt
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface SupplierScore {
  supplier_name: string
  total_batches: number
  total_weight_kg: number
  avg_drc: number
  drc_std_dev: number           // Lower = more consistent
  pass_rate: number             // % of batches passed QC
  avg_drc_discrepancy: number   // avg |reported - actual|
  consistency_score: number     // 0-100 based on std_dev
  quality_score: number         // 0-100 based on pass_rate + DRC
  overall_score: number         // weighted average
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
}

export interface SupplierBatchInfo {
  batch_no: string
  drc: number | null
  qc_status: string
  weight: number
  date: string
}

export interface SupplierDetail {
  score: SupplierScore
  batches: SupplierBatchInfo[]
  drc_trend: Array<{ date: string; drc: number }>
  monthly_volume: Array<{ month: string; weight_kg: number }>
}

// ============================================================================
// HELPERS
// ============================================================================

function calcStdDev(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function calcGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

function buildScore(
  supplierName: string,
  batches: Array<{
    quantity_remaining: number
    initial_drc: number | null
    latest_drc: number | null
    supplier_reported_drc: number | null
    qc_status: string
  }>
): SupplierScore {
  const total_batches = batches.length
  const total_weight_kg = batches.reduce((s, b) => s + (Number(b.quantity_remaining) || 0), 0)

  // DRC values
  const drcValues: number[] = []
  for (const b of batches) {
    const drc = Number(b.latest_drc || b.initial_drc)
    if (drc && drc > 0) drcValues.push(drc)
  }
  const avg_drc = drcValues.length > 0
    ? Math.round((drcValues.reduce((s, v) => s + v, 0) / drcValues.length) * 100) / 100
    : 0

  const drc_std_dev = Math.round(calcStdDev(drcValues) * 100) / 100

  // Pass rate
  const passedCount = batches.filter(b => b.qc_status === 'passed').length
  const pass_rate = total_batches > 0
    ? Math.round((passedCount / total_batches) * 10000) / 100
    : 0

  // DRC discrepancy: |supplier_reported_drc - actual_drc|
  let discrepancySum = 0
  let discrepancyCount = 0
  for (const b of batches) {
    const reported = Number(b.supplier_reported_drc)
    const actual = Number(b.latest_drc || b.initial_drc)
    if (reported > 0 && actual > 0) {
      discrepancySum += Math.abs(reported - actual)
      discrepancyCount++
    }
  }
  const avg_drc_discrepancy = discrepancyCount > 0
    ? Math.round((discrepancySum / discrepancyCount) * 100) / 100
    : 0

  // Scoring formulas
  const consistency_score = Math.max(0, Math.round((100 - drc_std_dev * 10) * 100) / 100)
  const quality_score = Math.round(
    (pass_rate * 0.7 + Math.max(0, 100 - avg_drc_discrepancy * 5) * 0.3) * 100
  ) / 100
  const overall_score = Math.round(
    (consistency_score * 0.4 + quality_score * 0.6) * 100
  ) / 100
  const grade = calcGrade(overall_score)

  return {
    supplier_name: supplierName,
    total_batches,
    total_weight_kg,
    avg_drc,
    drc_std_dev,
    pass_rate,
    avg_drc_discrepancy,
    consistency_score,
    quality_score,
    overall_score,
    grade,
  }
}

// ============================================================================
// SERVICE
// ============================================================================

export const supplierScoringService = {
  /**
   * Calculate scores for all suppliers
   */
  async getAllScores(): Promise<SupplierScore[]> {
    const { data, error } = await supabase
      .from('stock_batches')
      .select('supplier_name, quantity_remaining, initial_drc, latest_drc, supplier_reported_drc, qc_status')
      .not('supplier_name', 'is', null)

    if (error) throw error

    // Group by supplier
    const supplierMap: Record<string, typeof data> = {}
    for (const row of data || []) {
      const name = (row as any).supplier_name as string
      if (!name) continue
      if (!supplierMap[name]) supplierMap[name] = []
      supplierMap[name].push(row as any)
    }

    return Object.entries(supplierMap).map(([name, batches]) =>
      buildScore(name, batches as any)
    )
  },

  /**
   * Get single supplier detail
   */
  async getSupplierDetail(supplierName: string): Promise<SupplierDetail> {
    const { data, error } = await supabase
      .from('stock_batches')
      .select('id, batch_no, quantity_remaining, initial_drc, latest_drc, supplier_reported_drc, qc_status, created_at, current_weight')
      .eq('supplier_name', supplierName)
      .order('created_at', { ascending: false })

    if (error) throw error

    const batches = data || []
    const score = buildScore(supplierName, batches as any)

    // Batch list
    const batchList: SupplierBatchInfo[] = batches.map((b: any) => ({
      batch_no: b.batch_no || '',
      drc: Number(b.latest_drc || b.initial_drc) || null,
      qc_status: b.qc_status || 'pending',
      weight: Number(b.current_weight || b.quantity_remaining) || 0,
      date: b.created_at ? b.created_at.substring(0, 10) : '',
    }))

    // DRC trend (ordered by date ascending)
    const drcTrend: Array<{ date: string; drc: number }> = []
    for (const b of [...batches].reverse()) {
      const drc = Number((b as any).latest_drc || (b as any).initial_drc)
      const date = (b as any).created_at ? (b as any).created_at.substring(0, 10) : ''
      if (drc && drc > 0 && date) {
        drcTrend.push({ date, drc })
      }
    }

    // Monthly volume
    const monthMap: Record<string, number> = {}
    for (const b of batches) {
      const date = (b as any).created_at as string
      if (!date) continue
      const month = date.substring(0, 7) // YYYY-MM
      const weight = Number((b as any).current_weight || (b as any).quantity_remaining) || 0
      monthMap[month] = (monthMap[month] || 0) + weight
    }
    const monthly_volume = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, weight_kg]) => ({ month, weight_kg }))

    return { score, batches: batchList, drc_trend: drcTrend, monthly_volume }
  },

  /**
   * Get ranking sorted by overall_score DESC
   */
  async getRanking(): Promise<SupplierScore[]> {
    const scores = await this.getAllScores()
    return scores.sort((a, b) => b.overall_score - a.overall_score)
  },
}

export default supplierScoringService
