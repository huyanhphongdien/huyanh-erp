-- ============================================================================
-- B2B Migration Phase 3 — Drop dead tables
-- Drop 14 objects (2 views + 12 tables) đã chết, 0 rows, 0 code refs
-- Đã verify: không còn FK nào trỏ vào các bảng này (sau migration phase 1)
-- ============================================================================

BEGIN;

-- ── PRE-CHECK 1: Verify tất cả bảng cần drop đều 0 rows ──
DO $$
DECLARE
  cnt int;
  tbl text;
BEGIN
  FOR tbl IN VALUES
    ('supplier_offers'),('purchase_demands'),('quotations'),('demand_invitations'),
    ('intake_records'),('intake_sessions'),('intake_disputes'),('intake_logs'),
    ('production_schedules'),('production_slots'),('slot_bookings'),('supervisor_checkins')
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM b2b.%I', tbl) INTO cnt;
    IF cnt > 0 THEN
      RAISE EXCEPTION 'Table b2b.% has % rows — refuse to drop', tbl, cnt;
    END IF;
  END LOOP;
END $$;

-- ── PRE-CHECK 2: Verify không còn FK external nào trỏ vào dead tables ──
-- 8 FK internal (dead→dead) sẽ tự drop bằng CASCADE bên dưới.
-- 1 FK external từ b2b.auctions (KEEP) → drop trước.
DO $$
DECLARE
  bad_fks text[];
  rec record;
  dead_tbls text[] := ARRAY[
    'supplier_offers','purchase_demands','quotations','demand_invitations',
    'intake_records','intake_sessions','intake_disputes','intake_logs',
    'production_schedules','production_slots','slot_bookings','supervisor_checkins'
  ];
BEGIN
  -- Tìm FK mà SOURCE table KHÔNG nằm trong dead list (=external)
  FOR rec IN
    SELECT
      tc.table_schema || '.' || tc.table_name AS source,
      tc.constraint_name AS cn,
      ccu.table_name AS target
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'b2b'
      AND ccu.table_name = ANY(dead_tbls)
      AND NOT (tc.table_schema = 'b2b' AND tc.table_name = ANY(dead_tbls))
  LOOP
    bad_fks := array_append(bad_fks, format('%s.%s → %s', rec.source, rec.cn, rec.target));
  END LOOP;

  IF array_length(bad_fks, 1) > 0 THEN
    RAISE NOTICE 'External FKs found (will drop explicitly): %', bad_fks;
  END IF;
END $$;

-- ── DROP external FK trước (b2b.auctions.demand_id → purchase_demands) ──
ALTER TABLE b2b.auctions DROP CONSTRAINT IF EXISTS auctions_demand_id_fkey;

-- ============================================================================
-- DROP public views first (chúng SELECT từ b2b tables, phải drop trước)
-- ============================================================================

DROP VIEW IF EXISTS public.b2b_supplier_offers;
DROP VIEW IF EXISTS public.b2b_purchase_demands;

-- ============================================================================
-- DROP b2b tables — dùng CASCADE để auto-drop 8 FK internal giữa các bảng dead
-- (intake_disputes→intake_logs/sessions, slot_bookings→production_slots,
--  demand_invitations→purchase_demands/quotations, quotations→purchase_demands,
--  quotations.parent_quotation_id self-ref)
-- ============================================================================

-- Intake module
DROP TABLE IF EXISTS b2b.intake_disputes CASCADE;
DROP TABLE IF EXISTS b2b.intake_logs CASCADE;
DROP TABLE IF EXISTS b2b.intake_sessions CASCADE;
DROP TABLE IF EXISTS b2b.intake_records CASCADE;

-- Production scheduling (chưa dùng)
DROP TABLE IF EXISTS b2b.slot_bookings CASCADE;
DROP TABLE IF EXISTS b2b.production_slots CASCADE;
DROP TABLE IF EXISTS b2b.production_schedules CASCADE;

-- Supervisor + invitation (chưa dùng)
DROP TABLE IF EXISTS b2b.supervisor_checkins CASCADE;
DROP TABLE IF EXISTS b2b.demand_invitations CASCADE;

-- Old demand/offer/quotation flow (đã thay bằng public.b2b_demands + b2b_demand_offers)
DROP TABLE IF EXISTS b2b.quotations CASCADE;
DROP TABLE IF EXISTS b2b.supplier_offers CASCADE;
DROP TABLE IF EXISTS b2b.purchase_demands CASCADE;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY: list các bảng còn lại trong schema b2b
-- ============================================================================

SELECT
  c.relname AS object_name,
  CASE c.relkind WHEN 'r' THEN 'TABLE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MAT VIEW' END AS kind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'b2b'
  AND c.relkind IN ('r','v','m')
ORDER BY kind, c.relname;
