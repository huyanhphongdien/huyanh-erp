-- ============================================================================
-- HAC-13 Phase 2 — Áp dụng mã HAC-13 cho bảng employees
-- Date: 2026-05-26
-- ============================================================================
--
-- Mục đích:
--   1) Thêm cột employees.hac13_code (char 13, UNIQUE, NOT NULL) tự sinh bằng
--      generate_hac13(3).
--   2) Backfill mã HAC-13 cho NV cũ.
--   3) Overwrite employees.code (NV001, NV002…) bằng HAC-13 để các callsite cũ
--      hiện thị mã mới mà không phải sửa code TypeScript đồng loạt.
--      → Cột `code` vẫn tồn tại tạm để giảm risk; sẽ DROP ở Phase 5 sau khi
--        migrate hết ~25 callsite trong src/.
--   4) Trigger BEFORE INSERT giữ hac13_code = code (sync), tự sinh nếu để trống.
--   5) Trigger AFTER UPDATE → log employee_history khi đổi tên/phòng/chức vụ.
--
-- Phụ thuộc:
--   - hac13_01_lib.sql (functions generate_hac13, is_valid_hac13)
--   - hac13_02_search_history_tables.sql (table employee_history)
--
-- ROLLBACK: ở cuối file (commented out).
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: ADD COLUMN hac13_code (chưa NOT NULL để backfill)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS hac13_code char(13);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: BACKFILL — sinh HAC-13 cho NV cũ
-- ════════════════════════════════════════════════════════════════════════════
-- Mỗi row cũ consume 1 nextval của hac13_seq_employee.
-- Thứ tự backfill theo created_at ASC để NV cũ nhất có sequence nhỏ nhất.
DO $$
DECLARE
  r record;
  v_code char(13);
BEGIN
  FOR r IN
    SELECT id FROM employees WHERE hac13_code IS NULL ORDER BY created_at, id
  LOOP
    v_code := generate_hac13(3);
    UPDATE employees SET hac13_code = v_code WHERE id = r.id;
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: CONSTRAINTS — UNIQUE + NOT NULL + CHECK validate + DEFAULT cho INSERT
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE employees
  ALTER COLUMN hac13_code SET NOT NULL,
  ALTER COLUMN hac13_code SET DEFAULT generate_hac13(3);

ALTER TABLE employees
  ADD CONSTRAINT employees_hac13_code_unique UNIQUE (hac13_code);

-- CHECK: mã hợp lệ + type code phải là 3 (employee)
ALTER TABLE employees
  ADD CONSTRAINT employees_hac13_code_valid
  CHECK (is_valid_hac13(hac13_code) AND substr(hac13_code, 5, 1) = '3');

COMMENT ON COLUMN employees.hac13_code IS
  'Mã định danh HAC-13 v10 cho nhân viên (type=3). Tự sinh, KHÔNG nhập tay.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: OVERWRITE cột code cũ (NV001…) bằng HAC-13
-- ════════════════════════════════════════════════════════════════════════════
-- Lý do giữ cột code tạm: ~25 callsite TypeScript đang đọc employee.code
-- (denormalize trong join, hiển thị list, payroll Excel...). Drop ngay sẽ
-- gây regression diện rộng. Phase 5 sẽ migrate hết và drop column.
UPDATE employees SET code = hac13_code WHERE code IS DISTINCT FROM hac13_code;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: TRIGGER giữ code đồng bộ với hac13_code (sync forward)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION sync_employee_code_with_hac13()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Trên INSERT: nếu chưa có hac13_code (caller không set), DEFAULT đã sinh.
  -- Cứ ghi đè code = hac13_code để giữ 1 source of truth.
  -- Trên UPDATE: nếu user/code khác cố đổi hac13_code → reject (mã bất biến).
  IF TG_OP = 'UPDATE' AND NEW.hac13_code IS DISTINCT FROM OLD.hac13_code THEN
    RAISE EXCEPTION 'employees.hac13_code không được sửa sau khi tạo (id=%)', OLD.id;
  END IF;
  NEW.code := NEW.hac13_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_sync_hac13 ON employees;
CREATE TRIGGER trg_employees_sync_hac13
BEFORE INSERT OR UPDATE ON employees
FOR EACH ROW
EXECUTE FUNCTION sync_employee_code_with_hac13();

COMMENT ON FUNCTION sync_employee_code_with_hac13() IS
  'Giữ employees.code = employees.hac13_code; chặn sửa hac13_code sau khi tạo.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 6: TRIGGER log employee_history khi đổi tên/phòng/chức vụ/HĐ/status
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION log_employee_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changed_by uuid;
BEGIN
  -- Lấy user_id từ JWT của Supabase (NULL nếu chạy server-side / job)
  v_changed_by := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;

  IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    INSERT INTO employee_history (employee_id, change_type, old_value, new_value, changed_by)
    VALUES (NEW.id, 'NAME',
            jsonb_build_object('full_name', OLD.full_name),
            jsonb_build_object('full_name', NEW.full_name),
            v_changed_by);
  END IF;

  IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    INSERT INTO employee_history (employee_id, change_type, old_value, new_value, changed_by)
    VALUES (NEW.id, 'DEPARTMENT',
            jsonb_build_object('department_id', OLD.department_id),
            jsonb_build_object('department_id', NEW.department_id),
            v_changed_by);
  END IF;

  IF NEW.position_id IS DISTINCT FROM OLD.position_id THEN
    INSERT INTO employee_history (employee_id, change_type, old_value, new_value, changed_by)
    VALUES (NEW.id, 'POSITION',
            jsonb_build_object('position_id', OLD.position_id),
            jsonb_build_object('position_id', NEW.position_id),
            v_changed_by);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO employee_history (employee_id, change_type, old_value, new_value, changed_by)
    VALUES (NEW.id, 'STATUS',
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status),
            v_changed_by);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employees_history ON employees;
CREATE TRIGGER trg_employees_history
AFTER UPDATE ON employees
FOR EACH ROW
EXECUTE FUNCTION log_employee_change();

COMMENT ON FUNCTION log_employee_change() IS
  'Log đổi tên / phòng ban / chức vụ / status vào employee_history. Mã HAC-13 giữ nguyên.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 7: INDEX cho search dual (hac13_code + full_name + code legacy)
-- ════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_employees_hac13_code ON employees(hac13_code);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 8: NOTIFY PostgREST reload schema
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 9: VERIFY
-- ════════════════════════════════════════════════════════════════════════════
-- Mong đợi: tất cả employees đều có hac13_code 13 ký tự, code = hac13_code
DO $$
DECLARE
  v_invalid int;
  v_mismatch int;
BEGIN
  SELECT count(*) INTO v_invalid FROM employees
    WHERE hac13_code IS NULL OR NOT is_valid_hac13(hac13_code) OR substr(hac13_code, 5, 1) <> '3';
  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'VERIFY FAIL: % employee có hac13_code không hợp lệ', v_invalid;
  END IF;

  SELECT count(*) INTO v_mismatch FROM employees WHERE code IS DISTINCT FROM hac13_code;
  IF v_mismatch > 0 THEN
    RAISE EXCEPTION 'VERIFY FAIL: % employee có code <> hac13_code', v_mismatch;
  END IF;

  RAISE NOTICE 'HAC-13 phase 2 VERIFY PASS — % nhân viên đã có HAC-13 hợp lệ',
    (SELECT count(*) FROM employees);
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (chỉ dùng nếu cần rollback hoàn toàn):
-- ════════════════════════════════════════════════════════════════════════════
-- DROP TRIGGER IF EXISTS trg_employees_history ON employees;
-- DROP TRIGGER IF EXISTS trg_employees_sync_hac13 ON employees;
-- DROP FUNCTION IF EXISTS log_employee_change();
-- DROP FUNCTION IF EXISTS sync_employee_code_with_hac13();
-- ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_hac13_code_unique;
-- ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_hac13_code_valid;
-- ALTER TABLE employees DROP COLUMN IF EXISTS hac13_code;
-- (LƯU Ý: code cũ NV001/NV002… đã bị overwrite — không khôi phục được. Cần backup trước.)
