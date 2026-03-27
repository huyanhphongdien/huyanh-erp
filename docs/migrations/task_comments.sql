-- ============================================================================
-- TASK COMMENTS TABLE
-- File: docs/migrations/task_comments.sql
-- ============================================================================
-- Bảng bình luận cho công việc (task comments)
-- Hỗ trợ: reply (parent_comment_id), soft delete, edit tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES employees(id),
  content TEXT NOT NULL,
  parent_comment_id UUID REFERENCES task_comments(id) ON DELETE CASCADE,
  is_edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_author ON task_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_parent ON task_comments(parent_comment_id);

-- RLS
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all task_comments" ON task_comments FOR ALL USING (true) WITH CHECK (true);
