// =============================================================================
// EDGE FUNCTION: create-partner-auth
// Tạo auth.users + partner_users khi admin ERP duyệt đại lý đăng ký.
// =============================================================================
//
// Flow:
//   1. ERP admin click "Duyệt" trên /b2b/partners/requests
//   2. Frontend gọi: supabase.functions.invoke('create-partner-auth', { partner_id })
//   3. Function:
//      a. Verify partner.status='pending'
//      b. Generate password tạm (8 chữ số)
//      c. Tạo auth.users với email (real hoặc pseudo {phone}@partner.huyanhrubber.vn)
//         + user_metadata.must_change_password = true
//         + user_metadata.partner_id, partner_code
//      d. Insert b2b_partner_users (auth_user_id, partner_id, is_active=true)
//      e. Update b2b_partners: status='active', is_active=true, verified_at, verified_by
//      f. Return { ok, email, temp_password } — admin gửi Zalo tay
//   4. Đại lý login → middleware check user_metadata.must_change_password → force redirect /partner/change-password
//
// Input: { partner_id: string, verified_by_employee_id?: string }
// Output: { ok: true, auth_user_id, email, temp_password } | { ok: false, error }
//
// Deploy: npx supabase functions deploy create-partner-auth
// =============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PSEUDO_EMAIL_DOMAIN = '@partner.huyanhrubber.vn'

function generateTempPassword(): string {
  // 8 chữ số dễ đọc qua điện thoại (không có 0,1 để tránh nhầm O, l)
  const digits = '23456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += digits[Math.floor(Math.random() * digits.length)]
  }
  return result
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, '')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 200 })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405,
    })
  }

  try {
    const body = await req.json()
    const { partner_id, verified_by_employee_id } = body
    if (!partner_id) {
      return new Response(JSON.stringify({ ok: false, error: 'partner_id required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      })
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1. Fetch partner
    const { data: partner, error: pErr } = await sb
      .schema('b2b')
      .from('partners')
      .select('id, code, name, phone, email, status')
      .eq('id', partner_id)
      .maybeSingle()

    if (pErr || !partner) {
      return new Response(JSON.stringify({ ok: false, error: `Partner không tồn tại: ${pErr?.message || partner_id}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404,
      })
    }

    // KHÔNG chặn theo status='pending' nữa — cấp được cho cả đại lý đã 'verified'
    // (tạo bằng SQL/admin) chưa có login. Chỉ chặn nếu ĐÃ có tài khoản (partner_users link).
    const { data: existingPu } = await sb
      .schema('b2b')
      .from('partner_users')
      .select('id')
      .eq('partner_id', partner.id)
      .eq('is_active', true)
      .maybeSingle()
    if (existingPu) {
      return new Response(JSON.stringify({ ok: false, error: 'Đại lý này đã có tài khoản đăng nhập.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409,
      })
    }

    if (!partner.phone) {
      return new Response(JSON.stringify({ ok: false, error: 'Partner thiếu SĐT, không thể tạo tài khoản' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      })
    }

    // 2. Determine auth email
    const cleanPhone = normalizePhone(partner.phone)
    const authEmail = partner.email?.trim() || `${cleanPhone}${PSEUDO_EMAIL_DOMAIN}`
    const tempPassword = generateTempPassword()

    // 3. Create auth.users
    const { data: createData, error: createErr } = await sb.auth.admin.createUser({
      email: authEmail,
      password: tempPassword,
      email_confirm: true,
      // KHÔNG set phone trên auth user: đăng nhập bằng email ẩn, không cần phone-provider.
      // (Set phone khi provider chưa bật → createUser lỗi.) SĐT đã lưu ở b2b.partners + metadata.
      user_metadata: {
        must_change_password: true,
        partner_id: partner.id,
        partner_code: partner.code,
        partner_name: partner.name,
        created_via: 'admin-provision',
      },
    })

    if (createErr || !createData.user) {
      // Maybe user đã tồn tại (admin duyệt lần trước fail giữa chừng)
      if (createErr?.message?.toLowerCase().includes('already')) {
        return new Response(JSON.stringify({
          ok: false,
          error: `Auth user với email ${authEmail} đã tồn tại. Xoá thủ công trên Supabase Auth dashboard rồi duyệt lại.`,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409,
        })
      }
      return new Response(JSON.stringify({ ok: false, error: `Tạo auth.users thất bại: ${createErr?.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
      })
    }

    const authUserId = createData.user.id

    // 4. Insert b2b.partner_users
    // (Bảng b2b.partner_users — fields: id, partner_id, auth_user_id, role, is_active)
    const { error: puErr } = await sb
      .schema('b2b')
      .from('partner_users')
      .insert({
        partner_id: partner.id,
        auth_user_id: authUserId,
        full_name: partner.name,   // NOT NULL
        phone: cleanPhone,         // NOT NULL
        email: authEmail,          // set luôn (email ẩn) phòng cột NOT NULL
        role: 'owner',
        is_active: true,
      })

    if (puErr) {
      // Rollback: xoá auth.users vừa tạo
      await sb.auth.admin.deleteUser(authUserId).catch(() => {})
      return new Response(JSON.stringify({ ok: false, error: `Tạo partner_users thất bại: ${puErr.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
      })
    }

    // 5. Update b2b.partners status = 'active'
    const { error: uErr } = await sb
      .schema('b2b')
      .from('partners')
      .update({
        status: 'active',
        is_active: true,
        verified_at: new Date().toISOString(),
        verified_by: verified_by_employee_id || null,
      })
      .eq('id', partner.id)

    if (uErr) {
      console.warn('Update partner status fail (auth user đã tạo):', uErr.message)
      // Không rollback — admin có thể manual fix status
    }

    return new Response(JSON.stringify({
      ok: true,
      auth_user_id: authUserId,
      email: authEmail,
      temp_password: tempPassword,
      partner_code: partner.code,
      partner_name: partner.name,
      phone: cleanPhone,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })

  } catch (err) {
    console.error('Edge function error:', err)
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    })
  }
})
