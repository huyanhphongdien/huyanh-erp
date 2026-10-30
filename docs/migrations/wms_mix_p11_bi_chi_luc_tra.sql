-- ============================================================
-- HÀNG CHÈN — GĐ4j: LÚC LẤY CHỈ CÂN TỔNG, BÌ CHỈ KHAI LÚC TRẢ (30/10/2026, chủ DN:
--   "lấy đầu ca nếu không khai báo thì bỏ đi, chỉ lấy khối lượng pallet lúc trả")
--   · fn_mix_lay / fn_mix_sua_lay: không có bì → kg lấy tạm = cân tổng; số bành ước theo (cân − 15)
--   · fn_mix_tra: lúc lấy có cân tổng mà trả không khai bì → chặn (THIEU_KHOI_LUONG); kg lấy = cân tổng − bì
--   · Audit tối 30/10: sửa cân lấy sau khi đã trả giữ bì đã khai (không mất bì); kiểm kê kho chèn cho cả thủ kho nhận;
--     % chèn so với hàng vào máy chỉ tính khi mã đã xuất NVL (trước đó hiện 100 % gây hiểu nhầm)
-- Ngày: 2026-10-30 · Phụ thuộc: wms_nvl_p10_ma_dang_chay.sql (CHẠY p8 → p9 → p10 → p11)
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

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
  -- lúc lấy chỉ cân tổng (chưa trừ bì): ước số bành theo (cân − 15) để không dư 1 bành; sửa lại lúc trả
  v_banh := COALESCE(p_so_banh, GREATEST(round(GREATEST(v_kg - CASE WHEN p_gross_kg IS NOT NULL AND p_pallet_kg IS NULL THEN 15 ELSE 0 END, 0) / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int, 1));

  v_ids := (SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(p_raw_lot_ids, ARRAY[]::uuid[])) x WHERE x IS NOT NULL);
  IF v_ids IS NULL AND p_shift_id IS NOT NULL THEN
    SELECT CASE WHEN r.raw_lot_id IS NULL THEN NULL ELSE ARRAY[r.raw_lot_id] END INTO v_ids
      FROM public.shift_production_reports r WHERE r.facility_id = l.facility_id AND r.report_date = COALESCE(p_shift_date, current_date) AND r.shift_id = p_shift_id;
  END IF;
  IF v_ids IS NULL THEN v_ids := NULLIF(public.fn_nvl_ma_dang_chay(l.facility_id, now()), ARRAY[]::uuid[]); END IF;   -- dự phòng: sổ mã đang chạy
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

CREATE OR REPLACE FUNCTION public.fn_mix_sua_lay(p_issue_id uuid, p_kg numeric DEFAULT NULL, p_gross_kg numeric DEFAULT NULL, p_pallet_kg numeric DEFAULT NULL, p_so_banh int DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; l record; v_kg numeric; v_ton numeric; v_banh int; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO i FROM public.mix_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF i.status NOT IN ('issued', 'returned') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%:đã ký, không sửa cân lấy được', i.code, i.status; END IF;
  IF NOT public.fn_mix_duoc_ky('khai_bao', i.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:khai_bao'; END IF;
  SELECT * INTO l FROM public.mix_lots WHERE id = i.mix_lot_id FOR UPDATE;
  -- sửa cân lấy: bì lấy theo thứ tự gõ tay → bì đã khai lúc trả → chưa có (chỉ cân tổng)
  v_kg := COALESCE(p_kg, CASE WHEN p_gross_kg IS NOT NULL THEN round(p_gross_kg - COALESCE(p_pallet_kg, i.return_pallet_kg, 0), 2) END);
  IF v_kg IS NULL OR v_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  v_ton := l.kg_in - l.kg_used - (l.kg_at_line - i.kg_out);                     -- tồn nếu bỏ phiếu này ra
  IF v_kg > v_ton + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:lấy % > tồn %', l.code, v_kg, round(v_ton, 2); END IF;
  IF i.kg_return IS NOT NULL AND i.kg_return > v_kg + 0.01 THEN RAISE EXCEPTION 'TRA_QUA_LAY:%:đã trả % > kg lấy mới %', i.code, i.kg_return, v_kg; END IF;
  v_banh := COALESCE(p_so_banh, GREATEST(round(GREATEST(v_kg - CASE WHEN p_gross_kg IS NOT NULL AND COALESCE(p_pallet_kg, i.return_pallet_kg) IS NULL THEN 15 ELSE 0 END, 0) / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int, 1));

  UPDATE public.mix_lots SET kg_at_line = GREATEST(kg_at_line - i.kg_out + v_kg, 0), updated_at = now() WHERE id = l.id;
  UPDATE public.mix_issues
     SET kg_out = v_kg,
         gross_kg = p_gross_kg, pallet_kg = CASE WHEN p_gross_kg IS NULL THEN NULL ELSE COALESCE(p_pallet_kg, i.return_pallet_kg) END,
         so_banh = v_banh,
         kg_used = CASE WHEN kg_return IS NOT NULL THEN round(v_kg - kg_return, 2) ELSE kg_used END,
         out_edit_at = now(), out_edit_by = v_emp, out_kg_truoc = COALESCE(out_kg_truoc, i.kg_out),
         note = COALESCE(p_note, note), updated_at = now()
   WHERE id = i.id;
  RETURN jsonb_build_object('code', i.code, 'kg_truoc', i.kg_out, 'kg_sau', v_kg, 'so_banh', v_banh);
END $$;

CREATE OR REPLACE FUNCTION public.fn_mix_tra(
  p_issue_id uuid, p_kg_return numeric, p_handover boolean DEFAULT false, p_note text DEFAULT NULL, p_output_batch_id uuid DEFAULT NULL,
  p_shift_id uuid DEFAULT NULL, p_team text DEFAULT NULL, p_gross_kg numeric DEFAULT NULL, p_pallet_kg numeric DEFAULT NULL, p_so_banh_tra int DEFAULT NULL,
  p_dung_het boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; l record; v_kg numeric; v_bi numeric; v_out numeric; v_ton numeric; v_kpb numeric; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO i FROM public.mix_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF i.status NOT IN ('issued', 'returned') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', i.code, i.status; END IF;
  IF NOT public.fn_mix_duoc_ky('khai_bao', i.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  IF i.shift_id IS NULL AND p_shift_id IS NULL THEN RAISE EXCEPTION 'THIEU_CA:%:phiếu bàn giao chưa có ca, chọn ca trước khi trả', i.code; END IF;
  SELECT * INTO l FROM public.mix_lots WHERE id = i.mix_lot_id FOR UPDATE;
  v_kpb := COALESCE(NULLIF(l.kg_per_banh, 0), 35);

  -- bì: KHÔNG hỏi lúc lấy; khai ở lần trả (dùng hết → số trên cân = pallet rỗng; còn dư → gõ bì); sửa kg trả giữ bì đã khai
  IF COALESCE(p_dung_het, false) THEN
    v_bi := COALESCE(p_gross_kg, p_pallet_kg, i.return_pallet_kg, i.pallet_kg);
    v_kg := 0;
  ELSE
    v_bi := COALESCE(p_pallet_kg, i.return_pallet_kg, i.pallet_kg);
    v_kg := COALESCE(p_kg_return, CASE WHEN p_gross_kg IS NOT NULL THEN round(p_gross_kg - COALESCE(v_bi, 0), 2) END);
  END IF;
  IF i.gross_kg IS NOT NULL AND v_bi IS NULL THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:%:khai bì pallet lúc trả (cân pallet rỗng hoặc gõ bì)', i.code; END IF;
  v_bi := COALESCE(v_bi, 0);
  IF v_kg IS NULL OR v_kg < 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;

  -- kg lấy = cân tổng lúc lấy − bì (lúc lấy chỉ cân tổng); phiếu gõ thẳng kg thì giữ nguyên
  v_out := CASE WHEN i.gross_kg IS NOT NULL THEN round(i.gross_kg - v_bi, 2) ELSE i.kg_out END;
  IF v_out <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:bì % kg lớn hơn cân lúc lấy % kg', v_bi, i.gross_kg; END IF;
  v_ton := l.kg_in - l.kg_used - (l.kg_at_line - i.kg_out);
  IF v_out > v_ton + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:lấy % > tồn %', l.code, v_out, round(v_ton, 2); END IF;
  IF v_kg > v_out + 0.01 THEN RAISE EXCEPTION 'TRA_QUA_LAY:%:trả % > lấy %', i.code, v_kg, v_out; END IF;

  UPDATE public.mix_lots SET kg_at_line = GREATEST(kg_at_line - i.kg_out + v_out, 0), updated_at = now() WHERE id = l.id;
  UPDATE public.mix_issues
     SET kg_out = v_out,
         pallet_kg = CASE WHEN i.gross_kg IS NOT NULL THEN v_bi ELSE pallet_kg END,
         out_kg_truoc = CASE WHEN abs(v_out - i.kg_out) > 0.005 THEN COALESCE(out_kg_truoc, i.kg_out) ELSE out_kg_truoc END,
         kg_return = v_kg, return_at = now(), return_by = v_emp, kg_used = round(v_out - v_kg, 2),
         return_gross_kg = CASE WHEN COALESCE(p_dung_het, false) THEN v_bi ELSE p_gross_kg END, return_pallet_kg = v_bi,
         so_banh_tra = COALESCE(p_so_banh_tra, round(v_kg / v_kpb)::int), dung_het = COALESCE(p_dung_het, false),
         handover_to_next = COALESCE(p_handover, false) AND v_kg > 0, output_batch_id = COALESCE(p_output_batch_id, output_batch_id),
         shift_id = COALESCE(shift_id, p_shift_id), team = COALESCE(p_team, team),
         shift_date = CASE WHEN i.shift_id IS NULL AND p_shift_id IS NOT NULL THEN current_date ELSE shift_date END,
         note = COALESCE(p_note, note), status = 'returned', updated_at = now()
   WHERE id = i.id;
  RETURN jsonb_build_object('code', i.code, 'kg_out', v_out, 'kg_return', v_kg, 'kg_used', round(v_out - v_kg, 2), 'bi', v_bi);
END $$;

CREATE OR REPLACE FUNCTION public.fn_mix_kiem_ke(p_lot_id uuid, p_kg_thuc numeric, p_ly_do text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_ton numeric; v_chenh numeric; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO l FROM public.mix_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF NOT (public.fn_mix_duoc_ky('khai_bao', l.facility_id) OR public.fn_mix_duoc_ky('nhan_kho', l.facility_id)) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kiem_ke_kho_chen'; END IF;   -- QS hoặc thủ kho nhận
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

-- ─── v_raw_lot_chen: % chèn chỉ khi mã đã xuất NVL ──────────────────────────
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
       CASE WHEN COALESCE(b.xuat_sx_kho_kg, 0) > 0   -- chưa xuất NVL của mã thì không tính %, tránh hiện 100 %
            THEN round(100 * COALESCE(sum(ct.kg), 0) / (COALESCE(b.xuat_sx_kho_kg, 0) + COALESCE(sum(ct.kg), 0)), 1) END AS ty_le_chen_pct,
       COALESCE(jsonb_agg(jsonb_build_object('lot_code', ct.lot_code, 'so_lo', ct.so_lo, 'vi_tri', ct.vi_tri, 'source_type', ct.source_type, 'grade', ct.grade, 'desc', ct.source_desc, 'kg', ct.kg, 'so_banh', ct.so_banh, 'so_phieu', ct.so_phieu, 'co_chung', ct.co_chung) ORDER BY ct.kg DESC) FILTER (WHERE ct.mix_lot_id IS NOT NULL), '[]'::jsonb) AS chi_tiet
FROM public.v_raw_lot_balance b
LEFT JOIN ct ON ct.raw_lot_id = b.raw_lot_id
GROUP BY b.raw_lot_id, b.facility_id, b.ma, b.rubber_type_name, b.trang_thai, b.xuat_sx_kho_kg;
ALTER VIEW public.v_raw_lot_chen SET (security_invoker = on);
GRANT SELECT ON public.v_raw_lot_chen TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT (SELECT count(*) FROM pg_proc WHERE proname = 'fn_mix_lay' AND pronamespace = 'public'::regnamespace) AS so_ban_fn_mix_lay_phai_la_1,
       (SELECT count(*) FROM pg_proc WHERE proname = 'fn_mix_tra' AND pronamespace = 'public'::regnamespace) AS so_ban_fn_mix_tra_phai_la_1,
       (SELECT prosrc LIKE '%khai bì pallet lúc trả%' FROM pg_proc WHERE proname = 'fn_mix_tra' AND pronamespace = 'public'::regnamespace) AS tra_bat_bi,
       (SELECT prosrc LIKE '%kiem_ke_kho_chen%' FROM pg_proc WHERE proname = 'fn_mix_kiem_ke' AND pronamespace = 'public'::regnamespace) AS kiem_ke_thu_kho;
