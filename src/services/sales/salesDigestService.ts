// ============================================================================
// Sales Digest Service — daily standup digest
// File: src/services/sales/salesDigestService.ts
// Sprint 2 D7 (Sales Tracking & Control)
// ============================================================================
//
// Generate digest data: đơn quá SLA + đơn đến bộ phận hôm nay + capacity load.
// Output: object data + HTML render-ready cho email/in-app preview.
//
// Email send:
//   - Bước 1 (D7): generate data + HTML preview (UI render)
//   - Bước 2 (sau D8): tích hợp SMTP/Resend cho cron daily 08:00
// ============================================================================

import { supabase } from '../../lib/supabase'
import {
  type SalesStage,
  SALES_STAGE_LABELS,
  SALES_STAGE_EMOJI,
  formatDwell,
} from './salesStages'

export interface DigestOrderRow {
  id: string
  code: string
  contract_no: string | null
  customer_short: string
  current_stage: SalesStage
  current_owner_name: string | null
  stage_started_at: string | null
  stage_sla_hours: number | null
  elapsed_hours: number
  overdue_hours: number          // > 0 nếu quá SLA
  total_value_usd: number | null
  etd: string | null
}

export interface DigestArrivalRow {
  id: string
  code: string
  customer_short: string
  from_dept: SalesStage | null
  to_dept: SalesStage
  passed_at: string
  passer_name: string | null
}

export interface DigestCapacityRow {
  dept_code: SalesStage
  dept_name: string
  current: number
  capacity: number
  load_pct: number
  status: 'idle' | 'ok' | 'warn' | 'critical'
}

export interface DigestData {
  generated_at: string
  date_label: string                       // "Thứ 5, 25/06/2026"
  overdue_orders: DigestOrderRow[]
  arrived_today: DigestArrivalRow[]        // handoff trong 24h qua
  capacity: DigestCapacityRow[]
  total_active_orders: number
  total_value_in_progress_usd: number
}

function vnDayLabel(d: Date): string {
  const days = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
  return `${days[d.getDay()]}, ${d.toLocaleDateString('vi-VN')}`
}

export const salesDigestService = {
  /**
   * Generate digest data cho hôm nay
   */
  async generate(): Promise<DigestData> {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()

    // 1. Đơn active
    const { data: orders } = await supabase
      .from('sales_orders')
      .select(`
        id, code, contract_no, current_stage, stage_started_at, stage_sla_hours,
        total_value_usd, etd,
        customer:sales_customers!sales_orders_customer_id_fkey(short_name, name),
        owner:employees!sales_orders_current_owner_id_fkey(full_name)
      `)
      .neq('status', 'cancelled')
      .neq('current_stage', 'delivered')

    const overdue: DigestOrderRow[] = []
    let totalValue = 0
    ;(orders || []).forEach((o: any) => {
      const customer = Array.isArray(o.customer) ? o.customer[0] : o.customer
      const owner = Array.isArray(o.owner) ? o.owner[0] : o.owner
      const elapsed = o.stage_started_at
        ? (now.getTime() - new Date(o.stage_started_at).getTime()) / (1000 * 3600)
        : 0
      const sla = o.stage_sla_hours || 0
      const over = sla > 0 ? elapsed - sla : 0
      totalValue += Number(o.total_value_usd) || 0

      if (over > 0) {
        overdue.push({
          id: o.id,
          code: o.code,
          contract_no: o.contract_no,
          customer_short: customer?.short_name || customer?.name || '—',
          current_stage: o.current_stage as SalesStage,
          current_owner_name: owner?.full_name || null,
          stage_started_at: o.stage_started_at,
          stage_sla_hours: o.stage_sla_hours,
          elapsed_hours: elapsed,
          overdue_hours: over,
          total_value_usd: o.total_value_usd,
          etd: o.etd,
        })
      }
    })
    overdue.sort((a, b) => b.overdue_hours - a.overdue_hours)

    // 2. Handoff trong 24h qua (đơn đến bộ phận mới)
    const { data: handoffs } = await supabase
      .from('sales_order_handoffs')
      .select(`
        id, sales_order_id, from_dept, to_dept, passed_at,
        passer:employees!sales_order_handoffs_passed_by_fkey(full_name)
      `)
      .gte('passed_at', yesterday)
      .order('passed_at', { ascending: false })

    const orderIds = [...new Set((handoffs || []).map((h: any) => h.sales_order_id))]
    const orderMap = new Map<string, any>()
    if (orderIds.length > 0) {
      const { data: orderInfos } = await supabase
        .from('sales_orders')
        .select('id, code, customer:sales_customers!sales_orders_customer_id_fkey(short_name, name)')
        .in('id', orderIds)
      ;(orderInfos || []).forEach((o: any) => {
        const c = Array.isArray(o.customer) ? o.customer[0] : o.customer
        orderMap.set(o.id, {
          code: o.code,
          customer_short: c?.short_name || c?.name || '—',
        })
      })
    }

    const arrived: DigestArrivalRow[] = (handoffs || []).map((h: any) => {
      const passer = Array.isArray(h.passer) ? h.passer[0] : h.passer
      const o = orderMap.get(h.sales_order_id) || {}
      return {
        id: h.sales_order_id,
        code: o.code || h.sales_order_id.substring(0, 8),
        customer_short: o.customer_short || '—',
        from_dept: h.from_dept as SalesStage | null,
        to_dept: h.to_dept as SalesStage,
        passed_at: h.passed_at,
        passer_name: passer?.full_name || null,
      }
    })

    // 3. Capacity per dept
    const { data: capConfig } = await supabase
      .from('sales_dept_capacity')
      .select('*')
      .eq('is_active', true)
    const { data: loadCounts } = await supabase
      .from('sales_orders')
      .select('current_stage')
      .neq('status', 'cancelled')
    const loadMap: Partial<Record<SalesStage, number>> = {}
    ;(loadCounts || []).forEach((r: any) => {
      const s = r.current_stage as SalesStage
      loadMap[s] = (loadMap[s] || 0) + 1
    })

    const capacity: DigestCapacityRow[] = (capConfig || [])
      .filter((c: any) => c.dept_code !== 'delivered')
      .map((c: any) => {
        const current = loadMap[c.dept_code as SalesStage] || 0
        const pct = c.max_concurrent_orders > 0
          ? Math.round((current / c.max_concurrent_orders) * 100)
          : 0
        let status: 'idle' | 'ok' | 'warn' | 'critical' = 'ok'
        if (pct >= c.critical_threshold_pct) status = 'critical'
        else if (pct >= c.warning_threshold_pct) status = 'warn'
        else if (pct < 30) status = 'idle'
        return {
          dept_code: c.dept_code as SalesStage,
          dept_name: c.dept_name,
          current,
          capacity: c.max_concurrent_orders,
          load_pct: pct,
          status,
        }
      })

    return {
      generated_at: now.toISOString(),
      date_label: vnDayLabel(now),
      overdue_orders: overdue,
      arrived_today: arrived,
      capacity,
      total_active_orders: (orders || []).length,
      total_value_in_progress_usd: totalValue,
    }
  },

  /**
   * Render digest to HTML (cho email + in-app preview)
   */
  renderHtml(data: DigestData): string {
    const overdueRows = data.overdue_orders.length === 0
      ? '<p style="color:#10b981;margin:0;">Không có đơn quá SLA. </p>'
      : data.overdue_orders.map(o => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-family:monospace;font-size:12px;">${o.code}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;">${o.customer_short}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;">${SALES_STAGE_EMOJI[o.current_stage]} ${SALES_STAGE_LABELS[o.current_stage]}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#ff5b4f;font-weight:600;">Quá ${formatDwell(o.overdue_hours)}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;">${o.current_owner_name || '—'}</td>
        </tr>
      `).join('')

    const arrivedRows = data.arrived_today.length === 0
      ? '<p style="color:#6b7280;margin:0;font-style:italic;">Không có chuyển bộ phận trong 24h qua.</p>'
      : data.arrived_today.map(a => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-family:monospace;font-size:12px;">${a.code}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;">${a.customer_short}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;">
            ${a.from_dept ? `${SALES_STAGE_EMOJI[a.from_dept]} ${SALES_STAGE_LABELS[a.from_dept]}` : '—'}
            <span style="color:#6b7280;margin:0 6px;">→</span>
            ${SALES_STAGE_EMOJI[a.to_dept]} ${SALES_STAGE_LABELS[a.to_dept]}
          </td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#6b7280;">${a.passer_name || '—'}</td>
        </tr>
      `).join('')

    const capacityRows = data.capacity.map(c => {
      const color =
        c.status === 'critical' ? '#ff5b4f' :
        c.status === 'warn' ? '#f59e0b' :
        c.status === 'idle' ? '#10b981' : '#0a72ef'
      return `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;">${SALES_STAGE_EMOJI[c.dept_code]} ${c.dept_name}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;">${c.current} / ${c.capacity}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;color:${color};font-weight:600;">${c.load_pct}%</td>
        </tr>
      `
    }).join('')

    return `
<!DOCTYPE html>
<html><body style="font-family:Inter,Segoe UI,sans-serif;background:#f8f9fa;margin:0;padding:24px;">
<div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e4e4e7;">
  <h1 style="color:#1B4D3E;font-size:22px;margin:0 0 4px 0;">Sales Daily Digest</h1>
  <p style="color:#6b7280;margin:0 0 20px 0;font-size:13px;">${data.date_label} · ${data.total_active_orders} đơn active · giá trị $${(data.total_value_in_progress_usd/1000).toFixed(0)}K</p>

  <h2 style="color:#ff5b4f;font-size:15px;margin:20px 0 8px 0;">🔴 ĐƠN QUÁ SLA (${data.overdue_orders.length})</h2>
  ${data.overdue_orders.length > 0 ? `
  <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;">
    <thead><tr style="background:#fef2f2;">
      <th style="padding:6px 10px;text-align:left;font-size:11px;color:#374151;">Mã</th>
      <th style="padding:6px 10px;text-align:left;font-size:11px;color:#374151;">Khách</th>
      <th style="padding:6px 10px;text-align:left;font-size:11px;color:#374151;">Bộ phận</th>
      <th style="padding:6px 10px;text-align:left;font-size:11px;color:#374151;">Quá hạn</th>
      <th style="padding:6px 10px;text-align:left;font-size:11px;color:#374151;">Owner</th>
    </tr></thead>
    <tbody>${overdueRows}</tbody>
  </table>
  ` : overdueRows}

  <h2 style="color:#0a72ef;font-size:15px;margin:24px 0 8px 0;">⚠️ ĐƠN CHUYỂN BỘ PHẬN 24H QUA (${data.arrived_today.length})</h2>
  ${data.arrived_today.length > 0 ? `
  <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;">
    <thead><tr style="background:#eff6ff;">
      <th style="padding:6px 10px;text-align:left;font-size:11px;color:#374151;">Mã</th>
      <th style="padding:6px 10px;text-align:left;font-size:11px;color:#374151;">Khách</th>
      <th style="padding:6px 10px;text-align:left;font-size:11px;color:#374151;">Chuyển</th>
      <th style="padding:6px 10px;text-align:left;font-size:11px;color:#374151;">NV</th>
    </tr></thead>
    <tbody>${arrivedRows}</tbody>
  </table>
  ` : arrivedRows}

  <h2 style="color:#1B4D3E;font-size:15px;margin:24px 0 8px 0;">📊 CAPACITY HIỆN TẠI</h2>
  <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;">
    <thead><tr style="background:#f8f9fa;">
      <th style="padding:6px 10px;text-align:left;font-size:11px;color:#374151;">Bộ phận</th>
      <th style="padding:6px 10px;text-align:right;font-size:11px;color:#374151;">Đơn / Capacity</th>
      <th style="padding:6px 10px;text-align:right;font-size:11px;color:#374151;">Load</th>
    </tr></thead>
    <tbody>${capacityRows}</tbody>
  </table>

  <hr style="margin:24px 0;border:0;border-top:1px solid #e4e4e7;"/>
  <p style="color:#6b7280;font-size:11px;text-align:center;margin:0;">
    Generated at ${new Date(data.generated_at).toLocaleString('vi-VN')}<br/>
    Click để xem dashboard: <a href="https://huyanhrubber.vn/sales/dashboard" style="color:#1B4D3E;">huyanhrubber.vn/sales/dashboard</a>
  </p>
</div>
</body></html>`.trim()
  },
}
