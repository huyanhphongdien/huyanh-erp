// ============================================================================
// FILE: src/services/purchaseReportService.ts
// MODULE: Mua hàng — Huy Anh Rubber ERP
// PHASE: P7 — Báo cáo & Thống kê mua hàng
// MÔ TẢ: Service cung cấp dữ liệu cho dashboard báo cáo
// BẢNG: purchase_orders, purchase_order_items, supplier_invoices,
//        invoice_payments, suppliers, materials
// ============================================================================

import { supabase } from '../lib/supabase'

// ============================================================================
// TYPES — Báo cáo
// ============================================================================

/** Tổng quan chi phí mua hàng */
export interface PurchaseSummary {
  total_orders: number
  total_order_amount: number
  total_invoiced: number
  total_paid: number
  total_debt: number
  overdue_debt: number
  avg_order_value: number
  orders_this_month: number
  orders_prev_month: number
  growth_pct: number // % tăng/giảm so tháng trước
}

/** Chi phí theo tháng (cho chart) */
export interface MonthlySpending {
  month: string // 'YYYY-MM'
  label: string // 'T01/2026'
  order_amount: number
  invoiced_amount: number
  paid_amount: number
  order_count: number
}

/** Top NCC theo giá trị */
export interface TopSupplier {
  supplier_id: string
  supplier_code: string
  supplier_name: string
  total_orders: number
  total_amount: number
  total_paid: number
  total_debt: number
  pct_of_total: number // % so với tổng
}

/** Chi phí theo nhóm vật tư */
export interface SpendingByCategory {
  category_name: string
  total_amount: number
  item_count: number
  pct_of_total: number
}

/** Hóa đơn quá hạn */
export interface OverdueInvoice {
  invoice_id: string
  invoice_code: string
  invoice_number: string
  supplier_name: string
  supplier_code: string
  total_amount: number
  remaining_amount: number
  due_date: string
  days_overdue: number
}

/** Đơn hàng gần đây */
export interface RecentOrder {
  id: string
  order_code: string
  order_date: string
  supplier_names: string
  total_amount: number
  status: string
  payment_progress: number // 0-100
}

/** Filter params cho báo cáo */
export interface ReportFilters {
  from_date?: string // YYYY-MM-DD
  to_date?: string
  supplier_id?: string
  status?: string
}

// ============================================================================
// HELPERS
// ============================================================================

function getMonthRange(monthsBack: number = 12): { from: string; to: string } {
  const now = new Date()
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0) // cuối tháng hiện tại
  const from = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1) // đầu tháng (monthsBack) trước
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

function getCurrentMonthRange(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

function getPrevMonthRange(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth(), 0)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

// ============================================================================
// SERVICE
// ============================================================================

const purchaseReportService = {
  // ==========================================================================
  // 1. TỔNG QUAN (Summary Cards)
  // ==========================================================================
  async getSummary(filters?: ReportFilters): Promise<PurchaseSummary> {
    const { from_date, to_date } = filters || {}

    // --- Tổng đơn hàng ---
    let orderQuery = supabase
      .from('purchase_orders')
      .select('id, total_amount, status, order_date', { count: 'exact' })
      .neq('status', 'cancelled')

    if (from_date) orderQuery = orderQuery.gte('order_date', from_date)
    if (to_date) orderQuery = orderQuery.lte('order_date', to_date)
    if (filters?.supplier_id) {
      // Filter qua items
      orderQuery = orderQuery.eq('supplier_id', filters.supplier_id)
    }

    const { data: orders, count: orderCount } = await orderQuery

    const total_order_amount = (orders || []).reduce(
      (sum, o) => sum + (Number(o.total_amount) || 0),
      0
    )
    const avg_order_value = orderCount ? total_order_amount / orderCount : 0

    // --- Tổng hóa đơn ---
    let invQuery = supabase
      .from('supplier_invoices')
      .select('total_amount, paid_amount, remaining_amount, due_date, status')
      .neq('status', 'cancelled')

    if (from_date) invQuery = invQuery.gte('invoice_date', from_date)
    if (to_date) invQuery = invQuery.lte('invoice_date', to_date)

    const { data: invoices } = await invQuery

    const total_invoiced = (invoices || []).reduce(
      (sum, i) => sum + (Number(i.total_amount) || 0),
      0
    )
    const total_paid = (invoices || []).reduce(
      (sum, i) => sum + (Number(i.paid_amount) || 0),
      0
    )
    const total_debt = (invoices || []).reduce(
      (sum, i) => sum + (Number(i.remaining_amount) || 0),
      0
    )

    const today = new Date().toISOString().split('T')[0]
    const overdue_debt = (invoices || [])
      .filter((i) => i.due_date && i.due_date < today && Number(i.remaining_amount) > 0)
      .reduce((sum, i) => sum + (Number(i.remaining_amount) || 0), 0)

    // --- Đơn hàng tháng này vs tháng trước ---
    const curMonth = getCurrentMonthRange()
    const prevMonth = getPrevMonthRange()

    const { count: curCount } = await supabase
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'cancelled')
      .gte('order_date', curMonth.from)
      .lte('order_date', curMonth.to)

    const { count: prevCount } = await supabase
      .from('purchase_orders')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'cancelled')
      .gte('order_date', prevMonth.from)
      .lte('order_date', prevMonth.to)

    const orders_this_month = curCount || 0
    const orders_prev_month = prevCount || 0
    const growth_pct =
      orders_prev_month > 0
        ? ((orders_this_month - orders_prev_month) / orders_prev_month) * 100
        : orders_this_month > 0
          ? 100
          : 0

    return {
      total_orders: orderCount || 0,
      total_order_amount,
      total_invoiced,
      total_paid,
      total_debt,
      overdue_debt,
      avg_order_value,
      orders_this_month,
      orders_prev_month,
      growth_pct,
    }
  },

  // ==========================================================================
  // 2. CHI PHÍ THEO THÁNG (Bar/Line Chart)
  // ==========================================================================
  async getMonthlySpending(monthsBack: number = 12): Promise<MonthlySpending[]> {
    const { from, to } = getMonthRange(monthsBack)

    // Lấy đơn hàng
    const { data: orders } = await supabase
      .from('purchase_orders')
      .select('order_date, total_amount')
      .neq('status', 'cancelled')
      .gte('order_date', from)
      .lte('order_date', to)

    // Lấy hóa đơn
    const { data: invoices } = await supabase
      .from('supplier_invoices')
      .select('invoice_date, total_amount, paid_amount')
      .neq('status', 'cancelled')
      .gte('invoice_date', from)
      .lte('invoice_date', to)

    // Gom theo tháng
    const monthMap = new Map<
      string,
      { order_amount: number; invoiced_amount: number; paid_amount: number; order_count: number }
    >()

    // Init tất cả tháng
    const startDate = new Date(from)
    const endDate = new Date(to)
    const current = new Date(startDate)
    while (current <= endDate) {
      const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`
      monthMap.set(key, { order_amount: 0, invoiced_amount: 0, paid_amount: 0, order_count: 0 })
      current.setMonth(current.getMonth() + 1)
    }

    // Gom orders
    for (const o of orders || []) {
      const d = new Date(o.order_date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const entry = monthMap.get(key)
      if (entry) {
        entry.order_amount += Number(o.total_amount) || 0
        entry.order_count += 1
      }
    }

    // Gom invoices
    for (const inv of invoices || []) {
      const d = new Date(inv.invoice_date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const entry = monthMap.get(key)
      if (entry) {
        entry.invoiced_amount += Number(inv.total_amount) || 0
        entry.paid_amount += Number(inv.paid_amount) || 0
      }
    }

    // Convert to array sorted by month
    return Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({
        month,
        label: `T${month.split('-')[1]}/${month.split('-')[0].slice(2)}`,
        ...data,
      }))
  },

  // ==========================================================================
  // 3. TOP NHÀ CUNG CẤP
  // ==========================================================================
  async getTopSuppliers(
    limit: number = 10,
    filters?: ReportFilters
  ): Promise<TopSupplier[]> {
    // Sử dụng view v_supplier_debt_summary nếu có, hoặc query trực tiếp
    let query = supabase
      .from('supplier_invoices')
      .select(`
        supplier_id,
        total_amount,
        paid_amount,
        remaining_amount,
        suppliers!inner(id, code, name)
      `)
      .neq('status', 'cancelled')

    if (filters?.from_date) query = query.gte('invoice_date', filters.from_date)
    if (filters?.to_date) query = query.lte('invoice_date', filters.to_date)

    const { data } = await query

    // Gom theo supplier
    const supplierMap = new Map<
      string,
      {
        supplier_code: string
        supplier_name: string
        total_orders: number
        total_amount: number
        total_paid: number
        total_debt: number
      }
    >()

    for (const row of data || []) {
      const sid = row.supplier_id
      const supplier = row.suppliers as any
      const existing = supplierMap.get(sid)

      if (existing) {
        existing.total_orders += 1
        existing.total_amount += Number(row.total_amount) || 0
        existing.total_paid += Number(row.paid_amount) || 0
        existing.total_debt += Number(row.remaining_amount) || 0
      } else {
        supplierMap.set(sid, {
          supplier_code: supplier?.code || '',
          supplier_name: supplier?.name || '',
          total_orders: 1,
          total_amount: Number(row.total_amount) || 0,
          total_paid: Number(row.paid_amount) || 0,
          total_debt: Number(row.remaining_amount) || 0,
        })
      }
    }

    const grandTotal = Array.from(supplierMap.values()).reduce(
      (sum, s) => sum + s.total_amount,
      0
    )

    return Array.from(supplierMap.entries())
      .map(([supplier_id, s]) => ({
        supplier_id,
        ...s,
        pct_of_total: grandTotal > 0 ? (s.total_amount / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.total_amount - a.total_amount)
      .slice(0, limit)
  },

  // ==========================================================================
  // 4. CHI PHÍ THEO NHÓM VẬT TƯ
  // ==========================================================================
  async getSpendingByCategory(filters?: ReportFilters): Promise<SpendingByCategory[]> {
    let query = supabase
      .from('purchase_order_items')
      .select(`
        total_amount,
        quantity,
        materials!inner(
          id, name,
          material_types!inner(
            id, name,
            material_categories!inner(id, name)
          )
        ),
        purchase_orders!inner(id, status, order_date)
      `)

    // Filter bỏ cancelled
    query = query.neq('purchase_orders.status', 'cancelled')
    if (filters?.from_date)
      query = query.gte('purchase_orders.order_date', filters.from_date)
    if (filters?.to_date)
      query = query.lte('purchase_orders.order_date', filters.to_date)

    const { data } = await query

    // Gom theo category
    const catMap = new Map<string, { total_amount: number; item_count: number }>()

    for (const item of data || []) {
      const material = item.materials as any
      const catName =
        material?.material_types?.material_categories?.name || 'Chưa phân nhóm'

      const existing = catMap.get(catName)
      if (existing) {
        existing.total_amount += Number(item.total_amount) || 0
        existing.item_count += 1
      } else {
        catMap.set(catName, {
          total_amount: Number(item.total_amount) || 0,
          item_count: 1,
        })
      }
    }

    const grandTotal = Array.from(catMap.values()).reduce(
      (sum, c) => sum + c.total_amount,
      0
    )

    return Array.from(catMap.entries())
      .map(([category_name, data]) => ({
        category_name,
        ...data,
        pct_of_total: grandTotal > 0 ? (data.total_amount / grandTotal) * 100 : 0,
      }))
      .sort((a, b) => b.total_amount - a.total_amount)
  },

  // ==========================================================================
  // 5. HÓA ĐƠN QUÁ HẠN
  // ==========================================================================
  async getOverdueInvoices(limit: number = 20): Promise<OverdueInvoice[]> {
    const today = new Date().toISOString().split('T')[0]

    const { data } = await supabase
      .from('supplier_invoices')
      .select(`
        id,
        invoice_code,
        invoice_number,
        total_amount,
        remaining_amount,
        due_date,
        suppliers!inner(id, code, name)
      `)
      .lt('due_date', today)
      .gt('remaining_amount', 0)
      .neq('status', 'cancelled')
      .order('due_date', { ascending: true })
      .limit(limit)

    return (data || []).map((inv: any) => {
      const dueDate = new Date(inv.due_date)
      const now = new Date()
      const diffMs = now.getTime() - dueDate.getTime()
      const days_overdue = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      return {
        invoice_id: inv.id,
        invoice_code: inv.invoice_code || '',
        invoice_number: inv.invoice_number || '',
        supplier_name: inv.suppliers?.name || '',
        supplier_code: inv.suppliers?.code || '',
        total_amount: Number(inv.total_amount) || 0,
        remaining_amount: Number(inv.remaining_amount) || 0,
        due_date: inv.due_date,
        days_overdue,
      }
    })
  },

  // ==========================================================================
  // 6. ĐƠN HÀNG GẦN ĐÂY
  // ==========================================================================
  async getRecentOrders(limit: number = 10): Promise<RecentOrder[]> {
    const { data } = await supabase
      .from('purchase_orders')
      .select(`
        id, order_code, order_date, total_amount, status,
        invoiced_amount, paid_amount
      `)
      .neq('status', 'cancelled')
      .order('order_date', { ascending: false })
      .limit(limit)

    // Lấy supplier names cho mỗi order
    const results: RecentOrder[] = []

    for (const order of data || []) {
      // Query supplier names từ order items
      const { data: items } = await supabase
        .from('purchase_order_items')
        .select('suppliers(name)')
        .eq('order_id', order.id)

      const supplierSet = new Set<string>()
      for (const item of items || []) {
        const s = (item as any).suppliers
        if (s?.name) supplierSet.add(s.name)
      }

      const totalAmt = Number(order.total_amount) || 0
      const paidAmt = Number(order.paid_amount) || 0

      results.push({
        id: order.id,
        order_code: order.order_code,
        order_date: order.order_date,
        supplier_names: Array.from(supplierSet).join(', ') || 'N/A',
        total_amount: totalAmt,
        status: order.status,
        payment_progress: totalAmt > 0 ? Math.round((paidAmt / totalAmt) * 100) : 0,
      })
    }

    return results
  },

  // ==========================================================================
  // 7. EXPORT DATA — Dữ liệu cho xuất Excel
  // ==========================================================================
  async getExportData(
    type: 'orders' | 'invoices' | 'payments' | 'debt',
    filters?: ReportFilters
  ) {
    switch (type) {
      case 'orders': {
        let q = supabase
          .from('purchase_orders')
          .select('*')
          .neq('status', 'cancelled')
          .order('order_date', { ascending: false })
        if (filters?.from_date) q = q.gte('order_date', filters.from_date)
        if (filters?.to_date) q = q.lte('order_date', filters.to_date)
        const { data } = await q
        return data || []
      }
      case 'invoices': {
        let q = supabase
          .from('supplier_invoices')
          .select(`
            *, 
            suppliers(code, name),
            purchase_orders(order_code)
          `)
          .neq('status', 'cancelled')
          .order('invoice_date', { ascending: false })
        if (filters?.from_date) q = q.gte('invoice_date', filters.from_date)
        if (filters?.to_date) q = q.lte('invoice_date', filters.to_date)
        const { data } = await q
        return data || []
      }
      case 'payments': {
        let q = supabase
          .from('invoice_payments')
          .select(`
            *,
            supplier_invoices(invoice_code, supplier_id, suppliers(code, name))
          `)
          .order('payment_date', { ascending: false })
        if (filters?.from_date) q = q.gte('payment_date', filters.from_date)
        if (filters?.to_date) q = q.lte('payment_date', filters.to_date)
        const { data } = await q
        return data || []
      }
      case 'debt': {
        const { data } = await supabase
          .from('supplier_invoices')
          .select(`
            invoice_code, invoice_number, invoice_date, due_date,
            total_amount, paid_amount, remaining_amount, status,
            suppliers(code, name)
          `)
          .gt('remaining_amount', 0)
          .neq('status', 'cancelled')
          .order('due_date', { ascending: true })
        return data || []
      }
      default:
        return []
    }
  },
}

export { purchaseReportService }
export default purchaseReportService