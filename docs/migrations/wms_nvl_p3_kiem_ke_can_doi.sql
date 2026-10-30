-- ============================================================
-- KHO NGUYÊN LIỆU MỦ — GĐ3: KIỂM KÊ + KHÓA KỲ + BÁO CÁO CÂN ĐỐI / HAO HỤT
-- Ngày: 2026-10-30
-- Phụ thuộc: GĐ1 + GĐ2 (raw_stock_ledger có lech_kho_pct/ly_do, fn_nvl_duoc_ky v2, raw_settings)
--
--   · Kiểm kê (raw_stocktakes + raw_stocktake_lines): tạo phiếu = chụp sổ mọi lô còn
--     hàng; thủ kho đếm (ướt mới, DRC nếu đo); lệch khô quá ngưỡng phải ghi lý do;
--     BGĐ duyệt → dòng stocktake_adjust vào sổ cho lô lệch, khóa kỳ đến ngày kiểm kê.
--   · Người duyệt điều chỉnh ngoài BGĐ: raw_adjust_approvers (cùng khuôn raw_qc_signers).
--   · Khóa kỳ: raw_settings.ngay_khoa_so — trigger chặn ghi sổ lùi ngày vào kỳ đã khóa.
--   · fn_raw_balance_month(nhà máy, tháng): tồn đầu + nhập − xuất ± điều chỉnh = tồn cuối,
--     so với kiểm kê đã duyệt trong tháng, theo loại hàng (kg khô và kg ướt).
--   · v_raw_wet_loss_by_age: chuẩn hao ướt / DRC tăng / khô lệch theo tuổi lô từ các lần cân lại.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── 0) Người duyệt điều chỉnh (ngoài BGĐ level ≤ 3) ───────────────────────
CREATE TABLE IF NOT EXISTS public.raw_adjust_approvers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  facility_id uuid REFERENCES public.facilities(id),
  granted_by  uuid REFERENCES public.employees(id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_by  uuid REFERENCES public.employees(id),
  revoked_at  timestamptz,
  is_active   boolean NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS raw_adjust_approvers_uniq
  ON public.raw_adjust_approvers (employee_id, COALESCE(facility_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE is_active;
ALTER TABLE public.raw_adjust_approvers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY raa_select ON public.raw_adjust_approvers FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY raa_write ON public.raw_adjust_approvers FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Luật ký v3: approve_adjust = BGĐ hoặc raw_adjust_approvers
CREATE OR REPLACE FUNCTION public.fn_nvl_duoc_ky(p_buoc text, p_facility_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emp   uuid;
  v_level int;
  v_dept  text;
  v_co_ai boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN true; END IF;
  SELECT e.id, COALESCE(p.level, 99), upper(COALESCE(d.code, ''))
    INTO v_emp, v_level, v_dept
    FROM public.employees e
    LEFT JOIN public.positions   p ON p.id = e.position_id
    LEFT JOIN public.departments d ON d.id = e.department_id
   WHERE e.user_id = auth.uid();
  IF v_emp IS NULL THEN RETURN false; END IF;
  IF v_level <= 3 THEN RETURN true; END IF;

  CASE p_buoc
    WHEN 'submit' THEN RETURN true;
    WHEN 'qc_confirm' THEN
      RETURN v_dept = 'HAP-QC' OR EXISTS (SELECT 1 FROM public.raw_qc_signers t WHERE t.is_active AND t.employee_id = v_emp
                AND (t.facility_id IS NULL OR p_facility_id IS NULL OR t.facility_id = p_facility_id));
    WHEN 'receive' THEN
      SELECT EXISTS (SELECT 1 FROM public.raw_store_keepers WHERE is_active) INTO v_co_ai;
      IF NOT v_co_ai THEN RETURN true; END IF;
      RETURN EXISTS (SELECT 1 FROM public.raw_store_keepers t WHERE t.is_active AND t.employee_id = v_emp
                AND (t.facility_id IS NULL OR p_facility_id IS NULL OR t.facility_id = p_facility_id));
    WHEN 'approve_adjust' THEN
      RETURN EXISTS (SELECT 1 FROM public.raw_adjust_approvers t WHERE t.is_active AND t.employee_id = v_emp
                AND (t.facility_id IS NULL OR p_facility_id IS NULL OR t.facility_id = p_facility_id));
    WHEN 'cancel' THEN RETURN true;
    ELSE RETURN false;
  END CASE;
END $$;

INSERT INTO public.raw_adjust_approvers (employee_id, facility_id, granted_by, notes)
SELECT e.id, NULL, e.id, 'GĐ3 2026-10-30: duyệt điều chỉnh kiểm kê để audit & test — quyết định chủ doanh nghiệp'
  FROM public.employees e
 WHERE lower(e.email) = 'minhld@huyanhrubber.com'
   AND NOT EXISTS (SELECT 1 FROM public.raw_adjust_approvers a WHERE a.employee_id = e.id AND a.facility_id IS NULL AND a.is_active);

-- ─── 1) Khóa kỳ ────────────────────────────────────────────────────────────
ALTER TABLE public.raw_settings ADD COLUMN IF NOT EXISTS ngay_khoa_so date;
COMMENT ON COLUMN public.raw_settings.ngay_khoa_so IS 'Sổ đã khóa đến hết ngày này (sau kiểm kê duyệt). Không ghi dòng có txn_date <= ngày này.';

CREATE OR REPLACE FUNCTION public.fn_raw_ledger_chan_ky_khoa()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_khoa date;
BEGIN
  v_khoa := (public.fn_raw_setting(NEW.facility_id)).ngay_khoa_so;
  IF v_khoa IS NOT NULL AND NEW.txn_date <= v_khoa THEN
    RAISE EXCEPTION 'KY_DA_KHOA:%:khóa đến %', NEW.txn_date, v_khoa;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS raw_ledger_chan_ky_khoa ON public.raw_stock_ledger;
CREATE TRIGGER raw_ledger_chan_ky_khoa BEFORE INSERT ON public.raw_stock_ledger
  FOR EACH ROW EXECUTE FUNCTION public.fn_raw_ledger_chan_ky_khoa();

-- ─── 2) KIỂM KÊ ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raw_stocktakes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,                 -- KK-NVL-PD-YYMMDD-NN
  facility_id   uuid NOT NULL REFERENCES public.facilities(id),
  ngay_kiem_ke  date NOT NULL DEFAULT current_date,
  status        text NOT NULL DEFAULT 'draft',        -- draft | counted | approved | cancelled
  note          text,
  created_by    uuid REFERENCES public.employees(id),
  counted_by    uuid REFERENCES public.employees(id),
  counted_at    timestamptz,
  approved_by   uuid REFERENCES public.employees(id),
  approved_at   timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rst_status_chk CHECK (status IN ('draft', 'counted', 'approved', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS public.raw_stocktake_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktake_id    uuid NOT NULL REFERENCES public.raw_stocktakes(id) ON DELETE CASCADE,
  batch_id        uuid NOT NULL REFERENCES public.stock_batches(id),
  rubber_type     text NOT NULL REFERENCES public.raw_rubber_types(code),
  book_wet_kg     numeric(14,2) NOT NULL,
  book_drc_pct    numeric(5,2),
  book_dry_kg     numeric(14,2) NOT NULL,
  counted_wet_kg  numeric(14,2),
  counted_drc_pct numeric(5,2),
  counted_dry_kg  numeric(14,2),
  chenh_uot_kg    numeric(14,2),
  chenh_kho_kg    numeric(14,2),
  lech_kho_pct    numeric(8,3),
  ly_do           text,
  note            text,
  counted_at      timestamptz,
  counted_by      uuid REFERENCES public.employees(id),
  CONSTRAINT rstl_uniq UNIQUE (stocktake_id, batch_id),
  CONSTRAINT rstl_counted_chk CHECK (counted_wet_kg IS NULL OR counted_wet_kg >= 0)
);
CREATE INDEX IF NOT EXISTS rstl_stocktake_idx ON public.raw_stocktake_lines (stocktake_id);

ALTER TABLE public.raw_stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_stocktake_lines ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY rst_select ON public.raw_stocktakes FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rstl_select ON public.raw_stocktake_lines FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rst_write_bgd ON public.raw_stocktakes FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rstl_write_bgd ON public.raw_stocktake_lines FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tạo phiếu kiểm kê: chụp sổ mọi lô còn hàng của nhà máy
CREATE OR REPLACE FUNCTION public.fn_nvl_tao_kiem_ke(p_facility_id uuid, p_ngay date DEFAULT current_date, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id    uuid;
  v_emp   uuid := public.fn_nvl_emp_hien_tai();
  v_code  text;
  v_fcode text;
  v_n     int;
  v_so    int;
BEGIN
  IF NOT public.fn_nvl_duoc_ky('receive', p_facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kiem_ke'; END IF;
  IF EXISTS (SELECT 1 FROM public.raw_stocktakes WHERE facility_id = p_facility_id AND status IN ('draft', 'counted')) THEN
    RAISE EXCEPTION 'DANG_CO_KIEM_KE_MO';
  END IF;
  SELECT upper(code) INTO v_fcode FROM public.facilities WHERE id = p_facility_id;
  v_code := 'KK-NVL-' || COALESCE(v_fcode, 'XX') || '-' || to_char(p_ngay, 'YYMMDD') || '-';
  SELECT COALESCE(max(NULLIF(regexp_replace(code, '^' || v_code, ''), code)::int), 0) + 1 INTO v_n
    FROM public.raw_stocktakes WHERE code LIKE v_code || '%';
  v_code := v_code || lpad(v_n::text, 2, '0');

  INSERT INTO public.raw_stocktakes (code, facility_id, ngay_kiem_ke, note, created_by)
  VALUES (v_code, p_facility_id, p_ngay, p_note, v_emp) RETURNING id INTO v_id;

  INSERT INTO public.raw_stocktake_lines (stocktake_id, batch_id, rubber_type, book_wet_kg, book_drc_pct, book_dry_kg)
  SELECT v_id, v.batch_id, v.rubber_type, v.wet_kg, v.drc_pct, v.dry_kg
    FROM public.v_raw_stock_balance v
   WHERE v.facility_id = p_facility_id AND v.dry_kg > 0.005;
  GET DIAGNOSTICS v_so = ROW_COUNT;
  IF v_so = 0 THEN RAISE EXCEPTION 'KHO_TRONG'; END IF;
  RETURN v_id;
END $$;

-- Ghi số đếm một lô
CREATE OR REPLACE FUNCTION public.fn_nvl_ghi_dem_kiem_ke(p_line_id uuid, p_counted_wet_kg numeric, p_counted_drc_pct numeric DEFAULT NULL, p_ly_do text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l       record;
  st      record;
  s       public.raw_settings;
  v_emp   uuid := public.fn_nvl_emp_hien_tai();
  v_drc   numeric;
  v_dry   numeric;
  v_lech  numeric;
BEGIN
  SELECT * INTO l FROM public.raw_stocktake_lines WHERE id = p_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_DONG'; END IF;
  SELECT * INTO st FROM public.raw_stocktakes WHERE id = l.stocktake_id FOR UPDATE;
  IF st.status NOT IN ('draft', 'counted') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', st.code, st.status; END IF;
  IF NOT public.fn_nvl_duoc_ky('receive', st.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kiem_ke'; END IF;
  IF p_counted_wet_kg IS NULL OR p_counted_wet_kg < 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;

  s := public.fn_raw_setting(st.facility_id);
  v_drc := COALESCE(p_counted_drc_pct, l.book_drc_pct);
  v_dry := round(p_counted_wet_kg * COALESCE(v_drc, 0) / 100, 2);
  v_lech := CASE WHEN l.book_dry_kg > 0 THEN round(100 * (v_dry - l.book_dry_kg) / l.book_dry_kg, 3) ELSE NULL END;
  IF v_lech IS NOT NULL AND abs(v_lech) > s.nguong_lech_kho_pct AND (p_ly_do IS NULL OR btrim(p_ly_do) = '') THEN
    RAISE EXCEPTION 'CAN_LY_DO:%:lệch khô % %%', (SELECT batch_no FROM public.stock_batches WHERE id = l.batch_id), v_lech;
  END IF;

  UPDATE public.raw_stocktake_lines
     SET counted_wet_kg = p_counted_wet_kg, counted_drc_pct = p_counted_drc_pct, counted_dry_kg = v_dry,
         chenh_uot_kg = round(p_counted_wet_kg - book_wet_kg, 2), chenh_kho_kg = round(v_dry - book_dry_kg, 2),
         lech_kho_pct = v_lech, ly_do = NULLIF(btrim(COALESCE(p_ly_do, '')), ''), note = COALESCE(p_note, note),
         counted_at = now(), counted_by = v_emp
   WHERE id = p_line_id;
  UPDATE public.raw_stocktakes SET status = CASE WHEN status = 'draft' THEN 'draft' ELSE status END, updated_at = now() WHERE id = st.id;

  RETURN jsonb_build_object('counted_dry_kg', v_dry, 'chenh_kho_kg', round(v_dry - l.book_dry_kg, 2), 'lech_kho_pct', v_lech,
                            'vuot_nguong', (v_lech IS NOT NULL AND abs(v_lech) > s.nguong_lech_kho_pct));
END $$;

-- Ký kiểm kê: count_done (thủ kho) → approve (BGĐ / approver: ghi sổ + khóa kỳ) | cancel
CREATE OR REPLACE FUNCTION public.fn_nvl_ky_kiem_ke(p_stocktake_id uuid, p_buoc text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  st     record;
  l      record;
  b      record;
  v_emp  uuid := public.fn_nvl_emp_hien_tai();
  v_n    int := 0;
  v_kho  numeric := 0;
BEGIN
  SELECT * INTO st FROM public.raw_stocktakes WHERE id = p_stocktake_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_KIEM_KE'; END IF;

  CASE p_buoc
    WHEN 'count_done' THEN
      IF st.status <> 'draft' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', st.code, st.status; END IF;
      IF NOT public.fn_nvl_duoc_ky('receive', st.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kiem_ke'; END IF;
      IF EXISTS (SELECT 1 FROM public.raw_stocktake_lines WHERE stocktake_id = st.id AND counted_wet_kg IS NULL) THEN
        RAISE EXCEPTION 'CON_LO_CHUA_DEM:%', st.code;
      END IF;
      UPDATE public.raw_stocktakes SET status = 'counted', counted_by = v_emp, counted_at = now(), note = COALESCE(p_note, note), updated_at = now() WHERE id = st.id;

    WHEN 'approve' THEN
      IF st.status <> 'counted' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', st.code, st.status; END IF;
      IF NOT public.fn_nvl_duoc_ky('approve_adjust', st.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:approve_adjust'; END IF;

      FOR l IN SELECT * FROM public.raw_stocktake_lines WHERE stocktake_id = st.id ORDER BY batch_id LOOP
        -- So với SỔ HIỆN TẠI (có thể đã đổi sau lúc chụp): điều chỉnh = đếm − sổ hiện tại
        SELECT * INTO b FROM public.v_raw_stock_balance WHERE batch_id = l.batch_id;
        IF b.batch_id IS NULL THEN CONTINUE; END IF;
        IF abs(l.counted_dry_kg - b.dry_kg) < 0.005 AND abs(l.counted_wet_kg - b.wet_kg) < 0.005 THEN CONTINUE; END IF;

        INSERT INTO public.raw_stock_ledger (facility_id, batch_id, rubber_type, txn_type, txn_date, wet_kg, drc_pct, dry_kg,
                                             ref_type, ref_id, note, created_by, lech_kho_pct, ly_do)
        VALUES (st.facility_id, l.batch_id, l.rubber_type, 'stocktake_adjust', current_date,
                round(l.counted_wet_kg - b.wet_kg, 2), COALESCE(l.counted_drc_pct, b.drc_pct), round(l.counted_dry_kg - b.dry_kg, 2),
                'stocktake', st.id, 'Kiểm kê ' || st.code || ' ngày ' || to_char(st.ngay_kiem_ke, 'DD/MM/YYYY'), v_emp,
                CASE WHEN b.dry_kg > 0 THEN round(100 * (l.counted_dry_kg - b.dry_kg) / b.dry_kg, 3) END, l.ly_do);

        UPDATE public.stock_batches
           SET current_weight = l.counted_wet_kg, dry_weight = l.counted_dry_kg,
               latest_drc = COALESCE(l.counted_drc_pct, latest_drc),
               last_weight_check = now(),
               status = CASE WHEN l.counted_dry_kg <= 0.005 THEN 'depleted' ELSE status END,
               updated_at = now()
         WHERE id = l.batch_id;
        v_n := v_n + 1; v_kho := v_kho + round(l.counted_dry_kg - b.dry_kg, 2);
      END LOOP;

      UPDATE public.raw_stocktakes SET status = 'approved', approved_by = v_emp, approved_at = now(), updated_at = now() WHERE id = st.id;
      -- Khóa kỳ đến ngày kiểm kê (chỉ tiến, không lùi)
      UPDATE public.raw_settings SET ngay_khoa_so = GREATEST(COALESCE(ngay_khoa_so, st.ngay_kiem_ke), st.ngay_kiem_ke), updated_by = v_emp
       WHERE facility_id = st.facility_id;
      IF NOT FOUND THEN
        INSERT INTO public.raw_settings (facility_id, ngay_khoa_so, notes) VALUES (st.facility_id, st.ngay_kiem_ke, 'Tạo khi duyệt kiểm kê');
      END IF;

    WHEN 'cancel' THEN
      IF st.status = 'approved' THEN RAISE EXCEPTION 'DA_DUYET:%', st.code; END IF;
      UPDATE public.raw_stocktakes SET status = 'cancelled', cancelled_at = now(), note = COALESCE(p_note, note), updated_at = now() WHERE id = st.id;
    ELSE
      RAISE EXCEPTION 'BUOC_KHONG_HOP_LE:%', p_buoc;
  END CASE;

  RETURN jsonb_build_object('code', st.code, 'buoc', p_buoc, 'so_lo_dieu_chinh', v_n, 'chenh_kho_kg', v_kho);
END $$;

GRANT EXECUTE ON FUNCTION public.fn_nvl_tao_kiem_ke(uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nvl_ghi_dem_kiem_ke(uuid, numeric, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nvl_ky_kiem_ke(uuid, text, text) TO authenticated;

CREATE OR REPLACE VIEW public.v_raw_stocktakes AS
SELECT st.*, f.code AS facility_code,
       (SELECT count(*) FROM public.raw_stocktake_lines l WHERE l.stocktake_id = st.id)::int AS so_lo,
       (SELECT count(*) FROM public.raw_stocktake_lines l WHERE l.stocktake_id = st.id AND l.counted_wet_kg IS NULL)::int AS so_lo_chua_dem,
       (SELECT round(sum(l.book_dry_kg), 2) FROM public.raw_stocktake_lines l WHERE l.stocktake_id = st.id) AS book_dry_kg,
       (SELECT round(sum(l.counted_dry_kg), 2) FROM public.raw_stocktake_lines l WHERE l.stocktake_id = st.id) AS counted_dry_kg,
       (SELECT round(sum(l.chenh_kho_kg), 2) FROM public.raw_stocktake_lines l WHERE l.stocktake_id = st.id) AS chenh_kho_kg,
       (SELECT count(*) FROM public.raw_stocktake_lines l WHERE l.stocktake_id = st.id AND l.lech_kho_pct IS NOT NULL
          AND abs(l.lech_kho_pct) > (public.fn_raw_setting(st.facility_id)).nguong_lech_kho_pct)::int AS so_lo_lech,
       ec.full_name AS counted_name, ea.full_name AS approved_name
FROM public.raw_stocktakes st
LEFT JOIN public.facilities f ON f.id = st.facility_id
LEFT JOIN public.employees ec ON ec.id = st.counted_by
LEFT JOIN public.employees ea ON ea.id = st.approved_by;

CREATE OR REPLACE VIEW public.v_raw_stocktake_lines AS
SELECT l.*, b.batch_no, b.supplier_name, rt.name AS rubber_type_name, rt.nhom, v.tuoi_ngay, v.wet_kg AS now_wet_kg, v.dry_kg AS now_dry_kg
FROM public.raw_stocktake_lines l
JOIN public.stock_batches b ON b.id = l.batch_id
JOIN public.raw_rubber_types rt ON rt.code = l.rubber_type
LEFT JOIN public.v_raw_stock_balance v ON v.batch_id = l.batch_id;

ALTER VIEW public.v_raw_stocktakes SET (security_invoker = on);
ALTER VIEW public.v_raw_stocktake_lines SET (security_invoker = on);
GRANT SELECT ON public.v_raw_stocktakes, public.v_raw_stocktake_lines TO authenticated;

-- ─── 3) BÁO CÁO CÂN ĐỐI THÁNG ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_raw_balance_month(p_facility_id uuid, p_month date)
RETURNS TABLE (
  rubber_type text, rubber_type_name text, nhom text,
  ton_dau_kho numeric, mo_so_kho numeric, nhap_kho numeric, xuat_sx_kho numeric, xuat_khac_kho numeric, dieu_chinh_kho numeric, ton_cuoi_kho numeric,
  kiem_ke_kho numeric, chenh_kho numeric, chenh_pct numeric,
  ton_dau_uot numeric, nhap_uot numeric, xuat_uot numeric, dieu_chinh_uot numeric, ton_cuoi_uot numeric,
  so_lo_cuoi int
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH kyi AS (
    SELECT date_trunc('month', p_month)::date AS d1, (date_trunc('month', p_month) + interval '1 month')::date AS d2
  ),
  led AS (
    SELECT l.rubber_type,
           sum(l.dry_kg) FILTER (WHERE l.txn_date < k.d1) AS ton_dau_kho,
           sum(l.wet_kg) FILTER (WHERE l.txn_date < k.d1) AS ton_dau_uot,
           sum(l.dry_kg) FILTER (WHERE l.txn_date >= k.d1 AND l.txn_date < k.d2 AND l.txn_type = 'opening') AS mo_so_kho,
           sum(l.dry_kg) FILTER (WHERE l.txn_date >= k.d1 AND l.txn_date < k.d2 AND l.txn_type IN ('in', 'in_transfer')) AS nhap_kho,
           sum(l.wet_kg) FILTER (WHERE l.txn_date >= k.d1 AND l.txn_date < k.d2 AND l.txn_type IN ('in', 'in_transfer', 'opening')) AS nhap_uot,
           -sum(l.dry_kg) FILTER (WHERE l.txn_date >= k.d1 AND l.txn_date < k.d2 AND l.txn_type = 'out_production') AS xuat_sx_kho,
           -sum(l.dry_kg) FILTER (WHERE l.txn_date >= k.d1 AND l.txn_date < k.d2 AND l.txn_type IN ('out_sale', 'out_transfer')) AS xuat_khac_kho,
           -sum(l.wet_kg) FILTER (WHERE l.txn_date >= k.d1 AND l.txn_date < k.d2 AND l.txn_type LIKE 'out_%') AS xuat_uot,
           sum(l.dry_kg) FILTER (WHERE l.txn_date >= k.d1 AND l.txn_date < k.d2 AND l.txn_type IN ('recheck_adjust', 'stocktake_adjust')) AS dieu_chinh_kho,
           sum(l.wet_kg) FILTER (WHERE l.txn_date >= k.d1 AND l.txn_date < k.d2 AND l.txn_type IN ('recheck_adjust', 'stocktake_adjust')) AS dieu_chinh_uot,
           sum(l.dry_kg) FILTER (WHERE l.txn_date < k.d2) AS ton_cuoi_kho,
           sum(l.wet_kg) FILTER (WHERE l.txn_date < k.d2) AS ton_cuoi_uot
      FROM public.raw_stock_ledger l CROSS JOIN kyi k
     WHERE l.facility_id = p_facility_id
     GROUP BY l.rubber_type
  ),
  kk AS (
    -- Kiểm kê đã duyệt mới nhất trong tháng
    SELECT l.rubber_type, sum(l.counted_dry_kg) AS kiem_ke_kho
      FROM public.raw_stocktake_lines l
      JOIN public.raw_stocktakes st ON st.id = l.stocktake_id
      CROSS JOIN kyi k
     WHERE st.facility_id = p_facility_id AND st.status = 'approved'
       AND st.ngay_kiem_ke >= k.d1 AND st.ngay_kiem_ke < k.d2
       AND st.id = (SELECT id FROM public.raw_stocktakes s2 WHERE s2.facility_id = p_facility_id AND s2.status = 'approved'
                     AND s2.ngay_kiem_ke >= k.d1 AND s2.ngay_kiem_ke < k.d2 ORDER BY s2.ngay_kiem_ke DESC, s2.approved_at DESC LIMIT 1)
     GROUP BY l.rubber_type
  ),
  lo AS (
    SELECT v.rubber_type, count(*)::int AS so_lo_cuoi FROM public.v_raw_stock_balance v
     WHERE v.facility_id = p_facility_id AND v.dry_kg > 0.005 GROUP BY v.rubber_type
  )
  SELECT led.rubber_type, rt.name, rt.nhom,
         round(COALESCE(led.ton_dau_kho, 0), 2), round(COALESCE(led.mo_so_kho, 0), 2), round(COALESCE(led.nhap_kho, 0), 2),
         round(COALESCE(led.xuat_sx_kho, 0), 2), round(COALESCE(led.xuat_khac_kho, 0), 2), round(COALESCE(led.dieu_chinh_kho, 0), 2),
         round(COALESCE(led.ton_cuoi_kho, 0), 2),
         kk.kiem_ke_kho,
         CASE WHEN kk.kiem_ke_kho IS NOT NULL THEN round(kk.kiem_ke_kho - COALESCE(led.ton_cuoi_kho, 0), 2) END,
         CASE WHEN kk.kiem_ke_kho IS NOT NULL AND COALESCE(led.ton_cuoi_kho, 0) > 0
              THEN round(100 * (kk.kiem_ke_kho - led.ton_cuoi_kho) / led.ton_cuoi_kho, 2) END,
         round(COALESCE(led.ton_dau_uot, 0), 2), round(COALESCE(led.nhap_uot, 0), 2), round(COALESCE(led.xuat_uot, 0), 2),
         round(COALESCE(led.dieu_chinh_uot, 0), 2), round(COALESCE(led.ton_cuoi_uot, 0), 2),
         COALESCE(lo.so_lo_cuoi, 0)
    FROM led
    JOIN public.raw_rubber_types rt ON rt.code = led.rubber_type
    LEFT JOIN kk ON kk.rubber_type = led.rubber_type
    LEFT JOIN lo ON lo.rubber_type = led.rubber_type
   ORDER BY rt.sort_order
$$;
GRANT EXECUTE ON FUNCTION public.fn_raw_balance_month(uuid, date) TO authenticated;

-- ─── 4) HAO ƯỚT THEO TUỔI LÔ (từ các lần cân lại, 180 ngày) ────────────────
CREATE OR REPLACE VIEW public.v_raw_wet_loss_by_age AS
WITH adj AS (
  SELECT l.facility_id, l.batch_id, l.rubber_type, l.txn_date, l.wet_kg AS d_wet, l.dry_kg AS d_dry, l.drc_pct AS drc_moi,
         (SELECT sum(p.wet_kg) FROM public.raw_stock_ledger p WHERE p.batch_id = l.batch_id AND (p.txn_date < l.txn_date OR (p.txn_date = l.txn_date AND p.created_at < l.created_at))) AS wet_truoc,
         (SELECT sum(p.dry_kg) FROM public.raw_stock_ledger p WHERE p.batch_id = l.batch_id AND (p.txn_date < l.txn_date OR (p.txn_date = l.txn_date AND p.created_at < l.created_at))) AS dry_truoc,
         (l.txn_date - COALESCE(b.received_date::date, l.txn_date))::int AS tuoi_ngay
    FROM public.raw_stock_ledger l
    JOIN public.stock_batches b ON b.id = l.batch_id
    JOIN public.raw_rubber_types rt ON rt.code = l.rubber_type
   WHERE l.txn_type = 'recheck_adjust' AND rt.nhom = 'mu_tho' AND l.txn_date >= current_date - 180
)
SELECT facility_id, rubber_type,
       CASE WHEN tuoi_ngay <= 7 THEN '0–7' WHEN tuoi_ngay <= 14 THEN '8–14' WHEN tuoi_ngay <= 21 THEN '15–21' ELSE '>21' END AS nhom_tuoi,
       CASE WHEN tuoi_ngay <= 7 THEN 1 WHEN tuoi_ngay <= 14 THEN 2 WHEN tuoi_ngay <= 21 THEN 3 ELSE 4 END AS thu_tu,
       count(*)::int AS so_lan,
       round(avg(CASE WHEN wet_truoc > 0 THEN 100 * d_wet / wet_truoc END), 2) AS hao_uot_pct,
       round(avg(CASE WHEN wet_truoc > 0 AND drc_moi IS NOT NULL THEN drc_moi - 100 * dry_truoc / wet_truoc END), 2) AS drc_tang_diem,
       round(avg(CASE WHEN dry_truoc > 0 THEN 100 * d_dry / dry_truoc END), 2) AS kho_lech_pct
  FROM adj
 WHERE wet_truoc IS NOT NULL
 GROUP BY facility_id, rubber_type, 3, 4;

ALTER VIEW public.v_raw_wet_loss_by_age SET (security_invoker = on);
GRANT SELECT ON public.v_raw_wet_loss_by_age TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT to_regclass('public.raw_stocktakes') AS t1, to_regclass('public.raw_adjust_approvers') AS t2,
       to_regprocedure('public.fn_nvl_tao_kiem_ke(uuid,date,text)') AS f1,
       to_regprocedure('public.fn_nvl_ky_kiem_ke(uuid,text,text)') AS f2,
       to_regprocedure('public.fn_raw_balance_month(uuid,date)') AS f3;
SELECT * FROM public.fn_raw_balance_month((SELECT id FROM public.facilities WHERE code = 'PD'), current_date);
SELECT e.full_name FROM public.raw_adjust_approvers a JOIN public.employees e ON e.id = a.employee_id WHERE a.is_active;  -- Lê Duy Minh
