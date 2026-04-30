-- ============================================================
-- SPRINT 5 R3 — TIGHTEN ATTENDANCE/SHIFT/LEAVE/OVERTIME SECURITY
-- Ngày: 2026-04-29
-- Sau audit module attendance + shift, phát hiện 5 vấn đề bảo mật:
--
-- R3-1: attendance.status không có CHECK constraint → insert string nào cũng pass
-- R3-2: attendance RLS allow ALL authenticated → NV edit/xóa attendance NV khác
-- R3-3: shift_assignments RLS allow ALL → NV tự sửa shift của mình
-- R3-4: leave_requests có 8 RLS policies duplicate (mix public + authenticated)
-- R3-5: overtime_requests RLS dùng role 'public' (chưa login cũng access)
--
-- ⚠️ HIGH RISK migration. ROLLBACK SECTION ở cuối.
-- Test kỹ flow check-in/check-out + manager edit + dashboard load
-- TRƯỚC khi confirm.
-- ============================================================

-- ============================================================
-- 0. PRE-CHECK: verify status enum data sạch
-- ============================================================
SELECT
  status,
  COUNT(*) AS num,
  CASE WHEN status IN ('present','late','late_and_early','early_leave','business_trip','leave')
       THEN '✅ valid' ELSE '⚠️ INVALID — cần convert trước' END AS check_result
FROM attendance
GROUP BY status
ORDER BY num DESC;

-- Nếu kết quả có row INVALID → dừng + xử lý data trước. Nếu không → tiếp tục.

-- ============================================================
-- 1. HELPER FUNCTIONS — map auth.uid() → employee + level
-- ============================================================

-- Lấy employee_id của user đang đăng nhập
CREATE OR REPLACE FUNCTION current_employee_id()
RETURNS UUID AS $$
  SELECT id FROM employees WHERE user_id = auth.uid() LIMIT 1
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Lấy position level của user đang đăng nhập (default 99 nếu không tìm thấy)
CREATE OR REPLACE FUNCTION current_employee_level()
RETURNS INTEGER AS $$
  SELECT COALESCE(p.level, 99)
  FROM employees e
  LEFT JOIN positions p ON p.id = e.position_id
  WHERE e.user_id = auth.uid()
  LIMIT 1
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Lấy department_id của user đang đăng nhập
CREATE OR REPLACE FUNCTION current_employee_dept()
RETURNS UUID AS $$
  SELECT department_id FROM employees WHERE user_id = auth.uid() LIMIT 1
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Check user có phải admin/BGD (level <= 3)?
CREATE OR REPLACE FUNCTION is_admin_or_bgd()
RETURNS BOOLEAN AS $$
  SELECT current_employee_level() <= 3
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Check user có phải Manager level (level <= 5 = BGD/TP/PP)?
CREATE OR REPLACE FUNCTION is_manager_level()
RETURNS BOOLEAN AS $$
  SELECT current_employee_level() <= 5
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Check user có cùng dept với target employee không?
CREATE OR REPLACE FUNCTION is_same_dept(target_emp_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees t
    WHERE t.id = target_emp_id
      AND t.department_id = current_employee_dept()
  )
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ============================================================
-- 2. R3-1: CHECK constraint attendance.status
-- ============================================================

-- Drop nếu đã có (idempotent)
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_status_check;

-- Add CHECK với 6 values hợp lệ (theo enum thật trong DB)
ALTER TABLE attendance
  ADD CONSTRAINT attendance_status_check CHECK (
    status IS NULL OR status IN (
      'present', 'late', 'late_and_early',
      'early_leave', 'business_trip', 'leave'
    )
  );

-- ============================================================
-- 3. R3-2: TIGHTEN RLS attendance
-- ============================================================
-- Trước: 4 policies allow ALL authenticated → NV edit NV khác
-- Sau:
--   SELECT: allow all authenticated (cần cho dashboards)
--   INSERT: self only OR manager_dept (level<=5 cùng phòng) OR admin
--   UPDATE: same
--   DELETE: only admin (level<=2)

DROP POLICY IF EXISTS "Allow read attendance" ON attendance;
DROP POLICY IF EXISTS "Allow insert attendance" ON attendance;
DROP POLICY IF EXISTS "Allow update attendance" ON attendance;
DROP POLICY IF EXISTS "Allow delete attendance" ON attendance;

CREATE POLICY "Read attendance — all authenticated"
  ON attendance FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Insert attendance — self or manager-dept or admin"
  ON attendance FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id = current_employee_id()
    OR (is_manager_level() AND is_same_dept(employee_id))
    OR current_employee_level() <= 2
  );

CREATE POLICY "Update attendance — self or manager-dept or admin"
  ON attendance FOR UPDATE
  TO authenticated
  USING (
    employee_id = current_employee_id()
    OR (is_manager_level() AND is_same_dept(employee_id))
    OR current_employee_level() <= 2
  )
  WITH CHECK (
    employee_id = current_employee_id()
    OR (is_manager_level() AND is_same_dept(employee_id))
    OR current_employee_level() <= 2
  );

CREATE POLICY "Delete attendance — admin only"
  ON attendance FOR DELETE
  TO authenticated
  USING (current_employee_level() <= 2);

-- ============================================================
-- 4. R3-3: TIGHTEN RLS shift_assignments
-- ============================================================
-- Trước: 4 policies allow ALL authenticated → NV tự sửa shift mình
-- Sau:
--   SELECT: allow all authenticated
--   INSERT/UPDATE/DELETE: chỉ manager_level (level<=5) hoặc admin

DROP POLICY IF EXISTS "shift_assignments_select" ON shift_assignments;
DROP POLICY IF EXISTS "shift_assignments_insert" ON shift_assignments;
DROP POLICY IF EXISTS "shift_assignments_update" ON shift_assignments;
DROP POLICY IF EXISTS "shift_assignments_delete" ON shift_assignments;

CREATE POLICY "Read shift_assignments — all authenticated"
  ON shift_assignments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Write shift_assignments — manager-level or admin"
  ON shift_assignments FOR ALL
  TO authenticated
  USING (is_manager_level())
  WITH CHECK (is_manager_level());

-- ============================================================
-- 5. R3-4 + R3-5: CLEANUP + TIGHTEN leave_requests
-- ============================================================
-- Trước: 8 policies duplicate (mix public + authenticated) — chồng chéo
-- Sau: 4 policies clean, chỉ authenticated

-- Drop tất cả policies cũ
DROP POLICY IF EXISTS "leave_delete_policy" ON leave_requests;
DROP POLICY IF EXISTS "leave_insert_policy" ON leave_requests;
DROP POLICY IF EXISTS "leave_select_policy" ON leave_requests;
DROP POLICY IF EXISTS "leave_update_policy" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_delete_policy" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_insert" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_insert_policy" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_select" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_select_policy" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_update" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_update_policy" ON leave_requests;

-- Tạo lại 4 policies clean
CREATE POLICY "Read leave_requests — all authenticated"
  ON leave_requests FOR SELECT
  TO authenticated
  USING (true);

-- NV tự tạo phép cho mình; manager tạo cho NV cùng phòng
CREATE POLICY "Insert leave_requests — self or manager-dept"
  ON leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id = current_employee_id()
    OR (is_manager_level() AND is_same_dept(employee_id))
  );

-- NV update phép pending của mình; approver update phép được giao
CREATE POLICY "Update leave_requests — owner or approver or admin"
  ON leave_requests FOR UPDATE
  TO authenticated
  USING (
    (employee_id = current_employee_id() AND status = 'pending')
    OR approver_id = current_employee_id()
    OR approved_by = current_employee_id()
    OR is_admin_or_bgd()
  )
  WITH CHECK (true);

-- Chỉ admin xóa phép
CREATE POLICY "Delete leave_requests — admin only"
  ON leave_requests FOR DELETE
  TO authenticated
  USING (current_employee_level() <= 2);

-- ============================================================
-- 6. R3-5: TIGHTEN overtime_requests RLS
-- ============================================================
-- Trước: 3 policies dùng role 'public' (chưa login cũng access)
-- Sau: chỉ authenticated với rules như leave_requests

DROP POLICY IF EXISTS "OT_Insert_Policy" ON overtime_requests;
DROP POLICY IF EXISTS "OT_Select_Policy" ON overtime_requests;
DROP POLICY IF EXISTS "OT_Update_Policy" ON overtime_requests;
DROP POLICY IF EXISTS "OT_Delete_Policy" ON overtime_requests;

CREATE POLICY "Read overtime_requests — all authenticated"
  ON overtime_requests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Insert overtime_requests — self or manager-dept"
  ON overtime_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id = current_employee_id()
    OR (is_manager_level() AND is_same_dept(employee_id))
  );

CREATE POLICY "Update overtime_requests — owner or approver or admin"
  ON overtime_requests FOR UPDATE
  TO authenticated
  USING (
    (employee_id = current_employee_id() AND status = 'pending')
    OR assigned_approver_id = current_employee_id()
    OR approved_by = current_employee_id()
    OR is_admin_or_bgd()
  )
  WITH CHECK (true);

CREATE POLICY "Delete overtime_requests — admin only"
  ON overtime_requests FOR DELETE
  TO authenticated
  USING (current_employee_level() <= 2);

-- ============================================================
-- VERIFY
-- ============================================================
SELECT
  tablename,
  policyname,
  cmd AS command,
  CASE WHEN 'authenticated' = ANY(roles) THEN 'authenticated' ELSE roles::text END AS roles
FROM pg_policies
WHERE tablename IN ('attendance', 'shift_assignments', 'leave_requests', 'overtime_requests')
ORDER BY tablename, cmd;

-- Verify CHECK constraint
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'attendance'::regclass
  AND conname = 'attendance_status_check';

-- ============================================================
-- ROLLBACK SECTION (chạy nếu sự cố)
-- ============================================================
-- ALTER TABLE attendance DROP CONSTRAINT attendance_status_check;
--
-- DROP POLICY IF EXISTS "Read attendance — all authenticated" ON attendance;
-- DROP POLICY IF EXISTS "Insert attendance — self or manager-dept or admin" ON attendance;
-- DROP POLICY IF EXISTS "Update attendance — self or manager-dept or admin" ON attendance;
-- DROP POLICY IF EXISTS "Delete attendance — admin only" ON attendance;
-- CREATE POLICY "Allow read attendance" ON attendance FOR SELECT TO authenticated USING (true);
-- CREATE POLICY "Allow insert attendance" ON attendance FOR INSERT TO authenticated WITH CHECK (true);
-- CREATE POLICY "Allow update attendance" ON attendance FOR UPDATE TO authenticated USING (true);
-- CREATE POLICY "Allow delete attendance" ON attendance FOR DELETE TO authenticated USING (true);
-- (tương tự cho shift_assignments, leave_requests, overtime_requests)
