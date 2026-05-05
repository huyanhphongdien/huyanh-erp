-- ============================================================================
-- VERIFY — kiểm tra phân bố owner sau khi chạy sales_assign_dept_owners.sql
-- Date: 2026-05-05
-- ============================================================================

-- Q1: Tổng quan owner theo stage
SELECT
  so.current_stage AS stage,
  COALESCE(e.full_name, '(NULL — chưa gán)') AS owner_name,
  COALESCE(e.email, '-') AS email,
  COUNT(*) AS so_dong
FROM sales_orders so
LEFT JOIN employees e ON e.id = so.current_owner_id
WHERE so.status <> 'cancelled'
GROUP BY so.current_stage, e.full_name, e.email
ORDER BY so.current_stage, so_dong DESC;

-- Q2: Đếm đơn không có owner (phải = 0)
SELECT
  COUNT(*) FILTER (WHERE current_owner_id IS NULL) AS no_owner,
  COUNT(*) FILTER (WHERE current_owner_id IS NOT NULL) AS has_owner,
  COUNT(*) AS total
FROM sales_orders
WHERE status <> 'cancelled';

-- Q3: Liệt kê 10 đơn mới nhất kèm owner để mắt thường kiểm tra
SELECT
  so.code,
  so.status,
  so.current_stage,
  e.full_name AS owner,
  e.email AS owner_email
FROM sales_orders so
LEFT JOIN employees e ON e.id = so.current_owner_id
WHERE so.status <> 'cancelled'
ORDER BY so.created_at DESC
LIMIT 10;
