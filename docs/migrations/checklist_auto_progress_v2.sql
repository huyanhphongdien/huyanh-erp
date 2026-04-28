-- ============================================================
-- AUTO-PROGRESS từ CHECKLIST — V2 (fix conflict with fn_sync_status_progress)
-- Ngày: 2026-04-28
-- Sửa: bỏ qua UPDATE khi không có item nào tick (v_completed = 0)
-- Lý do: existing trigger fn_sync_status_progress sẽ tự ép
--   status = 'new' khi progress = 0, mà 'new' không có trong
--   tasks_status_check → fail. Chỉ sync progress khi có ≥1 tick.
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
  v_current_progress INTEGER;
BEGIN
  v_task_id := COALESCE(NEW.task_id, OLD.task_id);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_completed = true)
    INTO v_total, v_completed
  FROM task_checklist_items
  WHERE task_id = v_task_id;

  IF v_total = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Bỏ qua khi chưa tick item nào (tránh xung đột với fn_sync_status_progress)
  -- → giữ nguyên progress ban đầu của task. Khi user tick item đầu tiên,
  --   trigger sẽ update đúng % ngay.
  IF v_completed = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_progress := ROUND((v_completed::DECIMAL / v_total) * 100);

  SELECT progress_mode, status, progress
    INTO v_progress_mode, v_current_status, v_current_progress
  FROM tasks WHERE id = v_task_id;

  -- Skip nếu không thay đổi
  IF v_progress = v_current_progress THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_progress_mode IS NULL OR v_progress_mode = 'manual' THEN
    UPDATE tasks
      SET progress = v_progress,
          status = CASE
            WHEN v_progress >= 100 AND v_current_status NOT IN ('finished', 'completed', 'cancelled') THEN 'finished'
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

-- Trigger giữ nguyên (đã CREATE từ V1, function được REPLACE ở trên)

-- Verify
SELECT proname, prosrc ILIKE '%v_completed = 0%' AS has_v2_guard
FROM pg_proc WHERE proname = 'sync_task_progress_from_checklist';
