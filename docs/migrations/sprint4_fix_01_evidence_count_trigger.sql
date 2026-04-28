-- ============================================================
-- SPRINT 4 FIX — B-1: Trigger update tasks.evidence_count
-- Ngày: 2026-04-28
-- Vấn đề: tasks.evidence_count = 0 cho mọi task (CV-0000432-435)
--   dù checklist items đã có evidence_url đầy đủ.
--   → Anomaly detection báo "task ≥90đ không evidence" sai (false positive)
--
-- Fix: Trigger AFTER INSERT/UPDATE/DELETE on task_checklist_items
--   → COUNT items có evidence_url → UPDATE tasks.evidence_count
-- ============================================================

CREATE OR REPLACE FUNCTION fn_sync_task_evidence_count()
RETURNS TRIGGER AS $$
DECLARE
  v_task_id UUID;
  v_count INTEGER;
BEGIN
  v_task_id := COALESCE(NEW.task_id, OLD.task_id);

  -- Đếm số checklist items CÓ evidence_url (text non-null non-empty)
  -- HOẶC evidence_urls (jsonb array) có ít nhất 1 element
  SELECT COUNT(*)
  INTO v_count
  FROM task_checklist_items
  WHERE task_id = v_task_id
    AND (
      (evidence_url IS NOT NULL AND evidence_url != '')
      OR (evidence_urls IS NOT NULL AND jsonb_array_length(evidence_urls) > 0)
    );

  UPDATE tasks
  SET evidence_count = v_count,
      updated_at = NOW()
  WHERE id = v_task_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_evidence_count ON task_checklist_items;

CREATE TRIGGER trg_sync_evidence_count
AFTER INSERT OR UPDATE OF evidence_url, evidence_urls OR DELETE
ON task_checklist_items
FOR EACH ROW EXECUTE FUNCTION fn_sync_task_evidence_count();

-- ============================================================
-- BACKFILL: Cập nhật evidence_count cho mọi task hiện có
-- ============================================================

UPDATE tasks t
SET evidence_count = (
  SELECT COUNT(*)
  FROM task_checklist_items c
  WHERE c.task_id = t.id
    AND (
      (c.evidence_url IS NOT NULL AND c.evidence_url != '')
      OR (c.evidence_urls IS NOT NULL AND jsonb_array_length(c.evidence_urls) > 0)
    )
)
WHERE EXISTS (
  SELECT 1 FROM task_checklist_items c WHERE c.task_id = t.id
);

-- ============================================================
-- Re-run anomaly detection để clear false positives
-- ============================================================

-- Mark old false-positive anomalies as resolved
UPDATE performance_anomalies
SET resolved_at = NOW(),
    resolution_note = 'Auto-resolved: bug B-1 evidence_count fixed (Sprint 4 fix)'
WHERE anomaly_type = 'task_high_score_no_evidence'
  AND resolved_at IS NULL
  AND reference_id IN (
    SELECT id FROM tasks WHERE evidence_count > 0
  );

-- Re-run detection để có data fresh
SELECT fn_detect_performance_anomalies();

-- ============================================================
-- Verify
-- ============================================================
SELECT
  t.code,
  t.evidence_count AS computed_count,
  (SELECT COUNT(*) FROM task_checklist_items c
   WHERE c.task_id = t.id
     AND (c.evidence_url IS NOT NULL AND c.evidence_url != '')) AS items_with_url
FROM tasks t
WHERE t.code IN ('CV-0000432','CV-0000433','CV-0000434','CV-0000435')
ORDER BY t.code;

SELECT
  anomaly_type,
  COUNT(*) FILTER (WHERE resolved_at IS NULL) AS active,
  COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved
FROM performance_anomalies
GROUP BY anomaly_type;
