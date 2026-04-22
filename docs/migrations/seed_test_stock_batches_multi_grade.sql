-- ============================================================================
-- SEED 18 test batches — đa grade + đa DRC cho test SalesOrder allocation
-- Chạy trong Supabase Dashboard > SQL Editor
-- Idempotent: DELETE trước khi INSERT theo pattern batch_no 'TP-SEED-%'
-- ============================================================================
-- Grades phủ 5 loại phổ biến: SVR_3L, SVR_10, SVR_5, SVR_CV60, RSS_1, RSS_3
-- DRC: 95 / 96 / 97 / 98 / 99 (đa dạng)
-- Qty: 50.000 / 80.000 / 100.000 / 150.000 kg (đa dạng cho test FIFO)
-- Tất cả: qc_status=passed, status=active, batch_type=production, warehouse=KHO-A
-- ============================================================================

BEGIN;

-- 1. Cleanup batches seed cũ (nếu rerun)
DELETE FROM public.sales_order_container_items
WHERE batch_id IN (SELECT id FROM public.stock_batches WHERE batch_no LIKE 'TP-SEED-%');

DELETE FROM public.sales_order_stock_allocations
WHERE stock_batch_id IN (SELECT id FROM public.stock_batches WHERE batch_no LIKE 'TP-SEED-%');

DELETE FROM public.stock_batches WHERE batch_no LIKE 'TP-SEED-%';

-- 2. Seed 18 batches đa grade / DRC / qty
INSERT INTO public.stock_batches (
  batch_no, material_id, warehouse_id, rubber_grade,
  quantity_remaining, initial_quantity, unit,
  current_weight, initial_weight,
  latest_drc, initial_drc, qc_status, last_qc_date,
  status, batch_type, received_date
)
SELECT
  'TP-SEED-' || grade || '-' || LPAD(idx::text, 2, '0') AS batch_no,
  (SELECT id FROM public.materials
     WHERE id = 'f2d64027-5514-44fb-be85-e090bc6b44d8') AS material_id,
  (SELECT id FROM public.warehouses WHERE code = 'KHO-A') AS warehouse_id,
  grade AS rubber_grade,
  qty AS quantity_remaining,
  qty AS initial_quantity,
  'kg' AS unit,
  qty AS current_weight,
  qty AS initial_weight,
  drc AS latest_drc,
  drc AS initial_drc,
  'passed' AS qc_status,
  CURRENT_DATE - (idx * 2)::int AS last_qc_date,
  'active' AS status,
  'production' AS batch_type,
  CURRENT_DATE - (idx * 3)::int AS received_date
FROM (VALUES
  -- SVR_3L: 4 batch, DRC 95-99, qty đa dạng
  ('SVR_3L',  1, 95.0,  50000),
  ('SVR_3L',  2, 96.0,  80000),
  ('SVR_3L',  3, 97.0, 100000),
  ('SVR_3L',  4, 98.5, 150000),

  -- SVR_10: 4 batch, DRC 96-99
  ('SVR_10',  5, 96.0,  50000),
  ('SVR_10',  6, 97.5,  80000),
  ('SVR_10',  7, 98.0, 100000),
  ('SVR_10',  8, 99.0, 150000),

  -- SVR_5: 3 batch
  ('SVR_5',   9, 95.5,  60000),
  ('SVR_5',  10, 97.0, 100000),
  ('SVR_5',  11, 98.0, 120000),

  -- SVR_CV60: 2 batch (Constant Viscosity)
  ('SVR_CV60', 12, 96.5,  80000),
  ('SVR_CV60', 13, 98.0, 120000),

  -- RSS_1: 2 batch (Ribbed Smoked Sheet)
  ('RSS_1',  14, 97.0, 100000),
  ('RSS_1',  15, 98.5,  80000),

  -- RSS_3: 3 batch
  ('RSS_3',  16, 95.0,  50000),
  ('RSS_3',  17, 97.0, 100000),
  ('RSS_3',  18, 98.0, 150000)
) AS t(grade, idx, drc, qty);

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════

-- Tổng số batch seed + tổng kg theo grade
SELECT rubber_grade,
       COUNT(*) AS lots,
       SUM(quantity_remaining)::int AS tong_kg,
       ROUND(SUM(quantity_remaining)/1000, 1) || ' tấn' AS tong_ton,
       MIN(latest_drc) AS drc_min,
       MAX(latest_drc) AS drc_max
FROM public.stock_batches
WHERE batch_no LIKE 'TP-SEED-%'
GROUP BY rubber_grade
ORDER BY rubber_grade;

-- Expected:
-- RSS_1     2 lots  180.000 kg  180 tấn  DRC 97-98.5
-- RSS_3     3 lots  300.000 kg  300 tấn  DRC 95-98
-- SVR_10    4 lots  380.000 kg  380 tấn  DRC 96-99
-- SVR_3L    4 lots  380.000 kg  380 tấn  DRC 95-98.5
-- SVR_5     3 lots  280.000 kg  280 tấn  DRC 95.5-98
-- SVR_CV60  2 lots  200.000 kg  200 tấn  DRC 96.5-98

NOTIFY pgrst, 'reload schema';
