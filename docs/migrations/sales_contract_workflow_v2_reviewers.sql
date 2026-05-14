-- ============================================================
-- SALES CONTRACT WORKFLOW — V2: Mở rộng allowed reviewers
-- Ngày: 2026-05-14
-- Phụ thuộc: sales_contract_workflow.sql (đã apply)
--
-- Mục đích: Cho phép minhld@huyanhrubber.com + phulv@huyanhrubber.com
-- đều được review HĐ (status reviewing → approved/rejected), không chỉ
-- người được Sale chỉ định ở cột reviewer_id.
--
-- Cách làm: thêm policy soc_update_allowed_reviewer cho UPDATE bên cạnh
-- policy soc_update_actors hiện có. PostgreSQL RLS gộp các policy bằng OR
-- nên bất kỳ policy nào pass → quyền update được.
-- ============================================================

-- Allowed reviewer emails (whitelist — hardcode trong policy)
-- Khi cần thêm reviewer mới, sửa list ở đây + chạy lại migration.

DROP POLICY IF EXISTS soc_update_allowed_reviewer ON sales_order_contracts;
CREATE POLICY soc_update_allowed_reviewer ON sales_order_contracts
  FOR UPDATE USING (
    -- User hiện tại là 1 trong các email được phép review
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND lower(e.email) IN (
           'phulv@huyanhrubber.com',
           'minhld@huyanhrubber.com'
         )
    )
    -- Chỉ áp dụng khi HĐ đang ở status 'reviewing' (đang chờ duyệt)
    -- HOẶC 'approved' (admin có thể mở lại review nếu cần)
    AND status IN ('reviewing','approved')
  );

-- (Optional) thêm policy SELECT để reviewer-không-được-assign vẫn xem được full queue
-- (Hiện tại soc_select_staff đã cho phép mọi staff xem → không cần thêm.)

-- Verify policies
SELECT
  policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'sales_order_contracts'
ORDER BY policyname;
