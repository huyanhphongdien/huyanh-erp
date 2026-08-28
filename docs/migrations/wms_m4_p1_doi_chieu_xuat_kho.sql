-- ============================================================================
-- M4 · P1 — ĐỐI CHIẾU XUẤT KHO: LỆNH ĐIỀU XE ↔ SỔ CA
-- Ngày: 29/08/2026
--
-- VÌ SAO CHỈ ĐỐI CHIẾU, KHÔNG TRỪ KHO TỰ ĐỘNG
--
--   Sổ ca trừ kho theo ba chiều: (nhà máy, mã hàng, số bành). Chuỗi điều xe có SỐ BÀNH
--   và NGÀY rất tốt, nhưng THIẾU HAI CHIỀU CÒN LẠI:
--
--   · MÃ HÀNG — không bảng nào trong chuỗi bán có `material_id`. `dispatch_order_lines.grade`
--     là TEXT tự do, 10 cách viết cho ~5 loại. Chỉ 38/131 container đã giao suy ra được
--     ĐÚNG MỘT mã trong danh mục 24 mã; 65 container "SVR_10 @35kg" (39.384 bành) rơi vào
--     4 mã SWG/ATC/JK/STD mà không có ký tự nào trong toàn hệ thống phân biệt nổi.
--   · NHÀ MÁY — không có `facility_id` ở bất kỳ đâu trong chuỗi điều xe. 86/131 container
--     (65% khối lượng) không có bằng chứng nhà máy nào. Mà `v_shift_stock_balance` gộp
--     theo (facility_id, material_id) — thiếu nhà máy thì lượng xuất không rơi vào sổ nào.
--   · CA — `dispatch_date` là kiểu DATE, không có giờ. Sổ ca khoá theo (nhà máy, ngày, ca)
--     và một ngày có thể có 2–3 ca. Gán lượng xuất của một NGÀY vào một trong các CA đó:
--     gán cả hai là đếm đôi, gán một là tuỳ tiện. Không luật nào trong dữ liệu quyết được.
--
--   ⇒ Trừ kho tự động bây giờ là bịa ra ba con số. View này KHÔNG GHI GÌ, chỉ đặt hai
--     con số cạnh nhau theo NGÀY và để chênh lệch tự lộ ra.
--
-- TỜ GIẤY CHỨNG MINH VIỆC NÀY ĐÁNG LÀM
--   Tờ báo cáo ca 27/8/2026 có đúng một dòng xuất viết tay: SVR10 35 KG STD,
--   1.296 bành / 45.360 kg, và phần chân chép "cont 648b 22.680kg ×2, EITU0559651".
--   Tra DB: lệnh LDD-2608-028 ngày 27/8, status 'dispatched', 2 dòng, tổng ĐÚNG
--   1.296 bành / 45.360 kg, khách MAHANSARIA TYRES (= "MTPL" trên giấy).
--   ⇒ Nhà máy KHÔNG tự nghĩ ra số xuất — họ CHÉP từ chuyến xe. Hệ thống đã giữ đủ dữ kiện.
--   Cùng ngày còn lệnh LDD-2608-030 (648 bành) đang NHÁP và KHÔNG có trên giấy — đúng luật
--   `status <> 'draft'` mà CLAUDE.md đã ghi.
--
-- ⚠ DÙNG kg ĐỊNH MỨC (`weight_kg`), KHÔNG dùng cân thật (`actual_weight_kg`).
--   Tờ 27/8 ghi 45.360 = 1.296 × 35 (định mức), trong khi cân thật là 45.180. Lấy cân thật
--   là lệch sổ ngay ngày đầu tiên. Cân thật vẫn trả ra ở cột riêng để nhìn, không để cộng.
--
-- ⚠ CỐ Ý KHÔNG dùng `delivery_state = 'delivered'` làm mốc.
--   `v_sales_order_container_delivery` vẫn là định nghĩa DUY NHẤT của "container đã giao"
--   cho trục BÁN/TIỀN — không đụng vào. Nhưng câu hỏi của KHO khác: "hàng đã rời bãi chưa".
--   Có 14 container (287.280 kg) kẹt trạng thái 'dispatching' từ 19–62 ngày chỉ vì lệnh đã
--   phát hành mà bỏ trống `actual_weight_kg`. Khoá theo 'delivered' là bỏ quên 287 tấn đã
--   rời nhà máy. Ở đây mốc là ĐÃ PHÁT LỆNH (`status <> 'draft'`) — một khái niệm KHÁC, đặt
--   tên khác, và view vẫn trả `delivery_state` ra để thấy chỗ hai bên chưa khớp.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có lệnh BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================================

-- ─── 1) Hàng đã rời nhà máy, theo NGÀY và theo loại ghi trên lệnh ───────────
CREATE OR REPLACE VIEW public.v_xuat_kho_tu_lenh_dieu_xe AS
SELECT
  d.dispatch_date                                   AS ngay,
  -- `grade` là chữ tự do. Chuẩn hoá khoảng trắng/hoa-thường CHỈ để gộp cho đỡ vụn;
  -- giữ nguyên bản gốc ở cột bên cạnh để không ai tưởng hệ thống đã có danh mục loại.
  upper(regexp_replace(coalesce(d2.grade, '(không ghi)'), '\s+', ' ', 'g')) AS loai_hang,
  count(*)::int                                     AS so_container,
  sum(d2.package_count)::int                        AS so_banh,
  sum(d2.weight_kg)                                 AS kg_dinh_muc,
  sum(d2.actual_weight_kg)                          AS kg_can_that,
  -- Cỡ bành suy từ chính dòng lệnh. Ra số lạ = dữ liệu sai, xem cờ bên dưới.
  round(sum(d2.weight_kg) / nullif(sum(d2.package_count), 0), 2) AS kg_moi_banh,
  -- ⚠ Ba cờ chất lượng dữ liệu. Chúng là OUTPUT, không phải chuyện nội bộ: mỗi cờ bật
  --   nghĩa là con số bành/kg của ngày đó chưa chắc đúng, và người đối chiếu phải biết.
  count(*) FILTER (
    WHERE d2.package_count > 0
      AND round(d2.weight_kg / d2.package_count, 2) NOT IN (35.00, 33.33, 33.32, 30.00, 111.11)
  )::int                                            AS so_dong_kg_bat_thuong,
  count(*) FILTER (
    WHERE c.bale_count IS NOT NULL AND c.bale_count <> d2.package_count
  )::int                                            AS so_dong_lech_so_banh,
  count(*) FILTER (WHERE v.delivery_state IS DISTINCT FROM 'delivered')::int AS so_cont_chua_chot_giao
FROM public.dispatch_orders d
JOIN public.dispatch_order_lines d2 ON d2.dispatch_order_id = d.id
LEFT JOIN public.sales_order_containers c ON c.id = d2.sales_order_container_id
LEFT JOIN public.v_sales_order_container_delivery v ON v.container_id = d2.sales_order_container_id
WHERE d.status <> 'draft'          -- ⚠ lệnh nháp KHÔNG phải hàng đã đi. Xem chú thích đầu file.
  AND d.dispatch_date IS NOT NULL
GROUP BY d.dispatch_date, upper(regexp_replace(coalesce(d2.grade, '(không ghi)'), '\s+', ' ', 'g'));

ALTER VIEW public.v_xuat_kho_tu_lenh_dieu_xe SET (security_invoker = on);
GRANT SELECT ON public.v_xuat_kho_tu_lenh_dieu_xe TO authenticated;

COMMENT ON VIEW public.v_xuat_kho_tu_lenh_dieu_xe IS
  'Hàng đã rời nhà máy theo lệnh điều xe ĐÃ PHÁT HÀNH (status <> draft), gộp theo ngày + '
  'loại ghi trên lệnh. Dùng kg ĐỊNH MỨC, không dùng cân thật. KHÔNG phải định nghĩa '
  '"container đã giao" — cái đó là v_sales_order_container_delivery, dùng cho trục bán/tiền.';

-- ─── 2) Đối chiếu: lệnh điều xe nói gì ↔ sổ ca ghi gì ───────────────────────
-- Chỉ khoá theo NGÀY. KHÔNG khoá theo ca (lệnh không có giờ), KHÔNG khoá theo mã hàng
-- (lệnh không có material_id), KHÔNG khoá theo nhà máy (lệnh không có facility_id).
-- Cộng cả hai phía rồi đặt cạnh nhau — chênh lệch là thứ cần nhìn, không phải thứ cần giấu.
CREATE OR REPLACE VIEW public.v_doi_chieu_xuat_kho AS
WITH lenh AS (
  SELECT ngay,
         sum(so_container)::int AS so_container,
         sum(so_banh)::int      AS banh_theo_lenh,
         sum(kg_dinh_muc)       AS kg_theo_lenh,
         sum(so_dong_kg_bat_thuong)::int  AS co_kg_bat_thuong,
         sum(so_dong_lech_so_banh)::int   AS co_lech_so_banh,
         sum(so_cont_chua_chot_giao)::int AS co_chua_chot_giao
    FROM public.v_xuat_kho_tu_lenh_dieu_xe
   GROUP BY ngay
),
so_ca AS (
  -- Cộng mọi phiếu ca của ngày đó, mọi nhà máy, mọi ca — vì phía lệnh không tách được.
  -- Lấy CẢ phiếu chưa 'received': câu hỏi ở đây là "người ghi có ghi chưa", không phải
  -- "tồn kho đã đổi chưa". Trạng thái phiếu trả ra riêng ở cột dưới.
  SELECT v.report_date AS ngay,
         sum(v.xuat_banh)::int AS banh_theo_so_ca,
         sum(v.xuat_kg)        AS kg_theo_so_ca,
         count(DISTINCT v.report_id)::int AS so_phieu_ca,
         count(DISTINCT v.report_id) FILTER (WHERE v.status = 'received')::int AS so_phieu_da_nhan
    FROM public.v_shift_production_lines v
   GROUP BY v.report_date
)
SELECT
  coalesce(l.ngay, s.ngay)                       AS ngay,
  coalesce(l.so_container, 0)                    AS so_container,
  coalesce(l.banh_theo_lenh, 0)                  AS banh_theo_lenh,
  coalesce(l.kg_theo_lenh, 0)                    AS kg_theo_lenh,
  coalesce(s.banh_theo_so_ca, 0)                 AS banh_theo_so_ca,
  coalesce(s.kg_theo_so_ca, 0)                   AS kg_theo_so_ca,
  coalesce(l.banh_theo_lenh, 0) - coalesce(s.banh_theo_so_ca, 0) AS lech_banh,
  coalesce(s.so_phieu_ca, 0)                     AS so_phieu_ca,
  coalesce(s.so_phieu_da_nhan, 0)                AS so_phieu_da_nhan,
  coalesce(l.co_kg_bat_thuong, 0)                AS co_kg_bat_thuong,
  coalesce(l.co_lech_so_banh, 0)                 AS co_lech_so_banh,
  coalesce(l.co_chua_chot_giao, 0)               AS co_chua_chot_giao
FROM lenh l
FULL OUTER JOIN so_ca s ON s.ngay = l.ngay;

ALTER VIEW public.v_doi_chieu_xuat_kho SET (security_invoker = on);
GRANT SELECT ON public.v_doi_chieu_xuat_kho TO authenticated;

COMMENT ON VIEW public.v_doi_chieu_xuat_kho IS
  'Đối chiếu theo NGÀY: số bành rời nhà máy theo lệnh điều xe ↔ số bành sổ ca ghi xuất. '
  'CHỈ ĐỌC, không ghi gì. Không khoá theo ca/mã hàng/nhà máy vì lệnh điều xe không có ba '
  'chiều đó — xem chú thích đầu file wms_m4_p1.';

-- ─── KIỂM CHỨNG (chạy tay sau khi apply) ───────────────────────────────────
-- a) Hai view đọc được, có security_invoker và GRANT:
--    SELECT count(*) FROM v_xuat_kho_tu_lenh_dieu_xe;
--    SELECT count(*) FROM v_doi_chieu_xuat_kho;
--    SELECT reloptions::text FROM pg_class WHERE relname IN
--      ('v_xuat_kho_tu_lenh_dieu_xe','v_doi_chieu_xuat_kho');            -- {security_invoker=on} ×2
--
-- b) Ngày 27/8/2026 phải ra ĐÚNG 1.296 bành / 45.360 kg (loại lệnh nháp LDD-2608-030):
--    SELECT * FROM v_doi_chieu_xuat_kho WHERE ngay = '2026-08-27';
--
-- c) Cờ dữ liệu sai bắt được LDD-2607-025 (600 bành / 2.100 kg = 3,5 kg/bành):
--    SELECT ngay, loai_hang, so_dong_kg_bat_thuong FROM v_xuat_kho_tu_lenh_dieu_xe
--     WHERE so_dong_kg_bat_thuong > 0;
--
-- ─── CÒN NỢ — bốn việc ĐO ĐƯỢC để chuyển từ đối chiếu sang trừ kho tự động ──
-- 1. GHI `material_id` Ở MỨC CONTAINER. Chỗ đã dựng sẵn là `sales_order_container_items`
--    (đã có grade, bale_from, bale_to, bale_count, weight_kg — nhưng 0 DÒNG). Đây là ô gõ
--    tay DUY NHẤT còn thiếu; ngày, số bành, kg đều suy được. ĐỪNG tạo bảng mới.
-- 2. GHI NHÀ MÁY trên lệnh điều xe. `dispatch_orders` có 51 cột nhưng không có
--    `facility_id`. Hiện chỉ suy gián tiếp qua `weighbridge_ticket_id` (34/117 lệnh) và
--    qua `dispatch_order_lines.route` (text tự do, có cả 'Gia Lai' không thuộc 3 nhà máy).
-- 3. CHỐT MỘT NGUỒN SỐ BÀNH. `sum(package_count)` = 77.795 còn `sum(bale_count)` = 77.736,
--    lệch 59 bành trên đúng 2 container (EGHU3613246 630/600; DRYU2595106 605/576), và hai
--    dòng lệch về HAI HƯỚNG NGƯỢC NHAU nên không có luật "luôn tin cột X".
-- 4. THÊM UNIQUE trên `dispatch_order_lines(sales_order_container_id)` cho lệnh không nháp.
--    Chưa có; và đã có một lệnh nháp (LDD-2607-038) ôm sẵn 2 container đang nằm trên lệnh
--    đã phát hành ⇒ nếu lệnh nháp đó được phát hành thì trừ kho hai lần.
--
-- ─── HAI LỖI DỮ LIỆU ĐÃ ĐO ĐƯỢC, CẦN NGƯỜI SỬA ─────────────────────────────
-- A. LDD-2607-025 (KOHINOOR INDIA, 15/07/2026, status completed): 2 container
--    FCIU5653693 + TCLU7644596 ghi 600 bành nhưng weight_kg = 2.100 kg → 3,5 kg/bành.
--    Sai đúng 10 lần; đúng phải là 21.000 kg. Trừ kho theo kg và theo bành sẽ lệch
--    18.900 kg mỗi container.
-- B. 14 container (287.280 kg) kẹt 'dispatching' từ 27/06 đến 09/08 vì lệnh đã phát hành
--    mà bỏ trống `actual_weight_kg`. Hai trong số đó (CAAU2472469, SIKU3061119) đã có số
--    cân thật 11.305 kg ghi trên một dòng NHÁP từ 23/07. Mọi công thức khoá theo
--    `delivery_state='delivered'` đều bỏ qua chúng vĩnh viễn.
-- ============================================================================
