-- ============================================================
-- SPRINT 4 FIX — A-C5: RLS cho performance_config
-- Ngày: 2026-04-28
-- Vấn đề: PerformanceConfigPage chỉ check level ≤ 3 ở client.
--   User có thể bypass UI gọi REST trực tiếp UPDATE/INSERT config.
-- Fix: RLS policy chỉ cho phép employees có position level ≤ 3
--   thực hiện INSERT/UPDATE/DELETE.
-- ============================================================

-- Drop policy cũ (nếu có) — Sprint 1.1 tạo policy "Admin write" quá rộng
DROP POLICY IF EXISTS "Admin write performance_config" ON performance_config;
DROP POLICY IF EXISTS "Read performance_config" ON performance_config;

-- Read: ai cũng có thể đọc (cần để dashboard load weights)
CREATE POLICY "Read performance_config"
  ON performance_config FOR SELECT
  USING (true);

-- Write: chỉ employees có position level ≤ 3 (BGD/Trợ lý/Phó GĐ)
-- auth.uid() trả về Supabase auth user UUID; map sang employees.user_id
CREATE POLICY "Admin write performance_config"
  ON performance_config FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM employees e
      JOIN positions p ON p.id = e.position_id
      WHERE e.id::text = current_setting('request.jwt.claims', true)::jsonb->>'sub'
         OR e.user_id::text = current_setting('request.jwt.claims', true)::jsonb->>'sub'
      AND p.level <= 3
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM employees e
      JOIN positions p ON p.id = e.position_id
      WHERE e.id::text = current_setting('request.jwt.claims', true)::jsonb->>'sub'
         OR e.user_id::text = current_setting('request.jwt.claims', true)::jsonb->>'sub'
      AND p.level <= 3
    )
  );

-- ============================================================
-- Verify
-- ============================================================
SELECT
  pol.polname AS policy_name,
  CASE pol.polcmd WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' END AS command
FROM pg_policies pol
WHERE pol.tablename = 'performance_config';
