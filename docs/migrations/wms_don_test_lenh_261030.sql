-- ============================================================
-- DỌN DỮ LIỆU TEST ĐÊM 30/10 (chủ DN 31/10: "xoá hết các mã này tôi nhập lại để test")
--   Xoá đúng: phiếu chèn PC-PD-261030-*, lô chèn CH-PD-261030-*, lệnh LC-PD-261030-* (+ đợt chạy), mã TMHG-15 / TMHG-17 tạo thử.
--   Trả lại bành cho lô TP bị "chèn" thử, gỡ dấu sổ QC, tính lại dòng CHÈN sổ ca. KHÔNG đụng lô xe, sổ kho, phân công, hàm / view.
--   Chạy phần A (xem trước) → B (xoá). Mã số theo ngày tạo 261030 — nếu đã test tiếp sang ngày 31/10, sửa '261030' thành '26103%' trong cả file.
-- ⚠ Không có BEGIN/COMMIT để chạy được qua RPC agent_sql.
-- ============================================================

-- ─── A. XEM TRƯỚC ───────────────────────────────────────────────────────────
SELECT 'phieu_chen' AS loai, count(*) AS so_dong, string_agg(code, ', ' ORDER BY code) AS ma FROM public.mix_issues WHERE code LIKE 'PC-PD-261030-%'
UNION ALL SELECT 'lo_chen', count(*), string_agg(code || COALESCE(' ' || so_lo, ''), ', ' ORDER BY code) FROM public.mix_lots WHERE code LIKE 'CH-PD-261030-%'
UNION ALL SELECT 'lenh', count(*), string_agg(code || ' ' || ma_gop, ', ') FROM public.nvl_lenh_chay WHERE code LIKE 'LC-PD-261030-%'
UNION ALL SELECT 'ma_nvl_test', count(*), string_agg(ma, ', ') FROM public.raw_lots WHERE ma IN ('TMHG-15', 'TMHG-17', 'TMHG-1') AND created_at >= timestamptz '2026-10-30 00:00+07'
UNION ALL SELECT 'lo_xe_dang_gan_ma_test (chỉ gỡ mã)', count(*), NULL FROM public.stock_batches WHERE raw_lot_id IN (SELECT id FROM public.raw_lots WHERE ma IN ('TMHG-15', 'TMHG-17', 'TMHG-1') AND created_at >= timestamptz '2026-10-30 00:00+07')
UNION ALL SELECT 'anh', count(*), NULL FROM public.raw_photos WHERE ref_type IN ('mix_issue_out', 'mix_issue_return') AND ref_id IN (SELECT id FROM public.mix_issues WHERE code LIKE 'PC-PD-261030-%');

-- ─── B. XOÁ (chạy nguyên khối) ──────────────────────────────────────────────
CREATE TEMP TABLE _ca_test AS SELECT DISTINCT facility_id, shift_date, shift_id FROM public.mix_issues WHERE code LIKE 'PC-PD-261030-%' AND shift_id IS NOT NULL;
CREATE TEMP TABLE _ma_test AS SELECT id FROM public.raw_lots WHERE ma IN ('TMHG-15', 'TMHG-17', 'TMHG-1') AND created_at >= timestamptz '2026-10-30 00:00+07';

DELETE FROM public.raw_photos WHERE ref_type IN ('mix_issue_out', 'mix_issue_return') AND ref_id IN (SELECT id FROM public.mix_issues WHERE code LIKE 'PC-PD-261030-%');
DELETE FROM public.mix_issues WHERE code LIKE 'PC-PD-261030-%' OR handover_from_issue_id IN (SELECT id FROM public.mix_issues WHERE code LIKE 'PC-PD-261030-%');
DELETE FROM public.mix_adjustments WHERE mix_lot_id IN (SELECT id FROM public.mix_lots WHERE code LIKE 'CH-PD-261030-%');

-- trả lại bành cho lô TP đã bị chèn thử (lô "3L", "STD" hàng chuẩn kho TP)
UPDATE public.fg_lots f
   SET so_banh_chen = GREATEST(f.so_banh_chen - m.banh, 0),
       status = CASE WHEN f.status = 'het' AND f.so_banh - f.so_banh_da_xuat - GREATEST(f.so_banh_chen - m.banh, 0) > 0 THEN 'ton' ELSE f.status END,
       updated_at = now()
  FROM (SELECT source_ref_id, sum(COALESCE(so_banh_in, round(kg_in / COALESCE(NULLIF(kg_per_banh, 0), 35))))::int AS banh
          FROM public.mix_lots WHERE code LIKE 'CH-PD-261030-%' AND source_ref_type = 'fg_lot' GROUP BY source_ref_id) m
 WHERE f.id = m.source_ref_id;
UPDATE public.qc_reject_log SET tinh_trang_xu_ly = NULL, updated_at = now()
 WHERE tinh_trang_xu_ly = 'Đã chuyển kho chèn' AND id IN (SELECT source_ref_id FROM public.mix_lots WHERE code LIKE 'CH-PD-261030-%' AND source_ref_type = 'qc_reject_log');
DELETE FROM public.mix_lots WHERE code LIKE 'CH-PD-261030-%';

-- lệnh + đợt chạy test
UPDATE public.shift_production_reports SET lenh_id = NULL WHERE lenh_id IN (SELECT id FROM public.nvl_lenh_chay WHERE code LIKE 'LC-PD-261030-%');
UPDATE public.mix_issues SET lenh_id = NULL WHERE lenh_id IN (SELECT id FROM public.nvl_lenh_chay WHERE code LIKE 'LC-PD-261030-%');
DELETE FROM public.raw_lot_runs WHERE lenh_id IN (SELECT id FROM public.nvl_lenh_chay WHERE code LIKE 'LC-PD-261030-%') OR raw_lot_id IN (SELECT id FROM _ma_test);
DELETE FROM public.nvl_lenh_chay WHERE code LIKE 'LC-PD-261030-%' OR raw_lot_ids && (SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) FROM _ma_test);

-- mã NVL test (lô xe thật nếu có chỉ bị gỡ mã)
UPDATE public.stock_batches SET raw_lot_id = NULL WHERE raw_lot_id IN (SELECT id FROM _ma_test);
UPDATE public.raw_issue_orders SET raw_lot_id = NULL WHERE raw_lot_id IN (SELECT id FROM _ma_test);
UPDATE public.shift_production_reports SET raw_lot_id = NULL WHERE raw_lot_id IN (SELECT id FROM _ma_test);
UPDATE public.qc_reject_log SET raw_lot_id = NULL WHERE raw_lot_id IN (SELECT id FROM _ma_test);
UPDATE public.fg_lots SET raw_lot_id = NULL WHERE raw_lot_id IN (SELECT id FROM _ma_test);
UPDATE public.mix_issues SET raw_lot_id = NULL, raw_lot_ids = NULL WHERE raw_lot_id IN (SELECT id FROM _ma_test) OR raw_lot_ids && (SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) FROM _ma_test);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'raw_lot_aliases' AND column_name = 'raw_lot_id') THEN
    EXECUTE 'DELETE FROM public.raw_lot_aliases WHERE raw_lot_id IN (SELECT id FROM _ma_test)';
  END IF;
END $$;
DELETE FROM public.raw_lots WHERE id IN (SELECT id FROM _ma_test);

-- tính lại dòng CHÈN trên sổ ca của các ca test (nếu sổ ca đó vẫn còn)
SELECT c.shift_date, c.shift_id, public.fn_mix_cap_nhat_dong_chen(c.facility_id, c.shift_date, c.shift_id) AS da_tinh_lai FROM _ca_test c;

-- kiểm chứng: tất cả = 0
SELECT (SELECT count(*) FROM public.mix_issues WHERE code LIKE 'PC-PD-261030-%') AS phieu,
       (SELECT count(*) FROM public.mix_lots WHERE code LIKE 'CH-PD-261030-%') AS lo_chen,
       (SELECT count(*) FROM public.nvl_lenh_chay WHERE code LIKE 'LC-PD-261030-%') AS lenh,
       (SELECT count(*) FROM public.raw_lots WHERE ma IN ('TMHG-15', 'TMHG-17', 'TMHG-1') AND created_at >= timestamptz '2026-10-30 00:00+07') AS ma_test;
