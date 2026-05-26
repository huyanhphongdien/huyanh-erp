-- ============================================================================
-- Sprint 1.3 — Hỗ trợ bonus tính trên KL khô (dry_weight_kg)
-- Date: 2026-05-26
-- Decision D2: bonus tính KL KHÔ
-- ============================================================================
--
-- Mục đích:
--   Quy chế thưởng mủ nước (T6/2026) và mủ tạp (T1/2026) chỉ nói "sản lượng
--   tháng". Theo Excel HAQT thực tế: tiền tính theo KL khô (KL_QK).
--
--   Quyết định: bonus tính trên dry_weight_kg (= net × DRC/100).
--   Để flexible cho tương lai (vd quy chế đổi), thêm cột bonus_unit per rule:
--     'wet' = tính KL tươi (net_weight_kg)
--     'dry' = tính KL khô (dry_weight_kg)
--
--   Default cho rules hiện có:
--     rubber_type='nuoc' → bonus_unit='dry'  (mủ nước có DRC dao động lớn)
--     rubber_type='tap'  → bonus_unit='wet'  (mủ tạp đã đông, KL tươi ≈ thực)
--
-- Phụ thuộc: b2b_intake_field_data_tanlam.sql (cần dry_weight_kg column)
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: ADD COLUMN bonus_unit vào b2b_bonus_rules
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='b2b_bonus_rules') THEN
    RAISE NOTICE 'SKIP: b2b_bonus_rules chưa tồn tại';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.b2b_bonus_rules ADD COLUMN IF NOT EXISTS bonus_unit text NOT NULL DEFAULT ''wet''';

  -- Drop constraint cũ nếu có rồi tạo lại
  EXECUTE 'ALTER TABLE public.b2b_bonus_rules DROP CONSTRAINT IF EXISTS b2b_bonus_rules_unit_check';
  EXECUTE 'ALTER TABLE public.b2b_bonus_rules ADD CONSTRAINT b2b_bonus_rules_unit_check CHECK (bonus_unit IN (''wet'',''dry''))';

  EXECUTE $cm$
    COMMENT ON COLUMN public.b2b_bonus_rules.bonus_unit IS
      'Đơn vị tính bonus: wet (KL tươi net_weight_kg) hoặc dry (KL khô dry_weight_kg = net × DRC/100). Default wet. Theo decision D2 HAQT 2026: nuoc=dry, tap=wet.'
  $cm$;

  RAISE NOTICE 'Sprint 1.3 STEP 1: bonus_unit column added';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Set default bonus_unit per rubber_type cho rules hiện có
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_updated int;
BEGIN
  UPDATE public.b2b_bonus_rules SET bonus_unit = 'dry' WHERE rubber_type = 'nuoc';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Sprint 1.3 STEP 2a: % rules mủ nước set bonus_unit=dry', v_updated;

  UPDATE public.b2b_bonus_rules SET bonus_unit = 'wet' WHERE rubber_type = 'tap';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'Sprint 1.3 STEP 2b: % rules mủ tạp set bonus_unit=wet', v_updated;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: Update compute_monthly_bonus function — check bonus_unit
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.compute_monthly_bonus(
  p_partner_id  uuid,
  p_year        int,
  p_month       int,
  p_rubber_type text
)
RETURNS public.b2b_monthly_bonuses
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE
  v_first_day    date;
  v_last_day     date;
  v_total_kg     numeric := 0;
  v_volume_tons  numeric := 0;
  v_batch_ids    uuid[];
  v_rule         public.b2b_bonus_rules%ROWTYPE;
  v_total_bonus  numeric := 0;
  v_bp_id        uuid;
  v_bonus_unit   text;
  v_existing     public.b2b_monthly_bonuses%ROWTYPE;
  v_result       public.b2b_monthly_bonuses%ROWTYPE;
BEGIN
  IF p_rubber_type NOT IN ('tap','nuoc') THEN
    RAISE EXCEPTION 'compute_monthly_bonus: rubber_type phải là tap|nuoc, nhận: %', p_rubber_type;
  END IF;

  v_first_day := make_date(p_year, p_month, 1);
  v_last_day  := (v_first_day + interval '1 month' - interval '1 day')::date;

  -- Immutable nếu đã approved/paid
  SELECT * INTO v_existing
  FROM public.b2b_monthly_bonuses
  WHERE partner_id = p_partner_id AND year = p_year AND month = p_month AND rubber_type = p_rubber_type;
  IF FOUND AND v_existing.status IN ('approved','paid') THEN
    RETURN v_existing;
  END IF;

  -- ── PASS 1: get bonus_unit từ bất kỳ rule cùng type còn hiệu lực
  --    (giả định tất cả rules cùng type có cùng bonus_unit — verify ở UI admin)
  SELECT bonus_unit INTO v_bonus_unit
  FROM public.b2b_bonus_rules
  WHERE rubber_type = p_rubber_type
    AND effective_from <= v_last_day
    AND (effective_to IS NULL OR effective_to >= v_first_day)
  ORDER BY effective_from DESC
  LIMIT 1;

  -- Fallback nếu không có rule (vd type chưa setup): wet
  v_bonus_unit := COALESCE(v_bonus_unit, 'wet');

  -- ── PASS 2: SUM column tương ứng với bonus_unit
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rubber_intake_batches') THEN
    IF v_bonus_unit = 'dry' THEN
      -- Cần dry_weight_kg column (sprint b2b_intake_field_data_tanlam)
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='rubber_intake_batches' AND column_name='dry_weight_kg') THEN
        EXECUTE format($q$
          SELECT COALESCE(SUM(dry_weight_kg), 0), COALESCE(array_agg(id ORDER BY intake_date), '{}'::uuid[])
          FROM public.rubber_intake_batches
          WHERE b2b_partner_id = %L
            AND rubber_type = %L
            AND intake_date BETWEEN %L AND %L
            AND status IN ('confirmed','settled')
            AND dry_weight_kg IS NOT NULL
        $q$, p_partner_id, p_rubber_type, v_first_day, v_last_day)
        INTO v_total_kg, v_batch_ids;
      ELSE
        -- Fallback nếu chưa có dry_weight_kg → log warn, dùng net_weight_kg
        RAISE NOTICE 'compute_monthly_bonus: bonus_unit=dry nhưng dry_weight_kg chưa có → fallback net_weight_kg';
        EXECUTE format($q$
          SELECT COALESCE(SUM(net_weight_kg), 0), COALESCE(array_agg(id ORDER BY intake_date), '{}'::uuid[])
          FROM public.rubber_intake_batches
          WHERE b2b_partner_id = %L
            AND rubber_type = %L
            AND intake_date BETWEEN %L AND %L
            AND status IN ('confirmed','settled')
            AND net_weight_kg IS NOT NULL
        $q$, p_partner_id, p_rubber_type, v_first_day, v_last_day)
        INTO v_total_kg, v_batch_ids;
      END IF;
    ELSE
      -- bonus_unit = 'wet'
      EXECUTE format($q$
        SELECT COALESCE(SUM(net_weight_kg), 0), COALESCE(array_agg(id ORDER BY intake_date), '{}'::uuid[])
        FROM public.rubber_intake_batches
        WHERE b2b_partner_id = %L
          AND rubber_type = %L
          AND intake_date BETWEEN %L AND %L
          AND status IN ('confirmed','settled')
          AND net_weight_kg IS NOT NULL
      $q$, p_partner_id, p_rubber_type, v_first_day, v_last_day)
      INTO v_total_kg, v_batch_ids;
    END IF;
  END IF;

  v_volume_tons := v_total_kg / 1000.0;

  -- ── PASS 3: Tìm rule khớp threshold (highest min)
  SELECT * INTO v_rule
  FROM public.b2b_bonus_rules
  WHERE rubber_type = p_rubber_type
    AND effective_from <= v_last_day
    AND (effective_to IS NULL OR effective_to >= v_first_day)
    AND v_volume_tons > threshold_min_tons
    AND (threshold_max_tons IS NULL OR v_volume_tons <= threshold_max_tons)
  ORDER BY threshold_min_tons DESC
  LIMIT 1;

  IF FOUND THEN
    v_total_bonus := v_volume_tons * v_rule.bonus_per_ton_vnd;
  END IF;

  -- bp_id từ b2b.partners
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='b2b' AND table_name='partners') THEN
    EXECUTE format('SELECT bp_id FROM b2b.partners WHERE id = %L', p_partner_id) INTO v_bp_id;
  END IF;

  -- UPSERT
  INSERT INTO public.b2b_monthly_bonuses (
    partner_id, bp_id, year, month, rubber_type,
    total_volume_kg, matched_rule_id, tier_applied, bonus_per_ton,
    total_bonus_vnd, batch_ids, status, computed_at
  ) VALUES (
    p_partner_id, v_bp_id, p_year, p_month, p_rubber_type,
    v_total_kg, v_rule.id, v_rule.tier_label, v_rule.bonus_per_ton_vnd,
    v_total_bonus, v_batch_ids, 'draft', now()
  )
  ON CONFLICT (partner_id, year, month, rubber_type) DO UPDATE
  SET total_volume_kg = EXCLUDED.total_volume_kg,
      matched_rule_id = EXCLUDED.matched_rule_id,
      tier_applied    = EXCLUDED.tier_applied,
      bonus_per_ton   = EXCLUDED.bonus_per_ton,
      total_bonus_vnd = EXCLUDED.total_bonus_vnd,
      batch_ids       = EXCLUDED.batch_ids,
      computed_at     = now(),
      bp_id           = COALESCE(EXCLUDED.bp_id, public.b2b_monthly_bonuses.bp_id)
  WHERE public.b2b_monthly_bonuses.status NOT IN ('approved','paid')
  RETURNING * INTO v_result;

  RETURN v_result;
END $func$;

COMMENT ON FUNCTION public.compute_monthly_bonus(uuid, int, int, text) IS
  'Tính/cập nhật bonus 1 đại lý × tháng × loại mủ. Hỗ trợ bonus_unit (wet/dry) theo rule. Skip nếu bonus đã approved/paid.';

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_dry_rules int;
  v_wet_rules int;
BEGIN
  SELECT count(*) INTO v_dry_rules FROM public.b2b_bonus_rules WHERE bonus_unit='dry';
  SELECT count(*) INTO v_wet_rules FROM public.b2b_bonus_rules WHERE bonus_unit='wet';
  RAISE NOTICE 'VERIFY: % rules bonus_unit=dry, % rules bonus_unit=wet', v_dry_rules, v_wet_rules;
  RAISE NOTICE 'VERIFY PASS — compute_monthly_bonus hỗ trợ bonus_unit. Default: nuoc=dry, tap=wet.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- RECOMPUTE existing bonus (nếu có) để áp dụng KL khô
-- (Skip rows đã approved/paid)
-- ════════════════════════════════════════════════════════════════════════════
-- DO $$
-- DECLARE r record;
-- BEGIN
--   FOR r IN
--     SELECT DISTINCT partner_id, year, month, rubber_type
--     FROM public.b2b_monthly_bonuses
--     WHERE status NOT IN ('approved','paid')
--   LOOP
--     PERFORM public.compute_monthly_bonus(r.partner_id, r.year, r.month, r.rubber_type);
--   END LOOP;
-- END $$;
-- → Uncomment khi user xác nhận muốn recompute toàn bộ DEMO data theo KL khô.

-- ROLLBACK:
-- ALTER TABLE public.b2b_bonus_rules DROP CONSTRAINT IF EXISTS b2b_bonus_rules_unit_check;
-- ALTER TABLE public.b2b_bonus_rules DROP COLUMN IF EXISTS bonus_unit;
-- (function compute_monthly_bonus restore từ b2b_bonus_system.sql nếu cần rollback)
