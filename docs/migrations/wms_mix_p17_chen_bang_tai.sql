-- ============================================================
-- HÀNG CHÈN — p17: VỊ TRÍ CHÈN THỨ BA "BĂNG TẢI" (30/10/2026 tối, chủ DN: "có thêm 1 loại chèn nữa … chèn Băng Tải,
--   loại chèn này tính theo bành 35 kg không cần trừ khối lượng pallet, nhập vào khối lượng hoặc số bành ra khối lượng")
--   · vi_tri: be_slap | may_mix | bang_tai. Băng tải: lúc lấy gõ số bành (× kg/bành của lô) hoặc kg, KHÔNG cân cả pallet, không bì;
--     lúc trả gõ số bành còn hoặc kg — fn_mix_lay / fn_mix_tra không cần đổi (đường "gõ thẳng kg" đã có)
--   · v_raw_lot_chen + chen_bt_kg; tổng kết mã / lệnh tách 'bang_tai' / 'bt_kg'
-- Ngày: 2026-10-30 · Phụ thuộc: wms_mix_p16_sua_rang_buoc_kg.sql (CHẠY SAU p16)
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── CHECK vi_tri: thêm bang_tai (tìm ràng buộc theo nội dung, tên có thể khác) ──
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.mix_issues'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%vi_tri%' LOOP
    EXECUTE 'ALTER TABLE public.mix_issues DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;
ALTER TABLE public.mix_issues ADD CONSTRAINT mix_issues_vi_tri_check CHECK (vi_tri IN ('be_slap', 'may_mix', 'bang_tai'));

-- ─── v_raw_lot_chen + chen_bt_kg (DROP/CREATE vì thêm cột giữa) ─────────────
DROP VIEW IF EXISTS public.v_raw_lot_chen;
CREATE VIEW public.v_raw_lot_chen AS
WITH ct AS (
  SELECT x.raw_lot_id, l.id AS mix_lot_id, l.code AS lot_code, l.so_lo, l.source_type, l.grade, l.source_desc, i.vi_tri,
         round(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)), 2) AS kg,
         sum(i.so_banh)::int AS so_banh, count(*)::int AS so_phieu,
         bool_or(cardinality(i.raw_lot_ids) > 1) AS co_chung
    FROM public.mix_issues i
    JOIN LATERAL (SELECT unnest(COALESCE(i.raw_lot_ids, CASE WHEN i.raw_lot_id IS NULL THEN NULL ELSE ARRAY[i.raw_lot_id] END)) AS raw_lot_id) x ON true
    JOIN public.mix_lots l ON l.id = i.mix_lot_id
   WHERE i.status = 'received'
   GROUP BY x.raw_lot_id, l.id, l.code, l.so_lo, l.source_type, l.grade, l.source_desc, i.vi_tri
)
SELECT b.raw_lot_id, b.facility_id, b.ma, b.rubber_type_name, b.trang_thai, b.xuat_sx_kho_kg,
       round(COALESCE(sum(ct.kg), 0), 2) AS chen_kg,
       COALESCE(sum(ct.so_phieu), 0)::int AS so_phieu_chen,
       COALESCE(sum(ct.so_banh), 0)::int AS so_banh_chen,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.vi_tri = 'be_slap'), 0), 2) AS chen_be_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.vi_tri = 'may_mix'), 0), 2) AS chen_mix_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.vi_tri = 'bang_tai'), 0), 2) AS chen_bt_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.source_type = 'loi'), 0), 2) AS chen_loi_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.source_type = 'dkl'), 0), 2) AS chen_dkl_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.source_type = 'std'), 0), 2) AS chen_chuan_kg,
       round(COALESCE(sum(ct.kg) FILTER (WHERE ct.source_type IN ('mua_ngoai', 'khac')), 0), 2) AS chen_khac_kg,
       CASE WHEN COALESCE(b.xuat_sx_kho_kg, 0) > 0   -- chưa xuất NVL của mã thì không tính %, tránh hiện 100 %
            THEN round(100 * COALESCE(sum(ct.kg), 0) / (COALESCE(b.xuat_sx_kho_kg, 0) + COALESCE(sum(ct.kg), 0)), 1) END AS ty_le_chen_pct,
       COALESCE(jsonb_agg(jsonb_build_object('lot_code', ct.lot_code, 'so_lo', ct.so_lo, 'vi_tri', ct.vi_tri, 'source_type', ct.source_type, 'grade', ct.grade, 'desc', ct.source_desc, 'kg', ct.kg, 'so_banh', ct.so_banh, 'so_phieu', ct.so_phieu, 'co_chung', ct.co_chung) ORDER BY ct.kg DESC) FILTER (WHERE ct.mix_lot_id IS NOT NULL), '[]'::jsonb) AS chi_tiet
FROM public.v_raw_lot_balance b
LEFT JOIN ct ON ct.raw_lot_id = b.raw_lot_id
GROUP BY b.raw_lot_id, b.facility_id, b.ma, b.rubber_type_name, b.trang_thai, b.xuat_sx_kho_kg;
ALTER VIEW public.v_raw_lot_chen SET (security_invoker = on);
GRANT SELECT ON public.v_raw_lot_chen TO authenticated;

-- ─── Tổng kết mã / lệnh: tách băng tải ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_nvl_tong_ket_ma(p_raw_lot_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; y record; c record; v_runs jsonb; v_ca jsonb; v_phieu jsonb; v_bgd jsonb; v_nguoi jsonb;
BEGIN
  SELECT * INTO b FROM public.v_raw_lot_balance WHERE raw_lot_id = p_raw_lot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'KHONG_TIM_THAY_LO'; END IF;
  SELECT * INTO y FROM public.v_raw_lot_yield WHERE raw_lot_id = p_raw_lot_id;
  SELECT * INTO c FROM public.v_raw_lot_chen WHERE raw_lot_id = p_raw_lot_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('started_at', r.started_at, 'ended_at', r.ended_at, 'started_name', es.full_name, 'ended_name', ee.full_name, 'note', r.note) ORDER BY r.started_at), '[]'::jsonb)
    INTO v_runs
    FROM public.raw_lot_runs r LEFT JOIN public.employees es ON es.id = r.started_by LEFT JOIN public.employees ee ON ee.id = r.ended_by
   WHERE r.raw_lot_id = p_raw_lot_id;

  -- phiếu chèn gắn mã này (chèn chung nhiều mã → chia đều như v_raw_lot_chen)
  SELECT jsonb_build_object(
           'tong', count(*), 'chua_tra', count(*) FILTER (WHERE i.status = 'issued'),
           'cho_ky', count(*) FILTER (WHERE i.status IN ('returned', 'submitted', 'qc_confirmed')), 'da_nhan', count(*) FILTER (WHERE i.status = 'received'),
           'so_ca', count(DISTINCT (i.shift_date, i.shift_id)),
           'kg_lay', round(COALESCE(sum(i.kg_out / GREATEST(cardinality(i.raw_lot_ids), 1)), 0), 1),
           'kg_tra', round(COALESCE(sum(i.kg_return / GREATEST(cardinality(i.raw_lot_ids), 1)), 0), 1),
           'tieu_hao', round(COALESCE(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)), 0), 1),
           'tieu_hao_da_nhan', round(COALESCE(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)) FILTER (WHERE i.status = 'received'), 0), 1),
           'so_banh', COALESCE(sum(i.so_banh), 0),
           'be_slap', round(COALESCE(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)) FILTER (WHERE i.vi_tri = 'be_slap'), 0), 1),
           'may_mix', round(COALESCE(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)) FILTER (WHERE i.vi_tri = 'may_mix'), 0), 1),
           'bang_tai', round(COALESCE(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)) FILTER (WHERE i.vi_tri = 'bang_tai'), 0), 1),
           'lan_dau', min(i.out_at), 'lan_cuoi', max(COALESCE(i.return_at, i.out_at)))
    INTO v_phieu
    FROM public.mix_issues i
   WHERE i.status <> 'cancelled' AND p_raw_lot_id = ANY(COALESCE(i.raw_lot_ids, ARRAY[i.raw_lot_id]));

  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'shift_date'), (x->>'shift_name'), (x->>'team')), '[]'::jsonb) INTO v_ca FROM (
    SELECT jsonb_build_object('shift_date', i.shift_date, 'shift_name', COALESCE(sh.name, sh.code, ''), 'team', i.team,
             'so_lan', count(*),
             'kg_lay', round(COALESCE(sum(i.kg_out / GREATEST(cardinality(i.raw_lot_ids), 1)), 0), 1),
             'kg_tra', round(COALESCE(sum(i.kg_return / GREATEST(cardinality(i.raw_lot_ids), 1)), 0), 1),
             'tieu_hao', round(COALESCE(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)), 0), 1),
             'da_nhan', round(COALESCE(sum(i.kg_used / GREATEST(cardinality(i.raw_lot_ids), 1)) FILTER (WHERE i.status = 'received'), 0), 1),
             'chua_tra', count(*) FILTER (WHERE i.status = 'issued'),
             'cho_ky', count(*) FILTER (WHERE i.status IN ('returned', 'submitted', 'qc_confirmed'))) AS x
      FROM public.mix_issues i LEFT JOIN public.shifts sh ON sh.id = i.shift_id
     WHERE i.status <> 'cancelled' AND p_raw_lot_id = ANY(COALESCE(i.raw_lot_ids, ARRAY[i.raw_lot_id]))
     GROUP BY i.shift_date, sh.name, sh.code, i.team) q;

  -- Ban Giám đốc = chức vụ level ≤ 3 (như is_admin_or_bgd), đang làm việc, có email
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', e.full_name, 'email', e.email, 'chuc_vu', p.name) ORDER BY p.level, e.full_name), '[]'::jsonb) INTO v_bgd
    FROM public.employees e JOIN public.positions p ON p.id = e.position_id
   WHERE COALESCE(p.level, 99) <= 3 AND e.status = 'active' AND COALESCE(btrim(e.email), '') <> '';
  SELECT jsonb_build_object('name', e.full_name, 'email', e.email) INTO v_nguoi FROM public.employees e WHERE e.id = public.fn_nvl_emp_hien_tai();

  RETURN jsonb_build_object(
    'raw_lot_id', b.raw_lot_id, 'ma', b.ma, 'nguon', b.nguon, 'facility_code', b.facility_code, 'rubber_type_name', b.rubber_type_name, 'trang_thai', b.trang_thai, 'dang_chay', b.dang_chay_tu IS NOT NULL,
    'so_xe', b.so_xe, 'wet_kg', b.wet_kg, 'dry_kg', b.dry_kg, 'drc_pct', b.drc_pct, 'nhap_kho_kg', b.nhap_kho_kg, 'xuat_sx_kho_kg', b.xuat_sx_kho_kg, 'ngay_dau', b.ngay_dau, 'ngay_cuoi', b.ngay_cuoi,
    'so_ca_ep', y.so_ca, 'tp_dat_kg', y.tp_dat_kg, 'loi_dkl_kg', y.loi_dkl_kg, 'hieu_suat_pct', y.hieu_suat_pct, 'ty_le_loi_pct', y.ty_le_loi_pct,
    'chen', CASE WHEN c.raw_lot_id IS NULL THEN NULL ELSE jsonb_build_object('chen_kg', c.chen_kg, 'so_phieu', c.so_phieu_chen, 'so_banh', c.so_banh_chen, 'be_kg', c.chen_be_kg, 'mix_kg', c.chen_mix_kg, 'bt_kg', c.chen_bt_kg,
             'loi_kg', c.chen_loi_kg, 'dkl_kg', c.chen_dkl_kg, 'chuan_kg', c.chen_chuan_kg, 'khac_kg', c.chen_khac_kg, 'ty_le_pct', c.ty_le_chen_pct, 'chi_tiet', c.chi_tiet) END,
    'phieu', v_phieu, 'theo_ca', v_ca, 'dot_chay', v_runs, 'bgd', v_bgd, 'nguoi_lap', v_nguoi, 'luc', now());
END $$;

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
           'bang_tai', round(COALESCE(sum(i.kg_used) FILTER (WHERE i.vi_tri = 'bang_tai'), 0), 1),
           'lan_dau', min(i.out_at), 'lan_cuoi', max(COALESCE(i.return_at, i.out_at)))
    INTO v_phieu FROM public.fn_nvl_lenh_phieu_chen(p_lenh_id) i;
  SELECT round(COALESCE(sum(i.kg_used), 0), 2) AS chen_kg, count(*)::int AS so_phieu, COALESCE(sum(i.so_banh), 0)::int AS so_banh,
         round(COALESCE(sum(i.kg_used) FILTER (WHERE i.vi_tri = 'be_slap'), 0), 2) AS be_kg,
         round(COALESCE(sum(i.kg_used) FILTER (WHERE i.vi_tri = 'may_mix'), 0), 2) AS mix_kg,
         round(COALESCE(sum(i.kg_used) FILTER (WHERE i.vi_tri = 'bang_tai'), 0), 2) AS bt_kg,
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
    'chen', jsonb_build_object('chen_kg', v_chen.chen_kg, 'so_phieu', v_chen.so_phieu, 'so_banh', v_chen.so_banh, 'be_kg', v_chen.be_kg, 'mix_kg', v_chen.mix_kg, 'bt_kg', v_chen.bt_kg,
             'loi_kg', v_chen.loi_kg, 'dkl_kg', v_chen.dkl_kg, 'chuan_kg', v_chen.chuan_kg, 'khac_kg', v_chen.khac_kg,
             'ty_le_pct', CASE WHEN v_xuat > 0 THEN round(100 * COALESCE(v_chen.chen_kg, 0) / (v_xuat + COALESCE(v_chen.chen_kg, 0)), 1) END, 'chi_tiet', v_lo),
    'phieu', v_phieu, 'theo_ca', v_ca, 'dot_chay', v_dot, 'bgd', v_bgd, 'nguoi_lap', v_nguoi, 'luc', now());
END $$;

NOTIFY pgrst, 'reload schema';

-- ─── KIỂM CHỨNG ────────────────────────────────────────────────────────────
SELECT (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'mix_issues_vi_tri_check') AS rang_buoc_vi_tri,
       (SELECT count(*) FROM information_schema.columns WHERE table_name = 'v_raw_lot_chen' AND column_name = 'chen_bt_kg') AS cot_chen_bt_kg,
       (SELECT prosrc LIKE '%bt_kg%' FROM pg_proc WHERE proname = 'fn_nvl_tong_ket_lenh' AND pronamespace = 'public'::regnamespace) AS tong_ket_lenh_bt;
