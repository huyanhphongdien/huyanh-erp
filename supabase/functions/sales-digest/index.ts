// =============================================================================
// EDGE FUNCTION: sales-digest
// Gửi báo cáo daily Sales tracking qua Microsoft Graph API
// =============================================================================
// Deploy: npx supabase functions deploy sales-digest --no-verify-jwt
// Schedule: pg_cron chạy lúc 01:00 UTC (= 08:00 VN)
// Test: curl -X POST "https://dygveetaatqllhjusyzz.supabase.co/functions/v1/sales-digest" -H "Content-Type: application/json" -d "{}"
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const TENANT_ID = Deno.env.get('AZURE_TENANT_ID') || '029187c4-44dd-4da0-b3e1-9ebda8f90b1a'
const CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID') || 'ee1377e6-b52c-4326-88f2-c18c3b59fded'
const CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET') || Deno.env.get('MICROSOFT_CLIENT_SECRET') || ''
const SENDER_EMAIL = Deno.env.get('EMAIL_FROM') || 'huyanhphongdien@huyanhrubber.com'

// ★ TEST MODE — Chỉ gửi cho Minh (theo yêu cầu user 2026-05-04)
// Sau khi test OK, đổi sang query sales_digest_subscribers để lấy list dynamic.
const REPORT_RECIPIENTS = [
  { name: 'Lê Duy Minh', email: 'minhld@huyanhrubber.com' },
]

const APP_URL = 'https://huyanhrubber.vn'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Stage labels (hardcode trong Deno — không import được TS module) ─────────
const STAGE_LABELS: Record<string, string> = {
  sales: 'Phòng Kinh doanh',
  raw_material: 'Mua mủ NVL',
  production: 'Sản xuất',
  qc: 'QC Final',
  packing: 'Đóng gói',
  logistics: 'Logistics + xuất kho',
  delivered: 'Đã giao khách',
}
const STAGE_EMOJI: Record<string, string> = {
  sales: '📋', raw_material: '🛒', production: '🏭',
  qc: '🔬', packing: '📦', logistics: '🚛', delivered: '✅',
}

function formatDwell(hours: number): string {
  if (!hours || hours <= 0) return '—'
  if (hours < 1) return `${Math.round(hours * 60)} phút`
  if (hours < 24) return `${hours.toFixed(1)}h`
  const days = Math.floor(hours / 24)
  const rh = Math.round(hours % 24)
  return rh > 0 ? `${days}d ${rh}h` : `${days}d`
}

function vnDayLabel(d: Date): string {
  const days = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
  return `${days[d.getDay()]}, ${d.toLocaleDateString('vi-VN')}`
}

// ── Microsoft Graph API ──────────────────────────────────────────────────────
async function getAccessToken(): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token error: ${error}`)
  }
  const data = await response.json()
  return data.access_token
}

async function sendEmail(
  token: string,
  recipients: Array<{ name: string; email: string }>,
  subject: string,
  htmlBody: string,
): Promise<void> {
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`
  const message = {
    message: {
      subject,
      body: { contentType: 'HTML', content: htmlBody },
      toRecipients: recipients.map((r) => ({
        emailAddress: { address: r.email, name: r.name },
      })),
    },
    saveToSentItems: true,
  }
  const response = await fetch(graphUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Send email error: ${error}`)
  }
}

// ── Generate digest data ─────────────────────────────────────────────────────
async function generateDigest(supabase: any) {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()

  // 1. Active orders
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

  const overdue: any[] = []
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
        code: o.code,
        customer_short: customer?.short_name || customer?.name || '—',
        current_stage: o.current_stage,
        owner_name: owner?.full_name || null,
        overdue_hours: over,
      })
    }
  })
  overdue.sort((a, b) => b.overdue_hours - a.overdue_hours)

  // 2. Handoffs in last 24h
  const { data: handoffs } = await supabase
    .from('sales_order_handoffs')
    .select(`
      sales_order_id, from_dept, to_dept, passed_at,
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
  const arrived = (handoffs || []).map((h: any) => {
    const passer = Array.isArray(h.passer) ? h.passer[0] : h.passer
    const o = orderMap.get(h.sales_order_id) || {}
    return {
      code: o.code || h.sales_order_id.substring(0, 8),
      customer_short: o.customer_short || '—',
      from_dept: h.from_dept,
      to_dept: h.to_dept,
      passer_name: passer?.full_name || null,
    }
  })

  // 3. Capacity
  const { data: capConfig } = await supabase
    .from('sales_dept_capacity')
    .select('*')
    .eq('is_active', true)
  const { data: loadCounts } = await supabase
    .from('sales_orders')
    .select('current_stage')
    .neq('status', 'cancelled')
  const loadMap: Record<string, number> = {}
  ;(loadCounts || []).forEach((r: any) => {
    loadMap[r.current_stage] = (loadMap[r.current_stage] || 0) + 1
  })
  const capacity = (capConfig || [])
    .filter((c: any) => c.dept_code !== 'delivered')
    .map((c: any) => {
      const current = loadMap[c.dept_code] || 0
      const pct = c.max_concurrent_orders > 0
        ? Math.round((current / c.max_concurrent_orders) * 100)
        : 0
      let status = 'ok'
      if (pct >= c.critical_threshold_pct) status = 'critical'
      else if (pct >= c.warning_threshold_pct) status = 'warn'
      else if (pct < 30) status = 'idle'
      return {
        dept_code: c.dept_code,
        dept_name: c.dept_name,
        current,
        capacity: c.max_concurrent_orders,
        load_pct: pct,
        status,
      }
    })

  return {
    date_label: vnDayLabel(now),
    overdue_orders: overdue,
    arrived_today: arrived,
    capacity,
    total_active_orders: (orders || []).length,
    total_value_in_progress_usd: totalValue,
  }
}

// ── Render HTML ──────────────────────────────────────────────────────────────
function renderHtml(data: any): string {
  const overdueRows = data.overdue_orders.length === 0
    ? '<p style="color:#10b981;margin:0;">Không có đơn quá SLA. </p>'
    : data.overdue_orders.map((o: any) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-family:monospace;font-size:12px;">${o.code}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;">${o.customer_short}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;">${STAGE_EMOJI[o.current_stage]} ${STAGE_LABELS[o.current_stage]}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#ff5b4f;font-weight:600;">Quá ${formatDwell(o.overdue_hours)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;">${o.owner_name || '—'}</td>
      </tr>
    `).join('')

  const arrivedRows = data.arrived_today.length === 0
    ? '<p style="color:#6b7280;margin:0;font-style:italic;">Không có chuyển bộ phận trong 24h qua.</p>'
    : data.arrived_today.map((a: any) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-family:monospace;font-size:12px;">${a.code}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;">${a.customer_short}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;">
          ${a.from_dept ? `${STAGE_EMOJI[a.from_dept]} ${STAGE_LABELS[a.from_dept]}` : '—'}
          <span style="color:#6b7280;margin:0 6px;">→</span>
          ${STAGE_EMOJI[a.to_dept]} ${STAGE_LABELS[a.to_dept]}
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#6b7280;">${a.passer_name || '—'}</td>
      </tr>
    `).join('')

  const capacityRows = data.capacity.map((c: any) => {
    const color =
      c.status === 'critical' ? '#ff5b4f' :
      c.status === 'warn' ? '#f59e0b' :
      c.status === 'idle' ? '#10b981' : '#0a72ef'
    return `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;">${STAGE_EMOJI[c.dept_code]} ${c.dept_name}</td>
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
  <p style="color:#6b7280;margin:0 0 20px 0;font-size:13px;">${data.date_label} · ${data.total_active_orders} đơn active · giá trị $${(data.total_value_in_progress_usd / 1000).toFixed(0)}K</p>

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
  </table>` : overdueRows}

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
  </table>` : arrivedRows}

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
    Generated at ${new Date().toLocaleString('vi-VN')}<br/>
    Click để xem dashboard: <a href="${APP_URL}/sales/dashboard" style="color:#1B4D3E;">${APP_URL}/sales/dashboard</a>
  </p>
</div>
</body></html>`.trim()
}

// ── Main ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const data = await generateDigest(supabase)
    const html = renderHtml(data)
    const subject = `[Sales Digest] ${data.date_label} — ${data.overdue_orders.length} quá SLA, ${data.arrived_today.length} chuyển 24h`

    const token = await getAccessToken()
    await sendEmail(token, REPORT_RECIPIENTS, subject, html)

    return new Response(JSON.stringify({
      success: true,
      sent_to: REPORT_RECIPIENTS.map(r => r.email),
      subject,
      stats: {
        overdue: data.overdue_orders.length,
        arrived: data.arrived_today.length,
        active: data.total_active_orders,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message || String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
