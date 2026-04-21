-- ============================================================================
-- URGENT: B2B RLS policies — fix MASSIVE DATA LEAK
-- Date: 2026-04-21
-- Severity: CRITICAL — anon key query trả hết mọi partner's data
-- ============================================================================
--
-- Phát hiện:
--   8/12 B2B tables hoàn toàn public với anon key (anyone có portal URL có thể
--   read ALL deals, partners, users, chat messages, demands, offers).
--
-- Root cause:
--   RLS disabled HOẶC policy SELECT USING (true) HOẶC thiếu policy.
--
-- Fix: Enable RLS + policy "partner = self OR auth.role() = 'service_role'"
--      Factory/admin user cần JWT claim role=service_role để bypass.
--      Portal partner user có JWT với partner_id claim.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════
-- HELPER: current_partner_id() — lấy partner_id từ JWT claim
-- ═══════════════════════════════════════════════════════════════
-- Nếu chưa có, tạo. JWT claim `partner_id` được set khi partner login qua
-- Supabase Auth với custom claim hoặc trigger signup.

CREATE OR REPLACE FUNCTION public.current_partner_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'partner_id', '')::uuid,
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->'user_metadata'->>'partner_id', '')::uuid,
    (SELECT partner_id FROM b2b_partner_users
     WHERE auth_user_id = auth.uid() AND is_active = true
     LIMIT 1)
  );
$$;

COMMENT ON FUNCTION public.current_partner_id() IS
  'Lấy partner_id của user đang đăng nhập từ JWT claim hoặc lookup b2b_partner_users';

GRANT EXECUTE ON FUNCTION public.current_partner_id() TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- b2b_partners — partner chỉ thấy partner mình
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.b2b_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_partners FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_select_own" ON public.b2b_partners;
CREATE POLICY "partner_select_own" ON public.b2b_partners
  FOR SELECT
  USING (
    id = public.current_partner_id()
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "partner_update_own" ON public.b2b_partners;
CREATE POLICY "partner_update_own" ON public.b2b_partners
  FOR UPDATE
  USING (id = public.current_partner_id() OR auth.role() = 'service_role')
  WITH CHECK (id = public.current_partner_id() OR auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- b2b_partner_users — mỗi partner chỉ thấy users của partner mình
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.b2b_partner_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_partner_users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "partner_users_select_own" ON public.b2b_partner_users;
CREATE POLICY "partner_users_select_own" ON public.b2b_partner_users
  FOR SELECT
  USING (
    partner_id = public.current_partner_id()
    OR auth_user_id = auth.uid()
    OR auth.role() = 'service_role'
  );

-- ═══════════════════════════════════════════════════════════════
-- b2b_deals — partner chỉ thấy deals mình
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.b2b_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_deals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deals_select_own" ON public.b2b_deals;
CREATE POLICY "deals_select_own" ON public.b2b_deals
  FOR SELECT
  USING (
    partner_id = public.current_partner_id()
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "deals_insert_own" ON public.b2b_deals;
CREATE POLICY "deals_insert_own" ON public.b2b_deals
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "deals_update_own" ON public.b2b_deals;
CREATE POLICY "deals_update_own" ON public.b2b_deals
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- b2b_chat_rooms + b2b_chat_messages — private to partner
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.b2b_chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_chat_rooms FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_rooms_select_own" ON public.b2b_chat_rooms;
CREATE POLICY "chat_rooms_select_own" ON public.b2b_chat_rooms
  FOR SELECT
  USING (
    partner_id = public.current_partner_id()
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "chat_rooms_update_own" ON public.b2b_chat_rooms;
CREATE POLICY "chat_rooms_update_own" ON public.b2b_chat_rooms
  FOR UPDATE
  USING (partner_id = public.current_partner_id() OR auth.role() = 'service_role');

ALTER TABLE public.b2b_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_chat_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_messages_select_own_room" ON public.b2b_chat_messages;
CREATE POLICY "chat_messages_select_own_room" ON public.b2b_chat_messages
  FOR SELECT
  USING (
    room_id IN (
      SELECT id FROM public.b2b_chat_rooms
      WHERE partner_id = public.current_partner_id()
    )
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "chat_messages_insert_own_room" ON public.b2b_chat_messages;
CREATE POLICY "chat_messages_insert_own_room" ON public.b2b_chat_messages
  FOR INSERT
  WITH CHECK (
    room_id IN (
      SELECT id FROM public.b2b_chat_rooms
      WHERE partner_id = public.current_partner_id()
    )
    OR auth.role() = 'service_role'
  );

-- ═══════════════════════════════════════════════════════════════
-- b2b_notifications
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.b2b_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_notifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.b2b_notifications;
CREATE POLICY "notifications_select_own" ON public.b2b_notifications
  FOR SELECT
  USING (
    (partner_id = public.current_partner_id() AND audience IN ('partner', 'both'))
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "notifications_update_own" ON public.b2b_notifications;
CREATE POLICY "notifications_update_own" ON public.b2b_notifications
  FOR UPDATE
  USING (partner_id = public.current_partner_id() OR auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- b2b_demands — public readable (tất cả partners thấy nhu cầu đang open)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.b2b_demands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_demands FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "demands_select_authenticated" ON public.b2b_demands;
CREATE POLICY "demands_select_authenticated" ON public.b2b_demands
  FOR SELECT
  USING (
    status IN ('published', 'closed', 'filled')
    AND (auth.role() IN ('authenticated', 'service_role'))
  );
-- Anon không được query demands

DROP POLICY IF EXISTS "demands_manage_staff" ON public.b2b_demands;
CREATE POLICY "demands_manage_staff" ON public.b2b_demands
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- b2b_demand_offers — partner chỉ thấy offers mình
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.b2b_demand_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_demand_offers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offers_select_own" ON public.b2b_demand_offers;
CREATE POLICY "offers_select_own" ON public.b2b_demand_offers
  FOR SELECT
  USING (
    partner_id = public.current_partner_id()
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "offers_insert_own" ON public.b2b_demand_offers;
CREATE POLICY "offers_insert_own" ON public.b2b_demand_offers
  FOR INSERT
  WITH CHECK (
    partner_id = public.current_partner_id()
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "offers_update_own" ON public.b2b_demand_offers;
CREATE POLICY "offers_update_own" ON public.b2b_demand_offers
  FOR UPDATE
  USING (partner_id = public.current_partner_id() OR auth.role() = 'service_role')
  WITH CHECK (partner_id = public.current_partner_id() OR auth.role() = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- Grants — Anon KHÔNG được SELECT sensitive tables
-- ═══════════════════════════════════════════════════════════════

REVOKE ALL ON public.b2b_deals FROM anon;
REVOKE ALL ON public.b2b_partner_users FROM anon;
REVOKE ALL ON public.b2b_chat_rooms FROM anon;
REVOKE ALL ON public.b2b_chat_messages FROM anon;
REVOKE ALL ON public.b2b_notifications FROM anon;
REVOKE ALL ON public.b2b_demand_offers FROM anon;

-- Partners: vẫn cho anon READ phần public (name, tier) để partner mới sign up thấy
-- → KHÔNG revoke hoàn toàn, chỉ RLS giới hạn select → dùng b2b_partners_public view

-- Notify PostgREST
NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFY — test anon query phải trả 0 rows tất cả sensitive tables
-- ═══════════════════════════════════════════════════════════════

-- Check RLS enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'b2b_partners', 'b2b_partner_users', 'b2b_deals', 'b2b_chat_rooms',
    'b2b_chat_messages', 'b2b_notifications', 'b2b_demands', 'b2b_demand_offers'
  )
ORDER BY tablename;
-- Expected: rowsecurity = true cho tất cả

-- List policies
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'b2b_%'
ORDER BY tablename, policyname;
