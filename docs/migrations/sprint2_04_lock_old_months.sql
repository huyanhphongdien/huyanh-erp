-- ============================================================
-- SPRINT 2.4 — Lock 5 tháng cũ (11/25 → 03/26)
-- Ngày: 2026-04-28
-- Mục đích: Sau initial snapshot, lock các tháng đã qua để không bị
--   thay đổi retroactive. Tháng hiện tại (04/26) vẫn unlocked vì
--   còn đang chạy.
-- ============================================================

UPDATE employee_monthly_score
SET locked_at = NOW()
WHERE locked_at IS NULL
  AND (year, month) < (
    EXTRACT(YEAR FROM NOW())::INT,
    EXTRACT(MONTH FROM NOW())::INT
  );

-- Verify
SELECT
  year, month,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE locked_at IS NOT NULL) AS locked,
  COUNT(*) FILTER (WHERE locked_at IS NULL) AS unlocked
FROM employee_monthly_score
GROUP BY year, month
ORDER BY year DESC, month DESC;
