-- ============================================================
-- KHO NGUYÊN LIỆU MỦ — GĐ5: ĐỐI CHIẾU GIẤY – MÁY (giai đoạn chạy song song)
-- Ngày: 2026-10-30
-- Phụ thuộc: GĐ1 (raw_stock_ledger, raw_rubber_types), GĐ0 (fn_nvl_quyen, fn_nvl_emp_hien_tai)
--
-- Trong thời gian chạy song song, thủ kho vẫn giữ sổ giấy. Cuối ngày (hoặc cuối tuần)
-- ghi số tồn ƯỚT trên sổ giấy theo từng loại mủ vào bảng này; máy tự tính tồn ướt/khô
-- của sổ máy ĐẾN NGÀY ĐÓ (cộng dồn raw_stock_ledger theo txn_date) và lệch %.
-- Lệch quá nguong_lech_kho_pct ⇒ cờ đỏ, phải ghi lý do. Không đụng sổ máy.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.raw_paper_checks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id   uuid NOT NULL REFERENCES public.facilities(id),
  ngay          date NOT NULL DEFAULT current_date,
  rubber_type   text NOT NULL REFERENCES public.raw_rubber_types(code),
  giay_wet_kg   numeric(14,2) NOT NULL,          -- tồn ướt theo sổ giấy
  giay_dry_kg   numeric(14,2),                   -- tồn khô theo sổ giấy (nếu giấy có tính)
  ly_do         text,
  note          text,
  created_by    uuid REFERENCES public.employees(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rpc_uniq UNIQUE (facility_id, ngay, rubber_type),
  CONSTRAINT rpc_kg_chk CHECK (giay_wet_kg >= 0)
);
CREATE INDEX IF NOT EXISTS rpc_facility_ngay_idx ON public.raw_paper_checks (facility_id, ngay DESC);
ALTER TABLE public.raw_paper_checks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY rpc_select ON public.raw_paper_checks FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rpc_write_bgd ON public.raw_paper_checks FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ghi / sửa một dòng đối chiếu (thủ kho, QC, BGĐ)
CREATE OR REPLACE FUNCTION public.fn_nvl_ghi_doi_chieu(
  p_facility_id uuid, p_ngay date, p_rubber_type text, p_giay_wet_kg numeric,
  p_giay_dry_kg numeric DEFAULT NULL, p_ly_do text DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q json; v_id uuid; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  q := public.fn_nvl_quyen(p_facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'KHONG_CO_QUYEN:doi_chieu';
  END IF;
  IF p_giay_wet_kg IS NULL OR p_giay_wet_kg < 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  INSERT INTO public.raw_paper_checks (facility_id, ngay, rubber_type, giay_wet_kg, giay_dry_kg, ly_do, note, created_by)
  VALUES (p_facility_id, COALESCE(p_ngay, current_date), p_rubber_type, p_giay_wet_kg, p_giay_dry_kg, p_ly_do, p_note, v_emp)
  ON CONFLICT (facility_id, ngay, rubber_type) DO UPDATE
     SET giay_wet_kg = EXCLUDED.giay_wet_kg, giay_dry_kg = EXCLUDED.giay_dry_kg,
         ly_do = COALESCE(EXCLUDED.ly_do, public.raw_paper_checks.ly_do),
         note = COALESCE(EXCLUDED.note, public.raw_paper_checks.note),
         created_by = COALESCE(v_emp, public.raw_paper_checks.created_by), updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_nvl_xoa_doi_chieu(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; q json;
BEGIN
  SELECT * INTO r FROM public.raw_paper_checks WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;
  q := public.fn_nvl_quyen(r.facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'KHONG_CO_QUYEN:doi_chieu';
  END IF;
  DELETE FROM public.raw_paper_checks WHERE id = p_id;
END $$;

-- Tồn sổ máy đến một ngày, theo loại mủ (dùng cho đối chiếu & tra cứu lùi ngày)
CREATE OR REPLACE FUNCTION public.fn_raw_ton_den_ngay(p_facility_id uuid, p_ngay date)
RETURNS TABLE (rubber_type text, rubber_type_name text, so_lo int, wet_kg numeric, dry_kg numeric, drc_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.rubber_type, rt.name,
         count(DISTINCT l.batch_id) FILTER (WHERE true)::int,
         round(sum(l.wet_kg), 2), round(sum(l.dry_kg), 2),
         CASE WHEN sum(l.wet_kg) > 0 THEN round(100 * sum(l.dry_kg) / sum(l.wet_kg), 2) END
    FROM public.raw_stock_ledger l
    JOIN public.raw_rubber_types rt ON rt.code = l.rubber_type
   WHERE l.facility_id = p_facility_id AND l.txn_date <= p_ngay
   GROUP BY l.rubber_type, rt.name
  HAVING abs(sum(l.dry_kg)) > 0.005 OR abs(sum(l.wet_kg)) > 0.005
   ORDER BY rt.name
$$;

-- View đối chiếu: mỗi dòng giấy ghép với tồn máy đến ngày đó
CREATE OR REPLACE VIEW public.v_raw_doi_chieu AS
SELECT c.id, c.facility_id, f.code AS facility_code, c.ngay, c.rubber_type, rt.name AS rubber_type_name,
       c.giay_wet_kg, c.giay_dry_kg,
       m.wet_kg AS may_wet_kg, m.dry_kg AS may_dry_kg, m.drc_pct AS may_drc_pct,
       round(c.giay_wet_kg - COALESCE(m.wet_kg, 0), 2) AS lech_wet_kg,
       CASE WHEN COALESCE(m.wet_kg, 0) > 0 THEN round(100 * (c.giay_wet_kg - m.wet_kg) / m.wet_kg, 2) END AS lech_wet_pct,
       CASE WHEN c.giay_dry_kg IS NOT NULL THEN round(c.giay_dry_kg - COALESCE(m.dry_kg, 0), 2) END AS lech_dry_kg,
       (public.fn_raw_setting(c.facility_id)).nguong_lech_kho_pct AS nguong_pct,
       (COALESCE(m.wet_kg, 0) > 0 AND abs(100 * (c.giay_wet_kg - m.wet_kg) / m.wet_kg) > (public.fn_raw_setting(c.facility_id)).nguong_lech_kho_pct)
         OR (COALESCE(m.wet_kg, 0) <= 0 AND c.giay_wet_kg > 0) AS vuot_nguong,
       c.ly_do, c.note, e.full_name AS nguoi_ghi, c.created_at, c.updated_at
FROM public.raw_paper_checks c
JOIN public.raw_rubber_types rt ON rt.code = c.rubber_type
LEFT JOIN public.facilities f ON f.id = c.facility_id
LEFT JOIN public.employees e ON e.id = c.created_by
LEFT JOIN LATERAL (
  SELECT round(sum(l.wet_kg), 2) AS wet_kg, round(sum(l.dry_kg), 2) AS dry_kg,
         CASE WHEN sum(l.wet_kg) > 0 THEN round(100 * sum(l.dry_kg) / sum(l.wet_kg), 2) END AS drc_pct
    FROM public.raw_stock_ledger l
   WHERE l.facility_id = c.facility_id AND l.rubber_type = c.rubber_type AND l.txn_date <= c.ngay
) m ON true;

ALTER VIEW public.v_raw_doi_chieu SET (security_invoker = on);
GRANT SELECT ON public.v_raw_doi_chieu TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nvl_ghi_doi_chieu(uuid, date, text, numeric, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nvl_xoa_doi_chieu(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_raw_ton_den_ngay(uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT to_regclass('public.raw_paper_checks') AS t, to_regclass('public.v_raw_doi_chieu') AS v,
       to_regprocedure('public.fn_nvl_ghi_doi_chieu(uuid,date,text,numeric,numeric,text,text)') AS f1,
       to_regprocedure('public.fn_raw_ton_den_ngay(uuid,date)') AS f2;
SELECT * FROM public.fn_raw_ton_den_ngay((SELECT id FROM public.facilities WHERE code = 'PD'), current_date);
