-- ============================================================================
-- B2B RLS — Partner-scoped policies + audit script
-- File: docs/migrations/b2b_rls_partner_scope.sql
-- Ngày: 2026-04-18 (sửa: base tables ở schema b2b, public.b2b_* là VIEW)
--
-- MỤC TIÊU:
--   Đảm bảo đại lý (partner) authenticated qua Portal b2b.huyanhrubber.vn
--   CHỈ thấy data của chính mình: deals, advances, settlements, chat, ledger.
--   Nhà máy (ERP) dùng service_role hoặc authenticated nội bộ — KHÔNG bị siết.
--
-- GIẢ ĐỊNH QUAN TRỌNG:
--   Partner user JWT có custom claim "partner_id" (UUID).
--   Factory user JWT KHÔNG có claim này → current_partner_id() trả NULL.
--
-- CẢNH BÁO:
--   Migration này bật RLS trên b2b.deals / b2b.advances / b2b.settlements /
--   b2b.partner_ledger — các bảng này TRƯỚC đó có thể chưa có RLS.
--   Policy cho phép factory (current_partner_id() IS NULL) làm mọi thứ,
--   NÊN ERP không bị break — miễn là ERP dùng authenticated hoặc service_role.
--
--   **TEST TRÊN STAGING TRƯỚC** nếu có thể.
-- ============================================================================

-- ============================================================================
-- PHẦN 1: AUDIT — RLS trạng thái hiện tại
-- ============================================================================
SELECT '== RLS enabled status (before) ==' AS section;
SELECT schemaname, tablename,
       CASE rowsecurity WHEN true THEN 'ON' ELSE 'OFF' END AS rls_status
FROM pg_tables
WHERE schemaname = 'b2b'
ORDER BY tablename;

SELECT '== Existing policies (before) ==' AS section;
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'b2b'
ORDER BY tablename, policyname;

-- ============================================================================
-- PHẦN 2: HELPER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.current_partner_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, b2b
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.partner_id', true), ''),
    NULLIF(current_setting('request.jwt.claims', true)::json ->> 'partner_id', ''),
    NULLIF(auth.jwt() ->> 'partner_id', '')
  )::UUID
$$;

COMMENT ON FUNCTION public.current_partner_id() IS
  'Trả về partner_id từ JWT claim. NULL nếu không phải partner user (factory, service_role).';

-- ============================================================================
-- PHẦN 3: POLICIES CHO TỪNG BẢNG
-- Quy tắc:
--   - Factory/ERP (current_partner_id IS NULL): full access
--   - Partner (có claim): chỉ thấy/sửa row của mình
-- ============================================================================

-- ========== 3.1 b2b.deals ==========
ALTER TABLE b2b.deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deals_partner_select ON b2b.deals;
CREATE POLICY deals_partner_select ON b2b.deals
  FOR SELECT TO authenticated
  USING (public.current_partner_id() IS NULL OR partner_id = public.current_partner_id());

DROP POLICY IF EXISTS deals_factory_all ON b2b.deals;
CREATE POLICY deals_factory_all ON b2b.deals
  FOR ALL TO authenticated
  USING (public.current_partner_id() IS NULL)
  WITH CHECK (public.current_partner_id() IS NULL);

-- ========== 3.2 b2b.advances ==========
ALTER TABLE b2b.advances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS advances_partner_select ON b2b.advances;
CREATE POLICY advances_partner_select ON b2b.advances
  FOR SELECT TO authenticated
  USING (public.current_partner_id() IS NULL OR partner_id = public.current_partner_id());

DROP POLICY IF EXISTS advances_factory_all ON b2b.advances;
CREATE POLICY advances_factory_all ON b2b.advances
  FOR ALL TO authenticated
  USING (public.current_partner_id() IS NULL)
  WITH CHECK (public.current_partner_id() IS NULL);

-- ========== 3.3 b2b.settlements ==========
ALTER TABLE b2b.settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlements_partner_select ON b2b.settlements;
CREATE POLICY settlements_partner_select ON b2b.settlements
  FOR SELECT TO authenticated
  USING (public.current_partner_id() IS NULL OR partner_id = public.current_partner_id());

DROP POLICY IF EXISTS settlements_factory_all ON b2b.settlements;
CREATE POLICY settlements_factory_all ON b2b.settlements
  FOR ALL TO authenticated
  USING (public.current_partner_id() IS NULL)
  WITH CHECK (public.current_partner_id() IS NULL);

-- ========== 3.4 b2b.settlement_payments (nếu tồn tại) ==========
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'b2b' AND tablename = 'settlement_payments') THEN
    EXECUTE 'ALTER TABLE b2b.settlement_payments ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS payments_partner_select ON b2b.settlement_payments';
    EXECUTE $POL$
      CREATE POLICY payments_partner_select ON b2b.settlement_payments
        FOR SELECT TO authenticated
        USING (
          public.current_partner_id() IS NULL
          OR settlement_id IN (SELECT id FROM b2b.settlements WHERE partner_id = public.current_partner_id())
        )
    $POL$;

    EXECUTE 'DROP POLICY IF EXISTS payments_factory_all ON b2b.settlement_payments';
    EXECUTE $POL$
      CREATE POLICY payments_factory_all ON b2b.settlement_payments
        FOR ALL TO authenticated
        USING (public.current_partner_id() IS NULL)
        WITH CHECK (public.current_partner_id() IS NULL)
    $POL$;
  END IF;
END $$;

-- ========== 3.5 b2b.partner_ledger ==========
ALTER TABLE b2b.partner_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ledger_partner_select ON b2b.partner_ledger;
CREATE POLICY ledger_partner_select ON b2b.partner_ledger
  FOR SELECT TO authenticated
  USING (public.current_partner_id() IS NULL OR partner_id = public.current_partner_id());

DROP POLICY IF EXISTS ledger_factory_all ON b2b.partner_ledger;
CREATE POLICY ledger_factory_all ON b2b.partner_ledger
  FOR ALL TO authenticated
  USING (public.current_partner_id() IS NULL)
  WITH CHECK (public.current_partner_id() IS NULL);

-- ========== 3.6 b2b.chat_rooms — siết policy realtime_select_authenticated cũ ==========
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'b2b' AND tablename = 'chat_rooms') THEN
    -- Xoá policy lỏng
    EXECUTE 'DROP POLICY IF EXISTS realtime_select_authenticated ON b2b.chat_rooms';

    EXECUTE 'DROP POLICY IF EXISTS rooms_partner_select ON b2b.chat_rooms';
    EXECUTE $POL$
      CREATE POLICY rooms_partner_select ON b2b.chat_rooms
        FOR SELECT TO authenticated
        USING (public.current_partner_id() IS NULL OR partner_id = public.current_partner_id())
    $POL$;

    EXECUTE 'DROP POLICY IF EXISTS rooms_factory_write ON b2b.chat_rooms';
    EXECUTE $POL$
      CREATE POLICY rooms_factory_write ON b2b.chat_rooms
        FOR ALL TO authenticated
        USING (public.current_partner_id() IS NULL)
        WITH CHECK (public.current_partner_id() IS NULL)
    $POL$;
  END IF;
END $$;

-- ========== 3.7 b2b.chat_messages — filter qua room_id ==========
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'b2b' AND tablename = 'chat_messages') THEN
    EXECUTE 'DROP POLICY IF EXISTS realtime_select_authenticated ON b2b.chat_messages';

    EXECUTE 'DROP POLICY IF EXISTS messages_partner_select ON b2b.chat_messages';
    EXECUTE $POL$
      CREATE POLICY messages_partner_select ON b2b.chat_messages
        FOR SELECT TO authenticated
        USING (
          public.current_partner_id() IS NULL
          OR room_id IN (SELECT id FROM b2b.chat_rooms WHERE partner_id = public.current_partner_id())
        )
    $POL$;

    EXECUTE 'DROP POLICY IF EXISTS messages_partner_insert ON b2b.chat_messages';
    EXECUTE $POL$
      CREATE POLICY messages_partner_insert ON b2b.chat_messages
        FOR INSERT TO authenticated
        WITH CHECK (
          public.current_partner_id() IS NULL
          OR (
            room_id IN (SELECT id FROM b2b.chat_rooms WHERE partner_id = public.current_partner_id())
            AND sender_type = 'partner'
          )
        )
    $POL$;

    EXECUTE 'DROP POLICY IF EXISTS messages_factory_write ON b2b.chat_messages';
    EXECUTE $POL$
      CREATE POLICY messages_factory_write ON b2b.chat_messages
        FOR ALL TO authenticated
        USING (public.current_partner_id() IS NULL)
        WITH CHECK (public.current_partner_id() IS NULL)
    $POL$;
  END IF;
END $$;

-- ============================================================================
-- PHẦN 4: VERIFY sau migration
-- ============================================================================
SELECT '== RLS status (after) ==' AS section;
SELECT schemaname, tablename,
       CASE rowsecurity WHEN true THEN 'ON' ELSE 'OFF' END AS rls_status
FROM pg_tables
WHERE schemaname = 'b2b'
ORDER BY tablename;

SELECT '== Policies (after) ==' AS section;
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'b2b'
ORDER BY tablename, policyname;

NOTIFY pgrst, 'reload schema';
