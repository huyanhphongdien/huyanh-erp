-- ============================================================================
-- B2B DEALS REALTIME — publish + REPLICA IDENTITY FULL
-- File: docs/migrations/b2b_deals_realtime.sql
-- Ngày: 2026-04-18 (sửa 2026-04-18: base table ở schema b2b, không phải public)
--
-- MỤC TIÊU:
--   Cho phép ERP + Portal đại lý subscribe UPDATE/INSERT event trên b2b.deals
--   để hiển thị toast notification global.
--
-- LƯU Ý:
--   public.b2b_deals là VIEW → supabase realtime listen schema b2b base table.
-- ============================================================================

BEGIN;

-- 1. REPLICA IDENTITY FULL — để UPDATE payload có đủ row cũ + mới
ALTER TABLE b2b.deals REPLICA IDENTITY FULL;

-- 2. Thêm vào publication supabase_realtime (idempotent)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE b2b.deals;
    RAISE NOTICE 'Added b2b.deals to supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'b2b.deals already in supabase_realtime';
  END;
END $$;

-- 3. GRANTS cho realtime roles (giống pattern chat_messages)
GRANT SELECT ON b2b.deals TO anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_realtime_admin') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA b2b TO supabase_realtime_admin';
    EXECUTE 'GRANT SELECT ON b2b.deals TO supabase_realtime_admin';
  END IF;
END $$;

COMMIT;

-- 4. Verify
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'deals' AND schemaname = 'b2b';

SELECT relname,
       CASE relreplident
         WHEN 'd' THEN 'DEFAULT'
         WHEN 'f' THEN 'FULL'
         ELSE 'OTHER'
       END AS replica_identity
FROM pg_class
WHERE relnamespace = 'b2b'::regnamespace
  AND relname = 'deals';

NOTIFY pgrst, 'reload schema';
