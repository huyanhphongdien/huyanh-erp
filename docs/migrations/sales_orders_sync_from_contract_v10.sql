-- ============================================================
-- SALES ORDERS — V10: Auto-sync form_data → sales_orders khi HĐ ký
-- Ngày: 2026-05-17
-- Phụ thuộc:
--   - sales_contract_workflow_v6_auto_promote.sql (V6 — auto promote status)
--   - sales_contract_workflow_v9_signer_confirm.sql (V9)
--
-- Mục đích:
--   Sau khi HĐ approved (Phú LV chốt bank info), tự động COPY data từ
--   sales_order_contracts.form_data → sales_orders để các bước tiếp theo
--   (Finance, Shipping, Accounting) đọc thẳng từ sales_orders, KHÔNG phải
--   nhập lại.
--
-- Data sync:
--   • bank_account_name → sales_orders.bank_name (override legacy column)
--   • bank_account_no   → sales_orders.bank_account
--   • bank_full_name    → sales_orders.bank_full_name (NEW column)
--   • bank_address      → sales_orders.bank_address (NEW column)
--   • bank_swift        → sales_orders.bank_swift
--   • extra_terms       → APPEND vào sales_orders.notes (nếu chưa có)
--   • buyer_phone       → UPDATE sales_customers.phone (nếu customer thiếu)
-- ============================================================

-- ── Step 1: ADD 2 cột mới cho sales_orders ──
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS bank_full_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_address TEXT;

COMMENT ON COLUMN sales_orders.bank_full_name IS
  'Tên đầy đủ bank (English, cho L/C). Auto-sync từ sales_order_contracts.form_data.bank_full_name khi HĐ approved.';
COMMENT ON COLUMN sales_orders.bank_address IS
  'Địa chỉ chi nhánh bank. Auto-sync từ form_data.bank_address.';

-- ── Step 2: Trigger function ──
CREATE OR REPLACE FUNCTION fn_soc_sync_to_sales_order()
RETURNS TRIGGER AS $$
DECLARE
  v_form JSONB;
  v_extra TEXT;
  v_phone TEXT;
  v_customer_id UUID;
BEGIN
  -- CHỈ fire khi status chuyển sang 'approved' hoặc 'signed'
  -- (Phú LV duyệt → bank chốt → có thể sync; markSigned → final safety net)
  IF NEW.status NOT IN ('approved', 'signed') THEN
    RETURN NEW;
  END IF;

  -- Skip nếu status không đổi (tránh fire khi update field khác)
  IF OLD.status = NEW.status AND OLD.form_data IS NOT DISTINCT FROM NEW.form_data THEN
    RETURN NEW;
  END IF;

  v_form := NEW.form_data;
  IF v_form IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sync bank info (5 fields) — chỉ ghi đè nếu form_data có giá trị
  UPDATE sales_orders so
     SET bank_name      = COALESCE(NULLIF(v_form->>'bank_account_name', ''), so.bank_name),
         bank_account   = COALESCE(NULLIF(v_form->>'bank_account_no', ''),   so.bank_account),
         bank_full_name = COALESCE(NULLIF(v_form->>'bank_full_name', ''),    so.bank_full_name),
         bank_address   = COALESCE(NULLIF(v_form->>'bank_address', ''),      so.bank_address),
         bank_swift     = COALESCE(NULLIF(v_form->>'bank_swift', ''),        so.bank_swift),
         updated_at     = NOW()
   WHERE so.id = NEW.sales_order_id;

  -- Append extra_terms vào notes (nếu form_data có, chưa append rồi)
  v_extra := NULLIF(TRIM(v_form->>'extra_terms'), '');
  IF v_extra IS NOT NULL THEN
    UPDATE sales_orders so
       SET notes = CASE
             WHEN so.notes IS NULL OR so.notes = '' THEN '[HĐ Other Conditions] ' || v_extra
             WHEN so.notes ILIKE '%' || v_extra || '%' THEN so.notes  -- đã có, skip
             ELSE so.notes || E'\n[HĐ Other Conditions] ' || v_extra
           END,
           updated_at = NOW()
     WHERE so.id = NEW.sales_order_id;
  END IF;

  -- Backfill customer phone nếu form_data có + customer chưa có
  v_phone := NULLIF(TRIM(v_form->>'buyer_phone'), '');
  IF v_phone IS NOT NULL THEN
    SELECT customer_id INTO v_customer_id FROM sales_orders WHERE id = NEW.sales_order_id;
    IF v_customer_id IS NOT NULL THEN
      UPDATE sales_customers
         SET phone = v_phone,
             updated_at = NOW()
       WHERE id = v_customer_id
         AND (phone IS NULL OR TRIM(phone) = '');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Step 3: Trigger ──
DROP TRIGGER IF EXISTS trg_soc_sync_to_sales_order ON sales_order_contracts;
CREATE TRIGGER trg_soc_sync_to_sales_order
AFTER UPDATE OF status, form_data ON sales_order_contracts
FOR EACH ROW
EXECUTE FUNCTION fn_soc_sync_to_sales_order();

-- ── Step 4: BACKFILL — sync data cho các HĐ đã approved/signed từ trước ──
-- Lặp qua từng HĐ approved/signed, lấy form_data → update sales_orders
DO $$
DECLARE
  r RECORD;
  cnt INT := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (sales_order_id) sales_order_id, form_data
    FROM sales_order_contracts
    WHERE status IN ('approved', 'signed', 'archived')
      AND form_data IS NOT NULL
    ORDER BY sales_order_id, revision_no DESC  -- lấy latest revision
  LOOP
    UPDATE sales_orders
       SET bank_name      = COALESCE(NULLIF(r.form_data->>'bank_account_name', ''), bank_name),
           bank_account   = COALESCE(NULLIF(r.form_data->>'bank_account_no', ''),   bank_account),
           bank_full_name = COALESCE(NULLIF(r.form_data->>'bank_full_name', ''),    bank_full_name),
           bank_address   = COALESCE(NULLIF(r.form_data->>'bank_address', ''),      bank_address),
           bank_swift     = COALESCE(NULLIF(r.form_data->>'bank_swift', ''),        bank_swift),
           updated_at     = NOW()
     WHERE id = r.sales_order_id;
    cnt := cnt + 1;
  END LOOP;
  RAISE NOTICE 'Backfilled bank info for % sales orders', cnt;
END $$;

-- ── Step 5: Verify ──
SELECT
  so.code,
  so.contract_no,
  so.status,
  CASE WHEN so.bank_name IS NOT NULL THEN '✓' ELSE '✗' END AS has_bank_name,
  CASE WHEN so.bank_full_name IS NOT NULL THEN '✓' ELSE '✗' END AS has_bank_full,
  CASE WHEN so.bank_address IS NOT NULL THEN '✓' ELSE '✗' END AS has_bank_addr,
  CASE WHEN so.bank_swift IS NOT NULL THEN '✓' ELSE '✗' END AS has_swift
FROM sales_orders so
WHERE EXISTS (
  SELECT 1 FROM sales_order_contracts soc
  WHERE soc.sales_order_id = so.id
    AND soc.status IN ('approved', 'signed', 'archived')
)
ORDER BY so.code DESC
LIMIT 20;

-- ── Step 6: Reload PostgREST cache ──
NOTIFY pgrst, 'reload schema';
