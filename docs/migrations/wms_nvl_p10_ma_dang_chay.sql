-- ============================================================
-- KHO NVL — GĐ6b: SỔ "MÃ ĐANG CHẠY" (30/10/2026, chủ DN: "1 mã có thể có nhiều ca tham gia")
--   · Khai một lần khi mã bắt đầu chạy (raw_lot_runs), kết thúc khi xong; nhiều mã chạy chung được
--   · Phiếu ca ép bành, phiếu chèn, lô thành phẩm tự gắn mã đang chạy nếu không chọn tay
--   · v_raw_lot_balance: trạng thái 'dang_chay' theo sổ này (ưu tiên), thêm cột dang_chay_tu
-- Ngày: 2026-10-30 · Phụ thuộc: wms_mix_p9_tra_bi_pallet.sql (CHẠY p8 → p9 → p10)
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.raw_lot_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.facilities(id),
  raw_lot_id  uuid NOT NULL REFERENCES public.raw_lots(id),
  started_at  timestamptz NOT NULL DEFAULT now(),
  started_by  uuid REFERENCES public.employees(id),
  ended_at    timestamptz,
  ended_by    uuid REFERENCES public.employees(id),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.raw_lot_runs IS 'Sổ mã nguyên liệu đang chạy: một dòng cho mỗi đợt chạy của một mã (started_at → ended_at NULL = đang chạy). Nhiều mã chạy chung được.';
CREATE INDEX IF NOT EXISTS rlr_active_idx ON public.raw_lot_runs (facility_id, raw_lot_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS rlr_time_idx ON public.raw_lot_runs (facility_id, started_at, ended_at);
ALTER TABLE public.raw_lot_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY rlr_select ON public.raw_lot_runs FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.raw_lot_runs TO authenticated;   -- ghi chỉ qua hàm

-- Mã đang chạy tại một thời điểm (mảng, theo thứ tự bắt đầu)
CREATE OR REPLACE FUNCTION public.fn_nvl_ma_dang_chay(p_facility_id uuid, p_at timestamptz DEFAULT now())
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(r.raw_lot_id ORDER BY r.started_at), ARRAY[]::uuid[])
    FROM public.raw_lot_runs r
   WHERE r.facility_id = p_facility_id AND r.started_at <= p_at AND (r.ended_at IS NULL OR r.ended_at > p_at)
$$;
-- Đúng một mã đang chạy → trả mã đó, còn lại NULL (để tự điền an toàn)
CREATE OR REPLACE FUNCTION public.fn_nvl_ma_dang_chay_1(p_facility_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN cardinality(a) = 1 THEN a[1] END FROM (SELECT public.fn_nvl_ma_dang_chay(p_facility_id, now()) AS a) s
$$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_ma_dang_chay(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nvl_ma_dang_chay_1(uuid) TO authenticated;

-- Bắt đầu chạy một mã (QS khai báo hàng chèn, thủ kho NVL hoặc BGĐ); p_thay_the = kết thúc các mã khác đang chạy
CREATE OR REPLACE FUNCTION public.fn_nvl_bat_dau_chay(p_raw_lot_id uuid, p_thay_the boolean DEFAULT false, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rl record; v_emp uuid := public.fn_nvl_emp_hien_tai(); v_id uuid;
BEGIN
  SELECT * INTO rl FROM public.raw_lots WHERE id = p_raw_lot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF rl.status = 'huy' THEN RAISE EXCEPTION 'SAI_TRANG_THAI:%:mã đã hủy', rl.ma; END IF;
  IF NOT (public.fn_mix_duoc_ky('khai_bao', rl.facility_id) OR public.fn_nvl_duoc_ky('receive', rl.facility_id)) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:bat_dau_chay'; END IF;
  IF COALESCE(p_thay_the, false) THEN
    UPDATE public.raw_lot_runs SET ended_at = now(), ended_by = v_emp WHERE facility_id = rl.facility_id AND ended_at IS NULL AND raw_lot_id <> p_raw_lot_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.raw_lot_runs WHERE raw_lot_id = p_raw_lot_id AND ended_at IS NULL) THEN
    RETURN jsonb_build_object('ma', rl.ma, 'da_chay', true);
  END IF;
  INSERT INTO public.raw_lot_runs (facility_id, raw_lot_id, started_by, note) VALUES (rl.facility_id, p_raw_lot_id, v_emp, p_note) RETURNING id INTO v_id;
  UPDATE public.raw_lots SET status = 'mo' WHERE id = p_raw_lot_id AND status = 'dong';
  RETURN jsonb_build_object('ma', rl.ma, 'run_id', v_id, 'da_chay', false);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_bat_dau_chay(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_nvl_ket_thuc_chay(p_raw_lot_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rl record; v_emp uuid := public.fn_nvl_emp_hien_tai(); v_n int;
BEGIN
  SELECT * INTO rl FROM public.raw_lots WHERE id = p_raw_lot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF NOT (public.fn_mix_duoc_ky('khai_bao', rl.facility_id) OR public.fn_nvl_duoc_ky('receive', rl.facility_id)) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:ket_thuc_chay'; END IF;
  UPDATE public.raw_lot_runs SET ended_at = now(), ended_by = v_emp, note = COALESCE(p_note, note) WHERE raw_lot_id = p_raw_lot_id AND ended_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ma', rl.ma, 'da_ket_thuc', v_n);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_ket_thuc_chay(uuid, text) TO authenticated;

CREATE OR REPLACE VIEW public.v_raw_lot_runs AS
SELECT r.id, r.facility_id, r.raw_lot_id, rl.ma, rl.nguon, r.started_at, r.ended_at, r.note,
       es.full_name AS started_name, ee.full_name AS ended_name,
       (r.ended_at IS NULL) AS dang_chay
FROM public.raw_lot_runs r
JOIN public.raw_lots rl ON rl.id = r.raw_lot_id
LEFT JOIN public.employees es ON es.id = r.started_by
LEFT JOIN public.employees ee ON ee.id = r.ended_by;
ALTER VIEW public.v_raw_lot_runs SET (security_invoker = on);
GRANT SELECT ON public.v_raw_lot_runs TO authenticated;

-- ─── Phiếu ca ép bành: tạo mới không chọn mã → mã đang chạy (nếu đúng một) ──
CREATE OR REPLACE FUNCTION public.trg_shift_report_ma_dang_chay()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.raw_lot_id IS NULL THEN NEW.raw_lot_id := public.fn_nvl_ma_dang_chay_1(NEW.facility_id); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS shift_report_ma_dang_chay ON public.shift_production_reports;
CREATE TRIGGER shift_report_ma_dang_chay BEFORE INSERT ON public.shift_production_reports FOR EACH ROW EXECUTE FUNCTION public.trg_shift_report_ma_dang_chay();

-- ─── Phiếu chèn: phiếu ca → sổ mã đang chạy (tất cả mã đang chạy lúc lấy) ──
CREATE OR REPLACE FUNCTION public.trg_mix_issue_ma_goc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid; v_ids uuid[];
BEGIN
  IF NEW.raw_lot_id IS NULL AND NEW.shift_id IS NOT NULL THEN
    SELECT r.raw_lot_id INTO v FROM public.shift_production_reports r WHERE r.facility_id = NEW.facility_id AND r.report_date = NEW.shift_date AND r.shift_id = NEW.shift_id;
    IF v IS NOT NULL THEN NEW.raw_lot_id := v; NEW.raw_lot_ids := ARRAY[v]; END IF;
  END IF;
  IF NEW.raw_lot_id IS NULL THEN
    v_ids := NULLIF(public.fn_nvl_ma_dang_chay(NEW.facility_id, COALESCE(NEW.out_at, now())), ARRAY[]::uuid[]);
    IF v_ids IS NOT NULL THEN NEW.raw_lot_id := v_ids[1]; NEW.raw_lot_ids := v_ids; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_mix_lay(
  p_lot_id uuid, p_kg numeric, p_shift_date date DEFAULT current_date, p_shift_id uuid DEFAULT NULL, p_team text DEFAULT NULL,
  p_purpose text DEFAULT 'chay_lai', p_target_index text DEFAULT NULL, p_target_value numeric DEFAULT NULL,
  p_production_order_id uuid DEFAULT NULL, p_note text DEFAULT NULL, p_id uuid DEFAULT NULL,
  p_raw_lot_ids uuid[] DEFAULT NULL, p_so_banh int DEFAULT NULL, p_gross_kg numeric DEFAULT NULL, p_pallet_kg numeric DEFAULT NULL, p_vi_tri text DEFAULT NULL,
  p_so_lo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; v_ton numeric; v_id uuid; v_ids uuid[]; v_kg numeric; v_so_lo text; v_banh int; v_emp uuid := public.fn_nvl_emp_hien_tai();
BEGIN
  SELECT * INTO l FROM public.mix_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF NOT public.fn_mix_duoc_ky('khai_bao', l.facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  IF l.status IN ('depleted', 'cancelled') THEN RAISE EXCEPTION 'LO_DA_HET:%', l.code; END IF;
  IF l.source_type = 'dkl' AND NOT l.metal_cleared THEN RAISE EXCEPTION 'DKL_CHUA_XU_LY:%', l.code; END IF;
  IF l.so_lo IS NULL THEN
    v_so_lo := public.fn_mix_chuan_so_lo(p_so_lo);
    IF v_so_lo IS NULL THEN RAISE EXCEPTION 'THIEU_SO_LO:%:lô chưa có số lô, gõ số lô trên bao rồi lấy', l.code; END IF;
    UPDATE public.mix_lots SET so_lo = v_so_lo, updated_at = now() WHERE id = l.id;
  END IF;
  v_kg := COALESCE(p_kg, CASE WHEN p_gross_kg IS NOT NULL THEN round(p_gross_kg - COALESCE(p_pallet_kg, 0), 2) END);
  IF v_kg IS NULL OR v_kg <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG'; END IF;
  IF p_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.mix_issues WHERE id = p_id) THEN RAISE EXCEPTION 'DA_GHI_SO:phiếu đã ghi rồi'; END IF;
  v_ton := l.kg_in - l.kg_used - l.kg_at_line;
  IF v_kg > v_ton + 0.01 THEN RAISE EXCEPTION 'VUOT_TON:%:lấy % > tồn %', l.code, v_kg, v_ton; END IF;
  v_banh := COALESCE(p_so_banh, round(v_kg / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int);

  v_ids := (SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(p_raw_lot_ids, ARRAY[]::uuid[])) x WHERE x IS NOT NULL);
  IF v_ids IS NULL AND p_shift_id IS NOT NULL THEN
    SELECT CASE WHEN r.raw_lot_id IS NULL THEN NULL ELSE ARRAY[r.raw_lot_id] END INTO v_ids
      FROM public.shift_production_reports r WHERE r.facility_id = l.facility_id AND r.report_date = COALESCE(p_shift_date, current_date) AND r.shift_id = p_shift_id;
  END IF;
  IF v_ids IS NULL THEN v_ids := NULLIF(public.fn_nvl_ma_dang_chay(l.facility_id, now()), ARRAY[]::uuid[]); END IF;   -- dự phòng: sổ mã đang chạy
  IF v_ids IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(v_ids) x LEFT JOIN public.raw_lots rl ON rl.id = x WHERE rl.id IS NULL OR rl.facility_id <> l.facility_id) THEN
    RAISE EXCEPTION 'LO_KHAC_NHA_MAY:mã gốc';
  END IF;

  INSERT INTO public.mix_issues (id, code, facility_id, mix_lot_id, shift_date, shift_id, team, purpose, target_index, target_value,
                                 kg_out, out_by, production_order_id, note, created_by, raw_lot_id, raw_lot_ids, so_banh, gross_kg, pallet_kg, vi_tri)
  VALUES (COALESCE(p_id, gen_random_uuid()), public.fn_mix_ma('PC', l.facility_id), l.facility_id, l.id, COALESCE(p_shift_date, current_date), p_shift_id, p_team,
          COALESCE(p_purpose, 'chay_lai'), p_target_index, p_target_value, v_kg, v_emp, p_production_order_id, p_note, v_emp,
          CASE WHEN v_ids IS NULL THEN NULL ELSE v_ids[1] END, v_ids, v_banh, p_gross_kg, p_pallet_kg, p_vi_tri)
  RETURNING id INTO v_id;

  UPDATE public.mix_lots SET kg_at_line = kg_at_line + v_kg, status = 'in_use', updated_at = now() WHERE id = l.id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_fg_tao_lo(
  p_facility_id uuid, p_so_lo text, p_material_id uuid, p_so_banh int, p_shift_date date DEFAULT current_date, p_shift_id uuid DEFAULT NULL,
  p_team text DEFAULT NULL, p_raw_lot_id uuid DEFAULT NULL, p_co_chen boolean DEFAULT false, p_note text DEFAULT NULL, p_tu_fg_lot_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; r record; v_so_lo text; v_kg numeric; v_id uuid; v_emp uuid := public.fn_nvl_emp_hien_tai(); v_tong int;
BEGIN
  p_raw_lot_id := COALESCE(p_raw_lot_id, public.fn_nvl_ma_dang_chay_1(p_facility_id));   -- tự theo sổ mã đang chạy
  IF NOT public.fn_nvl_duoc_ky('submit', p_facility_id) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN'; END IF;
  v_so_lo := upper(btrim(regexp_replace(COALESCE(p_so_lo, ''), '\s+', '', 'g')));
  IF v_so_lo = '' THEN RAISE EXCEPTION 'THIEU_SO_LO'; END IF;
  IF p_so_banh IS NULL OR p_so_banh <= 0 THEN RAISE EXCEPTION 'THIEU_KHOI_LUONG:số bành'; END IF;
  IF p_shift_id IS NULL THEN RAISE EXCEPTION 'THIEU_CA:chọn ca'; END IF;
  SELECT id, code, name, weight_per_unit INTO m FROM public.materials WHERE id = p_material_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_DONG:material'; END IF;
  IF m.weight_per_unit IS NULL OR m.weight_per_unit <= 0 THEN RAISE EXCEPTION 'THIEU_CO_BANH:%', m.code; END IF;
  IF EXISTS (SELECT 1 FROM public.fg_lots WHERE facility_id = p_facility_id AND so_lo = v_so_lo) THEN RAISE EXCEPTION 'TRUNG_SO_LO:%', v_so_lo; END IF;
  v_kg := round(p_so_banh * m.weight_per_unit, 2);

  -- phiếu ca của ca này: có thì dùng (phải còn nháp), chưa có thì mở nháp
  SELECT * INTO r FROM public.shift_production_reports WHERE facility_id = p_facility_id AND report_date = p_shift_date AND shift_id = p_shift_id;
  IF NOT FOUND THEN
    INSERT INTO public.shift_production_reports (facility_id, report_date, shift_id, team, status, raw_lot_id)
    VALUES (p_facility_id, p_shift_date, p_shift_id, p_team, 'draft', p_raw_lot_id) RETURNING * INTO r;
  ELSIF r.status <> 'draft' THEN
    RAISE EXCEPTION 'PHIEU_CA_DA_KY:%:ghi vào ca sau hoặc nhờ thủ kho mở lại', r.status;
  ELSE
    UPDATE public.shift_production_reports SET raw_lot_id = COALESCE(raw_lot_id, p_raw_lot_id), team = COALESCE(team, p_team), updated_at = now() WHERE id = r.id;
  END IF;

  INSERT INTO public.fg_lots (facility_id, so_lo, material_id, report_id, shift_date, shift_id, team, so_banh, kg_per_banh, kg, raw_lot_id, co_chen, tu_fg_lot_id, note, created_by)
  VALUES (p_facility_id, v_so_lo, m.id, r.id, p_shift_date, p_shift_id, COALESCE(p_team, r.team), p_so_banh, m.weight_per_unit, v_kg,
          COALESCE(p_raw_lot_id, r.raw_lot_id), COALESCE(p_co_chen, false), p_tu_fg_lot_id, p_note, v_emp)
  RETURNING id INTO v_id;

  -- dòng nhập bành của chủng loại trong phiếu ca = Σ lô của ca đó
  SELECT COALESCE(sum(so_banh), 0) INTO v_tong FROM public.fg_lots WHERE report_id = r.id AND material_id = m.id AND status <> 'huy';
  INSERT INTO public.shift_production_lines (report_id, material_id, nhap_banh, xuat_banh, note)
  VALUES (r.id, m.id, v_tong, 0, 'Từ lô TP')
  ON CONFLICT (report_id, material_id) DO UPDATE SET nhap_banh = EXCLUDED.nhap_banh, updated_at = now();
  RETURN v_id;
END $$;

-- ─── v_raw_lot_balance: 'dang_chay' theo sổ (ưu tiên), thêm dang_chay_tu ở cuối ──
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
            WHEN run.started_at IS NOT NULL THEN 'dang_chay'
            WHEN COALESCE(sum(v.dry_kg), 0) <= 0.005 AND COALESCE(led.xuat_sx_kho_kg, 0) > 0 THEN 'da_chay_xong'
            WHEN COALESCE(led.xuat_sx_kho_kg, 0) > 0 THEN 'dang_chay'
            WHEN COALESCE(sum(v.dry_kg), 0) > 0.005 THEN 'san_sang' ELSE 'trong' END AS trang_thai,
       run.started_at AS dang_chay_tu
FROM public.raw_lots rl
LEFT JOIN public.facilities f ON f.id = rl.facility_id
LEFT JOIN public.v_raw_stock_balance v ON v.raw_lot_id = rl.id
LEFT JOIN LATERAL (
  SELECT round(sum(l.dry_kg) FILTER (WHERE l.txn_type IN ('in', 'in_transfer', 'opening')), 2) AS nhap_kho_kg,
         round(-sum(l.dry_kg) FILTER (WHERE l.txn_type = 'out_production'), 2) AS xuat_sx_kho_kg,
         round(sum(l.dry_kg) FILTER (WHERE l.txn_type IN ('recheck_adjust', 'stocktake_adjust')), 2) AS dieu_chinh_kho_kg
    FROM public.raw_stock_ledger l JOIN public.stock_batches b ON b.id = l.batch_id WHERE b.raw_lot_id = rl.id
) led ON true
LEFT JOIN LATERAL (SELECT r.started_at FROM public.raw_lot_runs r WHERE r.raw_lot_id = rl.id AND r.ended_at IS NULL ORDER BY r.started_at DESC LIMIT 1) run ON true
GROUP BY rl.id, rl.facility_id, f.code, rl.ma, rl.nguon, rl.so, rl.status, rl.note, rl.created_at, rl.rubber_type, led.nhap_kho_kg, led.xuat_sx_kho_kg, led.dieu_chinh_kho_kg, run.started_at;
ALTER VIEW public.v_raw_lot_balance SET (security_invoker = on);
GRANT SELECT ON public.v_raw_lot_balance TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT to_regprocedure('public.fn_nvl_bat_dau_chay(uuid,boolean,text)') AS f_bat_dau, to_regprocedure('public.fn_nvl_ket_thuc_chay(uuid,text)') AS f_ket_thuc,
       to_regprocedure('public.fn_nvl_ma_dang_chay(uuid,timestamptz)') AS f_dang_chay, to_regclass('public.v_raw_lot_runs') AS v_runs,
       (SELECT count(*) FROM pg_trigger WHERE tgname = 'shift_report_ma_dang_chay') AS trg_phieu_ca,
       (SELECT count(*) FROM information_schema.columns WHERE table_name = 'v_raw_lot_balance' AND column_name = 'dang_chay_tu') AS cot_dang_chay_tu;
