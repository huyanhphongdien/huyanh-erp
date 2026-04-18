-- ============================================================================
-- Sales Order: flexible terms (packing note, shipment time, payment notes)
-- Feedback Lê Duy Minh 2026-04-18:
--   1) Một số khách yêu cầu bao bì riêng → cần ô note bao bì theo từng item
--   2) Cần ô "Shipment Time" (text tự do: "Within 30 days from L/C", "End of May 2026"...)
--   3) Payment terms hiện cố định 9 tag, không nhập được case lai
--      (LC at sight / LC usance / LC upas / 10% cọc 90% DP / 90% TT...)
-- ============================================================================

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS shipment_time TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms_note TEXT,
  ADD COLUMN IF NOT EXISTS packing_note TEXT;

ALTER TABLE sales_order_items
  ADD COLUMN IF NOT EXISTS packing_note TEXT;

COMMENT ON COLUMN sales_orders.shipment_time IS 'Điều khoản thời gian giao hàng trên hợp đồng/LC (free-form). VD: Within 30 days from L/C date';
COMMENT ON COLUMN sales_orders.payment_terms_note IS 'Ghi chú thanh toán tự do cho case không match tag cố định. VD: LC at sight / 10% cọc 90% DP';
COMMENT ON COLUMN sales_orders.packing_note IS 'Ghi chú đóng gói cấp đơn (tổng).';
COMMENT ON COLUMN sales_order_items.packing_note IS 'Ghi chú đóng gói riêng cho từng grade/item. Khách đặc thù yêu cầu bao bì riêng.';
