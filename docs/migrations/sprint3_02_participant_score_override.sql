-- ============================================================
-- SPRINT 3.4 — Per-participant scoring override
-- Ngày: 2026-04-28
-- Mục đích: Cho phép manager OVERRIDE shared_score cho từng participant
--   khác với approved_score chung của task (vd: NV này làm hời hợt → 70đ
--   trong khi cả task được duyệt 90đ).
--
-- Cơ chế:
-- 1. Thêm cột score_overridden BOOLEAN vào task_assignments
-- 2. Sửa trigger update_participant_scores_on_approval:
--    - Chỉ propagate shared_score cho rows score_overridden=false
--    - Rows đã override thì giữ nguyên giá trị manual
-- 3. Khi manager set shared_score qua UI → set score_overridden=true
-- ============================================================

-- ============================================================
-- 1. Thêm cột override flag
-- ============================================================
ALTER TABLE task_assignments
  ADD COLUMN IF NOT EXISTS score_overridden BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE task_assignments
  ADD COLUMN IF NOT EXISTS overridden_by UUID REFERENCES employees(id);

ALTER TABLE task_assignments
  ADD COLUMN IF NOT EXISTS overridden_at TIMESTAMPTZ;

-- ============================================================
-- 2. Sửa trigger function — skip rows đã override
-- ============================================================
CREATE OR REPLACE FUNCTION update_participant_scores_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.action = 'approved' THEN
    -- Chỉ update các participant CHƯA OVERRIDE
    UPDATE task_assignments
    SET
      shared_score = NEW.approved_score,
      shared_rating = NEW.rating,
      approval_id = NEW.id,
      score_assigned_at = NOW(),
      updated_at = NOW()
    WHERE task_id = NEW.task_id
      AND role = 'participant'
      AND status = 'accepted'
      AND COALESCE(score_overridden, false) = false;  -- ← Sprint 3.4

    RAISE NOTICE 'Updated scores for participants of task % (skipped overridden rows)', NEW.task_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. Helper function: override 1 participant's score
-- ============================================================
CREATE OR REPLACE FUNCTION override_participant_score(
  p_assignment_id UUID,
  p_new_score INTEGER,
  p_overrider_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_old RECORD;
  v_rating VARCHAR;
BEGIN
  -- Validate score
  IF p_new_score < 0 OR p_new_score > 100 THEN
    RAISE EXCEPTION 'Score must be 0-100, got %', p_new_score;
  END IF;

  -- Lấy info cũ
  SELECT * INTO v_old FROM task_assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment % not found', p_assignment_id;
  END IF;

  -- Compute rating từ score
  v_rating := CASE
    WHEN p_new_score >= 90 THEN 'excellent'
    WHEN p_new_score >= 75 THEN 'good'
    WHEN p_new_score >= 50 THEN 'average'
    ELSE 'below_average'
  END;

  -- Update với flag
  UPDATE task_assignments
  SET
    shared_score = p_new_score,
    shared_rating = v_rating,
    score_overridden = true,
    overridden_by = p_overrider_id,
    overridden_at = NOW(),
    note = CASE
      WHEN p_reason IS NOT NULL
      THEN COALESCE(note || E'\n', '') || format('[Override %s đ ngày %s]: %s',
                                                  p_new_score, NOW()::DATE, p_reason)
      ELSE note
    END,
    updated_at = NOW()
  WHERE id = p_assignment_id;

  RETURN jsonb_build_object(
    'assignment_id', p_assignment_id,
    'old_score', v_old.shared_score,
    'new_score', p_new_score,
    'rating', v_rating,
    'overridden_by', p_overrider_id
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. Helper function: reset override (revert to task's approved_score)
-- ============================================================
CREATE OR REPLACE FUNCTION reset_participant_override(p_assignment_id UUID)
RETURNS jsonb AS $$
DECLARE
  v_task_id UUID;
  v_approved_score INTEGER;
  v_rating VARCHAR;
BEGIN
  SELECT task_id INTO v_task_id FROM task_assignments WHERE id = p_assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment % not found', p_assignment_id;
  END IF;

  -- Lấy approved_score từ task_approvals gần nhất
  SELECT approved_score, rating INTO v_approved_score, v_rating
  FROM task_approvals
  WHERE task_id = v_task_id AND action = 'approved'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_approved_score IS NULL THEN
    RAISE EXCEPTION 'Task % has no approved score yet', v_task_id;
  END IF;

  UPDATE task_assignments
  SET
    shared_score = v_approved_score,
    shared_rating = v_rating,
    score_overridden = false,
    overridden_by = NULL,
    overridden_at = NULL,
    updated_at = NOW()
  WHERE id = p_assignment_id;

  RETURN jsonb_build_object(
    'assignment_id', p_assignment_id,
    'restored_score', v_approved_score
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. Verify
-- ============================================================
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'task_assignments'
  AND column_name IN ('score_overridden', 'overridden_by', 'overridden_at')
ORDER BY ordinal_position;

-- Test: override 1 participant (uncomment to run)
-- SELECT override_participant_score(
--   '<assignment_id>'::UUID,
--   75,
--   '<manager_id>'::UUID,
--   'NV làm hời hợt, không đầy đủ checklist'
-- );
