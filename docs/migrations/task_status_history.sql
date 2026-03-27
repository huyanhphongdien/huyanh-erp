CREATE TABLE IF NOT EXISTS task_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  old_status VARCHAR(30),
  new_status VARCHAR(30) NOT NULL,
  changed_by UUID,
  changed_by_name VARCHAR(200),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_status_history(task_id);
ALTER TABLE task_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all task_status_history" ON task_status_history FOR ALL USING (true) WITH CHECK (true);
