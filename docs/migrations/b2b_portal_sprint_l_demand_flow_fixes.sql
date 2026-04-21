-- ============================================================================
-- B2B Portal Sprint L — Demand flow 5 bug fixes
-- Date: 2026-04-22
-- Status: ✅ applied production via agent_sql RPC
-- ============================================================================
-- Bugs E2E audit flow Demand → Offer → Deal:
--   BUG-DEM-1 HIGH: b2b_demands.status thiếu CHECK
--   BUG-DEM-2 HIGH: b2b_demand_offers.status thiếu CHECK
--   BUG-DEM-3 CRITICAL: quantity_filled_kg không auto-update khi offer accepted
--   BUG-DEM-5 HIGH: RLS "Allow all access" quá lỏng
--   BUG-DEM-7 INFO: chk_deadline_after_publish strict `>` fail same-day publish
--   BUG-DEM-8 HIGH: log_deal_changes AFTER DELETE gây FK violation audit_log
--
-- BUG-DEM-4 (deal_number VARCHAR 20→32) defer — cần DROP cascade 2 views
-- BUG-DEM-6 (warning silent) defer — low priority
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════
-- Fix CHECK chk_demand_deadline_after_publish: `>` → `>=` (same-day publish OK)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.b2b_demands DROP CONSTRAINT IF EXISTS chk_demand_deadline_after_publish;
ALTER TABLE public.b2b_demands
  ADD CONSTRAINT chk_demand_deadline_after_publish
  CHECK (deadline IS NULL OR published_at IS NULL OR deadline >= published_at::date);


-- ═══════════════════════════════════════════════════════════════
-- L-1: CHECK status b2b_demands
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.b2b_demands
  ADD CONSTRAINT chk_demand_status
  CHECK (status IN ('draft','published','filled','closed','cancelled'));


-- ═══════════════════════════════════════════════════════════════
-- L-2: CHECK status b2b_demand_offers
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.b2b_demand_offers
  ADD CONSTRAINT chk_offer_status
  CHECK (status IN ('pending','accepted','rejected','withdrawn','cancelled'));


-- ═══════════════════════════════════════════════════════════════
-- L-3 CRITICAL: Auto quantity_filled_kg + status transition
-- ═══════════════════════════════════════════════════════════════
-- Khi offer INSERT/UPDATE/DELETE với status='accepted', recompute
-- demand.quantity_filled_kg = SUM(offer.offered_quantity_kg WHERE status='accepted').
-- Auto transition demand.status:
--   - published → filled khi total_accepted >= quantity_kg
--   - filled → published khi unaccept offer kéo total xuống dưới

CREATE OR REPLACE FUNCTION public.sync_demand_filled_on_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, b2b, pg_temp
AS $$
DECLARE
  v_total_accepted NUMERIC;
  v_demand_qty NUMERIC;
  v_demand_id UUID;
  v_cur_status TEXT;
BEGIN
  v_demand_id := COALESCE(NEW.demand_id, OLD.demand_id);
  SELECT quantity_kg, status INTO v_demand_qty, v_cur_status
  FROM public.b2b_demands WHERE id = v_demand_id;
  IF v_demand_qty IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(offered_quantity_kg), 0) INTO v_total_accepted
  FROM public.b2b_demand_offers
  WHERE demand_id = v_demand_id AND status = 'accepted';

  UPDATE public.b2b_demands
  SET quantity_filled_kg = v_total_accepted,
      status = CASE
        WHEN v_total_accepted >= v_demand_qty AND v_cur_status = 'published' THEN 'filled'
        WHEN v_total_accepted < v_demand_qty AND v_cur_status = 'filled' THEN 'published'
        ELSE v_cur_status
      END,
      updated_at = NOW()
  WHERE id = v_demand_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_demand_filled ON public.b2b_demand_offers;
CREATE TRIGGER trg_sync_demand_filled
  AFTER INSERT OR UPDATE OF status, offered_quantity_kg OR DELETE
  ON public.b2b_demand_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_demand_filled_on_offer();


-- ═══════════════════════════════════════════════════════════════
-- L-5: Drop over-permissive RLS "Allow all access"
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Allow all access to b2b_demands" ON public.b2b_demands;
DROP POLICY IF EXISTS "Allow all access to b2b_demand_offers" ON public.b2b_demand_offers;


-- ═══════════════════════════════════════════════════════════════
-- L-6: log_deal_changes skip INSERT audit khi DELETE (FK violation fix)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION b2b.log_deal_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = b2b, public, pg_temp
AS $$
BEGIN
  -- DELETE: không INSERT audit row (deal row đã gone → FK audit_log.deal_id violation).
  -- Audit DELETE action nên lưu qua app_activity_log service-side thay vì trigger.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  INSERT INTO b2b.deal_audit_log (
    deal_id, changed_at, changed_by, op, old_data, new_data, changed_fields
  ) VALUES (
    NEW.id, NOW(), auth.uid(), TG_OP,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    CASE WHEN TG_OP = 'UPDATE' THEN (
      SELECT array_agg(key) FROM jsonb_each(to_jsonb(NEW))
      WHERE to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key
    ) ELSE NULL END
  );

  RETURN NEW;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- Backfill quantity_filled_kg cho existing demands có offers accepted
-- ═══════════════════════════════════════════════════════════════

UPDATE public.b2b_demands d
SET quantity_filled_kg = (
  SELECT COALESCE(SUM(offered_quantity_kg), 0)
  FROM public.b2b_demand_offers
  WHERE demand_id = d.id AND status = 'accepted'
),
updated_at = NOW()
WHERE d.id IN (SELECT DISTINCT demand_id FROM public.b2b_demand_offers);

NOTIFY pgrst, 'reload schema';
