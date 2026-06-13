-- ============================================================================
-- ĐƠN HÀNG BÁN — CHIA LOT / ĐỢT GIAO cho container
-- Date: 2026-06-13
-- ============================================================================
-- Mục đích: 1 đơn xuất khẩu chia nhiều ĐỢT GIAO (lot). Trước đây lot chỉ nằm
-- trong ghi chú text → không theo dõi được. Thêm 2 cột vào sales_order_containers:
--   - lot_no      : số thứ tự lot (1, 2, 3…). Container cùng lot_no = 1 lot.
--   - lot_deadline: hạn giao của lot (ngày).
-- Trạng thái giao (đã/đang/chưa) KHÔNG cần cột mới — derive từ
-- dispatch_order_lines.actual_weight_kg (đã nối ở module Lệnh điều động Đợt 2).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ============================================================================

ALTER TABLE public.sales_order_containers
  ADD COLUMN IF NOT EXISTS lot_no       int,
  ADD COLUMN IF NOT EXISTS lot_deadline date;

COMMENT ON COLUMN public.sales_order_containers.lot_no       IS 'Số thứ tự lot/đợt giao (container cùng lot_no = 1 lot).';
COMMENT ON COLUMN public.sales_order_containers.lot_deadline IS 'Hạn giao của lot.';

CREATE INDEX IF NOT EXISTS idx_soc_lot ON public.sales_order_containers(sales_order_id, lot_no);

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sales_order_containers' AND column_name='lot_no'
  ) THEN RAISE EXCEPTION 'FAIL: lot_no chưa thêm'; END IF;
  RAISE NOTICE '═══ sales_order_container_lot VERIFY PASS ═══';
END $$;
