-- ============================================================================
-- Sales Digest Cron — daily 08:00 VN (= 01:00 UTC)
-- Date: 2026-05-04
-- Status: TO APPLY (sau khi deploy edge function sales-digest)
-- ============================================================================
--
-- YÊU CẦU TRƯỚC:
--   1. Edge function sales-digest đã deploy: supabase functions deploy sales-digest
--   2. ENV vars set trong Supabase Dashboard: AZURE_TENANT_ID, AZURE_CLIENT_ID,
--      AZURE_CLIENT_SECRET (đã có cho daily-task-report)
--   3. pg_cron extension enabled
--   4. pg_net (http) extension enabled cho net.http_post
--
-- TEST MODE: Edge function hiện chỉ gửi tới minhld@huyanhrubber.com
--   Sau khi confirm OK, sửa REPORT_RECIPIENTS trong index.ts → query
--   sales_digest_subscribers để gửi cho list dynamic.
-- ============================================================================

-- Step 1: Unschedule cũ nếu có
SELECT cron.unschedule('sales-digest-daily')
  FROM cron.job WHERE jobname = 'sales-digest-daily';

-- Step 2: Schedule daily 01:00 UTC = 08:00 VN
SELECT cron.schedule(
  'sales-digest-daily',
  '0 1 * * *',  -- minute 0 of hour 1 UTC, every day = 08:00 VN
  $$
  SELECT net.http_post(
    url := (SELECT current_setting('app.settings.supabase_url', true)) || '/functions/v1/sales-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key', true))
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ════════════════════════════════════════════════════════════════════════════
-- ALTERNATIVE — nếu app.settings không set, hardcode URL (dùng tạm)
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT cron.schedule(
--   'sales-digest-daily',
--   '0 1 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://dygveetaatqllhjusyzz.supabase.co/functions/v1/sales-digest',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || '<SERVICE_ROLE_KEY_HERE>'
--     ),
--     body := '{}'::jsonb
--   ) AS request_id;
--   $$
-- );

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'sales-digest-daily';

-- Expected: 1 row, schedule '0 1 * * *', active = true

-- ════════════════════════════════════════════════════════════════════════════
-- TEST MANUAL TRIGGER (không đợi cron)
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT net.http_post(
--   url := 'https://dygveetaatqllhjusyzz.supabase.co/functions/v1/sales-digest',
--   headers := jsonb_build_object(
--     'Content-Type', 'application/json',
--     'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--   ),
--   body := '{}'::jsonb
-- );

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT cron.unschedule('sales-digest-daily');
