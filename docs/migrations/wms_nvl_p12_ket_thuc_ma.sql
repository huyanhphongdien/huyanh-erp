-- ============================================================
-- HÀNG CHÈN / MÃ NVL — GĐ4k: KẾT THÚC MÃ + TỔNG KẾT + MAIL BGĐ · THAY THẾ MÃ MẶC ĐỊNH · SỐ BÀNH TÍNH LẠI LÚC TRẢ
--   (30/10/2026 tối, chủ DN: "Bắt đầu mã mới mặc định thay thế mã cũ" · "số bành lúc lấy chỉ là ước tính, lúc trả máy không tính lại"
--    · "Phải có 1 nút kết thúc mã, tổng kết khối lượng chèn của mã đó, chuẩn bị 1 mail gởi cho ban giám đốc")
--   · mix_issues.so_banh_tay: true khi tổ gõ/chỉnh số bành; false = máy ước theo cân → fn_mix_tra tính lại = kg lấy thật / kg/bành
--   · fn_nvl_bat_dau_chay: p_thay_the mặc định TRUE (kết thúc mã khác đang chạy, ghi "thay bằng …" vào sổ), trả về da_thay[]
--   · fn_nvl_tong_ket_ma(raw_lot_id) → jsonb: NVL vào, chèn (vị trí / nguồn / lô / theo ca), TP + hiệu suất, đợt chạy, phiếu chưa trả/chờ ký,
--     danh sách BGĐ (positions.level ≤ 3, active, có email) để app soạn mail "Kết thúc mã"
-- Ngày: 2026-10-30 · Phụ thuộc: wms_mix_p11_bi_chi_luc_tra.sql (CHẠY p11 TRƯỚC p12)
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS so_banh_tay boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.mix_issues.so_banh_tay IS 'true = tổ gõ/chỉnh số bành lúc lấy (giữ nguyên); false = máy ước theo cân, tính lại lúc trả theo kg lấy thật';

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
                                 kg_out, out_by, production_order_id, note, created_by, raw_lot_id, raw_lot_ids, so_banh, gross_kg, pallet_kg, vi_tri, so_banh_tay)
  VALUES (COALESCE(p_id, gen_random_uuid()), public.fn_mix_ma('PC', l.facility_id), l.facility_id, l.id, COALESCE(p_shift_date, current_date), p_shift_id, p_team,
          COALESCE(p_purpose, 'chay_lai'), p_target_index, p_target_value, v_kg, v_emp, p_production_order_id, p_note, v_emp,
          CASE WHEN v_ids IS NULL THEN NULL ELSE v_ids[1] END, v_ids, v_banh, p_gross_kg, p_pallet_kg, p_vi_tri, (p_so_banh IS NOT NULL))
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
         so_banh = v_banh, so_banh_tay = (p_so_banh IS NOT NULL),
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
         so_banh = CASE WHEN NOT COALESCE(i.so_banh_tay, false) AND i.gross_kg IS NOT NULL THEN GREATEST(round(v_out / v_kpb)::int, 1) ELSE so_banh END,   -- số bành ước lúc lấy → tính lại theo kg lấy thật, trừ khi tổ đã chỉnh tay
         so_banh_tra = COALESCE(p_so_banh_tra, round(v_kg / v_kpb)::int), dung_het = COALESCE(p_dung_het, false),
         handover_to_next = COALESCE(p_handover, false) AND v_kg > 0, output_batch_id = COALESCE(p_output_batch_id, output_batch_id),
         shift_id = COALESCE(shift_id, p_shift_id), team = COALESCE(p_team, team),
         shift_date = CASE WHEN i.shift_id IS NULL AND p_shift_id IS NOT NULL THEN current_date ELSE shift_date END,
         note = COALESCE(p_note, note), status = 'returned', updated_at = now()
   WHERE id = i.id;
  RETURN jsonb_build_object('code', i.code, 'kg_out', v_out, 'kg_return', v_kg, 'kg_used', round(v_out - v_kg, 2), 'bi', v_bi);
END $$;

CREATE OR REPLACE FUNCTION public.fn_nvl_bat_dau_chay(p_raw_lot_id uuid, p_thay_the boolean DEFAULT true, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rl record; v_emp uuid := public.fn_nvl_emp_hien_tai(); v_id uuid; v_thay text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO rl FROM public.raw_lots WHERE id = p_raw_lot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF rl.status = 'huy' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:mã đã hủy', rl.ma; END IF;
  IF NOT (public.fn_mix_duoc_ky('khai_bao', rl.facility_id) OR public.fn_nvl_duoc_ky('receive', rl.facility_id)) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:bat_dau_chay'; END IF;
  -- mặc định THAY THẾ: kết thúc các mã khác đang chạy của nhà máy (chủ DN 30/10: "mã đang chạy không ai Kết thúc thì ca sau vẫn gắn mã cũ")
  IF COALESCE(p_thay_the, true) THEN
    WITH u AS (
      UPDATE public.raw_lot_runs r SET ended_at = now(), ended_by = v_emp, note = concat_ws(' · ', r.note, 'thay bằng ' || rl.ma)
       WHERE r.facility_id = rl.facility_id AND r.ended_at IS NULL AND r.raw_lot_id <> p_raw_lot_id
       RETURNING r.raw_lot_id)
    SELECT COALESCE(array_agg(DISTINCT l.ma), ARRAY[]::text[]) INTO v_thay FROM u JOIN public.raw_lots l ON l.id = u.raw_lot_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.raw_lot_runs WHERE raw_lot_id = p_raw_lot_id AND ended_at IS NULL) THEN
    RETURN jsonb_build_object('ma', rl.ma, 'da_chay', true, 'da_thay', to_jsonb(v_thay));
  END IF;
  INSERT INTO public.raw_lot_runs (facility_id, raw_lot_id, started_by, note) VALUES (rl.facility_id, p_raw_lot_id, v_emp, p_note) RETURNING id INTO v_id;
  UPDATE public.raw_lots SET status = 'mo' WHERE id = p_raw_lot_id AND status = 'dong';
  RETURN jsonb_build_object('ma', rl.ma, 'run_id', v_id, 'da_chay', false, 'da_thay', to_jsonb(v_thay));
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_bat_dau_chay(uuid, boolean, text) TO authenticated;

-- ─── Tổng kết một mã: NVL vào, chèn (vị trí / nguồn / lô / ca), thành phẩm, đợt chạy, BGĐ nhận mail ──
CREATE OR REPLACE FUNCTION public.fn_nvl_tong_ket_ma(p_raw_lot_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; y record; c record; v_runs jsonb; v_ca jsonb; v_phieu jsonb; v_bgd jsonb; v_nguoi jsonb;
BEGIN
  SELECT * INTO b FROM public.v_raw_lot_balance WHERE raw_lot_id = p_raw_lot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  SELECT * INTO y FROM public.v_raw_lot_yield WHERE raw_lot_id = p_raw_lot_id;
  SELECT * INTO c FROM public.v_raw_lot_chen WHERE raw_lot_id = p_raw_lot_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('started_at', r.started_at, 'ended_at', r.ended_at, 'started_name', es.full_name, 'ended_name', ee.full_name, 'note', r.note) ORDER BY r.started_at), '[]'::jsonb)
    INTO v_runs
    FROM public.raw_lot_runs r LEFT JOIN public.employees es ON es.id = r.started_by LEFT JOIN public.employees ee ON ee.id = r.ended_by
   WHERE r.raw_lot_id = p_raw_lot_id;

  -- phiếu chèn gắn mã này (chèn chung nhiều mã → chia đều như v_raw_lot_chen)
  SELECT jsonb_build_object(
           'tong', count(*), 'chua_tra', count(*) FILTER (WHERE i.status = 'issued'),
           'cho_ky', count(*) FILTER (WHERE i.status IN ('returned', 'submitted', 'qc_confirmed')), 'da_nhan', count(*) FILTER (WHERE i.status = 'received'),
           'so_ca', count(DISTINCT (i.shift_date, i.shift_id)),
           'kg_lay', round(COALESCE(sum(i.kg_out / GREATEST(cardinality(i.raw_lot_ids), 1)), 0), 1),
           'kg_tra', round(COALESCE(sum(i.kg_return / GREATEST(cardinality(i.raw_lot_ids), 1)), 0), 1),
           'tieu_hao', round(COALESCE(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)), 0), 1),
           'tieu_hao_da_nhan', round(COALESCE(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)) FILTER (WHERE i.status = 'received'), 0), 1),
           'so_banh', COALESCE(sum(i.so_banh), 0),
           'be_slap', round(COALESCE(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)) FILTER (WHERE i.vi_tri = 'be_slap'), 0), 1),
           'may_mix', round(COALESCE(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)) FILTER (WHERE i.vi_tri = 'may_mix'), 0), 1),
           'lan_dau', min(i.out_at), 'lan_cuoi', max(COALESCE(i.return_at, i.out_at)))
    INTO v_phieu
    FROM public.mix_issues i
   WHERE i.status <> 'cancelled' AND p_raw_lot_id = ANY(COALESCE(i.raw_lot_ids, ARRAY[i.raw_lot_id]));

  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'shift_date'), (x->>'shift_name'), (x->>'team')), '[]'::jsonb) INTO v_ca FROM (
    SELECT jsonb_build_object('shift_date', i.shift_date, 'shift_name', COALESCE(sh.name, sh.code, ''), 'team', i.team,
             'so_lan', count(*),
             'kg_lay', round(COALESCE(sum(i.kg_out / GREATEST(cardinality(i.raw_lot_ids), 1)), 0), 1),
             'kg_tra', round(COALESCE(sum(i.kg_return / GREATEST(cardinality(i.raw_lot_ids), 1)), 0), 1),
             'tieu_hao', round(COALESCE(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)), 0), 1),
             'da_nhan', round(COALESCE(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)) FILTER (WHERE i.status = 'received'), 0), 1),
             'chua_tra', count(*) FILTER (WHERE i.status = 'issued'),
             'cho_ky', count(*) FILTER (WHERE i.status IN ('returned', 'submitted', 'qc_confirmed'))) AS x
      FROM public.mix_issues i LEFT JOIN public.shifts sh ON sh.id = i.shift_id
     WHERE i.status <> 'cancelled' AND p_raw_lot_id = ANY(COALESCE(i.raw_lot_ids, ARRAY[i.raw_lot_id]))
     GROUP BY i.shift_date, sh.name, sh.code, i.team) q;

  -- Ban Giám đốc = chức vụ level ≤ 3 (như is_admin_or_bgd), đang làm việc, có email
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', e.full_name, 'email', e.email, 'chuc_vu', p.name) ORDER BY p.level, e.full_name), '[]'::jsonb) INTO v_bgd
    FROM public.employees e JOIN public.positions p ON p.id = e.position_id
   WHERE COALESCE(p.level, 99) <= 3 AND e.status = 'active' AND COALESCE(btrim(e.email), '') <> '';
  SELECT jsonb_build_object('name', e.full_name, 'email', e.email) INTO v_nguoi FROM public.employees e WHERE e.id = public.fn_nvl_emp_hien_tai();

  RETURN jsonb_build_object(
    'raw_lot_id', b.raw_lot_id, 'ma', b.ma, 'nguon', b.nguon, 'facility_code', b.facility_code, 'rubber_type_name', b.rubber_type_name, 'trang_thai', b.trang_thai, 'dang_chay', b.dang_chay_tu IS NOT NULL,
    'so_xe', b.so_xe, 'wet_kg', b.wet_kg, 'dry_kg', b.dry_kg, 'drc_pct', b.drc_pct, 'nhap_kho_kg', b.nhap_kho_kg, 'xuat_sx_kho_kg', b.xuat_sx_kho_kg, 'ngay_dau', b.ngay_dau, 'ngay_cuoi', b.ngay_cuoi,
    'so_ca_ep', y.so_ca, 'tp_dat_kg', y.tp_dat_kg, 'loi_dkl_kg', y.loi_dkl_kg, 'hieu_suat_pct', y.hieu_suat_pct, 'ty_le_loi_pct', y.ty_le_loi_pct,
    'chen', CASE WHEN c.raw_lot_id IS NULL THEN NULL ELSE jsonb_build_object('chen_kg', c.chen_kg, 'so_phieu', c.so_phieu_chen, 'so_banh', c.so_banh_chen, 'be_kg', c.chen_be_kg, 'mix_kg', c.chen_mix_kg,
             'loi_kg', c.chen_loi_kg, 'dkl_kg', c.chen_dkl_kg, 'chuan_kg', c.chen_chuan_kg, 'khac_kg', c.chen_khac_kg, 'ty_le_pct', c.ty_le_chen_pct, 'chi_tiet', c.chi_tiet) END,
    'phieu', v_phieu, 'theo_ca', v_ca, 'dot_chay', v_runs, 'bgd', v_bgd, 'nguoi_lap', v_nguoi, 'luc', now());
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_tong_ket_ma(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT (SELECT count(*) FROM information_schema.columns WHERE table_name = 'mix_issues' AND column_name = 'so_banh_tay') AS cot_so_banh_tay,
       to_regprocedure('public.fn_nvl_tong_ket_ma(uuid)') AS f_tong_ket,
       (SELECT prosrc LIKE '%da_thay%' FROM pg_proc WHERE proname = 'fn_nvl_bat_dau_chay' AND pronamespace = 'public'::regnamespace) AS bat_dau_thay_the,
       (SELECT prosrc LIKE '%so_banh_tay%' FROM pg_proc WHERE proname = 'fn_mix_tra' AND pronamespace = 'public'::regnamespace) AS tra_tinh_lai_banh,
       (SELECT count(*) FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE COALESCE(p.level, 99) <= 3 AND e.status = 'active' AND COALESCE(btrim(e.email), '') <> '') AS so_nguoi_bgd_co_email;
