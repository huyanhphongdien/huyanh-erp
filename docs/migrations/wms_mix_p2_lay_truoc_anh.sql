-- ============================================================
-- HÀNG CHÈN — GĐ4b: màn điện thoại theo mockup 30/10 (chụp ảnh NGAY trong lúc lấy)
-- Ngày: 2026-10-30
-- Phụ thuộc: wms_mix_p1_hang_chen.sql
--
-- Màn "Lấy đầu ca" 3 bước chụp 2 ảnh ở bước 2, TRƯỚC khi phiếu được ghi (bước 3).
-- Ảnh cần ref_id ⇒ điện thoại sinh sẵn uuid cho phiếu, tải ảnh với ref_id đó, rồi gọi
-- fn_mix_lay(..., p_id := uuid đó). Hàm nhận thêm tham số p_id (NULL = tự sinh như cũ).
--
-- ⚠ Đổi chữ ký hàm ⇒ phải DROP bản cũ trước, nếu không PostgREST thấy 2 bản chồng nhau.
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

DROP FUNCTION IF EXISTS public.fn_mix_lay(uuid, numeric, date, uuid, text, text, text, numeric, uuid, text);

CREATE OR REPLACE FUNCTION public.fn_mix_lay(
  p_lot_id uuid, p_kg numeric, p_shift_date date DEFAULT current_date, p_shift_id uuid DEFAULT NULL, p_team text DEFAULT NULL,
  p_purpose text DEFAULT 'chay_lai', p_target_index text DEFAULT NULL, p_target_value numeric DEFAULT NULL,
  p_production_order_id uuid DEFAULT NULL, p_note text DEFAULT NULL, p_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_ton numeric; v_id uuid; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO l FROM public.mix_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF NOT public.fn_nvl_duoc_ky('submit', l.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  IF l.status IN ('depleted', 'cancelled') THEN RAISE EXCEPTION 'LO_DA_HET:%', l.code; END IF;
  IF l.source_type = 'dkl' AND NOT l.metal_cleared THEN RAISE EXCEPTION 'DKL_CHUA_XU_LY:%', l.code; END IF;
  IF p_kg IS NULL OR p_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  IF p_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.mix_issues WHERE id = p_id) THEN RAISE EXCEPTION 'DA_GHI_SO:phiếu đã ghi rồi'; END IF;
  v_ton := l.kg_in - l.kg_used - l.kg_at_line;
  IF p_kg > v_ton + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:lấy % > tồn %', l.code, p_kg, v_ton; END IF;

  INSERT INTO public.mix_issues (id, code, facility_id, mix_lot_id, shift_date, shift_id, team, purpose, target_index, target_value,
                                 kg_out, out_by, production_order_id, note, created_by)
  VALUES (COALESCE(p_id, gen_random_uuid()), public.fn_mix_ma('PC', l.facility_id), l.facility_id, l.id, COALESCE(p_shift_date, current_date), p_shift_id, p_team,
          COALESCE(p_purpose, 'chay_lai'), p_target_index, p_target_value, p_kg, v_emp, p_production_order_id, p_note, v_emp)
  RETURNING id INTO v_id;

  UPDATE public.mix_lots SET kg_at_line = kg_at_line + p_kg, status = 'in_use', updated_at = now() WHERE id = l.id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_mix_lay(uuid, numeric, date, uuid, text, text, text, numeric, uuid, text, uuid) TO authenticated;

-- Dọn ảnh mồ côi: ảnh phiếu chèn mà phiếu không bao giờ được ghi (người dùng bỏ dở), cũ hơn 2 ngày
CREATE OR REPLACE FUNCTION public.fn_mix_don_anh_mo_coi()
RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (
    DELETE FROM public.raw_photos p
     WHERE p.ref_type IN ('mix_issue_out', 'mix_issue_return')
       AND p.created_at < now() - interval '2 days'
       AND NOT EXISTS (SELECT 1 FROM public.mix_issues i WHERE i.id = p.ref_id)
    RETURNING 1)
  SELECT count(*)::int FROM d
$$;
GRANT EXECUTE ON FUNCTION public.fn_mix_don_anh_mo_coi() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT to_regprocedure('public.fn_mix_lay(uuid,numeric,date,uuid,text,text,text,numeric,uuid,text,uuid)') AS f_moi,
       to_regprocedure('public.fn_mix_lay(uuid,numeric,date,uuid,text,text,text,numeric,uuid,text)') AS f_cu_phai_null;
