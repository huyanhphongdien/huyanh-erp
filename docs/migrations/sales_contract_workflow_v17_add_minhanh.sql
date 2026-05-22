-- ============================================================
-- SALES CONTRACT WORKFLOW — V17: Thêm Trần Thị Minh Anh toàn quyền
-- Ngày: 2026-05-22
-- Phụ thuộc:
--   - v2_reviewers + v11_add_reviewer_sale (reviewer policy)
--   - v3_signers + v16_signer_minhld (signer policy)
--
-- Mục đích: Cho logistics@huyanhrubber.com (Trần Thị Minh Anh) toàn quyền
-- module Đơn hàng bán — duyệt + ký + xóa file HĐ, tương đương Minh LD.
--
-- Sync code:
--   - src/config/sales.config.ts: REVIEWER_EMAILS + SIGNER_EMAILS + DELETE_PERMISSION_EMAILS
--   - src/services/sales/salesPermissionService.ts: BOD_EMAILS
-- ============================================================

-- ─── 1. Reviewer policy: thêm logistics@ ───
DROP POLICY IF EXISTS "soc_update_allowed_reviewer" ON sales_order_contracts;

CREATE POLICY "soc_update_allowed_reviewer" ON sales_order_contracts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND LOWER(e.email) IN (
           'phulv@huyanhrubber.com',
           'minhld@huyanhrubber.com',
           'sales@huyanhrubber.com',
           'logistics@huyanhrubber.com'  -- Tran Thi Minh Anh - toan quyen (2026-05-22)
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND LOWER(e.email) IN (
           'phulv@huyanhrubber.com',
           'minhld@huyanhrubber.com',
           'sales@huyanhrubber.com',
           'logistics@huyanhrubber.com'
         )
    )
  );

-- ─── 2. Signer policy: thêm logistics@ ───
DROP POLICY IF EXISTS soc_update_allowed_signer ON sales_order_contracts;

CREATE POLICY soc_update_allowed_signer ON sales_order_contracts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND lower(e.email) IN (
           'trunglxh@huyanhrubber.com',
           'huylv@huyanhrubber.com',
           'minhld@huyanhrubber.com',
           'logistics@huyanhrubber.com'  -- Tran Thi Minh Anh - toan quyen (2026-05-22)
         )
    )
    AND status IN ('approved','signed')
  );

-- ─── 3. Reload PostgREST schema cache ───
NOTIFY pgrst, 'reload schema';

-- ─── 4. Verify ───
SELECT polname AS policy_name,
       polcmd AS cmd,
       pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'sales_order_contracts'::regclass
  AND polname IN ('soc_update_allowed_reviewer','soc_update_allowed_signer')
ORDER BY polname;
