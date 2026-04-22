-- ============================================================================
-- B2B Portal Sprint A — Fix 5 CRITICAL bugs data integrity
-- Date: 2026-04-21 (revised)
-- ============================================================================
-- Architecture lưu ý:
--   - b2b.partners, b2b.deals, b2b.notifications (schema b2b)
--   - public.b2b_demands, public.b2b_demand_offers (schema public, prefix b2b_)
--   → SQL này dùng đúng tên từng table
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════
-- BUG-1: Tier lowercase + CHECK
-- ═══════════════════════════════════════════════════════════════

UPDATE b2b.partners SET tier = LOWER(tier) WHERE tier != LOWER(tier);

ALTER TABLE b2b.partners DROP CONSTRAINT IF EXISTS chk_partners_tier_lowercase;
ALTER TABLE b2b.partners
  ADD CONSTRAINT chk_partners_tier_lowercase
  CHECK (tier IN ('diamond','gold','silver','bronze','new'));

-- ═══════════════════════════════════════════════════════════════
-- BUG-4: Clean actual_drc + CHECK
-- ═══════════════════════════════════════════════════════════════

UPDATE b2b.deals
SET actual_drc = NULL,
    actual_weight_kg = NULL,
    final_value = NULL,
    qc_status = 'pending'
WHERE (stock_in_count = 0 OR stock_in_count IS NULL)
  AND actual_drc IS NOT NULL;

ALTER TABLE b2b.deals DROP CONSTRAINT IF EXISTS chk_deals_drc_requires_stockin;
ALTER TABLE b2b.deals
  ADD CONSTRAINT chk_deals_drc_requires_stockin
  CHECK (actual_drc IS NULL OR COALESCE(stock_in_count, 0) > 0);

-- ═══════════════════════════════════════════════════════════════
-- BUG-5: Notifications audience backfill + NOT NULL default
-- ═══════════════════════════════════════════════════════════════

UPDATE b2b.notifications SET audience = 'both' WHERE audience IS NULL;

ALTER TABLE b2b.notifications ALTER COLUMN audience SET DEFAULT 'both';
ALTER TABLE b2b.notifications ALTER COLUMN audience SET NOT NULL;

ALTER TABLE b2b.notifications DROP CONSTRAINT IF EXISTS chk_notifications_audience;
ALTER TABLE b2b.notifications
  ADD CONSTRAINT chk_notifications_audience
  CHECK (audience IN ('partner', 'staff', 'both'));

-- ═══════════════════════════════════════════════════════════════
-- BUG-2: Trigger chặn demand over-filled (public.b2b_demand_offers)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_demand_not_overfill()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  total_qty NUMERIC;
  accepted_sum NUMERIC;
  new_offer_qty NUMERIC;
BEGIN
  IF NEW.status != 'accepted' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'accepted' THEN
    RETURN NEW;
  END IF;

  SELECT quantity_kg INTO total_qty FROM public.b2b_demands WHERE id = NEW.demand_id;

  SELECT COALESCE(SUM(offered_quantity_kg), 0)
  INTO accepted_sum
  FROM public.b2b_demand_offers
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

DROP TRIGGER IF EXISTS trg_demand_overfill_check ON public.b2b_demand_offers;
CREATE TRIGGER trg_demand_overfill_check
  BEFORE INSERT OR UPDATE OF status, offered_quantity_kg ON public.b2b_demand_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.check_demand_not_overfill();

-- ═══════════════════════════════════════════════════════════════
-- BUG-3: Soft warn trigger offer accepted no deal_id
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.warn_accepted_offer_no_deal()
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

DROP TRIGGER IF EXISTS trg_offer_accepted_warn ON public.b2b_demand_offers;
CREATE TRIGGER trg_offer_accepted_warn
  AFTER INSERT OR UPDATE OF status ON public.b2b_demand_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.warn_accepted_offer_no_deal();

-- Backfill quantity_filled_kg
UPDATE public.b2b_demands d
SET quantity_filled_kg = (
  SELECT COALESCE(SUM(o.offered_quantity_kg), 0)
  FROM public.b2b_demand_offers o
  WHERE o.demand_id = d.id AND o.status = 'accepted'
);

-- ═══════════════════════════════════════════════════════════════
-- Reload PostgREST schema
-- ═══════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- FINAL VERIFY
-- ═══════════════════════════════════════════════════════════════

SELECT 'Tier not lowercase' AS check_name, COUNT(*) AS row_count
  FROM b2b.partners WHERE tier != LOWER(tier)
UNION ALL
SELECT 'actual_drc without stock_in', COUNT(*)
  FROM b2b.deals WHERE actual_drc IS NOT NULL AND COALESCE(stock_in_count, 0) = 0
UNION ALL
SELECT 'notifications audience NULL', COUNT(*)
  FROM b2b.notifications WHERE audience IS NULL
UNION ALL
SELECT 'accepted offers no deal_id', COUNT(*)
  FROM public.b2b_demand_offers WHERE status = 'accepted' AND deal_id IS NULL
UNION ALL
SELECT 'demands over-filled', COUNT(*)
  FROM public.b2b_demands d
  WHERE (
    SELECT COALESCE(SUM(offered_quantity_kg), 0)
    FROM public.b2b_demand_offers o
    WHERE o.demand_id = d.id AND o.status = 'accepted'
  ) > d.quantity_kg;
