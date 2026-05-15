-- ============================================================
-- SALES CONTRACT WORKFLOW — V6: Auto-promote sales_orders.status
-- Ngày: 2026-05-14
-- Phụ thuộc: V1 (table) + V2/V3 (RLS) + V5 (WITH CHECK)
--
-- Mục đích: Khi Trung/Huy ký xong HĐ (sales_order_contracts.status='signed'),
-- tự động chuyển sales_orders.status từ 'draft' → 'confirmed' để:
--   - Bộ phận SX nhìn thấy đơn trong queue cần làm
--   - Logistics nhìn thấy đơn trong queue booking
--   - Cash flow forecast tính đơn này vào pipeline confirmed
--
-- Logic:
-- - Kích hoạt khi status chuyển sang 'signed' (KHÔNG trigger mọi UPDATE)
-- - Chỉ promote nếu sales_orders.status = 'draft' (idempotent, không override
--   các stage cao hơn như 'producing'/'shipped' nếu admin chỉnh tay)
-- - Update sales_orders.updated_at = NOW() để audit
-- - Trigger AFTER UPDATE → không block transaction; rollback nếu inner UPDATE fail
-- ============================================================

CREATE OR REPLACE FUNCTION fn_soc_promote_order_on_signed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_rows_updated INT;
BEGIN
  -- Chỉ kích hoạt khi status chuyển sang 'signed'
  IF NEW.status = 'signed' AND (OLD.status IS NULL OR OLD.status <> 'signed') THEN
    -- Promote sales_orders.status nếu đang 'draft' (idempotent)
    UPDATE sales_orders
       SET status = 'confirmed',
           updated_at = NOW()
     WHERE id = NEW.sales_order_id
       AND status = 'draft';

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    -- Log info (PostgreSQL log, không insert vào audit table)
    IF v_rows_updated > 0 THEN
      RAISE NOTICE 'Auto-promoted sales_orders(%): draft → confirmed sau khi contract % signed',
                   NEW.sales_order_id, NEW.id;
    ELSE
      RAISE NOTICE 'Skipped auto-promote sales_orders(%): không phải draft',
                   NEW.sales_order_id;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_soc_promote_order_on_signed ON sales_order_contracts;
CREATE TRIGGER trg_soc_promote_order_on_signed
  AFTER UPDATE OF status ON sales_order_contracts
  FOR EACH ROW
  EXECUTE FUNCTION fn_soc_promote_order_on_signed();

-- ============================================================
-- Verify
-- ============================================================
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'sales_order_contracts'
ORDER BY trigger_name;

-- Test thủ công (UNCOMMENT để test trong staging):
-- 1. Tạo order draft + contract approved trước
-- 2. Update contract → signed
-- UPDATE sales_order_contracts SET status='signed', signer_id=<uuid>, signed_pdf_url='test'
--   WHERE id=<contract_id>;
-- 3. Verify sales_orders.status đã chuyển 'confirmed':
-- SELECT id, status, updated_at FROM sales_orders WHERE id=<order_id>;
