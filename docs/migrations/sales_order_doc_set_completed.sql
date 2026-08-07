-- ============================================================================
-- Bộ chứng từ hoàn thiện theo đơn — đánh dấu "đã làm xong bộ chứng từ"
-- để tổng hợp LỊCH SỬ bộ chứng từ ở cấp KHÁCH HÀNG.
-- Idempotent — an toàn chạy lại.
-- ============================================================================

ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS doc_set_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS doc_set_completed_by text;

COMMENT ON COLUMN public.sales_orders.doc_set_completed_at IS
  'Thời điểm đánh dấu bộ chứng từ xuất khẩu của đơn ĐÃ hoàn thiện (đủ sinh + đính kèm).';
COMMENT ON COLUMN public.sales_orders.doc_set_completed_by IS
  'Tên người đánh dấu bộ chứng từ hoàn thiện.';
