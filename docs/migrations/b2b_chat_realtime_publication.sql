-- ============================================================================
-- B2B CHAT REALTIME FIX — COMPREHENSIVE (publication + replica + grants)
-- File: docs/migrations/b2b_chat_realtime_publication.sql
--
-- PROBLEM: chat messages từ Partner Portal không hiển thị realtime trên ERP
--          — user phải F5 mới thấy tin nhắn mới.
--
-- INVESTIGATION:
--   [✓] Base tables là b2b.chat_messages / b2b.chat_rooms (public.* là view)
--   [✓] 2 base tables ĐÃ trong publication supabase_realtime
--   [✓] RLS + grants cho anon OK (REST query trả về data)
--   [✗] REPLICA IDENTITY chưa set → một số case UPDATE/DELETE payload
--       thiếu row cũ, INSERT có thể không broadcast qua realtime v2
--   [?] supabase_realtime_admin role có SELECT trên b2b schema không?
--
-- FIX (idempotent, chạy nhiều lần OK):
--   1. REPLICA IDENTITY FULL cho cả 2 table
--   2. GRANT USAGE + SELECT cho authenticated, anon, supabase_realtime_admin
--   3. Đảm bảo table vẫn trong publication (wrap DO block bắt duplicate)
--   4. NOTIFY reload
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. REPLICA IDENTITY FULL — bắt buộc để realtime có đủ payload
-- ============================================================================
ALTER TABLE b2b.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE b2b.chat_rooms REPLICA IDENTITY FULL;

-- ============================================================================
-- 2. GRANTS — đảm bảo các role cần thiết truy cập được schema + table
-- ============================================================================
GRANT USAGE ON SCHEMA b2b TO anon, authenticated, service_role;
GRANT SELECT ON b2b.chat_messages TO anon, authenticated, service_role;
GRANT SELECT ON b2b.chat_rooms TO anon, authenticated, service_role;

-- Grant cho supabase_realtime_admin nếu role tồn tại (Supabase Cloud)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_realtime_admin') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA b2b TO supabase_realtime_admin';
    EXECUTE 'GRANT SELECT ON b2b.chat_messages TO supabase_realtime_admin';
    EXECUTE 'GRANT SELECT ON b2b.chat_rooms TO supabase_realtime_admin';
    RAISE NOTICE 'Granted realtime admin access to b2b chat tables';
  ELSE
    RAISE NOTICE 'supabase_realtime_admin role not found — skip';
  END IF;
END $$;

-- ============================================================================
-- 3. PUBLICATION — ensure 2 base tables are published (idempotent)
-- ============================================================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE b2b.chat_messages;
    RAISE NOTICE 'Added b2b.chat_messages to supabase_realtime';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'b2b.chat_messages already in supabase_realtime';
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE b2b.chat_rooms;
    RAISE NOTICE 'Added b2b.chat_rooms to supabase_realtime';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'b2b.chat_rooms already in supabase_realtime';
  END;
END $$;

-- ============================================================================
-- 4. RLS POLICIES — đảm bảo authenticated user có SELECT
--    Realtime sẽ filter event qua RLS trước khi push qua websocket.
--    Nếu policy hiện tại chặn, thêm policy permissive cho authenticated.
-- ============================================================================
DO $$
BEGIN
  -- chat_messages: permissive SELECT cho authenticated nếu chưa có
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'b2b' AND tablename = 'chat_messages'
      AND policyname = 'realtime_select_authenticated'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY realtime_select_authenticated ON b2b.chat_messages
        FOR SELECT TO authenticated, anon USING (true)
    $POL$;
    RAISE NOTICE 'Created permissive SELECT policy on b2b.chat_messages';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'b2b' AND tablename = 'chat_rooms'
      AND policyname = 'realtime_select_authenticated'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY realtime_select_authenticated ON b2b.chat_rooms
        FOR SELECT TO authenticated, anon USING (true)
    $POL$;
    RAISE NOTICE 'Created permissive SELECT policy on b2b.chat_rooms';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- RELOAD SCHEMA CACHE — PostgREST + Realtime pick up changes ngay
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY — check publication + replica + policies
-- ============================================================================
SELECT '== Publication ==' AS section;
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'b2b'
  AND tablename IN ('chat_messages', 'chat_rooms')
ORDER BY tablename;

SELECT '== Replica Identity ==' AS section;
SELECT relname,
       CASE relreplident
         WHEN 'd' THEN 'DEFAULT'
         WHEN 'n' THEN 'NOTHING'
         WHEN 'f' THEN 'FULL'
         WHEN 'i' THEN 'INDEX'
       END AS replica_identity
FROM pg_class
WHERE relnamespace = 'b2b'::regnamespace
  AND relname IN ('chat_messages', 'chat_rooms')
ORDER BY relname;

SELECT '== RLS Policies ==' AS section;
SELECT tablename, policyname, cmd, roles::text[]
FROM pg_policies
WHERE schemaname = 'b2b'
  AND tablename IN ('chat_messages', 'chat_rooms')
ORDER BY tablename, policyname;
