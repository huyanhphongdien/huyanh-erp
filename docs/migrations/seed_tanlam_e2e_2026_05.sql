-- ============================================================================
-- SEED DATA E2E — Tân Lâm 20→30/05/2026 (Phase 1)
-- Date: 2026-05-30
-- ============================================================================
-- Mục đích: tạo bộ data đầy đủ phục vụ test end-to-end module Thu mua:
--   - 15 đại lý "bán mủ" + 5 đại lý "đầu mối nhận tiền hộ" (proxy) theo
--     danh sách thực tế từ Excel "Báo cáo KL hằng ngày MN Tân Lâm".
--   - Set payment_proxy_partner_id cho 5 đại lý có người nhận tiền hộ.
--   - Đảm bảo facility code='TL' (Tân Lâm) tồn tại.
--   - 55 weighbridge_tickets (5/ngày × 11 ngày 20→30/05/2026), source bộc
--     phát (partner_direct), status='completed', đầy đủ ĐỐT + DRC + KL khô.
--     Trigger bridge sẽ tự tạo rubber_intake_batches.
--   - 1 Phiếu chốt giá (PCG) chốt giá cho 20→30/05 với 8 đại lý chính.
--
-- IDEMPOTENT: dùng prefix 'TLM-' + is_demo=true + ON CONFLICT DO NOTHING.
-- Có thể chạy lại an toàn. Mọi row tạo ra đều có notes/source LIKE 'SEED-TLM%'
-- để dễ filter/dọn dẹp.
-- ROLLBACK: xem block cuối file.
-- ============================================================================

DO $$
DECLARE
  v_b2b_exists boolean;
  v_wb_exists  boolean;
  v_fac_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='b2b' AND table_name='partners') INTO v_b2b_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='weighbridge_tickets') INTO v_wb_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='facilities') INTO v_fac_exists;
  IF NOT (v_b2b_exists AND v_wb_exists AND v_fac_exists) THEN
    RAISE EXCEPTION 'Thiếu bảng cần: b2b.partners=%, weighbridge_tickets=%, facilities=%', v_b2b_exists, v_wb_exists, v_fac_exists;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: Ensure facility 'TL' (Tân Lâm) exists
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_tl_id uuid;
BEGIN
  SELECT id INTO v_tl_id FROM public.facilities WHERE code = 'TL' LIMIT 1;
  IF v_tl_id IS NULL THEN
    INSERT INTO public.facilities (code, name, is_active)
    VALUES ('TL', 'HA Quảng Trị (Tân Lâm)', true);
    RAISE NOTICE 'STEP 1: created facility TL';
  ELSE
    RAISE NOTICE 'STEP 1: facility TL already exists (%)', v_tl_id;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Tạo 20 đại lý (15 sellers + 5 proxies)
-- Code prefix 'TLM-' (Tân Lâm Mủ). is_demo=true. Trigger sẽ overwrite code
-- bằng hac13_code; legacy TLM-XXX lưu vào bp_search_keys.ALIAS để tra cứu.
-- ════════════════════════════════════════════════════════════════════════════
-- NOTE: b2b.partners KHÔNG có cột bank_account/bank_name/bank_holder.
-- Bank info đại lý cần lưu ở bảng riêng hoặc thêm cột — sẽ audit ở Phase 2.
INSERT INTO b2b.partners (code, name, partner_type, status, tier, is_active, phone,
                          contact_alias_name, is_demo)
VALUES
  -- ─── PROXY hubs (nhận tiền hộ) ────────────────────────────────────────
  ('TLM-NHN',    'Nguyễn Hồng Nhung',         'dealer', 'verified', 'silver', true, '0900100001', NULL,               true),
  ('TLM-TMH',    'Trần Thị Mỹ Hoà',           'dealer', 'verified', 'gold',   true, '0900100002', NULL,               true),
  ('TLM-HTC',    'Hồ Thị Cúc',                'dealer', 'verified', 'silver', true, '0900100003', NULL,               true),
  ('TLM-NVQ',    'Nguyễn Văn Quý',            'dealer', 'verified', 'bronze', true, '0900100004', NULL,               true),
  ('TLM-NNH',    'Nguyễn Ngọc Hoa',           'dealer', 'verified', 'bronze', true, '0900100005', NULL,               true),

  -- ─── SELLERS (15 đại lý giao mủ tại Tân Lâm) ──────────────────────────
  ('TLM-DBL',    'Dương Bá Lê',               'dealer', 'verified', 'gold',   true, '0900200001', 'Hoàng Thị Chính',  true),
  ('TLM-LVT',    'Lê Văn Thạo',               'dealer', 'verified', 'gold',   true, '0900200002', NULL,               true),
  ('TLM-NTH',    'Nguyễn Thị Hiền (Đông Hà)', 'dealer', 'verified', 'silver', true, '0900200003', NULL,               true),
  ('TLM-NTT',    'Nguyễn Thị Thanh (Hiệu)',   'dealer', 'verified', 'silver', true, '0900200004', 'Hiệu',             true),
  ('TLM-NTHG',   'Nguyễn Thị Hương',          'dealer', 'verified', 'silver', true, '0900200005', 'Trân Thị Mỹ Hoà',  true),
  ('TLM-HNT',    'Hà Ngọc Thành',             'dealer', 'verified', 'silver', true, '0900200006', 'Hồ Thị Cúc',       true),
  ('TLM-NTHTAM', 'Nguyễn Thị Hồng (Tâm)',     'dealer', 'verified', 'bronze', true, '0900200007', 'Tâm',              true),
  ('TLM-NTO',    'Nguyễn Thị Oanh',           'dealer', 'verified', 'bronze', true, '0900200008', NULL,               true),
  ('TLM-LTG',    'Lê Thị Gấm',                'dealer', 'verified', 'bronze', true, '0900200009', NULL,               true),
  ('TLM-HTT',    'Hoàng Thị Thu',             'dealer', 'verified', 'bronze', true, '0900200010', NULL,               true),
  ('TLM-TTY',    'Trần Thị Yến',              'dealer', 'verified', 'silver', true, '0900200011', 'Hoàng Khánh',      true),
  ('TLM-NTHADOI','Nguyễn Thị Hồng (A Dơi)',   'dealer', 'verified', 'bronze', true, '0900200012', 'A Dơi',            true),
  ('TLM-NTN',    'Nguyễn Thị Nguyệt',         'dealer', 'verified', 'bronze', true, '0900200013', NULL,               true),
  ('TLM-HTCH',   'Hoàng Thị Chính',           'dealer', 'verified', 'bronze', true, '0900200014', NULL,               true),
  ('TLM-NTHX',   'Nguyễn Thị Hồng',           'dealer', 'verified', 'bronze', true, '0900200015', NULL,               true)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: Link payment_proxy_partner_id cho 5 đại lý có người nhận tiền hộ
-- ════════════════════════════════════════════════════════════════════════════
-- Helper: tìm partner qua bp_search_keys ALIAS (legacy 'TLM-XXX')
DO $$
DECLARE
  fn_id_by_alias text := $func$
    SELECT p.id FROM b2b.partners p
    JOIN public.bp_search_keys sk ON sk.bp_id = p.bp_id AND sk.key_type='ALIAS' AND sk.key_value=$1
    LIMIT 1
  $func$;
  v_nhn uuid; v_tmh uuid; v_htc uuid; v_nvq uuid; v_nnh uuid;
BEGIN
  -- Resolve proxy IDs
  EXECUTE fn_id_by_alias INTO v_nhn USING 'TLM-NHN';
  EXECUTE fn_id_by_alias INTO v_tmh USING 'TLM-TMH';
  EXECUTE fn_id_by_alias INTO v_htc USING 'TLM-HTC';
  EXECUTE fn_id_by_alias INTO v_nvq USING 'TLM-NVQ';
  EXECUTE fn_id_by_alias INTO v_nnh USING 'TLM-NNH';

  -- Mark them as proxies
  UPDATE b2b.partners SET is_payment_proxy = true
   WHERE id IN (v_nhn, v_tmh, v_htc, v_nvq, v_nnh) AND COALESCE(is_payment_proxy, false) = false;

  -- Link sellers → proxies
  UPDATE b2b.partners p SET payment_proxy_partner_id = v_nhn
   WHERE p.payment_proxy_partner_id IS NULL
     AND p.id = (SELECT x.id FROM b2b.partners x JOIN public.bp_search_keys k ON k.bp_id=x.bp_id
                 WHERE k.key_type='ALIAS' AND k.key_value='TLM-NTH' LIMIT 1);

  UPDATE b2b.partners p SET payment_proxy_partner_id = v_tmh
   WHERE p.payment_proxy_partner_id IS NULL
     AND p.id = (SELECT x.id FROM b2b.partners x JOIN public.bp_search_keys k ON k.bp_id=x.bp_id
                 WHERE k.key_type='ALIAS' AND k.key_value='TLM-NTHG' LIMIT 1);

  UPDATE b2b.partners p SET payment_proxy_partner_id = v_htc
   WHERE p.payment_proxy_partner_id IS NULL
     AND p.id = (SELECT x.id FROM b2b.partners x JOIN public.bp_search_keys k ON k.bp_id=x.bp_id
                 WHERE k.key_type='ALIAS' AND k.key_value='TLM-HNT' LIMIT 1);

  UPDATE b2b.partners p SET payment_proxy_partner_id = v_nvq
   WHERE p.payment_proxy_partner_id IS NULL
     AND p.id = (SELECT x.id FROM b2b.partners x JOIN public.bp_search_keys k ON k.bp_id=x.bp_id
                 WHERE k.key_type='ALIAS' AND k.key_value='TLM-LTG' LIMIT 1);

  UPDATE b2b.partners p SET payment_proxy_partner_id = v_nnh
   WHERE p.payment_proxy_partner_id IS NULL
     AND p.id = (SELECT x.id FROM b2b.partners x JOIN public.bp_search_keys k ON k.bp_id=x.bp_id
                 WHERE k.key_type='ALIAS' AND k.key_value='TLM-NTHADOI' LIMIT 1);

  RAISE NOTICE 'STEP 3: payment_proxy_partner_id linked for 5 sellers';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: Insert 55 weighbridge_tickets (5/ngày × 11 ngày 20→30/05/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Mỗi ngày 5 phiếu, partner cycle qua 15 sellers. Vehicle plate xoay vòng.
-- DRC% 33-44%, ĐỐT tương ứng (180-241). Net 600-3000 kg.
-- source_type='partner_direct' (bộc phát, đại lý chưa chốt giá - giá để rỗng).
-- Trigger bridge sẽ auto-tạo rubber_intake_batches.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tl_id uuid;
  v_partner_ids uuid[];
  v_plates text[] := ARRAY[
    '75H-58128','75A-12345','75C-67890','75D-11122','75E-33445',
    '75F-55667','75G-77889','75H-99001','75K-23456','75L-45678'
  ];
  v_drivers text[] := ARRAY[
    'Lê Văn A','Nguyễn Văn B','Trần Văn C','Hồ Văn D','Phạm Văn E',
    'Đỗ Văn F','Bùi Văn G','Vũ Văn H','Hoàng Văn I','Đặng Văn K'
  ];
  v_day int;
  v_idx int;
  v_date date;
  v_partner_id uuid;
  v_net numeric;
  v_dot int;
  v_drc numeric;
  v_dry numeric;
  v_code text;
  v_inserted int := 0;
  v_seq int;
BEGIN
  SELECT id INTO v_tl_id FROM public.facilities WHERE code='TL' LIMIT 1;
  IF v_tl_id IS NULL THEN RAISE EXCEPTION 'facility TL không tồn tại'; END IF;

  -- Resolve 15 seller IDs theo thứ tự cycle
  SELECT array_agg(p.id ORDER BY arr.ord) INTO v_partner_ids
  FROM (VALUES
    (1,'TLM-DBL'),(2,'TLM-LVT'),(3,'TLM-NTH'),(4,'TLM-NTT'),(5,'TLM-NTHG'),
    (6,'TLM-HNT'),(7,'TLM-NTHTAM'),(8,'TLM-NTO'),(9,'TLM-LTG'),(10,'TLM-HTT'),
    (11,'TLM-TTY'),(12,'TLM-NTHADOI'),(13,'TLM-NTN'),(14,'TLM-HTCH'),(15,'TLM-NTHX')
  ) AS arr(ord, alias)
  JOIN public.bp_search_keys sk ON sk.key_type='ALIAS' AND sk.key_value=arr.alias
  JOIN b2b.partners p ON p.bp_id = sk.bp_id;

  IF v_partner_ids IS NULL OR array_length(v_partner_ids, 1) < 15 THEN
    RAISE EXCEPTION 'STEP 4: không resolve được đủ 15 seller partners (chỉ tìm thấy %)', COALESCE(array_length(v_partner_ids,1), 0);
  END IF;

  -- Sequential per-day (5 phiếu/ngày)
  FOR v_day IN 0..10 LOOP
    v_date := DATE '2026-05-20' + v_day;
    FOR v_idx IN 1..5 LOOP
      v_seq := v_day * 5 + v_idx;
      -- partner cycle qua 15: 0→14
      v_partner_id := v_partner_ids[((v_seq - 1) % 15) + 1];
      -- Net weight: 600 + deterministic variance
      v_net := 600 + ((v_seq * 137) % 2400);  -- 600-2999
      -- ĐỐT: 180 + variance
      v_dot := 180 + ((v_seq * 7) % 61);       -- 180-240
      -- DRC ≈ ĐỐT × 0.002 - 0.034
      v_drc := ROUND((v_dot * 0.002 - 0.034)::numeric * 100, 1);  -- vd 36.6%
      v_dry := ROUND((v_net * v_drc / 100)::numeric, 2);
      -- Code: CX-YYYYMMDD-NNN
      v_code := 'CX-' || to_char(v_date,'YYYYMMDD') || '-' || lpad(v_idx::text,3,'0');

      -- Skip nếu đã tồn tại
      IF EXISTS (SELECT 1 FROM public.weighbridge_tickets WHERE code = v_code) THEN
        CONTINUE;
      END IF;

      -- source 'partner_direct' (bộc phát) = chỉ set partner_id, không có deal_id/supplier_id.
      -- App tự derive source qua deriveSource(deal_id, supplier_id) → 'manual' khi cả hai null.
      INSERT INTO public.weighbridge_tickets (
        code, ticket_type, status,
        vehicle_plate, driver_name,
        rubber_type, price_unit,
        gross_weight, tare_weight, net_weight,
        qc_actual_drc, field_dot_reading,
        partner_id, facility_id,
        gross_weighed_at, tare_weighed_at, completed_at, created_at,
        notes
      ) VALUES (
        v_code, 'in', 'completed',
        v_plates[((v_seq - 1) % 10) + 1], v_drivers[((v_seq - 1) % 10) + 1],
        'mu_nuoc', 'dry',
        v_net * 1.5, v_net * 0.5, v_net,
        v_drc, v_dot,
        v_partner_id, v_tl_id,
        v_date::timestamptz + interval '7 hours' + (v_idx * interval '30 minutes'),
        v_date::timestamptz + interval '8 hours' + (v_idx * interval '30 minutes'),
        v_date::timestamptz + interval '8 hours 5 minutes' + (v_idx * interval '30 minutes'),
        v_date::timestamptz + interval '7 hours' + (v_idx * interval '30 minutes'),
        'SEED-TLM-E2E-2026-05'
      );
      v_inserted := v_inserted + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'STEP 4: inserted % weighbridge tickets (target 55)', v_inserted;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: Phiếu chốt giá (PCG) chốt giá cho 20→30/05 với 8 đại lý chính
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tl_id uuid;
  v_pcg_id uuid;
  v_existing uuid;
  v_dealer_lines jsonb;
  v_alias_prices text[][] := ARRAY[
    ['TLM-DBL',      '59000000'],
    ['TLM-LVT',      '59500000'],
    ['TLM-NTH',      '60000000'],
    ['TLM-NTT',      '59000000'],
    ['TLM-NTHG',     '60000000'],
    ['TLM-HNT',      '59500000'],
    ['TLM-NTHTAM',   '59000000'],
    ['TLM-TTY',      '59500000']
  ];
  v_alias text;
  v_price numeric;
  v_partner_id uuid;
  v_dealer_name text;
  i int;
BEGIN
  -- Skip nếu PCG seed đã tồn tại
  SELECT id INTO v_existing FROM public.b2b_price_lock_tickets
   WHERE note = 'SEED-TLM-E2E-2026-05' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE NOTICE 'STEP 5: PCG seed đã tồn tại (%), skip', v_existing;
    RETURN;
  END IF;

  SELECT id INTO v_tl_id FROM public.facilities WHERE code='TL' LIMIT 1;

  v_dealer_lines := '[]'::jsonb;
  FOR i IN 1..array_length(v_alias_prices, 1) LOOP
    v_alias := v_alias_prices[i][1];
    v_price := v_alias_prices[i][2]::numeric;
    SELECT p.id, p.name INTO v_partner_id, v_dealer_name
      FROM b2b.partners p
      JOIN public.bp_search_keys sk ON sk.bp_id = p.bp_id
       AND sk.key_type='ALIAS' AND sk.key_value=v_alias
     LIMIT 1;
    IF v_partner_id IS NOT NULL THEN
      v_dealer_lines := v_dealer_lines || jsonb_build_array(jsonb_build_object(
        'partner_id', v_partner_id::text,
        'dealer_name', v_dealer_name,
        'expected_weight_kg', NULL,
        'expected_drc_percent', 38,
        'price_per_ton', v_price,
        'note', NULL
      ));
    END IF;
  END LOOP;

  INSERT INTO public.b2b_price_lock_tickets (
    status, facility_id, facility_label, dealer_lines,
    currency, purchase_method,
    price_floor_per_ton, price_mid_per_ton, price_high_per_ton,
    fees, fee_flags,
    lock_date, weigh_from, weigh_to,
    signer_locker, note
  ) VALUES (
    'locked', v_tl_id, 'TL', v_dealer_lines,
    'VND', 'dai_ly',
    59000000, 59500000, 60000000,
    '[]'::jsonb, '{}'::jsonb,
    DATE '2026-05-19', DATE '2026-05-20', DATE '2026-05-30',
    'Nguyễn Nhật Tân', 'SEED-TLM-E2E-2026-05'
  ) RETURNING id INTO v_pcg_id;

  RAISE NOTICE 'STEP 5: created PCG % with % dealer lines',
    v_pcg_id, jsonb_array_length(v_dealer_lines);
END $$;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_partners int;
  v_proxies int;
  v_proxy_linked int;
  v_tickets int;
  v_intakes int;
  v_pcg int;
BEGIN
  SELECT count(*) INTO v_partners
    FROM b2b.partners p JOIN public.bp_search_keys k ON k.bp_id=p.bp_id
   WHERE k.key_type='ALIAS' AND k.key_value LIKE 'TLM-%';
  SELECT count(*) INTO v_proxies
    FROM b2b.partners WHERE is_payment_proxy = true AND is_demo = true;
  SELECT count(*) INTO v_proxy_linked
    FROM b2b.partners WHERE payment_proxy_partner_id IS NOT NULL AND is_demo = true;
  SELECT count(*) INTO v_tickets
    FROM public.weighbridge_tickets WHERE notes = 'SEED-TLM-E2E-2026-05';
  SELECT count(*) INTO v_intakes
    FROM public.rubber_intake_batches
    WHERE b2b_partner_id IN (
      SELECT p.id FROM b2b.partners p JOIN public.bp_search_keys k ON k.bp_id=p.bp_id
      WHERE k.key_type='ALIAS' AND k.key_value LIKE 'TLM-%'
    )
    AND intake_date BETWEEN '2026-05-20' AND '2026-05-30';
  SELECT count(*) INTO v_pcg
    FROM public.b2b_price_lock_tickets WHERE note='SEED-TLM-E2E-2026-05';

  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'SEED VERIFY (Tân Lâm E2E 2026-05):';
  RAISE NOTICE '  • Partners TLM-*:        % (mong đợi 20: 5 proxy + 15 seller)', v_partners;
  RAISE NOTICE '  • is_payment_proxy=true: % (mong đợi 5)', v_proxies;
  RAISE NOTICE '  • payment_proxy linked:  % (mong đợi 5)', v_proxy_linked;
  RAISE NOTICE '  • Weighbridge tickets:   % (mong đợi 55)', v_tickets;
  RAISE NOTICE '  • Intake batches (via bridge): %', v_intakes;
  RAISE NOTICE '  • PCG seed:              % (mong đợi 1, ~8 dealer_lines)', v_pcg;
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (chạy thủ công khi cần dọn seed):
-- ────────────────────────────────────────────────────────────────────────────
--  -- 1) PCG
--  DELETE FROM public.b2b_price_lock_tickets WHERE note='SEED-TLM-E2E-2026-05';
--
--  -- 2) Intake batches sinh từ bridge (nếu bridge có tag)
--  DELETE FROM public.rubber_intake_batches
--   WHERE notes LIKE 'Auto-tạo từ phiếu cân CX-2026052%' OR notes LIKE '%SEED-TLM%'
--     AND b2b_partner_id IN (
--       SELECT p.id FROM b2b.partners p JOIN public.bp_search_keys k ON k.bp_id=p.bp_id
--       WHERE k.key_type='ALIAS' AND k.key_value LIKE 'TLM-%'
--     );
--
--  -- 3) Weighbridge tickets
--  DELETE FROM public.weighbridge_tickets WHERE notes='SEED-TLM-E2E-2026-05';
--
--  -- 4) Partner proxy links (unlink before delete)
--  UPDATE b2b.partners SET payment_proxy_partner_id=NULL, is_payment_proxy=false
--   WHERE id IN (
--     SELECT p.id FROM b2b.partners p JOIN public.bp_search_keys k ON k.bp_id=p.bp_id
--     WHERE k.key_type='ALIAS' AND k.key_value LIKE 'TLM-%'
--   );
--
--  -- 5) Partners + bp_search_keys + business_partners
--  DELETE FROM b2b.partners
--   WHERE id IN (
--     SELECT p.id FROM b2b.partners p JOIN public.bp_search_keys k ON k.bp_id=p.bp_id
--     WHERE k.key_type='ALIAS' AND k.key_value LIKE 'TLM-%'
--   );
--  DELETE FROM public.bp_search_keys WHERE key_type='ALIAS' AND key_value LIKE 'TLM-%';
-- ════════════════════════════════════════════════════════════════════════════
