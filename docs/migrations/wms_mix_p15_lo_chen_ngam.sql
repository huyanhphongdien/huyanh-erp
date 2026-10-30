-- ============================================================
-- HÀNG CHÈN — p15: LÔ CHÈN NGẦM THEO NGUỒN + SỐ LÔ (phương án B, chủ DN 30/10 tối: "lô hàng chèn phức tạp hơn vấn đề" → "Chọn B làm đi")
--   · Sổ tay chỉ ghi: số bành · nguồn (1502 / STD / DKL) · cân. Không ai "nhập kho chèn" trước. Từ p15:
--     QS lấy hàng = chọn NGUỒN + gõ SỐ LÔ trên bao (hoặc chạm lô TP) → fn_mix_tim_hoac_tao_lo tự tìm / tạo lô chèn (kg_in = 0)
--     → fn_mix_lay: lấy quá tồn lô → phần thiếu ghi NHẬP = LẤY (hàng kho TP trừ thêm bành lô TP; SBR / gõ tay không chặn)
--   · Kho chèn trở thành sổ theo số lô; "Nhập lô chèn" chỉ còn để nhập trước (SBR về kho). Lô đã hết (depleted) dùng lại được.
--   · DKL: tick "đã rà kim loại" lúc lấy → ghi metal_cleared trên lô (giữ chặn DKL_CHUA_XU_LY)
--   · Không đổi bảng / view; p1 → p14 giữ nguyên.
-- Ngày: 2026-10-30 · Phụ thuộc: wms_nvl_p13_lenh_chay.sql (CHẠY p11 → p12 → p13 → p14 → p15)
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── Tìm / tạo lô chèn ngầm ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mix_tim_hoac_tao_lo(p_facility_id uuid, p_source_type text DEFAULT NULL, p_so_lo text DEFAULT NULL, p_fg_lot_id uuid DEFAULT NULL, p_metal_cleared boolean DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_so_lo text; f record; m record; v_src text := p_source_type; v_desc text; v_grade text; v_kpb numeric := 35; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  IF NOT public.fn_mix_duoc_ky('khai_bao', p_facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:khai_bao'; END IF;
  IF p_fg_lot_id IS NOT NULL THEN
    SELECT * INTO f FROM public.fg_lots WHERE id = p_fg_lot_id;
    IF NOT FOUND OR f.facility_id <> p_facility_id THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO:lô thành phẩm'; END IF;
    IF f.status = 'huy' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:lô TP đã hủy', f.so_lo; END IF;
    SELECT mm.code, mm.name INTO m FROM public.materials mm WHERE mm.id = f.material_id;
    v_so_lo := f.so_lo; v_kpb := COALESCE(NULLIF(f.kg_per_banh, 0), 35);
    v_src := COALESCE(v_src, CASE WHEN m.code = 'DKL' THEN 'dkl' WHEN m.code = 'LOI' OR f.qc_status <> 'dat' THEN 'loi' ELSE 'std' END);
    v_desc := 'Lô TP ' || f.so_lo || ' · ' || COALESCE(m.name, ''); v_grade := m.name;
    SELECT id INTO v_id FROM public.mix_lots WHERE facility_id = p_facility_id AND source_ref_type = 'fg_lot' AND source_ref_id = f.id AND status <> 'cancelled' ORDER BY created_at DESC LIMIT 1;
  ELSE
    v_so_lo := public.fn_mix_chuan_so_lo(p_so_lo);
    IF v_so_lo IS NULL THEN RAISE EXCEPTION 'THIEU_SO_LO:gõ số lô trên bao'; END IF;
    IF v_src IS NULL OR v_src NOT IN ('loi', 'dkl', 'std', 'mua_ngoai', 'khac') THEN RAISE EXCEPTION 'THIEU_NGUON:chọn nguồn hàng chèn'; END IF;
    v_desc := CASE v_src WHEN 'mua_ngoai' THEN 'SBR / mua ngoài lô ' || v_so_lo WHEN 'std' THEN 'Hàng chuẩn lô ' || v_so_lo WHEN 'loi' THEN 'Hàng lỗi lô ' || v_so_lo WHEN 'dkl' THEN 'DKL lô ' || v_so_lo ELSE 'Khác · lô ' || v_so_lo END;
    SELECT id INTO v_id FROM public.mix_lots WHERE facility_id = p_facility_id AND source_type = v_src AND so_lo = v_so_lo AND status <> 'cancelled' ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF v_id IS NOT NULL THEN
    IF COALESCE(p_metal_cleared, false) THEN UPDATE public.mix_lots SET metal_cleared = true, updated_at = now() WHERE id = v_id AND NOT metal_cleared; END IF;
    RETURN v_id;
  END IF;
  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, metal_cleared, received_date, note, created_by, so_lo, kg_per_banh, so_banh_in, status)
  VALUES (public.fn_mix_ma('CH', p_facility_id), p_facility_id, v_src, CASE WHEN p_fg_lot_id IS NULL THEN NULL ELSE 'fg_lot' END, p_fg_lot_id, v_desc, v_grade, 0,
          COALESCE(p_metal_cleared, v_src <> 'dkl'), current_date, COALESCE(p_note, 'Lô tự tạo lúc lấy (nguồn + số lô)'), v_emp, v_so_lo, v_kpb, 0, 'available')
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_tim_hoac_tao_lo(uuid, text, text, uuid, boolean, text) TO authenticated;

-- ─── fn_mix_lay: lấy quá tồn → nhập = lấy (không chặn, trừ hàng kho TP) ───────
CREATE OR REPLACE FUNCTION public.fn_mix_lay(
  p_lot_id uuid, p_kg numeric, p_shift_date date DEFAULT current_date, p_shift_id uuid DEFAULT NULL, p_team text DEFAULT NULL,
  p_purpose text DEFAULT 'chay_lai', p_target_index text DEFAULT NULL, p_target_value numeric DEFAULT NULL,
  p_production_order_id uuid DEFAULT NULL, p_note text DEFAULT NULL, p_id uuid DEFAULT NULL,
  p_raw_lot_ids uuid[] DEFAULT NULL, p_so_banh int DEFAULT NULL, p_gross_kg numeric DEFAULT NULL, p_pallet_kg numeric DEFAULT NULL, p_vi_tri text DEFAULT NULL,
  p_so_lo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_ton numeric; v_id uuid; v_ids uuid[]; v_kg numeric; v_so_lo text; v_banh int; v_emp uuid := public.fn_nvl_emp_hien_tai(); v_lenh uuid; v_them numeric; v_banh_them int; f record;
BEGIN
  SELECT * INTO l FROM public.mix_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF NOT public.fn_mix_duoc_ky('khai_bao', l.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  IF l.status = 'cancelled' THEN RAISE EXCEPTION 'LO_DA_HET:%:lô đã hủy', l.code; END IF;   -- lô đã hết vẫn lấy tiếp được (máy ghi nhập thêm)
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
  -- Phương án B (30/10): kho chèn không chặn. Lấy quá tồn lô → phần thiếu máy ghi NHẬP = LẤY vào lô:
  --   · lô gắn lô TP (hàng chuẩn / lỗi / DKL từ kho TP): trừ thêm bành ở lô TP (tồn thật, vượt thì chặn)
  --   · SBR / mua ngoài / số lô gõ tay: ghi nhập thêm, không chặn (chỉ báo trên màn)
  IF v_kg > v_ton + 0.01 THEN
    v_them := round(v_kg - GREATEST(v_ton, 0), 2);
    IF l.source_ref_type = 'fg_lot' AND l.source_ref_id IS NOT NULL THEN
      v_banh_them := GREATEST(ceil(v_them / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int, 1);
      SELECT * INTO f FROM public.fg_lots WHERE id = l.source_ref_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO:lô TP của lô chèn %', l.code; END IF;
      IF f.so_banh - f.so_banh_da_xuat - f.so_banh_chen < v_banh_them THEN
        RAISE EXCEPTION 'VUOT_TON:%:lô TP % chỉ còn % bành, cần thêm % bành', l.code, f.so_lo, f.so_banh - f.so_banh_da_xuat - f.so_banh_chen, v_banh_them;
      END IF;
      UPDATE public.fg_lots SET so_banh_chen = so_banh_chen + v_banh_them, co_chen = true,
             status = CASE WHEN so_banh - so_banh_da_xuat - so_banh_chen - v_banh_them <= 0 THEN 'het' ELSE status END, updated_at = now() WHERE id = f.id;
      UPDATE public.mix_lots SET kg_in = kg_in + v_them, so_banh_in = COALESCE(so_banh_in, 0) + v_banh_them,
             received_date = CASE WHEN kg_in <= 0.005 THEN current_date ELSE received_date END, updated_at = now() WHERE id = l.id;
    ELSE
      UPDATE public.mix_lots SET kg_in = kg_in + v_them, so_banh_in = COALESCE(so_banh_in, 0) + round(v_them / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int,
             received_date = CASE WHEN kg_in <= 0.005 THEN current_date ELSE received_date END, updated_at = now() WHERE id = l.id;
    END IF;
  END IF;
  -- lúc lấy chỉ cân tổng (chưa trừ bì): ước số bành theo (cân − 15) để không dư 1 bành; sửa lại lúc trả
  v_banh := COALESCE(p_so_banh, GREATEST(round(GREATEST(v_kg - CASE WHEN p_gross_kg IS NOT NULL AND p_pallet_kg IS NULL THEN 15 ELSE 0 END, 0) / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int, 1));

  v_ids := (SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(p_raw_lot_ids, ARRAY[]::uuid[])) x WHERE x IS NOT NULL);
  IF v_ids IS NULL AND p_shift_id IS NOT NULL THEN
    SELECT CASE WHEN r.raw_lot_id IS NULL THEN NULL ELSE ARRAY[r.raw_lot_id] END INTO v_ids
      FROM public.shift_production_reports r WHERE r.facility_id = l.facility_id AND r.report_date = COALESCE(p_shift_date, current_date) AND r.shift_id = p_shift_id;
  END IF;
  IF v_ids IS NULL THEN   -- dự phòng: đúng MỘT lệnh đang chạy → mã của lệnh đó; nhiều lệnh song song → QS phải chọn (phiếu vào 'chưa gắn mã')
    SELECT g.raw_lot_ids INTO v_ids FROM public.nvl_lenh_chay g WHERE g.id = public.fn_nvl_lenh_dang_chay_1(l.facility_id, now());
  END IF;
  IF v_ids IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(v_ids) x LEFT JOIN public.raw_lots rl ON rl.id = x WHERE rl.id IS NULL OR rl.facility_id <> l.facility_id) THEN
    RAISE EXCEPTION 'LO_KHAC_NHA_MAY:mã gốc';
  END IF;

  v_lenh := CASE WHEN v_ids IS NULL THEN NULL ELSE public.fn_nvl_lenh_cua_ma(l.facility_id, v_ids, now()) END;   -- lệnh chứa đúng bộ mã này
  INSERT INTO public.mix_issues (id, code, facility_id, mix_lot_id, shift_date, shift_id, team, purpose, target_index, target_value,
                                 kg_out, out_by, production_order_id, note, created_by, raw_lot_id, raw_lot_ids, so_banh, gross_kg, pallet_kg, vi_tri, so_banh_tay, lenh_id)
  VALUES (COALESCE(p_id, gen_random_uuid()), public.fn_mix_ma('PC', l.facility_id), l.facility_id, l.id, COALESCE(p_shift_date, current_date), p_shift_id, p_team,
          COALESCE(p_purpose, 'chay_lai'), p_target_index, p_target_value, v_kg, v_emp, p_production_order_id, p_note, v_emp,
          CASE WHEN v_ids IS NULL THEN NULL ELSE v_ids[1] END, v_ids, v_banh, p_gross_kg, p_pallet_kg, p_vi_tri, (p_so_banh IS NOT NULL), v_lenh)
  RETURNING id INTO v_id;

  UPDATE public.mix_lots SET kg_at_line = kg_at_line + v_kg, status = 'in_use', updated_at = now() WHERE id = l.id;
  RETURN v_id;
END $$;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT to_regprocedure('public.fn_mix_tim_hoac_tao_lo(uuid,text,text,uuid,boolean,text)') AS f_tim_hoac_tao,
       (SELECT prosrc LIKE '%Phương án B%' FROM pg_proc WHERE proname = 'fn_mix_lay' AND pronamespace = 'public'::regnamespace) AS lay_khong_chan,
       (SELECT count(*) FROM pg_proc WHERE proname = 'fn_mix_lay' AND pronamespace = 'public'::regnamespace) AS so_ban_fn_mix_lay_phai_la_1;
