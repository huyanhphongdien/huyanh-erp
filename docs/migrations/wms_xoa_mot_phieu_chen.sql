-- ============================================================
-- XOÁ MỘT PHIẾU CHÈN THEO MÃ PHIẾU (31/10/2026, chủ DN: "xoá phiếu chèn này" — PC-PD-261030-01)
--   Xoá phiếu + ảnh lấy / trả + phiếu bàn giao ca sau sinh từ nó (nếu có).
--   Lô chèn của phiếu:
--     · không còn phiếu nào khác (lô tự tạo lúc lấy, nhập = lấy) → xoá luôn lô (+ kiểm kê, ảnh lô), trả bành cho lô TP, gỡ dấu sổ QC
--     · còn phiếu khác → chỉ trả lại phần phiếu này đã trừ (kg ở dây chuyền / tiêu hao)
--   GIỮ lệnh chạy, mã NVL, phiếu ca. Tính lại dòng CHÈN sổ ca.
--   Muốn xoá phiếu khác: đổi mã phiếu ở 2 chỗ 'PC-PD-261030-01' (khối A và dòng đầu khối B).
--   Muốn xoá sạch mọi phiếu + lô chèn + lệnh (giữ mã): dùng wms_don_test_lenh_phieu.sql.
-- ⚠ Không có BEGIN/COMMIT để chạy được qua RPC agent_sql.
-- ============================================================

-- ─── A. XEM TRƯỚC ───────────────────────────────────────────────────────────
SELECT i.code, i.status, i.kg_out, i.kg_return, i.kg_used, i.shift_date,
       l.code AS lo_chen, l.so_lo, l.kg_in, l.kg_used AS lo_kg_used, l.kg_at_line,
       (SELECT count(*) FROM public.mix_issues x WHERE x.mix_lot_id = l.id AND x.id <> i.id) AS phieu_khac_cung_lo,
       (SELECT count(*) FROM public.mix_issues x WHERE x.handover_from_issue_id = i.id)   AS phieu_ban_giao_ca_sau
  FROM public.mix_issues i JOIN public.mix_lots l ON l.id = i.mix_lot_id
 WHERE i.code = 'PC-PD-261030-01';

-- ─── B. XOÁ (chạy nguyên khối) ──────────────────────────────────────────────
CREATE TEMP TABLE _p AS SELECT i.* FROM public.mix_issues i WHERE i.code = 'PC-PD-261030-01';
CREATE TEMP TABLE _ca AS
  SELECT DISTINCT facility_id, shift_date, shift_id FROM _p WHERE shift_id IS NOT NULL
  UNION
  SELECT DISTINCT facility_id, shift_date, shift_id FROM public.mix_issues
   WHERE handover_from_issue_id IN (SELECT id FROM _p) AND shift_id IS NOT NULL;

-- 1. phiếu bàn giao ca sau sinh từ phiếu này: trả lại kg đang ở dây chuyền rồi xoá
UPDATE public.mix_lots l SET kg_at_line = GREATEST(l.kg_at_line - x.kg, 0), updated_at = now()
  FROM (SELECT mix_lot_id, sum(kg_out) AS kg FROM public.mix_issues
         WHERE handover_from_issue_id IN (SELECT id FROM _p) AND status IN ('issued', 'returned', 'submitted', 'qc_confirmed')
         GROUP BY mix_lot_id) x
 WHERE l.id = x.mix_lot_id;
DELETE FROM public.raw_photos WHERE ref_type IN ('mix_issue_out', 'mix_issue_return')
   AND ref_id IN (SELECT id FROM public.mix_issues WHERE handover_from_issue_id IN (SELECT id FROM _p));
DELETE FROM public.mix_issues WHERE handover_from_issue_id IN (SELECT id FROM _p);

-- 2. trả lại lô chèn phần phiếu này đã tác động (chưa nhận: kg ở dây chuyền; đã nhận: tiêu hao)
UPDATE public.mix_lots l
   SET kg_at_line = GREATEST(l.kg_at_line - CASE WHEN p.status IN ('issued', 'returned', 'submitted', 'qc_confirmed') THEN p.kg_out ELSE 0 END, 0),
       kg_used    = GREATEST(l.kg_used - CASE WHEN p.status = 'received' THEN COALESCE(p.kg_used, 0) ELSE 0 END, 0),
       updated_at = now()
  FROM _p p WHERE l.id = p.mix_lot_id;

-- 3. xoá ảnh + phiếu
DELETE FROM public.raw_photos WHERE ref_type IN ('mix_issue_out', 'mix_issue_return') AND ref_id IN (SELECT id FROM _p);
DELETE FROM public.mix_issues WHERE id IN (SELECT id FROM _p);

-- 4. lô chèn không còn phiếu nào → xoá luôn; trả bành lô TP; gỡ dấu sổ QC
CREATE TEMP TABLE _lo AS
  SELECT l.* FROM public.mix_lots l
   WHERE l.id IN (SELECT mix_lot_id FROM _p)
     AND NOT EXISTS (SELECT 1 FROM public.mix_issues x WHERE x.mix_lot_id = l.id);
UPDATE public.fg_lots f
   SET so_banh_chen = GREATEST(f.so_banh_chen - m.banh, 0),
       status = CASE WHEN f.status = 'het' AND f.so_banh - f.so_banh_da_xuat - GREATEST(f.so_banh_chen - m.banh, 0) > 0 THEN 'ton' ELSE f.status END,
       updated_at = now()
  FROM (SELECT source_ref_id, sum(COALESCE(so_banh_in, round(kg_in / COALESCE(NULLIF(kg_per_banh, 0), 35))))::int AS banh
          FROM _lo WHERE source_ref_type = 'fg_lot' GROUP BY source_ref_id) m
 WHERE f.id = m.source_ref_id;
UPDATE public.qc_reject_log SET tinh_trang_xu_ly = NULL, updated_at = now()
 WHERE tinh_trang_xu_ly = 'Đã chuyển kho chèn' AND id IN (SELECT source_ref_id FROM _lo WHERE source_ref_type = 'qc_reject_log');
DELETE FROM public.mix_adjustments WHERE mix_lot_id IN (SELECT id FROM _lo);
DELETE FROM public.raw_photos WHERE ref_type = 'mix_lot' AND ref_id IN (SELECT id FROM _lo);
DELETE FROM public.mix_lots WHERE id IN (SELECT id FROM _lo);
-- lô còn phiếu khác: cập nhật lại trạng thái
UPDATE public.mix_lots
   SET status = CASE WHEN kg_in - kg_used - kg_at_line <= 0.005 AND kg_at_line <= 0.005 THEN 'depleted'
                     WHEN kg_at_line > 0.005 THEN 'in_use' ELSE 'available' END,
       updated_at = now()
 WHERE id IN (SELECT mix_lot_id FROM _p) AND status <> 'cancelled';

-- 5. tính lại dòng CHÈN sổ ca
SELECT c.shift_date, c.shift_id, public.fn_mix_cap_nhat_dong_chen(c.facility_id, c.shift_date, c.shift_id) AS da_tinh_lai FROM _ca c;

-- ─── C. KIỂM CHỨNG: phieu_con = 0; lo_con = 0 nếu lô không còn phiếu khác ──
SELECT (SELECT count(*) FROM public.mix_issues WHERE code = 'PC-PD-261030-01') AS phieu_con,
       (SELECT count(*) FROM public.mix_lots WHERE id IN (SELECT mix_lot_id FROM _p)) AS lo_con,
       (SELECT count(*) FROM public.mix_issues) AS tong_phieu,
       (SELECT count(*) FROM public.mix_lots)   AS tong_lo_chen;
