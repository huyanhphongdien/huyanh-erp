-- ============================================================================
-- DANH MỤC PALLET — định mức bì pallet trên xe (Đợt 1 phương án cân pallet TL→PĐ)
-- Date: 2026-07-15
-- ============================================================================
-- Mục đích:
--   Bảng danh mục loại pallet + KHỐI LƯỢNG ĐƠN VỊ (nhựa 10kg / sắt 50kg).
--   App cân đọc để quy đổi "số pallet trên xe" → kg trừ khỏi mỗi lần cân.
--   Định mức có thể sửa qua UI về sau (giống drc_lookup).
--
-- RLS:
--   - SELECT: tất cả (anon — app cân chạy anon key, phải đọc được).
--   - INSERT/UPDATE/DELETE: authenticated (role check ở app layer).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + seed ON CONFLICT DO NOTHING.
-- An toàn go-live: chỉ TẠO bảng mới + seed, KHÔNG đụng data đang có.
-- ============================================================================

-- ── STEP 1: CREATE TABLE ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pallet_types (
  code           TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  unit_weight_kg NUMERIC(6,2) NOT NULL CHECK (unit_weight_kg >= 0),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  sort_order     INT NOT NULL DEFAULT 0,
  updated_by     UUID REFERENCES auth.users(id),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.pallet_types IS
  'Danh mục loại pallet + khối lượng đơn vị (kg). App cân quy đổi số pallet → kg trừ mỗi lần cân. Sửa qua UI.';
COMMENT ON COLUMN public.pallet_types.code           IS 'Mã loại pallet (plastic/steel).';
COMMENT ON COLUMN public.pallet_types.unit_weight_kg IS 'Khối lượng 1 cái pallet loại này (kg). VD nhựa 10, sắt 50.';

-- Trigger updated_at + updated_by
CREATE OR REPLACE FUNCTION public.pallet_types_set_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pallet_types_updated ON public.pallet_types;
CREATE TRIGGER trg_pallet_types_updated
  BEFORE INSERT OR UPDATE ON public.pallet_types
  FOR EACH ROW EXECUTE FUNCTION public.pallet_types_set_updated();

-- ── STEP 2: RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.pallet_types ENABLE ROW LEVEL SECURITY;

-- SELECT — tất cả (anon app cân cần đọc định mức)
DROP POLICY IF EXISTS pallet_types_select_all ON public.pallet_types;
CREATE POLICY pallet_types_select_all ON public.pallet_types
  FOR SELECT USING (true);

-- INSERT/UPDATE/DELETE — authenticated (role check ở app layer)
DROP POLICY IF EXISTS pallet_types_modify_auth ON public.pallet_types;
CREATE POLICY pallet_types_modify_auth ON public.pallet_types
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ── STEP 3: SEED ────────────────────────────────────────────────────────────
INSERT INTO public.pallet_types (code, label, unit_weight_kg, sort_order) VALUES
  ('plastic', 'Pallet nhựa', 10, 1),
  ('steel',   'Pallet sắt',  50, 2)
ON CONFLICT (code) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ── VERIFY ──────────────────────────────────────────────────────────────────
DO $$
DECLARE v_rows int;
BEGIN
  SELECT COUNT(*) INTO v_rows FROM public.pallet_types WHERE is_active;
  IF v_rows < 2 THEN
    RAISE EXCEPTION 'FAIL: pallet_types chỉ % dòng active (expected ≥2)', v_rows;
  END IF;
  RAISE NOTICE '═══ pallet_types VERIFY PASS — % dòng ═══', v_rows;
END $$;

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_pallet_types_updated ON public.pallet_types;
-- DROP FUNCTION IF EXISTS public.pallet_types_set_updated();
-- DROP TABLE IF EXISTS public.pallet_types;
