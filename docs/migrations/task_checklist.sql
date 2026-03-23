-- ============================================================================
-- TASK CHECKLIST — Danh sách bước nhỏ trong công việc
-- Ngày: 21/03/2026
-- Tick từng bước → tự tính progress %
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklist_task ON task_checklist_items(task_id);

-- RLS
ALTER TABLE task_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to task_checklist_items"
  ON task_checklist_items FOR ALL
  USING (true) WITH CHECK (true);

-- Verify
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'task_checklist_items';
