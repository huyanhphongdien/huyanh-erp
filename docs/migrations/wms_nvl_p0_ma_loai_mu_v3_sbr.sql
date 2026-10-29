-- ============================================================
-- KHO NGUYÊN LIỆU MỦ — GĐ0 · P1 v3: THÊM CAO SU TỔNG HỢP SBR 1502
-- Ngày: 2026-10-29
-- Phụ thuộc: wms_nvl_p0_ma_loai_mu.sql + _v2_thanh_pham.sql (đã chạy)
--
-- Chủ doanh nghiệp 2026-10-29: có thêm loại SBR 1502 (styrene-butadiene,
-- cao su tổng hợp, mua ngoài để phối trộn / thương mại).
-- Cao su tổng hợp không có khái niệm DRC → nhóm riêng `tong_hop`, sổ kho khô
-- tính 100 % (kg khô = kg cân). Thêm nhóm là phải nới CHECK của cột nhom.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── 1) Nới nhóm: mu_tho | thanh_pham | tong_hop | khac ────────────────────
ALTER TABLE public.raw_rubber_types DROP CONSTRAINT IF EXISTS raw_rubber_types_nhom_chk;
ALTER TABLE public.raw_rubber_types
  ADD CONSTRAINT raw_rubber_types_nhom_chk CHECK (nhom IN ('mu_tho', 'thanh_pham', 'tong_hop', 'khac'));

COMMENT ON COLUMN public.raw_rubber_types.nhom IS
  'mu_tho = mủ thô phải đo DRC · thanh_pham = cao su thiên nhiên đã chế biến (SVR, RSS, ly tâm) · tong_hop = cao su tổng hợp (SBR…) · khac';

-- ─── 2) Mã mới ─────────────────────────────────────────────────────────────
INSERT INTO public.raw_rubber_types (code, name, sort_order, is_raw, nhom, drc_mac_dinh, note) VALUES
  ('sbr_1502', 'SBR 1502 (cao su tổng hợp)', 31, true, 'tong_hop', 100, 'Styrene-butadiene; mua ngoài để phối trộn / thương mại; không đo DRC')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, is_raw = EXCLUDED.is_raw,
      nhom = EXCLUDED.nhom, drc_mac_dinh = EXCLUDED.drc_mac_dinh, note = EXCLUDED.note;

-- ─── 3) Hàm chuẩn hóa v3 ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chuan_hoa_loai_mu(p text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  WITH x AS (
    SELECT regexp_replace(lower(trim(coalesce(p, ''))), '[\s\-]+', '_', 'g') AS s
  )
  SELECT CASE
    -- mủ thô
    WHEN s IN ('mu_nuoc', 'nuoc', 'latex', 'mủ_nước')                  THEN 'mu_nuoc'
    WHEN s IN ('mu_dong', 'dong', 'mủ_đông')                           THEN 'mu_dong'
    WHEN s IN ('mu_tap',  'tap',  'mủ_tạp')                            THEN 'mu_tap'
    WHEN s IN ('mu_chen', 'chen', 'cup_lump', 'mủ_chén')               THEN 'mu_chen'
    WHEN s IN ('mu_to',   'to',   'sheet', 'mủ_tờ')                    THEN 'mu_to'
    -- thành phẩm cao su thiên nhiên
    WHEN s ~ '^svr_?3l$'                                               THEN 'svr_3l'
    WHEN s ~ '^svr_?l$'                                                THEN 'svr_l'
    WHEN s ~ '^svr_?5$'                                                THEN 'svr_5'
    WHEN s ~ '^svr_?10$'                                               THEN 'svr_10'
    WHEN s ~ '^svr_?20$'                                               THEN 'svr_20'
    WHEN s ~ '^svr_?cv_?50$'                                           THEN 'svr_cv50'
    WHEN s ~ '^svr_?cv_?60$'                                           THEN 'svr_cv60'
    WHEN s ~ '^(mu_)?rss_?1$'                                          THEN 'rss_1'
    WHEN s ~ '^(mu_)?rss_?3$' OR s = 'rss'                             THEN 'rss_3'
    WHEN s ~ '^latex_?60$' OR s IN ('mu_ly_tam', 'mủ_ly_tâm')          THEN 'latex_60'
    -- cao su tổng hợp
    WHEN s ~ '^sbr_?1502$' OR s = 'sbr'                                THEN 'sbr_1502'
    ELSE 'khac'
  END
  FROM x
$$;

-- ─── KIỂM CHỨNG (gửi lại kết quả) ──────────────────────────────────────────
-- (a) 17 mã, 4 nhóm:
SELECT nhom, count(*) AS so_ma, string_agg(code, ', ' ORDER BY sort_order) AS ma
  FROM public.raw_rubber_types GROUP BY nhom ORDER BY min(sort_order);

-- (b) SBR:
SELECT public.fn_chuan_hoa_loai_mu('SBR 1502') AS s1,   -- sbr_1502
       public.fn_chuan_hoa_loai_mu('sbr1502')  AS s2,   -- sbr_1502
       public.fn_chuan_hoa_loai_mu('SVR_10')   AS s3;   -- svr_10 (vẫn đúng)
