-- ============================================================
-- HÀNG CHÈN — GĐ4g: QUY TRÌNH KÝ THEO PHÂN CÔNG + ký cả ca + trả 0 kg không cần ảnh (30/10/2026, chủ DN)
--   · Bước 1 KHAI BÁO (nhập lô chèn, lấy, trả, ký bên giao): QS được phân công + chủ DN
--   · Bước 2 DUYỆT QC: QC (Lê Thành Nhân, Lệ Trinh) + chủ DN
--   · Bước 3 THỦ KHO NHẬN (trừ kho chèn, điền sổ ca): thủ kho được phân công — tạm thời chủ DN (sửa 30/10: không phải BGĐ)
--   · Bảng phân công mix_signers (buoc: khai_bao / duyet_qc / nhan_kho), BGĐ thêm/thu trên màn Phân công; BGĐ level ≤ 3 làm được mọi bước
--   · Chưa phân công bước nào → bước đó dùng luật cũ (khai báo: thủ kho/QC; duyệt QC: HAP-QC/raw_qc_signers; nhận: raw_store_keepers)
--   · Ký nhiều phiếu một chạm: fn_mix_ky_nhieu(ids, bước) — màn Chờ ký có nút "Ký tất cả phiếu ca này"
--   · Trả 0 kg (dùng hết) → không bắt ảnh lúc trả; còn hàng dư mới cần 2 ảnh
-- Ngày: 2026-10-30 · Phụ thuộc: wms_mix_p6_banh_35.sql (CHẠY p4 → p5 → p6 → p7)
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mix_signers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  buoc        text NOT NULL CHECK (buoc IN ('khai_bao', 'duyet_qc', 'nhan_kho')),
  facility_id uuid REFERENCES public.facilities(id),   -- NULL = mọi nhà máy
  granted_by  uuid REFERENCES public.employees(id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_by  uuid REFERENCES public.employees(id),
  revoked_at  timestamptz,
  is_active   boolean NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.mix_signers IS 'Phân công quy trình hàng chèn: khai_bao (QS) · duyet_qc (QC) · nhan_kho (thủ kho). facility_id NULL = mọi nhà máy.';
CREATE UNIQUE INDEX IF NOT EXISTS mix_signers_uniq ON public.mix_signers (employee_id, buoc, COALESCE(facility_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE is_active;
ALTER TABLE public.mix_signers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY ms_select ON public.mix_signers FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY ms_write ON public.mix_signers FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT, INSERT, UPDATE ON public.mix_signers TO authenticated;

-- ─── Luật ký hàng chèn ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mix_duoc_ky(p_buoc text, p_facility_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emp uuid; v_level int; v_buoc text; v_co boolean; q json;
BEGIN
  IF auth.uid() IS NULL THEN RETURN true; END IF;
  SELECT e.id, COALESCE(p.level, 99) INTO v_emp, v_level
    FROM public.employees e LEFT JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid();
  IF v_emp IS NULL THEN RETURN false; END IF;
  IF v_level <= 3 THEN RETURN true; END IF;                                   -- BGĐ làm được mọi bước
  v_buoc := CASE p_buoc WHEN 'submit' THEN 'khai_bao' WHEN 'cancel' THEN 'khai_bao' WHEN 'qc_confirm' THEN 'duyet_qc' WHEN 'receive' THEN 'nhan_kho' ELSE p_buoc END;
  IF v_buoc NOT IN ('khai_bao', 'duyet_qc', 'nhan_kho') THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.mix_signers t WHERE t.is_active AND t.buoc = v_buoc AND t.employee_id = v_emp
              AND (t.facility_id IS NULL OR p_facility_id IS NULL OR t.facility_id = p_facility_id)) THEN RETURN true; END IF;
  SELECT EXISTS (SELECT 1 FROM public.mix_signers WHERE is_active AND buoc = v_buoc) INTO v_co;
  IF v_co THEN RETURN false; END IF;                                           -- đã phân công bước này mà không có tên → không
  -- chưa phân công → luật cũ để không kẹt việc
  q := public.fn_nvl_quyen(p_facility_id);
  CASE v_buoc
    WHEN 'khai_bao' THEN RETURN (q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean;
    WHEN 'duyet_qc' THEN RETURN (q->>'la_qc')::boolean;
    WHEN 'nhan_kho' THEN RETURN (q->>'receive')::boolean;
    ELSE RETURN false;
  END CASE;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_duoc_ky(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_mix_quyen(p_facility_id uuid DEFAULT NULL)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_level int;
BEGIN
  SELECT COALESCE(p.level, 99) INTO v_level FROM public.employees e LEFT JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid();
  RETURN json_build_object(
    'khai_bao',  public.fn_mix_duoc_ky('khai_bao',  p_facility_id),
    'duyet_qc',  public.fn_mix_duoc_ky('duyet_qc',  p_facility_id),
    'nhan_kho',  public.fn_mix_duoc_ky('nhan_kho',  p_facility_id),
    'la_bgd',    COALESCE(v_level, 99) <= 3,
    'da_phan_cong', json_build_object(
      'khai_bao',  (SELECT count(*) FROM public.mix_signers WHERE is_active AND buoc = 'khai_bao'),
      'duyet_qc',  (SELECT count(*) FROM public.mix_signers WHERE is_active AND buoc = 'duyet_qc'),
      'nhan_kho',  (SELECT count(*) FROM public.mix_signers WHERE is_active AND buoc = 'nhan_kho')));
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_quyen(uuid) TO authenticated;

-- Danh sách phân công kèm tên (màn Phân công)
CREATE OR REPLACE VIEW public.v_mix_signers AS
SELECT s.id, s.employee_id, e.full_name, e.email, s.buoc, s.facility_id, f.code AS facility_code, s.is_active, s.granted_at, s.revoked_at, s.notes, g.full_name AS granted_name
FROM public.mix_signers s
JOIN public.employees e ON e.id = s.employee_id
LEFT JOIN public.facilities f ON f.id = s.facility_id
LEFT JOIN public.employees g ON g.id = s.granted_by;
ALTER VIEW public.v_mix_signers SET (security_invoker = on);
GRANT SELECT ON public.v_mix_signers TO authenticated;

-- ─── Ảnh lúc trả: trả 0 kg thì không bắt ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mix_thieu_anh(p_issue_id uuid, p_facility_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.raw_settings; k text; v_ref text; v_ret numeric;
BEGIN
  s := public.fn_raw_setting(p_facility_id);
  SELECT kg_return INTO v_ret FROM public.mix_issues WHERE id = p_issue_id;
  FOREACH v_ref IN ARRAY ARRAY['mix_issue_out', 'mix_issue_return'] LOOP
    IF v_ref = 'mix_issue_return' AND v_ret IS NOT NULL AND v_ret <= 0.005 THEN CONTINUE; END IF;   -- dùng hết: không có gì để chụp
    FOR k IN SELECT jsonb_array_elements_text(s.anh_bat_buoc) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.raw_photos p WHERE p.ref_type = v_ref AND p.ref_id = p_issue_id AND p.kind = k) THEN
        RETURN v_ref || ':' || k;
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END $$;

-- ─── Các hàm hàng chèn: kiểm quyền qua fn_mix_duoc_ky (thân hàm giữ nguyên p6/p4/p1) ──
CREATE OR REPLACE FUNCTION public.fn_mix_tao_lo(
  p_facility_id uuid, p_source_type text, p_source_desc text, p_grade text, p_kg_in numeric,
  p_po numeric DEFAULT NULL, p_mooney numeric DEFAULT NULL, p_pri numeric DEFAULT NULL,
  p_qc_allow_mix_pct numeric DEFAULT NULL, p_qc_allow_rerun boolean DEFAULT true, p_metal_cleared boolean DEFAULT false,
  p_received_date date DEFAULT current_date, p_note text DEFAULT NULL, p_source_ref_type text DEFAULT NULL, p_source_ref_id uuid DEFAULT NULL,
  p_so_lo text DEFAULT NULL, p_so_banh int DEFAULT NULL, p_kg_per_banh numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_so_lo text := public.fn_mix_chuan_so_lo(p_so_lo); v_kpb numeric := COALESCE(NULLIF(p_kg_per_banh, 0), 35); v_kg numeric; v_banh int; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  IF NOT public.fn_mix_duoc_ky('khai_bao', p_facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:khai_bao'; END IF;
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

CREATE OR REPLACE FUNCTION public.fn_mix_tao_lo_tu_so_ca(p_line_id uuid, p_kg numeric DEFAULT NULL, p_note text DEFAULT NULL, p_metal_cleared boolean DEFAULT false, p_so_lo text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; v_con numeric; v_kg numeric; v_id uuid; v_kpb numeric; v_so_lo text := public.fn_mix_chuan_so_lo(p_so_lo); v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT v.id, v.facility_id, v.report_date, v.shift_name, r.team, v.code, v.material_name, v.nhap_kg, v.status
    INTO s
    FROM public.v_shift_production_lines v JOIN public.shift_production_reports r ON r.id = v.report_id
   WHERE v.id = p_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_DONG'; END IF;
  IF s.code NOT IN ('LOI', 'DKL') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:không phải dòng LOI/DKL', s.code; END IF;
  IF s.status <> 'received' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:phiếu ca chưa đủ 3 chữ ký', s.status; END IF;
  IF NOT public.fn_mix_duoc_ky('khai_bao', s.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:khai_bao'; END IF;
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

CREATE OR REPLACE FUNCTION public.fn_mix_tao_lo_tu_qc(p_reject_id uuid, p_kg numeric, p_note text DEFAULT NULL, p_metal_cleared boolean DEFAULT false, p_so_lo text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_id uuid; v_so_lo text; v_kpb numeric; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO r FROM public.qc_reject_log WHERE id = p_reject_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_DONG'; END IF;
  IF r.facility_id IS NULL THEN RAISE EXCEPTION 'THIEU_NHA_MAY:dòng sổ QC'; END IF;
  IF NOT public.fn_mix_duoc_ky('khai_bao', r.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:khai_bao'; END IF;
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

CREATE OR REPLACE FUNCTION public.fn_mix_lay_hang_chuan(p_facility_id uuid, p_material_id uuid, p_kg numeric, p_shift_date date DEFAULT current_date, p_shift_id uuid DEFAULT NULL, p_note text DEFAULT NULL, p_so_lo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; r record; v_banh int; v_kg numeric; v_ton int; v_id uuid; v_so_lo text := public.fn_mix_chuan_so_lo(p_so_lo); v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  IF NOT public.fn_mix_duoc_ky('khai_bao', p_facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:khai_bao'; END IF;
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

CREATE OR REPLACE FUNCTION public.fn_mix_tao_lo_tu_fg(p_fg_lot_id uuid, p_so_banh int DEFAULT NULL, p_note text DEFAULT NULL, p_metal_cleared boolean DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; m record; v_con int; v_banh int; v_kg numeric; v_src text; v_id uuid; v_ma text; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO l FROM public.fg_lots WHERE id = p_fg_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF NOT public.fn_mix_duoc_ky('khai_bao', l.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:khai_bao'; END IF;
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

CREATE OR REPLACE FUNCTION public.fn_mix_sua_lo(
  p_lot_id uuid, p_metal_cleared boolean DEFAULT NULL, p_qc_allow_rerun boolean DEFAULT NULL, p_qc_allow_mix_pct numeric DEFAULT NULL,
  p_source_desc text DEFAULT NULL, p_grade text DEFAULT NULL, p_note text DEFAULT NULL, p_huy boolean DEFAULT false, p_so_lo text DEFAULT NULL, p_kg_per_banh numeric DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; q json;
BEGIN
  SELECT * INTO l FROM public.mix_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF NOT public.fn_mix_duoc_ky('khai_bao', l.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:khai_bao'; END IF;
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

CREATE OR REPLACE FUNCTION public.fn_mix_kiem_ke(p_lot_id uuid, p_kg_thuc numeric, p_ly_do text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_ton numeric; v_chenh numeric; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO l FROM public.mix_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF NOT public.fn_mix_duoc_ky('khai_bao', l.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:khai_bao'; END IF;
  IF l.status = 'cancelled' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:đã hủy', l.code; END IF;
  IF p_kg_thuc IS NULL OR p_kg_thuc < 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  v_ton := l.kg_in - l.kg_used - l.kg_at_line;
  v_chenh := round(p_kg_thuc - v_ton, 2);
  IF v_chenh <> 0 AND COALESCE(btrim(p_ly_do), '') = '' THEN RAISE EXCEPTION 'CAN_LY_DO:%:lệch % kg', l.code, v_chenh; END IF;
  INSERT INTO public.mix_adjustments (mix_lot_id, kg_so, kg_thuc, chenh_kg, ly_do, note, created_by)
  VALUES (l.id, round(v_ton, 2), p_kg_thuc, v_chenh, p_ly_do, p_note, v_emp);
  -- Điều chỉnh vào kg_in để tồn (= kg_in − used − at_line) khớp cân thực; sổ chuyển động giữ vết
  UPDATE public.mix_lots
     SET kg_in = kg_in + v_chenh,
         status = CASE WHEN (kg_in + v_chenh - kg_used - kg_at_line) <= 0.005 AND kg_at_line <= 0.005 THEN 'depleted' WHEN kg_at_line > 0.005 THEN 'in_use' ELSE 'available' END,
         updated_at = now()
   WHERE id = l.id;
  RETURN jsonb_build_object('code', l.code, 'kg_so', round(v_ton, 2), 'kg_thuc', p_kg_thuc, 'chenh_kg', v_chenh);
END $$;

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
  IF NOT public.fn_mix_duoc_ky('khai_bao', l.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
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
  IF NOT public.fn_mix_duoc_ky('khai_bao', i.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
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

CREATE OR REPLACE FUNCTION public.fn_mix_doi_ma_goc(p_issue_id uuid, p_raw_lot_ids uuid[], p_vi_tri text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; v_ids uuid[];
BEGIN
  SELECT * INTO i FROM public.mix_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF i.status IN ('received', 'cancelled') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', i.code, i.status; END IF;
  IF NOT public.fn_mix_duoc_ky('khai_bao', i.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  v_ids := (SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(p_raw_lot_ids, ARRAY[]::uuid[])) x WHERE x IS NOT NULL);
  IF v_ids IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(v_ids) x LEFT JOIN public.raw_lots rl ON rl.id = x WHERE rl.id IS NULL OR rl.facility_id <> i.facility_id) THEN RAISE EXCEPTION 'LO_KHAC_NHA_MAY:mã gốc'; END IF;
  UPDATE public.mix_issues SET raw_lot_ids = v_ids, raw_lot_id = CASE WHEN v_ids IS NULL THEN NULL ELSE v_ids[1] END, vi_tri = COALESCE(p_vi_tri, vi_tri), updated_at = now() WHERE id = i.id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_mix_ky(p_issue_id uuid, p_buoc text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i       record;
  l       record;
  v_emp   uuid := public.fn_nvl_emp_hien_tai();
  v_thieu text;
  v_next  uuid;
  v_ton   numeric;
BEGIN
  SELECT * INTO i FROM public.mix_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF NOT public.fn_mix_duoc_ky(p_buoc, i.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:%', p_buoc; END IF;

  CASE p_buoc
    WHEN 'submit' THEN
      IF i.status <> 'returned' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', i.code, i.status; END IF;
      v_thieu := public.fn_mix_thieu_anh(i.id, i.facility_id);
      IF v_thieu IS NOT NULL THEN RAISE EXCEPTION 'THIEU_ANH:%:%', i.code, v_thieu; END IF;
      UPDATE public.mix_issues SET status = 'submitted', submitted_by = v_emp, submitted_at = now(), note = COALESCE(p_note, note), updated_at = now() WHERE id = i.id;

    WHEN 'qc_confirm' THEN
      IF i.status <> 'submitted' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', i.code, i.status; END IF;
      UPDATE public.mix_issues SET status = 'qc_confirmed', qc_confirmed_by = v_emp, qc_confirmed_at = now(), updated_at = now() WHERE id = i.id;

    WHEN 'receive' THEN
      IF i.status <> 'qc_confirmed' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', i.code, i.status; END IF;
      SELECT * INTO l FROM public.mix_lots WHERE id = i.mix_lot_id FOR UPDATE;
      -- Kho chèn đổi tại đây: phần lấy rời dây chuyền; tiêu hao cộng vào kg_used; phần trả về kho (tồn tự tăng)
      UPDATE public.mix_lots
         SET kg_at_line = GREATEST(kg_at_line - i.kg_out, 0),
             kg_used    = kg_used + COALESCE(i.kg_used, 0),
             updated_at = now()
       WHERE id = l.id;
      UPDATE public.mix_issues SET status = 'received', received_by = v_emp, received_at = now(), updated_at = now() WHERE id = i.id;

      -- Bàn giao ca sau: phần còn lại ở lại dây chuyền = phiếu lấy mới (ca kế)
      IF i.handover_to_next AND COALESCE(i.kg_return, 0) > 0 THEN
        INSERT INTO public.mix_issues (code, facility_id, mix_lot_id, shift_date, shift_id, team, purpose, target_index, target_value,
                                       kg_out, out_by, production_order_id, handover_from_issue_id, note, created_by)
        VALUES (public.fn_mix_ma('PC', i.facility_id), i.facility_id, i.mix_lot_id, i.shift_date, NULL, NULL, i.purpose, i.target_index, i.target_value,
                i.kg_return, v_emp, i.production_order_id, i.id, 'Bàn giao từ ' || i.code || ' (ca sau ghi lại ca / tổ)', v_emp)
        RETURNING id INTO v_next;
        UPDATE public.mix_lots SET kg_at_line = kg_at_line + i.kg_return, updated_at = now() WHERE id = l.id;
      END IF;

      SELECT kg_in - kg_used - kg_at_line INTO v_ton FROM public.mix_lots WHERE id = l.id;
      UPDATE public.mix_lots SET status = CASE WHEN v_ton <= 0.005 AND kg_at_line <= 0.005 THEN 'depleted' WHEN kg_at_line > 0.005 THEN 'in_use' ELSE 'available' END WHERE id = l.id;

      PERFORM public.fn_mix_cap_nhat_dong_chen(i.facility_id, i.shift_date, i.shift_id);

    WHEN 'cancel' THEN
      IF i.status = 'received' THEN RAISE EXCEPTION 'DA_TRU_SO:%', i.code; END IF;
      UPDATE public.mix_lots SET kg_at_line = GREATEST(kg_at_line - i.kg_out, 0), updated_at = now() WHERE id = i.mix_lot_id;
      UPDATE public.mix_lots SET status = CASE WHEN kg_in - kg_used - kg_at_line <= 0.005 AND kg_at_line <= 0.005 THEN 'depleted' WHEN kg_at_line > 0.005 THEN 'in_use' ELSE 'available' END WHERE id = i.mix_lot_id;
      UPDATE public.mix_issues SET status = 'cancelled', cancelled_at = now(), cancel_reason = p_note, updated_at = now() WHERE id = i.id;
    ELSE
      RAISE EXCEPTION 'BUOC_KHONG_HOP_LE:%', p_buoc;
  END CASE;

  RETURN jsonb_build_object('code', i.code, 'buoc', p_buoc, 'kg_used', i.kg_used, 'next_issue_id', v_next);
END $$;

-- ─── Ký nhiều phiếu một chạm (cả ca) ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mix_ky_nhieu(p_ids uuid[], p_buoc text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_ok int := 0; v_loi jsonb := '[]'::jsonb; v_code text;
BEGIN
  FOREACH v_id IN ARRAY COALESCE(p_ids, ARRAY[]::uuid[]) LOOP
    BEGIN
      PERFORM public.fn_mix_ky(v_id, p_buoc, NULL);
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      SELECT code INTO v_code FROM public.mix_issues WHERE id = v_id;
      v_loi := v_loi || jsonb_build_object('id', v_id, 'code', v_code, 'loi', SQLERRM);
    END;
  END LOOP;
  RETURN jsonb_build_object('so_ky', v_ok, 'loi', v_loi);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_ky_nhieu(uuid[], text) TO authenticated;

-- ─── PHÂN CÔNG BAN ĐẦU (30/10): chủ DN → khai báo + duyệt QC + thủ kho nhận (tạm); Lê Thành Nhân, Lệ Trinh → duyệt QC ──
INSERT INTO public.mix_signers (employee_id, buoc, notes)
SELECT e.id, b.buoc, 'Phân công 30/10 · chủ DN'
  FROM public.employees e JOIN auth.users u ON u.id = e.user_id
  CROSS JOIN (VALUES ('khai_bao'), ('duyet_qc'), ('nhan_kho')) AS b(buoc)
 WHERE lower(u.email) = 'huyanhphongdien@gmail.com'
   AND NOT EXISTS (SELECT 1 FROM public.mix_signers s WHERE s.is_active AND s.employee_id = e.id AND s.buoc = b.buoc AND s.facility_id IS NULL);
INSERT INTO public.mix_signers (employee_id, buoc, notes)
SELECT e.id, 'duyet_qc', 'Phân công 30/10 · QC'
  FROM public.employees e
 WHERE (e.full_name ILIKE '%Thành Nhân%' OR e.full_name ILIKE '%Lệ Trinh%' OR e.full_name ILIKE '%Le Trinh%')
   AND NOT EXISTS (SELECT 1 FROM public.mix_signers s WHERE s.is_active AND s.employee_id = e.id AND s.buoc = 'duyet_qc' AND s.facility_id IS NULL);

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT to_regprocedure('public.fn_mix_duoc_ky(text,uuid)') AS f_duoc_ky, to_regprocedure('public.fn_mix_ky_nhieu(uuid[],text)') AS f_ky_nhieu, to_regclass('public.v_mix_signers') AS v_signers;
-- Ai đã được phân công (phải thấy chủ DN ở 3 bước và 2 QC ở duyet_qc; thiếu tên nào thì thêm ở màn Phân công hoặc INSERT thêm)
SELECT buoc, full_name, email, facility_code, notes FROM public.v_mix_signers WHERE is_active ORDER BY buoc, full_name;
-- Nhân viên tên gần giống để đối chiếu nếu thiếu
SELECT id, full_name, email FROM public.employees WHERE full_name ILIKE '%Nhân%' OR full_name ILIKE '%Trinh%' ORDER BY full_name LIMIT 20;
