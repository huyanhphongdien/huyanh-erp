-- ============================================================================
-- B2B SCHEMA AUDIT — read-only diagnostic
-- Mục đích: map đầy đủ kiến trúc 2 schemas (b2b vs public) để biết bảng nào
-- đang dùng, bảng nào lỗi thời, FK trỏ đâu, realtime publication có gì.
--
-- Chạy: paste vào Supabase SQL Editor (https://supabase.com/dashboard/project/dygveetaatqllhjusyzz/sql/new)
-- Bấm Run → copy toàn bộ kết quả 7 query gửi lại
-- ============================================================================

-- ── Q1: Tất cả objects (tables/views) trong schema 'b2b' ──
SELECT
  '── Q1: schema b2b ──' AS section;

SELECT
  c.relname AS object_name,
  CASE c.relkind
    WHEN 'r' THEN 'TABLE'
    WHEN 'v' THEN 'VIEW'
    WHEN 'm' THEN 'MATERIALIZED VIEW'
    WHEN 'f' THEN 'FOREIGN TABLE'
    ELSE c.relkind::text
  END AS kind,
  pg_catalog.obj_description(c.oid, 'pg_class') AS comment,
  CASE
    WHEN c.relkind = 'r' THEN (
      SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname = 'b2b' AND relname = c.relname
    )
    ELSE NULL
  END AS approx_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'b2b'
  AND c.relkind IN ('r','v','m','f')
ORDER BY kind, c.relname;

-- ── Q2: Tất cả objects trong schema 'public' bắt đầu bằng 'b2b_' hoặc tên liên quan ──
SELECT
  '── Q2: schema public — b2b_* + deals + rubber_intake_batches + supplier_offers ──' AS section;

SELECT
  c.relname AS object_name,
  CASE c.relkind
    WHEN 'r' THEN 'TABLE'
    WHEN 'v' THEN 'VIEW'
    WHEN 'm' THEN 'MATERIALIZED VIEW'
    ELSE c.relkind::text
  END AS kind,
  CASE
    WHEN c.relkind = 'r' THEN (
      SELECT n_live_tup FROM pg_stat_user_tables WHERE schemaname = 'public' AND relname = c.relname
    )
    ELSE NULL
  END AS approx_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND (
    c.relname LIKE 'b2b_%'
    OR c.relname IN ('deals', 'rubber_intake_batches', 'supplier_offers', 'partners', 'demands')
  )
  AND c.relkind IN ('r','v','m')
ORDER BY kind, c.relname;

-- ── Q3: Định nghĩa các view 'b2b_*' trong public — xem chúng map qua bảng nào ──
SELECT
  '── Q3: definition of public views ──' AS section;

SELECT
  table_name,
  pg_catalog.pg_get_viewdef(format('public.%I', table_name)::regclass, true) AS view_definition
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name LIKE 'b2b_%'
ORDER BY table_name;

-- ── Q4: Tất cả FK constraints liên quan đến deals/offers/intakes/partners ──
SELECT
  '── Q4: FK constraints ──' AS section;

SELECT
  tc.table_schema || '.' || tc.table_name AS source_table,
  kcu.column_name AS source_column,
  '→' AS arrow,
  ccu.table_schema || '.' || ccu.table_name AS target_table,
  ccu.column_name AS target_column,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND (
    tc.table_name IN ('deals', 'b2b_deals', 'supplier_offers', 'b2b_demand_offers',
                      'demand_offers', 'partners', 'b2b_partners', 'rubber_intake_batches',
                      'b2b_demands', 'demands', 'b2b_chat_rooms', 'chat_rooms',
                      'b2b_chat_messages', 'chat_messages', 'b2b_advances', 'advances',
                      'b2b_settlements', 'settlements')
    OR ccu.table_name IN ('deals', 'b2b_deals', 'supplier_offers', 'b2b_demand_offers',
                          'demand_offers', 'partners', 'b2b_partners', 'rubber_intake_batches',
                          'b2b_demands', 'demands')
  )
ORDER BY tc.table_schema, tc.table_name, kcu.column_name;

-- ── Q5: CHECK constraints liên quan đến status/enum trên các bảng B2B ──
SELECT
  '── Q5: CHECK constraints (status enums) ──' AS section;

SELECT
  con.conrelid::regclass::text AS table_name,
  con.conname AS constraint_name,
  pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE con.contype = 'c'
  AND (n.nspname = 'b2b' OR (n.nspname = 'public' AND c.relname IN (
    'deals', 'b2b_deals', 'supplier_offers', 'b2b_demand_offers',
    'demand_offers', 'b2b_demands', 'demands', 'b2b_advances', 'b2b_settlements'
  )))
ORDER BY n.nspname, c.relname;

-- ── Q6: Realtime publication — bảng nào được broadcast ──
SELECT
  '── Q6: supabase_realtime publication ──' AS section;

SELECT
  schemaname,
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND (
    schemaname = 'b2b'
    OR (schemaname = 'public' AND (tablename LIKE 'b2b_%' OR tablename IN ('deals','partners','demands','rubber_intake_batches')))
  )
ORDER BY schemaname, tablename;

-- ── Q7: Row counts so sánh — các cặp bảng nghi ngờ ──
SELECT
  '── Q7: row counts comparison ──' AS section;

SELECT 'b2b.partners' AS tbl,
  (SELECT COUNT(*) FROM b2b.partners) AS n
UNION ALL SELECT 'public.b2b_partners',
  (SELECT COUNT(*) FROM public.b2b_partners)
UNION ALL SELECT 'b2b.supplier_offers',
  (SELECT COUNT(*) FROM b2b.supplier_offers)
UNION ALL SELECT 'public.b2b_demand_offers',
  (SELECT COUNT(*) FROM public.b2b_demand_offers)
UNION ALL SELECT 'public.deals',
  (SELECT COUNT(*) FROM public.deals)
UNION ALL SELECT 'public.b2b_deals',
  (SELECT COUNT(*) FROM public.b2b_deals)
UNION ALL SELECT 'b2b.chat_messages',
  (SELECT COUNT(*) FROM b2b.chat_messages)
UNION ALL SELECT 'public.b2b_chat_messages',
  (SELECT COUNT(*) FROM public.b2b_chat_messages);
