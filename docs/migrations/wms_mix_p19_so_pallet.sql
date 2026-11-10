-- ============================================================
-- HÀNG CHÈN — p19: SỔ PALLET HÀNG CHÈN (10/11/2026, chủ DN: "khai báo sẵn pallet HC1→30, khai số kg sẵn" ·
--   "có Sổ pallet dùng cho hàng chèn: Khai báo pallet, chữ viết tắt, số Kg" · bì tạm: HC1→10 = 15 kg, HC11→20 = 25 kg)
--   · mix_pallets = Sổ pallet: ten (khai báo pallet) · code (chữ viết tắt, HC7) · bi_kg (số kg = BÌ pallet rỗng). Khai 1 lần,
--     cân lại / đổi chữ viết tắt / tắt-bật đều ghi mix_pallet_logs. Quyền ghi sổ: bước 3 nhận kho (thủ kho) hoặc BGĐ.
--   · Lúc lấy chạm pallet → fn_mix_lay(p_pallet_id): kg lấy = cân cả pallet − bì, CHỐT NGAY; phiếu chép bì vào pallet_kg
--     (cân lại bì sau đó không đổi phiếu đang mở). Số bành ước trên kg hàng thật, không trừ 15 kg ước lệ nữa.
--   · Lúc trả (phiếu có pallet): dùng hết = 0 kg, không cân; còn dư = cân 1 lần (hàng + pallet) − bì. BỎ cân 3 pallet rỗng.
--     Dùng hết + có pallet → ảnh lúc trả chỉ cần toàn cảnh (bì không cần ảnh chứng minh nữa). Phiếu cũ (pallet_id NULL) giữ v5.
--   · Một pallet chỉ ở dây chuyền trong MỘT phiếu (index partial trên status = 'issued'; phiếu bàn giao chưa nhận cũng tính).
--     Bàn giao ca sau: phiếu mới kế thừa pallet_id + bì + vị trí + mã + lệnh.
--   · Seed PĐ: HC1→HC20 (bì tạm 15 / 25, ghi rõ "chưa cân từng pallet"), HC21→HC30 tạo sẵn nhưng TẮT ("chưa đưa vào dùng").
-- Phụ thuộc: wms_mix_p18_gan_phieu_vao_lenh.sql (CHẠY SAU p18). Dữ liệu thử đã dọn bằng wms_don_du_lieu_hang_chen_261110.sql.
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── 1) SỔ PALLET ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mix_pallets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id   uuid NOT NULL REFERENCES public.facilities(id),
  code          text NOT NULL,                 -- chữ viết tắt in trên pallet: HC7
  so            int,                           -- số thứ tự để xếp lưới
  ten           text,                          -- khai báo pallet: "Pallet gỗ 1,1 m", "Pallet sắt"
  bi_kg         numeric(8,2),                  -- số kg = bì pallet rỗng; NULL = chưa khai → chưa lấy được
  bi_khai_at    timestamptz,
  bi_khai_by    uuid REFERENCES public.employees(id),
  is_active     boolean NOT NULL DEFAULT true, -- false = tắt (hỏng / chưa đưa vào dùng), không hiện ở màn lấy
  tat_ly_do     text,
  note          text,
  created_by    uuid REFERENCES public.employees(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mp_code_uniq UNIQUE (facility_id, code),
  CONSTRAINT mp_bi_chk CHECK (bi_kg IS NULL OR (bi_kg > 0 AND bi_kg < 200))
);
COMMENT ON TABLE public.mix_pallets IS 'Sổ pallet hàng chèn: khai báo pallet (ten) · chữ viết tắt (code) · số kg (bi_kg = bì pallet rỗng). p19, 10/11/2026.';

CREATE TABLE IF NOT EXISTS public.mix_pallet_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pallet_id   uuid NOT NULL REFERENCES public.mix_pallets(id) ON DELETE CASCADE,
  loai        text NOT NULL,                   -- khai | can_lai | doi_ma | sua_ten | tat | bat
  bi_cu       numeric(8,2),
  bi_moi      numeric(8,2),
  code_cu     text,
  code_moi    text,
  ly_do       text,
  at          timestamptz NOT NULL DEFAULT now(),
  by_emp      uuid REFERENCES public.employees(id)
);
CREATE INDEX IF NOT EXISTS mix_pallet_logs_pallet_idx ON public.mix_pallet_logs (pallet_id, at DESC);

ALTER TABLE public.mix_pallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mix_pallet_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY mp_select ON public.mix_pallets FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mpl_select ON public.mix_pallet_logs FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.mix_pallets, public.mix_pallet_logs TO authenticated;

-- ─── 2) PHIẾU CHÈN GẮN PALLET ───────────────────────────────────────────────
ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS pallet_id uuid REFERENCES public.mix_pallets(id);
COMMENT ON COLUMN public.mix_issues.pallet_id IS 'Pallet HC của lần chèn (Sổ pallet). NULL = băng tải hoặc phiếu trước p19. pallet_kg = bì CHỐT lúc lấy.';
CREATE UNIQUE INDEX IF NOT EXISTS mix_issues_pallet_issued_uniq ON public.mix_issues (pallet_id) WHERE status = 'issued' AND pallet_id IS NOT NULL;

-- phiếu đang giữ pallet: đang ở dây chuyền, hoặc đã trả "để lại dây chuyền cho ca sau" mà thủ kho chưa nhận
CREATE OR REPLACE FUNCTION public.fn_mix_pallet_phieu_dang_gan(p_pallet_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id FROM public.mix_issues i
   WHERE i.pallet_id = p_pallet_id
     AND (i.status = 'issued' OR (i.handover_to_next AND i.status IN ('returned', 'submitted', 'qc_confirmed')))
   ORDER BY i.out_at DESC LIMIT 1
$$;

-- ─── 3) GHI SỔ PALLET (thủ kho bước 3 hoặc BGĐ) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mix_pallet_tao_bo(p_facility_id uuid, p_tu int, p_den int, p_prefix text DEFAULT 'HC', p_ten text DEFAULT NULL, p_bi_kg numeric DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emp uuid := public.fn_nvl_emp_hien_tai(); v_n int := 0; i int; v_id uuid;
BEGIN
  IF NOT public.fn_mix_duoc_ky('nhan_kho', p_facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:so_pallet'; END IF;
  IF p_tu IS NULL OR p_den IS NULL OR p_tu < 1 OR p_den < p_tu OR p_den - p_tu > 200 THEN RAISE EXCEPTION 'SO_KHONG_HOP_LE:từ % đến %', p_tu, p_den; END IF;
  FOR i IN p_tu..p_den LOOP
    INSERT INTO public.mix_pallets (facility_id, code, so, ten, bi_kg, bi_khai_at, bi_khai_by, created_by)
    VALUES (p_facility_id, upper(COALESCE(p_prefix, 'HC')) || i, i, p_ten, p_bi_kg, CASE WHEN p_bi_kg IS NULL THEN NULL ELSE now() END, CASE WHEN p_bi_kg IS NULL THEN NULL ELSE v_emp END, v_emp)
    ON CONFLICT (facility_id, code) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_n := v_n + 1;
      IF p_bi_kg IS NOT NULL THEN INSERT INTO public.mix_pallet_logs (pallet_id, loai, bi_cu, bi_moi, ly_do, by_emp) VALUES (v_id, 'khai', NULL, p_bi_kg, 'tạo bộ pallet', v_emp); END IF;
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN v_n;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_pallet_tao_bo(uuid, int, int, text, text, numeric) TO authenticated;

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
  -- số kg (bì)
  IF p_bi_kg IS NOT NULL THEN
    IF p_bi_kg <= 0 OR p_bi_kg >= 200 THEN RAISE EXCEPTION 'BI_KHONG_HOP_LE:% kg', p_bi_kg; END IF;
    IF p.bi_kg IS NULL OR abs(p.bi_kg - p_bi_kg) > 0.005 THEN
      INSERT INTO public.mix_pallet_logs (pallet_id, loai, bi_cu, bi_moi, ly_do, by_emp) VALUES (p.id, CASE WHEN p.bi_kg IS NULL THEN 'khai' ELSE 'can_lai' END, p.bi_kg, p_bi_kg, p_ly_do, v_emp);
      UPDATE public.mix_pallets SET bi_kg = p_bi_kg, bi_khai_at = now(), bi_khai_by = v_emp,
             note = CASE WHEN p.bi_kg IS NOT NULL AND note LIKE 'Bì tạm theo nhóm%' THEN NULL ELSE note END WHERE id = p.id;   -- cân thật rồi thì bỏ ghi chú "bì tạm"
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

CREATE OR REPLACE FUNCTION public.fn_mix_pallet_tat(p_id uuid, p_tat boolean DEFAULT true, p_ly_do text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO p FROM public.mix_pallets WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PALLET'; END IF;
  IF NOT public.fn_mix_duoc_ky('nhan_kho', p.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:so_pallet'; END IF;
  IF p_tat AND public.fn_mix_pallet_phieu_dang_gan(p.id) IS NOT NULL THEN RAISE EXCEPTION 'PALLET_DANG_O_DAY_CHUYEN:%:trả phiếu rồi mới tắt được', p.code; END IF;
  IF p.is_active = NOT p_tat THEN RETURN; END IF;
  UPDATE public.mix_pallets SET is_active = NOT p_tat, tat_ly_do = CASE WHEN p_tat THEN p_ly_do ELSE NULL END, updated_at = now() WHERE id = p.id;
  INSERT INTO public.mix_pallet_logs (pallet_id, loai, ly_do, by_emp) VALUES (p.id, CASE WHEN p_tat THEN 'tat' ELSE 'bat' END, p_ly_do, v_emp);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_pallet_tat(uuid, boolean, text) TO authenticated;

-- ─── 4) LẤY: chạm pallet → bì từ sổ, kg lấy chốt ngay ──────────────────────
DROP FUNCTION IF EXISTS public.fn_mix_lay(uuid, numeric, date, uuid, text, text, text, numeric, uuid, text, uuid, uuid[], integer, numeric, numeric, text, text);
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
  -- số bành ước: có pallet HC (bì đã biết) hoặc gõ thẳng kg → theo kg hàng thật; cân tổng chưa bì (đường cũ) → ước bớt 15 kg pallet
  v_banh := COALESCE(p_so_banh, GREATEST(round(GREATEST(v_kg - CASE WHEN p_pallet_id IS NULL AND p_gross_kg IS NOT NULL AND p_pallet_kg IS NULL THEN 15 ELSE 0 END, 0) / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int, 1));

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

-- ─── 5) TRẢ v6: phiếu có pallet → bì từ phiếu, dùng hết không cân, còn dư cân 1 lần ──
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

-- ─── 6) SỬA CÂN LÚC LẤY: đổi pallet chạm nhầm, bì theo pallet ──────────────
DROP FUNCTION IF EXISTS public.fn_mix_sua_lay(uuid, numeric, numeric, numeric, integer, text);
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
    -- đường cũ: bì lấy theo thứ tự gõ tay → bì đã khai lúc trả → chưa có (chỉ cân tổng)
    v_pallet := NULL; v_gross := p_gross_kg;
    v_kg := COALESCE(p_kg, CASE WHEN p_gross_kg IS NOT NULL THEN round(p_gross_kg - COALESCE(p_pallet_kg, i.return_pallet_kg, 0), 2) END);
    IF v_kg IS NULL OR v_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
    v_bi := CASE WHEN p_gross_kg IS NULL THEN NULL ELSE COALESCE(p_pallet_kg, i.return_pallet_kg) END;
    v_banh := COALESCE(p_so_banh, GREATEST(round(GREATEST(v_kg - CASE WHEN p_gross_kg IS NOT NULL AND COALESCE(p_pallet_kg, i.return_pallet_kg) IS NULL THEN 15 ELSE 0 END, 0) / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int, 1));
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

-- ─── 7) KÝ: bàn giao ca sau kế thừa pallet + bì + vị trí + mã + lệnh ───────
CREATE OR REPLACE FUNCTION public.fn_mix_ky(p_issue_id uuid, p_buoc text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

      -- Bàn giao ca sau: phần còn lại ở lại dây chuyền = phiếu lấy mới (ca kế), cùng pallet HC + bì + vị trí + mã + lệnh (p19)
      IF i.handover_to_next AND COALESCE(i.kg_return, 0) > 0 THEN
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

-- ─── 8) ẢNH: dùng hết + có pallet → lần trả chỉ cần toàn cảnh ───────────────
CREATE OR REPLACE FUNCTION public.fn_mix_thieu_anh(p_issue_id uuid, p_facility_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.raw_settings; k text; v_ref text; v_pallet uuid; v_dung_het boolean;
BEGIN
  s := public.fn_raw_setting(p_facility_id);
  SELECT pallet_id, dung_het INTO v_pallet, v_dung_het FROM public.mix_issues WHERE id = p_issue_id;
  FOREACH v_ref IN ARRAY ARRAY['mix_issue_out', 'mix_issue_return'] LOOP
    FOR k IN SELECT jsonb_array_elements_text(s.anh_bat_buoc) LOOP
      -- p19: pallet HC dùng hết → không cân lúc trả → không cần ảnh màn hình cân (bì đã khai trong Sổ pallet)
      IF v_ref = 'mix_issue_return' AND v_pallet IS NOT NULL AND COALESCE(v_dung_het, false) AND k = 'man_hinh_can' THEN CONTINUE; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.raw_photos p WHERE p.ref_type = v_ref AND p.ref_id = p_issue_id AND p.kind = k) THEN
        RETURN v_ref || ':' || k;
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END $$;

-- ─── 9) VIEW ────────────────────────────────────────────────────────────────
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
       (SELECT string_agg(r2.ma, ' + ' ORDER BY r2.ma) FROM unnest(i.raw_lot_ids) x JOIN public.raw_lots r2 ON r2.id = x) AS ma_goc_all,
       COALESCE(NULLIF(l.kg_per_banh, 0), 35) AS lot_kg_per_banh,
       ee.full_name AS out_edit_name,
       g.code AS lenh_code, g.ma_gop AS lenh_ma_gop,
       mp.code AS pallet_code, mp.ten AS pallet_ten
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
LEFT JOIN public.employees ee ON ee.id = i.out_edit_by
LEFT JOIN public.raw_lots rl ON rl.id = i.raw_lot_id
LEFT JOIN public.nvl_lenh_chay g ON g.id = i.lenh_id
LEFT JOIN public.mix_pallets mp ON mp.id = i.pallet_id;
ALTER VIEW public.v_mix_issues SET (security_invoker = on);
GRANT SELECT ON public.v_mix_issues TO authenticated;

CREATE OR REPLACE VIEW public.v_mix_pallets AS
SELECT p.*, f.code AS facility_code, e.full_name AS bi_khai_name,
       CASE WHEN NOT p.is_active THEN 'tat' WHEN p.bi_kg IS NULL THEN 'chua_bi' WHEN x.id IS NOT NULL THEN 'day_chuyen' ELSE 'trong' END AS trang_thai,
       x.id AS issue_id, x.code AS issue_code, x.kg_out AS issue_kg_out, x.out_at AS issue_out_at, x.status AS issue_status, x.vi_tri AS issue_vi_tri,
       l.so_lo AS issue_lot_so_lo, l.code AS issue_lot_code, g.ma_gop AS issue_lenh_ma_gop,
       CASE WHEN p.bi_khai_at IS NULL THEN NULL ELSE (current_date - p.bi_khai_at::date) END AS bi_cu_ngay,
       (SELECT count(*) FROM public.mix_pallet_logs lg WHERE lg.pallet_id = p.id AND lg.loai = 'can_lai')::int AS so_lan_can_lai
FROM public.mix_pallets p
LEFT JOIN public.facilities f ON f.id = p.facility_id
LEFT JOIN public.employees e ON e.id = p.bi_khai_by
LEFT JOIN LATERAL (SELECT i.* FROM public.mix_issues i WHERE i.pallet_id = p.id
                    AND (i.status = 'issued' OR (i.handover_to_next AND i.status IN ('returned', 'submitted', 'qc_confirmed')))
                   ORDER BY i.out_at DESC LIMIT 1) x ON true
LEFT JOIN public.mix_lots l ON l.id = x.mix_lot_id
LEFT JOIN public.nvl_lenh_chay g ON g.id = x.lenh_id;
ALTER VIEW public.v_mix_pallets SET (security_invoker = on);
GRANT SELECT ON public.v_mix_pallets TO authenticated;

CREATE OR REPLACE VIEW public.v_mix_pallet_logs AS
SELECT lg.*, p.code AS pallet_code, p.facility_id, e.full_name AS by_name
FROM public.mix_pallet_logs lg JOIN public.mix_pallets p ON p.id = lg.pallet_id LEFT JOIN public.employees e ON e.id = lg.by_emp;
ALTER VIEW public.v_mix_pallet_logs SET (security_invoker = on);
GRANT SELECT ON public.v_mix_pallet_logs TO authenticated;

-- ─── 10) SEED PHONG ĐIỀN: HC1→10 = 15 kg, HC11→20 = 25 kg (bì tạm), HC21→30 tắt ─
INSERT INTO public.mix_pallets (facility_id, code, so, ten, bi_kg, bi_khai_at, is_active, tat_ly_do, note)
SELECT f.id, 'HC' || n, n, 'Pallet hàng chèn',
       CASE WHEN n <= 10 THEN 15 WHEN n <= 20 THEN 25 END,
       CASE WHEN n <= 20 THEN now() END,
       n <= 20,
       CASE WHEN n > 20 THEN 'chưa đưa vào dùng' END,
       CASE WHEN n <= 20 THEN 'Bì tạm theo nhóm (chủ DN 10/11/2026), chưa cân từng pallet' END
FROM public.facilities f CROSS JOIN generate_series(1, 30) n
WHERE f.code = 'PD'
ON CONFLICT (facility_id, code) DO NOTHING;
INSERT INTO public.mix_pallet_logs (pallet_id, loai, bi_cu, bi_moi, ly_do)
SELECT p.id, 'khai', NULL, p.bi_kg, 'Bì tạm theo nhóm, chủ DN 10/11/2026 (HC1→10 = 15 kg, HC11→20 = 25 kg)'
  FROM public.mix_pallets p WHERE p.bi_kg IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.mix_pallet_logs g WHERE g.pallet_id = p.id);

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT (SELECT count(*) FROM public.mix_pallets) AS so_pallet,
       (SELECT count(*) FROM public.mix_pallets WHERE is_active AND bi_kg = 15) AS bi_15,
       (SELECT count(*) FROM public.mix_pallets WHERE is_active AND bi_kg = 25) AS bi_25,
       (SELECT count(*) FROM public.mix_pallets WHERE NOT is_active) AS tat,
       (SELECT count(*) FROM pg_proc WHERE proname = 'fn_mix_lay' AND pronamespace = 'public'::regnamespace) AS so_ban_fn_mix_lay_phai_la_1,
       (SELECT count(*) FROM pg_proc WHERE proname = 'fn_mix_sua_lay' AND pronamespace = 'public'::regnamespace) AS so_ban_fn_mix_sua_lay_phai_la_1,
       (SELECT count(*) FROM information_schema.columns WHERE table_name = 'v_mix_issues' AND column_name IN ('pallet_id', 'pallet_code')) AS cot_view_phai_la_2,
       (SELECT prosrc LIKE '%p19%' FROM pg_proc WHERE proname = 'fn_mix_tra' AND pronamespace = 'public'::regnamespace) AS tra_v6;
