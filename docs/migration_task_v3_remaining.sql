-- ============================================================================
-- MIGRATION: Task V3 — Phần D (bằng chứng) + Phần A bổ sung
-- ============================================================================

-- D.1 Thêm cột bằng chứng cho task_checklist_items
ALTER TABLE task_checklist_items
  ADD COLUMN IF NOT EXISTS requires_evidence BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_url TEXT,
  ADD COLUMN IF NOT EXISTS evidence_note TEXT;

-- D.2 Storage bucket cho bằng chứng
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-evidence', 'task-evidence', true)
ON CONFLICT (id) DO NOTHING;

-- D.3 RLS cho storage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Cho phép đọc bằng chứng' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Cho phép đọc bằng chứng" ON storage.objects
      FOR SELECT USING (bucket_id = 'task-evidence');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Cho phép upload bằng chứng' AND tablename = 'objects'
  ) THEN
    CREATE POLICY "Cho phép upload bằng chứng" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'task-evidence');
  END IF;
END $$;

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_name = 'task_checklist_items' AND column_name IN ('requires_evidence', 'evidence_url', 'evidence_note');
