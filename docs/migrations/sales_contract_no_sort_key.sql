-- ============================================================================
-- Sales — Generated column sort theo suffix number của contract_no
-- Date: 2026-05-05
-- ============================================================================
--
-- VẤN ĐỀ:
--   User muốn sort cột SỐ HĐ theo số đơn:
--     HA20260001 (suffix 0001) → vị trí 1
--     HA20260002 (suffix 0002) → vị trí 2
--     ...
--     HA20240046 (suffix 0046) → vị trí 46 (giữa list)
--     HA20260050 (suffix 0050) → vị trí 50
--   Không phải string sort (đặt 2024 trước 2026).
--
-- GIẢI PHÁP:
--   Thêm GENERATED COLUMN `contract_no_sort_key` BIGINT:
--     - Trích last 4 chữ số của contract_no
--     - NULL nếu contract_no không có số
--     - Postgres cập nhật tự động khi UPDATE/INSERT
--   Sau đó Supabase JS gọi .order('contract_no_sort_key') sẽ sort numeric.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: Drop column nếu đã tồn tại + tạo lại (idempotent)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE sales_orders DROP COLUMN IF EXISTS contract_no_sort_key;

-- Generated column: extract last 4 chữ số làm INT
-- Logic: REGEXP_REPLACE strip non-digit, RIGHT lấy 4 char cuối, cast INT
ALTER TABLE sales_orders
ADD COLUMN contract_no_sort_key INTEGER
GENERATED ALWAYS AS (
  CASE
    WHEN contract_no IS NULL THEN NULL
    WHEN REGEXP_REPLACE(contract_no, '\D', '', 'g') = '' THEN NULL
    ELSE NULLIF(
      RIGHT(REGEXP_REPLACE(contract_no, '\D', '', 'g'), 4),
      ''
    )::INTEGER
  END
) STORED;

-- Index để sort nhanh
CREATE INDEX IF NOT EXISTS idx_sales_orders_contract_no_sort_key
  ON sales_orders(contract_no_sort_key NULLS LAST);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: NOTIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: VERIFY — show 20 đơn đầu sort theo sort_key ASC
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  ROW_NUMBER() OVER (ORDER BY contract_no_sort_key ASC NULLS LAST) AS rn,
  code,
  contract_no,
  contract_no_sort_key AS suffix_num
FROM sales_orders
WHERE status <> 'cancelled'
ORDER BY contract_no_sort_key ASC NULLS LAST
LIMIT 20;
-- Mong đợi:
--   rn  | code           | contract_no  | suffix_num
--   1   | SO-2026-0002   | HA20260001   | 1
--   2   | SO-2026-0003   | HA20260002   | 2
--   3   | SO-2026-0004   | HA20260003   | 3
--   ...
--   46  | SO-2026-0008   | HA20240046   | 46  ← đơn 2024 ở vị trí 46
--   ...
--   50  | SO-2026-0050   | HA20260050   | 50

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- DROP INDEX idx_sales_orders_contract_no_sort_key;
-- ALTER TABLE sales_orders DROP COLUMN contract_no_sort_key;
