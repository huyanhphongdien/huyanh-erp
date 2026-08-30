-- ============================================================================
-- M4 · P3 — DỌN BA LỖI DỮ LIỆU ĐÃ ĐO ĐƯỢC
-- Ngày: 29/08/2026
--
-- Ba việc nhỏ, mỗi việc đều được kiểm chứng bằng số độc lập trước khi sửa.
-- ⚠ Đây là migration SỬA DỮ LIỆU THẬT trên production, không phải đổi lược đồ.
--   Mọi câu UPDATE đều có mệnh đề khoá chặt vào đúng giá trị sai ⇒ chạy lại lần hai
--   không đụng gì (idempotent), và không bao giờ chạm vào dòng đã đúng.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có lệnh BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================================

-- ─── 1) LDD-2607-025: khối lượng sai đúng 10 lần ───────────────────────────
--
-- Hai container FCIU5653693 và TCLU7644596 ghi 600 bành nhưng 2.100 kg ⇒ 3,5 kg/bành.
-- Cả ba nơi đều ghi 2.100 (`weight_kg`, `actual_weight_kg`, và `net_weight_kg` của
-- container) — nên đây là MỘT lần gõ sai lan ra ba chỗ, không phải ba lỗi.
--
-- SỐ ĐÚNG LÀ 21.000, xác định bằng BA nguồn độc lập cùng khớp trên đơn SO-2026-0081:
--   · `sales_order_items.total_bales` 1.200 × `bale_weight_kg` 35   = 42.000 kg
--   · `sales_order_items.quantity_kg`                               = 42.000 kg
--   · 42 tấn × `unit_price` 2.290 USD/tấn = 96.180 = `total_value_usd` ✓
--   ⇒ mỗi container 42.000 / 2 = 21.000 kg, tức 600 bành × 35 kg/bành.
--
-- ⚠ Về `actual_weight_kg`: cột này là số CÂN THẬT, khác số định mức (ví dụ LDD-2608-028
--   định mức 45.360 nhưng cân thật 45.180). Ở đây nó cũng bị lan cùng lỗi gõ. Sửa nó
--   thành 21.000 là SỬA LẠI CHỖ TRƯỢT DẤU PHẨY, **không phải cân lại** — con số thật có
--   thể lệch vài chục kg. Logistics nên đối chiếu lại với phiếu cân của chuyến đó.
UPDATE public.dispatch_order_lines l
   SET weight_kg        = 21000,
       actual_weight_kg = CASE WHEN l.actual_weight_kg = 2100 THEN 21000 ELSE l.actual_weight_kg END,
       updated_at       = now()
  FROM public.dispatch_orders d
 WHERE d.id = l.dispatch_order_id
   AND d.code = 'LDD-2607-025'
   AND l.package_count = 600
   AND l.weight_kg = 2100;          -- khoá vào đúng giá trị sai ⇒ chạy lại không đụng gì

UPDATE public.sales_order_containers
   SET net_weight_kg = 21000
 WHERE container_no IN ('FCIU5653693', 'TCLU7644596')
   AND bale_count = 600
   AND net_weight_kg = 2100;

-- ─── 2) Một dòng ghi "SVR 10" thay vì "SVR_10" ─────────────────────────────
--
-- 87 dòng dùng `SVR_10`, đúng một dòng gõ `SVR 10` (dấu cách). Cùng mặt hàng, hai cách
-- viết ⇒ đối chiếu tách nó thành hai loại.
--
-- ⚠ CỐ Ý CHỈ SỬA ĐÚNG CHUỖI NÀY. KHÔNG động vào các chuỗi MIXTURE dài
--   ("MIXTURES OF NATURAL RUBBER SVR10 AND SBR1502 (97.5% SVR10; 2.5% SBR 1502)") —
--   chúng là MÔ TẢ HÀNG HOÁ trên chứng từ hải quan, xuất hiện y hệt ở `sales_orders.grade`
--   và được in thẳng lên Commercial Invoice (`ExportDocumentsPage`:
--   `NATURAL RUBBER ${grade.replace(/_/g,' ')}`). Rút gọn chúng thành mã ngắn là sửa
--   chứng từ gửi khách hàng — không phải việc của một đợt dọn dữ liệu.
UPDATE public.dispatch_order_lines
   SET grade = 'SVR_10', updated_at = now()
 WHERE grade = 'SVR 10';

-- ─── 3) Gộp loại hàng: thiếu btrim nên khoảng trắng cuối tách đôi một mặt hàng ──
--
-- Bản p1 chuẩn hoá bằng `upper(regexp_replace(grade,'\s+',' ','g'))`. Nó gom được khoảng
-- trắng BÊN TRONG nhưng KHÔNG cắt khoảng trắng ĐẦU/CUỐI ⇒ hai dòng cùng một mặt hàng,
-- khác nhau đúng một dấu cách ở cuối, vẫn bị đếm thành hai loại.
-- Đo được: 10 cách viết → gộp hiện tại vẫn 10 → thêm `btrim` còn 9.
CREATE OR REPLACE VIEW public.v_xuat_kho_tu_lenh_dieu_xe AS
SELECT
  d.dispatch_date                                   AS ngay,
  btrim(upper(regexp_replace(coalesce(d2.grade, '(không ghi)'), '\s+', ' ', 'g'))) AS loai_hang,
  count(*)::int                                     AS so_container,
  sum(d2.package_count)::int                        AS so_banh,
  sum(d2.weight_kg)                                 AS kg_dinh_muc,
  sum(d2.actual_weight_kg)                          AS kg_can_that,
  round(sum(d2.weight_kg) / nullif(sum(d2.package_count), 0), 2) AS kg_moi_banh,
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
WHERE d.status NOT IN ('draft', 'cancelled')   -- lệnh nháp và lệnh huỷ đều không phải hàng đã đi
  AND d.dispatch_date IS NOT NULL
GROUP BY d.dispatch_date,
         btrim(upper(regexp_replace(coalesce(d2.grade, '(không ghi)'), '\s+', ' ', 'g')));

ALTER VIEW public.v_xuat_kho_tu_lenh_dieu_xe SET (security_invoker = on);
GRANT SELECT ON public.v_xuat_kho_tu_lenh_dieu_xe TO authenticated;

-- ─── 4) Danh sách container đã phát lệnh mà chưa có số cân thật ─────────────
--
-- ⚠ KHÔNG tự điền `actual_weight_kg`. Đó là số CÂN THẬT — bịa ra một con số cân là làm
--   hỏng đúng cột sinh ra để giữ sự thật. 12/14 container này đã có `net_weight_kg` đầy
--   đủ (20.160 hoặc 22.680 = số ĐỊNH MỨC), nên cái thiếu chính xác là phép cân, không
--   phải phép nhân. Việc của phần mềm là chỉ tên ra để người có phiếu cân điền vào.
CREATE OR REPLACE VIEW public.v_cont_chua_co_can_that AS
SELECT
  c.id                                              AS container_id,
  c.container_no,
  c.bale_count,
  c.net_weight_kg                                   AS kg_dinh_muc,
  v.dispatch_date                                   AS ngay_phat_lenh,
  (CURRENT_DATE - v.dispatch_date)                  AS so_ngay_treo,
  (SELECT string_agg(DISTINCT d.code, ', ' ORDER BY d.code)
     FROM public.dispatch_order_lines dl
     JOIN public.dispatch_orders d ON d.id = dl.dispatch_order_id
    WHERE dl.sales_order_container_id = c.id
      AND d.status NOT IN ('draft','cancelled'))    AS cac_lenh
FROM public.v_sales_order_container_delivery v
JOIN public.sales_order_containers c ON c.id = v.container_id
WHERE v.delivery_state = 'dispatching';

ALTER VIEW public.v_cont_chua_co_can_that SET (security_invoker = on);
GRANT SELECT ON public.v_cont_chua_co_can_that TO authenticated;

COMMENT ON VIEW public.v_cont_chua_co_can_that IS
  'Container đã phát lệnh điều xe nhưng dòng lệnh còn trống actual_weight_kg, nên chưa được '
  'coi là "đã giao". Không phải hàng đang trên đường — là ô chưa ai điền. Phần mềm chỉ tên, '
  'người có phiếu cân điền.';

-- ─── KIỂM CHỨNG (chạy tay sau khi apply) ───────────────────────────────────
-- a) LDD-2607-025 hết bất thường:
--    SELECT so_dong_kg_bat_thuong FROM v_xuat_kho_tu_lenh_dieu_xe WHERE ngay='2026-07-15'; -- 0
--    SELECT sum(net_weight_kg) FROM sales_order_containers
--     WHERE container_no IN ('FCIU5653693','TCLU7644596');                                  -- 42000
-- b) Không còn "SVR 10" dấu cách:
--    SELECT count(*) FROM dispatch_order_lines WHERE grade = 'SVR 10';                      -- 0
-- c) Gộp loại hàng còn 9 thay vì 10:
--    SELECT count(DISTINCT loai_hang) FROM v_xuat_kho_tu_lenh_dieu_xe;
-- d) Danh sách chờ cân:
--    SELECT count(*) FROM v_cont_chua_co_can_that;                                          -- 14
--
-- ─── CÒN NỢ ────────────────────────────────────────────────────────────────
-- 1. `actual_weight_kg` của LDD-2607-025 được đặt 21.000 theo phép sửa dấu phẩy, KHÔNG
--    phải theo phiếu cân. Logistics nên đối chiếu lại với phiếu cân chuyến 15/07/2026.
-- 2. 14 container trong `v_cont_chua_co_can_that` chờ người điền số cân. Cho tới lúc đó
--    chúng không được tính là "đã giao", nên cũng chưa vào cột tuổi nợ của A/R.
-- 3. Hai dòng lệch số bành (EGHU3613246 630/600 · DRYU2595106 605/576) CHƯA sửa: hai dòng
--    lệch về HAI HƯỚNG NGƯỢC NHAU nên không có luật "luôn tin cột nào". Phải hỏi người.
-- ============================================================================
