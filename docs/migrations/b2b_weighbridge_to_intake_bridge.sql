-- ============================================================================
-- B2B Weighbridge Bridge — Auto-tạo rubber_intake_batches từ weighbridge_tickets
-- Date: 2026-05-26
-- ============================================================================
--
-- Mục đích:
--   Khi operator hoàn tất phiếu cân (status='completed') có đủ:
--     - ticket_type = 'in' (phiếu nhập)
--     - partner_id IS NOT NULL (đã link đại lý B2B qua deal hoặc chọn trực tiếp)
--     - rubber_type IN ('mu_nuoc','mu_tap','mu_dong','mu_chen','mu_to') (cho bonus)
--     - net_weight > 0
--   → tự INSERT vào rubber_intake_batches với raw_rubber_type tương ứng
--   → trigger derive rubber_type (2 loại bonus) → compute_monthly_bonus
--
-- Idempotent: track qua cột mới `weighbridge_ticket_id` trên rubber_intake_batches.
-- 1 ticket → max 1 intake batch.
--
-- Phụ thuộc:
--   - b2b_bonus_system.sql, b2b_intake_raw_rubber_type.sql, b2b_intake_manual_entry.sql
--   - weighbridge_tickets phải có cột: partner_id, rubber_type, net_weight, gross_weight,
--     vehicle_plate, deal_id, ticket_type, status, completed_at, created_at, facility_id
-- ROLLBACK: cuối file.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: ADD COLUMN weighbridge_ticket_id (tracking idempotent)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='rubber_intake_batches'
  ) THEN
    RAISE NOTICE 'SKIP: rubber_intake_batches không tồn tại.';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.rubber_intake_batches ADD COLUMN IF NOT EXISTS weighbridge_ticket_id uuid';
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_rubber_intake_batches_weighbridge_ticket_id ON public.rubber_intake_batches(weighbridge_ticket_id) WHERE weighbridge_ticket_id IS NOT NULL';
  EXECUTE $cm$
    COMMENT ON COLUMN public.rubber_intake_batches.weighbridge_ticket_id IS
      'Link tới weighbridge_tickets.id (nếu được tạo từ phiếu cân). UNIQUE → 1 ticket = max 1 intake.'
  $cm$;

  RAISE NOTICE 'STEP 1: weighbridge_ticket_id added + unique index.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: FUNCTION bridge_weighbridge_to_intake(ticket_id)
-- ════════════════════════════════════════════════════════════════════════════
-- Gọi để tạo 1 intake batch từ 1 ticket cụ thể.
-- Idempotent: skip nếu intake đã tồn tại cho ticket này.
-- Skip nếu thiếu điều kiện (partner_id NULL, rubber_type='svr', net_weight <=0...).

CREATE OR REPLACE FUNCTION public.bridge_weighbridge_to_intake(p_ticket_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ticket   record;
  v_intake_id uuid;
  v_source_type text;
  v_intake_date date;
BEGIN
  -- Lấy thông tin ticket — chỉ cột chắc chắn có.
  -- (vehicle_label, invoice_no không tồn tại trong schema hiện tại.)
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

  -- Điều kiện cần thiết
  IF v_ticket.status <> 'completed' THEN
    RETURN NULL;
  END IF;
  IF v_ticket.ticket_type <> 'in' THEN
    RETURN NULL;
  END IF;
  IF v_ticket.partner_id IS NULL THEN
    -- Không link đại lý → không tạo intake (không tính bonus được)
    RETURN NULL;
  END IF;
  IF v_ticket.rubber_type NOT IN ('mu_nuoc','mu_tap','mu_dong','mu_chen','mu_to') THEN
    -- 'svr' hoặc NULL → không vào bonus
    RETURN NULL;
  END IF;
  IF v_ticket.net_weight IS NULL OR v_ticket.net_weight <= 0 THEN
    RETURN NULL;
  END IF;

  -- Idempotent: skip nếu đã có intake cho ticket này
  SELECT id INTO v_intake_id
  FROM public.rubber_intake_batches
  WHERE weighbridge_ticket_id = p_ticket_id;
  IF FOUND THEN
    RETURN v_intake_id;
  END IF;

  -- Suy ra intake_date từ created_at (weighbridge_tickets không có completed_at trong schema này)
  v_intake_date := COALESCE(v_ticket.created_at::date, CURRENT_DATE);

  -- Suy ra source_type theo facility (đoán đơn giản: nếu facility_id null → vietnam)
  v_source_type := 'vietnam';
  IF v_ticket.facility_id IS NOT NULL THEN
    SELECT CASE country WHEN 'LA' THEN 'lao_direct' ELSE 'vietnam' END
    INTO v_source_type
    FROM public.facilities
    WHERE id = v_ticket.facility_id;
  END IF;

  -- INSERT intake batch
  INSERT INTO public.rubber_intake_batches (
    source_type, intake_date,
    b2b_partner_id, deal_id,
    raw_rubber_type,             -- DB trigger derive rubber_type
    net_weight_kg, gross_weight_kg,
    product_code, vehicle_plate,
    facility_id,
    weighbridge_ticket_id,
    notes, status
  ) VALUES (
    v_source_type, v_intake_date,
    v_ticket.partner_id, v_ticket.deal_id,
    v_ticket.rubber_type,        -- mu_* → trigger sẽ map sang tap/nuoc
    v_ticket.net_weight, v_ticket.gross_weight,
    v_ticket.rubber_type,        -- product_code = raw_rubber_type as default
    v_ticket.vehicle_plate,
    v_ticket.facility_id,
    p_ticket_id,
    'Auto-tạo từ phiếu cân ' || COALESCE(v_ticket.code, p_ticket_id::text),
    'confirmed'                  -- ticket completed = intake confirmed
  )
  RETURNING id INTO v_intake_id;

  RETURN v_intake_id;
END;
$$;

COMMENT ON FUNCTION public.bridge_weighbridge_to_intake(uuid) IS
  'Tạo rubber_intake_batches từ 1 weighbridge_tickets nếu đủ điều kiện. Idempotent.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: TRIGGER AFTER UPDATE weighbridge_tickets → bridge
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_weighbridge_ticket_bridge()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Chỉ fire khi status mới = 'completed' (chuyển sang completed)
  IF NEW.status = 'completed' THEN
    PERFORM public.bridge_weighbridge_to_intake(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_weighbridge_ticket_bridge ON public.weighbridge_tickets;
CREATE TRIGGER trg_weighbridge_ticket_bridge
AFTER INSERT OR UPDATE OF status, partner_id, rubber_type, net_weight
ON public.weighbridge_tickets
FOR EACH ROW
EXECUTE FUNCTION public.trg_weighbridge_ticket_bridge();

COMMENT ON FUNCTION public.trg_weighbridge_ticket_bridge() IS
  'AFTER UPDATE weighbridge_tickets → tự tạo rubber_intake_batches nếu đủ điều kiện.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: BACKFILL — gom các ticket completed cũ
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r record;
  v_count int := 0;
  v_intake_id uuid;
BEGIN
  FOR r IN
    SELECT id
    FROM public.weighbridge_tickets
    WHERE status = 'completed'
      AND ticket_type = 'in'
      AND partner_id IS NOT NULL
      AND rubber_type IN ('mu_nuoc','mu_tap','mu_dong','mu_chen','mu_to')
      AND net_weight IS NOT NULL AND net_weight > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.rubber_intake_batches rib
        WHERE rib.weighbridge_ticket_id = weighbridge_tickets.id
      )
    ORDER BY created_at
  LOOP
    v_intake_id := public.bridge_weighbridge_to_intake(r.id);
    IF v_intake_id IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'STEP 4: Backfill % intake batches từ weighbridge_tickets cũ', v_count;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: NOTIFY + VERIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_col_exists boolean;
  v_total_tickets int;
  v_total_bridged int;
  v_eligible_tickets int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='rubber_intake_batches'
      AND column_name='weighbridge_ticket_id'
  ) INTO v_col_exists;
  IF NOT v_col_exists THEN
    RAISE EXCEPTION 'VERIFY FAIL: weighbridge_ticket_id chưa được tạo';
  END IF;

  SELECT count(*) INTO v_total_tickets FROM public.weighbridge_tickets;
  SELECT count(*) INTO v_total_bridged
    FROM public.rubber_intake_batches WHERE weighbridge_ticket_id IS NOT NULL;
  SELECT count(*) INTO v_eligible_tickets
    FROM public.weighbridge_tickets
    WHERE status = 'completed' AND ticket_type = 'in'
      AND partner_id IS NOT NULL
      AND rubber_type IN ('mu_nuoc','mu_tap','mu_dong','mu_chen','mu_to')
      AND net_weight > 0;

  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'VERIFY PASS — weighbridge bridge sẵn sàng.';
  RAISE NOTICE '  Tổng tickets: %', v_total_tickets;
  RAISE NOTICE '  Tickets eligible (completed, có partner, rubber_type mu_*): %', v_eligible_tickets;
  RAISE NOTICE '  Intakes đã tạo từ tickets: %', v_total_bridged;
  IF v_eligible_tickets > v_total_bridged THEN
    RAISE NOTICE '  ⚠ Còn % ticket chưa bridge (có thể trùng partner+rubber_type cũ?)',
      v_eligible_tickets - v_total_bridged;
  END IF;
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK:
-- ════════════════════════════════════════════════════════════════════════════
-- DROP TRIGGER IF EXISTS trg_weighbridge_ticket_bridge ON public.weighbridge_tickets;
-- DROP FUNCTION IF EXISTS public.trg_weighbridge_ticket_bridge();
-- DROP FUNCTION IF EXISTS public.bridge_weighbridge_to_intake(uuid);
-- DELETE FROM public.rubber_intake_batches
--   WHERE weighbridge_ticket_id IS NOT NULL
--     AND notes LIKE 'Auto-tạo từ phiếu cân%';
-- DROP INDEX IF EXISTS uq_rubber_intake_batches_weighbridge_ticket_id;
-- ALTER TABLE public.rubber_intake_batches DROP COLUMN IF EXISTS weighbridge_ticket_id;
