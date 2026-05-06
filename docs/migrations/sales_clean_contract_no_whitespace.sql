-- ============================================================================
-- Sales — Clean contract_no whitespace (fix sort lệch)
-- Date: 2026-05-05
-- ============================================================================
--
-- VẤN ĐỀ:
--   User click Số HĐ ↑ Tăng dần thấy thứ tự lung tung:
--     HA20260001, 002, 006, 007, 009, 012, 022, HA20240046(2024), 003, 008
--   Đáng lẽ alphabetical phải:
--     HA20240046, HA20260001, 002, 003, 004, 005, 006, 007, 008, 009, 010, ...
--
-- ROOT CAUSE:
--   contract_no user nhập tay có thể có:
--     - Trailing/leading whitespace ('HA20260003 ')
--     - Tab/special chars
--   → Postgres ORDER BY sort string với whitespace ra kết quả khác mong đợi.
--
-- GIẢI PHÁP:
--   1. TRIM contract_no cho TẤT CẢ rows (xóa whitespace 2 đầu + tab)
--   2. NULLIF empty string → NULL (chuẩn hóa)
--   3. Verify list xem còn vấn đề gì
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 0: Show contract_no nào có whitespace
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  code,
  contract_no AS raw_value,
  LENGTH(contract_no) AS raw_len,
  LENGTH(TRIM(contract_no)) AS trimmed_len,
  CASE
    WHEN contract_no <> TRIM(contract_no) THEN '✓ HAS WHITESPACE'
    WHEN contract_no = '' THEN '✓ EMPTY STRING'
    ELSE 'ok'
  END AS issue
FROM sales_orders
WHERE contract_no IS NOT NULL
  AND (contract_no <> TRIM(contract_no) OR contract_no = '')
ORDER BY code;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: TRIM contract_no + NULL hóa empty string
-- ════════════════════════════════════════════════════════════════════════════
UPDATE sales_orders
SET contract_no = NULLIF(TRIM(contract_no), '')
WHERE contract_no IS NOT NULL
  AND (contract_no <> TRIM(contract_no) OR contract_no = '');

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Verify — sau khi clean, list 20 đơn đầu sort theo contract_no ASC
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  ROW_NUMBER() OVER (ORDER BY contract_no ASC NULLS LAST) AS rn,
  code,
  contract_no,
  LENGTH(contract_no) AS len
FROM sales_orders
WHERE status <> 'cancelled'
ORDER BY contract_no ASC NULLS LAST
LIMIT 20;
-- Mong đợi: thứ tự alphabetical tăng dần, không có row whitespace nào trộn lẫn

-- ════════════════════════════════════════════════════════════════════════════
-- NOTIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: Không thể revert (đã trim). Cần backup nếu muốn.
-- ════════════════════════════════════════════════════════════════════════════
