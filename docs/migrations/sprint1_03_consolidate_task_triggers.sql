-- ============================================================
-- SPRINT 1.3 — CONSOLIDATE TASK TRIGGERS (4 → 1)
-- Ngày: 2026-04-28
-- Mục đích:
--   Hiện tại 4 BEFORE INSERT/UPDATE trigger trên tasks chồng chéo:
--     1. trigger_auto_progress (trigger_auto_progress)
--     2. fn_sync_status_progress (trg_sync_status_progress)  ← BUG: ép status='new'
--     3. validate_task_status_progress (trigger_validate_task_status_progress)
--     4. fn_auto_update_progress_on_status_change (trg_auto_update_progress)
--   Order ngẫu nhiên, sửa lẫn nhau, gây bug.
--
-- Giải pháp: 1 function fn_normalize_task_state() thay 4 cái trên.
--
-- ⚠️ HIGH RISK: refactor logic core. Đọc hết comment + chạy ROLLBACK SECTION
--    nếu có vấn đề.
--
-- THỨ TỰ APPLY:
--   1. CREATE function fn_normalize_task_state (mới)
--   2. CREATE trigger trg_normalize_task_state (mới)
--   3. DISABLE 4 trigger cũ (giữ DEFINITION trong DB, chỉ disable)
--   4. Test 24h trên prod (smoke test)
--   5. Sau OK → DROP 4 trigger + function cũ
--
-- ============================================================

-- ============================================================
-- STEP 1: Function mới
-- ============================================================
CREATE OR REPLACE FUNCTION fn_normalize_task_state()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. Progress range [0, 100]
  NEW.progress := GREATEST(0, LEAST(100, COALESCE(NEW.progress, 0)));

  -- 2. Progress mode default
  NEW.progress_mode := COALESCE(NEW.progress_mode, 'manual');

  -- 3. Status ↔ progress consistency (KHÔNG ép status='new' — đó là legacy bug)
  IF NEW.status = 'finished' AND NEW.progress < 100 THEN
    NEW.progress := 100;
  ELSIF NEW.status = 'draft' AND NEW.progress > 0 AND NEW.progress < 100 THEN
    NEW.status := 'in_progress';
  ELSIF NEW.progress = 100 AND NEW.status NOT IN ('finished','completed','cancelled') THEN
    NEW.status := 'finished';
  END IF;

  -- 4. completed_date — set khi finished, clear khi không
  IF NEW.status IN ('finished','completed') AND NEW.completed_date IS NULL THEN
    NEW.completed_date := NOW();
  ELSIF NEW.status NOT IN ('finished','completed') THEN
    NEW.completed_date := NULL;
  END IF;

  -- 5. completed_at column (legacy alias) sync với completed_date
  IF NEW.status IN ('finished','completed','accepted') THEN
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := NOW();
    END IF;
  ELSE
    NEW.completed_at := NULL;
  END IF;

  -- 6. evaluation_status default khi chuyển sang finished
  IF NEW.status = 'finished' AND (TG_OP = 'INSERT' OR (OLD.status IS DISTINCT FROM 'finished')) THEN
    -- Chỉ default khi NULL hoặc 'none'
    IF NEW.evaluation_status IS NULL OR NEW.evaluation_status = 'none' THEN
      -- task_source quyết định flow:
      -- assigned → pending_approval (skip self-eval theo UI flow line 236-242)
      -- recurring/self/project → pending_self_eval (NV tự đánh giá trước)
      IF NEW.task_source = 'assigned' THEN
        NEW.evaluation_status := 'pending_approval';
      ELSE
        NEW.evaluation_status := 'pending_self_eval';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STEP 2: Trigger mới
-- ============================================================
DROP TRIGGER IF EXISTS trg_normalize_task_state ON tasks;
CREATE TRIGGER trg_normalize_task_state
BEFORE INSERT OR UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION fn_normalize_task_state();

-- ============================================================
-- STEP 3: DISABLE 4 trigger cũ (giữ định nghĩa, chỉ tắt)
--   Để dễ rollback: chỉ cần ALTER ENABLE TRIGGER là chạy lại.
-- ============================================================
ALTER TABLE tasks DISABLE TRIGGER trg_task_auto_progress;
ALTER TABLE tasks DISABLE TRIGGER trg_sync_status_progress;
ALTER TABLE tasks DISABLE TRIGGER trigger_validate_task_status_progress;
ALTER TABLE tasks DISABLE TRIGGER trg_auto_update_progress;

-- Optionally: disable trg_auto_update_on_status_change (đã merged logic vào fn_normalize_task_state)
ALTER TABLE tasks DISABLE TRIGGER trg_auto_update_on_status_change;

-- ============================================================
-- VERIFY
-- ============================================================
SELECT
  tgname,
  CASE tgenabled WHEN 'O' THEN 'ENABLED' WHEN 'D' THEN 'DISABLED' ELSE tgenabled::TEXT END AS state
FROM pg_trigger
WHERE tgrelid = 'tasks'::regclass
  AND NOT tgisinternal
  AND tgname IN (
    'trg_normalize_task_state',
    'trg_task_auto_progress',
    'trg_sync_status_progress',
    'trigger_validate_task_status_progress',
    'trg_auto_update_progress',
    'trg_auto_update_on_status_change'
  )
ORDER BY tgname;

-- ============================================================
-- SMOKE TEST (chạy thủ công sau apply, trên 1 task test)
-- ============================================================
-- 1. INSERT task draft với progress=0 → status giữ 'draft', không bị ép 'new'
-- 2. UPDATE progress=50 → status auto chuyển 'in_progress'
-- 3. UPDATE progress=100 → status auto 'finished', completed_date = NOW
--    + evaluation_status = 'pending_approval' (vì task_source='assigned')
-- 4. UPDATE status='finished' với task task_source='recurring' →
--    evaluation_status = 'pending_self_eval'
-- 5. UPDATE progress=0 trên task đã finished → status giữ 'finished' (không bị ép 'new')

-- ============================================================
-- ROLLBACK SECTION (chạy nếu có vấn đề)
-- ============================================================
-- DROP TRIGGER trg_normalize_task_state ON tasks;
-- DROP FUNCTION fn_normalize_task_state();
-- ALTER TABLE tasks ENABLE TRIGGER trg_task_auto_progress;
-- ALTER TABLE tasks ENABLE TRIGGER trg_sync_status_progress;
-- ALTER TABLE tasks ENABLE TRIGGER trigger_validate_task_status_progress;
-- ALTER TABLE tasks ENABLE TRIGGER trg_auto_update_progress;
-- ALTER TABLE tasks ENABLE TRIGGER trg_auto_update_on_status_change;
