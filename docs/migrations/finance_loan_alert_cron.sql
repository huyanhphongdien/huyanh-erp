-- ============================================================================
-- LỊCH CẢNH BÁO VỐN VAY ĐẦU NGÀY — 07:00 giờ VN (00:00 UTC) hằng ngày
-- ============================================================================
-- Yêu cầu: đã deploy edge function `finance-loan-alert`
--   npx supabase functions deploy finance-loan-alert --no-verify-jwt
-- Cần extension pg_cron + pg_net (đã bật sẵn cho daily-rubber-report).
-- ⚠ Thay <SERVICE_ROLE_KEY> bằng service_role key thật
--   (Supabase Dashboard → Project Settings → API → service_role secret).
-- Mặc định body '{}' = CHỈ gửi khi có cảnh báo (ngày sạch không gửi, đỡ nhiễu).
--   Muốn nhận digest mỗi sáng kể cả khi sạch → đổi body thành '{"always":true}'.
-- ============================================================================

-- Gỡ job cũ nếu có (no-op nếu chưa tồn tại — KHÔNG abort transaction)
select cron.unschedule(jobid) from cron.job where jobname = 'finance-loan-alert-daily';

select cron.schedule(
  'finance-loan-alert-daily',
  '0 0 * * *',   -- 00:00 UTC = 07:00 sáng giờ VN
  $$
  select net.http_post(
    url     := 'https://dygveetaatqllhjusyzz.supabase.co/functions/v1/finance-loan-alert',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
               ),
    body    := '{}'::jsonb
  );
  $$
);

-- Kiểm tra job đã tạo:
-- select jobid, jobname, schedule, active from cron.job where jobname = 'finance-loan-alert-daily';
