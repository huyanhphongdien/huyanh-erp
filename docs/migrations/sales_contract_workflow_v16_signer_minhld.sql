-- ============================================================
-- SALES CONTRACT WORKFLOW — V16: Thêm Minh LD vào allowed signers
-- Ngày: 2026-05-21
-- Phụ thuộc: v3_signers
--
-- Mục đích: Cho minhld@huyanhrubber.com test bước trình ký
-- (cùng Trung/Huy). RLS policy soc_update_allowed_signer mở
-- thêm cho Minh LD.
--
-- KHI ROLLBACK (sau khi test xong): xóa minhld khỏi IN (...)
-- và sync ngược src/config/sales.config.ts SIGNER_EMAILS.
-- ============================================================

DROP POLICY IF EXISTS soc_update_allowed_signer ON sales_order_contracts;
CREATE POLICY soc_update_allowed_signer ON sales_order_contracts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND lower(e.email) IN (
           'trunglxh@huyanhrubber.com',  -- Mr. Trung
           'huylv@huyanhrubber.com',     -- Mr. Huy
           'minhld@huyanhrubber.com'     -- Minh LD — thêm để test (2026-05-21)
         )
    )
    AND status IN ('approved','signed')
  );

-- Verify
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'sales_order_contracts'
  AND policyname = 'soc_update_allowed_signer';
