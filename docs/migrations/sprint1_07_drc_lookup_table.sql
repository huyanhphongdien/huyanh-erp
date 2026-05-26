-- ============================================================================
-- Sprint 1.7 — Bảng tra cứu DRC từ Metrolac (ĐỐT) — editable lookup
-- Date: 2026-05-26
-- ============================================================================
--
-- Mục đích:
--   Thay công thức linear "DRC = ĐỐT × 0.2 − 3.4" (HAQT) bằng bảng tra cứu
--   thực tế từ "bang quy doi DRC 2.xls" — bảng HAQT đã dùng nhiều năm.
--
-- Cấu trúc:
--   - metrolac_reading INT PRIMARY KEY (220-274 hiện tại, có thể mở rộng)
--   - drc_pct NUMERIC(5,2) — DRC% tương ứng (vd 40.5)
--   - QC có thể CRUD qua UI ở /weighbridge/admin/drc-lookup
--
-- RLS:
--   - SELECT: anon + authenticated (mọi user weighbridge đều tra được)
--   - INSERT/UPDATE/DELETE: chỉ role 'qc' và 'admin'
--
-- LƯU Ý DỮ LIỆU:
--   2 giá trị tại Metrolac=260 (48.9) và 261 (52.2) lệch trend linear
--   (~+1.0 và +4.1 so với neighbors). Seed GIỮ NGUYÊN từ bảng cũ — cần
--   QC/Tân Lâm xác nhận và sửa qua UI nếu cần.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: CREATE TABLE
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.drc_lookup (
  metrolac_reading INT PRIMARY KEY CHECK (metrolac_reading BETWEEN 100 AND 400),
  drc_pct NUMERIC(5,2) NOT NULL CHECK (drc_pct BETWEEN 0 AND 100),
  source TEXT DEFAULT 'bang_quy_doi_drc_2_huyanh',
  notes TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.drc_lookup IS
  'Bảng tra cứu DRC% từ chỉ số Metrolac (ĐỐT). Source: bang_quy_doi_drc_2.xls (HAQT). QC sửa qua UI /weighbridge/admin/drc-lookup. Range hiện tại 220-274, lookup ngoài range fallback linear interpolation.';

COMMENT ON COLUMN public.drc_lookup.metrolac_reading IS
  'Chỉ số đo trên tỷ trọng kế Metrolac/lactometer (integer, range typical 180-290 với mủ nước).';

COMMENT ON COLUMN public.drc_lookup.drc_pct IS
  'DRC % tương ứng (vd 40.5 không phải 0.405). Có thể chỉnh sửa.';

-- Trigger update updated_at + updated_by
CREATE OR REPLACE FUNCTION public.drc_lookup_set_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_drc_lookup_updated ON public.drc_lookup;
CREATE TRIGGER trg_drc_lookup_updated
  BEFORE INSERT OR UPDATE ON public.drc_lookup
  FOR EACH ROW EXECUTE FUNCTION public.drc_lookup_set_updated();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: RLS
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.drc_lookup ENABLE ROW LEVEL SECURITY;

-- SELECT — tất cả (anon weighbridge cũng cần tra)
DROP POLICY IF EXISTS drc_lookup_select_all ON public.drc_lookup;
CREATE POLICY drc_lookup_select_all ON public.drc_lookup
  FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE — chỉ authenticated user (role check sẽ làm ở app layer,
-- không hard-code role 'qc'/'admin' trong policy vì hệ thống role còn đang dev)
DROP POLICY IF EXISTS drc_lookup_modify_auth ON public.drc_lookup;
CREATE POLICY drc_lookup_modify_auth ON public.drc_lookup
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: SEED 55 dòng từ "bang quy doi DRC 2.xls"
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.drc_lookup (metrolac_reading, drc_pct, notes) VALUES
  (220, 40.5, NULL),
  (221, 40.7, NULL),
  (222, 40.9, NULL),
  (223, 41.0, NULL),
  (224, 41.2, NULL),
  (225, 41.4, NULL),
  (226, 41.6, NULL),
  (227, 41.8, NULL),
  (228, 42.0, NULL),
  (229, 42.2, NULL),
  (230, 42.4, NULL),
  (231, 42.6, NULL),
  (232, 42.8, NULL),
  (233, 42.9, NULL),
  (234, 43.1, NULL),
  (235, 43.3, NULL),
  (236, 43.5, NULL),
  (237, 43.7, NULL),
  (238, 43.8, NULL),
  (239, 44.0, NULL),
  (240, 44.2, NULL),
  (241, 44.4, NULL),
  (242, 44.6, NULL),
  (243, 44.8, NULL),
  (244, 45.0, NULL),
  (245, 45.2, NULL),
  (246, 45.4, NULL),
  (247, 45.6, NULL),
  (248, 45.7, NULL),
  (249, 45.9, NULL),
  (250, 46.1, NULL),
  (251, 46.3, NULL),
  (252, 46.4, NULL),
  (253, 46.6, NULL),
  (254, 46.8, NULL),
  (255, 47.0, NULL),
  (256, 47.2, NULL),
  (257, 47.3, NULL),
  (258, 47.5, NULL),
  (259, 47.7, NULL),
  (260, 48.9, 'Lệch trend +1.0 — cần Tân Lâm/QC xác minh'),
  (261, 52.2, 'Lệch trend +4.1 — cần Tân Lâm/QC xác minh, có thể là typo 48.1'),
  (262, 48.3, NULL),
  (263, 48.5, NULL),
  (264, 48.7, NULL),
  (265, 48.9, NULL),
  (266, 49.1, NULL),
  (267, 49.2, NULL),
  (268, 49.4, NULL),
  (269, 49.6, NULL),
  (270, 49.8, NULL),
  (271, 50.0, NULL),
  (272, 50.1, NULL),
  (273, 50.3, NULL),
  (274, 50.5, NULL)
ON CONFLICT (metrolac_reading) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: RPC lookup_drc(metrolac) — tra cứu có linear interpolation
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.lookup_drc(p_metrolac NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_floor   INT;
  v_ceil    INT;
  v_drc_floor NUMERIC;
  v_drc_ceil  NUMERIC;
  v_min     INT;
  v_max     INT;
BEGIN
  IF p_metrolac IS NULL THEN RETURN NULL; END IF;

  -- 1. Tra exact match
  SELECT drc_pct INTO v_drc_floor FROM public.drc_lookup
  WHERE metrolac_reading = ROUND(p_metrolac)::INT;
  IF FOUND AND p_metrolac = ROUND(p_metrolac) THEN
    RETURN v_drc_floor;
  END IF;

  -- 2. Tra floor/ceil để interpolate
  v_floor := FLOOR(p_metrolac)::INT;
  v_ceil  := CEIL(p_metrolac)::INT;

  SELECT drc_pct INTO v_drc_floor FROM public.drc_lookup WHERE metrolac_reading = v_floor;
  SELECT drc_pct INTO v_drc_ceil  FROM public.drc_lookup WHERE metrolac_reading = v_ceil;

  IF v_drc_floor IS NOT NULL AND v_drc_ceil IS NOT NULL THEN
    -- Linear interpolation giữa 2 dòng
    RETURN ROUND((v_drc_floor + (v_drc_ceil - v_drc_floor) * (p_metrolac - v_floor))::NUMERIC, 2);
  END IF;

  -- 3. Out-of-range fallback: dùng slope từ 2 dòng gần nhất
  SELECT MIN(metrolac_reading), MAX(metrolac_reading) INTO v_min, v_max FROM public.drc_lookup;
  IF v_min IS NULL THEN RETURN NULL; END IF;

  IF p_metrolac < v_min THEN
    -- Linear từ 2 dòng đầu
    SELECT drc_pct INTO v_drc_floor FROM public.drc_lookup WHERE metrolac_reading = v_min;
    SELECT drc_pct INTO v_drc_ceil  FROM public.drc_lookup WHERE metrolac_reading = v_min + 1;
    IF v_drc_floor IS NULL OR v_drc_ceil IS NULL THEN RETURN v_drc_floor; END IF;
    RETURN GREATEST(0, ROUND((v_drc_floor + (v_drc_ceil - v_drc_floor) * (p_metrolac - v_min))::NUMERIC, 2));
  ELSE
    -- Linear từ 2 dòng cuối
    SELECT drc_pct INTO v_drc_floor FROM public.drc_lookup WHERE metrolac_reading = v_max - 1;
    SELECT drc_pct INTO v_drc_ceil  FROM public.drc_lookup WHERE metrolac_reading = v_max;
    IF v_drc_floor IS NULL OR v_drc_ceil IS NULL THEN RETURN v_drc_ceil; END IF;
    RETURN LEAST(100, ROUND((v_drc_ceil + (v_drc_ceil - v_drc_floor) * (p_metrolac - v_max))::NUMERIC, 2));
  END IF;
END $$;

COMMENT ON FUNCTION public.lookup_drc(NUMERIC) IS
  'Tra DRC% từ chỉ số Metrolac. Exact lookup nếu integer in-range; linear interpolation nếu là số lẻ hoặc ngoài range. Trả NULL nếu bảng rỗng.';

GRANT EXECUTE ON FUNCTION public.lookup_drc(NUMERIC) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_rows int;
  v_test NUMERIC;
BEGIN
  SELECT COUNT(*) INTO v_rows FROM public.drc_lookup;
  IF v_rows < 55 THEN
    RAISE WARNING 'drc_lookup chỉ % dòng (expected ≥55)', v_rows;
  END IF;

  v_test := public.lookup_drc(230);
  IF v_test IS NULL OR v_test <> 42.4 THEN
    RAISE EXCEPTION 'lookup_drc(230) = % (expected 42.4)', v_test;
  END IF;

  v_test := public.lookup_drc(225.5);
  IF v_test IS NULL OR v_test < 41.4 OR v_test > 41.6 THEN
    RAISE EXCEPTION 'lookup_drc(225.5) = % (expected 41.5)', v_test;
  END IF;

  RAISE NOTICE 'VERIFY PASS — drc_lookup % dòng, lookup_drc(230)=%, lookup_drc(225.5)=%',
    v_rows, public.lookup_drc(230), public.lookup_drc(225.5);
END $$;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.lookup_drc(NUMERIC);
-- DROP TRIGGER IF EXISTS trg_drc_lookup_updated ON public.drc_lookup;
-- DROP FUNCTION IF EXISTS public.drc_lookup_set_updated();
-- DROP TABLE IF EXISTS public.drc_lookup;
