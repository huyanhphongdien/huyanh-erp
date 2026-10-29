-- ============================================================
-- KHO NGUYÊN LIỆU MỦ — GĐ0 · P4: BẢNG TẠM NHẬP TỒN ĐẦU (KIỂM KÊ MỞ SỔ)
-- Ngày: 2026-10-29
-- Phụ thuộc: wms_nvl_p0_ma_loai_mu.sql (fn_chuan_hoa_loai_mu), facilities
--
-- Kiểm kê mở sổ: nhà máy cân lại từng lô đang tồn, lấy mẫu DRC, ghi vào file
-- CSV theo mẫu docs/templates/kiem_ke_mo_so_nvl_mau.csv, rồi nhập vào bảng này
-- (Supabase → Table Editor → raw_opening_stock_staging → Import CSV).
-- GĐ1 sẽ đọc bảng này để tạo stock_batches + bút toán mở sổ. Ở GĐ0 chỉ có
-- bảng tạm và view kiểm tra lỗi, để nhà máy có thể bắt đầu kiểm kê ngay.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.raw_opening_stock_staging (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_code  text NOT NULL,                 -- PD | TL | LAO
  batch_code     text NOT NULL,                 -- mã lô đang dùng trên tem / sổ giấy (nếu chưa có: ghi NCC-ngày-số)
  rubber_type    text NOT NULL,                 -- mu_nuoc | mu_dong | mu_tap | mu_chen | mu_to (hoặc chữ Việt, sẽ chuẩn hóa)
  wet_kg         numeric(14,2) NOT NULL,        -- kg ướt cân lại lúc kiểm kê
  drc_pct        numeric(5,2),                  -- DRC mẫu lúc kiểm kê; để trống nếu không lấy được mẫu
  drc_estimated  boolean NOT NULL DEFAULT false,-- true = DRC ước (không có mẫu) → lô gắn cờ "tồn đầu ước"
  intake_date    date,                          -- ngày nhập gốc (để tính tuổi lô); trống = ngày kiểm kê
  supplier_name  text,
  ticket_code    text,                          -- số phiếu cân gốc nếu còn tra được
  note           text,
  imported_at    timestamptz NOT NULL DEFAULT now(),
  processed_at   timestamptz,                   -- GĐ1 điền khi đã tạo lô + bút toán
  batch_id       uuid,                          -- GĐ1 điền: stock_batches.id đã tạo
  CONSTRAINT ross_wet_chk CHECK (wet_kg > 0),
  CONSTRAINT ross_drc_chk CHECK (drc_pct IS NULL OR (drc_pct > 0 AND drc_pct <= 100))
);

COMMENT ON TABLE public.raw_opening_stock_staging IS
  'Bảng tạm tồn đầu kho NVL từ kiểm kê mở sổ (CSV). GĐ1 chuyển thành lô + bút toán opening rồi điền processed_at.';

CREATE INDEX IF NOT EXISTS ross_facility_idx ON public.raw_opening_stock_staging (facility_code, batch_code);

ALTER TABLE public.raw_opening_stock_staging ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY ross_select ON public.raw_opening_stock_staging FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- BGĐ hoặc thủ kho NVL được ghi (nhập CSV, sửa dòng lỗi)
DO $$ BEGIN
  CREATE POLICY ross_write ON public.raw_opening_stock_staging FOR ALL TO authenticated
    USING (public.fn_nvl_duoc_ky('receive', NULL))
    WITH CHECK (public.fn_nvl_duoc_ky('receive', NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── View kiểm tra lỗi trước khi mở sổ ─────────────────────────────────────
CREATE OR REPLACE VIEW public.v_raw_opening_stock_check AS
SELECT
  s.id, s.facility_code, s.batch_code, s.rubber_type,
  public.fn_chuan_hoa_loai_mu(s.rubber_type)                      AS ma_chuan,
  s.wet_kg, s.drc_pct, s.drc_estimated, s.intake_date,
  round(s.wet_kg * COALESCE(s.drc_pct, 0) / 100, 2)               AS dry_kg,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN f.id IS NULL THEN 'nhà máy không tồn tại: ' || s.facility_code END,
    CASE WHEN public.fn_chuan_hoa_loai_mu(s.rubber_type) = 'khac' THEN 'loại mủ lạ: ' || s.rubber_type END,
    CASE WHEN s.drc_pct IS NULL AND NOT s.drc_estimated THEN 'thiếu DRC (hoặc đánh dấu drc_estimated)' END,
    CASE WHEN s.drc_pct IS NOT NULL AND (s.drc_pct < 15 OR s.drc_pct > 95) THEN 'DRC ngoài khoảng 15–95' END,
    CASE WHEN d.n > 1 THEN 'trùng mã lô trong cùng nhà máy (' || d.n || ' dòng)' END,
    CASE WHEN s.processed_at IS NOT NULL THEN 'đã xử lý ở GĐ1' END
  ]::text[], NULL)                                                 AS loi,
  s.processed_at
FROM public.raw_opening_stock_staging s
LEFT JOIN public.facilities f ON upper(f.code) = upper(s.facility_code)
LEFT JOIN (
  SELECT facility_code, batch_code, count(*) AS n
    FROM public.raw_opening_stock_staging GROUP BY 1, 2
) d ON d.facility_code = s.facility_code AND d.batch_code = s.batch_code;

ALTER VIEW public.v_raw_opening_stock_check SET (security_invoker = on);
GRANT SELECT ON public.v_raw_opening_stock_check TO authenticated;

-- ─── KIỂM CHỨNG (gửi lại kết quả) ──────────────────────────────────────────
-- (a) Bảng + view đọc được (0 dòng lúc này là đúng):
SELECT count(*) AS so_dong_staging FROM public.raw_opening_stock_staging;
SELECT count(*) AS so_dong_loi FROM public.v_raw_opening_stock_check WHERE cardinality(loi) > 0;

-- (b) Sau khi nhập CSV: dòng nào có lỗi
-- SELECT facility_code, batch_code, rubber_type, wet_kg, drc_pct, loi
--   FROM public.v_raw_opening_stock_check WHERE cardinality(loi) > 0 ORDER BY facility_code, batch_code;
-- (c) Tổng tồn đầu theo nhà máy × loại (ướt / khô):
-- SELECT facility_code, ma_chuan, count(*) AS so_lo, sum(wet_kg) AS uot_kg, sum(dry_kg) AS kho_kg
--   FROM public.v_raw_opening_stock_check WHERE cardinality(loi) = 0 GROUP BY 1, 2 ORDER BY 1, 2;
