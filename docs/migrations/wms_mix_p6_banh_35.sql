-- ============================================================
-- HÀNG CHÈN — GĐ4f: bành 35 kg, máy tự quy kg ↔ bành, bớt ô gõ số bành (30/10/2026, chủ DN)
--   · mix_lots.kg_per_banh (mặc định 35; lô TP / hàng chuẩn / sổ ca lấy cỡ bành của chủng loại) + so_banh_in
--   · Nhập lô gõ tay: gõ số bành → kg = bành × 35 (hoặc gõ kg như cũ)
--   · Phiếu chèn: số bành lấy / trả tự tính = round(kg / kg_per_banh), tổ chỉ chỉnh khi đếm khác
--   · v_mix_lots thêm ton_banh; v_mix_issues thêm lot_kg_per_banh
-- Ngày: 2026-10-30 · Phụ thuộc: wms_mix_p5_so_lo.sql (CHẠY p4 → p5 → p6)
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

ALTER TABLE public.mix_lots ADD COLUMN IF NOT EXISTS kg_per_banh numeric(8,2) NOT NULL DEFAULT 35;
ALTER TABLE public.mix_lots ADD COLUMN IF NOT EXISTS so_banh_in int;

-- Lô cũ: cỡ bành theo nguồn, số bành nhập = kg / cỡ bành
UPDATE public.mix_lots m SET kg_per_banh = f.kg_per_banh FROM public.fg_lots f
 WHERE m.source_ref_type = 'fg_lot' AND m.source_ref_id = f.id AND f.kg_per_banh > 0;
UPDATE public.mix_lots m SET kg_per_banh = mt.weight_per_unit FROM public.materials mt
 WHERE m.source_ref_type = 'material' AND m.source_ref_id = mt.id AND mt.weight_per_unit > 0;
UPDATE public.mix_lots m SET kg_per_banh = mt.weight_per_unit FROM public.shift_production_lines sl JOIN public.materials mt ON mt.id = sl.material_id
 WHERE m.source_ref_type = 'shift_production_line' AND m.source_ref_id = sl.id AND mt.weight_per_unit > 0;
UPDATE public.mix_lots SET so_banh_in = round(kg_in / kg_per_banh)::int WHERE so_banh_in IS NULL;
-- Phiếu cũ chưa ghi số bành → tự tính
UPDATE public.mix_issues i SET so_banh = round(i.kg_out / l.kg_per_banh)::int FROM public.mix_lots l
 WHERE l.id = i.mix_lot_id AND i.so_banh IS NULL AND i.status <> 'cancelled';
UPDATE public.mix_issues i SET so_banh_tra = round(i.kg_return / l.kg_per_banh)::int FROM public.mix_lots l
 WHERE l.id = i.mix_lot_id AND i.so_banh_tra IS NULL AND i.kg_return IS NOT NULL AND i.status <> 'cancelled';

-- ─── Nhập lô gõ tay: số bành hoặc kg, cỡ bành mặc định 35 ─────────────────
DROP FUNCTION IF EXISTS public.fn_mix_tao_lo(uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, boolean, boolean, date, text, text, uuid, text);
CREATE OR REPLACE FUNCTION public.fn_mix_tao_lo(
  p_facility_id uuid, p_source_type text, p_source_desc text, p_grade text, p_kg_in numeric,
  p_po numeric DEFAULT NULL, p_mooney numeric DEFAULT NULL, p_pri numeric DEFAULT NULL,
  p_qc_allow_mix_pct numeric DEFAULT NULL, p_qc_allow_rerun boolean DEFAULT true, p_metal_cleared boolean DEFAULT false,
  p_received_date date DEFAULT current_date, p_note text DEFAULT NULL, p_source_ref_type text DEFAULT NULL, p_source_ref_id uuid DEFAULT NULL,
  p_so_lo text DEFAULT NULL, p_so_banh int DEFAULT NULL, p_kg_per_banh numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; q json; v_so_lo text := public.fn_mix_chuan_so_lo(p_so_lo); v_kpb numeric := COALESCE(NULLIF(p_kg_per_banh, 0), 35); v_kg numeric; v_banh int; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  q := public.fn_nvl_quyen(p_facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kho_chen'; END IF;
  v_kg := COALESCE(p_kg_in, CASE WHEN p_so_banh IS NOT NULL THEN round(p_so_banh * v_kpb, 2) END);
  IF v_kg IS NULL OR v_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:gõ số bành hoặc kg'; END IF;
  v_banh := COALESCE(p_so_banh, round(v_kg / v_kpb)::int);
  IF v_so_lo IS NULL THEN RAISE EXCEPTION 'THIEU_SO_LO:lô chèn phải có số lô'; END IF;
  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, po, mooney, pri,
                               qc_allow_mix_pct, qc_allow_rerun, metal_cleared, received_date, note, created_by, so_lo, kg_per_banh, so_banh_in)
  VALUES (public.fn_mix_ma('CH', p_facility_id), p_facility_id, p_source_type, p_source_ref_type, p_source_ref_id, p_source_desc, p_grade, v_kg,
          p_po, p_mooney, p_pri, p_qc_allow_mix_pct, COALESCE(p_qc_allow_rerun, true), COALESCE(p_metal_cleared, false),
          COALESCE(p_received_date, current_date), p_note, v_emp, v_so_lo, v_kpb, v_banh)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_tao_lo(uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, boolean, boolean, date, text, text, uuid, text, int, numeric) TO authenticated;

-- ─── LOI/DKL từ sổ ca: cỡ bành theo chủng loại của dòng ────────────────────
CREATE OR REPLACE FUNCTION public.fn_mix_tao_lo_tu_so_ca(p_line_id uuid, p_kg numeric DEFAULT NULL, p_note text DEFAULT NULL, p_metal_cleared boolean DEFAULT false, p_so_lo text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; q json; v_con numeric; v_kg numeric; v_id uuid; v_kpb numeric; v_so_lo text := public.fn_mix_chuan_so_lo(p_so_lo); v_emp uuid := public.fn_nvl_emp_hien_tai();
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
  SELECT COALESCE(NULLIF(mt.weight_per_unit, 0), 35) INTO v_kpb FROM public.shift_production_lines sl JOIN public.materials mt ON mt.id = sl.material_id WHERE sl.id = s.id;
  v_kpb := COALESCE(v_kpb, 35);

  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, qc_allow_rerun, metal_cleared, received_date, note, created_by, so_lo, kg_per_banh, so_banh_in)
  VALUES (public.fn_mix_ma('CH', s.facility_id), s.facility_id, CASE WHEN s.code = 'LOI' THEN 'loi' ELSE 'dkl' END, 'shift_production_line', s.id,
          s.material_name || ' · ' || COALESCE(s.shift_name, 'ca ?') || ' ' || to_char(s.report_date, 'DD/MM') || COALESCE(' · tổ ' || s.team, ''),
          NULL, round(v_kg, 2), true, CASE WHEN s.code = 'LOI' THEN true ELSE COALESCE(p_metal_cleared, false) END, current_date, p_note, v_emp, v_so_lo, v_kpb, round(v_kg / v_kpb)::int)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ─── Hàng không đạt từ sổ QC: cỡ bành theo lô TP nếu sổ QC gắn lô ─────────
CREATE OR REPLACE FUNCTION public.fn_mix_tao_lo_tu_qc(p_reject_id uuid, p_kg numeric, p_note text DEFAULT NULL, p_metal_cleared boolean DEFAULT false, p_so_lo text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; q json; v_id uuid; v_so_lo text; v_kpb numeric; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO r FROM public.qc_reject_log WHERE id = p_reject_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_DONG'; END IF;
  IF r.facility_id IS NULL THEN RAISE EXCEPTION 'THIEU_NHA_MAY:dòng sổ QC'; END IF;
  q := public.fn_nvl_quyen(r.facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kho_chen'; END IF;
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  v_so_lo := COALESCE(public.fn_mix_chuan_so_lo(p_so_lo), public.fn_mix_chuan_so_lo(r.so_lo));
  IF v_so_lo IS NULL THEN RAISE EXCEPTION 'THIEU_SO_LO:sổ QC không ghi số lô, gõ số lô'; END IF;
  SELECT NULLIF(f.kg_per_banh, 0) INTO v_kpb FROM public.fg_lots f WHERE f.id = r.fg_lot_id;
  v_kpb := COALESCE(v_kpb, 35);
  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, po, mooney, qc_allow_rerun, metal_cleared, received_date, note, created_by, so_lo, kg_per_banh, so_banh_in)
  VALUES (public.fn_mix_ma('CH', r.facility_id), r.facility_id, 'loi', 'qc_reject_log', r.id,
          COALESCE(r.ly_do, 'hàng không đạt') || ' · lô SX ' || v_so_lo || ' ' || to_char(r.ngay_sx, 'DD/MM') || COALESCE(' · tổ ' || r.to_sx, '') || COALESCE(' · NVL ' || r.ma_nguyen_lieu, ''),
          NULL, round(p_kg, 2),
          CASE WHEN r.po_min IS NOT NULL OR r.po_max IS NOT NULL THEN round((COALESCE(r.po_min, r.po_max) + COALESCE(r.po_max, r.po_min)) / 2, 1) END,
          CASE WHEN r.mv_min IS NOT NULL OR r.mv_max IS NOT NULL THEN round((COALESCE(r.mv_min, r.mv_max) + COALESCE(r.mv_max, r.mv_min)) / 2, 1) END,
          true, COALESCE(p_metal_cleared, true), current_date, p_note, v_emp, v_so_lo, v_kpb, round(p_kg / v_kpb)::int)
  RETURNING id INTO v_id;
  UPDATE public.qc_reject_log SET tinh_trang_xu_ly = COALESCE(tinh_trang_xu_ly, 'Đã chuyển kho chèn'), so_lo = COALESCE(so_lo, v_so_lo), updated_at = now() WHERE id = r.id;
  RETURN v_id;
END $$;

-- ─── Hàng chuẩn từ kho TP: cỡ bành = cỡ bành chủng loại ───────────────────
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

  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, qc_allow_rerun, metal_cleared, received_date, note, created_by, so_lo, kg_per_banh, so_banh_in)
  VALUES (public.fn_mix_ma('CH', p_facility_id), p_facility_id, 'std', 'material', m.id,
          'Hàng chuẩn ' || m.name || ' từ kho TP · ' || v_banh || ' bành · ' || to_char(p_shift_date, 'DD/MM'), m.name, v_kg, true, true, p_shift_date, p_note, v_emp, v_so_lo, m.weight_per_unit, v_banh)
  RETURNING id INTO v_id;

  INSERT INTO public.shift_production_lines (report_id, material_id, nhap_banh, xuat_banh, note)
  VALUES (r.id, m.id, 0, v_banh, 'Chuyển ' || v_banh || ' bành sang kho chèn')
  ON CONFLICT (report_id, material_id) DO UPDATE
     SET xuat_banh = public.shift_production_lines.xuat_banh + EXCLUDED.xuat_banh,
         note = COALESCE(public.shift_production_lines.note || ' · ', '') || EXCLUDED.note, updated_at = now();
  RETURN jsonb_build_object('lot_id', v_id, 'banh', v_banh, 'kg', v_kg, 'material', m.name);
END $$;

-- ─── Lô TP lỗi → kho chèn: cỡ bành = cỡ bành lô TP ────────────────────────
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
  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, po, mooney, qc_allow_rerun, metal_cleared, received_date, note, created_by, so_lo, kg_per_banh, so_banh_in)
  VALUES (public.fn_mix_ma('CH', l.facility_id), l.facility_id, v_src, 'fg_lot', l.id,
          'Lô TP ' || l.so_lo || ' · ' || m.name || ' · ' || v_banh || ' bành' || COALESCE(' · NVL ' || v_ma, '') || COALESCE(' · ' || l.qc_ly_do, ''),
          m.name, v_kg,
          CASE WHEN l.qc_po_min IS NOT NULL OR l.qc_po_max IS NOT NULL THEN round((COALESCE(l.qc_po_min, l.qc_po_max) + COALESCE(l.qc_po_max, l.qc_po_min)) / 2, 1) END,
          CASE WHEN l.qc_mv_min IS NOT NULL OR l.qc_mv_max IS NOT NULL THEN round((COALESCE(l.qc_mv_min, l.qc_mv_max) + COALESCE(l.qc_mv_max, l.qc_mv_min)) / 2, 1) END,
          true, CASE WHEN v_src = 'dkl' THEN COALESCE(p_metal_cleared, false) ELSE true END, current_date, p_note, v_emp, public.fn_mix_chuan_so_lo(l.so_lo), COALESCE(NULLIF(l.kg_per_banh, 0), 35), v_banh)
  RETURNING id INTO v_id;
  UPDATE public.fg_lots SET so_banh_chen = so_banh_chen + v_banh, status = CASE WHEN so_banh - so_banh_da_xuat - so_banh_chen - v_banh <= 0 THEN 'het' ELSE status END, updated_at = now() WHERE id = l.id;
  UPDATE public.qc_reject_log SET tinh_trang_xu_ly = COALESCE(tinh_trang_xu_ly, 'Đã chuyển kho chèn ' || to_char(current_date, 'DD/MM')), updated_at = now() WHERE fg_lot_id = l.id;
  RETURN v_id;
END $$;

-- ─── Sửa lô: thêm cỡ bành ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_mix_sua_lo(uuid, boolean, boolean, numeric, text, text, text, boolean, text);
CREATE OR REPLACE FUNCTION public.fn_mix_sua_lo(
  p_lot_id uuid, p_metal_cleared boolean DEFAULT NULL, p_qc_allow_rerun boolean DEFAULT NULL, p_qc_allow_mix_pct numeric DEFAULT NULL,
  p_source_desc text DEFAULT NULL, p_grade text DEFAULT NULL, p_note text DEFAULT NULL, p_huy boolean DEFAULT false, p_so_lo text DEFAULT NULL, p_kg_per_banh numeric DEFAULT NULL
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
         kg_per_banh      = COALESCE(NULLIF(p_kg_per_banh, 0), kg_per_banh),
         so_banh_in       = CASE WHEN p_kg_per_banh IS NOT NULL AND p_kg_per_banh > 0 THEN round(kg_in / p_kg_per_banh)::int ELSE so_banh_in END,
         updated_at       = now()
   WHERE id = l.id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_sua_lo(uuid, boolean, boolean, numeric, text, text, text, boolean, text, numeric) TO authenticated;

-- ─── fn_mix_lay v5: số bành lấy tự tính nếu tổ không chỉnh (chữ ký không đổi) ──
CREATE OR REPLACE FUNCTION public.fn_mix_lay(
  p_lot_id uuid, p_kg numeric, p_shift_date date DEFAULT current_date, p_shift_id uuid DEFAULT NULL, p_team text DEFAULT NULL,
  p_purpose text DEFAULT 'chay_lai', p_target_index text DEFAULT NULL, p_target_value numeric DEFAULT NULL,
  p_production_order_id uuid DEFAULT NULL, p_note text DEFAULT NULL, p_id uuid DEFAULT NULL,
  p_raw_lot_ids uuid[] DEFAULT NULL, p_so_banh int DEFAULT NULL, p_gross_kg numeric DEFAULT NULL, p_pallet_kg numeric DEFAULT NULL, p_vi_tri text DEFAULT NULL,
  p_so_lo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_ton numeric; v_id uuid; v_ids uuid[]; v_kg numeric; v_so_lo text; v_banh int; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO l FROM public.mix_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF NOT public.fn_nvl_duoc_ky('submit', l.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  IF l.status IN ('depleted', 'cancelled') THEN RAISE EXCEPTION 'LO_DA_HET:%', l.code; END IF;
  IF l.source_type = 'dkl' AND NOT l.metal_cleared THEN RAISE EXCEPTION 'DKL_CHUA_XU_LY:%', l.code; END IF;
  IF l.so_lo IS NULL THEN
    v_so_lo := public.fn_mix_chuan_so_lo(p_so_lo);
    IF v_so_lo IS NULL THEN RAISE EXCEPTION 'THIEU_SO_LO:%:lô chưa có số lô, gõ số lô trên bao rồi lấy', l.code; END IF;
    UPDATE public.mix_lots SET so_lo = v_so_lo, updated_at = now() WHERE id = l.id;
  END IF;
  v_kg := COALESCE(p_kg, CASE WHEN p_gross_kg IS NOT NULL THEN round(p_gross_kg - COALESCE(p_pallet_kg, 0), 2) END);
  IF v_kg IS NULL OR v_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  IF p_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.mix_issues WHERE id = p_id) THEN RAISE EXCEPTION 'DA_GHI_SO:phiếu đã ghi rồi'; END IF;
  v_ton := l.kg_in - l.kg_used - l.kg_at_line;
  IF v_kg > v_ton + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:lấy % > tồn %', l.code, v_kg, v_ton; END IF;
  v_banh := COALESCE(p_so_banh, round(v_kg / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int);

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
          CASE WHEN v_ids IS NULL THEN NULL ELSE v_ids[1] END, v_ids, v_banh, p_gross_kg, p_pallet_kg, p_vi_tri)
  RETURNING id INTO v_id;

  UPDATE public.mix_lots SET kg_at_line = kg_at_line + v_kg, status = 'in_use', updated_at = now() WHERE id = l.id;
  RETURN v_id;
END $$;

-- ─── fn_mix_tra v4: số bành còn tự tính (chữ ký không đổi) ─────────────────
CREATE OR REPLACE FUNCTION public.fn_mix_tra(
  p_issue_id uuid, p_kg_return numeric, p_handover boolean DEFAULT false, p_note text DEFAULT NULL, p_output_batch_id uuid DEFAULT NULL,
  p_shift_id uuid DEFAULT NULL, p_team text DEFAULT NULL, p_gross_kg numeric DEFAULT NULL, p_pallet_kg numeric DEFAULT NULL, p_so_banh_tra int DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; v_kg numeric; v_kpb numeric; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO i FROM public.mix_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF i.status NOT IN ('issued', 'returned') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', i.code, i.status; END IF;
  IF NOT public.fn_nvl_duoc_ky('submit', i.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  v_kg := COALESCE(p_kg_return, CASE WHEN p_gross_kg IS NOT NULL THEN round(p_gross_kg - COALESCE(p_pallet_kg, 0), 2) END);
  IF v_kg IS NULL OR v_kg < 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  IF v_kg > i.kg_out + 0.01 THEN RAISE EXCEPTION 'TRA_QUA_LAY:%:trả % > lấy %', i.code, v_kg, i.kg_out; END IF;
  IF i.shift_id IS NULL AND p_shift_id IS NULL THEN RAISE EXCEPTION 'THIEU_CA:%:phiếu bàn giao chưa có ca, chọn ca trước khi trả', i.code; END IF;
  SELECT COALESCE(NULLIF(kg_per_banh, 0), 35) INTO v_kpb FROM public.mix_lots WHERE id = i.mix_lot_id;

  UPDATE public.mix_issues
     SET kg_return = v_kg, return_at = now(), return_by = v_emp, kg_used = round(kg_out - v_kg, 2),
         return_gross_kg = p_gross_kg, return_pallet_kg = p_pallet_kg, so_banh_tra = COALESCE(p_so_banh_tra, round(v_kg / COALESCE(v_kpb, 35))::int),
         handover_to_next = COALESCE(p_handover, false) AND v_kg > 0, output_batch_id = COALESCE(p_output_batch_id, output_batch_id),
         shift_id = COALESCE(shift_id, p_shift_id), team = COALESCE(p_team, team),
         shift_date = CASE WHEN i.shift_id IS NULL AND p_shift_id IS NOT NULL THEN current_date ELSE shift_date END,
         note = COALESCE(p_note, note), status = 'returned', updated_at = now()
   WHERE id = i.id;
  RETURN jsonb_build_object('code', i.code, 'kg_out', i.kg_out, 'kg_return', v_kg, 'kg_used', round(i.kg_out - v_kg, 2));
END $$;

-- ─── Views ─────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_mix_lots;
CREATE VIEW public.v_mix_lots AS
SELECT l.*, f.code AS facility_code,
       round(l.kg_in - l.kg_used - l.kg_at_line, 2) AS ton_kg,
       round((l.kg_in - l.kg_used - l.kg_at_line) / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int AS ton_banh,
       (current_date - l.received_date)::int AS tuoi_ngay,
       (SELECT count(*) FROM public.raw_photos p WHERE p.ref_type = 'mix_lot' AND p.ref_id = l.id)::int AS so_anh,
       e.full_name AS created_name
FROM public.mix_lots l
LEFT JOIN public.facilities f ON f.id = l.facility_id
LEFT JOIN public.employees e ON e.id = l.created_by;
ALTER VIEW public.v_mix_lots SET (security_invoker = on);
GRANT SELECT ON public.v_mix_lots TO authenticated;

CREATE OR REPLACE VIEW public.v_mix_issues AS
SELECT i.*, f.code AS facility_code, l.code AS lot_code, l.so_lo AS lot_so_lo, l.source_type, l.source_desc, l.grade AS lot_grade, l.po, l.mooney, l.pri,
       sh.code AS shift_code, sh.name AS shift_name,
       po.code AS production_code, b.batch_no AS output_batch_no,
       (SELECT count(*) FROM public.raw_photos p WHERE p.ref_type = 'mix_issue_out' AND p.ref_id = i.id)::int AS so_anh_lay,
       (SELECT count(*) FROM public.raw_photos p WHERE p.ref_type = 'mix_issue_return' AND p.ref_id = i.id)::int AS so_anh_tra,
       public.fn_mix_thieu_anh(i.id, i.facility_id) AS thieu_anh,
       eo.full_name AS out_name, er.full_name AS return_name, es.full_name AS submitted_name, eq.full_name AS qc_confirmed_name, ev.full_name AS received_name,
       rl.ma AS ma_goc,
       (SELECT string_agg(r2.ma, ' + ' ORDER BY r2.ma) FROM unnest(i.raw_lot_ids) x JOIN public.raw_lots r2 ON r2.id = x) AS ma_goc_all,
       COALESCE(NULLIF(l.kg_per_banh, 0), 35) AS lot_kg_per_banh
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

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT to_regprocedure('public.fn_mix_tao_lo(uuid,text,text,text,numeric,numeric,numeric,numeric,numeric,boolean,boolean,date,text,text,uuid,text,int,numeric)') AS f_tao_lo_v3,
       to_regprocedure('public.fn_mix_sua_lo(uuid,boolean,boolean,numeric,text,text,text,boolean,text,numeric)') AS f_sua_lo_v3,
       (SELECT count(*) FROM pg_proc WHERE proname = 'fn_mix_lay' AND pronamespace = 'public'::regnamespace) AS so_ban_fn_mix_lay_phai_la_1;
SELECT code, so_lo, source_type, kg_per_banh, so_banh_in, round(kg_in - kg_used - kg_at_line, 1) AS ton_kg, round((kg_in - kg_used - kg_at_line) / kg_per_banh)::int AS ton_banh
  FROM public.mix_lots WHERE status <> 'cancelled' ORDER BY created_at DESC LIMIT 20;
