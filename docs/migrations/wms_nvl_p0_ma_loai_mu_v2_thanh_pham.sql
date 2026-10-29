-- ============================================================
-- KHO NGUYÊN LIỆU MỦ — GĐ0 · P1 v2: MỞ RỘNG DANH MỤC SANG THÀNH PHẨM & HÀNG THƯƠNG MẠI
-- Ngày: 2026-10-29
-- Phụ thuộc: wms_nvl_p0_ma_loai_mu.sql (đã chạy)
--
-- Chủ doanh nghiệp 2026-10-29: hàng vào kho nguyên liệu không chỉ là mủ thô —
-- nhiều khi là THÀNH PHẨM từ nhà máy khác (SVR 10, SVR 3L, RSS…, chuyển từ
-- Tân Lâm / Lào hoặc mua ngoài) hoặc HÀNG THƯƠNG MẠI mua về bán lại.
--
-- Thiết kế:
--   · raw_rubber_types thêm cột `nhom`: mu_tho | thanh_pham | khac
--     và `drc_mac_dinh`: thành phẩm đã là cao su khô nên sổ kho khô dùng 100 %
--     (SVR/RSS) hoặc 60 % (mủ ly tâm) khi phiếu cân không có DRC đo.
--     Mủ thô KHÔNG có mặc định — bắt buộc đo.
--   · fn_chuan_hoa_loai_mu nhận thêm mã grade (SVR_10, svr10, "SVR 10", RSS_3,
--     mu_rss3, LATEX_60…) — khớp rubber_grade_standards và weighbridge.
--   · "Hàng thương mại" KHÔNG phải một loại mủ mà là NGUỒN / MỤC ĐÍCH của lô —
--     ghi ở lô (GĐ1: nguon_hang = nong_ho | dai_ly | nha_may_khac | thuong_mai |
--     chuyen_kho) và sổ có bút toán xuất bán riêng, không trộn với xuất sản xuất.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

-- ─── 1) Cột mới ────────────────────────────────────────────────────────────
ALTER TABLE public.raw_rubber_types
  ADD COLUMN IF NOT EXISTS nhom text NOT NULL DEFAULT 'mu_tho',
  ADD COLUMN IF NOT EXISTS drc_mac_dinh numeric(5,2);

DO $$ BEGIN
  ALTER TABLE public.raw_rubber_types
    ADD CONSTRAINT raw_rubber_types_nhom_chk CHECK (nhom IN ('mu_tho', 'thanh_pham', 'khac'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.raw_rubber_types.nhom IS
  'mu_tho = mủ thô phải đo DRC · thanh_pham = cao su đã chế biến (SVR, RSS, ly tâm) từ NM khác / mua ngoài · khac';
COMMENT ON COLUMN public.raw_rubber_types.drc_mac_dinh IS
  'DRC dùng cho sổ kho khô khi phiếu không có DRC đo. NULL = bắt buộc đo (mủ thô).';

-- ─── 2) Danh mục đầy đủ ────────────────────────────────────────────────────
UPDATE public.raw_rubber_types SET nhom = 'mu_tho' WHERE code IN ('mu_nuoc','mu_dong','mu_tap','mu_chen','mu_to');
UPDATE public.raw_rubber_types SET nhom = 'khac', sort_order = 99 WHERE code = 'khac';
UPDATE public.raw_rubber_types SET name = 'Mủ tờ (chưa phân hạng)', note = 'Tờ sấy/phơi chưa xếp hạng RSS; đã phân hạng thì ghi rss_1 / rss_3'
 WHERE code = 'mu_to';

INSERT INTO public.raw_rubber_types (code, name, sort_order, is_raw, nhom, drc_mac_dinh, note) VALUES
  ('svr_3l',   'SVR 3L',          11, true, 'thanh_pham', 100, 'Thành phẩm từ NM khác / mua ngoài'),
  ('svr_l',    'SVR L',           12, true, 'thanh_pham', 100, NULL),
  ('svr_5',    'SVR 5',           13, true, 'thanh_pham', 100, NULL),
  ('svr_10',   'SVR 10',          14, true, 'thanh_pham', 100, NULL),
  ('svr_20',   'SVR 20',          15, true, 'thanh_pham', 100, NULL),
  ('svr_cv50', 'SVR CV50',        16, true, 'thanh_pham', 100, NULL),
  ('svr_cv60', 'SVR CV60',        17, true, 'thanh_pham', 100, NULL),
  ('rss_1',    'RSS 1',           18, true, 'thanh_pham', 100, NULL),
  ('rss_3',    'RSS 3',           19, true, 'thanh_pham', 100, 'weighbridge ghi mu_rss3'),
  ('latex_60', 'Mủ ly tâm 60 %',  20, true, 'thanh_pham', 60,  'Latex cô đặc; DRC thực theo phiếu lab nếu có')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order, is_raw = EXCLUDED.is_raw,
      nhom = EXCLUDED.nhom, drc_mac_dinh = EXCLUDED.drc_mac_dinh,
      note = COALESCE(EXCLUDED.note, public.raw_rubber_types.note);

-- ─── 3) Hàm chuẩn hóa v2: thêm grade thành phẩm ───────────────────────────
CREATE OR REPLACE FUNCTION public.fn_chuan_hoa_loai_mu(p text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  WITH x AS (
    -- hạ chữ, bỏ khoảng trắng/gạch ngang → gạch dưới: "SVR 10" / "svr-10" / "svr10" đều xử lý được
    SELECT regexp_replace(lower(trim(coalesce(p, ''))), '[\s\-]+', '_', 'g') AS s
  )
  SELECT CASE
    -- mủ thô
    WHEN s IN ('mu_nuoc', 'nuoc', 'latex', 'mủ_nước')                  THEN 'mu_nuoc'
    WHEN s IN ('mu_dong', 'dong', 'mủ_đông')                           THEN 'mu_dong'
    WHEN s IN ('mu_tap',  'tap',  'mủ_tạp')                            THEN 'mu_tap'
    WHEN s IN ('mu_chen', 'chen', 'cup_lump', 'mủ_chén')               THEN 'mu_chen'
    WHEN s IN ('mu_to',   'to',   'sheet', 'mủ_tờ')                    THEN 'mu_to'
    -- thành phẩm (khớp rubber_grade_standards: SVR_L, SVR_3L, SVR_5, SVR_10, SVR_20, SVR_CV50, SVR_CV60, RSS_1, RSS_3, LATEX_60)
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
    ELSE 'khac'
  END
  FROM x
$$;

COMMENT ON FUNCTION public.fn_chuan_hoa_loai_mu(text) IS
  'Giá trị loại mủ / grade bất kỳ → mã chuẩn raw_rubber_types.code (mủ thô mu_* hoặc thành phẩm svr_*/rss_*/latex_60). Không khớp → khac.';

-- View kiểm toán dựng ở file 1 gọi hàm này theo tên nên tự dùng bản v2, không cần tạo lại.

-- ─── KIỂM CHỨNG (gửi lại kết quả) ──────────────────────────────────────────
-- (a) Danh mục 16 mã, 2 nhóm:
SELECT nhom, code, name, drc_mac_dinh FROM public.raw_rubber_types ORDER BY sort_order;

-- (b) Giá trị thật trong DB ánh xạ về đâu — xem các dòng ma_chuan = 'khac':
SELECT bang, gia_tri_goc, ma_chuan, so_dong
FROM public.v_raw_rubber_type_audit
ORDER BY (ma_chuan = 'khac') DESC, bang, so_dong DESC;

-- (c) Grade:
SELECT public.fn_chuan_hoa_loai_mu('SVR_10')   AS g1,   -- svr_10
       public.fn_chuan_hoa_loai_mu('SVR 3L')   AS g2,   -- svr_3l
       public.fn_chuan_hoa_loai_mu('svr-cv60') AS g3,   -- svr_cv60
       public.fn_chuan_hoa_loai_mu('mu_rss3')  AS g4,   -- rss_3
       public.fn_chuan_hoa_loai_mu('LATEX_60') AS g5,   -- latex_60
       public.fn_chuan_hoa_loai_mu('tap')      AS g6;   -- mu_tap
