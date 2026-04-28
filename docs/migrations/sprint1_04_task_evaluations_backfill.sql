-- ============================================================
-- SPRINT 1.4 — Backfill task_evaluations từ tasks.final_score
-- Ngày: 2026-04-28
-- Mục đích: Trend 6 tháng dùng task_evaluations.score nhưng bảng
--   này chỉ được populate sau commit e4e4e851 (auto-approve fix).
--   → Backfill cho mọi task approved chưa có row trong task_evaluations.
-- Idempotent: SKIP nếu task đã có row.
-- ============================================================

-- Pre-check: bao nhiêu task cần backfill?
SELECT
  COUNT(*) FILTER (WHERE evaluation_status = 'approved' AND final_score IS NOT NULL) AS approved_with_score,
  COUNT(*) FILTER (WHERE evaluation_status = 'approved' AND final_score IS NOT NULL
                    AND id NOT IN (SELECT task_id FROM task_evaluations)) AS need_backfill
FROM tasks;

-- Backfill
INSERT INTO task_evaluations (
  task_id, employee_id, evaluator_id,
  score, rating, content,
  created_at, updated_at
)
SELECT
  t.id,
  t.assignee_id,
  COALESCE(t.assigner_id, t.assignee_id),
  t.final_score,
  CASE
    WHEN t.final_score >= 90 THEN 'excellent'
    WHEN t.final_score >= 75 THEN 'good'
    WHEN t.final_score >= 60 THEN 'average'
    ELSE 'below_average'
  END,
  'Backfill từ tasks.final_score (Sprint 1.4 — task auto-approve trước commit e4e4e851)',
  COALESCE(t.completed_date, t.completed_at, t.updated_at),
  NOW()
FROM tasks t
WHERE t.evaluation_status = 'approved'
  AND t.final_score IS NOT NULL
  AND t.assignee_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM task_evaluations e WHERE e.task_id = t.id
  );

-- Verify
SELECT
  COUNT(*) AS total_evaluations,
  COUNT(DISTINCT task_id) AS unique_tasks,
  MIN(score) AS min_score,
  MAX(score) AS max_score,
  ROUND(AVG(score)::numeric, 1) AS avg_score
FROM task_evaluations;

-- Distribution by month (kiểm tra trend đã có data)
SELECT
  TO_CHAR(created_at, 'YYYY-MM') AS month,
  COUNT(*) AS num_evals,
  ROUND(AVG(score)::numeric, 1) AS avg_score
FROM task_evaluations
WHERE created_at >= NOW() - INTERVAL '6 months'
GROUP BY 1
ORDER BY 1;
