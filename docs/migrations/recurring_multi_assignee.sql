-- ============================================================================
-- RECURRING RULES: Multi-assignee support
-- Đổi assignee_id (UUID đơn) → assignee_ids (UUID[])
-- ============================================================================

-- 1. Thêm cột mới
ALTER TABLE task_recurring_rules ADD COLUMN IF NOT EXISTS assignee_ids UUID[] DEFAULT '{}';

-- 2. Migrate data từ cột cũ
UPDATE task_recurring_rules
SET assignee_ids = ARRAY[assignee_id]
WHERE assignee_id IS NOT NULL AND (assignee_ids IS NULL OR assignee_ids = '{}');

-- 3. Verify
SELECT id, name, assignee_id, assignee_ids FROM task_recurring_rules;
