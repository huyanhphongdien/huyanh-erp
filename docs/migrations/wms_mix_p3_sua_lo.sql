-- ============================================================
-- HÀNG CHÈN — GĐ4c: sửa lô chèn từ điện thoại (đánh dấu đã xử lý kim loại, QC cho phép, hủy lô trống)
-- Ngày: 2026-10-30 · Phụ thuộc: wms_mix_p1_hang_chen.sql
-- mix_lots chỉ cho BGĐ ghi thẳng (RLS); thủ kho / QC sửa qua hàm này.
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_mix_sua_lo(
  p_lot_id uuid, p_metal_cleared boolean DEFAULT NULL, p_qc_allow_rerun boolean DEFAULT NULL, p_qc_allow_mix_pct numeric DEFAULT NULL,
  p_source_desc text DEFAULT NULL, p_grade text DEFAULT NULL, p_note text DEFAULT NULL, p_huy boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; q json;
BEGIN
  SELECT * INTO l FROM public.mix_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  q := public.fn_nvl_quyen(l.facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kho_chen'; END IF;
  IF l.status = 'cancelled' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:đã hủy', l.code; END IF;

  IF COALESCE(p_huy, false) THEN
    IF l.kg_used > 0.005 OR l.kg_at_line > 0.005 THEN RAISE EXCEPTION 'DA_TRU_SO:%:lô đã có phiếu lấy, không hủy được', l.code; END IF;
    UPDATE public.mix_lots SET status = 'cancelled', note = COALESCE(p_note, note), updated_at = now() WHERE id = l.id;
    RETURN;
  END IF;

  UPDATE public.mix_lots
     SET metal_cleared    = COALESCE(p_metal_cleared, metal_cleared),
         qc_allow_rerun   = COALESCE(p_qc_allow_rerun, qc_allow_rerun),
         qc_allow_mix_pct = COALESCE(p_qc_allow_mix_pct, qc_allow_mix_pct),
         source_desc      = COALESCE(p_source_desc, source_desc),
         grade            = COALESCE(p_grade, grade),
         note             = COALESCE(p_note, note),
         updated_at       = now()
   WHERE id = l.id;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_mix_sua_lo(uuid, boolean, boolean, numeric, text, text, text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT to_regprocedure('public.fn_mix_sua_lo(uuid,boolean,boolean,numeric,text,text,text,boolean)') AS f;
