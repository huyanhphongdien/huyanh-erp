// ============================================================================
// WMS REPORT SERVICE
// File: src/services/wms/wmsReportService.ts
// Module: Kho Thanh Pham (WMS) - Huy Anh Rubber ERP
// Phase: P10 - Bao cao (Reports)
// Mo ta: Bao cao XNT, san xuat, chat luong dai ly, DRC trend, tồn kho
// ============================================================================

import { supabase } from '../../lib/supabase'
import type {
  StockMovementReport,
  GradeProductionReport,
  SupplierQualityReport,
  DRCTrendReport,
  InventoryValueReport,
} from './wms.types'

// ============================================================================
// SERVICE
// ============================================================================

export const wmsReportService = {
  // 1. Stock Movement Report (XNT)
  async getStockMovementReport(params: {
    material_id?: string
    warehouse_id?: string
    from_date: string
    to_date: string
  }): Promise<StockMovementReport[]> {
    let query = supabase
      .from('inventory_transactions')
      .select('type, quantity, created_at')
      .gte('created_at', params.from_date)
      .lte('created_at', params.to_date + 'T23:59:59')
      .order('created_at', { ascending: true })

    if (params.material_id) query = query.eq('material_id', params.material_id)
    if (params.warehouse_id) query = query.eq('warehouse_id', params.warehouse_id)

    const { data, error } = await query
    if (error) throw error

    // Group by date
    const dayMap: Record<string, StockMovementReport> = {}
    for (const row of data || []) {
      const date = (row as any).created_at?.substring(0, 10) || ''
      if (!dayMap[date]) {
        dayMap[date] = { date, in_quantity: 0, out_quantity: 0, adjust_quantity: 0, blend_in_quantity: 0, blend_out_quantity: 0, balance: 0 }
      }
      const qty = Number((row as any).quantity) || 0
      const type = (row as any).type as string
      if (type === 'in') dayMap[date].in_quantity += qty
      else if (type === 'out') dayMap[date].out_quantity += qty
      else if (type === 'adjust') dayMap[date].adjust_quantity += qty
      else if (type === 'blend_in') dayMap[date].blend_in_quantity += qty
      else if (type === 'blend_out') dayMap[date].blend_out_quantity += qty
    }

    // Calculate running balance
    const sorted = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date))
    let balance = 0
    for (const row of sorted) {
      balance += row.in_quantity + row.blend_in_quantity - row.out_quantity - row.blend_out_quantity + row.adjust_quantity
      row.balance = balance
    }
    return sorted
  },

  // 2. Grade Production Report
  async getGradeProductionReport(params: {
    from_date: string
    to_date: string
  }): Promise<GradeProductionReport[]> {
    // Query completed production orders
    const { data: prodData, error: prodErr } = await supabase
      .from('production_orders')
      .select('id, target_grade, target_quantity, actual_quantity, yield_percent, final_drc')
      .eq('status', 'completed')
      .gte('created_at', params.from_date)
      .lte('created_at', params.to_date + 'T23:59:59')

    if (prodErr) throw prodErr

    // Query completed blend orders
    const { data: blendData, error: blendErr } = await supabase
      .from('blend_orders')
      .select('id, target_grade, target_quantity_kg, actual_quantity_kg, actual_drc')
      .eq('status', 'completed')
      .gte('created_at', params.from_date)
      .lte('created_at', params.to_date + 'T23:59:59')

    if (blendErr) throw blendErr

    // Group by grade
    const gradeMap: Record<string, {
      production_count: number
      total_input_kg: number
      total_output_kg: number
      yield_sum: number
      drc_sum: number
      drc_count: number
      blend_count: number
    }> = {}

    for (const p of prodData || []) {
      const grade = (p as any).target_grade || 'unknown'
      if (!gradeMap[grade]) gradeMap[grade] = { production_count: 0, total_input_kg: 0, total_output_kg: 0, yield_sum: 0, drc_sum: 0, drc_count: 0, blend_count: 0 }
      gradeMap[grade].production_count++
      gradeMap[grade].total_input_kg += Number((p as any).target_quantity) || 0
      gradeMap[grade].total_output_kg += Number((p as any).actual_quantity) || 0
      if ((p as any).yield_percent) { gradeMap[grade].yield_sum += Number((p as any).yield_percent); gradeMap[grade].drc_count++ }
      if ((p as any).final_drc) { gradeMap[grade].drc_sum += Number((p as any).final_drc) }
    }

    for (const b of blendData || []) {
      const grade = (b as any).target_grade || 'unknown'
      if (!gradeMap[grade]) gradeMap[grade] = { production_count: 0, total_input_kg: 0, total_output_kg: 0, yield_sum: 0, drc_sum: 0, drc_count: 0, blend_count: 0 }
      gradeMap[grade].blend_count++
      gradeMap[grade].total_output_kg += Number((b as any).actual_quantity_kg) || 0
    }

    return Object.entries(gradeMap).map(([grade, d]) => ({
      grade,
      production_count: d.production_count,
      total_input_kg: d.total_input_kg,
      total_output_kg: d.total_output_kg,
      avg_yield_percent: d.drc_count > 0 ? Math.round((d.yield_sum / d.drc_count) * 100) / 100 : 0,
      avg_drc: d.drc_count > 0 ? Math.round((d.drc_sum / d.drc_count) * 100) / 100 : 0,
      blend_count: d.blend_count,
    }))
  },

  // 3. Supplier Quality Report
  async getSupplierQualityReport(params: {
    from_date?: string
    to_date?: string
  }): Promise<SupplierQualityReport[]> {
    let query = supabase
      .from('stock_batches')
      .select('supplier_name, supplier_region, quantity_remaining, initial_drc, latest_drc, qc_status')
      .not('supplier_name', 'is', null)

    if (params.from_date) query = query.gte('created_at', params.from_date)
    if (params.to_date) query = query.lte('created_at', params.to_date + 'T23:59:59')

    const { data, error } = await query
    if (error) throw error

    // Group by supplier_name
    const supplierMap: Record<string, {
      supplier_region: string
      batch_count: number
      total_weight_kg: number
      drc_values: number[]
      passed_count: number
      warning_count: number
      failed_count: number
    }> = {}

    for (const row of data || []) {
      const name = (row as any).supplier_name as string
      if (!name) continue
      if (!supplierMap[name]) {
        supplierMap[name] = {
          supplier_region: (row as any).supplier_region || '',
          batch_count: 0, total_weight_kg: 0, drc_values: [],
          passed_count: 0, warning_count: 0, failed_count: 0,
        }
      }
      const s = supplierMap[name]
      s.batch_count++
      s.total_weight_kg += Number((row as any).quantity_remaining) || 0
      const drc = Number((row as any).latest_drc || (row as any).initial_drc)
      if (drc) s.drc_values.push(drc)
      const qc = (row as any).qc_status as string
      if (qc === 'passed') s.passed_count++
      else if (qc === 'warning') s.warning_count++
      else if (qc === 'failed' || qc === 'needs_blend') s.failed_count++
    }

    return Object.entries(supplierMap).map(([name, s]) => ({
      supplier_name: name,
      supplier_region: s.supplier_region,
      batch_count: s.batch_count,
      total_weight_kg: s.total_weight_kg,
      avg_drc: s.drc_values.length > 0 ? Math.round((s.drc_values.reduce((a, b) => a + b, 0) / s.drc_values.length) * 100) / 100 : 0,
      drc_min: s.drc_values.length > 0 ? Math.min(...s.drc_values) : 0,
      drc_max: s.drc_values.length > 0 ? Math.max(...s.drc_values) : 0,
      passed_count: s.passed_count,
      warning_count: s.warning_count,
      failed_count: s.failed_count,
      pass_rate: s.batch_count > 0 ? Math.round((s.passed_count / s.batch_count) * 10000) / 100 : 0,
    })).sort((a, b) => b.pass_rate - a.pass_rate)
  },

  // 4. DRC Trend Report
  async getDRCTrendReport(params: {
    from_date: string
    to_date: string
    material_id?: string
  }): Promise<DRCTrendReport[]> {
    let query = supabase
      .from('batch_qc_results')
      .select('drc_value, tested_at, grade_tested')
      .gte('tested_at', params.from_date)
      .lte('tested_at', params.to_date + 'T23:59:59')
      .not('drc_value', 'is', null)
      .order('tested_at', { ascending: true })

    const { data, error } = await query
    if (error) throw error

    // Group by date
    const dayMap: Record<string, { drc_sum: number; count: number; grades: Record<string, number> }> = {}
    for (const row of data || []) {
      const date = ((row as any).tested_at as string)?.substring(0, 10) || ''
      if (!dayMap[date]) dayMap[date] = { drc_sum: 0, count: 0, grades: {} }
      const drc = Number((row as any).drc_value) || 0
      dayMap[date].drc_sum += drc
      dayMap[date].count++
      const grade = (row as any).grade_tested || 'unknown'
      dayMap[date].grades[grade] = (dayMap[date].grades[grade] || 0) + 1
    }

    return Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        avg_drc: d.count > 0 ? Math.round((d.drc_sum / d.count) * 100) / 100 : 0,
        batch_count: d.count,
        grade_breakdown: d.grades,
      }))
  },

  // 5. Inventory Value Report
  async getInventoryValueReport(params: {
    warehouse_id?: string
    grade?: string
  }): Promise<InventoryValueReport[]> {
    let query = supabase
      .from('stock_batches')
      .select('material_id, quantity_remaining, dry_weight, latest_drc, initial_drc, rubber_grade, warehouse_id, material:materials!material_id(id, sku, name), warehouse:warehouses!warehouse_id(name)')
      .eq('status', 'active')
      .gt('quantity_remaining', 0)

    if (params.warehouse_id) query = query.eq('warehouse_id', params.warehouse_id)
    if (params.grade) query = query.eq('rubber_grade', params.grade)

    const { data, error } = await query
    if (error) throw error

    // Group by material_id
    const matMap: Record<string, {
      material_name: string
      material_sku: string
      rubber_grade: string
      total_quantity_kg: number
      total_dry_weight_kg: number
      drc_sum: number
      drc_count: number
      batch_count: number
      warehouses: Record<string, number>
    }> = {}

    for (const row of data || []) {
      const r = row as any
      const mid = r.material_id as string
      if (!matMap[mid]) {
        matMap[mid] = {
          material_name: r.material?.name || '',
          material_sku: r.material?.sku || '',
          rubber_grade: r.rubber_grade || '',
          total_quantity_kg: 0,
          total_dry_weight_kg: 0,
          drc_sum: 0, drc_count: 0,
          batch_count: 0,
          warehouses: {},
        }
      }
      const m = matMap[mid]
      m.batch_count++
      const qty = Number(r.quantity_remaining) || 0
      m.total_quantity_kg += qty
      m.total_dry_weight_kg += Number(r.dry_weight) || 0
      const drc = Number(r.latest_drc || r.initial_drc)
      if (drc) { m.drc_sum += drc; m.drc_count++ }
      const whName = r.warehouse?.name || 'Unknown'
      m.warehouses[whName] = (m.warehouses[whName] || 0) + qty
    }

    return Object.entries(matMap).map(([mid, m]) => ({
      material_id: mid,
      material_name: m.material_name,
      material_sku: m.material_sku,
      rubber_grade: m.rubber_grade,
      total_quantity_kg: m.total_quantity_kg,
      total_dry_weight_kg: m.total_dry_weight_kg,
      avg_drc: m.drc_count > 0 ? Math.round((m.drc_sum / m.drc_count) * 100) / 100 : 0,
      batch_count: m.batch_count,
      warehouse_breakdown: Object.entries(m.warehouses).map(([name, qty]) => ({ warehouse_name: name, quantity_kg: qty })),
    }))
  },

  // 6. Summary KPIs
  async getWMSSummaryKPIs(params: {
    from_date: string
    to_date: string
  }): Promise<{
    total_stock_in_kg: number
    total_stock_out_kg: number
    total_production_kg: number
    total_blend_kg: number
    avg_yield_percent: number
    avg_drc: number
    total_batches_active: number
    total_alerts: number
    grade_distribution: Record<string, number>
  }> {
    const toEnd = params.to_date + 'T23:59:59'

    // Parallel queries
    const [txRes, prodRes, blendRes, batchRes] = await Promise.all([
      // Inventory transactions in range
      supabase.from('inventory_transactions')
        .select('type, quantity')
        .gte('created_at', params.from_date)
        .lte('created_at', toEnd),
      // Production orders completed in range
      supabase.from('production_orders')
        .select('actual_quantity, yield_percent')
        .eq('status', 'completed')
        .gte('created_at', params.from_date)
        .lte('created_at', toEnd),
      // Blend orders completed in range
      supabase.from('blend_orders')
        .select('actual_quantity_kg')
        .eq('status', 'completed')
        .gte('created_at', params.from_date)
        .lte('created_at', toEnd),
      // Active batches
      supabase.from('stock_batches')
        .select('id, rubber_grade, quantity_remaining, latest_drc, initial_drc')
        .eq('status', 'active')
        .gt('quantity_remaining', 0),
    ])

    // Stock in/out totals
    let total_stock_in_kg = 0
    let total_stock_out_kg = 0
    for (const row of txRes.data || []) {
      const qty = Number((row as any).quantity) || 0
      if ((row as any).type === 'in' || (row as any).type === 'blend_in') total_stock_in_kg += qty
      else if ((row as any).type === 'out' || (row as any).type === 'blend_out') total_stock_out_kg += qty
    }

    // Production totals
    let total_production_kg = 0
    let yield_sum = 0
    let yield_count = 0
    for (const row of prodRes.data || []) {
      total_production_kg += Number((row as any).actual_quantity) || 0
      const yld = Number((row as any).yield_percent)
      if (yld) { yield_sum += yld; yield_count++ }
    }

    // Blend totals
    let total_blend_kg = 0
    for (const row of blendRes.data || []) {
      total_blend_kg += Number((row as any).actual_quantity_kg) || 0
    }

    // Active batch stats
    let drc_sum = 0
    let drc_count = 0
    const grade_distribution: Record<string, number> = {}
    let total_alerts = 0
    for (const row of batchRes.data || []) {
      const r = row as any
      const drc = Number(r.latest_drc || r.initial_drc)
      if (drc) { drc_sum += drc; drc_count++ }
      const grade = r.rubber_grade || 'unknown'
      grade_distribution[grade] = (grade_distribution[grade] || 0) + (Number(r.quantity_remaining) || 0)
    }

    return {
      total_stock_in_kg,
      total_stock_out_kg,
      total_production_kg,
      total_blend_kg,
      avg_yield_percent: yield_count > 0 ? Math.round((yield_sum / yield_count) * 100) / 100 : 0,
      avg_drc: drc_count > 0 ? Math.round((drc_sum / drc_count) * 100) / 100 : 0,
      total_batches_active: batchRes.data?.length || 0,
      total_alerts,
      grade_distribution,
    }
  },
}

export default wmsReportService
