// =============================================================================
// EDGE FUNCTION: b2b-deal-notify
// Gửi email khi Deal mới được tạo từ phiếu chốt mủ B2B chat → BGĐ.
// =============================================================================
//
// Recipient: 4 BGĐ — Huy / Thủy / Phú / Minh
// Trigger: Client gọi sau khi dealConfirmService.confirmDealFromChat() insert
//   b2b_deals thành công. Fire-and-forget (không block UX).
//
// Input: { deal_id: string }
// Email content:
//   1. Header — Deal mới
//   2. Thông tin Deal (số deal, partner, sản phẩm, qty, DRC, đơn giá, total)
//   3. Lịch sử thương lượng (từ booking metadata.negotiation_history)
//   4. Pickup + Delivery + Target facility
//   5. Người tạo Deal (factory employee)
//
// Deploy: npx supabase functions deploy b2b-deal-notify --no-verify-jwt
// Test:   curl -X POST "https://dygveetaatqllhjusyzz.supabase.co/functions/v1/b2b-deal-notify" \
//           -H "Authorization: Bearer <SERVICE_ROLE>" -H "Content-Type: application/json" \
//           -d '{"deal_id":"<UUID>"}'
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const TENANT_ID = Deno.env.get('AZURE_TENANT_ID') || '029187c4-44dd-4da0-b3e1-9ebda8f90b1a'
const CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID') || 'ee1377e6-b52c-4326-88f2-c18c3b59fded'
const CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET') || Deno.env.get('MICROSOFT_CLIENT_SECRET') || ''
const SENDER_EMAIL = Deno.env.get('EMAIL_FROM') || 'huyanhphongdien@huyanhrubber.com'

// ★ TEST MODE — Chỉ gửi cho Minh để verify nội dung mail.
//   Khi OK, swap sang FULL_RECIPIENTS (uncomment block dưới).
const RECIPIENTS = [
  { name: 'Lê Duy Minh', email: 'minhld@huyanhrubber.com' },
]
// const FULL_RECIPIENTS = [
//   { name: 'Lê Văn Huy', email: 'huylv@huyanhrubber.com' },
//   { name: 'Hồ Thị Thủy', email: 'thuyht@huyanhrubber.com' },
//   { name: 'Lê Văn Phú', email: 'phulv@huyanhrubber.com' },
//   { name: 'Lê Duy Minh', email: 'minhld@huyanhrubber.com' },
// ]

const APP_URL = 'https://huyanhrubber.vn'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PRODUCT_LABELS: Record<string, string> = {
  mu_nuoc: 'Mủ nước',
  mu_tap: 'Mủ tạp',
  mu_dong: 'Mủ đông',
  mu_chen: 'Mủ chén',
  mu_to: 'Mủ tờ',
}

const fmtVnd = (v?: number) => v ? new Intl.NumberFormat('vi-VN').format(v) + ' VNĐ' : '—'
const fmtDate = (d?: string) => d ? new Date(d).toLocaleString('vi-VN') : '—'

// ── Microsoft Graph ─────────────────────────────────────────────────────────
async function getAccessToken(): Promise<string> {
  const resp = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  )
  if (!resp.ok) throw new Error(`Token error: ${await resp.text()}`)
  const data = await resp.json()
  return data.access_token
}

async function sendEmail(token: string, subject: string, htmlBody: string): Promise<void> {
  const resp = await fetch(
    `https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'HTML', content: htmlBody },
          toRecipients: RECIPIENTS.map(r => ({
            emailAddress: { address: r.email, name: r.name },
          })),
        },
        saveToSentItems: true,
      }),
    },
  )
  if (!resp.ok) throw new Error(`SendMail error: ${await resp.text()}`)
}

// ── Build HTML ──────────────────────────────────────────────────────────────
function buildHtml(deal: any, booking: any, partner: any, creator: any): string {
  const product = PRODUCT_LABELS[deal.product_code] || deal.product_name || '—'
  const history = (booking?.negotiation_history || []) as Array<any>
  const isDry = deal.price_unit === 'dry'
  const unitLabel = isDry ? 'kg khô' : 'kg ướt'

  const historyRows = history.length === 0
    ? '<tr><td colspan="4" style="padding:8px;color:#999;text-align:center;font-style:italic;">Không có thương lượng — chốt ngay giá đề xuất.</td></tr>'
    : history.map((h, i) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:center;">
          <span style="background:${h.actor_role === 'factory' ? '#1B4D3E' : '#fa8c16'};color:#fff;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;">
            #${i + 1} ${h.actor_role === 'factory' ? 'NHÀ MÁY' : 'ĐẠI LÝ'}
          </span>
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;">${h.actor_name || '—'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;font-weight:600;color:#1890ff;text-align:right;">
          ${h.counter_price.toLocaleString('vi-VN')} đ/${unitLabel}
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;font-size:11px;color:#666;font-style:italic;">
          "${h.notes || ''}"<br/>
          <span style="font-size:10px;color:#999;">${fmtDate(h.ts)}</span>
        </td>
      </tr>
    `).join('')

  const targetFacility = deal.target_facility_id
    ? `<tr><td style="padding:6px 10px;color:#666;font-size:12px;width:140px;">🏭 Nhà máy đích</td><td style="padding:6px 10px;font-size:12px;font-weight:500;">${deal.target_facility_name || deal.target_facility_id}</td></tr>`
    : ''

  const lotCode = deal.lot_code
    ? `<tr><td style="padding:6px 10px;color:#666;font-size:12px;">🏷️ Mã lô</td><td style="padding:6px 10px;font-size:12px;font-weight:500;font-family:monospace;">${deal.lot_code}</td></tr>`
    : ''

  return `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f8f9fa;margin:0;padding:20px;">
<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e4e4e7;">

  <!-- HEADER -->
  <div style="text-align:center;border-bottom:2px solid #1B4D3E;padding-bottom:14px;margin-bottom:18px;">
    <div style="font-size:28px;">🤝</div>
    <h1 style="color:#1B4D3E;font-size:20px;margin:6px 0 4px 0;">Deal mới được chốt</h1>
    <div style="font-size:13px;color:#6b7280;">Mã Deal: <strong style="font-family:monospace;color:#1B4D3E;">${deal.deal_number}</strong></div>
  </div>

  <!-- THÔNG TIN PARTNER & DEAL -->
  <h2 style="color:#1B4D3E;font-size:14px;margin:16px 0 8px 0;border-bottom:1px solid #e4e4e7;padding-bottom:4px;">
    🏢 Thông tin chính
  </h2>
  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:6px 10px;color:#666;font-size:12px;width:140px;">Đại lý</td><td style="padding:6px 10px;font-size:13px;font-weight:600;">${partner?.name || partner?.short_name || '—'} ${partner?.code ? `<span style="color:#999;font-size:11px;font-family:monospace;">(${partner.code})</span>` : ''}</td></tr>
    <tr><td style="padding:6px 10px;color:#666;font-size:12px;">Sản phẩm</td><td style="padding:6px 10px;font-size:12px;font-weight:500;">${product}</td></tr>
    <tr><td style="padding:6px 10px;color:#666;font-size:12px;">Khối lượng</td><td style="padding:6px 10px;font-size:12px;font-weight:500;">${(deal.quantity_kg / 1000).toLocaleString('vi-VN')} tấn (${deal.quantity_kg.toLocaleString('vi-VN')} kg)</td></tr>
    <tr><td style="padding:6px 10px;color:#666;font-size:12px;">DRC dự kiến</td><td style="padding:6px 10px;font-size:12px;font-weight:500;">${deal.expected_drc || '—'}%</td></tr>
    <tr><td style="padding:6px 10px;color:#666;font-size:12px;">Đơn giá thoả thuận</td><td style="padding:6px 10px;font-size:13px;font-weight:700;color:#1890ff;">${deal.unit_price?.toLocaleString('vi-VN')} đ/${unitLabel}</td></tr>
    <tr style="background:#f0f9f4;"><td style="padding:8px 10px;color:#1B4D3E;font-size:13px;font-weight:600;">💰 Tổng giá trị</td><td style="padding:8px 10px;font-size:16px;font-weight:700;color:#1B4D3E;">${fmtVnd(deal.total_value_vnd)}</td></tr>
    ${lotCode}
    ${targetFacility}
    ${deal.delivery_date ? `<tr><td style="padding:6px 10px;color:#666;font-size:12px;">📅 Ngày giao</td><td style="padding:6px 10px;font-size:12px;font-weight:500;">${new Date(deal.delivery_date).toLocaleDateString('vi-VN')}</td></tr>` : ''}
    ${deal.pickup_location_name ? `<tr><td style="padding:6px 10px;color:#666;font-size:12px;">📍 Địa điểm chốt</td><td style="padding:6px 10px;font-size:12px;font-weight:500;">${deal.pickup_location_name}</td></tr>` : ''}
  </table>

  <!-- LỊCH SỬ THƯƠNG LƯỢNG -->
  <h2 style="color:#1B4D3E;font-size:14px;margin:20px 0 8px 0;border-bottom:1px solid #e4e4e7;padding-bottom:4px;">
    📜 Lịch sử thương lượng${history.length > 0 ? ` (${history.length} vòng)` : ''}
  </h2>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e4e4e7;border-radius:6px;overflow:hidden;">
    ${history.length > 0 ? `
    <thead style="background:#f8f9fa;">
      <tr>
        <th style="padding:8px 10px;text-align:center;font-size:11px;color:#374151;width:120px;">Bên</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#374151;width:130px;">Người đề xuất</th>
        <th style="padding:8px 10px;text-align:right;font-size:11px;color:#374151;width:130px;">Giá</th>
        <th style="padding:8px 10px;text-align:left;font-size:11px;color:#374151;">Lý do · Thời gian</th>
      </tr>
    </thead>` : ''}
    <tbody>${historyRows}</tbody>
  </table>

  ${booking?.price_per_kg && history.length > 0 ? `
  <div style="margin-top:8px;padding:8px 12px;background:#fffbeb;border-left:3px solid #fa8c16;border-radius:4px;font-size:12px;">
    <strong>Tóm tắt:</strong> Giá gốc <code>${booking.price_per_kg.toLocaleString('vi-VN')} đ/${unitLabel}</code> →
    Chốt cuối <code style="color:#1B4D3E;font-weight:700;">${deal.unit_price?.toLocaleString('vi-VN')} đ/${unitLabel}</code>
    (chênh <strong>${((deal.unit_price - booking.price_per_kg) / booking.price_per_kg * 100).toFixed(1)}%</strong>)
  </div>` : ''}

  <!-- NGƯỜI TẠO -->
  <h2 style="color:#1B4D3E;font-size:14px;margin:20px 0 8px 0;border-bottom:1px solid #e4e4e7;padding-bottom:4px;">
    👤 Người chốt Deal
  </h2>
  <table style="width:100%;border-collapse:collapse;">
    <tr><td style="padding:6px 10px;color:#666;font-size:12px;width:140px;">Tên nhân viên</td><td style="padding:6px 10px;font-size:12px;font-weight:600;">${creator?.full_name || '—'}</td></tr>
    <tr><td style="padding:6px 10px;color:#666;font-size:12px;">Email</td><td style="padding:6px 10px;font-size:12px;">${creator?.email || '—'}</td></tr>
    <tr><td style="padding:6px 10px;color:#666;font-size:12px;">Thời gian chốt</td><td style="padding:6px 10px;font-size:12px;">${fmtDate(deal.created_at)}</td></tr>
  </table>

  <!-- LINK -->
  <hr style="margin:24px 0 12px 0;border:0;border-top:1px solid #e4e4e7;"/>
  <p style="text-align:center;font-size:12px;color:#6b7280;margin:0;">
    <a href="${APP_URL}/b2b/deals/${deal.id}" style="color:#1B4D3E;font-weight:600;text-decoration:none;">📂 Mở chi tiết Deal trong ERP →</a>
  </p>
  <p style="text-align:center;font-size:10px;color:#9ca3af;margin:8px 0 0 0;">
    Email auto-generated · ${new Date().toLocaleString('vi-VN')}
  </p>
</div>
</body></html>
`.trim()
}

// ── Main ────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { deal_id } = await req.json()
    if (!deal_id) throw new Error('Missing deal_id')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1) Lấy deal (không JOIN — tránh lỗi FK name mismatch)
    const { data: deal, error: dealErr } = await supabase
      .from('b2b_deals')
      .select('*')
      .eq('id', deal_id)
      .single()
    if (dealErr || !deal) throw new Error(`Deal not found: ${dealErr?.message}`)

    // 2) Partner
    let partner: any = null
    if (deal.partner_id) {
      const { data: p } = await supabase
        .from('b2b_partners')
        .select('id, code, name, short_name, phone, email')
        .eq('id', deal.partner_id)
        .maybeSingle()
      partner = p
    }

    // 3) Target facility
    if (deal.target_facility_id) {
      const { data: f } = await supabase
        .from('facilities')
        .select('code, name')
        .eq('id', deal.target_facility_id)
        .maybeSingle()
      if (f) {
        deal.target_facility_name = f.name
        deal.target_facility_code = f.code
      }
    }

    // 4) Booking message + negotiation history
    let booking: any = null
    if (deal.booking_id) {
      const { data: msg } = await supabase
        .from('b2b_chat_messages')
        .select('metadata, sender_id')
        .eq('id', deal.booking_id)
        .maybeSingle()
      const meta = typeof msg?.metadata === 'string' ? JSON.parse(msg.metadata) : msg?.metadata
      booking = meta?.booking || null
    }

    // 5) Người tạo deal — query employees từ deal.created_by
    let creator: any = null
    if (deal.created_by) {
      const { data: emp } = await supabase
        .from('employees')
        .select('full_name, email')
        .eq('id', deal.created_by)
        .maybeSingle()
      creator = emp
    }
    // Fallback: deal cũ KHÔNG có created_by (trước bug fix 21/05/2026).
    // Lookup qua system message gần nhất trong room có sender_type='factory'
    // + content chứa 'Đồng ý' hoặc DealCard message.
    if (!creator && deal.booking_id) {
      const { data: bookingMsg } = await supabase
        .from('b2b_chat_messages')
        .select('room_id')
        .eq('id', deal.booking_id)
        .maybeSingle()
      if (bookingMsg?.room_id) {
        const { data: confirmMsg } = await supabase
          .from('b2b_chat_messages')
          .select('sender_id')
          .eq('room_id', bookingMsg.room_id)
          .eq('sender_type', 'factory')
          .not('sender_id', 'is', null)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (confirmMsg?.sender_id) {
          const { data: emp } = await supabase
            .from('employees')
            .select('full_name, email')
            .eq('id', confirmMsg.sender_id)
            .maybeSingle()
          if (emp) creator = emp
        }
      }
    }

    // 4) Build HTML + gửi
    const html = buildHtml(deal, booking, partner, creator)
    const subject = `🤝 Deal mới: ${deal.deal_number} — ${partner?.name || partner?.short_name || 'KH'} ${fmtVnd(deal.total_value_vnd)}`

    const token = await getAccessToken()
    await sendEmail(token, subject, html)

    return new Response(JSON.stringify({
      success: true,
      sent_to: RECIPIENTS.map(r => r.email),
      subject,
      deal_id,
      history_rounds: (booking?.negotiation_history || []).length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('❌ [b2b-deal-notify]', e)
    return new Response(JSON.stringify({
      success: false,
      error: e.message || String(e),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
