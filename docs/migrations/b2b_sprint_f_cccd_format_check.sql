-- ============================================================================
-- B2B Sprint F — CCCD format CHECK (GAP-1 from SQL test 2026-05-03)
-- Date: 2026-05-04
-- Status: TO APPLY
-- ============================================================================
--
-- ROOT CAUSE:
--   b2b.partners.national_id chỉ có UNIQUE INDEX, KHÔNG có CHECK length/format.
--   UI WalkinWizard validate CCCD 12 số, nhưng anyone gọi REST API trực tiếp
--   có thể insert 9 số / chữ / null. Memory `b2b_sprint_1_4_enforcement` báo
--   "phone NOT NULL" nhưng chưa có CHECK national_id format.
--
-- VERIFY ON LIVE PROD (2026-05-03 via REST):
--   POST /b2b_partners {national_id: '079123456'} → SUCCESS (chỉ 9 số)
--   POST /b2b_partners {national_id: '079123456789'} → SUCCESS (12 số đúng)
--
-- IMPACT:
--   - Khả năng insert "junk" CCCD qua API
--   - Walk-in flow nếu thay đổi nguồn data (vd batch import) sẽ bypass UI check
--
-- FIX:
--   Add CHECK constraint với rule:
--   - Nếu nationality='VN' AND national_id IS NOT NULL → phải là 12 chữ số
--   - Nếu nationality='LAO' → bất kỳ format (Lào không có CCCD chuẩn)
--   - Nếu national_id IS NULL → OK (cho deal/partner cũ chưa có)
-- ============================================================================

-- Step 1: Backfill / clean up legacy data trước khi add constraint
-- (Nếu có data junk, NULL out để không block constraint)

-- Verify current state
DO $$
DECLARE
  invalid_count INT;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM b2b.partners
  WHERE nationality = 'VN'
    AND national_id IS NOT NULL
    AND national_id !~ '^[0-9]{12}$';
  RAISE NOTICE 'Found % VN partners with invalid CCCD format (will be NULLed)', invalid_count;
END $$;

-- Cleanup junk values (set to NULL, preserve partner record)
UPDATE b2b.partners
SET national_id = NULL
WHERE nationality = 'VN'
  AND national_id IS NOT NULL
  AND national_id !~ '^[0-9]{12}$';

-- Step 2: Add CHECK constraint
ALTER TABLE b2b.partners DROP CONSTRAINT IF EXISTS chk_partners_national_id_format;

ALTER TABLE b2b.partners
  ADD CONSTRAINT chk_partners_national_id_format
  CHECK (
    national_id IS NULL
    OR (nationality = 'VN' AND national_id ~ '^[0-9]{12}$')
    OR nationality = 'LAO'
  );

-- Step 3: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY (manual SQL after apply)
-- ════════════════════════════════════════════════════════════════════════════
-- Test 1 — VN với 12 số → OK
-- INSERT INTO b2b.partners (code, name, partner_type, nationality, national_id, phone, status, tier)
-- VALUES ('TEST-OK', 'Test', 'household', 'VN', '079123456789', '0900000000', 'verified', 'new');

-- Test 2 — VN với 9 số → REJECT
-- INSERT INTO b2b.partners (code, name, partner_type, nationality, national_id, phone, status, tier)
-- VALUES ('TEST-FAIL', 'Test', 'household', 'VN', '079123456', '0900000000', 'verified', 'new');
-- Expected: ERROR violates check constraint chk_partners_national_id_format

-- Test 3 — LAO với 8 số → OK (no enforcement)
-- INSERT INTO b2b.partners (code, name, partner_type, nationality, national_id, phone, status, tier)
-- VALUES ('TEST-LAO', 'Test', 'household', 'LAO', '12345678', '0900000000', 'verified', 'new');

-- Test 4 — NULL national_id → OK (cho dealer/supplier không cần CCCD)
-- INSERT INTO b2b.partners (code, name, partner_type, nationality, national_id, phone, status, tier)
-- VALUES ('TEST-NULL', 'Test', 'dealer', 'VN', NULL, '0900000000', 'verified', 'new');

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- ALTER TABLE b2b.partners DROP CONSTRAINT IF EXISTS chk_partners_national_id_format;
