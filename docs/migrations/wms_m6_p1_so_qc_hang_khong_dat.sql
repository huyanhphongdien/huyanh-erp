-- ============================================================================
-- M6 · P1 — SỔ QC THEO DÕI HÀNG KHÔNG ĐẠT
-- Ngày: 29/08/2026
--
-- Số hoá cuốn sổ in sẵn mà QC đang giữ và ghi tay. Tám cột, đúng thứ tự trên giấy:
--   Ngày SX · Ca làm việc · Số lô · Tình trạng (CXL/LOẠI) · Lý do · Mã ng.liệu ·
--   Ghi chú · Tình trạng xử lý
--
-- VÌ SAO CUỐN SỔ NÀY ĐÁNG SỐ HOÁ TRƯỚC MỌI THỨ KHÁC CỦA QC
--   Cột "Mã ng.liệu" ghi mã LÔ BÃI (TMHG-26, TMNL-01, TMTV:18-19). Nghĩa là nhà máy
--   ĐÃ truy ngược hàng hỏng về lô nguyên liệu đầu vào — bằng tay, trên giấy. Đó là
--   sợi dây đắt nhất trong cả nhà máy: nó nối "lô mủ mua của ai" với "bao nhiêu bành
--   phải tái chế". Không có nó thì người giao hàng tốt và người giao hàng xấu nhận
--   cùng một giá, mãi mãi.
--
-- BỐN ĐIỀU CỐ Ý KHÔNG LÀM — rút từ chính tờ sổ, không phải từ ý thích thiết kế
--
--  1. KHÔNG gắn vào `shift_id`. Sổ ca ghi ca bằng SỐ ("Ca 2, 14h–22h"); sổ QC ghi
--     bằng TÊN TỔ MÀU ("Vàng", "Đen"). Hai cuốn sổ, hai cách gọi. Ép sổ QC chọn ca
--     là bắt QC gõ thứ họ chưa bao giờ ghi. Ở đây `to_sx` là CHỮ TỰ DO.
--
--  2. KHÔNG bắt buộc "Tình trạng xử lý". Trên tờ đọc được, cột này TRỐNG 13/13 dòng.
--     Bắt nhập một cột mà thực tế không ai điền là cách nhanh nhất để cả cuốn sổ bị bỏ.
--
--  3. KHÔNG ép "Số lô" theo định dạng. Ba dạng đang cùng tồn tại trên giấy
--     (CV262279B · S2325AB · 244941B). Hệ thống cũng chưa có mã lô thành phẩm thật nào
--     (`stock_batches` toàn TP-SEED/LOT-TEST). Ràng buộc định dạng bây giờ là đoán.
--
--  4. KHÔNG bắt điền "Mã ng.liệu" từng dòng. 8/13 dòng trên giấy dùng dấu nháy lặp (")
--     nghĩa là "như dòng trên". Màn hình phải cho kế thừa, DB phải cho NULL.
--
-- ⚠ Po LÀ TRƯỜNG MỚI, KHÔNG PHẢI PRI. Sheet đo thật trong chính file Excel của nhà máy
--   có PO và PRI là hai cột riêng, thang khác hẳn: PO 30–36,5 · PRI 70–79 (và MV
--   54,5–68,6). Sổ QC ghi "Po 250-295" tức 25,0–29,5 — dưới ngưỡng 30. Nhét Po vào
--   `production_qc_results.pri_value` là làm hỏng dữ liệu, không phải tiết kiệm cột.
--   Toàn hệ thống hiện KHÔNG có chỗ nào lưu Po.
--
-- ⚠ Sổ ghi DẢI chứ không phải một số: "Po 250-295" là min–max của mấy mẫu trong lô
--   (sheet đo cho thấy mỗi lô đo 3–4 mẫu). Nên có `po_min`/`po_max`; ghi một số thì
--   để cả hai bằng nhau.
--
-- ⚠ Chạy qua RPC agent_sql: KHÔNG được có lệnh BEGIN;/COMMIT; (lỗi 0A000).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.qc_reject_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid REFERENCES public.facilities(id),

  -- ─ Bốn cột đầu của tờ sổ ─
  ngay_sx     date NOT NULL,
  to_sx       text,          -- cột "Ca làm việc" của sổ QC = TÊN TỔ ('Vàng','Đen'). Xem điều 1.
  so_lo       text,          -- chữ tự do. Xem điều 3.
  tinh_trang  text NOT NULL, -- 'CXL' (chờ xử lý) hoặc 'LOAI'. MỘT trường hai giá trị:
                             -- trên giấy 13/13 dòng chỉ tick ĐÚNG MỘT ô, không phải 2 checkbox.

  -- ─ Lý do: giữ nguyên văn, ĐỒNG THỜI tách số ra để còn đếm được ─
  -- Chỉ giữ chữ thì không trả lời được "tháng này mất bao nhiêu vì Po"; chỉ giữ số thì
  -- mất những gì QC viết thêm. Giữ cả hai, và chữ mới là bản gốc.
  ly_do       text,
  po_min      numeric(5,1),  -- thang Po thật: 25,0 – 36,5
  po_max      numeric(5,1),
  mv_min      numeric(6,2),  -- Mooney: 54,5 – 68,6
  mv_max      numeric(6,2),

  -- ─ Sợi dây truy ngược: mã LÔ BÃI nguyên liệu ─
  ma_nguyen_lieu text,       -- TMHG-26, TMNL-01… NULL = như dòng trên. Xem điều 4.

  ghi_chu          text,
  tinh_trang_xu_ly text,     -- CỐ Ý nullable, không ràng buộc giá trị. Xem điều 2.

  created_by uuid REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT qcr_tinh_trang_check CHECK (tinh_trang IN ('CXL','LOAI')),
  -- Dải phải thuận: min <= max. Không ràng buộc ngưỡng đạt/không đạt — ngưỡng Po là
  -- con số QC phải xác nhận, chưa ai xác nhận, và đoán hộ là sai kiểu khác.
  CONSTRAINT qcr_po_dai CHECK (po_min IS NULL OR po_max IS NULL OR po_min <= po_max),
  CONSTRAINT qcr_mv_dai CHECK (mv_min IS NULL OR mv_max IS NULL OR mv_min <= mv_max)
);

COMMENT ON TABLE public.qc_reject_log IS
  'Sổ QC theo dõi hàng không đạt — số hoá cuốn sổ in sẵn QC đang ghi tay. '
  'Cột ma_nguyen_lieu là mã LÔ BÃI, sợi dây truy ngược hàng hỏng về nguyên liệu đầu vào.';
COMMENT ON COLUMN public.qc_reject_log.to_sx IS
  'Cột "Ca làm việc" trên sổ QC, thực tế ghi TÊN TỔ bằng màu (Vàng/Đen). Chữ tự do — '
  'KHÔNG phải khoá ngoại sang bảng shifts; sổ QC chưa bao giờ ghi số ca.';
COMMENT ON COLUMN public.qc_reject_log.po_min IS
  'Po (độ dẻo ban đầu). KHÁC PRI: nhà máy đo Po 30-36,5 còn PRI 70-79. Chuẩn SVR10 cần '
  'Po >= 30. Sổ ghi dải min-max vì mỗi lô đo 3-4 mẫu.';

CREATE INDEX IF NOT EXISTS qcr_facility_ngay_idx ON public.qc_reject_log (facility_id, ngay_sx DESC);
-- Chỉ mục cho câu hỏi đáng tiền nhất: lô bãi nào sinh ra nhiều hàng hỏng nhất.
CREATE INDEX IF NOT EXISTS qcr_ma_nguyen_lieu_idx ON public.qc_reject_log (ma_nguyen_lieu)
  WHERE ma_nguyen_lieu IS NOT NULL;

-- ─── Quyền ─────────────────────────────────────────────────────────────────
-- Cùng khuôn sổ ca: mọi nhân viên đăng nhập đọc và ghi được. Cuốn sổ giấy KHÔNG có ô ký
-- nào, nên CỐ Ý không dựng luồng chữ ký — dựng thêm một vòng ký mà giấy không có là ép
-- nhà máy đổi cách làm.
ALTER TABLE public.qc_reject_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY qcr_read  ON public.qc_reject_log FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY qcr_write ON public.qc_reject_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── View: lô bãi nào sinh nhiều hàng hỏng nhất ────────────────────────────
-- Đây là lý do cuốn sổ này đáng số hoá. Nhà máy đang truy ngược bằng tay; view này
-- chỉ làm nhanh việc họ đã làm đúng.
CREATE OR REPLACE VIEW public.v_qc_reject_theo_lo AS
SELECT
  r.facility_id,
  r.ma_nguyen_lieu,
  count(*)::int                                            AS so_lan,
  count(*) FILTER (WHERE r.tinh_trang = 'LOAI')::int        AS so_lan_loai,
  count(*) FILTER (WHERE r.tinh_trang = 'CXL')::int         AS so_lan_cho_xu_ly,
  min(r.po_min)                                            AS po_thap_nhat,
  max(r.po_max)                                            AS po_cao_nhat,
  min(r.ngay_sx)                                           AS lan_dau,
  max(r.ngay_sx)                                           AS lan_gan_nhat
FROM public.qc_reject_log r
WHERE r.ma_nguyen_lieu IS NOT NULL
GROUP BY r.facility_id, r.ma_nguyen_lieu;

ALTER VIEW public.v_qc_reject_theo_lo SET (security_invoker = on);
GRANT SELECT ON public.v_qc_reject_theo_lo TO authenticated;

-- ─── KIỂM CHỨNG (chạy tay sau khi apply) ───────────────────────────────────
-- a) SELECT count(*) FROM qc_reject_log;                                       -- 0
--    SELECT count(*) FROM v_qc_reject_theo_lo;                                 -- 0
-- b) SELECT count(*) FROM information_schema.columns WHERE table_name='qc_reject_log'; -- 17
-- c) Ràng buộc dải chặn đúng: po_min=30 po_max=25 phải bị từ chối (qcr_po_dai).
-- d) SELECT has_table_privilege('authenticated','qc_reject_log','SELECT');      -- true
--
-- ─── CÒN NỢ ────────────────────────────────────────────────────────────────
-- 1. NGƯỠNG Po CHƯA CÓ Ở ĐÂU. `rubber_grade_standards` có `pri_min`=30 cho SVR10 —
--    nhưng PRI nhà máy đo thật là 70-79, nên ngưỡng 30 không bao giờ chặn được gì; con
--    số đó trông giống ngưỡng Po bị đặt nhầm vào cột PRI. Nó lại đang được IN LÊN CHỨNG
--    THƯ CHẤT LƯỢNG gửi khách (`src/pages/sales/ExportDocumentsPage.tsx:162`, nhãn
--    "Plasticity Retention Index (PRI)"). CỐ Ý không tự sửa: đây là con số QC phải xác
--    nhận, không phải thứ suy ra từ tiêu chuẩn. Hỏi QC rồi mới thêm cột `po_min` vào
--    bảng chuẩn — ĐỪNG dựng bảng tiêu chuẩn thứ hai.
-- 2. Mã lô bãi đang gõ TỰ DO ở cân (`weighbridge_tickets.consolidation_code`, chỉ
--    18/967 phiếu có, cùng một lô gõ 3 kiểu khác nhau). Chừng nào chưa chuẩn hoá thì
--    `v_qc_reject_theo_lo` gộp theo chuỗi và sẽ tách nhầm một lô thành mấy dòng.
--    Việc đáng làm: đổi ô ghi chú ở cân thành danh sách chọn.
-- 3. Chưa nối sổ QC với sổ ca. Hai sổ ghi cùng một ca nhưng gọi ca khác nhau (số vs
--    tên tổ màu) — nối được chỉ sau khi nhà máy trả lời Vàng/Đen là TỔ hay là CA.
-- 4. Mới đọc được MỘT trang sổ (13 dòng, 13/8–22/8). Tập giá trị của cột "Tình trạng
--    xử lý" và của "Lý do" chưa chốt được. Xin thêm 3-4 trang trước khi ràng buộc gì.
-- ============================================================================
