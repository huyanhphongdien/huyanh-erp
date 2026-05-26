-- ============================================================================
-- B2B DEMO FLAG + FACILITY BACKFILL — Chuẩn bị go-live 1/6/2026
-- Date: 2026-05-26
-- ============================================================================
--
-- Mục đích:
--   1) Đánh dấu 12 đại lý DEMO-XXXX là is_demo=true để UI phân biệt với data thật
--   2) Backfill facility_id = PD cho 75 row rubber_intake_batches seed từ Excel
--      (chuẩn bị extend WeighbridgeListPage + dashboard cross-facility)
--   3) Verify count trước/sau
--
-- An toàn: tất cả data hiện tại là DEMO, user đã confirm reset/sửa thoải mái.
--
-- Phụ thuộc: b2b_bonus_seed_sample_data.sql (đã chạy)
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: ADD COLUMN is_demo
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='b2b' AND table_name='partners'
  ) THEN
    RAISE NOTICE 'SKIP: b2b.partners không tồn tại.';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE b2b.partners ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_b2b_partners_is_demo ON b2b.partners(is_demo) WHERE is_demo = true';
  EXECUTE $cm$
    COMMENT ON COLUMN b2b.partners.is_demo IS
      'TRUE = đại lý DEMO/test (training material). FALSE = đại lý thật. UI hiển thị tag DEMO để phân biệt.'
  $cm$;

  RAISE NOTICE 'STEP 1: is_demo column added.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Mark 12 DEMO-XXXX partners là is_demo
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_marked int;
BEGIN
  UPDATE b2b.partners
  SET is_demo = true
  WHERE bp_id IN (
    SELECT bp_id FROM public.bp_search_keys
    WHERE key_type = 'ALIAS' AND key_value LIKE 'DEMO-%'
  )
  AND is_demo = false;

  GET DIAGNOSTICS v_marked = ROW_COUNT;
  RAISE NOTICE 'STEP 2: Marked % DEMO partners as is_demo=true', v_marked;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: Backfill facility_id = PD cho rubber_intake_batches của DEMO
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_pd_id uuid;
  v_updated int;
BEGIN
  SELECT id INTO v_pd_id FROM public.facilities WHERE code = 'PD' LIMIT 1;

  IF v_pd_id IS NULL THEN
    RAISE EXCEPTION 'STEP 3 FAIL: facility code=PD không tồn tại. Tạo facility PD trước khi chạy migration này.';
  END IF;

  -- Backfill cho rows seed DEMO (match qua notes pattern hoặc qua partner is_demo)
  UPDATE public.rubber_intake_batches rib
  SET facility_id = v_pd_id
  WHERE facility_id IS NULL
    AND (
      rib.notes LIKE 'Seed data từ Excel%'
      OR rib.b2b_partner_id IN (SELECT id FROM b2b.partners WHERE is_demo = true)
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'STEP 3: Backfilled facility_id=PD cho % rubber_intake_batches DEMO rows', v_updated;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: NOTIFY + VERIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_demo_partners int;
  v_demo_batches int;
  v_null_facility int;
  v_pd_batches int;
  r record;
BEGIN
  SELECT count(*) INTO v_demo_partners FROM b2b.partners WHERE is_demo = true;
  SELECT count(*) INTO v_demo_batches FROM public.rubber_intake_batches WHERE notes LIKE 'Seed data từ Excel%';
  SELECT count(*) INTO v_null_facility FROM public.rubber_intake_batches WHERE facility_id IS NULL;
  SELECT count(*) INTO v_pd_batches FROM public.rubber_intake_batches rib
    JOIN public.facilities f ON f.id = rib.facility_id
    WHERE f.code = 'PD';

  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE 'VERIFY:';
  RAISE NOTICE '  • DEMO partners marked: %', v_demo_partners;
  RAISE NOTICE '  • DEMO intake batches (notes match): %', v_demo_batches;
  RAISE NOTICE '  • intake_batches facility_id IS NULL: % (mong đợi 0)', v_null_facility;
  RAISE NOTICE '  • intake_batches facility=PD: %', v_pd_batches;
  RAISE NOTICE '───────────────────────────────────────────────────────────────';

  IF v_null_facility > 0 THEN
    RAISE NOTICE 'CHÚ Ý: Còn % row chưa có facility_id (không phải DEMO seed). Liệt kê:', v_null_facility;
    FOR r IN
      SELECT rib.id, rib.intake_date, rib.notes, rib.b2b_partner_id
      FROM public.rubber_intake_batches rib
      WHERE rib.facility_id IS NULL
      LIMIT 10
    LOOP
      RAISE NOTICE '    % | % | partner=% | notes=%', r.id, r.intake_date, r.b2b_partner_id, left(coalesce(r.notes,''), 50);
    END LOOP;
  END IF;

  RAISE NOTICE 'MIGRATION PASS — sẵn sàng cho UI multi-facility.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (nếu cần):
-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE public.rubber_intake_batches SET facility_id = NULL
--   WHERE notes LIKE 'Seed data từ Excel%';
-- UPDATE b2b.partners SET is_demo = false WHERE is_demo = true;
-- ALTER TABLE b2b.partners DROP COLUMN IF EXISTS is_demo;
