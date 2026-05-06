-- ============================================================================
-- Add employee: Trương Thị Nhung — NO AUTH version
-- Date: 2026-05-05
-- ============================================================================
--
-- Dùng KHI:
--   - Auth account chưa tạo trên Supabase, hoặc tạo bằng email khác
--   - Vẫn muốn tạo employee record để bộ máy hoạt động
--   - Sau này tạo auth → chạy STEP 3 dưới đây để link
--
-- HẠN CHẾ:
--   - Nhung chưa login được vào ERP (chưa có user_id liên kết)
--   - Permission check theo email vẫn hoạt động (salesPermissionService)
--     nhưng nếu cần chấm công / xem dashboard cá nhân thì cần link auth
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 0: Pre-check (bỏ check auth.users)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_dept_id UUID;
  v_dept_name TEXT;
  v_position_id UUID;
  v_position_title TEXT;
  v_existing_count INT;
  v_next_code TEXT;
  v_max_num INT;
BEGIN
  -- Check chưa tồn tại
  SELECT COUNT(*) INTO v_existing_count
  FROM employees
  WHERE LOWER(email) = 'nhungtt@huyanhrubber.com';
  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'Employee voi email nhungnt@ DA TON TAI - khong tao trung.';
  END IF;

  -- Find department Logistics
  SELECT id, name INTO v_dept_id, v_dept_name
  FROM departments
  WHERE name ILIKE '%logistic%' OR name ILIKE '%xu%t nh%p kh%u%'
  ORDER BY CASE WHEN name ILIKE '%logistic%' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_dept_id IS NULL THEN
    RAISE EXCEPTION 'KHONG TIM THAY department Logistics.';
  END IF;
  RAISE NOTICE 'OK - Department: % (%)', v_dept_name, v_dept_id;

  -- Find position TP level 4
  SELECT id, title INTO v_position_id, v_position_title
  FROM positions
  WHERE title ILIKE '%Tr%ng ph%ng%' AND level = 4
  LIMIT 1;

  IF v_position_id IS NULL THEN
    RAISE EXCEPTION 'KHONG TIM THAY position Truong phong level 4.';
  END IF;
  RAISE NOTICE 'OK - Position: % (level 4)', v_position_title;

  -- Next code
  SELECT COALESCE(
    MAX(NULLIF(REGEXP_REPLACE(code, '\D', '', 'g'), '')::INT), 0
  ) + 1
  INTO v_max_num
  FROM employees
  WHERE code ~ '^HA-?\d+$';

  v_next_code := 'HA-' || LPAD(v_max_num::TEXT, 4, '0');
  RAISE NOTICE 'OK - Next code: %', v_next_code;
  RAISE NOTICE '';
  RAISE NOTICE '=== SAP INSERT (KHONG link auth, can link sau) ===';
  RAISE NOTICE 'Code: %', v_next_code;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: INSERT employee (user_id = NULL)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO employees (
  code,
  full_name,
  email,
  user_id,           -- NULL — sẽ link sau
  department_id,
  position_id,
  status,
  created_at
)
SELECT
  'HA-' || LPAD((
    COALESCE(
      (SELECT MAX(NULLIF(REGEXP_REPLACE(code, '\D', '', 'g'), '')::INT)
       FROM employees WHERE code ~ '^HA-?\d+$'),
      0
    ) + 1
  )::TEXT, 4, '0'),
  'Trương Thị Nhung',
  'nhungtt@huyanhrubber.com',
  NULL,              -- ★ chưa có auth, link sau
  (SELECT id FROM departments
    WHERE name ILIKE '%logistic%' OR name ILIKE '%xu%t nh%p kh%u%'
    ORDER BY CASE WHEN name ILIKE '%logistic%' THEN 1 ELSE 2 END
    LIMIT 1),
  (SELECT id FROM positions WHERE title ILIKE '%Tr%ng ph%ng%' AND level = 4 LIMIT 1),
  'active',
  NOW();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Verify
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

SELECT
  e.code,
  e.full_name,
  e.email,
  e.status,
  d.name AS department,
  p.title AS position,
  e.user_id IS NOT NULL AS has_auth_link
FROM employees e
LEFT JOIN departments d ON d.id = e.department_id
LEFT JOIN positions p ON p.id = e.position_id
WHERE e.email = 'nhungtt@huyanhrubber.com';
-- has_auth_link = false → đúng, link sau

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: LINK AUTH SAU (chạy KHI ĐÃ tạo auth account)
-- ════════════════════════════════════════════════════════════════════════════
-- Sau khi tạo auth account trên Supabase Dashboard:
--   UPDATE employees
--   SET user_id = (SELECT id FROM auth.users WHERE LOWER(email) = 'nhungtt@huyanhrubber.com' LIMIT 1)
--   WHERE email = 'nhungtt@huyanhrubber.com';
--
--   Verify:
--   SELECT code, full_name, email, user_id IS NOT NULL AS linked
--   FROM employees WHERE email = 'nhungtt@huyanhrubber.com';

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- DELETE FROM employees WHERE email = 'nhungtt@huyanhrubber.com';
