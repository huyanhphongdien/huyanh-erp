-- ============================================================================
-- Sprint 1.5 — Sync public.b2b_partners view với b2b.partners base table
-- Date: 2026-05-26
-- Decision D7: dev mode, DROP CASCADE OK
-- ============================================================================
--
-- Vấn đề: view public.b2b_partners được tạo từ trước với SELECT explicit columns.
-- Khi b2b.partners ADD COLUMN (vd is_demo, bp_id, payment_proxy_partner_id,
-- contact_alias_name, is_payment_proxy), view KHÔNG tự đồng bộ → frontend
-- query b2b_partners.is_demo → "column does not exist".
--
-- Fix: DROP VIEW CASCADE + CREATE OR REPLACE VIEW với SELECT * để auto sync.
--
-- CASCADE risk: nếu có views/functions phụ thuộc, sẽ bị drop theo.
-- Mitigation: liệt kê dependencies trước khi DROP (uncomment SELECT pg_depend),
-- recreate sau nếu cần.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- PRE-CHECK: liệt kê dependencies của public.b2b_partners
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  RAISE NOTICE '═══ Dependencies of public.b2b_partners view ═══';
  FOR r IN
    SELECT DISTINCT dep.classid::regclass AS object_type, dep.objid::text AS object_id,
           CASE dep.classid
             WHEN 'pg_rewrite'::regclass THEN (SELECT relname FROM pg_class WHERE oid = (SELECT ev_class FROM pg_rewrite WHERE oid = dep.objid))
             ELSE NULL
           END AS object_name
    FROM pg_depend dep
    WHERE dep.refobjid = (SELECT oid FROM pg_class WHERE relname='b2b_partners' AND relnamespace='public'::regnamespace)
      AND dep.deptype = 'n'
    LIMIT 20
  LOOP
    v_count := v_count + 1;
    RAISE NOTICE '  Dependency #%: type=% name=%', v_count, r.object_type, r.object_name;
  END LOOP;
  IF v_count = 0 THEN
    RAISE NOTICE '  (none — safe to DROP CASCADE)';
  ELSE
    RAISE NOTICE '  → CASCADE sẽ drop % dependencies. User confirm trước khi chạy.', v_count;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: DROP + RECREATE view b2b_partners
-- ════════════════════════════════════════════════════════════════════════════
-- Note: dùng DROP CASCADE vì user đã confirm decision D7 (dev mode).
-- Tất cả dependent views sẽ recreate manually nếu cần (xem section bottom).

DROP VIEW IF EXISTS public.b2b_partners CASCADE;

CREATE VIEW public.b2b_partners
WITH (security_invoker = true) AS
SELECT * FROM b2b.partners;

COMMENT ON VIEW public.b2b_partners IS
  'Public view (security_invoker) cho b2b.partners. Tự sync columns khi base table thay đổi qua DROP+CREATE.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_partners TO authenticated;
GRANT SELECT ON public.b2b_partners TO anon;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Re-grant + restore RLS-like behavior
-- ════════════════════════════════════════════════════════════════════════════
-- RLS không apply trực tiếp lên view, mà inherit từ base table b2b.partners
-- (security_invoker = true). Nếu b2b.partners có RLS policies thì view này
-- sẽ enforce theo user đang query.

-- Verify RLS trên b2b.partners
DO $$
DECLARE v_rls boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class
  WHERE relnamespace = 'b2b'::regnamespace AND relname = 'partners';
  RAISE NOTICE 'RLS on b2b.partners: %', v_rls;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: Recreate dependent views (nếu cần)
-- ════════════════════════════════════════════════════════════════════════════
-- Nếu có views như b2b_partner_users, v_b2b_partner_summary phụ thuộc view này,
-- recreate ở đây. Chạy commit cũ nếu có script gốc.

-- Common dependencies trong project này (recreate nếu trước đó tồn tại):
DO $$
BEGIN
  -- Re-create b2b_partner_users view (junction auth_user → partner)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='b2b' AND table_name='partner_users') THEN
    -- Check if view đã được recreate bởi CASCADE
    IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='b2b_partner_users') THEN
      EXECUTE 'CREATE VIEW public.b2b_partner_users WITH (security_invoker = true) AS SELECT * FROM b2b.partner_users';
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_partner_users TO authenticated';
      EXECUTE 'GRANT SELECT ON public.b2b_partner_users TO anon';
      RAISE NOTICE 'Recreated dependent view: public.b2b_partner_users';
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY — query thử các cột mới (sau khi 1.1, 1.2, 1.3 đã chạy)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_has_is_demo boolean;
  v_has_proxy boolean;
  v_has_alias boolean;
  v_has_payment_proxy boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='b2b_partners' AND column_name='is_demo') INTO v_has_is_demo;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='b2b_partners' AND column_name='payment_proxy_partner_id') INTO v_has_proxy;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='b2b_partners' AND column_name='contact_alias_name') INTO v_has_alias;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='b2b_partners' AND column_name='is_payment_proxy') INTO v_has_payment_proxy;

  RAISE NOTICE '═══ View b2b_partners columns check ═══';
  RAISE NOTICE '  is_demo:                  %', CASE WHEN v_has_is_demo THEN '✓' ELSE '✗ MISSING' END;
  RAISE NOTICE '  payment_proxy_partner_id: %', CASE WHEN v_has_proxy THEN '✓' ELSE '✗ MISSING' END;
  RAISE NOTICE '  contact_alias_name:       %', CASE WHEN v_has_alias THEN '✓' ELSE '✗ MISSING' END;
  RAISE NOTICE '  is_payment_proxy:         %', CASE WHEN v_has_payment_proxy THEN '✓' ELSE '✗ MISSING' END;

  IF NOT (v_has_is_demo AND v_has_proxy AND v_has_alias AND v_has_payment_proxy) THEN
    RAISE WARNING 'Sprint 1.5: Một số cột chưa có. Chạy sprint1_01 (proxy) + b2b_demo_flag_and_facility_backfill (is_demo) trước.';
  ELSE
    RAISE NOTICE 'VERIFY PASS — view b2b_partners đã sync đầy đủ cột mới';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK:
-- ════════════════════════════════════════════════════════════════════════════
-- DROP VIEW IF EXISTS public.b2b_partners CASCADE;
-- → Recreate view cũ với explicit columns (cần script gốc, vd từ migration hac13).
