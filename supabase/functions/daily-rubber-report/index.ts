// =============================================================================
// EDGE FUNCTION: daily-rubber-report
// Báo cáo THU MUA MỦ hằng ngày cho BGĐ — gửi 00:30 giờ VN, tổng hợp CẢ NGÀY HÔM TRƯỚC.
// (VD: 00:30 ngày 06/06 → gửi số liệu trọn ngày 05/06.)
// Nguồn: weighbridge_tickets (NHẬP, completed) + facilities + b2b_partners.
// Cửa sổ: [hôm qua 00:00, hôm nay 00:00) giờ VN; so với ngày trước nữa.
//
// Deploy: npx supabase functions deploy daily-rubber-report --no-verify-jwt
// Schedule (pg_cron): `30 17 * * *` UTC = 00:30 VN (xem scheduled SQL ở docs).
// Test:   curl -X POST "https://dygveetaatqllhjusyzz.supabase.co/functions/v1/daily-rubber-report" \
//           -H "Authorization: Bearer <SERVICE_ROLE_KEY>" -H "Content-Type: application/json" -d "{}"
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

// ★ TEST MODE — chỉ gửi cho Minh trước. Verify OK thì đổi sang BGD_FULL.
const REPORT_RECIPIENTS = [
  { name: 'Lê Duy Minh', email: 'minhld@huyanhrubber.com' },
]
// ★ FINAL — bỏ comment, gán REPORT_RECIPIENTS = BGD_FULL khi chốt.
// const BGD_FULL = [
//   { name: 'Lê Văn Huy', email: 'huylv@huyanhrubber.com' },
//   { name: 'Hồ Thị Thủy', email: 'thuyht@huyanhrubber.com' },
//   { name: 'Lê Duy Minh', email: 'minhld@huyanhrubber.com' },
// ]

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Microsoft Graph API (gửi mail) ──────────────────────────────────────────
async function getAccessToken(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) throw new Error(`Token error: ${await res.text()}`)
  return (await res.json()).access_token
}

async function sendEmail(token: string, recipients: Array<{ name: string; email: string }>, subject: string, html: string) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: recipients.map((r) => ({ emailAddress: { address: r.email, name: r.name } })),
      },
      saveToSentItems: true,
    }),
  })
  if (!res.ok) throw new Error(`Send email error: ${await res.text()}`)
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const VN_OFFSET = 7 * 3600 * 1000
const DAYS_VI = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']

const RUBBER = {
  mu_nuoc: { label: 'Mủ nước', icon: '💧', bg: 'e6f0fb', bar: '2563eb' },
  mu_dong: { label: 'Mủ đông', icon: '🧊', bg: 'e9f5ee', bar: '1B4D3E' },
  mu_tap:  { label: 'Mủ tạp',  icon: '🪨', bg: 'f4eee2', bar: 'b45309' },
  mu_chen: { label: 'Mủ chén', icon: '🥣', bg: 'eee9f5', bar: '6d28d9' },
  mu_to:   { label: 'Mủ tờ',   icon: '📄', bg: 'eee9f5', bar: '6d28d9' },
  svr:     { label: 'SVR',     icon: '📦', bg: 'eef2f7', bar: '475569' },
} as const

function fmt1(n: number): string {
  const s = (Math.round(n * 10) / 10).toFixed(1)
  const [int, dec] = s.split('.')
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`
}
const fmtT = (kg: number) => fmt1(kg / 1000)        // kg → tấn (1 chữ số)
const fmtKg = (kg: number) => String(Math.round(kg)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')  // kg, chấm nghìn
const esc = (s: string) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))

// ── Thu thập + tổng hợp dữ liệu ──────────────────────────────────────────────
interface Ticket {
  id: string; facility_id: string | null; net_weight: number | null
  rubber_type: string | null; partner_id: string | null; supplier_name: string | null
  qc_actual_drc: number | null
  facility?: { code: string; name: string } | { code: string; name: string }[] | null
}

const SELECT = `id, facility_id, net_weight, rubber_type, partner_id, supplier_name, qc_actual_drc,
  facility:facilities!facility_id(code, name)`

async function fetchIN(supabase: any, fromISO: string, toISO: string): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from('weighbridge_tickets')
    .select(SELECT)
    .eq('ticket_type', 'in')
    .eq('status', 'completed')
    .gte('created_at', fromISO)
    .lte('created_at', toISO)
  if (error) throw error
  return (data || []) as Ticket[]
}

function facCode(t: Ticket): { code: string; name: string } {
  const f: any = Array.isArray(t.facility) ? t.facility[0] : t.facility
  return { code: f?.code || '?', name: f?.name || 'Chưa rõ' }
}

async function collectData(supabase: any, mode: 'prevday' | 'today' = 'prevday') {
  const DAY = 24 * 3600 * 1000
  const vnNow = new Date(Date.now() + VN_OFFSET)
  const vnMidnightUTC = Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate()) - VN_OFFSET
  // Mặc định (cron 0h30): CẢ NGÀY HÔM QUA [hôm qua 00:00, hôm nay 00:00).
  // mode='today' (test): HÔM NAY tới giờ chạy [hôm nay 00:00, now).
  const isToday = mode === 'today'
  const repStart = new Date(isToday ? vnMidnightUTC : vnMidnightUTC - DAY).toISOString()
  const repEnd = isToday ? new Date().toISOString() : new Date(vnMidnightUTC).toISOString()
  const prevStart = new Date(isToday ? vnMidnightUTC - DAY : vnMidnightUTC - 2 * DAY).toISOString()
  const prevEnd = isToday ? new Date(Date.now() - DAY).toISOString() : repStart

  const [today, yesterday] = await Promise.all([
    fetchIN(supabase, repStart, repEnd),
    fetchIN(supabase, prevStart, prevEnd),
  ])

  // DRC trung bình theo loại (từ phiếu có DRC) — để ước KL khô cho phiếu thiếu DRC
  const drcSum: Record<string, number> = {}, drcCnt: Record<string, number> = {}
  let allDrcSum = 0, allDrcCnt = 0
  for (const t of today) {
    if (t.qc_actual_drc != null && t.qc_actual_drc > 0) {
      const rt = t.rubber_type || 'other'
      drcSum[rt] = (drcSum[rt] || 0) + t.qc_actual_drc; drcCnt[rt] = (drcCnt[rt] || 0) + 1
      allDrcSum += t.qc_actual_drc; allDrcCnt++
    }
  }
  const avgAll = allDrcCnt ? allDrcSum / allDrcCnt : 32  // fallback 32% nếu chưa có DRC nào
  const drcOf = (t: Ticket): { drc: number; estimated: boolean } => {
    if (t.qc_actual_drc != null && t.qc_actual_drc > 0) return { drc: t.qc_actual_drc, estimated: false }
    const rt = t.rubber_type || 'other'
    const est = drcCnt[rt] ? drcSum[rt] / drcCnt[rt] : avgAll
    return { drc: est, estimated: true }
  }

  const dryOf = (t: Ticket) => (t.net_weight || 0) * drcOf(t).drc / 100

  const sumTuoi = (arr: Ticket[]) => arr.reduce((s, t) => s + (t.net_weight || 0), 0)
  const sumKho = (arr: Ticket[]) => arr.reduce((s, t) => s + dryOf(t), 0)

  const totalTuoi = sumTuoi(today)
  const totalKho = sumKho(today)
  const yTuoi = sumTuoi(yesterday)
  const pct = yTuoi > 0 ? ((totalTuoi - yTuoi) / yTuoi) * 100 : null
  const drcTB = totalTuoi > 0 ? (totalKho / totalTuoi) * 100 : 0

  // Theo nhà máy
  const facMap = new Map<string, { code: string; name: string; xe: number; tuoi: number; kho: number }>()
  for (const t of today) {
    const f = facCode(t)
    const key = f.code
    const cur = facMap.get(key) || { code: f.code, name: f.name, xe: 0, tuoi: 0, kho: 0 }
    cur.xe++; cur.tuoi += t.net_weight || 0; cur.kho += dryOf(t)
    facMap.set(key, cur)
  }
  const facilities = [...facMap.values()].sort((a, b) => b.tuoi - a.tuoi)

  // Theo loại mủ
  const typeMap = new Map<string, number>()
  for (const t of today) {
    const rt = (t.rubber_type || 'other').split(',')[0].trim() || 'other'
    typeMap.set(rt, (typeMap.get(rt) || 0) + (t.net_weight || 0))
  }
  const types = [...typeMap.entries()].map(([k, v]) => ({ key: k, tuoi: v })).sort((a, b) => b.tuoi - a.tuoi)

  // Top đại lý (cần tên: supplier_name hoặc tra b2b_partners)
  const partnerIds = [...new Set(today.map((t) => t.partner_id).filter(Boolean))] as string[]
  const nameById = new Map<string, string>()
  if (partnerIds.length) {
    const { data: ps } = await supabase.from('b2b_partners').select('id, name').in('id', partnerIds)
    for (const p of ps || []) nameById.set(p.id, p.name)
  }
  const dealerMap = new Map<string, { name: string; fac: string; type: string; tuoi: number }>()
  for (const t of today) {
    const name = t.supplier_name || (t.partner_id ? nameById.get(t.partner_id) : '') || 'Không rõ'
    const key = name
    const cur = dealerMap.get(key) || { name, fac: facCode(t).code, type: t.rubber_type || '', tuoi: 0 }
    cur.tuoi += t.net_weight || 0
    dealerMap.set(key, cur)
  }
  const topDealers = [...dealerMap.values()].sort((a, b) => b.tuoi - a.tuoi).slice(0, 5)
  const dealerCount = dealerMap.size

  // Chi tiết TỪNG đại lý × loại mủ trong ngày: xe, KL tươi, DRC (bình quân theo KL), KL khô
  const detMap = new Map<string, { name: string; fac: string; type: string; xe: number; tuoi: number; kho: number; drcW: number }>()
  for (const t of today) {
    const name = t.supplier_name || (t.partner_id ? nameById.get(t.partner_id) : '') || 'Không rõ'
    const rt = (t.rubber_type || 'other').split(',')[0].trim() || 'other'
    const net = t.net_weight || 0
    const { drc } = drcOf(t)
    const key = name + '|' + rt
    const cur = detMap.get(key) || { name, fac: facCode(t).code, type: rt, xe: 0, tuoi: 0, kho: 0, drcW: 0 }
    cur.xe++; cur.tuoi += net; cur.kho += net * drc / 100; cur.drcW += drc * net
    detMap.set(key, cur)
  }
  const dealerDetail = [...detMap.values()]
    .map((x) => ({ ...x, drc: x.tuoi ? x.drcW / x.tuoi : 0 }))
    .sort((a, b) => b.tuoi - a.tuoi)

  // Cảnh báo thiếu DRC
  const missing = today.filter((t) => (t.qc_actual_drc == null || t.qc_actual_drc <= 0) && (t.net_weight || 0) > 0)
  const missingKg = missing.reduce((s, t) => s + (t.net_weight || 0), 0)

  // Nhãn ngày = NGÀY ĐƯỢC BÁO CÁO (hôm qua, hoặc hôm nay nếu mode test)
  const repLocal = new Date((isToday ? vnMidnightUTC : vnMidnightUTC - DAY) + VN_OFFSET)
  const cutoff = `${String(vnNow.getUTCHours()).padStart(2, '0')}:${String(vnNow.getUTCMinutes()).padStart(2, '0')}`
  const dateLabel = `${DAYS_VI[repLocal.getUTCDay()]}, ${String(repLocal.getUTCDate()).padStart(2, '0')}/${String(repLocal.getUTCMonth() + 1).padStart(2, '0')}/${repLocal.getUTCFullYear()}`
    + (isToday ? ` (tới ${cutoff})` : '')

  return {
    dateLabel, isToday, cutoff,
    totalTuoi, totalKho, yTuoi, pct, drcTB,
    xeCount: today.length, dealerCount,
    facilities, types, topDealers, dealerDetail,
    missingCount: missing.length, missingKg,
    empty: today.length === 0,
  }
}

// ── Render HTML (khớp mock MAIL_BAO_CAO_THU_MUA_MOCK.html) ───────────────────
function renderHtml(d: any): string {
  const trendHtml = d.pct == null
    ? `<div style="font-size:12px;color:#94a3b8;margin-top:2px;">Chưa có số hôm qua để so sánh</div>`
    : `<div style="font-size:12px;color:${d.pct >= 0 ? '#15803d' : '#dc2626'};margin-top:2px;">${d.pct >= 0 ? '▲' : '▼'} ${fmt1(Math.abs(d.pct))}% so với hôm trước (${fmtT(d.yTuoi)} t)</div>`

  const facRows = d.facilities.map((f: any) => `
    <tr style="border-bottom:1px solid #eef1f0;">
      <td style="padding:8px 10px;">${esc(f.name)} <span style="color:#94a3b8;">(${esc(f.code)})</span></td>
      <td align="center" style="padding:8px 10px;">${f.xe}</td>
      <td align="right" style="padding:8px 10px;font-weight:600;">${fmtT(f.tuoi)}</td>
      <td align="right" style="padding:8px 10px;font-weight:600;color:#92400E;">${fmtT(f.kho)}</td>
      <td align="right" style="padding:8px 10px;">${fmt1(f.tuoi > 0 ? f.kho / f.tuoi * 100 : 0)}%</td>
    </tr>`).join('')

  const maxTuoi = Math.max(1, ...d.types.map((x: any) => x.tuoi))
  const typeBars = d.types.map((x: any) => {
    const m = (RUBBER as any)[x.key] || { label: x.key, icon: '•', bg: 'eef2f7', bar: '475569' }
    const pctOfMax = Math.round(x.tuoi / maxTuoi * 100)
    const pctOfTotal = d.totalTuoi > 0 ? Math.round(x.tuoi / d.totalTuoi * 100) : 0
    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
      <tr>
        <td width="92" style="font-size:13px;color:#334155;">${m.icon} ${m.label}</td>
        <td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#${m.bg};border-radius:6px;">
            <tr><td width="${Math.max(3, pctOfMax)}%" style="background:#${m.bar};border-radius:6px;height:18px;"></td><td></td></tr>
          </table>
        </td>
        <td width="110" align="right" style="font-size:13px;font-weight:700;color:#1f2937;">${fmtT(x.tuoi)} t · ${pctOfTotal}%</td>
      </tr>
    </table>`
  }).join('')

  const dealerRows = d.topDealers.map((p: any, i: number) => {
    const m = (RUBBER as any)[(p.type || '').split(',')[0]] || null
    return `
    <tr style="border-top:1px solid #eef1f0;${i % 2 ? 'background:#fafcfb;' : ''}">
      <td style="padding:7px 10px;color:#94a3b8;">${i + 1}</td>
      <td style="padding:7px 10px;font-weight:600;">${esc(p.name)}</td>
      <td align="center" style="padding:7px 10px;">${esc(p.fac)}</td>
      <td style="padding:7px 10px;">${m ? m.label : '—'}</td>
      <td align="right" style="padding:7px 10px;font-weight:700;color:#1B4D3E;">${fmtT(p.tuoi)}</td>
    </tr>`
  }).join('')

  // Chi tiết từng đại lý × loại mủ (KL theo kg)
  const detailRows = (d.dealerDetail || []).map((p: any, i: number) => {
    const m = (RUBBER as any)[p.type] || null
    return `
    <tr style="border-top:1px solid #eef1f0;${i % 2 ? 'background:#fafcfb;' : ''}">
      <td style="padding:6px 8px;color:#94a3b8;">${i + 1}</td>
      <td style="padding:6px 8px;font-weight:600;">${esc(p.name)}</td>
      <td align="center" style="padding:6px 8px;">${esc(p.fac)}</td>
      <td style="padding:6px 8px;">${m ? m.icon + ' ' + m.label : esc(p.type)}</td>
      <td align="center" style="padding:6px 8px;">${p.xe}</td>
      <td align="right" style="padding:6px 8px;font-weight:700;">${fmtKg(p.tuoi)}</td>
      <td align="right" style="padding:6px 8px;">${fmt1(p.drc)}%</td>
      <td align="right" style="padding:6px 8px;font-weight:600;color:#92400E;">${fmtKg(p.kho)}</td>
    </tr>`
  }).join('')

  const warnHtml = d.missingCount > 0 ? `
    <tr><td style="padding:10px 24px 4px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7E6;border:1px solid #FFE08A;border-radius:8px;">
        <tr><td style="padding:10px 12px;font-size:12px;color:#92400E;">
          ⚠ <b>${d.missingCount} phiếu chưa nhập DRC</b> (≈${fmtT(d.missingKg)} tấn tươi) — KL khô tạm tính theo DRC trung bình. Số khô có thể đổi sau khi QC nhập đủ.
        </td></tr>
      </table>
    </td></tr>` : ''

  const emptyHtml = d.empty ? `
    <tr><td style="padding:24px;text-align:center;color:#64748b;font-size:14px;">
      Không có phiếu cân NHẬP hoàn tất nào trong ngày ${d.dateLabel}.
    </td></tr>` : ''

  const body = d.empty ? emptyHtml : `
    <!-- KPI -->
    <tr><td style="padding:18px 18px 4px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" style="padding:6px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0F9F4;border:1px solid #cde8d8;border-radius:10px;"><tr><td style="padding:14px;">
              <div style="font-size:12px;color:#15803d;font-weight:600;">TỔNG MỦ TƯƠI NHẬP</div>
              <div style="font-size:28px;font-weight:800;color:#1B4D3E;margin-top:2px;">${fmtT(d.totalTuoi)} <span style="font-size:14px;font-weight:600;">tấn</span></div>
              ${trendHtml}
            </td></tr></table>
          </td>
          <td width="50%" style="padding:6px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8EC;border:1px solid #f3e1bd;border-radius:10px;"><tr><td style="padding:14px;">
              <div style="font-size:12px;color:#B45309;font-weight:600;">KL KHÔ QUY ĐỔI (DRC)</div>
              <div style="font-size:28px;font-weight:800;color:#92400E;margin-top:2px;">${fmtT(d.totalKho)} <span style="font-size:14px;font-weight:600;">tấn</span></div>
              <div style="font-size:12px;color:#B45309;margin-top:2px;">DRC trung bình ${fmt1(d.drcTB)}%</div>
            </td></tr></table>
          </td>
        </tr>
        <tr>
          <td width="50%" style="padding:6px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border:1px solid #e2e8f0;border-radius:10px;"><tr><td style="padding:14px;">
              <div style="font-size:12px;color:#475569;font-weight:600;">SỐ CHUYẾN XE</div>
              <div style="font-size:28px;font-weight:800;color:#1f2937;margin-top:2px;">${d.xeCount} <span style="font-size:14px;font-weight:600;">xe</span></div>
              <div style="font-size:12px;color:#64748b;margin-top:2px;">phiếu cân hoàn tất</div>
            </td></tr></table>
          </td>
          <td width="50%" style="padding:6px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;border:1px solid #e2e8f0;border-radius:10px;"><tr><td style="padding:14px;">
              <div style="font-size:12px;color:#475569;font-weight:600;">ĐẠI LÝ GIAO HÀNG</div>
              <div style="font-size:28px;font-weight:800;color:#1f2937;margin-top:2px;">${d.dealerCount} <span style="font-size:14px;font-weight:600;">đại lý</span></div>
              <div style="font-size:12px;color:#64748b;margin-top:2px;">trên ${d.facilities.length} nhà máy</div>
            </td></tr></table>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- Theo nhà máy -->
    <tr><td style="padding:16px 24px 4px 24px;"><div style="font-size:15px;font-weight:700;color:#1B4D3E;border-bottom:2px solid #1B4D3E;padding-bottom:6px;">🏭 Theo nhà máy</div></td></tr>
    <tr><td style="padding:8px 24px 6px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
        <tr style="background:#1B4D3E;color:#fff;">
          <th align="left" style="padding:8px 10px;font-weight:600;">Nhà máy</th>
          <th align="center" style="padding:8px 10px;font-weight:600;">Xe</th>
          <th align="right" style="padding:8px 10px;font-weight:600;">Mủ tươi (t)</th>
          <th align="right" style="padding:8px 10px;font-weight:600;">KL khô (t)</th>
          <th align="right" style="padding:8px 10px;font-weight:600;">DRC TB</th>
        </tr>
        ${facRows}
        <tr style="background:#F0F9F4;font-weight:800;color:#1B4D3E;">
          <td style="padding:9px 10px;">TỔNG</td>
          <td align="center" style="padding:9px 10px;">${d.xeCount}</td>
          <td align="right" style="padding:9px 10px;">${fmtT(d.totalTuoi)}</td>
          <td align="right" style="padding:9px 10px;">${fmtT(d.totalKho)}</td>
          <td align="right" style="padding:9px 10px;">${fmt1(d.drcTB)}%</td>
        </tr>
      </table>
    </td></tr>

    <!-- Theo loại mủ -->
    <tr><td style="padding:16px 24px 4px 24px;"><div style="font-size:15px;font-weight:700;color:#1B4D3E;border-bottom:2px solid #1B4D3E;padding-bottom:6px;">💧 Theo loại mủ</div></td></tr>
    <tr><td style="padding:10px 24px 6px 24px;">${typeBars}</td></tr>

    <!-- Chi tiết từng đại lý nhập mủ (đặt TRÊN Top đại lý) -->
    <tr><td style="padding:16px 24px 4px 24px;"><div style="font-size:15px;font-weight:700;color:#1B4D3E;border-bottom:2px solid #1B4D3E;padding-bottom:6px;">📋 Chi tiết đại lý nhập mủ (theo ngày)</div></td></tr>
    <tr><td style="padding:8px 24px 8px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;">
        <tr style="background:#1B4D3E;color:#fff;">
          <th align="left" style="padding:6px 8px;font-weight:600;">#</th>
          <th align="left" style="padding:6px 8px;font-weight:600;">Đại lý</th>
          <th align="center" style="padding:6px 8px;font-weight:600;">NM</th>
          <th align="left" style="padding:6px 8px;font-weight:600;">Loại mủ</th>
          <th align="center" style="padding:6px 8px;font-weight:600;">Xe</th>
          <th align="right" style="padding:6px 8px;font-weight:600;">Tươi (kg)</th>
          <th align="right" style="padding:6px 8px;font-weight:600;">DRC</th>
          <th align="right" style="padding:6px 8px;font-weight:600;">Khô (kg)</th>
        </tr>
        ${detailRows}
      </table>
      <div style="font-size:11px;color:#94a3b8;padding:6px 8px 0;">Mỗi dòng = 1 đại lý × 1 loại mủ. KL theo kg. DRC bình quân theo khối lượng.</div>
    </td></tr>

    <!-- Top đại lý -->
    <tr><td style="padding:16px 24px 4px 24px;"><div style="font-size:15px;font-weight:700;color:#1B4D3E;border-bottom:2px solid #1B4D3E;padding-bottom:6px;">🏆 Top đại lý giao nhiều nhất</div></td></tr>
    <tr><td style="padding:8px 24px 8px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
        <tr style="color:#64748b;font-size:12px;">
          <th align="left" style="padding:6px 10px;font-weight:600;">#</th>
          <th align="left" style="padding:6px 10px;font-weight:600;">Đại lý</th>
          <th align="center" style="padding:6px 10px;font-weight:600;">NM</th>
          <th align="left" style="padding:6px 10px;font-weight:600;">Loại</th>
          <th align="right" style="padding:6px 10px;font-weight:600;">Mủ tươi (t)</th>
        </tr>
        ${dealerRows}
      </table>
      ${d.dealerCount > 5 ? `<div style="font-size:11px;color:#94a3b8;padding:6px 10px 0;">…và ${d.dealerCount - 5} đại lý khác.</div>` : ''}
    </td></tr>
    ${warnHtml}`

  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#eef1f0;font-family:Arial,'Helvetica Neue',sans-serif;color:#1f2937;">
  <div style="display:none;max-height:0;overflow:hidden;color:#eef1f0;">Ngày ${d.dateLabel}: nhập ${fmtT(d.totalTuoi)} tấn mủ tươi (≈${fmtT(d.totalKho)} tấn khô) · ${d.xeCount} xe.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f0;padding:18px 10px;"><tr><td align="center">
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.08);">
      <tr><td style="background:#1B4D3E;padding:20px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;">
            <div style="color:#fff;font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.8;">Cao Su Huy Anh</div>
            <div style="color:#fff;font-size:21px;font-weight:800;margin-top:2px;">BÁO CÁO THU MUA MỦ</div>
            <div style="color:#FFD54F;font-size:13px;font-weight:600;margin-top:3px;">${d.dateLabel} &middot; ${d.isToday ? 'số liệu tới giờ (TEST)' : 'tổng hợp cả ngày'}</div>
          </td>
          <td style="vertical-align:middle;text-align:right;">
            <div style="display:inline-block;background:#fff;border-radius:8px;padding:8px 12px;"><span style="color:#1B4D3E;font-weight:800;font-size:18px;">HUY ANH</span></div>
          </td>
        </tr></table>
      </td></tr>
      ${body}
      <tr><td style="padding:16px 24px 22px 24px;border-top:1px solid #eef1f0;">
        <div style="font-size:11px;color:#94a3b8;line-height:1.6;">
          ${d.isToday
            ? `<b>BẢN TEST</b> — số liệu HÔM NAY (00:00–${d.cutoff} giờ VN). Bản chính thức tự gửi 00:30 mỗi sáng cho ngày hôm trước.`
            : `Báo cáo tự động lúc 00:30 mỗi sáng cho NGÀY HÔM TRƯỚC, từ <b>Hệ thống Trạm cân Cao Su Huy Anh</b>.`}<br>
          Số liệu = phiếu cân NHẬP đã <b>hoàn tất</b>${d.isToday ? ` (00:00–${d.cutoff})` : ' trọn ngày (00:00–24:00)'} giờ VN. KL khô = KL tươi × DRC.<br>
          Mủ chưa có DRC được tạm tính theo DRC trung bình cùng loại.
        </div>
      </td></tr>
    </table>
    <div style="font-size:11px;color:#9aa4a0;padding:12px;">© Cao Su Huy Anh · Email nội bộ — không trả lời.</div>
  </td></tr></table>
</body></html>`.trim()
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    // Test: gửi body {"range":"today"} để báo cáo HÔM NAY tới giờ. Mặc định = ngày hôm trước.
    let mode: 'prevday' | 'today' = 'prevday'
    try { const b = await req.json(); if (b && (b.range === 'today' || b.today === true)) mode = 'today' } catch { /* no body */ }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const d = await collectData(supabase, mode)
    const html = renderHtml(d)
    const subject = `${d.isToday ? '[Thu mua · TEST]' : '[Thu mua]'} ${d.dateLabel} — ${fmtT(d.totalTuoi)}t tươi · ${fmtT(d.totalKho)}t khô · ${d.xeCount} xe`

    const token = await getAccessToken()
    await sendEmail(token, REPORT_RECIPIENTS, subject, html)

    return new Response(JSON.stringify({
      success: true,
      sent_to: REPORT_RECIPIENTS.map((r) => r.email),
      subject,
      stats: { tuoi_kg: d.totalTuoi, kho_kg: d.totalKho, xe: d.xeCount, dai_ly: d.dealerCount, missing_drc: d.missingCount },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error: any) {
    console.error('❌ [daily-rubber-report]', error)
    return new Response(JSON.stringify({ success: false, error: error.message || String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
