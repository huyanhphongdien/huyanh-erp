// ============================================================================
// SUPABASE EDGE FUNCTION: Auto-checkout V6
// File: supabase/functions/auto-checkout/index.ts
// ============================================================================
//
// Gọi DB function auto_checkout_v6() — buffer 1h sau ca kết thúc
//
// CÁCH DEPLOY:
//   1. Tạo folder: supabase/functions/auto-checkout/
//   2. Copy file này vào đó
//   3. Deploy: supabase functions deploy auto-checkout
//   4. Set up external cron (cron-job.org hoặc GitHub Actions) gọi mỗi 30 phút:
//      curl -X POST https://<project>.supabase.co/functions/v1/auto-checkout \
//        -H "Authorization: Bearer <ANON_KEY>" \
//        -H "x-cron-secret: <YOUR_SECRET>"
//
// SECURITY: Kiểm tra x-cron-secret header để chỉ cho phép cron gọi
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-cron-secret, content-type',
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Security check
  const cronSecret = req.headers.get('x-cron-secret')
  const expectedSecret = Deno.env.get('CRON_SECRET')

  if (expectedSecret && cronSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Dùng service_role key để bypass RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ★ V6: Gọi function mới — auto_checkout_v6
    const { data, error } = await supabase.rpc('auto_checkout_v6')

    if (error) {
      console.error('Auto-checkout V6 error:', error)
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const closed = data?.length || 0
    console.log(`Auto-checkout V6: closed ${closed} records`)

    return new Response(
      JSON.stringify({
        success: true,
        closed,
        records: data || [],
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Auto-checkout V6 exception:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})