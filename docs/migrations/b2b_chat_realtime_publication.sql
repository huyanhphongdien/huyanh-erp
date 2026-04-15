-- ============================================================================
-- B2B CHAT REALTIME PUBLICATION FIX
-- File: docs/migrations/b2b_chat_realtime_publication.sql
--
-- PROBLEM: chat messages từ Partner Portal không hiển thị realtime trên ERP
--          — user phải F5 mới thấy tin nhắn mới.
--
-- ROOT CAUSE:
--   - Base tables của chat là b2b.chat_messages và b2b.chat_rooms.
--   - public.b2b_chat_messages / public.b2b_chat_rooms chỉ là VIEW
--     (không thể add view vào publication — PG raise error 22023).
--   - Subscription code trong ERP đúng schema 'b2b' table 'chat_messages',
--     NHƯNG không có migration nào từng ADD TABLE vào publication
--     supabase_realtime → Postgres không broadcast changes → subscription
--     nhận 0 event → user phải F5.
--
-- FIX: add 2 base tables b2b.chat_messages và b2b.chat_rooms vào
--      publication supabase_realtime.
--
-- IDEMPOTENT: dùng DO block với exception handling để có thể chạy nhiều lần.
-- ============================================================================

BEGIN;

-- Add b2b.chat_messages vào publication realtime (idempotent)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE b2b.chat_messages;
    RAISE NOTICE 'Added b2b.chat_messages to supabase_realtime';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'b2b.chat_messages already in supabase_realtime — skipped';
  END;
END $$;

-- Add b2b.chat_rooms vào publication realtime (idempotent)
-- Cần cho subscribeToRooms() — realtime khi có room mới hoặc last_message update
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE b2b.chat_rooms;
    RAISE NOTICE 'Added b2b.chat_rooms to supabase_realtime';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'b2b.chat_rooms already in supabase_realtime — skipped';
  END;
END $$;

-- REPLICA IDENTITY: cần FULL để realtime có đủ column cũ cho UPDATE/DELETE
-- events (nếu không set, payload.old sẽ chỉ có primary key).
ALTER TABLE b2b.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE b2b.chat_rooms REPLICA IDENTITY FULL;

-- RLS SELECT policy phải cho phép authenticated user đọc — realtime sẽ
-- filter event qua RLS trước khi push qua websocket. Các policy hiện có
-- thường là 'true' cho authenticated, giữ nguyên.

COMMIT;

-- ============================================================================
-- VERIFY — list all chat-related tables in supabase_realtime publication
-- ============================================================================
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND (tablename LIKE 'chat%' OR tablename LIKE 'b2b_chat%')
ORDER BY schemaname, tablename;

-- Reload schema cache để PostgREST và Realtime nhận table mới ngay
NOTIFY pgrst, 'reload schema';
