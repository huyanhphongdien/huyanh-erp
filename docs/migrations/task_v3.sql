-- ============================================================
-- TASK V3 — Migration
-- Ngày: 31/03/2026
-- Đánh giá bắt buộc + Auto approve + Weight + Xếp hạng
-- ============================================================

-- 1. Tasks: thêm điểm + nguồn
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS self_score INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS manager_score INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS final_score INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_source VARCHAR(20) DEFAULT 'assigned';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS evidence_count INTEGER DEFAULT 0;

-- 2. Checklist: bằng chứng
ALTER TABLE task_checklist_items
  ADD COLUMN IF NOT EXISTS requires_evidence BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_url TEXT,
  ADD COLUMN IF NOT EXISTS evidence_note TEXT;

-- 3. Templates: đánh dấu lặp lại
ALTER TABLE task_templates
  ADD COLUMN IF NOT EXISTS is_routine BOOLEAN DEFAULT false;

UPDATE task_templates SET is_routine = true
WHERE name ILIKE '%trực ca%' OR name ILIKE '%định kỳ%';

-- 4. Approvals: deadline duyệt
ALTER TABLE task_approvals
  ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN DEFAULT false;

-- 5. Cấu hình xếp hạng hiệu suất
CREATE TABLE IF NOT EXISTS performance_salary_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade CHAR(1) NOT NULL UNIQUE,
  grade_label VARCHAR(50) NOT NULL,
  min_score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  salary_coefficient DECIMAL(4,2) NOT NULL DEFAULT 1.0,
  bonus_percentage INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE performance_salary_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read performance config" ON performance_salary_config
  FOR SELECT USING (true);
CREATE POLICY "Allow all performance config" ON performance_salary_config
  FOR ALL USING (true) WITH CHECK (true);

INSERT INTO performance_salary_config (grade, grade_label, min_score, max_score, salary_coefficient, bonus_percentage, description)
VALUES
  ('A', 'Xuất sắc',       90, 100, 1.00, 100, 'Xuất sắc — Khen thưởng, ưu tiên thăng tiến'),
  ('B', 'Tốt',            75,  89, 1.00,  50, 'Tốt — Hoàn thành tốt nhiệm vụ'),
  ('C', 'Trung bình',     60,  74, 0.95,   0, 'Trung bình — Cần nỗ lực thêm'),
  ('D', 'Cần cải thiện',  40,  59, 0.90,   0, 'Cần cải thiện gấp'),
  ('F', 'Không đạt',       0,  39, 0.85,   0, 'Không đạt — Xem xét kỷ luật')
ON CONFLICT (grade) DO NOTHING;

-- 6. Storage bucket cho bằng chứng
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-evidence', 'task-evidence', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Backfill task_source
UPDATE tasks SET task_source = 'self' WHERE is_self_assigned = true AND (task_source IS NULL OR task_source = 'assigned');
UPDATE tasks SET task_source = 'project' WHERE project_id IS NOT NULL AND (task_source IS NULL OR task_source = 'assigned');

-- 8. Verify
SELECT column_name FROM information_schema.columns
WHERE table_name = 'tasks' AND column_name IN ('self_score','manager_score','final_score','task_source','evidence_count')
ORDER BY column_name;
