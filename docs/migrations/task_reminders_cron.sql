-- ============================================================================
-- TASK REMINDERS CRON — Chạy Edge Function mỗi ngày 8:00 AM Vietnam
-- Chạy trên Supabase SQL Editor
-- ============================================================================

-- 1. Bật pg_cron extension (nếu chưa bật)
-- Vào Supabase Dashboard → Database → Extensions → Tìm "pg_cron" → Enable

-- 2. Đặt lịch chạy
-- Vietnam time UTC+7 → 8:00 AM = 1:00 UTC
-- Cron: phút 0, giờ 1, mỗi ngày
SELECT cron.schedule(
  'task-daily-reminders',           -- tên job
  '0 1 * * *',                      -- 01:00 UTC = 08:00 Vietnam
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/task-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 3. Verify job đã tạo
SELECT jobid, schedule, command FROM cron.job WHERE jobname = 'task-daily-reminders';

-- 4. Nếu muốn xóa job
-- SELECT cron.unschedule('task-daily-reminders');

-- 5. Nếu muốn chạy thủ công (test)
-- SELECT net.http_post(
--   url := 'https://dygveetaatqllhjusyzz.supabase.co/functions/v1/task-reminders',
--   headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
--   body := '{}'::jsonb
-- );

-- ============================================================================
-- RECURRING TASK GENERATOR CRON — Chạy trước task-reminders (7:30 AM Vietnam)
-- ============================================================================

-- Recurring task generator — chạy lúc 7:30 AM Vietnam (0:30 UTC)
SELECT cron.schedule(
  'task-recurring-generator',
  '30 0 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/task-recurring-generator',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Verify recurring generator job
SELECT jobid, schedule, command FROM cron.job WHERE jobname = 'task-recurring-generator';

-- Nếu muốn xóa job
-- SELECT cron.unschedule('task-recurring-generator');
