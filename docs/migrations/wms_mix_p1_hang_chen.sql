-- ============================================================
-- HÀNG CHÈN (MIX) — GĐ4: KHO CHÈN · PHIẾU CHÈN THEO CA · ẢNH · SỔ CA TỰ ĐIỀN
-- Ngày: 2026-10-30
-- Phụ thuộc: GĐ0–3 (raw_settings, fn_nvl_duoc_ky, fn_nvl_quyen, fn_nvl_emp_hien_tai),
--            shifts, shift_production_reports(facility_id, report_date, shift_id),
--            shift_production_lines (mã CHEN), materials, production_orders, stock_batches, v_vong_tai_che
--
-- Quyết định chủ DN 29/10: hàng chèn nhập theo KG (không bành); mỗi lần LẤY và TRẢ
-- bắt buộc 2 ảnh (toàn cảnh + màn hình cân), ảnh 3 bổ sung; kho chèn phải có tồn.
--
--   · mix_lots (lô chèn): nguồn loi | dkl | std | mua_ngoai | khac, chỉ số Po/Mooney/PRI,
--     QC cho phép (trộn tối đa %, chạy lại), DKL phải metal_cleared mới lấy được.
--     Tồn = kg_in − kg_used − kg_at_line (kg_at_line = đang nằm ở dây chuyền).
--   · mix_issues (phiếu chèn theo ca): lấy đầu ca (kg_out) → trả cuối ca (kg_return) →
--     ký submit → qc_confirm → receive. Chỉ "receive" mới đổi tồn kho chèn, ghi dòng CHÈN
--     của sổ ca (shift_production_lines.xuat_kg_manual = Σ kg_used ca đó) và v_vong_tai_che.
--     Dùng dở có thể bàn giao ca sau (handover): tự tạo phiếu lấy mới = kg trả.
--   · raw_photos: ảnh gắn chứng từ (ref_type/ref_id/kind). Bucket raw-photos public-read
--     như weighbridge-images. Thiếu ảnh bắt buộc thì không ký được.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── 1) ẢNH CHỨNG TỪ ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raw_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_type      text NOT NULL,        -- mix_issue_out | mix_issue_return | mix_lot | raw_issue | stocktake | raw_recheck
  ref_id        uuid NOT NULL,
  kind          text NOT NULL,        -- toan_canh | man_hinh_can | bo_sung
  storage_path  text NOT NULL,
  public_url    text,
  taken_at      timestamptz NOT NULL DEFAULT now(),
  gps_lat       numeric(10,7),
  gps_lng       numeric(10,7),
  taken_by      uuid REFERENCES public.employees(id),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raw_photos_kind_chk CHECK (kind IN ('toan_canh', 'man_hinh_can', 'bo_sung'))
);
CREATE INDEX IF NOT EXISTS raw_photos_ref_idx ON public.raw_photos (ref_type, ref_id);
ALTER TABLE public.raw_photos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY rp_select ON public.raw_photos FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rp_insert ON public.raw_photos FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rp_delete_bgd ON public.raw_photos FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('raw-photos', 'raw-photos', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS raw_photos_public_read ON storage.objects;
DROP POLICY IF EXISTS raw_photos_auth_insert ON storage.objects;
CREATE POLICY raw_photos_public_read ON storage.objects FOR SELECT TO public USING (bucket_id = 'raw-photos');
CREATE POLICY raw_photos_auth_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'raw-photos');

-- ─── 2) KHO CHÈN ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mix_lots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text UNIQUE NOT NULL,                -- CH-PD-YYMMDD-NN
  facility_id       uuid NOT NULL REFERENCES public.facilities(id),
  source_type       text NOT NULL,                       -- loi | dkl | std | mua_ngoai | khac
  source_ref_type   text,                                -- qc_reject_log | stock_batch | weighbridge_ticket | manual
  source_ref_id     uuid,
  source_desc       text,                                -- "Hàng lỗi Po thấp tổ Đen 27/10", "SVR 3L kho TP", "Cty Đại Lộc"
  grade             text,
  kg_in             numeric(14,2) NOT NULL,
  kg_used           numeric(14,2) NOT NULL DEFAULT 0,    -- đã tiêu hao (phiếu received)
  kg_at_line        numeric(14,2) NOT NULL DEFAULT 0,    -- đang nằm ở dây chuyền (phiếu chưa received)
  po                numeric(6,2),
  mooney            numeric(6,2),
  pri               numeric(6,2),
  qc_allow_mix_pct  numeric(5,2),                        -- trộn tối đa % (NULL = không giới hạn)
  qc_allow_rerun    boolean NOT NULL DEFAULT true,
  metal_cleared     boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'available',   -- available | in_use | depleted | cancelled
  received_date     date NOT NULL DEFAULT current_date,
  note              text,
  created_by        uuid REFERENCES public.employees(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ml_source_chk CHECK (source_type IN ('loi', 'dkl', 'std', 'mua_ngoai', 'khac')),
  CONSTRAINT ml_status_chk CHECK (status IN ('available', 'in_use', 'depleted', 'cancelled')),
  CONSTRAINT ml_kg_chk CHECK (kg_in > 0 AND kg_used >= 0 AND kg_at_line >= 0)
);
CREATE INDEX IF NOT EXISTS ml_facility_idx ON public.mix_lots (facility_id, status);

CREATE TABLE IF NOT EXISTS public.mix_issues (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text UNIQUE NOT NULL,            -- PC-PD-YYMMDD-NN
  facility_id           uuid NOT NULL REFERENCES public.facilities(id),
  mix_lot_id            uuid NOT NULL REFERENCES public.mix_lots(id),
  shift_date            date NOT NULL DEFAULT current_date,
  shift_id              uuid REFERENCES public.shifts(id),
  team                  text,
  purpose               text NOT NULL DEFAULT 'chay_lai',  -- chay_lai | nang_chi_so
  target_index          text,                               -- Po | PRI | Mooney | ...
  target_value          numeric(8,2),
  kg_out                numeric(14,2) NOT NULL,
  out_at                timestamptz NOT NULL DEFAULT now(),
  out_by                uuid REFERENCES public.employees(id),
  kg_return             numeric(14,2),
  return_at             timestamptz,
  return_by             uuid REFERENCES public.employees(id),
  kg_used               numeric(14,2),
  handover_to_next      boolean NOT NULL DEFAULT false,
  handover_from_issue_id uuid REFERENCES public.mix_issues(id),
  production_order_id   uuid REFERENCES public.production_orders(id),
  output_batch_id       uuid REFERENCES public.stock_batches(id),
  status                text NOT NULL DEFAULT 'issued',  -- issued | returned | submitted | qc_confirmed | received | cancelled
  submitted_by          uuid REFERENCES public.employees(id),
  submitted_at          timestamptz,
  qc_confirmed_by       uuid REFERENCES public.employees(id),
  qc_confirmed_at       timestamptz,
  received_by           uuid REFERENCES public.employees(id),
  received_at           timestamptz,
  cancelled_at          timestamptz,
  cancel_reason         text,
  note                  text,
  created_by            uuid REFERENCES public.employees(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mi_purpose_chk CHECK (purpose IN ('chay_lai', 'nang_chi_so')),
  CONSTRAINT mi_status_chk CHECK (status IN ('issued', 'returned', 'submitted', 'qc_confirmed', 'received', 'cancelled')),
  CONSTRAINT mi_kg_chk CHECK (kg_out > 0 AND (kg_return IS NULL OR (kg_return >= 0 AND kg_return <= kg_out)))
);
CREATE INDEX IF NOT EXISTS mi_facility_date_idx ON public.mix_issues (facility_id, shift_date, status);
CREATE INDEX IF NOT EXISTS mi_lot_idx ON public.mix_issues (mix_lot_id);

ALTER TABLE public.mix_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mix_issues ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY ml_select ON public.mix_lots FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mi_select ON public.mix_issues FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY ml_write_bgd ON public.mix_lots FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mi_write_bgd ON public.mix_issues FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3) Mã ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mix_ma(p_prefix text, p_facility_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text; v_prefix text; v_n int;
BEGIN
  SELECT upper(code) INTO v_code FROM public.facilities WHERE id = p_facility_id;
  v_prefix := p_prefix || '-' || COALESCE(v_code, 'XX') || '-' || to_char(current_date, 'YYMMDD') || '-';
  IF p_prefix = 'CH' THEN
    SELECT COALESCE(max(NULLIF(regexp_replace(code, '^' || v_prefix, ''), code)::int), 0) + 1 INTO v_n FROM public.mix_lots WHERE code LIKE v_prefix || '%';
  ELSE
    SELECT COALESCE(max(NULLIF(regexp_replace(code, '^' || v_prefix, ''), code)::int), 0) + 1 INTO v_n FROM public.mix_issues WHERE code LIKE v_prefix || '%';
  END IF;
  RETURN v_prefix || lpad(v_n::text, 2, '0');
END $$;

-- ─── 4) Nhập lô chèn ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mix_tao_lo(
  p_facility_id uuid, p_source_type text, p_source_desc text, p_grade text, p_kg_in numeric,
  p_po numeric DEFAULT NULL, p_mooney numeric DEFAULT NULL, p_pri numeric DEFAULT NULL,
  p_qc_allow_mix_pct numeric DEFAULT NULL, p_qc_allow_rerun boolean DEFAULT true, p_metal_cleared boolean DEFAULT false,
  p_received_date date DEFAULT current_date, p_note text DEFAULT NULL, p_source_ref_type text DEFAULT NULL, p_source_ref_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; q json; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  q := public.fn_nvl_quyen(p_facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:kho_chen'; END IF;
  IF p_kg_in IS NULL OR p_kg_in <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  INSERT INTO public.mix_lots (code, facility_id, source_type, source_ref_type, source_ref_id, source_desc, grade, kg_in, po, mooney, pri,
                               qc_allow_mix_pct, qc_allow_rerun, metal_cleared, received_date, note, created_by)
  VALUES (public.fn_mix_ma('CH', p_facility_id), p_facility_id, p_source_type, p_source_ref_type, p_source_ref_id, p_source_desc, p_grade, p_kg_in,
          p_po, p_mooney, p_pri, p_qc_allow_mix_pct, COALESCE(p_qc_allow_rerun, true), COALESCE(p_metal_cleared, false),
          COALESCE(p_received_date, current_date), p_note, v_emp)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ─── 5) Lấy đầu ca ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mix_lay(
  p_lot_id uuid, p_kg numeric, p_shift_date date DEFAULT current_date, p_shift_id uuid DEFAULT NULL, p_team text DEFAULT NULL,
  p_purpose text DEFAULT 'chay_lai', p_target_index text DEFAULT NULL, p_target_value numeric DEFAULT NULL,
  p_production_order_id uuid DEFAULT NULL, p_note text DEFAULT NULL
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
  v_ton := l.kg_in - l.kg_used - l.kg_at_line;
  IF p_kg > v_ton + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:lấy % > tồn %', l.code, p_kg, v_ton; END IF;

  INSERT INTO public.mix_issues (code, facility_id, mix_lot_id, shift_date, shift_id, team, purpose, target_index, target_value,
                                 kg_out, out_by, production_order_id, note, created_by)
  VALUES (public.fn_mix_ma('PC', l.facility_id), l.facility_id, l.id, COALESCE(p_shift_date, current_date), p_shift_id, p_team,
          COALESCE(p_purpose, 'chay_lai'), p_target_index, p_target_value, p_kg, v_emp, p_production_order_id, p_note, v_emp)
  RETURNING id INTO v_id;

  UPDATE public.mix_lots SET kg_at_line = kg_at_line + p_kg, status = 'in_use', updated_at = now() WHERE id = l.id;
  RETURN v_id;
END $$;

-- ─── 6) Trả cuối ca ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mix_tra(p_issue_id uuid, p_kg_return numeric, p_handover boolean DEFAULT false, p_note text DEFAULT NULL, p_output_batch_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i record; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO i FROM public.mix_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF i.status NOT IN ('issued', 'returned') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', i.code, i.status; END IF;
  IF NOT public.fn_nvl_duoc_ky('submit', i.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  IF p_kg_return IS NULL OR p_kg_return < 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  IF p_kg_return > i.kg_out + 0.01 THEN RAISE EXCEPTION 'TRA_QUA_LAY:%:trả % > lấy %', i.code, p_kg_return, i.kg_out; END IF;

  UPDATE public.mix_issues
     SET kg_return = p_kg_return, return_at = now(), return_by = v_emp, kg_used = round(kg_out - p_kg_return, 2),
         handover_to_next = COALESCE(p_handover, false) AND p_kg_return > 0, output_batch_id = COALESCE(p_output_batch_id, output_batch_id),
         note = COALESCE(p_note, note), status = 'returned', updated_at = now()
   WHERE id = i.id;
  RETURN jsonb_build_object('code', i.code, 'kg_out', i.kg_out, 'kg_return', p_kg_return, 'kg_used', round(i.kg_out - p_kg_return, 2));
END $$;

-- ─── 7) Ảnh bắt buộc: kiểm tra theo raw_settings.anh_bat_buoc ─────────────
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

-- ─── 8) Dòng CHÈN của sổ ca = Σ kg_used các phiếu đã nhận cùng ca ──────────
CREATE OR REPLACE FUNCTION public.fn_mix_cap_nhat_dong_chen(p_facility_id uuid, p_shift_date date, p_shift_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_report uuid; v_mat uuid; v_kg numeric;
BEGIN
  IF p_shift_id IS NULL THEN RETURN false; END IF;
  SELECT id INTO v_report FROM public.shift_production_reports
   WHERE facility_id = p_facility_id AND report_date = p_shift_date AND shift_id = p_shift_id LIMIT 1;
  IF v_report IS NULL THEN RETURN false; END IF;         -- chưa có phiếu ca → không ép, màn ca sẽ đọc từ mix_issues
  SELECT id INTO v_mat FROM public.materials WHERE code = 'CHEN' LIMIT 1;
  IF v_mat IS NULL THEN RETURN false; END IF;
  SELECT COALESCE(sum(kg_used), 0) INTO v_kg FROM public.mix_issues
   WHERE facility_id = p_facility_id AND shift_date = p_shift_date AND shift_id = p_shift_id AND status = 'received';
  INSERT INTO public.shift_production_lines (report_id, material_id, nhap_banh, xuat_banh, xuat_kg_manual, note)
  VALUES (v_report, v_mat, 0, 0, v_kg, 'Tự điền từ phiếu chèn (kho NVL)')
  ON CONFLICT (report_id, material_id) DO UPDATE SET xuat_kg_manual = EXCLUDED.xuat_kg_manual, note = EXCLUDED.note, updated_at = now();
  RETURN true;
END $$;

-- ─── 9) Ký phiếu chèn ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_mix_ky(p_issue_id uuid, p_buoc text, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i       record;
  l       record;
  v_emp   uuid := public.fn_nvl_emp_hien_tai();
  v_thieu text;
  v_next  uuid;
  v_ton   numeric;
BEGIN
  SELECT * INTO i FROM public.mix_issues WHERE id = p_issue_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF NOT public.fn_nvl_duoc_ky(p_buoc, i.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:%', p_buoc; END IF;

  CASE p_buoc
    WHEN 'submit' THEN
      IF i.status <> 'returned' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', i.code, i.status; END IF;
      v_thieu := public.fn_mix_thieu_anh(i.id, i.facility_id);
      IF v_thieu IS NOT NULL THEN RAISE EXCEPTION 'THIEU_ANH:%:%', i.code, v_thieu; END IF;
      UPDATE public.mix_issues SET status = 'submitted', submitted_by = v_emp, submitted_at = now(), note = COALESCE(p_note, note), updated_at = now() WHERE id = i.id;

    WHEN 'qc_confirm' THEN
      IF i.status <> 'submitted' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', i.code, i.status; END IF;
      UPDATE public.mix_issues SET status = 'qc_confirmed', qc_confirmed_by = v_emp, qc_confirmed_at = now(), updated_at = now() WHERE id = i.id;

    WHEN 'receive' THEN
      IF i.status <> 'qc_confirmed' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:%', i.code, i.status; END IF;
      SELECT * INTO l FROM public.mix_lots WHERE id = i.mix_lot_id FOR UPDATE;
      -- Kho chèn đổi tại đây: phần lấy rời dây chuyền; tiêu hao cộng vào kg_used; phần trả về kho (tồn tự tăng)
      UPDATE public.mix_lots
         SET kg_at_line = GREATEST(kg_at_line - i.kg_out, 0),
             kg_used    = kg_used + COALESCE(i.kg_used, 0),
             updated_at = now()
       WHERE id = l.id;
      UPDATE public.mix_issues SET status = 'received', received_by = v_emp, received_at = now(), updated_at = now() WHERE id = i.id;

      -- Bàn giao ca sau: phần còn lại ở lại dây chuyền = phiếu lấy mới (ca kế)
      IF i.handover_to_next AND COALESCE(i.kg_return, 0) > 0 THEN
        INSERT INTO public.mix_issues (code, facility_id, mix_lot_id, shift_date, shift_id, team, purpose, target_index, target_value,
                                       kg_out, out_by, production_order_id, handover_from_issue_id, note, created_by)
        VALUES (public.fn_mix_ma('PC', i.facility_id), i.facility_id, i.mix_lot_id, i.shift_date, NULL, NULL, i.purpose, i.target_index, i.target_value,
                i.kg_return, v_emp, i.production_order_id, i.id, 'Bàn giao từ ' || i.code || ' (ca sau ghi lại ca / tổ)', v_emp)
        RETURNING id INTO v_next;
        UPDATE public.mix_lots SET kg_at_line = kg_at_line + i.kg_return, updated_at = now() WHERE id = l.id;
      END IF;

      SELECT kg_in - kg_used - kg_at_line INTO v_ton FROM public.mix_lots WHERE id = l.id;
      UPDATE public.mix_lots SET status = CASE WHEN v_ton <= 0.005 AND kg_at_line <= 0.005 THEN 'depleted' WHEN kg_at_line > 0.005 THEN 'in_use' ELSE 'available' END WHERE id = l.id;

      PERFORM public.fn_mix_cap_nhat_dong_chen(i.facility_id, i.shift_date, i.shift_id);

    WHEN 'cancel' THEN
      IF i.status = 'received' THEN RAISE EXCEPTION 'DA_TRU_SO:%', i.code; END IF;
      UPDATE public.mix_lots SET kg_at_line = GREATEST(kg_at_line - i.kg_out, 0), updated_at = now() WHERE id = i.mix_lot_id;
      UPDATE public.mix_lots SET status = CASE WHEN kg_in - kg_used - kg_at_line <= 0.005 AND kg_at_line <= 0.005 THEN 'depleted' WHEN kg_at_line > 0.005 THEN 'in_use' ELSE 'available' END WHERE id = i.mix_lot_id;
      UPDATE public.mix_issues SET status = 'cancelled', cancelled_at = now(), cancel_reason = p_note, updated_at = now() WHERE id = i.id;
    ELSE
      RAISE EXCEPTION 'BUOC_KHONG_HOP_LE:%', p_buoc;
  END CASE;

  RETURN jsonb_build_object('code', i.code, 'buoc', p_buoc, 'kg_used', i.kg_used, 'next_issue_id', v_next);
END $$;

GRANT EXECUTE ON FUNCTION public.fn_mix_ma(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mix_tao_lo(uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, boolean, boolean, date, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mix_lay(uuid, numeric, date, uuid, text, text, text, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mix_tra(uuid, numeric, boolean, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mix_thieu_anh(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mix_ky(uuid, text, text) TO authenticated;

-- ─── 10) VIEWS ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_mix_lots AS
SELECT l.*, f.code AS facility_code,
       round(l.kg_in - l.kg_used - l.kg_at_line, 2) AS ton_kg,
       (current_date - l.received_date)::int AS tuoi_ngay,
       (SELECT count(*) FROM public.raw_photos p WHERE p.ref_type = 'mix_lot' AND p.ref_id = l.id)::int AS so_anh,
       e.full_name AS created_name
FROM public.mix_lots l
LEFT JOIN public.facilities f ON f.id = l.facility_id
LEFT JOIN public.employees e ON e.id = l.created_by;

CREATE OR REPLACE VIEW public.v_mix_issues AS
SELECT i.*, f.code AS facility_code, l.code AS lot_code, l.source_type, l.source_desc, l.grade AS lot_grade, l.po, l.mooney, l.pri,
       sh.code AS shift_code, sh.name AS shift_name,
       po.code AS production_code, b.batch_no AS output_batch_no,
       (SELECT count(*) FROM public.raw_photos p WHERE p.ref_type = 'mix_issue_out' AND p.ref_id = i.id)::int AS so_anh_lay,
       (SELECT count(*) FROM public.raw_photos p WHERE p.ref_type = 'mix_issue_return' AND p.ref_id = i.id)::int AS so_anh_tra,
       public.fn_mix_thieu_anh(i.id, i.facility_id) AS thieu_anh,
       eo.full_name AS out_name, er.full_name AS return_name, es.full_name AS submitted_name, eq.full_name AS qc_confirmed_name, ev.full_name AS received_name
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
LEFT JOIN public.employees ev ON ev.id = i.received_by;

CREATE OR REPLACE VIEW public.v_mix_balance AS
SELECT l.facility_id, f.code AS facility_code,
       count(*) FILTER (WHERE l.status <> 'cancelled' AND (l.kg_in - l.kg_used) > 0.005)::int AS so_lo,
       round(sum(l.kg_in - l.kg_used - l.kg_at_line) FILTER (WHERE l.status <> 'cancelled'), 2) AS tai_kho_kg,
       round(sum(l.kg_at_line) FILTER (WHERE l.status <> 'cancelled'), 2) AS o_day_chuyen_kg,
       round(sum(l.kg_in - l.kg_used) FILTER (WHERE l.status <> 'cancelled'), 2) AS tong_con_kg,
       round(sum(l.kg_in) FILTER (WHERE l.status <> 'cancelled' AND l.received_date >= date_trunc('month', current_date)), 2) AS nhap_thang_kg,
       round(sum(l.kg_used) FILTER (WHERE l.status <> 'cancelled'), 2) AS tieu_hao_tong_kg
FROM public.mix_lots l LEFT JOIN public.facilities f ON f.id = l.facility_id
GROUP BY l.facility_id, f.code;

-- Sổ chuyển động kho chèn (nhập lô, lấy, trả)
CREATE OR REPLACE VIEW public.v_mix_movements AS
SELECT l.facility_id, l.created_at AS thoi_diem, 'nhap_lo'::text AS loai, l.code AS lot_code, NULL::text AS issue_code, l.kg_in AS kg,
       l.source_desc AS mo_ta, e.full_name AS nguoi, l.id AS lot_id, NULL::uuid AS issue_id
  FROM public.mix_lots l LEFT JOIN public.employees e ON e.id = l.created_by
UNION ALL
SELECT i.facility_id, i.out_at, 'lay', l.code, i.code, -i.kg_out, 'Lấy đầu ca ' || COALESCE(to_char(i.shift_date, 'DD/MM'), ''), e.full_name, l.id, i.id
  FROM public.mix_issues i JOIN public.mix_lots l ON l.id = i.mix_lot_id LEFT JOIN public.employees e ON e.id = i.out_by
 WHERE i.status <> 'cancelled'
UNION ALL
SELECT i.facility_id, i.return_at, 'tra', l.code, i.code, i.kg_return, 'Trả cuối ca' || CASE WHEN i.handover_to_next THEN ' (bàn giao ca sau)' ELSE '' END, e.full_name, l.id, i.id
  FROM public.mix_issues i JOIN public.mix_lots l ON l.id = i.mix_lot_id LEFT JOIN public.employees e ON e.id = i.return_by
 WHERE i.status <> 'cancelled' AND i.return_at IS NOT NULL;

ALTER VIEW public.v_mix_lots SET (security_invoker = on);
ALTER VIEW public.v_mix_issues SET (security_invoker = on);
ALTER VIEW public.v_mix_balance SET (security_invoker = on);
ALTER VIEW public.v_mix_movements SET (security_invoker = on);
GRANT SELECT ON public.v_mix_lots, public.v_mix_issues, public.v_mix_balance, public.v_mix_movements TO authenticated;

-- ─── 11) Vòng tái chế: thêm kg chèn tiêu hao (số thật thay cho cờ) ─────────
-- Giữ nguyên thân view của wms_soi_lai_p1 (chỉ cộng phiếu `received`, coalesce) và
-- CHỈ THÊM 2 cột ở cuối (CREATE OR REPLACE không cho đổi cột cũ).
CREATE OR REPLACE VIEW public.v_vong_tai_che AS
SELECT
  v.facility_id,
  v.report_date                                                         AS ngay,
  coalesce(sum(v.nhap_banh) FILTER (WHERE v.code = 'LOI'), 0)::int      AS loi_lam_ra_banh,
  coalesce(sum(v.nhap_banh) FILTER (WHERE v.code = 'DKL'), 0)::int      AS dkl_lam_ra_banh,
  coalesce(sum(v.nhap_banh) FILTER (WHERE v.code IN ('LOI','DKL')), 0)::int AS khong_dat_lam_ra_banh,
  round(coalesce(sum(COALESCE(v.nhap_kg,0)) FILTER (WHERE v.code IN ('LOI','DKL')), 0), 2) AS khong_dat_lam_ra_kg,
  coalesce(sum(v.xuat_banh) FILTER (WHERE v.code IN ('LOI','DKL')), 0)::int AS khong_dat_dem_xu_ly_banh,
  round(coalesce(sum(COALESCE(v.xuat_kg,0)) FILTER (WHERE v.code IN ('LOI','DKL')), 0), 2) AS khong_dat_dem_xu_ly_kg,
  coalesce(sum(v.nhap_banh) FILTER (WHERE v.code NOT IN ('LOI','DKL')), 0)::int AS dat_lam_ra_banh,
  round(coalesce(sum(COALESCE(v.nhap_kg,0)) FILTER (WHERE v.code NOT IN ('LOI','DKL')), 0), 2) AS dat_lam_ra_kg,
  sum(v.nhap_banh)::int                                                 AS tong_nhap_banh,
  round(100.0 * coalesce(sum(v.nhap_banh) FILTER (WHERE v.code IN ('LOI','DKL')), 0)
        / nullif(sum(v.nhap_banh), 0), 1)                               AS ty_le_khong_dat_pc,
  (coalesce(sum(v.xuat_banh) FILTER (WHERE v.code IN ('LOI','DKL')), 0) > 0) AS co_tai_che_trong_ky,
  -- GĐ4 (mới): kg chèn thật từ phiếu chèn đã đủ 3 chữ ký trong ngày
  round(coalesce(max(m.kg), 0), 2)                                      AS chen_tieu_hao_kg,
  round(coalesce(sum(COALESCE(v.nhap_kg,0)) FILTER (WHERE v.code NOT IN ('LOI','DKL')), 0) - coalesce(max(m.kg), 0), 2) AS dat_tu_nvl_moi_kg
FROM public.v_shift_production_lines v
LEFT JOIN (SELECT facility_id, shift_date, sum(kg_used) AS kg FROM public.mix_issues WHERE status = 'received' GROUP BY 1, 2) m
       ON m.facility_id = v.facility_id AND m.shift_date = v.report_date
WHERE v.status = 'received'
GROUP BY v.facility_id, v.report_date;

ALTER VIEW public.v_vong_tai_che SET (security_invoker = on);
GRANT SELECT ON public.v_vong_tai_che TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT to_regclass('public.mix_lots') AS t1, to_regclass('public.mix_issues') AS t2, to_regclass('public.raw_photos') AS t3,
       (SELECT count(*) FROM storage.buckets WHERE id = 'raw-photos') AS bucket,
       to_regprocedure('public.fn_mix_lay(uuid,numeric,date,uuid,text,text,text,numeric,uuid,text)') AS f1,
       to_regprocedure('public.fn_mix_ky(uuid,text,text)') AS f2,
       public.fn_mix_ma('CH', (SELECT id FROM public.facilities WHERE code = 'PD')) AS vi_du;   -- CH-PD-261030-01
SELECT id, code, name FROM public.shifts ORDER BY code;   -- danh mục ca để gắn phiếu chèn
