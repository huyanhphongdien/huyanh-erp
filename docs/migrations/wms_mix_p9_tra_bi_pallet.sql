-- ============================================================
-- HÀNG CHÈN — GĐ4i: BÌ PALLET KHAI Ở LẦN TRẢ, ẢNH TRẢ LUÔN BẮT BUỘC (30/10/2026, chủ DN)
--   · Lúc lấy: chỉ cần cân tổng (hàng + pallet); bì chỉ tạm.
--   · Lúc trả: cân hàng trả + pallet và KHAI BÌ chính xác → máy tính lại kg lấy = cân tổng lúc lấy − bì,
--     kg trả = cân trả − bì, tiêu hao = cân lấy − cân trả (bì triệt tiêu).
--   · Dùng hết: cân pallet rỗng → số trên cân chính là bì, trả 0 kg.
--   · 2 ảnh lúc trả bắt buộc kể cả dùng hết (ảnh pallet rỗng trên cân là bằng chứng bì) — bỏ ngoại lệ ở p7.
-- Ngày: 2026-10-30 · Phụ thuộc: wms_mix_p8_sua_can_lay.sql (CHẠY p8 → p9)
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS out_edit_at timestamptz;
ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS out_edit_by uuid REFERENCES public.employees(id);
ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS out_kg_truoc numeric(14,2);
ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS dung_het boolean NOT NULL DEFAULT false;   -- trả = cân pallet rỗng

-- ─── fn_mix_tra v5 ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_mix_tra(uuid, numeric, boolean, text, uuid, uuid, text, numeric, numeric, int);
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

  -- bì: khai ở lần trả; dùng hết → số trên cân chính là pallet rỗng
  IF COALESCE(p_dung_het, false) THEN
    v_bi := COALESCE(p_gross_kg, p_pallet_kg, i.pallet_kg, 0);
    v_kg := 0;
  ELSE
    v_bi := COALESCE(p_pallet_kg, i.pallet_kg, 0);
    v_kg := COALESCE(p_kg_return, CASE WHEN p_gross_kg IS NOT NULL THEN round(p_gross_kg - v_bi, 2) END);
  END IF;
  IF v_kg IS NULL OR v_kg < 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;

  -- kg lấy tính lại từ cân tổng lúc lấy với bì chính xác (chỉ khi lúc lấy có cân cả pallet)
  v_out := CASE WHEN i.gross_kg IS NOT NULL AND (COALESCE(p_dung_het, false) OR p_pallet_kg IS NOT NULL OR p_gross_kg IS NOT NULL) THEN round(i.gross_kg - v_bi, 2) ELSE i.kg_out END;
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
GRANT EXECUTE ON FUNCTION public.fn_mix_tra(uuid, numeric, boolean, text, uuid, uuid, text, numeric, numeric, int, boolean) TO authenticated;

-- ─── Ảnh lúc trả luôn bắt buộc (bỏ ngoại lệ trả 0 kg của p7) ───────────────
CREATE OR REPLACE FUNCTION public.fn_mix_thieu_anh(p_issue_id uuid, p_facility_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.raw_settings; k text; v_ref text;
BEGIN
  s := public.fn_raw_setting(p_facility_id);
  FOREACH v_ref IN ARRAY ARRAY['mix_issue_out', 'mix_issue_return'] LOOP
    FOR k IN SELECT jsonb_array_elements_text(s.anh_bat_buoc) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.raw_photos p WHERE p.ref_type = v_ref AND p.ref_id = p_issue_id AND p.kind = k) THEN
        RETURN v_ref || ':' || k;
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END $$;

-- v_mix_issues: i.* có thêm dung_het → DROP/CREATE (giữ nguyên cột p8)
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
       ee.full_name AS out_edit_name
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
LEFT JOIN public.raw_lots rl ON rl.id = i.raw_lot_id;
ALTER VIEW public.v_mix_issues SET (security_invoker = on);
GRANT SELECT ON public.v_mix_issues TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT to_regprocedure('public.fn_mix_tra(uuid,numeric,boolean,text,uuid,uuid,text,numeric,numeric,int,boolean)') AS f_tra_v5,
       (SELECT count(*) FROM pg_proc WHERE proname = 'fn_mix_tra' AND pronamespace = 'public'::regnamespace) AS so_ban_fn_mix_tra_phai_la_1,
       (SELECT count(*) FROM information_schema.columns WHERE table_name = 'v_mix_issues' AND column_name IN ('dung_het', 'out_kg_truoc')) AS cot_moi_phai_la_2;
