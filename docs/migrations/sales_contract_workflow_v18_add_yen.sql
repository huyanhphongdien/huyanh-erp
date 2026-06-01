-- ============================================================
-- SALES CONTRACT WORKFLOW — V18: Thêm Đỗ Thị Yến vào Kiểm tra HĐ
-- Ngày: 2026-06-01
-- Phụ thuộc:
--   - v2_reviewers + v11_add_reviewer_sale + v17_add_minhanh (reviewer policy)
--
-- Mục đích: Cho yendt@huyanhrubber.com (Đỗ Thị Yến) NGANG QUYỀN Phú LV ở khâu
-- Kiểm tra HĐ — duyệt / trả lại + nhập bank info. CHỈ reviewer, KHÔNG ký,
-- KHÔNG xóa file (giống Phú).
--
-- Sync code:
--   - src/config/sales.config.ts: REVIEWER_EMAILS (+ yendt@)
--   - src/components/common/Sidebar.tsx: menu "Kiểm tra HĐ" allowedEmails (+ yendt@)
-- ============================================================

-- ─── Reviewer policy: thêm yendt@ (giữ nguyên các email cũ) ───
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
           'logistics@huyanhrubber.com',
           'yendt@huyanhrubber.com'      -- Do Thi Yen - ngang quyen Phu (2026-06-01)
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
           'logistics@huyanhrubber.com',
           'yendt@huyanhrubber.com'
         )
    )
  );

-- ─── Reload PostgREST schema cache ───
NOTIFY pgrst, 'reload schema';

-- ─── Verify ───
-- (a) Policy đã chứa yendt@?
SELECT polname AS policy_name,
       polcmd AS cmd,
       pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'sales_order_contracts'::regclass
  AND polname = 'soc_update_allowed_reviewer';

-- (b) Tài khoản Yến phải có trong employees + đã link auth (user_id NOT NULL).
--     Nếu user_id NULL → Yến chưa từng đăng nhập / chưa map auth → RLS sẽ KHÔNG
--     nhận diện. Phải tạo/đăng nhập tài khoản auth cho email này trước.
SELECT id, full_name, email, user_id,
       CASE WHEN user_id IS NULL THEN '⚠ CHƯA link auth — Yến phải đăng nhập 1 lần'
            ELSE '✓ đã link' END AS auth_status
FROM employees
WHERE LOWER(email) = 'yendt@huyanhrubber.com';
