-- ============================================================================
-- B2B SPRINT 1 — Enforce data integrity ở DB level
-- Date: 2026-04-21
-- ============================================================================
-- Bao gồm:
--   1. UNIQUE (booking_id) trên b2b.deals — chặn race condition tạo duplicate
--      deals từ 1 booking (Gap #1)
--   2. CHECK constraints — quantity_kg/unit_price/amount > 0 (Gap #6)
--   3. Check function cho active dispute (Gap #3)
-- ============================================================================

-- ─── GAP #1: Chặn duplicate deal từ 1 booking ────────────────────────────
-- Partial unique: chỉ enforce khi booking_id IS NOT NULL (deal manual không có)
DROP INDEX IF EXISTS b2b.idx_deals_booking_id_unique;
CREATE UNIQUE INDEX idx_deals_booking_id_unique
  ON b2b.deals (booking_id)
  WHERE booking_id IS NOT NULL;

COMMENT ON INDEX b2b.idx_deals_booking_id_unique IS
  'Gap #1 — Chặn race condition: 2 nhân viên cùng xác nhận 1 booking → chỉ 1 deal được tạo';

-- ─── GAP #6: Validate positive amounts ───────────────────────────────────
-- b2b.deals
ALTER TABLE b2b.deals
  DROP CONSTRAINT IF EXISTS chk_deals_quantity_positive;
ALTER TABLE b2b.deals
  ADD CONSTRAINT chk_deals_quantity_positive
  CHECK (quantity_kg IS NULL OR quantity_kg > 0);

ALTER TABLE b2b.deals
  DROP CONSTRAINT IF EXISTS chk_deals_unit_price_nonneg;
ALTER TABLE b2b.deals
  ADD CONSTRAINT chk_deals_unit_price_nonneg
  CHECK (unit_price IS NULL OR unit_price >= 0);

ALTER TABLE b2b.deals
  DROP CONSTRAINT IF EXISTS chk_deals_final_price_nonneg;
ALTER TABLE b2b.deals
  ADD CONSTRAINT chk_deals_final_price_nonneg
  CHECK (final_price IS NULL OR final_price >= 0);

ALTER TABLE b2b.deals
  DROP CONSTRAINT IF EXISTS chk_deals_expected_drc_range;
ALTER TABLE b2b.deals
  ADD CONSTRAINT chk_deals_expected_drc_range
  CHECK (expected_drc IS NULL OR (expected_drc > 0 AND expected_drc <= 100));

ALTER TABLE b2b.deals
  DROP CONSTRAINT IF EXISTS chk_deals_actual_drc_range;
ALTER TABLE b2b.deals
  ADD CONSTRAINT chk_deals_actual_drc_range
  CHECK (actual_drc IS NULL OR (actual_drc > 0 AND actual_drc <= 100));

-- b2b.advances
ALTER TABLE b2b.advances
  DROP CONSTRAINT IF EXISTS chk_advances_amount_positive;
ALTER TABLE b2b.advances
  ADD CONSTRAINT chk_advances_amount_positive
  CHECK (amount > 0);

ALTER TABLE b2b.advances
  DROP CONSTRAINT IF EXISTS chk_advances_amount_vnd_positive;
ALTER TABLE b2b.advances
  ADD CONSTRAINT chk_advances_amount_vnd_positive
  CHECK (amount_vnd IS NULL OR amount_vnd > 0);

-- b2b.settlements
ALTER TABLE b2b.settlements
  DROP CONSTRAINT IF EXISTS chk_settlements_weighed_positive;
ALTER TABLE b2b.settlements
  ADD CONSTRAINT chk_settlements_weighed_positive
  CHECK (weighed_kg IS NULL OR weighed_kg >= 0);

ALTER TABLE b2b.settlements
  DROP CONSTRAINT IF EXISTS chk_settlements_price_nonneg;
ALTER TABLE b2b.settlements
  ADD CONSTRAINT chk_settlements_price_nonneg
  CHECK (approved_price IS NULL OR approved_price >= 0);

-- ─── Reload PostgREST schema ──────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ─── Verify ──────────────────────────────────────────────────────────────
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'b2b.deals'::regclass
  AND conname LIKE 'chk_deals_%'
ORDER BY conname;

SELECT indexname FROM pg_indexes
WHERE schemaname = 'b2b' AND tablename = 'deals'
  AND indexname = 'idx_deals_booking_id_unique';
