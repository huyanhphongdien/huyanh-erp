-- ============================================================
-- SPRINT 2.5 — Cron jobs (refresh + lock)
-- Ngày: 2026-04-28
-- Mục đích: Tự động refresh snapshot tháng hiện tại + lock tháng
--   trước khi sang tháng mới.
-- Yêu cầu: pg_cron extension đã enabled (đã có cho project này).
-- ============================================================

-- ============================================================
-- 1. Function refresh tháng hiện tại
-- ============================================================
CREATE OR REPLACE FUNCTION fn_refresh_current_month_snapshots()
RETURNS jsonb AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  v_month INTEGER := EXTRACT(MONTH FROM NOW())::INTEGER;
  v_count INTEGER := 0;
  emp RECORD;
BEGIN
  FOR emp IN SELECT id FROM employees WHERE status = 'active' LOOP
    IF compute_employee_monthly_score(emp.id, v_year, v_month) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'executed_at', NOW(),
    'year', v_year,
    'month', v_month,
    'snapshots_refreshed', v_count
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Function lock tháng trước
-- ============================================================
CREATE OR REPLACE FUNCTION fn_lock_previous_month_snapshots()
RETURNS jsonb AS $$
DECLARE
  v_prev_date DATE := (NOW() - INTERVAL '1 day')::DATE;
  v_year INTEGER := EXTRACT(YEAR FROM v_prev_date)::INTEGER;
  v_month INTEGER := EXTRACT(MONTH FROM v_prev_date)::INTEGER;
  v_locked INTEGER;
  v_refreshed jsonb;
BEGIN
  -- Bước 1: Refresh lần cuối cho tháng trước (đảm bảo data mới nhất TRƯỚC khi lock)
  v_refreshed := fn_refresh_specific_month(v_year, v_month);

  -- Bước 2: Lock tất cả snapshot tháng đó
  UPDATE employee_monthly_score
  SET locked_at = NOW()
  WHERE year = v_year AND month = v_month AND locked_at IS NULL;

  GET DIAGNOSTICS v_locked = ROW_COUNT;

  RETURN jsonb_build_object(
    'executed_at', NOW(),
    'locked_year', v_year,
    'locked_month', v_month,
    'snapshots_locked', v_locked,
    'pre_lock_refresh', v_refreshed
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. Schedule cron jobs
-- ============================================================

-- Job 1: refresh tháng hiện tại lúc 23:30 mỗi đêm
-- Idempotent: unschedule trước nếu đã có
SELECT cron.unschedule('refresh-current-month-snapshots')
  FROM cron.job WHERE jobname = 'refresh-current-month-snapshots';

SELECT cron.schedule(
  'refresh-current-month-snapshots',
  '30 23 * * *',
  $$SELECT fn_refresh_current_month_snapshots()$$
);

-- Job 2: lock tháng trước lúc 00:30 ngày 1 hằng tháng
SELECT cron.unschedule('lock-previous-month-snapshots')
  FROM cron.job WHERE jobname = 'lock-previous-month-snapshots';

SELECT cron.schedule(
  'lock-previous-month-snapshots',
  '30 0 1 * *',
  $$SELECT fn_lock_previous_month_snapshots()$$
);

-- ============================================================
-- Verify
-- ============================================================
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname IN ('refresh-current-month-snapshots', 'lock-previous-month-snapshots')
ORDER BY jobname;
