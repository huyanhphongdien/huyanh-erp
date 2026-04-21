-- ============================================================================
-- URGENT: B2B RLS policies — fix MASSIVE DATA LEAK (revised for base tables)
-- Date: 2026-04-21
-- ============================================================================
--
-- Architecture:
--   - Base tables ở schema b2b (b2b.partners, b2b.deals, b2b.chat_rooms,
--     b2b.chat_messages, b2b.notifications, b2b.drc_disputes, b2b.advances,
--     b2b.settlements, b2b.partner_ledger, b2b.partner_users)
--   - Views ở public (public.b2b_partners, b2b_deals, ...) expose qua PostgREST
--   - Direct tables: public.b2b_demands, public.b2b_demand_offers
--
-- PostgreSQL views mặc định chạy security DEFINER (view creator's rights) →
-- RLS underlying table không enforce. Phải ALTER VIEW ... SET security_invoker.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════
-- HELPER: current_partner_id()
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.current_partner_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, b2b
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'partner_id', '')::uuid,
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'partner_id', '')::uuid,
    (SELECT partner_id FROM b2b.partner_users
     WHERE auth_user_id = auth.uid() AND is_active = true
     LIMIT 1)
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_partner_id() TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- RLS trên base tables b2b.*
-- ═══════════════════════════════════════════════════════════════

-- b2b.partners
ALTER TABLE b2b.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b.partners FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partners_select_own" ON b2b.partners;
CREATE POLICY "partners_select_own" ON b2b.partners
  FOR SELECT
  USING (id = public.current_partner_id() OR auth.role() = 'service_role');

-- b2b.partner_users
ALTER TABLE b2b.partner_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b.partner_users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partner_users_select_own" ON b2b.partner_users;
CREATE POLICY "partner_users_select_own" ON b2b.partner_users
  FOR SELECT
  USING (
    partner_id = public.current_partner_id()
    OR auth_user_id = auth.uid()
    OR auth.role() = 'service_role'
  );

-- b2b.deals
ALTER TABLE b2b.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b.deals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deals_select_own" ON b2b.deals;
CREATE POLICY "deals_select_own" ON b2b.deals
  FOR SELECT
  USING (partner_id = public.current_partner_id() OR auth.role() = 'service_role');

-- b2b.chat_rooms
ALTER TABLE b2b.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b.chat_rooms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_rooms_select_own" ON b2b.chat_rooms;
CREATE POLICY "chat_rooms_select_own" ON b2b.chat_rooms
  FOR SELECT
  USING (partner_id = public.current_partner_id() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "chat_rooms_update_own" ON b2b.chat_rooms;
CREATE POLICY "chat_rooms_update_own" ON b2b.chat_rooms
  FOR UPDATE
  USING (partner_id = public.current_partner_id() OR auth.role() = 'service_role');

-- b2b.chat_messages
ALTER TABLE b2b.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b.chat_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chat_messages_select_own_room" ON b2b.chat_messages;
CREATE POLICY "chat_messages_select_own_room" ON b2b.chat_messages
  FOR SELECT
  USING (
    room_id IN (SELECT id FROM b2b.chat_rooms WHERE partner_id = public.current_partner_id())
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "chat_messages_insert_own_room" ON b2b.chat_messages;
CREATE POLICY "chat_messages_insert_own_room" ON b2b.chat_messages
  FOR INSERT
  WITH CHECK (
    room_id IN (SELECT id FROM b2b.chat_rooms WHERE partner_id = public.current_partner_id())
    OR auth.role() = 'service_role'
  );

-- b2b.notifications
ALTER TABLE b2b.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b.notifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifications_select_own" ON b2b.notifications;
CREATE POLICY "notifications_select_own" ON b2b.notifications
  FOR SELECT
  USING (
    (partner_id = public.current_partner_id() AND audience IN ('partner', 'both'))
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "notifications_update_own" ON b2b.notifications;
CREATE POLICY "notifications_update_own" ON b2b.notifications
  FOR UPDATE
  USING (partner_id = public.current_partner_id() OR auth.role() = 'service_role');

-- b2b.advances / settlements / drc_disputes / partner_ledger: đã có RLS (0 anon rows) — re-check
ALTER TABLE b2b.advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b.advances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "advances_select_own" ON b2b.advances;
CREATE POLICY "advances_select_own" ON b2b.advances
  FOR SELECT USING (partner_id = public.current_partner_id() OR auth.role() = 'service_role');

ALTER TABLE b2b.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b.settlements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settlements_select_own" ON b2b.settlements;
CREATE POLICY "settlements_select_own" ON b2b.settlements
  FOR SELECT USING (partner_id = public.current_partner_id() OR auth.role() = 'service_role');

ALTER TABLE b2b.drc_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b.drc_disputes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "disputes_select_own" ON b2b.drc_disputes;
CREATE POLICY "disputes_select_own" ON b2b.drc_disputes
  FOR SELECT USING (partner_id = public.current_partner_id() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "disputes_insert_own" ON b2b.drc_disputes;
CREATE POLICY "disputes_insert_own" ON b2b.drc_disputes
  FOR INSERT WITH CHECK (partner_id = public.current_partner_id() OR auth.role() = 'service_role');

ALTER TABLE b2b.partner_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b.partner_ledger FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ledger_select_own" ON b2b.partner_ledger;
CREATE POLICY "ledger_select_own" ON b2b.partner_ledger
  FOR SELECT USING (partner_id = public.current_partner_id() OR auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- RLS trên public tables (direct, không qua view)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.b2b_demands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_demands FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "demands_select_authenticated" ON public.b2b_demands;
CREATE POLICY "demands_select_authenticated" ON public.b2b_demands
  FOR SELECT
  USING (auth.role() IN ('authenticated', 'service_role'));

DROP POLICY IF EXISTS "demands_manage_staff" ON public.b2b_demands;
CREATE POLICY "demands_manage_staff" ON public.b2b_demands
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE public.b2b_demand_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_demand_offers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "offers_select_own" ON public.b2b_demand_offers;
CREATE POLICY "offers_select_own" ON public.b2b_demand_offers
  FOR SELECT USING (partner_id = public.current_partner_id() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "offers_insert_own" ON public.b2b_demand_offers;
CREATE POLICY "offers_insert_own" ON public.b2b_demand_offers
  FOR INSERT WITH CHECK (partner_id = public.current_partner_id() OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "offers_update_own" ON public.b2b_demand_offers;
CREATE POLICY "offers_update_own" ON public.b2b_demand_offers
  FOR UPDATE USING (partner_id = public.current_partner_id() OR auth.role() = 'service_role')
  WITH CHECK (partner_id = public.current_partner_id() OR auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- ALTER VIEW security_invoker — để RLS underlying table enforce qua view
-- (PostgreSQL 15+)
-- ═══════════════════════════════════════════════════════════════

ALTER VIEW public.b2b_partners           SET (security_invoker = true);
ALTER VIEW public.b2b_partner_users      SET (security_invoker = true);
ALTER VIEW public.b2b_deals              SET (security_invoker = true);
ALTER VIEW public.b2b_chat_rooms         SET (security_invoker = true);
ALTER VIEW public.b2b_chat_messages      SET (security_invoker = true);
ALTER VIEW public.b2b_notifications      SET (security_invoker = true);
ALTER VIEW public.b2b_advances           SET (security_invoker = true);
ALTER VIEW public.b2b_settlements        SET (security_invoker = true);
ALTER VIEW public.b2b_drc_disputes       SET (security_invoker = true);
ALTER VIEW public.b2b_partner_ledger     SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════

-- RLS enabled
SELECT schemaname, tablename, rowsecurity AS rls
FROM pg_tables
WHERE (schemaname = 'b2b' AND tablename IN (
    'partners','partner_users','deals','chat_rooms','chat_messages',
    'notifications','advances','settlements','drc_disputes','partner_ledger'))
   OR (schemaname = 'public' AND tablename IN ('b2b_demands','b2b_demand_offers'))
ORDER BY schemaname, tablename;
-- Expected: tất cả rls = true

-- Views security_invoker
SELECT relname, reloptions
FROM pg_class
WHERE relkind = 'v' AND relnamespace = 'public'::regnamespace
  AND relname LIKE 'b2b_%'
ORDER BY relname;
-- Expected: reloptions chứa 'security_invoker=true'

-- Policies count
SELECT schemaname, tablename, COUNT(*) AS policy_count
FROM pg_policies
WHERE (schemaname = 'b2b') OR (schemaname = 'public' AND tablename LIKE 'b2b_%')
GROUP BY schemaname, tablename
ORDER BY schemaname, tablename;
