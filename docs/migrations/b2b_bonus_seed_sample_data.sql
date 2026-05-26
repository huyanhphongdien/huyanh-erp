-- ============================================================================
-- B2B BONUS SEED — Sample data từ file Excel "Thuong_Tier_2025.xlsx"
-- Date: 2026-05-26
-- ============================================================================
--
-- Mục đích: Tạo data mẫu để test/demo hệ thống bonus:
--   1) 12 đại lý mẫu (từ sheet "Chi tiết có thưởng" trong Excel)
--   2) Intake batches cho từng đại lý × 12 tháng năm 2026 (rubber_type='tap')
--      với khối lượng net_weight_kg theo data Excel
--   3) Gọi compute_monthly_bonus → tạo bonus rows cho cả năm 2026
--
-- LƯU Ý:
--   - 2025 Excel dùng công thức CỘNG DỒN (tier-by-tier accumulation)
--   - Quy chế 2026 (đã seed ở migration trước) dùng "lấy mức cao nhất × toàn bộ"
--   - Bonus tính ra sẽ KHÁC con số trong Excel — không phải lỗi, đúng theo
--     quy chế mới T1/2026.
--   - Data dùng intake_date='2026-MM-15' để map tháng Excel → tháng 2026.
--
-- MÃ ĐỊNH DANH (HAC-13 v10):
--   - Khi insert b2b.partners (code='DEMO-LAK1', …), trigger ensure_bp_for_b2b_partner
--     tự tạo public.business_partners → sinh hac13_code (vd 8999100012346)
--     → overwrite b2b.partners.code = hac13_code
--     → lưu 'DEMO-LAK1' vào bp_search_keys.ALIAS để tra cứu chéo.
--   - Sau seed, đại lý hiển thị HAC-13 ở mọi nơi. Alias DEMO chỉ phục vụ
--     debug + lookup nội bộ.
--
-- Idempotent: dùng code prefix 'DEMO-' + ON CONFLICT DO NOTHING.
-- Có thể chạy lại an toàn.
-- ROLLBACK: cuối file.
-- ============================================================================

DO $$
DECLARE
  v_b2b_exists boolean;
  v_rib_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='b2b' AND table_name='partners') INTO v_b2b_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rubber_intake_batches') INTO v_rib_exists;

  IF NOT (v_b2b_exists AND v_rib_exists) THEN
    RAISE NOTICE 'SKIP seed: thiếu b2b.partners hoặc rubber_intake_batches';
    RETURN;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────
  -- STEP 1: Tạo 12 đại lý mẫu (idempotent qua code prefix 'DEMO-XXXX')
  -- ──────────────────────────────────────────────────────────────────────
  -- Dùng code prefix 'DEMO-' để không lẫn với data thật.
  -- (Sau mig 07, code sẽ bị overwrite = hac13_code; legacy code lưu vào bp_search_keys)

  -- Helper: insert partner nếu chưa tồn tại theo code legacy 'DEMO-XXXX'
  -- (Match qua bp_search_keys ALIAS để không duplicate)

  -- Foreign partners (Trong Excel: Nước ngoài — LAK1, LAK2, LAS1, LAV3, LAV4, TMHG)
  -- Domestic partners: QBPH, TMDN, TMLG, TMNI, TMTT, TNTH

  INSERT INTO b2b.partners (code, name, partner_type, status, tier, is_active, phone)
  VALUES
    ('DEMO-LAK1', 'Đại lý LAK1 (mẫu)',  'supplier', 'verified', 'silver',  true, '0900000001'),
    ('DEMO-LAK2', 'Đại lý LAK2 (mẫu)',  'supplier', 'verified', 'gold',    true, '0900000002'),
    ('DEMO-LAS1', 'Đại lý LAS1 (mẫu)',  'supplier', 'verified', 'silver',  true, '0900000003'),
    ('DEMO-LAV3', 'Đại lý LAV3 (mẫu)',  'supplier', 'verified', 'bronze',  true, '0900000004'),
    ('DEMO-LAV4', 'Đại lý LAV4 (mẫu)',  'supplier', 'verified', 'bronze',  true, '0900000005'),
    ('DEMO-TMHG', 'Đại lý TMHG (mẫu)',  'supplier', 'verified', 'silver',  true, '0900000006'),
    ('DEMO-QBPH', 'Đại lý QBPH (mẫu)',  'dealer',   'verified', 'bronze',  true, '0900000007'),
    ('DEMO-TMDN', 'Đại lý TMDN (mẫu)',  'dealer',   'verified', 'silver',  true, '0900000008'),
    ('DEMO-TMLG', 'Đại lý TMLG (mẫu)',  'dealer',   'verified', 'bronze',  true, '0900000009'),
    ('DEMO-TMNI', 'Đại lý TMNI (mẫu)',  'dealer',   'verified', 'bronze',  true, '0900000010'),
    ('DEMO-TMTT', 'Đại lý TMTT (mẫu)',  'dealer',   'verified', 'silver',  true, '0900000011'),
    ('DEMO-TNTH', 'Đại lý TNTH (mẫu)',  'dealer',   'verified', 'silver',  true, '0900000012')
  ON CONFLICT DO NOTHING;

  -- Sau ON CONFLICT, partners đã được tạo (hoặc đã tồn tại từ lần chạy trước).
  -- Trigger ensure_bp_for_b2b_partner sẽ tự tạo BP master + sync code = hac13_code.
  -- Legacy code 'DEMO-XXXX' lưu vào bp_search_keys ALIAS.
  -- → để query lại partner, tìm qua bp_search_keys.

  -- ──────────────────────────────────────────────────────────────────────
  -- STEP 2: Insert rubber_intake_batches với data từ Excel (12 tháng × 12 đại lý)
  -- ──────────────────────────────────────────────────────────────────────

  -- Bảng tạm chứa (partner_alias, month, net_weight_kg)
  CREATE TEMP TABLE IF NOT EXISTS _seed_data (
    partner_alias text,
    month         int,
    net_weight_kg numeric
  ) ON COMMIT DROP;

  INSERT INTO _seed_data VALUES
    -- LAK1 (foreign): T3=8.6, T4=211.1, T5=17.3
    ('DEMO-LAK1',  3,   8600),
    ('DEMO-LAK1',  4, 211100),
    ('DEMO-LAK1',  5,  17300),
    -- LAK2 (foreign): big partner, full year
    ('DEMO-LAK2',  1,  20600),
    ('DEMO-LAK2',  2,  11200),
    ('DEMO-LAK2',  3,  25300),
    ('DEMO-LAK2',  4,  31800),
    ('DEMO-LAK2',  5, 416600),
    ('DEMO-LAK2',  6, 537500),
    ('DEMO-LAK2',  7,  30400),
    ('DEMO-LAK2',  8, 276300),
    ('DEMO-LAK2',  9, 306000),
    ('DEMO-LAK2', 10, 376100),
    ('DEMO-LAK2', 11, 238000),
    ('DEMO-LAK2', 12,  41500),
    -- LAS1 (foreign)
    ('DEMO-LAS1',  1,  85600),
    ('DEMO-LAS1',  2, 261900),  -- Tier 2 trong quy chế 2026
    ('DEMO-LAS1',  3,  81800),
    ('DEMO-LAS1',  6,  92700),
    ('DEMO-LAS1', 10, 115000),  -- Tier 1
    ('DEMO-LAS1', 11, 335100),  -- Tier 2
    -- LAV3
    ('DEMO-LAV3',  1,  48100),
    ('DEMO-LAV3',  2, 103800),  -- Tier 1
    ('DEMO-LAV3',  4,  22200),
    ('DEMO-LAV3',  5, 141000),  -- Tier 1
    -- LAV4
    ('DEMO-LAV4',  2, 123900),  -- Tier 1
    ('DEMO-LAV4',  4,  32000),
    ('DEMO-LAV4',  5,  39300),
    ('DEMO-LAV4',  6,  44700),
    -- TMHG
    ('DEMO-TMHG',  9, 155900),  -- Tier 1
    ('DEMO-TMHG', 10, 238600),  -- Tier 2
    ('DEMO-TMHG', 12, 537800),  -- Tier 3
    -- QBPH (domestic)
    ('DEMO-QBPH',  3,  20100),
    ('DEMO-QBPH',  5,  15100),
    ('DEMO-QBPH',  6, 105700),  -- Tier 1
    ('DEMO-QBPH',  7,  23500),
    ('DEMO-QBPH',  8,  22100),
    ('DEMO-QBPH', 11,  26600),
    -- TMDN (domestic)
    ('DEMO-TMDN',  2,  34500),
    ('DEMO-TMDN',  4,  14100),
    ('DEMO-TMDN',  6,  66100),
    ('DEMO-TMDN',  7, 135200),  -- Tier 1
    ('DEMO-TMDN',  8, 132100),  -- Tier 1
    ('DEMO-TMDN',  9,  66900),
    ('DEMO-TMDN', 10,  71900),
    ('DEMO-TMDN', 11,  71000),
    ('DEMO-TMDN', 12,  94500),
    -- TMLG (domestic)
    ('DEMO-TMLG',  6,  42500),
    ('DEMO-TMLG',  7,  43000),
    ('DEMO-TMLG',  8,  95800),
    ('DEMO-TMLG',  9, 157900),  -- Tier 1
    ('DEMO-TMLG', 10,  31300),
    ('DEMO-TMLG', 12,  53900),
    -- TMNI (domestic)
    ('DEMO-TMNI',  6,  26100),
    ('DEMO-TMNI',  7,  30100),
    ('DEMO-TMNI',  8,  37000),
    ('DEMO-TMNI',  9,  62800),
    ('DEMO-TMNI', 10,  63700),
    ('DEMO-TMNI', 11,  21500),
    ('DEMO-TMNI', 12, 195800),  -- Tier 1
    -- TMTT (domestic)
    ('DEMO-TMTT',  1,  27600),
    ('DEMO-TMTT',  4,  35600),
    ('DEMO-TMTT',  7,  36800),
    ('DEMO-TMTT',  8, 104300),  -- Tier 1
    ('DEMO-TMTT',  9,  69300),
    ('DEMO-TMTT', 10,  68900),
    ('DEMO-TMTT', 11,  35400),
    ('DEMO-TMTT', 12,  72200),
    -- TNTH (domestic)
    ('DEMO-TNTH',  6,  32100),
    ('DEMO-TNTH',  7,  91000),
    ('DEMO-TNTH',  8, 128800),  -- Tier 1
    ('DEMO-TNTH',  9,  59400),
    ('DEMO-TNTH', 10,  66100),
    ('DEMO-TNTH', 11,  65600),
    ('DEMO-TNTH', 12,  90000);

  -- Insert vào rubber_intake_batches với rubber_type='tap'.
  -- Note: 1 row mỗi (partner, month). intake_date = ngày 15 của tháng đó năm 2026.
  --
  -- JOIN qua HAC-13: bp_search_keys.bp_id → business_partners.id → b2b.partners.bp_id.
  -- (Sau trigger ensure_bp_for_b2b_partner: b2b.partners.code đã được overwrite =
  --  business_partners.hac13_code. Legacy 'DEMO-XXXX' lưu trong bp_search_keys ALIAS.)
  EXECUTE $sql$
    INSERT INTO public.rubber_intake_batches (
      source_type, intake_date, b2b_partner_id, rubber_type,
      net_weight_kg, gross_weight_kg, status,
      product_code, notes
    )
    SELECT
      CASE WHEN sd.partner_alias LIKE 'DEMO-LA%' OR sd.partner_alias = 'DEMO-TMHG' THEN 'lao_agent' ELSE 'vietnam' END,
      make_date(2026, sd.month, 15),
      p.id,
      'tap',
      sd.net_weight_kg,
      sd.net_weight_kg * 1.05,                              -- gross ~5% > net
      'confirmed',
      'MU_TAP_SAMPLE',
      'Seed data từ Excel Thuong_Tier_2025.xlsx (' || sd.partner_alias || ' T' || sd.month || ')'
    FROM _seed_data sd
    JOIN public.bp_search_keys sk
      ON sk.key_type = 'ALIAS' AND sk.key_value = sd.partner_alias
    JOIN b2b.partners p
      ON p.bp_id = sk.bp_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.rubber_intake_batches r
      WHERE r.b2b_partner_id = p.id
        AND r.intake_date = make_date(2026, sd.month, 15)
        AND r.notes LIKE 'Seed data từ Excel%'
    )
  $sql$;

  RAISE NOTICE 'STEP 2: % intake batches đã insert',
    (SELECT count(*) FROM public.rubber_intake_batches WHERE notes LIKE 'Seed data từ Excel%');

  -- ──────────────────────────────────────────────────────────────────────
  -- STEP 3: Compute bonus cho cả 4 quý 2026
  -- ──────────────────────────────────────────────────────────────────────
  PERFORM public.recompute_quarter_bonuses(2026, 1);
  PERFORM public.recompute_quarter_bonuses(2026, 2);
  PERFORM public.recompute_quarter_bonuses(2026, 3);
  PERFORM public.recompute_quarter_bonuses(2026, 4);

  RAISE NOTICE 'STEP 3: bonus đã tính. Tổng dòng bonus: %',
    (SELECT count(*) FROM public.b2b_monthly_bonuses WHERE year = 2026 AND rubber_type = 'tap');
  RAISE NOTICE 'Tổng bonus 2026: %',
    (SELECT COALESCE(SUM(total_bonus_vnd),0)::bigint FROM public.b2b_monthly_bonuses WHERE year = 2026 AND status <> 'cancelled');

  RAISE NOTICE 'SEED PASS — 12 đại lý DEMO + intake batches + bonus đã sẵn sàng cho test.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY — hiển thị mapping HAC-13 ↔ legacy alias
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_partner_count int;
  v_batch_count int;
  v_bonus_count int;
  v_total_bonus numeric;
  r record;
BEGIN
  -- Đếm tổng quan
  SELECT count(*) INTO v_partner_count
    FROM b2b.partners p
    WHERE p.bp_id IN (SELECT bp_id FROM public.bp_search_keys WHERE key_value LIKE 'DEMO-%');

  SELECT count(*) INTO v_batch_count
    FROM public.rubber_intake_batches WHERE notes LIKE 'Seed data từ Excel%';

  SELECT count(*), COALESCE(SUM(total_bonus_vnd),0) INTO v_bonus_count, v_total_bonus
    FROM public.b2b_monthly_bonuses WHERE year = 2026;

  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'SEED VERIFY: % đại lý DEMO · % intake batches · % bonus rows',
    v_partner_count, v_batch_count, v_bonus_count;
  RAISE NOTICE 'Tổng thưởng năm 2026: %đ', v_total_bonus::bigint;
  RAISE NOTICE '───────────────────────────────────────────────────────────────';
  RAISE NOTICE 'Mapping HAC-13 ↔ alias legacy (12 đại lý DEMO):';

  -- Hiển thị 12 dòng mapping
  FOR r IN
    SELECT
      sk.key_value AS alias,
      p.code      AS hac13_code,           -- đã sync = bp.hac13_code sau trigger
      bp.legal_name AS name,
      bp.type_code,
      (SELECT COALESCE(SUM(total_bonus_vnd), 0)::bigint
       FROM public.b2b_monthly_bonuses mb
       WHERE mb.partner_id = p.id AND mb.year = 2026
       AND mb.status <> 'cancelled') AS bonus_2026
    FROM public.bp_search_keys sk
    JOIN public.business_partners bp ON bp.id = sk.bp_id
    JOIN b2b.partners p ON p.bp_id = bp.id
    WHERE sk.key_type = 'ALIAS' AND sk.key_value LIKE 'DEMO-%'
    ORDER BY sk.key_value
  LOOP
    RAISE NOTICE '  %  →  %  (type=%, "%", bonus 2026: %đ)',
      r.alias, r.hac13_code, r.type_code, r.name, r.bonus_2026;
  END LOOP;
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- VIEW preview chi tiết bonus (chạy thủ công sau khi seed để xem kết quả)
-- ════════════════════════════════════════════════════════════════════════════
-- Query 1: Chi tiết bonus tháng theo HAC-13 + alias
--
-- SELECT
--   sk.key_value             AS partner_alias,
--   p.code                   AS hac13_code,
--   bp.legal_name            AS partner_name,
--   b.month,
--   b.volume_tons,
--   b.tier_applied,
--   b.bonus_per_ton          AS rate_per_ton_vnd,
--   b.total_bonus_vnd        AS bonus_vnd,
--   b.status
-- FROM b2b_monthly_bonuses b
-- JOIN b2b.partners p              ON p.id = b.partner_id
-- JOIN business_partners bp        ON bp.id = p.bp_id
-- JOIN bp_search_keys sk           ON sk.bp_id = bp.id AND sk.key_type='ALIAS' AND sk.key_value LIKE 'DEMO-%'
-- WHERE b.year = 2026 AND b.total_bonus_vnd > 0
-- ORDER BY sk.key_value, b.month;
--
-- Query 2: Tổng quan theo quý
--
-- SELECT * FROM v_b2b_bonus_quarterly_summary WHERE year = 2026 ORDER BY quarter, rubber_type;
--
-- Query 3: Top partners 2026
--
-- SELECT
--   sk.key_value AS alias,
--   bp.legal_name,
--   t.total_volume_tons,
--   t.total_bonus_vnd,
--   t.best_tier
-- FROM v_b2b_bonus_top_partners t
-- JOIN business_partners bp ON bp.id = t.bp_id
-- LEFT JOIN bp_search_keys sk ON sk.bp_id = bp.id AND sk.key_type='ALIAS' AND sk.key_value LIKE 'DEMO-%'
-- WHERE t.year = 2026 AND t.total_bonus_vnd > 0
-- ORDER BY t.total_bonus_vnd DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: Xoá data DEMO
-- ════════════════════════════════════════════════════════════════════════════
-- DELETE FROM b2b_monthly_bonuses WHERE partner_id IN (
--   SELECT id FROM b2b.partners WHERE id IN (
--     SELECT bp_id FROM bp_search_keys WHERE key_value LIKE 'DEMO-%'
--   )
-- );
-- DELETE FROM rubber_intake_batches WHERE notes LIKE 'Seed data từ Excel%';
-- DELETE FROM b2b.partners WHERE id IN (
--   SELECT bp_id FROM bp_search_keys WHERE key_value LIKE 'DEMO-%'
-- );
-- DELETE FROM bp_search_keys WHERE key_value LIKE 'DEMO-%';
-- DELETE FROM business_partners WHERE legal_name LIKE 'Đại lý DEMO%' OR legal_name LIKE 'Đại lý % (mẫu)';
