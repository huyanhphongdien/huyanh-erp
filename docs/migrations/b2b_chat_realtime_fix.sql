-- ============================================================================
-- B2B CHAT REALTIME FIX — Đảm bảo realtime hoạt động (idempotent)
-- File: docs/migrations/b2b_chat_realtime_fix.sql
-- Date: 2026-05-28
-- ============================================================================
--
-- TRIỆU CHỨNG: Đại lý gửi tin (đã LƯU được — tự thấy tin mình), nhưng nhà máy
-- KHÔNG nhận realtime. UI nhà máy hiện "Đang kết nối lại..." (CHANNEL_ERROR),
-- console portal báo 503 trên realtime endpoint.
--
-- NGUYÊN NHÂN: b2b.chat_messages / b2b.chat_rooms chưa nằm trong publication
-- supabase_realtime → postgres_changes không fire. (Hoặc thiếu REPLICA IDENTITY
-- FULL khi subscribe có filter room_id; hoặc RLS chặn SELECT khiến realtime
-- không gửi payload.)
--
-- FIX (idempotent — chạy lại an toàn dù đã cấu hình trước):
--   1. Thêm 2 bảng vào publication supabase_realtime (chỉ thêm nếu chưa có)
--   2. REPLICA IDENTITY FULL (cần cho filter room_id + payload UPDATE/DELETE)
--   3. RLS: bật + policy SELECT/write cho authenticated + anon (partner anon key)
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PHẦN A — CHẨN ĐOÁN (chạy trước để xem trạng thái hiện tại)                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- A1. 2 bảng đã ở trong publication realtime chưa?
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'b2b'
  AND tablename IN ('chat_messages', 'chat_rooms');

-- A2. REPLICA IDENTITY hiện tại (f = FULL, d = default/PK)
SELECT c.relname,
       CASE c.relreplident WHEN 'f' THEN 'FULL' WHEN 'd' THEN 'DEFAULT(pk)'
            WHEN 'n' THEN 'NOTHING' WHEN 'i' THEN 'INDEX' END AS replica_identity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'b2b' AND c.relname IN ('chat_messages', 'chat_rooms');

-- A3. RLS policies hiện có
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'b2b' AND tablename IN ('chat_messages', 'chat_rooms')
ORDER BY tablename, policyname;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PHẦN B — FIX (chạy sau khi xem PHẦN A)                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- 1) Thêm vào publication realtime (chỉ thêm nếu CHƯA có → tránh lỗi "already member")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='b2b' AND tablename='chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE b2b.chat_messages;
    RAISE NOTICE 'Added b2b.chat_messages to supabase_realtime';
  ELSE
    RAISE NOTICE 'b2b.chat_messages already in publication';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='b2b' AND tablename='chat_rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE b2b.chat_rooms;
    RAISE NOTICE 'Added b2b.chat_rooms to supabase_realtime';
  ELSE
    RAISE NOTICE 'b2b.chat_rooms already in publication';
  END IF;
END $$;

-- 2) REPLICA IDENTITY FULL (cần cho subscribe filter room_id + payload đầy đủ)
ALTER TABLE b2b.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE b2b.chat_rooms    REPLICA IDENTITY FULL;

-- 3) RLS: bật + policy SELECT/write cho authenticated (nhà máy) + anon (đại lý)
ALTER TABLE b2b.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b.chat_rooms    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_messages_select_all ON b2b.chat_messages;
CREATE POLICY chat_messages_select_all ON b2b.chat_messages
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS chat_rooms_select_all ON b2b.chat_rooms;   -- (bản cũ ghi nhầm table)
CREATE POLICY chat_rooms_select_all ON b2b.chat_rooms
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS chat_messages_write_all ON b2b.chat_messages;
CREATE POLICY chat_messages_write_all ON b2b.chat_messages
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS chat_rooms_write_all ON b2b.chat_rooms;
CREATE POLICY chat_rooms_write_all ON b2b.chat_rooms
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

COMMIT;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ PHẦN C — VERIFY (chạy lại, mong đợi cả 2 bảng có mặt + FULL)               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname='b2b'
  AND tablename IN ('chat_messages', 'chat_rooms');
