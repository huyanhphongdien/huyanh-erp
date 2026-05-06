-- ============================================================================
-- Sales — Recompute header totals từ items cho đơn multi-item
-- Date: 2026-05-05
-- ============================================================================
--
-- VẤN ĐỀ:
--   User báo đơn HA20240046 (FERENTINO, multi-item SVR_10 + RSS_3 + SVR_3L)
--   hiển thị SL = 3 tấn — không khớp với tổng items thực tế.
--
-- ROOT CAUSE:
--   Đơn cũ tạo trước khi có logic auto-sync header từ items, hoặc
--   items được edit nhưng update header bị lỗi giữa chừng → header lệch.
--
-- GIẢI PHÁP:
--   1. SHOW những đơn có header khác sum items (diagnose)
--   2. UPDATE header từ items SUM cho TẤT CẢ đơn multi-item
--   3. Verify
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 0: DIAGNOSE — list đơn multi-item có header khác sum items
-- ════════════════════════════════════════════════════════════════════════════
WITH item_sums AS (
  SELECT
    sales_order_id,
    COUNT(*) AS num_items,
    SUM(quantity_tons) AS items_qty,
    SUM(total_value_usd) AS items_usd,
    SUM(total_bales) AS items_bales,
    SUM(container_count) AS items_containers,
    STRING_AGG(grade, ' + ' ORDER BY sort_order NULLS LAST) AS aggregated_grade
  FROM sales_order_items
  GROUP BY sales_order_id
  HAVING COUNT(*) > 0
)
SELECT
  so.code,
  so.contract_no,
  so.status,
  isum.num_items,
  so.quantity_tons AS header_qty,
  isum.items_qty AS items_sum_qty,
  CASE
    WHEN so.quantity_tons IS DISTINCT FROM isum.items_qty THEN '⚠ LECH'
    ELSE 'ok'
  END AS qty_match,
  so.total_value_usd AS header_usd,
  isum.items_usd AS items_sum_usd,
  CASE
    WHEN so.total_value_usd IS DISTINCT FROM isum.items_usd THEN '⚠ LECH'
    ELSE 'ok'
  END AS usd_match,
  so.grade AS header_grade,
  isum.aggregated_grade
FROM sales_orders so
JOIN item_sums isum ON isum.sales_order_id = so.id
WHERE so.status <> 'cancelled'
  AND (
    so.quantity_tons IS DISTINCT FROM isum.items_qty
    OR so.total_value_usd IS DISTINCT FROM isum.items_usd
    OR so.grade IS DISTINCT FROM isum.aggregated_grade
  )
ORDER BY so.code;
-- Mong đợi: list những đơn có discrepancy. Empty = OK không cần fix.

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: RECOMPUTE — cập nhật header từ items SUM
-- ════════════════════════════════════════════════════════════════════════════
WITH recomputed AS (
  SELECT
    sales_order_id,
    SUM(quantity_tons) AS sum_qty,
    SUM(quantity_kg) AS sum_kg,
    SUM(total_value_usd) AS sum_usd,
    SUM(total_bales) AS sum_bales,
    SUM(container_count) AS sum_containers,
    STRING_AGG(grade, ' + ' ORDER BY sort_order NULLS LAST) AS agg_grade,
    -- Avg unit_price weighted theo qty (tránh div 0)
    CASE
      WHEN SUM(quantity_tons) > 0
      THEN ROUND(SUM(quantity_tons * unit_price) / SUM(quantity_tons), 2)
      ELSE 0
    END AS weighted_price,
    COUNT(*) AS num_items
  FROM sales_order_items
  GROUP BY sales_order_id
)
UPDATE sales_orders so
SET
  quantity_tons = r.sum_qty,
  quantity_kg = COALESCE(r.sum_kg, r.sum_qty * 1000),
  total_value_usd = r.sum_usd,
  total_bales = r.sum_bales,
  container_count = r.sum_containers,
  -- Nếu single item thì giữ grade gốc, multi item thì aggregate
  grade = CASE WHEN r.num_items = 1
               THEN (SELECT grade FROM sales_order_items
                     WHERE sales_order_id = so.id LIMIT 1)
               ELSE r.agg_grade
          END,
  unit_price = r.weighted_price,
  updated_at = NOW()
FROM recomputed r
WHERE so.id = r.sales_order_id
  AND so.status <> 'cancelled';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: VERIFY — chạy lại STEP 0 (mong đợi 0 row, tức không còn lệch)
-- ════════════════════════════════════════════════════════════════════════════
WITH item_sums AS (
  SELECT
    sales_order_id,
    SUM(quantity_tons) AS items_qty,
    SUM(total_value_usd) AS items_usd
  FROM sales_order_items
  GROUP BY sales_order_id
)
SELECT
  so.code,
  so.contract_no,
  so.quantity_tons AS header_qty,
  isum.items_qty AS items_sum_qty
FROM sales_orders so
JOIN item_sums isum ON isum.sales_order_id = so.id
WHERE so.status <> 'cancelled'
  AND so.quantity_tons IS DISTINCT FROM isum.items_qty;
-- Mong đợi: 0 row

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: SHOW HA20240046 chi tiết để verify
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  so.code,
  so.contract_no,
  so.quantity_tons AS total_qty,
  so.total_value_usd AS total_usd,
  so.unit_price AS avg_price,
  so.grade AS aggregated_grade,
  json_agg(
    json_build_object(
      'grade', soi.grade,
      'qty', soi.quantity_tons,
      'price', soi.unit_price,
      'value', soi.total_value_usd
    ) ORDER BY soi.sort_order NULLS LAST
  ) AS items
FROM sales_orders so
LEFT JOIN sales_order_items soi ON soi.sales_order_id = so.id
WHERE so.contract_no = 'HA20240046'
GROUP BY so.id;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: Không thể auto revert. Cần backup nếu lo.
-- ════════════════════════════════════════════════════════════════════════════
