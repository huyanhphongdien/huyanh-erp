-- ============================================================================
-- Bổ sung field để bộ chứng từ xuất khẩu ĐỦ THÔNG TIN:
--   - freight_amount / insurance_amount: tách cước & bảo hiểm cho Invoice CIF
--   - bl_date: ngày B/L (Hối phiếu "from B/L date", Weight List)
--   - invoice_no / invoice_date: số & ngày hóa đơn thương mại (thay INV-<code> + hôm nay)
-- (port_of_loading/discharge/destination, vessel_name, voyage_number, bl_number,
--  etd/eta, customer_po, payment_terms... ĐÃ CÓ SẴN trên sales_orders.)
-- Idempotent — an toàn chạy lại.
-- ============================================================================

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS freight_amount   numeric,
  ADD COLUMN IF NOT EXISTS insurance_amount numeric,
  ADD COLUMN IF NOT EXISTS bl_date          date,
  ADD COLUMN IF NOT EXISTS invoice_no       varchar,
  ADD COLUMN IF NOT EXISTS invoice_date     date;

COMMENT ON COLUMN public.sales_orders.freight_amount   IS 'Cước vận chuyển (USD) — dùng cho Invoice CIF/CFR.';
COMMENT ON COLUMN public.sales_orders.insurance_amount IS 'Phí bảo hiểm (USD) — dùng cho Invoice CIF.';
COMMENT ON COLUMN public.sales_orders.bl_date          IS 'Ngày Bill of Lading — Hối phiếu/Weight List.';
COMMENT ON COLUMN public.sales_orders.invoice_no       IS 'Số hóa đơn thương mại (nếu để trống → INV-<code>).';
COMMENT ON COLUMN public.sales_orders.invoice_date     IS 'Ngày hóa đơn thương mại (nếu để trống → hôm nay).';
