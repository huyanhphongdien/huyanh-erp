-- ============================================================
-- FIX CHẤM CÔNG — Đợt 1: Fix data tháng 3
-- Ngày: 31/03/2026
-- ============================================================

-- 1. Thêm cột work_units cho shifts
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS work_units NUMERIC(3,1) DEFAULT 1.0;

-- 2. Thêm cột work_units cho attendance
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS work_units NUMERIC(3,1) DEFAULT 0;

-- 3. Set công cho từng ca
UPDATE shifts SET work_units = 1.5 WHERE code IN ('LONG_DAY', 'LONG_NIGHT');
UPDATE shifts SET work_units = 1.0 WHERE code NOT IN ('LONG_DAY', 'LONG_NIGHT');

-- 4. Fix working_minutes = 0 cho records có checkout
UPDATE attendance
SET working_minutes = GREATEST(0,
  EXTRACT(EPOCH FROM (check_out_time::timestamptz - check_in_time::timestamptz)) / 60 - COALESCE(break_minutes, 60)
)
WHERE check_out_time IS NOT NULL
  AND working_minutes = 0
  AND check_in_time IS NOT NULL;

-- 5. Fix late > 480 phút (bất thường — reset về 0)
UPDATE attendance
SET late_minutes = 0, status = 'present'
WHERE late_minutes > 480
  AND check_in_time IS NOT NULL;

-- 6. Backfill work_units cho attendance có checkout
UPDATE attendance a
SET work_units = COALESCE(
  (SELECT s.work_units FROM shifts s WHERE s.id = a.shift_id),
  1.0
)
WHERE a.check_out_time IS NOT NULL
  AND a.work_units = 0
  AND a.status IN ('present', 'late', 'early_leave', 'late_and_early');

-- 7. Verify
SELECT 'shifts' AS tbl,
  COUNT(*) AS total,
  COUNT(CASE WHEN work_units = 1.5 THEN 1 END) AS ca_dai,
  COUNT(CASE WHEN work_units = 1.0 THEN 1 END) AS ca_thuong
FROM shifts
UNION ALL
SELECT 'attendance_mar',
  COUNT(*),
  COUNT(CASE WHEN work_units > 0 THEN 1 END),
  COUNT(CASE WHEN working_minutes = 0 AND check_out_time IS NOT NULL THEN 1 END)
FROM attendance WHERE date >= '2026-03-01' AND date <= '2026-03-31';
