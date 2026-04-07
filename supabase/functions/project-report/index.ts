// =============================================================================
// EDGE FUNCTION: project-report
// Gửi email báo cáo tiến độ dự án cho BGĐ
// Deploy: npx supabase functions deploy project-report --no-verify-jwt
// Trigger: POST /functions/v1/project-report
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TENANT_ID = Deno.env.get('AZURE_TENANT_ID') || '029187c4-44dd-4da0-b3e1-9ebda8f90b1a'
const CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID') || 'ee1377e6-b52c-4326-88f2-c18c3b59fded'
const CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET') || Deno.env.get('MICROSOFT_CLIENT_SECRET') || ''
const SENDER_EMAIL = Deno.env.get('EMAIL_FROM') || 'huyanhphongdien@huyanhrubber.com'

const RECIPIENTS = [
  { name: 'Lê Văn Huy', email: 'huylv@huyanhrubber.com' },
  { name: 'Hồ Thị Thủy', email: 'thuyht@huyanhrubber.com' },
  { name: 'Lê Xuân Trung', email: 'trunglxh@huyanhrubber.com' },
  { name: 'Lê Duy Minh', email: 'minhld@huyanhrubber.com' },
]

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getAccessToken(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  })
  if (!res.ok) throw new Error(`Token error: ${await res.text()}`)
  return (await res.json()).access_token
}

async function sendEmail(token: string, subject: string, html: string): Promise<void> {
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: RECIPIENTS.map(r => ({ emailAddress: { address: r.email, name: r.name } })),
      },
    }),
  })
  if (!res.ok) throw new Error(`Email error: ${await res.text()}`)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const today = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

    // ── Fetch projects ──
    const { data: projects } = await supabase
      .from('projects')
      .select('id, code, name, status, progress_pct, planned_start, planned_end, priority, owner_id')
      .in('status', ['in_progress', 'planning', 'on_hold', 'completed'])
      .order('priority', { ascending: false })

    // ── Fetch owners ──
    const ownerIds = [...new Set((projects || []).map(p => p.owner_id).filter(Boolean))]
    const { data: owners } = await supabase.from('employees').select('id, full_name').in('id', ownerIds)
    const ownerMap = new Map((owners || []).map(o => [o.id, o.full_name]))

    // ── Fetch phases ──
    const projectIds = (projects || []).map(p => p.id)
    const { data: phases } = await supabase
      .from('project_phases')
      .select('project_id, name, status, progress_pct')
      .in('project_id', projectIds)
      .order('order_index')

    // ── Fetch task counts ──
    const { data: taskCounts } = await supabase.rpc('get_project_task_counts', {}) || { data: null }

    // Group phases by project
    const phaseMap = new Map<string, any[]>()
    ;(phases || []).forEach(ph => {
      if (!phaseMap.has(ph.project_id)) phaseMap.set(ph.project_id, [])
      phaseMap.get(ph.project_id)!.push(ph)
    })

    // ── Categorize ──
    const active = (projects || []).filter(p => p.status === 'in_progress' || p.status === 'planning' || p.status === 'on_hold')
    const completed = (projects || []).filter(p => p.status === 'completed').slice(0, 3)
    const highPriority = active.filter(p => p.priority === 'high' || p.priority === 'urgent')
    const overdue = active.filter(p => p.planned_end && new Date(p.planned_end) < new Date() && Number(p.progress_pct) < 100)
    const noProgress = active.filter(p => Number(p.progress_pct) === 0)

    // ── Build HTML ──
    function progressBar(pct: number, color: string) {
      return `<div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;"></div>
        </div>
        <span style="font-size:14px;font-weight:700;color:${color};min-width:40px;text-align:right;">${pct}%</span>
      </div>`
    }

    function progressColor(pct: number, isOverdue: boolean) {
      if (isOverdue) return '#ef4444'
      if (pct >= 75) return '#10b981'
      if (pct >= 30) return '#f59e0b'
      return '#ef4444'
    }

    function phaseIcon(status: string) {
      if (status === 'completed') return '✅'
      if (status === 'in_progress') return '🔄'
      return '⏳'
    }

    function projectCard(p: any) {
      const pct = Math.round(Number(p.progress_pct))
      const owner = ownerMap.get(p.owner_id) || '—'
      const phs = phaseMap.get(p.id) || []
      const isOverdue = p.planned_end && new Date(p.planned_end) < new Date() && pct < 100
      const daysLate = isOverdue ? Math.ceil((Date.now() - new Date(p.planned_end).getTime()) / 86400000) : 0
      const color = progressColor(pct, isOverdue)
      const border = isOverdue ? '#fecaca' : '#e5e7eb'
      const bg = isOverdue ? '#fff5f5' : '#fff'

      let badges = `<span style="background:#dbeafe;color:#1d4ed8;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;">${p.code}</span>`
      if (isOverdue) badges += `<span style="background:#ef4444;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:4px;">TRỄ ${daysLate} NGÀY</span>`
      if (pct === 0) badges += `<span style="background:#dc2626;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-left:4px;">CHƯA BẮT ĐẦU</span>`

      const plannedEnd = p.planned_end ? new Date(p.planned_end).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '—'

      let phaseHtml = ''
      if (phs.length > 0) {
        phaseHtml = `<table width="100%" style="margin-top:8px;font-size:11px;color:#374151;">`
        phs.forEach(ph => {
          const phPct = Math.round(Number(ph.progress_pct))
          const phColor = ph.status === 'completed' ? '#10b981' : phPct > 0 ? '#f59e0b' : '#9ca3af'
          phaseHtml += `<tr><td style="padding:2px 0;">${phaseIcon(ph.status)} ${ph.name}</td><td style="text-align:right;color:${phColor};font-weight:600;">${phPct}%</td></tr>`
        })
        phaseHtml += `</table>`
      }

      return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:12px;overflow:hidden;background:${bg};margin-bottom:12px;">
        <tr><td style="padding:14px 16px;border-bottom:1px solid #f3f4f6;">
          ${badges}
          <div style="font-size:15px;font-weight:700;color:#111;margin-top:4px;">${p.name}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px;">Phụ trách: ${owner} | Hạn: ${plannedEnd}</div>
        </td></tr>
        <tr><td style="padding:12px 16px;">
          ${progressBar(pct, color)}
          ${phaseHtml}
        </td></tr>
      </table>`
    }

    // ── Assemble email ──
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;background:#ffffff;">

    <!-- Header -->
    <tr><td style="background:linear-gradient(135deg,#1B4D3E 0%,#2E7D5B 100%);padding:24px 20px;text-align:center;">
      <div style="color:#fff;font-size:22px;font-weight:700;">HUY ANH RUBBER</div>
      <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:4px;">Báo cáo Tiến độ Dự án</div>
      <div style="color:#FFD700;font-size:12px;margin-top:8px;font-weight:600;">${today} | ${active.length} dự án đang triển khai</div>
    </td></tr>

    <!-- Stats -->
    <tr><td style="padding:20px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="25%" style="text-align:center;padding:12px 4px;">
          <div style="font-size:28px;font-weight:700;color:#1B4D3E;">${active.length}</div>
          <div style="font-size:11px;color:#6b7280;">Đang triển khai</div>
        </td>
        <td width="25%" style="text-align:center;padding:12px 4px;">
          <div style="font-size:28px;font-weight:700;color:#f59e0b;">${highPriority.length}</div>
          <div style="font-size:11px;color:#6b7280;">Ưu tiên cao</div>
        </td>
        <td width="25%" style="text-align:center;padding:12px 4px;">
          <div style="font-size:28px;font-weight:700;color:#ef4444;">${overdue.length}</div>
          <div style="font-size:11px;color:#6b7280;">Trễ hạn</div>
        </td>
        <td width="25%" style="text-align:center;padding:12px 4px;">
          <div style="font-size:28px;font-weight:700;color:#9ca3af;">${noProgress.length}</div>
          <div style="font-size:11px;color:#6b7280;">Chưa bắt đầu</div>
        </td>
      </tr></table>
    </td></tr>

    <tr><td style="padding:0 20px;"><div style="border-top:2px solid #e5e7eb;"></div></td></tr>

    ${highPriority.length > 0 ? `
    <tr><td style="padding:20px 20px 8px;">
      <div style="font-size:14px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:1px;">Ưu tiên cao</div>
    </td></tr>
    <tr><td style="padding:4px 20px;">${highPriority.map(p => projectCard(p)).join('')}</td></tr>
    ` : ''}

    ${active.filter(p => p.priority !== 'high' && p.priority !== 'urgent' && Number(p.progress_pct) > 0).length > 0 ? `
    <tr><td style="padding:20px 20px 8px;">
      <div style="font-size:14px;font-weight:700;color:#1B4D3E;text-transform:uppercase;letter-spacing:1px;">Đang triển khai</div>
    </td></tr>
    <tr><td style="padding:4px 20px;">${active.filter(p => p.priority !== 'high' && p.priority !== 'urgent' && Number(p.progress_pct) > 0).map(p => projectCard(p)).join('')}</td></tr>
    ` : ''}

    ${noProgress.filter(p => p.priority !== 'high' && p.priority !== 'urgent').length > 0 ? `
    <tr><td style="padding:20px 20px 8px;">
      <div style="font-size:14px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;">Cảnh báo — Chưa có tiến độ</div>
    </td></tr>
    <tr><td style="padding:4px 20px;">${noProgress.filter(p => p.priority !== 'high' && p.priority !== 'urgent').map(p => projectCard(p)).join('')}</td></tr>
    ` : ''}

    ${completed.length > 0 ? `
    <tr><td style="padding:20px 20px 8px;">
      <div style="font-size:14px;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:1px;">Hoàn thành gần đây</div>
    </td></tr>
    <tr><td style="padding:4px 20px;">${completed.map(p => projectCard(p)).join('')}</td></tr>
    ` : ''}

    <!-- Footer -->
    <tr><td style="padding:20px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
      <a href="https://huyanhrubber.vn/projects/list" style="display:inline-block;padding:10px 24px;background:#1B4D3E;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Xem chi tiết trên ERP →</a>
      <div style="margin-top:12px;font-size:10px;color:#9ca3af;">Huy Anh Rubber ERP — Báo cáo dự án tự động<br>${RECIPIENTS.map(r => r.name).join(', ')}</div>
    </td></tr>

    </table></body></html>`

    // ── Send ──
    const token = await getAccessToken()
    await sendEmail(token, `Báo cáo Tiến độ Dự án — ${today}`, html)

    return new Response(JSON.stringify({ success: true, projects: active.length, sent_to: RECIPIENTS.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Project report error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
