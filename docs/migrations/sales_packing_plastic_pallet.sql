-- ============================================================================
-- ADD plastic_pallet vào packing_type enum
-- Date: 2026-05-17
-- Lý do: Sale (Lê Phương Anh) yêu cầu thêm option "Plastic Pallet" trong dropdown
-- ============================================================================

-- Step 1: Drop constraint cũ
ALTER TABLE public.sales_orders
  DROP CONSTRAINT IF EXISTS chk_sales_orders_packing_type;

-- Step 2: Add constraint mới có plastic_pallet
ALTER TABLE public.sales_orders
  ADD CONSTRAINT chk_sales_orders_packing_type
  CHECK (packing_type IN (
    'loose_bale','sw_pallet','wooden_pallet','plastic_pallet','metal_box',
    'bale','bag','drum','bulk','pallet'
  ));

-- Step 3: Verify (test insert giá trị mới — phải PASS)
-- INSERT chỉ để verify, rollback ngay
-- DO $$
-- DECLARE test_id UUID;
-- BEGIN
--   INSERT INTO sales_orders (code, status, packing_type, customer_id)
--   VALUES ('TEST_PLASTIC', 'draft', 'plastic_pallet',
--           (SELECT id FROM sales_customers LIMIT 1))
--   RETURNING id INTO test_id;
--   RAISE NOTICE 'OK: plastic_pallet accepted, id=%', test_id;
--   DELETE FROM sales_orders WHERE id = test_id;
-- END $$;

-- ROLLBACK (nếu cần):
-- ALTER TABLE public.sales_orders DROP CONSTRAINT chk_sales_orders_packing_type;
-- ALTER TABLE public.sales_orders ADD CONSTRAINT chk_sales_orders_packing_type
--   CHECK (packing_type IN ('loose_bale','sw_pallet','wooden_pallet','bale','bag','drum','bulk','pallet'));
