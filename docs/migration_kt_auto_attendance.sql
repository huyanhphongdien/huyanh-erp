-- ============================================================================
-- AUTO ATTENDANCE: Phòng Kế toán — 08:00-20:00, T2-T7
-- Chạy pg_cron mỗi ngày lúc 01:00 UTC (08:00 VN)
-- ============================================================================

-- Tạo function
CREATE OR REPLACE FUNCTION auto_attendance_accounting()
RETURNS void AS $$
DECLARE
  today DATE := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  dow INT := EXTRACT(ISODOW FROM today); -- 1=Mon, 7=Sun
  dept_id UUID;
  emp RECORD;
BEGIN
  -- Chỉ T2-T7 (dow 1-6), bỏ CN (7)
  IF dow = 7 THEN
    RAISE NOTICE 'Chủ nhật — bỏ qua';
    RETURN;
  END IF;

  -- Lấy department_id Phòng Kế toán
  SELECT id INTO dept_id FROM departments WHERE code = 'HAP-KT' AND status = 'active';
  IF dept_id IS NULL THEN
    RAISE NOTICE 'Không tìm thấy Phòng Kế toán';
    RETURN;
  END IF;

  -- Tạo attendance cho từng NV
  FOR emp IN
    SELECT id FROM employees
    WHERE department_id = dept_id AND status = 'active'
  LOOP
    -- Bỏ qua nếu đã có attendance (business_trip, leave, hoặc đã check-in)
    IF NOT EXISTS (
      SELECT 1 FROM attendance
      WHERE employee_id = emp.id AND date = today
    ) THEN
      INSERT INTO attendance (
        employee_id, date, status, work_units, working_minutes,
        check_in_time, check_out_time, notes, auto_checkout
      ) VALUES (
        emp.id, today, 'present', 1.0, 720, -- 12h = 720 phút
        (today || 'T08:00:00+07:00')::timestamptz,
        (today || 'T20:00:00+07:00')::timestamptz,
        'Tự động chấm công — Phòng Kế toán',
        true
      );
      RAISE NOTICE 'Created attendance for employee %', emp.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Tạo cron job — chạy 01:00 UTC = 08:00 VN mỗi ngày
SELECT cron.schedule(
  'auto-attendance-accounting',
  '0 1 * * *',
  $$SELECT auto_attendance_accounting()$$
);

-- Test ngay (chạy 1 lần để tạo attendance hôm nay)
SELECT auto_attendance_accounting();

-- Verify
SELECT e.full_name, a.date, a.check_in_time, a.check_out_time, a.status, a.notes
FROM attendance a
JOIN employees e ON a.employee_id = e.id
WHERE a.date = CURRENT_DATE
  AND e.department_id = (SELECT id FROM departments WHERE code = 'HAP-KT')
ORDER BY e.full_name;
