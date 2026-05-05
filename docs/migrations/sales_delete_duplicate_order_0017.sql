-- ============================================================================
-- One-shot: xóa đơn duplicate SO-2026-0017 (HA20260030 trùng nhau)
-- Date: 2026-05-05
-- Per yêu cầu user 2026-05-05
-- ============================================================================
--
-- VẤN ĐỀ:
--   2 đơn cùng contract_no=HA20260030, customer=VITRY, qty=39.36t, $85K:
--     - SO-2026-0002, status=paid, items=RSS_1+SVR_3L, created 2026-04-07
--     - SO-2026-0017, status=draft, items=RSS_3+SVR_3L, created 2026-04-20
--                                                                ↑ XÓA NÀY
--   → SO-2026-0017 là tạo nhầm/trùng → user quyết xóa
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 0: Verify đơn tồn tại + vẫn ở status='draft' (an toàn)
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  id, code, contract_no, status, current_stage,
  customer_id, grade, total_value_usd, created_at
FROM sales_orders
WHERE code = 'SO-2026-0017';
-- Mong đợi: 1 row, status='draft'

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: Đếm related records sắp xóa
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_order_id UUID;
  v_status TEXT;
  v_items INT;
  v_handoffs INT;
  v_containers INT;
  v_docs INT;
  v_invoices INT;
BEGIN
  SELECT id, status INTO v_order_id, v_status
  FROM sales_orders WHERE code = 'SO-2026-0017';

  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Don SO-2026-0017 khong ton tai - skip';
    RETURN;
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Don SO-2026-0017 dang o status=% (khong phai draft) - HUY xoa de an toan. Lien he admin neu chac chan muon xoa.', v_status;
  END IF;

  SELECT COUNT(*) INTO v_items FROM sales_order_items WHERE sales_order_id = v_order_id;
  SELECT COUNT(*) INTO v_handoffs FROM sales_order_handoffs WHERE sales_order_id = v_order_id;
  SELECT COUNT(*) INTO v_containers FROM sales_order_containers WHERE sales_order_id = v_order_id;
  SELECT COUNT(*) INTO v_docs FROM sales_order_documents WHERE sales_order_id = v_order_id;
  SELECT COUNT(*) INTO v_invoices FROM sales_invoices WHERE sales_order_id = v_order_id;

  RAISE NOTICE 'Sap xoa SO-2026-0017 (id=%):', v_order_id;
  RAISE NOTICE '  - Items:      %', v_items;
  RAISE NOTICE '  - Handoffs:   %', v_handoffs;
  RAISE NOTICE '  - Containers: %', v_containers;
  RAISE NOTICE '  - Documents:  %', v_docs;
  RAISE NOTICE '  - Invoices:   %', v_invoices;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: HARD DELETE theo thứ tự FK
-- ════════════════════════════════════════════════════════════════════════════

DELETE FROM sales_order_handoffs
WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE code = 'SO-2026-0017');

DELETE FROM sales_invoices
WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE code = 'SO-2026-0017');

DELETE FROM sales_order_items
WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE code = 'SO-2026-0017');

DELETE FROM sales_order_containers
WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE code = 'SO-2026-0017');

DELETE FROM sales_order_documents
WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE code = 'SO-2026-0017');

DELETE FROM sales_order_stock_allocations
WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE code = 'SO-2026-0017');

-- Main delete (chỉ xóa nếu vẫn ở draft — safety)
DELETE FROM sales_orders WHERE code = 'SO-2026-0017' AND status = 'draft';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: Verify
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

SELECT COUNT(*) AS still_exists FROM sales_orders WHERE code = 'SO-2026-0017';
-- Mong đợi: 0

-- Sau khi xóa, contract_no=HA20260030 chỉ còn SO-2026-0002 (paid)
SELECT id, code, status, grade FROM sales_orders WHERE contract_no = 'HA20260030';
-- Mong đợi: 1 row, SO-2026-0002 paid
