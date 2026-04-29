-- ============================================================
-- SPRINT 4 FIX — Exclude BGD khỏi bảng thống kê hiệu suất
-- Ngày: 2026-04-29
-- Mục đích: User yêu cầu loại Lê Văn Huy + Hồ Thị Thủy + Lê Xuân
--   Hồng Trung khỏi bảng xếp hạng + KPI tổng hợp (vì là BGD).
--
-- Cơ chế: thêm config_key 'excluded_departments' (jsonb array UUID).
--   performanceService đọc + filter trong getKPIs/getEmployeeRanking/
--   getMonthlyTrend.
--
-- Snapshot vẫn compute cho BGD → họ xem điểm cá nhân được nếu cần
-- (qua /performance/<emp_id>) — chỉ exclude khỏi AGGREGATE.
-- ============================================================

INSERT INTO performance_config (config_key, config_value, description)
VALUES (
  'excluded_departments',
  '["d0000000-0000-0000-0000-000000000001"]'::jsonb,
  'Danh sách department_id loại khỏi bảng thống kê hiệu suất (KPI + ranking + trend). Default: BGD (HAP-BGD). Có thể thêm dept khác nếu cần.'
)
ON CONFLICT (config_key) DO UPDATE
  SET config_value = EXCLUDED.config_value,
      description = EXCLUDED.description,
      updated_at = NOW();

-- Verify
SELECT
  config_key,
  jsonb_pretty(config_value) AS config_value,
  description,
  updated_at
FROM performance_config
WHERE config_key = 'excluded_departments';

-- Verify list NV bị exclude (show để confirm)
SELECT e.code, e.full_name, d.code AS dept_code
FROM employees e
JOIN departments d ON d.id = e.department_id
WHERE e.department_id::text = ANY (
  SELECT jsonb_array_elements_text(config_value)
  FROM performance_config
  WHERE config_key = 'excluded_departments'
)
ORDER BY e.code;
