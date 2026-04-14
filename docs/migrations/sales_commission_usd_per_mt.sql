-- Migration: Add commission_usd_per_mt to sales_orders
-- Song song với commission_pct đã có.
-- Logic tính commission_amount ở app:
--   Nếu commission_usd_per_mt > 0 → amount = quantity_tons × commission_usd_per_mt
--   Ngược lại, nếu commission_pct > 0 → amount = total_value_usd × commission_pct / 100

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS commission_usd_per_mt NUMERIC(10, 2);

COMMENT ON COLUMN sales_orders.commission_usd_per_mt IS
  'Hoa hồng môi giới tính theo USD trên mỗi tấn (metric ton). Song song với commission_pct — app chọn 1 trong 2.';
