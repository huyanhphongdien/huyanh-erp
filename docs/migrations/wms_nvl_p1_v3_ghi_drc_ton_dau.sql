-- ============================================================
-- KHO NGUYÊN LIỆU MỦ — GĐ1 · v3: GHI DRC VÀO PHIẾU CÂN TỪ ERP + TỒN ĐẦU NHẬP TAY
-- Ngày: 2026-10-29
-- Phụ thuộc: wms_nvl_p1_v2_ngay_mo_so.sql (đã chạy)
--
-- Kiểm chứng 29/10 (60 ngày): Phong Điền 98 phiếu, chỉ 7 có DRC đo tại cân (7 %);
-- Tân Lâm 72 %. Ở PD lab chưa ghi DRC vào phiếu → hàng đợi nhập kho sẽ kẹt "chờ DRC".
-- Chủ DN: tập trung Phong Điền; tồn đầu chưa có số thật, cần nhập linh động sau.
--
--   1. fn_nvl_ghi_drc_phieu: lab / thủ kho / BGĐ ghi DRC đo vào phiếu cân ngay trong
--      ERP (cột qc_actual_drc của weighbridge_tickets, nguồn 'manual'). Chỉ ghi khi
--      phiếu chưa vào sổ. Có DRC rồi thì hàng đợi tự chuyển "sẵn sàng".
--   2. Tồn đầu nhập tay: dùng lại raw_opening_stock_staging — thêm cột created_by,
--      hàm fn_nvl_xoa_dong_ton_dau (chỉ dòng chưa ghi sổ). fn_mo_so_ton_dau đã
--      xử lý theo ĐỢT (chỉ dòng chưa processed) nên nhập nhiều lần được.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── 1) Ghi DRC vào phiếu cân ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_nvl_ghi_drc_phieu(p_ticket_id uuid, p_drc numeric, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t       record;
  v_emp   uuid := public.fn_nvl_emp_hien_tai();
  v_q     json;
BEGIN
  IF p_drc IS NULL OR p_drc <= 0 OR p_drc > 100 THEN RAISE EXCEPTION 'DRC_KHONG_HOP_LE:%', p_drc; END IF;

  SELECT * INTO t FROM public.weighbridge_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF t.status <> 'completed' THEN RAISE EXCEPTION 'PHIEU_CHUA_HOAN_TAT:%', t.code; END IF;
  IF EXISTS (SELECT 1 FROM public.raw_stock_ledger l WHERE l.ref_type = 'weighbridge_ticket' AND l.ref_id = t.id) THEN
    RAISE EXCEPTION 'DA_NHAP:%', t.code;   -- đã vào sổ thì DRC sửa bằng cân lại (GĐ2), không sửa phiếu
  END IF;

  -- Ai được ghi: QC, thủ kho NVL, BGĐ (luật ở fn_nvl_quyen)
  v_q := public.fn_nvl_quyen(t.facility_id);
  IF NOT ((v_q->>'la_qc')::boolean OR (v_q->>'la_thu_kho')::boolean OR (v_q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'KHONG_CO_QUYEN_GHI_DRC';
  END IF;

  UPDATE public.weighbridge_tickets
     SET qc_actual_drc  = p_drc,
         qc_drc_source  = 'manual',
         qc_checked_at  = now(),
         qc_notes       = CASE
                            WHEN p_note IS NULL OR p_note = '' THEN qc_notes
                            ELSE COALESCE(qc_notes || ' · ', '') || 'ERP ' || to_char(now(), 'DD/MM HH24:MI') || ': ' || p_note
                          END,
         updated_at     = now()
   WHERE id = t.id;

  RETURN jsonb_build_object('ticket_id', t.id, 'code', t.code, 'qc_actual_drc', p_drc, 'by', v_emp);
END $$;

GRANT EXECUTE ON FUNCTION public.fn_nvl_ghi_drc_phieu(uuid, numeric, text) TO authenticated;

-- ─── 2) Tồn đầu nhập tay nhiều đợt ─────────────────────────────────────────
ALTER TABLE public.raw_opening_stock_staging
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Xóa dòng chưa ghi sổ (dòng đã ghi sổ thì không xóa — sửa bằng cân lại / kiểm kê ở GĐ2)
CREATE OR REPLACE FUNCTION public.fn_nvl_xoa_dong_ton_dau(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.raw_opening_stock_staging WHERE id = p_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF r.processed_at IS NOT NULL THEN RAISE EXCEPTION 'DA_GHI_SO:%', r.batch_code; END IF;
  IF NOT public.fn_nvl_duoc_ky('receive', (SELECT id FROM public.facilities WHERE upper(code) = upper(r.facility_code) LIMIT 1)) THEN
    RAISE EXCEPTION 'KHONG_CO_QUYEN_NHAN';
  END IF;
  DELETE FROM public.raw_opening_stock_staging WHERE id = p_id;
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_nvl_xoa_dong_ton_dau(uuid) TO authenticated;

-- Mã lô tồn đầu tự sinh khi người nhập không có mã: TD-<NM>-<loại>-<yymmdd>-<n>
CREATE OR REPLACE FUNCTION public.fn_nvl_ma_lo_ton_dau(p_facility_code text, p_rubber_type text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefix text := 'TD-' || upper(p_facility_code) || '-' || upper(replace(public.fn_chuan_hoa_loai_mu(p_rubber_type), 'mu_', '')) || '-' || to_char(current_date, 'YYMMDD') || '-';
  v_n int;
BEGIN
  SELECT COALESCE(max(NULLIF(regexp_replace(batch_code, '^' || v_prefix, ''), batch_code)::int), 0) + 1
    INTO v_n
    FROM public.raw_opening_stock_staging
   WHERE batch_code LIKE v_prefix || '%';
  RETURN v_prefix || lpad(v_n::text, 2, '0');
END $$;

GRANT EXECUTE ON FUNCTION public.fn_nvl_ma_lo_ton_dau(text, text) TO authenticated;

-- ─── KIỂM CHỨNG (gửi lại kết quả) ──────────────────────────────────────────
SELECT to_regprocedure('public.fn_nvl_ghi_drc_phieu(uuid,numeric,text)') AS f1,
       to_regprocedure('public.fn_nvl_xoa_dong_ton_dau(uuid)') AS f2,
       to_regprocedure('public.fn_nvl_ma_lo_ton_dau(text,text)') AS f3,
       public.fn_nvl_ma_lo_ton_dau('PD', 'mu_dong') AS vi_du_ma_lo;   -- TD-PD-DONG-261029-01
