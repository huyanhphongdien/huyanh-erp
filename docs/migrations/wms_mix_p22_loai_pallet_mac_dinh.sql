-- ============================================================
-- HÀNG CHÈN — p22: 5 LOẠI PALLET MẶC ĐỊNH THEO GIẤY CÂN TAY (18/11/2026)
--   Giấy cân tay của kho (ảnh chụp 18/11): H1 11,5 · H2 14,5 · EJ 15 · H3 13,5 · H4 25 kg — H4 là pallet SẮT
--   (chữ "sắt" viết tay, không phải "sai"). Thay quyết định "bì chuẩn 27,5 kg cho mọi pallet HC" (p20, 17/11):
--     · Phong Điền: XOÁ HC1→HC30 (chưa phiếu nào dùng — kiểm lại bằng NOT EXISTS), nạp 5 pallet H1,H2,EJ,H3,H4
--       với đúng số kg trên. User chốt 18/11: "Sổ còn 5 loại pallet thôi" → HC21→HC30 (đang tắt) cũng xoá.
--     · fn_mix_pallet_nap_mac_dinh(facility): nút "Nạp 5 loại mặc định" cho nhà máy khác (Tân Lâm / Lào) —
--       chạy lại nhiều lần vẫn an toàn (mã đã có thì bỏ qua). KHÔNG tự nạp cho TL / Lào: hai nơi này chưa có sổ.
--     · fn_mix_pallet_tao_bo: bỏ mặc định 27,5 (số kg phải gõ rõ khi tạo dải HCn…); fn_mix_pallet_khai: bỏ
--       nhánh "= 27,5 thì ghi Bì chuẩn" — note mặc định tự xoá khi cân lại ra số khác.
--   KHÔNG đổi: đường cũ (phiếu không chọn pallet) vẫn ước bớt 27,5 kg ở fn_mix_lay / fn_mix_sua_lay (p20/p21).
-- ⚠ Danh sách 5 loại nằm ở fn_mix_pallet_nap_mac_dinh_core VÀ chép ở mixService.ts (MIX_PALLET_MAC_DINH) — sửa thì sửa cả hai.
-- ⚠ agent_sql: KHÔNG BEGIN/COMMIT; DELETE phải có WHERE. Idempotent.
-- ============================================================

-- ─── 1) HÀM LÕI: nạp 5 loại mặc định (không kiểm quyền — chỉ gọi từ hàm có kiểm quyền / migration) ───
CREATE OR REPLACE FUNCTION public.fn_mix_pallet_nap_mac_dinh_core(p_facility_id uuid, p_emp uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_id uuid; v_n int := 0;
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('H1', 1, 'Pallet H1',     11.5::numeric),
      ('H2', 2, 'Pallet H2',     14.5::numeric),
      ('EJ', 3, 'Pallet EJ',     15::numeric),
      ('H3', 4, 'Pallet H3',     13.5::numeric),
      ('H4', 5, 'Pallet sắt H4', 25::numeric)
    ) AS t(code, so, ten, bi_kg)
  LOOP
    INSERT INTO public.mix_pallets (facility_id, code, so, ten, bi_kg, bi_khai_at, bi_khai_by, created_by, note)
    VALUES (p_facility_id, r.code, r.so, r.ten, r.bi_kg, now(), p_emp, p_emp, 'Số kg mặc định theo giấy cân tay 18/11/2026')
    ON CONFLICT (facility_id, code) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN
      v_n := v_n + 1;
      INSERT INTO public.mix_pallet_logs (pallet_id, loai, bi_cu, bi_moi, ly_do, by_emp)
      VALUES (v_id, 'khai', NULL, r.bi_kg, 'loại pallet mặc định (giấy cân tay 18/11/2026)', p_emp);
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.fn_mix_pallet_nap_mac_dinh_core(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ─── 2) HÀM CÔNG KHAI: thủ kho (bước 3) hoặc BGĐ bấm "Nạp 5 loại mặc định" ───
CREATE OR REPLACE FUNCTION public.fn_mix_pallet_nap_mac_dinh(p_facility_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  IF NOT public.fn_mix_duoc_ky('nhan_kho', p_facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:so_pallet'; END IF;
  RETURN public.fn_mix_pallet_nap_mac_dinh_core(p_facility_id, v_emp);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_pallet_nap_mac_dinh(uuid) TO authenticated;

-- ─── 3) TẠO DẢI HCn: bỏ mặc định 27,5 ───
DROP FUNCTION IF EXISTS public.fn_mix_pallet_tao_bo(uuid, int, int, text, text, numeric);
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
      IF p_bi_kg IS NOT NULL THEN INSERT INTO public.mix_pallet_logs (pallet_id, loai, bi_cu, bi_moi, ly_do, by_emp) VALUES (v_id, 'khai', NULL, p_bi_kg, 'tạo dải pallet', v_emp); END IF;
    END IF;
    v_id := NULL;
  END LOOP;
  RETURN v_n;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_pallet_tao_bo(uuid, int, int, text, text, numeric) TO authenticated;

-- ─── 4) KHAI / CÂN LẠI: bỏ nhánh 27,5; note mặc định tự xoá khi đổi số ───
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
  -- số kg (bì) — p22: số kg riêng từng pallet; note mặc định ('Số kg mặc định…' p22 | 'Bì chuẩn…' p20 | 'Bì tạm…' p19) tự xoá khi đổi số
  IF p_bi_kg IS NOT NULL THEN
    IF p_bi_kg <= 0 OR p_bi_kg >= 200 THEN RAISE EXCEPTION 'BI_KHONG_HOP_LE:% kg', p_bi_kg; END IF;
    IF p.bi_kg IS NULL OR abs(p.bi_kg - p_bi_kg) > 0.005 THEN
      INSERT INTO public.mix_pallet_logs (pallet_id, loai, bi_cu, bi_moi, ly_do, by_emp) VALUES (p.id, CASE WHEN p.bi_kg IS NULL THEN 'khai' ELSE 'can_lai' END, p.bi_kg, p_bi_kg, p_ly_do, v_emp);
      UPDATE public.mix_pallets SET bi_kg = p_bi_kg, bi_khai_at = now(), bi_khai_by = v_emp,
             note = CASE
                      WHEN note LIKE 'Số kg mặc định%' OR note LIKE 'Bì tạm theo nhóm%' OR note LIKE 'Bì chuẩn%' THEN NULL
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

-- ─── 5) PHONG ĐIỀN: xoá HC1→HC30 (chỉ khi chưa phiếu nào tham chiếu) rồi nạp 5 loại mặc định ───
DELETE FROM public.mix_pallets p
 USING public.facilities f
 WHERE f.id = p.facility_id AND f.code = 'PD'
   AND p.code ~ '^HC([1-9]|[12][0-9]|30)$'
   AND NOT EXISTS (SELECT 1 FROM public.mix_issues i WHERE i.pallet_id = p.id);

SELECT public.fn_mix_pallet_nap_mac_dinh_core(f.id, NULL) AS so_pallet_nap_moi FROM public.facilities f WHERE f.code = 'PD';

COMMENT ON TABLE public.mix_pallets IS 'Sổ pallet hàng chèn: khai báo pallet (ten) · chữ viết tắt (code) · số kg (bi_kg = bì pallet rỗng, MỖI PALLET MỘT SỐ — 5 loại mặc định H1 11,5 · H2 14,5 · EJ 15 · H3 13,5 · H4 25 sắt, từ 18/11/2026). p19/p20/p22.';

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT (SELECT count(*) FROM public.mix_pallets p JOIN public.facilities f ON f.id = p.facility_id WHERE f.code = 'PD' AND p.is_active) AS pd_dang_dung_phai_la_5,
       (SELECT count(*) FROM public.mix_pallets p JOIN public.facilities f ON f.id = p.facility_id WHERE f.code = 'PD' AND p.code ~ '^HC([1-9]|[12][0-9]|30)$') AS hc1_30_phai_la_0,
       (SELECT count(*) FROM public.mix_pallets p JOIN public.facilities f ON f.id = p.facility_id WHERE f.code = 'PD' AND NOT p.is_active) AS pallet_tat_phai_la_0,
       (SELECT string_agg(p.code || '=' || p.bi_kg::text, ' · ' ORDER BY p.so) FROM public.mix_pallets p JOIN public.facilities f ON f.id = p.facility_id WHERE f.code = 'PD' AND p.is_active) AS bang_5_loai;
