-- ============================================================================
-- M3 · P3 — SỔ CA ÉP BÀNH DÙNG DANH MỤC CA CÓ SẴN
-- Ngày: 28/08/2026
--
-- VÌ SAO PHẢI SỬA
--   P2 để cột `shift` là chuỗi '1'/'2'/'3' (ràng buộc kế thừa từ
--   `sx1_production_mes.sql:52`), rồi màn hình mới tự gán nghĩa cho hai chuỗi đó:
--   '1' = ca ngày 06:00–18:00, '2' = ca đêm 18:00–06:00.
--   Đó là BỊA RA DANH MỤC CA THỨ HAI, trong khi công ty đã có danh mục thật:
--
--     bảng `shifts` — 7 ca, đều đang sống:
--       LONG_DAY   06:00–18:00      SHORT_1  06:00–14:00
--       LONG_NIGHT 18:00–06:00      SHORT_2  14:00–22:00
--       ADMIN_PROD 07:00–17:00      SHORT_3  22:00–06:00
--       ADMIN_OFFICE 08:00–17:00
--
--   Danh mục đó không phải bảng seed chết: 7.096 dòng `shift_assignments`
--   (phân ca theo ngày cho từng nhân viên, tới 31/12/2026) và 756 dòng chấm công
--   tháng 8/2026 đều trỏ vào nó bằng khoá ngoại uuid. `attendance`,
--   `shift_assignments`, `department_shift_config`, `overtime_requests` — cả bốn
--   đều FK → shifts(id). Chỉ `shift_production_reports` đứng ngoài.
--
--   Và hai nghĩa đã bắt đầu đánh nhau thật:
--     src/pages/production/ShiftReportPage.tsx:16   hiểu '1' = ca NGẮN 06–14h
--     src/pages/wms/production/ShiftBookEntryPage.tsx:44 hiểu '1' = ca DÀI 06–18h
--   Cùng một cột, hai nghĩa trái nhau, không ai báo lỗi.
--
--   Tờ giấy ngày 27/8/2026 lại ghi ca chạy "đến 22h" — tức SHORT_2 (14–22h),
--   một ca mà mảng hai-ca-mười-hai-tiếng của màn hình mới KHÔNG diễn đạt nổi.
--
-- VÌ SAO ĐỔI ĐƯỢC NGAY, KHÔNG ĐAU
--   `shift_production_reports` và `shift_production_lines` đều đang 0 dòng.
--   Không có dữ liệu nào phải chuyển đổi. Đây là thời điểm rẻ nhất để sửa.
--
-- CHỌN KHOÁ NGOẠI, KHÔNG CHỌN "GIỮ CHUỖI RỒI ÁNH XẠ"
--   Ánh xạ '1'→LONG_DAY nghĩa là chép tên ca sang bảng sổ. Hôm nào nhà máy đổi
--   giờ ca trong danh mục thì hai chỗ lệch nhau, và không ai biết chỗ nào đúng.
--   Cột `shift` cũ GIỮ LẠI (đường lùi) nhưng NGỪNG GHI — hai cột cùng mang nghĩa
--   "ca" mà cùng được ghi thì đó đúng là hai nguồn sự thật.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN/COMMIT (lỗi 0A000).
-- ============================================================================

-- ─── 1) Cột khoá ngoại trỏ vào danh mục ca ─────────────────────────────────
ALTER TABLE public.shift_production_reports
  ADD COLUMN IF NOT EXISTS shift_id uuid REFERENCES public.shifts(id);

COMMENT ON COLUMN public.shift_production_reports.shift_id IS
  'Ca làm việc, trỏ vào danh mục ca dùng chung (bảng shifts) — cùng danh mục mà '
  'chấm công và phân ca đang dùng. Đây là nguồn sự thật DUY NHẤT về ca của phiếu.';

-- ─── 2) Chuyển những dòng cũ (nếu có) sang khoá ngoại ──────────────────────
-- Bảng đang 0 dòng nên thực tế không đụng gì. Vẫn viết để migration đúng cả khi
-- chạy trên một bản sao đã có dữ liệu.
-- Ánh xạ theo đúng nghĩa mà trang cũ tự khai ở ShiftReportPage.tsx:16
--   '1' = Ca 1 (6-14h) = SHORT_1 · '2' = Ca 2 (14-22h) = SHORT_2 · '3' = Ca 3 (22-6h) = SHORT_3
UPDATE public.shift_production_reports r
   SET shift_id = s.id
  FROM public.shifts s
 WHERE r.shift_id IS NULL
   AND s.code = CASE r.shift WHEN '1' THEN 'SHORT_1'
                             WHEN '2' THEN 'SHORT_2'
                             WHEN '3' THEN 'SHORT_3' END;

-- ─── 3) Gỡ ràng buộc cũ, buộc ràng buộc mới ────────────────────────────────
ALTER TABLE public.shift_production_reports
  DROP CONSTRAINT IF EXISTS shift_production_reports_shift_check;

-- Cột chuỗi cũ: cho phép NULL để đường ghi mới không phải bịa giá trị cho nó.
ALTER TABLE public.shift_production_reports
  ALTER COLUMN shift DROP NOT NULL;

COMMENT ON COLUMN public.shift_production_reports.shift IS
  'CỘT CŨ, KHÔNG GHI NỮA. Chuỗi ''1''/''2''/''3'' của migration MES cũ, hai nơi '
  'trong code từng hiểu khác nhau (ca ngắn 6-14h vs ca dài 6-18h). Ca thật đọc ở '
  'shift_id. Giữ cột để lùi được, sẽ xoá khi chắc chắn không còn ai đọc.';

-- shift_id bắt buộc: một phiếu ca mà không biết là ca nào thì vô nghĩa.
-- Đặt được ngay vì bảng 0 dòng (và bước 2 đã lấp mọi dòng cũ nếu có).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.shift_production_reports WHERE shift_id IS NULL) THEN
    RAISE EXCEPTION 'Còn % phiếu chưa có shift_id — dừng lại, xem lại bước 2 trước khi ép NOT NULL',
      (SELECT count(*) FROM public.shift_production_reports WHERE shift_id IS NULL);
  END IF;
  ALTER TABLE public.shift_production_reports ALTER COLUMN shift_id SET NOT NULL;
END $$;

-- ─── 4) Dựng lại khoá chống trùng phiếu ────────────────────────────────────
-- ⚠ Khoá cũ dựa vào cột `shift`. Ngừng ghi cột đó mà không dựng lại khoá thì
--   `shift` sẽ NULL, và trong Postgres NULL ≠ NULL ⇒ cùng nhà máy, cùng ngày,
--   cùng ca vẫn tạo được nhiều phiếu. Đúng cái bẫy mà P2 đã gỡ một lần cho line_id.
DROP INDEX IF EXISTS public.spr_facility_date_shift_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS spr_facility_date_shiftid_uniq
  ON public.shift_production_reports (facility_id, report_date, shift_id)
  WHERE status <> 'cancelled';

-- ─── 5) Hai view đọc lại theo ca thật ──────────────────────────────────────
-- ⚠ CREATE OR REPLACE VIEW chỉ THÊM được cột ở cuối, không đổi được cột đã có
--   ⇒ phải DROP rồi tạo lại. Thứ tự bắt buộc: v_shift_stock_balance phụ thuộc
--   v_shift_production_lines nên phải xoá con trước.
DROP VIEW IF EXISTS public.v_shift_stock_balance;
DROP VIEW IF EXISTS public.v_shift_production_lines;

CREATE VIEW public.v_shift_production_lines AS
SELECT
  l.id, l.report_id, l.material_id,
  m.sort_order, m.code, m.sku, m.name AS material_name, m.unit, m.weight_per_unit,
  r.facility_id, r.report_date, r.status,
  r.shift_id,
  s.code AS shift_code,
  s.name AS shift_name,
  -- Giờ ca: lấy giờ chuẩn của danh mục, chỉ dùng số ghi tay khi ca chạy lệch giờ.
  -- Cùng quy tắc với kilogam: tính được thì tính, ngoại lệ thì lấy số đã lưu.
  COALESCE(r.shift_from, s.start_time) AS gio_bat_dau,
  COALESCE(r.shift_to,   s.end_time)   AS gio_ket_thuc,
  l.nhap_banh, l.xuat_banh,
  COALESCE(l.nhap_kg_manual, round(l.nhap_banh * m.weight_per_unit, 2)) AS nhap_kg,
  COALESCE(l.xuat_kg_manual, round(l.xuat_banh * m.weight_per_unit, 2)) AS xuat_kg,
  (m.weight_per_unit IS NULL)                                           AS phai_nhap_kg_tay,
  l.nhap_kg_manual, l.xuat_kg_manual,
  l.note, l.created_at, l.updated_at
FROM public.shift_production_lines l
JOIN public.materials m ON m.id = l.material_id
JOIN public.shift_production_reports r ON r.id = l.report_id
JOIN public.shifts s ON s.id = r.shift_id;

ALTER VIEW public.v_shift_production_lines SET (security_invoker = on);
GRANT SELECT ON public.v_shift_production_lines TO authenticated;

CREATE VIEW public.v_shift_stock_balance AS
SELECT
  v.facility_id,
  v.material_id,
  v.sort_order, v.code, v.material_name, v.unit, v.weight_per_unit,
  sum(v.nhap_banh)::int                      AS tong_nhap_banh,
  sum(v.xuat_banh)::int                      AS tong_xuat_banh,
  (sum(v.nhap_banh) - sum(v.xuat_banh))::int AS ton_banh,
  round(sum(v.nhap_kg) - sum(v.xuat_kg), 2)  AS ton_kg,
  max(v.report_date)                         AS ngay_gan_nhat
FROM public.v_shift_production_lines v
WHERE v.status = 'received'   -- ⚠ chỉ phiếu đủ ba chữ ký mới được đụng vào tồn kho
GROUP BY v.facility_id, v.material_id, v.sort_order, v.code, v.material_name, v.unit, v.weight_per_unit;

ALTER VIEW public.v_shift_stock_balance SET (security_invoker = on);
GRANT SELECT ON public.v_shift_stock_balance TO authenticated;

-- ─── 6) KIỂM CHỨNG (chạy tay sau khi apply) ────────────────────────────────
-- a) Cột và ràng buộc:
--    SELECT is_nullable FROM information_schema.columns
--     WHERE table_name='shift_production_reports' AND column_name='shift_id';        -- NO
--    SELECT count(*) FROM pg_constraint
--     WHERE conname='shift_production_reports_shift_check';                          -- 0
--    SELECT indexdef FROM pg_indexes WHERE indexname='spr_facility_date_shiftid_uniq';
--
-- b) Hai view đọc được và có cột ca:
--    SELECT count(*) FROM v_shift_production_lines;                                  -- 0
--    SELECT count(*) FROM v_shift_stock_balance;                                     -- 0
--    SELECT column_name FROM information_schema.columns
--     WHERE table_name='v_shift_production_lines'
--       AND column_name IN ('shift_id','shift_code','shift_name','gio_bat_dau','gio_ket_thuc');  -- 5
--
-- c) Danh mục ca đọc được từ vai authenticated:
--    SELECT code, name, start_time, end_time FROM shifts
--     WHERE is_active AND shift_category IN ('short','long') ORDER BY start_time;    -- 5 ca
--
-- ─── CÒN NỢ ────────────────────────────────────────────────────────────────
-- 1. Dòng "CHÈN:" trên biểu mẫu: chủ doanh nghiệp xác nhận 28/08/2026 rằng CHÈN là
--    HÀNH ĐỘNG phối trộn ("hàng không đạt đem ra chèn, hoặc mua hàng thành phẩm về
--    chèn vào"), không phải một mặt hàng. Nhưng file Excel gốc của biểu mẫu cho thấy
--    dòng 34 ("CHÈN:") có vân tay định dạng TRÙNG TỪNG Ô với dòng 33 ("SẢN PHẨM LÕI")
--    và khác hẳn dòng 35 ("TỔNG:") ⇒ tờ giấy VẪN dành cho nó đủ 6 ô số.
--    Mọi tờ thu thập được đều để trống dòng đó, nên chưa ai biết người ghi điền gì.
--    ⇒ CHƯA đổi mô hình dữ liệu. Giữ nguyên mã CHEN cho tới khi nhà máy trả lời:
--      trên dòng CHÈN ghi khối lượng ĐEM RA chèn hay khối lượng MUA VỀ để chèn,
--      và có gắn với một mã hàng cụ thể không.
--    Chỗ đúng về lâu dài là stock_out_orders.reason='blend' +
--    inventory_transactions type 'blend_in'/'blend_out' (schema đã có sẵn),
--    và blend_orders cần thêm material_id đích — hiện chỉ có target_grade/target_drc
--    nên chưa diễn đạt nổi "SVR10 + hàng CXL → SVR10 MIX 1502 35KG". Cả 3 bảng
--    blend_* đang 0 dòng.
-- 2. Biểu mẫu CL.BMQT.SX.04.06 KHÔNG có ô "Tổ" (đầu biểu mẫu chỉ có: Ngày, Ca làm
--    việc, Từ…đến…, Số công nhân, Khối lượng). Tên màu 'Vàng'/'Đen' nằm ở cột
--    "Ca làm việc" của SỔ THEO DÕI LÔ — sổ khác. Màn hình đã bỏ ô Tổ; cột `team`
--    giữ nguyên trong bảng nhưng không ghi nữa, chờ nhà máy xác nhận Vàng/Đen là
--    tên KÍP hay là cách gọi ca.
-- 3. Trang cũ `/production/shift-reports` và `/production/oee` đọc chung bảng này.
--    ⚠ ĐÍNH CHÍNH 29/08/2026: bản đầu của chú thích này viết chúng "ghi thẳng vào bảng,
--    không qua ba chữ ký" — SAI. Cả hai trang CHỈ ĐỌC. Đường ghi duy nhất là
--    `shiftReportService.create()`, và hàm đó KHÔNG CÓ NƠI NÀO GỌI — mã chết.
--    ⇒ Không có đường nào vòng qua ba chữ ký. Mức khẩn thấp hơn tưởng.
--    Vẫn nên gỡ, nhưng vì là mã chết và vì chúng đọc cột `shift` hai nghĩa, chứ không
--    phải vì đang ghi đè sổ. Bản vá thêm `shift_id` vào `create()` cũng vì thế là bản vá
--    không bao giờ chạy.
--    (Đường dẫn thật KHÔNG có tiền tố /wms — xem App.tsx, chúng nằm ngoài <Route path="wms">.)
-- ============================================================================
