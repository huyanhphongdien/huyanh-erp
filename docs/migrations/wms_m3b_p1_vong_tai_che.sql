-- ============================================================================
-- M3b · P1 — VÒNG TÁI CHẾ: HÀNG LỖI LÀM RA, ĐEM XỬ LÝ, VÀ CÁI BẪY HIỆU SUẤT
-- Ngày: 29/08/2026
--
-- CHỦ DOANH NGHIỆP XÁC NHẬN 29/08/2026:
--   · Bành lỗi Po thấp: xử lý bằng **CẢ HAI** đường — đem trộn vào lô tốt, VÀ chạy lò lại.
--     Không phải luật cố định, là lựa chọn theo từng lô.
--   · Hàng DKL (dính kim loại): phải **xử lý kim loại trước**, rồi mới chạy lại HOẶC trộn.
--   · **QC là người quyết** chọn đường nào, sau khi có kết quả lab.
--
-- ⇒ M3b KHÔNG PHẢI một module mới, và KHÔNG PHẢI phối trộn.
--   · QUYẾT ĐỊNH thuộc về QC ⇒ nó ghi ở cột `tinh_trang_xu_ly` của sổ QC (`qc_reject_log`),
--     cột đã có sẵn, kiểu text nullable. Không thêm bảng, không thêm vòng chữ ký.
--   · CHUYỂN ĐỘNG VẬT LÝ đã diễn đạt được bằng sổ ca: mã `LOI` và `DKL` đều có CẢ cột nhập
--     lẫn cột xuất. Làm ra hàng lỗi = nhập; đem đi xử lý = xuất. Biểu mẫu giấy đã đúng sẵn.
--   · Việc còn thiếu là NHÌN THẤY cái vòng đó — view này làm việc đó.
--
-- ⚠ CÁI BẪY HIỆU SUẤT, VÀ VÌ SAO VIEW NÀY KHÔNG GIẤU NÓ
--   Ca A làm ra 432 bành LOI. Ca B xuất 432 bành LOI đó đi xử lý, rồi nhập về 400 bành tốt.
--   Cộng cột "nhập" của hai ca: 432 + 400 = 832 bành "sản xuất ra" — từ khối cao su chỉ
--   đáng 432 bành. **Hiệu suất vượt 100% và cân bằng khối lượng không bao giờ khép.**
--
--   ⚠ Và tờ giấy KHÔNG khép được cái vòng này. Nó ghi "xuất 432 LOI" và ghi "nhập 400 STD",
--     nhưng KHÔNG ghi rằng 400 đó chính là từ 432 kia. Ca nào vừa chạy nguyên liệu mới vừa
--     chạy hàng tái chế thì không có cách nào tách. Đây là giới hạn của DỮ LIỆU, không phải
--     của phần mềm — nên view CỐ Ý không tự chia, mà bật cờ `co_tai_che_trong_ky` để người
--     đọc biết con số sản lượng kỳ đó đang gồm cả hàng chạy lại.
--     Bịa ra một tỉ lệ phân bổ ở đây là đúng loại sai mà cả module Kho sinh ra để tránh.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có lệnh BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================================

CREATE OR REPLACE VIEW public.v_vong_tai_che AS
SELECT
  v.facility_id,
  v.report_date                                                         AS ngay,

  -- Hàng KHÔNG ĐẠT làm ra trong ngày (nhập kho lỗi)
  sum(v.nhap_banh) FILTER (WHERE v.code = 'LOI')::int                   AS loi_lam_ra_banh,
  sum(v.nhap_banh) FILTER (WHERE v.code = 'DKL')::int                   AS dkl_lam_ra_banh,
  sum(v.nhap_banh) FILTER (WHERE v.code IN ('LOI','DKL'))::int          AS khong_dat_lam_ra_banh,
  round(sum(COALESCE(v.nhap_kg,0)) FILTER (WHERE v.code IN ('LOI','DKL')), 2) AS khong_dat_lam_ra_kg,

  -- Hàng KHÔNG ĐẠT đem đi xử lý (xuất kho lỗi) — đây là chỗ vòng tái chế bắt đầu
  sum(v.xuat_banh) FILTER (WHERE v.code IN ('LOI','DKL'))::int          AS khong_dat_dem_xu_ly_banh,
  round(sum(COALESCE(v.xuat_kg,0)) FILTER (WHERE v.code IN ('LOI','DKL')), 2) AS khong_dat_dem_xu_ly_kg,

  -- Hàng ĐẠT làm ra trong ngày
  sum(v.nhap_banh) FILTER (WHERE v.code NOT IN ('LOI','DKL'))::int      AS dat_lam_ra_banh,
  round(sum(COALESCE(v.nhap_kg,0)) FILTER (WHERE v.code NOT IN ('LOI','DKL')), 2) AS dat_lam_ra_kg,

  -- Tổng nhập của ngày, giữ nguyên như tờ giấy cộng (gồm CẢ hàng không đạt).
  -- ⚠ Chủ doanh nghiệp chốt 28/08/2026: phiếu khoán vẫn tính trên TỔNG này cho tới khi có
  --   thay đổi. Đừng nhúng chính sách vào phép tính — trả cả hai con số ra, ai cần gì lấy nấy.
  sum(v.nhap_banh)::int                                                 AS tong_nhap_banh,

  round(
    100.0 * sum(v.nhap_banh) FILTER (WHERE v.code IN ('LOI','DKL'))
    / nullif(sum(v.nhap_banh), 0), 1)                                   AS ty_le_khong_dat_pc,

  -- ⚠ CỜ QUAN TRỌNG NHẤT của view. Bật = ngày đó CÓ đem hàng lỗi đi xử lý, nên con số
  --   `dat_lam_ra_banh` của ngày đó GỒM CẢ hàng chạy lại, không phải toàn hàng từ nguyên
  --   liệu mới. Tờ giấy không tách được, nên view nói ra thay vì đoán.
  (sum(v.xuat_banh) FILTER (WHERE v.code IN ('LOI','DKL')) > 0)         AS co_tai_che_trong_ky

FROM public.v_shift_production_lines v
WHERE v.status <> 'cancelled'   -- phiếu huỷ không phải sản lượng. Xem wms_m4_p2.
GROUP BY v.facility_id, v.report_date;

ALTER VIEW public.v_vong_tai_che SET (security_invoker = on);
GRANT SELECT ON public.v_vong_tai_che TO authenticated;

COMMENT ON VIEW public.v_vong_tai_che IS
  'Vòng tái chế theo ngày: hàng không đạt làm ra, đem đi xử lý, và hàng đạt làm ra. '
  'Cờ co_tai_che_trong_ky = ngày đó sản lượng "đạt" có lẫn hàng chạy lại — tờ giấy không '
  'tách được nguồn, nên view KHÔNG tự chia. Đừng tính hiệu suất từ tổng nhập mà bỏ qua cờ này.';

-- ─── KIỂM CHỨNG (chạy tay sau khi apply) ───────────────────────────────────
-- a) View đọc được, có security_invoker + GRANT:
--    SELECT count(*) FROM v_vong_tai_che;                                      -- 0 (sổ ca chưa có dữ liệu)
--    SELECT reloptions::text FROM pg_class WHERE relname='v_vong_tai_che';     -- {security_invoker=on}
--    SELECT has_table_privilege('authenticated','v_vong_tai_che','SELECT');    -- true
--
-- b) Số của ca 27/8/2026 (dựng bằng dữ liệu giả tự rollback) phải ra:
--    loi_lam_ra=432 · dkl_lam_ra=10 · khong_dat_lam_ra=442 · dat_lam_ra=118
--    tong_nhap=560 · ty_le_khong_dat=78.9% · co_tai_che_trong_ky=false (ca đó không xuất lỗi)
--
-- c) Khi CÓ xuất hàng lỗi thì cờ phải bật:
--    thêm một dòng xuat_banh cho LOI ⇒ co_tai_che_trong_ky = true.
--
-- ─── CÒN NỢ ────────────────────────────────────────────────────────────────
-- 1. KHÔNG ĐO ĐƯỢC HIỆU SUẤT TÁI CHẾ. Muốn biết "432 bành lỗi ra được bao nhiêu bành tốt"
--    thì phải có thêm ĐÚNG MỘT con số trên mỗi dòng nhập: trong đó bao nhiêu bành là từ hàng
--    chạy lại. Con số đó KHÔNG có trên biểu mẫu giấy hiện nay ⇒ thêm nó là bắt nhà máy ghi
--    thêm một ô. Phải hỏi trước, đừng tự thêm.
-- 2. Tập giá trị của `qc_reject_log.tinh_trang_xu_ly` mới chỉ có ba gợi ý theo lời chủ
--    doanh nghiệp (trộn · chạy lò lại · xử lý kim loại). Cột vẫn để CHỮ TỰ DO vì mới đọc
--    được một trang sổ và trang đó trống 13/13. Xin thêm vài trang đã điền rồi mới ràng buộc.
-- 3. Chưa nối quyết định của QC (sổ QC, theo SỐ LÔ) với chuyển động vật lý (sổ ca, theo MÃ
--    HÀNG và SỐ BÀNH). Hai sổ dùng hai khoá khác nhau; nối được chỉ sau khi biết số lô thành
--    phẩm do ai cấp và theo quy tắc nào.
-- ============================================================================
