-- ============================================================================
-- Sprint 5 R3 FIX — Align attendance DELETE policy với INSERT/UPDATE
-- Date: 2026-05-04
-- Status: TO APPLY
-- ============================================================================
--
-- ROOT CAUSE:
--   Sprint 5 R3 (commit 5a28a43b) tighten RLS attendance:
--   - INSERT/UPDATE: allow self + manager-same-dept + admin (level<=5/HR/admin)
--   - DELETE: chỉ admin (level<=2) ← QUÁ CHẶT
--
--   Trong app, attendanceEditService.canEdit() cho phép:
--   - Admin level<=2
--   - HR dept (HAP-HCTH)
--   - TP/PP same dept (level<=5)
--
--   Mismatch: app cho TP/PP/HR thấy nút trash, nhưng RLS reject DELETE
--   → silent fail (return 0 rows, no error message clear)
--
-- USER REPORT (2026-05-04):
--   Trang "Chấm công tháng" → Edit modal → click trash icon → không xóa được
--
-- IMPACT:
--   - TP/PP không xóa được attendance sai (eg NV check-in nhầm ca)
--   - HR không xóa được record duplicate
--   - Phải nhờ admin (minhld@) làm thủ công
--
-- FIX:
--   Align DELETE policy với INSERT/UPDATE: same logic.
--   Audit log đã có (trigger attendance_edit_logs) nên không lo che dấu.
-- ============================================================================

-- Step 1: Drop old DELETE policy
DROP POLICY IF EXISTS "Delete attendance — admin only" ON attendance;

-- Step 2: Create new DELETE policy align với INSERT/UPDATE
CREATE POLICY "Delete attendance — self or manager-dept or admin"
  ON attendance FOR DELETE
  TO authenticated
  USING (
    employee_id = current_employee_id()
    OR (is_manager_level() AND is_same_dept(employee_id))
    OR current_employee_level() <= 2
  );

-- Step 3: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY (sau khi apply)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. Liệt kê policies hiện tại trên attendance
-- SELECT policyname, cmd, qual::TEXT
-- FROM pg_policies
-- WHERE tablename = 'attendance'
-- ORDER BY cmd, policyname;
--
-- Expected:
--   DELETE: "Delete attendance — self or manager-dept or admin"
--   INSERT: "Insert attendance — self or manager-dept or admin"
--   SELECT: "Read attendance — all authenticated"
--   UPDATE: "Update attendance — self or manager-dept or admin"
--
-- 2. Test bằng UI: TP/PP cùng phòng với NV → click trash → record xóa thành công
-- 3. Test boundary: TP phòng A xóa NV phòng B → expect REJECT

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (nếu cần thắt lại admin-only)
-- ════════════════════════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS "Delete attendance — self or manager-dept or admin" ON attendance;
-- CREATE POLICY "Delete attendance — admin only"
--   ON attendance FOR DELETE
--   TO authenticated
--   USING (current_employee_level() <= 2);
