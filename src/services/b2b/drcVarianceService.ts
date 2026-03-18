// ============================================================================
// DRC VARIANCE SERVICE — Tính chênh lệch DRC dự kiến vs thực tế
// File: src/services/b2b/drcVarianceService.ts
// ============================================================================

import { Deal } from './dealService'

// ============================================
// TYPES
// ============================================

export type DrcVarianceStatus = 'higher' | 'lower' | 'equal' | 'pending'

export interface DrcVariance {
  expected_drc: number | null
  actual_drc: number | null
  drc_diff: number | null           // actual - expected
  drc_diff_percent: number | null   // percentage difference relative to expected
  expected_value: number | null     // quantity_kg × (expected_drc/100) × unit_price
  actual_value: number | null       // actual_weight_kg × (actual_drc/100) × unit_price
  value_diff: number | null         // actual_value - expected_value
  status: DrcVarianceStatus         // DRC higher/lower than expected
}

// ============================================
// SERVICE
// ============================================

export const drcVarianceService = {
  /**
   * Tính toán chênh lệch DRC giữa dự kiến và thực tế
   * và ảnh hưởng đến giá trị deal
   */
  calculateVariance(deal: Deal): DrcVariance {
    const expectedDrc = (deal as any).expected_drc as number | null | undefined
    const actualDrc = deal.actual_drc
    const quantityKg = deal.quantity_kg
    const actualWeightKg = deal.actual_weight_kg
    const unitPrice = deal.unit_price

    // Default result when data is incomplete
    const pending: DrcVariance = {
      expected_drc: expectedDrc ?? null,
      actual_drc: actualDrc ?? null,
      drc_diff: null,
      drc_diff_percent: null,
      expected_value: null,
      actual_value: null,
      value_diff: null,
      status: 'pending',
    }

    // Need both DRC values to calculate variance
    if (!expectedDrc || !actualDrc) {
      // Still calculate partial values if possible
      if (expectedDrc && quantityKg && unitPrice) {
        pending.expected_value = Math.round(quantityKg * (expectedDrc / 100) * unitPrice)
      }
      if (actualDrc && actualWeightKg && unitPrice) {
        pending.actual_value = Math.round(actualWeightKg * (actualDrc / 100) * unitPrice)
      }
      return pending
    }

    // Calculate DRC difference
    const drcDiff = Math.round((actualDrc - expectedDrc) * 100) / 100
    const drcDiffPercent = expectedDrc > 0
      ? Math.round(((actualDrc - expectedDrc) / expectedDrc) * 10000) / 100
      : null

    // Calculate expected value: quantity × (expected_drc/100) × price
    const expectedValue = quantityKg && unitPrice
      ? Math.round(quantityKg * (expectedDrc / 100) * unitPrice)
      : null

    // Calculate actual value: actual_weight × (actual_drc/100) × price
    // Fall back to quantity_kg if actual_weight_kg not available
    const weightForActual = actualWeightKg || quantityKg
    const actualValue = weightForActual && unitPrice
      ? Math.round(weightForActual * (actualDrc / 100) * unitPrice)
      : null

    // Calculate value difference
    const valueDiff = expectedValue !== null && actualValue !== null
      ? actualValue - expectedValue
      : null

    // Determine status
    let status: DrcVarianceStatus = 'pending'
    if (drcDiff > 0.01) {
      status = 'higher'
    } else if (drcDiff < -0.01) {
      status = 'lower'
    } else {
      status = 'equal'
    }

    return {
      expected_drc: expectedDrc,
      actual_drc: actualDrc,
      drc_diff: drcDiff,
      drc_diff_percent: drcDiffPercent,
      expected_value: expectedValue,
      actual_value: actualValue,
      value_diff: valueDiff,
      status,
    }
  },
}

export default drcVarianceService
