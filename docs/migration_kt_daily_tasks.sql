-- ============================================================================
-- ACCOUNTING DAILY TASKS — Tạo task tự động cho Phòng Kế toán
-- Chạy 00:00 UTC (07:00 VN), T2-T7
-- ============================================================================

-- 1. Tạo function
CREATE OR REPLACE FUNCTION create_accounting_daily_tasks()
RETURNS void AS $$
DECLARE
  today DATE := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  dow INT := EXTRACT(ISODOW FROM today); -- 1=Mon, 7=Sun
  dept_id UUID;
  emp RECORD;
  task_id UUID;
  task_code TEXT;
  task_title TEXT;
  manager_id UUID;
  checklist_items TEXT[] := ARRAY[
    'Kiểm tra đề nghị thanh toán mới',
    'Lập phiếu thu/chi (nếu có)',
    'Cập nhật sổ quỹ tiền mặt + ngân hàng',
    'Kiểm tra biến động tài khoản ngân hàng',
    'Lập UNC (nếu có yêu cầu)',
    'Đối chiếu số dư ngân hàng',
    'Nhận & kiểm tra hóa đơn đầu vào',
    'Xuất hóa đơn đầu ra (nếu có)',
    'Kiểm tra tính hợp lệ + lưu trữ chứng từ',
    'Kiểm tra công nợ phải thu đến hạn',
    'Kiểm tra công nợ phải trả đến hạn',
    'Nhắc thanh toán quá hạn (nếu có)',
    'Nhập liệu chứng từ phát sinh',
    'Hạch toán thu–chi / mua–bán',
    'Kiểm tra tài khoản phát sinh bất thường',
    'Lập báo cáo thu chi trong ngày',
    'Báo cáo phát sinh lớn cho BGĐ (nếu có)',
    'Soát lỗi chứng từ + kiểm tra định khoản',
    'Đối chiếu sổ sách vs ngân hàng vs thực tế',
    'Xử lý công việc hành chính (ngân hàng, hồ sơ)'
  ];
  item TEXT;
  item_order INT;
  next_num INT;
BEGIN
  -- Chỉ T2-T7
  IF dow = 7 THEN RETURN; END IF;

  -- Lấy department
  SELECT id INTO dept_id FROM departments WHERE code = 'HAP-KT' AND status = 'active';
  IF dept_id IS NULL THEN RETURN; END IF;

  -- Lấy manager (TP hoặc PP)
  SELECT e.id INTO manager_id
  FROM employees e
  JOIN positions p ON e.position_id = p.id
  WHERE e.department_id = dept_id AND e.status = 'active' AND p.level <= 5
  ORDER BY p.level ASC LIMIT 1;

  -- Lấy số code tiếp theo
  SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM 4) AS INT)), 0) INTO next_num
  FROM tasks WHERE code LIKE 'CV-%';

  task_title := 'Công việc Kế toán — ' || TO_CHAR(today, 'DD/MM/YYYY');

  FOR emp IN
    SELECT id, full_name FROM employees
    WHERE department_id = dept_id AND status = 'active'
  LOOP
    -- Kiểm tra đã tạo chưa (tránh trùng)
    IF EXISTS (
      SELECT 1 FROM tasks
      WHERE assignee_id = emp.id AND task_source = 'recurring'
        AND due_date = today AND name LIKE 'Công việc Kế toán%'
    ) THEN
      CONTINUE;
    END IF;

    next_num := next_num + 1;
    task_code := 'CV-' || LPAD(next_num::TEXT, 7, '0');
    task_id := gen_random_uuid();

    -- Tạo task
    INSERT INTO tasks (
      id, code, name, description, department_id,
      assignee_id, assigner_id, status, priority, progress,
      start_date, due_date, task_source, work_units,
      created_at, updated_at
    ) VALUES (
      task_id, task_code, task_title,
      'Checklist công việc hàng ngày Phòng Kế toán',
      dept_id, emp.id, manager_id,
      'in_progress', 'medium', 0,
      today, today, 'recurring', 1.0,
      NOW(), NOW()
    );

    -- Tạo checklist items
    item_order := 0;
    FOREACH item IN ARRAY checklist_items LOOP
      item_order := item_order + 1;
      INSERT INTO task_checklist_items (
        task_id, title, sort_order, is_completed
      ) VALUES (
        task_id, item, item_order, false
      );
    END LOOP;

    RAISE NOTICE 'Created task % for %', task_code, emp.full_name;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 2. pg_cron: 00:00 UTC = 07:00 VN, T2-T7
SELECT cron.schedule(
  'accounting-daily-tasks',
  '0 0 * * 1-6',
  $$SELECT create_accounting_daily_tasks()$$
);

-- 3. Chạy ngay cho hôm nay
SELECT create_accounting_daily_tasks();

-- 4. Verify
SELECT t.code, t.name, e.full_name, t.status, t.due_date
FROM tasks t
JOIN employees e ON t.assignee_id = e.id
WHERE t.task_source = 'recurring' AND t.due_date = CURRENT_DATE
  AND t.name LIKE 'Công việc Kế toán%'
ORDER BY e.full_name;
