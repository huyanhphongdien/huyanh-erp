-- ============================================================================
-- B2B Intake v4 — Phase 2 + 3 + 4
-- P2: deals audit cols (buyer_user_id, qc_user_id, sample_drc)
-- P3: deals.finished_product_kg (flow B)
-- P4: partners household + nationality + CCCD
-- Date: 2026-04-23
-- Status: ✅ applied live production via agent_sql
-- Idempotent: chạy lại nhiều lần OK
-- ============================================================================

-- ═══ P2: Audit cols trên b2b.deals ═══
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS buyer_user_id UUID;
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS qc_user_id UUID;
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS sample_drc NUMERIC(5,2);

ALTER TABLE b2b.deals DROP CONSTRAINT IF EXISTS chk_deals_sample_drc;
ALTER TABLE b2b.deals
  ADD CONSTRAINT chk_deals_sample_drc
  CHECK (sample_drc IS NULL OR (sample_drc >= 0 AND sample_drc <= 100));


-- ═══ P3: finished_product_kg (flow drc_after_production) ═══
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS finished_product_kg NUMERIC(12,2);

ALTER TABLE b2b.deals DROP CONSTRAINT IF EXISTS chk_deals_finished_product_kg;
ALTER TABLE b2b.deals
  ADD CONSTRAINT chk_deals_finished_product_kg
  CHECK (finished_product_kg IS NULL OR finished_product_kg > 0);


-- ═══ P4: b2b.partners — household + nationality + CCCD ═══

-- P4.1: ADD COLUMN
ALTER TABLE b2b.partners ADD COLUMN IF NOT EXISTS national_id TEXT;
ALTER TABLE b2b.partners ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT 'VN';

-- P4.2: CHECK nationality
ALTER TABLE b2b.partners DROP CONSTRAINT IF EXISTS chk_partners_nationality;
ALTER TABLE b2b.partners
  ADD CONSTRAINT chk_partners_nationality
  CHECK (nationality IN ('VN','LAO'));

-- P4.3: UNIQUE INDEX national_id (partial)
CREATE UNIQUE INDEX IF NOT EXISTS ux_partners_national_id
  ON b2b.partners(national_id) WHERE national_id IS NOT NULL;

-- P4.4: Backfill nationality + SET NOT NULL
UPDATE b2b.partners SET nationality = 'VN' WHERE nationality IS NULL;
ALTER TABLE b2b.partners ALTER COLUMN nationality SET NOT NULL;

-- P4.5: Mở rộng partner_type CHECK cho 'household'
ALTER TABLE b2b.partners DROP CONSTRAINT IF EXISTS partners_partner_type_check;
ALTER TABLE b2b.partners
  ADD CONSTRAINT partners_partner_type_check
  CHECK (partner_type IN ('dealer','supplier','both','household'));

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema='b2b' AND table_name IN ('deals','partners')
--   AND column_name IN ('buyer_user_id','qc_user_id','sample_drc',
--                       'finished_product_kg','national_id','nationality')
-- ORDER BY table_name, column_name;

-- Test CHECK: UPDATE b2b.deals SET sample_drc=150 → reject
-- Test UNIQUE: 2 partner same national_id → 2nd reject
-- Test partner_type: 'household' accept, 'invalid' reject

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- ALTER TABLE b2b.deals DROP CONSTRAINT IF EXISTS chk_deals_sample_drc;
-- ALTER TABLE b2b.deals DROP CONSTRAINT IF EXISTS chk_deals_finished_product_kg;
-- ALTER TABLE b2b.deals DROP COLUMN IF EXISTS buyer_user_id;
-- ALTER TABLE b2b.deals DROP COLUMN IF EXISTS qc_user_id;
-- ALTER TABLE b2b.deals DROP COLUMN IF EXISTS sample_drc;
-- ALTER TABLE b2b.deals DROP COLUMN IF EXISTS finished_product_kg;
-- DROP INDEX IF EXISTS b2b.ux_partners_national_id;
-- ALTER TABLE b2b.partners DROP CONSTRAINT IF EXISTS chk_partners_nationality;
-- ALTER TABLE b2b.partners DROP COLUMN IF EXISTS national_id;
-- ALTER TABLE b2b.partners DROP COLUMN IF EXISTS nationality;
-- ALTER TABLE b2b.partners DROP CONSTRAINT IF EXISTS partners_partner_type_check;
-- ALTER TABLE b2b.partners ADD CONSTRAINT partners_partner_type_check
--   CHECK (partner_type IN ('dealer','supplier','both'));  -- restore cũ
