-- ============================================================================
-- FIX — Pre-existing recursion trong policy b2b.partner_users
-- File: docs/migrations/b2b_fix_partner_users_recursion.sql
-- Ngày: 2026-04-18
--
-- BUG:
--   Policy `partners_view_own_users` ON b2b.partner_users đã viết:
--     USING (partner_id IN (SELECT partner_id FROM b2b.partner_users WHERE auth_user_id = auth.uid()))
--   → tự tham chiếu chính bảng partner_users → infinite recursion
--   → khi bất kỳ policy khác tham chiếu partner_users (vd partners_view_own_deals),
--     query ERP từ role authenticated bị error 42P17.
--
-- FIX:
--   Thay bằng policy dùng auth.uid() trực tiếp + current_partner_id() từ JWT claim.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS partners_view_own_users ON b2b.partner_users;

CREATE POLICY partners_view_own_users ON b2b.partner_users
  FOR SELECT TO authenticated
  USING (
    -- Self: mỗi user thấy row của chính họ (qua auth.uid())
    auth_user_id = auth.uid()
    -- Hoặc: partner claim từ JWT (org-wide view cho admin partner)
    OR partner_id = public.current_partner_id()
  );

COMMIT;

-- Verify không còn recursion
SELECT policyname, qual FROM pg_policies
WHERE schemaname='b2b' AND tablename='partner_users' AND policyname='partners_view_own_users';
