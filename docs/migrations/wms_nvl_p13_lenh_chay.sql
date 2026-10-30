-- ============================================================
-- MÃ NVL / HÀNG CHÈN — GĐ4m: LỆNH CHẠY GỒM NHIỀU MÃ (30/10/2026 tối, chủ DN đọc sổ tay tổ ép:
--   "mã 15 + 17 chạy 1 lần, mã 39 để riêng … khi tạo lệnh để chạy có cơ sở tạo 1 lệnh chạy nhiều mã hàng,
--    theo đó chèn hàng biết được chèn vào mã nào (có thể là gộp 2 mã)"; "2 vị trí chèn thôi: Bể Slap và máy Mix")
--   · nvl_lenh_chay: một lệnh = 1..n mã gộp (raw_lot_ids, ma_gop "KHMN-15 + KHMN-17"); nhiều lệnh chạy SONG SONG được
--     (ca Hiền: chèn máy Mix vào 15+17 trong lúc TMHG-39 chèn bể Slap) · raw_lot_runs / mix_issues / shift_production_reports gắn lenh_id
--   · fn_nvl_bat_dau_lenh(ids, thay_the=true, gop_vao, note): thay thế (kết thúc lệnh cũ) · song song · gộp thêm mã vào lệnh đang chạy
--     fn_nvl_bat_dau_chay(mã) giữ nguyên = lệnh một mã · fn_nvl_ket_thuc_lenh · fn_nvl_tong_ket_lenh (tổng kết + mail BGĐ theo lệnh)
--   · Phiếu chèn: đúng một lệnh đang chạy → tự gắn mã của lệnh; nhiều lệnh → QS chọn lệnh (chip trên điện thoại)
--   · Phiếu ca: gắn lệnh; ô mã tự điền chỉ khi lệnh có một mã (lệnh 15+17 → mã để trống, TP tính theo lệnh)
-- Ngày: 2026-10-30 · Phụ thuộc: wms_nvl_p12_ket_thuc_ma.sql (CHẠY p11 → p12 → p13)
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── Bảng lệnh chạy ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nvl_lenh_chay (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.facilities(id),
  code        text NOT NULL,
  raw_lot_ids uuid[] NOT NULL,
  ma_gop      text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  started_by  uuid REFERENCES public.employees(id),
  ended_at    timestamptz,
  ended_by    uuid REFERENCES public.employees(id),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facility_id, code)
);
COMMENT ON TABLE public.nvl_lenh_chay IS 'Lệnh chạy: một đợt chạy máy gồm 1..n mã nguyên liệu gộp (KHMN-15 + 17). ended_at NULL = đang chạy. Nhiều lệnh chạy song song được.';
CREATE INDEX IF NOT EXISTS nlc_active_idx ON public.nvl_lenh_chay (facility_id) WHERE ended_at IS NULL;
ALTER TABLE public.nvl_lenh_chay ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY nlc_select ON public.nvl_lenh_chay FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
GRANT SELECT ON public.nvl_lenh_chay TO authenticated;   -- ghi chỉ qua hàm

ALTER TABLE public.raw_lot_runs ADD COLUMN IF NOT EXISTS lenh_id uuid REFERENCES public.nvl_lenh_chay(id);
ALTER TABLE public.mix_issues ADD COLUMN IF NOT EXISTS lenh_id uuid REFERENCES public.nvl_lenh_chay(id);
ALTER TABLE public.shift_production_reports ADD COLUMN IF NOT EXISTS lenh_id uuid REFERENCES public.nvl_lenh_chay(id);
CREATE INDEX IF NOT EXISTS mix_issues_lenh_idx ON public.mix_issues (lenh_id);
CREATE INDEX IF NOT EXISTS spr_lenh_idx ON public.shift_production_reports (lenh_id);

-- ─── Hàm phụ ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_nvl_lenh_ma_gop(p_ids uuid[])
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT string_agg(rl.ma, ' + ' ORDER BY rl.ma) FROM public.raw_lots rl WHERE rl.id = ANY(p_ids)
$$;

CREATE OR REPLACE FUNCTION public.fn_nvl_lenh_ma(p_facility_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fac text; v_n int; v_code text;
BEGIN
  SELECT code INTO v_fac FROM public.facilities WHERE id = p_facility_id;
  SELECT count(*) INTO v_n FROM public.nvl_lenh_chay WHERE facility_id = p_facility_id AND started_at::date = current_date;
  v_code := 'LC-' || COALESCE(v_fac, '') || '-' || to_char(now(), 'YYMMDD') || '-' || lpad((v_n + 1)::text, 2, '0');
  WHILE EXISTS (SELECT 1 FROM public.nvl_lenh_chay WHERE facility_id = p_facility_id AND code = v_code) LOOP
    v_n := v_n + 1; v_code := 'LC-' || COALESCE(v_fac, '') || '-' || to_char(now(), 'YYMMDD') || '-' || lpad((v_n + 1)::text, 2, '0');
  END LOOP;
  RETURN v_code;
END $$;

-- đúng MỘT lệnh đang chạy tại thời điểm → id lệnh, còn lại NULL (0 hoặc nhiều lệnh song song)
CREATE OR REPLACE FUNCTION public.fn_nvl_lenh_dang_chay_1(p_facility_id uuid, p_at timestamptz DEFAULT now())
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN count(*) = 1 THEN min(g.id::text)::uuid END
    FROM public.nvl_lenh_chay g
   WHERE g.facility_id = p_facility_id AND g.started_at <= p_at AND (g.ended_at IS NULL OR g.ended_at > p_at)
$$;

-- lệnh chứa bộ mã (ưu tiên đúng bộ, rồi lệnh bao trùm), đang chạy quanh thời điểm (± 1 giờ)
CREATE OR REPLACE FUNCTION public.fn_nvl_lenh_cua_ma(p_facility_id uuid, p_ids uuid[], p_at timestamptz DEFAULT now())
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id FROM public.nvl_lenh_chay g
   WHERE g.facility_id = p_facility_id AND p_ids IS NOT NULL AND cardinality(p_ids) > 0 AND g.raw_lot_ids @> p_ids
     AND g.started_at <= p_at + interval '1 hour' AND (g.ended_at IS NULL OR g.ended_at >= p_at - interval '1 hour')
   ORDER BY (g.raw_lot_ids <@ p_ids) DESC, g.started_at DESC
   LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_lenh_ma_gop(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nvl_lenh_dang_chay_1(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_nvl_lenh_cua_ma(uuid, uuid[], timestamptz) TO authenticated;

-- phiếu chèn của một lệnh (gắn lenh_id, hoặc phiếu cũ: bộ mã nằm trong lệnh và lấy trong lúc lệnh chạy)
CREATE OR REPLACE FUNCTION public.fn_nvl_lenh_phieu_chen(p_lenh_id uuid)
RETURNS SETOF public.mix_issues LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.* FROM public.mix_issues i JOIN public.nvl_lenh_chay g ON g.id = p_lenh_id
   WHERE i.status <> 'cancelled'
     AND (i.lenh_id = g.id
          OR (i.lenh_id IS NULL AND i.facility_id = g.facility_id AND i.raw_lot_ids IS NOT NULL AND i.raw_lot_ids <@ g.raw_lot_ids
              AND i.out_at >= g.started_at - interval '1 hour' AND (g.ended_at IS NULL OR i.out_at <= g.ended_at + interval '1 hour')))
$$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_lenh_phieu_chen(uuid) TO authenticated;

-- ─── Chuyển sổ cũ: mỗi đợt chạy (raw_lot_runs) chưa có lệnh → một lệnh một mã (id lệnh = id đợt) ──
INSERT INTO public.nvl_lenh_chay (id, facility_id, code, raw_lot_ids, ma_gop, started_at, started_by, ended_at, ended_by, note, created_at)
SELECT r.id, r.facility_id,
       'LC-' || COALESCE(f.code, '') || '-' || to_char(r.started_at, 'YYMMDD') || '-' || lpad((row_number() OVER (PARTITION BY r.facility_id, r.started_at::date ORDER BY r.started_at, r.id))::text, 2, '0') || 'x',
       ARRAY[r.raw_lot_id], rl.ma, r.started_at, r.started_by, r.ended_at, r.ended_by, r.note, r.created_at
  FROM public.raw_lot_runs r JOIN public.raw_lots rl ON rl.id = r.raw_lot_id LEFT JOIN public.facilities f ON f.id = r.facility_id
 WHERE r.lenh_id IS NULL
ON CONFLICT (id) DO NOTHING;
UPDATE public.raw_lot_runs SET lenh_id = id WHERE lenh_id IS NULL AND EXISTS (SELECT 1 FROM public.nvl_lenh_chay g WHERE g.id = raw_lot_runs.id);
UPDATE public.mix_issues i SET lenh_id = public.fn_nvl_lenh_cua_ma(i.facility_id, i.raw_lot_ids, i.out_at) WHERE i.lenh_id IS NULL AND i.raw_lot_ids IS NOT NULL;
UPDATE public.shift_production_reports r SET lenh_id = public.fn_nvl_lenh_cua_ma(r.facility_id, ARRAY[r.raw_lot_id], r.report_date::timestamp + interval '12 hours')
 WHERE r.lenh_id IS NULL AND r.raw_lot_id IS NOT NULL;

-- ─── Bắt đầu lệnh: thay thế (mặc định) · song song · gộp thêm mã vào lệnh đang chạy ──
CREATE OR REPLACE FUNCTION public.fn_nvl_bat_dau_lenh(p_raw_lot_ids uuid[], p_thay_the boolean DEFAULT true, p_gop_vao uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids uuid[]; v_fac uuid; v_emp uuid := public.fn_nvl_emp_hien_tai(); g record; v_id uuid; v_code text; v_gop text; v_thay text[] := ARRAY[]::text[]; v_moi uuid[];
BEGIN
  v_ids := (SELECT array_agg(DISTINCT i ORDER BY i) FROM unnest(COALESCE(p_raw_lot_ids, ARRAY[]::uuid[])) i WHERE i IS NOT NULL);
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN RAISE EXCEPTION 'THIEU_MA_LENH:chọn ít nhất một mã nguyên liệu'; END IF;
  IF (SELECT count(*) FROM public.raw_lots rl WHERE rl.id = ANY(v_ids)) <> cardinality(v_ids) THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF (SELECT count(DISTINCT rl.facility_id) FROM public.raw_lots rl WHERE rl.id = ANY(v_ids)) <> 1 THEN RAISE EXCEPTION 'LO_KHAC_NHA_MAY:các mã trong một lệnh phải cùng nhà máy'; END IF;
  IF EXISTS (SELECT 1 FROM public.raw_lots rl WHERE rl.id = ANY(v_ids) AND rl.status = 'huy') THEN RAISE EXCEPTION 'SAI_TRANG_THAI:mã đã hủy'; END IF;
  SELECT rl.facility_id INTO v_fac FROM public.raw_lots rl WHERE rl.id = v_ids[1];
  IF NOT (public.fn_mix_duoc_ky('khai_bao', v_fac) OR public.fn_nvl_duoc_ky('receive', v_fac)) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:bat_dau_lenh'; END IF;
  v_gop := public.fn_nvl_lenh_ma_gop(v_ids);

  -- gộp thêm mã vào lệnh đang chạy (KHMN-15 đang chạy, thêm 17 → lệnh 15 + 17)
  IF p_gop_vao IS NOT NULL THEN
    SELECT * INTO g FROM public.nvl_lenh_chay WHERE id = p_gop_vao FOR UPDATE;
    IF NOT FOUND OR g.ended_at IS NOT NULL OR g.facility_id <> v_fac THEN RAISE EXCEPTION 'SAI_TRANG_THAI:lệnh không còn chạy hoặc khác nhà máy'; END IF;
    v_moi := (SELECT array_agg(i) FROM unnest(v_ids) i WHERE NOT (i = ANY(g.raw_lot_ids)));
    IF v_moi IS NULL THEN RETURN jsonb_build_object('lenh_id', g.id, 'code', g.code, 'ma_gop', g.ma_gop, 'da_chay', true, 'gop', true, 'da_thay', '[]'::jsonb); END IF;
    IF EXISTS (SELECT 1 FROM public.raw_lot_runs r WHERE r.raw_lot_id = ANY(v_moi) AND r.ended_at IS NULL AND r.lenh_id IS DISTINCT FROM g.id) THEN
      RAISE EXCEPTION 'MA_DANG_CHAY_LENH_KHAC:mã đang nằm trong lệnh khác — kết thúc lệnh đó trước';
    END IF;
    UPDATE public.nvl_lenh_chay SET raw_lot_ids = g.raw_lot_ids || v_moi, ma_gop = public.fn_nvl_lenh_ma_gop(g.raw_lot_ids || v_moi), note = COALESCE(p_note, note) WHERE id = g.id;
    INSERT INTO public.raw_lot_runs (facility_id, raw_lot_id, started_by, note, lenh_id) SELECT v_fac, i, v_emp, 'gộp vào ' || g.code, g.id FROM unnest(v_moi) i;
    UPDATE public.raw_lots SET status = 'mo' WHERE id = ANY(v_moi) AND status = 'dong';
    RETURN jsonb_build_object('lenh_id', g.id, 'code', g.code, 'ma_gop', public.fn_nvl_lenh_ma_gop(g.raw_lot_ids || v_moi), 'da_chay', false, 'gop', true, 'da_thay', '[]'::jsonb);
  END IF;

  -- lệnh đang chạy đúng bộ mã này → không tạo trùng
  SELECT * INTO g FROM public.nvl_lenh_chay WHERE facility_id = v_fac AND ended_at IS NULL AND raw_lot_ids @> v_ids AND raw_lot_ids <@ v_ids ORDER BY started_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('lenh_id', g.id, 'code', g.code, 'ma_gop', g.ma_gop, 'da_chay', true, 'gop', false, 'da_thay', '[]'::jsonb); END IF;

  IF COALESCE(p_thay_the, true) THEN
    -- mặc định THAY THẾ: kết thúc mọi lệnh đang chạy của nhà máy (chủ DN 30/10)
    WITH u AS (UPDATE public.nvl_lenh_chay x SET ended_at = now(), ended_by = v_emp, note = concat_ws(' · ', x.note, 'thay bằng ' || v_gop)
                WHERE x.facility_id = v_fac AND x.ended_at IS NULL RETURNING x.ma_gop)
    SELECT COALESCE(array_agg(u.ma_gop), ARRAY[]::text[]) INTO v_thay FROM u;
    UPDATE public.raw_lot_runs SET ended_at = now(), ended_by = v_emp WHERE facility_id = v_fac AND ended_at IS NULL;
  ELSIF EXISTS (SELECT 1 FROM public.raw_lot_runs r WHERE r.facility_id = v_fac AND r.raw_lot_id = ANY(v_ids) AND r.ended_at IS NULL) THEN
    RAISE EXCEPTION 'MA_DANG_CHAY_LENH_KHAC:mã đang nằm trong lệnh khác — gộp vào lệnh đó hoặc chọn thay thế';
  END IF;

  v_code := public.fn_nvl_lenh_ma(v_fac);
  INSERT INTO public.nvl_lenh_chay (facility_id, code, raw_lot_ids, ma_gop, started_by, note) VALUES (v_fac, v_code, v_ids, v_gop, v_emp, p_note) RETURNING id INTO v_id;
  INSERT INTO public.raw_lot_runs (facility_id, raw_lot_id, started_by, note, lenh_id) SELECT v_fac, i, v_emp, p_note, v_id FROM unnest(v_ids) i;
  UPDATE public.raw_lots SET status = 'mo' WHERE id = ANY(v_ids) AND status = 'dong';
  RETURN jsonb_build_object('lenh_id', v_id, 'code', v_code, 'ma_gop', v_gop, 'da_chay', false, 'gop', false, 'da_thay', to_jsonb(v_thay));
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_bat_dau_lenh(uuid[], boolean, uuid, text) TO authenticated;

-- API cũ giữ nguyên: khai một mã = lệnh một mã
CREATE OR REPLACE FUNCTION public.fn_nvl_bat_dau_chay(p_raw_lot_id uuid, p_thay_the boolean DEFAULT true, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ma text;
BEGIN
  SELECT ma INTO v_ma FROM public.raw_lots WHERE id = p_raw_lot_id;
  IF v_ma IS NULL THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  RETURN public.fn_nvl_bat_dau_lenh(ARRAY[p_raw_lot_id], p_thay_the, NULL, p_note) || jsonb_build_object('ma', v_ma);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_bat_dau_chay(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_nvl_ket_thuc_lenh(p_lenh_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g record; v_emp uuid := public.fn_nvl_emp_hien_tai(); v_n int;
BEGIN
  SELECT * INTO g FROM public.nvl_lenh_chay WHERE id = p_lenh_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LENH'; END IF;
  IF NOT (public.fn_mix_duoc_ky('khai_bao', g.facility_id) OR public.fn_nvl_duoc_ky('receive', g.facility_id)) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:ket_thuc_lenh'; END IF;
  UPDATE public.raw_lot_runs SET ended_at = now(), ended_by = v_emp WHERE lenh_id = g.id AND ended_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE public.nvl_lenh_chay SET ended_at = COALESCE(ended_at, now()), ended_by = COALESCE(ended_by, v_emp), note = COALESCE(p_note, note) WHERE id = g.id;
  RETURN jsonb_build_object('code', g.code, 'ma_gop', g.ma_gop, 'da_ket_thuc', v_n);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_ket_thuc_lenh(uuid, text) TO authenticated;

-- kết thúc một mã: đóng đợt chạy của mã; lệnh không còn mã nào chạy → kết thúc lệnh
CREATE OR REPLACE FUNCTION public.fn_nvl_ket_thuc_chay(p_raw_lot_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rl record; v_emp uuid := public.fn_nvl_emp_hien_tai(); v_n int;
BEGIN
  SELECT * INTO rl FROM public.raw_lots WHERE id = p_raw_lot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  IF NOT (public.fn_mix_duoc_ky('khai_bao', rl.facility_id) OR public.fn_nvl_duoc_ky('receive', rl.facility_id)) THEN RAISE EXCEPTION 'KHONG_CO_QUYEN:ket_thuc_chay'; END IF;
  UPDATE public.raw_lot_runs SET ended_at = now(), ended_by = v_emp, note = COALESCE(p_note, note) WHERE raw_lot_id = p_raw_lot_id AND ended_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE public.nvl_lenh_chay x SET ended_at = now(), ended_by = v_emp
   WHERE x.facility_id = rl.facility_id AND x.ended_at IS NULL AND NOT EXISTS (SELECT 1 FROM public.raw_lot_runs r WHERE r.lenh_id = x.id AND r.ended_at IS NULL);
  RETURN jsonb_build_object('ma', rl.ma, 'da_ket_thuc', v_n);
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_ket_thuc_chay(uuid, text) TO authenticated;

-- ─── Phiếu ca: gắn lệnh; ô mã tự điền chỉ khi lệnh có một mã ────────────────
CREATE OR REPLACE FUNCTION public.trg_shift_report_ma_dang_chay()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_at timestamptz := CASE WHEN NEW.report_date = current_date THEN now() ELSE NEW.report_date::timestamp + interval '12 hours' END; v_ids uuid[];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.raw_lot_id IS DISTINCT FROM OLD.raw_lot_id THEN
      NEW.lenh_id := CASE WHEN NEW.raw_lot_id IS NULL THEN NULL ELSE public.fn_nvl_lenh_cua_ma(NEW.facility_id, ARRAY[NEW.raw_lot_id], v_at) END;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.lenh_id IS NULL AND NEW.raw_lot_id IS NOT NULL THEN NEW.lenh_id := public.fn_nvl_lenh_cua_ma(NEW.facility_id, ARRAY[NEW.raw_lot_id], v_at); END IF;
  IF NEW.lenh_id IS NULL AND NEW.raw_lot_id IS NULL THEN NEW.lenh_id := public.fn_nvl_lenh_dang_chay_1(NEW.facility_id, v_at); END IF;
  IF NEW.raw_lot_id IS NULL AND NEW.lenh_id IS NOT NULL THEN
    SELECT g.raw_lot_ids INTO v_ids FROM public.nvl_lenh_chay g WHERE g.id = NEW.lenh_id;
    IF cardinality(v_ids) = 1 THEN NEW.raw_lot_id := v_ids[1]; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS shift_report_ma_dang_chay ON public.shift_production_reports;
CREATE TRIGGER shift_report_ma_dang_chay BEFORE INSERT OR UPDATE OF raw_lot_id ON public.shift_production_reports FOR EACH ROW EXECUTE FUNCTION public.trg_shift_report_ma_dang_chay();

-- ─── Phiếu chèn (lúc trả / đổi ca): phiếu ca → lệnh của phiếu ca → một lệnh đang chạy ──
CREATE OR REPLACE FUNCTION public.trg_mix_issue_ma_goc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid; v_lenh uuid; v_ids uuid[];
BEGIN
  IF NEW.raw_lot_id IS NULL AND NEW.shift_id IS NOT NULL THEN
    SELECT r.raw_lot_id, r.lenh_id INTO v, v_lenh FROM public.shift_production_reports r WHERE r.facility_id = NEW.facility_id AND r.report_date = NEW.shift_date AND r.shift_id = NEW.shift_id;
    IF v IS NOT NULL THEN NEW.raw_lot_id := v; NEW.raw_lot_ids := ARRAY[v]; NEW.lenh_id := COALESCE(NEW.lenh_id, v_lenh);
    ELSIF v_lenh IS NOT NULL THEN
      SELECT g.raw_lot_ids INTO v_ids FROM public.nvl_lenh_chay g WHERE g.id = v_lenh;
      IF v_ids IS NOT NULL THEN NEW.raw_lot_id := v_ids[1]; NEW.raw_lot_ids := v_ids; NEW.lenh_id := v_lenh; END IF;
    END IF;
  END IF;
  IF NEW.raw_lot_id IS NULL THEN
    v_lenh := public.fn_nvl_lenh_dang_chay_1(NEW.facility_id, COALESCE(NEW.out_at, now()));
    IF v_lenh IS NOT NULL THEN
      SELECT g.raw_lot_ids INTO v_ids FROM public.nvl_lenh_chay g WHERE g.id = v_lenh;
      NEW.raw_lot_id := v_ids[1]; NEW.raw_lot_ids := v_ids; NEW.lenh_id := v_lenh;
    END IF;
  END IF;
  IF NEW.lenh_id IS NULL AND NEW.raw_lot_ids IS NOT NULL THEN NEW.lenh_id := public.fn_nvl_lenh_cua_ma(NEW.facility_id, NEW.raw_lot_ids, COALESCE(NEW.out_at, now())); END IF;
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
DECLARE l record; v_ton numeric; v_id uuid; v_ids uuid[]; v_kg numeric; v_so_lo text; v_banh int; v_emp uuid := public.fn_nvl_emp_hien_tai(); v_lenh uuid;
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
  -- lúc lấy chỉ cân tổng (chưa trừ bì): ước số bành theo (cân − 15) để không dư 1 bành; sửa lại lúc trả
  v_banh := COALESCE(p_so_banh, GREATEST(round(GREATEST(v_kg - CASE WHEN p_gross_kg IS NOT NULL AND p_pallet_kg IS NULL THEN 15 ELSE 0 END, 0) / COALESCE(NULLIF(l.kg_per_banh, 0), 35))::int, 1));

  v_ids := (SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(p_raw_lot_ids, ARRAY[]::uuid[])) x WHERE x IS NOT NULL);
  IF v_ids IS NULL AND p_shift_id IS NOT NULL THEN
    SELECT CASE WHEN r.raw_lot_id IS NULL THEN NULL ELSE ARRAY[r.raw_lot_id] END INTO v_ids
      FROM public.shift_production_reports r WHERE r.facility_id = l.facility_id AND r.report_date = COALESCE(p_shift_date, current_date) AND r.shift_id = p_shift_id;
  END IF;
  IF v_ids IS NULL THEN   -- dự phòng: đúng MỘT lệnh đang chạy → mã của lệnh đó; nhiều lệnh song song → QS phải chọn (phiếu vào 'chưa gắn mã')
    SELECT g.raw_lot_ids INTO v_ids FROM public.nvl_lenh_chay g WHERE g.id = public.fn_nvl_lenh_dang_chay_1(l.facility_id, now());
  END IF;
  IF v_ids IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(v_ids) x LEFT JOIN public.raw_lots rl ON rl.id = x WHERE rl.id IS NULL OR rl.facility_id <> l.facility_id) THEN
    RAISE EXCEPTION 'LO_KHAC_NHA_MAY:mã gốc';
  END IF;

  v_lenh := CASE WHEN v_ids IS NULL THEN NULL ELSE public.fn_nvl_lenh_cua_ma(l.facility_id, v_ids, now()) END;   -- lệnh chứa đúng bộ mã này
  INSERT INTO public.mix_issues (id, code, facility_id, mix_lot_id, shift_date, shift_id, team, purpose, target_index, target_value,
                                 kg_out, out_by, production_order_id, note, created_by, raw_lot_id, raw_lot_ids, so_banh, gross_kg, pallet_kg, vi_tri, so_banh_tay, lenh_id)
  VALUES (COALESCE(p_id, gen_random_uuid()), public.fn_mix_ma('PC', l.facility_id), l.facility_id, l.id, COALESCE(p_shift_date, current_date), p_shift_id, p_team,
          COALESCE(p_purpose, 'chay_lai'), p_target_index, p_target_value, v_kg, v_emp, p_production_order_id, p_note, v_emp,
          CASE WHEN v_ids IS NULL THEN NULL ELSE v_ids[1] END, v_ids, v_banh, p_gross_kg, p_pallet_kg, p_vi_tri, (p_so_banh IS NOT NULL), v_lenh)
  RETURNING id INTO v_id;

  UPDATE public.mix_lots SET kg_at_line = kg_at_line + v_kg, status = 'in_use', updated_at = now() WHERE id = l.id;
  RETURN v_id;
END $$;

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
  UPDATE public.mix_issues SET raw_lot_ids = v_ids, raw_lot_id = CASE WHEN v_ids IS NULL THEN NULL ELSE v_ids[1] END, vi_tri = COALESCE(p_vi_tri, vi_tri),
         lenh_id = CASE WHEN v_ids IS NULL THEN NULL ELSE public.fn_nvl_lenh_cua_ma(i.facility_id, v_ids, i.out_at) END, updated_at = now() WHERE id = i.id;
END $$;

-- ─── Tổng kết một LỆNH (gộp mã): NVL vào từng mã + tổng, chèn, TP, theo ca, BGĐ ──
CREATE OR REPLACE FUNCTION public.fn_nvl_tong_ket_lenh(p_lenh_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE g record; v_ma jsonb; v_rt text; v_nvl record; v_chen record; v_lo jsonb; v_ca jsonb; v_phieu jsonb; v_tp record; v_bgd jsonb; v_nguoi jsonb; v_fac text; v_dot jsonb; v_xuat numeric;
BEGIN
  SELECT * INTO g FROM public.nvl_lenh_chay WHERE id = p_lenh_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LENH'; END IF;
  SELECT f.code INTO v_fac FROM public.facilities f WHERE f.id = g.facility_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('ma', b.ma, 'rubber_type_name', b.rubber_type_name, 'so_xe', b.so_xe, 'wet_kg', b.wet_kg, 'dry_kg', b.dry_kg, 'drc_pct', b.drc_pct,
                                               'nhap_kho_kg', b.nhap_kho_kg, 'xuat_sx_kho_kg', b.xuat_sx_kho_kg, 'ngay_dau', b.ngay_dau, 'ngay_cuoi', b.ngay_cuoi) ORDER BY b.ma), '[]'::jsonb),
         string_agg(DISTINCT NULLIF(b.rubber_type_name, ''), ', ')
    INTO v_ma, v_rt FROM public.v_raw_lot_balance b WHERE b.raw_lot_id = ANY(g.raw_lot_ids);
  SELECT COALESCE(sum(b.so_xe), 0) AS so_xe, round(COALESCE(sum(b.wet_kg), 0), 2) AS wet_kg, round(COALESCE(sum(b.dry_kg), 0), 2) AS dry_kg,
         CASE WHEN sum(b.wet_kg) > 0 THEN round(100 * sum(b.dry_kg) / sum(b.wet_kg), 2) END AS drc_pct,
         round(sum(b.nhap_kho_kg), 2) AS nhap_kho_kg, round(sum(b.xuat_sx_kho_kg), 2) AS xuat_sx_kho_kg, min(b.ngay_dau) AS ngay_dau, max(b.ngay_cuoi) AS ngay_cuoi
    INTO v_nvl FROM public.v_raw_lot_balance b WHERE b.raw_lot_id = ANY(g.raw_lot_ids);
  v_xuat := COALESCE(v_nvl.xuat_sx_kho_kg, 0);

  -- phiếu chèn của lệnh (nguyên kg, không chia đều — lệnh nhận trọn)
  SELECT jsonb_build_object(
           'tong', count(*), 'chua_tra', count(*) FILTER (WHERE i.status = 'issued'),
           'cho_ky', count(*) FILTER (WHERE i.status IN ('returned', 'submitted', 'qc_confirmed')), 'da_nhan', count(*) FILTER (WHERE i.status = 'received'),
           'so_ca', count(DISTINCT (i.shift_date, i.shift_id)),
           'kg_lay', round(COALESCE(sum(i.kg_out), 0), 1), 'kg_tra', round(COALESCE(sum(i.kg_return), 0), 1),
           'tieu_hao', round(COALESCE(sum(i.kg_used), 0), 1), 'tieu_hao_da_nhan', round(COALESCE(sum(i.kg_used) FILTER (WHERE i.status = 'received'), 0), 1),
           'so_banh', COALESCE(sum(i.so_banh), 0),
           'be_slap', round(COALESCE(sum(i.kg_used) FILTER (WHERE i.vi_tri = 'be_slap'), 0), 1),
           'may_mix', round(COALESCE(sum(i.kg_used) FILTER (WHERE i.vi_tri = 'may_mix'), 0), 1),
           'lan_dau', min(i.out_at), 'lan_cuoi', max(COALESCE(i.return_at, i.out_at)))
    INTO v_phieu FROM public.fn_nvl_lenh_phieu_chen(p_lenh_id) i;
  SELECT round(COALESCE(sum(i.kg_used), 0), 2) AS chen_kg, count(*)::int AS so_phieu, COALESCE(sum(i.so_banh), 0)::int AS so_banh,
         round(COALESCE(sum(i.kg_used) FILTER (WHERE i.vi_tri = 'be_slap'), 0), 2) AS be_kg,
         round(COALESCE(sum(i.kg_used) FILTER (WHERE i.vi_tri = 'may_mix'), 0), 2) AS mix_kg,
         round(COALESCE(sum(i.kg_used) FILTER (WHERE l.source_type = 'loi'), 0), 2) AS loi_kg,
         round(COALESCE(sum(i.kg_used) FILTER (WHERE l.source_type = 'dkl'), 0), 2) AS dkl_kg,
         round(COALESCE(sum(i.kg_used) FILTER (WHERE l.source_type = 'std'), 0), 2) AS chuan_kg,
         round(COALESCE(sum(i.kg_used) FILTER (WHERE l.source_type IN ('mua_ngoai', 'khac')), 0), 2) AS khac_kg
    INTO v_chen FROM public.fn_nvl_lenh_phieu_chen(p_lenh_id) i JOIN public.mix_lots l ON l.id = i.mix_lot_id WHERE i.status = 'received';
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'kg')::numeric DESC), '[]'::jsonb) INTO v_lo FROM (
    SELECT jsonb_build_object('lot_code', l.code, 'so_lo', l.so_lo, 'vi_tri', i.vi_tri, 'source_type', l.source_type, 'grade', l.grade, 'desc', l.source_desc,
             'kg', round(sum(i.kg_used), 2), 'so_banh', sum(i.so_banh), 'so_phieu', count(*), 'co_chung', false) AS x
      FROM public.fn_nvl_lenh_phieu_chen(p_lenh_id) i JOIN public.mix_lots l ON l.id = i.mix_lot_id WHERE i.status = 'received'
     GROUP BY l.code, l.so_lo, i.vi_tri, l.source_type, l.grade, l.source_desc) q;
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'shift_date'), (x->>'shift_name'), (x->>'team')), '[]'::jsonb) INTO v_ca FROM (
    SELECT jsonb_build_object('shift_date', i.shift_date, 'shift_name', COALESCE(sh.name, sh.code, ''), 'team', i.team, 'so_lan', count(*),
             'kg_lay', round(COALESCE(sum(i.kg_out), 0), 1), 'kg_tra', round(COALESCE(sum(i.kg_return), 0), 1), 'tieu_hao', round(COALESCE(sum(i.kg_used), 0), 1),
             'da_nhan', round(COALESCE(sum(i.kg_used) FILTER (WHERE i.status = 'received'), 0), 1),
             'chua_tra', count(*) FILTER (WHERE i.status = 'issued'), 'cho_ky', count(*) FILTER (WHERE i.status IN ('returned', 'submitted', 'qc_confirmed'))) AS x
      FROM public.fn_nvl_lenh_phieu_chen(p_lenh_id) i LEFT JOIN public.shifts sh ON sh.id = i.shift_id
     GROUP BY i.shift_date, sh.name, sh.code, i.team) q;

  -- thành phẩm: phiếu ca gắn lệnh (hoặc phiếu ca cũ của mã trong lệnh, trong ngày lệnh chạy)
  SELECT count(DISTINCT r.id)::int AS so_ca,
         round(COALESCE(sum(v.nhap_kg) FILTER (WHERE v.code NOT IN ('LOI', 'DKL', 'CHEN')), 0), 2) AS tp_dat_kg,
         round(COALESCE(sum(v.nhap_kg) FILTER (WHERE v.code IN ('LOI', 'DKL')), 0), 2) AS loi_dkl_kg
    INTO v_tp
    FROM public.shift_production_reports r LEFT JOIN public.v_shift_production_lines v ON v.report_id = r.id AND v.status = 'received'
   WHERE r.status = 'received'
     AND (r.lenh_id = g.id OR (r.lenh_id IS NULL AND r.facility_id = g.facility_id AND r.raw_lot_id = ANY(g.raw_lot_ids)
                               AND r.report_date >= g.started_at::date AND (g.ended_at IS NULL OR r.report_date <= g.ended_at::date)));

  SELECT jsonb_build_array(jsonb_build_object('started_at', g.started_at, 'ended_at', g.ended_at, 'started_name', es.full_name, 'ended_name', ee.full_name, 'note', g.note))
    INTO v_dot FROM (SELECT 1) s LEFT JOIN public.employees es ON es.id = g.started_by LEFT JOIN public.employees ee ON ee.id = g.ended_by;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', e.full_name, 'email', e.email, 'chuc_vu', p.name) ORDER BY p.level, e.full_name), '[]'::jsonb) INTO v_bgd
    FROM public.employees e JOIN public.positions p ON p.id = e.position_id
   WHERE COALESCE(p.level, 99) <= 3 AND e.status = 'active' AND COALESCE(btrim(e.email), '') <> '';
  SELECT jsonb_build_object('name', e.full_name, 'email', e.email) INTO v_nguoi FROM public.employees e WHERE e.id = public.fn_nvl_emp_hien_tai();

  RETURN jsonb_build_object(
    'lenh_id', g.id, 'lenh_code', g.code, 'raw_lot_id', g.raw_lot_ids[1], 'ma', g.ma_gop, 'nguon', '', 'facility_code', v_fac, 'rubber_type_name', COALESCE(v_rt, ''),
    'trang_thai', CASE WHEN g.ended_at IS NULL THEN 'dang_chay' ELSE 'da_chay_xong' END, 'dang_chay', g.ended_at IS NULL, 'ma_list', v_ma,
    'so_xe', v_nvl.so_xe, 'wet_kg', v_nvl.wet_kg, 'dry_kg', v_nvl.dry_kg, 'drc_pct', v_nvl.drc_pct, 'nhap_kho_kg', v_nvl.nhap_kho_kg, 'xuat_sx_kho_kg', v_nvl.xuat_sx_kho_kg,
    'ngay_dau', v_nvl.ngay_dau, 'ngay_cuoi', v_nvl.ngay_cuoi,
    'so_ca_ep', v_tp.so_ca, 'tp_dat_kg', v_tp.tp_dat_kg, 'loi_dkl_kg', v_tp.loi_dkl_kg,
    'hieu_suat_pct', CASE WHEN v_xuat + COALESCE(v_chen.chen_kg, 0) > 0 THEN round(100 * COALESCE(v_tp.tp_dat_kg, 0) / (v_xuat + COALESCE(v_chen.chen_kg, 0)), 1) END,
    'ty_le_loi_pct', CASE WHEN COALESCE(v_tp.tp_dat_kg, 0) + COALESCE(v_tp.loi_dkl_kg, 0) > 0 THEN round(100 * COALESCE(v_tp.loi_dkl_kg, 0) / (COALESCE(v_tp.tp_dat_kg, 0) + COALESCE(v_tp.loi_dkl_kg, 0)), 1) END,
    'chen', jsonb_build_object('chen_kg', v_chen.chen_kg, 'so_phieu', v_chen.so_phieu, 'so_banh', v_chen.so_banh, 'be_kg', v_chen.be_kg, 'mix_kg', v_chen.mix_kg,
             'loi_kg', v_chen.loi_kg, 'dkl_kg', v_chen.dkl_kg, 'chuan_kg', v_chen.chuan_kg, 'khac_kg', v_chen.khac_kg,
             'ty_le_pct', CASE WHEN v_xuat > 0 THEN round(100 * COALESCE(v_chen.chen_kg, 0) / (v_xuat + COALESCE(v_chen.chen_kg, 0)), 1) END, 'chi_tiet', v_lo),
    'phieu', v_phieu, 'theo_ca', v_ca, 'dot_chay', v_dot, 'bgd', v_bgd, 'nguoi_lap', v_nguoi, 'luc', now());
END $$;
GRANT EXECUTE ON FUNCTION public.fn_nvl_tong_ket_lenh(uuid) TO authenticated;

-- ─── Views ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_nvl_lenh_chay AS
SELECT g.id, g.facility_id, f.code AS facility_code, g.code, g.raw_lot_ids, g.ma_gop, cardinality(g.raw_lot_ids) AS so_ma, g.started_at, g.ended_at, g.note, g.created_at,
       es.full_name AS started_name, ee.full_name AS ended_name, (g.ended_at IS NULL) AS dang_chay,
       ch.chen_kg, ch.so_phieu, ch.phieu_mo, ch.tieu_hao_cho_ky
FROM public.nvl_lenh_chay g
LEFT JOIN public.facilities f ON f.id = g.facility_id
LEFT JOIN public.employees es ON es.id = g.started_by
LEFT JOIN public.employees ee ON ee.id = g.ended_by
LEFT JOIN LATERAL (
  SELECT round(COALESCE(sum(i.kg_used) FILTER (WHERE i.status = 'received'), 0), 1) AS chen_kg, count(*)::int AS so_phieu,
         count(*) FILTER (WHERE i.status IN ('issued', 'returned', 'submitted', 'qc_confirmed'))::int AS phieu_mo,
         round(COALESCE(sum(i.kg_used) FILTER (WHERE i.status IN ('returned', 'submitted', 'qc_confirmed')), 0), 1) AS tieu_hao_cho_ky
    FROM public.fn_nvl_lenh_phieu_chen(g.id) i) ch ON true;
ALTER VIEW public.v_nvl_lenh_chay SET (security_invoker = on);
GRANT SELECT ON public.v_nvl_lenh_chay TO authenticated;

CREATE OR REPLACE VIEW public.v_raw_lot_runs AS
SELECT r.id, r.facility_id, r.raw_lot_id, rl.ma, rl.nguon, r.started_at, r.ended_at, r.note,
       es.full_name AS started_name, ee.full_name AS ended_name,
       (r.ended_at IS NULL) AS dang_chay,
       r.lenh_id, g.code AS lenh_code, g.ma_gop AS lenh_ma_gop
FROM public.raw_lot_runs r
JOIN public.raw_lots rl ON rl.id = r.raw_lot_id
LEFT JOIN public.employees es ON es.id = r.started_by
LEFT JOIN public.employees ee ON ee.id = r.ended_by
LEFT JOIN public.nvl_lenh_chay g ON g.id = r.lenh_id;
ALTER VIEW public.v_raw_lot_runs SET (security_invoker = on);
GRANT SELECT ON public.v_raw_lot_runs TO authenticated;

-- v_mix_issues: i.* đổi (so_banh_tay, lenh_id) + mã lệnh → DROP/CREATE
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
       ee.full_name AS out_edit_name,
       g.code AS lenh_code, g.ma_gop AS lenh_ma_gop
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
LEFT JOIN public.raw_lots rl ON rl.id = i.raw_lot_id
LEFT JOIN public.nvl_lenh_chay g ON g.id = i.lenh_id;
ALTER VIEW public.v_mix_issues SET (security_invoker = on);
GRANT SELECT ON public.v_mix_issues TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT to_regclass('public.nvl_lenh_chay') AS bang_lenh, to_regclass('public.v_nvl_lenh_chay') AS v_lenh,
       to_regprocedure('public.fn_nvl_bat_dau_lenh(uuid[],boolean,uuid,text)') AS f_bat_dau_lenh, to_regprocedure('public.fn_nvl_tong_ket_lenh(uuid)') AS f_tong_ket_lenh,
       (SELECT count(*) FROM public.nvl_lenh_chay) AS so_lenh_da_chuyen, (SELECT count(*) FROM public.raw_lot_runs WHERE lenh_id IS NULL) AS dot_chay_chua_co_lenh_phai_la_0,
       (SELECT count(*) FROM information_schema.columns WHERE table_name = 'v_mix_issues' AND column_name = 'lenh_code') AS v_mix_issues_co_lenh_code,
       (SELECT prosrc LIKE '%fn_nvl_lenh_dang_chay_1%' FROM pg_proc WHERE proname = 'fn_mix_lay' AND pronamespace = 'public'::regnamespace) AS lay_theo_lenh;
