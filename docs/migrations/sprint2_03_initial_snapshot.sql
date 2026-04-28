-- ============================================================
-- SPRINT 2.3 — Initial snapshot 6 tháng cho mọi NV active
-- Ngày: 2026-04-28
-- Mục đích: Khởi tạo bảng employee_monthly_score với 6 tháng gần
--   nhất (11/2025 → 04/2026) cho mọi NV. Idempotent (UPSERT).
-- Effort: ~5-10 phút run time với 200 NV × 6 tháng = 1200 rows.
-- ============================================================

DO $$
DECLARE
  emp_count INTEGER := 0;
  total_snapshots INTEGER := 0;
  m INTEGER;
  y INTEGER;
  d DATE;
  emp RECORD;
BEGIN
  FOR emp IN
    SELECT id FROM employees WHERE status = 'active' ORDER BY id
  LOOP
    emp_count := emp_count + 1;

    -- Loop 6 tháng gần nhất
    FOR offset_months IN 0..5 LOOP
      d := DATE_TRUNC('month', NOW() - (offset_months || ' months')::INTERVAL);
      m := EXTRACT(MONTH FROM d)::INTEGER;
      y := EXTRACT(YEAR FROM d)::INTEGER;

      IF compute_employee_monthly_score(emp.id, y, m) IS NOT NULL THEN
        total_snapshots := total_snapshots + 1;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Initial snapshot complete: % employees, % snapshots created/updated',
    emp_count, total_snapshots;
END $$;

-- ============================================================
-- Verify: số snapshot theo tháng
-- ============================================================
SELECT
  year,
  month,
  COUNT(*) AS num_snapshots,
  ROUND(AVG(final_score)::numeric, 1) AS avg_final_score,
  COUNT(*) FILTER (WHERE grade = 'A') AS hang_A,
  COUNT(*) FILTER (WHERE grade = 'B') AS hang_B,
  COUNT(*) FILTER (WHERE grade = 'C') AS hang_C,
  COUNT(*) FILTER (WHERE grade = 'D') AS hang_D,
  COUNT(*) FILTER (WHERE grade = 'F') AS hang_F
FROM employee_monthly_score
GROUP BY year, month
ORDER BY year DESC, month DESC;

-- Top 10 NV tháng hiện tại
SELECT
  e.code, e.full_name, d.code AS dept,
  s.final_score, s.grade,
  s.quality_score, s.on_time_score, s.volume_score, s.difficulty_score,
  s.completed_tasks, s.on_time_count, s.overdue_count
FROM employee_monthly_score s
JOIN employees e ON e.id = s.employee_id
LEFT JOIN departments d ON d.id = e.department_id
WHERE s.year = EXTRACT(YEAR FROM NOW())::INT
  AND s.month = EXTRACT(MONTH FROM NOW())::INT
ORDER BY s.final_score DESC
LIMIT 10;
