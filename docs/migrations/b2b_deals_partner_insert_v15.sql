-- ============================================================================
-- V15 — RLS INSERT policy cho partner trên b2b.deals
-- Date: 2026-05-21
-- ============================================================================
--
-- Bối cảnh: Nhà máy tạo phiếu chốt mủ → đại lý/nhà máy thương lượng → đại lý
-- bấm 'Đồng ý' từ portal → INSERT b2b.deals → RLS deny:
--   "new row violates row-level security policy for table 'deals'"
--
-- Root cause: Migration trước (b2b_rls_partner_scope.sql) chỉ có 2 policy:
--   - deals_partner_select: partner SELECT đơn của mình
--   - deals_factory_all: factory ALL operations (current_partner_id IS NULL)
--
-- → Partner KHÔNG có policy INSERT → block.
--
-- Fix: thêm `deals_partner_insert` cho phép partner tạo Deal khi:
--   - partner_id của deal = current_partner_id() (partner đang login)
--   - Tức partner chỉ tạo được deal cho mình, không tạo cho partner khác.
-- ============================================================================

-- Drop nếu đã có (idempotent)
DROP POLICY IF EXISTS deals_partner_insert ON b2b.deals;

CREATE POLICY deals_partner_insert ON b2b.deals
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Partner đăng nhập: chỉ tạo deal cho chính mình
    public.current_partner_id() IS NOT NULL
    AND partner_id = public.current_partner_id()
  );

COMMENT ON POLICY deals_partner_insert ON b2b.deals IS
  'V15 2026-05-21: Cho phép partner_user INSERT deal cho partner_id của họ. Match flow nhà máy tạo PCM → đại lý Đồng ý → INSERT deal từ portal.';

-- Tương tự cho b2b.advances (partner-side ConfirmDealModal có thể tạo advance)
DROP POLICY IF EXISTS advances_partner_insert ON b2b.advances;
CREATE POLICY advances_partner_insert ON b2b.advances
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_partner_id() IS NOT NULL
    AND partner_id = public.current_partner_id()
  );

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
SELECT policyname, cmd, qual::TEXT, with_check::TEXT
  FROM pg_policies
 WHERE schemaname = 'b2b'
   AND tablename IN ('deals', 'advances')
   AND policyname LIKE '%partner_insert%';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS deals_partner_insert ON b2b.deals;
-- DROP POLICY IF EXISTS advances_partner_insert ON b2b.advances;
-- NOTIFY pgrst, 'reload schema';
