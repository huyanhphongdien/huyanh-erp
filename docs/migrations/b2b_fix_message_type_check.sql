-- ============================================================================
-- FIX: b2b.chat_messages_message_type_check — thêm 'deal' vào allowed values
-- Ngày: 2026-04-19
-- Nguyên nhân: CHECK constraint cũ không cho phép message_type='deal' →
--              dealConfirmService INSERT DealCard bị reject silent (ERROR 23514)
--              → Deal tạo OK nhưng DealCard không xuất hiện trong chat.
-- ============================================================================

-- ============================================
-- BƯỚC 1 — Xem CHECK constraint hiện tại
-- ============================================
SELECT
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = 'b2b'
  AND rel.relname = 'chat_messages'
  AND con.contype = 'c';  -- check constraints only

-- ============================================
-- BƯỚC 2 — DROP constraint cũ + CREATE lại với allowed values mới
-- Các message_type cần support:
--   text, image, file, voice, system, quotation, booking, deal
-- ============================================
ALTER TABLE b2b.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;

ALTER TABLE b2b.chat_messages
  ADD CONSTRAINT chat_messages_message_type_check
  CHECK (message_type IN (
    'text',
    'image',
    'file',
    'voice',
    'system',
    'quotation',
    'booking',
    'deal'
  ));

-- ============================================
-- BƯỚC 3 — Verify constraint mới
-- ============================================
SELECT
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = 'b2b'
  AND rel.relname = 'chat_messages'
  AND con.conname = 'chat_messages_message_type_check';

-- ============================================
-- HOÀN TẤT
-- Sau khi chạy xong:
--   - Chạy lại BƯỚC 4 của b2b_recover_dealcard_2604.sql — INSERT sẽ pass
--   - Các lần chốt Deal mới trên ERP cũng sẽ tạo DealCard OK
-- ============================================
