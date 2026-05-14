-- ============================================================
-- SALES CONTRACT WORKFLOW — V3: Allowed signers (Trung + Huy)
-- Ngày: 2026-05-14
-- Phụ thuộc: sales_contract_workflow.sql (V1) + v2_reviewers (V2)
--
-- Mục đích: Cho phép Trung (trunglxh@) + Huy (huylv@) update
-- sales_order_contracts khi status='approved' → 'signed'.
--
-- Cách làm: thêm policy soc_update_allowed_signer bên cạnh
-- soc_update_actors + soc_update_allowed_reviewer.
-- ============================================================

DROP POLICY IF EXISTS soc_update_allowed_signer ON sales_order_contracts;
CREATE POLICY soc_update_allowed_signer ON sales_order_contracts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND lower(e.email) IN (
           'trunglxh@huyanhrubber.com',  -- Mr. Trung
           'huylv@huyanhrubber.com'      -- Mr. Huy
         )
    )
    -- Trung/Huy chỉ ký khi đã duyệt; signed có thể archive sau
    AND status IN ('approved','signed')
  );

-- Verify
SELECT policyname, cmd FROM pg_policies
WHERE tablename = 'sales_order_contracts'
ORDER BY policyname;
