-- ============================================================================
-- Ghi đè động THEO ĐƠN (mặc định lấy từ hồ sơ khách) — khỏi sửa hồ sơ mỗi lô:
--   sales_orders.shipping_marks         : shipping mark riêng cho đơn (grade/số HĐ khác)
--   sales_order_lc_negotiations.doc_checklist : số bản chứng từ (46A) riêng theo L/C của đơn
-- Trống → dùng bản mặc định ở hồ sơ chứng từ khách. Idempotent.
-- ============================================================================

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS shipping_marks text;

ALTER TABLE public.sales_order_lc_negotiations
  ADD COLUMN IF NOT EXISTS doc_checklist jsonb;

COMMENT ON COLUMN public.sales_orders.shipping_marks IS
  'Shipping mark riêng cho đơn (ghi đè hồ sơ khách). Trống → dùng shipping_marks của hồ sơ.';
COMMENT ON COLUMN public.sales_order_lc_negotiations.doc_checklist IS
  'Số bản chứng từ (46A) riêng theo L/C của đơn. Trống → dùng doc_checklist của hồ sơ khách.';
