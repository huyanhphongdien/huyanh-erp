-- ============================================================
-- KHÉP VÒNG CÂN → KHO NVL → SẢN XUẤT (HÀNG CHÈN) → KHO THÀNH PHẨM — theo audit 30/10/2026
-- Ngày: 2026-10-30
-- Phụ thuộc: wms_nvl_p1..p5, wms_mix_p1..p3, wms_m3_p2/p3 (sổ ca), wms_m6_p1 (sổ QC), wms_soi_lai_p1
--
-- Làm trong file này (mã theo tài liệu audit):
--   C2  shift_production_reports.production_order_id — nối phiếu ca ↔ lệnh sản xuất ↔ lô NVL
--   T6  trigger: tạo phiếu ca xong thì kéo ngay kg CHÈN đã nhận của ca đó vào dòng CHÈN
--   C4  fn_mix_tra nhận ca/tổ — phiếu bàn giao phải có ca trước khi trả (THIEU_CA)
--   T5  kiểm kê kho chèn: mix_adjustments + fn_mix_kiem_ke (điều chỉnh kg_in, có lý do)
--   C3  khép vòng hàng chèn: v_mix_nguon_loi / v_mix_nguon_qc / v_mix_nguon_tp +
--       fn_mix_tao_lo_tu_so_ca (LOI/DKL từ sổ ca), fn_mix_tao_lo_tu_qc (từ sổ QC),
--       fn_mix_lay_hang_chuan (hàng chuẩn: tạo lô chèn + ghi xuất bành vào phiếu ca nháp)
--   T2  trigger stock_batches: lô NVL (raw_rubber_type) không cho sửa tay số lượng từ client
--   T3  fn_nvl_tao_kiem_ke: chặn tạo kiểm kê khi còn phiếu cân sẵn sàng chưa nhập (có cờ bỏ qua)
--   T4  v_can_doi_nvl_tp: NVL khô xuất SX + chèn = TP đạt + LOI/DKL + hao hụt, hiệu suất %
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── C2) Phiếu ca biết lệnh sản xuất nào ───────────────────────────────────
ALTER TABLE public.shift_production_reports ADD COLUMN IF NOT EXISTS production_order_id uuid REFERENCES public.production_orders(id);
CREATE INDEX IF NOT EXISTS spr_po_idx ON public.shift_production_reports (production_order_id) WHERE production_order_id IS NOT NULL;
COMMENT ON COLUMN public.shift_production_reports.production_order_id IS 'Lệnh sản xuất của ca (tùy chọn). Sổ ca là nguồn sự thật thành phẩm; lệnh SX chỉ là kế hoạch + gom NVL.';

-- ─── T6) Tạo phiếu ca → kéo kg CHÈN đã nhận của ca đó ─────────────────────
CREATE OR REPLACE FUNCTION public.trg_spr_keo_chen()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.mix_issues i WHERE i.facility_id = NEW.facility_id AND i.shift_date = NEW.report_date AND i.shift_id = NEW.shift_id AND i.status = 'received') THEN
    PERFORM public.fn_mix_cap_nhat_dong_chen(NEW.facility_id, NEW.report_date, NEW.shift_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS spr_keo_chen ON public.shift_production_reports;
CREATE TRIGGER spr_keo_chen AFTER INSERT ON public.shift_production_reports FOR EACH ROW EXECUTE FUNCTION public.trg_spr_keo_chen();

-- ─── C4) Trả cuối ca: phiếu bàn giao phải có ca ───────────────────────────
DROP FUNCTION IF EXISTS public.fn_mix_tra(uuid, numeric, boolean, text, uuid);
CREATE OR REPLACE FUNCTION public.fn_mix_tra(
  p_issue_id uuid, p_kg_return numeric, p_handover boolean DEFAULT false, p_note text DEFAULT NULL, p_output_batch_id uuid DEFAULT NULL,
  p_shift_id uuid DEFAULT NULL, p_team text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO i FROM public.mix_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF i.status NOT IN ('issued', 'returned') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', i.code, i.status; END IF;
  IF NOT public.fn_nvl_duoc_ky('submit', i.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  IF p_kg_return IS NULL OR p_kg_return < 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  IF p_kg_return > i.kg_out + 0.01 THEN RAISE EXCEPTION 'TRA_QUA_LAY:%:trả % > lấy %', i.code, p_kg_return, i.kg_out; END IF;
  IF i.shift_id IS NULL AND p_shift_id IS NULL THEN RAISE EXCEPTION 'THIEU_CA:%:phiếu bàn giao chưa có ca, chọn ca trước khi trả', i.code; END IF;

  UPDATE public.mix_issues
     SET kg_return = p_kg_return, return_at = now(), return_by = v_emp, kg_used = round(kg_out - p_kg_return, 2),
         handover_to_next = COALESCE(p_handover, false) AND p_kg_return > 0, output_batch_id = COALESCE(p_output_batch_id, output_batch_id),
         shift_id = COALESCE(shift_id, p_shift_id), team = COALESCE(p_team, team),
         shift_date = CASE WHEN i.shift_id IS NULL AND p_shift_id IS NOT NULL THEN current_date ELSE shift_date END,
         note = COALESCE(p_note, note), status = 'returned', updated_at = now()
   WHERE id = i.id;
  RETURN jsonb_build_object('code', i.code, 'kg_out', i.kg_out, 'kg_return', p_kg_return, 'kg_used', round(i.kg_out - p_kg_return, 2));
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_tra(uuid, numeric, boolean, text, uuid, uuid, text) TO authenticated;

-- ─── T5) Kiểm kê kho chèn ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mix_adjustments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mix_lot_id  uuid NOT NULL REFERENCES public.mix_lots(id),
  kg_so       numeric(14,2) NOT NULL,   -- tồn theo sổ lúc đếm
  kg_thuc     numeric(14,2) NOT NULL,   -- cân thực
  chenh_kg    numeric(14,2) NOT NULL,
  ly_do       text,
  note        text,
  created_by  uuid REFERENCES public.employees(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mix_adjustments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY ma_select ON public.mix_adjustments FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.fn_mix_kiem_ke(p_lot_id uuid, p_kg_thuc numeric, p_ly_do text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; q json; v_ton numeric; v_chenh numeric; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO l FROM public.mix_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  q := public.fn_nvl_quyen(l.facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kho_chen'; END IF;
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
GRANT EXECUTE ON FUNCTION public.fn_mix_kiem_ke(uuid, numeric, text, text) TO authenticated;

CREATE OR REPLACE VIEW public.v_mix_movements AS
SELECT l.facility_id, l.created_at AS thoi_diem, 'nhap_lo'::text AS loai, l.code AS lot_code, NULL::text AS issue_code, l.kg_in AS kg,
       l.source_desc AS mo_ta, e.full_name AS nguoi, l.id AS lot_id, NULL::uuid AS issue_id
  FROM public.mix_lots l LEFT JOIN public.employees e ON e.id = l.created_by
UNION ALL
SELECT i.facility_id, i.out_at, 'lay', l.code, i.code, -i.kg_out, 'Lấy đầu ca ' || COALESCE(to_char(i.shift_date, 'DD/MM'), ''), e.full_name, l.id, i.id
  FROM public.mix_issues i JOIN public.mix_lots l ON l.id = i.mix_lot_id LEFT JOIN public.employees e ON e.id = i.out_by
 WHERE i.status <> 'cancelled'
UNION ALL
SELECT i.facility_id, i.return_at, 'tra', l.code, i.code, i.kg_return, 'Trả cuối ca' || CASE WHEN i.handover_to_next THEN ' (bàn giao ca sau)' ELSE '' END, e.full_name, l.id, i.id
  FROM public.mix_issues i JOIN public.mix_lots l ON l.id = i.mix_lot_id LEFT JOIN public.employees e ON e.id = i.return_by
 WHERE i.status <> 'cancelled' AND i.return_at IS NOT NULL
UNION ALL
SELECT l.facility_id, a.created_at, 'dieu_chinh', l.code, NULL, a.chenh_kg, 'Kiểm kê: ' || COALESCE(a.ly_do, '') || ' (sổ ' || a.kg_so || ' → thực ' || a.kg_thuc || ')', e.full_name, l.id, NULL
  FROM public.mix_adjustments a JOIN public.mix_lots l ON l.id = a.mix_lot_id LEFT JOIN public.employees e ON e.id = a.created_by;
ALTER VIEW public.v_mix_movements SET (security_invoker = on);
GRANT SELECT ON public.v_mix_movements TO authenticated;

-- ─── C3) Nguồn hàng chèn: LOI/DKL từ sổ ca, hàng không đạt từ sổ QC, hàng chuẩn từ kho TP ──
CREATE OR REPLACE VIEW public.v_mix_nguon_loi AS
SELECT v.id AS line_id, v.facility_id, v.report_id, v.report_date, v.shift_id, v.shift_code, v.shift_name, r.team,
       v.code AS material_code, v.material_name, v.weight_per_unit, v.nhap_banh, v.nhap_kg, v.xuat_banh, v.xuat_kg, v.status,
       round(COALESCE((SELECT sum(m.kg_in) FROM public.mix_lots m WHERE m.source_ref_type = 'shift_production_line' AND m.source_ref_id = v.id AND m.status <> 'cancelled'), 0), 2) AS da_chuyen_kg,
       round(COALESCE(v.nhap_kg, 0) - COALESCE((SELECT sum(m.kg_in) FROM public.mix_lots m WHERE m.source_ref_type = 'shift_production_line' AND m.source_ref_id = v.id AND m.status <> 'cancelled'), 0), 2) AS con_lai_kg
FROM public.v_shift_production_lines v
JOIN public.shift_production_reports r ON r.id = v.report_id
WHERE v.code IN ('LOI', 'DKL') AND v.status = 'received' AND v.nhap_banh > 0 AND v.report_date >= current_date - 90;
ALTER VIEW public.v_mix_nguon_loi SET (security_invoker = on);
GRANT SELECT ON public.v_mix_nguon_loi TO authenticated;

CREATE OR REPLACE VIEW public.v_mix_nguon_qc AS
SELECT q.id AS reject_id, q.facility_id, q.ngay_sx, q.to_sx, q.so_lo, q.tinh_trang, q.ly_do, q.po_min, q.po_max, q.mv_min, q.mv_max, q.ma_nguyen_lieu, q.tinh_trang_xu_ly,
       EXISTS (SELECT 1 FROM public.mix_lots m WHERE m.source_ref_type = 'qc_reject_log' AND m.source_ref_id = q.id AND m.status <> 'cancelled') AS da_chuyen,
       (SELECT m.code FROM public.mix_lots m WHERE m.source_ref_type = 'qc_reject_log' AND m.source_ref_id = q.id AND m.status <> 'cancelled' ORDER BY m.created_at DESC LIMIT 1) AS lot_code
FROM public.qc_reject_log q
WHERE q.ngay_sx >= current_date - 90;
ALTER VIEW public.v_mix_nguon_qc SET (security_invoker = on);
GRANT SELECT ON public.v_mix_nguon_qc TO authenticated;

CREATE OR REPLACE VIEW public.v_mix_nguon_tp AS
SELECT b.facility_id, b.material_id, b.code, b.material_name, b.weight_per_unit, b.ton_banh, b.ton_kg
FROM public.v_shift_stock_balance b
WHERE b.code NOT IN ('LOI', 'DKL', 'CHEN') AND b.ton_banh > 0;
ALTER VIEW public.v_mix_nguon_tp SET (security_invoker = on);
GRANT SELECT ON public.v_mix_nguon_tp TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_mix_tao_lo_tu_so_ca(p_line_id uuid, p_kg numeric DEFAULT NULL, p_note text DEFAULT NULL, p_metal_cleared boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; q json; v_con numeric; v_kg numeric; v_id uuid; v_emp uuid := public.fn_nvl_emp_hien_tai();
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
  v_con := COALESCE(s.nhap_kg, 0) - COALESCE((SELECT sum(m.kg_in) FROM public.mix_lots m WHERE m.source_ref_type = 'shift_production_line' AND m.source_ref_id = s.id AND m.status <> 'cancelled'), 0);
  v_kg := COALESCE(p_kg, v_con);
  IF v_con <= 0.005 THEN RAISE EXCEPTION 'DA_CHUYEN_HET:%', s.material_name; END IF;
  IF v_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  IF v_kg > v_con + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:chuyển % > còn lại %', s.material_name, v_kg, round(v_con, 2); END IF;

  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, qc_allow_rerun, metal_cleared, received_date, note, created_by)
  VALUES (public.fn_mix_ma('CH', s.facility_id), s.facility_id, CASE WHEN s.code = 'LOI' THEN 'loi' ELSE 'dkl' END, 'shift_production_line', s.id,
          s.material_name || ' · ' || COALESCE(s.shift_name, 'ca ?') || ' ' || to_char(s.report_date, 'DD/MM') || COALESCE(' · tổ ' || s.team, ''),
          NULL, round(v_kg, 2), true, CASE WHEN s.code = 'LOI' THEN true ELSE COALESCE(p_metal_cleared, false) END, current_date, p_note, v_emp)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_tao_lo_tu_so_ca(uuid, numeric, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_mix_tao_lo_tu_qc(p_reject_id uuid, p_kg numeric, p_note text DEFAULT NULL, p_metal_cleared boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; q json; v_id uuid; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO r FROM public.qc_reject_log WHERE id = p_reject_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_DONG'; END IF;
  IF r.facility_id IS NULL THEN RAISE EXCEPTION 'THIEU_NHA_MAY:dòng sổ QC'; END IF;
  q := public.fn_nvl_quyen(r.facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kho_chen'; END IF;
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, po, mooney, qc_allow_rerun, metal_cleared, received_date, note, created_by)
  VALUES (public.fn_mix_ma('CH', r.facility_id), r.facility_id, 'loi', 'qc_reject_log', r.id,
          COALESCE(r.ly_do, 'hàng không đạt') || ' · lô SX ' || COALESCE(r.so_lo, '?') || ' ' || to_char(r.ngay_sx, 'DD/MM') || COALESCE(' · tổ ' || r.to_sx, '') || COALESCE(' · NVL ' || r.ma_nguyen_lieu, ''),
          NULL, round(p_kg, 2),
          CASE WHEN r.po_min IS NOT NULL OR r.po_max IS NOT NULL THEN round((COALESCE(r.po_min, r.po_max) + COALESCE(r.po_max, r.po_min)) / 2, 1) END,
          CASE WHEN r.mv_min IS NOT NULL OR r.mv_max IS NOT NULL THEN round((COALESCE(r.mv_min, r.mv_max) + COALESCE(r.mv_max, r.mv_min)) / 2, 1) END,
          true, COALESCE(p_metal_cleared, true), current_date, p_note, v_emp)
  RETURNING id INTO v_id;
  UPDATE public.qc_reject_log SET tinh_trang_xu_ly = COALESCE(tinh_trang_xu_ly, 'Đã chuyển kho chèn'), updated_at = now() WHERE id = r.id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_tao_lo_tu_qc(uuid, numeric, text, boolean) TO authenticated;

-- Hàng chuẩn từ kho TP: tạo lô chèn + ghi XUẤT BÀNH vào phiếu ca NHÁP của ca đó (tồn TP giảm đúng số đem chèn)
CREATE OR REPLACE FUNCTION public.fn_mix_lay_hang_chuan(p_facility_id uuid, p_material_id uuid, p_kg numeric, p_shift_date date DEFAULT current_date, p_shift_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; r record; q json; v_banh int; v_kg numeric; v_ton int; v_id uuid; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  q := public.fn_nvl_quyen(p_facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kho_chen'; END IF;
  SELECT id, code, name, weight_per_unit INTO m FROM public.materials WHERE id = p_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_DONG:material'; END IF;
  IF m.weight_per_unit IS NULL OR m.weight_per_unit <= 0 THEN RAISE EXCEPTION 'THIEU_CO_BANH:%', m.code; END IF;
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  IF p_shift_id IS NULL THEN RAISE EXCEPTION 'THIEU_CA:chọn ca để ghi xuất bành'; END IF;
  v_banh := GREATEST(round(p_kg / m.weight_per_unit)::int, 1);
  v_kg := round(v_banh * m.weight_per_unit, 2);
  SELECT COALESCE(ton_banh, 0) INTO v_ton FROM public.v_shift_stock_balance WHERE facility_id = p_facility_id AND material_id = m.id;
  IF v_banh > COALESCE(v_ton, 0) THEN RAISE EXCEPTION 'VUOT_TON:%:cần % bành, kho TP còn %', m.name, v_banh, COALESCE(v_ton, 0); END IF;
  SELECT * INTO r FROM public.shift_production_reports WHERE facility_id = p_facility_id AND report_date = p_shift_date AND shift_id = p_shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PHIEU_CA_CHUA_MO:%:tổ mở phiếu ca %s trước, rồi lấy hàng chuẩn', to_char(p_shift_date, 'DD/MM'), to_char(p_shift_date, 'DD/MM'); END IF;
  IF r.status <> 'draft' THEN RAISE EXCEPTION 'PHIEU_CA_DA_KY:%:ghi vào phiếu ca sau', r.status; END IF;

  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, qc_allow_rerun, metal_cleared, received_date, note, created_by)
  VALUES (public.fn_mix_ma('CH', p_facility_id), p_facility_id, 'std', 'material', m.id,
          'Hàng chuẩn ' || m.name || ' từ kho TP · ' || v_banh || ' bành · ' || to_char(p_shift_date, 'DD/MM'), m.name, v_kg, true, true, p_shift_date, p_note, v_emp)
  RETURNING id INTO v_id;

  INSERT INTO public.shift_production_lines (report_id, material_id, nhap_banh, xuat_banh, note)
  VALUES (r.id, m.id, 0, v_banh, 'Chuyển ' || v_banh || ' bành sang kho chèn')
  ON CONFLICT (report_id, material_id) DO UPDATE
     SET xuat_banh = public.shift_production_lines.xuat_banh + EXCLUDED.xuat_banh,
         note = COALESCE(public.shift_production_lines.note || ' · ', '') || EXCLUDED.note, updated_at = now();
  RETURN jsonb_build_object('lot_id', v_id, 'banh', v_banh, 'kg', v_kg, 'material', m.name);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_lay_hang_chuan(uuid, uuid, numeric, date, uuid, text) TO authenticated;

-- ─── T2) Lô NVL chỉ sửa số lượng qua hàm sổ kho ───────────────────────────
-- Hàm fn_nvl_* chạy SECURITY DEFINER (current_user = chủ hàm), còn client gõ thẳng là 'authenticated'.
CREATE OR REPLACE FUNCTION public.trg_nvl_chan_sua_tay()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.raw_rubber_type IS NOT NULL AND current_user IN ('authenticated', 'anon') THEN RAISE EXCEPTION 'LO_NVL_CHI_SUA_QUA_SO_KHO:%', OLD.batch_no; END IF;
    RETURN OLD;
  END IF;
  IF OLD.raw_rubber_type IS NOT NULL AND current_user IN ('authenticated', 'anon') AND (
       NEW.quantity_remaining IS DISTINCT FROM OLD.quantity_remaining OR NEW.current_weight IS DISTINCT FROM OLD.current_weight
    OR NEW.dry_weight IS DISTINCT FROM OLD.dry_weight OR NEW.initial_weight IS DISTINCT FROM OLD.initial_weight OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'LO_NVL_CHI_SUA_QUA_SO_KHO:%', OLD.batch_no;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS nvl_chan_sua_tay ON public.stock_batches;
CREATE TRIGGER nvl_chan_sua_tay BEFORE UPDATE OR DELETE ON public.stock_batches FOR EACH ROW EXECUTE FUNCTION public.trg_nvl_chan_sua_tay();

-- ─── T3) Không tạo kiểm kê khi còn phiếu cân sẵn sàng chưa nhập ───────────
DROP FUNCTION IF EXISTS public.fn_nvl_tao_kiem_ke(uuid, date, text);
CREATE OR REPLACE FUNCTION public.fn_nvl_tao_kiem_ke(p_facility_id uuid, p_ngay date DEFAULT current_date, p_note text DEFAULT NULL, p_bo_qua_hang_doi boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id    uuid;
  v_emp   uuid := public.fn_nvl_emp_hien_tai();
  v_code  text;
  v_fcode text;
  v_n     int;
  v_so    int;
  v_cho   int;
BEGIN
  IF NOT public.fn_nvl_duoc_ky('receive', p_facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kiem_ke'; END IF;
  IF EXISTS (SELECT 1 FROM public.raw_stocktakes WHERE facility_id = p_facility_id AND status IN ('draft', 'counted')) THEN
    RAISE EXCEPTION 'DANG_CO_KIEM_KE_MO';
  END IF;
  IF NOT COALESCE(p_bo_qua_hang_doi, false) THEN
    SELECT count(*) INTO v_cho FROM public.v_raw_intake_queue q WHERE q.facility_id = p_facility_id AND q.san_sang AND NOT q.da_nhap;
    IF v_cho > 0 THEN RAISE EXCEPTION 'CON_PHIEU_CAN_CHO_NHAP:%', v_cho; END IF;
  END IF;
  SELECT upper(code) INTO v_fcode FROM public.facilities WHERE id = p_facility_id;
  v_code := 'KK-NVL-' || COALESCE(v_fcode, 'XX') || '-' || to_char(p_ngay, 'YYMMDD') || '-';
  SELECT COALESCE(max(NULLIF(regexp_replace(code, '^' || v_code, ''), code)::int), 0) + 1 INTO v_n
    FROM public.raw_stocktakes WHERE code LIKE v_code || '%';
  v_code := v_code || lpad(v_n::text, 2, '0');

  INSERT INTO public.raw_stocktakes (code, facility_id, ngay_kiem_ke, note, created_by)
  VALUES (v_code, p_facility_id, p_ngay, p_note, v_emp) RETURNING id INTO v_id;

  INSERT INTO public.raw_stocktake_lines (stocktake_id, batch_id, rubber_type, book_wet_kg, book_drc_pct, book_dry_kg)
  SELECT v_id, v.batch_id, v.rubber_type, v.wet_kg, v.drc_pct, v.dry_kg
    FROM public.v_raw_stock_balance v
   WHERE v.facility_id = p_facility_id AND v.dry_kg > 0.005;
  GET DIAGNOSTICS v_so = ROW_COUNT;
  IF v_so = 0 THEN RAISE EXCEPTION 'KHO_TRONG'; END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_tao_kiem_ke(uuid, date, text, boolean) TO authenticated;

-- ─── T4) Cân đối NVL khô → thành phẩm theo ngày ───────────────────────────
CREATE OR REPLACE VIEW public.v_can_doi_nvl_tp AS
WITH nvl AS (
  SELECT l.facility_id, l.txn_date AS ngay, round(-sum(l.dry_kg) FILTER (WHERE l.txn_type = 'out_production'), 2) AS nvl_kho_xuat_sx_kg
    FROM public.raw_stock_ledger l WHERE l.txn_type = 'out_production' GROUP BY l.facility_id, l.txn_date
)
SELECT COALESCE(n.facility_id, v.facility_id) AS facility_id,
       COALESCE(n.ngay, v.ngay)               AS ngay,
       COALESCE(n.nvl_kho_xuat_sx_kg, 0)      AS nvl_kho_xuat_sx_kg,
       COALESCE(v.chen_tieu_hao_kg, 0)        AS chen_tieu_hao_kg,
       COALESCE(v.dat_lam_ra_kg, 0)           AS tp_dat_kg,
       COALESCE(v.khong_dat_lam_ra_kg, 0)     AS loi_dkl_kg,
       round(COALESCE(n.nvl_kho_xuat_sx_kg, 0) + COALESCE(v.chen_tieu_hao_kg, 0) - COALESCE(v.dat_lam_ra_kg, 0) - COALESCE(v.khong_dat_lam_ra_kg, 0), 2) AS hao_hut_kg,
       CASE WHEN COALESCE(n.nvl_kho_xuat_sx_kg, 0) + COALESCE(v.chen_tieu_hao_kg, 0) > 0
            THEN round(100 * COALESCE(v.dat_lam_ra_kg, 0) / (COALESCE(n.nvl_kho_xuat_sx_kg, 0) + COALESCE(v.chen_tieu_hao_kg, 0)), 1) END AS hieu_suat_pct
FROM nvl n
FULL OUTER JOIN public.v_vong_tai_che v ON v.facility_id = n.facility_id AND v.ngay = n.ngay;
ALTER VIEW public.v_can_doi_nvl_tp SET (security_invoker = on);
GRANT SELECT ON public.v_can_doi_nvl_tp TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT (SELECT count(*) FROM information_schema.columns WHERE table_name = 'shift_production_reports' AND column_name = 'production_order_id') AS c2_cot,
       to_regprocedure('public.fn_mix_tra(uuid,numeric,boolean,text,uuid,uuid,text)') AS c4,
       to_regclass('public.mix_adjustments') AS t5_bang, to_regprocedure('public.fn_mix_kiem_ke(uuid,numeric,text,text)') AS t5_ham,
       to_regclass('public.v_mix_nguon_loi') AS c3_loi, to_regclass('public.v_mix_nguon_qc') AS c3_qc, to_regclass('public.v_mix_nguon_tp') AS c3_tp,
       to_regprocedure('public.fn_mix_lay_hang_chuan(uuid,uuid,numeric,date,uuid,text)') AS c3_chuan,
       (SELECT count(*) FROM pg_trigger WHERE tgname IN ('nvl_chan_sua_tay', 'spr_keo_chen')) AS trigger_2,
       to_regprocedure('public.fn_nvl_tao_kiem_ke(uuid,date,text,boolean)') AS t3, to_regclass('public.v_can_doi_nvl_tp') AS t4;
SELECT * FROM public.v_can_doi_nvl_tp WHERE facility_id = (SELECT id FROM public.facilities WHERE code = 'PD') ORDER BY ngay DESC LIMIT 7;
