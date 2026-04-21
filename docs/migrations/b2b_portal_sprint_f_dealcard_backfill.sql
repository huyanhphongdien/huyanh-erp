-- ============================================================================
-- B2B Portal Sprint F — DealCard metadata backfill
-- Date: 2026-04-21
-- ============================================================================
-- Follow-up cho Sprint E BUG-16:
--   Trigger sync_deal_card_metadata chỉ fire cho UPDATE mới. Các DealCards
--   được insert trước khi trigger install vẫn giữ metadata stale từ thời
--   điểm tạo message. Script này resync toàn bộ DealCards với b2b.deals
--   hiện tại — 1 lần thực thi duy nhất sau khi Sprint E đã apply.
--
-- Safe re-run: idempotent. Chạy nhiều lần chỉ overwrite metadata bằng
-- cùng 1 snapshot từ b2b.deals.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════
-- BACKFILL: sync metadata->deal từ b2b.deals
-- ═══════════════════════════════════════════════════════════════

UPDATE b2b.chat_messages m
SET metadata = jsonb_set(
  m.metadata,
  '{deal}',
  COALESCE(m.metadata->'deal', '{}'::jsonb) || jsonb_build_object(
    'status', d.status,
    'actual_drc', d.actual_drc,
    'actual_weight_kg', d.actual_weight_kg,
    'final_value', d.final_value,
    'stock_in_count', COALESCE(d.stock_in_count, 0),
    'qc_status', d.qc_status
  )
)
FROM b2b.deals d
WHERE m.message_type = 'deal'
  AND m.metadata->'deal'->>'deal_id' = d.id::text;

-- Backfill cho metadata flat (deal_id ở root level, không có sub-object 'deal')
UPDATE b2b.chat_messages m
SET metadata = m.metadata || jsonb_build_object(
  'status', d.status,
  'actual_drc', d.actual_drc,
  'actual_weight_kg', d.actual_weight_kg,
  'final_value', d.final_value,
  'stock_in_count', COALESCE(d.stock_in_count, 0),
  'qc_status', d.qc_status
)
FROM b2b.deals d
WHERE m.message_type = 'deal'
  AND m.metadata->>'deal_id' = d.id::text
  AND m.metadata->'deal' IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- VERIFY: tất cả metadata khớp với b2b.deals
-- ═══════════════════════════════════════════════════════════════

SELECT
  d.deal_number,
  d.status AS deal_status,
  m.metadata->'deal'->>'status' AS meta_status,
  d.actual_drc AS deal_drc,
  m.metadata->'deal'->>'actual_drc' AS meta_drc,
  d.final_value AS deal_final,
  m.metadata->'deal'->>'final_value' AS meta_final,
  d.stock_in_count AS deal_stock,
  m.metadata->'deal'->>'stock_in_count' AS meta_stock,
  d.status::text = m.metadata->'deal'->>'status' AS status_sync
FROM b2b.chat_messages m
JOIN b2b.deals d ON d.id::text = m.metadata->'deal'->>'deal_id'
WHERE m.message_type = 'deal'
ORDER BY d.deal_number;
