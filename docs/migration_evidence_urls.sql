-- ============================================================================
-- MIGRATION: Evidence URLs array for task checklist
-- ============================================================================

-- Thêm evidence_urls JSONB array (multi-file)
ALTER TABLE task_checklist_items
  ADD COLUMN IF NOT EXISTS evidence_urls JSONB DEFAULT '[]'::jsonb;

-- Migrate data cũ: evidence_url → evidence_urls
UPDATE task_checklist_items
SET evidence_urls = jsonb_build_array(evidence_url)
WHERE evidence_url IS NOT NULL AND evidence_url != ''
  AND (evidence_urls IS NULL OR evidence_urls = '[]'::jsonb);

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'task_checklist_items'
  AND column_name IN ('requires_evidence', 'evidence_url', 'evidence_urls', 'evidence_note');
