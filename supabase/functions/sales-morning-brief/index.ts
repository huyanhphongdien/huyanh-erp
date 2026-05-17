// =============================================================================
// EDGE FUNCTION: sales-morning-brief
// (Function name lịch sử — thực ra giờ chạy 17:30 day-end summary, không đổi tên
//  để tránh churn migration. User-facing labels đã update.)
//
// Báo cáo Sales DUY NHẤT cho BGĐ hằng ngày 17:30 chiều — gom thay cho 3 mail cũ
// (daily-task-report-1730 + sales-digest-daily + task-daily-reminders BGĐ portion).
//
// 7 section:
//   ⚡ Cần làm ngay     : HĐ chờ ký + ETD < 3d chưa logistics + Bottleneck ≥ 80%
//   📦 Đóng gói trong 24h: QC pass 24h qua
//   💰 Thanh toán chờ   : LC/DP chưa thu, days quá ETD
//   🚢 Vừa xuất 24h qua : shipped 24h, BL + vessel
//   📊 Pipeline tổng    : 7 cột bar chart SVG inline + $ in-progress + $ delivered hôm qua
//
// Schedule: pg_cron `30 10 * * *` UTC = 17:30 VN hằng ngày (T2-CN)
// Deploy:   npx supabase functions deploy sales-morning-brief --no-verify-jwt
// Test:     curl -X POST "https://dygveetaatqllhjusyzz.supabase.co/functions/v1/sales-morning-brief" \
//             -H "Authorization: Bearer <SERVICE_ROLE_KEY>" -H "Content-Type: application/json" -d "{}"
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

// ★ TEST MODE — Chỉ gửi cho Minh trước, verify OK thì swap sang BGD_FULL.
//   Khi rollout BGĐ: đổi REPORT_RECIPIENTS = BGD_FULL (uncomment block dưới).
const REPORT_RECIPIENTS = [
  { name: 'Lê Duy Minh', email: 'minhld@huyanhrubber.com' },
]
// const BGD_FULL = [
//   { name: 'Lê Văn Huy', email: 'huylv@huyanhrubber.com' },
//   { name: 'Hồ Thị Thủy', email: 'thuyht@huyanhrubber.com' },
//   { name: 'Lê Xuân Trung', email: 'trunglxh@huyanhrubber.com' },
//   { name: 'Lê Duy Minh', email: 'minhld@huyanhrubber.com' },
// ]

const APP_URL = 'https://huyanhrubber.vn'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Stage labels (hardcode trong Deno — không import TS module) ──────────────
const STAGE_ORDER = ['sales', 'raw_material', 'production', 'qc', 'packing', 'logistics', 'delivered'] as const
type Stage = typeof STAGE_ORDER[number]

const STAGE_LABEL: Record<Stage, string> = {
  sales: 'Sales', raw_material: 'Mua NVL', production: 'Sản xuất',
  qc: 'QC', packing: 'Đóng gói', logistics: 'Logistics', delivered: 'Đã giao',
}
const STAGE_EMOJI: Record<Stage, string> = {
  sales: '📋', raw_material: '🛒', production: '🏭',
  qc: '🔬', packing: '📦', logistics: '🚛', delivered: '✅',
}
const STAGE_COLOR: Record<Stage, string> = {
  sales: '#1B4D3E', raw_material: '#d97706', production: '#7c3aed',
  qc: '#0891b2', packing: '#0a72ef', logistics: '#ea580c', delivered: '#10b981',
}

// ── Format helpers ───────────────────────────────────────────────────────────
const fmtUSD = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}
const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN')
}
const vnDayLabel = (d: Date) => {
  const days = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
  return `${days[d.getDay()]}, ${d.toLocaleDateString('vi-VN')}`
}
const daysBetween = (a: Date, b: Date) =>
  Math.round((a.getTime() - b.getTime()) / (1000 * 3600 * 24))

// ── Microsoft Graph ──────────────────────────────────────────────────────────
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
  if (!response.ok) throw new Error(`Token error: ${await response.text()}`)
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
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  })
  if (!response.ok) throw new Error(`Send email error: ${await response.text()}`)
}

// ── Data collection ──────────────────────────────────────────────────────────
async function collectData(supabase: any) {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
  const today = new Date(now.toDateString()).toISOString()
  const in3days = new Date(now.getTime() + 3 * 24 * 3600 * 1000)
  const in7days = new Date(now.getTime() + 7 * 24 * 3600 * 1000)

  // 1. Active orders cho pipeline + bottleneck capacity
  const { data: orders } = await supabase
    .from('sales_orders')
    .select(`
      id, code, contract_no, current_stage, stage_started_at, stage_sla_hours,
      total_value_usd, etd, payment_status, payment_terms, shipped_at,
      bl_number, vessel_name, shipping_line,
      customer:sales_customers!sales_orders_customer_id_fkey(short_name, name),
      owner:employees!sales_orders_current_owner_id_fkey(full_name)
    `)
    .neq('status', 'cancelled')

  const ordersList = (orders || []) as any[]

  // Pipeline distribution
  const stageCounts: Record<string, number> = {}
  const stageValues: Record<string, number> = {}
  let totalInProgressValue = 0
  ordersList.forEach((o) => {
    stageCounts[o.current_stage] = (stageCounts[o.current_stage] || 0) + 1
    stageValues[o.current_stage] = (stageValues[o.current_stage] || 0) + (Number(o.total_value_usd) || 0)
    if (o.current_stage !== 'delivered') totalInProgressValue += Number(o.total_value_usd) || 0
  })

  // 2. ETD < 3 ngày, chưa logistics/delivered
  const etdRisk = ordersList
    .filter((o) =>
      o.etd
      && o.current_stage !== 'logistics'
      && o.current_stage !== 'delivered'
      && new Date(o.etd) <= in3days
    )
    .map((o) => {
      const c = Array.isArray(o.customer) ? o.customer[0] : o.customer
      const owner = Array.isArray(o.owner) ? o.owner[0] : o.owner
      const days = daysBetween(new Date(o.etd), now)
      return {
        code: o.code,
        customer: c?.short_name || c?.name || '—',
        stage: o.current_stage,
        owner: owner?.full_name || '—',
        etd: o.etd,
        days_to_etd: days,
        value: Number(o.total_value_usd) || 0,
      }
    })
    .sort((a, b) => a.days_to_etd - b.days_to_etd)

  // 3. ETD 3-7 ngày tới (warning, không CRITICAL)
  const etdWarn = ordersList
    .filter((o) => {
      if (!o.etd) return false
      if (o.current_stage === 'logistics' || o.current_stage === 'delivered') return false
      const etdDate = new Date(o.etd)
      return etdDate > in3days && etdDate <= in7days
    })
    .map((o) => {
      const c = Array.isArray(o.customer) ? o.customer[0] : o.customer
      const days = daysBetween(new Date(o.etd), now)
      return {
        code: o.code,
        customer: c?.short_name || c?.name || '—',
        stage: o.current_stage,
        etd: o.etd,
        days_to_etd: days,
      }
    })
    .sort((a, b) => a.days_to_etd - b.days_to_etd)

  // 4. HĐ chưa ký (workflow status reviewing/approved)
  const { data: contracts } = await supabase
    .from('sales_order_contracts')
    .select(`
      id, status, created_at, submitted_at, reviewed_at,
      sales_order:sales_orders!sales_order_contracts_sales_order_id_fkey(
        code, total_value_usd,
        customer:sales_customers!sales_orders_customer_id_fkey(short_name, name)
      )
    `)
    .in('status', ['reviewing', 'approved'])
    .order('created_at', { ascending: true })

  const contractsPending = ((contracts || []) as any[]).map((c) => {
    const so = Array.isArray(c.sales_order) ? c.sales_order[0] : c.sales_order
    const cust = so ? (Array.isArray(so.customer) ? so.customer[0] : so.customer) : null
    return {
      code: so?.code || '—',
      customer: cust?.short_name || cust?.name || '—',
      status: c.status,
      value: Number(so?.total_value_usd) || 0,
      days_pending: daysBetween(now, new Date(c.created_at)),
    }
  })

  // 5. Bottleneck capacity
  const { data: capConfig } = await supabase
    .from('sales_dept_capacity')
    .select('dept_code, dept_name, max_concurrent_orders, warning_threshold_pct, critical_threshold_pct')
    .eq('is_active', true)

  const bottlenecks = ((capConfig || []) as any[])
    .filter((c) => c.dept_code !== 'delivered')
    .map((c) => {
      const current = stageCounts[c.dept_code] || 0
      const pct = c.max_concurrent_orders > 0 ? Math.round((current / c.max_concurrent_orders) * 100) : 0
      let status = 'ok'
      if (pct >= (c.critical_threshold_pct || 95)) status = 'critical'
      else if (pct >= (c.warning_threshold_pct || 80)) status = 'warn'
      return { dept_code: c.dept_code, dept_name: c.dept_name, current, capacity: c.max_concurrent_orders, load_pct: pct, status }
    })
    .filter((b) => b.status !== 'ok')
    .sort((a, b) => b.load_pct - a.load_pct)

  // 6. QC pass 24h qua → packing
  const packingToday = ordersList
    .filter((o) =>
      o.current_stage === 'packing'
      && o.stage_started_at
      && new Date(o.stage_started_at) >= new Date(yesterday)
    )
    .map((o) => {
      const c = Array.isArray(o.customer) ? o.customer[0] : o.customer
      const owner = Array.isArray(o.owner) ? o.owner[0] : o.owner
      return {
        code: o.code,
        customer: c?.short_name || c?.name || '—',
        owner: owner?.full_name || '—',
        etd: o.etd,
        value: Number(o.total_value_usd) || 0,
      }
    })

  // 7. Thanh toán chờ (unpaid/partial, đã shipped+)
  const paymentPending = ordersList
    .filter((o) =>
      (o.payment_status === 'unpaid' || o.payment_status === 'partial')
      && (o.current_stage === 'delivered' || o.shipped_at)
    )
    .map((o) => {
      const c = Array.isArray(o.customer) ? o.customer[0] : o.customer
      const daysSinceEtd = o.etd ? daysBetween(now, new Date(o.etd)) : null
      return {
        code: o.code,
        customer: c?.short_name || c?.name || '—',
        payment_terms: o.payment_terms || '—',
        payment_status: o.payment_status,
        value: Number(o.total_value_usd) || 0,
        days_since_etd: daysSinceEtd,
      }
    })
    .sort((a, b) => (b.days_since_etd ?? 0) - (a.days_since_etd ?? 0))

  // 8. Vừa shipped 24h qua
  const justShipped = ordersList
    .filter((o) => o.shipped_at && new Date(o.shipped_at) >= new Date(yesterday))
    .map((o) => {
      const c = Array.isArray(o.customer) ? o.customer[0] : o.customer
      return {
        code: o.code,
        customer: c?.short_name || c?.name || '—',
        bl: o.bl_number || '—',
        vessel: o.vessel_name || '—',
        shipping_line: o.shipping_line || '—',
        value: Number(o.total_value_usd) || 0,
      }
    })

  // 9. Delivered yesterday $ + count
  const deliveredYesterday = ordersList.filter(
    (o) => o.current_stage === 'delivered' && o.stage_started_at && new Date(o.stage_started_at) >= new Date(yesterday) && new Date(o.stage_started_at) < new Date(today),
  )
  const deliveredYdValue = deliveredYesterday.reduce((s, o) => s + (Number(o.total_value_usd) || 0), 0)

  return {
    date_label: vnDayLabel(now),
    total_active: ordersList.filter((o) => o.current_stage !== 'delivered').length,
    total_in_progress_value: totalInProgressValue,
    delivered_yesterday_count: deliveredYesterday.length,
    delivered_yesterday_value: deliveredYdValue,
    stage_counts: stageCounts,
    stage_values: stageValues,
    etd_risk: etdRisk,
    etd_warn: etdWarn,
    contracts_pending: contractsPending,
    bottlenecks,
    packing_today: packingToday,
    payment_pending: paymentPending,
    just_shipped: justShipped,
  }
}

// ── SVG Bar Chart (inline) ───────────────────────────────────────────────────
function renderPipelineBarChart(stageCounts: Record<string, number>): string {
  const maxCount = Math.max(...STAGE_ORDER.map((s) => stageCounts[s] || 0), 1)
  const W = 560
  const H = 200
  const padL = 50
  const padR = 10
  const padT = 20
  const padB = 50
  const chartW = W - padL - padR
  const chartH = H - padT - padB
  const barW = (chartW / STAGE_ORDER.length) * 0.7
  const gap = (chartW / STAGE_ORDER.length) * 0.3

  const bars = STAGE_ORDER.map((stage, i) => {
    const count = stageCounts[stage] || 0
    const h = (count / maxCount) * chartH
    const x = padL + i * (barW + gap) + gap / 2
    const y = padT + chartH - h
    const color = STAGE_COLOR[stage]
    const label = STAGE_LABEL[stage]
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${color}" rx="3"/>
      <text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${color}">${count}</text>
      <text x="${x + barW / 2}" y="${padT + chartH + 16}" text-anchor="middle" font-size="10" fill="#374151">${label}</text>
    `
  }).join('')

  // Y axis ticks (0, mid, max)
  const ticks = [0, Math.ceil(maxCount / 2), maxCount].map((v) => {
    const y = padT + chartH - (v / maxCount) * chartH
    return `
      <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="2,2"/>
      <text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="9" fill="#9ca3af">${v}</text>
    `
  }).join('')

  return `
    <svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="background:#fff;border-radius:6px;">
      ${ticks}
      ${bars}
    </svg>
  `
}

// ── Render HTML ──────────────────────────────────────────────────────────────
function renderHtml(d: any): string {
  // Action: contracts pending
  const contractRows = d.contracts_pending.length === 0
    ? `<p style="color:#10b981;margin:6px 0;font-size:13px;">✅ Không có HĐ chờ ký.</p>`
    : d.contracts_pending.slice(0, 5).map((c: any) => `
      <div style="padding:8px;border-bottom:1px solid #f3f4f6;font-size:13px;">
        <div><strong style="font-family:monospace;color:#1B4D3E;">${c.code}</strong> · ${c.customer} · <strong>${fmtUSD(c.value)}</strong></div>
        <div style="color:#6b7280;font-size:11px;margin-top:2px;">
          Status: <span style="color:${c.status === 'approved' ? '#0a72ef' : '#f59e0b'};font-weight:600;">${c.status === 'approved' ? 'Đã duyệt — chờ ký' : 'Đang kiểm tra'}</span>
          · Pending ${c.days_pending}d
        </div>
      </div>
    `).join('')

  // ETD risk < 3 ngày
  const etdRiskRows = d.etd_risk.length === 0
    ? `<p style="color:#10b981;margin:6px 0;font-size:13px;">✅ Không có đơn nào ETD &lt; 3 ngày còn kẹt.</p>`
    : d.etd_risk.slice(0, 5).map((o: any) => `
      <div style="padding:8px;border-bottom:1px solid #f3f4f6;font-size:13px;">
        <div><strong style="font-family:monospace;color:#1B4D3E;">${o.code}</strong> · ${o.customer} · <strong>${fmtUSD(o.value)}</strong></div>
        <div style="color:#6b7280;font-size:11px;margin-top:2px;">
          ETD: <strong style="color:${o.days_to_etd <= 0 ? '#dc2626' : '#f59e0b'};">${fmtDate(o.etd)} (${o.days_to_etd <= 0 ? `QUÁ ${Math.abs(o.days_to_etd)}d` : `còn ${o.days_to_etd}d`})</strong>
          · Stage: ${STAGE_EMOJI[o.stage as Stage] || ''} ${STAGE_LABEL[o.stage as Stage] || o.stage}
          · Owner: ${o.owner}
        </div>
      </div>
    `).join('')

  // ETD warn 3-7 ngày
  const etdWarnRows = d.etd_warn.length === 0 ? '' : `
    <details style="margin-top:8px;font-size:12px;">
      <summary style="cursor:pointer;color:#6b7280;">+ ${d.etd_warn.length} đơn ETD 3-7 ngày (warn)</summary>
      <div style="padding:6px 0;">
        ${d.etd_warn.slice(0, 8).map((o: any) => `
          <div style="padding:4px 8px;font-size:12px;color:#374151;">
            <code>${o.code}</code> · ${o.customer} · ETD ${fmtDate(o.etd)} (${o.days_to_etd}d) · ${STAGE_LABEL[o.stage as Stage]}
          </div>
        `).join('')}
      </div>
    </details>
  `

  // Bottleneck stages
  const bottleneckRows = d.bottlenecks.length === 0
    ? `<p style="color:#10b981;margin:6px 0;font-size:13px;">✅ Tất cả bộ phận đều dưới ngưỡng warning.</p>`
    : d.bottlenecks.map((b: any) => {
      const color = b.status === 'critical' ? '#dc2626' : '#f59e0b'
      const tag = b.status === 'critical' ? 'CRITICAL' : 'WARNING'
      return `
        <div style="padding:8px;border-left:3px solid ${color};background:${b.status === 'critical' ? '#fef2f2' : '#fffbeb'};margin-bottom:4px;font-size:13px;">
          <strong>${STAGE_EMOJI[b.dept_code as Stage] || ''} ${b.dept_name}</strong>
          <span style="background:${color};color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:700;">${tag}</span>
          <div style="color:#6b7280;font-size:11px;margin-top:2px;">
            ${b.current} / ${b.capacity} đơn (${b.load_pct}%)
          </div>
        </div>
      `
    }).join('')

  // Packing today
  const packingRows = d.packing_today.length === 0
    ? `<p style="color:#6b7280;margin:6px 0;font-size:12px;font-style:italic;">Không có đơn QC pass 24h qua.</p>`
    : d.packing_today.map((p: any) => `
      <div style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">
        <code style="color:#1B4D3E;">${p.code}</code> · ${p.customer} · ${fmtUSD(p.value)}
        <span style="color:#6b7280;"> · ETD ${fmtDate(p.etd)} · ${p.owner}</span>
      </div>
    `).join('')

  // Payment pending
  const paymentRows = d.payment_pending.length === 0
    ? `<p style="color:#10b981;margin:6px 0;font-size:12px;">✅ Không có thanh toán pending.</p>`
    : d.payment_pending.slice(0, 5).map((p: any) => {
      const overdueLabel = (p.days_since_etd ?? 0) > 0
        ? `<span style="color:#dc2626;font-weight:600;">Quá ETD ${p.days_since_etd}d</span>`
        : `<span style="color:#6b7280;">${p.days_since_etd != null ? `Còn ${-p.days_since_etd}d ETD` : '—'}</span>`
      return `
        <div style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">
          <code style="color:#1B4D3E;">${p.code}</code> · ${p.customer} · <strong>${fmtUSD(p.value)}</strong>
          <span style="background:#fef3c7;color:#92400e;font-size:10px;padding:1px 5px;border-radius:3px;margin-left:4px;">${p.payment_terms} · ${p.payment_status}</span>
          <div style="margin-top:2px;font-size:11px;">${overdueLabel}</div>
        </div>
      `
    }).join('')

  // Just shipped
  const shippedRows = d.just_shipped.length === 0
    ? `<p style="color:#6b7280;margin:6px 0;font-size:12px;font-style:italic;">Không có đơn shipped 24h qua.</p>`
    : d.just_shipped.map((s: any) => `
      <div style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">
        <code style="color:#1B4D3E;">${s.code}</code> · ${s.customer} · ${fmtUSD(s.value)}
        <div style="color:#6b7280;font-size:11px;margin-top:2px;">
          BL: <code>${s.bl}</code> · ${s.vessel} (${s.shipping_line})
        </div>
      </div>
    `).join('')

  // Section helper
  const section = (title: string, color: string, badge: number | string, body: string) => `
    <div style="margin:18px 0;">
      <h2 style="color:${color};font-size:14px;margin:0 0 8px 0;border-bottom:2px solid ${color}33;padding-bottom:4px;">
        ${title}
        ${badge !== '' ? `<span style="background:${color};color:#fff;font-size:11px;padding:2px 8px;border-radius:10px;margin-left:6px;">${badge}</span>` : ''}
      </h2>
      ${body}
    </div>
  `

  return `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8f9fa;margin:0;padding:16px;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;padding:20px;border:1px solid #e4e4e7;">

  <div style="text-align:center;border-bottom:2px solid #1B4D3E;padding-bottom:12px;margin-bottom:8px;">
    <h1 style="color:#1B4D3E;font-size:20px;margin:0;">🌙 Sales Day-End Brief</h1>
    <p style="color:#6b7280;margin:4px 0 0 0;font-size:12px;">${d.date_label} · 17:30 chiều</p>
  </div>

  <div style="display:flex;gap:8px;margin:12px 0;text-align:center;">
    <div style="flex:1;background:#f0f9f4;padding:10px;border-radius:6px;">
      <div style="font-size:18px;font-weight:700;color:#1B4D3E;">${d.total_active}</div>
      <div style="font-size:10px;color:#6b7280;text-transform:uppercase;">Đơn active</div>
    </div>
    <div style="flex:1;background:#eff6ff;padding:10px;border-radius:6px;">
      <div style="font-size:18px;font-weight:700;color:#0a72ef;">${fmtUSD(d.total_in_progress_value)}</div>
      <div style="font-size:10px;color:#6b7280;text-transform:uppercase;">$ pipeline</div>
    </div>
    <div style="flex:1;background:#f0fdf4;padding:10px;border-radius:6px;">
      <div style="font-size:18px;font-weight:700;color:#10b981;">${d.delivered_yesterday_count}</div>
      <div style="font-size:10px;color:#6b7280;text-transform:uppercase;">Giao hôm qua · ${fmtUSD(d.delivered_yesterday_value)}</div>
    </div>
  </div>

  ${section(
    '⚡ Cần làm ngay — HĐ chờ ký',
    '#dc2626',
    d.contracts_pending.length,
    contractRows,
  )}

  ${section(
    '🔴 Đơn sắp miss ETD (≤ 3 ngày)',
    '#dc2626',
    d.etd_risk.length,
    etdRiskRows + etdWarnRows,
  )}

  ${section(
    '🚦 Bottleneck bộ phận',
    '#f59e0b',
    d.bottlenecks.length,
    bottleneckRows,
  )}

  ${section(
    '📦 Đóng gói trong 24h (QC pass 24h qua)',
    '#0a72ef',
    d.packing_today.length,
    packingRows,
  )}

  ${section(
    '💰 Thanh toán chờ',
    '#92400e',
    d.payment_pending.length,
    paymentRows,
  )}

  ${section(
    '🚢 Vừa xuất 24h qua',
    '#10b981',
    d.just_shipped.length,
    shippedRows,
  )}

  ${section(
    '📊 Pipeline tổng',
    '#1B4D3E',
    '',
    renderPipelineBarChart(d.stage_counts),
  )}

  <hr style="margin:20px 0;border:0;border-top:1px solid #e4e4e7;"/>
  <p style="color:#9ca3af;font-size:10px;text-align:center;margin:0;">
    Generated ${new Date().toLocaleString('vi-VN')} ·
    <a href="${APP_URL}/sales" style="color:#1B4D3E;text-decoration:none;">Mở Sales Dashboard</a>
  </p>
</div>
</body></html>`.trim()
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const data = await collectData(supabase)
    const html = renderHtml(data)

    const actionCount = data.contracts_pending.length + data.etd_risk.length + data.bottlenecks.length
    const subject = `[Sales 17:30] ${data.date_label} — ${actionCount} action · ${data.total_active} active · ${data.payment_pending.length} \$pending`

    const token = await getAccessToken()
    await sendEmail(token, REPORT_RECIPIENTS, subject, html)

    return new Response(JSON.stringify({
      success: true,
      sent_to: REPORT_RECIPIENTS.map((r) => r.email),
      subject,
      stats: {
        active: data.total_active,
        in_progress_value: data.total_in_progress_value,
        contracts_pending: data.contracts_pending.length,
        etd_risk: data.etd_risk.length,
        bottlenecks: data.bottlenecks.length,
        packing_today: data.packing_today.length,
        payment_pending: data.payment_pending.length,
        just_shipped: data.just_shipped.length,
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error: any) {
    console.error('❌ [sales-morning-brief]', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message || String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
