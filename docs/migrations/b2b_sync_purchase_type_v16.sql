-- ============================================================
-- B2B SYNC purchase_type ↔ deal_type — V16
-- Ngày: 2026-05-22
-- Phụ thuộc: P1-P5 Intake v4 (purchase_type column tồn tại)
--
-- Mục đích: Backfill purchase_type cho deals tạo trước commit
-- "Sync deal_type ↔ purchase_type" (chat flow ConfirmDealModal chỉ
-- set deal_type, để purchase_type default='standard' → Production
-- tab + getTimeline + onProductionFinish KHÔNG hoạt động cho deal
-- "Chạy đầu ra" tạo từ chat).
--
-- Mapping rule:
--   deal_type='processing' → purchase_type='drc_after_production'
--   deal_type='consignment' → purchase_type='drc_after_production'
--   deal_type='purchase' / 'sale' → purchase_type='standard'
-- ============================================================

-- Step 1: Show deals affected before update
SELECT
  deal_number,
  deal_type,
  purchase_type AS old_purchase_type,
  CASE
    WHEN deal_type IN ('processing', 'consignment') THEN 'drc_after_production'
    ELSE 'standard'
  END AS new_purchase_type,
  status,
  created_at
FROM b2b.deals
WHERE
  -- Chỉ update các deal có mismatch giữa deal_type vs purchase_type
  (
    deal_type IN ('processing', 'consignment')
    AND purchase_type != 'drc_after_production'
  )
ORDER BY created_at DESC;

-- Step 2: Backfill — chỉ deals có deal_type='processing'/'consignment' và
-- purchase_type chưa phải 'drc_after_production'
UPDATE b2b.deals
SET purchase_type = 'drc_after_production'
WHERE deal_type IN ('processing', 'consignment')
  AND purchase_type != 'drc_after_production';

-- Step 3: Verify post-update
SELECT
  deal_type,
  purchase_type,
  COUNT(*) AS deal_count
FROM b2b.deals
GROUP BY deal_type, purchase_type
ORDER BY deal_type, purchase_type;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
