// ============================================================================
// FORECAST SERVICE
// File: src/services/wms/forecastService.ts
// Module: Kho (WMS) - Huy Anh Rubber ERP
// Phase 11: Dự báo tồn kho & cấu hình cảnh báo
// Mô tả: Dự báo tồn kho theo grade và tổng thể
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface GradeForecast {
  grade: string
  current_stock_kg: number
  avg_daily_consumption_kg: number
  days_until_empty: number | null
  forecast_date_empty: string | null
  recommendation: 'OK' | 'LOW' | 'CRITICAL' | 'NO_DATA'
}

export interface TotalForecast {
  current_total_kg: number
  avg_daily_in_kg: number
  avg_daily_out_kg: number
  net_daily_change_kg: number
  forecast_30_days_kg: number
}

export interface AlertConfig {
  // Hao hụt
  shrinkage_warning_pct: number     // default 5
  shrinkage_critical_pct: number    // default 10
  // Lưu kho
  storage_warning_days: number      // default 30
  storage_critical_days: number     // default 60
  // Hết hạn
  expiry_warning_days: number       // default 7
  // Dự báo
  forecast_days: number             // default 30
  stockout_warning_days: number     // default 7
  // C3: DRC warning range (%)
  drc_warning_min: number           // default 55 — dưới mức này là warning
  drc_warning_max: number           // default 70 — trên mức này là warning
  drc_critical_min: number          // default 50 — dưới mức này là critical
  drc_critical_max: number          // default 75 — trên mức này là critical
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  shrinkage_warning_pct: 5,
  shrinkage_critical_pct: 10,
  storage_warning_days: 30,
  storage_critical_days: 60,
  expiry_warning_days: 7,
  forecast_days: 30,
  stockout_warning_days: 7,
  drc_warning_min: 55,
  drc_warning_max: 70,
  drc_critical_min: 50,
  drc_critical_max: 75,
}

const ALERT_CONFIG_KEY = 'wms_alert_config'

// ============================================================================
// HELPERS
// ============================================================================

function getAlertConfig(): AlertConfig {
  try {
    const stored = localStorage.getItem(ALERT_CONFIG_KEY)
    if (stored) {
      return { ...DEFAULT_ALERT_CONFIG, ...JSON.parse(stored) }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_ALERT_CONFIG }
}

// ============================================================================
// SERVICE
// ============================================================================

export const forecastService = {
  /**
   * Forecast stock levels for each grade
   */
  async forecastByGrade(days?: number): Promise<GradeForecast[]> {
    const config = getAlertConfig()
    const forecastDays = days || config.forecast_days || 30

    // 1. Get current stock by grade
    const { data: batchData, error: batchErr } = await supabase
      .from('stock_batches')
      .select('rubber_grade, quantity_remaining')
      .eq('status', 'active')
      .gt('quantity_remaining', 0)

    if (batchErr) throw batchErr

    // Group current stock by grade
    const gradeStock: Record<string, number> = {}
    for (const row of batchData || []) {
      const grade = (row as any).rubber_grade || 'unknown'
      const qty = Number((row as any).quantity_remaining) || 0
      gradeStock[grade] = (gradeStock[grade] || 0) + qty
    }

    // 2. Get stock-out transactions from last 30 days for consumption rate
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const fromDate = thirtyDaysAgo.toISOString().substring(0, 10)

    const { data: txData, error: txErr } = await supabase
      .from('inventory_transactions')
      .select('quantity, created_at, batch_id')
      .eq('type', 'out')
      .gte('created_at', fromDate)

    if (txErr) throw txErr

    // We need to join batch info to get grade — fetch batch grades
    const batchIds = [...new Set((txData || []).map((t: any) => t.batch_id).filter(Boolean))]
    let batchGradeMap: Record<string, string> = {}

    if (batchIds.length > 0) {
      // Fetch in chunks if needed
      const { data: batchGrades, error: bgErr } = await supabase
        .from('stock_batches')
        .select('id, rubber_grade')
        .in('id', batchIds.slice(0, 500))

      if (!bgErr && batchGrades) {
        for (const b of batchGrades) {
          batchGradeMap[(b as any).id] = (b as any).rubber_grade || 'unknown'
        }
      }
    }

    // Calculate daily consumption per grade (over 30 days)
    const gradeConsumption: Record<string, number> = {}
    for (const tx of txData || []) {
      const batchId = (tx as any).batch_id as string
      const grade = batchGradeMap[batchId] || 'unknown'
      const qty = Number((tx as any).quantity) || 0
      gradeConsumption[grade] = (gradeConsumption[grade] || 0) + qty
    }

    // Build forecasts
    const allGrades = new Set([...Object.keys(gradeStock), ...Object.keys(gradeConsumption)])
    const results: GradeForecast[] = []

    for (const grade of allGrades) {
      if (grade === 'unknown' && !gradeStock[grade]) continue

      const current_stock_kg = gradeStock[grade] || 0
      const totalConsumed = gradeConsumption[grade] || 0
      const avg_daily_consumption_kg = Math.round((totalConsumed / 30) * 100) / 100

      let days_until_empty: number | null = null
      let forecast_date_empty: string | null = null
      let recommendation: GradeForecast['recommendation'] = 'NO_DATA'

      if (avg_daily_consumption_kg > 0) {
        days_until_empty = Math.round(current_stock_kg / avg_daily_consumption_kg)
        const emptyDate = new Date()
        emptyDate.setDate(emptyDate.getDate() + days_until_empty)
        forecast_date_empty = emptyDate.toISOString().substring(0, 10)

        if (days_until_empty <= config.stockout_warning_days) {
          recommendation = 'CRITICAL'
        } else if (days_until_empty <= config.stockout_warning_days * 3) {
          recommendation = 'LOW'
        } else {
          recommendation = 'OK'
        }
      } else if (current_stock_kg > 0) {
        recommendation = 'OK'
      }

      results.push({
        grade,
        current_stock_kg: Math.round(current_stock_kg * 100) / 100,
        avg_daily_consumption_kg,
        days_until_empty,
        forecast_date_empty,
        recommendation,
      })
    }

    return results.sort((a, b) => {
      // Sort CRITICAL first, then LOW, then OK, then NO_DATA
      const order = { CRITICAL: 0, LOW: 1, OK: 2, NO_DATA: 3 }
      return (order[a.recommendation] || 3) - (order[b.recommendation] || 3)
    })
  },

  /**
   * Forecast total inventory
   */
  async forecastTotal(days?: number): Promise<TotalForecast> {
    const config = getAlertConfig()
    const forecastDays = days || config.forecast_days || 30

    // 1. Current total stock
    const { data: batchData, error: batchErr } = await supabase
      .from('stock_batches')
      .select('quantity_remaining')
      .eq('status', 'active')
      .gt('quantity_remaining', 0)

    if (batchErr) throw batchErr

    const current_total_kg = (batchData || []).reduce(
      (s, b) => s + (Number((b as any).quantity_remaining) || 0), 0
    )

    // 2. Get transactions from last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const fromDate = thirtyDaysAgo.toISOString().substring(0, 10)

    const { data: txData, error: txErr } = await supabase
      .from('inventory_transactions')
      .select('type, quantity')
      .gte('created_at', fromDate)

    if (txErr) throw txErr

    let totalIn = 0
    let totalOut = 0
    for (const tx of txData || []) {
      const qty = Number((tx as any).quantity) || 0
      const type = (tx as any).type as string
      if (type === 'in' || type === 'blend_in') totalIn += qty
      else if (type === 'out' || type === 'blend_out') totalOut += qty
    }

    const avg_daily_in_kg = Math.round((totalIn / 30) * 100) / 100
    const avg_daily_out_kg = Math.round((totalOut / 30) * 100) / 100
    const net_daily_change_kg = Math.round((avg_daily_in_kg - avg_daily_out_kg) * 100) / 100
    const forecast_30_days_kg = Math.round(
      (current_total_kg + net_daily_change_kg * forecastDays) * 100
    ) / 100

    return {
      current_total_kg: Math.round(current_total_kg * 100) / 100,
      avg_daily_in_kg,
      avg_daily_out_kg,
      net_daily_change_kg,
      forecast_30_days_kg,
    }
  },

  /**
   * Get alert config from localStorage
   */
  getConfig(): AlertConfig {
    return getAlertConfig()
  },

  /**
   * Save alert config to localStorage
   */
  saveConfig(config: AlertConfig): void {
    localStorage.setItem(ALERT_CONFIG_KEY, JSON.stringify(config))
  },

  /**
   * Reset config to defaults
   */
  resetConfig(): AlertConfig {
    localStorage.removeItem(ALERT_CONFIG_KEY)
    return { ...DEFAULT_ALERT_CONFIG }
  },
}

export default forecastService
