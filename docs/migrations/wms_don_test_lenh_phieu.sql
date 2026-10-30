-- ============================================================
-- DỌN LỆNH + PHIẾU CHÈN + KHO CHÈN TEST, GIỮ MÃ NVL (31/10/2026, chủ DN: "xoá hết lệnh cũ này để tôi nhập lại")
--   Xoá: MỌI phiếu chèn (+ ảnh, kiểm kê), MỌI lô chèn (kho chèn), MỌI lệnh + đợt chạy. GIỮ mã nguyên liệu (TMHG-15/17/39…), lô xe, sổ kho, phân công.
--   Trả lại bành cho lô TP bị chèn thử; gỡ dấu sổ QC; gỡ lệnh / mã khỏi phiếu ca; tính lại dòng CHÈN sổ ca.
--   Muốn xoá luôn cả mã NVL: dùng wms_don_test_hang_chen_toan_bo.sql thay vì file này.
-- ⚠ Không có BEGIN/COMMIT để chạy được qua RPC agent_sql.
-- ============================================================

-- ─── A. XEM TRƯỚC ───────────────────────────────────────────────────────────
SELECT 'phieu_chen' AS loai, count(*) AS so_dong, string_agg(code, ', ' ORDER BY code) AS ma FROM public.mix_issues
UNION ALL SELECT 'lo_chen (kho chèn)', count(*), string_agg(code || COALESCE(' ' || so_lo, ''), ', ' ORDER BY code) FROM public.mix_lots
UNION ALL SELECT 'lenh', count(*), string_agg(code || ' ' || ma_gop || CASE WHEN ended_at IS NULL THEN ' (đang chạy)' ELSE '' END, ', ') FROM public.nvl_lenh_chay
UNION ALL SELECT 'dot_chay', count(*), NULL FROM public.raw_lot_runs
UNION ALL SELECT 'ma_nvl (GIỮ)', count(*), string_agg(ma, ', ' ORDER BY ma) FROM public.raw_lots;

-- ─── B. XOÁ (chạy nguyên khối) ──────────────────────────────────────────────
CREATE TEMP TABLE _ca_test AS SELECT DISTINCT facility_id, shift_date, shift_id FROM public.mix_issues WHERE shift_id IS NOT NULL;

DELETE FROM public.raw_photos WHERE ref_type IN ('mix_issue_out', 'mix_issue_return');
DELETE FROM public.mix_issues;
DELETE FROM public.mix_adjustments;

UPDATE public.fg_lots f
   SET so_banh_chen = GREATEST(f.so_banh_chen - m.banh, 0),
       status = CASE WHEN f.status = 'het' AND f.so_banh - f.so_banh_da_xuat - GREATEST(f.so_banh_chen - m.banh, 0) > 0 THEN 'ton' ELSE f.status END,
       updated_at = now()
  FROM (SELECT source_ref_id, sum(COALESCE(so_banh_in, round(kg_in / COALESCE(NULLIF(kg_per_banh, 0), 35))))::int AS banh
          FROM public.mix_lots WHERE source_ref_type = 'fg_lot' GROUP BY source_ref_id) m
 WHERE f.id = m.source_ref_id;
UPDATE public.qc_reject_log SET tinh_trang_xu_ly = NULL, updated_at = now()
 WHERE tinh_trang_xu_ly = 'Đã chuyển kho chèn' AND id IN (SELECT source_ref_id FROM public.mix_lots WHERE source_ref_type = 'qc_reject_log');
DELETE FROM public.mix_lots;

UPDATE public.shift_production_reports SET lenh_id = NULL WHERE lenh_id IS NOT NULL;
DELETE FROM public.raw_lot_runs;
DELETE FROM public.nvl_lenh_chay;

SELECT c.shift_date, c.shift_id, public.fn_mix_cap_nhat_dong_chen(c.facility_id, c.shift_date, c.shift_id) AS da_tinh_lai FROM _ca_test c;

-- kiểm chứng: 4 cột đầu = 0, mã NVL còn nguyên
SELECT (SELECT count(*) FROM public.mix_issues) AS phieu, (SELECT count(*) FROM public.mix_lots) AS lo_chen,
       (SELECT count(*) FROM public.nvl_lenh_chay) AS lenh, (SELECT count(*) FROM public.raw_lot_runs) AS dot_chay, (SELECT count(*) FROM public.raw_lots) AS ma_nvl_giu;
