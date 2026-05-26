-- ============================================================================
-- HAC-13 Phase 3.1 — Bảng master business_partners + bp_roles
-- Date: 2026-05-26
-- ============================================================================
--
-- Mục đích:
--   Tạo bảng master Business Partner để gộp KH (sales_customers) + NCC (suppliers)
--   + đại lý B2B (b2b_partners) + hộ NCC mủ (rubber_suppliers) theo chuẩn
--   ISO 8000 / SAP S/4HANA.
--
--   - business_partners : thông tin chung (mã HAC-13, tên, MST, địa chỉ, bank…)
--   - bp_roles          : vai trò (CUSTOMER_*, SUPPLIER_*, PARTNER_B2B, RUBBER_*)
--                          + role_data jsonb cho thuộc tính riêng (tier, incoterm…)
--
--   Phase 3.1 (file này) CHỈ tạo schema. Migration 05 (Phase 3.2) sẽ backfill
--   từ sales_customers + suppliers. Phase 4 (mig 06) backfill từ b2b/rubber.
--
-- Phụ thuộc:
--   - hac13_01_lib.sql  (generate_hac13, is_valid_hac13)
--   - hac13_02_search_history_tables.sql (bp_search_keys, bp_*_history)
--   - employees (created_by FK)
--
-- ROLLBACK: cuối file (commented).
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: TABLE business_partners
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS business_partners (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ─── Định danh HAC-13 ───────────────────────────────────────────────────
  hac13_code    char(13) NOT NULL UNIQUE,
  type_code     smallint NOT NULL CHECK (type_code IN (1, 2)),
                  -- 1 = trong nước (VN), 2 = nước ngoài
                  -- type 3 reserved cho employees (bảng riêng)

  -- ─── Thông tin pháp nhân ────────────────────────────────────────────────
  legal_name    text NOT NULL,
  short_name    text,
  tax_code      text,         -- MST DN VN (10 ký tự) hoặc tax ID nước ngoài
  cccd          text,         -- CCCD với hộ KD / cá nhân
  reg_number    text,         -- số ĐKKD nếu có

  -- ─── Địa lý ────────────────────────────────────────────────────────────
  country_iso   char(2) NOT NULL DEFAULT 'VN',  -- ISO 3166-1 alpha-2
  province_gso  text,                            -- mã tỉnh GSO VN (46=Huế…)
  region_iso    text,                            -- ISO 3166-2 (CN-GD, IN-MH…)
  district      text,
  ward          text,
  address_line  text,

  -- ─── Liên hệ ───────────────────────────────────────────────────────────
  phone         text,
  email         text,
  website       text,

  -- ─── Ngân hàng (NCC mới cần, KH có thể để trống) ───────────────────────
  bank_name     text,
  bank_account  text,
  bank_holder   text,
  bank_branch   text,
  bank_swift    text,                            -- với BP nước ngoài

  -- ─── Trạng thái + metadata ─────────────────────────────────────────────
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'inactive', 'blocked', 'pending')),
  notes         text,

  -- ─── Audit ─────────────────────────────────────────────────────────────
  created_by    uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,

  -- ─── Validate mã HAC-13 nhất quán với type_code ────────────────────────
  CONSTRAINT bp_hac13_valid CHECK (
    is_valid_hac13(hac13_code)
    AND substr(hac13_code, 5, 1) = type_code::text
  )
);

COMMENT ON TABLE business_partners IS
  'Master Business Partner gộp KH + NCC + đại lý B2B + hộ NCC mủ theo HAC-13 v10.';
COMMENT ON COLUMN business_partners.type_code IS
  '1 = BP trong nước (country_iso=VN), 2 = BP nước ngoài. Khớp với ký tự thứ 5 của hac13_code.';
COMMENT ON COLUMN business_partners.tax_code IS
  'MST (VN) hoặc tax ID nước ngoài. Index UNIQUE partial bên dưới (không null).';

-- Index
CREATE INDEX IF NOT EXISTS idx_bp_type_code       ON business_partners(type_code);
CREATE INDEX IF NOT EXISTS idx_bp_country_iso     ON business_partners(country_iso);
CREATE INDEX IF NOT EXISTS idx_bp_legal_name_trgm ON business_partners USING gin (legal_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_bp_status          ON business_partners(status) WHERE deleted_at IS NULL;

-- UNIQUE partial: mỗi tax_code chỉ tồn tại 1 BP active (không null)
CREATE UNIQUE INDEX IF NOT EXISTS uq_bp_tax_code_active
  ON business_partners(tax_code)
  WHERE tax_code IS NOT NULL AND deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: TABLE bp_roles
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bp_roles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bp_id           uuid NOT NULL REFERENCES business_partners(id) ON DELETE CASCADE,
  role_type       text NOT NULL CHECK (role_type IN (
                    'CUSTOMER_INTL',     -- KH xuất khẩu (sales_customers hiện tại)
                    'CUSTOMER_DOM',      -- KH nội địa (chưa dùng, dự phòng)
                    'SUPPLIER_GENERAL',  -- NCC mua hàng nội địa (suppliers)
                    'PARTNER_B2B',       -- Đại lý B2B Portal (b2b_partners)
                    'RUBBER_SUPPLIER'    -- Hộ NCC mủ thô (rubber_suppliers)
                  )),

  -- ─── role_data: jsonb chứa thuộc tính riêng của vai trò ────────────────
  -- CUSTOMER_INTL: { tier, default_incoterm, default_currency, credit_limit, quality_standard,
  --                  preferred_grades, requires_pre_shipment_sample, payment_terms, ... }
  -- SUPPLIER_GENERAL: { supplier_type, supplier_group, payment_terms_days, credit_limit_vnd, rating, ... }
  -- PARTNER_B2B: { partner_type, tier_b2b, total_volume_tons, ... }
  -- RUBBER_SUPPLIER: { supplier_type, plantation_area_ha, payment_method, eudr_compliant, avg_drc, ... }
  role_data       jsonb NOT NULL DEFAULT '{}'::jsonb,

  is_primary      boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'inactive', 'suspended')),
  activated_at    timestamptz NOT NULL DEFAULT now(),
  deactivated_at  timestamptz,

  CONSTRAINT uq_bp_roles_bp_role UNIQUE (bp_id, role_type)
);

COMMENT ON TABLE bp_roles IS
  'Mỗi BP có thể có nhiều vai trò (CUSTOMER_INTL + SUPPLIER_GENERAL = vừa KH vừa NCC).';
COMMENT ON COLUMN bp_roles.role_data IS
  'jsonb chứa attribute riêng của vai trò. Schema khác nhau cho mỗi role_type.';

CREATE INDEX IF NOT EXISTS idx_bp_roles_bp_id     ON bp_roles(bp_id);
CREATE INDEX IF NOT EXISTS idx_bp_roles_role_type ON bp_roles(role_type) WHERE status = 'active';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: ALTER history/search tables — ADD FK to business_partners
-- ════════════════════════════════════════════════════════════════════════════
-- Đã tạo cột bp_id ở mig 02 nhưng chưa có FK (do business_partners chưa tồn tại).
-- Giờ tạo FK với ON DELETE CASCADE để dọn dẹp khi soft-delete BP.

ALTER TABLE bp_search_keys
  DROP CONSTRAINT IF EXISTS fk_bp_search_keys_bp_id;
ALTER TABLE bp_search_keys
  ADD CONSTRAINT fk_bp_search_keys_bp_id
  FOREIGN KEY (bp_id) REFERENCES business_partners(id) ON DELETE CASCADE;

ALTER TABLE bp_name_history
  DROP CONSTRAINT IF EXISTS fk_bp_name_history_bp_id;
ALTER TABLE bp_name_history
  ADD CONSTRAINT fk_bp_name_history_bp_id
  FOREIGN KEY (bp_id) REFERENCES business_partners(id) ON DELETE CASCADE;

ALTER TABLE bp_address_history
  DROP CONSTRAINT IF EXISTS fk_bp_address_history_bp_id;
ALTER TABLE bp_address_history
  ADD CONSTRAINT fk_bp_address_history_bp_id
  FOREIGN KEY (bp_id) REFERENCES business_partners(id) ON DELETE CASCADE;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: TRIGGER tự gán hac13_code + type_code nhất quán country_iso
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION bp_before_insert_fill_code()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- Tự xác định type_code theo country_iso nếu caller không set
  IF NEW.type_code IS NULL THEN
    NEW.type_code := CASE WHEN COALESCE(NEW.country_iso, 'VN') = 'VN' THEN 1 ELSE 2 END;
  END IF;

  -- Sinh hac13_code nếu caller không set
  IF NEW.hac13_code IS NULL THEN
    NEW.hac13_code := generate_hac13(NEW.type_code::int);
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bp_before_insert ON business_partners;
CREATE TRIGGER trg_bp_before_insert
BEFORE INSERT ON business_partners
FOR EACH ROW
EXECUTE FUNCTION bp_before_insert_fill_code();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: TRIGGER khoá thay đổi hac13_code & type_code + auto updated_at + log history
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION bp_before_update_guard_immutable()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hac13_code IS DISTINCT FROM OLD.hac13_code THEN
    RAISE EXCEPTION 'business_partners.hac13_code không được sửa sau khi tạo (id=%)', OLD.id;
  END IF;
  IF NEW.type_code IS DISTINCT FROM OLD.type_code THEN
    RAISE EXCEPTION 'business_partners.type_code không được sửa sau khi tạo (id=%)', OLD.id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bp_before_update_guard ON business_partners;
CREATE TRIGGER trg_bp_before_update_guard
BEFORE UPDATE ON business_partners
FOR EACH ROW
EXECUTE FUNCTION bp_before_update_guard_immutable();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 6: TRIGGER log bp_name_history + bp_address_history
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION bp_after_update_log_history()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changed_by uuid;
BEGIN
  v_changed_by := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;

  IF NEW.legal_name IS DISTINCT FROM OLD.legal_name THEN
    INSERT INTO bp_name_history (bp_id, old_name, new_name, changed_by)
    VALUES (NEW.id, OLD.legal_name, NEW.legal_name, v_changed_by);
  END IF;

  IF NEW.country_iso       IS DISTINCT FROM OLD.country_iso
     OR NEW.province_gso   IS DISTINCT FROM OLD.province_gso
     OR NEW.region_iso     IS DISTINCT FROM OLD.region_iso
     OR NEW.address_line   IS DISTINCT FROM OLD.address_line THEN
    INSERT INTO bp_address_history (
      bp_id,
      old_country_iso, old_province_gso, old_region_iso, old_address_line,
      new_country_iso, new_province_gso, new_region_iso, new_address_line,
      changed_by)
    VALUES (
      NEW.id,
      OLD.country_iso, OLD.province_gso, OLD.region_iso, OLD.address_line,
      NEW.country_iso, NEW.province_gso, NEW.region_iso, NEW.address_line,
      v_changed_by);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bp_after_update_history ON business_partners;
CREATE TRIGGER trg_bp_after_update_history
AFTER UPDATE ON business_partners
FOR EACH ROW
EXECUTE FUNCTION bp_after_update_log_history();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 7: TRIGGER auto-add bp_search_keys khi tax_code/email/phone thay đổi
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION bp_sync_search_keys()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Helper: upsert key nếu non-null
  IF TG_OP = 'INSERT' OR NEW.tax_code IS DISTINCT FROM OLD.tax_code THEN
    IF TG_OP = 'UPDATE' AND OLD.tax_code IS NOT NULL THEN
      DELETE FROM bp_search_keys WHERE bp_id = NEW.id AND key_type='TAX_CODE' AND key_value = OLD.tax_code;
    END IF;
    IF NEW.tax_code IS NOT NULL AND NEW.tax_code <> '' THEN
      INSERT INTO bp_search_keys (bp_id, key_type, key_value)
      VALUES (NEW.id, 'TAX_CODE', NEW.tax_code)
      ON CONFLICT (key_type, key_value) DO NOTHING;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.cccd IS DISTINCT FROM OLD.cccd THEN
    IF TG_OP = 'UPDATE' AND OLD.cccd IS NOT NULL THEN
      DELETE FROM bp_search_keys WHERE bp_id = NEW.id AND key_type='CCCD' AND key_value = OLD.cccd;
    END IF;
    IF NEW.cccd IS NOT NULL AND NEW.cccd <> '' THEN
      INSERT INTO bp_search_keys (bp_id, key_type, key_value)
      VALUES (NEW.id, 'CCCD', NEW.cccd)
      ON CONFLICT (key_type, key_value) DO NOTHING;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.email IS DISTINCT FROM OLD.email THEN
    IF TG_OP = 'UPDATE' AND OLD.email IS NOT NULL THEN
      DELETE FROM bp_search_keys WHERE bp_id = NEW.id AND key_type='EMAIL' AND key_value = OLD.email;
    END IF;
    IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
      INSERT INTO bp_search_keys (bp_id, key_type, key_value)
      VALUES (NEW.id, 'EMAIL', NEW.email)
      ON CONFLICT (key_type, key_value) DO NOTHING;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.phone IS DISTINCT FROM OLD.phone THEN
    IF TG_OP = 'UPDATE' AND OLD.phone IS NOT NULL THEN
      DELETE FROM bp_search_keys WHERE bp_id = NEW.id AND key_type='PHONE' AND key_value = OLD.phone;
    END IF;
    IF NEW.phone IS NOT NULL AND NEW.phone <> '' THEN
      INSERT INTO bp_search_keys (bp_id, key_type, key_value)
      VALUES (NEW.id, 'PHONE', NEW.phone)
      ON CONFLICT (key_type, key_value) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bp_sync_search_keys ON business_partners;
CREATE TRIGGER trg_bp_sync_search_keys
AFTER INSERT OR UPDATE OF tax_code, cccd, email, phone ON business_partners
FOR EACH ROW
EXECUTE FUNCTION bp_sync_search_keys();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 8: RPC tạo BP có roles (atomic)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION rpc_create_bp_with_roles(
  p_legal_name   text,
  p_country_iso  char(2)   DEFAULT 'VN',
  p_tax_code     text      DEFAULT NULL,
  p_cccd         text      DEFAULT NULL,
  p_short_name   text      DEFAULT NULL,
  p_province_gso text      DEFAULT NULL,
  p_region_iso   text      DEFAULT NULL,
  p_address_line text      DEFAULT NULL,
  p_phone        text      DEFAULT NULL,
  p_email        text      DEFAULT NULL,
  p_roles        jsonb     DEFAULT '[]'::jsonb
   -- p_roles ví dụ: [{"role_type":"CUSTOMER_INTL","role_data":{...},"is_primary":true}]
) RETURNS business_partners
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_bp     business_partners;
  v_role   jsonb;
BEGIN
  INSERT INTO business_partners (
    legal_name, short_name, country_iso, tax_code, cccd,
    province_gso, region_iso, address_line, phone, email
  ) VALUES (
    p_legal_name, p_short_name, p_country_iso, p_tax_code, p_cccd,
    p_province_gso, p_region_iso, p_address_line, p_phone, p_email
  )
  RETURNING * INTO v_bp;

  -- Attach roles
  FOR v_role IN SELECT * FROM jsonb_array_elements(p_roles) LOOP
    INSERT INTO bp_roles (bp_id, role_type, role_data, is_primary)
    VALUES (
      v_bp.id,
      v_role->>'role_type',
      COALESCE(v_role->'role_data', '{}'::jsonb),
      COALESCE((v_role->>'is_primary')::boolean, false)
    );
  END LOOP;

  RETURN v_bp;
END;
$$;

COMMENT ON FUNCTION rpc_create_bp_with_roles(text, char, text, text, text, text, text, text, text, text, jsonb) IS
  'Tạo BP atomically với danh sách roles. Trả về BP đã tạo (kèm hac13_code do trigger sinh).';

REVOKE ALL ON FUNCTION rpc_create_bp_with_roles(text, char, text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_create_bp_with_roles(text, char, text, text, text, text, text, text, text, text, jsonb) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 9: RLS — SELECT cho authenticated, mutate cần role admin/sales/purchase
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE business_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE bp_roles          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bp_select_auth        ON business_partners;
DROP POLICY IF EXISTS bp_insert_auth        ON business_partners;
DROP POLICY IF EXISTS bp_update_auth        ON business_partners;
DROP POLICY IF EXISTS bp_roles_select_auth  ON bp_roles;
DROP POLICY IF EXISTS bp_roles_insert_auth  ON bp_roles;
DROP POLICY IF EXISTS bp_roles_update_auth  ON bp_roles;

-- Phase 3: cho phép authenticated SELECT + mutate (tạm thời rộng — siết về role
-- cụ thể ở phase polish sau khi đã có role-based system).
CREATE POLICY bp_select_auth       ON business_partners FOR SELECT TO authenticated USING (true);
CREATE POLICY bp_insert_auth       ON business_partners FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY bp_update_auth       ON business_partners FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY bp_roles_select_auth ON bp_roles          FOR SELECT TO authenticated USING (true);
CREATE POLICY bp_roles_insert_auth ON bp_roles          FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY bp_roles_update_auth ON bp_roles          FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Grants
GRANT SELECT, INSERT, UPDATE         ON business_partners, bp_roles TO authenticated;
GRANT ALL                            ON business_partners, bp_roles TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 10: NOTIFY reload + VERIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_bp business_partners;
BEGIN
  -- Insert test BP, verify hac13_code tự sinh
  INSERT INTO business_partners (legal_name, country_iso, tax_code)
  VALUES ('___HAC13_SMOKE_TEST___', 'VN', '___SMOKE_TAX_CODE___')
  RETURNING * INTO v_bp;

  IF NOT is_valid_hac13(v_bp.hac13_code) THEN
    RAISE EXCEPTION 'SMOKE FAIL: hac13_code sinh bị invalid: %', v_bp.hac13_code;
  END IF;
  IF v_bp.type_code <> 1 THEN
    RAISE EXCEPTION 'SMOKE FAIL: country=VN → type=1 (got %)', v_bp.type_code;
  END IF;
  IF substr(v_bp.hac13_code, 5, 1) <> '1' THEN
    RAISE EXCEPTION 'SMOKE FAIL: hac13_code segment type sai: %', v_bp.hac13_code;
  END IF;

  -- Verify bp_search_keys auto-populated
  IF NOT EXISTS (SELECT 1 FROM bp_search_keys WHERE bp_id = v_bp.id AND key_type='TAX_CODE') THEN
    RAISE EXCEPTION 'SMOKE FAIL: bp_search_keys không có TAX_CODE row sau insert';
  END IF;

  -- Cleanup
  DELETE FROM business_partners WHERE id = v_bp.id;

  RAISE NOTICE 'HAC-13 Phase 3.1 SMOKE PASS — BP master + triggers OK';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (chỉ dùng nếu cần rollback hoàn toàn):
-- ════════════════════════════════════════════════════════════════════════════
-- DROP FUNCTION IF EXISTS rpc_create_bp_with_roles(text, char, text, text, text, text, text, text, text, text, jsonb);
-- DROP TRIGGER IF EXISTS trg_bp_sync_search_keys ON business_partners;
-- DROP FUNCTION IF EXISTS bp_sync_search_keys();
-- DROP TRIGGER IF EXISTS trg_bp_after_update_history ON business_partners;
-- DROP FUNCTION IF EXISTS bp_after_update_log_history();
-- DROP TRIGGER IF EXISTS trg_bp_before_update_guard ON business_partners;
-- DROP FUNCTION IF EXISTS bp_before_update_guard_immutable();
-- DROP TRIGGER IF EXISTS trg_bp_before_insert ON business_partners;
-- DROP FUNCTION IF EXISTS bp_before_insert_fill_code();
-- ALTER TABLE bp_search_keys     DROP CONSTRAINT IF EXISTS fk_bp_search_keys_bp_id;
-- ALTER TABLE bp_name_history    DROP CONSTRAINT IF EXISTS fk_bp_name_history_bp_id;
-- ALTER TABLE bp_address_history DROP CONSTRAINT IF EXISTS fk_bp_address_history_bp_id;
-- DROP TABLE IF EXISTS bp_roles;
-- DROP TABLE IF EXISTS business_partners;
