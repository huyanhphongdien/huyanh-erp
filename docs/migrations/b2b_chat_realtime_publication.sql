-- ============================================================================
-- B2B CHAT REALTIME PUBLICATION FIX
-- File: docs/migrations/b2b_chat_realtime_publication.sql
--
-- PROBLEM: chat messages từ Partner Portal không hiển thị realtime trên ERP
--          — user phải F5 mới thấy tin nhắn mới.
--
-- ROOT CAUSE:
--   1. Subscription code trong ERP dùng `schema: 'b2b', table: 'chat_messages'`
--      nhưng canonical table là `public.b2b_chat_messages` (Portal insert
--      thẳng vào đây, Sidebar unread count cũng đọc từ đây).
--   2. Không có migration nào từng ADD TABLE public.b2b_chat_messages vào
--      publication supabase_realtime → dù fix schema thì Postgres cũng
--      không broadcast changes vì table chưa được publish.
--
-- FIX:
--   - Code: đổi subscription sang schema:'public', table:'b2b_chat_messages'
--   - Migration (file này): add public.b2b_chat_messages và
--     public.b2b_chat_rooms vào supabase_realtime publication.
--
-- IDEMPOTENT: dùng DO block với exception handling để có thể chạy nhiều lần.
-- ============================================================================

BEGIN;

-- Add b2b_chat_messages vào publication realtime (idempotent)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.b2b_chat_messages;
    RAISE NOTICE 'Added public.b2b_chat_messages to supabase_realtime';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'public.b2b_chat_messages already in supabase_realtime — skipped';
  END;
END $$;

-- Add b2b_chat_rooms vào publication realtime (idempotent)
-- Cần cho subscribeToRooms() — realtime khi có room mới hoặc last_message update
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.b2b_chat_rooms;
    RAISE NOTICE 'Added public.b2b_chat_rooms to supabase_realtime';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'public.b2b_chat_rooms already in supabase_realtime — skipped';
  END;
END $$;

-- Đảm bảo RLS SELECT policy cho phép realtime broadcast event đến user
-- authenticated (cả ERP factory user và Portal partner user). Nếu SELECT
-- policy quá chặt, realtime sẽ filter out event trước khi gửi qua websocket.
-- Các policy hiện có thường là 'true' cho authenticated, giữ nguyên.

COMMIT;

-- ============================================================================
-- VERIFY — list all tables in supabase_realtime publication
-- ============================================================================
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND (tablename LIKE 'b2b_chat%' OR schemaname = 'b2b')
ORDER BY schemaname, tablename;

-- Reload schema cache để PostgREST và Realtime nhận table mới ngay
NOTIFY pgrst, 'reload schema';
