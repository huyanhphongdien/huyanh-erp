-- ============================================================
-- HÀNG CHÈN — p20: BÌ PALLET CHUẨN 27,5 KG (17/11/2026, chủ DN:
--   "mặc định pallet chèn là 27,5" — BỎ kế hoạch cân thật từng pallet, cân lại chỉ còn là ngoại lệ)
--   · mix_pallets (PĐ, HC1→HC30): bi_kg = 27.5 cho TẤT CẢ — kể cả HC21→30 đang TẮT
--     (vẫn giữ tắt + tat_ly_do "chưa đưa vào dùng", nhưng có bì sẵn → bật là dùng được ngay).
--   · Ghi mix_pallet_logs cho từng pallet (can_lai nếu đã có bì tạm 15/25, khai nếu bì NULL).
--   · note "Bì tạm theo nhóm…, chưa cân từng pallet" → "Bì chuẩn 27,5 kg (chủ DN 17/11/2026)".
--   · fn_mix_lay + fn_mix_sua_lay: ước lệ 15 kg (ĐƯỜNG CŨ cân tổng chưa bì, chỉ để ƯỚC số bành) → 27.5.
--     Nhánh pallet HC không đổi: kg hàng = gross − bì đọc từ sổ, giờ sổ ghi 27,5.
-- Phụ thuộc: wms_mix_p19_so_pallet.sql (CHẠY SAU p19).
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000). Idempotent (chạy lại không ghi log đúp).
-- ============================================================

-- ─── 1) LOG trước (giữ bi_cu), chỉ pallet chưa phải 27.5 ────────────────────
INSERT INTO public.mix_pallet_logs (pallet_id, loai, bi_cu, bi_moi, ly_do)
SELECT p.id, CASE WHEN p.bi_kg IS NULL THEN 'khai' ELSE 'can_lai' END, p.bi_kg, 27.5,
       'Bì chuẩn 27,5 kg cho mọi pallet HC (chủ DN 17/11/2026) — bỏ cân từng pallet'
  FROM public.mix_pallets p JOIN public.facilities f ON f.id = p.facility_id
 WHERE f.code = 'PD' AND p.code ~ '^HC[0-9]+$' AND p.bi_kg IS DISTINCT FROM 27.5;

-- ─── 2) ĐỔI BÌ = 27,5 + note mới (cả HC21→30 đang tắt; is_active/tat_ly_do GIỮ NGUYÊN) ──
UPDATE public.mix_pallets p
   SET bi_kg = 27.5, bi_khai_at = now(),
       note = 'Bì chuẩn 27,5 kg (chủ DN 17/11/2026)',
       updated_at = now()
  FROM public.facilities f
 WHERE f.id = p.facility_id AND f.code = 'PD' AND p.code ~ '^HC[0-9]+$' AND p.bi_kg IS DISTINCT FROM 27.5;

COMMENT ON TABLE public.mix_pallets IS 'Sổ pallet hàng chèn: khai báo pallet (ten) · chữ viết tắt (code) · số kg (bi_kg = bì pallet rỗng, CHUẨN 27,5 kg từ 17/11/2026 — cân lại chỉ khi pallet lệch chuẩn). p19/p20.';

-- ─── 3) fn_mix_lay: ước lệ đường cũ 15 → 27.5 (chỉ đổi con số ước số bành) ──
CREATE OR REPLACE FUNCTION public.fn_mix_lay(
  p_lot_id uuid, p_kg numeric, p_shift_date date DEFAULT current_date, p_shift_id uuid DEFAULT NULL, p_team text DEFAULT NULL,
  p_purpose text DEFAULT 'chay_lai', p_target_index text DEFAULT NULL, p_target_value numeric DEFAULT NULL,
  p_production_order_id uuid DEFAULT NULL, p_note text DEFAULT NULL, p_id uuid DEFAULT NULL,
  p_raw_lot_ids uuid[] DEFAULT NULL, p_so_banh int DEFAULT NULL, p_gross_kg numeric DEFAULT NULL, p_pallet_kg numeric DEFAULT NULL, p_vi_tri text DEFAULT NULL,
  p_so_lo text DEFAULT NULL, p_pallet_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; pl record; v_ton numeric; v_id uuid; v_ids uuid[]; v_kg numeric; v_so_lo text; v_banh int; v_emp uuid := public.fn_nvl_emp_hien_tai(); v_lenh uuid; v_them numeric; v_banh_them int; f record;
        v_bi numeric; v_gan uuid; v_gan_code text;
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

  -- p19: pallet HC từ Sổ pallet → bì chốt ngay, kg lấy = cân cả pallet − bì
  IF p_pallet_id IS NOT NULL THEN
    SELECT * INTO pl FROM public.mix_pallets WHERE id = p_pallet_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PALLET'; END IF;
    IF pl.facility_id <> l.facility_id THEN RAISE EXCEPTION 'LO_KHAC_NHA_MAY:pallet % thuộc nhà máy khác', pl.code; END IF;
    IF NOT pl.is_active THEN RAISE EXCEPTION 'PALLET_TAT:%:pallet đang tắt, bật lại trong Sổ pallet', pl.code; END IF;
    IF pl.bi_kg IS NULL THEN RAISE EXCEPTION 'PALLET_CHUA_BI:%:chưa khai số kg trong Sổ pallet', pl.code; END IF;
    v_gan := public.fn_mix_pallet_phieu_dang_gan(pl.id);
    IF v_gan IS NOT NULL THEN
      SELECT code INTO v_gan_code FROM public.mix_issues WHERE id = v_gan;
      RAISE EXCEPTION 'PALLET_DANG_O_DAY_CHUYEN:%:đang gắn phiếu %, trả phiếu đó trước hoặc chọn pallet khác', pl.code, v_gan_code;
    END IF;
    IF p_gross_kg IS NULL THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:gõ số trên cân (cả pallet %)', pl.code; END IF;
    v_bi := pl.bi_kg;
    v_kg := round(p_gross_kg - v_bi, 2);
    IF v_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:cân % kg không lớn hơn bì % kg của %', p_gross_kg, v_bi, pl.code; END IF;
  ELSE
    v_bi := p_pallet_kg;
    v_kg := COALESCE(p_kg, CASE WHEN p_gross_kg IS NOT NULL THEN round(p_gross_kg - COALESCE(p_pallet_kg, 0), 2) END);
  END IF;
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
  -- số bành ước: có pallet HC (bì đã biết) hoặc gõ thẳng kg → theo kg hàng thật; cân tổng chưa bì (đường cũ) → ước bớt 27,5 kg pallet chuẩn (p20)
  v_banh := COALESCE(p_so_banh, GREATEST(round(GREATEST(v_kg - CASE WHEN p_pallet_id IS NULL AND p_gross_kg IS NOT NULL AND p_pallet_kg IS NULL THEN 27.5 ELSE 0 END, 0) / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int, 1));

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
                                 kg_out, out_by, production_order_id, note, created_by, raw_lot_id, raw_lot_ids, so_banh, gross_kg, pallet_kg, vi_tri, so_banh_tay, lenh_id, pallet_id)
  VALUES (COALESCE(p_id, gen_random_uuid()), public.fn_mix_ma('PC', l.facility_id), l.facility_id, l.id, COALESCE(p_shift_date, current_date), p_shift_id, p_team,
          COALESCE(p_purpose, 'chay_lai'), p_target_index, p_target_value, v_kg, v_emp, p_production_order_id, p_note, v_emp,
          CASE WHEN v_ids IS NULL THEN NULL ELSE v_ids[1] END, v_ids, v_banh, p_gross_kg, v_bi, p_vi_tri, (p_so_banh IS NOT NULL), v_lenh, p_pallet_id)
  RETURNING id INTO v_id;

  UPDATE public.mix_lots SET kg_at_line = kg_at_line + v_kg, status = 'in_use', updated_at = now() WHERE id = l.id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_lay(uuid, numeric, date, uuid, text, text, text, numeric, uuid, text, uuid, uuid[], integer, numeric, numeric, text, text, uuid) TO authenticated;

-- ─── 4) fn_mix_sua_lay: ước lệ đường cũ 15 → 27.5 ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mix_sua_lay(p_issue_id uuid, p_kg numeric DEFAULT NULL, p_gross_kg numeric DEFAULT NULL, p_pallet_kg numeric DEFAULT NULL, p_so_banh int DEFAULT NULL, p_note text DEFAULT NULL, p_pallet_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; l record; pl record; v_kg numeric; v_ton numeric; v_banh int; v_emp uuid := public.fn_nvl_emp_hien_tai(); v_pallet uuid; v_bi numeric; v_gross numeric; v_gan uuid;
BEGIN
  SELECT * INTO i FROM public.mix_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF i.status NOT IN ('issued', 'returned') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%:đã ký, không sửa cân lấy được', i.code, i.status; END IF;
  IF NOT public.fn_mix_duoc_ky('khai_bao', i.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:khai_bao'; END IF;
  SELECT * INTO l FROM public.mix_lots WHERE id = i.mix_lot_id FOR UPDATE;
  v_pallet := COALESCE(p_pallet_id, i.pallet_id);
  IF v_pallet IS NOT NULL AND p_kg IS NULL THEN
    -- p19: phiếu theo pallet HC → bì từ Sổ pallet (pallet mới nếu đổi), kg = cân cả pallet − bì
    SELECT * INTO pl FROM public.mix_pallets WHERE id = v_pallet FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PALLET'; END IF;
    IF v_pallet IS DISTINCT FROM i.pallet_id THEN
      IF NOT pl.is_active THEN RAISE EXCEPTION 'PALLET_TAT:%', pl.code; END IF;
      IF pl.bi_kg IS NULL THEN RAISE EXCEPTION 'PALLET_CHUA_BI:%', pl.code; END IF;
      v_gan := public.fn_mix_pallet_phieu_dang_gan(pl.id);
      IF v_gan IS NOT NULL AND v_gan <> i.id THEN RAISE EXCEPTION 'PALLET_DANG_O_DAY_CHUYEN:%:đang gắn phiếu khác', pl.code; END IF;
      v_bi := pl.bi_kg;
    ELSE
      v_bi := COALESCE(i.pallet_kg, pl.bi_kg);   -- giữ bì đã chốt lúc lấy
    END IF;
    v_gross := COALESCE(p_gross_kg, i.gross_kg);
    IF v_gross IS NULL THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:gõ số trên cân (cả pallet)'; END IF;
    v_kg := round(v_gross - v_bi, 2);
    IF v_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:cân % kg không lớn hơn bì % kg', v_gross, v_bi; END IF;
    v_banh := COALESCE(p_so_banh, GREATEST(round(v_kg / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int, 1));
  ELSE
    -- đường cũ: bì lấy theo thứ tự gõ tay → bì đã khai lúc trả → chưa có (chỉ cân tổng); ước bớt 27,5 kg pallet chuẩn (p20)
    v_pallet := NULL; v_gross := p_gross_kg;
    v_kg := COALESCE(p_kg, CASE WHEN p_gross_kg IS NOT NULL THEN round(p_gross_kg - COALESCE(p_pallet_kg, i.return_pallet_kg, 0), 2) END);
    IF v_kg IS NULL OR v_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
    v_bi := CASE WHEN p_gross_kg IS NULL THEN NULL ELSE COALESCE(p_pallet_kg, i.return_pallet_kg) END;
    v_banh := COALESCE(p_so_banh, GREATEST(round(GREATEST(v_kg - CASE WHEN p_gross_kg IS NOT NULL AND COALESCE(p_pallet_kg, i.return_pallet_kg) IS NULL THEN 27.5 ELSE 0 END, 0) / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int, 1));
  END IF;
  v_ton := l.kg_in - l.kg_used - (l.kg_at_line - i.kg_out);                     -- tồn nếu bỏ phiếu này ra
  IF v_kg > v_ton + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:lấy % > tồn %', l.code, v_kg, round(v_ton, 2); END IF;
  IF i.kg_return IS NOT NULL AND i.kg_return > v_kg + 0.01 THEN RAISE EXCEPTION 'TRA_QUA_LAY:%:đã trả % > kg lấy mới %', i.code, i.kg_return, v_kg; END IF;

  UPDATE public.mix_lots SET kg_at_line = GREATEST(kg_at_line - i.kg_out + v_kg, 0), updated_at = now() WHERE id = l.id;
  UPDATE public.mix_issues
     SET kg_out = v_kg, gross_kg = v_gross, pallet_kg = v_bi, pallet_id = v_pallet,
         so_banh = v_banh, so_banh_tay = (p_so_banh IS NOT NULL),
         kg_used = CASE WHEN kg_return IS NOT NULL THEN round(v_kg - kg_return, 2) ELSE kg_used END,
         out_edit_at = now(), out_edit_by = v_emp, out_kg_truoc = COALESCE(out_kg_truoc, i.kg_out),
         note = COALESCE(p_note, note), updated_at = now()
   WHERE id = i.id;
  RETURN jsonb_build_object('code', i.code, 'kg_truoc', i.kg_out, 'kg_sau', v_kg, 'so_banh', v_banh, 'pallet_id', v_pallet, 'bi', v_bi);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_sua_lay(uuid, numeric, numeric, numeric, integer, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT (SELECT count(*) FROM public.mix_pallets WHERE bi_kg = 27.5) AS bi_27_5_phai_la_30,
       (SELECT count(*) FROM public.mix_pallets WHERE bi_kg IS DISTINCT FROM 27.5) AS khac_27_5_phai_la_0,
       (SELECT count(*) FROM public.mix_pallets WHERE NOT is_active) AS tat_phai_la_10,
       (SELECT count(*) FROM public.mix_pallet_logs WHERE ly_do LIKE 'Bì chuẩn 27,5%') AS log_moi_phai_la_30,
       (SELECT prosrc LIKE '%27.5%' FROM pg_proc WHERE proname = 'fn_mix_lay' AND pronamespace = 'public'::regnamespace) AS lay_p20,
       (SELECT prosrc LIKE '%27.5%' FROM pg_proc WHERE proname = 'fn_mix_sua_lay' AND pronamespace = 'public'::regnamespace) AS sua_lay_p20;
