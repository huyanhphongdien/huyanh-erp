-- Ngày phát hành B/L THEO LÔ (booking) — để bộ chứng từ theo lô dùng đúng ngày B/L của lô
-- (trước: số B/L lấy theo lô nhưng NGÀY B/L dùng chung order.bl_date cả đơn → 2 lô có thể lệch ngày).
-- Idempotent — an toàn chạy lại.
ALTER TABLE public.sales_order_bookings
  ADD COLUMN IF NOT EXISTS bl_date date;

COMMENT ON COLUMN public.sales_order_bookings.bl_date IS
  'Ngày phát hành B/L của lô này. documentService (Invoice/WeightList/Hối phiếu/Beneficiary) ưu tiên booking.bl_date || order.bl_date.';
