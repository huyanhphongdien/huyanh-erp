-- ============================================================
-- DỌN TOÀN BỘ DỮ LIỆU TEST HÀNG CHÈN + MÃ NVL (31/10/2026, chủ DN: "xoá hết các mã hàng, lệnh chèn, và trong kho hàng chèn nữa")
--   Xoá: MỌI phiếu chèn, ảnh phiếu, kiểm kê kho chèn, lô chèn (kho chèn), lệnh chạy + đợt chạy, MỌI mã nguyên liệu (raw_lots).
--   Lô xe thật (nếu có) chỉ bị gỡ mã, không xoá; sổ kho NVL, phân công, hàm / view giữ nguyên. Trả lại bành cho lô TP bị chèn thử.
--   Dùng khi module hàng chèn CHƯA chạy thật. Chạy A xem trước → B xoá. Ảnh trong Storage (bucket raw-photos) xoá tay nếu muốn.
-- ⚠ Không có BEGIN/COMMIT để chạy được qua RPC agent_sql.
-- ============================================================

-- ─── A. XEM TRƯỚC ───────────────────────────────────────────────────────────
SELECT 'phieu_chen' AS loai, count(*) AS so_dong, string_agg(code, ', ' ORDER BY code) AS ma FROM public.mix_issues
UNION ALL SELECT 'lo_chen (kho chèn)', count(*), string_agg(code || COALESCE(' ' || so_lo, ''), ', ' ORDER BY code) FROM public.mix_lots
UNION ALL SELECT 'lenh', count(*), string_agg(code || ' ' || ma_gop, ', ') FROM public.nvl_lenh_chay
UNION ALL SELECT 'dot_chay', count(*), NULL FROM public.raw_lot_runs
UNION ALL SELECT 'ma_nvl', count(*), string_agg(ma, ', ' ORDER BY ma) FROM public.raw_lots
UNION ALL SELECT 'lo_xe_dang_gan_ma (chỉ gỡ mã, GIỮ lô xe)', count(*), string_agg(batch_no, ', ') FROM public.stock_batches WHERE raw_lot_id IS NOT NULL
UNION ALL SELECT 'phieu_ca_dang_gan_ma_hoac_lenh (chỉ gỡ)', count(*), NULL FROM public.shift_production_reports WHERE raw_lot_id IS NOT NULL OR lenh_id IS NOT NULL
UNION ALL SELECT 'anh_phieu_chen', count(*), NULL FROM public.raw_photos WHERE ref_type IN ('mix_issue_out', 'mix_issue_return');

-- ─── B. XOÁ (chạy nguyên khối) ──────────────────────────────────────────────
CREATE TEMP TABLE _ca_test AS SELECT DISTINCT facility_id, shift_date, shift_id FROM public.mix_issues WHERE shift_id IS NOT NULL;

DELETE FROM public.raw_photos WHERE ref_type IN ('mix_issue_out', 'mix_issue_return');
DELETE FROM public.mix_issues;
DELETE FROM public.mix_adjustments;

-- trả lại bành cho lô TP đã bị chèn thử (hàng chuẩn / lỗi lấy từ kho TP)
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

-- lệnh + đợt chạy
UPDATE public.shift_production_reports SET lenh_id = NULL, raw_lot_id = NULL WHERE lenh_id IS NOT NULL OR raw_lot_id IS NOT NULL;
DELETE FROM public.raw_lot_runs;
DELETE FROM public.nvl_lenh_chay;

-- mã NVL (gỡ mọi tham chiếu rồi xoá)
UPDATE public.stock_batches SET raw_lot_id = NULL WHERE raw_lot_id IS NOT NULL;
UPDATE public.raw_issue_orders SET raw_lot_id = NULL WHERE raw_lot_id IS NOT NULL;
UPDATE public.qc_reject_log SET raw_lot_id = NULL WHERE raw_lot_id IS NOT NULL;
UPDATE public.fg_lots SET raw_lot_id = NULL WHERE raw_lot_id IS NOT NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'raw_lot_aliases' AND column_name = 'raw_lot_id') THEN
    EXECUTE 'DELETE FROM public.raw_lot_aliases WHERE raw_lot_id IS NOT NULL';
  END IF;
END $$;
DELETE FROM public.raw_lots;

-- tính lại dòng CHÈN trên sổ ca của các ca từng có phiếu chèn (nếu sổ ca còn)
SELECT c.shift_date, c.shift_id, public.fn_mix_cap_nhat_dong_chen(c.facility_id, c.shift_date, c.shift_id) AS da_tinh_lai FROM _ca_test c;

-- kiểm chứng: tất cả = 0
SELECT (SELECT count(*) FROM public.mix_issues) AS phieu, (SELECT count(*) FROM public.mix_lots) AS lo_chen,
       (SELECT count(*) FROM public.nvl_lenh_chay) AS lenh, (SELECT count(*) FROM public.raw_lot_runs) AS dot_chay, (SELECT count(*) FROM public.raw_lots) AS ma_nvl;
