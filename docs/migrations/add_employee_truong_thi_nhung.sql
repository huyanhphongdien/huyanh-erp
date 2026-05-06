-- ============================================================================
-- Add employee: Trương Thị Nhung — Trưởng phòng Logistics
-- Date: 2026-05-05
-- Email: nhungtt@huyanhrubber.com (auth account đã tạo bằng tay)
-- ============================================================================
--
-- Yêu cầu user 2026-05-05:
--   "Trương Thị Nhung — nhungtt@huyanhrubber.com — Trưởng phòng Logistics
--    đã tạo tài khoản mail trên authen, bạn add vào giùm tôi"
--
-- SCRIPT này:
--   1. Tự lookup auth_user_id theo email (auth.users phải có sẵn)
--   2. Tự lookup department_id của "Logistics"
--   3. Tự lookup position_id của "Trưởng phòng" (level 4)
--   4. Generate employee code = HA-XXXX (tự tăng từ max hiện tại)
--   5. INSERT vào employees
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 0: Pre-check — verify đủ điều kiện trước khi insert
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_auth_user_id UUID;
  v_dept_id UUID;
  v_dept_name TEXT;
  v_position_id UUID;
  v_position_name TEXT;
  v_existing_count INT;
  v_next_code TEXT;
  v_max_num INT;
BEGIN
  -- Check auth.users có account
  SELECT id INTO v_auth_user_id
  FROM auth.users
  WHERE LOWER(email) = 'nhungtt@huyanhrubber.com'
  LIMIT 1;

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'KHONG TIM THAY auth user voi email nhungtt@huyanhrubber.com. User can tao auth account truoc tren Supabase Dashboard > Authentication > Users.';
  END IF;
  RAISE NOTICE 'OK - Tim thay auth user_id = %', v_auth_user_id;

  -- Check chưa tồn tại employee với email này
  SELECT COUNT(*) INTO v_existing_count
  FROM employees
  WHERE LOWER(email) = 'nhungtt@huyanhrubber.com';
  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'Employee voi email nhungnt@ DA TON TAI - khong tao trung. Kiem tra lai.';
  END IF;

  -- Check chưa tồn tại employee với user_id này (linked auth account)
  SELECT COUNT(*) INTO v_existing_count
  FROM employees
  WHERE user_id = v_auth_user_id;
  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'Da co employee linked voi auth user_id = %. Kiem tra lai.', v_auth_user_id;
  END IF;

  -- Find department Logistics
  SELECT id, name INTO v_dept_id, v_dept_name
  FROM departments
  WHERE name ILIKE '%logistic%' OR name ILIKE '%xu%t nh%p kh%u%'
  ORDER BY
    CASE WHEN name ILIKE '%logistic%' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_dept_id IS NULL THEN
    RAISE EXCEPTION 'KHONG TIM THAY department Logistics. Kiem tra bang departments.';
  END IF;
  RAISE NOTICE 'OK - Department: % (%)', v_dept_name, v_dept_id;

  -- Find position "Trưởng phòng" (level 4)
  SELECT id, name INTO v_position_id, v_position_name
  FROM positions
  WHERE name ILIKE '%Tr%ng ph%ng%' AND level = 4
  ORDER BY level
  LIMIT 1;

  IF v_position_id IS NULL THEN
    RAISE EXCEPTION 'KHONG TIM THAY position "Truong phong" level 4. Kiem tra bang positions.';
  END IF;
  RAISE NOTICE 'OK - Position: % (level 4) = %', v_position_name, v_position_id;

  -- Generate next employee code (HA-XXXX)
  SELECT COALESCE(
    MAX(NULLIF(REGEXP_REPLACE(code, '\D', '', 'g'), '')::INT),
    0
  ) + 1
  INTO v_max_num
  FROM employees
  WHERE code ~ '^HA-?\d+$';

  v_next_code := 'HA-' || LPAD(v_max_num::TEXT, 4, '0');
  RAISE NOTICE 'OK - Next employee code: %', v_next_code;
  RAISE NOTICE '';
  RAISE NOTICE '=== SAP INSERT ===';
  RAISE NOTICE 'Code:       %', v_next_code;
  RAISE NOTICE 'Name:       Truong Thi Nhung';
  RAISE NOTICE 'Email:      nhungtt@huyanhrubber.com';
  RAISE NOTICE 'Department: %', v_dept_name;
  RAISE NOTICE 'Position:   % (level 4)', v_position_name;
  RAISE NOTICE 'auth_user:  %', v_auth_user_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: INSERT
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO employees (
  code,
  full_name,
  email,
  user_id,
  department_id,
  position_id,
  status,
  created_at
)
SELECT
  -- Generate code
  'HA-' || LPAD((
    COALESCE(
      (SELECT MAX(NULLIF(REGEXP_REPLACE(code, '\D', '', 'g'), '')::INT)
       FROM employees
       WHERE code ~ '^HA-?\d+$'),
      0
    ) + 1
  )::TEXT, 4, '0'),
  'Trương Thị Nhung',
  'nhungtt@huyanhrubber.com',
  (SELECT id FROM auth.users WHERE LOWER(email) = 'nhungtt@huyanhrubber.com' LIMIT 1),
  (SELECT id FROM departments
    WHERE name ILIKE '%logistic%' OR name ILIKE '%xu%t nh%p kh%u%'
    ORDER BY CASE WHEN name ILIKE '%logistic%' THEN 1 ELSE 2 END
    LIMIT 1),
  (SELECT id FROM positions WHERE name ILIKE '%Tr%ng ph%ng%' AND level = 4 LIMIT 1),
  'active',
  NOW();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: VERIFY
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

SELECT
  e.code,
  e.full_name,
  e.email,
  e.status,
  d.name AS department,
  p.name AS position,
  p.level AS position_level,
  e.user_id IS NOT NULL AS has_auth_link
FROM employees e
LEFT JOIN departments d ON d.id = e.department_id
LEFT JOIN positions p ON p.id = e.position_id
WHERE e.email = 'nhungtt@huyanhrubber.com';
-- Mong đợi: 1 row, has_auth_link=true, position_level=4

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (nếu lỡ insert sai)
-- ════════════════════════════════════════════════════════════════════════════
-- DELETE FROM employees WHERE email = 'nhungtt@huyanhrubber.com';
