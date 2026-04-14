-- ============================================================================
-- B2B Migration — Phase 1 + 2
-- Phase 1: Fix FK gãy + sync CHECK constraint với code TypeScript
-- Phase 2: Bổ sung Realtime publication cho các bảng còn thiếu
-- ============================================================================

BEGIN;

-- ── PRE-CHECK: Verify không có offer mồ côi partner_id ──
-- Nếu có offer nào partner_id không tồn tại trong b2b.partners, FK sẽ fail
DO $$
DECLARE
  orphan_count int;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM public.b2b_demand_offers o
  LEFT JOIN b2b.partners p ON p.id = o.partner_id
  WHERE p.id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Found % offers with invalid partner_id — fix data first', orphan_count;
  END IF;
END $$;

-- ── PRE-CHECK: Verify không có offer mồ côi deal_id ──
DO $$
DECLARE
  orphan_count int;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM public.b2b_demand_offers o
  LEFT JOIN b2b.deals d ON d.id = o.deal_id
  WHERE o.deal_id IS NOT NULL AND d.id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Found % offers pointing to non-existent deal_id', orphan_count;
  END IF;
END $$;

-- ── PRE-CHECK: Verify b2b.deals.offer_id (current FK target) không có rác ──
DO $$
DECLARE
  bad_count int;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM b2b.deals d
  WHERE d.offer_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.b2b_demand_offers WHERE id = d.offer_id);

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Found % deals with offer_id not in b2b_demand_offers — clear them first', bad_count;
  END IF;
END $$;

-- ============================================================================
-- PHASE 1.1 — Drop FK gãy: b2b.deals.offer_id → b2b.supplier_offers (dead)
-- ============================================================================

ALTER TABLE b2b.deals DROP CONSTRAINT IF EXISTS deals_offer_id_fkey;

-- ============================================================================
-- PHASE 1.2 — Tạo lại FK trỏ về public.b2b_demand_offers
-- ON DELETE SET NULL: nếu offer bị xóa, deal vẫn tồn tại với offer_id=NULL
-- ============================================================================

ALTER TABLE b2b.deals
  ADD CONSTRAINT deals_offer_id_fkey
  FOREIGN KEY (offer_id)
  REFERENCES public.b2b_demand_offers(id)
  ON DELETE SET NULL;

-- ============================================================================
-- PHASE 1.3 — Thêm FK trên public.b2b_demand_offers (cho PostgREST detect join)
-- ============================================================================

-- offer.partner_id → b2b.partners.id (RESTRICT: không cho xóa partner đang có offer)
ALTER TABLE public.b2b_demand_offers
  ADD CONSTRAINT b2b_demand_offers_partner_id_fkey
  FOREIGN KEY (partner_id)
  REFERENCES b2b.partners(id)
  ON DELETE RESTRICT;

-- offer.deal_id → b2b.deals.id (SET NULL: deal bị xóa thì offer vẫn còn nhưng unlink)
ALTER TABLE public.b2b_demand_offers
  ADD CONSTRAINT b2b_demand_offers_deal_id_fkey
  FOREIGN KEY (deal_id)
  REFERENCES b2b.deals(id)
  ON DELETE SET NULL;

-- ============================================================================
-- PHASE 1.4 — Sync CHECK constraint deals_status_check với TypeScript code
-- Code dùng: pending / processing / accepted / settled / cancelled
-- DB cũ:    draft / confirmed / processing / completed / cancelled
-- Data hiện tại chỉ có 'processing' (2 rows) → migrate an toàn
-- ============================================================================

ALTER TABLE b2b.deals DROP CONSTRAINT IF EXISTS deals_status_check;
ALTER TABLE b2b.deals
  ADD CONSTRAINT deals_status_check
  CHECK (status IN ('pending','processing','accepted','settled','cancelled'));

-- ============================================================================
-- PHASE 2 — Realtime publication: thêm các bảng còn thiếu
-- ============================================================================

-- b2b.deals: để khi có deal mới hoặc đổi status, list realtime update
ALTER PUBLICATION supabase_realtime ADD TABLE b2b.deals;

-- public.b2b_demand_offers: khi đại lý chào giá mới, demand detail tự refresh
ALTER PUBLICATION supabase_realtime ADD TABLE public.b2b_demand_offers;

-- public.b2b_demands: khi tạo nhu cầu mới hoặc đổi status
ALTER PUBLICATION supabase_realtime ADD TABLE public.b2b_demands;

-- b2b.advances: tạm ứng — trang Quyết toán cần realtime
ALTER PUBLICATION supabase_realtime ADD TABLE b2b.advances;

-- b2b.settlements: phiếu quyết toán
ALTER PUBLICATION supabase_realtime ADD TABLE b2b.settlements;

COMMIT;

-- ============================================================================
-- POST: Reload PostgREST schema cache để FK mới được detect ngay
-- ============================================================================

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY (chạy sau commit, ngoài transaction)
-- ============================================================================

-- Xác nhận FK mới
SELECT
  tc.table_schema || '.' || tc.table_name AS source,
  kcu.column_name AS col,
  '→' AS arrow,
  ccu.table_schema || '.' || ccu.table_name AS target,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu USING (constraint_name, table_schema)
JOIN information_schema.constraint_column_usage ccu USING (constraint_name)
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND (
    tc.constraint_name IN ('deals_offer_id_fkey','b2b_demand_offers_partner_id_fkey','b2b_demand_offers_deal_id_fkey')
  );

-- Xác nhận CHECK constraint mới
SELECT con.conname, pg_get_constraintdef(con.oid, true) AS def
FROM pg_constraint con
WHERE con.conname = 'deals_status_check';

-- Xác nhận realtime publication
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND (schemaname = 'b2b' OR (schemaname = 'public' AND tablename LIKE 'b2b_%'))
ORDER BY schemaname, tablename;
