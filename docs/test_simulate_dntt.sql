-- ============================================================================
-- TEST SIMULATE — Tự tạo 1 ĐNTT mẫu cho ngày 2026-05-26 (Luồng B end-to-end)
-- Date: 2026-05-30
-- ============================================================================
-- Mô phỏng đầy đủ paymentRequestService.create():
--   1. Tạo header payment_request (TMMN-SEED-001)
--   2. Insert lines cho mỗi phiếu cân ngày 26/05 (price từ PCG, payee từ bank
--      resolver có proxy chain)
--   3. Insert dòng "Phí áp dụng (PCG xxx)" với amount âm nếu PCG có fees
--   4. Update weighbridge_tickets.payment_request_id (chống gom trùng)
--   5. Mark PCG status='used'
--
-- IDEMPOTENT: skip nếu ĐNTT TMMN-SEED-001 đã tồn tại. Re-run an toàn.
-- Để re-test: chạy ROLLBACK ở cuối file rồi chạy lại.
-- ============================================================================

DO $$
DECLARE
  v_pr_id uuid;
  v_facility_id uuid;
  v_existing uuid;
  v_total_inserted int := 0;
  v_pcg_id uuid;
  v_pcg_code text;
  v_pcg_fees jsonb;
  v_total_dry_kg numeric := 0;
  v_per_ton_fee numeric := 0;
  v_per_lot_fee numeric := 0;
  v_total_fee numeric := 0;
  r record;
BEGIN
  -- ──────────────────────────────────────────────────────────────────────
  -- IDEMPOTENT CHECK
  -- ──────────────────────────────────────────────────────────────────────
  SELECT id INTO v_existing FROM public.payment_requests WHERE code='TMMN-SEED-001';
  IF v_existing IS NOT NULL THEN
    RAISE NOTICE 'SKIP: ĐNTT TMMN-SEED-001 đã tồn tại (%). Dùng ROLLBACK cuối file để xoá rồi chạy lại.', v_existing;
    RETURN;
  END IF;

  SELECT id INTO v_facility_id FROM public.facilities WHERE code='TL' LIMIT 1;
  IF v_facility_id IS NULL THEN
    RAISE EXCEPTION 'facility TL không tồn tại';
  END IF;

  -- ──────────────────────────────────────────────────────────────────────
  -- STEP 1: Tạo header ĐNTT
  -- ──────────────────────────────────────────────────────────────────────
  INSERT INTO public.payment_requests (
    code, facility_id, request_date, rubber_type,
    title, currency, status, note
  ) VALUES (
    'TMMN-SEED-001', v_facility_id, DATE '2026-05-26', 'mu_nuoc',
    'Mủ nước Tân Lâm 26/05/2026 (test E2E)', 'VND', 'draft',
    'SEED-SIMULATE-DNTT'
  ) RETURNING id INTO v_pr_id;

  RAISE NOTICE 'STEP 1: Created ĐNTT TMMN-SEED-001 = %', v_pr_id;

  -- ──────────────────────────────────────────────────────────────────────
  -- STEP 2: Insert lines cho phiếu cân ngày 26/05
  -- Resolver: deal_id → deal.unit_price; bộc phát → PCG; else manual.
  -- Bank: own bank, fallback proxy bank, fallback ''.
  -- ──────────────────────────────────────────────────────────────────────
  WITH ticket_rows AS (
    SELECT
      t.id AS ticket_id,
      t.code AS ticket_code,
      t.partner_id,
      t.deal_id,
      t.supplier_id,
      t.rubber_type,
      t.vehicle_plate,
      t.net_weight,
      t.qc_actual_drc,
      p.name AS partner_name,
      round((t.net_weight * t.qc_actual_drc / 100)::numeric, 2) AS dry_kg,
      -- Bank: own → proxy → null
      COALESCE(proxy_b.bank_account, own_b.bank_account) AS bank_account,
      COALESCE(proxy_b.bank_holder, own_b.bank_holder) AS bank_holder,
      COALESCE(proxy_b.bank_name, own_b.bank_name) AS bank_name,
      CASE WHEN proxy_b.bank_account IS NOT NULL
           THEN proxy_p.name END AS proxy_partner_name
    FROM public.weighbridge_tickets t
    JOIN b2b.partners p ON p.id = t.partner_id
    LEFT JOIN public.b2b_partner_banks own_b
      ON own_b.partner_id = p.id AND own_b.is_default=true AND own_b.is_active=true
    LEFT JOIN b2b.partners proxy_p ON proxy_p.id = p.payment_proxy_partner_id
    LEFT JOIN public.b2b_partner_banks proxy_b
      ON proxy_b.partner_id = proxy_p.id AND proxy_b.is_default=true AND proxy_b.is_active=true
    WHERE t.notes='SEED-TLM-E2E-2026-05'
      AND t.created_at::date = DATE '2026-05-26'
      AND t.status='completed'
  ),
  pcg_match AS (
    SELECT
      tr.ticket_id,
      pcg.id AS pcg_id,
      pcg.code AS pcg_code,
      pcg.fees AS pcg_fees,
      (line->>'price_per_ton')::numeric AS price_per_ton
    FROM ticket_rows tr
    LEFT JOIN public.b2b_price_lock_tickets pcg
      ON pcg.note='SEED-TLM-E2E-2026-05'
     AND pcg.facility_id = (SELECT id FROM public.facilities WHERE code='TL')
     AND pcg.status IN ('locked','used')
     AND DATE '2026-05-26' BETWEEN COALESCE(pcg.weigh_from, pcg.lock_date)
                              AND COALESCE(pcg.weigh_to, pcg.lock_date)
    LEFT JOIN LATERAL jsonb_array_elements(pcg.dealer_lines) line
      ON (line->>'partner_id')::uuid = tr.partner_id
  )
  INSERT INTO public.payment_request_lines (
    payment_request_id, ticket_id, source_type,
    deal_id, partner_id, supplier_id,
    payee_name, payee_note,
    rubber_type, vehicle_plate,
    weight, unit_price, amount,
    note, sort_order
  )
  SELECT
    v_pr_id, tr.ticket_id,
    CASE
      WHEN tr.deal_id IS NOT NULL THEN 'deal'
      WHEN tr.supplier_id IS NOT NULL THEN 'supplier'
      ELSE 'manual'
    END,
    tr.deal_id, tr.partner_id, tr.supplier_id,
    tr.partner_name,
    -- payee_note: bank info + proxy note
    CASE
      WHEN tr.bank_account IS NULL THEN ''
      ELSE 'STK: ' || tr.bank_account
        || COALESCE(' — ' || tr.bank_holder, '')
        || COALESCE(' — ' || tr.bank_name, '')
        || COALESCE(' (chuyển hộ qua ' || tr.proxy_partner_name || ')', '')
    END,
    tr.rubber_type, tr.vehicle_plate,
    tr.dry_kg,
    COALESCE(pm.price_per_ton / 1000, 0),  -- đ/kg
    -- amount: dry × price (đ/kg), làm tròn nghìn
    CASE WHEN pm.price_per_ton IS NULL THEN 0
         ELSE round((tr.dry_kg * pm.price_per_ton / 1000) / 1000) * 1000
    END,
    tr.ticket_code,
    row_number() OVER (ORDER BY tr.ticket_code) - 1
  FROM ticket_rows tr
  LEFT JOIN pcg_match pm ON pm.ticket_id = tr.ticket_id;

  GET DIAGNOSTICS v_total_inserted = ROW_COUNT;
  RAISE NOTICE 'STEP 2: Inserted % normal lines', v_total_inserted;

  -- ──────────────────────────────────────────────────────────────────────
  -- STEP 3: Insert dòng "Phí áp dụng (PCG xxx)" với amount âm
  -- ──────────────────────────────────────────────────────────────────────
  FOR r IN
    SELECT
      pcg.id, pcg.code, pcg.fees,
      sum(round((t.net_weight * t.qc_actual_drc / 100)::numeric, 2)) AS total_dry_kg
    FROM public.weighbridge_tickets t
    JOIN public.b2b_price_lock_tickets pcg
      ON pcg.note='SEED-TLM-E2E-2026-05'
     AND pcg.facility_id = t.facility_id
     AND pcg.status IN ('locked','used')
     AND t.created_at::date BETWEEN COALESCE(pcg.weigh_from, pcg.lock_date)
                                AND COALESCE(pcg.weigh_to, pcg.lock_date)
    CROSS JOIN LATERAL jsonb_array_elements(pcg.dealer_lines) line
    WHERE t.notes='SEED-TLM-E2E-2026-05'
      AND t.created_at::date = DATE '2026-05-26'
      AND t.status='completed'
      AND (line->>'partner_id')::uuid = t.partner_id
    GROUP BY pcg.id, pcg.code, pcg.fees
  LOOP
    SELECT
      COALESCE(SUM(CASE WHEN fee->>'basis'='ton' THEN (fee->>'amount')::numeric ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN fee->>'basis'='lot' THEN (fee->>'amount')::numeric ELSE 0 END), 0)
    INTO v_per_ton_fee, v_per_lot_fee
    FROM jsonb_array_elements(r.fees) fee;

    v_total_fee := v_per_ton_fee * (r.total_dry_kg / 1000) + v_per_lot_fee;
    v_total_fee := round(v_total_fee / 1000) * 1000;  -- làm tròn nghìn

    IF v_total_fee > 0 THEN
      INSERT INTO public.payment_request_lines (
        payment_request_id, source_type, payee_name,
        weight, unit_price, amount,
        note, sort_order
      ) VALUES (
        v_pr_id, 'manual',
        'Phí áp dụng (PCG ' || r.code || ')',
        0, 0, -v_total_fee,
        'KL khô tổng ' || round(r.total_dry_kg/1000, 2)::text || ' tấn',
        v_total_inserted + 100  -- sort sau cùng
      );
      RAISE NOTICE 'STEP 3: Inserted phí line PCG % = -%đ', r.code, v_total_fee;
    END IF;
  END LOOP;

  -- ──────────────────────────────────────────────────────────────────────
  -- STEP 4: Update tickets.payment_request_id (chống gom trùng)
  -- ──────────────────────────────────────────────────────────────────────
  UPDATE public.weighbridge_tickets
  SET payment_request_id = v_pr_id
  WHERE id IN (
    SELECT ticket_id FROM public.payment_request_lines
    WHERE payment_request_id = v_pr_id AND ticket_id IS NOT NULL
  );

  -- ──────────────────────────────────────────────────────────────────────
  -- STEP 5: Mark PCG status='used' (chỉ chuyển nếu đang locked)
  -- ──────────────────────────────────────────────────────────────────────
  UPDATE public.b2b_price_lock_tickets
  SET status='used'
  WHERE id IN (
    SELECT DISTINCT pcg.id
    FROM public.weighbridge_tickets t
    JOIN public.b2b_price_lock_tickets pcg
      ON pcg.note='SEED-TLM-E2E-2026-05'
     AND pcg.facility_id = t.facility_id
     AND t.created_at::date BETWEEN COALESCE(pcg.weigh_from, pcg.lock_date)
                                AND COALESCE(pcg.weigh_to, pcg.lock_date)
    CROSS JOIN LATERAL jsonb_array_elements(pcg.dealer_lines) line
    WHERE t.notes='SEED-TLM-E2E-2026-05'
      AND t.created_at::date = DATE '2026-05-26'
      AND (line->>'partner_id')::uuid = t.partner_id
  ) AND status='locked';

  RAISE NOTICE 'STEP 5: PCG marked used';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'DONE — ĐNTT TMMN-SEED-001 = %', v_pr_id;
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- RESULT — xem nội dung ĐNTT vừa tạo
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  l.sort_order + 1 AS stt,
  l.payee_name AS "Đại lý",
  l.note AS "Số phiếu / Ghi chú",
  round(l.weight::numeric, 2) AS "KL khô (kg)",
  round(l.unit_price::numeric, 0) AS "Đơn giá (đ/kg)",
  to_char(l.amount, 'FM999,999,999,999') AS "Thành tiền",
  CASE
    WHEN length(l.payee_note) > 50 THEN substring(l.payee_note FROM 1 FOR 47) || '...'
    ELSE l.payee_note
  END AS "Tài khoản"
FROM public.payment_requests pr
JOIN public.payment_request_lines l ON l.payment_request_id = pr.id
WHERE pr.code = 'TMMN-SEED-001'
ORDER BY l.sort_order;


-- Tổng hợp ĐNTT
SELECT
  pr.code,
  pr.title,
  pr.status,
  count(l.id) AS line_count,
  sum(CASE WHEN l.amount > 0 THEN 1 ELSE 0 END) AS positive_lines,
  sum(CASE WHEN l.amount < 0 THEN 1 ELSE 0 END) AS fee_lines,
  to_char(sum(l.amount), 'FM999,999,999,999') AS total_amount_vnd
FROM public.payment_requests pr
LEFT JOIN public.payment_request_lines l ON l.payment_request_id = pr.id
WHERE pr.code = 'TMMN-SEED-001'
GROUP BY pr.id, pr.code, pr.title, pr.status;


-- PCG đã được markUsed?
SELECT code, status, lock_date, weigh_from, weigh_to
FROM public.b2b_price_lock_tickets
WHERE note='SEED-TLM-E2E-2026-05';


-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (chạy thủ công để dọn ĐNTT seed, sửa PCG về locked):
-- ────────────────────────────────────────────────────────────────────────────
--   UPDATE public.weighbridge_tickets SET payment_request_id = NULL
--     WHERE payment_request_id = (SELECT id FROM public.payment_requests WHERE code='TMMN-SEED-001');
--   DELETE FROM public.payment_request_lines
--     WHERE payment_request_id = (SELECT id FROM public.payment_requests WHERE code='TMMN-SEED-001');
--   DELETE FROM public.payment_requests WHERE code='TMMN-SEED-001';
--   UPDATE public.b2b_price_lock_tickets SET status='locked'
--     WHERE note='SEED-TLM-E2E-2026-05' AND status='used';
-- ════════════════════════════════════════════════════════════════════════════
