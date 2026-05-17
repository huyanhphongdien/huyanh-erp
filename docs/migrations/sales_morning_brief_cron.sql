-- ============================================================================
-- SALES MORNING BRIEF CRON — Báo cáo BGĐ 07:00 sáng hằng ngày
-- Date: 2026-05-17
-- ============================================================================
--
-- YÊU CẦU TRƯỚC:
--   1. Edge function sales-morning-brief đã deploy:
--      npx supabase functions deploy sales-morning-brief --no-verify-jwt
--   2. ENV vars set: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET
--      (đã có cho daily-task-report — dùng chung)
--   3. pg_cron + pg_net extension đã enabled
--
-- TEST MODE: Edge function hardcode REPORT_RECIPIENTS = [minhld@huyanhrubber.com]
--   Sau khi confirm OK, sửa REPORT_RECIPIENTS trong index.ts → BGD_FULL (4 người)
--
-- ============================================================================

-- Step 1: Unschedule nếu đã có (idempotent)
SELECT cron.unschedule('sales-morning-brief-0700')
  FROM cron.job WHERE jobname = 'sales-morning-brief-0700';

-- Step 2: Schedule 00:00 UTC = 07:00 VN, hằng ngày T2-CN
SELECT cron.schedule(
  'sales-morning-brief-0700',
  '0 0 * * *',  -- minute 0 of hour 0 UTC, every day = 07:00 VN
  $$
  SELECT net.http_post(
    url := (SELECT current_setting('app.settings.supabase_url', true)) || '/functions/v1/sales-morning-brief',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.supabase_service_role_key', true))
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Step 3: Verify
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'sales-morning-brief-0700';
-- Expected: 1 row, schedule '0 0 * * *', active = true

-- ════════════════════════════════════════════════════════════════════════════
-- ALTERNATIVE — Hardcode URL + service_role nếu app.settings không có
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT cron.schedule(
--   'sales-morning-brief-0700',
--   '0 0 * * *',
--   $$
--   SELECT net.http_post(
--     url := 'https://dygveetaatqllhjusyzz.supabase.co/functions/v1/sales-morning-brief',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY_HERE>'
--     ),
--     body := '{}'::jsonb
--   ) AS request_id;
--   $$
-- );

-- ════════════════════════════════════════════════════════════════════════════
-- TEST MANUAL TRIGGER (không đợi cron — gửi mail ngay)
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT net.http_post(
--   url := 'https://dygveetaatqllhjusyzz.supabase.co/functions/v1/sales-morning-brief',
--   headers := jsonb_build_object(
--     'Content-Type', 'application/json',
--     'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--   ),
--   body := '{}'::jsonb
-- );

-- ════════════════════════════════════════════════════════════════════════════
-- PAUSE (không xoá, set active=false bằng helper)
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT cron.alter_job(
--   job_id := (SELECT jobid FROM cron.job WHERE jobname = 'sales-morning-brief-0700'),
--   active := false
-- );

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (xoá hẳn)
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT cron.unschedule('sales-morning-brief-0700');
