-- ============================================================================
-- B2B Intake v4 — Phase 5
-- Create b2b.daily_price_list với tstzrange EXCLUDE (chống overlap)
-- Date: 2026-04-23
-- Status: ✅ applied live production via agent_sql
-- ============================================================================

-- Dependency
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Table
CREATE TABLE IF NOT EXISTS b2b.daily_price_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  product_code TEXT NOT NULL,
  base_price_per_kg NUMERIC(12,2) NOT NULL CHECK (base_price_per_kg > 0),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- EXCLUDE constraint — chống overlap tstzrange per product
-- '[)' half-open: effective_from inclusive, effective_to exclusive (null = vô cực)
ALTER TABLE b2b.daily_price_list DROP CONSTRAINT IF EXISTS no_overlap_price_range;
ALTER TABLE b2b.daily_price_list
  ADD CONSTRAINT no_overlap_price_range
  EXCLUDE USING gist (
    product_code WITH =,
    tstzrange(effective_from, effective_to, '[)') WITH &&
  );

-- Index cho query getCurrent(product, at)
CREATE INDEX IF NOT EXISTS idx_daily_price_product_time
  ON b2b.daily_price_list(product_code, effective_from DESC);

-- RLS
ALTER TABLE b2b.daily_price_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_price_read ON b2b.daily_price_list;
CREATE POLICY daily_price_read
  ON b2b.daily_price_list FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS daily_price_service_all ON b2b.daily_price_list;
CREATE POLICY daily_price_service_all
  ON b2b.daily_price_list FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Temp: authenticated write (Sprint R sẽ tighten chỉ admin)
DROP POLICY IF EXISTS daily_price_auth_write ON b2b.daily_price_list;
CREATE POLICY daily_price_auth_write
  ON b2b.daily_price_list FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════
-- Test overlap reject:
-- INSERT (product='mu_tap', 10000, NOW()) → OK
-- INSERT (product='mu_tap', 11000, NOW()+1h) → expected reject (overlap)

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS b2b.daily_price_list CASCADE;
