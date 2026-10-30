-- ============================================================
-- HÀNG CHÈN — GĐ4e: mỗi lô chèn phải có SỐ LÔ (30/10/2026, chủ DN: "hàng chèn có loại có số lô, có loại chưa có;
--   chưa có thì yêu cầu người dùng nhập số lô để quản lý")
--   · Nguồn có sẵn số lô → máy tự lấy: lô thành phẩm (fg_lots.so_lo), sổ QC (qc_reject_log.so_lo)
--   · Nguồn chưa có → bắt nhập: dòng LOI/DKL sổ ca, hàng chuẩn kho TP, gõ tay (SBR 1502 mua ngoài…) → THIEU_SO_LO
--   · Lô cũ chưa có số lô: lúc lấy đầu ca phải gõ số lô (máy ghi vào lô), hoặc thủ kho gán ở Kho chèn
--   · Số lô không ép duy nhất (một số lô có thể về nhiều đợt); app chỉ nhắc khi trùng
-- Ngày: 2026-10-30 · Phụ thuộc: wms_mix_p4_ma_goc.sql (CHẠY p4 TRƯỚC), wms_tp_p1_lo_thanh_pham, wms_khep_vong_p1, wms_mix_p3
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

ALTER TABLE public.mix_lots ADD COLUMN IF NOT EXISTS so_lo text;
CREATE INDEX IF NOT EXISTS ml_so_lo_idx ON public.mix_lots (facility_id, upper(so_lo));

CREATE OR REPLACE FUNCTION public.fn_mix_chuan_so_lo(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(upper(regexp_replace(btrim(COALESCE(p, '')), '\s+', ' ', 'g')), '')
$$;

-- Lô cũ: lấy số lô từ nguồn nếu có
UPDATE public.mix_lots m SET so_lo = f.so_lo FROM public.fg_lots f
 WHERE m.so_lo IS NULL AND m.source_ref_type = 'fg_lot' AND m.source_ref_id = f.id;
UPDATE public.mix_lots m SET so_lo = public.fn_mix_chuan_so_lo(r.so_lo) FROM public.qc_reject_log r
 WHERE m.so_lo IS NULL AND m.source_ref_type = 'qc_reject_log' AND m.source_ref_id = r.id AND r.so_lo IS NOT NULL;

-- ─── Nhập lô gõ tay: bắt số lô ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_mix_tao_lo(uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, boolean, boolean, date, text, text, uuid);
CREATE OR REPLACE FUNCTION public.fn_mix_tao_lo(
  p_facility_id uuid, p_source_type text, p_source_desc text, p_grade text, p_kg_in numeric,
  p_po numeric DEFAULT NULL, p_mooney numeric DEFAULT NULL, p_pri numeric DEFAULT NULL,
  p_qc_allow_mix_pct numeric DEFAULT NULL, p_qc_allow_rerun boolean DEFAULT true, p_metal_cleared boolean DEFAULT false,
  p_received_date date DEFAULT current_date, p_note text DEFAULT NULL, p_source_ref_type text DEFAULT NULL, p_source_ref_id uuid DEFAULT NULL,
  p_so_lo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; q json; v_so_lo text := public.fn_mix_chuan_so_lo(p_so_lo); v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  q := public.fn_nvl_quyen(p_facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kho_chen'; END IF;
  IF p_kg_in IS NULL OR p_kg_in <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  IF v_so_lo IS NULL THEN RAISE EXCEPTION 'THIEU_SO_LO:lô chèn phải có số lô'; END IF;
  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, po, mooney, pri,
                               qc_allow_mix_pct, qc_allow_rerun, metal_cleared, received_date, note, created_by, so_lo)
  VALUES (public.fn_mix_ma('CH', p_facility_id), p_facility_id, p_source_type, p_source_ref_type, p_source_ref_id, p_source_desc, p_grade, p_kg_in,
          p_po, p_mooney, p_pri, p_qc_allow_mix_pct, COALESCE(p_qc_allow_rerun, true), COALESCE(p_metal_cleared, false),
          COALESCE(p_received_date, current_date), p_note, v_emp, v_so_lo)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_tao_lo(uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, boolean, boolean, date, text, text, uuid, text) TO authenticated;

-- ─── LOI/DKL từ sổ ca: bắt số lô ───────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_mix_tao_lo_tu_so_ca(uuid, numeric, text, boolean);
CREATE OR REPLACE FUNCTION public.fn_mix_tao_lo_tu_so_ca(p_line_id uuid, p_kg numeric DEFAULT NULL, p_note text DEFAULT NULL, p_metal_cleared boolean DEFAULT false, p_so_lo text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; q json; v_con numeric; v_kg numeric; v_id uuid; v_so_lo text := public.fn_mix_chuan_so_lo(p_so_lo); v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT v.id, v.facility_id, v.report_date, v.shift_name, r.team, v.code, v.material_name, v.nhap_kg, v.status
    INTO s
    FROM public.v_shift_production_lines v JOIN public.shift_production_reports r ON r.id = v.report_id
   WHERE v.id = p_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_DONG'; END IF;
  IF s.code NOT IN ('LOI', 'DKL') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:không phải dòng LOI/DKL', s.code; END IF;
  IF s.status <> 'received' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:phiếu ca chưa đủ 3 chữ ký', s.status; END IF;
  q := public.fn_nvl_quyen(s.facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kho_chen'; END IF;
  IF v_so_lo IS NULL THEN RAISE EXCEPTION 'THIEU_SO_LO:%', s.material_name; END IF;
  v_con := COALESCE(s.nhap_kg, 0) - COALESCE((SELECT sum(m.kg_in) FROM public.mix_lots m WHERE m.source_ref_type = 'shift_production_line' AND m.source_ref_id = s.id AND m.status <> 'cancelled'), 0);
  v_kg := COALESCE(p_kg, v_con);
  IF v_con <= 0.005 THEN RAISE EXCEPTION 'DA_CHUYEN_HET:%', s.material_name; END IF;
  IF v_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  IF v_kg > v_con + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:chuyển % > còn lại %', s.material_name, v_kg, round(v_con, 2); END IF;

  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, qc_allow_rerun, metal_cleared, received_date, note, created_by, so_lo)
  VALUES (public.fn_mix_ma('CH', s.facility_id), s.facility_id, CASE WHEN s.code = 'LOI' THEN 'loi' ELSE 'dkl' END, 'shift_production_line', s.id,
          s.material_name || ' · ' || COALESCE(s.shift_name, 'ca ?') || ' ' || to_char(s.report_date, 'DD/MM') || COALESCE(' · tổ ' || s.team, ''),
          NULL, round(v_kg, 2), true, CASE WHEN s.code = 'LOI' THEN true ELSE COALESCE(p_metal_cleared, false) END, current_date, p_note, v_emp, v_so_lo)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_tao_lo_tu_so_ca(uuid, numeric, text, boolean, text) TO authenticated;

-- ─── Hàng không đạt từ sổ QC: số lô lấy từ sổ, không có thì bắt nhập ──────
DROP FUNCTION IF EXISTS public.fn_mix_tao_lo_tu_qc(uuid, numeric, text, boolean);
CREATE OR REPLACE FUNCTION public.fn_mix_tao_lo_tu_qc(p_reject_id uuid, p_kg numeric, p_note text DEFAULT NULL, p_metal_cleared boolean DEFAULT false, p_so_lo text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; q json; v_id uuid; v_so_lo text; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO r FROM public.qc_reject_log WHERE id = p_reject_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_DONG'; END IF;
  IF r.facility_id IS NULL THEN RAISE EXCEPTION 'THIEU_NHA_MAY:dòng sổ QC'; END IF;
  q := public.fn_nvl_quyen(r.facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kho_chen'; END IF;
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  v_so_lo := COALESCE(public.fn_mix_chuan_so_lo(p_so_lo), public.fn_mix_chuan_so_lo(r.so_lo));
  IF v_so_lo IS NULL THEN RAISE EXCEPTION 'THIEU_SO_LO:sổ QC không ghi số lô, gõ số lô'; END IF;
  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, po, mooney, qc_allow_rerun, metal_cleared, received_date, note, created_by, so_lo)
  VALUES (public.fn_mix_ma('CH', r.facility_id), r.facility_id, 'loi', 'qc_reject_log', r.id,
          COALESCE(r.ly_do, 'hàng không đạt') || ' · lô SX ' || v_so_lo || ' ' || to_char(r.ngay_sx, 'DD/MM') || COALESCE(' · tổ ' || r.to_sx, '') || COALESCE(' · NVL ' || r.ma_nguyen_lieu, ''),
          NULL, round(p_kg, 2),
          CASE WHEN r.po_min IS NOT NULL OR r.po_max IS NOT NULL THEN round((COALESCE(r.po_min, r.po_max) + COALESCE(r.po_max, r.po_min)) / 2, 1) END,
          CASE WHEN r.mv_min IS NOT NULL OR r.mv_max IS NOT NULL THEN round((COALESCE(r.mv_min, r.mv_max) + COALESCE(r.mv_max, r.mv_min)) / 2, 1) END,
          true, COALESCE(p_metal_cleared, true), current_date, p_note, v_emp, v_so_lo)
  RETURNING id INTO v_id;
  UPDATE public.qc_reject_log SET tinh_trang_xu_ly = COALESCE(tinh_trang_xu_ly, 'Đã chuyển kho chèn'), so_lo = COALESCE(so_lo, v_so_lo), updated_at = now() WHERE id = r.id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_tao_lo_tu_qc(uuid, numeric, text, boolean, text) TO authenticated;

-- ─── Hàng chuẩn từ kho TP: bắt số lô (số lô TP đem chèn) ───────────────────
DROP FUNCTION IF EXISTS public.fn_mix_lay_hang_chuan(uuid, uuid, numeric, date, uuid, text);
CREATE OR REPLACE FUNCTION public.fn_mix_lay_hang_chuan(p_facility_id uuid, p_material_id uuid, p_kg numeric, p_shift_date date DEFAULT current_date, p_shift_id uuid DEFAULT NULL, p_note text DEFAULT NULL, p_so_lo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; r record; q json; v_banh int; v_kg numeric; v_ton int; v_id uuid; v_so_lo text := public.fn_mix_chuan_so_lo(p_so_lo); v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  q := public.fn_nvl_quyen(p_facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kho_chen'; END IF;
  SELECT id, code, name, weight_per_unit INTO m FROM public.materials WHERE id = p_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_DONG:material'; END IF;
  IF m.weight_per_unit IS NULL OR m.weight_per_unit <= 0 THEN RAISE EXCEPTION 'THIEU_CO_BANH:%', m.code; END IF;
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  IF p_shift_id IS NULL THEN RAISE EXCEPTION 'THIEU_CA:chọn ca để ghi xuất bành'; END IF;
  IF v_so_lo IS NULL THEN RAISE EXCEPTION 'THIEU_SO_LO:%', m.name; END IF;
  v_banh := GREATEST(round(p_kg / m.weight_per_unit)::int, 1);
  v_kg := round(v_banh * m.weight_per_unit, 2);
  SELECT COALESCE(ton_banh, 0) INTO v_ton FROM public.v_shift_stock_balance WHERE facility_id = p_facility_id AND material_id = m.id;
  IF v_banh > COALESCE(v_ton, 0) THEN RAISE EXCEPTION 'VUOT_TON:%:cần % bành, kho TP còn %', m.name, v_banh, COALESCE(v_ton, 0); END IF;
  SELECT * INTO r FROM public.shift_production_reports WHERE facility_id = p_facility_id AND report_date = p_shift_date AND shift_id = p_shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PHIEU_CA_CHUA_MO:%:tổ mở phiếu ca %s trước, rồi lấy hàng chuẩn', to_char(p_shift_date, 'DD/MM'), to_char(p_shift_date, 'DD/MM'); END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'PHIEU_CA_DA_KY:%:ghi vào phiếu ca sau', r.status; END IF;

  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, qc_allow_rerun, metal_cleared, received_date, note, created_by, so_lo)
  VALUES (public.fn_mix_ma('CH', p_facility_id), p_facility_id, 'std', 'material', m.id,
          'Hàng chuẩn ' || m.name || ' từ kho TP · ' || v_banh || ' bành · ' || to_char(p_shift_date, 'DD/MM'), m.name, v_kg, true, true, p_shift_date, p_note, v_emp, v_so_lo)
  RETURNING id INTO v_id;

  INSERT INTO public.shift_production_lines (report_id, material_id, nhap_banh, xuat_banh, note)
  VALUES (r.id, m.id, 0, v_banh, 'Chuyển ' || v_banh || ' bành sang kho chèn')
  ON CONFLICT (report_id, material_id) DO UPDATE
     SET xuat_banh = public.shift_production_lines.xuat_banh + EXCLUDED.xuat_banh,
         note = COALESCE(public.shift_production_lines.note || ' · ', '') || EXCLUDED.note, updated_at = now();
  RETURN jsonb_build_object('lot_id', v_id, 'banh', v_banh, 'kg', v_kg, 'material', m.name);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_lay_hang_chuan(uuid, uuid, numeric, date, uuid, text, text) TO authenticated;

-- ─── Lô TP lỗi → kho chèn: số lô = số lô TP (chữ ký không đổi) ─────────────
CREATE OR REPLACE FUNCTION public.fn_mix_tao_lo_tu_fg(p_fg_lot_id uuid, p_so_banh int DEFAULT NULL, p_note text DEFAULT NULL, p_metal_cleared boolean DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; m record; q json; v_con int; v_banh int; v_kg numeric; v_src text; v_id uuid; v_ma text; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO l FROM public.fg_lots WHERE id = p_fg_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  q := public.fn_nvl_quyen(l.facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kho_chen'; END IF;
  SELECT code, name INTO m FROM public.materials WHERE id = l.material_id;
  IF l.qc_status NOT IN ('cxl', 'loai') AND m.code NOT IN ('LOI', 'DKL') THEN RAISE EXCEPTION 'LO_TP_CHUA_QC:%:lô chưa bị QC đánh CXL/LOẠI', l.so_lo; END IF;
  v_con := l.so_banh - l.so_banh_da_xuat - l.so_banh_chen;
  v_banh := COALESCE(p_so_banh, v_con);
  IF v_con <= 0 THEN RAISE EXCEPTION 'DA_CHUYEN_HET:%', l.so_lo; END IF;
  IF v_banh <= 0 OR v_banh > v_con THEN RAISE EXCEPTION 'VUOT_TON:%:chuyển % bành > còn %', l.so_lo, v_banh, v_con; END IF;
  v_kg := round(v_banh * l.kg_per_banh, 2);
  v_src := CASE WHEN m.code = 'DKL' THEN 'dkl' ELSE 'loi' END;
  SELECT ma INTO v_ma FROM public.raw_lots WHERE id = l.raw_lot_id;
  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, po, mooney, qc_allow_rerun, metal_cleared, received_date, note, created_by, so_lo)
  VALUES (public.fn_mix_ma('CH', l.facility_id), l.facility_id, v_src, 'fg_lot', l.id,
          'Lô TP ' || l.so_lo || ' · ' || m.name || ' · ' || v_banh || ' bành' || COALESCE(' · NVL ' || v_ma, '') || COALESCE(' · ' || l.qc_ly_do, ''),
          m.name, v_kg,
          CASE WHEN l.qc_po_min IS NOT NULL OR l.qc_po_max IS NOT NULL THEN round((COALESCE(l.qc_po_min, l.qc_po_max) + COALESCE(l.qc_po_max, l.qc_po_min)) / 2, 1) END,
          CASE WHEN l.qc_mv_min IS NOT NULL OR l.qc_mv_max IS NOT NULL THEN round((COALESCE(l.qc_mv_min, l.qc_mv_max) + COALESCE(l.qc_mv_max, l.qc_mv_min)) / 2, 1) END,
          true, CASE WHEN v_src = 'dkl' THEN COALESCE(p_metal_cleared, false) ELSE true END, current_date, p_note, v_emp, public.fn_mix_chuan_so_lo(l.so_lo))
  RETURNING id INTO v_id;
  UPDATE public.fg_lots SET so_banh_chen = so_banh_chen + v_banh, status = CASE WHEN so_banh - so_banh_da_xuat - so_banh_chen - v_banh <= 0 THEN 'het' ELSE status END, updated_at = now() WHERE id = l.id;
  UPDATE public.qc_reject_log SET tinh_trang_xu_ly = COALESCE(tinh_trang_xu_ly, 'Đã chuyển kho chèn ' || to_char(current_date, 'DD/MM')), updated_at = now() WHERE fg_lot_id = l.id;
  RETURN v_id;
END $$;

-- ─── Sửa lô: gán / sửa số lô ───────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_mix_sua_lo(uuid, boolean, boolean, numeric, text, text, text, boolean);
CREATE OR REPLACE FUNCTION public.fn_mix_sua_lo(
  p_lot_id uuid, p_metal_cleared boolean DEFAULT NULL, p_qc_allow_rerun boolean DEFAULT NULL, p_qc_allow_mix_pct numeric DEFAULT NULL,
  p_source_desc text DEFAULT NULL, p_grade text DEFAULT NULL, p_note text DEFAULT NULL, p_huy boolean DEFAULT false, p_so_lo text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; q json;
BEGIN
  SELECT * INTO l FROM public.mix_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  q := public.fn_nvl_quyen(l.facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kho_chen'; END IF;
  IF l.status = 'cancelled' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:đã hủy', l.code; END IF;

  IF COALESCE(p_huy, false) THEN
    IF l.kg_used > 0.005 OR l.kg_at_line > 0.005 THEN RAISE EXCEPTION 'DA_TRU_SO:%:lô đã có phiếu lấy, không hủy được', l.code; END IF;
    UPDATE public.mix_lots SET status = 'cancelled', note = COALESCE(p_note, note), updated_at = now() WHERE id = l.id;
    RETURN;
  END IF;

  UPDATE public.mix_lots
     SET metal_cleared    = COALESCE(p_metal_cleared, metal_cleared),
         qc_allow_rerun   = COALESCE(p_qc_allow_rerun, qc_allow_rerun),
         qc_allow_mix_pct = COALESCE(p_qc_allow_mix_pct, qc_allow_mix_pct),
         source_desc      = COALESCE(p_source_desc, source_desc),
         grade            = COALESCE(p_grade, grade),
         note             = COALESCE(p_note, note),
         so_lo            = COALESCE(public.fn_mix_chuan_so_lo(p_so_lo), so_lo),
         updated_at       = now()
   WHERE id = l.id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_sua_lo(uuid, boolean, boolean, numeric, text, text, text, boolean, text) TO authenticated;

-- ─── fn_mix_lay v4: lô chưa có số lô → người lấy gõ số lô (ghi vào lô), không gõ → chặn ──
DROP FUNCTION IF EXISTS public.fn_mix_lay(uuid, numeric, date, uuid, text, text, text, numeric, uuid, text, uuid, uuid[], int, numeric, numeric, text);
CREATE OR REPLACE FUNCTION public.fn_mix_lay(
  p_lot_id uuid, p_kg numeric, p_shift_date date DEFAULT current_date, p_shift_id uuid DEFAULT NULL, p_team text DEFAULT NULL,
  p_purpose text DEFAULT 'chay_lai', p_target_index text DEFAULT NULL, p_target_value numeric DEFAULT NULL,
  p_production_order_id uuid DEFAULT NULL, p_note text DEFAULT NULL, p_id uuid DEFAULT NULL,
  p_raw_lot_ids uuid[] DEFAULT NULL, p_so_banh int DEFAULT NULL, p_gross_kg numeric DEFAULT NULL, p_pallet_kg numeric DEFAULT NULL, p_vi_tri text DEFAULT NULL,
  p_so_lo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_ton numeric; v_id uuid; v_ids uuid[]; v_kg numeric; v_so_lo text; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO l FROM public.mix_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF NOT public.fn_nvl_duoc_ky('submit', l.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  IF l.status IN ('depleted', 'cancelled') THEN RAISE EXCEPTION 'LO_DA_HET:%', l.code; END IF;
  IF l.source_type = 'dkl' AND NOT l.metal_cleared THEN RAISE EXCEPTION 'DKL_CHUA_XU_LY:%', l.code; END IF;
  -- số lô: lô cũ chưa có thì người lấy gõ, máy ghi luôn vào lô
  IF l.so_lo IS NULL THEN
    v_so_lo := public.fn_mix_chuan_so_lo(p_so_lo);
    IF v_so_lo IS NULL THEN RAISE EXCEPTION 'THIEU_SO_LO:%:lô chưa có số lô, gõ số lô trên bao rồi lấy', l.code; END IF;
    UPDATE public.mix_lots SET so_lo = v_so_lo, updated_at = now() WHERE id = l.id;
  END IF;
  -- kg hàng chèn: gõ thẳng, hoặc = cân cả pallet − bì
  v_kg := COALESCE(p_kg, CASE WHEN p_gross_kg IS NOT NULL THEN round(p_gross_kg - COALESCE(p_pallet_kg, 0), 2) END);
  IF v_kg IS NULL OR v_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  IF p_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.mix_issues WHERE id = p_id) THEN RAISE EXCEPTION 'DA_GHI_SO:phiếu đã ghi rồi'; END IF;
  v_ton := l.kg_in - l.kg_used - l.kg_at_line;
  IF v_kg > v_ton + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:lấy % > tồn %', l.code, v_kg, v_ton; END IF;

  -- mã gốc: chọn tay (một hay nhiều) > phiếu ca của ca này
  v_ids := (SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(p_raw_lot_ids, ARRAY[]::uuid[])) x WHERE x IS NOT NULL);
  IF v_ids IS NULL AND p_shift_id IS NOT NULL THEN
    SELECT CASE WHEN r.raw_lot_id IS NULL THEN NULL ELSE ARRAY[r.raw_lot_id] END INTO v_ids
      FROM public.shift_production_reports r WHERE r.facility_id = l.facility_id AND r.report_date = COALESCE(p_shift_date, current_date) AND r.shift_id = p_shift_id;
  END IF;
  IF v_ids IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(v_ids) x LEFT JOIN public.raw_lots rl ON rl.id = x WHERE rl.id IS NULL OR rl.facility_id <> l.facility_id) THEN
    RAISE EXCEPTION 'LO_KHAC_NHA_MAY:mã gốc';
  END IF;

  INSERT INTO public.mix_issues (id, code, facility_id, mix_lot_id, shift_date, shift_id, team, purpose, target_index, target_value,
                                 kg_out, out_by, production_order_id, note, created_by, raw_lot_id, raw_lot_ids, so_banh, gross_kg, pallet_kg, vi_tri)
  VALUES (COALESCE(p_id, gen_random_uuid()), public.fn_mix_ma('PC', l.facility_id), l.facility_id, l.id, COALESCE(p_shift_date, current_date), p_shift_id, p_team,
          COALESCE(p_purpose, 'chay_lai'), p_target_index, p_target_value, v_kg, v_emp, p_production_order_id, p_note, v_emp,
          CASE WHEN v_ids IS NULL THEN NULL ELSE v_ids[1] END, v_ids, p_so_banh, p_gross_kg, p_pallet_kg, p_vi_tri)
  RETURNING id INTO v_id;

  UPDATE public.mix_lots SET kg_at_line = kg_at_line + v_kg, status = 'in_use', updated_at = now() WHERE id = l.id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_lay(uuid, numeric, date, uuid, text, text, text, numeric, uuid, text, uuid, uuid[], int, numeric, numeric, text, text) TO authenticated;

-- ─── Views: v_mix_lots (l.* đổi → DROP), v_mix_issues + lot_so_lo, v_raw_lot_chen chi tiết có số lô ──
DROP VIEW IF EXISTS public.v_mix_lots;
CREATE VIEW public.v_mix_lots AS
SELECT l.*, f.code AS facility_code,
       round(l.kg_in - l.kg_used - l.kg_at_line, 2) AS ton_kg,
       (current_date - l.received_date)::int AS tuoi_ngay,
       (SELECT count(*) FROM public.raw_photos p WHERE p.ref_type = 'mix_lot' AND p.ref_id = l.id)::int AS so_anh,
       e.full_name AS created_name
FROM public.mix_lots l
LEFT JOIN public.facilities f ON f.id = l.facility_id
LEFT JOIN public.employees e ON e.id = l.created_by;
ALTER VIEW public.v_mix_lots SET (security_invoker = on);
GRANT SELECT ON public.v_mix_lots TO authenticated;

DROP VIEW IF EXISTS public.v_mix_issues;
CREATE VIEW public.v_mix_issues AS
SELECT i.*, f.code AS facility_code, l.code AS lot_code, l.so_lo AS lot_so_lo, l.source_type, l.source_desc, l.grade AS lot_grade, l.po, l.mooney, l.pri,
       sh.code AS shift_code, sh.name AS shift_name,
       po.code AS production_code, b.batch_no AS output_batch_no,
       (SELECT count(*) FROM public.raw_photos p WHERE p.ref_type = 'mix_issue_out' AND p.ref_id = i.id)::int AS so_anh_lay,
       (SELECT count(*) FROM public.raw_photos p WHERE p.ref_type = 'mix_issue_return' AND p.ref_id = i.id)::int AS so_anh_tra,
       public.fn_mix_thieu_anh(i.id, i.facility_id) AS thieu_anh,
       eo.full_name AS out_name, er.full_name AS return_name, es.full_name AS submitted_name, eq.full_name AS qc_confirmed_name, ev.full_name AS received_name,
       rl.ma AS ma_goc,
       (SELECT string_agg(r2.ma, ' + ' ORDER BY r2.ma) FROM unnest(i.raw_lot_ids) x JOIN public.raw_lots r2 ON r2.id = x) AS ma_goc_all
FROM public.mix_issues i
JOIN public.mix_lots l ON l.id = i.mix_lot_id
LEFT JOIN public.facilities f ON f.id = i.facility_id
LEFT JOIN public.shifts sh ON sh.id = i.shift_id
LEFT JOIN public.production_orders po ON po.id = i.production_order_id
LEFT JOIN public.stock_batches b ON b.id = i.output_batch_id
LEFT JOIN public.employees eo ON eo.id = i.out_by
LEFT JOIN public.employees er ON er.id = i.return_by
LEFT JOIN public.employees es ON es.id = i.submitted_by
LEFT JOIN public.employees eq ON eq.id = i.qc_confirmed_by
LEFT JOIN public.employees ev ON ev.id = i.received_by
LEFT JOIN public.raw_lots rl ON rl.id = i.raw_lot_id;
ALTER VIEW public.v_mix_issues SET (security_invoker = on);
GRANT SELECT ON public.v_mix_issues TO authenticated;

CREATE OR REPLACE VIEW public.v_raw_lot_chen AS
WITH ct AS (
  SELECT x.raw_lot_id, l.id AS mix_lot_id, l.code AS lot_code, l.so_lo, l.source_type, l.grade, l.source_desc, i.vi_tri,
         round(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)), 2) AS kg,
         sum(i.so_banh)::int AS so_banh, count(*)::int AS so_phieu,
         bool_or(cardinality(i.raw_lot_ids) > 1) AS co_chung
    FROM public.mix_issues i
    JOIN LATERAL (SELECT unnest(COALESCE(i.raw_lot_ids, CASE WHEN i.raw_lot_id IS NULL THEN NULL ELSE ARRAY[i.raw_lot_id] END)) AS raw_lot_id) x ON true
    JOIN public.mix_lots l ON l.id = i.mix_lot_id
   WHERE i.status = 'received'
   GROUP BY x.raw_lot_id, l.id, l.code, l.so_lo, l.source_type, l.grade, l.source_desc, i.vi_tri
)
SELECT b.raw_lot_id, b.facility_id, b.ma, b.rubber_type_name, b.trang_thai, b.xuat_sx_kho_kg,
       round(COALESCE(sum(ct.kg), 0), 2) AS chen_kg,
       COALESCE(sum(ct.so_phieu), 0)::int AS so_phieu_chen,
       COALESCE(sum(ct.so_banh), 0)::int AS so_banh_chen,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.vi_tri = 'be_slap'), 0), 2) AS chen_be_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.vi_tri = 'may_mix'), 0), 2) AS chen_mix_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.source_type = 'loi'), 0), 2) AS chen_loi_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.source_type = 'dkl'), 0), 2) AS chen_dkl_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.source_type = 'std'), 0), 2) AS chen_chuan_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.source_type IN ('mua_ngoai', 'khac')), 0), 2) AS chen_khac_kg,
       CASE WHEN COALESCE(b.xuat_sx_kho_kg, 0) + COALESCE(sum(ct.kg), 0) > 0
            THEN round(100 * COALESCE(sum(ct.kg), 0) / (COALESCE(b.xuat_sx_kho_kg, 0) + COALESCE(sum(ct.kg), 0)), 1) END AS ty_le_chen_pct,
       COALESCE(jsonb_agg(jsonb_build_object('lot_code', ct.lot_code, 'so_lo', ct.so_lo, 'vi_tri', ct.vi_tri, 'source_type', ct.source_type, 'grade', ct.grade, 'desc', ct.source_desc, 'kg', ct.kg, 'so_banh', ct.so_banh, 'so_phieu', ct.so_phieu, 'co_chung', ct.co_chung) ORDER BY ct.kg DESC) FILTER (WHERE ct.mix_lot_id IS NOT NULL), '[]'::jsonb) AS chi_tiet
FROM public.v_raw_lot_balance b
LEFT JOIN ct ON ct.raw_lot_id = b.raw_lot_id
GROUP BY b.raw_lot_id, b.facility_id, b.ma, b.rubber_type_name, b.trang_thai, b.xuat_sx_kho_kg;
ALTER VIEW public.v_raw_lot_chen SET (security_invoker = on);
GRANT SELECT ON public.v_raw_lot_chen TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT to_regprocedure('public.fn_mix_lay(uuid,numeric,date,uuid,text,text,text,numeric,uuid,text,uuid,uuid[],int,numeric,numeric,text,text)') AS f_lay_v4,
       to_regprocedure('public.fn_mix_tao_lo(uuid,text,text,text,numeric,numeric,numeric,numeric,numeric,boolean,boolean,date,text,text,uuid,text)') AS f_tao_lo,
       to_regprocedure('public.fn_mix_sua_lo(uuid,boolean,boolean,numeric,text,text,text,boolean,text)') AS f_sua_lo,
       (SELECT count(*) FROM public.mix_lots WHERE so_lo IS NULL AND status <> 'cancelled') AS lo_chua_co_so_lo,
       (SELECT count(*) FROM public.mix_lots WHERE so_lo IS NOT NULL) AS lo_co_so_lo;
SELECT code, so_lo, source_type, source_desc, round(kg_in - kg_used - kg_at_line, 1) AS ton_kg FROM public.mix_lots WHERE status <> 'cancelled' ORDER BY so_lo NULLS FIRST, created_at DESC LIMIT 20;
