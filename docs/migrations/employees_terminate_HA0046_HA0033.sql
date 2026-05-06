-- ============================================================================
-- Soft delete 2 employees: HA-0046 (Trần Văn Trình) + HA-0033 (Lê Văn Hòa)
-- Date: 2026-05-05
-- Per user yêu cầu: "xóa ra khỏi hệ thống"
-- ============================================================================
--
-- AN TOÀN:
--   Mặc định = SOFT DELETE (status='terminated') — giữ history các bảng
--   liên quan (attendance, leave, payroll, sales_orders.created_by, ...)
--   nhưng employee không xuất hiện trong active list nữa.
--
--   Lý do KHÔNG hard delete: FK constraints. Các bảng đang ref employee.id:
--     - attendance, leave_requests, overtime_requests, payroll, payslips
--     - shift_assignments, task_assignments, evaluation
--     - sales_orders.created_by / current_owner_id / locked_by / confirmed_by
--     - b2b deals, settlements, advances
--   → Hard delete sẽ fail hoặc set NULL hàng loạt → mất tracking.
--
--   Nếu THẬT SỰ muốn hard delete: uncomment STEP 3 ở dưới (rủi ro cao).
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 0: Show 2 employees + đếm reference
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r RECORD;
  v_attendance INT;
  v_leave INT;
  v_payslip INT;
  v_sales_owner INT;
  v_sales_created INT;
BEGIN
  RAISE NOTICE '=== 2 EMPLOYEES SAP TERMINATE ===';
  FOR r IN
    SELECT id, code, full_name, email, status, department_id, position_id
    FROM employees
    WHERE code IN ('HA-0046', 'HA-0033')
    ORDER BY code
  LOOP
    SELECT COUNT(*) INTO v_attendance FROM attendance WHERE employee_id = r.id;
    SELECT COUNT(*) INTO v_leave FROM leave_requests WHERE employee_id = r.id;
    SELECT COUNT(*) INTO v_payslip FROM payslips WHERE employee_id = r.id;
    BEGIN
      SELECT COUNT(*) INTO v_sales_owner FROM sales_orders WHERE current_owner_id = r.id;
    EXCEPTION WHEN OTHERS THEN v_sales_owner := 0;
    END;
    BEGIN
      SELECT COUNT(*) INTO v_sales_created FROM sales_orders WHERE created_by = r.id;
    EXCEPTION WHEN OTHERS THEN v_sales_created := 0;
    END;

    RAISE NOTICE '  % - %  email=%  status=%',
      r.code, r.full_name, COALESCE(r.email, '-'), r.status;
    RAISE NOTICE '    refs: attendance=%, leave=%, payslip=%, sales_owner=%, sales_created=%',
      v_attendance, v_leave, v_payslip, v_sales_owner, v_sales_created;
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: SOFT DELETE — set status='terminated' (giữ history)
-- ════════════════════════════════════════════════════════════════════════════
UPDATE employees
SET status = 'terminated',
    updated_at = NOW()
WHERE code IN ('HA-0046', 'HA-0033');

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Reassign sales orders đang owned bởi 2 employee này → admin
-- (tránh đơn bị stuck không ai xử lý)
-- ════════════════════════════════════════════════════════════════════════════
UPDATE sales_orders
SET current_owner_id = (
  SELECT id FROM employees
  WHERE LOWER(email) = 'minhld@huyanhrubber.com'
  LIMIT 1
)
WHERE current_owner_id IN (
  SELECT id FROM employees WHERE code IN ('HA-0046', 'HA-0033')
)
AND status NOT IN ('cancelled', 'paid', 'delivered', 'invoiced');

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3 (OPTIONAL): HARD DELETE — chỉ chạy nếu user xác nhận muốn xóa hẳn
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠ CẢNH BÁO: Sẽ fail nếu có bảng FK NOT NULL ref employee.id (vd payroll)
--             Nếu nullable FK → set NULL → mất audit trail
-- Uncomment các dòng dưới NẾU thực sự muốn:

-- DELETE FROM employees WHERE code IN ('HA-0046', 'HA-0033');

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: NOTIFY + VERIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

SELECT code, full_name, email, status, updated_at
FROM employees
WHERE code IN ('HA-0046', 'HA-0033')
ORDER BY code;
-- Mong đợi: 2 row, status='terminated'

-- Check sales_orders đã reassign chưa
SELECT
  COUNT(*) AS so_owned_by_terminated_emps
FROM sales_orders so
JOIN employees e ON e.id = so.current_owner_id
WHERE e.code IN ('HA-0046', 'HA-0033');
-- Mong đợi: 0 đối với đơn active

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (nếu lỡ terminate nhầm)
-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE employees SET status = 'active' WHERE code IN ('HA-0046', 'HA-0033');
