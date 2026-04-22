-- ============================================================================
-- FIX BUG: "Không thể tạo nhu cầu mua" 403 Forbidden
-- Date: 2026-04-22
-- Status: ✅ applied live production. Idempotent — chạy lại nhiều lần OK.
-- ============================================================================
-- Nguyên nhân:
--   Policy cũ "demands_manage_staff" chỉ cho service_role mutation.
--   Nhân viên factory login với authenticated JWT → INSERT reject 403.
--   Error: "new row violates row-level security policy for table b2b_demands"
--
-- Fix: Thêm policies cho authenticated user (nhân viên factory) INSERT/UPDATE/DELETE.
--      Giữ SELECT policy cũ cho authenticated. Giữ bypass cho service_role.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════
-- b2b_demands
-- ═══════════════════════════════════════════════════════════════

-- Drop over-restrictive policy ngăn authenticated mutation
DROP POLICY IF EXISTS demands_manage_staff ON public.b2b_demands;

-- Drop policies mới (idempotent khi re-run)
DROP POLICY IF EXISTS demands_service_role_all     ON public.b2b_demands;
DROP POLICY IF EXISTS demands_authenticated_insert ON public.b2b_demands;
DROP POLICY IF EXISTS demands_authenticated_update ON public.b2b_demands;
DROP POLICY IF EXISTS demands_authenticated_delete ON public.b2b_demands;

-- Re-create
CREATE POLICY demands_service_role_all
  ON public.b2b_demands FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY demands_authenticated_insert
  ON public.b2b_demands FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY demands_authenticated_update
  ON public.b2b_demands FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY demands_authenticated_delete
  ON public.b2b_demands FOR DELETE TO authenticated
  USING (true);

-- Policy SELECT cũ (demands_select_authenticated) giữ nguyên


-- ═══════════════════════════════════════════════════════════════
-- b2b_demand_offers (tương tự)
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS demand_offers_manage_staff           ON public.b2b_demand_offers;
DROP POLICY IF EXISTS demand_offers_service_role_all       ON public.b2b_demand_offers;
DROP POLICY IF EXISTS demand_offers_authenticated_insert   ON public.b2b_demand_offers;
DROP POLICY IF EXISTS demand_offers_authenticated_update   ON public.b2b_demand_offers;
DROP POLICY IF EXISTS demand_offers_authenticated_delete   ON public.b2b_demand_offers;

CREATE POLICY demand_offers_service_role_all
  ON public.b2b_demand_offers FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY demand_offers_authenticated_insert
  ON public.b2b_demand_offers FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY demand_offers_authenticated_update
  ON public.b2b_demand_offers FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY demand_offers_authenticated_delete
  ON public.b2b_demand_offers FOR DELETE TO authenticated
  USING (true);

NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════

SELECT tablename, policyname, cmd, roles::text
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('b2b_demands','b2b_demand_offers')
ORDER BY tablename, cmd, policyname;

-- Expected cho b2b_demands:
--   demands_service_role_all       ALL      {service_role}
--   demands_authenticated_delete   DELETE   {authenticated}
--   demands_authenticated_insert   INSERT   {authenticated}
--   demands_select_authenticated   SELECT   {public}  (policy cũ giữ nguyên)
--   demands_authenticated_update   UPDATE   {authenticated}
--
-- Expected cho b2b_demand_offers:
--   demand_offers_service_role_all       ALL      {service_role}
--   demand_offers_authenticated_delete   DELETE   {authenticated}
--   demand_offers_authenticated_insert   INSERT   {authenticated}
--   offers_insert_own                    INSERT   {public}  (policy cũ, giữ)
--   offers_select_own                    SELECT   {public}  (policy cũ, giữ)
--   demand_offers_authenticated_update   UPDATE   {authenticated}
--   offers_update_own                    UPDATE   {public}  (policy cũ, giữ)
