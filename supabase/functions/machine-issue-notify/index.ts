// ============================================================================
// machine-issue-notify — bắn FCM khi có phiếu báo hỏng máy (GĐ 2)
// Chép helper FCM V1 từ b2b/send-push-notification. Dùng LẠI khoá FCM đã có
// trong env của project (FCM_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY_B64).
//
// Gọi: POST { issue_id } (từ trigger DB pg_net, hoặc gọi tay để test).
// Giai đoạn test: bắn cho MỌI device_token (mọi thợ đã cài app). Lọc theo ca sau.
// ============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID') || 'huyanh-b2b'
const FCM_CLIENT_EMAIL = Deno.env.get('FCM_CLIENT_EMAIL') || ''
const FCM_PRIVATE_KEY_B64 = Deno.env.get('FCM_PRIVATE_KEY_B64') || ''
const FCM_PRIVATE_KEY = FCM_PRIVATE_KEY_B64 ? atob(FCM_PRIVATE_KEY_B64) : (Deno.env.get('FCM_PRIVATE_KEY') || '').replace(/\\n/g, '\n')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' }

// ── JWT + OAuth2 (chép nguyên từ b2b) ──
async function createJWT(email: string, pem: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const head = enc({ alg: 'RS256', typ: 'JWT' })
  const pay = enc({ iss: email, sub: email, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600, scope: 'https://www.googleapis.com/auth/firebase.messaging' })
  const input = `${head}.${pay}`
  const body = pem.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '')
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(body), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${input}.${sigB64}`
}
async function getAccessToken(): Promise<string> {
  const jwt = await createJWT(FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const d = await res.json()
  if (!d.access_token) throw new Error(`OAuth2 failed: ${JSON.stringify(d)}`)
  return d.access_token
}
async function sendFCM(accessToken: string, token: string, title: string, body: string, data: Record<string, string>) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      message: {
        token, notification: { title, body }, data,
        android: { priority: 'high', notification: { sound: 'default', click_action: 'FCM_PLUGIN_ACTIVITY' } },
      },
    }),
  })
  return { ok: res.ok, result: await res.json() }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  try {
    const payload = await req.json().catch(() => ({}))
    const issueId = payload.issue_id || payload.record?.id
    if (!issueId) return new Response(JSON.stringify({ error: 'thiếu issue_id' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })

    // lấy phiếu + tên máy
    const { data: iss } = await supabase.from('machine_issues')
      .select('equipment_code, severity, symptom, note, equipment:equipment_id(name, khu_vuc)')
      .eq('id', issueId).maybeSingle()
    if (!iss) return new Response(JSON.stringify({ skipped: 'không tìm thấy phiếu' }), { headers: { ...cors, 'Content-Type': 'application/json' } })

    const dung = (iss as any).severity === 'do'
    const title = dung ? '🔴 Máy đang DỪNG' : '🟡 Máy báo bất thường'
    const body = `${(iss as any).equipment_code} · ${(iss as any).equipment?.name || ''} — ${(iss as any).symptom || 'có sự cố'}`

    // giai đoạn test: bắn cho MỌI device_token
    const { data: toks } = await supabase.from('device_tokens').select('token, employee_id')
    const tokens = (toks || []) as { token: string; employee_id: string }[]
    if (tokens.length === 0) return new Response(JSON.stringify({ sent: 0, note: 'chưa có thiết bị nào đăng ký (chưa cài app)' }), { headers: { ...cors, 'Content-Type': 'application/json' } })

    const at = await getAccessToken()
    let ok = 0, fail = 0
    for (const t of tokens) {
      try {
        const r = await sendFCM(at, t.token, title, body, { issue_id: String(issueId), severity: (iss as any).severity, url: `/m/yeu-cau` })
        if (r.ok) ok++; else { fail++
          // token chết → xoá
          if (JSON.stringify(r.result).includes('UNREGISTERED')) await supabase.from('device_tokens').delete().eq('token', t.token)
        }
      } catch { fail++ }
    }
    return new Response(JSON.stringify({ sent: ok, failed: fail, total: tokens.length }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
