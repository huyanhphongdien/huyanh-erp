-- ============================================================================
-- HAC-13 Phase 3.2 — Backfill business_partners từ sales_customers + suppliers
-- Date: 2026-05-26
-- ============================================================================
--
-- Mục đích:
--   1) Thêm cột `bp_id` (FK → business_partners) vào `sales_customers` và
--      `suppliers` để 2 bảng cũ trỏ về master BP.
--   2) Backfill: mỗi customer → 1 BP + role CUSTOMER_INTL.
--                Mỗi supplier  → 1 BP + role SUPPLIER_GENERAL.
--      role_data jsonb chứa các field role-specific (tier, incoterm, credit_limit…).
--   3) KHÔNG auto-merge KH=NCC trùng MST vì sales_customers KHÔNG có tax_code.
--      Phase 4+ sẽ có UI admin để merge thủ công.
--
-- An toàn:
--   - Idempotent: ON CONFLICT DO NOTHING / WHERE bp_id IS NULL bảo vệ re-run.
--   - Mỗi customer/supplier consume 1 nextval HAC-13. Có thể tạo gap nếu rollback.
--
-- Phụ thuộc:
--   - hac13_01_lib.sql, hac13_02_search_history_tables.sql
--   - hac13_03_business_partners_master.sql (table business_partners, bp_roles + rpc)
--
-- ROLLBACK: cuối file.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: ADD COLUMN bp_id vào sales_customers + suppliers
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE sales_customers
  ADD COLUMN IF NOT EXISTS bp_id uuid REFERENCES business_partners(id) ON DELETE SET NULL;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS bp_id uuid REFERENCES business_partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_customers_bp_id ON sales_customers(bp_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_bp_id       ON suppliers(bp_id);

COMMENT ON COLUMN sales_customers.bp_id IS
  'FK về business_partners. Master record. Cột `code` legacy sẽ DROP ở phase 5.';
COMMENT ON COLUMN suppliers.bp_id IS
  'FK về business_partners. Master record. Cột `code` legacy sẽ DROP ở phase 5.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: BACKFILL sales_customers → business_partners + bp_roles
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r record;
  v_bp_id uuid;
  v_country_raw text;           -- giữ TEXT để tránh overflow char(2)
  v_country_iso char(2);
  v_status text;
BEGIN
  FOR r IN
    SELECT * FROM sales_customers WHERE bp_id IS NULL ORDER BY created_at, id
  LOOP
    -- Chuẩn hoá country_iso:
    --   - Cột sales_customers.country lưu hỗn hợp: 'JP', 'CN', 'Vietnam', 'JAPAN'…
    --   - Chỉ dùng nếu chuẩn 2 ký tự sau upper/trim; ngoài ra fallback 'VN'.
    v_country_raw := upper(coalesce(trim(r.country), ''));
    IF char_length(v_country_raw) = 2 AND v_country_raw ~ '^[A-Z]{2}$' THEN
      v_country_iso := v_country_raw::char(2);
    ELSE
      v_country_iso := 'VN'::char(2);
    END IF;

    -- Map status: 'blacklisted' → 'blocked'; else giữ nguyên
    v_status := CASE r.status
      WHEN 'blacklisted' THEN 'blocked'
      WHEN 'active'      THEN 'active'
      WHEN 'inactive'    THEN 'inactive'
      ELSE 'active'
    END;

    -- Tạo BP (trigger tự sinh hac13_code theo country_iso)
    INSERT INTO business_partners (
      legal_name, short_name, country_iso,
      address_line, phone, email,
      status, notes
    ) VALUES (
      r.name,
      NULLIF(r.short_name, ''),
      v_country_iso,
      NULLIF(r.address, ''),
      NULLIF(r.phone, ''),
      NULLIF(r.email, ''),
      v_status,
      r.notes
    )
    RETURNING id INTO v_bp_id;

    -- Tạo role CUSTOMER_INTL với role_data chứa attribute role-specific
    INSERT INTO bp_roles (bp_id, role_type, role_data, is_primary)
    VALUES (
      v_bp_id,
      'CUSTOMER_INTL',
      jsonb_strip_nulls(jsonb_build_object(
        'tier',                          r.tier,
        'default_incoterm',              r.default_incoterm,
        'default_currency',              r.default_currency,
        'credit_limit',                  r.credit_limit,
        'quality_standard',              r.quality_standard,
        'custom_specs',                  r.custom_specs,
        'preferred_grades',              r.preferred_grades,
        'requires_pre_shipment_sample',  r.requires_pre_shipment_sample,
        'payment_terms',                 r.payment_terms,
        'region',                        r.region,
        'contact_person',                r.contact_person
      )),
      true
    );

    -- Lưu legacy code vào bp_search_keys (ALIAS) để search nhanh khi user gõ KH-001
    IF r.code IS NOT NULL AND r.code <> '' THEN
      INSERT INTO bp_search_keys (bp_id, key_type, key_value, notes)
      VALUES (v_bp_id, 'ALIAS', r.code, 'Legacy sales_customer.code')
      ON CONFLICT (key_type, key_value) DO NOTHING;
    END IF;

    -- Link back
    UPDATE sales_customers SET bp_id = v_bp_id WHERE id = r.id;
  END LOOP;

  RAISE NOTICE 'Backfill sales_customers → BP DONE. % rows.',
    (SELECT count(*) FROM sales_customers WHERE bp_id IS NOT NULL);
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: BACKFILL suppliers → business_partners + bp_roles
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r record;
  v_bp_id uuid;
  v_existing_bp_id uuid;
  v_status text;
BEGIN
  FOR r IN
    SELECT * FROM suppliers WHERE bp_id IS NULL ORDER BY created_at, id
  LOOP
    v_existing_bp_id := NULL;

    -- Nếu có tax_code, check trùng với BP đã tồn tại (KH chưa có MST nên KH≠NCC chưa khả thi
    -- nhưng nếu mig này chạy lần 2 hoặc NCC tự trùng tax_code thì merge).
    IF r.tax_code IS NOT NULL AND r.tax_code <> '' THEN
      SELECT id INTO v_existing_bp_id
      FROM business_partners
      WHERE tax_code = r.tax_code AND deleted_at IS NULL
      LIMIT 1;
    END IF;

    v_status := CASE r.status
      WHEN 'blocked'  THEN 'blocked'
      WHEN 'active'   THEN 'active'
      WHEN 'inactive' THEN 'inactive'
      ELSE 'active'
    END;

    IF v_existing_bp_id IS NOT NULL THEN
      -- BP đã tồn tại → chỉ attach role SUPPLIER_GENERAL (KH cũng là NCC).
      v_bp_id := v_existing_bp_id;
      RAISE NOTICE 'Supplier % MST % trùng BP %, attach role SUPPLIER_GENERAL', r.code, r.tax_code, v_bp_id;
    ELSE
      -- Tạo BP mới (suppliers chủ yếu là VN → type=1)
      INSERT INTO business_partners (
        legal_name, short_name, country_iso, tax_code,
        district, ward, address_line,
        phone, email, website,
        bank_name, bank_account, bank_holder, bank_branch,
        status, notes
      ) VALUES (
        r.name,
        NULLIF(r.short_name, ''),
        'VN',
        NULLIF(r.tax_code, ''),
        NULLIF(r.district, ''),
        NULLIF(r.ward, ''),
        NULLIF(r.address, ''),
        NULLIF(r.phone, ''),
        NULLIF(r.email, ''),
        NULLIF(r.website, ''),
        NULLIF(r.bank_name, ''),
        NULLIF(r.bank_account, ''),
        NULLIF(r.bank_holder, ''),
        NULLIF(r.bank_branch, ''),
        v_status,
        r.notes
      )
      RETURNING id INTO v_bp_id;
    END IF;

    -- Tạo role SUPPLIER_GENERAL (UNIQUE(bp_id, role_type) — nếu trùng skip)
    INSERT INTO bp_roles (bp_id, role_type, role_data, is_primary)
    VALUES (
      v_bp_id,
      'SUPPLIER_GENERAL',
      jsonb_strip_nulls(jsonb_build_object(
        'supplier_type',    r.supplier_type,
        'supplier_group',   r.supplier_group,
        'payment_terms_days', r.payment_terms,
        'credit_limit_vnd', r.credit_limit,
        'rating',           r.rating,
        'contact_name',     r.contact_name,
        'contact_phone',    r.contact_phone,
        'contact_email',    r.contact_email,
        'contact_position', r.contact_position,
        'province_text',    r.province  -- text province; chuẩn hoá → province_gso sau
      )),
      v_existing_bp_id IS NULL  -- is_primary nếu BP mới
    )
    ON CONFLICT (bp_id, role_type) DO NOTHING;

    -- Lưu legacy code vào search keys
    IF r.code IS NOT NULL AND r.code <> '' THEN
      INSERT INTO bp_search_keys (bp_id, key_type, key_value, notes)
      VALUES (v_bp_id, 'ALIAS', r.code, 'Legacy supplier.code')
      ON CONFLICT (key_type, key_value) DO NOTHING;
    END IF;

    UPDATE suppliers SET bp_id = v_bp_id WHERE id = r.id;
  END LOOP;

  RAISE NOTICE 'Backfill suppliers → BP DONE. % rows.',
    (SELECT count(*) FROM suppliers WHERE bp_id IS NOT NULL);
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3.5: OVERWRITE code legacy (KH-001, NCC-001…) bằng hac13_code
-- ════════════════════════════════════════════════════════════════════════════
-- Lý do: ~8 callsite customer + ~24 callsite supplier đang đọc trường .code.
-- Pattern này giống employees (mig 04): giữ cột code, overwrite content =
-- hac13_code → callsite cũ vẫn hoạt động, chỉ hiển thị HAC-13 thay vì KH-001.
-- Phase 5 sẽ DROP COLUMN code sau khi migrate hết callsite về hac13_code.
--
-- Mã cũ ("KH-001", "NCC-005"…) đã được lưu vào bp_search_keys với key_type='ALIAS'
-- ở step 2/3 → search bằng mã cũ vẫn hoạt động qua bp_search_keys.

UPDATE sales_customers sc
SET code = bp.hac13_code
FROM business_partners bp
WHERE sc.bp_id = bp.id
  AND sc.code IS DISTINCT FROM bp.hac13_code;

UPDATE suppliers s
SET code = bp.hac13_code
FROM business_partners bp
WHERE s.bp_id = bp.id
  AND s.code IS DISTINCT FROM bp.hac13_code;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3.6: TRIGGER giữ sales_customers.code + suppliers.code đồng bộ HAC-13
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION sync_role_table_code_with_bp()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_hac13 char(13);
BEGIN
  IF NEW.bp_id IS NULL THEN
    -- Cho phép tạo legacy (chưa link BP) — chấp nhận code do caller cung cấp
    RETURN NEW;
  END IF;

  SELECT hac13_code INTO v_hac13 FROM business_partners WHERE id = NEW.bp_id;

  IF v_hac13 IS NULL THEN
    RAISE EXCEPTION 'sync_role_table_code: bp_id % không tồn tại trong business_partners', NEW.bp_id;
  END IF;

  -- Nếu trigger là UPDATE và caller cố đổi bp_id → chấp nhận, sync code lại.
  -- Đồng bộ code = hac13_code.
  NEW.code := v_hac13;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_customers_sync_code ON sales_customers;
CREATE TRIGGER trg_sales_customers_sync_code
BEFORE INSERT OR UPDATE ON sales_customers
FOR EACH ROW
EXECUTE FUNCTION sync_role_table_code_with_bp();

DROP TRIGGER IF EXISTS trg_suppliers_sync_code ON suppliers;
CREATE TRIGGER trg_suppliers_sync_code
BEFORE INSERT OR UPDATE ON suppliers
FOR EACH ROW
EXECUTE FUNCTION sync_role_table_code_with_bp();

COMMENT ON FUNCTION sync_role_table_code_with_bp() IS
  'Sync sales_customers.code / suppliers.code = business_partners.hac13_code (khi bp_id set).';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: VIEWS compat — sales_customers + suppliers join với BP để query đơn giản
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW v_sales_customers_with_bp AS
SELECT
  sc.*,
  bp.hac13_code,
  bp.tax_code   AS bp_tax_code,
  bp.legal_name AS bp_legal_name,
  bp.status     AS bp_status,
  bp.country_iso AS bp_country_iso
FROM sales_customers sc
LEFT JOIN business_partners bp ON bp.id = sc.bp_id;

CREATE OR REPLACE VIEW v_suppliers_with_bp AS
SELECT
  s.*,
  bp.hac13_code,
  bp.legal_name AS bp_legal_name,
  bp.status     AS bp_status
FROM suppliers s
LEFT JOIN business_partners bp ON bp.id = s.bp_id;

GRANT SELECT ON v_sales_customers_with_bp, v_suppliers_with_bp TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: NOTIFY + VERIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_unlinked_customers int;
  v_unlinked_suppliers int;
  v_invalid_bp        int;
  v_customer_code_mismatch int;
  v_supplier_code_mismatch int;
BEGIN
  SELECT count(*) INTO v_unlinked_customers FROM sales_customers WHERE bp_id IS NULL;
  IF v_unlinked_customers > 0 THEN
    RAISE EXCEPTION 'VERIFY FAIL: % sales_customers chưa có bp_id', v_unlinked_customers;
  END IF;

  SELECT count(*) INTO v_unlinked_suppliers FROM suppliers WHERE bp_id IS NULL;
  IF v_unlinked_suppliers > 0 THEN
    RAISE EXCEPTION 'VERIFY FAIL: % suppliers chưa có bp_id', v_unlinked_suppliers;
  END IF;

  SELECT count(*) INTO v_invalid_bp
  FROM business_partners
  WHERE NOT is_valid_hac13(hac13_code) OR substr(hac13_code,5,1) <> type_code::text;
  IF v_invalid_bp > 0 THEN
    RAISE EXCEPTION 'VERIFY FAIL: % BP có hac13_code không hợp lệ', v_invalid_bp;
  END IF;

  -- Verify code đã sync với hac13_code
  SELECT count(*) INTO v_customer_code_mismatch
  FROM sales_customers sc JOIN business_partners bp ON bp.id = sc.bp_id
  WHERE sc.code IS DISTINCT FROM bp.hac13_code;
  IF v_customer_code_mismatch > 0 THEN
    RAISE EXCEPTION 'VERIFY FAIL: % sales_customers có code <> hac13_code', v_customer_code_mismatch;
  END IF;

  SELECT count(*) INTO v_supplier_code_mismatch
  FROM suppliers s JOIN business_partners bp ON bp.id = s.bp_id
  WHERE s.code IS DISTINCT FROM bp.hac13_code;
  IF v_supplier_code_mismatch > 0 THEN
    RAISE EXCEPTION 'VERIFY FAIL: % suppliers có code <> hac13_code', v_supplier_code_mismatch;
  END IF;

  RAISE NOTICE 'HAC-13 Phase 3.2 VERIFY PASS — % BP đã tạo (% customers + % suppliers, có gộp trùng MST)',
    (SELECT count(*) FROM business_partners),
    (SELECT count(*) FROM sales_customers),
    (SELECT count(*) FROM suppliers);
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (LƯU Ý: chỉ rollback nếu chưa có data mới insert sau khi chạy mig này):
-- ════════════════════════════════════════════════════════════════════════════
-- DROP TRIGGER IF EXISTS trg_sales_customers_sync_code ON sales_customers;
-- DROP TRIGGER IF EXISTS trg_suppliers_sync_code       ON suppliers;
-- DROP FUNCTION IF EXISTS sync_role_table_code_with_bp();
-- DROP VIEW IF EXISTS v_sales_customers_with_bp;
-- DROP VIEW IF EXISTS v_suppliers_with_bp;
-- DELETE FROM bp_roles WHERE role_type IN ('CUSTOMER_INTL','SUPPLIER_GENERAL');
-- DELETE FROM business_partners WHERE id IN (SELECT bp_id FROM sales_customers WHERE bp_id IS NOT NULL)
--   OR id IN (SELECT bp_id FROM suppliers WHERE bp_id IS NOT NULL);
-- ALTER TABLE sales_customers DROP COLUMN IF EXISTS bp_id;
-- ALTER TABLE suppliers       DROP COLUMN IF EXISTS bp_id;
-- (LƯU Ý: code KH-001/NCC-001… đã overwrite — không khôi phục.)
