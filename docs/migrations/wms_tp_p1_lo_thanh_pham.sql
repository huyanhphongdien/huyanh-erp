-- ============================================================
-- GĐ7: LÔ THÀNH PHẨM (số lô S2308AB) — mắt xích nối sổ ca ↔ sổ QC ↔ hàng chèn ↔ xuất kho TP
-- Ngày: 2026-10-30 · Phụ thuộc: wms_nvl_p6_ma_nguyen_lieu, wms_m3_p2/p3 (sổ ca), wms_m6_p1 (sổ QC), wms_mix_p1..p3, dispatch_module_v1
--
--   fg_lots            lô TP: số lô, chủng loại (materials), số bành × kg/bành, ca/tổ/phiếu ca, mã NVL, chèn, kết quả QC, đã xuất / đã chèn
--   fg_lot_exports     lịch sử xuất kho TP theo lô (bành, kg, dòng lệnh điều xe)
--   qc_reject_log      + fg_lot_id       dispatch_order_lines + fg_lot_id
--   fn_fg_tao_lo       tổ ép ghi lô ngay lúc nhập kho (tự mở phiếu ca nháp nếu chưa có; dòng nhập bành của chủng loại = Σ lô)
--   fn_fg_qc           QC ghi kết quả đạt / CXL / LOẠI (+ Po, MV, lý do) → tự ghi vào sổ QC hàng không đạt
--   fn_mix_tao_lo_tu_fg lô lỗi → kho chèn (nguồn 'fg_lot'), giữ dây truy ngược
--   fn_fg_xuat         xuất kho TP theo lô (bành), gắn dòng lệnh điều xe nếu có
--   views: v_fg_lots, v_fg_stock_by_material (đạt / lỗi / chưa kiểm — khớp dòng "SẢN PHẨM LỖI" sổ ca), v_fg_doi_chieu_so_ca
--
-- Quy ước số lô S2308AB: chưa chốt nghĩa từng ký tự ⇒ máy chỉ gợi ý số kế tiếp bằng cách tăng số cuối của số lô gần nhất cùng chủng loại.
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fg_lots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id     uuid NOT NULL REFERENCES public.facilities(id),
  so_lo           text NOT NULL,
  material_id     uuid NOT NULL REFERENCES public.materials(id),
  report_id       uuid REFERENCES public.shift_production_reports(id),
  shift_date      date NOT NULL DEFAULT current_date,
  shift_id        uuid REFERENCES public.shifts(id),
  team            text,
  so_banh         int NOT NULL CHECK (so_banh > 0),
  kg_per_banh     numeric(8,3) NOT NULL,
  kg              numeric(14,2) NOT NULL,
  raw_lot_id      uuid REFERENCES public.raw_lots(id),
  co_chen         boolean NOT NULL DEFAULT false,
  tu_fg_lot_id    uuid REFERENCES public.fg_lots(id),      -- chạy lại từ lô lỗi nào
  qc_status       text NOT NULL DEFAULT 'chua_kiem',        -- chua_kiem | dat | cxl | loai
  qc_po_min       numeric(5,1), qc_po_max numeric(5,1), qc_mv_min numeric(6,2), qc_mv_max numeric(6,2),
  qc_ly_do        text, qc_note text, qc_at timestamptz, qc_by uuid REFERENCES public.employees(id),
  so_banh_da_xuat int NOT NULL DEFAULT 0,
  so_banh_chen    int NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'ton',              -- ton | het | huy
  note            text,
  created_by      uuid REFERENCES public.employees(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fg_qc_chk CHECK (qc_status IN ('chua_kiem', 'dat', 'cxl', 'loai')),
  CONSTRAINT fg_status_chk CHECK (status IN ('ton', 'het', 'huy')),
  CONSTRAINT fg_uniq UNIQUE (facility_id, so_lo)
);
CREATE INDEX IF NOT EXISTS fg_lots_facility_idx ON public.fg_lots (facility_id, shift_date DESC);
CREATE INDEX IF NOT EXISTS fg_lots_report_idx ON public.fg_lots (report_id);
CREATE INDEX IF NOT EXISTS fg_lots_raw_lot_idx ON public.fg_lots (raw_lot_id) WHERE raw_lot_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fg_lot_exports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fg_lot_id         uuid NOT NULL REFERENCES public.fg_lots(id),
  so_banh           int NOT NULL CHECK (so_banh > 0),
  kg                numeric(14,2) NOT NULL,
  dispatch_line_id  uuid REFERENCES public.dispatch_order_lines(id),
  note              text,
  created_by        uuid REFERENCES public.employees(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fg_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fg_lot_exports ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY fg_select ON public.fg_lots FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY fge_select ON public.fg_lot_exports FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY fg_write_bgd ON public.fg_lots FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.qc_reject_log ADD COLUMN IF NOT EXISTS fg_lot_id uuid REFERENCES public.fg_lots(id);
ALTER TABLE public.dispatch_order_lines ADD COLUMN IF NOT EXISTS fg_lot_id uuid REFERENCES public.fg_lots(id);

-- ─── Tổ ép ghi lô ngay lúc nhập kho ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_fg_tao_lo(
  p_facility_id uuid, p_so_lo text, p_material_id uuid, p_so_banh int, p_shift_date date DEFAULT current_date, p_shift_id uuid DEFAULT NULL,
  p_team text DEFAULT NULL, p_raw_lot_id uuid DEFAULT NULL, p_co_chen boolean DEFAULT false, p_note text DEFAULT NULL, p_tu_fg_lot_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; r record; v_so_lo text; v_kg numeric; v_id uuid; v_emp uuid := public.fn_nvl_emp_hien_tai(); v_tong int;
BEGIN
  IF NOT public.fn_nvl_duoc_ky('submit', p_facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  v_so_lo := upper(btrim(regexp_replace(COALESCE(p_so_lo, ''), '\s+', '', 'g')));
  IF v_so_lo = '' THEN RAISE EXCEPTION 'THIEU_SO_LO'; END IF;
  IF p_so_banh IS NULL OR p_so_banh <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:số bành'; END IF;
  IF p_shift_id IS NULL THEN RAISE EXCEPTION 'THIEU_CA:chọn ca'; END IF;
  SELECT id, code, name, weight_per_unit INTO m FROM public.materials WHERE id = p_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_DONG:material'; END IF;
  IF m.weight_per_unit IS NULL OR m.weight_per_unit <= 0 THEN RAISE EXCEPTION 'THIEU_CO_BANH:%', m.code; END IF;
  IF EXISTS (SELECT 1 FROM public.fg_lots WHERE facility_id = p_facility_id AND so_lo = v_so_lo) THEN RAISE EXCEPTION 'TRUNG_SO_LO:%', v_so_lo; END IF;
  v_kg := round(p_so_banh * m.weight_per_unit, 2);

  -- phiếu ca của ca này: có thì dùng (phải còn nháp), chưa có thì mở nháp
  SELECT * INTO r FROM public.shift_production_reports WHERE facility_id = p_facility_id AND report_date = p_shift_date AND shift_id = p_shift_id;
  IF NOT FOUND THEN
    INSERT INTO public.shift_production_reports (facility_id, report_date, shift_id, team, status, raw_lot_id)
    VALUES (p_facility_id, p_shift_date, p_shift_id, p_team, 'draft', p_raw_lot_id) RETURNING * INTO r;
  ELSIF r.status <> 'draft' THEN
    RAISE EXCEPTION 'PHIEU_CA_DA_KY:%:ghi vào ca sau hoặc nhờ thủ kho mở lại', r.status;
  ELSE
    UPDATE public.shift_production_reports SET raw_lot_id = COALESCE(raw_lot_id, p_raw_lot_id), team = COALESCE(team, p_team), updated_at = now() WHERE id = r.id;
  END IF;

  INSERT INTO public.fg_lots (facility_id, so_lo, material_id, report_id, shift_date, shift_id, team, so_banh, kg_per_banh, kg, raw_lot_id, co_chen, tu_fg_lot_id, note, created_by)
  VALUES (p_facility_id, v_so_lo, m.id, r.id, p_shift_date, p_shift_id, COALESCE(p_team, r.team), p_so_banh, m.weight_per_unit, v_kg,
          COALESCE(p_raw_lot_id, r.raw_lot_id), COALESCE(p_co_chen, false), p_tu_fg_lot_id, p_note, v_emp)
  RETURNING id INTO v_id;

  -- dòng nhập bành của chủng loại trong phiếu ca = Σ lô của ca đó
  SELECT COALESCE(sum(so_banh), 0) INTO v_tong FROM public.fg_lots WHERE report_id = r.id AND material_id = m.id AND status <> 'huy';
  INSERT INTO public.shift_production_lines (report_id, material_id, nhap_banh, xuat_banh, note)
  VALUES (r.id, m.id, v_tong, 0, 'Từ lô TP')
  ON CONFLICT (report_id, material_id) DO UPDATE SET nhap_banh = EXCLUDED.nhap_banh, updated_at = now();
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_fg_tao_lo(uuid, text, uuid, int, date, uuid, text, uuid, boolean, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_fg_huy_lo(p_id uuid, p_ly_do text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; r record; v_tong int;
BEGIN
  SELECT * INTO l FROM public.fg_lots WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF NOT public.fn_nvl_duoc_ky('submit', l.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  IF l.so_banh_da_xuat > 0 OR l.so_banh_chen > 0 THEN RAISE EXCEPTION 'DA_TRU_SO:%:lô đã xuất / đã chèn', l.so_lo; END IF;
  SELECT * INTO r FROM public.shift_production_reports WHERE id = l.report_id;
  IF r.id IS NOT NULL AND r.status <> 'draft' THEN RAISE EXCEPTION 'PHIEU_CA_DA_KY:%', r.status; END IF;
  UPDATE public.fg_lots SET status = 'huy', note = COALESCE(p_ly_do, note), updated_at = now() WHERE id = l.id;
  IF r.id IS NOT NULL THEN
    SELECT COALESCE(sum(so_banh), 0) INTO v_tong FROM public.fg_lots WHERE report_id = r.id AND material_id = l.material_id AND status <> 'huy';
    UPDATE public.shift_production_lines SET nhap_banh = v_tong, updated_at = now() WHERE report_id = r.id AND material_id = l.material_id;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_fg_huy_lo(uuid, text) TO authenticated;

-- ─── QC ghi kết quả ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_fg_qc(p_id uuid, p_ket_qua text, p_po_min numeric DEFAULT NULL, p_po_max numeric DEFAULT NULL, p_mv_min numeric DEFAULT NULL, p_mv_max numeric DEFAULT NULL, p_ly_do text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_emp uuid := public.fn_nvl_emp_hien_tai(); v_ma text; v_rid uuid;
BEGIN
  SELECT * INTO l FROM public.fg_lots WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF NOT public.fn_nvl_duoc_ky('qc_confirm', l.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:qc'; END IF;
  IF p_ket_qua NOT IN ('dat', 'cxl', 'loai') THEN RAISE EXCEPTION 'BUOC_KHONG_HOP_LE:%', p_ket_qua; END IF;
  IF p_ket_qua <> 'dat' AND COALESCE(btrim(p_ly_do), '') = '' THEN RAISE EXCEPTION 'CAN_LY_DO:%', l.so_lo; END IF;
  UPDATE public.fg_lots SET qc_status = p_ket_qua, qc_po_min = p_po_min, qc_po_max = p_po_max, qc_mv_min = p_mv_min, qc_mv_max = p_mv_max,
         qc_ly_do = p_ly_do, qc_note = p_note, qc_at = now(), qc_by = v_emp, updated_at = now() WHERE id = l.id;
  SELECT ma INTO v_ma FROM public.raw_lots WHERE id = l.raw_lot_id;
  SELECT id INTO v_rid FROM public.qc_reject_log WHERE fg_lot_id = l.id LIMIT 1;
  IF p_ket_qua IN ('cxl', 'loai') THEN
    IF v_rid IS NULL THEN
      INSERT INTO public.qc_reject_log (facility_id, ngay_sx, to_sx, so_lo, tinh_trang, ly_do, po_min, po_max, mv_min, mv_max, ma_nguyen_lieu, ghi_chu, created_by, fg_lot_id, raw_lot_id)
      VALUES (l.facility_id, l.shift_date, l.team, l.so_lo, CASE WHEN p_ket_qua = 'cxl' THEN 'CXL' ELSE 'LOAI' END, p_ly_do, p_po_min, p_po_max, p_mv_min, p_mv_max, v_ma, p_note, v_emp, l.id, l.raw_lot_id);
    ELSE
      UPDATE public.qc_reject_log SET tinh_trang = CASE WHEN p_ket_qua = 'cxl' THEN 'CXL' ELSE 'LOAI' END, ly_do = p_ly_do, po_min = p_po_min, po_max = p_po_max, mv_min = p_mv_min, mv_max = p_mv_max,
             ma_nguyen_lieu = COALESCE(v_ma, ma_nguyen_lieu), ghi_chu = COALESCE(p_note, ghi_chu), updated_at = now() WHERE id = v_rid;
    END IF;
  ELSIF v_rid IS NOT NULL THEN
    UPDATE public.qc_reject_log SET tinh_trang_xu_ly = 'Kiểm lại: đạt', updated_at = now() WHERE id = v_rid;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_fg_qc(uuid, text, numeric, numeric, numeric, numeric, text, text) TO authenticated;

-- ─── Lô lỗi → kho chèn ─────────────────────────────────────────────────────
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
  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, po, mooney, qc_allow_rerun, metal_cleared, received_date, note, created_by)
  VALUES (public.fn_mix_ma('CH', l.facility_id), l.facility_id, v_src, 'fg_lot', l.id,
          'Lô TP ' || l.so_lo || ' · ' || m.name || ' · ' || v_banh || ' bành' || COALESCE(' · NVL ' || v_ma, '') || COALESCE(' · ' || l.qc_ly_do, ''),
          m.name, v_kg,
          CASE WHEN l.qc_po_min IS NOT NULL OR l.qc_po_max IS NOT NULL THEN round((COALESCE(l.qc_po_min, l.qc_po_max) + COALESCE(l.qc_po_max, l.qc_po_min)) / 2, 1) END,
          CASE WHEN l.qc_mv_min IS NOT NULL OR l.qc_mv_max IS NOT NULL THEN round((COALESCE(l.qc_mv_min, l.qc_mv_max) + COALESCE(l.qc_mv_max, l.qc_mv_min)) / 2, 1) END,
          true, CASE WHEN v_src = 'dkl' THEN COALESCE(p_metal_cleared, false) ELSE true END, current_date, p_note, v_emp)
  RETURNING id INTO v_id;
  UPDATE public.fg_lots SET so_banh_chen = so_banh_chen + v_banh, status = CASE WHEN so_banh - so_banh_da_xuat - so_banh_chen - v_banh <= 0 THEN 'het' ELSE status END, updated_at = now() WHERE id = l.id;
  UPDATE public.qc_reject_log SET tinh_trang_xu_ly = COALESCE(tinh_trang_xu_ly, 'Đã chuyển kho chèn ' || to_char(current_date, 'DD/MM')), updated_at = now() WHERE fg_lot_id = l.id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_tao_lo_tu_fg(uuid, int, text, boolean) TO authenticated;

-- ─── Xuất kho TP theo lô ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_fg_xuat(p_fg_lot_id uuid, p_so_banh int, p_dispatch_line_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_con int; v_kg numeric; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO l FROM public.fg_lots WHERE id = p_fg_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF NOT public.fn_nvl_duoc_ky('receive', l.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:xuat_tp'; END IF;
  IF l.qc_status IN ('cxl', 'loai') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:lô lỗi không xuất bán được', l.so_lo; END IF;
  IF p_so_banh IS NULL OR p_so_banh <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:số bành'; END IF;
  v_con := l.so_banh - l.so_banh_da_xuat - l.so_banh_chen;
  IF p_so_banh > v_con THEN RAISE EXCEPTION 'LO_TP_KHONG_DU:%:xuất % bành > còn %', l.so_lo, p_so_banh, v_con; END IF;
  v_kg := round(p_so_banh * l.kg_per_banh, 2);
  INSERT INTO public.fg_lot_exports (fg_lot_id, so_banh, kg, dispatch_line_id, note, created_by) VALUES (l.id, p_so_banh, v_kg, p_dispatch_line_id, p_note, v_emp);
  UPDATE public.fg_lots SET so_banh_da_xuat = so_banh_da_xuat + p_so_banh, status = CASE WHEN so_banh - so_banh_da_xuat - p_so_banh - so_banh_chen <= 0 THEN 'het' ELSE status END, updated_at = now() WHERE id = l.id;
  IF p_dispatch_line_id IS NOT NULL THEN
    UPDATE public.dispatch_order_lines SET fg_lot_id = COALESCE(fg_lot_id, l.id), updated_at = now() WHERE id = p_dispatch_line_id;
  END IF;
  RETURN jsonb_build_object('so_lo', l.so_lo, 'banh', p_so_banh, 'kg', v_kg, 'con_banh', v_con - p_so_banh);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_fg_xuat(uuid, int, uuid, text) TO authenticated;

-- ─── Views ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_fg_lots AS
SELECT l.*, f.code AS facility_code, m.code AS material_code, m.name AS material_name, m.sort_order,
       (l.so_banh - l.so_banh_da_xuat - l.so_banh_chen) AS ton_banh,
       round((l.so_banh - l.so_banh_da_xuat - l.so_banh_chen) * l.kg_per_banh, 2) AS ton_kg,
       rl.ma AS ma_nvl, sh.name AS shift_name, r.status AS report_status,
       e.full_name AS created_name, eq.full_name AS qc_name,
       (SELECT count(*) FROM public.mix_lots x WHERE x.source_ref_type = 'fg_lot' AND x.source_ref_id = l.id AND x.status <> 'cancelled')::int AS so_lo_chen,
       tu.so_lo AS tu_so_lo
FROM public.fg_lots l
JOIN public.materials m ON m.id = l.material_id
LEFT JOIN public.facilities f ON f.id = l.facility_id
LEFT JOIN public.raw_lots rl ON rl.id = l.raw_lot_id
LEFT JOIN public.shifts sh ON sh.id = l.shift_id
LEFT JOIN public.shift_production_reports r ON r.id = l.report_id
LEFT JOIN public.employees e ON e.id = l.created_by
LEFT JOIN public.employees eq ON eq.id = l.qc_by
LEFT JOIN public.fg_lots tu ON tu.id = l.tu_fg_lot_id;
ALTER VIEW public.v_fg_lots SET (security_invoker = on);
GRANT SELECT ON public.v_fg_lots TO authenticated;

-- Tồn TP theo chủng loại tách đạt / chưa kiểm / lỗi (CXL+LOẠI) — khớp hai dòng cuối sổ ca
CREATE OR REPLACE VIEW public.v_fg_stock_by_material AS
SELECT l.facility_id, l.material_id, m.code AS material_code, m.name AS material_name, m.sort_order, l.kg_per_banh,
       sum(l.ton_banh) FILTER (WHERE l.qc_status = 'dat')::int AS dat_banh,
       sum(l.ton_banh) FILTER (WHERE l.qc_status = 'chua_kiem')::int AS chua_kiem_banh,
       sum(l.ton_banh) FILTER (WHERE l.qc_status IN ('cxl', 'loai'))::int AS loi_banh,
       sum(l.ton_banh)::int AS ton_banh,
       round(sum(l.ton_kg), 2) AS ton_kg,
       count(*) FILTER (WHERE l.ton_banh > 0)::int AS so_lo
FROM public.v_fg_lots l JOIN public.materials m ON m.id = l.material_id
WHERE l.status <> 'huy'
GROUP BY l.facility_id, l.material_id, m.code, m.name, m.sort_order, l.kg_per_banh;
ALTER VIEW public.v_fg_stock_by_material SET (security_invoker = on);
GRANT SELECT ON public.v_fg_stock_by_material TO authenticated;

-- Đối chiếu tồn theo lô với tồn theo sổ ca (cùng chủng loại)
CREATE OR REPLACE VIEW public.v_fg_doi_chieu_so_ca AS
SELECT COALESCE(a.facility_id, b.facility_id) AS facility_id, COALESCE(a.material_id, b.material_id) AS material_id,
       COALESCE(a.material_code, b.code) AS material_code, COALESCE(a.material_name, b.material_name) AS material_name,
       COALESCE(a.ton_banh, 0) AS ton_theo_lo_banh, COALESCE(b.ton_banh, 0) AS ton_theo_so_ca_banh,
       COALESCE(a.ton_banh, 0) - COALESCE(b.ton_banh, 0) AS lech_banh
FROM public.v_fg_stock_by_material a
FULL OUTER JOIN public.v_shift_stock_balance b ON b.facility_id = a.facility_id AND b.material_id = a.material_id;
ALTER VIEW public.v_fg_doi_chieu_so_ca SET (security_invoker = on);
GRANT SELECT ON public.v_fg_doi_chieu_so_ca TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT to_regclass('public.fg_lots') AS t1, to_regclass('public.fg_lot_exports') AS t2, to_regclass('public.v_fg_lots') AS v1, to_regclass('public.v_fg_stock_by_material') AS v2,
       to_regprocedure('public.fn_fg_tao_lo(uuid,text,uuid,int,date,uuid,text,uuid,boolean,text,uuid)') AS f1,
       to_regprocedure('public.fn_fg_qc(uuid,text,numeric,numeric,numeric,numeric,text,text)') AS f2,
       to_regprocedure('public.fn_mix_tao_lo_tu_fg(uuid,int,text,boolean)') AS f3, to_regprocedure('public.fn_fg_xuat(uuid,int,uuid,text)') AS f4;
SELECT code, name, weight_per_unit FROM public.materials WHERE sort_order IS NOT NULL AND is_active ORDER BY sort_order;   -- cỡ bành phải có cho mọi chủng loại TP
