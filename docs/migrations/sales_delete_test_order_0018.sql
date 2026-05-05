-- ============================================================================
-- One-shot: xóa đơn test SO-2026-0018 (KH-TEST-01) theo yêu cầu user 2026-05-05
-- Customer: KH-TEST-01, Grade: SVR_3L, Value: $30K, Stage: qc
-- ============================================================================
-- AN TOÀN: Xóa theo thứ tự FK (handoffs, invoices, items, containers, docs, order)
--          + verify trước/sau bằng SELECT COUNT
-- ============================================================================

-- ── STEP 0: Verify đơn tồn tại + lấy thông tin ──
SELECT
  id, code, status, current_stage,
  customer_id, grade, total_value_usd
FROM sales_orders
WHERE code = 'SO-2026-0018';

-- ── STEP 1: Đếm related records để biết sẽ xóa bao nhiêu ──
DO $$
DECLARE
  v_order_id UUID;
  v_items INT;
  v_containers INT;
  v_handoffs INT;
  v_docs INT;
  v_invoices INT;
BEGIN
  SELECT id INTO v_order_id FROM sales_orders WHERE code = 'SO-2026-0018';
  IF v_order_id IS NULL THEN
    RAISE NOTICE 'Đơn SO-2026-0018 không tồn tại — không cần xóa';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_items FROM sales_order_items WHERE sales_order_id = v_order_id;
  SELECT COUNT(*) INTO v_containers FROM sales_order_containers WHERE sales_order_id = v_order_id;
  SELECT COUNT(*) INTO v_handoffs FROM sales_order_handoffs WHERE sales_order_id = v_order_id;
  SELECT COUNT(*) INTO v_docs FROM sales_order_documents WHERE sales_order_id = v_order_id;
  SELECT COUNT(*) INTO v_invoices FROM sales_invoices WHERE sales_order_id = v_order_id;

  RAISE NOTICE 'Sắp xóa đơn % với:', v_order_id;
  RAISE NOTICE '  - Items: %', v_items;
  RAISE NOTICE '  - Containers: %', v_containers;
  RAISE NOTICE '  - Handoffs: %', v_handoffs;
  RAISE NOTICE '  - Documents: %', v_docs;
  RAISE NOTICE '  - Invoices: %', v_invoices;
END $$;

-- ── STEP 2: HARD DELETE theo thứ tự FK ──
DELETE FROM sales_order_handoffs WHERE sales_order_id IN
  (SELECT id FROM sales_orders WHERE code = 'SO-2026-0018');
DELETE FROM sales_invoices WHERE sales_order_id IN
  (SELECT id FROM sales_orders WHERE code = 'SO-2026-0018');
DELETE FROM sales_order_items WHERE sales_order_id IN
  (SELECT id FROM sales_orders WHERE code = 'SO-2026-0018');
DELETE FROM sales_order_containers WHERE sales_order_id IN
  (SELECT id FROM sales_orders WHERE code = 'SO-2026-0018');
DELETE FROM sales_order_documents WHERE sales_order_id IN
  (SELECT id FROM sales_orders WHERE code = 'SO-2026-0018');
DELETE FROM sales_orders WHERE code = 'SO-2026-0018';

-- ── STEP 3: Verify ──
SELECT COUNT(*) AS still_exists FROM sales_orders WHERE code = 'SO-2026-0018';
-- Mong đợi: 0
