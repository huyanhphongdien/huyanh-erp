// =============================================================================
// EDGE FUNCTION: vessel-schedule-report
// Lịch tàu dự kiến rời Đà Nẵng & TP.HCM (Cát Lái) trong 7 ngày tới → mail Ban Giám đốc.
//
// Dữ liệu + HTML: ./report.ts (đọc ghi chú đầu file đó về nguồn và giới hạn).
//
// Deploy:  npx supabase functions deploy vessel-schedule-report
// Gọi:     POST /functions/v1/vessel-schedule-report   Authorization: Bearer <SERVICE_ROLE_KEY>
//   body {}                         → gửi cho Ban Giám đốc
//   body {"dry_run": true}          → KHÔNG gửi, trả HTML + trạng thái nguồn để xem trước
//   body {"test_to": "a@b.com"}     → gửi cho 1 địa chỉ thay vì BGĐ
//   body {"trial": true}            → gắn nhãn "bản thử" lên tiêu đề
//
// ⚠ Hàm tự kiểm bearer = service role. Các hàm báo cáo cũ deploy --no-verify-jwt và ai có URL
//   cũng bấm gửi được; hàm này gửi thẳng vào hộp thư BGĐ nên không để ngỏ như vậy.
// Chưa gắn pg_cron — lần đầu chạy tay để BGĐ xem mẫu.
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildReport } from './report.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const TENANT_ID = Deno.env.get('AZURE_TENANT_ID') || '029187c4-44dd-4da0-b3e1-9ebda8f90b1a'
const CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID') || 'ee1377e6-b52c-4326-88f2-c18c3b59fded'
const CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET') || Deno.env.get('MICROSOFT_CLIENT_SECRET') || ''
const SENDER_EMAIL = Deno.env.get('EMAIL_FROM') || 'huyanhphongdien@huyanhrubber.com'

// Cùng danh sách BGĐ mà daily-rubber-report đang gửi hằng ngày.
const BGD_RECIPIENTS = [
  { name: 'Lê Văn Huy', email: 'huylv@huyanhrubber.com' },
  { name: 'Lê Xuân Trung', email: 'trunglxh@huyanhrubber.com' },
  { name: 'Hồ Thị Thủy', email: 'thuyht@huyanhrubber.com' },
  { name: 'Lê Duy Minh', email: 'minhld@huyanhrubber.com' },
]

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

async function getAccessToken(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  })
  if (!res.ok) throw new Error(`Token error: ${await res.text()}`)
  return (await res.json()).access_token
}

async function sendEmail(
  token: string,
  recipients: Array<{ name: string; email: string }>,
  subject: string,
  html: string,
): Promise<void> {
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!bearer || bearer !== SUPABASE_SERVICE_ROLE_KEY) return json({ success: false, error: 'Unauthorized' }, 401)

  try {
    const body = await req.json().catch(() => ({}))
    const report = await buildReport({ trial: !!body.trial })
    const summary = {
      subject: report.subject,
      sources: report.sources,
      ports: report.ports.map((p) => ({ port: p.port, sailings: p.sailings.length })),
      html_bytes: new TextEncoder().encode(report.html).length,
    }

    if (body.dry_run) return json({ success: true, dry_run: true, ...summary, html: report.html })

    // Cả hai cảng đều không đọc được → không gửi mail rỗng cho BGĐ.
    if (report.ports.every((p) => p.sailings.length === 0)) {
      return json({ success: false, error: 'Không đọc được nguồn nào — không gửi mail', ...summary }, 502)
    }

    const recipients = typeof body.test_to === 'string' && body.test_to.includes('@')
      ? [{ name: body.test_to, email: body.test_to }]
      : BGD_RECIPIENTS

    const token = await getAccessToken()
    await sendEmail(token, recipients, report.subject, report.html)

    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      await supabase.from('email_notifications').insert({
        recipient_email: recipients.map((r) => r.email).join(', '),
        notification_type: 'vessel_schedule_report',
        subject: report.subject,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
    } catch (logErr) {
      console.warn('[vessel-schedule-report] Không ghi được email_notifications:', logErr)
    }

    return json({ success: true, recipients: recipients.map((r) => r.email), ...summary })
  } catch (error) {
    console.error('[vessel-schedule-report] Error:', error)
    return json({ success: false, error: (error as Error).message }, 500)
  }
})
