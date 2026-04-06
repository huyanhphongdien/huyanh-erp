import { supabase } from '../../lib/supabase'

export interface SalesAlert {
  id: string
  type: 'lc_expiry' | 'delivery_due' | 'container_unseal' | 'etd_changed' | 'payment_overdue' | 'order_pending' | 'production_complete'
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  order_id: string
  order_code: string
  customer_name: string
  date?: string
  days_remaining?: number
}

export const salesAlertService = {
  async getAlerts(): Promise<SalesAlert[]> {
    const alerts: SalesAlert[] = []
    const today = new Date()

    // 1. L/C sắp hết hạn (< 7 ngày)
    const { data: lcOrders } = await supabase
      .from('sales_orders')
      .select('id, code, lc_expiry_date, customer:sales_customers!customer_id(name)')
      .not('lc_expiry_date', 'is', null)
      .not('status', 'in', '("paid","cancelled")')

    lcOrders?.forEach(o => {
      if (!o.lc_expiry_date) return
      const expiry = new Date(o.lc_expiry_date)
      const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000)
      if (days <= 20 && days > 0) {
        alerts.push({
          id: `lc-${o.id}`, type: 'lc_expiry', severity: days <= 7 ? 'critical' : 'warning',
          title: 'L/C sắp hết hạn', message: `Đơn ${o.code} — L/C hết hạn trong ${days} ngày`,
          order_id: o.id, order_code: o.code, customer_name: (o.customer as any)?.name || '',
          date: o.lc_expiry_date, days_remaining: days,
        })
      }
    })

    // 2. Đơn sắp tới hạn giao (< 7 ngày)
    const { data: deliveryOrders } = await supabase
      .from('sales_orders')
      .select('id, code, delivery_date, customer:sales_customers!customer_id(name)')
      .not('delivery_date', 'is', null)
      .not('status', 'in', '("shipped","delivered","paid","cancelled")')

    deliveryOrders?.forEach(o => {
      if (!o.delivery_date) return
      const delivery = new Date(o.delivery_date)
      const days = Math.ceil((delivery.getTime() - today.getTime()) / 86400000)
      if (days <= 7) {
        alerts.push({
          id: `delivery-${o.id}`, type: 'delivery_due',
          severity: days <= 0 ? 'critical' : 'warning',
          title: days <= 0 ? 'Đơn quá hạn giao' : 'Đơn sắp tới hạn giao',
          message: `${o.code} — ${days <= 0 ? 'Quá hạn ' + Math.abs(days) + ' ngày' : 'Còn ' + days + ' ngày'}`,
          order_id: o.id, order_code: o.code, customer_name: (o.customer as any)?.name || '',
          date: o.delivery_date, days_remaining: days,
        })
      }
    })

    // 3. Chưa thanh toán > 30 ngày
    const { data: unpaidOrders } = await supabase
      .from('sales_orders')
      .select('id, code, etd, customer:sales_customers!customer_id(name), total_value_usd')
      .is('payment_date', null)
      .in('status', ['shipped', 'delivered', 'invoiced'])

    unpaidOrders?.forEach(o => {
      if (!o.etd) return
      const shipped = new Date(o.etd)
      const days = Math.ceil((today.getTime() - shipped.getTime()) / 86400000)
      if (days > 30) {
        alerts.push({
          id: `payment-${o.id}`, type: 'payment_overdue', severity: 'critical',
          title: 'Công nợ quá hạn', message: `${o.code} — $${(o.total_value_usd||0).toLocaleString()} chưa TT (${days} ngày)`,
          order_id: o.id, order_code: o.code, customer_name: (o.customer as any)?.name || '',
          days_remaining: days,
        })
      }
    })

    // 4. Đơn mới chưa xác nhận > 3 ngày
    const threeDaysAgo = new Date(today.getTime() - 3 * 86400000).toISOString()
    const { data: pendingOrders } = await supabase
      .from('sales_orders')
      .select('id, code, created_at, customer:sales_customers!customer_id(name)')
      .eq('status', 'draft')
      .lt('created_at', threeDaysAgo)

    pendingOrders?.forEach(o => {
      alerts.push({
        id: `pending-${o.id}`, type: 'order_pending', severity: 'warning',
        title: 'Đơn chưa xác nhận', message: `${o.code} — Nháp hơn 3 ngày`,
        order_id: o.id, order_code: o.code, customer_name: (o.customer as any)?.name || '',
      })
    })

    return alerts.sort((a, b) => {
      const sevOrder = { critical: 0, warning: 1, info: 2 }
      return sevOrder[a.severity] - sevOrder[b.severity]
    })
  }
}
