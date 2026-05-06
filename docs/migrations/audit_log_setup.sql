-- ============================================================================
-- Audit Log — Bảng + trigger ghi lại ai chỉnh sửa gì (admin/BGĐ)
-- Date: 2026-05-05
-- ============================================================================
--
-- Mục đích:
--   Phòng trường hợp nhầm lẫn — admin/BGĐ có thể xem ai đã thay đổi gì,
--   khi nào, từ giá trị nào sang giá trị nào.
--
-- Phase 1: Chỉ track sales_orders (tabe quan trọng nhất, hay đụng nhầm).
-- Phase 2 sau: extend sang B2B deals, employees, settlements, ledger...
--
-- AN TOÀN:
--   - SECURITY DEFINER trigger: chạy với quyền owner, bypass RLS để insert
--   - User KHÔNG insert/update/delete trực tiếp trên audit_log
--   - SELECT chỉ cho admin (level <= 3) + executive role
--   - Indexes để query nhanh theo: thời gian, record_id, user, table
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: CREATE audit_log table
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHAT
  table_name TEXT NOT NULL,             -- vd 'sales_orders'
  record_id UUID NOT NULL,              -- ID của record bị change
  record_code TEXT,                     -- denormalize 'SO-2026-0021' để search
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),

  -- WHO
  changed_by_user_id UUID,              -- auth.users.id
  changed_by_email TEXT,                -- denormalize cho search/display
  changed_by_name TEXT,                 -- denormalize tên nhân viên

  -- WHEN
  changed_at TIMESTAMPTZ DEFAULT NOW(),

  -- HOW MUCH (chỉ field thay đổi, để display gọn)
  changed_fields JSONB,                 -- {field: {old, new}} chỉ field changed

  -- FULL SNAPSHOT (audit + recovery)
  old_values JSONB,                     -- to_jsonb(OLD) toàn record cũ
  new_values JSONB,                     -- to_jsonb(NEW) toàn record mới

  -- Context (nếu app set)
  client_info TEXT                      -- vd 'web/v1.2.3' hoặc IP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by ON audit_log(changed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_record_code ON audit_log(record_code);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: HELPER — compute changed fields between OLD và NEW
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION compute_jsonb_diff(old_data JSONB, new_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result JSONB := '{}'::JSONB;
  k TEXT;
BEGIN
  -- Iterate qua keys của new_data (cover INSERT case + UPDATE)
  FOR k IN SELECT jsonb_object_keys(new_data)
  LOOP
    -- Skip fields auto-update không cần track noise
    IF k IN ('updated_at', 'created_at', 'id') THEN
      CONTINUE;
    END IF;
    -- Compare: nếu khác hoặc field mới → ghi vào diff
    IF (old_data IS NULL) OR (old_data->k IS DISTINCT FROM new_data->k) THEN
      result := result || jsonb_build_object(
        k,
        jsonb_build_object(
          'old', COALESCE(old_data->k, 'null'::JSONB),
          'new', new_data->k
        )
      );
    END IF;
  END LOOP;

  -- Iterate keys của old_data (cover DELETE case + field bị xóa)
  IF old_data IS NOT NULL THEN
    FOR k IN SELECT jsonb_object_keys(old_data)
    LOOP
      IF k IN ('updated_at', 'created_at', 'id') THEN
        CONTINUE;
      END IF;
      -- Field có trong OLD mà không có trong NEW → ghi vào diff
      IF NOT (new_data ? k) THEN
        result := result || jsonb_build_object(
          k,
          jsonb_build_object(
            'old', old_data->k,
            'new', 'null'::JSONB
          )
        );
      END IF;
    END LOOP;
  END IF;

  RETURN result;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: GENERIC AUDIT TRIGGER FUNCTION
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_user_name TEXT;
  v_table TEXT;
  v_record_id UUID;
  v_record_code TEXT;
  v_changed JSONB;
  v_old JSONB;
  v_new JSONB;
BEGIN
  v_table := TG_TABLE_NAME;

  -- Get current user from auth context
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF v_user_id IS NOT NULL THEN
    SELECT email, COALESCE(raw_user_meta_data->>'full_name', email)
    INTO v_user_email, v_user_name
    FROM auth.users
    WHERE id = v_user_id;

    -- Fallback: nếu employees có record link → dùng tên đầy đủ
    IF v_user_name IS NULL OR v_user_name = v_user_email THEN
      SELECT full_name INTO v_user_name
      FROM employees
      WHERE user_id = v_user_id
      LIMIT 1;
    END IF;
  END IF;

  -- Build snapshots + record metadata
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id;
    v_record_code := COALESCE(OLD.code::TEXT, OLD.id::TEXT);
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_changed := compute_jsonb_diff(v_old, '{}'::JSONB);
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id;
    v_record_code := COALESCE(NEW.code::TEXT, NEW.id::TEXT);
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_changed := compute_jsonb_diff('{}'::JSONB, v_new);
  ELSE -- UPDATE
    v_record_id := NEW.id;
    v_record_code := COALESCE(NEW.code::TEXT, NEW.id::TEXT);
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_changed := compute_jsonb_diff(v_old, v_new);

    -- Skip log nếu không có field nào thực sự thay đổi (chỉ updated_at)
    IF v_changed = '{}'::JSONB THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  INSERT INTO audit_log (
    table_name, record_id, record_code, action,
    changed_by_user_id, changed_by_email, changed_by_name,
    changed_fields, old_values, new_values, changed_at
  ) VALUES (
    v_table, v_record_id, v_record_code, TG_OP,
    v_user_id, v_user_email, v_user_name,
    v_changed, v_old, v_new, NOW()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: ATTACH trigger to sales_orders (Phase 1)
-- ════════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_audit_sales_orders ON sales_orders;
CREATE TRIGGER trg_audit_sales_orders
AFTER INSERT OR UPDATE OR DELETE ON sales_orders
FOR EACH ROW
EXECUTE FUNCTION log_audit_event();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: RLS — chỉ admin (level <= 3) + executive được SELECT
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_admin_bgd" ON audit_log;
CREATE POLICY "audit_log_select_admin_bgd"
  ON audit_log FOR SELECT
  TO authenticated
  USING (
    -- Dùng helper is_admin_or_bgd() đã có (level <= 3)
    is_admin_or_bgd()
  );

-- KHÔNG có policy INSERT/UPDATE/DELETE → user không thể tự ghi vào audit_log
-- Chỉ trigger SECURITY DEFINER có thể insert (bypass RLS)

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 6: NOTIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 7: VERIFY — show trigger + policy
-- ════════════════════════════════════════════════════════════════════════════
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'sales_orders'
  AND trigger_name LIKE '%audit%';
-- Mong đợi: 3 row (INSERT/UPDATE/DELETE) cho trigger trg_audit_sales_orders

SELECT policyname, cmd FROM pg_policies WHERE tablename = 'audit_log';
-- Mong đợi: 1 row "audit_log_select_admin_bgd" cmd=SELECT

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- DROP TRIGGER trg_audit_sales_orders ON sales_orders;
-- DROP FUNCTION log_audit_event();
-- DROP FUNCTION compute_jsonb_diff(JSONB, JSONB);
-- DROP TABLE audit_log;
