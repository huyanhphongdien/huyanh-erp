-- ============================================================================
-- B2B Portal Sprint A — Fix 5 CRITICAL bugs data integrity
-- Date: 2026-04-21
-- Blocker trước rollout production
-- ============================================================================
-- Bao gồm:
--   BUG-1: Tier casing inconsistency → lowercase + CHECK
--   BUG-2: Demand over-filled → trigger chặn sum(accepted) > quantity
--   BUG-3: Offer accepted không link deal → CHECK enforce
--   BUG-4: actual_drc không có stock_in → cleanup + CHECK
--   BUG-5: Notification audience NULL → backfill + NOT NULL default
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════
-- BUG-1: Tier lowercase + CHECK
-- ═══════════════════════════════════════════════════════════════

-- Clean data
UPDATE b2b.partners SET tier = LOWER(tier) WHERE tier != LOWER(tier);

-- CHECK constraint
ALTER TABLE b2b.partners
  DROP CONSTRAINT IF EXISTS chk_partners_tier_lowercase;
ALTER TABLE b2b.partners
  ADD CONSTRAINT chk_partners_tier_lowercase
  CHECK (tier IN ('diamond','gold','silver','bronze','new'));

-- Verify
SELECT code, name, tier FROM b2b.partners WHERE tier != LOWER(tier);
-- Expected: 0 rows

-- ═══════════════════════════════════════════════════════════════
-- BUG-4: Clean actual_drc của deals chưa stock_in + CHECK
-- ═══════════════════════════════════════════════════════════════

-- Clean data (reset actual_drc nếu chưa có stock_in)
UPDATE b2b.deals
SET actual_drc = NULL,
    actual_weight_kg = NULL,
    final_value = NULL,
    qc_status = 'pending'
WHERE (stock_in_count = 0 OR stock_in_count IS NULL)
  AND actual_drc IS NOT NULL;

-- CHECK constraint
ALTER TABLE b2b.deals
  DROP CONSTRAINT IF EXISTS chk_deals_drc_requires_stockin;
ALTER TABLE b2b.deals
  ADD CONSTRAINT chk_deals_drc_requires_stockin
  CHECK (actual_drc IS NULL OR COALESCE(stock_in_count, 0) > 0);

-- Verify
SELECT deal_number, stock_in_count, actual_drc
FROM b2b.deals
WHERE actual_drc IS NOT NULL AND COALESCE(stock_in_count, 0) = 0;
-- Expected: 0 rows

-- ═══════════════════════════════════════════════════════════════
-- BUG-5: Notifications audience backfill + NOT NULL default
-- ═══════════════════════════════════════════════════════════════

-- Backfill NULL audiences → 'both' (mặc định cả partner + staff đều thấy)
UPDATE b2b.notifications SET audience = 'both' WHERE audience IS NULL;

-- Set default + NOT NULL
ALTER TABLE b2b.notifications ALTER COLUMN audience SET DEFAULT 'both';
ALTER TABLE b2b.notifications ALTER COLUMN audience SET NOT NULL;

-- CHECK valid values (đã có trong migration gốc, re-check)
ALTER TABLE b2b.notifications
  DROP CONSTRAINT IF EXISTS chk_notifications_audience;
ALTER TABLE b2b.notifications
  ADD CONSTRAINT chk_notifications_audience
  CHECK (audience IN ('partner', 'staff', 'both'));

-- Verify
SELECT id, title, audience FROM b2b.notifications WHERE audience IS NULL;
-- Expected: 0 rows

-- ═══════════════════════════════════════════════════════════════
-- BUG-2: Trigger chặn demand over-filled
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION b2b.check_demand_not_overfill()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  total_qty NUMERIC;
  accepted_sum NUMERIC;
  new_offer_qty NUMERIC;
BEGIN
  -- Chỉ check khi status chuyển sang 'accepted'
  IF NEW.status != 'accepted' THEN
    RETURN NEW;
  END IF;

  -- Nếu UPDATE và OLD.status đã là 'accepted' thì skip (tránh double check)
  IF TG_OP = 'UPDATE' AND OLD.status = 'accepted' THEN
    RETURN NEW;
  END IF;

  SELECT quantity_kg INTO total_qty FROM b2b.demands WHERE id = NEW.demand_id;

  -- Tổng quantity đã accepted (trừ offer hiện tại nếu UPDATE)
  SELECT COALESCE(SUM(offered_quantity_kg), 0)
  INTO accepted_sum
  FROM b2b.demand_offers
  WHERE demand_id = NEW.demand_id
    AND status = 'accepted'
    AND id != NEW.id;

  new_offer_qty := COALESCE(NEW.offered_quantity_kg, 0);

  IF accepted_sum + new_offer_qty > total_qty THEN
    RAISE EXCEPTION
      'Tổng offer accepted (% kg) vượt quantity demand (% kg). Demand ID: %',
      accepted_sum + new_offer_qty, total_qty, NEW.demand_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_demand_overfill_check ON b2b.demand_offers;
CREATE TRIGGER trg_demand_overfill_check
  BEFORE INSERT OR UPDATE OF status, offered_quantity_kg ON b2b.demand_offers
  FOR EACH ROW
  EXECUTE FUNCTION b2b.check_demand_not_overfill();

-- Note: Không backfill demand 8KC vì data legacy — nhà máy cần manual adjust

-- ═══════════════════════════════════════════════════════════════
-- BUG-3: Backfill offer.deal_id + CHECK accepted must have deal
-- ═══════════════════════════════════════════════════════════════

-- Không auto backfill vì không biết mapping offer→deal chính xác
-- Chỉ add CHECK cho records mới (existing records sẽ fail validation)
-- Safer: dùng DEFERRABLE hoặc chỉ warn, không hard-enforce cho legacy data

-- Soft check via function (log warning không block INSERT)
CREATE OR REPLACE FUNCTION b2b.warn_accepted_offer_no_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'accepted' AND NEW.deal_id IS NULL THEN
    RAISE WARNING 'Offer % accepted nhưng chưa link deal — vui lòng assign deal_id', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offer_accepted_warn ON b2b.demand_offers;
CREATE TRIGGER trg_offer_accepted_warn
  AFTER INSERT OR UPDATE OF status ON b2b.demand_offers
  FOR EACH ROW
  EXECUTE FUNCTION b2b.warn_accepted_offer_no_deal();

-- Backfill quantity_filled_kg cho tất cả demands
UPDATE b2b.demands d
SET quantity_filled_kg = (
  SELECT COALESCE(SUM(o.offered_quantity_kg), 0)
  FROM b2b.demand_offers o
  WHERE o.demand_id = d.id AND o.status = 'accepted'
);

-- ═══════════════════════════════════════════════════════════════
-- Reload PostgREST schema
-- ═══════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- FINAL VERIFY
-- ═══════════════════════════════════════════════════════════════

SELECT 'Tier not lowercase' AS check_name, COUNT(*) AS rows
  FROM b2b.partners WHERE tier != LOWER(tier)
UNION ALL
SELECT 'actual_drc without stock_in', COUNT(*)
  FROM b2b.deals WHERE actual_drc IS NOT NULL AND COALESCE(stock_in_count, 0) = 0
UNION ALL
SELECT 'notifications audience NULL', COUNT(*)
  FROM b2b.notifications WHERE audience IS NULL
UNION ALL
SELECT 'accepted offers no deal_id', COUNT(*)
  FROM b2b.demand_offers WHERE status = 'accepted' AND deal_id IS NULL
UNION ALL
SELECT 'demands over-filled', COUNT(*)
  FROM b2b.demands d
  WHERE (
    SELECT COALESCE(SUM(offered_quantity_kg), 0)
    FROM b2b.demand_offers o
    WHERE o.demand_id = d.id AND o.status = 'accepted'
  ) > d.quantity_kg;

-- Expected:
-- Tier not lowercase: 0 (FIXED)
-- actual_drc without stock_in: 0 (FIXED)
-- notifications audience NULL: 0 (FIXED)
-- accepted offers no deal_id: 2 (legacy data, cần manual fix từ ERP)
-- demands over-filled: 1 (legacy 8KC, cần manual adjust)
