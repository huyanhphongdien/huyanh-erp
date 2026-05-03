-- ============================================================================
-- B2B Intake v4 — VIEW RESYNC after schema migrations P1-P45
-- Date: 2026-05-03
-- Status: TO APPLY
-- ============================================================================
--
-- ROOT CAUSE:
--   Phase 1-4 migrations (P1 purchase_type, P2-P4 audit cols + nationality,
--   P5 daily_price_list) ALTER base tables in `b2b.*` schema, NOTIFY pgrst,
--   but did NOT recreate the corresponding `public.*` views.
--
--   PostgreSQL views freeze column list at CREATE time. Adding columns to
--   underlying base table does NOT auto-expose them on the view.
--
-- VERIFY ON LIVE PROD (2026-05-03):
--   ✗ public.b2b_deals — missing 11 Intake v4 cols (purchase_type, etc.)
--   ✗ public.b2b_partners — missing nationality, national_id
--   ✗ public.b2b_daily_price_list — view never created
--
-- IMPACT:
--   - 3 wizard mới (/b2b/intake/outright,walkin,production) FAIL khi insert
--     vào b2b_deals view (column not found)
--   - WalkinWizard không tạo được hộ nông dân vì b2b_partners view không có
--     nationality/national_id
--   - Daily price page 404 vì view không tồn tại
--   - DealDetailPage tab "Sản xuất" không hiện vì view không expose
--     purchase_type
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1 — Snapshot current state for audit
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  deal_cols INT;
  partner_cols INT;
  dp_exists BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO deal_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'b2b_deals';
  SELECT COUNT(*) INTO partner_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'b2b_partners';
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'b2b_daily_price_list'
  ) INTO dp_exists;
  RAISE NOTICE 'BEFORE: b2b_deals view = % cols, b2b_partners view = % cols, b2b_daily_price_list exists = %',
    deal_cols, partner_cols, dp_exists;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2 — Resync public.b2b_deals view
-- ════════════════════════════════════════════════════════════════════════════
-- Hiện thiếu 11 cột Intake v4: purchase_type, buyer_user_id, qc_user_id,
-- sample_drc, finished_product_kg, production_mode, production_pool_id,
-- production_sla_days, production_started_at, production_reject_reason,
-- reject_loss_amount

DROP VIEW IF EXISTS public.b2b_deals CASCADE;

CREATE VIEW public.b2b_deals
WITH (security_invoker = true)
AS SELECT * FROM b2b.deals;

GRANT SELECT ON public.b2b_deals TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.b2b_deals TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3 — Resync public.b2b_partners view
-- ════════════════════════════════════════════════════════════════════════════
-- Hiện thiếu: nationality, national_id (P4 migration), plus partner_type
-- check expanded để chấp nhận 'household'

DROP VIEW IF EXISTS public.b2b_partners CASCADE;

CREATE VIEW public.b2b_partners
WITH (security_invoker = true)
AS SELECT * FROM b2b.partners;

GRANT SELECT ON public.b2b_partners TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.b2b_partners TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4 — Create public.b2b_daily_price_list view (NEW)
-- ════════════════════════════════════════════════════════════════════════════
-- Table b2b.daily_price_list đã tồn tại (P5) nhưng chưa có public view nên
-- PostgREST không expose. WalkinWizardPage và DailyPriceListPage không thể
-- query qua REST.

DROP VIEW IF EXISTS public.b2b_daily_price_list CASCADE;

CREATE VIEW public.b2b_daily_price_list
WITH (security_invoker = true)
AS SELECT * FROM b2b.daily_price_list;

GRANT SELECT ON public.b2b_daily_price_list TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.b2b_daily_price_list TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5 — Recreate dependent views nếu DROP CASCADE đã xóa
-- ════════════════════════════════════════════════════════════════════════════
-- DROP VIEW ... CASCADE có thể xoá views khác phụ thuộc. Sau đây tái tạo
-- các view chuẩn theo memory b2b_portal_v2_status (12 base tables ở b2b
-- schema). Idempotent — chỉ recreate nếu base table tồn tại.

DO $$
DECLARE
  tbl TEXT;
  views_to_resync TEXT[] := ARRAY[
    'advances','settlements','drc_disputes','partner_ledger',
    'partner_users','chat_rooms','chat_messages','notifications',
    'deal_delivery_plans','acceptances','auctions'
  ];
BEGIN
  FOREACH tbl IN ARRAY views_to_resync LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'b2b' AND table_name = tbl
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = 'b2b_' || tbl
    ) THEN
      EXECUTE format(
        'CREATE VIEW public.b2b_%I WITH (security_invoker = true) AS SELECT * FROM b2b.%I',
        tbl, tbl
      );
      EXECUTE format('GRANT SELECT ON public.b2b_%I TO anon, authenticated', tbl);
      EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.b2b_%I TO authenticated', tbl);
      RAISE NOTICE 'Recreated public.b2b_%', tbl;
    END IF;
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 6 — NOTIFY PostgREST reload schema cache
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 7 — Verify
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  deal_cols INT;
  partner_cols INT;
  dp_exists BOOLEAN;
  has_purchase_type BOOLEAN;
  has_nationality BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO deal_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'b2b_deals';
  SELECT COUNT(*) INTO partner_cols FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'b2b_partners';
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'b2b_daily_price_list'
  ) INTO dp_exists;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'b2b_deals'
      AND column_name = 'purchase_type'
  ) INTO has_purchase_type;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'b2b_partners'
      AND column_name = 'nationality'
  ) INTO has_nationality;
  RAISE NOTICE 'AFTER: b2b_deals = % cols (purchase_type=%), b2b_partners = % cols (nationality=%), b2b_daily_price_list = %',
    deal_cols, has_purchase_type, partner_cols, has_nationality, dp_exists;

  IF NOT has_purchase_type THEN
    RAISE EXCEPTION 'FAIL: public.b2b_deals.purchase_type not exposed';
  END IF;
  IF NOT has_nationality THEN
    RAISE EXCEPTION 'FAIL: public.b2b_partners.nationality not exposed';
  END IF;
  IF NOT dp_exists THEN
    RAISE EXCEPTION 'FAIL: public.b2b_daily_price_list not created';
  END IF;
  RAISE NOTICE 'PASS — all 3 views resynced correctly';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (nếu cần)
-- ════════════════════════════════════════════════════════════════════════════
-- DROP VIEW IF EXISTS public.b2b_daily_price_list;
-- (b2b_deals + b2b_partners không thể rollback về schema cũ vì sẽ mất cột
--  Intake v4 — nếu rollback thì áp dụng b2b_intake_p1_purchase_type rollback)
