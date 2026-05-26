-- ============================================================================
-- B2B Bonus System — Quy chế thưởng đại lý theo sản lượng (mủ tạp + mủ nước)
-- Date: 2026-05-26
-- ============================================================================
--
-- Mục đích:
--   1) Thêm cột `rubber_type` ('tap'|'nuoc') vào rubber_intake_batches.
--   2) Tạo bảng `b2b_bonus_rules` (configurable thresholds) + seed 8 rules
--      từ 2 quy chế (Mủ Tạp T1/2026, Mủ Nước T6/2026).
--   3) Tạo bảng `b2b_monthly_bonuses` (snapshot bonus mỗi partner × tháng × loại).
--   4) Function `compute_monthly_bonus(partner, year, month, rubber_type)` —
--      sum volume theo tháng, match rule, UPSERT bonus row.
--   5) Function `recompute_quarter_bonuses(year, quarter)` — bulk cho tất cả
--      partner active.
--   6) View `v_b2b_partner_bonus_progress` — progress tháng hiện tại
--      (B2B Portal home card dùng).
--   7) RLS: admin RW, partner self-read bonus của mình.
--
-- Tài liệu nguồn:
--   docs/du lieu tho/Quy chế thưởng mủ tạp final (1).docx
--   docs/du lieu tho/Quy chế thưởng mủ nước final.docx
--
-- Phụ thuộc:
--   - hac13_03_business_partners_master.sql (business_partners)
--   - b2b.partners, b2b.settlements, rubber_intake_batches (đã có)
--   - public.employees
--
-- ROLLBACK: cuối file.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: ADD COLUMN rubber_type vào rubber_intake_batches (conditional)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='rubber_intake_batches'
  ) THEN
    EXECUTE 'ALTER TABLE public.rubber_intake_batches ADD COLUMN IF NOT EXISTS rubber_type text';
    EXECUTE $cstr$
      ALTER TABLE public.rubber_intake_batches
      DROP CONSTRAINT IF EXISTS rubber_intake_batches_rubber_type_check
    $cstr$;
    EXECUTE $cstr$
      ALTER TABLE public.rubber_intake_batches
      ADD CONSTRAINT rubber_intake_batches_rubber_type_check
      CHECK (rubber_type IS NULL OR rubber_type IN ('tap','nuoc'))
    $cstr$;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rubber_intake_batches_rubber_type ON public.rubber_intake_batches(rubber_type) WHERE rubber_type IS NOT NULL';
    EXECUTE $cm$
      COMMENT ON COLUMN public.rubber_intake_batches.rubber_type IS
        'Loại mủ: tap (mủ tạp) hoặc nuoc (mủ nước). NULL = chưa phân loại, không tính bonus.'
    $cm$;
    RAISE NOTICE 'STEP 1: rubber_intake_batches.rubber_type added.';
  ELSE
    RAISE NOTICE 'STEP 1 SKIP: bảng rubber_intake_batches không tồn tại.';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: TABLE b2b_bonus_rules
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.b2b_bonus_rules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubber_type           text NOT NULL CHECK (rubber_type IN ('tap','nuoc')),
  tier_label            text NOT NULL,
  threshold_min_tons    numeric NOT NULL CHECK (threshold_min_tons >= 0),
  threshold_max_tons    numeric CHECK (threshold_max_tons IS NULL OR threshold_max_tons > threshold_min_tons),
  bonus_per_ton_vnd     numeric NOT NULL CHECK (bonus_per_ton_vnd >= 0),
  effective_from        date NOT NULL,
  effective_to          date CHECK (effective_to IS NULL OR effective_to >= effective_from),
  sort_order            int NOT NULL DEFAULT 0,
  notes                 text,
  created_by            uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bonus_rules_lookup
  ON public.b2b_bonus_rules(rubber_type, effective_from, effective_to, threshold_min_tons DESC);

COMMENT ON TABLE public.b2b_bonus_rules IS
  'Quy chế thưởng đại lý B2B theo sản lượng tháng. Configurable, có effective period.';
COMMENT ON COLUMN public.b2b_bonus_rules.threshold_min_tons IS
  'Ngưỡng tối thiểu (EXCLUSIVE: SL > min) — vd: 600 nghĩa là SL > 600T mới áp.';
COMMENT ON COLUMN public.b2b_bonus_rules.threshold_max_tons IS
  'Ngưỡng tối đa (INCLUSIVE: SL <= max). NULL = không có max (mức cao nhất).';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: SEED 8 rules từ 2 quy chế
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.b2b_bonus_rules
  (rubber_type, tier_label, threshold_min_tons, threshold_max_tons, bonus_per_ton_vnd, effective_from, sort_order, notes)
VALUES
  -- Mủ tạp (T1/2026 onwards)
  ('tap', 'Tier 4', 600, NULL, 200000, '2026-01-01', 4, 'Quy chế T1/2026'),
  ('tap', 'Tier 3', 400, 600,  150000, '2026-01-01', 3, 'Quy chế T1/2026'),
  ('tap', 'Tier 2', 200, 400,  100000, '2026-01-01', 2, 'Quy chế T1/2026'),
  ('tap', 'Tier 1', 100, 200,   50000, '2026-01-01', 1, 'Quy chế T1/2026'),
  -- Mủ nước (T6/2026 onwards)
  ('nuoc', 'Kim Cương', 60, NULL, 400000, '2026-06-01', 4, 'Quy chế T6/2026'),
  ('nuoc', 'Vàng',      50, 60,   300000, '2026-06-01', 3, 'Quy chế T6/2026'),
  ('nuoc', 'Bạc',       40, 50,   200000, '2026-06-01', 2, 'Quy chế T6/2026'),
  ('nuoc', 'Đồng',      20, 40,   100000, '2026-06-01', 1, 'Quy chế T6/2026')
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: TABLE b2b_monthly_bonuses (snapshot)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.b2b_monthly_bonuses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          uuid NOT NULL,                -- b2b.partners(id) — cross-schema, no FK constraint
  bp_id               uuid REFERENCES public.business_partners(id) ON DELETE SET NULL,
  year                int NOT NULL CHECK (year >= 2020),
  month               int NOT NULL CHECK (month BETWEEN 1 AND 12),
  rubber_type         text NOT NULL CHECK (rubber_type IN ('tap','nuoc')),

  total_volume_kg     numeric NOT NULL DEFAULT 0 CHECK (total_volume_kg >= 0),
  volume_tons         numeric GENERATED ALWAYS AS (total_volume_kg / 1000) STORED,

  matched_rule_id     uuid REFERENCES public.b2b_bonus_rules(id) ON DELETE SET NULL,
  tier_applied        text,
  bonus_per_ton       numeric,
  total_bonus_vnd     numeric NOT NULL DEFAULT 0 CHECK (total_bonus_vnd >= 0),

  batch_ids           uuid[] NOT NULL DEFAULT '{}',

  status              text NOT NULL DEFAULT 'draft' CHECK (status IN
                        ('draft','pending_approval','approved','paid','cancelled')),
  computed_at         timestamptz NOT NULL DEFAULT now(),
  approved_at         timestamptz,
  approved_by         uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  paid_settlement_id  uuid,                          -- b2b.settlements(id) — cross-schema, no FK
  paid_at             timestamptz,
  cancel_reason       text,
  notes               text,

  CONSTRAINT uq_monthly_bonus UNIQUE (partner_id, year, month, rubber_type)
);

CREATE INDEX IF NOT EXISTS idx_monthly_bonus_partner    ON public.b2b_monthly_bonuses(partner_id);
CREATE INDEX IF NOT EXISTS idx_monthly_bonus_period     ON public.b2b_monthly_bonuses(year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_bonus_status     ON public.b2b_monthly_bonuses(status);
CREATE INDEX IF NOT EXISTS idx_monthly_bonus_rubber     ON public.b2b_monthly_bonuses(rubber_type);
CREATE INDEX IF NOT EXISTS idx_monthly_bonus_settlement ON public.b2b_monthly_bonuses(paid_settlement_id)
  WHERE paid_settlement_id IS NOT NULL;

COMMENT ON TABLE public.b2b_monthly_bonuses IS
  'Snapshot bonus mỗi đại lý × tháng × loại mủ. Computed bởi compute_monthly_bonus().';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: FUNCTION compute_monthly_bonus
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.compute_monthly_bonus(
  p_partner_id  uuid,
  p_year        int,
  p_month       int,
  p_rubber_type text
) RETURNS public.b2b_monthly_bonuses
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_first_day    date;
  v_last_day     date;
  v_total_kg     numeric := 0;
  v_volume_tons  numeric;
  v_batch_ids    uuid[] := '{}';
  v_rule         public.b2b_bonus_rules%ROWTYPE;
  v_total_bonus  numeric := 0;
  v_bp_id        uuid;
  v_existing     public.b2b_monthly_bonuses%ROWTYPE;
  v_result       public.b2b_monthly_bonuses%ROWTYPE;
BEGIN
  IF p_rubber_type NOT IN ('tap','nuoc') THEN
    RAISE EXCEPTION 'compute_monthly_bonus: rubber_type phải là tap|nuoc, nhận: %', p_rubber_type;
  END IF;

  v_first_day := make_date(p_year, p_month, 1);
  v_last_day  := (v_first_day + interval '1 month' - interval '1 day')::date;

  -- Check existing bonus đã approved/paid → KHÔNG động (immutable sau khi duyệt)
  SELECT * INTO v_existing
  FROM public.b2b_monthly_bonuses
  WHERE partner_id = p_partner_id AND year = p_year AND month = p_month AND rubber_type = p_rubber_type;

  IF FOUND AND v_existing.status IN ('approved','paid') THEN
    RETURN v_existing;
  END IF;

  -- Sum volume từ rubber_intake_batches
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rubber_intake_batches') THEN
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

  v_volume_tons := v_total_kg / 1000.0;

  -- Tìm rule khớp (highest threshold_min_tons mà volume_tons > min_tons + còn hiệu lực)
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

  -- Lookup bp_id từ b2b.partners
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
END;
$$;

COMMENT ON FUNCTION public.compute_monthly_bonus(uuid, int, int, text) IS
  'Tính/cập nhật bonus 1 đại lý × tháng × loại mủ. Skip nếu bonus đã approved/paid.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 6: FUNCTION recompute_quarter_bonuses
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.recompute_quarter_bonuses(
  p_year     int,
  p_quarter  int
) RETURNS TABLE (partner_id uuid, year int, month int, rubber_type text, total_bonus_vnd numeric)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_month_start  int;
  v_month_end    int;
  v_m            int;
  v_partner_id   uuid;
  v_rt           text;
  v_b2b_exists   boolean;
  v_rib_exists   boolean;
BEGIN
  IF p_quarter NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'recompute_quarter_bonuses: quarter phải 1-4, nhận: %', p_quarter;
  END IF;

  v_month_start := (p_quarter - 1) * 3 + 1;
  v_month_end   := v_month_start + 2;

  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='b2b' AND table_name='partners')
    INTO v_b2b_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rubber_intake_batches')
    INTO v_rib_exists;

  IF NOT (v_b2b_exists AND v_rib_exists) THEN
    RAISE NOTICE 'recompute_quarter_bonuses SKIP: thiếu b2b.partners hoặc rubber_intake_batches';
    RETURN;
  END IF;

  -- Loop qua tất cả (partner, rubber_type) có intake trong quý
  FOR v_partner_id, v_rt IN
    EXECUTE format($q$
      SELECT DISTINCT b2b_partner_id, rubber_type
      FROM public.rubber_intake_batches
      WHERE b2b_partner_id IS NOT NULL
        AND rubber_type IS NOT NULL
        AND status IN ('confirmed','settled')
        AND extract(year FROM intake_date) = %s
        AND extract(quarter FROM intake_date) = %s
    $q$, p_year, p_quarter)
  LOOP
    FOR v_m IN v_month_start..v_month_end LOOP
      PERFORM public.compute_monthly_bonus(v_partner_id, p_year, v_m, v_rt);
    END LOOP;
  END LOOP;

  RETURN QUERY
  SELECT b.partner_id, b.year, b.month, b.rubber_type, b.total_bonus_vnd
  FROM public.b2b_monthly_bonuses b
  WHERE b.year = p_year AND b.month BETWEEN v_month_start AND v_month_end
  ORDER BY b.partner_id, b.month, b.rubber_type;
END;
$$;

COMMENT ON FUNCTION public.recompute_quarter_bonuses(int, int) IS
  'Bulk recompute bonus cho TẤT CẢ đại lý × loại mủ × 3 tháng của quý.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 7: VIEW v_b2b_partner_bonus_progress (cho B2B Portal home card)
-- ════════════════════════════════════════════════════════════════════════════
-- Trả về cho mỗi (partner × rubber_type) trong THÁNG HIỆN TẠI:
--   - volume_kg, volume_tons, tier hiện đạt, bonus dự kiến
--   - ngưỡng kế tiếp + volume cần để lên (vd: "còn 5T nữa lên Bạc")

CREATE OR REPLACE VIEW public.v_b2b_partner_bonus_progress
WITH (security_invoker = true)
AS
WITH current_period AS (
  SELECT
    extract(year FROM CURRENT_DATE)::int AS yr,
    extract(month FROM CURRENT_DATE)::int AS mo,
    date_trunc('month', CURRENT_DATE)::date AS first_day,
    (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date AS last_day
),
intake_sum AS (
  SELECT
    rib.b2b_partner_id AS partner_id,
    rib.rubber_type,
    SUM(rib.net_weight_kg) AS total_kg
  FROM public.rubber_intake_batches rib, current_period cp
  WHERE rib.b2b_partner_id IS NOT NULL
    AND rib.rubber_type IS NOT NULL
    AND rib.intake_date BETWEEN cp.first_day AND cp.last_day
    AND rib.status IN ('confirmed','settled')
    AND rib.net_weight_kg IS NOT NULL
  GROUP BY rib.b2b_partner_id, rib.rubber_type
),
matched AS (
  SELECT
    i.partner_id,
    i.rubber_type,
    i.total_kg,
    (i.total_kg / 1000.0) AS volume_tons,
    (
      SELECT row_to_json(r) FROM (
        SELECT br.tier_label, br.bonus_per_ton_vnd
        FROM public.b2b_bonus_rules br, current_period cp
        WHERE br.rubber_type = i.rubber_type
          AND br.effective_from <= cp.last_day
          AND (br.effective_to IS NULL OR br.effective_to >= cp.first_day)
          AND (i.total_kg / 1000.0) > br.threshold_min_tons
          AND (br.threshold_max_tons IS NULL OR (i.total_kg / 1000.0) <= br.threshold_max_tons)
        ORDER BY br.threshold_min_tons DESC LIMIT 1
      ) r
    ) AS current_rule,
    (
      SELECT row_to_json(r) FROM (
        SELECT br.tier_label, br.threshold_min_tons, br.bonus_per_ton_vnd
        FROM public.b2b_bonus_rules br, current_period cp
        WHERE br.rubber_type = i.rubber_type
          AND br.effective_from <= cp.last_day
          AND (br.effective_to IS NULL OR br.effective_to >= cp.first_day)
          AND br.threshold_min_tons >= (i.total_kg / 1000.0)
        ORDER BY br.threshold_min_tons ASC LIMIT 1
      ) r
    ) AS next_rule
  FROM intake_sum i
)
SELECT
  cp.yr  AS year,
  cp.mo  AS month,
  m.partner_id,
  m.rubber_type,
  m.total_kg AS total_volume_kg,
  m.volume_tons,
  (m.current_rule->>'tier_label')                  AS current_tier,
  ((m.current_rule->>'bonus_per_ton_vnd')::numeric) AS current_bonus_per_ton,
  COALESCE((m.current_rule->>'bonus_per_ton_vnd')::numeric * m.volume_tons, 0) AS estimated_bonus_vnd,
  (m.next_rule->>'tier_label')                     AS next_tier,
  ((m.next_rule->>'threshold_min_tons')::numeric)  AS next_threshold_tons,
  GREATEST(0, COALESCE((m.next_rule->>'threshold_min_tons')::numeric, 0) - m.volume_tons + 0.001)
                                                    AS tons_to_next_tier
FROM matched m CROSS JOIN current_period cp;

COMMENT ON VIEW public.v_b2b_partner_bonus_progress IS
  'Progress bonus tháng hiện tại của partner — dùng cho B2B Portal home card.';

GRANT SELECT ON public.v_b2b_partner_bonus_progress TO authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 8: RLS
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.b2b_bonus_rules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_monthly_bonuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bonus_rules_select_auth   ON public.b2b_bonus_rules;
DROP POLICY IF EXISTS bonus_rules_write_auth    ON public.b2b_bonus_rules;
DROP POLICY IF EXISTS bonus_monthly_select_auth ON public.b2b_monthly_bonuses;
DROP POLICY IF EXISTS bonus_monthly_write_auth  ON public.b2b_monthly_bonuses;

-- Rules: SELECT public (partner cần xem để hiểu tier), mutate authenticated (siết admin sau)
CREATE POLICY bonus_rules_select_auth ON public.b2b_bonus_rules FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY bonus_rules_write_auth  ON public.b2b_bonus_rules FOR ALL    TO authenticated USING (true) WITH CHECK (true);

-- Monthly bonuses: SELECT cho authenticated (admin) + anon partner-self qua RLS
CREATE POLICY bonus_monthly_select_auth ON public.b2b_monthly_bonuses FOR SELECT TO authenticated USING (true);
CREATE POLICY bonus_monthly_write_auth  ON public.b2b_monthly_bonuses FOR ALL    TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON public.b2b_bonus_rules, public.b2b_monthly_bonuses TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.b2b_bonus_rules, public.b2b_monthly_bonuses TO authenticated;
GRANT ALL ON public.b2b_bonus_rules, public.b2b_monthly_bonuses TO service_role;

GRANT EXECUTE ON FUNCTION public.compute_monthly_bonus(uuid, int, int, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recompute_quarter_bonuses(int, int)         TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 9: NOTIFY + SMOKE TEST
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_rule public.b2b_bonus_rules%ROWTYPE;
BEGIN
  -- Verify seed: 8 rules
  IF (SELECT count(*) FROM public.b2b_bonus_rules) < 8 THEN
    RAISE EXCEPTION 'SMOKE FAIL: bonus_rules chưa đủ 8 row, hiện: %',
      (SELECT count(*) FROM public.b2b_bonus_rules);
  END IF;

  -- Test 1: Mủ tạp 750T → Tier 4 (200000đ/T)
  SELECT * INTO v_rule
  FROM public.b2b_bonus_rules
  WHERE rubber_type = 'tap'
    AND effective_from <= '2026-03-31'::date
    AND (effective_to IS NULL OR effective_to >= '2026-03-01'::date)
    AND 750 > threshold_min_tons
    AND (threshold_max_tons IS NULL OR 750 <= threshold_max_tons)
  ORDER BY threshold_min_tons DESC LIMIT 1;

  IF v_rule.tier_label <> 'Tier 4' OR v_rule.bonus_per_ton_vnd <> 200000 THEN
    RAISE EXCEPTION 'SMOKE FAIL: 750T tạp → expect Tier 4 + 200000, got % + %',
      v_rule.tier_label, v_rule.bonus_per_ton_vnd;
  END IF;
  IF (750 * v_rule.bonus_per_ton_vnd) <> 150000000 THEN
    RAISE EXCEPTION 'SMOKE FAIL: 750T tạp bonus expect 150.000.000đ, got %',
      (750 * v_rule.bonus_per_ton_vnd);
  END IF;

  -- Test 2: Mủ nước 65T → Kim Cương (400000đ/T) → 26.000.000
  SELECT * INTO v_rule
  FROM public.b2b_bonus_rules
  WHERE rubber_type = 'nuoc'
    AND effective_from <= '2026-06-30'::date
    AND (effective_to IS NULL OR effective_to >= '2026-06-01'::date)
    AND 65 > threshold_min_tons
    AND (threshold_max_tons IS NULL OR 65 <= threshold_max_tons)
  ORDER BY threshold_min_tons DESC LIMIT 1;

  IF v_rule.tier_label <> 'Kim Cương' OR v_rule.bonus_per_ton_vnd <> 400000 THEN
    RAISE EXCEPTION 'SMOKE FAIL: 65T nước → expect Kim Cương + 400000, got % + %',
      v_rule.tier_label, v_rule.bonus_per_ton_vnd;
  END IF;
  IF (65 * v_rule.bonus_per_ton_vnd) <> 26000000 THEN
    RAISE EXCEPTION 'SMOKE FAIL: 65T nước bonus expect 26.000.000đ, got %',
      (65 * v_rule.bonus_per_ton_vnd);
  END IF;

  -- Test 3: Mủ tạp 80T → KHÔNG có rule (< 100T)
  SELECT * INTO v_rule
  FROM public.b2b_bonus_rules
  WHERE rubber_type = 'tap'
    AND effective_from <= '2026-03-31'::date
    AND 80 > threshold_min_tons
    AND (threshold_max_tons IS NULL OR 80 <= threshold_max_tons)
  ORDER BY threshold_min_tons DESC LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'SMOKE FAIL: 80T tạp expect không có rule (<100T), got %', v_rule.tier_label;
  END IF;

  -- Test 4: Mủ nước trước T6/2026 → chưa hiệu lực
  SELECT * INTO v_rule
  FROM public.b2b_bonus_rules
  WHERE rubber_type = 'nuoc'
    AND effective_from <= '2026-05-31'::date
    AND (effective_to IS NULL OR effective_to >= '2026-05-01'::date)
    AND 65 > threshold_min_tons
  ORDER BY threshold_min_tons DESC LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'SMOKE FAIL: nước T5/2026 chưa hiệu lực, got %', v_rule.tier_label;
  END IF;

  RAISE NOTICE 'SMOKE PASS — bonus_rules khớp ví dụ docx (750T tạp=150tr, 65T nước=26tr, 80T tạp=0, nước T5=chưa HL).';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK:
-- ════════════════════════════════════════════════════════════════════════════
-- DROP VIEW IF EXISTS public.v_b2b_partner_bonus_progress;
-- DROP FUNCTION IF EXISTS public.recompute_quarter_bonuses(int, int);
-- DROP FUNCTION IF EXISTS public.compute_monthly_bonus(uuid, int, int, text);
-- DROP TABLE IF EXISTS public.b2b_monthly_bonuses;
-- DROP TABLE IF EXISTS public.b2b_bonus_rules;
-- ALTER TABLE public.rubber_intake_batches DROP COLUMN IF EXISTS rubber_type;
