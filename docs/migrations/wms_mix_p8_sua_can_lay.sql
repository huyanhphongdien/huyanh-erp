-- ============================================================
-- HÀNG CHÈN — GĐ4h: SỬA CÂN LÚC LẤY (30/10/2026, chủ DN: "Tạo nút sửa thôi")
--   · Phiếu chưa qua bước QS ký (issued / returned): QS sửa bì, hàng + pallet (hoặc kg), số bành
--   · Máy tính lại kg lấy, tồn ở dây chuyền của lô, tiêu hao (nếu đã trả); ghi ai sửa, lúc nào, kg trước khi sửa
-- Ngày: 2026-10-30 · Phụ thuộc: wms_mix_p7_quy_trinh_ky.sql (CHẠY p4 → p5 → p6 → p7 → p8)
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS out_edit_at timestamptz;
ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS out_edit_by uuid REFERENCES public.employees(id);
ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS out_kg_truoc numeric(14,2);   -- kg lấy ghi lần đầu (giữ vết)

CREATE OR REPLACE FUNCTION public.fn_mix_sua_lay(p_issue_id uuid, p_kg numeric DEFAULT NULL, p_gross_kg numeric DEFAULT NULL, p_pallet_kg numeric DEFAULT NULL, p_so_banh int DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; l record; v_kg numeric; v_ton numeric; v_banh int; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO i FROM public.mix_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF i.status NOT IN ('issued', 'returned') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%:đã ký, không sửa cân lấy được', i.code, i.status; END IF;
  IF NOT public.fn_mix_duoc_ky('khai_bao', i.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:khai_bao'; END IF;
  SELECT * INTO l FROM public.mix_lots WHERE id = i.mix_lot_id FOR UPDATE;
  v_kg := COALESCE(p_kg, CASE WHEN p_gross_kg IS NOT NULL THEN round(p_gross_kg - COALESCE(p_pallet_kg, 0), 2) END);
  IF v_kg IS NULL OR v_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  v_ton := l.kg_in - l.kg_used - (l.kg_at_line - i.kg_out);                     -- tồn nếu bỏ phiếu này ra
  IF v_kg > v_ton + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:lấy % > tồn %', l.code, v_kg, round(v_ton, 2); END IF;
  IF i.kg_return IS NOT NULL AND i.kg_return > v_kg + 0.01 THEN RAISE EXCEPTION 'TRA_QUA_LAY:%:đã trả % > kg lấy mới %', i.code, i.kg_return, v_kg; END IF;
  v_banh := COALESCE(p_so_banh, round(v_kg / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int);

  UPDATE public.mix_lots SET kg_at_line = GREATEST(kg_at_line - i.kg_out + v_kg, 0), updated_at = now() WHERE id = l.id;
  UPDATE public.mix_issues
     SET kg_out = v_kg,
         gross_kg = p_gross_kg, pallet_kg = CASE WHEN p_gross_kg IS NULL THEN NULL ELSE COALESCE(p_pallet_kg, 0) END,
         so_banh = v_banh,
         kg_used = CASE WHEN kg_return IS NOT NULL THEN round(v_kg - kg_return, 2) ELSE kg_used END,
         out_edit_at = now(), out_edit_by = v_emp, out_kg_truoc = COALESCE(out_kg_truoc, i.kg_out),
         note = COALESCE(p_note, note), updated_at = now()
   WHERE id = i.id;
  RETURN jsonb_build_object('code', i.code, 'kg_truoc', i.kg_out, 'kg_sau', v_kg, 'so_banh', v_banh);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_sua_lay(uuid, numeric, numeric, numeric, int, text) TO authenticated;

-- v_mix_issues: i.* đổi (3 cột mới) → DROP/CREATE, thêm tên người sửa
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
SELECT to_regprocedure('public.fn_mix_sua_lay(uuid,numeric,numeric,numeric,int,text)') AS f_sua_lay, to_regclass('public.v_mix_issues') AS v_issues,
       (SELECT count(*) FROM information_schema.columns WHERE table_name = 'v_mix_issues' AND column_name IN ('out_edit_at', 'out_kg_truoc', 'out_edit_name')) AS cot_moi_phai_la_3;
