-- ============================================================================
-- V13 — Multi-select KG/bành cho sales_order_items
-- Date: 2026-05-20
-- ============================================================================
--
-- Use case: HĐ thương mại đôi khi chấp nhận 2 quy cách KG/bành (33.33 + 35)
-- để Sale linh động khi giao hàng. Có hàng 33.33 → đi 33.33; không có → đi 35.
-- Phú LV xem queue thấy "Linh động" thay vì 1 con số cứng.
--
-- Strategy:
--  - Thêm cột `bale_weights_kg numeric[]` lưu mảng các giá trị (1-2 phần tử)
--  - GIỮ `bale_weight_kg` cũ — auto sync = bale_weights_kg[1] (primary, cho
--    legacy code tính tổng bành/cont theo phần tử đầu)
--  - Backfill: bale_weights_kg = ARRAY[bale_weight_kg] cho data cũ
-- ============================================================================

-- Step 1: Add column array
ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS bale_weights_kg NUMERIC[] NOT NULL
    DEFAULT ARRAY[35]::NUMERIC[];

COMMENT ON COLUMN public.sales_order_items.bale_weights_kg IS
  'Array tối đa 2 giá trị KG/bành chấp nhận trong HĐ (vd [33.33, 35] = linh động). bale_weight_kg legacy = bale_weights_kg[1].';

-- Step 2: Backfill từ bale_weight_kg cũ (nếu khác default)
UPDATE public.sales_order_items
   SET bale_weights_kg = ARRAY[bale_weight_kg]::NUMERIC[]
 WHERE bale_weight_kg IS NOT NULL
   AND (bale_weights_kg IS NULL OR bale_weights_kg = ARRAY[35]::NUMERIC[]);

-- Step 3: CHECK constraint — chỉ cho phép 1 hoặc 2 giá trị
ALTER TABLE public.sales_order_items
  DROP CONSTRAINT IF EXISTS chk_soi_bale_weights_count;
ALTER TABLE public.sales_order_items
  ADD CONSTRAINT chk_soi_bale_weights_count
  CHECK (array_length(bale_weights_kg, 1) BETWEEN 1 AND 2);

-- Step 4: NOTIFY PostgREST reload
NOTIFY pgrst, 'reload schema';

-- Step 5: Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sales_order_items'
  AND column_name IN ('bale_weight_kg', 'bale_weights_kg');

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- ALTER TABLE public.sales_order_items
--   DROP CONSTRAINT IF EXISTS chk_soi_bale_weights_count,
--   DROP COLUMN IF EXISTS bale_weights_kg;
-- NOTIFY pgrst, 'reload schema';
