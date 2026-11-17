-- ============================================================
-- HÀNG CHÈN — p21: VÁ THEO AUDIT 17/11/2026 (65-agent audit, chạy SAU p20)
--   1) fn_mix_pallet_tao_bo: p_bi_kg DEFAULT 27.5 — tạo bộ pallet mới là dùng được ngay (C3).
--   2) fn_mix_pallet_khai: mở rộng điều kiện tự xoá note chuẩn ('Bì tạm theo nhóm%' | 'Bì chuẩn%')
--      khi cân lại ra số khác — hết cảnh pallet 26,8 kg vẫn đeo note "Bì chuẩn 27,5 kg" (C2/C38).
--   3) fn_mix_sua_lay: (a) KHÔNG gỡ pallet âm thầm nữa — phiếu có pallet mà gõ thẳng kg thì GIỮ
--      pallet + bì, gross_kg = NULL (trước đây pallet_id bị xoá → pallet "trống" trong khi hàng
--      vẫn ở dây chuyền, 2 phiếu có thể cùng giữ 1 pallet) (C6/C11/C21);
--      (b) thêm check pallet cùng nhà máy như fn_mix_lay (C5).
--   4) fn_mix_tra: trả-lại-lần-2 bật "bàn giao" phải kiểm pallet còn thuộc phiếu mình —
--      bịt kẽ hở 2 phiếu cùng pallet → vỡ unique index lúc nhận kho (C4).
--   5) fn_mix_ky (receive): chốt chặn cuối trước khi INSERT phiếu bàn giao — pallet đang ở phiếu
--      khác thì báo tiếng Việt thay vì chết bằng lỗi constraint 23505 (C4).
-- Phụ thuộc: wms_mix_p20_bi_chuan_27_5.sql. DB lúc soạn: mix_issues = 0 dòng (an toàn đổi hàm).
-- ⚠ agent_sql: KHÔNG BEGIN/COMMIT. Idempotent (toàn CREATE OR REPLACE).
-- ============================================================

-- ─── 1) TẠO BỘ: bì mặc định 27,5 ───────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_mix_pallet_tao_bo(uuid, int, int, text, text, numeric);
CREATE OR REPLACE FUNCTION public.fn_mix_pallet_tao_bo(p_facility_id uuid, p_tu int, p_den int, p_prefix text DEFAULT 'HC', p_ten text DEFAULT NULL, p_bi_kg numeric DEFAULT 27.5)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emp uuid := public.fn_nvl_emp_hien_tai(); v_n int := 0; i int; v_id uuid;
BEGIN
  IF NOT public.fn_mix_duoc_ky('nhan_kho', p_facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:so_pallet'; END IF;
  IF p_tu IS NULL OR p_den IS NULL OR p_tu < 1 OR p_den < p_tu OR p_den - p_tu > 200 THEN RAISE EXCEPTION 'SO_KHONG_HOP_LE:từ % đến %', p_tu, p_den; END IF;
  FOR i IN p_tu..p_den LOOP
    INSERT INTO public.mix_pallets (facility_id, code, so, ten, bi_kg, bi_khai_at, bi_khai_by, created_by, note)
    VALUES (p_facility_id, upper(COALESCE(p_prefix, 'HC')) || i, i, p_ten, p_bi_kg, CASE WHEN p_bi_kg IS NULL THEN NULL ELSE now() END, CASE WHEN p_bi_kg IS NULL THEN NULL ELSE v_emp END, v_emp,
            CASE WHEN p_bi_kg = 27.5 THEN 'Bì chuẩn 27,5 kg' END)
    ON CONFLICT (facility_id, code) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_n := v_n + 1;
      IF p_bi_kg IS NOT NULL THEN INSERT INTO public.mix_pallet_logs (pallet_id, loai, bi_cu, bi_moi, ly_do, by_emp) VALUES (v_id, 'khai', NULL, p_bi_kg, 'tạo bộ pallet (bì chuẩn 27,5)', v_emp); END IF;
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN v_n;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_pallet_tao_bo(uuid, int, int, text, text, numeric) TO authenticated;

-- ─── 2) KHAI / CÂN LẠI: note chuẩn tự dọn ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mix_pallet_khai(p_id uuid, p_ten text DEFAULT NULL, p_code text DEFAULT NULL, p_bi_kg numeric DEFAULT NULL, p_ly_do text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; v_emp uuid := public.fn_nvl_emp_hien_tai(); v_code text; v_gan uuid;
BEGIN
  SELECT * INTO p FROM public.mix_pallets WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PALLET'; END IF;
  IF NOT public.fn_mix_duoc_ky('nhan_kho', p.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:so_pallet'; END IF;
  v_gan := public.fn_mix_pallet_phieu_dang_gan(p.id);

  -- chữ viết tắt
  IF p_code IS NOT NULL THEN
    v_code := upper(regexp_replace(btrim(p_code), '\s+', '', 'g'));
    IF v_code = '' THEN RAISE EXCEPTION 'THIEU_MA:chữ viết tắt trống'; END IF;
    IF v_code <> p.code THEN
      IF v_gan IS NOT NULL THEN RAISE EXCEPTION 'PALLET_DANG_O_DAY_CHUYEN:%:đổi chữ viết tắt sau khi trả phiếu', p.code; END IF;
      IF EXISTS (SELECT 1 FROM public.mix_pallets x WHERE x.facility_id = p.facility_id AND x.code = v_code AND x.id <> p.id) THEN RAISE EXCEPTION 'TRUNG_MA:%:đã có pallet mang chữ viết tắt này', v_code; END IF;
      INSERT INTO public.mix_pallet_logs (pallet_id, loai, code_cu, code_moi, ly_do, by_emp) VALUES (p.id, 'doi_ma', p.code, v_code, p_ly_do, v_emp);
      UPDATE public.mix_pallets SET code = v_code, so = COALESCE(NULLIF(regexp_replace(v_code, '\D', '', 'g'), '')::int, so) WHERE id = p.id;
    END IF;
  END IF;
  -- số kg (bì) — p21: note chuẩn ('Bì tạm theo nhóm…' p19 | 'Bì chuẩn…' p20) tự dọn khi đổi số;
  -- cân lại đúng 27,5 thì giữ/đặt lại note chuẩn, lệch chuẩn thì note xoá (UI gắn badge "lệch chuẩn")
  IF p_bi_kg IS NOT NULL THEN
    IF p_bi_kg <= 0 OR p_bi_kg >= 200 THEN RAISE EXCEPTION 'BI_KHONG_HOP_LE:% kg', p_bi_kg; END IF;
    IF p.bi_kg IS NULL OR abs(p.bi_kg - p_bi_kg) > 0.005 THEN
      INSERT INTO public.mix_pallet_logs (pallet_id, loai, bi_cu, bi_moi, ly_do, by_emp) VALUES (p.id, CASE WHEN p.bi_kg IS NULL THEN 'khai' ELSE 'can_lai' END, p.bi_kg, p_bi_kg, p_ly_do, v_emp);
      UPDATE public.mix_pallets SET bi_kg = p_bi_kg, bi_khai_at = now(), bi_khai_by = v_emp,
             note = CASE
                      WHEN p_bi_kg = 27.5 THEN 'Bì chuẩn 27,5 kg'
                      WHEN note LIKE 'Bì tạm theo nhóm%' OR note LIKE 'Bì chuẩn%' THEN NULL
                      ELSE note
                    END
       WHERE id = p.id;
    END IF;
  END IF;
  -- tên pallet
  IF p_ten IS NOT NULL AND COALESCE(p.ten, '') <> btrim(p_ten) THEN
    INSERT INTO public.mix_pallet_logs (pallet_id, loai, ly_do, by_emp) VALUES (p.id, 'sua_ten', COALESCE(p.ten, '') || ' → ' || btrim(p_ten), v_emp);
    UPDATE public.mix_pallets SET ten = NULLIF(btrim(p_ten), '') WHERE id = p.id;
  END IF;
  UPDATE public.mix_pallets SET updated_at = now() WHERE id = p.id;
  SELECT * INTO p FROM public.mix_pallets WHERE id = p.id;
  RETURN jsonb_build_object('id', p.id, 'code', p.code, 'ten', p.ten, 'bi_kg', p.bi_kg);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_pallet_khai(uuid, text, text, numeric, text) TO authenticated;

-- ─── 3) SỬA CÂN LÚC LẤY: giữ pallet khi gõ thẳng kg + check nhà máy ─────────
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
  IF v_pallet IS NOT NULL THEN
    -- p21: phiếu theo pallet HC — KHÔNG bao giờ gỡ pallet âm thầm. Bì từ Sổ pallet (pallet mới
    -- nếu đổi) hoặc bì đã chốt; gõ thẳng p_kg = kg hàng thật (gross bỏ trống), vẫn giữ pallet.
    SELECT * INTO pl FROM public.mix_pallets WHERE id = v_pallet FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PALLET'; END IF;
    IF pl.facility_id <> i.facility_id THEN RAISE EXCEPTION 'LO_KHAC_NHA_MAY:pallet % thuộc nhà máy khác', pl.code; END IF;
    IF v_pallet IS DISTINCT FROM i.pallet_id THEN
      IF NOT pl.is_active THEN RAISE EXCEPTION 'PALLET_TAT:%', pl.code; END IF;
      IF pl.bi_kg IS NULL THEN RAISE EXCEPTION 'PALLET_CHUA_BI:%', pl.code; END IF;
      v_gan := public.fn_mix_pallet_phieu_dang_gan(pl.id);
      IF v_gan IS NOT NULL AND v_gan <> i.id THEN RAISE EXCEPTION 'PALLET_DANG_O_DAY_CHUYEN:%:đang gắn phiếu khác', pl.code; END IF;
      v_bi := pl.bi_kg;
    ELSE
      v_bi := COALESCE(i.pallet_kg, pl.bi_kg);   -- giữ bì đã chốt lúc lấy
    END IF;
    IF p_kg IS NOT NULL THEN
      v_kg := p_kg; v_gross := NULL;             -- gõ thẳng kg hàng, không có số cân tổng
      IF v_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
    ELSE
      v_gross := COALESCE(p_gross_kg, i.gross_kg);
      IF v_gross IS NULL THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:gõ số trên cân (cả pallet)'; END IF;
      v_kg := round(v_gross - v_bi, 2);
      IF v_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:cân % kg không lớn hơn bì % kg', v_gross, v_bi; END IF;
    END IF;
    v_banh := COALESCE(p_so_banh, GREATEST(round(v_kg / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int, 1));
  ELSE
    -- đường cũ (phiếu không pallet HC): bì theo thứ tự gõ tay → bì đã khai lúc trả → chưa có; ước bớt 27,5 kg pallet chuẩn (p20)
    v_gross := p_gross_kg;
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

-- ─── 4) TRẢ: bàn giao phải giữ được pallet (bịt trả-lại-lần-2) ──────────────
CREATE OR REPLACE FUNCTION public.fn_mix_tra(
  p_issue_id uuid, p_kg_return numeric, p_handover boolean DEFAULT false, p_note text DEFAULT NULL, p_output_batch_id uuid DEFAULT NULL,
  p_shift_id uuid DEFAULT NULL, p_team text DEFAULT NULL, p_gross_kg numeric DEFAULT NULL, p_pallet_kg numeric DEFAULT NULL, p_so_banh_tra int DEFAULT NULL,
  p_dung_het boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; l record; v_kg numeric; v_bi numeric; v_out numeric; v_ton numeric; v_kpb numeric; v_emp uuid := public.fn_nvl_emp_hien_tai(); v_gan uuid; v_gan_code text;
BEGIN
  SELECT * INTO i FROM public.mix_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF i.status NOT IN ('issued', 'returned') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', i.code, i.status; END IF;
  IF NOT public.fn_mix_duoc_ky('khai_bao', i.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  IF i.shift_id IS NULL AND p_shift_id IS NULL THEN RAISE EXCEPTION 'THIEU_CA:%:phiếu bàn giao chưa có ca, chọn ca trước khi trả', i.code; END IF;
  SELECT * INTO l FROM public.mix_lots WHERE id = i.mix_lot_id FOR UPDATE;
  v_kpb := COALESCE(NULLIF(l.kg_per_banh, 0), 35);
  -- p21: bật "bàn giao ca sau" phải chắc pallet còn thuộc phiếu NÀY. Trả-không-bàn-giao nhả pallet;
  -- phiếu khác lấy pallet đó rồi mà phiếu cũ (returned) trả lại lần 2 bật bàn giao → trước đây 2 phiếu
  -- cùng giữ pallet, tới bước nhận kho vỡ unique index. Giờ chặn ngay tại đây.
  -- (Khoá SAU mix_lots để cùng thứ tự khoá lots→pallets với fn_mix_lay / fn_mix_ky — tránh deadlock.)
  IF COALESCE(p_handover, false) AND i.pallet_id IS NOT NULL THEN
    PERFORM 1 FROM public.mix_pallets WHERE id = i.pallet_id FOR UPDATE;
    v_gan := public.fn_mix_pallet_phieu_dang_gan(i.pallet_id);
    IF v_gan IS NOT NULL AND v_gan <> i.id THEN
      SELECT code INTO v_gan_code FROM public.mix_issues WHERE id = v_gan;
      RAISE EXCEPTION 'PALLET_DANG_O_DAY_CHUYEN:%:pallet đã sang phiếu %, không bàn giao kèm pallet được — bỏ tick bàn giao', i.code, v_gan_code;
    END IF;
  END IF;

  IF i.pallet_id IS NOT NULL THEN
    -- p19: bì đã chốt lúc lấy (Sổ pallet). Dùng hết → 0, không cân; còn dư → cân (hàng + pallet) − bì, hoặc gõ thẳng kg trả
    v_bi := COALESCE(i.pallet_kg, 0);
    IF COALESCE(p_dung_het, false) THEN v_kg := 0;
    ELSE v_kg := COALESCE(p_kg_return, CASE WHEN p_gross_kg IS NOT NULL THEN round(p_gross_kg - v_bi, 2) END);
    END IF;
    IF v_kg IS NULL OR v_kg < 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:%:gõ số trên cân (hàng còn + pallet) hoặc bấm Dùng hết', i.code; END IF;
    v_out := i.kg_out;   -- kg lấy đã là kg hàng thật, không tính lại
  ELSE
    -- đường cũ (p9 → p18): bì KHÔNG hỏi lúc lấy; khai ở lần trả (dùng hết → số trên cân = pallet rỗng; còn dư → gõ bì)
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
    v_out := CASE WHEN i.gross_kg IS NOT NULL THEN round(i.gross_kg - v_bi, 2) ELSE i.kg_out END;
    IF v_out <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:bì % kg lớn hơn cân lúc lấy % kg', v_bi, i.gross_kg; END IF;
  END IF;
  v_ton := l.kg_in - l.kg_used - (l.kg_at_line - i.kg_out);
  IF v_out > v_ton + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:lấy % > tồn %', l.code, v_out, round(v_ton, 2); END IF;
  IF v_kg > v_out + 0.01 THEN RAISE EXCEPTION 'TRA_QUA_LAY:%:trả % > lấy %', i.code, v_kg, v_out; END IF;

  UPDATE public.mix_lots SET kg_at_line = GREATEST(kg_at_line - i.kg_out + v_out, 0), updated_at = now() WHERE id = l.id;
  UPDATE public.mix_issues
     SET kg_out = v_out,
         pallet_kg = CASE WHEN i.pallet_id IS NULL AND i.gross_kg IS NOT NULL THEN v_bi ELSE pallet_kg END,
         out_kg_truoc = CASE WHEN abs(v_out - i.kg_out) > 0.005 THEN COALESCE(out_kg_truoc, i.kg_out) ELSE out_kg_truoc END,
         kg_return = v_kg, return_at = now(), return_by = v_emp, kg_used = round(v_out - v_kg, 2),
         return_gross_kg = CASE WHEN COALESCE(p_dung_het, false) THEN v_bi ELSE p_gross_kg END, return_pallet_kg = v_bi,
         so_banh = CASE WHEN i.pallet_id IS NULL AND NOT COALESCE(i.so_banh_tay, false) AND i.gross_kg IS NOT NULL THEN GREATEST(round(v_out / v_kpb)::int, 1) ELSE so_banh END,   -- đường cũ: số bành ước lúc lấy → tính lại theo kg lấy thật
         so_banh_tra = COALESCE(p_so_banh_tra, round(v_kg / v_kpb)::int), dung_het = COALESCE(p_dung_het, false),
         handover_to_next = COALESCE(p_handover, false) AND v_kg > 0, output_batch_id = COALESCE(p_output_batch_id, output_batch_id),
         shift_id = COALESCE(shift_id, p_shift_id), team = COALESCE(p_team, team),
         shift_date = CASE WHEN i.shift_id IS NULL AND p_shift_id IS NOT NULL THEN current_date ELSE shift_date END,
         note = COALESCE(p_note, note), status = 'returned', updated_at = now()
   WHERE id = i.id;
  RETURN jsonb_build_object('code', i.code, 'kg_out', v_out, 'kg_return', v_kg, 'kg_used', round(v_out - v_kg, 2), 'bi', v_bi);
END $$;

-- ─── 5) KÝ (receive): chốt chặn pallet trước khi mở phiếu bàn giao ──────────
CREATE OR REPLACE FUNCTION public.fn_mix_ky(p_issue_id uuid, p_buoc text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i       record;
  l       record;
  v_emp   uuid := public.fn_nvl_emp_hien_tai();
  v_thieu text;
  v_next  uuid;
  v_ton   numeric;
  v_gan   uuid;
  v_gan_code text;
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

      -- Bàn giao ca sau: phần còn lại ở lại dây chuyền = phiếu lấy mới (ca kế), cùng pallet HC + bì + vị trí + mã + lệnh (p19)
      IF i.handover_to_next AND COALESCE(i.kg_return, 0) > 0 THEN
        -- p21: chốt chặn cuối — pallet đã sang phiếu khác thì báo tiếng Việt, đừng chết bằng lỗi index 23505
        IF i.pallet_id IS NOT NULL THEN
          PERFORM 1 FROM public.mix_pallets WHERE id = i.pallet_id FOR UPDATE;
          v_gan := public.fn_mix_pallet_phieu_dang_gan(i.pallet_id);
          IF v_gan IS NOT NULL THEN
            SELECT code INTO v_gan_code FROM public.mix_issues WHERE id = v_gan;
            RAISE EXCEPTION 'PALLET_DANG_O_DAY_CHUYEN:%:pallet đang ở phiếu %, không mở phiếu bàn giao được — trả phiếu kia trước', i.code, v_gan_code;
          END IF;
        END IF;
        INSERT INTO public.mix_issues (code, facility_id, mix_lot_id, shift_date, shift_id, team, purpose, target_index, target_value,
                                       kg_out, out_by, production_order_id, handover_from_issue_id, note, created_by,
                                       pallet_id, pallet_kg, gross_kg, vi_tri, raw_lot_id, raw_lot_ids, lenh_id, so_banh)
        VALUES (public.fn_mix_ma('PC', i.facility_id), i.facility_id, i.mix_lot_id, i.shift_date, NULL, NULL, i.purpose, i.target_index, i.target_value,
                i.kg_return, v_emp, i.production_order_id, i.id, 'Bàn giao từ ' || i.code || ' (ca sau ghi lại ca / tổ)', v_emp,
                i.pallet_id, CASE WHEN i.pallet_id IS NULL THEN NULL ELSE i.pallet_kg END, CASE WHEN i.pallet_id IS NULL THEN NULL ELSE i.return_gross_kg END,
                i.vi_tri, i.raw_lot_id, i.raw_lot_ids, i.lenh_id, i.so_banh_tra)
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

-- Ghi chú chéo: luật "pallet đang gắn" sống ở fn_mix_pallet_phieu_dang_gan VÀ được chép trong
-- LATERAL của v_mix_pallets (p19 dòng 493) — sửa luật thì sửa CẢ HAI cùng một migration (C9).
COMMENT ON FUNCTION public.fn_mix_pallet_phieu_dang_gan(uuid) IS
  'Phiếu đang giữ pallet (issued, hoặc returned/submitted/qc_confirmed + handover). ⚠ v_mix_pallets chép lại luật này trong LATERAL — sửa thì sửa cả hai.';

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT (SELECT pg_get_function_arguments(oid) LIKE '%DEFAULT 27.5%' FROM pg_proc WHERE proname = 'fn_mix_pallet_tao_bo' AND pronamespace = 'public'::regnamespace) AS tao_bo_27_5,
       (SELECT prosrc LIKE '%Bì chuẩn%' FROM pg_proc WHERE proname = 'fn_mix_pallet_khai' AND pronamespace = 'public'::regnamespace) AS khai_note_p21,
       (SELECT prosrc LIKE '%KHÔNG bao giờ gỡ pallet%' FROM pg_proc WHERE proname = 'fn_mix_sua_lay' AND pronamespace = 'public'::regnamespace) AS sua_lay_p21,
       (SELECT prosrc LIKE '%không bàn giao kèm pallet%' FROM pg_proc WHERE proname = 'fn_mix_tra' AND pronamespace = 'public'::regnamespace) AS tra_p21,
       (SELECT prosrc LIKE '%không mở phiếu bàn giao được%' FROM pg_proc WHERE proname = 'fn_mix_ky' AND pronamespace = 'public'::regnamespace) AS ky_p21;
