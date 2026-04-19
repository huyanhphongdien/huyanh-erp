-- ============================================================================
-- CLEANUP: weighbridge_tickets có deal_id trỏ tới deal ĐÃ XOÁ
-- Ngày: 2026-04-19
--
-- Nguyên nhân: Reset B2B data trước đây xoá b2b.deals nhưng KHÔNG xoá
-- weighbridge_tickets có deal_id → tickets giữ orphan FK → dropdown filter
-- ở dashboard hiện UUID không biết của Deal nào.
--
-- Policy:
--   - Chỉ SET NULL cho deal_id orphan, giữ nguyên ticket (data cân đã có
--     giá trị lịch sử). KHÔNG DELETE tickets — nếu cần xoá thì dùng
--     b2b_reset_chat_history.sql.
-- ============================================================================

-- ============================================
-- BƯỚC 1 — Xem orphan deal_id trên tickets (trước khi fix)
-- ============================================
SELECT
  t.id, t.code, t.deal_id, t.partner_id, t.supplier_name,
  t.created_at, t.status
FROM weighbridge_tickets t
LEFT JOIN b2b.deals d ON d.id = t.deal_id
WHERE t.deal_id IS NOT NULL
  AND d.id IS NULL
ORDER BY t.created_at DESC
LIMIT 50;

-- Số lượng tickets orphan
SELECT COUNT(*) AS orphan_count
FROM weighbridge_tickets t
LEFT JOIN b2b.deals d ON d.id = t.deal_id
WHERE t.deal_id IS NOT NULL
  AND d.id IS NULL;

-- ============================================
-- BƯỚC 2 — SET NULL deal_id orphan (giữ ticket)
-- ============================================
UPDATE weighbridge_tickets t
SET deal_id = NULL, updated_at = now()
WHERE t.deal_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM b2b.deals d WHERE d.id = t.deal_id);

-- ============================================
-- BƯỚC 3 — Verify
-- ============================================
SELECT COUNT(*) AS remaining_orphan
FROM weighbridge_tickets t
LEFT JOIN b2b.deals d ON d.id = t.deal_id
WHERE t.deal_id IS NOT NULL
  AND d.id IS NULL;

-- Distinct deal_id còn lại (phải khớp với b2b.deals)
SELECT
  t.deal_id,
  d.deal_number,
  d.status,
  COUNT(t.id) AS ticket_count
FROM weighbridge_tickets t
JOIN b2b.deals d ON d.id = t.deal_id
GROUP BY t.deal_id, d.deal_number, d.status
ORDER BY d.created_at DESC;
