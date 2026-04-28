-- ============================================================
-- SPRINT 2.1 — Bảng employee_monthly_score
-- Ngày: 2026-04-28
-- Mục đích: Snapshot điểm hiệu suất theo tháng cho từng NV.
--   Dashboard đọc từ đây thay vì tính realtime mỗi load.
--   Có cơ chế lock tháng đã chốt → không bị thay đổi retroactive.
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_monthly_score (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),

  -- 4 thành tố (range 0-100)
  quality_score INTEGER NOT NULL DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 100),
  on_time_score INTEGER NOT NULL DEFAULT 0 CHECK (on_time_score BETWEEN 0 AND 100),
  volume_score INTEGER NOT NULL DEFAULT 0 CHECK (volume_score BETWEEN 0 AND 100),
  difficulty_score INTEGER NOT NULL DEFAULT 0 CHECK (difficulty_score BETWEEN 0 AND 100),

  -- Tổng hợp
  final_score INTEGER NOT NULL DEFAULT 0 CHECK (final_score BETWEEN 0 AND 100),
  grade CHAR(1) NOT NULL DEFAULT 'F' CHECK (grade IN ('A','B','C','D','F')),

  -- Đếm tham chiếu
  total_tasks INTEGER NOT NULL DEFAULT 0,
  completed_tasks INTEGER NOT NULL DEFAULT 0,
  on_time_count INTEGER NOT NULL DEFAULT 0,
  overdue_count INTEGER NOT NULL DEFAULT 0,
  no_deadline_count INTEGER NOT NULL DEFAULT 0,
  participated_tasks INTEGER NOT NULL DEFAULT 0,

  -- Attendance + Combined (nếu có data)
  attendance_score INTEGER CHECK (attendance_score IS NULL OR attendance_score BETWEEN 0 AND 100),
  combined_score INTEGER CHECK (combined_score IS NULL OR combined_score BETWEEN 0 AND 100),
  combined_grade CHAR(1) CHECK (combined_grade IS NULL OR combined_grade IN ('A','B','C','D','F')),

  -- Metadata
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES employees(id),
  config_snapshot JSONB,

  UNIQUE(employee_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_emp_monthly_year_month
  ON employee_monthly_score(year, month);
CREATE INDEX IF NOT EXISTS idx_emp_monthly_employee
  ON employee_monthly_score(employee_id, year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_emp_monthly_grade
  ON employee_monthly_score(year, month, grade);

ALTER TABLE employee_monthly_score ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read employee_monthly_score" ON employee_monthly_score
  FOR SELECT USING (true);

CREATE POLICY "Admin write employee_monthly_score" ON employee_monthly_score
  FOR ALL USING (true) WITH CHECK (true);

-- Verify
SELECT
  c.relname AS table_name,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
  (SELECT count(*) FROM pg_index WHERE indrelid = c.oid) AS num_indexes
FROM pg_class c
WHERE c.relname = 'employee_monthly_score';
