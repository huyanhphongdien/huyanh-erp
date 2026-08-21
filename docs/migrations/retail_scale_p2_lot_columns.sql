-- ============================================================================
-- CÂN MỦ LẺ — P2: cột bì/số bao cho weighbridge_ticket_lots (từng bao = 1 dòng)
-- Ngày: 2026-08-21
--
-- VÌ SAO DÙNG weighbridge_ticket_lots CHỨ KHÔNG PHẢI weighbridge_ticket_items:
--   Cả 2 bảng đều là "nhiều dòng trên 1 phiếu cân", nhưng ticket_items có 3 quả mìn với
--   nghiệp vụ mủ lẻ:
--     (1) CHECK chk_exactly_one_source bắt buộc ĐÚNG 1 trong deal_id/partner_id/supplier_id
--         → khách vãng lai KHÔNG có master data ⇒ INSERT bị reject.
--     (2) trigger allocate_ticket_item_weights() GHI ĐÈ actual_qty_kg + line_amount_vnd
--         theo tỷ lệ prorata ⇒ xoá mất số cân THẬT của từng bao.
--     (3) RLS chỉ mở cho authenticated + service_role ⇒ app cân (anon key) bị chặn.
--   weighbridge_ticket_lots không dính cả 3: không constraint nguồn, không trigger, đã có
--   policy wbl_anon_all + GRANT cho anon (weighbridge_ticket_lots.sql). App cân xe cũng
--   đang dùng chính bảng này để tách lô ⇒ 1 đường duy nhất, không phân mảnh dữ liệu.
--
-- QUY ƯỚC SỐ LIỆU (app Cân mủ lẻ ghi):
--   gross_kg = số đọc trên đầu cân (cả bì)
--   tare_kg  = bì bao/rổ (0 nếu đổ đống trực tiếp lên bàn cân)
--   net_kg   = gross_kg − tare_kg          ← cột đã có sẵn, là số TÍNH TIỀN
--   weighbridge_tickets.net_weight = Σ net_kg của tất cả dòng
--
-- Idempotent. Chỉ ADD COLUMN nullable/default + 1 CHECK trên cột MỚI (tare_kg) ⇒ không đụng
-- tới dữ liệu và luồng ghi hiện có của app cân xe.
-- ============================================================================

ALTER TABLE public.weighbridge_ticket_lots
  ADD COLUMN IF NOT EXISTS gross_kg        numeric(12,2),
  ADD COLUMN IF NOT EXISTS tare_kg         numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS container_count integer,
  ADD COLUMN IF NOT EXISTS container_type  text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.weighbridge_ticket_lots'::regclass
      AND conname = 'chk_wbl_tare_nonneg'
  ) THEN
    ALTER TABLE public.weighbridge_ticket_lots
      ADD CONSTRAINT chk_wbl_tare_nonneg CHECK (tare_kg >= 0);
  END IF;

END $$;

-- ⚠ CỐ Ý KHÔNG thêm CHECK (net_kg >= 0) vào bảng này.
--   weighbridge_ticket_lots DÙNG CHUNG với app cân xe, mà luồng tách lô bên đó tính net_kg
--   bằng phép trừ KHÔNG kẹp ≥ 0 (WeighingPage: lotDropKg = tongNet − lotKeepKg; lô cuối của
--   tách lô NHẬP = W[i] − W[i+1] không so với tare), và nó DELETE lô cũ TRƯỚC rồi mới INSERT,
--   riêng đường NHẬP còn nuốt lỗi bằng console.warn. Thêm CHECK ở đây = có ngày phiếu cân xe
--   mất sạch chi tiết lô mà thao tác viên không thấy báo gì.
--   App Cân mủ lẻ đã chặn net ≤ 0 ở 2 lớp (retailTicketService.createRetailTicket và
--   WeighPage.confirmAndSave) — không đáng đổi lấy rủi ro cho luồng đang chạy production.
--   Muốn siết ở tầng DB thì phải vá phép tính tách lô của app cân xe TRƯỚC.

COMMENT ON COLUMN public.weighbridge_ticket_lots.gross_kg IS
  'Cân mủ lẻ: số đọc trên đầu cân của bao/rổ này (CÓ bì). NULL với phiếu tách lô của cân xe.';
COMMENT ON COLUMN public.weighbridge_ticket_lots.tare_kg IS
  'Cân mủ lẻ: khối lượng bì (bao/rổ/thùng) trừ khỏi bao này. Mặc định 0.';
COMMENT ON COLUMN public.weighbridge_ticket_lots.container_count IS
  'Cân mủ lẻ: số bao/rổ trong dòng này (thường 1). Dùng khi cân gộp nhiều bao cùng lúc.';
COMMENT ON COLUMN public.weighbridge_ticket_lots.container_type IS
  'Cân mủ lẻ: loại bì — bao / rổ / thùng / xô... (text tự do, không ràng buộc danh mục).';
COMMENT ON COLUMN public.weighbridge_ticket_lots.net_kg IS
  'KL thuần của lô/bao. Cân xe: đã trừ pallet. Cân mủ lẻ: = gross_kg − tare_kg. Đây là số TÍNH TIỀN.';

-- Index tra dòng theo phiếu đã có (idx_wbl_ticket). Bổ sung thứ tự hiển thị ổn định.
CREATE INDEX IF NOT EXISTS idx_wbl_ticket_sort
  ON public.weighbridge_ticket_lots (ticket_id, sort_order);

NOTIFY pgrst, 'reload schema';

-- ─── VERIFY ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO v_missing
  FROM unnest(ARRAY['gross_kg', 'tare_kg', 'container_count', 'container_type']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'weighbridge_ticket_lots' AND column_name = c
  );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'P2 FAIL: thiếu cột %', v_missing;
  END IF;
  RAISE NOTICE 'P2 OK — đủ 4 cột bì/số bao trên weighbridge_ticket_lots';
END $$;

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'weighbridge_ticket_lots'
ORDER BY ordinal_position;

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
--   ALTER TABLE public.weighbridge_ticket_lots
--     DROP CONSTRAINT IF EXISTS chk_wbl_tare_nonneg,
--     DROP COLUMN IF EXISTS gross_kg,
--     DROP COLUMN IF EXISTS tare_kg,
--     DROP COLUMN IF EXISTS container_count,
--     DROP COLUMN IF EXISTS container_type;
--   DROP INDEX IF EXISTS idx_wbl_ticket_sort;
