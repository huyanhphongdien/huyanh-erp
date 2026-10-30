-- ============================================================
-- DỌN DỮ LIỆU MẪU hàng chèn / mã NVL / lệnh chạy nhập thử ngày 30/10/2026 (chủ DN: "Xoá hết các ví dụ mẫu chiều giờ chúng ta
-- nhập vào, tôi sẽ nhập vào dữ liệu thật")
--
-- CHẠY TỪNG PHẦN trong Supabase SQL Editor, theo thứ tự: A (xem trước) → B (hàng chèn, sổ mã, lệnh) → C (mã NVL mẫu, ví dụ TMHG-40)
-- → D (TUỲ CHỌN: phiếu ca + lô thành phẩm do chủ DN tạo thử hôm nay — xem trước rồi mới xoá).
-- MỐC thời gian: mọi dòng tạo từ 00:00 ngày 30/10/2026 giờ VN = timestamptz '2026-10-30 00:00+07'. Muốn đổi mốc: thay cả file (Ctrl+H).
--
-- KHÔNG đụng: mix_signers (phân công), raw_settings, danh mục, lô xe + sổ kho NVL thật (raw_stock_ledger), sổ ca do nhân viên khác nhập,
-- các hàm / view (SQL p4 → p13 vẫn nguyên). Ảnh trong Storage (bucket raw-photos) không xoá được bằng SQL — phần A3 liệt kê đường dẫn
-- để xoá tay ở Storage nếu muốn (để lại cũng không sao, chỉ tốn chỗ).
-- ⚠ Không có BEGIN/COMMIT để chạy được qua RPC agent_sql; trong SQL Editor có thể bọc từng phần bằng BEGIN; … COMMIT; nếu muốn.
-- ============================================================


-- ─── A. XEM TRƯỚC (chỉ đọc) ─────────────────────────────────────────────────
-- A1. Đếm từng bảng sẽ bị xoá / gỡ
SELECT 'B · mix_issues (phiếu chèn)' AS bang, count(*) AS so_dong, string_agg(code, ', ' ORDER BY code) AS vi_du
  FROM public.mix_issues WHERE created_at >= timestamptz '2026-10-30 00:00+07'
UNION ALL SELECT 'B · raw_photos (ảnh phiếu chèn)', count(*), NULL
  FROM public.raw_photos p WHERE p.ref_type IN ('mix_issue_out', 'mix_issue_return')
   AND p.ref_id IN (SELECT id FROM public.mix_issues WHERE created_at >= timestamptz '2026-10-30 00:00+07')
UNION ALL SELECT 'B · mix_adjustments (kiểm kê kho chèn)', count(*), NULL
  FROM public.mix_adjustments WHERE created_at >= timestamptz '2026-10-30 00:00+07'
UNION ALL SELECT 'B · mix_lots (lô chèn)', count(*), string_agg(code || COALESCE(' ' || so_lo, '') || ' · ' || source_type, ', ' ORDER BY code)
  FROM public.mix_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07'
UNION ALL SELECT 'B · fg_lots bị "chuyển kho chèn" thử (trả lại bành, không xoá lô TP)', count(DISTINCT source_ref_id), NULL
  FROM public.mix_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07' AND source_ref_type = 'fg_lot'
UNION ALL SELECT 'B · raw_lot_runs (sổ mã đang chạy)', count(*), NULL
  FROM public.raw_lot_runs WHERE created_at >= timestamptz '2026-10-30 00:00+07'
UNION ALL SELECT 'C · raw_lots (mã NVL tạo hôm nay)', count(*), string_agg(ma, ', ' ORDER BY ma)
  FROM public.raw_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07'
UNION ALL SELECT 'C · stock_batches đang gắn mã tạo hôm nay (chỉ gỡ mã, GIỮ lô xe)', count(*), NULL
  FROM public.stock_batches b WHERE b.raw_lot_id IN (SELECT id FROM public.raw_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07')
UNION ALL SELECT 'D · shift_production_reports tạo hôm nay (xem A4 trước khi xoá)', count(*), string_agg(report_date::text, ', ')
  FROM public.shift_production_reports WHERE created_at >= timestamptz '2026-10-30 00:00+07'
UNION ALL SELECT 'D · fg_lots tạo hôm nay (xem A4 trước khi xoá)', count(*), string_agg(so_lo, ', ')
  FROM public.fg_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07';

-- A2. Lệnh chạy mẫu (chỉ chạy khi đã chạy SQL p13; chưa thì bỏ qua câu này)
SELECT code, ma_gop, started_at, ended_at FROM public.nvl_lenh_chay WHERE created_at >= timestamptz '2026-10-30 00:00+07' ORDER BY started_at;

-- A3. Đường dẫn ảnh trong Storage (bucket raw-photos) để xoá tay nếu muốn
SELECT p.storage_path FROM public.raw_photos p
 WHERE p.ref_type IN ('mix_issue_out', 'mix_issue_return')
   AND p.ref_id IN (SELECT id FROM public.mix_issues WHERE created_at >= timestamptz '2026-10-30 00:00+07')
 ORDER BY 1;

-- A4. Phiếu ca + lô TP tạo hôm nay: ai tạo? (phần D chỉ xoá dòng do CHỦ DN tạo)
SELECT 'phieu_ca' AS loai, r.id, r.report_date::text AS ngay, r.status, r.created_at, e.full_name AS nguoi_tao
  FROM public.shift_production_reports r LEFT JOIN public.employees e ON e.id = r.reported_by
 WHERE r.created_at >= timestamptz '2026-10-30 00:00+07'
UNION ALL
SELECT 'lo_tp', f.id, f.so_lo, f.status, f.created_at, e.full_name
  FROM public.fg_lots f LEFT JOIN public.employees e ON e.id = f.created_by
 WHERE f.created_at >= timestamptz '2026-10-30 00:00+07'
 ORDER BY 1, 5;


-- ─── B. XOÁ HÀNG CHÈN MẪU + SỔ MÃ / LỆNH (chạy nguyên khối) ───────────────────
-- B1. Ghi nhớ các ca có phiếu chèn mẫu → cuối khối tính lại dòng CHÈN trên sổ ca (nếu sổ ca đó là thật)
CREATE TEMP TABLE _ca_mau AS
SELECT DISTINCT facility_id, shift_date, shift_id FROM public.mix_issues
 WHERE created_at >= timestamptz '2026-10-30 00:00+07' AND shift_id IS NOT NULL;

-- B2. Ảnh phiếu chèn (dòng raw_photos; file trong Storage xoá tay theo A3)
DELETE FROM public.raw_photos
 WHERE ref_type IN ('mix_issue_out', 'mix_issue_return')
   AND ref_id IN (SELECT id FROM public.mix_issues WHERE created_at >= timestamptz '2026-10-30 00:00+07');

-- B3. Phiếu chèn mẫu (kể cả phiếu bàn giao sinh ra từ phiếu mẫu)
DELETE FROM public.mix_issues
 WHERE created_at >= timestamptz '2026-10-30 00:00+07'
    OR handover_from_issue_id IN (SELECT id FROM public.mix_issues WHERE created_at >= timestamptz '2026-10-30 00:00+07');

-- B4. Kiểm kê kho chèn mẫu
DELETE FROM public.mix_adjustments
 WHERE created_at >= timestamptz '2026-10-30 00:00+07'
    OR mix_lot_id IN (SELECT id FROM public.mix_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07');

-- B5. Trả lại số bành cho lô TP đã "chuyển kho chèn" thử (lô TP giữ nguyên, chỉ lùi so_banh_chen / trạng thái)
UPDATE public.fg_lots f
   SET so_banh_chen = GREATEST(f.so_banh_chen - m.banh, 0),
       status = CASE WHEN f.status = 'het' AND f.so_banh - f.so_banh_da_xuat - GREATEST(f.so_banh_chen - m.banh, 0) > 0 THEN 'ton' ELSE f.status END,
       updated_at = now()
  FROM (SELECT source_ref_id, sum(COALESCE(so_banh_in, round(kg_in / COALESCE(NULLIF(kg_per_banh, 0), 35))))::int AS banh
          FROM public.mix_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07' AND source_ref_type = 'fg_lot' GROUP BY source_ref_id) m
 WHERE f.id = m.source_ref_id;

-- B6. Sổ QC: bỏ dấu "Đã chuyển kho chèn" của dòng chuyển thử
UPDATE public.qc_reject_log q
   SET tinh_trang_xu_ly = NULL, updated_at = now()
 WHERE q.tinh_trang_xu_ly = 'Đã chuyển kho chèn'
   AND q.id IN (SELECT source_ref_id FROM public.mix_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07' AND source_ref_type = 'qc_reject_log');

-- B7. Lô chèn mẫu
--     (lô "Hàng chuẩn" lấy từ kho TP đã ghi một dòng xuất bành vào sổ ca của ngày đó; nếu sổ ca đó là thật thì sửa tay dòng ấy,
--      nếu sổ ca cũng là mẫu thì phần D xoá luôn)
DELETE FROM public.mix_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07';

-- B8. Sổ mã đang chạy + lệnh chạy mẫu (lệnh chỉ có khi đã chạy p13 — tự bỏ qua nếu chưa)
DELETE FROM public.raw_lot_runs WHERE created_at >= timestamptz '2026-10-30 00:00+07';
DO $$ BEGIN
  IF to_regclass('public.nvl_lenh_chay') IS NOT NULL THEN
    EXECUTE $q$UPDATE public.shift_production_reports SET lenh_id = NULL
                WHERE lenh_id IN (SELECT id FROM public.nvl_lenh_chay WHERE created_at >= timestamptz '2026-10-30 00:00+07')$q$;
    EXECUTE $q$UPDATE public.mix_issues SET lenh_id = NULL
                WHERE lenh_id IN (SELECT id FROM public.nvl_lenh_chay WHERE created_at >= timestamptz '2026-10-30 00:00+07')$q$;
    EXECUTE $q$UPDATE public.raw_lot_runs SET lenh_id = NULL
                WHERE lenh_id IN (SELECT id FROM public.nvl_lenh_chay WHERE created_at >= timestamptz '2026-10-30 00:00+07')$q$;
    EXECUTE $q$DELETE FROM public.nvl_lenh_chay WHERE created_at >= timestamptz '2026-10-30 00:00+07'$q$;
  END IF;
END $$;

-- B9. Tính lại dòng CHÈN trên sổ ca của các ca vừa mất phiếu mẫu (sổ ca mẫu sẽ xoá ở D nên không sao)
SELECT c.shift_date, c.shift_id, public.fn_mix_cap_nhat_dong_chen(c.facility_id, c.shift_date, c.shift_id) AS da_tinh_lai FROM _ca_mau c;

-- B10. Kiểm chứng: tất cả phải = 0
SELECT (SELECT count(*) FROM public.mix_issues WHERE created_at >= timestamptz '2026-10-30 00:00+07') AS phieu_chen,
       (SELECT count(*) FROM public.mix_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07') AS lo_chen,
       (SELECT count(*) FROM public.raw_lot_runs WHERE created_at >= timestamptz '2026-10-30 00:00+07') AS so_ma_chay;


-- ─── C. GỠ MÃ NVL MẪU (ví dụ TMHG-40 tạo thử bằng SQL chiều 30/10) ────────────
--     Lô xe thật đang gắn mã mẫu chỉ bị GỠ mã (raw_lot_id = NULL), không xoá lô xe, không đụng sổ kho.
UPDATE public.stock_batches SET raw_lot_id = NULL
 WHERE raw_lot_id IN (SELECT id FROM public.raw_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07');
UPDATE public.raw_issue_orders SET raw_lot_id = NULL
 WHERE raw_lot_id IN (SELECT id FROM public.raw_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07');
UPDATE public.shift_production_reports SET raw_lot_id = NULL
 WHERE raw_lot_id IN (SELECT id FROM public.raw_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07');
UPDATE public.qc_reject_log SET raw_lot_id = NULL
 WHERE raw_lot_id IN (SELECT id FROM public.raw_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07');
UPDATE public.fg_lots SET raw_lot_id = NULL
 WHERE raw_lot_id IN (SELECT id FROM public.raw_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07');
UPDATE public.mix_issues SET raw_lot_id = NULL, raw_lot_ids = NULL
 WHERE raw_lot_id IN (SELECT id FROM public.raw_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07')
    OR raw_lot_ids && (SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) FROM public.raw_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07');
DELETE FROM public.raw_lot_runs
 WHERE raw_lot_id IN (SELECT id FROM public.raw_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07');
DO $$ BEGIN   -- bí danh mã (nếu bảng có cột raw_lot_id)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'raw_lot_aliases' AND column_name = 'raw_lot_id') THEN
    EXECUTE $q$DELETE FROM public.raw_lot_aliases WHERE raw_lot_id IN (SELECT id FROM public.raw_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07')$q$;
  END IF;
  IF to_regclass('public.nvl_lenh_chay') IS NOT NULL THEN
    EXECUTE $q$DELETE FROM public.nvl_lenh_chay WHERE raw_lot_ids && (SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) FROM public.raw_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07')$q$;
  END IF;
END $$;
DELETE FROM public.raw_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07';
SELECT (SELECT count(*) FROM public.raw_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07') AS ma_mau_con_lai_phai_la_0;


-- ─── D. TUỲ CHỌN: PHIẾU CA + LÔ TP DO CHỦ DN TẠO THỬ HÔM NAY ─────────────────
--     Chỉ xoá dòng tạo hôm nay mà người tạo là tài khoản chủ DN (huyanhphongdien@gmail.com). Sổ ca / lô TP do nhân viên khác nhập GIỮ NGUYÊN.
--     Xem A4 trước. Nếu A4 có dòng của chủ DN mà là THẬT thì đừng chạy D (hoặc xoá tay từng dòng).
CREATE TEMP TABLE _chu_dn AS
SELECT e.id FROM public.employees e JOIN auth.users u ON u.id = e.user_id WHERE lower(u.email) = 'huyanhphongdien@gmail.com';

CREATE TEMP TABLE _fg_mau AS
SELECT id FROM public.fg_lots WHERE created_at >= timestamptz '2026-10-30 00:00+07' AND created_by IN (SELECT id FROM _chu_dn);
UPDATE public.qc_reject_log SET fg_lot_id = NULL WHERE fg_lot_id IN (SELECT id FROM _fg_mau);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'dispatch_order_lines' AND column_name = 'fg_lot_id') THEN
    EXECUTE 'UPDATE public.dispatch_order_lines SET fg_lot_id = NULL WHERE fg_lot_id IN (SELECT id FROM _fg_mau)';
  END IF;
END $$;
UPDATE public.fg_lots SET tu_fg_lot_id = NULL WHERE tu_fg_lot_id IN (SELECT id FROM _fg_mau);
DELETE FROM public.fg_lot_exports WHERE fg_lot_id IN (SELECT id FROM _fg_mau);
DELETE FROM public.fg_lots WHERE id IN (SELECT id FROM _fg_mau);

CREATE TEMP TABLE _ca_xoa AS
SELECT id FROM public.shift_production_reports WHERE created_at >= timestamptz '2026-10-30 00:00+07' AND reported_by IN (SELECT id FROM _chu_dn);
UPDATE public.fg_lots SET report_id = NULL WHERE report_id IN (SELECT id FROM _ca_xoa);   -- lô TP thật (nếu có) chỉ mất liên kết phiếu ca
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'shift_book_thu_kho' AND column_name = 'report_id') THEN
    EXECUTE 'DELETE FROM public.shift_book_thu_kho WHERE report_id IN (SELECT id FROM _ca_xoa)';
  END IF;
END $$;
DELETE FROM public.shift_production_lines WHERE report_id IN (SELECT id FROM _ca_xoa);
DELETE FROM public.shift_production_reports WHERE id IN (SELECT id FROM _ca_xoa);
SELECT (SELECT count(*) FROM _ca_xoa) AS phieu_ca_da_xoa, (SELECT count(*) FROM _fg_mau) AS lo_tp_da_xoa;
