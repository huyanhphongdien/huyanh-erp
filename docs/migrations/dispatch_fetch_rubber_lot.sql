-- ============================================================================
-- LỆNH ĐIỀU ĐỘNG — khai LOẠI MỦ + MÃ LÔ dự kiến trên lệnh "đi lấy mủ"
-- Date: 2026-07-16  (Đợt 2 phương án cân pallet TL→PĐ — bổ sung)
-- ============================================================================
-- Mục đích: lệnh "đi lấy mủ" khai sẵn loại mủ + mã lô dự kiến → app cân PĐ chọn
--   lệnh là TỰ ĐIỀN (biển số + pallet + loại mủ + lô). Operator vẫn sửa được.
-- Idempotent / an toàn: chỉ ADD COLUMN.
-- ============================================================================

ALTER TABLE public.dispatch_orders
  ADD COLUMN IF NOT EXISTS fetch_rubber_type TEXT,
  ADD COLUMN IF NOT EXISTS fetch_lot_code    TEXT;

COMMENT ON COLUMN public.dispatch_orders.fetch_rubber_type IS 'Loại mủ dự kiến lấy (mu_tap/mu_nuoc/...) — chuyến đi lấy mủ. App cân điền sẵn.';
COMMENT ON COLUMN public.dispatch_orders.fetch_lot_code    IS 'Mã lô dự kiến lấy — chuyến đi lấy mủ. App cân điền sẵn (sửa được).';

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='dispatch_orders' AND column_name='fetch_lot_code')
  THEN RAISE EXCEPTION 'FAIL: fetch_lot_code chưa thêm'; END IF;
  RAISE NOTICE '═══ dispatch_fetch_rubber_lot VERIFY PASS ═══';
END $$;

-- ROLLBACK:
-- ALTER TABLE public.dispatch_orders DROP COLUMN IF EXISTS fetch_rubber_type, DROP COLUMN IF EXISTS fetch_lot_code;
