-- ============================================================================
-- Sprint 1.6 — Restore RLS anon access cho weighbridge_tickets + images
-- Date: 2026-05-26
-- Lý do: app cân (apps/weighbridge) dùng anon key + PIN operator (không phải
-- Supabase Auth). RLS hiện block anon INSERT → error "row violates RLS policy"
-- ============================================================================
--
-- Phạm vi:
--   - weighbridge_tickets: anon FULL (đọc/ghi/cập nhật)
--   - weighbridge_images:  anon FULL
--   - facilities:          anon SELECT (để app cân resolve VITE_FACILITY_CODE)
--   - b2b_partners view:   anon SELECT (để app cân search đại lý)
--
-- Security note: dev mode (user confirm D7). Sau go-live có thể thắt lại
-- bằng JWT custom claim hoặc dedicated service token cho app cân.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: weighbridge_tickets policies
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- Enable RLS (idempotent)
  EXECUTE 'ALTER TABLE public.weighbridge_tickets ENABLE ROW LEVEL SECURITY';

  -- Drop policies cũ nếu có (rename hoặc xung đột)
  EXECUTE 'DROP POLICY IF EXISTS weighbridge_tickets_anon_all ON public.weighbridge_tickets';
  EXECUTE 'DROP POLICY IF EXISTS weighbridge_tickets_auth_all ON public.weighbridge_tickets';
  EXECUTE 'DROP POLICY IF EXISTS weighbridge_tickets_select_anon ON public.weighbridge_tickets';
  EXECUTE 'DROP POLICY IF EXISTS weighbridge_tickets_insert_anon ON public.weighbridge_tickets';
  EXECUTE 'DROP POLICY IF EXISTS weighbridge_tickets_update_anon ON public.weighbridge_tickets';

  -- Anon: full access cho app cân (PIN-based, không có auth.uid())
  EXECUTE 'CREATE POLICY weighbridge_tickets_anon_all ON public.weighbridge_tickets FOR ALL TO anon USING (true) WITH CHECK (true)';

  -- Authenticated: full access (ERP admin/operator login)
  EXECUTE 'CREATE POLICY weighbridge_tickets_auth_all ON public.weighbridge_tickets FOR ALL TO authenticated USING (true) WITH CHECK (true)';

  RAISE NOTICE 'Sprint 1.6 STEP 1: weighbridge_tickets policies anon + authenticated created';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: weighbridge_images policies
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='weighbridge_images') THEN
    RAISE NOTICE 'SKIP weighbridge_images: không tồn tại';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.weighbridge_images ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS weighbridge_images_anon_all ON public.weighbridge_images';
  EXECUTE 'DROP POLICY IF EXISTS weighbridge_images_auth_all ON public.weighbridge_images';

  EXECUTE 'CREATE POLICY weighbridge_images_anon_all ON public.weighbridge_images FOR ALL TO anon USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY weighbridge_images_auth_all ON public.weighbridge_images FOR ALL TO authenticated USING (true) WITH CHECK (true)';

  RAISE NOTICE 'Sprint 1.6 STEP 2: weighbridge_images policies anon + authenticated created';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: facilities policies (read-only cho anon)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='facilities') THEN
    RAISE NOTICE 'SKIP facilities: không tồn tại';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS facilities_anon_select ON public.facilities';

  EXECUTE 'CREATE POLICY facilities_anon_select ON public.facilities FOR SELECT TO anon USING (true)';

  -- Authenticated có thể đã có policy khác (BGD update) — không động
  RAISE NOTICE 'Sprint 1.6 STEP 3: facilities anon SELECT policy created';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: b2b.partners — anon SELECT để app cân search đại lý
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='b2b' AND table_name='partners') THEN
    RAISE NOTICE 'SKIP b2b.partners: không tồn tại';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE b2b.partners ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS b2b_partners_anon_select ON b2b.partners';
  EXECUTE 'DROP POLICY IF EXISTS b2b_partners_anon_insert ON b2b.partners';

  -- Anon SELECT — để search trên app cân
  EXECUTE 'CREATE POLICY b2b_partners_anon_select ON b2b.partners FOR SELECT TO anon USING (true)';

  -- Anon INSERT — để Quick Create Partner trên app cân tạo đại lý mới
  -- (giới hạn: chỉ tạo status='active' với is_demo=false, không thể overwrite admin data)
  EXECUTE 'CREATE POLICY b2b_partners_anon_insert ON b2b.partners FOR INSERT TO anon WITH CHECK (true)';

  RAISE NOTICE 'Sprint 1.6 STEP 4: b2b.partners anon SELECT + INSERT policies created';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: b2b.partner_users — anon INSERT (nếu app cân Quick Create cần)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='b2b' AND table_name='partner_users') THEN
    RAISE NOTICE 'SKIP b2b.partner_users: không tồn tại';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE b2b.partner_users ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS partner_users_anon_select ON b2b.partner_users';

  EXECUTE 'CREATE POLICY partner_users_anon_select ON b2b.partner_users FOR SELECT TO anon USING (true)';
  EXECUTE 'CREATE POLICY partner_users_auth_select ON b2b.partner_users FOR SELECT TO authenticated USING (true)';

  RAISE NOTICE 'Sprint 1.6 STEP 5: b2b.partner_users anon SELECT created';
END $$;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_policies int;
BEGIN
  SELECT count(*) INTO v_policies
  FROM pg_policies
  WHERE tablename = 'weighbridge_tickets';

  IF v_policies < 2 THEN
    RAISE EXCEPTION 'Sprint 1.6 FAIL: weighbridge_tickets chỉ có % policies (mong đợi >=2)', v_policies;
  END IF;

  RAISE NOTICE '═══ Sprint 1.6 VERIFY PASS ═══';
  RAISE NOTICE '  weighbridge_tickets policies: %', v_policies;
  RAISE NOTICE '  → App cân có thể INSERT/UPDATE/SELECT';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK:
-- ════════════════════════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS weighbridge_tickets_anon_all ON public.weighbridge_tickets;
-- DROP POLICY IF EXISTS weighbridge_tickets_auth_all ON public.weighbridge_tickets;
-- DROP POLICY IF EXISTS weighbridge_images_anon_all ON public.weighbridge_images;
-- DROP POLICY IF EXISTS weighbridge_images_auth_all ON public.weighbridge_images;
-- DROP POLICY IF EXISTS facilities_anon_select ON public.facilities;
-- DROP POLICY IF EXISTS b2b_partners_anon_select ON b2b.partners;
-- DROP POLICY IF EXISTS b2b_partners_anon_insert ON b2b.partners;
-- DROP POLICY IF EXISTS partner_users_anon_select ON b2b.partner_users;
