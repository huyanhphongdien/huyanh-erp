-- ============================================================================
-- M4 · P2 — LỆNH ĐÃ HUỶ KHÔNG PHẢI HÀNG ĐÃ ĐI
-- Ngày: 29/08/2026
--
-- MỘT LỖI, BA CHỖ, VÀ NÓ CÓ TRƯỚC M4
--
--   `dispatch_orders.status` cho phép NĂM giá trị:
--     draft · dispatched · in_transit · completed · CANCELLED
--   Nhưng mọi công thức trong hệ thống chỉ viết `status <> 'draft'`, tức **lệnh đã HUỶ
--   vẫn được tính là hàng đã rời nhà máy**.
--
--   Huỷ lệnh là đường sống, một cú bấm: `DispatchDetailPage.tsx` cho phép
--   dispatched→cancelled và in_transit→cancelled, và `setStatus` chỉ UPDATE mỗi cột
--   status — không xoá dòng lệnh, không xoá `dispatch_date`.
--
--   Hôm nay chưa phát tác vì DB có 0 dòng `cancelled` (94 dispatched · 18 draft ·
--   5 completed). Nghĩa là migration này KHÔNG đổi một con số nào hôm nay — nó bịt lỗ
--   trước lần huỷ lệnh đầu tiên. Bài tự kiểm của M4 xanh cũng chỉ vì lý do đó, chứ
--   không phải vì luật đúng.
--
-- ⚠ CHỖ THỨ BA MỚI ĐÁNG LO: `v_sales_order_container_delivery` — định nghĩa DUY NHẤT
--   của "container đã giao" mà CLAUDE.md phong, và là thứ mà A/R aging cùng sổ lô đều
--   đọc — dùng `status <> 'draft'` ở CẢ BA nhánh. Nghĩa là một lệnh bị huỷ vẫn làm
--   container thành 'delivered' và vẫn cấp `dispatch_date` cho cột tuổi nợ. Đây là lỗi
--   trên trục TIỀN, có từ trước M4. Sửa cùng lúc vì nó là CÙNG MỘT luật viết ở ba chỗ;
--   sửa một chỗ rồi để hai chỗ kia là đúng cái bẫy dự án cấm.
--
-- CHỖ THỨ TƯ, KHÁC GỐC NHƯNG CÙNG CHỮ "CANCELLED": CTE `so_ca` của
--   `v_doi_chieu_xuat_kho` không lọc trạng thái phiếu ca. `spr_status_check` cho phép
--   `cancelled`, và `cancelReport()` cố ý GIỮ LẠI dòng ("tờ giấy đã ký thì khoá").
--   Tệ hơn: khoá chống trùng là khoá RIÊNG PHẦN —
--     `spr_facility_date_shiftid_uniq ... WHERE status <> 'cancelled'`
--   cộng với `findReport()` dùng `.neq('status','cancelled')` — tức **huỷ-rồi-nhập-lại
--   chính là ĐƯỜNG SỬA SAI CHÍNH THỨC** của sổ ca. Mỗi lần ai đó sửa một phiếu nhập
--   nhầm, đối chiếu sẽ cộng cả phiếu cũ lẫn phiếu mới, và cột "Lệch" có thể ĐỔI DẤU —
--   báo sổ ca ghi THỪA trong khi sự thật là THIẾU. Người đi truy sẽ truy nhầm hướng.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có lệnh BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================================

-- ─── 1) Trục TIỀN: "container đã giao" không tính lệnh đã huỷ ───────────────
-- Chép nguyên định nghĩa đang chạy, chỉ đổi ba vế `status <> 'draft'` thành
-- `status NOT IN ('draft','cancelled')`. Không đụng gì khác.
CREATE OR REPLACE VIEW public.v_sales_order_container_delivery AS
SELECT id AS container_id,
    sales_order_id,
    lot_no,
    net_weight_kg,
    status AS container_status,
    CASE
        WHEN status::text = ANY (ARRAY['shipped'::character varying, 'delivered'::character varying]::text[])
            THEN 'delivered'::text
        WHEN (EXISTS ( SELECT 1
           FROM dispatch_order_lines dl
             JOIN dispatch_orders d ON d.id = dl.dispatch_order_id
          WHERE dl.sales_order_container_id = c.id
            AND dl.actual_weight_kg IS NOT NULL
            AND d.status NOT IN ('draft', 'cancelled'))) THEN 'delivered'::text
        WHEN (EXISTS ( SELECT 1
           FROM dispatch_order_lines dl
             JOIN dispatch_orders d ON d.id = dl.dispatch_order_id
          WHERE dl.sales_order_container_id = c.id
            AND d.status NOT IN ('draft', 'cancelled'))) THEN 'dispatching'::text
        ELSE NULL::text
    END AS delivery_state,
    ( SELECT max(d.dispatch_date) AS max
           FROM dispatch_order_lines dl
             JOIN dispatch_orders d ON d.id = dl.dispatch_order_id
          WHERE dl.sales_order_container_id = c.id
            AND d.status NOT IN ('draft', 'cancelled')) AS dispatch_date
   FROM sales_order_containers c;

COMMENT ON VIEW public.v_sales_order_container_delivery IS
  'Định nghĩa DUY NHẤT của "container đã giao". SQL và TypeScript đều đọc ở đây, đừng gõ '
  'lại luật chỗ khác. Luật loại CẢ lệnh nháp LẪN lệnh đã huỷ: dòng lệnh nháp vẫn có '
  'actual_weight_kg, còn lệnh huỷ thì hàng chưa bao giờ đi.';

-- ─── 2) Trục KHO: hàng rời nhà máy không tính lệnh đã huỷ ───────────────────
CREATE OR REPLACE VIEW public.v_xuat_kho_tu_lenh_dieu_xe AS
SELECT
  d.dispatch_date                                   AS ngay,
  upper(regexp_replace(coalesce(d2.grade, '(không ghi)'), '\s+', ' ', 'g')) AS loai_hang,
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
-- ⚠ PHẢI loại CẢ HAI. Bản p1 chỉ viết `<> 'draft'` nên lệnh đã huỷ vẫn được tính là hàng
--   đã đi: màn hình sẽ đòi sổ ca ghi xuất một lô hàng chưa bao giờ rời nhà máy, và KHÔNG
--   cờ nào bật để người đọc biết.
WHERE d.status NOT IN ('draft', 'cancelled')
  AND d.dispatch_date IS NOT NULL
GROUP BY d.dispatch_date, upper(regexp_replace(coalesce(d2.grade, '(không ghi)'), '\s+', ' ', 'g'));

ALTER VIEW public.v_xuat_kho_tu_lenh_dieu_xe SET (security_invoker = on);
GRANT SELECT ON public.v_xuat_kho_tu_lenh_dieu_xe TO authenticated;

-- ─── 3) Đối chiếu: không cộng phiếu ca đã huỷ ───────────────────────────────
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
  -- CỐ Ý lấy cả phiếu chưa 'received' (draft/submitted/qc_confirmed): câu hỏi ở đây là
  -- "người ghi đã ghi chưa", không phải "tồn kho đã đổi chưa".
  -- ⚠ NHƯNG phải loại 'cancelled'. Phiếu huỷ không phải "chưa nhận" mà là ĐÃ BỊ XOÁ HIỆU
  --   LỰC — và huỷ-rồi-nhập-lại chính là đường sửa sai chính thức của sổ ca (khoá chống
  --   trùng là khoá riêng phần `WHERE status <> 'cancelled'`, findReport cũng bỏ qua nó).
  --   Không lọc thì mỗi lần ai sửa một phiếu là đối chiếu cộng đôi, và cột Lệch ĐỔI DẤU.
  SELECT v.report_date AS ngay,
         sum(v.xuat_banh)::int AS banh_theo_so_ca,
         sum(v.xuat_kg)        AS kg_theo_so_ca,
         count(DISTINCT v.report_id)::int AS so_phieu_ca,
         count(DISTINCT v.report_id) FILTER (WHERE v.status = 'received')::int AS so_phieu_da_nhan
    FROM public.v_shift_production_lines v
   WHERE v.status <> 'cancelled'
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

-- ─── KIỂM CHỨNG (chạy tay sau khi apply) ───────────────────────────────────
-- a) KHÔNG đổi một con số nào hôm nay (vì 0 dòng cancelled):
--    SELECT sum(banh_theo_lenh), sum(kg_theo_lenh) FROM v_doi_chieu_xuat_kho;  -- 86.003 / 2.959.303,78
--    SELECT delivery_state, count(*) FROM v_sales_order_container_delivery
--     GROUP BY 1;                                                              -- delivered 131 · dispatching 14 · NULL 67
--    SELECT * FROM v_doi_chieu_xuat_kho WHERE ngay='2026-08-27';               -- 1.296 bành / 45.360 kg
--
-- b) Luật mới CHẶN được lệnh huỷ — kiểm bằng dữ liệu giả tự rollback
--    (DO $$ ... UPDATE status='cancelled' ... RAISE EXCEPTION $$).
--
-- c) Không còn chỗ nào trong DB dùng `<> 'draft'` một mình:
--    SELECT viewname FROM pg_views WHERE schemaname='public'
--      AND definition LIKE '%<> ''draft''%';                                   -- rỗng
--
-- ─── CÒN NỢ ────────────────────────────────────────────────────────────────
-- 1. `DELIVERED_CONTAINER_STATUSES` trong TypeScript (đường lùi khi không hỏi được view)
--    và mọi chỗ khác đọc `dispatch_orders.status` cần rà lại xem có chỗ nào cũng chỉ
--    loại 'draft' không. `dispatchService.getDeliveryStatus` thì đã chỉ select lại view.
-- 2. Hàm huỷ lệnh điều xe không hỏi lý do và không ghi ai huỷ. Sổ ca thì có
--    (`cancelReport` bắt nhập lý do). Nên đồng bộ.
-- ============================================================================
