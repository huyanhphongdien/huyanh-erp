-- ============================================================
-- HÀNG CHÈN — GĐ4d: phiếu chèn theo đúng sổ tay tổ ép (30/10/2026)
--   "Ca Vàng · chèn vào KHMN-15 + 17 · L1: 5 bành 1502 · hàng+pallet 191,5 · pallet 15 · hàng chèn 176,5 kg …"
--   · 2 loại chèn: chèn BỂ SLAP (be_slap) và chèn MÁY MIX (may_mix); một ca chèn nhiều lần = nhiều phiếu
--   · mỗi phiếu = một pallet: số bành, cân cả pallet, bì pallet (mặc định 15 kg, sửa được) → kg hàng chèn = cân − bì
--   · phiếu mang MÃ NGUYÊN LIỆU GỐC đang chạy, có thể NHIỀU mã (KHMN-15 + KHMN-17): kg chia đều cho các mã
--   · gom theo mã: v_raw_lot_chen (tổng kg chèn, chi tiết từng lô/loại, % chèn so với NVL khô đã xuất)
-- Ngày: 2026-10-30 · Phụ thuộc: wms_nvl_p6_ma_nguyen_lieu, wms_mix_p1..p3, wms_khep_vong_p1
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS raw_lot_id uuid REFERENCES public.raw_lots(id);
ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS raw_lot_ids uuid[];
ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS vi_tri text CHECK (vi_tri IN ('be_slap', 'may_mix'));   -- chèn bể slap / chèn máy mix
ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS so_banh int;              -- số bành lấy (1502, DKL, mix…)
ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS gross_kg numeric(14,2);    -- cân cả pallet lúc lấy
ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS pallet_kg numeric(10,2);   -- bì pallet lúc lấy
ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS so_banh_tra int;
ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS return_gross_kg numeric(14,2);
ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS return_pallet_kg numeric(10,2);
CREATE INDEX IF NOT EXISTS mi_raw_lot_idx ON public.mix_issues (raw_lot_id) WHERE raw_lot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mi_raw_lot_ids_idx ON public.mix_issues USING gin (raw_lot_ids);

-- ─── fn_mix_lay v3: pallet + mã gốc (một hoặc nhiều) ───────────────────────
DROP FUNCTION IF EXISTS public.fn_mix_lay(uuid, numeric, date, uuid, text, text, text, numeric, uuid, text, uuid);
CREATE OR REPLACE FUNCTION public.fn_mix_lay(
  p_lot_id uuid, p_kg numeric, p_shift_date date DEFAULT current_date, p_shift_id uuid DEFAULT NULL, p_team text DEFAULT NULL,
  p_purpose text DEFAULT 'chay_lai', p_target_index text DEFAULT NULL, p_target_value numeric DEFAULT NULL,
  p_production_order_id uuid DEFAULT NULL, p_note text DEFAULT NULL, p_id uuid DEFAULT NULL,
  p_raw_lot_ids uuid[] DEFAULT NULL, p_so_banh int DEFAULT NULL, p_gross_kg numeric DEFAULT NULL, p_pallet_kg numeric DEFAULT NULL, p_vi_tri text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_ton numeric; v_id uuid; v_ids uuid[]; v_kg numeric; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO l FROM public.mix_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF NOT public.fn_nvl_duoc_ky('submit', l.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  IF l.status IN ('depleted', 'cancelled') THEN RAISE EXCEPTION 'LO_DA_HET:%', l.code; END IF;
  IF l.source_type = 'dkl' AND NOT l.metal_cleared THEN RAISE EXCEPTION 'DKL_CHUA_XU_LY:%', l.code; END IF;
  -- kg hàng chèn: gõ thẳng, hoặc = cân cả pallet − bì
  v_kg := COALESCE(p_kg, CASE WHEN p_gross_kg IS NOT NULL THEN round(p_gross_kg - COALESCE(p_pallet_kg, 0), 2) END);
  IF v_kg IS NULL OR v_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  IF p_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.mix_issues WHERE id = p_id) THEN RAISE EXCEPTION 'DA_GHI_SO:phiếu đã ghi rồi'; END IF;
  v_ton := l.kg_in - l.kg_used - l.kg_at_line;
  IF v_kg > v_ton + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:lấy % > tồn %', l.code, v_kg, v_ton; END IF;

  -- mã gốc: chọn tay (một hay nhiều) > phiếu ca của ca này
  v_ids := (SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(p_raw_lot_ids, ARRAY[]::uuid[])) x WHERE x IS NOT NULL);
  IF v_ids IS NULL AND p_shift_id IS NOT NULL THEN
    SELECT CASE WHEN r.raw_lot_id IS NULL THEN NULL ELSE ARRAY[r.raw_lot_id] END INTO v_ids
      FROM public.shift_production_reports r WHERE r.facility_id = l.facility_id AND r.report_date = COALESCE(p_shift_date, current_date) AND r.shift_id = p_shift_id;
  END IF;
  IF v_ids IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(v_ids) x LEFT JOIN public.raw_lots rl ON rl.id = x WHERE rl.id IS NULL OR rl.facility_id <> l.facility_id) THEN
    RAISE EXCEPTION 'LO_KHAC_NHA_MAY:mã gốc';
  END IF;

  INSERT INTO public.mix_issues (id, code, facility_id, mix_lot_id, shift_date, shift_id, team, purpose, target_index, target_value,
                                 kg_out, out_by, production_order_id, note, created_by, raw_lot_id, raw_lot_ids, so_banh, gross_kg, pallet_kg, vi_tri)
  VALUES (COALESCE(p_id, gen_random_uuid()), public.fn_mix_ma('PC', l.facility_id), l.facility_id, l.id, COALESCE(p_shift_date, current_date), p_shift_id, p_team,
          COALESCE(p_purpose, 'chay_lai'), p_target_index, p_target_value, v_kg, v_emp, p_production_order_id, p_note, v_emp,
          CASE WHEN v_ids IS NULL THEN NULL ELSE v_ids[1] END, v_ids, p_so_banh, p_gross_kg, p_pallet_kg, p_vi_tri)
  RETURNING id INTO v_id;

  UPDATE public.mix_lots SET kg_at_line = kg_at_line + v_kg, status = 'in_use', updated_at = now() WHERE id = l.id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_lay(uuid, numeric, date, uuid, text, text, text, numeric, uuid, text, uuid, uuid[], int, numeric, numeric, text) TO authenticated;

-- ─── fn_mix_tra v3: trả cũng cân cả pallet ─────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_mix_tra(uuid, numeric, boolean, text, uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.fn_mix_tra(
  p_issue_id uuid, p_kg_return numeric, p_handover boolean DEFAULT false, p_note text DEFAULT NULL, p_output_batch_id uuid DEFAULT NULL,
  p_shift_id uuid DEFAULT NULL, p_team text DEFAULT NULL, p_gross_kg numeric DEFAULT NULL, p_pallet_kg numeric DEFAULT NULL, p_so_banh_tra int DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; v_kg numeric; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO i FROM public.mix_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF i.status NOT IN ('issued', 'returned') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', i.code, i.status; END IF;
  IF NOT public.fn_nvl_duoc_ky('submit', i.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  v_kg := COALESCE(p_kg_return, CASE WHEN p_gross_kg IS NOT NULL THEN round(p_gross_kg - COALESCE(p_pallet_kg, 0), 2) END);
  IF v_kg IS NULL OR v_kg < 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  IF v_kg > i.kg_out + 0.01 THEN RAISE EXCEPTION 'TRA_QUA_LAY:%:trả % > lấy %', i.code, v_kg, i.kg_out; END IF;
  IF i.shift_id IS NULL AND p_shift_id IS NULL THEN RAISE EXCEPTION 'THIEU_CA:%:phiếu bàn giao chưa có ca, chọn ca trước khi trả', i.code; END IF;

  UPDATE public.mix_issues
     SET kg_return = v_kg, return_at = now(), return_by = v_emp, kg_used = round(kg_out - v_kg, 2),
         return_gross_kg = p_gross_kg, return_pallet_kg = p_pallet_kg, so_banh_tra = p_so_banh_tra,
         handover_to_next = COALESCE(p_handover, false) AND v_kg > 0, output_batch_id = COALESCE(p_output_batch_id, output_batch_id),
         shift_id = COALESCE(shift_id, p_shift_id), team = COALESCE(p_team, team),
         shift_date = CASE WHEN i.shift_id IS NULL AND p_shift_id IS NOT NULL THEN current_date ELSE shift_date END,
         note = COALESCE(p_note, note), status = 'returned', updated_at = now()
   WHERE id = i.id;
  RETURN jsonb_build_object('code', i.code, 'kg_out', i.kg_out, 'kg_return', v_kg, 'kg_used', round(i.kg_out - v_kg, 2));
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_tra(uuid, numeric, boolean, text, uuid, uuid, text, numeric, numeric, int) TO authenticated;

-- Đổi mã gốc (và vị trí chèn) của phiếu — trước khi thủ kho nhận
DROP FUNCTION IF EXISTS public.fn_mix_doi_ma_goc(uuid, uuid[]);
CREATE OR REPLACE FUNCTION public.fn_mix_doi_ma_goc(p_issue_id uuid, p_raw_lot_ids uuid[], p_vi_tri text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; v_ids uuid[];
BEGIN
  SELECT * INTO i FROM public.mix_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF i.status IN ('received', 'cancelled') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', i.code, i.status; END IF;
  IF NOT public.fn_nvl_duoc_ky('submit', i.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  v_ids := (SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(p_raw_lot_ids, ARRAY[]::uuid[])) x WHERE x IS NOT NULL);
  IF v_ids IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(v_ids) x LEFT JOIN public.raw_lots rl ON rl.id = x WHERE rl.id IS NULL OR rl.facility_id <> i.facility_id) THEN RAISE EXCEPTION 'LO_KHAC_NHA_MAY:mã gốc'; END IF;
  UPDATE public.mix_issues SET raw_lot_ids = v_ids, raw_lot_id = CASE WHEN v_ids IS NULL THEN NULL ELSE v_ids[1] END, vi_tri = COALESCE(p_vi_tri, vi_tri), updated_at = now() WHERE id = i.id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_mix_doi_ma_goc(uuid, uuid[], text) TO authenticated;

-- Khi đổi trạng thái / ca mà phiếu chưa có mã gốc → lấy từ phiếu ca
CREATE OR REPLACE FUNCTION public.trg_mix_issue_ma_goc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF NEW.raw_lot_id IS NULL AND NEW.shift_id IS NOT NULL THEN
    SELECT r.raw_lot_id INTO v FROM public.shift_production_reports r WHERE r.facility_id = NEW.facility_id AND r.report_date = NEW.shift_date AND r.shift_id = NEW.shift_id;
    IF v IS NOT NULL THEN NEW.raw_lot_id := v; NEW.raw_lot_ids := ARRAY[v]; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mix_issue_ma_goc ON public.mix_issues;
CREATE TRIGGER mix_issue_ma_goc BEFORE UPDATE OF status, shift_id ON public.mix_issues FOR EACH ROW EXECUTE FUNCTION public.trg_mix_issue_ma_goc();

-- ─── v_mix_issues + ma_goc / ma_goc_all (DROP vì i.* đổi) ─────────────────
DROP VIEW IF EXISTS public.v_mix_issues;
CREATE VIEW public.v_mix_issues AS
SELECT i.*, f.code AS facility_code, l.code AS lot_code, l.source_type, l.source_desc, l.grade AS lot_grade, l.po, l.mooney, l.pri,
       sh.code AS shift_code, sh.name AS shift_name,
       po.code AS production_code, b.batch_no AS output_batch_no,
       (SELECT count(*) FROM public.raw_photos p WHERE p.ref_type = 'mix_issue_out' AND p.ref_id = i.id)::int AS so_anh_lay,
       (SELECT count(*) FROM public.raw_photos p WHERE p.ref_type = 'mix_issue_return' AND p.ref_id = i.id)::int AS so_anh_tra,
       public.fn_mix_thieu_anh(i.id, i.facility_id) AS thieu_anh,
       eo.full_name AS out_name, er.full_name AS return_name, es.full_name AS submitted_name, eq.full_name AS qc_confirmed_name, ev.full_name AS received_name,
       rl.ma AS ma_goc,
       (SELECT string_agg(r2.ma, ' + ' ORDER BY r2.ma) FROM unnest(i.raw_lot_ids) x JOIN public.raw_lots r2 ON r2.id = x) AS ma_goc_all
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
LEFT JOIN public.raw_lots rl ON rl.id = i.raw_lot_id;
ALTER VIEW public.v_mix_issues SET (security_invoker = on);
GRANT SELECT ON public.v_mix_issues TO authenticated;

-- ─── Chèn gom theo MÃ GỐC: phiếu chèn vào nhiều mã thì kg chia đều ─────────
CREATE OR REPLACE VIEW public.v_raw_lot_chen AS
WITH ct AS (
  SELECT x.raw_lot_id, l.id AS mix_lot_id, l.code AS lot_code, l.source_type, l.grade, l.source_desc, i.vi_tri,
         round(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)), 2) AS kg,
         sum(i.so_banh)::int AS so_banh, count(*)::int AS so_phieu,
         bool_or(cardinality(i.raw_lot_ids) > 1) AS co_chung
    FROM public.mix_issues i
    JOIN LATERAL (SELECT unnest(COALESCE(i.raw_lot_ids, CASE WHEN i.raw_lot_id IS NULL THEN NULL ELSE ARRAY[i.raw_lot_id] END)) AS raw_lot_id) x ON true
    JOIN public.mix_lots l ON l.id = i.mix_lot_id
   WHERE i.status = 'received'
   GROUP BY x.raw_lot_id, l.id, l.code, l.source_type, l.grade, l.source_desc, i.vi_tri
)
SELECT b.raw_lot_id, b.facility_id, b.ma, b.rubber_type_name, b.trang_thai, b.xuat_sx_kho_kg,
       round(COALESCE(sum(ct.kg), 0), 2) AS chen_kg,
       COALESCE(sum(ct.so_phieu), 0)::int AS so_phieu_chen,
       COALESCE(sum(ct.so_banh), 0)::int AS so_banh_chen,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.vi_tri = 'be_slap'), 0), 2) AS chen_be_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.vi_tri = 'may_mix'), 0), 2) AS chen_mix_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.source_type = 'loi'), 0), 2) AS chen_loi_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.source_type = 'dkl'), 0), 2) AS chen_dkl_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.source_type = 'std'), 0), 2) AS chen_chuan_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.source_type IN ('mua_ngoai', 'khac')), 0), 2) AS chen_khac_kg,
       CASE WHEN COALESCE(b.xuat_sx_kho_kg, 0) + COALESCE(sum(ct.kg), 0) > 0
            THEN round(100 * COALESCE(sum(ct.kg), 0) / (COALESCE(b.xuat_sx_kho_kg, 0) + COALESCE(sum(ct.kg), 0)), 1) END AS ty_le_chen_pct,
       COALESCE(jsonb_agg(jsonb_build_object('lot_code', ct.lot_code, 'vi_tri', ct.vi_tri, 'source_type', ct.source_type, 'grade', ct.grade, 'desc', ct.source_desc, 'kg', ct.kg, 'so_banh', ct.so_banh, 'so_phieu', ct.so_phieu, 'co_chung', ct.co_chung) ORDER BY ct.kg DESC) FILTER (WHERE ct.mix_lot_id IS NOT NULL), '[]'::jsonb) AS chi_tiet
FROM public.v_raw_lot_balance b
LEFT JOIN ct ON ct.raw_lot_id = b.raw_lot_id
GROUP BY b.raw_lot_id, b.facility_id, b.ma, b.rubber_type_name, b.trang_thai, b.xuat_sx_kho_kg;
ALTER VIEW public.v_raw_lot_chen SET (security_invoker = on);
GRANT SELECT ON public.v_raw_lot_chen TO authenticated;

-- ─── v_raw_lot_yield: chèn theo raw_lot_ids (chia đều), dự phòng phiếu ca cùng ca ──
CREATE OR REPLACE VIEW public.v_raw_lot_yield AS
SELECT b.raw_lot_id, b.facility_id, b.ma, b.nguon, b.rubber_type_name, b.trang_thai, b.so_xe, b.wet_kg, b.dry_kg, b.nhap_kho_kg, b.xuat_sx_kho_kg, b.ngay_dau, b.ngay_cuoi,
       sc.so_ca, sc.tp_dat_kg, sc.loi_dkl_kg, sc.chen_tieu_hao_kg,
       CASE WHEN COALESCE(b.xuat_sx_kho_kg, 0) + COALESCE(sc.chen_tieu_hao_kg, 0) > 0
            THEN round(100 * COALESCE(sc.tp_dat_kg, 0) / (COALESCE(b.xuat_sx_kho_kg, 0) + COALESCE(sc.chen_tieu_hao_kg, 0)), 1) END AS hieu_suat_pct,
       CASE WHEN COALESCE(sc.tp_dat_kg, 0) + COALESCE(sc.loi_dkl_kg, 0) > 0
            THEN round(100 * COALESCE(sc.loi_dkl_kg, 0) / (COALESCE(sc.tp_dat_kg, 0) + COALESCE(sc.loi_dkl_kg, 0)), 1) END AS ty_le_loi_pct
FROM public.v_raw_lot_balance b
LEFT JOIN LATERAL (
  SELECT count(DISTINCT r.id)::int AS so_ca,
         round(COALESCE(sum(v.nhap_kg) FILTER (WHERE v.code NOT IN ('LOI', 'DKL', 'CHEN')), 0), 2) AS tp_dat_kg,
         round(COALESCE(sum(v.nhap_kg) FILTER (WHERE v.code IN ('LOI', 'DKL')), 0), 2) AS loi_dkl_kg,
         (SELECT round(COALESCE(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)), 0), 2) FROM public.mix_issues i
           WHERE i.status = 'received' AND (b.raw_lot_id = ANY(COALESCE(i.raw_lot_ids, ARRAY[i.raw_lot_id]))
                 OR (i.raw_lot_id IS NULL AND EXISTS (SELECT 1 FROM public.shift_production_reports r2 WHERE r2.raw_lot_id = b.raw_lot_id AND r2.facility_id = i.facility_id AND r2.report_date = i.shift_date AND r2.shift_id = i.shift_id)))) AS chen_tieu_hao_kg
    FROM public.shift_production_reports r
    LEFT JOIN public.v_shift_production_lines v ON v.report_id = r.id AND v.status = 'received'
   WHERE r.raw_lot_id = b.raw_lot_id AND r.status = 'received'
) sc ON true;
ALTER VIEW public.v_raw_lot_yield SET (security_invoker = on);
GRANT SELECT ON public.v_raw_lot_yield TO authenticated;

-- ─── Gán mã gốc cho phiếu chèn cũ từ phiếu ca cùng ca ─────────────────────
UPDATE public.mix_issues i SET raw_lot_id = r.raw_lot_id, raw_lot_ids = ARRAY[r.raw_lot_id]
  FROM public.shift_production_reports r
 WHERE i.raw_lot_id IS NULL AND r.raw_lot_id IS NOT NULL AND r.facility_id = i.facility_id AND r.report_date = i.shift_date AND r.shift_id = i.shift_id;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT to_regprocedure('public.fn_mix_lay(uuid,numeric,date,uuid,text,text,text,numeric,uuid,text,uuid,uuid[],int,numeric,numeric,text)') AS f_lay_v3,
       to_regprocedure('public.fn_mix_tra(uuid,numeric,boolean,text,uuid,uuid,text,numeric,numeric,int)') AS f_tra_v3,
       to_regclass('public.v_raw_lot_chen') AS v_chen, (SELECT count(*) FROM public.mix_issues WHERE raw_lot_id IS NOT NULL) AS phieu_co_ma_goc;
SELECT ma, chen_kg, so_banh_chen, chen_be_kg, chen_mix_kg, chen_loi_kg, chen_dkl_kg, chen_chuan_kg, chen_khac_kg, ty_le_chen_pct, chi_tiet FROM public.v_raw_lot_chen WHERE chen_kg > 0 ORDER BY chen_kg DESC LIMIT 10;
