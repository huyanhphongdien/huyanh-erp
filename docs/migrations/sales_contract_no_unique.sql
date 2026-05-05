-- ============================================================================
-- Sales — UNIQUE constraint trên contract_no (đơn active)
-- Date: 2026-05-05
-- ============================================================================
--
-- VẤN ĐỀ:
--   2 đơn HA20260030 trùng contract_no (SO-2026-0002 paid + SO-2026-0017 draft
--   đã xóa). Không có constraint nên user có thể tạo trùng mãi.
--
-- GIẢI PHÁP:
--   Partial UNIQUE INDEX trên (contract_no) WHERE status <> 'cancelled'.
--   Loại cancelled vì đơn hủy giữ làm history, có thể có contract_no
--   reused sang đơn mới.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: Check trùng hiện tại (phải = 0 sau khi xóa SO-2026-0017)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r RECORD;
  v_dups INT := 0;
BEGIN
  FOR r IN
    SELECT contract_no, COUNT(*) AS num
    FROM sales_orders
    WHERE contract_no IS NOT NULL
      AND status <> 'cancelled'
    GROUP BY contract_no
    HAVING COUNT(*) > 1
  LOOP
    v_dups := v_dups + 1;
    RAISE NOTICE 'Trung: contract_no=%, num=%', r.contract_no, r.num;
  END LOOP;

  IF v_dups > 0 THEN
    RAISE EXCEPTION 'Co % contract_no bi trung. Phai xoa/sua truoc khi add UNIQUE constraint.', v_dups;
  ELSE
    RAISE NOTICE 'OK - khong co contract_no nao trung trong don active';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Tạo partial UNIQUE INDEX
-- ════════════════════════════════════════════════════════════════════════════
DROP INDEX IF EXISTS ux_sales_orders_contract_no_active;

CREATE UNIQUE INDEX ux_sales_orders_contract_no_active
  ON sales_orders(contract_no)
  WHERE contract_no IS NOT NULL
    AND status <> 'cancelled';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: NOTIFY + VERIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'sales_orders'
  AND indexname = 'ux_sales_orders_contract_no_active';
-- Mong đợi: 1 row với CREATE UNIQUE INDEX ... WHERE ...

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- DROP INDEX ux_sales_orders_contract_no_active;
