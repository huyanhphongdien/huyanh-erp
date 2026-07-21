-- =====================================================================
-- Trigger: phiếu báo hỏng máy mới → gọi edge function machine-issue-notify (bắn FCM)
-- ÁP SAU KHI đã deploy function machine-issue-notify (kẻo gọi hụt 404).
--   npx supabase functions deploy machine-issue-notify
-- Dùng pg_net (net.http_post) — async, KHÔNG chặn việc báo hỏng.
-- Key trong header là PUBLISHABLE (anon) — công khai được, KHÔNG phải service_role.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.trg_notify_machine_issue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  -- Chỉ bắn cho phiếu MỚI (status='moi')
  IF NEW.status = 'moi' THEN
    PERFORM net.http_post(
      url     := 'https://dygveetaatqllhjusyzz.supabase.co/functions/v1/machine-issue-notify',
      body    := jsonb_build_object('issue_id', NEW.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer sb_publishable_TmhOgRteyuVScb3v114oNw_UrZ_OKKQ',
        'apikey', 'sb_publishable_TmhOgRteyuVScb3v114oNw_UrZ_OKKQ'
      ),
      timeout_milliseconds := 5000
    );
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_notify_machine_issue ON public.machine_issues;
CREATE TRIGGER trg_notify_machine_issue
  AFTER INSERT ON public.machine_issues
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_machine_issue();

-- Gỡ (nếu cần): DROP TRIGGER IF EXISTS trg_notify_machine_issue ON public.machine_issues;
