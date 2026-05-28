-- ============================================================================
-- B2B CHAT — Cho phép room_type = 'general' (constraint chat_rooms_room_type_check)
-- File: docs/migrations/b2b_chat_room_type_general.sql
-- Date: 2026-05-28
-- ============================================================================
--
-- LỖI: Tạo phòng chat per-NV (room_type='general') bị chặn:
--   new row for relation "chat_rooms" violates check constraint
--   "chat_rooms_room_type_check"
--
-- NGUYÊN NHÂN: CHECK constraint cũ không có 'general'. Trước đây phòng chat
-- đại lý do PORTAL tạo với room_type='demand'/'deal', nên 'general' chưa từng
-- được insert. ERP (per-NV chat) dùng 'general' → vi phạm constraint.
--
-- FIX: redefine constraint cho phép đủ 4 giá trị dùng ở cả 2 app:
--   'general' (ERP NV↔ĐL), 'deal' (theo deal), 'demand' (theo nhu cầu), 'support'.
--
-- An toàn: bảng b2b.chat_rooms đang RỖNG (sprint1_08 đã TRUNCATE) → DROP+ADD
-- constraint không có row nào vi phạm. Idempotent (DROP IF EXISTS).
-- ============================================================================

BEGIN;

ALTER TABLE b2b.chat_rooms DROP CONSTRAINT IF EXISTS chat_rooms_room_type_check;

ALTER TABLE b2b.chat_rooms
  ADD CONSTRAINT chat_rooms_room_type_check
  CHECK (room_type IN ('general', 'deal', 'demand', 'support'));

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFY
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(con.oid) INTO v_def
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='b2b' AND c.relname='chat_rooms'
    AND con.conname='chat_rooms_room_type_check';
  RAISE NOTICE '═══ chat_rooms_room_type_check ═══';
  RAISE NOTICE '  %', v_def;
END $$;

COMMIT;
