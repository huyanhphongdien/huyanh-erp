-- ============================================================
-- SALES CONTRACT WORKFLOW — V21: Hồ Thị Liễu (sales@) toàn quyền Đơn hàng bán
-- Ngày: 2026-10-29
-- Phụ thuộc:
--   - v3_signers + v16_signer_minhld + v17_add_minhanh (signer policy)
--   - sales_contract_files_multi_v4 (RLS DELETE sales_order_documents)
--   - v20_accounting_reviewers (reviewer policy — sales@ ĐÃ có từ v11, không đổi)
--
-- Mục đích: Cho sales@huyanhrubber.com (Hồ Thị Liễu) toàn quyền module
-- Đơn hàng bán — tương đương logistics@ (Trần Thị Minh Anh, v17):
--   role admin (đã có 2026-06-02) + kiểm tra HĐ (đã có v11) + KÝ HĐ + XÓA file HĐ.
--
-- Sync code (đã sửa cùng lúc):
--   - src/services/sales/salesPermissionService.ts: BOD_EMAILS (+ sales@)
--   - src/config/sales.config.ts: SIGNER_EMAILS + DELETE_PERMISSION_EMAILS (+ sales@)
-- ============================================================

-- ─── 1. Signer policy: thêm sales@ (giữ nguyên 4 email cũ của v17) ───
DROP POLICY IF EXISTS soc_update_allowed_signer ON sales_order_contracts;

CREATE POLICY soc_update_allowed_signer ON sales_order_contracts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND lower(e.email) IN (
           'trunglxh@huyanhrubber.com',  -- Mr. Trung
           'huylv@huyanhrubber.com',     -- Mr. Huy
           'minhld@huyanhrubber.com',    -- Minh LD (2026-05-21)
           'logistics@huyanhrubber.com', -- Tran Thi Minh Anh - toan quyen (2026-05-22)
           'sales@huyanhrubber.com'      -- Ho Thi Lieu - toan quyen (2026-10-29)
         )
    )
    AND status IN ('approved','signed')
  );

-- ─── 2. RLS DELETE file HĐ (sales_order_documents): thêm sales@ ───
-- Giữ nguyên 4 email của v4 + sales@. LƯU Ý: logistics@ nằm trong
-- DELETE_PERMISSION_EMAILS (code, 2026-05-22) nhưng CHƯA từng được thêm vào
-- policy này — nếu muốn đồng bộ thì bỏ comment dòng logistics@ bên dưới.
DROP POLICY IF EXISTS sod_delete_admin_only ON sales_order_documents;

CREATE POLICY sod_delete_admin_only ON sales_order_documents
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND lower(e.email) IN (
           'minhld@huyanhrubber.com',    -- Minh LD (Admin)
           'thuyht@huyanhrubber.com',    -- Thuy HT (Admin)
           'huylv@huyanhrubber.com',     -- Mr. Huy (Admin + BOD)
           'trunglxh@huyanhrubber.com',  -- Mr. Trung (BOD)
           -- 'logistics@huyanhrubber.com', -- Tran Thi Minh Anh (chua sync, xem ghi chu tren)
           'sales@huyanhrubber.com'      -- Ho Thi Lieu - toan quyen (2026-10-29)
         )
    )
  );

-- ─── 3. Storage bucket 'sales-contracts' ───
-- Nếu đã tạo policy DELETE cho bucket sales-contracts theo hướng dẫn ở
-- sales_contract_files_multi_v4.sql (Storage > Policies UI), thêm
-- 'sales@huyanhrubber.com' vào cùng điều kiện lower(e.email) IN (...).

-- ─── 4. Reload PostgREST schema cache ───
NOTIFY pgrst, 'reload schema';

-- ─── 5. Verify ───
-- (a) Tài khoản sales@ phải có employees.email đúng + đã link auth (user_id NOT NULL),
--     nếu không RLS không nhận diện được.
SELECT e.code, e.full_name, e.email, e.user_id,
       CASE WHEN e.user_id IS NULL THEN '⚠ CHƯA link auth — phải đăng nhập 1 lần'
            WHEN e.email IS NULL     THEN '⚠ THIẾU email'
            ELSE '✓ OK' END AS status
FROM employees e
WHERE LOWER(e.email) = 'sales@huyanhrubber.com'
   OR e.user_id IN (SELECT id FROM auth.users WHERE LOWER(email) = 'sales@huyanhrubber.com');

-- (b) 2 policy đã chứa sales@?
SELECT polrelid::regclass AS table_name, polname AS policy_name, polcmd AS cmd,
       pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE (polrelid = 'sales_order_contracts'::regclass AND polname = 'soc_update_allowed_signer')
   OR (polrelid = 'sales_order_documents'::regclass AND polname = 'sod_delete_admin_only')
ORDER BY 1, 2;
