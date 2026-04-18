-- ============================================================================
-- B2B VIEWS — bật security_invoker=true để respect RLS base table
-- File: docs/migrations/b2b_views_security_invoker.sql
-- Ngày: 2026-04-18
--
-- VẤN ĐỀ:
--   PostgreSQL views mặc định chạy với quyền view OWNER (postgres), bypass RLS
--   của base table. → partner query public.b2b_deals thấy ALL rows dù
--   RLS của b2b.deals scope partner đúng.
--
-- FIX:
--   ALTER VIEW ... SET (security_invoker = true) → view chạy với quyền
--   user gọi (authenticated/anon) → RLS base table được honored.
--
-- ÁP DỤNG: tất cả view public.b2b_* wrap bảng trong schema b2b.
-- ============================================================================

BEGIN;

ALTER VIEW public.b2b_deals              SET (security_invoker = true);
ALTER VIEW public.b2b_advances           SET (security_invoker = true);
ALTER VIEW public.b2b_settlements        SET (security_invoker = true);
ALTER VIEW public.b2b_partner_ledger     SET (security_invoker = true);
ALTER VIEW public.b2b_chat_messages      SET (security_invoker = true);
ALTER VIEW public.b2b_chat_rooms         SET (security_invoker = true);
ALTER VIEW public.b2b_drc_disputes       SET (security_invoker = true);
ALTER VIEW public.b2b_partner_users      SET (security_invoker = true);
ALTER VIEW public.b2b_partners           SET (security_invoker = true);
ALTER VIEW public.b2b_pickup_locations   SET (security_invoker = true);
ALTER VIEW public.b2b_notifications      SET (security_invoker = true);
ALTER VIEW public.b2b_settlement_advances SET (security_invoker = true);
ALTER VIEW public.b2b_settlement_payments SET (security_invoker = true);

COMMIT;

-- Verify
SELECT table_name,
       (SELECT c.reloptions FROM pg_class c
        WHERE c.relname = table_name AND c.relnamespace = 'public'::regnamespace) AS options
FROM information_schema.views
WHERE table_schema='public' AND table_name LIKE 'b2b_%'
ORDER BY table_name;
