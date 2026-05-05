-- ============================================================================
-- Sales — HARD DELETE tất cả đơn cancelled
-- Date: 2026-05-05
-- Per yêu cầu user: "xóa những đơn đã hủy đi"
-- ============================================================================
--
-- AN TOÀN:
--   - Xóa theo thứ tự FK: handoffs, invoices, items, containers, docs → orders
--   - SHOW đơn sắp xóa TRƯỚC khi DELETE để user có thể abort
--   - Verify count sau xóa
--   - Đơn hủy thường không có invoice/container/handoff (vì cancelled trước
--     khi đi xa) nên DELETE chủ yếu trên orders + items
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 0: SHOW đơn sắp xóa (preview — KHÔNG xóa)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r RECORD;
  v_total INT := 0;
BEGIN
  RAISE NOTICE '=== ĐƠN SẮP XÓA ===';
  FOR r IN
    SELECT code, contract_no, total_value_usd,
           internal_notes, created_at::DATE AS dt
    FROM sales_orders
    WHERE status = 'cancelled'
    ORDER BY created_at
  LOOP
    v_total := v_total + 1;
    RAISE NOTICE '%. %  HD=%  $%  ngay=%  ly_do=%',
      v_total, r.code, COALESCE(r.contract_no, '-'),
      COALESCE(r.total_value_usd::TEXT, '0'),
      r.dt,
      LEFT(COALESCE(r.internal_notes, '-'), 60);
  END LOOP;
  RAISE NOTICE '------ Tong: % don ------', v_total;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: HARD DELETE theo thứ tự FK
-- ════════════════════════════════════════════════════════════════════════════

-- 1a. Handoff log (Sprint 1 — sales_order_handoffs)
DELETE FROM sales_order_handoffs
WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE status = 'cancelled');

-- 1b. Invoices
DELETE FROM sales_invoices
WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE status = 'cancelled');

-- 1c. Items (multi-product)
DELETE FROM sales_order_items
WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE status = 'cancelled');

-- 1d. Containers
DELETE FROM sales_order_containers
WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE status = 'cancelled');

-- 1e. Documents (COA, PL, BL, etc.)
DELETE FROM sales_order_documents
WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE status = 'cancelled');

-- 1f. Stock allocations (MTS) — FK tới sales_orders
DELETE FROM sales_order_stock_allocations
WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE status = 'cancelled');

-- 1g. Payments (nếu có FK)
-- DELETE FROM sales_order_payments
-- WHERE sales_order_id IN (SELECT id FROM sales_orders WHERE status = 'cancelled');
-- (Uncomment nếu bảng tồn tại)

-- 1h. ★ MAIN: Xóa orders cancelled
DELETE FROM sales_orders WHERE status = 'cancelled';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: NOTIFY + VERIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

DO $$
DECLARE
  v_remaining INT;
  v_total INT;
BEGIN
  SELECT COUNT(*) INTO v_remaining FROM sales_orders WHERE status = 'cancelled';
  SELECT COUNT(*) INTO v_total FROM sales_orders;
  RAISE NOTICE '=== KET QUA ===';
  RAISE NOTICE 'Don cancelled con lai: %  (mong doi: 0)', v_remaining;
  RAISE NOTICE 'Tong don trong DB:     %', v_total;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: Không thể (đã hard delete). Cần restore từ backup nếu cần.
-- ════════════════════════════════════════════════════════════════════════════
