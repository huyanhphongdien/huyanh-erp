-- ============================================================
-- DỌN DỮ LIỆU THỬ HÀNG CHÈN (10/11/2026, chủ DN: "xoá hết các dữ liệu cũ trên module hàng chèn đi")
--   Xoá: MỌI phiếu chèn + ảnh lấy / trả, kiểm kê kho chèn, lô chèn (kho chèn) + ảnh lô. Trả bành cho lô TP bị chèn thử,
--        gỡ dấu "Đã chuyển kho chèn" ở sổ QC, tính lại dòng CHÈN của sổ ca.
--   GIỮ: lệnh chạy + mã nguyên liệu (thuộc Kho NVL, tab Nhập đang nhận phiếu cân THẬT), phân công ký, cấu hình, hàm / view.
--   Ảnh trong Storage (bucket raw-photos): lấy danh sách storage_path TRƯỚC khi xoá dòng, rồi xoá bằng Storage API.
--   Trước khi chạy (10/11): 10 phiếu (3 đang ở dây chuyền, 0 đã nhận), 10 lô chèn, 38 ảnh, 0 kiểm kê, 0 lô TP bị chèn, 0 dấu QC.
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================

CREATE TEMP TABLE _ca_chen AS SELECT DISTINCT facility_id, shift_date, shift_id FROM public.mix_issues WHERE shift_id IS NOT NULL;

DELETE FROM public.raw_photos WHERE ref_type IN ('mix_issue_out', 'mix_issue_return', 'mix_lot');
DELETE FROM public.mix_issues WHERE true;   -- agent_sql bắt buộc có WHERE
DELETE FROM public.mix_adjustments WHERE true;

-- trả lại bành cho lô TP đã bị chèn thử (hàng chuẩn / lỗi / DKL lấy từ kho TP)
UPDATE public.fg_lots f
   SET so_banh_chen = GREATEST(f.so_banh_chen - m.banh, 0),
       co_chen = (GREATEST(f.so_banh_chen - m.banh, 0) > 0),
       status = CASE WHEN f.status = 'het' AND f.so_banh - f.so_banh_da_xuat - GREATEST(f.so_banh_chen - m.banh, 0) > 0 THEN 'ton' ELSE f.status END,
       updated_at = now()
  FROM (SELECT source_ref_id, sum(COALESCE(so_banh_in, round(kg_in / COALESCE(NULLIF(kg_per_banh, 0), 35))))::int AS banh
          FROM public.mix_lots WHERE source_ref_type = 'fg_lot' GROUP BY source_ref_id) m
 WHERE f.id = m.source_ref_id;
UPDATE public.qc_reject_log SET tinh_trang_xu_ly = NULL, updated_at = now()
 WHERE tinh_trang_xu_ly = 'Đã chuyển kho chèn' AND id IN (SELECT source_ref_id FROM public.mix_lots WHERE source_ref_type = 'qc_reject_log');
DELETE FROM public.mix_lots WHERE true;

-- dòng CHÈN trên sổ ca của các ca từng có phiếu chèn → về 0
SELECT c.shift_date, c.shift_id, public.fn_mix_cap_nhat_dong_chen(c.facility_id, c.shift_date, c.shift_id) AS da_tinh_lai FROM _ca_chen c;

-- kiểm chứng: 4 số đầu = 0; lệnh và mã NVL giữ nguyên
SELECT (SELECT count(*) FROM public.mix_issues) AS phieu, (SELECT count(*) FROM public.mix_lots) AS lo_chen,
       (SELECT count(*) FROM public.raw_photos WHERE ref_type LIKE 'mix_%') AS anh_chen, (SELECT count(*) FROM public.mix_adjustments) AS kiem_ke,
       (SELECT count(*) FROM public.nvl_lenh_chay) AS lenh_giu, (SELECT count(*) FROM public.raw_lots) AS ma_nvl_giu, (SELECT count(*) FROM public.mix_signers) AS phan_cong_giu;
