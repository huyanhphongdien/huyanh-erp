-- ============================================================
-- SPRINT 2.2 — Function compute_employee_monthly_score
-- Ngày: 2026-04-28
-- Mục đích:
--   Tính 4 thành tố + final_score cho 1 NV trong 1 tháng.
--   UPSERT vào employee_monthly_score. Idempotent.
--   Đọc weights từ performance_config (config-able).
--
-- Công thức:
--   final_score = quality   × 0.5
--               + on_time   × 0.2
--               + volume    × 0.2
--               + difficulty × 0.1
--
-- Bao gồm cả task NV là assignee VÀ task NV là participant (cùng điểm).
-- task_source weight: recurring/self=0.5, assigned/project=1.0
-- ============================================================

CREATE OR REPLACE FUNCTION compute_employee_monthly_score(
  p_employee_id UUID,
  p_year INTEGER,
  p_month INTEGER
) RETURNS UUID AS $$
DECLARE
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_dept_id UUID;
  v_baseline INTEGER;
  v_locked TIMESTAMPTZ;

  v_quality NUMERIC := 0;
  v_on_time NUMERIC := 0;
  v_volume NUMERIC := 0;
  v_difficulty NUMERIC := 0;
  v_final INTEGER := 0;
  v_grade CHAR(1) := 'F';

  v_total_tasks INTEGER := 0;
  v_completed INTEGER := 0;
  v_on_time_count INTEGER := 0;
  v_overdue INTEGER := 0;
  v_no_deadline INTEGER := 0;
  v_participated INTEGER := 0;

  v_total_weighted_score NUMERIC := 0;
  v_total_weight NUMERIC := 0;
  v_total_difficulty_score NUMERIC := 0;
  v_total_difficulty_count INTEGER := 0;

  v_formula_weights JSONB;
  v_source_weights JSONB;
  v_diff_scores JSONB;
  v_thresholds JSONB;
  v_config_snapshot JSONB;

  v_day_of_month INTEGER;
  v_days_in_month INTEGER;
  v_month_progress NUMERIC;
  v_expected_tasks INTEGER;

  v_id UUID;

  task_rec RECORD;
  task_source_weight NUMERIC;
  task_diff_score NUMERIC;
  is_on_time BOOLEAN;
BEGIN
  -- ── 0. Kiểm tra month đã lock chưa ──
  SELECT locked_at INTO v_locked
  FROM employee_monthly_score
  WHERE employee_id = p_employee_id AND year = p_year AND month = p_month;

  IF v_locked IS NOT NULL THEN
    RAISE NOTICE 'Skip compute: month %/% locked at %', p_month, p_year, v_locked;
    RETURN NULL;
  END IF;

  -- ── 1. Period range ──
  v_from := make_timestamptz(p_year, p_month, 1, 0, 0, 0);
  v_to := (v_from + INTERVAL '1 month' - INTERVAL '1 second');

  -- ── 2. Load config ──
  SELECT config_value INTO v_formula_weights FROM performance_config WHERE config_key = 'formula_weights';
  SELECT config_value INTO v_source_weights FROM performance_config WHERE config_key = 'task_source_weights';
  SELECT config_value INTO v_diff_scores FROM performance_config WHERE config_key = 'difficulty_scores';
  SELECT config_value INTO v_thresholds FROM performance_config WHERE config_key = 'grade_thresholds';

  -- Defaults nếu config chưa có
  v_formula_weights := COALESCE(v_formula_weights, '{"quality":0.5,"on_time":0.2,"volume":0.2,"difficulty":0.1}'::jsonb);
  v_source_weights := COALESCE(v_source_weights, '{"recurring":0.5,"self":0.5,"assigned":1.0,"project":1.0}'::jsonb);
  v_diff_scores := COALESCE(v_diff_scores, '{"normal":70,"hard":85,"critical":100}'::jsonb);
  v_thresholds := COALESCE(v_thresholds, '{"A":90,"B":75,"C":60,"D":40}'::jsonb);

  v_config_snapshot := jsonb_build_object(
    'formula_weights', v_formula_weights,
    'task_source_weights', v_source_weights,
    'difficulty_scores', v_diff_scores,
    'grade_thresholds', v_thresholds
  );

  -- ── 3. Department + baseline ──
  SELECT department_id INTO v_dept_id FROM employees WHERE id = p_employee_id;
  SELECT monthly_task_target INTO v_baseline
    FROM department_performance_baseline WHERE department_id = v_dept_id;
  v_baseline := COALESCE(v_baseline, 10);

  -- ── 4. Loop qua tasks NV làm trong tháng (assignee HOẶC participant) ──
  FOR task_rec IN
    SELECT
      t.id, t.assignee_id, t.task_source, t.final_score, t.difficulty,
      t.due_date, t.completed_date, t.completed_at, t.status,
      CASE WHEN t.assignee_id = p_employee_id THEN 'assignee' ELSE 'participant' END AS role
    FROM tasks t
    WHERE t.status = 'finished'
      AND t.completed_date >= v_from AND t.completed_date <= v_to
      AND (
        t.assignee_id = p_employee_id
        OR t.id IN (
          SELECT task_id FROM task_assignments
          WHERE employee_id = p_employee_id
            AND role = 'participant'
            AND status = 'accepted'
        )
      )
  LOOP
    v_total_tasks := v_total_tasks + 1;

    IF task_rec.role = 'assignee' THEN
      v_completed := v_completed + 1;
    ELSE
      v_participated := v_participated + 1;
    END IF;

    -- Source weight
    task_source_weight := COALESCE(
      (v_source_weights->>COALESCE(task_rec.task_source, 'assigned'))::numeric,
      1.0
    );

    -- Quality (cộng vào weighted sum)
    IF task_rec.final_score IS NOT NULL AND task_rec.final_score > 0 THEN
      v_total_weighted_score := v_total_weighted_score + (task_rec.final_score::numeric * task_source_weight);
      v_total_weight := v_total_weight + task_source_weight;
    END IF;

    -- On-time / overdue / no_deadline
    IF task_rec.due_date IS NULL THEN
      v_no_deadline := v_no_deadline + 1;
    ELSE
      is_on_time := COALESCE(task_rec.completed_date, task_rec.completed_at, v_now)
                    <= (task_rec.due_date::timestamptz + INTERVAL '23 hours 59 minutes 59 seconds');
      IF is_on_time THEN
        v_on_time_count := v_on_time_count + 1;
      ELSE
        v_overdue := v_overdue + 1;
      END IF;
    END IF;

    -- Difficulty
    task_diff_score := COALESCE(
      (v_diff_scores->>COALESCE(task_rec.difficulty, 'normal'))::numeric,
      70
    );
    v_total_difficulty_score := v_total_difficulty_score + task_diff_score;
    v_total_difficulty_count := v_total_difficulty_count + 1;
  END LOOP;

  -- ── 5. Tính 4 thành tố ──

  -- Quality: avg weighted
  v_quality := CASE WHEN v_total_weight > 0
                    THEN ROUND(v_total_weighted_score / v_total_weight)
                    ELSE 0 END;

  -- On-time: chỉ trên task có deadline
  IF (v_on_time_count + v_overdue) > 0 THEN
    v_on_time := ROUND((v_on_time_count::numeric / (v_on_time_count + v_overdue)) * 100);
  ELSE
    v_on_time := 0;
  END IF;

  -- Volume: theo tỷ lệ ngày trong tháng
  v_days_in_month := EXTRACT(DAY FROM (v_from + INTERVAL '1 month' - INTERVAL '1 day'));
  -- Nếu tháng đã kết thúc → progress = 1.0; nếu đang chạy → tỷ lệ ngày
  IF v_to < v_now THEN
    v_month_progress := 1.0;
  ELSE
    v_day_of_month := EXTRACT(DAY FROM v_now);
    v_month_progress := GREATEST(0.1, v_day_of_month::numeric / v_days_in_month);
  END IF;
  v_expected_tasks := GREATEST(1, ROUND(v_baseline * v_month_progress));
  v_volume := LEAST(100, ROUND((v_total_tasks::numeric / v_expected_tasks) * 100));

  -- Difficulty: avg
  IF v_total_difficulty_count > 0 THEN
    v_difficulty := ROUND(v_total_difficulty_score / v_total_difficulty_count);
  ELSE
    v_difficulty := 0;
  END IF;

  -- ── 6. Final score = weighted sum 4 thành tố ──
  v_final := ROUND(
    v_quality    * (v_formula_weights->>'quality')::numeric +
    v_on_time    * (v_formula_weights->>'on_time')::numeric +
    v_volume     * (v_formula_weights->>'volume')::numeric +
    v_difficulty * (v_formula_weights->>'difficulty')::numeric
  );
  v_final := GREATEST(0, LEAST(100, v_final));

  -- ── 7. Grade ──
  v_grade := CASE
    WHEN v_final >= (v_thresholds->>'A')::int THEN 'A'
    WHEN v_final >= (v_thresholds->>'B')::int THEN 'B'
    WHEN v_final >= (v_thresholds->>'C')::int THEN 'C'
    WHEN v_final >= (v_thresholds->>'D')::int THEN 'D'
    ELSE 'F'
  END;

  -- ── 8. UPSERT ──
  INSERT INTO employee_monthly_score (
    employee_id, year, month,
    quality_score, on_time_score, volume_score, difficulty_score,
    final_score, grade,
    total_tasks, completed_tasks, on_time_count, overdue_count, no_deadline_count, participated_tasks,
    config_snapshot, computed_at
  ) VALUES (
    p_employee_id, p_year, p_month,
    v_quality, v_on_time, v_volume, v_difficulty,
    v_final, v_grade,
    v_total_tasks, v_completed, v_on_time_count, v_overdue, v_no_deadline, v_participated,
    v_config_snapshot, v_now
  )
  ON CONFLICT (employee_id, year, month) DO UPDATE SET
    quality_score = EXCLUDED.quality_score,
    on_time_score = EXCLUDED.on_time_score,
    volume_score = EXCLUDED.volume_score,
    difficulty_score = EXCLUDED.difficulty_score,
    final_score = EXCLUDED.final_score,
    grade = EXCLUDED.grade,
    total_tasks = EXCLUDED.total_tasks,
    completed_tasks = EXCLUDED.completed_tasks,
    on_time_count = EXCLUDED.on_time_count,
    overdue_count = EXCLUDED.overdue_count,
    no_deadline_count = EXCLUDED.no_deadline_count,
    participated_tasks = EXCLUDED.participated_tasks,
    config_snapshot = EXCLUDED.config_snapshot,
    computed_at = EXCLUDED.computed_at
  WHERE employee_monthly_score.locked_at IS NULL  -- không update tháng đã lock
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Helper function: refresh tháng cụ thể cho mọi NV active
-- ============================================================
CREATE OR REPLACE FUNCTION fn_refresh_specific_month(p_year INT, p_month INT)
RETURNS jsonb AS $$
DECLARE
  v_count INTEGER := 0;
  emp RECORD;
BEGIN
  FOR emp IN SELECT id FROM employees WHERE status = 'active' LOOP
    IF compute_employee_monthly_score(emp.id, p_year, p_month) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('year', p_year, 'month', p_month, 'snapshots_computed', v_count);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Test với 1 NV cụ thể (Lê Duy Minh, tháng 4/2026)
-- ============================================================
SELECT compute_employee_monthly_score(
  'b8d69925-3744-4693-92d0-25235191f688',
  2026, 4
) AS snapshot_id;

SELECT employee_id, year, month,
       quality_score, on_time_score, volume_score, difficulty_score,
       final_score, grade,
       total_tasks, completed_tasks, on_time_count, overdue_count, no_deadline_count
FROM employee_monthly_score
WHERE employee_id = 'b8d69925-3744-4693-92d0-25235191f688'
  AND year = 2026 AND month = 4;
