-- ============================================================================
-- CLEANUP — Drop các policy USING (true) pre-existing để partner scoping effective
-- File: docs/migrations/b2b_drop_permissive_legacy_policies.sql
-- Ngày: 2026-04-18
--
-- VẤN ĐỀ:
--   Sau khi chạy b2b_rls_partner_scope.sql, các policy scoping của partner
--   không effective vì còn có các policy legacy `USING (true)` cho phép tất cả.
--   RLS là OR của policies → 1 cái USING true là partner thấy hết.
--
-- SCOPE:
--   Chỉ drop policy `qual='true'` TRÊN các bảng core (deals, advances,
--   settlements, partner_ledger). KHÔNG động tới:
--     - Policy bypass service_role (cần giữ)
--     - Policy factory/employees (scoped đúng)
--     - Policy partner-scoped mới (mine)
--     - Các bảng phụ settlement_items, settlement_advances... (keep as-is, rủi ro thấp)
--
-- ROLLBACK nếu ERP break:
--   CREATE POLICY <name> ON b2b.<table> FOR ALL USING (true);
-- ============================================================================

BEGIN;

-- ========== b2b.deals ==========
DROP POLICY IF EXISTS deals_all ON b2b.deals;
DROP POLICY IF EXISTS partner_read_own_deals ON b2b.deals;

-- ========== b2b.advances ==========
DROP POLICY IF EXISTS "Allow all advances" ON b2b.advances;
DROP POLICY IF EXISTS advances_all ON b2b.advances;

-- ========== b2b.settlements ==========
DROP POLICY IF EXISTS "Allow all settlements" ON b2b.settlements;
DROP POLICY IF EXISTS settlements_select ON b2b.settlements;
DROP POLICY IF EXISTS settlements_update ON b2b.settlements;
DROP POLICY IF EXISTS settlements_insert ON b2b.settlements;

-- ========== b2b.partner_ledger ==========
DROP POLICY IF EXISTS "Allow all partner_ledger" ON b2b.partner_ledger;
DROP POLICY IF EXISTS partner_ledger_all ON b2b.partner_ledger;

COMMIT;

-- ============================================================================
-- VERIFY — liệt kê policy còn lại trên 4 bảng core
-- ============================================================================
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname='b2b'
  AND tablename IN ('deals','advances','settlements','partner_ledger')
ORDER BY tablename, policyname;
