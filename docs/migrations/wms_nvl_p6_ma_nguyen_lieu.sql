-- ============================================================
-- KHO NVL — GĐ6: MÃ NGUYÊN LIỆU (TMHG-40) — tầng gom các lô xe, đơn vị nhà máy chạy máy
-- Ngày: 2026-10-30 · Phụ thuộc: wms_nvl_p1..p5, wms_khep_vong_p1, wms_mix_p1..p3
--
-- Quyết định chủ DN 30/10:
--   · Mã chuẩn = NGUỒN-SỐ (TMHG-40); "XE n" chỉ là lô xe con; SBR/hàng thương mại dùng tên hàng làm mã.
--   · Phiếu cân không có mã: thủ kho gán mã lúc nhập kho (máy đọc sẵn từ ô "mã LLM gộp" của phiếu cân).
--   · Xuất sản xuất cân THEO MÃ (một số), máy chia về từng lô xe theo tỷ lệ ướt còn lại.
--   · Một ca chạy một mã (phiếu ca ghi raw_lot_id).
--
--   raw_lots          mã NVL theo nhà máy (unique facility+ma), status mo|dong|huy
--   raw_lot_aliases   bí danh sửa lỗi chính tả người cân gõ (TMGH→TMHG, LAS1→LASI)
--   stock_batches     + raw_lot_id, xe_no      raw_issue_orders + raw_lot_id
--   shift_production_reports + raw_lot_id      qc_reject_log + raw_lot_id
--   fn_chuan_hoa_ma_nvl(text) → (ma, nguon, so, xe)   fn_nvl_lay_hoac_tao_ma(facility, ma, loai)
--   fn_nhap_kho_tu_phieu_can v2 (+ p_raw_lot_id, p_ma) — KHÔNG nhập được nếu không có mã (THIEU_MA_NVL)
--   fn_nvl_tao_lenh_xuat_theo_ma, fn_nvl_ghi_can_xuat_ma (một số cân cho cả mã)
--   views: v_raw_stock_balance (+ma_nvl, xe_no), v_raw_lot_balance, v_raw_intake_ma_goi_y, v_raw_issue_orders (+ma_nvl), v_raw_lot_yield
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── 1) Bảng ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raw_lots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id  uuid NOT NULL REFERENCES public.facilities(id),
  ma           text NOT NULL,                 -- TMHG-40
  nguon        text NOT NULL,                 -- TMHG
  so           int,                           -- 40
  rubber_type  text REFERENCES public.raw_rubber_types(code),
  status       text NOT NULL DEFAULT 'mo',    -- mo | dong | huy
  note         text,
  created_by   uuid REFERENCES public.employees(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT raw_lots_status_chk CHECK (status IN ('mo', 'dong', 'huy')),
  CONSTRAINT raw_lots_uniq UNIQUE (facility_id, ma)
);
CREATE INDEX IF NOT EXISTS raw_lots_facility_idx ON public.raw_lots (facility_id, status);
ALTER TABLE public.raw_lots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY raw_lots_select ON public.raw_lots FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY raw_lots_write_bgd ON public.raw_lots FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.raw_lot_aliases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tu          text NOT NULL UNIQUE,   -- chữ người cân gõ (đã viết hoa, bỏ khoảng trắng)
  thanh       text NOT NULL,          -- nguồn chuẩn
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.raw_lot_aliases ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY rla_select ON public.raw_lot_aliases FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY rla_write_bgd ON public.raw_lot_aliases FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3))
    WITH CHECK (EXISTS (SELECT 1 FROM public.employees e JOIN public.positions p ON p.id = e.position_id WHERE e.user_id = auth.uid() AND p.level <= 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO public.raw_lot_aliases (tu, thanh, note) VALUES
  ('TMGH', 'TMHG', 'gõ nhầm thứ tự chữ (phiếu 03/09)'),
  ('LAS1', 'LASI', 'số 1 thay chữ I'),
  ('LASL', 'LASI', 'chữ L thay I')
ON CONFLICT (tu) DO NOTHING;

ALTER TABLE public.stock_batches ADD COLUMN IF NOT EXISTS raw_lot_id uuid REFERENCES public.raw_lots(id);
ALTER TABLE public.stock_batches ADD COLUMN IF NOT EXISTS xe_no text;
CREATE INDEX IF NOT EXISTS stock_batches_raw_lot_idx ON public.stock_batches (raw_lot_id) WHERE raw_lot_id IS NOT NULL;
ALTER TABLE public.raw_issue_orders ADD COLUMN IF NOT EXISTS raw_lot_id uuid REFERENCES public.raw_lots(id);
ALTER TABLE public.shift_production_reports ADD COLUMN IF NOT EXISTS raw_lot_id uuid REFERENCES public.raw_lots(id);
ALTER TABLE public.qc_reject_log ADD COLUMN IF NOT EXISTS raw_lot_id uuid REFERENCES public.raw_lots(id);

-- ─── 2) Chuẩn hoá chữ người cân gõ → mã ───────────────────────────────────
-- 'TMHG-40 XE1' → (TMHG-40, TMHG, 40, 1) · 'MU TO - TMMN-25-08' → (TMMN-25, TMMN, 25, 08)
-- 'la si -31' → (LASI-31) · 'T MHG-32' → (TMHG-32) · 'TMGH-31' → (TMHG-31, nhờ bí danh) · 'SBR-1502' → (SBR-1502)
CREATE OR REPLACE FUNCTION public.fn_chuan_hoa_ma_nvl(p_text text)
RETURNS TABLE (ma text, nguon text, so int, xe text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v text; m text[]; v_nguon text; v_so int; v_xe text; v_alias text;
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN RETURN; END IF;
  v := upper(p_text);
  v := translate(v, 'ÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ',
                     'AAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD');
  v := btrim(regexp_replace(v, '[^A-Z0-9]+', ' ', 'g'));
  -- bỏ cụm loại mủ đứng đầu (MU TAP, MU TO, HU TO, MH TO, MU NUOC, MU DONG…)
  v := regexp_replace(v, '^(MU|HU|MH|MUI)\s+(TAP|TO|NUOC|DONG|CHEN|DA|TO SO)\s+', '');
  v := regexp_replace(v, '^(MU|MUI)\s+', '');
  -- XE n
  v_xe := substring(v from '\mXE\s*(\d+)');
  v := regexp_replace(v, '\s*\mXE\s*\d*.*$', '');
  -- chữ (cho phép khoảng trắng giữa các chữ) rồi số, rồi (tuỳ chọn) số thứ hai = xe
  m := regexp_match(v, '^([A-Z][A-Z ]*?)\s*(\d{1,4})(?:\s+(\d{1,3}))?');
  IF m IS NULL THEN RETURN; END IF;
  v_nguon := regexp_replace(m[1], '\s+', '', 'g');
  v_so := m[2]::int;
  IF v_xe IS NULL AND m[3] IS NOT NULL THEN v_xe := m[3]; END IF;
  SELECT a.thanh INTO v_alias FROM public.raw_lot_aliases a WHERE a.tu = v_nguon;
  IF v_alias IS NOT NULL THEN v_nguon := v_alias; END IF;
  ma := v_nguon || '-' || v_so; nguon := v_nguon; so := v_so; xe := v_xe;
  RETURN NEXT;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_chuan_hoa_ma_nvl(text) TO authenticated, anon;

-- Lấy mã đã có hoặc tạo mới (thủ kho / QC / BGĐ)
CREATE OR REPLACE FUNCTION public.fn_nvl_lay_hoac_tao_ma(p_facility_id uuid, p_ma text, p_rubber_type text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q json; p record; v_ma text; v_nguon text; v_so int; v_id uuid; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  q := public.fn_nvl_quyen(p_facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:ma_nvl'; END IF;
  SELECT * INTO p FROM public.fn_chuan_hoa_ma_nvl(p_ma);
  IF p.ma IS NULL THEN
    v_ma := btrim(regexp_replace(upper(COALESCE(p_ma, '')), '[^A-Z0-9]+', '-', 'g'), '-');
    IF v_ma = '' THEN RAISE EXCEPTION 'MA_KHONG_HOP_LE:%', p_ma; END IF;
    v_nguon := split_part(v_ma, '-', 1); v_so := NULL;
  ELSE v_ma := p.ma; v_nguon := p.nguon; v_so := p.so; END IF;
  SELECT id INTO v_id FROM public.raw_lots WHERE facility_id = p_facility_id AND ma = v_ma;
  IF v_id IS NULL THEN
    INSERT INTO public.raw_lots (facility_id, ma, nguon, so, rubber_type, created_by) VALUES (p_facility_id, v_ma, v_nguon, v_so, p_rubber_type, v_emp) RETURNING id INTO v_id;
  ELSIF p_rubber_type IS NOT NULL THEN
    UPDATE public.raw_lots SET rubber_type = COALESCE(rubber_type, p_rubber_type), updated_at = now() WHERE id = v_id;
  END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_lay_hoac_tao_ma(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_nvl_sua_ma(p_id uuid, p_status text DEFAULT NULL, p_note text DEFAULT NULL, p_rubber_type text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; q json;
BEGIN
  SELECT * INTO l FROM public.raw_lots WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  q := public.fn_nvl_quyen(l.facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:ma_nvl'; END IF;
  IF p_status = 'huy' AND EXISTS (SELECT 1 FROM public.stock_batches b WHERE b.raw_lot_id = l.id) THEN RAISE EXCEPTION 'DA_TRU_SO:%:mã đã có lô xe, không hủy được', l.ma; END IF;
  UPDATE public.raw_lots SET status = COALESCE(p_status, status), note = COALESCE(p_note, note), rubber_type = COALESCE(p_rubber_type, rubber_type), updated_at = now() WHERE id = l.id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_sua_ma(uuid, text, text, text) TO authenticated;

-- ─── 3) Nhập kho từ phiếu cân v2: phải có mã ──────────────────────────────
DROP FUNCTION IF EXISTS public.fn_nhap_kho_tu_phieu_can(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.fn_nhap_kho_tu_phieu_can(
  p_ticket_id uuid, p_warehouse_id uuid DEFAULT NULL, p_nguon_hang text DEFAULT NULL,
  p_raw_lot_id uuid DEFAULT NULL, p_ma text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t            record;
  i            record;
  p            record;
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
  v_lot        uuid;
  v_xe         text;
  v_ma_text    text;
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

  -- MÃ NGUYÊN LIỆU: tham số > mã gõ > đọc từ ô mã LLM gộp trên phiếu cân
  v_ma_text := COALESCE(NULLIF(btrim(p_ma), ''), t.consolidation_code);
  SELECT * INTO p FROM public.fn_chuan_hoa_ma_nvl(v_ma_text);
  v_xe := p.xe;
  IF p_raw_lot_id IS NOT NULL THEN v_lot := p_raw_lot_id;
  ELSIF v_ma_text IS NOT NULL AND btrim(v_ma_text) <> '' THEN v_lot := public.fn_nvl_lay_hoac_tao_ma(t.facility_id, v_ma_text, NULL);
  END IF;
  IF v_lot IS NULL THEN RAISE EXCEPTION 'THIEU_MA_NVL:%:phiếu không có mã nguyên liệu, chọn hoặc tạo mã rồi nhận', t.code; END IF;
  IF (SELECT status FROM public.raw_lots WHERE id = v_lot) = 'huy' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:mã đã hủy'; END IF;

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

  FOR i IN SELECT * FROM public.weighbridge_ticket_items WHERE ticket_id = t.id ORDER BY line_no LOOP
    v_so_dong := v_so_dong + 1;
    v_type := public.fn_chuan_hoa_loai_mu(i.rubber_type);
    IF v_type = 'khac' THEN RAISE EXCEPTION 'LOAI_MU_LA:%:%', t.code, i.rubber_type; END IF;
    v_wet := COALESCE(i.actual_qty_kg, i.declared_qty_kg);
    IF v_wet IS NULL OR v_wet <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:%:dong %', t.code, i.line_no; END IF;
    SELECT COALESCE(i.drc_percent, t.qc_actual_drc, rt.drc_mac_dinh) INTO v_drc FROM public.raw_rubber_types rt WHERE rt.code = v_type;
    IF v_drc IS NULL THEN RAISE EXCEPTION 'THIEU_DRC:%:dong %', t.code, i.line_no; END IF;
    v_batch_no := 'NVL-' || replace(t.code, 'CX-', '') || '-' || i.line_no;
    v_batch_id := public.fn_nvl_tao_lo(v_batch_no, t.facility_id, v_wh, v_type, v_wet, v_drc, v_received,
                    t.supplier_name, t.expected_drc, t.qc_status, v_nguon, false, t.id, i.line_no, i.rubber_type);
    UPDATE public.stock_batches SET raw_lot_id = v_lot, xe_no = COALESCE(xe_no, v_xe) WHERE id = v_batch_id;
    INSERT INTO public.raw_stock_ledger (facility_id, batch_id, rubber_type, txn_type, txn_date, wet_kg, drc_pct, dry_kg, ref_type, ref_id, ref_line, note, created_by)
    VALUES (t.facility_id, v_batch_id, v_type, 'in', v_received, v_wet, v_drc, round(v_wet * v_drc / 100, 2), 'weighbridge_ticket', t.id, i.line_no, 'Nhập từ phiếu cân ' || t.code || ' dòng ' || i.line_no, v_emp);
    UPDATE public.raw_lots SET rubber_type = COALESCE(rubber_type, v_type), updated_at = now() WHERE id = v_lot;
    v_out := v_out || jsonb_build_object('batch_id', v_batch_id, 'batch_no', v_batch_no, 'rubber_type', v_type, 'wet_kg', v_wet, 'drc_pct', v_drc, 'dry_kg', round(v_wet * v_drc / 100, 2), 'raw_lot_id', v_lot);
  END LOOP;

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
    UPDATE public.stock_batches SET raw_lot_id = v_lot, xe_no = COALESCE(xe_no, v_xe) WHERE id = v_batch_id;
    INSERT INTO public.raw_stock_ledger (facility_id, batch_id, rubber_type, txn_type, txn_date, wet_kg, drc_pct, dry_kg, ref_type, ref_id, ref_line, note, created_by)
    VALUES (t.facility_id, v_batch_id, v_type, 'in', v_received, v_wet, v_drc, round(v_wet * v_drc / 100, 2), 'weighbridge_ticket', t.id, NULL, 'Nhập từ phiếu cân ' || t.code, v_emp);
    UPDATE public.raw_lots SET rubber_type = COALESCE(rubber_type, v_type), updated_at = now() WHERE id = v_lot;
    v_out := v_out || jsonb_build_object('batch_id', v_batch_id, 'batch_no', v_batch_no, 'rubber_type', v_type, 'wet_kg', v_wet, 'drc_pct', v_drc, 'dry_kg', round(v_wet * v_drc / 100, 2), 'raw_lot_id', v_lot);
  END IF;
  RETURN v_out;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nhap_kho_tu_phieu_can(uuid, uuid, text, uuid, text) TO authenticated;

-- ─── 4) Views ─────────────────────────────────────────────────────────────
-- Tồn theo lô xe: thêm mã ở CUỐI (CREATE OR REPLACE chỉ cho thêm cột cuối)
CREATE OR REPLACE VIEW public.v_raw_stock_balance AS
SELECT
  b.id AS batch_id, b.batch_no, l.facility_id, f.code AS facility_code, l.rubber_type, rt.name AS rubber_type_name, rt.nhom,
  b.supplier_name, b.nguon_hang, b.ton_dau_uoc, b.status AS batch_status, b.qc_status, b.received_date, b.weighbridge_ticket_id, b.ticket_line_no, b.warehouse_id,
  round(sum(l.wet_kg), 2) AS wet_kg,
  round(sum(l.dry_kg), 2) AS dry_kg,
  CASE WHEN sum(l.wet_kg) > 0 THEN round(100 * sum(l.dry_kg) / sum(l.wet_kg), 2) END AS drc_pct,
  (current_date - COALESCE(b.received_date::date, min(l.txn_date)))::int AS tuoi_ngay,
  max(l.txn_date) FILTER (WHERE l.txn_type = 'recheck_adjust') AS ngay_can_lai,
  (current_date - COALESCE(max(l.txn_date) FILTER (WHERE l.txn_type = 'recheck_adjust'), b.received_date::date, min(l.txn_date)))::int AS ngay_tu_lan_do,
  count(*)::int AS so_dong_so,
  max(l.created_at) AS cap_nhat,
  b.raw_lot_id, rl.ma AS ma_nvl, b.xe_no
FROM public.raw_stock_ledger l
JOIN public.stock_batches b ON b.id = l.batch_id
JOIN public.raw_rubber_types rt ON rt.code = l.rubber_type
LEFT JOIN public.facilities f ON f.id = l.facility_id
LEFT JOIN public.raw_lots rl ON rl.id = b.raw_lot_id
GROUP BY b.id, b.batch_no, l.facility_id, f.code, l.rubber_type, rt.name, rt.nhom, b.supplier_name, b.nguon_hang, b.ton_dau_uoc, b.status, b.qc_status, b.received_date,
         b.weighbridge_ticket_id, b.ticket_line_no, b.warehouse_id, b.raw_lot_id, rl.ma, b.xe_no;
ALTER VIEW public.v_raw_stock_balance SET (security_invoker = on);
GRANT SELECT ON public.v_raw_stock_balance TO authenticated;

-- Tồn theo MÃ
CREATE OR REPLACE VIEW public.v_raw_lot_balance AS
SELECT rl.id AS raw_lot_id, rl.facility_id, f.code AS facility_code, rl.ma, rl.nguon, rl.so, rl.status, rl.note, rl.created_at,
       COALESCE(rl.rubber_type, min(v.rubber_type)) AS rubber_type,
       COALESCE((SELECT rt.name FROM public.raw_rubber_types rt WHERE rt.code = COALESCE(rl.rubber_type, min(v.rubber_type))), '') AS rubber_type_name,
       count(v.batch_id)::int AS so_xe,
       count(v.batch_id) FILTER (WHERE v.dry_kg > 0.005)::int AS so_xe_con_hang,
       round(COALESCE(sum(v.wet_kg), 0), 2) AS wet_kg,
       round(COALESCE(sum(v.dry_kg), 0), 2) AS dry_kg,
       CASE WHEN sum(v.wet_kg) > 0 THEN round(100 * sum(v.dry_kg) / sum(v.wet_kg), 2) END AS drc_pct,
       min(v.received_date) AS ngay_dau, max(v.received_date) AS ngay_cuoi,
       (current_date - min(v.received_date)::date)::int AS tuoi_ngay,
       max(v.ngay_tu_lan_do) AS ngay_tu_lan_do_max,
       led.nhap_kho_kg, led.xuat_sx_kho_kg, led.dieu_chinh_kho_kg,
       CASE WHEN rl.status = 'huy' THEN 'huy' WHEN rl.status = 'dong' THEN 'dong'
            WHEN COALESCE(sum(v.dry_kg), 0) <= 0.005 AND COALESCE(led.xuat_sx_kho_kg, 0) > 0 THEN 'da_chay_xong'
            WHEN COALESCE(led.xuat_sx_kho_kg, 0) > 0 THEN 'dang_chay'
            WHEN COALESCE(sum(v.dry_kg), 0) > 0.005 THEN 'san_sang' ELSE 'trong' END AS trang_thai
FROM public.raw_lots rl
LEFT JOIN public.facilities f ON f.id = rl.facility_id
LEFT JOIN public.v_raw_stock_balance v ON v.raw_lot_id = rl.id
LEFT JOIN LATERAL (
  SELECT round(sum(l.dry_kg) FILTER (WHERE l.txn_type IN ('in', 'in_transfer', 'opening')), 2) AS nhap_kho_kg,
         round(-sum(l.dry_kg) FILTER (WHERE l.txn_type = 'out_production'), 2) AS xuat_sx_kho_kg,
         round(sum(l.dry_kg) FILTER (WHERE l.txn_type IN ('recheck_adjust', 'stocktake_adjust')), 2) AS dieu_chinh_kho_kg
    FROM public.raw_stock_ledger l JOIN public.stock_batches b ON b.id = l.batch_id WHERE b.raw_lot_id = rl.id
) led ON true
GROUP BY rl.id, rl.facility_id, f.code, rl.ma, rl.nguon, rl.so, rl.status, rl.note, rl.created_at, rl.rubber_type, led.nhap_kho_kg, led.xuat_sx_kho_kg, led.dieu_chinh_kho_kg;
ALTER VIEW public.v_raw_lot_balance SET (security_invoker = on);
GRANT SELECT ON public.v_raw_lot_balance TO authenticated;

-- Mã gợi ý cho hàng đợi nhập (đọc từ ô mã LLM gộp của phiếu cân)
CREATE OR REPLACE VIEW public.v_raw_intake_ma_goi_y AS
SELECT t.id AS ticket_id, t.consolidation_code AS ma_goc, p.ma, p.nguon, p.so, p.xe, rl.id AS raw_lot_id, rl.status AS raw_lot_status
FROM public.weighbridge_tickets t
CROSS JOIN LATERAL public.fn_chuan_hoa_ma_nvl(t.consolidation_code) p
LEFT JOIN public.raw_lots rl ON rl.facility_id = t.facility_id AND rl.ma = p.ma
WHERE t.status = 'completed' AND t.consolidation_code IS NOT NULL AND btrim(t.consolidation_code) <> '';
ALTER VIEW public.v_raw_intake_ma_goi_y SET (security_invoker = on);
GRANT SELECT ON public.v_raw_intake_ma_goi_y TO authenticated;

-- Lệnh xuất: thêm mã (o.* đổi vì có cột mới ⇒ phải DROP rồi tạo lại)
DROP VIEW IF EXISTS public.v_raw_issue_orders;
CREATE VIEW public.v_raw_issue_orders AS
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
       es.full_name AS submitted_name, eq.full_name AS qc_confirmed_name, er.full_name AS received_name,
       rl.ma AS ma_nvl
FROM public.raw_issue_orders o
LEFT JOIN public.facilities f ON f.id = o.facility_id
LEFT JOIN public.production_orders po ON po.id = o.production_order_id
LEFT JOIN public.employees es ON es.id = o.submitted_by
LEFT JOIN public.employees eq ON eq.id = o.qc_confirmed_by
LEFT JOIN public.employees er ON er.id = o.received_by
LEFT JOIN public.raw_lots rl ON rl.id = o.raw_lot_id;
ALTER VIEW public.v_raw_issue_orders SET (security_invoker = on);
GRANT SELECT ON public.v_raw_issue_orders TO authenticated;

-- ─── 5) Xuất sản xuất THEO MÃ ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_nvl_tao_lenh_xuat_theo_ma(p_facility_id uuid, p_raw_lot_id uuid, p_muc_dich text DEFAULT 'production', p_production_order_id uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lines jsonb; v_id uuid; v_ma text;
BEGIN
  SELECT ma INTO v_ma FROM public.raw_lots WHERE id = p_raw_lot_id AND facility_id = p_facility_id;
  IF v_ma IS NULL THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO:mã'; END IF;
  SELECT jsonb_agg(jsonb_build_object('batch_id', v.batch_id, 'planned_wet_kg', v.wet_kg) ORDER BY v.received_date, v.batch_no)
    INTO v_lines FROM public.v_raw_stock_balance v WHERE v.raw_lot_id = p_raw_lot_id AND v.dry_kg > 0.005;
  IF v_lines IS NULL THEN RAISE EXCEPTION 'LO_DA_HET:%', v_ma; END IF;
  v_id := public.fn_nvl_tao_lenh_xuat(p_facility_id, COALESCE(p_muc_dich, 'production'), p_production_order_id, NULL, NULL, NULL, COALESCE(p_note, 'Xuất cả mã ' || v_ma), v_lines);
  UPDATE public.raw_issue_orders SET raw_lot_id = p_raw_lot_id WHERE id = v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_tao_lenh_xuat_theo_ma(uuid, uuid, text, uuid, text) TO authenticated;

-- Một số cân cho cả mã → chia về từng lô xe theo tỷ lệ ướt còn lại (dòng cuối nhận phần dư)
CREATE OR REPLACE FUNCTION public.fn_nvl_ghi_can_xuat_ma(p_order_id uuid, p_tong_wet_kg numeric, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; l record; v_tong_ton numeric := 0; v_da_chia numeric := 0; v_n int := 0; v_i int := 0; v_kg numeric;
BEGIN
  SELECT * INTO o FROM public.raw_issue_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LENH'; END IF;
  IF o.status <> 'draft' THEN RAISE EXCEPTION 'LENH_DA_GUI_KY:%', o.code; END IF;
  IF p_tong_wet_kg IS NULL OR p_tong_wet_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  SELECT count(*), COALESCE(sum(v.wet_kg), 0) INTO v_n, v_tong_ton
    FROM public.raw_issue_lines il JOIN public.v_raw_stock_balance v ON v.batch_id = il.batch_id WHERE il.order_id = o.id;
  IF v_n = 0 THEN RAISE EXCEPTION 'LENH_TRONG'; END IF;
  IF p_tong_wet_kg > v_tong_ton + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:cân % > tồn cả mã %', o.code, p_tong_wet_kg, round(v_tong_ton, 2); END IF;
  FOR l IN SELECT il.id, v.wet_kg FROM public.raw_issue_lines il JOIN public.v_raw_stock_balance v ON v.batch_id = il.batch_id WHERE il.order_id = o.id ORDER BY il.line_no LOOP
    v_i := v_i + 1;
    IF v_i = v_n THEN v_kg := round(p_tong_wet_kg - v_da_chia, 2);
    ELSE v_kg := LEAST(round(p_tong_wet_kg * l.wet_kg / NULLIF(v_tong_ton, 0), 2), l.wet_kg); END IF;
    IF v_kg < 0 THEN v_kg := 0; END IF;
    PERFORM public.fn_nvl_ghi_can_xuat(l.id, v_kg, p_note);
    v_da_chia := v_da_chia + v_kg;
  END LOOP;
  RETURN jsonb_build_object('code', o.code, 'so_dong', v_n, 'tong_wet_kg', p_tong_wet_kg, 'ton_truoc_kg', round(v_tong_ton, 2));
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_ghi_can_xuat_ma(uuid, numeric, text) TO authenticated;

-- ─── 6) Hiệu suất & tỷ lệ lỗi theo MÃ (TP từ phiếu ca ghi mã đang chạy) ────
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
         (SELECT round(COALESCE(sum(i.kg_used), 0), 2) FROM public.mix_issues i
           WHERE i.status = 'received' AND EXISTS (SELECT 1 FROM public.shift_production_reports r2 WHERE r2.raw_lot_id = b.raw_lot_id AND r2.facility_id = i.facility_id AND r2.report_date = i.shift_date AND r2.shift_id = i.shift_id)) AS chen_tieu_hao_kg
    FROM public.shift_production_reports r
    LEFT JOIN public.v_shift_production_lines v ON v.report_id = r.id AND v.status = 'received'
   WHERE r.raw_lot_id = b.raw_lot_id AND r.status = 'received'
) sc ON true;
ALTER VIEW public.v_raw_lot_yield SET (security_invoker = on);
GRANT SELECT ON public.v_raw_lot_yield TO authenticated;

-- ─── 6b) Gán / đổi mã cho một lô xe (thủ kho sửa tay trên điện thoại) ─────
CREATE OR REPLACE FUNCTION public.fn_nvl_gan_ma_lo_xe(p_batch_id uuid, p_raw_lot_id uuid, p_xe text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; q json; v_fac uuid;
BEGIN
  SELECT id, facility_id, raw_rubber_type, batch_no INTO b FROM public.stock_batches WHERE id = p_batch_id;
  IF NOT FOUND OR b.raw_rubber_type IS NULL THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  SELECT facility_id INTO v_fac FROM public.raw_lots WHERE id = p_raw_lot_id AND status <> 'huy';
  IF v_fac IS NULL THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO:mã'; END IF;
  IF v_fac <> b.facility_id THEN RAISE EXCEPTION 'LO_KHAC_NHA_MAY:%', b.batch_no; END IF;
  q := public.fn_nvl_quyen(b.facility_id);
  IF NOT ((q->>'la_thu_kho')::boolean OR (q->>'la_qc')::boolean OR (q->>'la_bgd')::boolean OR auth.uid() IS NULL) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:ma_nvl'; END IF;
  UPDATE public.stock_batches SET raw_lot_id = p_raw_lot_id, xe_no = COALESCE(p_xe, xe_no), updated_at = now() WHERE id = b.id;
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_gan_ma_lo_xe(uuid, uuid, text) TO authenticated;

-- ─── 7) Gán mã cho lô xe đã nhập trước đây (đọc từ phiếu cân) ─────────────
DO $$
DECLARE r record; v_lot uuid; p record;
BEGIN
  FOR r IN SELECT b.id AS batch_id, t.facility_id, t.consolidation_code
             FROM public.stock_batches b JOIN public.weighbridge_tickets t ON t.id = b.weighbridge_ticket_id
            WHERE b.raw_rubber_type IS NOT NULL AND b.raw_lot_id IS NULL AND t.consolidation_code IS NOT NULL AND btrim(t.consolidation_code) <> ''
  LOOP
    SELECT * INTO p FROM public.fn_chuan_hoa_ma_nvl(r.consolidation_code);
    IF p.ma IS NOT NULL THEN
      v_lot := public.fn_nvl_lay_hoac_tao_ma(r.facility_id, r.consolidation_code, NULL);
      UPDATE public.stock_batches SET raw_lot_id = v_lot, xe_no = p.xe WHERE id = r.batch_id;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT * FROM public.fn_chuan_hoa_ma_nvl('TMHG-40 XE1');            -- TMHG-40 | TMHG | 40 | 1
SELECT * FROM public.fn_chuan_hoa_ma_nvl('MU TO  -   TMMN-25-08');  -- TMMN-25 | TMMN | 25 | 08
SELECT * FROM public.fn_chuan_hoa_ma_nvl('la si -31');              -- LASI-31
SELECT * FROM public.fn_chuan_hoa_ma_nvl('TMGH-31');                -- TMHG-31 (bí danh)
SELECT * FROM public.fn_chuan_hoa_ma_nvl('SBR-1502');               -- SBR-1502
SELECT to_regclass('public.raw_lots') AS t1, to_regclass('public.v_raw_lot_balance') AS v1, to_regclass('public.v_raw_intake_ma_goi_y') AS v2,
       to_regprocedure('public.fn_nhap_kho_tu_phieu_can(uuid,uuid,text,uuid,text)') AS f_nhap_v2,
       to_regprocedure('public.fn_nvl_ghi_can_xuat_ma(uuid,numeric,text)') AS f_can_ma,
       (SELECT count(*) FROM public.stock_batches WHERE raw_lot_id IS NOT NULL) AS lo_xe_da_gan_ma;
SELECT ma, nguon, so, so_xe, wet_kg, dry_kg, trang_thai FROM public.v_raw_lot_balance ORDER BY ngay_cuoi DESC NULLS LAST LIMIT 10;
