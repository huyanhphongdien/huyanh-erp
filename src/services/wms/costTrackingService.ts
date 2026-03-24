// ============================================================================
// FILE: src/services/wms/costTrackingService.ts
// MODULE: Kho Thành Phẩm (WMS) — Huy Anh Rubber ERP
// PHASE: P8 — Cost Tracking (Theo dõi giá vốn)
// MÔ TẢ: Quản lý giá vốn lô hàng, tính COGS sản xuất, định giá tồn kho
// BẢNG: stock_batches, production_orders, b2b_deals
// ============================================================================

import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

export interface ProductionCostResult {
  total_input_cost: number
  total_output_kg: number
  cost_per_kg_output: number
}

export interface InventoryValuation {
  total_value: number
  by_grade: Array<{
    grade: string
    weight_kg: number
    avg_cost: number
    total_value: number
  }>
  by_warehouse: Array<{
    warehouse: string
    total_value: number
  }>
}

export interface CostTrendItem {
  month: string
  avg_cost: number
}

// ============================================================================
// SERVICE
// ============================================================================

export const costTrackingService = {

  // --------------------------------------------------------------------------
  // SET COST — Gán giá vốn cho 1 lô hàng
  // --------------------------------------------------------------------------

  /**
   * Gán giá vốn trên mỗi kg cho lô hàng (từ deal.unit_price hoặc nhập tay)
   * Tự động tính total_cost = cost_per_kg × quantity_remaining
   */
  async setBatchCost(batchId: string, costPerKg: number): Promise<void> {
    // Lấy quantity để tính total_cost
    const { data: batch, error: fetchErr } = await supabase
      .from('stock_batches')
      .select('id, quantity_remaining, initial_quantity, current_weight, initial_weight')
      .eq('id', batchId)
      .single()

    if (fetchErr) throw fetchErr
    if (!batch) throw new Error('Không tìm thấy lô hàng')

    // Tính total_cost dựa trên trọng lượng (ưu tiên current_weight > initial_weight > quantity)
    const weightKg = batch.current_weight || batch.initial_weight || batch.quantity_remaining || 0
    const totalCost = Math.round(costPerKg * weightKg * 100) / 100

    const { error: updateErr } = await supabase
      .from('stock_batches')
      .update({
        cost_per_kg: costPerKg,
        total_cost: totalCost,
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId)

    if (updateErr) throw updateErr
  },

  // --------------------------------------------------------------------------
  // AUTO SET COST FROM DEAL — Lấy giá từ deal B2B khi nhập kho
  // --------------------------------------------------------------------------

  /**
   * Tự động gán giá vốn từ deal.unit_price khi xác nhận phiếu nhập kho
   * Gọi sau khi confirmStockIn thành công
   */
  async autoSetCostFromDeal(batchId: string, dealId: string): Promise<void> {
    // Lấy giá từ deal
    const { data: deal, error: dealErr } = await supabase
      .from('b2b_deals')
      .select('id, unit_price, price_unit')
      .eq('id', dealId)
      .single()

    if (dealErr) throw dealErr
    if (!deal) throw new Error('Không tìm thấy deal')

    const unitPrice = Number(deal.unit_price)
    if (!unitPrice || unitPrice <= 0) {
      console.warn(`Deal ${dealId} không có unit_price, bỏ qua auto set cost`)
      return
    }

    // unit_price từ deal thường là VNĐ/kg
    await this.setBatchCost(batchId, unitPrice)
  },

  // --------------------------------------------------------------------------
  // CALCULATE PRODUCTION COST — Tính giá vốn sản xuất (COGS)
  // --------------------------------------------------------------------------

  /**
   * Tính chi phí sản xuất cho 1 lệnh sản xuất:
   * - total_input_cost = sum(input_batches.total_cost)
   * - total_output_kg = sum(output_batches.quantity)
   * - cost_per_kg_output = total_input_cost / total_output_kg
   * Lưu kết quả vào production_orders
   */
  async calculateProductionCost(productionOrderId: string): Promise<ProductionCostResult> {
    // Lấy lệnh sản xuất + input/output batches
    const { data: order, error: orderErr } = await supabase
      .from('production_orders')
      .select('id, status')
      .eq('id', productionOrderId)
      .single()

    if (orderErr) throw orderErr
    if (!order) throw new Error('Không tìm thấy lệnh sản xuất')

    // Lấy input batches (NVL) — các lô được sử dụng làm nguyên liệu
    const { data: inputBatches } = await supabase
      .from('stock_batches')
      .select('id, cost_per_kg, total_cost, initial_weight, current_weight, quantity_remaining')
      .eq('production_order_id', productionOrderId)
      .eq('batch_type', 'input')

    // Lấy output batches (thành phẩm) — các lô sản xuất ra
    const { data: outputBatches } = await supabase
      .from('stock_batches')
      .select('id, initial_weight, current_weight, quantity_remaining')
      .eq('production_order_id', productionOrderId)
      .eq('batch_type', 'production')

    // Tính tổng chi phí NVL đầu vào
    let totalInputCost = 0
    for (const batch of (inputBatches || [])) {
      totalInputCost += Number(batch.total_cost) || 0
    }

    // Tính tổng KG đầu ra
    let totalOutputKg = 0
    for (const batch of (outputBatches || [])) {
      totalOutputKg += Number(batch.current_weight || batch.initial_weight || batch.quantity_remaining) || 0
    }

    // Tính giá vốn trên mỗi kg đầu ra
    const costPerKgOutput = totalOutputKg > 0
      ? Math.round((totalInputCost / totalOutputKg) * 10000) / 10000
      : 0

    // Lưu kết quả vào production_orders
    const { error: updateErr } = await supabase
      .from('production_orders')
      .update({
        total_input_cost: Math.round(totalInputCost * 100) / 100,
        total_output_cost: Math.round(totalInputCost * 100) / 100, // Giá trị output = chi phí input
        cost_per_kg_output: costPerKgOutput,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productionOrderId)

    if (updateErr) throw updateErr

    // Gán cost_per_kg cho các lô output
    if (costPerKgOutput > 0) {
      for (const batch of (outputBatches || [])) {
        await this.setBatchCost(batch.id, costPerKgOutput)
      }
    }

    return {
      total_input_cost: Math.round(totalInputCost * 100) / 100,
      total_output_kg: totalOutputKg,
      cost_per_kg_output: costPerKgOutput,
    }
  },

  // --------------------------------------------------------------------------
  // INVENTORY VALUATION — Định giá tồn kho
  // --------------------------------------------------------------------------

  /**
   * Tính giá trị tồn kho hiện tại
   * Nhóm theo grade và warehouse
   */
  async getInventoryValuation(warehouseId?: string): Promise<InventoryValuation> {
    let query = supabase
      .from('stock_batches')
      .select(`
        id, quantity_remaining, current_weight, initial_weight,
        cost_per_kg, total_cost, rubber_grade,
        warehouse:warehouses!warehouse_id(name)
      `)
      .eq('status', 'active')
      .gt('quantity_remaining', 0)

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId)
    }

    const { data: batches, error } = await query
    if (error) throw error

    let totalValue = 0
    const gradeMap: Record<string, { weight_kg: number; total_value: number; cost_sum: number; count: number }> = {}
    const whMap: Record<string, number> = {}

    for (const batch of (batches || []) as any[]) {
      const weightKg = Number(batch.current_weight || batch.initial_weight || batch.quantity_remaining) || 0
      const costPerKg = Number(batch.cost_per_kg) || 0
      const batchValue = Number(batch.total_cost) || (costPerKg * weightKg)

      totalValue += batchValue

      // Nhóm theo grade
      const grade = batch.rubber_grade || 'Chưa phân loại'
      if (!gradeMap[grade]) {
        gradeMap[grade] = { weight_kg: 0, total_value: 0, cost_sum: 0, count: 0 }
      }
      gradeMap[grade].weight_kg += weightKg
      gradeMap[grade].total_value += batchValue
      if (costPerKg > 0) {
        gradeMap[grade].cost_sum += costPerKg
        gradeMap[grade].count++
      }

      // Nhóm theo kho
      const whName = batch.warehouse?.name || 'Không rõ'
      whMap[whName] = (whMap[whName] || 0) + batchValue
    }

    return {
      total_value: Math.round(totalValue * 100) / 100,
      by_grade: Object.entries(gradeMap).map(([grade, g]) => ({
        grade,
        weight_kg: g.weight_kg,
        avg_cost: g.count > 0 ? Math.round((g.cost_sum / g.count) * 10000) / 10000 : 0,
        total_value: Math.round(g.total_value * 100) / 100,
      })),
      by_warehouse: Object.entries(whMap).map(([warehouse, value]) => ({
        warehouse,
        total_value: Math.round(value * 100) / 100,
      })),
    }
  },

  // --------------------------------------------------------------------------
  // COST TREND — Xu hướng giá vốn theo tháng
  // --------------------------------------------------------------------------

  /**
   * Lấy giá vốn trung bình mỗi kg theo tháng (dùng received_date của lô)
   * @param months Số tháng gần nhất (mặc định 12)
   */
  async getCostTrend(months: number = 12): Promise<CostTrendItem[]> {
    // Tính ngày bắt đầu
    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - months)
    const startStr = startDate.toISOString().split('T')[0]

    const { data: batches, error } = await supabase
      .from('stock_batches')
      .select('received_date, cost_per_kg')
      .not('cost_per_kg', 'is', null)
      .gt('cost_per_kg', 0)
      .gte('received_date', startStr)
      .order('received_date', { ascending: true })

    if (error) throw error

    // Nhóm theo tháng (YYYY-MM)
    const monthMap: Record<string, { sum: number; count: number }> = {}

    for (const batch of (batches || [])) {
      if (!batch.received_date) continue
      const month = (batch.received_date as string).substring(0, 7) // YYYY-MM
      if (!monthMap[month]) {
        monthMap[month] = { sum: 0, count: 0 }
      }
      monthMap[month].sum += Number(batch.cost_per_kg)
      monthMap[month].count++
    }

    return Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, m]) => ({
        month,
        avg_cost: Math.round((m.sum / m.count) * 10000) / 10000,
      }))
  },
}

export default costTrackingService
