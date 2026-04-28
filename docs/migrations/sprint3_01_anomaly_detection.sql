-- ============================================================
-- SPRINT 3.3 — Anomaly Detection (lạm phát điểm + score 100 không evidence)
-- Ngày: 2026-04-28
-- Mục đích: Cron weekly detect 3 loại bất thường:
--   1. Phòng có >70% NV Hạng A trong tháng → có thể chấm dễ dãi
--   2. NV có avg final_score = 100 trong 3 tháng liên tiếp → bias
--   3. Task có final_score >= 90 nhưng KHÔNG có evidence (evidence_count=0)
-- Cron: 0 8 * * 1 (8h sáng thứ 2 hàng tuần)
-- ============================================================

-- ============================================================
-- 1. Bảng lưu anomaly
-- ============================================================
CREATE TABLE IF NOT EXISTS performance_anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  anomaly_type VARCHAR(50) NOT NULL CHECK (anomaly_type IN (
    'dept_grade_inflation',
    'employee_consecutive_perfect',
    'task_high_score_no_evidence'
  )),
  severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('high','medium','low')),
  reference_id UUID,
  reference_type VARCHAR(20) CHECK (reference_type IN ('department','employee','task')),
  details JSONB NOT NULL,

  -- Resolution
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES employees(id),
  resolution_note TEXT,

  UNIQUE(anomaly_type, reference_id, detected_at)
);

CREATE INDEX IF NOT EXISTS idx_anomalies_unresolved
  ON performance_anomalies(detected_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_anomalies_type
  ON performance_anomalies(anomaly_type, detected_at DESC);

ALTER TABLE performance_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read anomalies" ON performance_anomalies FOR SELECT USING (true);
CREATE POLICY "Admin write anomalies" ON performance_anomalies FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 2. Function detect anomaly
-- ============================================================
CREATE OR REPLACE FUNCTION fn_detect_performance_anomalies()
RETURNS jsonb AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  v_month INTEGER := EXTRACT(MONTH FROM NOW())::INTEGER;
  v_count_dept INT := 0;
  v_count_emp INT := 0;
  v_count_task INT := 0;
  rec RECORD;
BEGIN
  -- ─────────────────────────────────────────────
  -- Anomaly 1: Phòng có >70% NV Hạng A trong tháng hiện tại
  -- ─────────────────────────────────────────────
  FOR rec IN
    WITH dept_grades AS (
      SELECT
        e.department_id,
        d.name AS dept_name,
        COUNT(*) AS total_employees,
        COUNT(*) FILTER (WHERE s.grade = 'A') AS a_count,
        ROUND(100.0 * COUNT(*) FILTER (WHERE s.grade = 'A') / COUNT(*), 1) AS a_percentage
      FROM employee_monthly_score s
      JOIN employees e ON e.id = s.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE s.year = v_year AND s.month = v_month
      GROUP BY e.department_id, d.name
      HAVING COUNT(*) >= 5  -- chỉ flag phòng có ≥5 NV để tránh noise
    )
    SELECT * FROM dept_grades WHERE a_percentage > 70
  LOOP
    INSERT INTO performance_anomalies (
      anomaly_type, severity, reference_id, reference_type, details
    ) VALUES (
      'dept_grade_inflation',
      CASE WHEN rec.a_percentage > 85 THEN 'high' ELSE 'medium' END,
      rec.department_id, 'department',
      jsonb_build_object(
        'dept_name', rec.dept_name,
        'year', v_year, 'month', v_month,
        'total_employees', rec.total_employees,
        'a_count', rec.a_count,
        'a_percentage', rec.a_percentage,
        'message', format('Phòng %s có %s%% NV Hạng A (%s/%s) — có thể chấm điểm dễ dãi',
                          rec.dept_name, rec.a_percentage, rec.a_count, rec.total_employees)
      )
    )
    ON CONFLICT (anomaly_type, reference_id, detected_at) DO NOTHING;
    v_count_dept := v_count_dept + 1;
  END LOOP;

  -- ─────────────────────────────────────────────
  -- Anomaly 2: NV có avg final_score = 100 trong 3 tháng liên tiếp gần nhất
  -- ─────────────────────────────────────────────
  FOR rec IN
    WITH last_3_months AS (
      SELECT
        s.employee_id,
        e.code AS emp_code,
        e.full_name AS emp_name,
        ROUND(AVG(s.final_score), 1) AS avg_3m,
        COUNT(*) AS months_count,
        MIN(s.final_score) AS min_score
      FROM employee_monthly_score s
      JOIN employees e ON e.id = s.employee_id
      WHERE (s.year, s.month) IN (
        (v_year, v_month),
        (CASE WHEN v_month = 1 THEN v_year - 1 ELSE v_year END,
         CASE WHEN v_month = 1 THEN 12 ELSE v_month - 1 END),
        (CASE WHEN v_month <= 2 THEN v_year - 1 ELSE v_year END,
         CASE WHEN v_month = 1 THEN 11 WHEN v_month = 2 THEN 12 ELSE v_month - 2 END)
      )
      GROUP BY s.employee_id, e.code, e.full_name
      HAVING COUNT(*) = 3 AND MIN(s.final_score) >= 100
    )
    SELECT * FROM last_3_months
  LOOP
    INSERT INTO performance_anomalies (
      anomaly_type, severity, reference_id, reference_type, details
    ) VALUES (
      'employee_consecutive_perfect',
      'medium',
      rec.employee_id, 'employee',
      jsonb_build_object(
        'emp_code', rec.emp_code,
        'emp_name', rec.emp_name,
        'avg_3m', rec.avg_3m,
        'message', format('%s (%s) đạt 100đ liên tiếp 3 tháng — kiểm tra task có thực sự xuất sắc hay auto-approve quá hào phóng',
                          rec.emp_name, rec.emp_code)
      )
    )
    ON CONFLICT (anomaly_type, reference_id, detected_at) DO NOTHING;
    v_count_emp := v_count_emp + 1;
  END LOOP;

  -- ─────────────────────────────────────────────
  -- Anomaly 3: Task có final_score >= 90 NHƯNG evidence_count = 0
  -- (chỉ check task hoàn thành 30 ngày gần nhất)
  -- ─────────────────────────────────────────────
  FOR rec IN
    SELECT
      t.id, t.code, t.name AS task_name,
      t.final_score, t.evidence_count,
      e.full_name AS assignee_name
    FROM tasks t
    LEFT JOIN employees e ON e.id = t.assignee_id
    WHERE t.evaluation_status = 'approved'
      AND t.final_score >= 90
      AND COALESCE(t.evidence_count, 0) = 0
      AND t.completed_date >= NOW() - INTERVAL '30 days'
  LOOP
    INSERT INTO performance_anomalies (
      anomaly_type, severity, reference_id, reference_type, details
    ) VALUES (
      'task_high_score_no_evidence',
      'low',
      rec.id, 'task',
      jsonb_build_object(
        'task_code', rec.code,
        'task_name', rec.task_name,
        'final_score', rec.final_score,
        'assignee_name', rec.assignee_name,
        'message', format('Task %s (%sđ) không có evidence — kiểm tra có chấm hời hợt không',
                          rec.code, rec.final_score)
      )
    )
    ON CONFLICT (anomaly_type, reference_id, detected_at) DO NOTHING;
    v_count_task := v_count_task + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'executed_at', NOW(),
    'year', v_year, 'month', v_month,
    'dept_anomalies', v_count_dept,
    'employee_anomalies', v_count_emp,
    'task_anomalies', v_count_task,
    'total', v_count_dept + v_count_emp + v_count_task
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. Schedule cron (8h sáng thứ 2 hàng tuần)
-- ============================================================
SELECT cron.unschedule('detect-performance-anomalies')
  FROM cron.job WHERE jobname = 'detect-performance-anomalies';

SELECT cron.schedule(
  'detect-performance-anomalies',
  '0 1 * * 1',  -- 1h UTC = 8h Asia/Bangkok thứ 2
  $$SELECT fn_detect_performance_anomalies()$$
);

-- ============================================================
-- 4. Run lần đầu để test
-- ============================================================
SELECT fn_detect_performance_anomalies();

-- ============================================================
-- 5. Verify
-- ============================================================
SELECT
  anomaly_type,
  severity,
  reference_type,
  details->>'message' AS message,
  detected_at
FROM performance_anomalies
WHERE resolved_at IS NULL
ORDER BY detected_at DESC, severity DESC
LIMIT 20;

SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobname = 'detect-performance-anomalies';
