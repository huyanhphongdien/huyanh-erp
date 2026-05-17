-- ============================================================================
-- SALES DAY-END BRIEF CRON — Báo cáo BGĐ 17:30 chiều hằng ngày
-- Date: 2026-05-17
--
-- (Function name vẫn là `sales-morning-brief` lịch sử — không rename để tránh
--  churn deploy; user-facing labels đã đổi sang "Day-End 17:30")
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
-- CONSOLIDATION: Mail này thay cho 3 mail cũ — sau khi go-live cần pause:
--   - daily-task-report-1730 (đã pause 2026-05-17)
--   - sales-digest-daily (xem ROLLBACK ở cuối)
--   - task-daily-reminders (chỉ pause phần BGĐ — pause hoàn toàn nếu NV không cần)
--
-- ============================================================================

-- Step 1: Unschedule nếu đã có (idempotent)
SELECT cron.unschedule('sales-day-end-brief-1730')
  FROM cron.job WHERE jobname = 'sales-day-end-brief-1730';

-- Cleanup tên cũ nếu vô tình tạo
SELECT cron.unschedule('sales-morning-brief-0700')
  FROM cron.job WHERE jobname = 'sales-morning-brief-0700';

-- Step 2: Schedule 10:30 UTC = 17:30 VN, hằng ngày T2-CN
SELECT cron.schedule(
  'sales-day-end-brief-1730',
  '30 10 * * *',  -- minute 30 of hour 10 UTC, every day = 17:30 VN
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
WHERE jobname = 'sales-day-end-brief-1730';
-- Expected: 1 row, schedule '30 10 * * *', active = true

-- ════════════════════════════════════════════════════════════════════════════
-- ALTERNATIVE — Hardcode URL + service_role nếu app.settings không có
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT cron.schedule(
--   'sales-day-end-brief-1730',
--   '30 10 * * *',
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
-- AFTER GO-LIVE — Pause 2 mail cũ còn active (daily-task-report-1730 đã pause)
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT cron.alter_job(
--   job_id := (SELECT jobid FROM cron.job WHERE jobname = 'sales-digest-daily'),
--   active := false
-- );
-- -- task-daily-reminders nếu cũng pause (NV cá nhân không nhận nhắc task):
-- SELECT cron.alter_job(
--   job_id := (SELECT jobid FROM cron.job WHERE jobname = 'task-daily-reminders'),
--   active := false
-- );

-- ════════════════════════════════════════════════════════════════════════════
-- PAUSE BÁO CÁO NÀY (không xoá)
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT cron.alter_job(
--   job_id := (SELECT jobid FROM cron.job WHERE jobname = 'sales-day-end-brief-1730'),
--   active := false
-- );

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (xoá hẳn)
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT cron.unschedule('sales-day-end-brief-1730');
