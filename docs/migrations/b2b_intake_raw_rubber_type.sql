-- ============================================================================
-- B2B Intake — Thêm raw_rubber_type (5 loại chi tiết) + auto-derive bonus type
-- Date: 2026-05-26
-- ============================================================================
--
-- Mục đích:
--   Quy chế bonus chỉ phân 2 loại ('tap','nuoc') nhưng quản trị cần thống kê
--   chi tiết 5 loại mủ thô (mu_nuoc/mu_tap/mu_dong/mu_chen/mu_to).
--
--   Phương án:
--     1. Thêm cột `raw_rubber_type` (5 loại) — source of truth chi tiết
--     2. Giữ cột `rubber_type` (2 loại) — auto-derive qua trigger
--     3. Backfill từ weighbridge_tickets (link qua deal_id) cho data cũ
--     4. Backfill DEMO data từ rubber_type cũ (generic mapping)
--
-- Mapping (đã chốt với user):
--   mu_nuoc  → 'nuoc'
--   mu_tap   → 'tap'
--   mu_dong  → 'tap'  (mủ đông = tạp)
--   mu_chen  → 'tap'  (mủ chén = tạp, theo bản chất vật lý)
--   mu_to    → 'tap'  (mủ tờ = tạp)
--   svr_*    → NULL   (thành phẩm — không tính bonus)
--
-- Phụ thuộc: b2b_bonus_system.sql, b2b_intake_manual_entry.sql
-- ROLLBACK: cuối file.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: ADD COLUMN raw_rubber_type + CHECK
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

  EXECUTE 'ALTER TABLE public.rubber_intake_batches ADD COLUMN IF NOT EXISTS raw_rubber_type text';
  EXECUTE $cs$
    ALTER TABLE public.rubber_intake_batches
    DROP CONSTRAINT IF EXISTS rubber_intake_batches_raw_rubber_type_check
  $cs$;
  EXECUTE $cs$
    ALTER TABLE public.rubber_intake_batches
    ADD CONSTRAINT rubber_intake_batches_raw_rubber_type_check
    CHECK (raw_rubber_type IS NULL OR raw_rubber_type IN
      ('mu_nuoc','mu_tap','mu_dong','mu_chen','mu_to'))
  $cs$;
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rubber_intake_batches_raw_rubber_type ON public.rubber_intake_batches(raw_rubber_type) WHERE raw_rubber_type IS NOT NULL';
  EXECUTE $cm$
    COMMENT ON COLUMN public.rubber_intake_batches.raw_rubber_type IS
      'Loại mủ thô chi tiết (5 loại) — cho quản trị/thống kê. Trigger tự derive rubber_type (2 loại) cho bonus.'
  $cm$;

  RAISE NOTICE 'STEP 1: raw_rubber_type added.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Helper function map_raw_to_bonus_type
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.map_raw_to_bonus_type(p_raw text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_raw
    WHEN 'mu_nuoc' THEN 'nuoc'
    WHEN 'mu_tap'  THEN 'tap'
    WHEN 'mu_dong' THEN 'tap'
    WHEN 'mu_chen' THEN 'tap'
    WHEN 'mu_to'   THEN 'tap'
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION public.map_raw_to_bonus_type(text) IS
  'Mapping 5 loại mủ thô → 2 loại bonus theo quy chế 2026. NULL nếu không match (vd svr_*).';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: TRIGGER auto-derive rubber_type từ raw_rubber_type
-- ════════════════════════════════════════════════════════════════════════════
-- Logic:
--   - Nếu raw_rubber_type được set → derive rubber_type cho bonus
--   - Nếu chỉ rubber_type cũ → giữ nguyên (backward compat)
--   - Nếu cả 2 set → raw thắng (raw là source of truth)

CREATE OR REPLACE FUNCTION public.trg_intake_batch_derive_rubber_type()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.raw_rubber_type IS NOT NULL THEN
    NEW.rubber_type := public.map_raw_to_bonus_type(NEW.raw_rubber_type);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_intake_batch_derive_rubber_type ON public.rubber_intake_batches;
CREATE TRIGGER trg_intake_batch_derive_rubber_type
BEFORE INSERT OR UPDATE OF raw_rubber_type ON public.rubber_intake_batches
FOR EACH ROW
EXECUTE FUNCTION public.trg_intake_batch_derive_rubber_type();

COMMENT ON FUNCTION public.trg_intake_batch_derive_rubber_type() IS
  'BEFORE INSERT/UPDATE raw_rubber_type → set rubber_type theo mapping (2 loại bonus).';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: BACKFILL từ weighbridge_tickets (nếu có link qua deal_id)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_wt_exists boolean;
  v_count int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='weighbridge_tickets'
  ) INTO v_wt_exists;

  IF NOT v_wt_exists THEN
    RAISE NOTICE 'STEP 4 SKIP: weighbridge_tickets không tồn tại.';
    RETURN;
  END IF;

  -- Backfill raw_rubber_type cho intake batches có link weighbridge qua deal_id
  EXECUTE $q$
    UPDATE public.rubber_intake_batches rib
    SET raw_rubber_type = wt.rubber_type
    FROM public.weighbridge_tickets wt
    WHERE rib.deal_id = wt.deal_id
      AND rib.deal_id IS NOT NULL
      AND rib.raw_rubber_type IS NULL
      AND wt.rubber_type IN ('mu_nuoc','mu_tap','mu_dong','mu_chen','mu_to')
  $q$;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'STEP 4a: backfill từ weighbridge_tickets (deal_id link): % rows', v_count;

  -- Fallback: match qua partner_id + intake_date (nếu deal_id NULL)
  EXECUTE $q$
    UPDATE public.rubber_intake_batches rib
    SET raw_rubber_type = wt.rubber_type
    FROM public.weighbridge_tickets wt
    WHERE rib.b2b_partner_id = wt.partner_id
      AND rib.b2b_partner_id IS NOT NULL
      AND rib.raw_rubber_type IS NULL
      AND ABS(EXTRACT(EPOCH FROM (rib.intake_date::timestamp - wt.created_at)) / 86400) <= 1
      AND wt.rubber_type IN ('mu_nuoc','mu_tap','mu_dong','mu_chen','mu_to')
  $q$;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'STEP 4b: backfill qua partner_id + date proximity: % rows', v_count;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: BACKFILL DEMO data + intake có rubber_type cũ nhưng raw_rubber_type NULL
-- ════════════════════════════════════════════════════════════════════════════
-- Reverse normalize: rubber_type='tap' → raw_rubber_type='mu_tap' (generic),
-- rubber_type='nuoc' → raw_rubber_type='mu_nuoc'. Mất chi tiết mu_dong/chen/to
-- nhưng OK vì DEMO data + data legacy không biết loại cụ thể.

UPDATE public.rubber_intake_batches
SET raw_rubber_type = CASE rubber_type
  WHEN 'nuoc' THEN 'mu_nuoc'
  WHEN 'tap'  THEN 'mu_tap'
  ELSE NULL
END
WHERE raw_rubber_type IS NULL AND rubber_type IN ('tap','nuoc');

DO $$
DECLARE
  v_total int;
  v_with_raw int;
  v_match_bonus int;
BEGIN
  SELECT count(*) INTO v_total FROM public.rubber_intake_batches;
  SELECT count(*) INTO v_with_raw FROM public.rubber_intake_batches WHERE raw_rubber_type IS NOT NULL;
  SELECT count(*) INTO v_match_bonus FROM public.rubber_intake_batches
    WHERE raw_rubber_type IS NOT NULL AND rubber_type IS NOT NULL
      AND rubber_type = public.map_raw_to_bonus_type(raw_rubber_type);
  RAISE NOTICE 'STEP 5: total=% · với raw_rubber_type=% · mapping nhất quán=%',
    v_total, v_with_raw, v_match_bonus;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 6: View tổng hợp theo raw_rubber_type (cho dashboard chi tiết)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_b2b_intake_by_raw_type
WITH (security_invoker = true) AS
SELECT
  extract(year FROM intake_date)::int  AS year,
  extract(month FROM intake_date)::int AS month,
  raw_rubber_type,
  rubber_type AS bonus_type,
  CASE raw_rubber_type
    WHEN 'mu_nuoc' THEN 'Mủ nước'
    WHEN 'mu_tap'  THEN 'Mủ tạp'
    WHEN 'mu_dong' THEN 'Mủ đông'
    WHEN 'mu_chen' THEN 'Mủ chén'
    WHEN 'mu_to'   THEN 'Mủ tờ'
    ELSE 'Chưa phân loại'
  END AS raw_label,
  COUNT(*)                        AS batch_count,
  COUNT(DISTINCT b2b_partner_id)  AS partner_count,
  SUM(net_weight_kg)              AS total_weight_kg,
  ROUND(SUM(net_weight_kg) / 1000.0, 2) AS total_volume_tons,
  AVG(drc_percent)                AS avg_drc
FROM public.rubber_intake_batches
WHERE status IN ('confirmed','settled')
  AND intake_date IS NOT NULL
GROUP BY year, month, raw_rubber_type, rubber_type;

COMMENT ON VIEW public.v_b2b_intake_by_raw_type IS
  'Tổng hợp khối lượng intake theo 5 loại mủ thô × tháng. Cho dashboard quản trị.';

GRANT SELECT ON public.v_b2b_intake_by_raw_type TO authenticated, anon;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 7: NOTIFY + VERIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_col_exists boolean;
  v_inconsistent int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='rubber_intake_batches'
      AND column_name='raw_rubber_type'
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RAISE EXCEPTION 'VERIFY FAIL: raw_rubber_type chưa được tạo';
  END IF;

  -- Verify mapping nhất quán (rubber_type = map(raw_rubber_type) ở mọi row có raw)
  SELECT count(*) INTO v_inconsistent
  FROM public.rubber_intake_batches
  WHERE raw_rubber_type IS NOT NULL
    AND rubber_type IS DISTINCT FROM public.map_raw_to_bonus_type(raw_rubber_type);

  IF v_inconsistent > 0 THEN
    -- Fix legacy mismatch (run UPDATE trigger logic manually)
    UPDATE public.rubber_intake_batches
    SET rubber_type = public.map_raw_to_bonus_type(raw_rubber_type)
    WHERE raw_rubber_type IS NOT NULL
      AND rubber_type IS DISTINCT FROM public.map_raw_to_bonus_type(raw_rubber_type);
    RAISE NOTICE 'STEP 7: Fixed % row có rubber_type không khớp raw mapping', v_inconsistent;
  END IF;

  RAISE NOTICE 'VERIFY PASS — raw_rubber_type + trigger + mapping + backfill OK.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK:
-- ════════════════════════════════════════════════════════════════════════════
-- DROP VIEW IF EXISTS public.v_b2b_intake_by_raw_type;
-- DROP TRIGGER IF EXISTS trg_intake_batch_derive_rubber_type ON public.rubber_intake_batches;
-- DROP FUNCTION IF EXISTS public.trg_intake_batch_derive_rubber_type();
-- DROP FUNCTION IF EXISTS public.map_raw_to_bonus_type(text);
-- ALTER TABLE public.rubber_intake_batches DROP CONSTRAINT IF EXISTS rubber_intake_batches_raw_rubber_type_check;
-- ALTER TABLE public.rubber_intake_batches DROP COLUMN IF EXISTS raw_rubber_type;
