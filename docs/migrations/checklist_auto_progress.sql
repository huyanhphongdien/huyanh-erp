-- ============================================================
-- AUTO-PROGRESS từ CHECKLIST
-- Ngày: 2026-04-28
-- Mục đích: Khi tick task_checklist_items.is_completed,
--   tasks.progress tự cập nhật theo % checklist hoàn thành.
--   Hoàn thành 100% → status = 'finished', completed_date = NOW().
--   Chỉ áp dụng cho task có progress_mode = 'manual' (default).
--   Task progress_mode = 'auto_time' giữ nguyên hành vi cũ.
-- ============================================================

CREATE OR REPLACE FUNCTION sync_task_progress_from_checklist()
RETURNS TRIGGER AS $$
DECLARE
  v_task_id UUID;
  v_total INTEGER;
  v_completed INTEGER;
  v_progress INTEGER;
  v_progress_mode TEXT;
  v_current_status TEXT;
BEGIN
  v_task_id := COALESCE(NEW.task_id, OLD.task_id);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_completed = true)
    INTO v_total, v_completed
  FROM task_checklist_items
  WHERE task_id = v_task_id;

  IF v_total = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_progress := ROUND((v_completed::DECIMAL / v_total) * 100);

  SELECT progress_mode, status INTO v_progress_mode, v_current_status
  FROM tasks WHERE id = v_task_id;

  IF v_progress_mode IS NULL OR v_progress_mode = 'manual' THEN
    UPDATE tasks
      SET progress = v_progress,
          status = CASE
            WHEN v_progress >= 100 AND v_current_status NOT IN ('finished', 'cancelled') THEN 'finished'
            WHEN v_progress > 0 AND v_progress < 100 AND v_current_status = 'draft' THEN 'in_progress'
            ELSE v_current_status
          END,
          completed_date = CASE
            WHEN v_progress >= 100 AND completed_date IS NULL THEN NOW()
            WHEN v_progress < 100 THEN NULL
            ELSE completed_date
          END,
          updated_at = NOW()
    WHERE id = v_task_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_task_progress ON task_checklist_items;

CREATE TRIGGER trg_sync_task_progress
AFTER INSERT OR UPDATE OF is_completed OR DELETE
ON task_checklist_items
FOR EACH ROW EXECUTE FUNCTION sync_task_progress_from_checklist();

-- Verify
SELECT
  tgname AS trigger_name,
  tgrelid::regclass AS table_name,
  proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE tgname = 'trg_sync_task_progress';
