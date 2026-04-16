-- ============================================================================
-- WEIGHBRIDGE ↔ SALES ORDER LINK — Migration
-- Ngày: 2026-04-16
-- Doc: docs/WEIGHBRIDGE_WORKFLOW.md
-- ============================================================================
-- Liên kết phiếu cân OUT với Sales Order + Container để track xuất khẩu
-- chính xác từ container tới batches.
-- ============================================================================

-- 1. weighbridge_tickets: link Sales Order + Container
ALTER TABLE weighbridge_tickets
  ADD COLUMN IF NOT EXISTS sales_order_id UUID REFERENCES sales_orders(id) ON DELETE SET NULL;

ALTER TABLE weighbridge_tickets
  ADD COLUMN IF NOT EXISTS container_id UUID REFERENCES sales_order_containers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_weighbridge_tickets_sales_order_id
  ON weighbridge_tickets(sales_order_id);

CREATE INDEX IF NOT EXISTS idx_weighbridge_tickets_container_id
  ON weighbridge_tickets(container_id);

COMMENT ON COLUMN weighbridge_tickets.sales_order_id IS
  'Link tới sales_orders cho phiếu cân OUT. Optional — cho phép xuất lẻ không SO.';

COMMENT ON COLUMN weighbridge_tickets.container_id IS
  'Link tới sales_order_containers — 1 phiếu cân = 1 container.';

-- 2. stock_out_orders: link Sales Order + Container (parallel với deal_id từ S2)
ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS sales_order_id UUID REFERENCES sales_orders(id) ON DELETE SET NULL;

ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS container_id UUID REFERENCES sales_order_containers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_out_orders_sales_order_id
  ON stock_out_orders(sales_order_id);

CREATE INDEX IF NOT EXISTS idx_stock_out_orders_container_id
  ON stock_out_orders(container_id);

COMMENT ON COLUMN stock_out_orders.sales_order_id IS
  'Link tới sales_orders cho phiếu xuất TP. Khi confirmed → trigger update SO status.';

COMMENT ON COLUMN stock_out_orders.container_id IS
  'Link tới sales_order_containers — phiếu xuất sinh ra cho container nào. Khi confirmed → update container.gross_weight_kg + status=sealed.';

-- 3. sales_orders: thêm column tracking shipped progress (tuỳ chọn — có thể compute dynamic)
-- Skip: có thể dùng query sum container.status='sealed' / total containers thay vì lưu cứng.

-- ============================================================================
-- ROLLBACK:
--   ALTER TABLE weighbridge_tickets DROP COLUMN IF EXISTS sales_order_id;
--   ALTER TABLE weighbridge_tickets DROP COLUMN IF EXISTS container_id;
--   ALTER TABLE stock_out_orders DROP COLUMN IF EXISTS sales_order_id;
--   ALTER TABLE stock_out_orders DROP COLUMN IF EXISTS container_id;
-- ============================================================================
