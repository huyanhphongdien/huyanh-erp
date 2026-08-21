-- ============================================================================
-- CÂN MỦ LẺ — P1: cho phép ticket_type = 'retail' (+ source_type = 'retail')
-- Ngày: 2026-08-21
-- App: apps/retail-scale (Cân mủ lẻ) — hộ tiểu điền/khách vãng lai bán mủ tạp
--      tại nhà máy, cân bàn/cân sàn, CÂN 1 LẦN (không có xe rỗng).
--
-- Vì sao KHÔNG tạo bảng phiếu riêng: `payment_requests` (đề nghị thanh toán) là
-- cửa chi tiền duy nhất của hệ thống và nó khoá vào weighbridge_tickets.id.
-- Dùng lại bảng cân → nhánh chi tiền chạy ngay, không phải viết downstream mới.
--
-- AN TOÀN với phiếu đang chạy — đã kiểm tra từng trigger trên weighbridge_tickets:
--   • trg_enforce_weighbridge_accepted  → RETURN NEW khi ticket_type <> 'in'  ⇒ bỏ qua retail
--   • trg_weighbridge_ticket_bridge     → bridge RETURN NULL khi <> 'in'      ⇒ retail KHÔNG
--       sinh rubber_intake_batches (CỐ Ý: tránh hộ tiểu điền lọt vào compute_monthly_bonus
--       vốn dành cho đại lý B2B). Nếu sau này cần lý lịch mủ cho mủ lẻ thì viết hàm RIÊNG,
--       đừng sửa hàm dùng chung.
--   • trg_ticket_allocate_on_weigh      → WHEN (has_items = TRUE); app Cân mủ lẻ luôn ghi
--       has_items = FALSE và lưu từng bao ở weighbridge_ticket_lots ⇒ trigger KHÔNG chạy.
--   • trg_sync_intake_drc               → UPDATE theo weighbridge_ticket_id, retail không có
--       batch ⇒ 0 dòng, vô hại.
--
-- Idempotent. Chạy được nhiều lần.
-- ============================================================================

-- ─── 1. ticket_type: ('in','out','gate','fetch') → thêm 'retail' ─────────────
-- Dò tên constraint động (khuôn của weighbridge_ticket_type_fetch.sql) vì tên có thể
-- khác nhau giữa các môi trường. Xoá MỌI check dính ticket_type rồi tạo lại đúng 1 cái.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.weighbridge_tickets'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%ticket_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.weighbridge_tickets DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Đã xoá constraint cũ: %', r.conname;
  END LOOP;

  ALTER TABLE public.weighbridge_tickets
    ADD CONSTRAINT weighbridge_tickets_ticket_type_check
    CHECK (ticket_type IN ('in', 'out', 'gate', 'fetch', 'retail'));
END $$;

COMMENT ON COLUMN public.weighbridge_tickets.ticket_type IS
  'in=cân nhập · out=cân xuất · gate=cổng (hàng nội bộ) · fetch=đi lấy mủ NM khác · retail=cân mủ lẻ (app apps/retail-scale, cân 1 lần, tare=0)';

-- ─── 2. source_type: thêm 'retail' ───────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.weighbridge_tickets'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%source_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.weighbridge_tickets DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.weighbridge_tickets
    ADD CONSTRAINT weighbridge_tickets_source_type_check
    CHECK (source_type IS NULL OR source_type IN ('deal', 'supplier', 'partner_direct', 'transfer', 'retail'));
END $$;

-- ─── 3. Index tra cứu phiếu mủ lẻ theo nhà máy + ngày ────────────────────────
CREATE INDEX IF NOT EXISTS idx_wt_retail_facility_created
  ON public.weighbridge_tickets (facility_id, created_at DESC)
  WHERE ticket_type = 'retail';

NOTIFY pgrst, 'reload schema';

-- ─── VERIFY ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_type text;
  v_src  text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_type
  FROM pg_constraint
  WHERE conrelid = 'public.weighbridge_tickets'::regclass
    AND conname = 'weighbridge_tickets_ticket_type_check';

  IF v_type IS NULL OR v_type NOT ILIKE '%retail%' THEN
    RAISE EXCEPTION 'P1 FAIL: ticket_type chưa nhận giá trị retail (def=%)', COALESCE(v_type, 'NULL');
  END IF;

  -- Soi luôn source_type: nếu chỉ một trong hai được nới thì DB đang ở trạng thái LAI,
  -- app sẽ lưu được ticket_type='retail' rồi chết ở source_type mà không rõ vì sao.
  SELECT pg_get_constraintdef(oid) INTO v_src
  FROM pg_constraint
  WHERE conrelid = 'public.weighbridge_tickets'::regclass
    AND conname = 'weighbridge_tickets_source_type_check';

  IF v_src IS NULL OR v_src NOT ILIKE '%retail%' THEN
    RAISE EXCEPTION 'P1 FAIL: source_type chưa nhận giá trị retail (def=%)', COALESCE(v_src, 'NULL');
  END IF;

  RAISE NOTICE 'P1 OK — ticket_type: % | source_type: %', v_type, v_src;
END $$;

SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.weighbridge_tickets'::regclass
  AND conname IN ('weighbridge_tickets_ticket_type_check', 'weighbridge_tickets_source_type_check');

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- MẶC ĐỊNH: chỉ gỡ index, GIỮ 'retail' trong cả 2 CHECK.
--   Một giá trị thừa trong CHECK là vô hại; hẹp CHECK lại khi đã có dữ liệu thì BẮT BUỘC
--   phải phá dữ liệu. Đừng làm trừ khi thật sự cần.
--     DROP INDEX IF EXISTS idx_wt_retail_facility_created;
--
-- CHỈ KHI BẮT BUỘC purge hẳn giá trị 'retail' — theo ĐÚNG thứ tự:
--
--   B0. Precheck, phải trả về 0 (nếu > 0 thì DỪNG, chứng từ kế toán đang trỏ vào các phiếu này):
--       SELECT count(*) FROM public.payment_request_lines l
--       JOIN public.weighbridge_tickets t ON t.id = l.ticket_id
--       WHERE t.ticket_type = 'retail';
--
--   B1. Archive TRƯỚC (DELETE là một chiều) + neo mã phiếu vào chứng từ trước khi FK bị SET NULL:
--       CREATE TABLE archive_retail_tickets AS
--         SELECT * FROM public.weighbridge_tickets WHERE ticket_type = 'retail';
--       CREATE TABLE archive_retail_lots AS
--         SELECT l.* FROM public.weighbridge_ticket_lots l
--         JOIN public.weighbridge_tickets t ON t.id = l.ticket_id WHERE t.ticket_type = 'retail';
--       UPDATE public.payment_request_lines l
--          SET note = concat_ws(' | ', l.note, 'phieu:' || t.code)
--         FROM public.weighbridge_tickets t
--        WHERE t.id = l.ticket_id AND t.ticket_type = 'retail';
--
--   B2. ⚠ DELETE dưới đây KÉO THEO (đã xác minh pg_constraint trên DB thật):
--         • weighbridge_ticket_lots.ticket_id   ON DELETE CASCADE  → xoá sạch chi tiết từng bao
--         • weighbridge_ticket_items.ticket_id  ON DELETE CASCADE
--         • weighbridge_images.ticket_id        ON DELETE CASCADE
--         • payment_request_lines.ticket_id     ON DELETE SET NULL → chứng từ mất liên kết phiếu
--       DELETE FROM public.weighbridge_tickets WHERE ticket_type = 'retail';
--
--   B3. Hẹp lại CẢ HAI constraint (đừng quên vế source_type — p1 nới cả hai):
--       ALTER TABLE public.weighbridge_tickets DROP CONSTRAINT weighbridge_tickets_ticket_type_check;
--       ALTER TABLE public.weighbridge_tickets ADD CONSTRAINT weighbridge_tickets_ticket_type_check
--         CHECK (ticket_type IN ('in','out','gate','fetch'));
--       ALTER TABLE public.weighbridge_tickets DROP CONSTRAINT weighbridge_tickets_source_type_check;
--       ALTER TABLE public.weighbridge_tickets ADD CONSTRAINT weighbridge_tickets_source_type_check
--         CHECK (source_type IS NULL OR source_type IN ('deal','supplier','partner_direct','transfer'));
--       DROP INDEX IF EXISTS idx_wt_retail_facility_created;
--
-- ⚠ TUYỆT ĐỐI KHÔNG rollback bằng `UPDATE ... SET ticket_type='in'`: bridge_weighbridge_to_intake()
--   chặn mủ lẻ bằng đúng dòng `IF v_ticket.ticket_type <> 'in' THEN RETURN NULL`. Đổi sang 'in'
--   là gỡ chốt đó — lần update sau chạm status/partner_id/rubber_type/net_weight sẽ sinh
--   rubber_intake_batches cho hộ tiểu điền và thổi phồng compute_monthly_bonus của đại lý B2B.
