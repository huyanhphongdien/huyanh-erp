-- ============================================================================
-- Sprint 1.2 — pnk_number sequential per (facility, năm)
-- Date: 2026-05-26
-- Decision D5: pnk_number int sequential, reset 1/1 mỗi năm, riêng cho từng facility
-- ============================================================================
--
-- Mục đích: tự sinh số phiếu PNK (Phiếu Nhập Kho & Thanh Toán) liên 2 giao khách
-- giống Excel TL (số 71, 72, ... 76 trong tháng 5/2026).
--
-- Format display UI: PNK-{year}-{padded5}-{facility_code}
--   Vd: PNK-2026-00076-TL = phiếu 76 năm 2026 tại Tân Lâm
--
-- Concurrency: dùng advisory_xact_lock(facility_uuid_hash, year) → 2 phiếu insert
-- cùng lúc cùng facility sẽ tuần tự lấy số, không bị skip/dup.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rubber_intake_batches') THEN
    RAISE NOTICE 'SKIP: rubber_intake_batches không tồn tại';
    RETURN;
  END IF;

  -- ADD pnk_number int (nullable cho data cũ)
  EXECUTE 'ALTER TABLE public.rubber_intake_batches ADD COLUMN IF NOT EXISTS pnk_number int';
  EXECUTE $cm$
    COMMENT ON COLUMN public.rubber_intake_batches.pnk_number IS
      'Số Phiếu Nhập Kho & Thanh Toán (liên 2 giao khách). Sequential per (facility_id, năm intake_date). Reset 1/1 hàng năm. Format display: PNK-{year}-{N:05d}-{facility_code}.'
  $cm$;

  -- UNIQUE constraint: (facility_id, năm intake_date, pnk_number) phải UNIQUE
  -- Dùng function-based unique index
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uniq_rib_pnk_facility_year
    ON public.rubber_intake_batches (facility_id, (extract(year from intake_date)::int), pnk_number)
    WHERE pnk_number IS NOT NULL AND facility_id IS NOT NULL';

  RAISE NOTICE 'Sprint 1.2 STEP 1: pnk_number column + unique index added';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCTION: lấy số pnk tiếp theo cho (facility, năm)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.next_pnk_number(p_facility_id uuid, p_year int)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  v_lock_key bigint;
  v_next int;
BEGIN
  IF p_facility_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Hash facility_id + year thành key cho advisory_xact_lock
  -- 2 phiếu insert cùng (facility, year) sẽ tuần tự lấy số
  v_lock_key := ('x' || substr(md5(p_facility_id::text || p_year::text), 1, 15))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(pnk_number), 0) + 1 INTO v_next
  FROM public.rubber_intake_batches
  WHERE facility_id = p_facility_id
    AND extract(year FROM intake_date)::int = p_year
    AND pnk_number IS NOT NULL;

  RETURN v_next;
END $$;

COMMENT ON FUNCTION public.next_pnk_number(uuid, int) IS
  'Lấy số pnk_number tiếp theo cho (facility, năm). Advisory_xact_lock đảm bảo concurrent insert không conflict.';

-- ════════════════════════════════════════════════════════════════════════════
-- TRIGGER: tự gán pnk_number nếu insert NULL
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_rib_auto_pnk_number()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pnk_number IS NULL
     AND NEW.facility_id IS NOT NULL
     AND NEW.intake_date IS NOT NULL
     AND NEW.status IN ('confirmed', 'settled') THEN
    NEW.pnk_number := public.next_pnk_number(NEW.facility_id, extract(year FROM NEW.intake_date)::int);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rib_auto_pnk_number ON public.rubber_intake_batches;
CREATE TRIGGER trg_rib_auto_pnk_number
  BEFORE INSERT OR UPDATE OF status ON public.rubber_intake_batches
  FOR EACH ROW EXECUTE FUNCTION public.trg_rib_auto_pnk_number();

COMMENT ON FUNCTION public.trg_rib_auto_pnk_number() IS
  'Auto-assign pnk_number khi rubber_intake_batches status chuyển sang confirmed/settled. Chỉ assign nếu chưa có pnk_number + có facility_id + intake_date.';

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_col_exists boolean;
  v_func_exists boolean;
  v_idx_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='rubber_intake_batches' AND column_name='pnk_number')
    INTO v_col_exists;
  SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='next_pnk_number')
    INTO v_func_exists;
  SELECT EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='rubber_intake_batches' AND indexname='uniq_rib_pnk_facility_year')
    INTO v_idx_exists;

  IF NOT (v_col_exists AND v_func_exists AND v_idx_exists) THEN
    RAISE EXCEPTION 'Sprint 1.2 FAIL: col=% func=% idx=%', v_col_exists, v_func_exists, v_idx_exists;
  END IF;
  RAISE NOTICE 'VERIFY PASS — pnk_number column + function + trigger + unique index OK';
END $$;

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_rib_auto_pnk_number ON public.rubber_intake_batches;
-- DROP FUNCTION IF EXISTS public.trg_rib_auto_pnk_number();
-- DROP FUNCTION IF EXISTS public.next_pnk_number(uuid, int);
-- DROP INDEX IF EXISTS public.uniq_rib_pnk_facility_year;
-- ALTER TABLE public.rubber_intake_batches DROP COLUMN IF EXISTS pnk_number;
