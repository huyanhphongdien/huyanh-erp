-- ============================================================
-- KHO NGUYÊN LIỆU MỦ — GĐ1 · P1: SỔ KHO KHÔ + NHẬP KHO TÁCH LÔ + MỞ SỔ TỒN ĐẦU
-- Ngày: 2026-10-29
-- Phụ thuộc: GĐ0 (raw_rubber_types v3, fn_chuan_hoa_loai_mu, raw_store_keepers,
--            fn_nvl_duoc_ky, raw_settings, raw_opening_stock_staging),
--            bảng có sẵn: stock_batches, weighbridge_tickets, weighbridge_ticket_items,
--            warehouses, materials, facilities, employees
--
-- Ý chính:
--   · raw_stock_ledger = SỔ KHO KHÔ: chỉ THÊM dòng, không sửa. Mỗi dòng ghi
--     kg ướt (có dấu), DRC và kg khô. Tồn = tổng các dòng theo lô.
--   · Lô vẫn là stock_batches (dùng lại), thêm vài cột: facility_id, raw_rubber_type
--     (mã chuẩn), nguon_hang, ton_dau_uoc, weighbridge_ticket_id, ticket_line_no.
--   · fn_nhap_kho_tu_phieu_can: mỗi DÒNG LÔ trên phiếu = 1 lô; phiếu không có
--     dòng lô = 1 lô. Từ chối khi thiếu DRC (mủ thô), loại mủ lạ, phiếu chưa
--     hoàn tất, đã nhập rồi, hoặc người gọi không được ký "nhận".
--   · fn_mo_so_ton_dau: chuyển raw_opening_stock_staging (không lỗi) thành lô +
--     dòng 'opening'.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── 1) Cột mới trên stock_batches (chỉ thêm, không đổi cột cũ) ───────────
ALTER TABLE public.stock_batches
  ADD COLUMN IF NOT EXISTS facility_id           uuid REFERENCES public.facilities(id),
  ADD COLUMN IF NOT EXISTS raw_rubber_type       text REFERENCES public.raw_rubber_types(code),
  ADD COLUMN IF NOT EXISTS nguon_hang            text,
  ADD COLUMN IF NOT EXISTS ton_dau_uoc           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weighbridge_ticket_id uuid REFERENCES public.weighbridge_tickets(id),
  ADD COLUMN IF NOT EXISTS ticket_line_no        int;

DO $$ BEGIN
  ALTER TABLE public.stock_batches
    ADD CONSTRAINT stock_batches_nguon_hang_chk
    CHECK (nguon_hang IS NULL OR nguon_hang IN ('nong_ho','dai_ly','nha_may_khac','thuong_mai','chuyen_kho','khac'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS stock_batches_facility_rawtype_idx ON public.stock_batches (facility_id, raw_rubber_type);
CREATE INDEX IF NOT EXISTS stock_batches_ticket_idx ON public.stock_batches (weighbridge_ticket_id) WHERE weighbridge_ticket_id IS NOT NULL;

COMMENT ON COLUMN public.stock_batches.raw_rubber_type IS 'Mã loại hàng chuẩn (raw_rubber_types) — kho NVL dùng cột này, không dùng rubber_type cũ';
COMMENT ON COLUMN public.stock_batches.nguon_hang IS 'nong_ho | dai_ly | nha_may_khac | thuong_mai | chuyen_kho | khac — lô thuong_mai xuất bán, không xuất sản xuất';
COMMENT ON COLUMN public.stock_batches.ton_dau_uoc IS 'true = tồn đầu mở sổ với DRC ước (không có mẫu)';

-- ─── 2) SỔ KHO KHÔ ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raw_stock_ledger (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id  uuid NOT NULL REFERENCES public.facilities(id),
  batch_id     uuid NOT NULL REFERENCES public.stock_batches(id),
  rubber_type  text NOT NULL REFERENCES public.raw_rubber_types(code),
  txn_type     text NOT NULL,
  txn_date     date NOT NULL DEFAULT current_date,
  wet_kg       numeric(14,2) NOT NULL,     -- có dấu: + nhập, − xuất; điều chỉnh = chênh lệch
  drc_pct      numeric(5,2),               -- DRC áp dụng cho dòng (NULL ở dòng điều chỉnh khô thuần)
  dry_kg       numeric(14,2) NOT NULL,     -- có dấu; nhập/xuất = round(wet × drc / 100, 2)
  ref_type     text,                       -- weighbridge_ticket | opening_staging | raw_issue | weight_check | stocktake | transfer
  ref_id       uuid,
  ref_line     int,
  note         text,
  created_by   uuid REFERENCES public.employees(id),
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rsl_txn_type_chk CHECK (txn_type IN (
    'opening', 'in', 'in_transfer',
    'out_production', 'out_sale', 'out_transfer',
    'recheck_adjust', 'stocktake_adjust')),
  CONSTRAINT rsl_drc_chk CHECK (drc_pct IS NULL OR (drc_pct > 0 AND drc_pct <= 100))
);

COMMENT ON TABLE public.raw_stock_ledger IS
  'Sổ kho khô của kho nguyên liệu mủ: chỉ thêm dòng. Tồn lô = sum(wet_kg), sum(dry_kg). Ghi qua hàm, không insert tay.';

CREATE INDEX IF NOT EXISTS rsl_batch_idx    ON public.raw_stock_ledger (batch_id);
CREATE INDEX IF NOT EXISTS rsl_facility_idx ON public.raw_stock_ledger (facility_id, rubber_type, txn_date);
-- Chống ghi 2 lần cùng một chứng từ
CREATE UNIQUE INDEX IF NOT EXISTS rsl_ref_uniq
  ON public.raw_stock_ledger (ref_type, ref_id, COALESCE(ref_line, 0), txn_type)
  WHERE ref_id IS NOT NULL;

ALTER TABLE public.raw_stock_ledger ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY rsl_select ON public.raw_stock_ledger FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Chỉ BGĐ được sửa tay (sửa sai khẩn cấp). Mọi ghi bình thường đi qua hàm SECURITY DEFINER.
DO $$ BEGIN
  CREATE POLICY rsl_write_bgd ON public.raw_stock_ledger FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id
                    WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id
                    WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 3) Tiện ích nội bộ ────────────────────────────────────────────────────
-- Nhân viên đang đăng nhập (NULL khi chạy bằng khoá quản trị)
CREATE OR REPLACE FUNCTION public.fn_nvl_emp_hien_tai()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id FROM public.employees e WHERE e.user_id = auth.uid() LIMIT 1
$$;

-- Kho NVL của nhà máy: ưu tiên type raw, rồi mixed; không có thì NULL
CREATE OR REPLACE FUNCTION public.fn_nvl_kho_mac_dinh(p_facility_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id FROM public.warehouses w
   WHERE w.is_active = true AND w.type IN ('raw', 'mixed')
     AND (w.facility_id = p_facility_id OR w.facility_id IS NULL)
   ORDER BY (w.facility_id = p_facility_id) DESC, (w.type = 'raw') DESC, w.created_at
   LIMIT 1
$$;

-- Material "mủ cao su thô" cho stock_batches.material_id (bảng cũ bắt buộc) — khuôn của stockInService
CREATE OR REPLACE FUNCTION public.fn_nvl_material_mac_dinh()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.materials WHERE code = 'MU-CSRAW' LIMIT 1;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.materials WHERE type = 'raw' ORDER BY created_at LIMIT 1;
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.materials (code, name, type, unit)
    VALUES ('MU-CSRAW', 'Mủ cao su thô (tự tạo)', 'raw', 'kg')
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

-- Tạo hoặc lấy lô theo batch_no, điền các cột kho NVL
CREATE OR REPLACE FUNCTION public.fn_nvl_tao_lo(
  p_batch_no text, p_facility_id uuid, p_warehouse_id uuid, p_rubber_type text,
  p_wet_kg numeric, p_drc numeric, p_received_date date,
  p_supplier_name text, p_supplier_drc numeric, p_qc_status text,
  p_nguon_hang text, p_ton_dau_uoc boolean, p_ticket_id uuid, p_line_no int,
  p_legacy_rubber_type text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id  uuid;
  v_mat uuid := public.fn_nvl_material_mac_dinh();
  v_qc  text := CASE WHEN p_qc_status IN ('pending','passed','warning','failed','needs_blend') THEN p_qc_status ELSE 'pending' END;
BEGIN
  SELECT id INTO v_id FROM public.stock_batches WHERE batch_no = p_batch_no LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.stock_batches (
      batch_no, material_id, warehouse_id, initial_quantity, quantity_remaining,
      initial_weight, current_weight, initial_drc, latest_drc, dry_weight,
      qc_status, status, rubber_type, supplier_name, supplier_reported_drc, received_date,
      facility_id, raw_rubber_type, nguon_hang, ton_dau_uoc, weighbridge_ticket_id, ticket_line_no)
    VALUES (
      p_batch_no, v_mat, p_warehouse_id, 1, 1,
      p_wet_kg, p_wet_kg, p_drc, p_drc, round(p_wet_kg * p_drc / 100, 2),
      v_qc, 'active', p_legacy_rubber_type, p_supplier_name, p_supplier_drc, p_received_date,
      p_facility_id, p_rubber_type, p_nguon_hang, COALESCE(p_ton_dau_uoc, false), p_ticket_id, p_line_no)
    RETURNING id INTO v_id;
  ELSE
    -- Lô đã có (ví dụ tạo bởi luồng nhập cũ): bổ sung cột kho NVL, không ghi đè khối lượng gốc
    UPDATE public.stock_batches SET
      facility_id           = COALESCE(facility_id, p_facility_id),
      warehouse_id          = COALESCE(warehouse_id, p_warehouse_id),
      raw_rubber_type       = COALESCE(raw_rubber_type, p_rubber_type),
      nguon_hang            = COALESCE(nguon_hang, p_nguon_hang),
      weighbridge_ticket_id = COALESCE(weighbridge_ticket_id, p_ticket_id),
      ticket_line_no        = COALESCE(ticket_line_no, p_line_no),
      latest_drc            = COALESCE(latest_drc, p_drc),
      initial_drc           = COALESCE(initial_drc, p_drc),
      dry_weight            = COALESCE(dry_weight, round(p_wet_kg * p_drc / 100, 2)),
      status                = CASE WHEN status = 'depleted' THEN 'active' ELSE status END,
      updated_at            = now()
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;

-- ─── 4) NHẬP KHO TỪ PHIẾU CÂN ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_nhap_kho_tu_phieu_can(
  p_ticket_id uuid,
  p_warehouse_id uuid DEFAULT NULL,
  p_nguon_hang text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t            record;
  i            record;
  v_wh         uuid;
  v_emp        uuid := public.fn_nvl_emp_hien_tai();
  v_type       text;
  v_drc        numeric;
  v_wet        numeric;
  v_batch_no   text;
  v_batch_id   uuid;
  v_nguon      text;
  v_so_dong    int := 0;
  v_out        jsonb := '[]'::jsonb;
  v_received   date;
BEGIN
  SELECT * INTO t FROM public.weighbridge_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_PHIEU'; END IF;
  IF t.status <> 'completed' THEN RAISE EXCEPTION 'PHIEU_CHUA_HOAN_TAT:%', t.code; END IF;
  IF t.ticket_type NOT IN ('in', 'fetch', 'retail') THEN RAISE EXCEPTION 'PHIEU_KHONG_PHAI_NHAP:%', t.ticket_type; END IF;
  IF t.facility_id IS NULL THEN RAISE EXCEPTION 'THIEU_NHA_MAY:%', t.code; END IF;
  IF EXISTS (SELECT 1 FROM public.raw_stock_ledger l WHERE l.ref_type = 'weighbridge_ticket' AND l.ref_id = t.id) THEN
    RAISE EXCEPTION 'DA_NHAP:%', t.code;
  END IF;
  IF NOT public.fn_nvl_duoc_ky('receive', t.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN_NHAN'; END IF;

  v_wh := COALESCE(p_warehouse_id, public.fn_nvl_kho_mac_dinh(t.facility_id));
  IF v_wh IS NULL THEN RAISE EXCEPTION 'THIEU_KHO_NVL'; END IF;

  v_received := COALESCE(t.completed_at::date, current_date);
  v_nguon := COALESCE(p_nguon_hang,
    CASE
      WHEN t.ticket_type = 'retail' THEN 'nong_ho'
      WHEN t.source_type = 'transfer' THEN 'chuyen_kho'
      WHEN t.source_type IN ('deal', 'partner_direct', 'supplier') THEN 'dai_ly'
      ELSE 'khac'
    END);

  -- Phiếu nhiều dòng lô → mỗi dòng một lô
  FOR i IN
    SELECT * FROM public.weighbridge_ticket_items WHERE ticket_id = t.id ORDER BY line_no
  LOOP
    v_so_dong := v_so_dong + 1;
    v_type := public.fn_chuan_hoa_loai_mu(i.rubber_type);
    IF v_type = 'khac' THEN RAISE EXCEPTION 'LOAI_MU_LA:%:%', t.code, i.rubber_type; END IF;
    v_wet := COALESCE(i.actual_qty_kg, i.declared_qty_kg);
    IF v_wet IS NULL OR v_wet <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:%:dong %', t.code, i.line_no; END IF;
    SELECT COALESCE(i.drc_percent, t.qc_actual_drc, rt.drc_mac_dinh) INTO v_drc
      FROM public.raw_rubber_types rt WHERE rt.code = v_type;
    IF v_drc IS NULL THEN RAISE EXCEPTION 'THIEU_DRC:%:dong %', t.code, i.line_no; END IF;

    v_batch_no := 'NVL-' || replace(t.code, 'CX-', '') || '-' || i.line_no;
    v_batch_id := public.fn_nvl_tao_lo(v_batch_no, t.facility_id, v_wh, v_type, v_wet, v_drc, v_received,
                    t.supplier_name, t.expected_drc, t.qc_status, v_nguon, false, t.id, i.line_no, i.rubber_type);

    INSERT INTO public.raw_stock_ledger (facility_id, batch_id, rubber_type, txn_type, txn_date, wet_kg, drc_pct, dry_kg,
                                         ref_type, ref_id, ref_line, note, created_by)
    VALUES (t.facility_id, v_batch_id, v_type, 'in', v_received, v_wet, v_drc, round(v_wet * v_drc / 100, 2),
            'weighbridge_ticket', t.id, i.line_no, 'Nhập từ phiếu cân ' || t.code || ' dòng ' || i.line_no, v_emp);

    v_out := v_out || jsonb_build_object('batch_id', v_batch_id, 'batch_no', v_batch_no, 'rubber_type', v_type,
                                         'wet_kg', v_wet, 'drc_pct', v_drc, 'dry_kg', round(v_wet * v_drc / 100, 2));
  END LOOP;

  -- Phiếu không có dòng lô → một lô cho cả phiếu
  IF v_so_dong = 0 THEN
    v_type := public.fn_chuan_hoa_loai_mu(t.rubber_type);
    IF v_type = 'khac' THEN RAISE EXCEPTION 'LOAI_MU_LA:%:%', t.code, COALESCE(t.rubber_type, '(trống)'); END IF;
    v_wet := t.net_weight;
    IF v_wet IS NULL OR v_wet <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:%', t.code; END IF;
    SELECT COALESCE(t.qc_actual_drc, rt.drc_mac_dinh) INTO v_drc FROM public.raw_rubber_types rt WHERE rt.code = v_type;
    IF v_drc IS NULL THEN RAISE EXCEPTION 'THIEU_DRC:%', t.code; END IF;

    v_batch_no := 'NVL-' || replace(t.code, 'CX-', '');
    v_batch_id := public.fn_nvl_tao_lo(v_batch_no, t.facility_id, v_wh, v_type, v_wet, v_drc, v_received,
                    t.supplier_name, t.expected_drc, t.qc_status, v_nguon, false, t.id, NULL, t.rubber_type);

    INSERT INTO public.raw_stock_ledger (facility_id, batch_id, rubber_type, txn_type, txn_date, wet_kg, drc_pct, dry_kg,
                                         ref_type, ref_id, ref_line, note, created_by)
    VALUES (t.facility_id, v_batch_id, v_type, 'in', v_received, v_wet, v_drc, round(v_wet * v_drc / 100, 2),
            'weighbridge_ticket', t.id, NULL, 'Nhập từ phiếu cân ' || t.code, v_emp);

    v_out := v_out || jsonb_build_object('batch_id', v_batch_id, 'batch_no', v_batch_no, 'rubber_type', v_type,
                                         'wet_kg', v_wet, 'drc_pct', v_drc, 'dry_kg', round(v_wet * v_drc / 100, 2));
  END IF;

  RETURN v_out;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_nhap_kho_tu_phieu_can(uuid, uuid, text) TO authenticated;

-- ─── 5) MỞ SỔ TỒN ĐẦU từ bảng tạm ─────────────────────────────────────────
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
                    COALESCE(r.intake_date, current_date), r.supplier_name, NULL, 'pending',
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

GRANT EXECUTE ON FUNCTION public.fn_mo_so_ton_dau(text) TO authenticated;

-- ─── 6) VIEW TỒN ───────────────────────────────────────────────────────────
-- Tồn theo lô
CREATE OR REPLACE VIEW public.v_raw_stock_balance AS
SELECT
  b.id                                   AS batch_id,
  b.batch_no,
  l.facility_id,
  f.code                                 AS facility_code,
  l.rubber_type,
  rt.name                                AS rubber_type_name,
  rt.nhom,
  b.supplier_name,
  b.nguon_hang,
  b.ton_dau_uoc,
  b.status                               AS batch_status,
  b.qc_status,
  b.received_date,
  b.weighbridge_ticket_id,
  b.ticket_line_no,
  b.warehouse_id,
  round(sum(l.wet_kg), 2)                AS wet_kg,
  round(sum(l.dry_kg), 2)                AS dry_kg,
  CASE WHEN sum(l.wet_kg) > 0 THEN round(100 * sum(l.dry_kg) / sum(l.wet_kg), 2) END AS drc_pct,
  (current_date - COALESCE(b.received_date::date, min(l.txn_date)))::int AS tuoi_ngay,
  max(l.txn_date) FILTER (WHERE l.txn_type = 'recheck_adjust')            AS ngay_can_lai,
  (current_date - COALESCE(
      max(l.txn_date) FILTER (WHERE l.txn_type = 'recheck_adjust'),
      b.received_date::date, min(l.txn_date)))::int                        AS ngay_tu_lan_do,
  count(*)::int                          AS so_dong_so,
  max(l.created_at)                      AS cap_nhat
FROM public.raw_stock_ledger l
JOIN public.stock_batches b      ON b.id = l.batch_id
JOIN public.raw_rubber_types rt  ON rt.code = l.rubber_type
LEFT JOIN public.facilities f    ON f.id = l.facility_id
GROUP BY b.id, b.batch_no, l.facility_id, f.code, l.rubber_type, rt.name, rt.nhom,
         b.supplier_name, b.nguon_hang, b.ton_dau_uoc, b.status, b.qc_status, b.received_date,
         b.weighbridge_ticket_id, b.ticket_line_no, b.warehouse_id;

ALTER VIEW public.v_raw_stock_balance SET (security_invoker = on);
GRANT SELECT ON public.v_raw_stock_balance TO authenticated;

-- Tồn theo nhà máy × loại (chỉ lô còn hàng)
CREATE OR REPLACE VIEW public.v_raw_stock_by_type AS
SELECT
  v.facility_id, v.facility_code, v.rubber_type, v.rubber_type_name, v.nhom,
  count(*)::int                                   AS so_lo,
  round(sum(v.wet_kg), 2)                          AS wet_kg,
  round(sum(v.dry_kg), 2)                          AS dry_kg,
  CASE WHEN sum(v.wet_kg) > 0 THEN round(100 * sum(v.dry_kg) / sum(v.wet_kg), 2) END AS drc_pct,
  round(avg(v.tuoi_ngay), 1)                       AS tuoi_bq_ngay,
  max(v.tuoi_ngay)                                 AS tuoi_max_ngay,
  count(*) FILTER (WHERE v.tuoi_ngay > (public.fn_raw_setting(v.facility_id)).tuoi_lo_canh_bao_ngay)::int AS so_lo_qua_tuoi,
  count(*) FILTER (WHERE v.ton_dau_uoc)::int       AS so_lo_ton_dau_uoc
FROM public.v_raw_stock_balance v
WHERE v.dry_kg > 0.005
GROUP BY v.facility_id, v.facility_code, v.rubber_type, v.rubber_type_name, v.nhom;

ALTER VIEW public.v_raw_stock_by_type SET (security_invoker = on);
GRANT SELECT ON public.v_raw_stock_by_type TO authenticated;

-- Nhập / xuất khô theo ngày (biểu đồ 14 ngày)
CREATE OR REPLACE VIEW public.v_raw_daily_flow AS
SELECT
  l.facility_id, l.txn_date,
  round(sum(l.dry_kg) FILTER (WHERE l.txn_type IN ('in', 'in_transfer')), 2)                       AS nhap_kho_kg,
  round(sum(l.dry_kg) FILTER (WHERE l.txn_type = 'opening'), 2)                                     AS mo_so_kho_kg,
  round(-sum(l.dry_kg) FILTER (WHERE l.txn_type IN ('out_production', 'out_sale', 'out_transfer')), 2) AS xuat_kho_kg,
  round(sum(l.dry_kg) FILTER (WHERE l.txn_type IN ('recheck_adjust', 'stocktake_adjust')), 2)       AS dieu_chinh_kho_kg,
  count(*)::int AS so_dong
FROM public.raw_stock_ledger l
GROUP BY l.facility_id, l.txn_date;

ALTER VIEW public.v_raw_daily_flow SET (security_invoker = on);
GRANT SELECT ON public.v_raw_daily_flow TO authenticated;

-- ─── KIỂM CHỨNG (gửi lại kết quả) ──────────────────────────────────────────
-- (a) Cột mới trên stock_batches:
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'stock_batches'
   AND column_name IN ('facility_id','raw_rubber_type','nguon_hang','ton_dau_uoc','weighbridge_ticket_id','ticket_line_no')
 ORDER BY 1;   -- 6 dòng

-- (b) Sổ + 3 view + 2 hàm có mặt:
SELECT to_regclass('public.raw_stock_ledger') AS so, to_regclass('public.v_raw_stock_balance') AS v1,
       to_regclass('public.v_raw_stock_by_type') AS v2, to_regclass('public.v_raw_daily_flow') AS v3,
       to_regprocedure('public.fn_nhap_kho_tu_phieu_can(uuid,uuid,text)') AS f1,
       to_regprocedure('public.fn_mo_so_ton_dau(text)') AS f2;

-- (c) Kho NVL mặc định của từng nhà máy (NULL = phải tạo warehouse type raw cho nhà máy đó):
SELECT f.code, public.fn_nvl_kho_mac_dinh(f.id) AS kho_nvl FROM public.facilities f ORDER BY f.code;
