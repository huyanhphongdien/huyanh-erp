-- ============================================================================
-- B2B Intake v4 — Phase 10 + 11 + 12
-- Multi-lot allocation: function + 2 triggers
-- Date: 2026-04-23
-- Status: ✅ applied live production via agent_sql, tested
-- ============================================================================
-- P10: fn allocate_ticket_item_weights()
--      - Mode 'by_share': actual = net × (declared / sum(declared))
--      - Mode 'direct':   actual = declared, reject nếu sum ≠ net (tolerance 1kg)
-- P11: Trigger AFTER INSERT/UPDATE declared/drc/unit_price trên items
-- P12: Trigger AFTER UPDATE net_weight trên tickets (WHEN has_items=TRUE)
-- ============================================================================

CREATE OR REPLACE FUNCTION allocate_ticket_item_weights()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, b2b, pg_temp
AS $FUNC$
DECLARE
  t weighbridge_tickets%ROWTYPE;
  total_declared NUMERIC;
  target_ticket_id UUID;
BEGIN
  -- Xác định ticket_id tùy trigger source (items hay ticket)
  IF TG_TABLE_NAME = 'weighbridge_ticket_items' THEN
    target_ticket_id := COALESCE(NEW.ticket_id, OLD.ticket_id);
  ELSE
    target_ticket_id := NEW.id;
  END IF;

  SELECT * INTO t FROM weighbridge_tickets WHERE id = target_ticket_id;

  -- Skip nếu chưa cân hoặc không phải multi-lot
  IF t.net_weight IS NULL OR NOT t.has_items THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT SUM(declared_qty_kg) INTO total_declared
  FROM weighbridge_ticket_items WHERE ticket_id = t.id;

  IF t.allocation_mode = 'by_share' AND total_declared > 0 THEN
    -- Prorata: actual = net × share
    UPDATE weighbridge_ticket_items
    SET actual_qty_kg = ROUND(t.net_weight * declared_qty_kg / total_declared, 2),
        line_amount_vnd = ROUND(
          t.net_weight * declared_qty_kg / total_declared
          * COALESCE(drc_percent, 100) / 100
          * COALESCE(unit_price, 0), 0),
        updated_at = NOW()
    WHERE ticket_id = t.id;

  ELSIF t.allocation_mode = 'direct' THEN
    -- Strict match: sum(declared) phải = net ± 1kg tolerance
    IF ABS(COALESCE(total_declared, 0) - t.net_weight) > 1 THEN
      RAISE EXCEPTION 'Mode direct: tong declared (%) phai khop NET (%)',
        total_declared, t.net_weight;
    END IF;
    UPDATE weighbridge_ticket_items
    SET actual_qty_kg = declared_qty_kg,
        line_amount_vnd = ROUND(
          declared_qty_kg * COALESCE(drc_percent, 100) / 100 * COALESCE(unit_price, 0), 0),
        updated_at = NOW()
    WHERE ticket_id = t.id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $FUNC$;

-- P11: Trigger trên items (INSERT hoặc UPDATE field ảnh hưởng allocate)
DROP TRIGGER IF EXISTS trg_items_allocate_on_insert ON weighbridge_ticket_items;
CREATE TRIGGER trg_items_allocate_on_insert
  AFTER INSERT OR UPDATE OF declared_qty_kg, drc_percent, unit_price
  ON weighbridge_ticket_items
  FOR EACH ROW EXECUTE FUNCTION allocate_ticket_item_weights();

-- P12: Trigger trên tickets khi net_weight được set (cân xong)
DROP TRIGGER IF EXISTS trg_ticket_allocate_on_weigh ON weighbridge_tickets;
CREATE TRIGGER trg_ticket_allocate_on_weigh
  AFTER UPDATE OF net_weight ON weighbridge_tickets
  FOR EACH ROW WHEN (NEW.has_items = TRUE)
  EXECUTE FUNCTION allocate_ticket_item_weights();

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFY (tested 2026-04-23)
-- ═══════════════════════════════════════════════════════════════
-- Test by_share:
-- NET=985, declared=[500,300,200], drc=[30,35,28], price=[10000,13000,9000]
-- Expected:
--   Line 1: actual=492.5  amount=1477500  (985×0.5×0.3×10000)
--   Line 2: actual=295.5  amount=1344525  (985×0.3×0.35×13000)
--   Line 3: actual=197    amount=496440   (985×0.2×0.28×9000)
-- Result: ✅ PASS

-- Test direct reject:
-- NET=985, declared sum=1000 (500+500), diff 15 > 1
-- Expected: RAISE EXCEPTION "Mode direct: tong declared (1000) phai khop NET (985)"
-- Result: ✅ PASS

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- DROP TRIGGER IF EXISTS trg_items_allocate_on_insert ON weighbridge_ticket_items;
-- DROP TRIGGER IF EXISTS trg_ticket_allocate_on_weigh ON weighbridge_tickets;
-- DROP FUNCTION IF EXISTS allocate_ticket_item_weights();
