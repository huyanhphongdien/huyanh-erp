// ============================================================================
// SALES DASHBOARD SERVICE — Dữ liệu tổng quan bán hàng
// File: src/services/sales/salesDashboardService.ts
// Module Bán hàng quốc tế — Huy Anh Rubber ERP
// Primary color: #1B4D3E
// ============================================================================

import { supabase } from '../../lib/supabase'
import type { SalesOrderStatus } from './salesTypes'
import { ORDER_STATUS_LABELS } from './salesTypes'
import { toDateStrVN } from '../../utils/dateVN'

export type DashboardPeriod = 'month' | 'quarter' | 'year'

/**
 * Mốc kỳ (chuỗi 'YYYY-MM-DD' theo GIỜ VN) — dùng chung cho KPI và Top khách hàng để hai widget
 * cùng một kỳ. Trước 17/11/2026 dùng toISOString() (UTC) → ngày 1 của tháng thành ngày cuối tháng
 * trước (UTC+7), KPI "tháng này" ăn lấn sang tháng trước 1 ngày.
 */
function periodRange(dateRange: DashboardPeriod): { start: string; lastStart: string; lastEnd: string } {
  const now = new Date()
  let periodStart: Date
  let lastPeriodStart: Date
  let lastPeriodEnd: Date
  if (dateRange === 'month') {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    lastPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    lastPeriodEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  } else if (dateRange === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    periodStart = new Date(now.getFullYear(), q * 3, 1)
    lastPeriodStart = new Date(now.getFullYear(), (q - 1) * 3, 1)
    lastPeriodEnd = new Date(now.getFullYear(), q * 3, 0)
  } else {
    periodStart = new Date(now.getFullYear(), 0, 1)
    lastPeriodStart = new Date(now.getFullYear() - 1, 0, 1)
    lastPeriodEnd = new Date(now.getFullYear() - 1, 11, 31)
  }
  return {
    start: toDateStrVN(periodStart),
    lastStart: toDateStrVN(lastPeriodStart),
    lastEnd: toDateStrVN(lastPeriodEnd),
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface MonthlyRevenue {
  month: string      // YYYY-MM
  label: string      // "T1", "T2", ...
  revenue: number    // USD
  order_count: number
}

export interface GradeDistribution {
  grade: string
  quantity_tons: number
  value_usd: number
  order_count: number
  percentage: number
}

export interface TopCustomer {
  customer_id: string
  name: string
  country: string | null
  order_count: number
  total_revenue: number
}

export interface PipelineStage {
  status: SalesOrderStatus
  label: string
  count: number
  value_usd: number
}

// ============================================================================
// SERVICE
// ============================================================================

export const salesDashboardService = {
  // ==========================================================================
  // MONTHLY REVENUE — Doanh thu theo tháng (N tháng gần nhất)
  // ==========================================================================

  async getMonthlyRevenue(months: number = 6): Promise<MonthlyRevenue[]> {
    const now = new Date()
    const results: MonthlyRevenue[] = []

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const year = d.getFullYear()
      const month = d.getMonth()

      const firstDay = toDateStrVN(new Date(year, month, 1))
      const lastDay = toDateStrVN(new Date(year, month + 1, 0))

      const { data } = await supabase
        .from('sales_orders')
        .select('total_value_usd')
        .gte('order_date', firstDay)
        .lte('order_date', lastDay)
        .neq('status', 'cancelled')

      const revenue = (data || []).reduce(
        (sum: number, o: { total_value_usd: number | null }) => sum + (o.total_value_usd || 0),
        0,
      )

      results.push({
        month: `${year}-${String(month + 1).padStart(2, '0')}`,
        label: `T${month + 1}`,
        revenue,
        order_count: data?.length || 0,
      })
    }

    return results
  },

  // ==========================================================================
  // GRADE DISTRIBUTION — Phân bố theo cấp mủ
  // ==========================================================================

  async getGradeDistribution(): Promise<GradeDistribution[]> {
    const { data } = await supabase
      .from('sales_orders')
      .select('grade, quantity_tons, total_value_usd')
      .neq('status', 'cancelled')

    if (!data || data.length === 0) return []

    // Group by grade
    const gradeMap: Record<string, { quantity_tons: number; value_usd: number; order_count: number }> = {}

    for (const order of data) {
      const grade = order.grade || 'Khác'
      if (!gradeMap[grade]) {
        gradeMap[grade] = { quantity_tons: 0, value_usd: 0, order_count: 0 }
      }
      gradeMap[grade].quantity_tons += order.quantity_tons || 0
      gradeMap[grade].value_usd += order.total_value_usd || 0
      gradeMap[grade].order_count += 1
    }

    const totalValue = Object.values(gradeMap).reduce((s, g) => s + g.value_usd, 0)

    return Object.entries(gradeMap)
      .map(([grade, stats]) => ({
        grade,
        quantity_tons: stats.quantity_tons,
        value_usd: stats.value_usd,
        order_count: stats.order_count,
        percentage: totalValue > 0 ? Math.round((stats.value_usd / totalValue) * 100) : 0,
      }))
      .sort((a, b) => b.value_usd - a.value_usd)
  },

  // ==========================================================================
  // TOP CUSTOMERS — Top khách hàng theo doanh thu
  // ==========================================================================

  /** `dateRange` có thì chỉ tính đơn đặt TRONG KỲ (cùng mốc với getKPIs) — tiêu đề widget ghi "Top KH tháng này". */
  async getTopCustomers(limit: number = 5, dateRange?: DashboardPeriod): Promise<TopCustomer[]> {
    let q = supabase
      .from('sales_orders')
      .select('customer_id, total_value_usd, customer:sales_customers!customer_id(name, country)')
      .neq('status', 'cancelled')
    if (dateRange) q = q.gte('order_date', periodRange(dateRange).start)
    const { data, error } = await q
    if (error) throw error

    if (!data || data.length === 0) return []

    // Group by customer
    const customerMap: Record<string, { name: string; country: string | null; order_count: number; total_revenue: number }> = {}

    for (const order of data as unknown as Array<{
      customer_id: string
      total_value_usd: number | null
      customer: { name: string; country: string | null } | null
    }>) {
      const cid = order.customer_id
      if (!customerMap[cid]) {
        customerMap[cid] = {
          name: order.customer?.name || 'N/A',
          country: order.customer?.country || null,
          order_count: 0,
          total_revenue: 0,
        }
      }
      customerMap[cid].order_count += 1
      customerMap[cid].total_revenue += order.total_value_usd || 0
    }

    return Object.entries(customerMap)
      .map(([customer_id, stats]) => ({ customer_id, ...stats }))
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, limit)
  },

  // ==========================================================================
  // PIPELINE — Phễu trạng thái đơn hàng
  // ==========================================================================

  async getPipeline(): Promise<PipelineStage[]> {
    // ĐỦ 9 trạng thái sống (trừ cancelled) — bản cũ thiếu 'packing' + 'invoiced' nên đơn đang đóng
    // gói / đã lập HĐ biến mất khỏi phễu, tổng cột không khớp tổng đơn. Nhãn lấy ORDER_STATUS_LABELS.
    const stages: { status: SalesOrderStatus; label: string }[] = (
      ['draft', 'confirmed', 'producing', 'ready', 'packing', 'shipped', 'delivered', 'invoiced', 'paid'] as SalesOrderStatus[]
    ).map((status) => ({ status, label: ORDER_STATUS_LABELS[status] }))

    const results: PipelineStage[] = []

    // Fetch all non-cancelled orders in one query for efficiency
    const { data } = await supabase
      .from('sales_orders')
      .select('status, total_value_usd')
      .neq('status', 'cancelled')

    const statusMap: Record<string, { count: number; value_usd: number }> = {}
    for (const order of data || []) {
      const s = order.status
      if (!statusMap[s]) statusMap[s] = { count: 0, value_usd: 0 }
      statusMap[s].count += 1
      statusMap[s].value_usd += order.total_value_usd || 0
    }

    for (const stage of stages) {
      const stats = statusMap[stage.status] || { count: 0, value_usd: 0 }
      results.push({
        status: stage.status,
        label: stage.label,
        count: stats.count,
        value_usd: stats.value_usd,
      })
    }

    return results
  },

  // ==========================================================================
  // KPI — Thống kê KPI cho dashboard
  // ==========================================================================

  async getKPIs(dateRange: 'month' | 'quarter' | 'year' = 'month'): Promise<{
    ordersThisPeriod: number
    ordersLastPeriod: number
    revenueThisPeriod: number
    quantityTons: number
    processingOrders: number
    onTimeRate: number
  }> {
    const { start: periodStartStr, lastStart: lastPeriodStartStr, lastEnd: lastPeriodEndStr } = periodRange(dateRange)

    // Current period orders
    const { data: currentOrders } = await supabase
      .from('sales_orders')
      .select('total_value_usd, quantity_tons')
      .gte('order_date', periodStartStr)
      .neq('status', 'cancelled')

    // Last period orders
    const { count: lastPeriodCount } = await supabase
      .from('sales_orders')
      .select('id', { count: 'exact', head: true })
      .gte('order_date', lastPeriodStartStr)
      .lte('order_date', lastPeriodEndStr)
      .neq('status', 'cancelled')

    // Processing orders (confirmed + producing + ready + packing)
    const { count: processingCount } = await supabase
      .from('sales_orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['confirmed', 'producing', 'ready', 'packing'])

    // On-time delivery rate (delivered orders with eta vs actual)
    const { data: deliveredOrders } = await supabase
      .from('sales_orders')
      .select('delivery_date, shipped_at')
      .in('status', ['delivered', 'paid'])
      .not('delivery_date', 'is', null)
      .not('shipped_at', 'is', null)

    let onTimeCount = 0
    const totalDelivered = deliveredOrders?.length || 0
    for (const o of deliveredOrders || []) {
      if (o.shipped_at && o.delivery_date) {
        const shipped = new Date(o.shipped_at)
        const deadline = new Date(o.delivery_date)
        if (shipped <= deadline) onTimeCount++
      }
    }
    const onTimeRate = totalDelivered > 0 ? Math.round((onTimeCount / totalDelivered) * 100) : 100

    const ordersThisPeriod = currentOrders?.length || 0
    const revenueThisPeriod = (currentOrders || []).reduce(
      (sum: number, o: { total_value_usd: number | null }) => sum + (o.total_value_usd || 0),
      0,
    )
    const quantityTons = (currentOrders || []).reduce(
      (sum: number, o: { quantity_tons: number | null }) => sum + (o.quantity_tons || 0),
      0,
    )

    return {
      ordersThisPeriod,
      ordersLastPeriod: lastPeriodCount || 0,
      revenueThisPeriod,
      quantityTons,
      processingOrders: processingCount || 0,
      onTimeRate,
    }
  },
}

export default salesDashboardService
