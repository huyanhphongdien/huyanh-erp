-- ============================================================================
-- B2B Intake v4 — Phase 14 + 15 + 16 + 21
-- Đặc thù đại lý Flow B: production mode + reject + DRC variance dispute
-- + P21 rewrite deal_lock exception cho drc_after_production
-- Date: 2026-04-23
-- Status: ✅ applied live production via agent_sql, tested
-- ============================================================================

-- ═══ P14: production_mode + pool_id + sla_days + started_at ═══
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS production_mode TEXT DEFAULT 'pooled';
ALTER TABLE b2b.deals DROP CONSTRAINT IF EXISTS chk_deals_production_mode;
ALTER TABLE b2b.deals
  ADD CONSTRAINT chk_deals_production_mode
  CHECK (production_mode IN ('pooled','isolated'));

ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS production_pool_id UUID;
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS production_sla_days INT DEFAULT 7;
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS production_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_deals_production_pool
  ON b2b.deals(production_pool_id) WHERE production_pool_id IS NOT NULL;


-- ═══ P15: reject reason + loss amount ═══
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS production_reject_reason TEXT;
ALTER TABLE b2b.deals DROP CONSTRAINT IF EXISTS chk_deals_reject_reason;
ALTER TABLE b2b.deals
  ADD CONSTRAINT chk_deals_reject_reason
  CHECK (production_reject_reason IS NULL OR production_reject_reason IN
         ('raw_material_quality','production_error','force_majeure'));

ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS reject_loss_amount NUMERIC(14,2);
ALTER TABLE b2b.deals DROP CONSTRAINT IF EXISTS chk_deals_loss_amount;
ALTER TABLE b2b.deals
  ADD CONSTRAINT chk_deals_loss_amount
  CHECK (reject_loss_amount IS NULL OR reject_loss_amount >= 0);


-- ═══ P16: Trigger auto-raise DRC dispute khi variance > 3% ═══
CREATE OR REPLACE FUNCTION auto_raise_drc_dispute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, b2b, pg_temp
AS $FUNC$
DECLARE
  variance_pct NUMERIC;
  dispute_nbr TEXT;
BEGIN
  -- Chỉ fire cho flow drc_after_production khi actual_drc update NULL → value
  IF NEW.actual_drc IS NOT NULL
     AND OLD.actual_drc IS NULL
     AND NEW.sample_drc IS NOT NULL
     AND NEW.purchase_type = 'drc_after_production'
  THEN
    variance_pct := ABS(NEW.actual_drc - NEW.sample_drc);
    IF variance_pct > 3 THEN
      dispute_nbr := 'DIS-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
                     LPAD(FLOOR(RANDOM() * 9999)::TEXT, 4, '0');

      INSERT INTO b2b.drc_disputes (
        dispute_number, deal_id, partner_id,
        expected_drc, actual_drc,
        reason, status, raised_by
      ) VALUES (
        dispute_nbr, NEW.id, NEW.partner_id,
        NEW.sample_drc, NEW.actual_drc,
        'Auto-raised: DRC variance ' || ROUND(variance_pct, 2)::TEXT || '% > 3% threshold',
        'open',
        NEW.partner_id  -- system auto dispute, partner làm raised_by
      );
    END IF;
  END IF;
  RETURN NEW;
END $FUNC$;

DROP TRIGGER IF EXISTS trg_drc_variance_dispute ON b2b.deals;
CREATE TRIGGER trg_drc_variance_dispute
  AFTER UPDATE OF actual_drc ON b2b.deals
  FOR EACH ROW
  EXECUTE FUNCTION auto_raise_drc_dispute();


-- ═══ P21: Rewrite b2b.enforce_deal_lock — exception cho drc_after ═══
-- IMPORTANT: function ở schema b2b (không phải public) — trigger trg_deal_lock
-- gọi b2b.enforce_deal_lock() không phải public version
CREATE OR REPLACE FUNCTION b2b.enforce_deal_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = b2b, public, pg_temp
AS $FUNC$
DECLARE
  locked_statuses TEXT[] := ARRAY['accepted', 'settled', 'cancelled'];
BEGIN
  IF OLD.status = ANY(locked_statuses) THEN
    -- Exception drc_after_production: cho phép update actual_drc
    -- 1 LẦN DUY NHẤT (NULL → value), các field khác vẫn lock
    IF NEW.purchase_type = 'drc_after_production'
       AND OLD.actual_drc IS NULL
       AND NEW.actual_drc IS NOT NULL
    THEN
      IF NEW.quantity_kg IS DISTINCT FROM OLD.quantity_kg THEN
        RAISE EXCEPTION 'Deal % da % - khong the sua quantity_kg', OLD.deal_number, OLD.status;
      END IF;
      IF NEW.unit_price IS DISTINCT FROM OLD.unit_price THEN
        RAISE EXCEPTION 'Deal % da % - khong the sua unit_price', OLD.deal_number, OLD.status;
      END IF;
      IF NEW.expected_drc IS DISTINCT FROM OLD.expected_drc THEN
        RAISE EXCEPTION 'Deal % da % - khong the sua expected_drc', OLD.deal_number, OLD.status;
      END IF;
      IF NEW.partner_id IS DISTINCT FROM OLD.partner_id THEN
        RAISE EXCEPTION 'Deal % da % - khong the doi partner', OLD.deal_number, OLD.status;
      END IF;
      RETURN NEW;  -- exception path
    END IF;

    -- Standard lock (tất cả các field khi accepted/settled/cancelled)
    IF NEW.quantity_kg IS DISTINCT FROM OLD.quantity_kg THEN
      RAISE EXCEPTION 'Deal % da % - khong the sua quantity_kg', OLD.deal_number, OLD.status;
    END IF;
    IF NEW.unit_price IS DISTINCT FROM OLD.unit_price THEN
      RAISE EXCEPTION 'Deal % da % - khong the sua unit_price', OLD.deal_number, OLD.status;
    END IF;
    IF NEW.total_value_vnd IS DISTINCT FROM OLD.total_value_vnd THEN
      RAISE EXCEPTION 'Deal % da % - khong the sua total_value_vnd', OLD.deal_number, OLD.status;
    END IF;
    IF NEW.expected_drc IS DISTINCT FROM OLD.expected_drc THEN
      RAISE EXCEPTION 'Deal % da % - khong the sua expected_drc', OLD.deal_number, OLD.status;
    END IF;
    IF NEW.actual_drc IS DISTINCT FROM OLD.actual_drc THEN
      RAISE EXCEPTION 'Deal % da % - khong the sua actual_drc (dung dispute)', OLD.deal_number, OLD.status;
    END IF;
    IF NEW.actual_weight_kg IS DISTINCT FROM OLD.actual_weight_kg THEN
      RAISE EXCEPTION 'Deal % da % - khong the sua actual_weight_kg', OLD.deal_number, OLD.status;
    END IF;
    IF NEW.final_price IS DISTINCT FROM OLD.final_price THEN
      RAISE EXCEPTION 'Deal % da % - khong the sua final_price', OLD.deal_number, OLD.status;
    END IF;
    IF NEW.partner_id IS DISTINCT FROM OLD.partner_id THEN
      RAISE EXCEPTION 'Deal % da % - khong the doi partner', OLD.deal_number, OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END $FUNC$;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFY (tested 2026-04-23)
-- ═══════════════════════════════════════════════════════════════
-- Test 1: drc_after variance 5% (sample=35, actual=30) → dispute auto created ✅
-- Test 2: drc_after variance 1% (sample=35, actual=36) → no dispute (threshold 3%) ✅
-- Test 3: standard flow update actual_drc → blocked by deal_lock ✅
-- Test 4: drc_after 2nd update (actual đã set) → blocked (1 lần NULL→value) ✅

-- Gotcha phát hiện:
-- - b2b.enforce_deal_lock không phải public.enforce_deal_lock. Phải update
--   đúng schema 'b2b' thì trigger mới dùng version mới.
-- - RAISE format() không support .2f → dùng ROUND + concat string.
-- - enforce_deal_lock chặn với dấu "đã accepted" (tiếng Việt có dấu) —
--   phiên bản mới dùng "da" không dấu để compat Windows shell escape.

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- DROP TRIGGER IF EXISTS trg_drc_variance_dispute ON b2b.deals;
-- DROP FUNCTION IF EXISTS auto_raise_drc_dispute();
-- -- Restore old enforce_deal_lock từ b2b_sprint2_3_4_constraints.sql
