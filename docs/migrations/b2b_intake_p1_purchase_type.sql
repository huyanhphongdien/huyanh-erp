-- ============================================================================
-- B2B Intake v4 — Phase 1 (P1)
-- Add b2b.deals.purchase_type
-- Date: 2026-04-23
-- Status: ✅ applied live production via agent_sql
-- Idempotent: chạy lại nhiều lần OK
-- ============================================================================

-- P1.1: ADD COLUMN nullable (backward-compat, code cũ vẫn insert OK)
ALTER TABLE b2b.deals
  ADD COLUMN IF NOT EXISTS purchase_type TEXT;

-- P1.2: Backfill existing deals → 'standard' (trước khi SET NOT NULL)
UPDATE b2b.deals
SET purchase_type = 'standard'
WHERE purchase_type IS NULL;

-- P1.3: CHECK constraint (drop-create idempotent)
ALTER TABLE b2b.deals DROP CONSTRAINT IF EXISTS chk_deals_purchase_type;
ALTER TABLE b2b.deals
  ADD CONSTRAINT chk_deals_purchase_type
  CHECK (purchase_type IN ('standard','outright','drc_after_production','farmer_walkin'));

-- P1.4: SET NOT NULL (safe vì đã backfill)
ALTER TABLE b2b.deals ALTER COLUMN purchase_type SET NOT NULL;

-- P1.5: SET DEFAULT (deal mới tự động = standard nếu code quên set)
ALTER TABLE b2b.deals ALTER COLUMN purchase_type SET DEFAULT 'standard';

-- P1.6: Partial index — query theo flow mới hay dùng, standard flow skip index
CREATE INDEX IF NOT EXISTS idx_deals_purchase_type
  ON b2b.deals(purchase_type)
  WHERE purchase_type != 'standard';

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════
-- SELECT purchase_type, COUNT(*) FROM b2b.deals GROUP BY 1;
-- Expected: tất cả 'standard' (7 rows khi apply 2026-04-23)

-- Test CHECK: UPDATE b2b.deals SET purchase_type='INVALID' → expect reject

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK (nếu cần gỡ)
-- ═══════════════════════════════════════════════════════════════
-- DROP INDEX IF EXISTS b2b.idx_deals_purchase_type;
-- ALTER TABLE b2b.deals DROP CONSTRAINT IF EXISTS chk_deals_purchase_type;
-- ALTER TABLE b2b.deals DROP COLUMN IF EXISTS purchase_type;
