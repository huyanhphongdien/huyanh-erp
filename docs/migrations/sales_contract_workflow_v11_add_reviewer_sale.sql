-- ============================================================
-- SALES CONTRACT WORKFLOW — V11: Add sales@ vào reviewer queue
-- Ngày: 2026-05-17
-- Phụ thuộc:
--   - sales_contract_workflow_v2_reviewers.sql (V2 — RLS reviewer)
--
-- Mục đích:
--   Tổ chức re-org: Sale (Hồ Thị Liễu) chuyển từ "tạo HĐ" sang "Kiểm tra HĐ"
--   cùng Phú LV + Minh LD. 2 người Logistics (Anhlp + Nhung) đảm nhận tạo HĐ
--   (role 'logistics' đã có canCreateOrder=true, không cần đổi).
--
-- Update:
--   - RLS policy `soc_update_allowed_reviewer` — thêm sales@ vào whitelist
--   - Tất cả nơi check ALLOWED_REVIEWER_EMAILS trong code đã sync (config + Sidebar)
--   - Default reviewer vẫn là phulv@ (KT-led)
-- ============================================================

-- ── Step 1: Drop policy cũ + recreate với 3 emails ──
DROP POLICY IF EXISTS "soc_update_allowed_reviewer" ON sales_order_contracts;

CREATE POLICY "soc_update_allowed_reviewer" ON sales_order_contracts
  FOR UPDATE
  USING (
    -- Reviewer queue — cho phép Phú LV / Minh LD / Hồ Thị Liễu (Sale → Kiểm tra)
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND LOWER(e.email) IN (
           'phulv@huyanhrubber.com',
           'minhld@huyanhrubber.com',
           'sales@huyanhrubber.com'
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
           'sales@huyanhrubber.com'
         )
    )
  );

-- ── Step 2: Verify policies trên sales_order_contracts ──
SELECT
  polname AS policy_name,
  polcmd AS command_type,
  pg_get_expr(polqual, polrelid) AS using_expression
FROM pg_policy
WHERE polrelid = 'sales_order_contracts'::regclass
  AND polname LIKE '%reviewer%'
ORDER BY polname;

-- ── Step 3: Verify employee accounts của 3 reviewers tồn tại ──
SELECT
  email,
  full_name,
  CASE WHEN user_id IS NOT NULL THEN '✓ Có auth account'
       ELSE '✗ Chưa có auth account — cần invite'
  END AS auth_status
FROM employees
WHERE LOWER(email) IN (
  'phulv@huyanhrubber.com',
  'minhld@huyanhrubber.com',
  'sales@huyanhrubber.com',
  'anhlp@huyanhrubber.com',  -- mới chuyển sang làm HĐ
  'nhungtt@huyanhrubber.com' -- mới chuyển sang làm HĐ
)
ORDER BY email;

-- ── Step 4: Reload PostgREST schema cache ──
NOTIFY pgrst, 'reload schema';
