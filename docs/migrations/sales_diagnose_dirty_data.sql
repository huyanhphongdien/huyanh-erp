-- ============================================================================
-- Sales — Diagnose dữ liệu bẩn: đơn hủy chưa xóa + đơn trùng contract_no
-- Date: 2026-05-05
-- ============================================================================
--
-- 2 vấn đề user phát hiện:
--   1. Stat card "Tổng đơn: 36" nhưng có cancelled trong đó chưa xóa
--   2. Có 2 dòng cùng contract_no=HA20260030 (VITRY, multi-item)
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- Q1: Tổng số đơn từng loại để hiểu "36" là gì
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  status,
  COUNT(*) AS num
FROM sales_orders
GROUP BY status
ORDER BY num DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- Q2: Liệt kê tất cả đơn CANCELLED để xem chi tiết trước khi xóa
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  id,
  code,
  contract_no,
  status,
  internal_notes,
  total_value_usd,
  created_at,
  updated_at
FROM sales_orders
WHERE status = 'cancelled'
ORDER BY updated_at DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- Q3: Đơn TRÙNG contract_no (vd HA20260030)
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  contract_no,
  COUNT(*) AS num_duplicates,
  STRING_AGG(code, ' | ') AS codes,
  STRING_AGG(DISTINCT status, ', ') AS statuses,
  STRING_AGG(DISTINCT grade, ', ') AS grades
FROM sales_orders
WHERE contract_no IS NOT NULL
  AND status <> 'cancelled'
GROUP BY contract_no
HAVING COUNT(*) > 1
ORDER BY num_duplicates DESC;

-- ════════════════════════════════════════════════════════════════════════════
-- Q4: Detail của 2 đơn HA20260030 — xem khác nhau cái gì
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  so.id,
  so.code,
  so.contract_no,
  so.status,
  so.current_stage,
  so.grade,
  so.quantity_tons,
  so.total_value_usd,
  so.etd,
  so.created_at,
  COUNT(soi.id) AS num_items,
  STRING_AGG(soi.grade || ' (' || soi.quantity_tons || 't)', ', ') AS items_detail
FROM sales_orders so
LEFT JOIN sales_order_items soi ON soi.sales_order_id = so.id
WHERE so.contract_no = 'HA20260030'
GROUP BY so.id, so.code, so.contract_no, so.status, so.current_stage,
         so.grade, so.quantity_tons, so.total_value_usd, so.etd, so.created_at
ORDER BY so.created_at;
