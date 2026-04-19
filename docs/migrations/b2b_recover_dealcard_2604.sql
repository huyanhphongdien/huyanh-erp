-- ============================================================================
-- RECOVERY: Tạo DealCard message bị thiếu cho Deal DL2604-CVO4
-- Ngày: 2026-04-19
-- Nguyên nhân: bug "nuốt lỗi" trong dealConfirmService.ts (đã fix ở commit
--              2fb6775a), step 5 INSERT DealCard fail silent → Deal tạo
--              thành công nhưng DealCard message không có trong chat.
--
-- Script này:
--   1. Đọc lại Deal + Booking metadata từ DB
--   2. INSERT DealCard message với đầy đủ metadata cho DealCard UI render
--   3. Verify
-- ============================================================================

-- ============================================
-- BƯỚC 1 — Xem Deal hiện tại
-- ============================================
SELECT
  d.id AS deal_id,
  d.deal_number,
  d.status,
  d.partner_id,
  d.booking_id,
  d.quantity_kg,
  d.expected_drc,
  d.unit_price,
  d.price_unit,
  d.total_value_vnd,
  d.total_advanced,
  d.balance_due,
  d.pickup_location_name,
  d.rubber_type,
  d.lot_code,
  d.rubber_region
FROM b2b.deals d
WHERE d.deal_number = 'DL2604-CVO4';

-- ============================================
-- BƯỚC 2 — Xem room + booking message gốc
-- ============================================
SELECT
  m.id AS booking_msg_id,
  m.room_id,
  r.partner_id,
  m.metadata->'booking'->>'booking_code' AS booking_code,
  m.metadata->'booking'->>'status' AS booking_status,
  m.metadata->'booking'->>'deal_id' AS linked_deal_id,
  m.metadata->'booking'->>'deal_number' AS linked_deal_number,
  m.sent_at
FROM b2b.chat_messages m
JOIN b2b.chat_rooms r ON r.id = m.room_id
WHERE m.metadata->'booking'->>'booking_code' = 'BK260419-9JES'
ORDER BY m.sent_at DESC
LIMIT 1;

-- ============================================
-- BƯỚC 3 — Check xem đã có DealCard nào cho deal này chưa
-- (nếu có rồi thì ĐỪNG chạy BƯỚC 4, sẽ duplicate)
-- ============================================
SELECT id, message_type, content, sent_at
FROM b2b.chat_messages
WHERE message_type = 'deal'
  AND metadata->'deal'->>'deal_id' = (
    SELECT id::text FROM b2b.deals WHERE deal_number = 'DL2604-CVO4'
  );

-- ============================================
-- BƯỚC 4 — INSERT DealCard message
-- ⚠️ Chỉ chạy khi BƯỚC 3 trả về 0 rows
-- ============================================
INSERT INTO b2b.chat_messages (
  room_id,
  sender_type,
  sender_id,
  message_type,
  content,
  metadata,
  attachments,
  sent_at
)
SELECT
  (SELECT room_id FROM b2b.chat_messages WHERE metadata->'booking'->>'booking_code' = 'BK260419-9JES' ORDER BY sent_at DESC LIMIT 1) AS room_id,
  'factory' AS sender_type,
  -- sender_id: lấy 1 employee bất kỳ (admin/manager). Nếu muốn chính xác, thay bằng employee_id
  -- của người đã bấm "Xác nhận" ban đầu. Với recovery script dùng NULL cũng được vì chỉ để render UI.
  NULL::uuid AS sender_id,
  'deal' AS message_type,
  '🤝 Deal ' || d.deal_number || ' đã được tạo (recovered)' AS content,
  jsonb_build_object(
    'deal', jsonb_build_object(
      'deal_id',         d.id::text,
      'deal_number',     d.deal_number,
      'status',          d.status,
      'booking_code',    'BK260419-9JES',
      'product_type',    d.rubber_type,
      'quantity_kg',     d.quantity_kg,
      'expected_drc',    d.expected_drc,
      'agreed_price',    d.unit_price,
      'price_unit',      COALESCE(d.price_unit, 'wet'),
      'estimated_value', COALESCE(d.total_value_vnd, 0),
      'pickup_location', d.pickup_location_name,
      'lot_code',        d.lot_code,
      'rubber_region',   d.rubber_region,
      'total_advanced',  COALESCE(d.total_advanced, 0),
      'balance_due',     COALESCE(d.balance_due, COALESCE(d.total_value_vnd, 0))
    )
  ) AS metadata,
  '[]'::jsonb AS attachments,
  now() AS sent_at
FROM b2b.deals d
WHERE d.deal_number = 'DL2604-CVO4';

-- ============================================
-- BƯỚC 5 — Verify DealCard đã insert
-- ============================================
SELECT
  m.id,
  m.sent_at,
  m.message_type,
  m.content,
  m.metadata->'deal'->>'deal_number' AS deal_number,
  m.metadata->'deal'->>'status' AS deal_status,
  m.metadata->'deal'->>'quantity_kg' AS quantity_kg,
  m.metadata->'deal'->>'expected_drc' AS expected_drc
FROM b2b.chat_messages m
WHERE m.metadata->'deal'->>'deal_id' = (
  SELECT id::text FROM b2b.deals WHERE deal_number = 'DL2604-CVO4'
)
ORDER BY m.sent_at DESC;

-- ============================================
-- BƯỚC 6 — Trigger realtime update: update room last_message_at
-- ============================================
UPDATE b2b.chat_rooms
SET last_message_at = now()
WHERE id = (
  SELECT room_id FROM b2b.chat_messages
  WHERE metadata->'booking'->>'booking_code' = 'BK260419-9JES'
  ORDER BY sent_at DESC LIMIT 1
);

-- ============================================
-- HOÀN TẤT
-- Sau khi chạy xong:
--   - F5 cả ERP + Portal → DealCard sẽ hiện đúng với progress bar 5 mốc
--   - Tiếp tục test từ bước 4 (cân nhập kho) như B2B_14_TEST_END_TO_END.md
-- ============================================
