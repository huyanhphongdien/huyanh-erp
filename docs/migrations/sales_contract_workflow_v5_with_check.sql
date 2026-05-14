-- ============================================================
-- SALES CONTRACT WORKFLOW — V5: Thêm WITH CHECK cho RLS UPDATE
-- Ngày: 2026-05-14
-- Phụ thuộc: V1 + V2 + V3
--
-- Mục đích: Đóng gap audit V1/V2/V3 — các policy UPDATE chỉ có USING,
-- KHÔNG có WITH CHECK. PostgreSQL semantics:
--   USING     → quyết định row nào được SEE để update
--   WITH CHECK → validate row SAU update có còn match policy không
-- Thiếu WITH CHECK = user có quyền update có thể đổi row thành dạng
-- mà policy KHÔNG cho phép (vd: gán reviewer_id sang người khác để
-- bypass quyền). Trigger fn_soc_status_guard vẫn chặn state transition,
-- nhưng các cột khác như reviewer_id, signer_id thì không.
-- ============================================================

-- 1. soc_update_actors — actor (created_by / reviewer_id / signer_id)
DROP POLICY IF EXISTS soc_update_actors ON sales_order_contracts;
CREATE POLICY soc_update_actors ON sales_order_contracts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND e.id IN (created_by, reviewer_id, signer_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND e.id IN (created_by, reviewer_id, signer_id)
    )
  );

-- 2. soc_update_allowed_reviewer (V2)
DROP POLICY IF EXISTS soc_update_allowed_reviewer ON sales_order_contracts;
CREATE POLICY soc_update_allowed_reviewer ON sales_order_contracts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND lower(e.email) IN (
           'phulv@huyanhrubber.com',
           'minhld@huyanhrubber.com'
         )
    )
    AND status IN ('reviewing','approved')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND lower(e.email) IN (
           'phulv@huyanhrubber.com',
           'minhld@huyanhrubber.com'
         )
    )
    -- WITH CHECK cho phép kết quả là approved, rejected, drafting (Sale rút lại),
    -- reviewing (giữ nguyên). KHÔNG cho phép reviewer set 'signed' / 'archived'.
    AND status IN ('reviewing','approved','rejected','drafting')
  );

-- 3. soc_update_allowed_signer (V3)
DROP POLICY IF EXISTS soc_update_allowed_signer ON sales_order_contracts;
CREATE POLICY soc_update_allowed_signer ON sales_order_contracts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND lower(e.email) IN (
           'trunglxh@huyanhrubber.com',
           'huylv@huyanhrubber.com'
         )
    )
    AND status IN ('approved','signed')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND lower(e.email) IN (
           'trunglxh@huyanhrubber.com',
           'huylv@huyanhrubber.com'
         )
    )
    -- Trung/Huy chỉ được set status thành signed hoặc archived
    AND status IN ('approved','signed','archived')
  );

-- 4. Verify
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'sales_order_contracts'
ORDER BY policyname;
