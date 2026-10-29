-- ============================================================
-- KHO NGUYÊN LIỆU MỦ — GĐ1 · v2: NGÀY MỞ SỔ THEO NHÀ MÁY
-- Ngày: 2026-10-29
-- Phụ thuộc: wms_nvl_p1_so_kho_kho.sql + wms_nvl_p1_hang_doi_canh_bao.sql (đã chạy)
--
-- Kết quả kiểm chứng 29/10: 277 phiếu "chờ DRC" + 22 phiếu "loại mủ lạ" — toàn
-- phiếu CŨ, trước khi có sổ kho khô. Hàng của các phiếu đó đã nằm trong TỒN ĐẦU
-- kiểm kê mở sổ; nhập lại là tính trùng. Vì vậy:
--   · raw_settings thêm ngay_mo_so (ngày mở sổ) theo nhà máy, khởi tạo = hôm nay.
--   · v_raw_intake_queue chỉ hiện phiếu cân ra từ ngày mở sổ trở đi.
--   · fn_nhap_kho_tu_phieu_can từ chối phiếu trước ngày mở sổ (TRUOC_NGAY_MO_SO).
--   · Phiếu trước ngày mở sổ: tra ở màn Phiếu cân (đa NM) như trước, không vào sổ.
-- Đổi ngày mở sổ = UPDATE raw_settings (BGĐ). Lùi ngày về trước là cho phép nhập
-- phiếu cũ → chỉ làm khi CHƯA nhập tồn đầu của khoảng đó.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── 1) Cột ngày mở sổ ─────────────────────────────────────────────────────
ALTER TABLE public.raw_settings ADD COLUMN IF NOT EXISTS ngay_mo_so date;
UPDATE public.raw_settings SET ngay_mo_so = current_date WHERE ngay_mo_so IS NULL;
ALTER TABLE public.raw_settings ALTER COLUMN ngay_mo_so SET DEFAULT current_date;
ALTER TABLE public.raw_settings ALTER COLUMN ngay_mo_so SET NOT NULL;
COMMENT ON COLUMN public.raw_settings.ngay_mo_so IS
  'Sổ kho khô bắt đầu từ ngày này: chỉ phiếu cân ra >= ngày này mới vào hàng đợi / nhập được. Hàng trước đó = tồn đầu kiểm kê.';

-- ─── 2) Hàng đợi: chỉ phiếu từ ngày mở sổ ─────────────────────────────────
-- (CREATE OR REPLACE VIEW: giữ nguyên danh sách & thứ tự cột, chỉ thêm điều kiện WHERE)
CREATE OR REPLACE VIEW public.v_raw_intake_queue AS
WITH items AS (
  SELECT i.ticket_id,
         count(*)::int AS so_dong_lo,
         round(sum(COALESCE(i.actual_qty_kg, i.declared_qty_kg)), 2) AS wet_kg_dong,
         count(*) FILTER (
           WHERE i.drc_percent IS NULL
             AND (SELECT rt.drc_mac_dinh FROM public.raw_rubber_types rt
                   WHERE rt.code = public.fn_chuan_hoa_loai_mu(i.rubber_type)) IS NULL
         )::int AS so_dong_thieu_drc_rieng,
         count(*) FILTER (WHERE public.fn_chuan_hoa_loai_mu(i.rubber_type) = 'khac')::int AS so_dong_loai_la,
         round(sum(COALESCE(i.actual_qty_kg, i.declared_qty_kg) * COALESCE(i.drc_percent, 0) / 100), 2) AS dry_kg_dong_co_drc
    FROM public.weighbridge_ticket_items i
   GROUP BY i.ticket_id
)
SELECT
  t.id                                              AS ticket_id,
  t.code,
  t.facility_id,
  f.code                                            AS facility_code,
  t.ticket_type,
  t.status,
  t.completed_at,
  t.vehicle_plate,
  t.driver_name,
  t.supplier_name,
  t.source_type,
  t.rubber_type                                     AS rubber_type_goc,
  public.fn_chuan_hoa_loai_mu(t.rubber_type)        AS rubber_type,
  rt.name                                           AS rubber_type_name,
  rt.nhom,
  t.net_weight,
  t.expected_drc,
  t.qc_actual_drc,
  t.qc_status,
  COALESCE(t.qc_actual_drc, rt.drc_mac_dinh)        AS drc_dung,
  COALESCE(it.so_dong_lo, 0)                        AS so_dong_lo,
  it.wet_kg_dong,
  CASE
    WHEN COALESCE(it.so_dong_lo, 0) > 0 THEN
      (it.so_dong_loai_la = 0) AND (it.so_dong_thieu_drc_rieng = 0 OR t.qc_actual_drc IS NOT NULL)
    ELSE
      public.fn_chuan_hoa_loai_mu(t.rubber_type) <> 'khac' AND COALESCE(t.qc_actual_drc, rt.drc_mac_dinh) IS NOT NULL
  END                                               AS san_sang,
  CASE
    WHEN COALESCE(it.so_dong_lo, 0) > 0 AND it.so_dong_loai_la > 0 THEN 'loai_mu_la'
    WHEN COALESCE(it.so_dong_lo, 0) = 0 AND public.fn_chuan_hoa_loai_mu(t.rubber_type) = 'khac' THEN 'loai_mu_la'
    WHEN COALESCE(it.so_dong_lo, 0) > 0 AND it.so_dong_thieu_drc_rieng > 0 AND t.qc_actual_drc IS NULL THEN 'cho_drc'
    WHEN COALESCE(it.so_dong_lo, 0) = 0 AND COALESCE(t.qc_actual_drc, rt.drc_mac_dinh) IS NULL THEN 'cho_drc'
    ELSE 'ok'
  END                                               AS ly_do_cho,
  CASE
    WHEN COALESCE(it.so_dong_lo, 0) > 0 AND t.qc_actual_drc IS NOT NULL
      THEN round(it.wet_kg_dong * t.qc_actual_drc / 100, 2)
    WHEN COALESCE(it.so_dong_lo, 0) > 0 THEN it.dry_kg_dong_co_drc
    WHEN COALESCE(t.qc_actual_drc, rt.drc_mac_dinh) IS NOT NULL
      THEN round(t.net_weight * COALESCE(t.qc_actual_drc, rt.drc_mac_dinh) / 100, 2)
    ELSE NULL
  END                                               AS dry_kg_du_kien,
  CASE WHEN t.expected_drc IS NOT NULL AND t.qc_actual_drc IS NOT NULL
       THEN round(t.expected_drc - t.qc_actual_drc, 2) END AS lech_drc_ncc,
  EXISTS (SELECT 1 FROM public.raw_stock_ledger l WHERE l.ref_type = 'weighbridge_ticket' AND l.ref_id = t.id) AS da_nhap,
  (SELECT min(b.batch_no) FROM public.stock_batches b WHERE b.weighbridge_ticket_id = t.id) AS batch_no
FROM public.weighbridge_tickets t
LEFT JOIN public.facilities f ON f.id = t.facility_id
LEFT JOIN public.raw_rubber_types rt ON rt.code = public.fn_chuan_hoa_loai_mu(t.rubber_type)
LEFT JOIN items it ON it.ticket_id = t.id
WHERE t.status = 'completed'
  AND t.ticket_type IN ('in', 'fetch', 'retail')
  AND COALESCE(t.cargo_kind, 'raw') = 'raw'
  AND COALESCE(t.completed_at::date, current_date) >= (public.fn_raw_setting(t.facility_id)).ngay_mo_so;

-- ─── 3) Hàm nhập kho: từ chối phiếu trước ngày mở sổ ──────────────────────
CREATE OR REPLACE FUNCTION public.fn_nhap_kho_tu_phieu_can(
  p_ticket_id uuid,
  p_warehouse_id uuid DEFAULT NULL,
  p_nguon_hang text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t            record;
  i            record;
  v_wh         uuid;
  v_emp        uuid := public.fn_nvl_emp_hien_tai();
  v_type       text;
  v_drc        numeric;
  v_wet        numeric;
  v_batch_no   text;
  v_batch_id   uuid;
  v_nguon      text;
  v_so_dong    int := 0;
  v_out        jsonb := '[]'::jsonb;
  v_received   date;
  v_mo_so      date;
BEGIN
  SELECT * INTO t FROM public.weighbridge_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF t.status <> 'completed' THEN RAISE EXCEPTION 'PHIEU_CHUA_HOAN_TAT:%', t.code; END IF;
  IF t.ticket_type NOT IN ('in', 'fetch', 'retail') THEN RAISE EXCEPTION 'PHIEU_KHONG_PHAI_NHAP:%', t.ticket_type; END IF;
  IF t.facility_id IS NULL THEN RAISE EXCEPTION 'THIEU_NHA_MAY:%', t.code; END IF;
  IF EXISTS (SELECT 1 FROM public.raw_stock_ledger l WHERE l.ref_type = 'weighbridge_ticket' AND l.ref_id = t.id) THEN
    RAISE EXCEPTION 'DA_NHAP:%', t.code;
  END IF;
  IF NOT public.fn_nvl_duoc_ky('receive', t.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN_NHAN'; END IF;

  v_received := COALESCE(t.completed_at::date, current_date);
  v_mo_so := (public.fn_raw_setting(t.facility_id)).ngay_mo_so;
  IF v_received < v_mo_so THEN
    RAISE EXCEPTION 'TRUOC_NGAY_MO_SO:%:phiếu % · mở sổ %', t.code, v_received, v_mo_so;
  END IF;

  v_wh := COALESCE(p_warehouse_id, public.fn_nvl_kho_mac_dinh(t.facility_id));
  IF v_wh IS NULL THEN RAISE EXCEPTION 'THIEU_KHO_NVL'; END IF;

  v_nguon := COALESCE(p_nguon_hang,
    CASE
      WHEN t.ticket_type = 'retail' THEN 'nong_ho'
      WHEN t.source_type = 'transfer' THEN 'chuyen_kho'
      WHEN t.source_type IN ('deal', 'partner_direct', 'supplier') THEN 'dai_ly'
      ELSE 'khac'
    END);

  FOR i IN
    SELECT * FROM public.weighbridge_ticket_items WHERE ticket_id = t.id ORDER BY line_no
  LOOP
    v_so_dong := v_so_dong + 1;
    v_type := public.fn_chuan_hoa_loai_mu(i.rubber_type);
    IF v_type = 'khac' THEN RAISE EXCEPTION 'LOAI_MU_LA:%:%', t.code, i.rubber_type; END IF;
    v_wet := COALESCE(i.actual_qty_kg, i.declared_qty_kg);
    IF v_wet IS NULL OR v_wet <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:%:dong %', t.code, i.line_no; END IF;
    SELECT COALESCE(i.drc_percent, t.qc_actual_drc, rt.drc_mac_dinh) INTO v_drc
      FROM public.raw_rubber_types rt WHERE rt.code = v_type;
    IF v_drc IS NULL THEN RAISE EXCEPTION 'THIEU_DRC:%:dong %', t.code, i.line_no; END IF;

    v_batch_no := 'NVL-' || replace(t.code, 'CX-', '') || '-' || i.line_no;
    v_batch_id := public.fn_nvl_tao_lo(v_batch_no, t.facility_id, v_wh, v_type, v_wet, v_drc, v_received,
                    t.supplier_name, t.expected_drc, t.qc_status, v_nguon, false, t.id, i.line_no, i.rubber_type);

    INSERT INTO public.raw_stock_ledger (facility_id, batch_id, rubber_type, txn_type, txn_date, wet_kg, drc_pct, dry_kg,
                                         ref_type, ref_id, ref_line, note, created_by)
    VALUES (t.facility_id, v_batch_id, v_type, 'in', v_received, v_wet, v_drc, round(v_wet * v_drc / 100, 2),
            'weighbridge_ticket', t.id, i.line_no, 'Nhập từ phiếu cân ' || t.code || ' dòng ' || i.line_no, v_emp);

    v_out := v_out || jsonb_build_object('batch_id', v_batch_id, 'batch_no', v_batch_no, 'rubber_type', v_type,
                                         'wet_kg', v_wet, 'drc_pct', v_drc, 'dry_kg', round(v_wet * v_drc / 100, 2));
  END LOOP;

  IF v_so_dong = 0 THEN
    v_type := public.fn_chuan_hoa_loai_mu(t.rubber_type);
    IF v_type = 'khac' THEN RAISE EXCEPTION 'LOAI_MU_LA:%:%', t.code, COALESCE(t.rubber_type, '(trống)'); END IF;
    v_wet := t.net_weight;
    IF v_wet IS NULL OR v_wet <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:%', t.code; END IF;
    SELECT COALESCE(t.qc_actual_drc, rt.drc_mac_dinh) INTO v_drc FROM public.raw_rubber_types rt WHERE rt.code = v_type;
    IF v_drc IS NULL THEN RAISE EXCEPTION 'THIEU_DRC:%', t.code; END IF;

    v_batch_no := 'NVL-' || replace(t.code, 'CX-', '');
    v_batch_id := public.fn_nvl_tao_lo(v_batch_no, t.facility_id, v_wh, v_type, v_wet, v_drc, v_received,
                    t.supplier_name, t.expected_drc, t.qc_status, v_nguon, false, t.id, NULL, t.rubber_type);

    INSERT INTO public.raw_stock_ledger (facility_id, batch_id, rubber_type, txn_type, txn_date, wet_kg, drc_pct, dry_kg,
                                         ref_type, ref_id, ref_line, note, created_by)
    VALUES (t.facility_id, v_batch_id, v_type, 'in', v_received, v_wet, v_drc, round(v_wet * v_drc / 100, 2),
            'weighbridge_ticket', t.id, NULL, 'Nhập từ phiếu cân ' || t.code, v_emp);

    v_out := v_out || jsonb_build_object('batch_id', v_batch_id, 'batch_no', v_batch_no, 'rubber_type', v_type,
                                         'wet_kg', v_wet, 'drc_pct', v_drc, 'dry_kg', round(v_wet * v_drc / 100, 2));
  END IF;

  RETURN v_out;
END $$;

-- ─── KIỂM CHỨNG (gửi lại kết quả) ──────────────────────────────────────────
-- (a) Ngày mở sổ từng nhà máy:
SELECT COALESCE(f.code, '(mặc định)') AS nha_may, s.ngay_mo_so
  FROM public.raw_settings s LEFT JOIN public.facilities f ON f.id = s.facility_id ORDER BY f.code NULLS FIRST;

-- (b) Hàng đợi sau khi lọc (chỉ phiếu từ hôm nay):
SELECT facility_code, ly_do_cho, count(*) AS so_phieu
  FROM public.v_raw_intake_queue WHERE NOT da_nhap GROUP BY 1, 2 ORDER BY 1, 2;

-- (c) Giá trị loại mủ LẠ đang có trên phiếu cân cũ (mọi thời kỳ) — gửi để tôi thêm vào hàm chuẩn hóa:
SELECT COALESCE(t.rubber_type, '(NULL)') AS gia_tri, count(*) AS so_phieu, min(t.completed_at)::date AS tu, max(t.completed_at)::date AS den
  FROM public.weighbridge_tickets t
 WHERE t.status = 'completed' AND t.ticket_type IN ('in', 'fetch', 'retail')
   AND public.fn_chuan_hoa_loai_mu(t.rubber_type) = 'khac'
 GROUP BY 1 ORDER BY 2 DESC;

-- (d) Phiếu cũ có DRC đo tại cân chiếm bao nhiêu % (để biết lab có đang nhập DRC vào phiếu không):
SELECT f.code,
       count(*) AS tong_phieu,
       count(*) FILTER (WHERE t.qc_actual_drc IS NOT NULL) AS co_drc,
       round(100.0 * count(*) FILTER (WHERE t.qc_actual_drc IS NOT NULL) / nullif(count(*), 0), 1) AS pct_co_drc
  FROM public.weighbridge_tickets t LEFT JOIN public.facilities f ON f.id = t.facility_id
 WHERE t.status = 'completed' AND t.ticket_type IN ('in', 'fetch', 'retail')
   AND t.completed_at >= now() - interval '60 days'
 GROUP BY 1 ORDER BY 1;
