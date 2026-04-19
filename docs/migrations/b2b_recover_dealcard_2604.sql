-- ============================================================================
-- RECOVERY: Tạo DealCard message bị thiếu cho Deal DL2604-CVO4
-- Ngày: 2026-04-19
-- Nguyên nhân: bug "nuốt lỗi" trong dealConfirmService.ts (đã fix ở commit
--              2fb6775a), step 5 INSERT DealCard fail silent.
-- ============================================================================

-- ============================================
-- BƯỚC 0 — Kiểm tra columns thực tế của b2b.deals (debug)
-- Chạy block này nếu muốn biết columns nào đang tồn tại
-- ============================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'deals'
ORDER BY ordinal_position;

-- ============================================
-- BƯỚC 1 — Xem Deal hiện tại (chỉ columns chắc chắn tồn tại)
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
  d.total_value_vnd,
  d.pickup_location_name,
  d.rubber_type,
  d.lot_code,
  d.rubber_region
FROM b2b.deals d
WHERE d.deal_number = 'DL2604-CVO4';

-- ============================================
-- BƯỚC 1b — Compute total_advanced từ b2b.advances
-- ============================================
SELECT
  d.id AS deal_id,
  d.deal_number,
  COALESCE(SUM(a.amount_vnd), COALESCE(SUM(a.amount), 0), 0) AS total_advanced,
  d.total_value_vnd,
  (d.total_value_vnd - COALESCE(SUM(a.amount_vnd), COALESCE(SUM(a.amount), 0), 0)) AS balance_due
FROM b2b.deals d
LEFT JOIN b2b.advances a ON a.deal_id = d.id AND a.status = 'paid'
WHERE d.deal_number = 'DL2604-CVO4'
GROUP BY d.id, d.deal_number, d.total_value_vnd;

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
-- (nếu > 0 rows thì ĐỪNG chạy BƯỚC 4, sẽ duplicate)
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
--
-- Dùng CTE để compute total_advanced từ advances thay vì assume column.
-- price_unit: default 'wet' nếu column không tồn tại trên base table.
-- ============================================
WITH deal_snapshot AS (
  SELECT
    d.id,
    d.deal_number,
    d.status,
    d.partner_id,
    d.booking_id,
    d.quantity_kg,
    d.expected_drc,
    d.unit_price,
    d.total_value_vnd,
    d.pickup_location_name,
    d.rubber_type,
    d.lot_code,
    d.rubber_region,
    COALESCE((
      SELECT SUM(COALESCE(a.amount_vnd, a.amount, 0))
      FROM b2b.advances a
      WHERE a.deal_id = d.id AND a.status = 'paid'
    ), 0) AS total_advanced,
    -- price_unit có thể null — default 'wet'
    COALESCE(
      (SELECT column_default FROM information_schema.columns
       WHERE table_schema='b2b' AND table_name='deals' AND column_name='price_unit'),
      'wet'
    ) AS price_unit_default
  FROM b2b.deals d
  WHERE d.deal_number = 'DL2604-CVO4'
),
room_target AS (
  SELECT room_id
  FROM b2b.chat_messages
  WHERE metadata->'booking'->>'booking_code' = 'BK260419-9JES'
  ORDER BY sent_at DESC
  LIMIT 1
)
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
  (SELECT room_id FROM room_target),
  'factory',
  NULL::uuid,  -- sender_id NULL OK cho recovery (chỉ dùng render UI)
  'deal',
  '🤝 Deal ' || ds.deal_number || ' đã được tạo (recovered)',
  jsonb_build_object(
    'deal', jsonb_build_object(
      'deal_id',         ds.id::text,
      'deal_number',     ds.deal_number,
      'status',          ds.status,
      'booking_code',    'BK260419-9JES',
      'product_type',    ds.rubber_type,
      'quantity_kg',     ds.quantity_kg,
      'expected_drc',    ds.expected_drc,
      'agreed_price',    ds.unit_price,
      'price_unit',      'wet',
      'estimated_value', COALESCE(ds.total_value_vnd, 0),
      'pickup_location', ds.pickup_location_name,
      'lot_code',        ds.lot_code,
      'rubber_region',   ds.rubber_region,
      'total_advanced',  ds.total_advanced,
      'balance_due',     COALESCE(ds.total_value_vnd, 0) - ds.total_advanced
    )
  ),
  '[]'::jsonb,
  now()
FROM deal_snapshot ds;

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
  m.metadata->'deal'->>'expected_drc' AS expected_drc,
  m.metadata->'deal'->>'total_advanced' AS total_advanced,
  m.metadata->'deal'->>'balance_due' AS balance_due
FROM b2b.chat_messages m
WHERE m.metadata->'deal'->>'deal_id' = (
  SELECT id::text FROM b2b.deals WHERE deal_number = 'DL2604-CVO4'
)
ORDER BY m.sent_at DESC;

-- ============================================
-- BƯỚC 6 — Trigger realtime: update room last_message_at
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
--   - F5 cả ERP + Portal → DealCard sẽ hiện với progress bar 5 mốc
--   - Tiếp tục test từ bước 4 (cân nhập kho) như B2B_14_TEST_END_TO_END.md
-- ============================================
