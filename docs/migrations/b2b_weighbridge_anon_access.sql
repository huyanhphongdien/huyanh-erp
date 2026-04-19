-- ============================================================================
-- FIX: Weighbridge (trạm cân) load Deal B2B vào dropdown "Theo Deal"
-- Ngày: 2026-04-19
--
-- Nguyên nhân:
--   Weighbridge auth qua PIN (table scale_operators), KHÔNG tạo Supabase JWT
--   session → supabase-js dùng anon key → role = 'anon' (không phải
--   'authenticated'). Các policy b2b_* ở migration b2b_rls_partner_scope.sql
--   đều "FOR ... TO authenticated" → anon bị reject → dropdown trống.
--
-- Giải pháp:
--   Thêm policy SELECT cho role 'anon' trên các table weighbridge cần:
--     b2b.deals              — để dropdown "Theo Deal"
--     b2b.partners (optional)— để hiện tên đại lý khi chọn deal
--   Chỉ SELECT, KHÔNG cho INSERT/UPDATE/DELETE.
--   Filter: chỉ deal đang active (status IN processing/accepted).
-- ============================================================================

-- ============================================
-- BƯỚC 1 — Xem policies hiện tại của b2b.deals
-- ============================================
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'b2b' AND tablename = 'deals';

-- ============================================
-- BƯỚC 2 — Thêm policy SELECT cho anon
-- Ưu tiên an toàn: chỉ load deal active + không lộ deal của user khác
-- (vì anon không có partner_id, lộ toàn bộ active deals là chấp nhận được
-- cho use-case cân nội bộ — chỉ operator trạm cân mới login được app).
-- ============================================
DROP POLICY IF EXISTS deals_weighbridge_select ON b2b.deals;
CREATE POLICY deals_weighbridge_select ON b2b.deals
  FOR SELECT
  TO anon
  USING (status IN ('processing', 'accepted'));

-- ============================================
-- BƯỚC 3 — Cho anon đọc partner info (name/code) để render dropdown
-- ============================================
DROP POLICY IF EXISTS partners_weighbridge_select ON b2b.partners;
CREATE POLICY partners_weighbridge_select ON b2b.partners
  FOR SELECT
  TO anon
  USING (true);

-- ============================================
-- BƯỚC 4 — Cho anon INSERT stock_in_orders (tạo phiếu nhập)
-- + SELECT stock_in_orders để compute received_kg
--
-- Weighbridge hiện đã có quyền này (các bàn cân trước vẫn hoạt động với
-- NCC, transfer...) — nên bước 4 CHỈ CHẠY nếu stock_in theo deal báo
-- "new row violates row-level security policy".
-- ============================================

-- Nếu lỗi RLS khi cân Deal → gỡ comment 2 block sau:
-- DROP POLICY IF EXISTS stock_in_weighbridge_select ON public.stock_in_orders;
-- CREATE POLICY stock_in_weighbridge_select ON public.stock_in_orders
--   FOR SELECT TO anon USING (deal_id IS NOT NULL);

-- DROP POLICY IF EXISTS stock_in_weighbridge_insert ON public.stock_in_orders;
-- CREATE POLICY stock_in_weighbridge_insert ON public.stock_in_orders
--   FOR INSERT TO anon WITH CHECK (deal_id IS NOT NULL);

-- ============================================
-- BƯỚC 5 — Verify policies đã thêm
-- ============================================
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'b2b'
  AND tablename IN ('deals', 'partners')
  AND policyname LIKE '%weighbridge%';

-- ============================================
-- BƯỚC 6 — Test từ góc độ anon (mô phỏng weighbridge)
-- Chạy khối này dưới role = anon để đảm bảo thấy Deal đang active.
-- ============================================
SET LOCAL ROLE anon;

SELECT id, deal_number, status
FROM b2b.deals
WHERE status IN ('processing', 'accepted')
LIMIT 10;

-- Reset role về mặc định
RESET ROLE;

-- ============================================
-- HOÀN TẤT
-- Sau khi chạy xong:
--   - F5 trang can.huyanhrubber.vn/weigh
--   - Chọn "Theo Deal" → dropdown phải có Deal DL2604-CVO4
--   - Tiếp tục cân như bình thường (GROSS → TARE → NET auto)
-- ============================================

-- ============================================
-- ROLLBACK nếu cần (gỡ quyền anon):
-- ============================================
-- DROP POLICY IF EXISTS deals_weighbridge_select ON b2b.deals;
-- DROP POLICY IF EXISTS partners_weighbridge_select ON b2b.partners;
