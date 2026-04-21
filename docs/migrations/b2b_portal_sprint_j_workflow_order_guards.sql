-- ============================================================================
-- B2B Portal Sprint J — Guards enforce thứ tự workflow B2B
-- Date: 2026-04-22
-- ============================================================================
-- Business rule BGĐ Huy Anh (memory b2b_workflow_order_rules.md):
--
-- Booking → Deal(processing) → QC(sample) → BGĐ Duyệt → Deal(accepted)
-- → Cân weighbridge IN → Auto stock-in → Advance → Settlement → Paid
--
-- Cân xe + nhập kho CHỈ được phép khi deal đã accepted. QC đo mẫu trước
-- (không cần stock-in) là business flow đúng.
--
-- Guards:
-- J-1: Trigger enforce_weighbridge_requires_accepted — chặn cân IN nếu deal
--      chưa accepted
-- J-2: Trigger enforce_b2b_stock_in_requires_accepted — chặn auto stock-in
--      source_type='b2b' nếu deal chưa accepted
-- J-3: DROP CHECK chk_deals_drc_requires_stockin — rule cũ require stock-in
--      trước khi QC, mâu thuẫn flow mới (QC sample trước)
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════
-- J-1: Weighbridge IN require deal.status='accepted'
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enforce_weighbridge_requires_accepted_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, b2b, pg_temp
AS $$
DECLARE
  v_deal_status TEXT;
  v_deal_number TEXT;
BEGIN
  -- Chỉ enforce khi:
  --   1. Ticket link deal_id (B2B flow, không phải sales/transfer)
  --   2. ticket_type = 'IN' (cân nhập, không áp dụng cho OUT)
  --   3. Ticket không phải cancelled (muốn hủy vẫn được)
  IF NEW.deal_id IS NULL
     OR NEW.ticket_type != 'IN'
     OR COALESCE(NEW.status, '') = 'cancelled'
  THEN
    RETURN NEW;
  END IF;

  SELECT status, deal_number INTO v_deal_status, v_deal_number
  FROM b2b.deals WHERE id = NEW.deal_id;

  IF v_deal_status IS NULL THEN
    RAISE EXCEPTION 'Deal % không tồn tại — không thể cân weighbridge', NEW.deal_id;
  END IF;

  -- Chỉ accepted/settled cho phép cân. processing/pending chưa được BGĐ duyệt.
  IF v_deal_status NOT IN ('accepted', 'settled') THEN
    RAISE EXCEPTION
      'Deal % đang ở trạng thái "%" — chỉ cân được khi deal đã DUYỆT (status=accepted). ' ||
      'Hãy báo QC đo DRC mẫu và BGĐ duyệt deal trước khi xe vào cân.',
      v_deal_number, v_deal_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_weighbridge_accepted ON public.weighbridge_tickets;
CREATE TRIGGER trg_enforce_weighbridge_accepted
  BEFORE INSERT OR UPDATE OF deal_id, ticket_type, status
  ON public.weighbridge_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_weighbridge_requires_accepted_deal();


-- ═══════════════════════════════════════════════════════════════
-- J-2: B2B stock-in require deal.status='accepted'
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enforce_b2b_stock_in_requires_accepted_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, b2b, pg_temp
AS $$
DECLARE
  v_deal_status TEXT;
  v_deal_number TEXT;
BEGIN
  -- Chỉ enforce source_type='b2b' + có deal_id. Các flow khác (purchase,
  -- production, transfer, opening_balance) không qua rule này.
  IF NEW.source_type != 'b2b' OR NEW.deal_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cho phép status='cancelled' (hủy phiếu nhập là cleanup)
  IF COALESCE(NEW.status, '') = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT status, deal_number INTO v_deal_status, v_deal_number
  FROM b2b.deals WHERE id = NEW.deal_id;

  IF v_deal_status IS NULL THEN
    RAISE EXCEPTION 'Deal % không tồn tại — không thể nhập kho B2B', NEW.deal_id;
  END IF;

  IF v_deal_status NOT IN ('accepted', 'settled') THEN
    RAISE EXCEPTION
      'Deal % đang "%" — chỉ nhập kho B2B được khi deal DUYỆT. ' ||
      'Thứ tự đúng: QC đo DRC → BGĐ duyệt → cân xe → nhập kho.',
      v_deal_number, v_deal_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_b2b_stock_in_accepted ON public.stock_in_orders;
CREATE TRIGGER trg_enforce_b2b_stock_in_accepted
  BEFORE INSERT OR UPDATE OF deal_id, source_type, status
  ON public.stock_in_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_b2b_stock_in_requires_accepted_deal();


-- ═══════════════════════════════════════════════════════════════
-- J-3: Review CHECK chk_deals_drc_requires_stockin
-- ═══════════════════════════════════════════════════════════════
-- Business flow mới: QC đo DRC mẫu (sample qua rubber_intake hoặc thủ công)
-- TRƯỚC khi cân xe/nhập kho full lô. CHECK này require stock_in_count > 0
-- trước khi nhập actual_drc → mâu thuẫn flow.
--
-- Quyết định DROP CHECK — tin vào UI validate + workflow guard (J-1/J-2 đã
-- enforce thứ tự ở stage downstream).

ALTER TABLE b2b.deals DROP CONSTRAINT IF EXISTS chk_deals_drc_requires_stockin;


-- ═══════════════════════════════════════════════════════════════
-- Reload PostgREST
-- ═══════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════

-- J-1: trigger installed
SELECT tgname, tgenabled::text AS enabled
FROM pg_trigger
WHERE tgname = 'trg_enforce_weighbridge_accepted';

-- J-2: trigger installed
SELECT tgname, tgenabled::text AS enabled
FROM pg_trigger
WHERE tgname = 'trg_enforce_b2b_stock_in_accepted';

-- J-3: CHECK đã DROP
SELECT conname
FROM pg_constraint
WHERE conname = 'chk_deals_drc_requires_stockin';
-- Expected: 0 rows


-- ═══════════════════════════════════════════════════════════════
-- TEST (optional — sandbox deal processing để check trigger chặn)
-- ═══════════════════════════════════════════════════════════════
-- -- Thử insert weighbridge ticket cho deal processing → phải raise exception
-- INSERT INTO public.weighbridge_tickets (code, vehicle_plate, ticket_type, deal_id, status)
-- VALUES ('TEST-WB-FAIL', 'TEST-01', 'IN',
--         (SELECT id FROM b2b.deals WHERE status='processing' LIMIT 1),
--         'draft');
-- Expected: ERROR "Deal ... đang ở trạng thái 'processing' — chỉ cân được khi deal đã DUYỆT"
