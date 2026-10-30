-- ============================================================
-- KHO NGUYÊN LIỆU MỦ — GĐ2: LỆNH XUẤT CHO SẢN XUẤT + CÂN LẠI / DRC ĐỊNH KỲ
-- Ngày: 2026-10-30
-- Phụ thuộc: GĐ1 (raw_stock_ledger, v_raw_stock_balance, fn_nvl_duoc_ky, raw_settings),
--            production_orders / production_order_items (p8), weight_check_logs (wms_rubber_fields)
--
-- Ý chính:
--   · Lệnh xuất NVL (raw_issue_orders + raw_issue_lines): chọn lô theo FIFO ở màn hình,
--     ghi KG CÂN THỰC từng lô khi lấy khỏi kho, ký 3 bước như sổ ca
--     (submit → qc_confirm → receive). CHỈ chữ ký "thủ kho nhận" mới trừ sổ:
--     dòng out_* = −kg cân thực × DRC hiện tại của lô. Lô còn dư giữ nguyên mã.
--   · Khi lệnh gắn lệnh sản xuất: ghi production_order_items (lô nguồn, DRC lúc xuất)
--     để truy xuất lô SVR ← lô NVL.
--   · Cân lại (fn_nvl_can_lai): ướt mới + DRC mới → dòng recheck_adjust = chênh lệch
--     ướt / khô; lệch khô quá ngưỡng raw_settings.nguong_lech_kho_pct thì BẮT ghi lý do.
--     Ghi cả weight_check_logs cũ để các báo cáo WMS hiện có vẫn thấy.
--   · Sửa nhỏ GĐ1: lô tồn đầu có DRC đo thật → qc_status 'passed' (không hiện "Chờ QC").
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── 0) Sổ: thêm 2 cột cho dòng điều chỉnh ─────────────────────────────────
ALTER TABLE public.raw_stock_ledger
  ADD COLUMN IF NOT EXISTS lech_kho_pct numeric(8,3),   -- % chênh khô so với trước khi điều chỉnh
  ADD COLUMN IF NOT EXISTS ly_do text;                  -- lý do khi vượt ngưỡng

-- ─── 1) LỆNH XUẤT ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raw_issue_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text UNIQUE NOT NULL,                       -- XK-NVL-PD-YYMMDD-NN
  facility_id         uuid NOT NULL REFERENCES public.facilities(id),
  muc_dich            text NOT NULL DEFAULT 'production',         -- production | sale | transfer
  production_order_id uuid REFERENCES public.production_orders(id),
  target_grade        text,
  nhu_cau_kho_kg      numeric(14,2),
  max_tap_pct         numeric(5,2),
  status              text NOT NULL DEFAULT 'draft',              -- draft | submitted | qc_confirmed | received | cancelled
  submitted_by        uuid REFERENCES public.employees(id),
  submitted_at        timestamptz,
  qc_confirmed_by     uuid REFERENCES public.employees(id),
  qc_confirmed_at     timestamptz,
  received_by         uuid REFERENCES public.employees(id),
  received_at         timestamptz,
  cancelled_by        uuid REFERENCES public.employees(id),
  cancelled_at        timestamptz,
  cancel_reason       text,
  note                text,
  created_by          uuid REFERENCES public.employees(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rio_muc_dich_chk CHECK (muc_dich IN ('production', 'sale', 'transfer')),
  CONSTRAINT rio_status_chk   CHECK (status IN ('draft', 'submitted', 'qc_confirmed', 'received', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS public.raw_issue_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES public.raw_issue_orders(id) ON DELETE CASCADE,
  line_no          int  NOT NULL,
  batch_id         uuid NOT NULL REFERENCES public.stock_batches(id),
  rubber_type      text NOT NULL REFERENCES public.raw_rubber_types(code),
  planned_wet_kg   numeric(14,2) NOT NULL,
  planned_drc_pct  numeric(5,2)  NOT NULL,
  planned_dry_kg   numeric(14,2) NOT NULL,
  actual_wet_kg    numeric(14,2),            -- kg cân thực khi lấy khỏi kho
  actual_drc_pct   numeric(5,2),             -- DRC lô lúc thủ kho nhận (trừ sổ)
  actual_dry_kg    numeric(14,2),
  weighed_at       timestamptz,
  weighed_by       uuid REFERENCES public.employees(id),
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ril_order_batch_uniq UNIQUE (order_id, batch_id),
  CONSTRAINT ril_planned_chk CHECK (planned_wet_kg > 0),
  CONSTRAINT ril_actual_chk  CHECK (actual_wet_kg IS NULL OR actual_wet_kg >= 0)
);

CREATE INDEX IF NOT EXISTS rio_facility_status_idx ON public.raw_issue_orders (facility_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ril_order_idx ON public.raw_issue_lines (order_id, line_no);
CREATE INDEX IF NOT EXISTS ril_batch_idx ON public.raw_issue_lines (batch_id);

COMMENT ON TABLE public.raw_issue_orders IS 'Lệnh xuất kho NVL: 3 chữ ký, chỉ "received" mới trừ sổ kho khô theo kg cân thực.';

ALTER TABLE public.raw_issue_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_issue_lines  ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY rio_select ON public.raw_issue_orders FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY ril_select ON public.raw_issue_lines FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Ghi: chỉ qua hàm (SECURITY DEFINER); BGĐ sửa tay khi cần
DO $$ BEGIN
  CREATE POLICY rio_write_bgd ON public.raw_issue_orders FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY ril_write_bgd ON public.raw_issue_lines FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Mã lệnh: XK-NVL-<NM>-<yymmdd>-<nn>
CREATE OR REPLACE FUNCTION public.fn_nvl_ma_lenh_xuat(p_facility_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text;
  v_prefix text;
  v_n int;
BEGIN
  SELECT upper(code) INTO v_code FROM public.facilities WHERE id = p_facility_id;
  v_prefix := 'XK-NVL-' || COALESCE(v_code, 'XX') || '-' || to_char(current_date, 'YYMMDD') || '-';
  SELECT COALESCE(max(NULLIF(regexp_replace(code, '^' || v_prefix, ''), code)::int), 0) + 1 INTO v_n
    FROM public.raw_issue_orders WHERE code LIKE v_prefix || '%';
  RETURN v_prefix || lpad(v_n::text, 2, '0');
END $$;

-- Tạo lệnh + dòng kế hoạch. p_lines = [{"batch_id": "...", "planned_wet_kg": 12000}, ...]
CREATE OR REPLACE FUNCTION public.fn_nvl_tao_lenh_xuat(
  p_facility_id uuid, p_muc_dich text, p_production_order_id uuid, p_target_grade text,
  p_nhu_cau_kho_kg numeric, p_max_tap_pct numeric, p_note text, p_lines jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id    uuid;
  v_emp   uuid := public.fn_nvl_emp_hien_tai();
  v_line  jsonb;
  v_n     int := 0;
  b       record;
  v_wet   numeric;
BEGIN
  IF NOT public.fn_nvl_duoc_ky('submit', p_facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN RAISE EXCEPTION 'LENH_TRONG'; END IF;

  INSERT INTO public.raw_issue_orders (code, facility_id, muc_dich, production_order_id, target_grade, nhu_cau_kho_kg, max_tap_pct, note, created_by)
  VALUES (public.fn_nvl_ma_lenh_xuat(p_facility_id), p_facility_id, COALESCE(p_muc_dich, 'production'), p_production_order_id,
          p_target_grade, p_nhu_cau_kho_kg, p_max_tap_pct, p_note, v_emp)
  RETURNING id INTO v_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_n := v_n + 1;
    SELECT * INTO b FROM public.v_raw_stock_balance WHERE batch_id = (v_line->>'batch_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO:%', v_line->>'batch_id'; END IF;
    IF b.facility_id <> p_facility_id THEN RAISE EXCEPTION 'LO_KHAC_NHA_MAY:%', b.batch_no; END IF;
    IF b.dry_kg <= 0.005 THEN RAISE EXCEPTION 'LO_DA_HET:%', b.batch_no; END IF;
    v_wet := COALESCE((v_line->>'planned_wet_kg')::numeric, b.wet_kg);
    IF v_wet <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:%', b.batch_no; END IF;
    IF v_wet > b.wet_kg + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:kế hoạch % > tồn %', b.batch_no, v_wet, b.wet_kg; END IF;
    INSERT INTO public.raw_issue_lines (order_id, line_no, batch_id, rubber_type, planned_wet_kg, planned_drc_pct, planned_dry_kg)
    VALUES (v_id, v_n, b.batch_id, b.rubber_type, v_wet, b.drc_pct, round(v_wet * b.drc_pct / 100, 2));
  END LOOP;
  RETURN v_id;
END $$;

-- Ghi kg cân thực cho một dòng (khi lệnh còn draft)
CREATE OR REPLACE FUNCTION public.fn_nvl_ghi_can_xuat(p_line_id uuid, p_actual_wet_kg numeric, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l      record;
  o      record;
  b      record;
  v_emp  uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO l FROM public.raw_issue_lines WHERE id = p_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_DONG'; END IF;
  SELECT * INTO o FROM public.raw_issue_orders WHERE id = l.order_id FOR UPDATE;
  IF o.status <> 'draft' THEN RAISE EXCEPTION 'LENH_DA_GUI_KY:%', o.code; END IF;
  IF NOT public.fn_nvl_duoc_ky('submit', o.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  IF p_actual_wet_kg IS NULL OR p_actual_wet_kg < 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  SELECT * INTO b FROM public.v_raw_stock_balance WHERE batch_id = l.batch_id;
  IF p_actual_wet_kg > b.wet_kg + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:cân % > tồn %', b.batch_no, p_actual_wet_kg, b.wet_kg; END IF;

  UPDATE public.raw_issue_lines
     SET actual_wet_kg = p_actual_wet_kg, weighed_at = now(), weighed_by = v_emp,
         note = COALESCE(p_note, note)
   WHERE id = p_line_id;
  UPDATE public.raw_issue_orders SET updated_at = now() WHERE id = o.id;
END $$;

-- Ký: submit → qc_confirm → receive (trừ sổ) | cancel
CREATE OR REPLACE FUNCTION public.fn_nvl_ky_lenh_xuat(p_order_id uuid, p_buoc text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o        record;
  l        record;
  b        record;
  v_emp    uuid := public.fn_nvl_emp_hien_tai();
  v_txn    text;
  v_dry    numeric;
  v_tong_uot numeric := 0;
  v_tong_kho numeric := 0;
  v_so     int := 0;
BEGIN
  SELECT * INTO o FROM public.raw_issue_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LENH'; END IF;
  IF NOT public.fn_nvl_duoc_ky(p_buoc, o.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:%', p_buoc; END IF;

  CASE p_buoc
    WHEN 'submit' THEN
      IF o.status <> 'draft' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', o.code, o.status; END IF;
      IF EXISTS (SELECT 1 FROM public.raw_issue_lines WHERE order_id = o.id AND (actual_wet_kg IS NULL OR actual_wet_kg <= 0)) THEN
        RAISE EXCEPTION 'THIEU_KG_CAN:%', o.code;   -- không ký khi còn dòng chưa cân
      END IF;
      UPDATE public.raw_issue_orders SET status = 'submitted', submitted_by = v_emp, submitted_at = now(),
             note = COALESCE(p_note, note), updated_at = now() WHERE id = o.id;

    WHEN 'qc_confirm' THEN
      IF o.status <> 'submitted' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', o.code, o.status; END IF;
      UPDATE public.raw_issue_orders SET status = 'qc_confirmed', qc_confirmed_by = v_emp, qc_confirmed_at = now(), updated_at = now() WHERE id = o.id;

    WHEN 'receive' THEN
      IF o.status <> 'qc_confirmed' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', o.code, o.status; END IF;
      v_txn := CASE o.muc_dich WHEN 'sale' THEN 'out_sale' WHEN 'transfer' THEN 'out_transfer' ELSE 'out_production' END;

      FOR l IN SELECT * FROM public.raw_issue_lines WHERE order_id = o.id ORDER BY line_no LOOP
        SELECT * INTO b FROM public.v_raw_stock_balance WHERE batch_id = l.batch_id;
        IF l.actual_wet_kg IS NULL OR l.actual_wet_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KG_CAN:%:dòng %', o.code, l.line_no; END IF;
        IF l.actual_wet_kg > b.wet_kg + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:cân % > tồn %', b.batch_no, l.actual_wet_kg, b.wet_kg; END IF;
        v_dry := round(l.actual_wet_kg * b.drc_pct / 100, 2);
        -- Lấy hết lô (sai số làm tròn) thì trừ đúng phần khô còn lại để lô về 0
        IF abs(l.actual_wet_kg - b.wet_kg) <= 0.01 THEN v_dry := b.dry_kg; END IF;

        INSERT INTO public.raw_stock_ledger (facility_id, batch_id, rubber_type, txn_type, txn_date, wet_kg, drc_pct, dry_kg,
                                             ref_type, ref_id, ref_line, note, created_by)
        VALUES (o.facility_id, l.batch_id, l.rubber_type, v_txn, current_date, -l.actual_wet_kg, b.drc_pct, -v_dry,
                'raw_issue', o.id, l.line_no, 'Lệnh xuất ' || o.code || COALESCE(' · LSX ' || (SELECT code FROM public.production_orders WHERE id = o.production_order_id), ''), v_emp);

        UPDATE public.raw_issue_lines SET actual_drc_pct = b.drc_pct, actual_dry_kg = v_dry WHERE id = l.id;

        UPDATE public.stock_batches
           SET current_weight = GREATEST(b.wet_kg - l.actual_wet_kg, 0),
               dry_weight     = GREATEST(b.dry_kg - v_dry, 0),
               weight_loss    = COALESCE(initial_weight, 0) - GREATEST(b.wet_kg - l.actual_wet_kg, 0),
               status         = CASE WHEN b.dry_kg - v_dry <= 0.005 THEN 'depleted' ELSE status END,
               updated_at     = now()
         WHERE id = l.batch_id;

        -- Truy xuất: lô SVR ← lô NVL
        IF o.production_order_id IS NOT NULL THEN
          INSERT INTO public.production_order_items (production_order_id, source_batch_id, required_quantity, allocated_quantity,
                                                     drc_at_intake, actual_input_quantity, actual_drc_before, notes)
          VALUES (o.production_order_id, l.batch_id, l.actual_wet_kg, l.actual_wet_kg, b.drc_pct, l.actual_wet_kg, b.drc_pct,
                  'Lệnh xuất NVL ' || o.code || ' dòng ' || l.line_no || ' · ' || v_dry || ' kg khô');
        END IF;

        v_tong_uot := v_tong_uot + l.actual_wet_kg; v_tong_kho := v_tong_kho + v_dry; v_so := v_so + 1;
      END LOOP;

      UPDATE public.raw_issue_orders SET status = 'received', received_by = v_emp, received_at = now(), updated_at = now() WHERE id = o.id;

    WHEN 'cancel' THEN
      IF o.status = 'received' THEN RAISE EXCEPTION 'DA_TRU_SO:%', o.code; END IF;
      UPDATE public.raw_issue_orders SET status = 'cancelled', cancelled_by = v_emp, cancelled_at = now(),
             cancel_reason = p_note, updated_at = now() WHERE id = o.id;
    ELSE
      RAISE EXCEPTION 'BUOC_KHONG_HOP_LE:%', p_buoc;
  END CASE;

  RETURN jsonb_build_object('order_id', o.id, 'code', o.code, 'buoc', p_buoc, 'so_dong', v_so, 'uot_kg', v_tong_uot, 'kho_kg', v_tong_kho);
END $$;

GRANT EXECUTE ON FUNCTION public.fn_nvl_ma_lenh_xuat(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nvl_tao_lenh_xuat(uuid, text, uuid, text, numeric, numeric, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nvl_ghi_can_xuat(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nvl_ky_lenh_xuat(uuid, text, text) TO authenticated;

-- Views lệnh xuất
CREATE OR REPLACE VIEW public.v_raw_issue_orders AS
SELECT o.*,
       f.code AS facility_code,
       po.code AS production_code,
       po.target_grade AS production_grade,
       (SELECT count(*) FROM public.raw_issue_lines l WHERE l.order_id = o.id)::int AS so_dong,
       (SELECT round(sum(l.planned_wet_kg), 2) FROM public.raw_issue_lines l WHERE l.order_id = o.id) AS planned_wet_kg,
       (SELECT round(sum(l.planned_dry_kg), 2) FROM public.raw_issue_lines l WHERE l.order_id = o.id) AS planned_dry_kg,
       (SELECT round(sum(l.actual_wet_kg), 2) FROM public.raw_issue_lines l WHERE l.order_id = o.id) AS actual_wet_kg,
       (SELECT round(sum(l.actual_dry_kg), 2) FROM public.raw_issue_lines l WHERE l.order_id = o.id) AS actual_dry_kg,
       (SELECT count(*) FROM public.raw_issue_lines l WHERE l.order_id = o.id AND l.actual_wet_kg IS NULL)::int AS so_dong_chua_can,
       es.full_name AS submitted_name, eq.full_name AS qc_confirmed_name, er.full_name AS received_name
FROM public.raw_issue_orders o
LEFT JOIN public.facilities f ON f.id = o.facility_id
LEFT JOIN public.production_orders po ON po.id = o.production_order_id
LEFT JOIN public.employees es ON es.id = o.submitted_by
LEFT JOIN public.employees eq ON eq.id = o.qc_confirmed_by
LEFT JOIN public.employees er ON er.id = o.received_by;

CREATE OR REPLACE VIEW public.v_raw_issue_lines AS
SELECT l.*, b.batch_no, rt.name AS rubber_type_name, rt.nhom,
       v.wet_kg AS ton_wet_kg, v.dry_kg AS ton_dry_kg, v.drc_pct AS ton_drc_pct, v.tuoi_ngay, b.supplier_name
FROM public.raw_issue_lines l
JOIN public.stock_batches b ON b.id = l.batch_id
JOIN public.raw_rubber_types rt ON rt.code = l.rubber_type
LEFT JOIN public.v_raw_stock_balance v ON v.batch_id = l.batch_id;

ALTER VIEW public.v_raw_issue_orders SET (security_invoker = on);
ALTER VIEW public.v_raw_issue_lines  SET (security_invoker = on);
GRANT SELECT ON public.v_raw_issue_orders, public.v_raw_issue_lines TO authenticated;

-- ─── 2) CÂN LẠI / DRC ĐỊNH KỲ ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_nvl_can_lai(
  p_batch_id uuid, p_wet_kg numeric, p_drc_pct numeric DEFAULT NULL, p_ly_do text DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b         record;
  s         public.raw_settings;
  q         json;
  v_emp     uuid := public.fn_nvl_emp_hien_tai();
  v_drc     numeric;
  v_dry_new numeric;
  v_lech    numeric;
BEGIN
  IF p_wet_kg IS NULL OR p_wet_kg < 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  IF p_drc_pct IS NOT NULL AND (p_drc_pct <= 0 OR p_drc_pct > 100) THEN RAISE EXCEPTION 'DRC_KHONG_HOP_LE:%', p_drc_pct; END IF;

  SELECT * INTO b FROM public.v_raw_stock_balance WHERE batch_id = p_batch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF b.dry_kg <= 0.005 THEN RAISE EXCEPTION 'LO_DA_HET:%', b.batch_no; END IF;

  q := public.fn_nvl_quyen(b.facility_id);
  IF NOT ((q->>'la_qc')::boolean OR (q->>'la_thu_kho')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN
    RAISE EXCEPTION 'KHONG_CO_QUYEN';
  END IF;

  s := public.fn_raw_setting(b.facility_id);
  v_drc := COALESCE(p_drc_pct, b.drc_pct);
  v_dry_new := round(p_wet_kg * v_drc / 100, 2);
  v_lech := CASE WHEN b.dry_kg > 0 THEN round(100 * (v_dry_new - b.dry_kg) / b.dry_kg, 3) ELSE NULL END;

  IF v_lech IS NOT NULL AND abs(v_lech) > s.nguong_lech_kho_pct AND (p_ly_do IS NULL OR btrim(p_ly_do) = '') THEN
    RAISE EXCEPTION 'CAN_LY_DO:%:lệch khô % %% vượt ngưỡng % %%', b.batch_no, v_lech, s.nguong_lech_kho_pct;
  END IF;

  INSERT INTO public.raw_stock_ledger (facility_id, batch_id, rubber_type, txn_type, txn_date, wet_kg, drc_pct, dry_kg,
                                       ref_type, ref_id, note, created_by, lech_kho_pct, ly_do)
  VALUES (b.facility_id, b.batch_id, b.rubber_type, 'recheck_adjust', current_date,
          round(p_wet_kg - b.wet_kg, 2), v_drc, round(v_dry_new - b.dry_kg, 2),
          'weight_check', NULL,
          'Cân lại: ' || b.wet_kg || ' → ' || p_wet_kg || ' kg ướt'
            || CASE WHEN p_drc_pct IS NOT NULL THEN ' · DRC ' || b.drc_pct || ' → ' || p_drc_pct || ' %' ELSE ' · DRC giữ ' || b.drc_pct || ' %' END
            || COALESCE(' · ' || p_note, ''),
          v_emp, v_lech, NULLIF(btrim(COALESCE(p_ly_do, '')), ''));

  -- Sổ cũ của WMS vẫn thấy lần cân
  INSERT INTO public.weight_check_logs (batch_id, previous_weight, new_weight, weight_change, change_reason, checked_by, checked_at, notes)
  VALUES (b.batch_id, b.wet_kg, p_wet_kg, round(p_wet_kg - b.wet_kg, 2), 'reweigh', v_emp, now(),
          'Kho NVL cân lại' || COALESCE(' · lý do: ' || p_ly_do, '') || COALESCE(' · ' || p_note, ''));

  UPDATE public.stock_batches
     SET current_weight    = p_wet_kg,
         dry_weight        = v_dry_new,
         latest_drc        = v_drc,
         weight_loss       = COALESCE(initial_weight, 0) - p_wet_kg,
         last_weight_check = now(),
         last_qc_date      = CASE WHEN p_drc_pct IS NOT NULL THEN current_date ELSE last_qc_date END,
         next_recheck_date = current_date + s.chu_ky_can_lai_ngay,
         ton_dau_uoc       = CASE WHEN p_drc_pct IS NOT NULL THEN false ELSE ton_dau_uoc END,
         qc_status         = CASE WHEN p_drc_pct IS NOT NULL AND qc_status = 'pending' THEN 'passed' ELSE qc_status END,
         status            = CASE WHEN v_dry_new <= 0.005 THEN 'depleted' ELSE status END,
         updated_at        = now()
   WHERE id = b.batch_id;

  RETURN jsonb_build_object('batch_no', b.batch_no, 'wet_truoc', b.wet_kg, 'wet_sau', p_wet_kg,
                            'drc_truoc', b.drc_pct, 'drc_sau', v_drc, 'kho_truoc', b.dry_kg, 'kho_sau', v_dry_new,
                            'lech_kho_pct', v_lech, 'vuot_nguong', (v_lech IS NOT NULL AND abs(v_lech) > s.nguong_lech_kho_pct));
END $$;

GRANT EXECUTE ON FUNCTION public.fn_nvl_can_lai(uuid, numeric, numeric, text, text) TO authenticated;

-- Lô đến hạn cân lại (mủ thô còn hàng, quá chu kỳ hoặc tồn đầu ước)
CREATE OR REPLACE VIEW public.v_raw_recheck_due AS
SELECT v.*, s.chu_ky_can_lai_ngay, s.can_lai_truoc_xuat_ngay,
       (v.ngay_tu_lan_do >= s.chu_ky_can_lai_ngay) AS qua_chu_ky,
       (v.ngay_tu_lan_do - s.chu_ky_can_lai_ngay) AS qua_han_ngay
FROM public.v_raw_stock_balance v
CROSS JOIN LATERAL public.fn_raw_setting(v.facility_id) s
WHERE v.dry_kg > 0.005 AND v.nhom = 'mu_tho'
  AND (v.ngay_tu_lan_do >= s.chu_ky_can_lai_ngay OR v.ton_dau_uoc);

ALTER VIEW public.v_raw_recheck_due SET (security_invoker = on);
GRANT SELECT ON public.v_raw_recheck_due TO authenticated;

-- Lệch khô quá ngưỡng (90 ngày)
CREATE OR REPLACE VIEW public.v_raw_dry_variance AS
SELECT l.id AS ledger_id, l.facility_id, l.batch_id, b.batch_no, l.rubber_type, rt.name AS rubber_type_name,
       l.txn_date, l.txn_type, l.wet_kg AS chenh_uot_kg, l.dry_kg AS chenh_kho_kg, l.lech_kho_pct, l.ly_do, l.note, e.full_name AS nguoi_ghi
FROM public.raw_stock_ledger l
JOIN public.stock_batches b ON b.id = l.batch_id
JOIN public.raw_rubber_types rt ON rt.code = l.rubber_type
LEFT JOIN public.employees e ON e.id = l.created_by
CROSS JOIN LATERAL public.fn_raw_setting(l.facility_id) s
WHERE l.txn_type IN ('recheck_adjust', 'stocktake_adjust')
  AND l.lech_kho_pct IS NOT NULL AND abs(l.lech_kho_pct) > s.nguong_lech_kho_pct
  AND l.txn_date >= current_date - 90;

ALTER VIEW public.v_raw_dry_variance SET (security_invoker = on);
GRANT SELECT ON public.v_raw_dry_variance TO authenticated;

-- ─── 3) Cảnh báo: thêm đến hạn cân lại + lệch khô ──────────────────────────
CREATE OR REPLACE VIEW public.v_raw_alerts AS
SELECT v.facility_id, 'qua_tuoi'::text AS loai, 'cao'::text AS muc,
       v.batch_id, v.batch_no, NULL::uuid AS ticket_id, NULL::text AS ticket_code,
       'Lô ' || v.batch_no || ' tồn ' || v.tuoi_ngay || ' ngày (ngưỡng ' || s.tuoi_lo_canh_bao_ngay || ')' AS tieu_de,
       v.rubber_type_name || ' · ' || v.wet_kg || ' kg ướt · ' || v.dry_kg || ' kg khô' AS chi_tiet,
       v.tuoi_ngay::numeric AS gia_tri
  FROM public.v_raw_stock_balance v
  CROSS JOIN LATERAL public.fn_raw_setting(v.facility_id) s
 WHERE v.dry_kg > 0.005 AND v.nhom = 'mu_tho' AND v.tuoi_ngay > s.tuoi_lo_canh_bao_ngay
UNION ALL
SELECT d.facility_id, 'lech_kho', 'cao', d.batch_id, d.batch_no, NULL, NULL,
       'Lô ' || d.batch_no || ' lệch khô ' || d.lech_kho_pct || ' % khi ' || CASE d.txn_type WHEN 'recheck_adjust' THEN 'cân lại' ELSE 'kiểm kê' END || ' ' || to_char(d.txn_date, 'DD/MM'),
       COALESCE('Lý do: ' || d.ly_do, 'Chưa ghi lý do'),
       d.lech_kho_pct
  FROM public.v_raw_dry_variance d
 WHERE d.txn_date >= current_date - 30
UNION ALL
SELECT q.facility_id, CASE WHEN q.ly_do_cho = 'loai_mu_la' THEN 'loai_mu_la' ELSE 'cho_drc' END, 'vua',
       NULL, NULL, q.ticket_id, q.code,
       CASE WHEN q.ly_do_cho = 'loai_mu_la' THEN 'Phiếu ' || q.code || ' có loại mủ lạ: ' || COALESCE(q.rubber_type_goc, '(trống)')
            ELSE 'Phiếu ' || q.code || ' chờ DRC, chưa nhập kho được' END,
       COALESCE(q.supplier_name, '') || ' · ' || q.net_weight || ' kg ướt',
       NULL
  FROM public.v_raw_intake_queue q
 WHERE NOT q.da_nhap AND NOT q.san_sang
UNION ALL
SELECT r.facility_id, 'den_han_can_lai', 'vua', r.batch_id, r.batch_no, NULL, NULL,
       'Lô ' || r.batch_no || CASE WHEN r.ton_dau_uoc THEN ' tồn đầu ước, cần lấy mẫu DRC' ELSE ' đến hạn cân lại (' || r.ngay_tu_lan_do || ' ngày từ lần đo)' END,
       r.rubber_type_name || ' · ' || r.wet_kg || ' kg ướt · chu kỳ ' || r.chu_ky_can_lai_ngay || ' ngày',
       r.ngay_tu_lan_do::numeric
  FROM public.v_raw_recheck_due r
UNION ALL
SELECT q.facility_id, 'lech_drc_ncc', 'vua',
       NULL, NULL, q.ticket_id, q.code,
       COALESCE(q.supplier_name, 'NCC') || ': DRC thực thấp hơn khai báo ' || q.lech_drc_ncc || ' điểm',
       'Phiếu ' || q.code || ' · khai ' || q.expected_drc || ' % · đo ' || q.qc_actual_drc || ' %',
       q.lech_drc_ncc
  FROM public.v_raw_intake_queue q
  CROSS JOIN LATERAL public.fn_raw_setting(q.facility_id) s
 WHERE q.lech_drc_ncc > s.nguong_lech_drc_ncc_diem
   AND q.completed_at >= now() - interval '7 days';

ALTER VIEW public.v_raw_alerts SET (security_invoker = on);
GRANT SELECT ON public.v_raw_alerts TO authenticated;

-- ─── 4) Sửa nhỏ GĐ1: lô tồn đầu có DRC đo thật không phải "chờ QC" ─────────
UPDATE public.stock_batches b
   SET qc_status = 'passed', updated_at = now()
  FROM public.raw_opening_stock_staging st
 WHERE st.batch_id = b.id AND NOT st.drc_estimated AND b.qc_status = 'pending';

CREATE OR REPLACE FUNCTION public.fn_mo_so_ton_dau(p_facility_code text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r          record;
  v_fac      uuid;
  v_wh       uuid;
  v_emp      uuid := public.fn_nvl_emp_hien_tai();
  v_type     text;
  v_batch_id uuid;
  v_n        int := 0;
  v_kho      numeric := 0;
BEGIN
  FOR r IN
    SELECT s.*, c.ma_chuan, c.loi
      FROM public.raw_opening_stock_staging s
      JOIN public.v_raw_opening_stock_check c ON c.id = s.id
     WHERE s.processed_at IS NULL
       AND cardinality(c.loi) = 0
       AND (p_facility_code IS NULL OR upper(s.facility_code) = upper(p_facility_code))
     ORDER BY s.facility_code, s.intake_date NULLS LAST, s.batch_code
  LOOP
    SELECT id INTO v_fac FROM public.facilities WHERE upper(code) = upper(r.facility_code) LIMIT 1;
    IF NOT public.fn_nvl_duoc_ky('receive', v_fac) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN_NHAN'; END IF;
    v_wh := public.fn_nvl_kho_mac_dinh(v_fac);
    IF v_wh IS NULL THEN RAISE EXCEPTION 'THIEU_KHO_NVL:%', r.facility_code; END IF;
    v_type := r.ma_chuan;
    IF r.drc_pct IS NULL THEN RAISE EXCEPTION 'THIEU_DRC:%', r.batch_code; END IF;

    v_batch_id := public.fn_nvl_tao_lo(r.batch_code, v_fac, v_wh, v_type, r.wet_kg, r.drc_pct,
                    COALESCE(r.intake_date, current_date), r.supplier_name, NULL,
                    CASE WHEN r.drc_estimated THEN 'pending' ELSE 'passed' END,
                    'khac', r.drc_estimated, NULL, NULL, r.rubber_type);

    INSERT INTO public.raw_stock_ledger (facility_id, batch_id, rubber_type, txn_type, txn_date, wet_kg, drc_pct, dry_kg,
                                         ref_type, ref_id, note, created_by)
    VALUES (v_fac, v_batch_id, v_type, 'opening', current_date, r.wet_kg, r.drc_pct, round(r.wet_kg * r.drc_pct / 100, 2),
            'opening_staging', r.id,
            'Tồn đầu mở sổ' || CASE WHEN r.drc_estimated THEN ' (DRC ước)' ELSE '' END
              || COALESCE(' · phiếu gốc ' || r.ticket_code, ''), v_emp);

    UPDATE public.raw_opening_stock_staging SET processed_at = now(), batch_id = v_batch_id WHERE id = r.id;
    v_n := v_n + 1;
    v_kho := v_kho + round(r.wet_kg * r.drc_pct / 100, 2);
  END LOOP;

  RETURN jsonb_build_object('so_lo', v_n, 'kho_kg', v_kho);
END $$;

-- ─── 5) Làm mới schema cache của PostgREST (web thấy bảng/view mới ngay) ───
NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG (gửi lại kết quả) ──────────────────────────────────────────
SELECT to_regclass('public.raw_issue_orders') AS t1, to_regclass('public.raw_issue_lines') AS t2,
       to_regclass('public.v_raw_issue_orders') AS v1, to_regclass('public.v_raw_recheck_due') AS v2, to_regclass('public.v_raw_dry_variance') AS v3,
       to_regprocedure('public.fn_nvl_tao_lenh_xuat(uuid,text,uuid,text,numeric,numeric,text,jsonb)') AS f1,
       to_regprocedure('public.fn_nvl_ky_lenh_xuat(uuid,text,text)') AS f2,
       to_regprocedure('public.fn_nvl_can_lai(uuid,numeric,numeric,text,text)') AS f3,
       public.fn_nvl_ma_lenh_xuat((SELECT id FROM public.facilities WHERE code = 'PD')) AS vi_du_ma;   -- XK-NVL-PD-261030-01

-- Lô đến hạn cân lại / cảnh báo hiện có:
SELECT loai, muc, count(*) FROM public.v_raw_alerts GROUP BY 1, 2 ORDER BY 1;
