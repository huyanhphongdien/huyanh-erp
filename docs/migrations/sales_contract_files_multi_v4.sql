-- ============================================================
-- SALES CONTRACT FILES — V4: Multi-file + Delete permission
-- Ngày: 2026-05-14
-- Phụ thuộc: sales_contract_access_log.sql
--
-- Mục đích:
--   1. Cho phép action='delete' trong sales_contract_access_log (audit trail)
--   2. Thêm RLS DELETE policy cho sales_order_documents — chỉ admin (BGĐ
--      qua isBOD check ở app + admin role) được xóa
-- ============================================================

-- 1. Mở rộng CHECK constraint cho 'delete'
ALTER TABLE sales_contract_access_log
  DROP CONSTRAINT IF EXISTS sales_contract_access_log_action_check;
ALTER TABLE sales_contract_access_log
  ADD CONSTRAINT sales_contract_access_log_action_check
  CHECK (action IN ('upload', 'view', 'download', 'replace', 'delete'));

-- 2. RLS DELETE policy cho sales_order_documents
-- Cho phép delete khi user có email trong whitelist (admin + BGĐ + minhld)
ALTER TABLE sales_order_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sod_delete_admin_only ON sales_order_documents;
CREATE POLICY sod_delete_admin_only ON sales_order_documents
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND lower(e.email) IN (
           'minhld@huyanhrubber.com',  -- Minh LD (Admin)
           'thuyht@huyanhrubber.com',  -- Thúy HT (Admin)
           'huylv@huyanhrubber.com',   -- Mr. Huy (Admin + BOD)
           'trunglxh@huyanhrubber.com' -- Mr. Trung (BOD)
         )
    )
  );

-- 3. Storage bucket policy — cho phép admin xóa object trong sales-contracts/
-- (Chạy ở Supabase Dashboard nếu policy chưa có)
-- BEGIN;
-- INSERT INTO storage.policies (name, definition, bucket_id)
-- VALUES (
--   'admin_delete_sales_contracts',
--   $$EXISTS (SELECT 1 FROM employees e WHERE e.user_id = auth.uid()
--     AND lower(e.email) IN ('minhld@huyanhrubber.com', 'thuyht@huyanhrubber.com',
--                            'huylv@huyanhrubber.com', 'trunglxh@huyanhrubber.com'))$$,
--   'sales-contracts'
-- );
-- COMMIT;
-- (Hoặc dùng Storage > Policies UI để add DELETE policy với same condition)

-- 4. Verify
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'sales_order_documents'
ORDER BY policyname;

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'sales_contract_access_log'::regclass
  AND contype = 'c';
