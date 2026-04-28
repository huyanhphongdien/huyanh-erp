-- ============================================================
-- SPRINT 2.6 — Trigger auto-tick checklist khi upload evidence
-- Ngày: 2026-04-28
-- Mục đích: Khi NV upload ảnh evidence cho 1 checklist item
--   yêu cầu evidence, item tự động tick (is_completed=true).
--   Giảm 1 thao tác cho NV.
--
-- Trigger: BEFORE UPDATE OF evidence_url, evidence_urls
--   - Fire khi evidence_url đổi từ NULL/empty → có giá trị
--   - VÀ requires_evidence = true
--   - VÀ chưa is_completed
--   → set is_completed = true + completed_at = NOW
--
-- Sau khi tick, trigger trg_sync_progress_from_checklist (đã có)
-- sẽ tự update tasks.progress.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_auto_tick_on_evidence_upload()
RETURNS TRIGGER AS $$
BEGIN
  -- Chỉ fire khi:
  -- 1. requires_evidence = true
  -- 2. chưa is_completed
  -- 3. evidence_url đổi từ NULL/'' → có giá trị
  IF NEW.requires_evidence = true
     AND COALESCE(NEW.is_completed, false) = false
     AND NEW.evidence_url IS NOT NULL
     AND COALESCE(NEW.evidence_url, '') != ''
     AND (OLD.evidence_url IS NULL OR OLD.evidence_url = '')
  THEN
    NEW.is_completed := true;
    NEW.completed_at := COALESCE(NEW.completed_at, NOW());
    -- completed_by giữ nguyên (UI nên set khi upload)
    RAISE NOTICE 'Auto-ticked checklist item % on evidence upload', NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_tick_on_evidence ON task_checklist_items;

CREATE TRIGGER trg_auto_tick_on_evidence
BEFORE UPDATE OF evidence_url, evidence_urls
ON task_checklist_items
FOR EACH ROW EXECUTE FUNCTION fn_auto_tick_on_evidence_upload();

-- ============================================================
-- Verify
-- ============================================================
SELECT
  tgname AS trigger_name,
  CASE tgenabled WHEN 'O' THEN 'ENABLED' ELSE tgenabled::TEXT END AS state
FROM pg_trigger
WHERE tgname = 'trg_auto_tick_on_evidence';
