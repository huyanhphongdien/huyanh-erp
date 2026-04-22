-- ============================================================================
-- FIX BUG: "Không thể tạo nhu cầu mua" 403 Forbidden
-- Date: 2026-04-22
-- ============================================================================
-- Nguyên nhân:
--   Policy cũ "demands_manage_staff" chỉ cho service_role mutation.
--   Nhân viên factory login với authenticated JWT → INSERT reject 403.
--   Error: "new row violates row-level security policy for table b2b_demands"
--
-- Fix: Thêm policies cho authenticated user (nhân viên factory) INSERT/UPDATE/DELETE.
-- Factory người tạo demand, partner chỉ SELECT via SELECT policy có sẵn.
--
-- Ngoài ra: tương tự cho b2b_demand_offers (nếu cùng pattern).
-- ============================================================================

-- Drop over-restrictive policy ngăn authenticated mutation
DROP POLICY IF EXISTS demands_manage_staff ON public.b2b_demands;

-- Re-create service_role policy (giữ bypass)
CREATE POLICY demands_service_role_all
  ON public.b2b_demands
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated (factory staff) có thể tạo / sửa / xóa demand
CREATE POLICY demands_authenticated_insert
  ON public.b2b_demands
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY demands_authenticated_update
  ON public.b2b_demands
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY demands_authenticated_delete
  ON public.b2b_demands
  FOR DELETE TO authenticated
  USING (true);

-- Policy SELECT cũ (demands_select_authenticated) giữ nguyên — ai đã login đều xem được

-- ═══════════════════════════════════════════════════════════════
-- Áp dụng tương tự cho b2b_demand_offers (nếu tồn tại)
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS demand_offers_manage_staff ON public.b2b_demand_offers;

CREATE POLICY demand_offers_service_role_all
  ON public.b2b_demand_offers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY demand_offers_authenticated_insert
  ON public.b2b_demand_offers
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY demand_offers_authenticated_update
  ON public.b2b_demand_offers
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY demand_offers_authenticated_delete
  ON public.b2b_demand_offers
  FOR DELETE TO authenticated
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
-- Expected: mỗi table có 5 policy (1 SELECT + 4 CRUD cho authenticated + 1 ALL cho service_role)
