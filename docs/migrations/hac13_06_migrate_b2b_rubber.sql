-- ============================================================================
-- HAC-13 Phase 4 — Backfill business_partners từ b2b.partners + rubber_suppliers
-- Date: 2026-05-26
-- ============================================================================
--
-- Mục đích:
--   1) ADD COLUMN `bp_id` → b2b.partners + rubber_suppliers (FK về master BP).
--   2) Backfill: mỗi b2b partner → BP + role PARTNER_B2B.
--               Mỗi rubber supplier → BP + role RUBBER_SUPPLIER.
--      Detect overlap MST/CCCD với BP đã có (vd: NCC mủ + NCC general cùng MST → merge).
--   3) Trigger AFTER INSERT trên 2 bảng → tự tạo BP master nếu chưa có
--      (vì b2b.partners được tạo bởi cả ERP repo và B2B Portal repo).
--   4) **GIỮ NGUYÊN `b2b.partners.code` (TEHG01...)**: B2B Portal repo + downstream
--      lot code generation phụ thuộc format này. Không overwrite.
--   5) Overwrite `rubber_suppliers.code` (MU-001 → HAC-13) — pattern giống suppliers.
--
-- CONDITIONAL: nếu môi trường KHÔNG có bảng `b2b.partners` hoặc `rubber_suppliers`
-- (vd: chưa deploy module B2B/rubber), section tương ứng sẽ SKIP, log NOTICE.
--
-- Phụ thuộc:
--   - hac13_03_business_partners_master.sql
--   - hac13_05_migrate_customers_suppliers.sql (sync_role_table_code_with_bp function)
--
-- ROLLBACK: cuối file.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION A: b2b.partners
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_table_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'b2b' AND table_name = 'partners'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE NOTICE 'SKIP section A: bảng b2b.partners không tồn tại trong môi trường này.';
    RETURN;
  END IF;

  -- ── A.1: ADD COLUMN bp_id ─────────────────────────────────────────────────
  EXECUTE 'ALTER TABLE b2b.partners ADD COLUMN IF NOT EXISTS bp_id uuid REFERENCES public.business_partners(id) ON DELETE SET NULL';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_b2b_partners_bp_id ON b2b.partners(bp_id)';
  EXECUTE $cm$
    COMMENT ON COLUMN b2b.partners.bp_id IS
      'FK về public.business_partners (HAC-13). Cột `code` legacy (TEHG01) GIỮ NGUYÊN cho B2B Portal repo.'
  $cm$;

  -- ── A.2: BACKFILL b2b.partners → business_partners + bp_roles ─────────────
  DECLARE
    r record;
    v_bp_id uuid;
    v_status text;
  BEGIN
    FOR r IN
      SELECT * FROM b2b.partners WHERE bp_id IS NULL ORDER BY created_at, id
    LOOP
      v_status := CASE
        WHEN r.status = 'verified'  THEN 'active'
        WHEN r.status = 'pending'   THEN 'pending'
        WHEN r.status = 'suspended' THEN 'inactive'
        WHEN r.status = 'rejected'  THEN 'blocked'
        ELSE 'active'
      END;

      INSERT INTO public.business_partners (
        legal_name, country_iso,
        cccd, address_line, phone, email,
        status, notes
      ) VALUES (
        r.name, 'VN',
        NULLIF(r.national_id, ''),
        NULLIF(r.address, ''),
        NULLIF(r.phone, ''),
        NULLIF(r.email, ''),
        v_status, NULL
      )
      RETURNING id INTO v_bp_id;

      INSERT INTO public.bp_roles (bp_id, role_type, role_data, is_primary)
      VALUES (
        v_bp_id, 'PARTNER_B2B',
        jsonb_strip_nulls(jsonb_build_object(
          'partner_type',        r.partner_type,
          'tier_b2b',            r.tier,
          'b2b_status',          r.status,
          'is_active',           r.is_active,
          'region_code',         r.region_code,
          'supplier_name_code',  r.supplier_name_code,
          'nationality',         r.nationality,
          'legacy_partner_code', r.code
        )),
        true
      );

      IF r.code IS NOT NULL AND r.code <> '' THEN
        INSERT INTO public.bp_search_keys (bp_id, key_type, key_value, notes)
        VALUES (v_bp_id, 'ALIAS', r.code, 'Legacy b2b.partner.code (TEHG01 format)')
        ON CONFLICT (key_type, key_value) DO NOTHING;
      END IF;

      UPDATE b2b.partners SET bp_id = v_bp_id WHERE id = r.id;
    END LOOP;

    RAISE NOTICE 'Backfill b2b.partners → BP DONE. % rows.',
      (SELECT count(*) FROM b2b.partners WHERE bp_id IS NOT NULL);
  END;

  -- ── A.3: Trigger AFTER INSERT b2b.partners — tự tạo BP cho insert future ──
  EXECUTE $body$
    CREATE OR REPLACE FUNCTION public.ensure_bp_for_b2b_partner()
    RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
    DECLARE
      v_bp_id uuid;
    BEGIN
      IF NEW.bp_id IS NOT NULL THEN
        RETURN NEW;
      END IF;

      INSERT INTO public.business_partners (
        legal_name, country_iso, cccd, address_line, phone, email,
        status, notes
      ) VALUES (
        NEW.name, 'VN', NULLIF(NEW.national_id, ''),
        NULLIF(NEW.address, ''), NULLIF(NEW.phone, ''), NULLIF(NEW.email, ''),
        CASE
          WHEN NEW.status = 'verified'  THEN 'active'
          WHEN NEW.status = 'pending'   THEN 'pending'
          WHEN NEW.status = 'suspended' THEN 'inactive'
          WHEN NEW.status = 'rejected'  THEN 'blocked'
          ELSE 'active'
        END,
        NULL
      )
      RETURNING id INTO v_bp_id;

      INSERT INTO public.bp_roles (bp_id, role_type, role_data, is_primary)
      VALUES (
        v_bp_id, 'PARTNER_B2B',
        jsonb_strip_nulls(jsonb_build_object(
          'partner_type',        NEW.partner_type,
          'tier_b2b',            NEW.tier,
          'b2b_status',          NEW.status,
          'region_code',         NEW.region_code,
          'legacy_partner_code', NEW.code
        )),
        true
      );

      IF NEW.code IS NOT NULL AND NEW.code <> '' THEN
        INSERT INTO public.bp_search_keys (bp_id, key_type, key_value, notes)
        VALUES (v_bp_id, 'ALIAS', NEW.code, 'b2b.partner.code')
        ON CONFLICT (key_type, key_value) DO NOTHING;
      END IF;

      UPDATE b2b.partners SET bp_id = v_bp_id WHERE id = NEW.id;
      RETURN NEW;
    END;
    $fn$
  $body$;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_b2b_partners_ensure_bp ON b2b.partners';
  EXECUTE 'CREATE TRIGGER trg_b2b_partners_ensure_bp AFTER INSERT ON b2b.partners FOR EACH ROW EXECUTE FUNCTION public.ensure_bp_for_b2b_partner()';

  -- ── A.4: View compat ──────────────────────────────────────────────────────
  EXECUTE $cv$
    CREATE OR REPLACE VIEW public.v_b2b_partners_with_bp AS
    SELECT p.*, bp.hac13_code, bp.legal_name AS bp_legal_name,
           bp.status AS bp_status, bp.tax_code AS bp_tax_code
    FROM b2b.partners p
    LEFT JOIN public.business_partners bp ON bp.id = p.bp_id
  $cv$;
  EXECUTE 'GRANT SELECT ON public.v_b2b_partners_with_bp TO authenticated, service_role';

  RAISE NOTICE 'Section A (b2b.partners) DONE.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION B: rubber_suppliers
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_table_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rubber_suppliers'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE NOTICE 'SKIP section B: bảng public.rubber_suppliers không tồn tại trong môi trường này.';
    RETURN;
  END IF;

  -- ── B.1: ADD COLUMN bp_id + index ─────────────────────────────────────────
  EXECUTE 'ALTER TABLE public.rubber_suppliers ADD COLUMN IF NOT EXISTS bp_id uuid REFERENCES public.business_partners(id) ON DELETE SET NULL';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_rubber_suppliers_bp_id ON public.rubber_suppliers(bp_id)';
  EXECUTE $cm$
    COMMENT ON COLUMN public.rubber_suppliers.bp_id IS
      'FK về public.business_partners (HAC-13). Cột `code` đã sync = hac13_code.'
  $cm$;

  -- ── B.2: BACKFILL rubber_suppliers → BP + role RUBBER_SUPPLIER ────────────
  DECLARE
    r record;
    v_bp_id uuid;
    v_existing_bp_id uuid;
    v_status text;
  BEGIN
    FOR r IN
      SELECT * FROM public.rubber_suppliers WHERE bp_id IS NULL ORDER BY created_at, id
    LOOP
      v_existing_bp_id := NULL;

      IF r.tax_code IS NOT NULL AND r.tax_code <> '' THEN
        SELECT id INTO v_existing_bp_id
        FROM public.business_partners
        WHERE tax_code = r.tax_code AND deleted_at IS NULL
        LIMIT 1;
      END IF;

      IF v_existing_bp_id IS NULL AND r.cccd IS NOT NULL AND r.cccd <> '' THEN
        SELECT id INTO v_existing_bp_id
        FROM public.business_partners
        WHERE cccd = r.cccd AND deleted_at IS NULL
        LIMIT 1;
      END IF;

      v_status := CASE WHEN r.is_active THEN 'active' ELSE 'inactive' END;

      IF v_existing_bp_id IS NOT NULL THEN
        v_bp_id := v_existing_bp_id;
        RAISE NOTICE 'Rubber supplier % MST=% CCCD=% trùng BP %, attach role',
                     r.code, r.tax_code, r.cccd, v_bp_id;
      ELSE
        INSERT INTO public.business_partners (
          legal_name, country_iso, tax_code, cccd,
          district, address_line, phone,
          bank_name, bank_account, bank_holder,
          status, notes
        ) VALUES (
          r.name, 'VN',
          NULLIF(r.tax_code, ''),
          NULLIF(r.cccd, ''),
          NULLIF(r.district, ''),
          NULLIF(r.address, ''),
          NULLIF(r.phone, ''),
          NULLIF(r.bank_name, ''),
          NULLIF(r.bank_account, ''),
          NULLIF(r.bank_holder, ''),
          v_status, r.notes
        )
        RETURNING id INTO v_bp_id;
      END IF;

      INSERT INTO public.bp_roles (bp_id, role_type, role_data, is_primary)
      VALUES (
        v_bp_id, 'RUBBER_SUPPLIER',
        jsonb_strip_nulls(jsonb_build_object(
          'supplier_type',      r.supplier_type,
          'plantation_area_ha', r.plantation_area_ha,
          'rubber_variety',     r.rubber_variety,
          'tree_age_years',     r.tree_age_years,
          'tapping_system',     r.tapping_system,
          'geo_latitude',       r.geo_latitude,
          'geo_longitude',      r.geo_longitude,
          'eudr_compliant',     r.eudr_compliant,
          'eudr_cert_expiry',   r.eudr_cert_expiry,
          'payment_method',     r.payment_method,
          'quality_rating',     r.quality_rating,
          'avg_drc',            r.avg_drc,
          'commune',            r.commune,
          'province_text',      r.province
        )),
        v_existing_bp_id IS NULL
      )
      ON CONFLICT (bp_id, role_type) DO NOTHING;

      IF r.code IS NOT NULL AND r.code <> '' THEN
        INSERT INTO public.bp_search_keys (bp_id, key_type, key_value, notes)
        VALUES (v_bp_id, 'ALIAS', r.code, 'Legacy rubber_supplier.code (MU-XXX)')
        ON CONFLICT (key_type, key_value) DO NOTHING;
      END IF;

      UPDATE public.rubber_suppliers SET bp_id = v_bp_id WHERE id = r.id;
    END LOOP;

    RAISE NOTICE 'Backfill rubber_suppliers → BP DONE. % rows.',
      (SELECT count(*) FROM public.rubber_suppliers WHERE bp_id IS NOT NULL);
  END;

  -- ── B.3: OVERWRITE code = hac13_code ──────────────────────────────────────
  UPDATE public.rubber_suppliers rs
  SET code = bp.hac13_code
  FROM public.business_partners bp
  WHERE rs.bp_id = bp.id
    AND rs.code IS DISTINCT FROM bp.hac13_code;

  -- ── B.4: Trigger sync code reuse function ở mig 05 ────────────────────────
  EXECUTE 'DROP TRIGGER IF EXISTS trg_rubber_suppliers_sync_code ON public.rubber_suppliers';
  EXECUTE 'CREATE TRIGGER trg_rubber_suppliers_sync_code BEFORE INSERT OR UPDATE ON public.rubber_suppliers FOR EACH ROW EXECUTE FUNCTION public.sync_role_table_code_with_bp()';

  -- ── B.5: View compat ──────────────────────────────────────────────────────
  EXECUTE $cv$
    CREATE OR REPLACE VIEW public.v_rubber_suppliers_with_bp AS
    SELECT rs.*, bp.hac13_code, bp.legal_name AS bp_legal_name, bp.status AS bp_status
    FROM public.rubber_suppliers rs
    LEFT JOIN public.business_partners bp ON bp.id = rs.bp_id
  $cv$;
  EXECUTE 'GRANT SELECT ON public.v_rubber_suppliers_with_bp TO authenticated, service_role';

  RAISE NOTICE 'Section B (rubber_suppliers) DONE.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SECTION C: NOTIFY reload + VERIFY (conditional)
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_b2b_exists boolean;
  v_rs_exists  boolean;
  v_unlinked_b2b int := 0;
  v_unlinked_rs  int := 0;
  v_rs_code_mismatch int := 0;
  v_count_b2b int := 0;
  v_count_rs  int := 0;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='b2b' AND table_name='partners') INTO v_b2b_exists;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='rubber_suppliers') INTO v_rs_exists;

  IF v_b2b_exists THEN
    EXECUTE 'SELECT count(*) FROM b2b.partners WHERE bp_id IS NULL' INTO v_unlinked_b2b;
    EXECUTE 'SELECT count(*) FROM b2b.partners'                      INTO v_count_b2b;
    IF v_unlinked_b2b > 0 THEN
      RAISE EXCEPTION 'VERIFY FAIL: % b2b.partners chưa có bp_id', v_unlinked_b2b;
    END IF;
  END IF;

  IF v_rs_exists THEN
    EXECUTE 'SELECT count(*) FROM public.rubber_suppliers WHERE bp_id IS NULL' INTO v_unlinked_rs;
    EXECUTE 'SELECT count(*) FROM public.rubber_suppliers'                     INTO v_count_rs;
    IF v_unlinked_rs > 0 THEN
      RAISE EXCEPTION 'VERIFY FAIL: % rubber_suppliers chưa có bp_id', v_unlinked_rs;
    END IF;

    EXECUTE 'SELECT count(*) FROM public.rubber_suppliers rs JOIN public.business_partners bp ON bp.id=rs.bp_id WHERE rs.code IS DISTINCT FROM bp.hac13_code'
      INTO v_rs_code_mismatch;
    IF v_rs_code_mismatch > 0 THEN
      RAISE EXCEPTION 'VERIFY FAIL: % rubber_suppliers có code <> hac13_code', v_rs_code_mismatch;
    END IF;
  END IF;

  RAISE NOTICE 'HAC-13 Phase 4 VERIFY PASS — b2b.partners=% (linked %), rubber_suppliers=% (linked %), total BP=%',
    v_count_b2b, (v_count_b2b - v_unlinked_b2b),
    v_count_rs,  (v_count_rs - v_unlinked_rs),
    (SELECT count(*) FROM public.business_partners);
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK:
-- ════════════════════════════════════════════════════════════════════════════
-- DROP VIEW IF EXISTS public.v_b2b_partners_with_bp;
-- DROP VIEW IF EXISTS public.v_rubber_suppliers_with_bp;
-- DROP TRIGGER IF EXISTS trg_b2b_partners_ensure_bp ON b2b.partners;
-- DROP FUNCTION IF EXISTS public.ensure_bp_for_b2b_partner();
-- DROP TRIGGER IF EXISTS trg_rubber_suppliers_sync_code ON public.rubber_suppliers;
-- DELETE FROM public.bp_roles WHERE role_type IN ('PARTNER_B2B','RUBBER_SUPPLIER');
-- DELETE FROM public.business_partners WHERE id IN (
--   SELECT bp_id FROM b2b.partners      WHERE bp_id IS NOT NULL
--   UNION
--   SELECT bp_id FROM public.rubber_suppliers WHERE bp_id IS NOT NULL
-- );
-- ALTER TABLE b2b.partners            DROP COLUMN IF EXISTS bp_id;
-- ALTER TABLE public.rubber_suppliers DROP COLUMN IF EXISTS bp_id;
