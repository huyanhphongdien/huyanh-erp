-- ============================================================================
-- HAC-13 Phase 1.2 — Search keys + History tables
-- Date: 2026-05-26
-- ============================================================================
--
-- Mục đích:
--   Hạ tầng tra cứu (search) + audit (history) cho master data BP & Employee.
--
--   - bp_search_keys     : nhiều key-alias (TAX_CODE, CCCD, EMAIL, PHONE, ALIAS)
--                          map về 1 business_partner để global search.
--   - bp_name_history    : log đổi legal_name của BP (M&A, đổi tên DN…)
--   - bp_address_history : log chuyển tỉnh / chuyển trụ sở (giữ nguyên mã)
--   - employee_history   : log đổi tên / chuyển phòng ban / đổi chức vụ
--
-- Ràng buộc:
--   - bp_id (UUID) ở các bảng bp_* sẽ được ALTER TABLE … ADD CONSTRAINT FK
--     trong migration hac13_03 (sau khi business_partners được tạo).
--   - employee_id REFERENCES employees(id) đặt được luôn vì bảng employees đã có.
--
-- Phụ thuộc:
--   - hac13_01_lib.sql (functions chưa cần nhưng nên đã chạy)
--   - extension pg_trgm cho fuzzy search trên key_value, legal_name
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 0: ENABLE pg_trgm (cho gin_trgm_ops index)
-- ════════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: bp_search_keys — alias / external identifier tra cứu nhanh
-- ════════════════════════════════════════════════════════════════════════════
-- Một BP có thể có nhiều key (1 MST, 1 email chính, vài alias…).
-- Dùng cho global search + de-dup detection (insert MST mới → trùng → cảnh báo).

CREATE TABLE IF NOT EXISTS bp_search_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bp_id       UUID NOT NULL,                     -- FK → business_partners(id) thêm ở mig 03
  key_type    TEXT NOT NULL CHECK (key_type IN
                ('TAX_CODE', 'CCCD', 'EMAIL', 'PHONE', 'ALIAS')),
  key_value   TEXT NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_bp_search_keys_type_value UNIQUE (key_type, key_value)
);

CREATE INDEX IF NOT EXISTS idx_bp_search_keys_bp_id    ON bp_search_keys(bp_id);
CREATE INDEX IF NOT EXISTS idx_bp_search_keys_keyvalue ON bp_search_keys USING gin (key_value gin_trgm_ops);

COMMENT ON TABLE  bp_search_keys IS
  'Nhiều key-alias map về 1 BP. Dùng cho global search + detect trùng MST khi tạo mới.';
COMMENT ON COLUMN bp_search_keys.key_type IS
  'TAX_CODE (MST DN), CCCD (cá nhân/hộ KD), EMAIL, PHONE, ALIAS (tên gọi tắt/cũ).';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: bp_name_history — log đổi legal_name của BP
-- ════════════════════════════════════════════════════════════════════════════
-- Mã HAC-13 KHÔNG đổi khi đối tác đổi tên (M&A, đổi tên DN).
-- Tên cũ được lưu ở đây để truy vết lịch sử.

CREATE TABLE IF NOT EXISTS bp_name_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bp_id       UUID NOT NULL,                     -- FK → business_partners(id) ở mig 03
  old_name    TEXT NOT NULL,
  new_name    TEXT NOT NULL,
  reason      TEXT,
  changed_by  UUID,                              -- auth.users.id
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bp_name_history_bp_id      ON bp_name_history(bp_id);
CREATE INDEX IF NOT EXISTS idx_bp_name_history_changed_at ON bp_name_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_bp_name_history_old_name   ON bp_name_history USING gin (old_name gin_trgm_ops);

COMMENT ON TABLE bp_name_history IS
  'Log đổi legal_name của BP (giữ nguyên mã HAC-13). Trigger AFTER UPDATE business_partners tạo ở mig 03.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: bp_address_history — log chuyển tỉnh / chuyển trụ sở
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bp_address_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bp_id               UUID NOT NULL,             -- FK → business_partners(id) ở mig 03
  old_country_iso     CHAR(2),
  old_province_gso    TEXT,
  old_region_iso      TEXT,
  old_address_line    TEXT,
  new_country_iso     CHAR(2),
  new_province_gso    TEXT,
  new_region_iso      TEXT,
  new_address_line    TEXT,
  reason              TEXT,
  changed_by          UUID,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bp_address_history_bp_id      ON bp_address_history(bp_id);
CREATE INDEX IF NOT EXISTS idx_bp_address_history_changed_at ON bp_address_history(changed_at DESC);

COMMENT ON TABLE bp_address_history IS
  'Log chuyển tỉnh/trụ sở của BP. Trigger AFTER UPDATE business_partners tạo ở mig 03.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: employee_history — log đổi tên / chuyển phòng / đổi chức vụ NV
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS employee_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  change_type   TEXT NOT NULL CHECK (change_type IN
                  ('NAME', 'DEPARTMENT', 'POSITION', 'CONTRACT_TYPE', 'STATUS')),
  old_value     JSONB,
  new_value     JSONB,
  reason        TEXT,
  changed_by    UUID,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_history_employee_id ON employee_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_history_changed_at  ON employee_history(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_history_change_type ON employee_history(change_type);

COMMENT ON TABLE employee_history IS
  'Log đổi tên / chuyển phòng / đổi chức vụ NV (giữ nguyên mã HAC-13). Trigger tạo ở mig hac13_04.';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: RLS — SELECT public, INSERT chỉ qua trigger / service role
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE bp_search_keys      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bp_name_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bp_address_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_history    ENABLE ROW LEVEL SECURITY;

-- SELECT cho authenticated (mọi nhân viên cần tra cứu BP qua MST/email)
DROP POLICY IF EXISTS bp_search_keys_select_auth     ON bp_search_keys;
DROP POLICY IF EXISTS bp_name_history_select_auth    ON bp_name_history;
DROP POLICY IF EXISTS bp_address_history_select_auth ON bp_address_history;
DROP POLICY IF EXISTS employee_history_select_auth   ON employee_history;

CREATE POLICY bp_search_keys_select_auth     ON bp_search_keys     FOR SELECT TO authenticated USING (true);
CREATE POLICY bp_name_history_select_auth    ON bp_name_history    FOR SELECT TO authenticated USING (true);
CREATE POLICY bp_address_history_select_auth ON bp_address_history FOR SELECT TO authenticated USING (true);
CREATE POLICY employee_history_select_auth   ON employee_history   FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE: chỉ service_role (trigger SECURITY DEFINER hoặc admin RPC).
-- → KHÔNG có policy nào cho phép authenticated mutate → mặc định bị chặn.

-- Grant cơ bản
GRANT SELECT ON bp_search_keys, bp_name_history, bp_address_history, employee_history
  TO authenticated;
GRANT ALL ON bp_search_keys, bp_name_history, bp_address_history, employee_history
  TO service_role;
