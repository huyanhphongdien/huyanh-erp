-- ============================================================================
-- Sales Module FIX — Expand grade VARCHAR(20) → VARCHAR(100)
-- Date: 2026-05-04
-- Status: TO APPLY
-- ============================================================================
--
-- USER REPORT 2026-05-04:
--   "Em nhập 1 Hợp đồng 3 Sản phẩm nhưng nó báo quá dài và ko cho lưu.
--    Xóa bớt 1 dòng sản phẩm thì lưu được."
--   Error: "value too long for type character varying(20)"
--
-- ROOT CAUSE:
--   ContractTab.tsx line 212:
--     aggregatedGrade = itemRows.length === 1
--       ? itemRows[0].grade
--       : itemRows.map(i => i.grade).join(' + ')
--
--   3 sản phẩm: "SVR_10 + SVR_3L + SBR1502" = 24 chars > VARCHAR(20).
--   2 sản phẩm: "SVR_10 + SVR_3L" = 15 chars OK.
--   1 sản phẩm: "SVR_10" = 6 chars OK.
--
-- ADDITIONAL: User cũng muốn nhập tên sản phẩm tự do
--   ("SVR10mixture SBR1502") → cần > 20 ký tự cho item-level grade.
--
-- FIX:
--   ALTER cả sales_orders.grade và sales_order_items.grade lên VARCHAR(100)
--   - Cover được join 3-5 sản phẩm chuẩn: "SVR_10 + SVR_3L + SBR1502 + RSS_1 + LATEX_60" = ~50 chars
--   - Cover được tên free text user nhập tay (e.g. "SVR10mixture SBR1502")
-- ============================================================================

-- Step 1: Alter sales_orders.grade
ALTER TABLE sales_orders
  ALTER COLUMN grade TYPE VARCHAR(100);

-- Step 2: Alter sales_order_items.grade
ALTER TABLE sales_order_items
  ALTER COLUMN grade TYPE VARCHAR(100);

-- Step 3: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
-- SELECT column_name, data_type, character_maximum_length
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('sales_orders', 'sales_order_items')
--   AND column_name = 'grade';
--
-- Expected: character_maximum_length = 100 (cả 2 row)

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (chỉ áp dụng nếu KHÔNG có row vi phạm length=20)
-- ════════════════════════════════════════════════════════════════════════════
-- ALTER TABLE sales_orders ALTER COLUMN grade TYPE VARCHAR(20);
-- ALTER TABLE sales_order_items ALTER COLUMN grade TYPE VARCHAR(20);
