-- ============================================================================
-- Sprint 1.4 — Weighbridge ĐỐT + DRC support + Bridge function v2
-- Date: 2026-05-26
-- Decision D3: reuse qc_actual_drc, KHÔNG thêm drc_percent column riêng
-- ============================================================================
--
-- Mục đích:
--   Quy trình TL mủ nước nhập ĐỐT + DRC NGAY tại cân lần 2 (tare), trước khi
--   "Hoàn tất". Cần:
--     1. ADD field_dot_reading vào weighbridge_tickets (đo metrolac)
--     2. ADD consolidation_code (mã LLM gộp xe, optional input lúc cân)
--     3. Đổi nghĩa qc_actual_drc = "DRC đo tại cân" (không chỉ QC sau)
--     4. Update bridge function copy ĐỐT + qc_actual_drc sang rubber_intake_batches
--
-- Phụ thuộc: b2b_intake_field_data_tanlam.sql (cần field_dot_reading +
-- drc_percent + consolidation_code ở rubber_intake_batches)
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: ADD COLUMNS weighbridge_tickets
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='weighbridge_tickets') THEN
    RAISE NOTICE 'SKIP: weighbridge_tickets không tồn tại';
    RETURN;
  END IF;

  -- field_dot_reading — số ĐỐT đo metrolac/lactometer
  EXECUTE 'ALTER TABLE public.weighbridge_tickets ADD COLUMN IF NOT EXISTS field_dot_reading int';
  EXECUTE 'ALTER TABLE public.weighbridge_tickets DROP CONSTRAINT IF EXISTS wt_dot_reading_range';
  EXECUTE 'ALTER TABLE public.weighbridge_tickets ADD CONSTRAINT wt_dot_reading_range CHECK (field_dot_reading IS NULL OR field_dot_reading BETWEEN 100 AND 350)';
  EXECUTE $cm$
    COMMENT ON COLUMN public.weighbridge_tickets.field_dot_reading IS
      'Số ĐỐT đo trên metrolac/lactometer (latex density meter). Range typical 180-241 với mủ nước. Input lúc cân lần 2 (tare). Bridge copy sang rubber_intake_batches.field_dot_reading.'
  $cm$;

  -- consolidation_code — mã LLM gộp xe (optional, input lúc cân nếu biết)
  EXECUTE 'ALTER TABLE public.weighbridge_tickets ADD COLUMN IF NOT EXISTS consolidation_code text';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_wt_consolidation_code ON public.weighbridge_tickets(consolidation_code) WHERE consolidation_code IS NOT NULL';
  EXECUTE $cm$
    COMMENT ON COLUMN public.weighbridge_tickets.consolidation_code IS
      'Mã LLM gộp xe (vd "TMMN-07 XE 1 (19/05)"). Optional input lúc cân. Bridge copy sang rubber_intake_batches.consolidation_code.'
  $cm$;

  -- Re-comment qc_actual_drc để đổi nghĩa
  EXECUTE $cm$
    COMMENT ON COLUMN public.weighbridge_tickets.qc_actual_drc IS
      'DRC % thực tế đo tại cân (mủ nước: từ ĐỐT, mủ tạp/thành phẩm: từ QC sau). Lưu dạng percent (vd 39.2 không phải 0.392). Decision D3: reuse field này cho cả intake + QC, không tạo drc_percent riêng.'
  $cm$;

  RAISE NOTICE 'Sprint 1.4 STEP 1: field_dot_reading + consolidation_code added; qc_actual_drc semantics extended';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Bridge function v2 — copy ĐỐT + DRC + consolidation_code
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.bridge_weighbridge_to_intake(p_ticket_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ticket   record;
  v_intake_id uuid;
  v_source_type text;
  v_intake_date date;
BEGIN
  -- Lấy thông tin ticket — bao gồm field mới: field_dot_reading, qc_actual_drc, consolidation_code
  SELECT
    id, partner_id, supplier_id, deal_id, rubber_type, net_weight, gross_weight,
    vehicle_plate, ticket_type, status, created_at,
    facility_id, code,
    field_dot_reading, qc_actual_drc, consolidation_code
  INTO v_ticket
  FROM public.weighbridge_tickets
  WHERE id = p_ticket_id;

  IF NOT FOUND THEN
    RAISE NOTICE 'bridge: ticket % không tồn tại', p_ticket_id;
    RETURN NULL;
  END IF;

  -- Điều kiện cần
  IF v_ticket.status <> 'completed' THEN RETURN NULL; END IF;
  IF v_ticket.ticket_type <> 'in' THEN RETURN NULL; END IF;
  IF v_ticket.partner_id IS NULL THEN RETURN NULL; END IF;
  IF v_ticket.rubber_type NOT IN ('mu_nuoc','mu_tap','mu_dong','mu_chen','mu_to') THEN
    RETURN NULL;
  END IF;
  IF v_ticket.net_weight IS NULL OR v_ticket.net_weight <= 0 THEN RETURN NULL; END IF;

  -- Idempotent: skip nếu đã có intake cho ticket này
  SELECT id INTO v_intake_id
  FROM public.rubber_intake_batches
  WHERE weighbridge_ticket_id = p_ticket_id;
  IF FOUND THEN
    RETURN v_intake_id;
  END IF;

  -- Suy ra intake_date
  v_intake_date := COALESCE(v_ticket.created_at::date, CURRENT_DATE);

  -- Suy ra source_type theo facility
  v_source_type := 'vietnam';
  IF v_ticket.facility_id IS NOT NULL THEN
    SELECT CASE country WHEN 'LA' THEN 'lao_direct' ELSE 'vietnam' END
    INTO v_source_type
    FROM public.facilities WHERE id = v_ticket.facility_id;
  END IF;

  -- INSERT intake batch — bao gồm field mới
  INSERT INTO public.rubber_intake_batches (
    source_type, intake_date,
    b2b_partner_id, deal_id,
    raw_rubber_type,
    net_weight_kg, gross_weight_kg,
    product_code, vehicle_plate,
    facility_id,
    weighbridge_ticket_id,
    field_dot_reading,        -- NEW: copy từ ticket
    drc_percent,              -- NEW: copy từ qc_actual_drc
    consolidation_code,       -- NEW: copy từ ticket (nếu có)
    notes, status
  ) VALUES (
    v_source_type, v_intake_date,
    v_ticket.partner_id, v_ticket.deal_id,
    v_ticket.rubber_type,
    v_ticket.net_weight, v_ticket.gross_weight,
    v_ticket.rubber_type,
    v_ticket.vehicle_plate,
    v_ticket.facility_id,
    p_ticket_id,
    v_ticket.field_dot_reading,
    v_ticket.qc_actual_drc,
    v_ticket.consolidation_code,
    'Auto-tạo từ phiếu cân ' || COALESCE(v_ticket.code, p_ticket_id::text),
    'confirmed'
  )
  RETURNING id INTO v_intake_id;

  RETURN v_intake_id;
END $$;

COMMENT ON FUNCTION public.bridge_weighbridge_to_intake(uuid) IS
  'v2 (2026-05-26): copy thêm field_dot_reading, qc_actual_drc → drc_percent, consolidation_code từ ticket sang intake. Idempotent.';

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_cols int;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
  WHERE table_schema='public' AND table_name='weighbridge_tickets'
    AND column_name IN ('field_dot_reading', 'consolidation_code');
  IF v_cols <> 2 THEN
    RAISE EXCEPTION 'Sprint 1.4 FAIL: chỉ %/2 cột mới ở weighbridge_tickets', v_cols;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='bridge_weighbridge_to_intake') THEN
    RAISE EXCEPTION 'Sprint 1.4 FAIL: function bridge_weighbridge_to_intake không tồn tại';
  END IF;

  RAISE NOTICE 'VERIFY PASS — weighbridge có field_dot_reading + consolidation_code; bridge function v2 OK';
END $$;

-- ROLLBACK:
-- ALTER TABLE public.weighbridge_tickets DROP CONSTRAINT IF EXISTS wt_dot_reading_range;
-- ALTER TABLE public.weighbridge_tickets DROP COLUMN IF EXISTS consolidation_code;
-- ALTER TABLE public.weighbridge_tickets DROP COLUMN IF EXISTS field_dot_reading;
-- (bridge function restore từ b2b_weighbridge_to_intake_bridge.sql nếu cần rollback)
