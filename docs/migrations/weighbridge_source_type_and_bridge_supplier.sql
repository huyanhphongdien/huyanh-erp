-- ============================================================================
-- weighbridge_tickets.source_type + bridge mở rộng supplier_id (Commit C)
-- Date: 2026-05-30
-- ============================================================================
-- 1) Thêm cột source_type ('deal'|'supplier'|'partner_direct'|'transfer') vào
--    weighbridge_tickets — backfill từ deal_id/supplier_id/partner_id hiện có.
-- 2) Cập nhật bridge_weighbridge_to_intake để xử lý supplier_id (mủ Lào / NCC lẻ):
--    cho phép tạo intake khi partner_id NULL nhưng supplier_id NOT NULL.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: ADD COLUMN source_type
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.weighbridge_tickets
    ADD COLUMN IF NOT EXISTS source_type text
    CHECK (source_type IS NULL OR source_type IN (''deal'',''supplier'',''partner_direct'',''transfer''))';

  EXECUTE $cm$
    COMMENT ON COLUMN public.weighbridge_tickets.source_type IS
      'Nguồn phiếu cân: deal (chat→deal), supplier (NCC lẻ Lào), partner_direct (bộc phát đại lý B2B), transfer (chuyển kho nội bộ). Lưu UI state để khỏi đoán qua FK.'
  $cm$;

  CREATE INDEX IF NOT EXISTS idx_wb_source_type
    ON public.weighbridge_tickets(source_type)
    WHERE source_type IS NOT NULL;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: BACKFILL source_type cho rows hiện có (đoán qua FK)
-- ════════════════════════════════════════════════════════════════════════════
UPDATE public.weighbridge_tickets
SET source_type = CASE
  WHEN deal_id IS NOT NULL THEN 'deal'
  WHEN supplier_id IS NOT NULL THEN 'supplier'
  WHEN partner_id IS NOT NULL THEN 'partner_direct'
  ELSE NULL
END
WHERE source_type IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: Cập nhật bridge function — mở rộng cho supplier_id
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.bridge_weighbridge_to_intake(p_ticket_id uuid)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_ticket record;
  v_intake_id uuid;
  v_source_type text;
  v_intake_date date;
BEGIN
  SELECT
    id, partner_id, supplier_id, deal_id, rubber_type, net_weight, gross_weight,
    vehicle_plate, ticket_type, status, created_at,
    facility_id, code
  INTO v_ticket
  FROM public.weighbridge_tickets
  WHERE id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE NOTICE 'bridge: ticket % không tồn tại', p_ticket_id;
    RETURN NULL;
  END IF;

  IF v_ticket.status <> 'completed' THEN RETURN NULL; END IF;
  IF v_ticket.ticket_type <> 'in'   THEN RETURN NULL; END IF;

  -- MỞ RỘNG: cho phép partner_id HOẶC supplier_id (supplier = mủ Lào / NCC lẻ).
  IF v_ticket.partner_id IS NULL AND v_ticket.supplier_id IS NULL THEN
    RAISE NOTICE 'bridge: ticket % không có partner_id lẫn supplier_id, skip', p_ticket_id;
    RETURN NULL;
  END IF;

  IF v_ticket.rubber_type NOT IN ('mu_nuoc','mu_tap','mu_dong','mu_chen','mu_to') THEN
    RETURN NULL;
  END IF;
  IF v_ticket.net_weight IS NULL OR v_ticket.net_weight <= 0 THEN
    RETURN NULL;
  END IF;

  -- Idempotent
  SELECT id INTO v_intake_id
  FROM public.rubber_intake_batches
  WHERE weighbridge_ticket_id = p_ticket_id;
  IF FOUND THEN RETURN v_intake_id; END IF;

  v_intake_date := COALESCE(v_ticket.created_at::date, CURRENT_DATE);

  -- Suy source_type cho intake:
  --   - Có supplier_id → 'lao_direct' (Lào) hoặc 'vietnam' theo facility.country
  --   - Có partner_id (chỉ B2B) → 'vietnam' (mặc định)
  v_source_type := 'vietnam';
  IF v_ticket.facility_id IS NOT NULL THEN
    SELECT CASE country WHEN 'LA' THEN 'lao_direct' ELSE 'vietnam' END
    INTO v_source_type
    FROM public.facilities
    WHERE id = v_ticket.facility_id;
  END IF;

  -- INSERT intake batch — set b2b_partner_id HOẶC supplier_id tuỳ source.
  INSERT INTO public.rubber_intake_batches (
    source_type, intake_date,
    b2b_partner_id, supplier_id, deal_id,
    raw_rubber_type,
    net_weight_kg, gross_weight_kg,
    product_code, vehicle_plate,
    facility_id,
    weighbridge_ticket_id,
    notes, status
  ) VALUES (
    v_source_type, v_intake_date,
    v_ticket.partner_id, v_ticket.supplier_id, v_ticket.deal_id,
    v_ticket.rubber_type,
    v_ticket.net_weight, v_ticket.gross_weight,
    v_ticket.rubber_type,
    v_ticket.vehicle_plate,
    v_ticket.facility_id,
    p_ticket_id,
    'Auto-tạo từ phiếu cân ' || COALESCE(v_ticket.code, p_ticket_id::text),
    'confirmed'
  )
  RETURNING id INTO v_intake_id;

  RETURN v_intake_id;
END;
$$;

COMMENT ON FUNCTION public.bridge_weighbridge_to_intake(uuid) IS
  'Tạo rubber_intake_batches từ 1 weighbridge_tickets. Cho phép partner_id (B2B bộc phát/deal) HOẶC supplier_id (NCC lẻ/Lào). Idempotent.';

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_col boolean;
  v_indexed int;
  v_by_source jsonb;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='weighbridge_tickets' AND column_name='source_type')
    INTO v_col;
  SELECT count(*) INTO v_indexed
    FROM public.weighbridge_tickets WHERE source_type IS NOT NULL;
  SELECT jsonb_object_agg(COALESCE(source_type,'null'), c) INTO v_by_source
    FROM (SELECT source_type, count(*) c FROM public.weighbridge_tickets GROUP BY 1) t;

  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'weighbridge.source_type VERIFY:';
  RAISE NOTICE '  • Column exists:        %', v_col;
  RAISE NOTICE '  • Backfilled rows:      %', v_indexed;
  RAISE NOTICE '  • Distribution:         %', v_by_source;
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

-- ROLLBACK:
-- DROP INDEX IF EXISTS public.idx_wb_source_type;
-- ALTER TABLE public.weighbridge_tickets DROP COLUMN IF EXISTS source_type;
-- (bridge function: restore từ b2b_weighbridge_to_intake_bridge.sql)
