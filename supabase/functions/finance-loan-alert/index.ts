// =============================================================================
// EDGE FUNCTION: finance-loan-alert
// CẢNH BÁO SÁNG vốn vay cho Kế toán trưởng + BGĐ — gửi ~07:00 giờ VN.
// Tổng hợp:
//   🔴 Khoản vay ĐÃ/SẮP nhảy nhóm CIC (quá hạn ≥10 ngày = nhóm 2) + sát mốc (≥7).
//   🟡 Khoản vay sắp đến hạn (≤7 ngày tới).
//   💰 HĐTG sắp/đã đáo hạn cần TÁI TỤC (≤7 ngày) — quên là bị tất toán ép, hụt đảm bảo.
//   🏦 Hạn mức THIẾU đảm bảo (tiền gửi cầm cố < dư nợ đang vay).
// Nguồn: fin_loans, fin_deposits, fin_credit_lines.
// CHỈ gửi khi có ÍT NHẤT 1 mục cảnh báo (body {"always":true} để gửi cả khi sạch).
//
// Deploy: npx supabase functions deploy finance-loan-alert --no-verify-jwt
// Schedule (pg_cron): `0 0 * * *` UTC = 07:00 VN — xem docs/migrations/finance_loan_alert_cron.sql
// Test:   curl.exe -X POST "https://dygveetaatqllhjusyzz.supabase.co/functions/v1/finance-loan-alert" ^
//           -H "Authorization: Bearer <SERVICE_ROLE_KEY>" -H "Content-Type: application/json" -d "{\"always\":true}"
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { LOGO_B64 } from '../daily-rubber-report/logo.ts'

// ── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const TENANT_ID = Deno.env.get('AZURE_TENANT_ID') || '029187c4-44dd-4da0-b3e1-9ebda8f90b1a'
const CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID') || 'ee1377e6-b52c-4326-88f2-c18c3b59fded'
const CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET') || Deno.env.get('MICROSOFT_CLIENT_SECRET') || ''
const SENDER_EMAIL = Deno.env.get('EMAIL_FROM') || 'huyanhphongdien@huyanhrubber.com'

// ★ TẠM gửi minhld để test (như báo cáo mủ). Khi chốt, mở danh sách Kế toán trưởng + BGĐ ở dưới.
const REPORT_RECIPIENTS = [
  { name: 'Lê Duy Minh', email: 'minhld@huyanhrubber.com' },
  // { name: 'Kế toán trưởng', email: '???@huyanhrubber.com' },
  // { name: 'Lê Văn Huy',  email: 'huylv@huyanhrubber.com' },
  // { name: 'Anh Trung',    email: 'trunglxh@huyanhrubber.com' },
]

// Ngưỡng cảnh báo
const JUMP_DAYS = 10        // quá hạn ≥10 ngày → nhảy nhóm 2 (CIC chuẩn)
const WARN_DUE_DAYS = 7     // khoản vay đến hạn trong ≤7 ngày
const WARN_MATURITY_DAYS = 7 // HĐTG đáo hạn trong ≤7 ngày → cần tái tục

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Microsoft Graph (gửi mail) ───────────────────────────────────────────────
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
        attachments: [{
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: 'logo.png', contentType: 'image/png', contentId: 'huyanh-logo',
          isInline: true, contentBytes: LOGO_B64,
        }],
      },
      saveToSentItems: true,
    }),
  })
  if (!res.ok) throw new Error(`Send email error: ${await res.text()}`)
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const VN_OFFSET = 7 * 3600 * 1000
const DAYS_VI = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
const esc = (s: string) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
const fmtVnd = (n: number) => Math.round(n || 0).toLocaleString('vi-VN')
const fmtTy = (n: number) => `${((n || 0) / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`

function vnToday(): Date {
  const v = new Date(Date.now() + VN_OFFSET)
  return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()))
}
function dDiff(a: Date, b: Date): number { return Math.round((a.getTime() - b.getTime()) / 86_400_000) }
function fDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s + 'T00:00:00Z')
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

// ── Thu thập + tính cảnh báo ─────────────────────────────────────────────────
async function collectData(supabase: any) {
  const today = vnToday()
  const [loansRes, depsRes, linesRes, intRes] = await Promise.all([
    supabase.from('fin_loans').select('id, bank, loan_no, principal, paid_amount, due_date, status, credit_line_id').neq('status', 'cancelled'),
    supabase.from('fin_deposits').select('id, bank, deposit_no, holder, amount, maturity_date, extended_to, status, secured_credit_line_id'),
    supabase.from('fin_credit_lines').select('id, bank, contract_no, limit_amount, status'),
    supabase.from('fin_interest_periods').select('id, period_no, due_date, interest_amount, status, loan:fin_loans(bank, loan_no)').eq('status', 'pending'),
  ])
  if (loansRes.error) throw loansRes.error
  if (depsRes.error) throw depsRes.error
  if (linesRes.error) throw linesRes.error
  // intRes có thể lỗi nếu chưa chạy migration lãi — bỏ qua mềm
  const loans = loansRes.data || []
  const deps = depsRes.data || []
  const lines = linesRes.data || []
  const ints = intRes.error ? [] : (intRes.data || [])

  // Khoản vay: tính còn lại + quá hạn + đèn CIC
  const loanRows = loans.map((l: any) => {
    const remaining = Math.max(0, (Number(l.principal) || 0) - (Number(l.paid_amount) || 0))
    const due = new Date(l.due_date + 'T00:00:00Z')
    const overdue = dDiff(today, due)  // >0 quá hạn, <0 còn X ngày
    let cic = 'green'
    if (l.status === 'paid' || remaining <= 0) cic = 'paid'
    else if (overdue >= JUMP_DAYS) cic = 'red'
    else if (overdue >= 7) cic = 'orange'
    else if (overdue >= -WARN_DUE_DAYS) cic = 'yellow'
    return { ...l, remaining, overdue, cic }
  }).filter((l: any) => l.cic !== 'paid' && l.remaining > 0)

  const critical = loanRows.filter((l: any) => l.cic === 'red' || l.cic === 'orange')
    .sort((a: any, b: any) => b.overdue - a.overdue)
  const dueSoon = loanRows.filter((l: any) => l.cic === 'yellow')
    .sort((a: any, b: any) => a.overdue - b.overdue)

  // HĐTG sắp/đã đáo hạn cần tái tục
  const depRows = deps.filter((d: any) => d.status !== 'closed').map((d: any) => {
    const eff = d.extended_to || d.maturity_date
    const dleft = eff ? dDiff(new Date(eff + 'T00:00:00Z'), today) : 999  // còn bao nhiêu ngày tới đáo hạn
    return { ...d, eff, dleft }
  }).filter((d: any) => d.dleft <= WARN_MATURITY_DAYS).sort((a: any, b: any) => a.dleft - b.dleft)

  // Hạn mức thiếu đảm bảo (đảm bảo < dư nợ)
  const usedByLine = new Map<string, number>()
  for (const l of loanRows) if (l.credit_line_id) usedByLine.set(l.credit_line_id, (usedByLine.get(l.credit_line_id) || 0) + l.remaining)
  const securedByLine = new Map<string, number>()
  for (const d of deps) if (d.status !== 'closed' && d.secured_credit_line_id) securedByLine.set(d.secured_credit_line_id, (securedByLine.get(d.secured_credit_line_id) || 0) + (Number(d.amount) || 0))

  const underSecured = lines.filter((c: any) => (c.status || 'active') === 'active').map((c: any) => {
    const used = usedByLine.get(c.id) || 0
    const secured = securedByLine.get(c.id) || 0
    return { ...c, used, secured, shortfall: used - secured }
  }).filter((c: any) => c.used > 0 && c.shortfall > 0).sort((a: any, b: any) => b.shortfall - a.shortfall)

  // Kỳ lãi sắp/đã đến hạn (≤7 ngày)
  const intRows = ints.map((p: any) => {
    const dleft = dDiff(new Date(p.due_date + 'T00:00:00Z'), today)
    const loan = Array.isArray(p.loan) ? p.loan[0] : p.loan
    return { ...p, loan, dleft }
  }).filter((p: any) => p.dleft <= WARN_DUE_DAYS).sort((a: any, b: any) => a.dleft - b.dleft)

  const totalRemaining = loanRows.reduce((s: number, l: any) => s + l.remaining, 0)

  const vnNow = new Date(Date.now() + VN_OFFSET)
  const dateLabel = `${DAYS_VI[vnNow.getUTCDay()]}, ${String(vnNow.getUTCDate()).padStart(2, '0')}/${String(vnNow.getUTCMonth() + 1).padStart(2, '0')}/${vnNow.getUTCFullYear()}`

  return {
    dateLabel, totalRemaining,
    critical, dueSoon, intRows, depRows, underSecured,
    hasAlert: critical.length > 0 || dueSoon.length > 0 || intRows.length > 0 || depRows.length > 0 || underSecured.length > 0,
  }
}

// ── Render HTML ──────────────────────────────────────────────────────────────
const CIC = {
  red: { bg: '#fef2f2', bar: '#dc2626', label: 'NHẢY NHÓM' },
  orange: { bg: '#fff7ed', bar: '#ea580c', label: 'Sát mốc' },
  yellow: { bg: '#fefce8', bar: '#ca8a04', label: 'Sắp đến hạn' },
} as const

function pill(bg: string, txt: string) {
  return `<span style="display:inline-block;background:${bg};color:#fff;font-weight:700;font-size:11px;padding:2px 8px;border-radius:5px;white-space:nowrap;">${txt}</span>`
}
function overdueLabel(o: number): string {
  return o > 0 ? `quá hạn ${o} ngày` : o === 0 ? 'đến hạn HÔM NAY' : `còn ${-o} ngày`
}

function section(title: string, accent: string, headers: string[], rows: string): string {
  if (!rows) return ''
  const ths = headers.map((h, i) => `<th align="${i === 0 ? 'left' : i === headers.length - 1 ? 'center' : 'right'}" style="padding:7px 10px;font-weight:600;font-size:12px;">${h}</th>`).join('')
  return `
    <tr><td style="padding:14px 24px 4px 24px;"><div style="font-size:15px;font-weight:700;color:${accent};border-bottom:2px solid ${accent};padding-bottom:6px;">${title}</div></td></tr>
    <tr><td style="padding:8px 24px 6px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
        <tr style="background:#f1f5f9;color:#475569;">${ths}</tr>
        ${rows}
      </table>
    </td></tr>`
}

function renderHtml(d: any): string {
  const criticalRows = d.critical.map((l: any) => {
    const c = (CIC as any)[l.cic]
    return `<tr style="border-bottom:1px solid #eef1f0;background:${c.bg};">
      <td style="padding:8px 10px;font-weight:600;">${esc(l.bank)}${l.loan_no ? ` <span style="color:#94a3b8;">${esc(l.loan_no)}</span>` : ''}</td>
      <td align="right" style="padding:8px 10px;font-weight:700;color:#92400E;">${fmtVnd(l.remaining)}</td>
      <td align="right" style="padding:8px 10px;">${fDate(l.due_date)}</td>
      <td align="right" style="padding:8px 10px;font-weight:700;color:${c.bar};">${overdueLabel(l.overdue)}</td>
      <td align="center" style="padding:8px 10px;">${pill(c.bar, c.label)}</td>
    </tr>`
  }).join('')

  const dueSoonRows = d.dueSoon.map((l: any) => {
    const c = (CIC as any).yellow
    return `<tr style="border-bottom:1px solid #eef1f0;">
      <td style="padding:8px 10px;font-weight:600;">${esc(l.bank)}${l.loan_no ? ` <span style="color:#94a3b8;">${esc(l.loan_no)}</span>` : ''}</td>
      <td align="right" style="padding:8px 10px;font-weight:700;color:#92400E;">${fmtVnd(l.remaining)}</td>
      <td align="right" style="padding:8px 10px;">${fDate(l.due_date)}</td>
      <td align="right" style="padding:8px 10px;font-weight:700;color:${c.bar};">${overdueLabel(l.overdue)}</td>
      <td align="center" style="padding:8px 10px;">${pill(c.bar, c.label)}</td>
    </tr>`
  }).join('')

  const intRows = d.intRows.map((p: any) => {
    const over = p.dleft < 0
    return `<tr style="border-bottom:1px solid #eef1f0;${over ? 'background:#fef2f2;' : ''}">
      <td style="padding:8px 10px;font-weight:600;">${esc(p.loan?.bank || '—')}${p.loan?.loan_no ? ` <span style="color:#94a3b8;">${esc(p.loan.loan_no)}</span>` : ''}${p.period_no ? ` <span style="color:#94a3b8;">· kỳ ${p.period_no}</span>` : ''}</td>
      <td align="right" style="padding:8px 10px;font-weight:700;color:#92400E;">${fmtVnd(p.interest_amount)}</td>
      <td align="right" style="padding:8px 10px;">${fDate(p.due_date)}</td>
      <td align="center" style="padding:8px 10px;">${pill(over ? '#dc2626' : '#ca8a04', over ? `quá ${-p.dleft} ngày` : (p.dleft === 0 ? 'HÔM NAY' : `còn ${p.dleft} ngày`))}</td>
    </tr>`
  }).join('')

  const depRows = d.depRows.map((x: any) => {
    const over = x.dleft < 0
    return `<tr style="border-bottom:1px solid #eef1f0;${over ? 'background:#fef2f2;' : ''}">
      <td style="padding:8px 10px;font-weight:600;">${esc(x.bank)}${x.holder ? ` <span style="color:#94a3b8;">${esc(x.holder)}</span>` : (x.deposit_no ? ` <span style="color:#94a3b8;">${esc(x.deposit_no)}</span>` : '')}</td>
      <td align="right" style="padding:8px 10px;font-weight:700;">${fmtVnd(x.amount)}</td>
      <td align="right" style="padding:8px 10px;">${fDate(x.eff)}</td>
      <td align="center" style="padding:8px 10px;">${pill(over ? '#dc2626' : '#0ea5e9', over ? `quá ${-x.dleft} ngày` : (x.dleft === 0 ? 'đáo hạn HÔM NAY' : `còn ${x.dleft} ngày`))}</td>
    </tr>`
  }).join('')

  const underRows = d.underSecured.map((c: any) => `<tr style="border-bottom:1px solid #eef1f0;background:#fff7ed;">
      <td style="padding:8px 10px;font-weight:600;">${esc(c.bank)}${c.contract_no ? ` <span style="color:#94a3b8;">${esc(c.contract_no)}</span>` : ''}</td>
      <td align="right" style="padding:8px 10px;">${fmtVnd(c.used)}</td>
      <td align="right" style="padding:8px 10px;color:#1677ff;">${fmtVnd(c.secured)}</td>
      <td align="center" style="padding:8px 10px;">${pill('#ea580c', `thiếu ${fmtTy(c.shortfall)}`)}</td>
    </tr>`).join('')

  const body =
    section(`🔴 Khoản vay NGUY CƠ / ĐÃ nhảy nhóm (${d.critical.length})`, '#dc2626',
      ['Ngân hàng', 'Còn lại (đ)', 'Đến hạn', 'Tình trạng', 'CIC'], criticalRows) +
    section(`🟡 Khoản vay sắp đến hạn ≤${WARN_DUE_DAYS} ngày (${d.dueSoon.length})`, '#ca8a04',
      ['Ngân hàng', 'Còn lại (đ)', 'Đến hạn', 'Tình trạng', 'CIC'], dueSoonRows) +
    section(`💵 Lãi vay đến kỳ ≤${WARN_DUE_DAYS} ngày (${d.intRows.length})`, '#92400E',
      ['Khoản vay', 'Lãi (đ)', 'Đến hạn', 'Còn'], intRows) +
    section(`💰 HĐTG cần TÁI TỤC ≤${WARN_MATURITY_DAYS} ngày (${d.depRows.length})`, '#0ea5e9',
      ['Ngân hàng', 'Số tiền (đ)', 'Đáo hạn', 'Còn'], depRows) +
    section(`🏦 Hạn mức THIẾU đảm bảo (${d.underSecured.length})`, '#ea580c',
      ['Hạn mức', 'Đang vay (đ)', 'TG đảm bảo (đ)', 'Thiếu'], underRows)

  const allClear = !d.hasAlert ? `
    <tr><td style="padding:28px 24px;text-align:center;">
      <div style="font-size:40px;">✅</div>
      <div style="font-size:15px;color:#15803d;font-weight:700;margin-top:6px;">Không có cảnh báo vốn vay hôm nay</div>
      <div style="font-size:13px;color:#64748b;margin-top:4px;">Không khoản vay nào sát/đã nhảy nhóm · không HĐTG nào sắp đáo hạn · các hạn mức đủ đảm bảo.</div>
    </td></tr>` : ''

  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#eef1f0;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f0;padding:18px 10px;"><tr><td align="center">
    <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.08);">
      <tr><td style="background:#1E3A5F;padding:20px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:middle;">
            <div style="color:#fff;font-size:12px;letter-spacing:1px;text-transform:uppercase;opacity:.85;">Cao Su Huy Anh · Tài chính</div>
            <div style="color:#fff;font-size:21px;font-weight:800;margin-top:2px;">TÌNH TRẠNG VỐN VAY ĐẦU NGÀY</div>
            <div style="color:#FFD54F;font-size:13px;font-weight:600;margin-top:3px;">${d.dateLabel}</div>
          </td>
          <td style="vertical-align:middle;text-align:right;width:128px;">
            <img src="cid:huyanh-logo" alt="Cao Su Huy Anh" width="112" style="display:inline-block;background:#fff;border-radius:10px;padding:7px 10px;width:112px;height:auto;">
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:18px 24px 2px 24px;">
        <div style="font-size:14px;color:#1f2937;line-height:1.65;">
          <b>Kính gửi Ban Giám đốc &amp; Kế toán trưởng,</b><br>
          Tổng dư nợ đang theo dõi: <b style="color:#92400E;">${fmtVnd(d.totalRemaining)} đ</b> (${fmtTy(d.totalRemaining)}). Các mục cần xử lý sớm để <b>không bị nhảy nhóm CIC</b>:
        </div>
      </td></tr>
      ${allClear}
      ${body}
      <tr><td style="padding:16px 24px 22px 24px;border-top:1px solid #eef1f0;">
        <div style="font-size:11px;color:#94a3b8;line-height:1.6;">
          Cảnh báo tự động <b>đầu ngày (~07:00)</b> từ Hệ thống ERP Cao Su Huy Anh.
          Mốc nhảy nhóm CIC = quá hạn <b>≥${JUMP_DAYS} ngày</b> (cảnh báo sớm từ ${WARN_DUE_DAYS} ngày).
          HĐTG nhắc tái tục trước <b>${WARN_MATURITY_DAYS} ngày</b> để giữ tài sản đảm bảo.<br>
          Mở chi tiết: huyanhrubber.vn → Vốn vay (Tổng quan / Hạn mức / Khoản vay / Tiền gửi).
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
    let always = false
    try { const b = await req.json(); if (b && b.always === true) always = true } catch { /* no body */ }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const d = await collectData(supabase)

    if (!d.hasAlert && !always) {
      return new Response(JSON.stringify({ success: true, sent: false, reason: 'no alerts' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const html = renderHtml(d)
    const n = d.critical.length + d.dueSoon.length + d.intRows.length + d.depRows.length + d.underSecured.length
    const subject = d.hasAlert
      ? `Tình trạng vốn vay ${d.dateLabel}: ${d.critical.length} nhảy nhóm · ${d.dueSoon.length} đến hạn · ${d.intRows.length} kỳ lãi · ${d.depRows.length} HĐTG tái tục`
      : `Tình trạng vốn vay ${d.dateLabel}: không có cảnh báo ✅`

    const token = await getAccessToken()
    await sendEmail(token, REPORT_RECIPIENTS, subject, html)

    return new Response(JSON.stringify({
      success: true, sent: true, sent_to: REPORT_RECIPIENTS.map((r) => r.email), subject,
      stats: { critical: d.critical.length, due_soon: d.dueSoon.length, interest_due: d.intRows.length, deposit_renew: d.depRows.length, under_secured: d.underSecured.length, total_alerts: n },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error: any) {
    console.error('❌ [finance-loan-alert]', error)
    return new Response(JSON.stringify({ success: false, error: error.message || String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
