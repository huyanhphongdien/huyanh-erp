-- ============================================================================
-- Sprint 5 R3 FIX 2 — Allow manager-dept approve leave_requests + overtime_requests
-- Date: 2026-05-04
-- Status: TO APPLY
-- ============================================================================
--
-- ROOT CAUSE (User report 2026-05-04):
--   "Lỗi khi duyệt nghỉ phép: Cannot coerce the result to a single JSON object"
--
-- Sprint 5 R3 (commit 5a28a43b) RLS UPDATE leave_requests policy chỉ cho phép:
--   - Owner (status=pending)
--   - approver_id = current user
--   - approved_by = current user
--   - is_admin_or_bgd() (level <= 3)
--
-- Trưởng phòng (level 4) / Phó phòng (level 5) cùng phòng với NV xin phép
-- KHÔNG được duyệt nếu approver_id chưa set khi tạo request.
--
-- Service leaveRequestService.approve() làm:
--   UPDATE leave_requests SET status='approved' ... .select().single()
--   → RLS reject → 0 rows → .single() throws "Cannot coerce"
--
-- IMPACT:
--   - TP/PP không duyệt được phép cho NV cùng phòng
--   - User thấy error confusing thay vì rejection rõ ràng
--   - Tương tự cho overtime_requests (cùng pattern)
--
-- FIX:
--   Mở rộng UPDATE policy cho manager same-dept (giống attendance + insert policy)
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1. LEAVE_REQUESTS — Update policy
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Update leave_requests — owner or approver or admin" ON leave_requests;

CREATE POLICY "Update leave_requests — owner pending or manager-dept or approver or admin"
  ON leave_requests FOR UPDATE
  TO authenticated
  USING (
    -- Owner update phép pending của mình (cancel, edit)
    (employee_id = current_employee_id() AND status = 'pending')
    -- Pre-assigned approver duyệt
    OR approver_id = current_employee_id()
    -- Người đã từng duyệt (cập nhật notes, revoke)
    OR approved_by = current_employee_id()
    -- TP/PP cùng phòng (level <= 5) — duyệt cho NV trong phòng
    OR (is_manager_level() AND is_same_dept(employee_id))
    -- Admin (level <= 2) — toàn quyền
    OR current_employee_level() <= 2
  )
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. OVERTIME_REQUESTS — same pattern fix (proactive)
-- ════════════════════════════════════════════════════════════════════════════
-- Memory: canApproveOT level 4-5 → cùng dept duyệt OT
-- Sprint 5 R3 cũng có thể đã thắt overtime_requests UPDATE policy

DROP POLICY IF EXISTS "Update overtime_requests — owner or approver or admin" ON overtime_requests;

CREATE POLICY "Update overtime_requests — owner pending or manager-dept or approver or admin"
  ON overtime_requests FOR UPDATE
  TO authenticated
  USING (
    (employee_id = current_employee_id() AND status = 'pending')
    OR approver_id = current_employee_id()
    OR approved_by = current_employee_id()
    OR (is_manager_level() AND is_same_dept(employee_id))
    OR current_employee_level() <= 2
  )
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Reload PostgREST schema cache
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY (sau khi apply)
-- ════════════════════════════════════════════════════════════════════════════
-- 1. List policies
-- SELECT policyname, cmd, tablename
-- FROM pg_policies
-- WHERE tablename IN ('leave_requests', 'overtime_requests')
-- ORDER BY tablename, cmd;
--
-- Expected:
--   leave_requests:
--     SELECT: "Read leave_requests — all authenticated"
--     INSERT: "Insert leave_requests — self or manager-dept"
--     UPDATE: "Update leave_requests — owner pending or manager-dept or approver or admin"
--     DELETE: "Delete leave_requests — admin only"
--   overtime_requests: tương tự
--
-- 2. Test UI: TP/PP login → duyệt phép NV cùng phòng → SUCCESS
-- 3. Test boundary: TP phòng A duyệt phép NV phòng B → expect REJECT

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS "Update leave_requests — owner pending or manager-dept or approver or admin" ON leave_requests;
-- CREATE POLICY "Update leave_requests — owner or approver or admin"
--   ON leave_requests FOR UPDATE TO authenticated
--   USING (
--     (employee_id = current_employee_id() AND status = 'pending')
--     OR approver_id = current_employee_id()
--     OR approved_by = current_employee_id()
--     OR is_admin_or_bgd()
--   ) WITH CHECK (true);
-- (tương tự cho overtime_requests)
