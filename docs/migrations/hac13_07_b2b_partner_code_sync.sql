-- ============================================================================
-- HAC-13 Phase 5 (delta) — Đưa b2b.partners.code về HAC-13 thay TEHG/TETG/HG
-- Date: 2026-05-26
-- ============================================================================
--
-- Bối cảnh: B2B Portal CHƯA đưa vào hoạt động → an toàn để overwrite code legacy
-- (TEHG01, TETG02, HG-1234…) thành HAC-13.
--
-- Side effect cần biết:
--   - Lot code generation (rubber intake batches: TETG02-2604-01) → prefix sẽ
--     dùng HAC-13 mới `89991XXXXXXC-2604-01`. Quá dài? Lot code text column
--     không có giới hạn nghiêm, OK. (`rubber_intake_batches.lot_code` text).
--   - Dữ liệu cũ (batches/offers đã có lot_code TETG02-2604-01) GIỮ NGUYÊN —
--     UPDATE chỉ chạm `code`, không chạm `lot_code`.
--   - Legacy code (TEHG01, HG-xxxx) đã được lưu trong `bp_search_keys` (key_type=ALIAS)
--     từ migration 06 → vẫn search được.
--
-- Phụ thuộc: hac13_03, hac13_06 (đã chạy).
-- ============================================================================

DO $$
DECLARE
  v_b2b_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='b2b' AND table_name='partners'
  ) INTO v_b2b_exists;

  IF NOT v_b2b_exists THEN
    RAISE NOTICE 'SKIP: bảng b2b.partners không tồn tại.';
    RETURN;
  END IF;

  -- ── STEP 1: OVERWRITE code = hac13_code cho partner đã có bp_id ──────────
  EXECUTE $sql$
    UPDATE b2b.partners p
    SET code = bp.hac13_code
    FROM public.business_partners bp
    WHERE p.bp_id = bp.id
      AND p.code IS DISTINCT FROM bp.hac13_code
  $sql$;

  RAISE NOTICE 'STEP 1 done: overwrite code cho % partner đã link BP',
    (SELECT count(*) FROM b2b.partners WHERE bp_id IS NOT NULL);

  -- ── STEP 2: Cập nhật trigger ensure_bp_for_b2b_partner để set code = hac13 ─
  -- Trigger AFTER INSERT cũ chỉ tạo BP + set bp_id. Giờ cũng overwrite code.
  EXECUTE $body$
    CREATE OR REPLACE FUNCTION public.ensure_bp_for_b2b_partner()
    RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
    DECLARE
      v_bp_id uuid;
      v_hac13 char(13);
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
      RETURNING id, hac13_code INTO v_bp_id, v_hac13;

      INSERT INTO public.bp_roles (bp_id, role_type, role_data, is_primary)
      VALUES (
        v_bp_id, 'PARTNER_B2B',
        jsonb_strip_nulls(jsonb_build_object(
          'partner_type',        NEW.partner_type,
          'tier_b2b',            NEW.tier,
          'b2b_status',          NEW.status,
          'region_code',         NEW.region_code,
          'legacy_partner_code', NEW.code     -- ghi nhớ TEHG/TETG/HG nếu caller có set
        )),
        true
      );

      -- Lưu legacy code (nếu caller insert có code TEHG/HG-xxxx) làm ALIAS
      IF NEW.code IS NOT NULL AND NEW.code <> '' AND NEW.code <> v_hac13 THEN
        INSERT INTO public.bp_search_keys (bp_id, key_type, key_value, notes)
        VALUES (v_bp_id, 'ALIAS', NEW.code, 'Legacy b2b.partner.code (pre-HAC-13)')
        ON CONFLICT (key_type, key_value) DO NOTHING;
      END IF;

      -- Set bp_id + overwrite code = hac13_code (đưa hết về mã mới)
      UPDATE b2b.partners SET bp_id = v_bp_id, code = v_hac13 WHERE id = NEW.id;
      RETURN NEW;
    END;
    $fn$
  $body$;

  RAISE NOTICE 'STEP 2 done: trigger ensure_bp_for_b2b_partner cập nhật (auto-sync code = hac13)';

  RAISE NOTICE 'HAC-13 Phase 5 (delta) DONE — b2b.partners.code giờ đồng nhất HAC-13.';
END $$;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_mismatch int;
  v_b2b_exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='b2b' AND table_name='partners') INTO v_b2b_exists;
  IF NOT v_b2b_exists THEN RETURN; END IF;

  EXECUTE $sql$
    SELECT count(*) FROM b2b.partners p
    JOIN public.business_partners bp ON bp.id = p.bp_id
    WHERE p.code IS DISTINCT FROM bp.hac13_code
  $sql$ INTO v_mismatch;

  IF v_mismatch > 0 THEN
    RAISE EXCEPTION 'VERIFY FAIL: % b2b.partners có code <> hac13_code', v_mismatch;
  END IF;
  RAISE NOTICE 'VERIFY PASS: tất cả b2b.partners.code = bp.hac13_code.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (LƯU Ý: legacy code TEHG/HG đã overwrite — chỉ khôi phục từ bp_search_keys ALIAS):
-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE b2b.partners p
-- SET code = sk.key_value
-- FROM bp_search_keys sk
-- WHERE sk.bp_id = p.bp_id
--   AND sk.key_type = 'ALIAS'
--   AND sk.notes LIKE 'Legacy b2b.partner.code%';
