-- ============================================================
-- HÀNG CHÈN — p18: PHIẾU LẤY TRƯỚC KHI KHAI LỆNH (31/10/2026, chủ DN: "chưa tạo được lần chèn từ mã hàng TMHG-40")
--   · Tổ lấy 2 pallet lúc 00:14, 00:16; chủ DN khai lệnh TMHG-40 lúc 00:21 → 2 phiếu nằm ở "chưa gắn mã".
--   · fn_nvl_bat_dau_lenh: khai lệnh mà sau đó là lệnh DUY NHẤT đang chạy → tự gắn phiếu chưa mã (12 giờ qua, chưa nhận) vào lệnh, trả về da_gan
--   · fn_mix_doi_ma_goc: QS khai báo / thủ kho nhận cũng đổi mã được (nút "Gắn vào lệnh" trên điện thoại khi nhiều lệnh song song)
-- Ngày: 2026-10-31 · Phụ thuộc: wms_mix_p17_chen_bang_tai.sql (CHẠY SAU p17)
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_nvl_bat_dau_lenh(p_raw_lot_ids uuid[], p_thay_the boolean DEFAULT true, p_gop_vao uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids uuid[]; v_fac uuid; v_emp uuid := public.fn_nvl_emp_hien_tai(); g record; v_id uuid; v_code text; v_gop text; v_thay text[] := ARRAY[]::text[]; v_moi uuid[]; v_gan int := 0;
BEGIN
  v_ids := (SELECT array_agg(DISTINCT i ORDER BY i) FROM unnest(COALESCE(p_raw_lot_ids, ARRAY[]::uuid[])) i WHERE i IS NOT NULL);
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN RAISE EXCEPTION 'THIEU_MA_LENH:chọn ít nhất một mã nguyên liệu'; END IF;
  IF (SELECT count(*) FROM public.raw_lots rl WHERE rl.id = ANY(v_ids)) <> cardinality(v_ids) THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF (SELECT count(DISTINCT rl.facility_id) FROM public.raw_lots rl WHERE rl.id = ANY(v_ids)) <> 1 THEN RAISE EXCEPTION 'LO_KHAC_NHA_MAY:các mã trong một lệnh phải cùng nhà máy'; END IF;
  IF EXISTS (SELECT 1 FROM public.raw_lots rl WHERE rl.id = ANY(v_ids) AND rl.status = 'huy') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:mã đã hủy'; END IF;
  SELECT rl.facility_id INTO v_fac FROM public.raw_lots rl WHERE rl.id = v_ids[1];
  IF NOT (public.fn_mix_duoc_ky('khai_bao', v_fac) OR public.fn_nvl_duoc_ky('receive', v_fac)) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:bat_dau_lenh'; END IF;
  v_gop := public.fn_nvl_lenh_ma_gop(v_ids);

  -- gộp thêm mã vào lệnh đang chạy (KHMN-15 đang chạy, thêm 17 → lệnh 15 + 17)
  IF p_gop_vao IS NOT NULL THEN
    SELECT * INTO g FROM public.nvl_lenh_chay WHERE id = p_gop_vao FOR UPDATE;
    IF NOT FOUND OR g.ended_at IS NOT NULL OR g.facility_id <> v_fac THEN RAISE EXCEPTION 'SAI_TRANG_THAI:lệnh không còn chạy hoặc khác nhà máy'; END IF;
    v_moi := (SELECT array_agg(i) FROM unnest(v_ids) i WHERE NOT (i = ANY(g.raw_lot_ids)));
    IF v_moi IS NULL THEN RETURN jsonb_build_object('lenh_id', g.id, 'code', g.code, 'ma_gop', g.ma_gop, 'da_chay', true, 'gop', true, 'da_thay', '[]'::jsonb); END IF;
    IF EXISTS (SELECT 1 FROM public.raw_lot_runs r WHERE r.raw_lot_id = ANY(v_moi) AND r.ended_at IS NULL AND r.lenh_id IS DISTINCT FROM g.id) THEN
      RAISE EXCEPTION 'MA_DANG_CHAY_LENH_KHAC:mã đang nằm trong lệnh khác — kết thúc lệnh đó trước';
    END IF;
    UPDATE public.nvl_lenh_chay SET raw_lot_ids = g.raw_lot_ids || v_moi, ma_gop = public.fn_nvl_lenh_ma_gop(g.raw_lot_ids || v_moi), note = COALESCE(p_note, note) WHERE id = g.id;
    INSERT INTO public.raw_lot_runs (facility_id, raw_lot_id, started_by, note, lenh_id) SELECT v_fac, i, v_emp, 'gộp vào ' || g.code, g.id FROM unnest(v_moi) i;
    UPDATE public.raw_lots SET status = 'mo' WHERE id = ANY(v_moi) AND status = 'dong';
    RETURN jsonb_build_object('lenh_id', g.id, 'code', g.code, 'ma_gop', public.fn_nvl_lenh_ma_gop(g.raw_lot_ids || v_moi), 'da_chay', false, 'gop', true, 'da_thay', '[]'::jsonb);
  END IF;

  -- lệnh đang chạy đúng bộ mã này → không tạo trùng
  SELECT * INTO g FROM public.nvl_lenh_chay WHERE facility_id = v_fac AND ended_at IS NULL AND raw_lot_ids @> v_ids AND raw_lot_ids <@ v_ids ORDER BY started_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('lenh_id', g.id, 'code', g.code, 'ma_gop', g.ma_gop, 'da_chay', true, 'gop', false, 'da_thay', '[]'::jsonb); END IF;

  IF COALESCE(p_thay_the, true) THEN
    -- mặc định THAY THẾ: kết thúc mọi lệnh đang chạy của nhà máy (chủ DN 30/10)
    WITH u AS (UPDATE public.nvl_lenh_chay x SET ended_at = now(), ended_by = v_emp, note = concat_ws(' · ', x.note, 'thay bằng ' || v_gop)
                WHERE x.facility_id = v_fac AND x.ended_at IS NULL RETURNING x.ma_gop)
    SELECT COALESCE(array_agg(u.ma_gop), ARRAY[]::text[]) INTO v_thay FROM u;
    UPDATE public.raw_lot_runs SET ended_at = now(), ended_by = v_emp WHERE facility_id = v_fac AND ended_at IS NULL;
  ELSIF EXISTS (SELECT 1 FROM public.raw_lot_runs r WHERE r.facility_id = v_fac AND r.raw_lot_id = ANY(v_ids) AND r.ended_at IS NULL) THEN
    RAISE EXCEPTION 'MA_DANG_CHAY_LENH_KHAC:mã đang nằm trong lệnh khác — gộp vào lệnh đó hoặc chọn thay thế';
  END IF;

  v_code := public.fn_nvl_lenh_ma(v_fac);
  INSERT INTO public.nvl_lenh_chay (facility_id, code, raw_lot_ids, ma_gop, started_by, note) VALUES (v_fac, v_code, v_ids, v_gop, v_emp, p_note) RETURNING id INTO v_id;
  INSERT INTO public.raw_lot_runs (facility_id, raw_lot_id, started_by, note, lenh_id) SELECT v_fac, i, v_emp, p_note, v_id FROM unnest(v_ids) i;
  UPDATE public.raw_lots SET status = 'mo' WHERE id = ANY(v_ids) AND status = 'dong';
  -- phiếu chèn lấy TRƯỚC khi khai lệnh (chưa gắn mã, 12 giờ qua, chưa nhận) → gắn vào lệnh mới nếu đây là lệnh DUY NHẤT đang chạy
  IF (SELECT count(*) FROM public.nvl_lenh_chay WHERE facility_id = v_fac AND ended_at IS NULL) = 1 THEN
    UPDATE public.mix_issues SET raw_lot_id = v_ids[1], raw_lot_ids = v_ids, lenh_id = v_id, updated_at = now()
     WHERE facility_id = v_fac AND raw_lot_id IS NULL AND lenh_id IS NULL AND status NOT IN ('received', 'cancelled') AND out_at >= now() - interval '12 hours';
    GET DIAGNOSTICS v_gan = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('lenh_id', v_id, 'code', v_code, 'ma_gop', v_gop, 'da_chay', false, 'gop', false, 'da_thay', to_jsonb(v_thay), 'da_gan', v_gan);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_bat_dau_lenh(uuid[], boolean, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_mix_doi_ma_goc(p_issue_id uuid, p_raw_lot_ids uuid[], p_vi_tri text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; v_ids uuid[];
BEGIN
  SELECT * INTO i FROM public.mix_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF i.status IN ('received', 'cancelled') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', i.code, i.status; END IF;
  IF NOT (public.fn_mix_duoc_ky('khai_bao', i.facility_id) OR public.fn_mix_duoc_ky('nhan_kho', i.facility_id) OR public.fn_nvl_duoc_ky('submit', i.facility_id)) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:doi_ma'; END IF;   -- QS khai báo / thủ kho nhận / luật NVL cũ
  v_ids := (SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(p_raw_lot_ids, ARRAY[]::uuid[])) x WHERE x IS NOT NULL);
  IF v_ids IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(v_ids) x LEFT JOIN public.raw_lots rl ON rl.id = x WHERE rl.id IS NULL OR rl.facility_id <> i.facility_id) THEN RAISE EXCEPTION 'LO_KHAC_NHA_MAY:mã gốc'; END IF;
  UPDATE public.mix_issues SET raw_lot_ids = v_ids, raw_lot_id = CASE WHEN v_ids IS NULL THEN NULL ELSE v_ids[1] END, vi_tri = COALESCE(p_vi_tri, vi_tri),
         lenh_id = CASE WHEN v_ids IS NULL THEN NULL ELSE public.fn_nvl_lenh_cua_ma(i.facility_id, v_ids, i.out_at) END, updated_at = now() WHERE id = i.id;
END $$;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT (SELECT prosrc LIKE '%da_gan%' FROM pg_proc WHERE proname = 'fn_nvl_bat_dau_lenh' AND pronamespace = 'public'::regnamespace) AS bat_dau_tu_gan,
       (SELECT prosrc LIKE '%doi_ma%' FROM pg_proc WHERE proname = 'fn_mix_doi_ma_goc' AND pronamespace = 'public'::regnamespace) AS doi_ma_qs;
