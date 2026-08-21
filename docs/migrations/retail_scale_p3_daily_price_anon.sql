-- ============================================================================
-- CÂN MỦ LẺ — P3: cho app cân (role anon) ĐỌC bảng giá ngày
-- Ngày: 2026-08-21
--
-- VẤN ĐỀ: b2b.daily_price_list bật RLS và chỉ có policy cho `authenticated`
--   (daily_price_read / daily_price_auth_write / daily_price_service_all).
--   View public.b2b_daily_price_list là security_invoker ⇒ GRANT SELECT trên view KHÔNG
--   cứu được, RLS của base table vẫn chặn. Hệ quả: app cân (anon key, đăng nhập PIN)
--   đọc bảng giá ra 0 DÒNG mà KHÔNG báo lỗi — im lặng, rất khó lần ra.
--
-- Chỉ mở QUYỀN ĐỌC. Sửa/xoá giá vẫn là việc của ERP (authenticated) — app cân không
-- được phép đổi giá ngày.
--
-- Idempotent.
-- ============================================================================

-- 2 câu GRANT dưới đây là NO-OP trên DB hiện tại (anon đã sẵn có USAGE trên schema b2b và
-- SELECT trên bảng này — kiểm tra live 2026-08-21). Giữ lại để file tự đủ khi chạy trên môi
-- trường mới. ⚠ Chúng KHÔNG phải thứ migration này tạo ra → rollback KHÔNG được REVOKE.
GRANT USAGE ON SCHEMA b2b TO anon;
GRANT SELECT ON b2b.daily_price_list TO anon;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'b2b.daily_price_list'::regclass
      AND polname = 'daily_price_anon_read'
  ) THEN
    CREATE POLICY daily_price_anon_read ON b2b.daily_price_list
      FOR SELECT TO anon USING (true);
  END IF;
END $$;

COMMENT ON TABLE b2b.daily_price_list IS
  'Giá nền theo ngày cho từng loại mủ (product_code = mu_tap|mu_nuoc|...). '
  'anon (app cân, app Cân mủ lẻ) CHỈ ĐỌC. Đơn vị: VNĐ/kg. '
  'Quy ước tươi/khô KHÔNG lưu ở đây — hệ thống suy từ loại mủ: mu_nuoc = giá KHÔ '
  '(nhân DRC), mọi loại còn lại = giá TƯƠI. Xem billableWeight() trong paymentRequestService.';

NOTIFY pgrst, 'reload schema';

-- ─── VERIFY ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'b2b.daily_price_list'::regclass AND polname = 'daily_price_anon_read'
  ) THEN
    RAISE EXCEPTION 'P3 FAIL: chưa tạo được policy daily_price_anon_read';
  END IF;
  IF NOT has_table_privilege('anon', 'b2b.daily_price_list', 'SELECT') THEN
    RAISE EXCEPTION 'P3 FAIL: anon vẫn chưa có quyền SELECT trên b2b.daily_price_list';
  END IF;
  RAISE NOTICE 'P3 OK — anon đọc được bảng giá ngày';
END $$;

SELECT policyname, roles::text, cmd
FROM pg_policies
WHERE schemaname = 'b2b' AND tablename = 'daily_price_list'
ORDER BY policyname;

-- ─── GHI CHÚ VẬN HÀNH ────────────────────────────────────────────────────────
-- Bảng giá hiện ĐANG RỖNG (kiểm tra live 2026-08-21). App Cân mủ lẻ vẫn chạy được:
-- nó chỉ dùng giá ngày để GỢI Ý, còn thao tác viên luôn nhập/xác nhận đơn giá tại cân
-- (và app nhớ giá gõ gần nhất theo từng loại mủ). Muốn giá tự chảy về thì kế toán vào
-- ERP → Cài đặt → Bảng giá ngày, đặt giá cho product_code = 'mu_tap'.
--
-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   DROP POLICY IF EXISTS daily_price_anon_read ON b2b.daily_price_list;
--
-- ⚠ KHÔNG revoke. GRANT SELECT của anon trên b2b.daily_price_list đã có TỪ TRƯỚC migration
--   này (kiểm tra live 2026-08-21: p3 chưa chạy mà has_table_privilege('anon',
--   'b2b.daily_price_list','SELECT') đã = true) và là một phần của nền quyền cấp toàn schema b2b.
--   REVOKE sẽ biến bảng này thành bảng b2b DUY NHẤT anon không đọc được — tức đi XA HƠN
--   trạng thái trước migration, và là kiểu lệch quyền rất khó truy vết về sau.
--   Thứ p3 thực sự TẠO RA chỉ là policy daily_price_anon_read; rollback chỉ được gỡ đúng nó.
