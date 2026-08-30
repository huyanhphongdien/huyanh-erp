-- ============================================================================
-- SOI LẠI TOÀN BỘ MODULE KHO — BỊT CÁC LỖ HỔNG
-- Ngày: 29/08/2026
--
-- Sau khi làm xong M3 / M3b / M4 / M6, cho soi đối kháng toàn bộ: 37 nghi vấn,
-- 33 lỗi thật sau kiểm chứng, 15 nặng, 4 chặn đường. File này bịt phần thuộc về DB.
--
-- ⚠ MỌI LỖI DƯỚI ĐÂY ĐỀU KHÔNG PHÁT TÁC HÔM NAY vì các bảng nghiệp vụ đang 0 dòng.
--   Đó chính là lý do bài tự kiểm của tôi xanh. Nhánh nào chưa có dữ liệu thì chưa ai
--   đi qua — không phải bằng chứng luật đúng.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có lệnh BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================================

-- ─── 1) LỖ BẢO MẬT: view "container đã giao" đọc được KHI CHƯA ĐĂNG NHẬP ────
--
-- `v_sales_order_container_delivery` KHÔNG có `security_invoker` ⇒ nó chạy bằng quyền
-- CHỦ SỞ HỮU, bỏ qua RLS của `sales_order_containers`. Đã thử bằng khoá anon (chưa đăng
-- nhập): đọc được thẳng danh sách container.
-- Đây là dữ liệu bán hàng — số container, số lô, khối lượng, mã đơn.
--
-- ⚠ Tôi là người sửa view này gần nhất (`wms_m4_p2`) nên dù nguyên nhân gốc là gì, đây
--   là chỗ tôi phải kiểm mà đã không kiểm. Ba view khác của cùng đợt đều có cờ; chỉ view
--   này thiếu — tức là kiểm một cái rồi suy ra ba cái kia, thay vì kiểm cả bốn.
ALTER VIEW public.v_sales_order_container_delivery SET (security_invoker = on);

-- ─── 2) Trigger ký chỉ gác UPDATE ⇒ INSERT thẳng phiếu 'received' là xong ──
--
-- `trg_shift_book_chan_ky` là BEFORE UPDATE. Chèn thẳng một phiếu `status='received'`
-- không qua chữ ký nào, và tồn kho đổi ngay.
CREATE OR REPLACE FUNCTION public.trg_shift_book_chan_ky()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE v_buoc text;
BEGIN
  -- Phiếu mới CHỈ được sinh ra ở trạng thái 'draft'. Mọi trạng thái khác phải đi qua
  -- ba chữ ký. (Ngoại lệ: phiếu MỞ SỔ mang tồn đầu kỳ — xem mục 6.)
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'draft' AND NOT coalesce(NEW.is_opening, false) THEN
      RAISE EXCEPTION 'Phiếu ca mới phải bắt đầu ở trạng thái nháp, không tạo thẳng ở "%".', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;   -- sửa số liệu đầu phiếu, không phải ký
  END IF;

  v_buoc := CASE
    WHEN OLD.status = 'draft'        AND NEW.status = 'submitted'    THEN 'submit'
    WHEN OLD.status = 'submitted'    AND NEW.status = 'qc_confirmed' THEN 'qc_confirm'
    WHEN OLD.status = 'qc_confirmed' AND NEW.status = 'received'     THEN 'receive'
    WHEN NEW.status = 'cancelled'    AND OLD.status <> 'received'    THEN 'cancel'
    ELSE NULL
  END;

  IF v_buoc IS NULL THEN
    RAISE EXCEPTION 'Phiếu ca không đi được từ "%" sang "%". Ba chữ ký phải đi đúng thứ tự: sản xuất giao → QC xác nhận → thủ kho nhận.',
      OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.fn_shift_book_duoc_ky(v_buoc, NEW.facility_id) THEN
    RAISE EXCEPTION '%', CASE v_buoc
      WHEN 'qc_confirm' THEN 'Chỉ Phòng QC mới xác nhận được chất lượng ca này.'
      WHEN 'receive'    THEN 'Chỉ người được chỉ định làm thủ kho mới nhận hàng vào kho được.'
      ELSE 'Bạn không có quyền thực hiện bước này.'
    END USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_shift_book_chan_ky ON public.shift_production_reports;
CREATE TRIGGER trg_shift_book_chan_ky
  BEFORE INSERT OR UPDATE ON public.shift_production_reports
  FOR EACH ROW EXECUTE FUNCTION public.trg_shift_book_chan_ky();

-- ─── 3) Chữ ký thứ ba KHÔNG khoá gì cả: sửa được số của phiếu đã nhận ──────
--
-- Trigger ký gác bảng CHA, nhưng con số làm đổi tồn kho nằm ở bảng CON
-- `shift_production_lines` — bảng đó không có trigger, và policy là
-- `FOR ALL USING(true) WITH CHECK(true)`.
-- Đã thử: ký đủ ba bước (tồn 3.500 kg) rồi UPDATE dòng thành 9.999 bành ⇒ tồn nhảy lên
-- 349.965 kg, status vẫn 'received', không lỗi, không dấu vết. DELETE và INSERT cũng lọt.
--
-- ⇒ Vi phạm thẳng luật bất biến "chỉ chữ ký thứ BA mới làm tồn kho đổi": sau chữ ký đó,
--   ai cũng đổi được tồn mà không cần chữ ký nào.
CREATE OR REPLACE FUNCTION public.trg_shift_lines_khoa_phieu_da_nhan()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE v_rep uuid; v_status text;
BEGIN
  v_rep := coalesce(NEW.report_id, OLD.report_id);
  SELECT status INTO v_status FROM public.shift_production_reports WHERE id = v_rep;

  IF v_status IN ('received', 'cancelled') THEN
    -- Cho service_role / chạy tay qua SQL đi qua, cùng lý do với fn_shift_book_duoc_ky.
    IF auth.uid() IS NULL THEN RETURN coalesce(NEW, OLD); END IF;
    RAISE EXCEPTION 'Phiếu ca đã ở trạng thái "%" — không sửa được số liệu nữa. Sai thì lập phiếu điều chỉnh.', v_status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN coalesce(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_shift_lines_khoa ON public.shift_production_lines;
CREATE TRIGGER trg_shift_lines_khoa
  BEFORE INSERT OR UPDATE OR DELETE ON public.shift_production_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_shift_lines_khoa_phieu_da_nhan();

-- ─── 4) Cổng thủ kho khoá chết hai nhà máy còn lại ─────────────────────────
--
-- Vế "đã có ai được chỉ định chưa" hỏi TOÀN HỆ THỐNG, còn vế cho phép lại khớp THEO
-- NHÀ MÁY. Chỉ định một người ở Phong Điền ⇒ Tân Lâm và Lào có `v_co_ai = true` nhưng
-- không ai khớp ⇒ **không ai nhận kho được ở hai nhà máy đó**, và không có gì báo vì sao.
CREATE OR REPLACE FUNCTION public.fn_shift_book_duoc_ky(p_buoc text, p_facility_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emp uuid; v_level int; v_dept text; v_co_ai boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN true; END IF;

  SELECT e.id, COALESCE(p.level, 99), upper(COALESCE(d.code, ''))
    INTO v_emp, v_level, v_dept
    FROM public.employees e
    LEFT JOIN public.positions   p ON p.id = e.position_id
    LEFT JOIN public.departments d ON d.id = e.department_id
   WHERE e.user_id = auth.uid();

  IF v_emp IS NULL THEN RETURN false; END IF;
  IF v_level <= 3 THEN RETURN true; END IF;

  CASE p_buoc
    WHEN 'submit' THEN RETURN true;
    WHEN 'qc_confirm' THEN RETURN v_dept = 'HAP-QC';
    WHEN 'receive' THEN
      -- ⚠ Hỏi "đã có ai cho CHÍNH NHÀ MÁY NÀY chưa", không hỏi toàn hệ thống.
      SELECT EXISTS (
        SELECT 1 FROM public.shift_book_thu_kho t
         WHERE t.is_active
           AND (t.facility_id IS NULL OR p_facility_id IS NULL OR t.facility_id = p_facility_id)
      ) INTO v_co_ai;
      IF NOT v_co_ai THEN RETURN true; END IF;   -- chưa chỉ định ai cho nhà máy này ⇒ mở
      RETURN EXISTS (
        SELECT 1 FROM public.shift_book_thu_kho t
         WHERE t.is_active AND t.employee_id = v_emp
           AND (t.facility_id IS NULL OR p_facility_id IS NULL OR t.facility_id = p_facility_id)
      );
    WHEN 'cancel' THEN RETURN true;
    ELSE RETURN false;
  END CASE;
END $$;

-- `fn_shift_book_quyen` cũng phải hỏi theo nhà máy, nếu không màn hình báo "chưa chỉ định"
-- trong khi cổng đã đóng, hoặc ngược lại.
CREATE OR REPLACE FUNCTION public.fn_shift_book_quyen(p_facility_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT json_build_object(
    'submit',     public.fn_shift_book_duoc_ky('submit',     p_facility_id),
    'qc_confirm', public.fn_shift_book_duoc_ky('qc_confirm', p_facility_id),
    'receive',    public.fn_shift_book_duoc_ky('receive',    p_facility_id),
    'cancel',     public.fn_shift_book_duoc_ky('cancel',     p_facility_id),
    'chua_chi_dinh_thu_kho', NOT EXISTS (
      SELECT 1 FROM public.shift_book_thu_kho t
       WHERE t.is_active
         AND (t.facility_id IS NULL OR p_facility_id IS NULL OR t.facility_id = p_facility_id))
  )
$$;

-- ─── 5) Khoá chống trùng phiếu lại hở vì facility_id còn NULL được ─────────
--
-- `spr_facility_date_shiftid_uniq` gồm `facility_id`, nhưng cột đó vẫn NULLABLE ⇒
-- NULL ≠ NULL ⇒ lại lọt phiếu trùng. Đúng cái bẫy đã gỡ HAI LẦN rồi (cho `line_id` ở p2
-- và cho `shift` ở p3) — lần thứ ba vẫn sót, ở cột khác.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.shift_production_reports WHERE facility_id IS NULL) THEN
    RAISE EXCEPTION 'Còn % phiếu không có facility_id — lấp trước khi ép NOT NULL',
      (SELECT count(*) FROM public.shift_production_reports WHERE facility_id IS NULL);
  END IF;
  ALTER TABLE public.shift_production_reports ALTER COLUMN facility_id SET NOT NULL;
END $$;

-- ─── 6) Vòng tái chế đang cộng cả phiếu NHÁP ───────────────────────────────
--
-- `v_vong_tai_che` lọc `status <> 'cancelled'` — loại 1 trong 5 giá trị — nên phiếu
-- NHÁP chưa ai ký đã chạy thẳng vào sản lượng và tỉ lệ không đạt của trang QC.
-- Trong khi `v_shift_stock_balance` chỉ cộng `received` ⇒ **cùng một cuốn sổ, hai con số
-- khác nhau trên hai màn hình**. Đúng lỗi hai nguồn sự thật.
-- Sửa: cộng đúng phiếu đã đủ ba chữ ký, giống view tồn kho.
CREATE OR REPLACE VIEW public.v_vong_tai_che AS
SELECT
  v.facility_id,
  v.report_date                                                         AS ngay,
  coalesce(sum(v.nhap_banh) FILTER (WHERE v.code = 'LOI'), 0)::int      AS loi_lam_ra_banh,
  coalesce(sum(v.nhap_banh) FILTER (WHERE v.code = 'DKL'), 0)::int      AS dkl_lam_ra_banh,
  coalesce(sum(v.nhap_banh) FILTER (WHERE v.code IN ('LOI','DKL')), 0)::int AS khong_dat_lam_ra_banh,
  round(coalesce(sum(COALESCE(v.nhap_kg,0)) FILTER (WHERE v.code IN ('LOI','DKL')), 0), 2) AS khong_dat_lam_ra_kg,
  coalesce(sum(v.xuat_banh) FILTER (WHERE v.code IN ('LOI','DKL')), 0)::int AS khong_dat_dem_xu_ly_banh,
  round(coalesce(sum(COALESCE(v.xuat_kg,0)) FILTER (WHERE v.code IN ('LOI','DKL')), 0), 2) AS khong_dat_dem_xu_ly_kg,
  coalesce(sum(v.nhap_banh) FILTER (WHERE v.code NOT IN ('LOI','DKL')), 0)::int AS dat_lam_ra_banh,
  round(coalesce(sum(COALESCE(v.nhap_kg,0)) FILTER (WHERE v.code NOT IN ('LOI','DKL')), 0), 2) AS dat_lam_ra_kg,
  sum(v.nhap_banh)::int                                                 AS tong_nhap_banh,
  round(100.0 * coalesce(sum(v.nhap_banh) FILTER (WHERE v.code IN ('LOI','DKL')), 0)
        / nullif(sum(v.nhap_banh), 0), 1)                               AS ty_le_khong_dat_pc,
  (coalesce(sum(v.xuat_banh) FILTER (WHERE v.code IN ('LOI','DKL')), 0) > 0) AS co_tai_che_trong_ky
FROM public.v_shift_production_lines v
-- ⚠ `received` chứ không phải `<> cancelled`: phải khớp v_shift_stock_balance, nếu không
--   trang QC và trang tồn kho nói hai con số khác nhau về cùng một cuốn sổ.
WHERE v.status = 'received'
GROUP BY v.facility_id, v.report_date;

ALTER VIEW public.v_vong_tai_che SET (security_invoker = on);
GRANT SELECT ON public.v_vong_tai_che TO authenticated;

-- ─── 7) Đối chiếu xuất kho: phép cộng nuốt NULL, và đếm nhầm đơn vị ────────
--
-- · `sum(xuat_kg)` không COALESCE ⇒ đúng cái lỗi p4 đã gỡ cho `v_shift_stock_balance`
--   nhưng chép thiếu sang đây; và view này không có cờ nào nói tổng đó chưa đủ.
-- · `so_cont_chua_chot_giao` đếm DÒNG LỆNH chứ không đếm CONTAINER (kể cả dòng không gắn
--   container nào) ⇒ thẻ trên màn hình hiện 15 trong khi thật ra 14.
-- ⚠ DROP rồi CREATE, KHÔNG dùng CREATE OR REPLACE: view này thêm cột mới ở GIỮA
--   (`so_dong_chua_co_can_that`) mà CREATE OR REPLACE chỉ cho THÊM cột ở CUỐI — nó báo
--   "cannot change name of view column". Phải xoá con trước, vì v_doi_chieu_xuat_kho
--   đọc view này.
DROP VIEW IF EXISTS public.v_doi_chieu_xuat_kho;
DROP VIEW IF EXISTS public.v_xuat_kho_tu_lenh_dieu_xe;

CREATE VIEW public.v_xuat_kho_tu_lenh_dieu_xe AS
SELECT
  d.dispatch_date                                   AS ngay,
  btrim(upper(regexp_replace(coalesce(d2.grade, '(không ghi)'), '\s+', ' ', 'g'))) AS loai_hang,
  count(*)::int                                     AS so_container,
  sum(d2.package_count)::int                        AS so_banh,
  sum(d2.weight_kg)                                 AS kg_dinh_muc,
  sum(COALESCE(d2.actual_weight_kg, 0))             AS kg_can_that,
  -- Nói ra khi tổng cân thật chỉ là một phần, thay vì im lặng trả số nhỏ hơn.
  count(*) FILTER (WHERE d2.actual_weight_kg IS NULL)::int AS so_dong_chua_co_can_that,
  round(sum(d2.weight_kg) / nullif(sum(d2.package_count), 0), 2) AS kg_moi_banh,
  count(*) FILTER (
    WHERE d2.package_count > 0
      AND round(d2.weight_kg / d2.package_count, 2) NOT IN (35.00, 33.33, 33.32, 30.00, 111.11)
  )::int                                            AS so_dong_kg_bat_thuong,
  count(*) FILTER (
    WHERE c.bale_count IS NOT NULL AND c.bale_count <> d2.package_count
  )::int                                            AS so_dong_lech_so_banh,
  -- Đếm CONTAINER phân biệt, và chỉ đếm dòng thật sự gắn container.
  count(DISTINCT d2.sales_order_container_id)
    FILTER (WHERE d2.sales_order_container_id IS NOT NULL
              AND v.delivery_state IS DISTINCT FROM 'delivered')::int AS so_cont_chua_chot_giao
FROM public.dispatch_orders d
JOIN public.dispatch_order_lines d2 ON d2.dispatch_order_id = d.id
LEFT JOIN public.sales_order_containers c ON c.id = d2.sales_order_container_id
LEFT JOIN public.v_sales_order_container_delivery v ON v.container_id = d2.sales_order_container_id
WHERE d.status NOT IN ('draft', 'cancelled')
  AND d.dispatch_date IS NOT NULL
GROUP BY d.dispatch_date,
         btrim(upper(regexp_replace(coalesce(d2.grade, '(không ghi)'), '\s+', ' ', 'g')));

ALTER VIEW public.v_xuat_kho_tu_lenh_dieu_xe SET (security_invoker = on);
GRANT SELECT ON public.v_xuat_kho_tu_lenh_dieu_xe TO authenticated;

CREATE VIEW public.v_doi_chieu_xuat_kho AS
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
  SELECT v.report_date AS ngay,
         sum(v.xuat_banh)::int          AS banh_theo_so_ca,
         sum(COALESCE(v.xuat_kg, 0))    AS kg_theo_so_ca,
         -- Cờ: có dòng máy không quy ra kg được ⇒ tổng kg trên chưa đủ.
         bool_or(v.xuat_kg IS NULL AND v.xuat_banh > 0) AS so_ca_thieu_kg,
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
  coalesce(s.so_ca_thieu_kg, false)              AS so_ca_thieu_kg,
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
-- 1) Anon KHÔNG đọc được nữa:
--    curl "$URL/rest/v1/v_sales_order_container_delivery?select=container_id&limit=1" -H "apikey: $ANON"  -- rỗng
--    SELECT reloptions FROM pg_class WHERE relname='v_sales_order_container_delivery';   -- {security_invoker=on}
-- 2) INSERT thẳng 'received' bị chặn (thử trong DO ... RAISE EXCEPTION).
-- 3) Sửa dòng của phiếu đã nhận bị chặn (thử với jwt claims của một nhân viên).
-- 4) Chỉ định thủ kho ở PD KHÔNG khoá TL/LAO nữa.
-- 5) facility_id NOT NULL; khoá chống trùng còn nguyên.
-- 6) v_vong_tai_che chỉ cộng phiếu 'received'.
-- 7) so_cont_chua_chot_giao đếm CONTAINER: tổng = 14 (trước là 15).
--
-- ─── CÒN NỢ (phần thuộc về TypeScript, không sửa ở đây) ────────────────────
-- 1. `markWeighed` (dispatchService.ts:981) đặt container status='shipped' mà không kiểm
--    trạng thái lệnh, và nhánh ĐẦU của view coi 'shipped' là 'delivered' VÔ ĐIỀU KIỆN ⇒
--    cửa hậu đi vòng qua đúng luật mục 1 của p2. 7 lệnh nháp đang chạm tới 10 container.
-- 2. Chưa có đường nhập TỒN ĐẦU KỲ (`is_opening` không ai ghi, không view nào đọc).
--    Tồn kho sẽ bắt đầu từ 0 trong khi kho có hàng thật.
-- 3. Nhà máy mặc định trên màn hình nhập đang là LÀO (facilities sắp theo tên).
-- 4. Bản in lấy cột "Tồn" từ `v_shift_stock_balance` — view không có chiều NGÀY nên in
--    lại phiếu cũ ra tồn của HÔM NAY.
-- ============================================================================
