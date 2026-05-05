-- ============================================================================
-- Leave/Overtime — RLS UPDATE policy: cho phép manager-same-dept duyệt
-- Date: 2026-05-05
-- ============================================================================
--
-- VẤN ĐỀ phát hiện 2026-05-05:
--   UI canApproveRequest cho phép manager same dept duyệt → nút "Duyệt" hiện
--   BE RLS chỉ cho phép approver_id = current_user OR admin/BGD → reject update
--   → User thấy nút Duyệt → click → modal mở → confirm → fail "Bạn không có quyền"
--
-- Dữ liệu legacy:
--   Nhiều đơn cũ có approver_id = NULL (chưa assign approver cụ thể).
--   Ngay cả đơn có approver_id, manager khác trong cùng phòng vẫn nên có
--   quyền duyệt thay (TP nghỉ → PP duyệt cho NV).
--
-- GIẢI PHÁP:
--   Thêm rule "manager same dept" vào RLS UPDATE — đồng nhất với UI check.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- LEAVE_REQUESTS — Update policy
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Update leave_requests — owner or approver or admin" ON leave_requests;

CREATE POLICY "Update leave_requests — owner or approver or manager-dept or admin"
  ON leave_requests FOR UPDATE
  TO authenticated
  USING (
    (employee_id = current_employee_id() AND status = 'pending')
    OR approver_id = current_employee_id()
    OR approved_by = current_employee_id()
    OR is_admin_or_bgd()
    OR (is_manager_level() AND is_same_dept(employee_id))  -- ★ MỚI: TP/PP cùng phòng
  )
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- OVERTIME_REQUESTS — Update policy
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Update overtime_requests — owner or approver or admin" ON overtime_requests;

CREATE POLICY "Update overtime_requests — owner or approver or manager-dept or admin"
  ON overtime_requests FOR UPDATE
  TO authenticated
  USING (
    (employee_id = current_employee_id() AND status = 'pending')
    OR assigned_approver_id = current_employee_id()
    OR approved_by = current_employee_id()
    OR is_admin_or_bgd()
    OR (is_manager_level() AND is_same_dept(employee_id))  -- ★ MỚI: TP/PP cùng phòng
  )
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('leave_requests', 'overtime_requests')
  AND cmd = 'UPDATE'
ORDER BY tablename;
-- Mong đợi: 1 row mỗi table với policyname mới
