-- ============================================================================
-- M6 · P2 — DẤU NHÁY LẶP CHỈ ĐƯỢC HIỂU Ở MỘT CHỖ
-- Ngày: 29/08/2026
--
-- LỖI ĐANG SỬA
--   Trên sổ giấy, 8/13 dòng để trống cột "Mã ng.liệu" và viết dấu nháy lặp (") —
--   nghĩa là "như dòng trên". P1 để DB lưu đúng NULL (đúng), rồi cho TypeScript suy
--   ra giá trị kế thừa khi hiển thị (`ganMaKeThua`), NHƯNG view `v_qc_reject_theo_lo`
--   lại gộp theo giá trị thô và bỏ qua dòng NULL.
--
--   Kết quả: cùng một cuốn sổ, màn hình nói TMHG-26 xuất hiện 3 lần còn bảng thống kê
--   nói 2 lần. Không có gì báo lỗi. Đúng cái bẫy "hai nguồn sự thật" mà dự án cấm, và
--   lần này tôi tự dựng nó lên trong vòng một giờ sau khi viết ghi chú cảnh báo về nó.
--
-- CÁCH SỬA: suy ra Ở DƯỚI DB, một lần, rồi cả màn hình lẫn thống kê cùng đọc.
--   `v_qc_reject_log` thêm cột `ma_nguyen_lieu_hieu_luc` = mã của chính dòng đó, hoặc
--   mã gần nhất phía trên nếu dòng đó bỏ trống. TypeScript bỏ hàm suy diễn riêng.
--
-- ⚠ Cột gốc `ma_nguyen_lieu` GIỮ NGUYÊN NULL trong bảng. Trên giấy ô đó trống, và ghi
--   một suy luận đè lên chỗ người ta cố ý để trống là biến phỏng đoán thành dữ liệu —
--   sau này không ai phân biệt được đâu là số QC viết, đâu là số máy đoán.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có lệnh BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================================

-- Thứ tự "dòng trên" = thứ tự người ta ghi sổ: theo ngày, rồi theo lúc nhập.
-- PARTITION BY facility_id: sổ của nhà máy này không kế thừa từ sổ nhà máy khác.
CREATE OR REPLACE VIEW public.v_qc_reject_log AS
SELECT
  t.*,
  -- Điền xuôi (fill-forward) kinh điển: `grp` đếm số mã KHÔNG NULL tính từ đầu tới dòng
  -- hiện tại, nên mọi dòng NULL nằm sau một mã sẽ có cùng `grp` với chính mã đó; lấy
  -- first_value trong nhóm là ra mã gần nhất phía trên.
  first_value(t.ma_nguyen_lieu) OVER (
    PARTITION BY t.facility_id, t.grp ORDER BY t.ngay_sx, t.created_at
  ) AS ma_nguyen_lieu_hieu_luc
FROM (
  SELECT
    r.*,
    count(r.ma_nguyen_lieu) OVER (
      PARTITION BY r.facility_id ORDER BY r.ngay_sx, r.created_at
      ROWS UNBOUNDED PRECEDING
    ) AS grp
  FROM public.qc_reject_log r
) t;

ALTER VIEW public.v_qc_reject_log SET (security_invoker = on);
GRANT SELECT ON public.v_qc_reject_log TO authenticated;

COMMENT ON VIEW public.v_qc_reject_log IS
  'Sổ QC hàng không đạt, kèm ma_nguyen_lieu_hieu_luc = mã của dòng đó hoặc mã gần nhất '
  'phía trên (dấu nháy lặp trên giấy). Đây là nơi DUY NHẤT suy ra kế thừa — màn hình và '
  'thống kê đều đọc ở đây, đừng tính lại ở TypeScript.';

-- ─── Thống kê theo lô đọc lại từ view trên, không tự gộp nữa ────────────────
DROP VIEW IF EXISTS public.v_qc_reject_theo_lo;

CREATE VIEW public.v_qc_reject_theo_lo AS
SELECT
  v.facility_id,
  v.ma_nguyen_lieu_hieu_luc                                 AS ma_nguyen_lieu,
  count(*)::int                                             AS so_lan,
  count(*) FILTER (WHERE v.tinh_trang = 'LOAI')::int         AS so_lan_loai,
  count(*) FILTER (WHERE v.tinh_trang = 'CXL')::int          AS so_lan_cho_xu_ly,
  -- Bao nhiêu dòng là mã ghi thẳng, bao nhiêu là suy từ dấu nháy lặp. Con số suy ra
  -- không được trộn lẫn với con số ghi thẳng mà không nói.
  count(*) FILTER (WHERE v.ma_nguyen_lieu IS NULL)::int      AS so_lan_ke_thua,
  min(v.po_min)                                             AS po_thap_nhat,
  max(v.po_max)                                             AS po_cao_nhat,
  min(v.ngay_sx)                                            AS lan_dau,
  max(v.ngay_sx)                                            AS lan_gan_nhat
FROM public.v_qc_reject_log v
WHERE v.ma_nguyen_lieu_hieu_luc IS NOT NULL
GROUP BY v.facility_id, v.ma_nguyen_lieu_hieu_luc;

ALTER VIEW public.v_qc_reject_theo_lo SET (security_invoker = on);
GRANT SELECT ON public.v_qc_reject_theo_lo TO authenticated;

-- ─── KIỂM CHỨNG (chạy tay sau khi apply) ───────────────────────────────────
-- a) Hai view đọc được, có cột mới:
--    SELECT count(*) FROM v_qc_reject_log;                                     -- 0
--    SELECT count(*) FROM information_schema.columns
--     WHERE table_name='v_qc_reject_log' AND column_name='ma_nguyen_lieu_hieu_luc';  -- 1
--    SELECT count(*) FROM information_schema.columns
--     WHERE table_name='v_qc_reject_theo_lo' AND column_name='so_lan_ke_thua';       -- 1
-- b) Quyền còn nguyên (security_invoker + GRANT cho authenticated) trên CẢ HAI view.
-- c) Kế thừa đúng: ghi 3 dòng trong đó dòng giữa để NULL mã ng.liệu, view thống kê
--    phải đếm 3 lần cho cùng một mã (chứ không phải 2), và so_lan_ke_thua = 1.
-- ============================================================================
