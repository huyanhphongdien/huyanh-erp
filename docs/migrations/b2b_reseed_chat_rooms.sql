-- ============================================================================
-- RE-SEED: Tạo lại chat_rooms cho mỗi partner active sau khi reset
-- Ngày: 2026-04-19
-- Context: Sau khi chạy b2b_reset_chat_history.sql, b2b.chat_rooms bị xóa
--          → trang Chat Đại Lý của ERP trống (không có đại lý nào).
--          Nút "Tạo cuộc trò chuyện" trong UI hiện là TODO (chưa implement).
-- ============================================================================

-- ============================================
-- BƯỚC 1 — Xem columns thực tế của b2b.chat_rooms
-- ============================================
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'chat_rooms'
ORDER BY ordinal_position;

-- ============================================
-- BƯỚC 2 — Xem partners đang active
-- ============================================
SELECT id, code, name, status
FROM b2b.partners
WHERE status = 'verified'
ORDER BY name;

-- ============================================
-- BƯỚC 3 — Tạo chat_room cho mỗi partner verified
-- Mỗi room: type='deal' (room chốt deal), status='active'
-- Dùng INSERT ... ON CONFLICT DO NOTHING để idempotent
-- ============================================
INSERT INTO b2b.chat_rooms (
  partner_id,
  room_name,
  room_type,
  status,
  last_message_at,
  created_at
)
SELECT
  p.id AS partner_id,
  p.name AS room_name,
  'deal' AS room_type,
  'active' AS status,
  now() AS last_message_at,
  now() AS created_at
FROM b2b.partners p
WHERE p.status = 'verified'
  AND NOT EXISTS (
    SELECT 1 FROM b2b.chat_rooms r WHERE r.partner_id = p.id
  );

-- ============================================
-- BƯỚC 4 — Verify
-- ============================================
SELECT
  r.id AS room_id,
  r.room_name,
  r.room_type,
  r.status,
  p.code AS partner_code,
  p.name AS partner_name
FROM b2b.chat_rooms r
JOIN b2b.partners p ON p.id = r.partner_id
ORDER BY p.name
LIMIT 30;

-- ============================================
-- HOÀN TẤT
-- F5 trang /b2b/chat ở ERP → danh sách đại lý sẽ hiện đủ
-- ============================================
