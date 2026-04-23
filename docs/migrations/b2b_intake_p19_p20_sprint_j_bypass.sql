-- ============================================================================
-- B2B Intake v4 — Phase 19 + 20
-- Sprint J triggers bypass cho outright + farmer_walkin flows
-- Date: 2026-04-23
-- Status: ✅ applied live production via agent_sql, tested
-- ============================================================================
-- P19: Rewrite enforce_weighbridge_requires_accepted_deal
--      - Bypass cho purchase_type IN (outright, farmer_walkin)
--      - Multi-lot support: check từng item.deal_id
-- P20: Rewrite enforce_b2b_stock_in_requires_accepted_deal — tương tự
-- ============================================================================

-- ═══ P19: Weighbridge guard rewrite ═══
CREATE OR REPLACE FUNCTION public.enforce_weighbridge_requires_accepted_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, b2b, pg_temp
AS $FUNC$
DECLARE
  v_deal_status TEXT;
  v_deal_number TEXT;
  v_purchase_type TEXT;
  v_has_items BOOLEAN;
  v_bad_deal_number TEXT;
BEGIN
  -- Guard chỉ áp dụng cho ticket_type='in', bỏ qua cancelled/void
  IF NEW.ticket_type != 'in' OR COALESCE(NEW.status,'') IN ('cancelled','void') THEN
    RETURN NEW;
  END IF;

  v_has_items := COALESCE(NEW.has_items, FALSE);

  -- Case A: Scalar ticket (has_items=false) — check deal_id duy nhất
  IF NOT v_has_items THEN
    IF NEW.deal_id IS NULL THEN RETURN NEW; END IF;

    SELECT status, deal_number, purchase_type
    INTO v_deal_status, v_deal_number, v_purchase_type
    FROM b2b.deals WHERE id = NEW.deal_id;

    IF v_deal_status IS NULL THEN
      RAISE EXCEPTION 'Deal % khong ton tai - khong the can weighbridge', NEW.deal_id;
    END IF;

    -- BYPASS cho outright + farmer_walkin (không cần BGĐ duyệt)
    IF v_purchase_type IN ('outright','farmer_walkin') THEN
      RETURN NEW;
    END IF;

    -- Standard + drc_after_production: chỉ cân khi accepted/settled
    IF v_deal_status NOT IN ('accepted','settled') THEN
      RAISE EXCEPTION 'Deal % dang "%" - chi can duoc khi deal da DUYET. Thu tu: QC -> Duyet -> Can -> Nhap kho.',
        v_deal_number, v_deal_status;
    END IF;

    RETURN NEW;
  END IF;

  -- Case B: Multi-lot ticket (has_items=true) — loop items + check từng deal
  SELECT d.deal_number INTO v_bad_deal_number
  FROM weighbridge_ticket_items i
  JOIN b2b.deals d ON d.id = i.deal_id
  WHERE i.ticket_id = NEW.id
    AND i.deal_id IS NOT NULL
    AND d.status NOT IN ('accepted','settled')
    AND d.purchase_type NOT IN ('outright','farmer_walkin')
  LIMIT 1;

  IF v_bad_deal_number IS NOT NULL THEN
    RAISE EXCEPTION 'Deal % chua DUYET - can ticket multi-lot bi chan', v_bad_deal_number;
  END IF;

  RETURN NEW;
END $FUNC$;


-- ═══ P20: Stock-in B2B guard rewrite ═══
CREATE OR REPLACE FUNCTION public.enforce_b2b_stock_in_requires_accepted_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, b2b, pg_temp
AS $FUNC$
DECLARE
  v_deal_status TEXT;
  v_deal_number TEXT;
  v_purchase_type TEXT;
BEGIN
  IF NEW.source_type != 'b2b' OR NEW.deal_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status,'') = 'cancelled' THEN RETURN NEW; END IF;

  SELECT status, deal_number, purchase_type
  INTO v_deal_status, v_deal_number, v_purchase_type
  FROM b2b.deals WHERE id = NEW.deal_id;

  IF v_deal_status IS NULL THEN
    RAISE EXCEPTION 'Deal % khong ton tai - khong the nhap kho B2B', NEW.deal_id;
  END IF;

  -- BYPASS cho outright + farmer_walkin
  IF v_purchase_type IN ('outright','farmer_walkin') THEN
    RETURN NEW;
  END IF;

  -- Standard + drc_after_production: chỉ nhập kho khi deal đã accepted
  IF v_deal_status NOT IN ('accepted','settled') THEN
    RAISE EXCEPTION 'Deal % dang "%" - chi nhap kho B2B khi deal da DUYET. Thu tu: QC -> Duyet -> Can -> Nhap kho.',
      v_deal_number, v_deal_status;
  END IF;

  RETURN NEW;
END $FUNC$;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFY (tested 2026-04-23)
-- ═══════════════════════════════════════════════════════════════
-- Test 1: outright deal processing → cân OK (bypass) ✅
-- Test 2: standard deal processing → cân reject (guard fire) ✅
-- Test 3: farmer_walkin processing → cân OK (bypass) ✅

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK — restore original từ Sprint J
-- ═══════════════════════════════════════════════════════════════
-- Cần lấy version cũ từ docs/migrations/b2b_portal_sprint_j_workflow_order_guards.sql
-- hoặc Sprint P (weighbridge fix lowercase)
