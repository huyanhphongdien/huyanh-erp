-- ============================================================================
-- SALES ORDER BOOKINGS — Quản lý NHIỀU booking/lô cho 1 đơn hàng bán (Mức 2)
-- ============================================================================
-- 1 đơn xuất có thể đi NHIỀU booking (nhiều lô, nhiều tàu/chuyến). Bảng này lưu
-- chi tiết từng booking + file đính kèm. Ô booking đơn lẻ trên sales_orders giữ
-- nguyên (booking CHÍNH cho dashboard ETD); bảng này là chi tiết đầy đủ.
--
-- An toàn go-live: create if not exists, RLS authenticated. Chạy 1 lần trên Supabase.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sales_order_bookings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id   uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  lot_label        text,                 -- "Lot 1" / "Lô 1"
  booking_no       text,                 -- 271516317
  shipping_line    text,                 -- MAERSK / ONE...
  vessel_name      text,                 -- MCC DANANG
  voyage_no        text,                 -- 612N
  etd              date,
  eta              date,
  cutoff           text,                 -- "06/06 10:00" / "Sat 10:00" (free text)
  container_count  int,
  port_of_loading      text,
  port_of_destination  text,
  bl_number        text,
  file_url         text,                 -- file booking/B/L đính kèm (sales-documents bucket)
  file_name        text,
  notes            text,
  sort_order       int DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_order_bookings_so
  ON public.sales_order_bookings(sales_order_id);

COMMENT ON TABLE public.sales_order_bookings IS
  'Nhiều booking/lô cho 1 đơn hàng bán (Mức 2 tab Vận chuyển).';

-- RLS: authenticated toàn quyền (đơn hàng bán là module nội bộ).
ALTER TABLE public.sales_order_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_order_bookings_all ON public.sales_order_bookings;
CREATE POLICY sales_order_bookings_all ON public.sales_order_bookings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Kiểm: select * from sales_order_bookings order by created_at desc limit 20;
