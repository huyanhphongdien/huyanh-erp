-- ============================================================
-- SALES CONTRACT WORKFLOW — V20: Toàn phòng Kế toán làm Kiểm tra HĐ
-- Ngày: 2026-07-16
-- Phụ thuộc: v2_reviewers + v11 + v17 + v18 (reviewer policy)
--
-- Mục đích: Cấp cho TOÀN phòng Kế toán quyền NGANG chị Yến ở khâu Kiểm tra HĐ
-- (duyệt / trả lại + nhập bank info) — CHỈ reviewer, KHÔNG ký, KHÔNG xóa file.
-- Danh sách phòng Kế toán (dept d0000000-0000-0000-0000-000000000004):
--   yendt (đã có), phulv (đã có) + ahtn, linhlt, tamltt, phungnt, hungtv (mới).
--
-- Sync code (đã sửa cùng lúc):
--   - src/config/sales.config.ts: REVIEWER_EMAILS (+5 email)
--   - src/services/sales/salesPermissionService.ts: SALES_EMAIL_ROLE_MAP (accounting)
--       + BOD_EMAILS (xem/tải HĐ)
--   - src/components/common/Sidebar.tsx: menu "Kiểm tra HĐ" allowedEmails (+5)
--
-- LƯU Ý: policy reviewer khớp theo employees.email → BƯỚC 1 sync email từ auth
-- (hungtv được tạo bằng INSERT chưa có email; các NV khác có thể cũng NULL).
-- ============================================================

-- ─── BƯỚC 1: Sync employees.email từ auth.users cho phòng Kế toán ───
-- RLS reviewer so LOWER(e.email) IN (...) → email PHẢI có + đúng.
UPDATE public.employees e
SET email = u.email
FROM auth.users u
WHERE e.user_id = u.id
  AND e.department_id = 'd0000000-0000-0000-0000-000000000004'   -- Phòng Kế toán
  AND (e.email IS NULL OR LOWER(e.email) IS DISTINCT FROM LOWER(u.email));

-- ─── BƯỚC 2: Reviewer policy — thêm 5 email kế toán (giữ nguyên email cũ) ───
DROP POLICY IF EXISTS "soc_update_allowed_reviewer" ON sales_order_contracts;

CREATE POLICY "soc_update_allowed_reviewer" ON sales_order_contracts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND LOWER(e.email) IN (
           'phulv@huyanhrubber.com',
           'minhld@huyanhrubber.com',
           'sales@huyanhrubber.com',
           'logistics@huyanhrubber.com',
           'yendt@huyanhrubber.com',
           -- Toàn phòng Kế toán (2026-07-16)
           'ahtn@huyanhrubber.com',      -- Hồ Thị Á
           'linhlt@huyanhrubber.com',    -- Lê Thị Linh
           'tamltt@huyanhrubber.com',    -- Lê Thị Tâm
           'phungnt@huyanhrubber.com',   -- Nguyễn Thị Phụng
           'hungtv@huyanhrubber.com'     -- Thái Văn Hùng
         )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
       WHERE e.user_id = auth.uid()
         AND LOWER(e.email) IN (
           'phulv@huyanhrubber.com',
           'minhld@huyanhrubber.com',
           'sales@huyanhrubber.com',
           'logistics@huyanhrubber.com',
           'yendt@huyanhrubber.com',
           'ahtn@huyanhrubber.com',
           'linhlt@huyanhrubber.com',
           'tamltt@huyanhrubber.com',
           'phungnt@huyanhrubber.com',
           'hungtv@huyanhrubber.com'
         )
    )
  );

-- ─── Reload PostgREST schema cache ───
NOTIFY pgrst, 'reload schema';

-- ─── VERIFY ───
-- (a) Cả 7 tài khoản kế toán: có email + đã link auth (user_id NOT NULL) chưa?
--     user_id NULL → NV đó chưa đăng nhập lần nào → RLS KHÔNG nhận diện.
SELECT e.code, e.full_name, e.email, e.user_id,
       CASE WHEN e.user_id IS NULL THEN '⚠ CHƯA link auth — phải đăng nhập 1 lần'
            WHEN e.email IS NULL     THEN '⚠ THIẾU email'
            ELSE '✓ OK' END AS status
FROM employees e
WHERE e.department_id = 'd0000000-0000-0000-0000-000000000004'
ORDER BY e.full_name;

-- (b) Policy đã chứa đủ 10 email?
SELECT polname AS policy_name,
       pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'sales_order_contracts'::regclass
  AND polname = 'soc_update_allowed_reviewer';
