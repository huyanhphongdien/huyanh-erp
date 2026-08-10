-- ============================================================================
-- BỘ CHỨNG TỪ THEO LÔ — mỗi lô (nhóm container theo lot_no) ship riêng: B/L,
-- hóa đơn, Hối phiếu, chiết khấu riêng.
--   sales_order_lc_negotiations.lot_no : chiết khấu theo (đơn, lô). lot_no=0 = cả đơn.
--   sales_order_bookings.lot_no        : gắn booking (B/L/tàu/ETD) với lô container.
-- Đổi UNIQUE(sales_order_id) → UNIQUE(sales_order_id, lot_no). Idempotent.
-- ============================================================================

ALTER TABLE public.sales_order_lc_negotiations
  ADD COLUMN IF NOT EXISTS lot_no int DEFAULT 0;
UPDATE public.sales_order_lc_negotiations SET lot_no = 0 WHERE lot_no IS NULL;
ALTER TABLE public.sales_order_lc_negotiations
  DROP CONSTRAINT IF EXISTS sales_order_lc_negotiations_sales_order_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS soln_order_lot_uidx
  ON public.sales_order_lc_negotiations(sales_order_id, lot_no);

ALTER TABLE public.sales_order_bookings
  ADD COLUMN IF NOT EXISTS lot_no int;

COMMENT ON COLUMN public.sales_order_lc_negotiations.lot_no IS 'Lô (nhóm container lot_no). 0 = cả đơn.';
COMMENT ON COLUMN public.sales_order_bookings.lot_no IS 'Gắn booking với lô container (lot_no) để lấy B/L/tàu/ETD theo lô.';
