// ============================================================================
// RUBBER GRADE SERVICE
// File: src/services/wms/rubberGradeService.ts
// Phân loại grade SVR, tính trọng lượng khô, đánh giá tiêu chuẩn
// Bảng: rubber_grade_standards
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  RubberGrade,
  RubberGradeStandard,
} from './wms.types'
import {
  RUBBER_GRADE_LABELS,
  RUBBER_GRADE_COLORS,
} from './wms.types'

// ============================================================================
// CACHE — rubber_grade_standards ít thay đổi, cache trong memory
// ============================================================================

let cachedStandards: RubberGradeStandard[] | null = null

// ============================================================================
// SERVICE
// ============================================================================

export const rubberGradeService = {

  // --------------------------------------------------------------------------
  // QUERY
  // --------------------------------------------------------------------------

  /** Lấy tất cả grade standards (cached) */
  async getAll(): Promise<RubberGradeStandard[]> {
    if (cachedStandards) return cachedStandards

    const { data, error } = await supabase
      .from('rubber_grade_standards')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('getAll rubber_grade_standards error:', error)
      return []
    }

    cachedStandards = (data || []) as RubberGradeStandard[]
    return cachedStandards
  },

  /** Lấy standard theo grade */
  async getByGrade(grade: RubberGrade): Promise<RubberGradeStandard | null> {
    const all = await this.getAll()
    return all.find(s => s.grade === grade) || null
  },

  /** Xóa cache (khi cập nhật standards) */
  clearCache(): void {
    cachedStandards = null
  },

  // --------------------------------------------------------------------------
  // CLASSIFICATION — Phân loại DRC -> SVR grade
  // --------------------------------------------------------------------------

  /**
   * Phân loại DRC → SVR grade. CHỈ dùng khi material chưa biết grade cụ thể.
   * RSS / Latex / SVR L / CV KHÔNG phân loại được bằng DRC đơn thuần — phải
   * dựa vào material.sku (gradeFromSku) để tránh gán nhầm RSS/Latex thành SVR.
   */
  classifyByDRC(drc: number): RubberGrade {
    if (drc >= 60) return 'SVR_3L'
    if (drc >= 55) return 'SVR_5'
    if (drc >= 50) return 'SVR_10'
    return 'SVR_20'
  },

  /**
   * Map material SKU → RubberGrade. Là nguồn sự thật chính cho grade của
   * lô hàng vì nó dùng danh mục thành phẩm cố định thay vì đoán từ DRC.
   *
   * Trả về null nếu SKU không khớp pattern thành phẩm — caller có thể fallback
   * sang classifyByDRC cho các lô SVR generic.
   */
  gradeFromSku(sku: string | null | undefined): RubberGrade | null {
    if (!sku) return null
    const s = sku.toUpperCase().replace(/\s+/g, '')
    // Latex
    if (s.includes('LAT-HA') || s.includes('LATEX')) return 'LATEX_60'
    // RSS
    if (s.includes('RSS1') || s.includes('RSS-1')) return 'RSS_1'
    if (s.includes('RSS3') || s.includes('RSS-3')) return 'RSS_3'
    // SVR CV — phải check trước SVR 50/60 chung
    if (s.includes('CV50')) return 'SVR_CV50'
    if (s.includes('CV60')) return 'SVR_CV60'
    // SVR 3L (check trước SVR-L để không nhầm)
    if (s.includes('SVR3L') || s.includes('SVR-3L')) return 'SVR_3L'
    // SVR L
    if (s.endsWith('SVR-L') || s.endsWith('SVRL')) return 'SVR_L'
    // SVR numeric
    if (s.includes('SVR10') || s.includes('SVR-10')) return 'SVR_10'
    if (s.includes('SVR20') || s.includes('SVR-20')) return 'SVR_20'
    if (s.includes('SVR5') || s.includes('SVR-5')) return 'SVR_5'
    return null
  },

  /**
   * Helper tổng hợp: ưu tiên SKU → fallback DRC → null.
   * Dùng cho mọi nơi tạo batch mới (stock-in, production, blending).
   */
  resolveGrade(params: { sku?: string | null; drc?: number | null }): RubberGrade | null {
    const fromSku = this.gradeFromSku(params.sku)
    if (fromSku) return fromSku
    if (params.drc != null && params.drc > 0) return this.classifyByDRC(params.drc)
    return null
  },

  // --------------------------------------------------------------------------
  // CALCULATION — Tính toán
  // --------------------------------------------------------------------------

  /** Tính trọng lượng khô: weight x (DRC / 100) */
  calculateDryWeight(grossWeight: number, drc: number): number {
    return Math.round(grossWeight * (drc / 100) * 100) / 100
  },

  /** Tính hao hụt */
  calculateShrinkage(initialWeight: number, currentWeight: number): {
    loss_kg: number
    loss_percent: number
  } {
    const loss_kg = Math.round((initialWeight - currentWeight) * 100) / 100
    const loss_percent = initialWeight > 0
      ? Math.round((loss_kg / initialWeight) * 10000) / 100
      : 0
    return { loss_kg, loss_percent }
  },

  /** Tính số bành (33.33 kg/bành) */
  calculateBaleCount(weightKg: number): number {
    return Math.floor(weightKg / 33.33)
  },

  /** Tính trọng lượng từ số bành */
  calculateWeightFromBales(baleCount: number): number {
    return Math.round(baleCount * 33.33 * 100) / 100
  },

  // --------------------------------------------------------------------------
  // LABELS & COLORS
  // --------------------------------------------------------------------------

  getGradeLabel(grade: RubberGrade): string {
    return RUBBER_GRADE_LABELS[grade] || grade
  },

  getGradeColor(grade: RubberGrade): string {
    return RUBBER_GRADE_COLORS[grade] || '#6B7280'
  },

  // --------------------------------------------------------------------------
  // EVALUATION — Đánh giá QC result theo tiêu chuẩn grade
  // --------------------------------------------------------------------------

  /**
   * Kiểm tra QC result có đạt tiêu chuẩn SVR grade không
   * Trả về danh sách chỉ tiêu không đạt
   */
  async evaluateAgainstGradeStandard(
    grade: RubberGrade,
    qcResult: {
      drc?: number
      dirt?: number
      ash?: number
      nitrogen?: number
      volatile?: number
      pri?: number
      mooney?: number
      moisture?: number
      color?: number
    }
  ): Promise<{
    passed: boolean
    failures: { parameter: string; value: number; limit: number; unit: string }[]
    grade_confirmed: RubberGrade
  }> {
    const standard = await this.getByGrade(grade)
    if (!standard) {
      return {
        passed: false,
        failures: [{ parameter: 'grade', value: 0, limit: 0, unit: '' }],
        grade_confirmed: this.classifyByDRC(qcResult.drc || 0),
      }
    }

    const failures: { parameter: string; value: number; limit: number; unit: string }[] = []

    // DRC min
    if (qcResult.drc !== undefined && qcResult.drc < standard.drc_min) {
      failures.push({ parameter: 'DRC', value: qcResult.drc, limit: standard.drc_min, unit: '% min' })
    }

    // DRC max (if defined)
    if (qcResult.drc !== undefined && standard.drc_max && qcResult.drc > standard.drc_max) {
      failures.push({ parameter: 'DRC', value: qcResult.drc, limit: standard.drc_max, unit: '% max' })
    }

    // Dirt
    if (qcResult.dirt !== undefined && qcResult.dirt > standard.dirt_max) {
      failures.push({ parameter: 'Dirt', value: qcResult.dirt, limit: standard.dirt_max, unit: '% max' })
    }

    // Ash
    if (qcResult.ash !== undefined && qcResult.ash > standard.ash_max) {
      failures.push({ parameter: 'Ash', value: qcResult.ash, limit: standard.ash_max, unit: '% max' })
    }

    // Nitrogen
    if (qcResult.nitrogen !== undefined && qcResult.nitrogen > standard.nitrogen_max) {
      failures.push({ parameter: 'Nitrogen', value: qcResult.nitrogen, limit: standard.nitrogen_max, unit: '% max' })
    }

    // Volatile matter
    if (qcResult.volatile !== undefined && qcResult.volatile > standard.volatile_matter_max) {
      failures.push({ parameter: 'Volatile', value: qcResult.volatile, limit: standard.volatile_matter_max, unit: '% max' })
    }

    // PRI (min)
    if (qcResult.pri !== undefined && standard.pri_min && qcResult.pri < standard.pri_min) {
      failures.push({ parameter: 'PRI', value: qcResult.pri, limit: standard.pri_min, unit: 'min' })
    }

    // Mooney (max)
    if (qcResult.mooney !== undefined && standard.mooney_max && qcResult.mooney > standard.mooney_max) {
      failures.push({ parameter: 'Mooney', value: qcResult.mooney, limit: standard.mooney_max, unit: 'max' })
    }

    // Moisture
    if (qcResult.moisture !== undefined && qcResult.moisture > standard.moisture_max) {
      failures.push({ parameter: 'Moisture', value: qcResult.moisture, limit: standard.moisture_max, unit: '% max' })
    }

    // Color Lovibond
    if (qcResult.color !== undefined && standard.color_lovibond_max && qcResult.color > standard.color_lovibond_max) {
      failures.push({ parameter: 'Color', value: qcResult.color, limit: standard.color_lovibond_max, unit: 'max' })
    }

    // Xác định grade thực tế dựa trên DRC
    const grade_confirmed = qcResult.drc !== undefined
      ? this.classifyByDRC(qcResult.drc)
      : grade

    return {
      passed: failures.length === 0,
      failures,
      grade_confirmed,
    }
  },

  /**
   * Lấy DRC range cho 1 grade (dùng cho picking filter)
   */
  async getDRCRangeForGrade(grade: RubberGrade): Promise<{ min: number; max: number } | null> {
    const standard = await this.getByGrade(grade)
    if (!standard) return null
    return {
      min: standard.drc_min,
      max: standard.drc_max || 100,
    }
  },
}

export default rubberGradeService
