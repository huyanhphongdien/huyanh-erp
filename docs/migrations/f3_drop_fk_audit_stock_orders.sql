-- ============================================================================
-- F3 Hot-fix v3: Drop FK strict trên audit cols stock_out_orders + stock_in_orders
-- File: docs/migrations/f3_drop_fk_audit_stock_orders.sql
--
-- Vấn đề: transferService.confirmShipped/confirmReceived auto-tạo
-- stock_out_order + stock_in_order, pass operator.id (scale_operators.id)
-- vào created_by/confirmed_by → FK strict → employees(id) violate.
--
-- Pattern đúng cho audit columns: nullable UUID, không enforce FK.
-- Caller có thể là employee, scale_operator, system trigger, v.v.
-- Trace ai tạo qua nhiều cách: created_at + table source + notes.
--
-- Idempotent. Chạy 1 lần là đủ.
-- ============================================================================

BEGIN;

-- stock_out_orders
ALTER TABLE stock_out_orders
  DROP CONSTRAINT IF EXISTS stock_out_orders_created_by_fkey,
  DROP CONSTRAINT IF EXISTS stock_out_orders_confirmed_by_fkey;

-- stock_in_orders
ALTER TABLE stock_in_orders
  DROP CONSTRAINT IF EXISTS stock_in_orders_created_by_fkey,
  DROP CONSTRAINT IF EXISTS stock_in_orders_confirmed_by_fkey;

COMMENT ON COLUMN stock_out_orders.created_by IS
  'Audit metadata: UUID người tạo (employees.id hoặc scale_operators.id từ sub-app cân, hoặc NULL từ system trigger). Không enforce FK.';
COMMENT ON COLUMN stock_out_orders.confirmed_by IS
  'Audit metadata: UUID người xác nhận. Không enforce FK.';
COMMENT ON COLUMN stock_in_orders.created_by IS
  'Audit metadata: UUID người tạo. Không enforce FK.';
COMMENT ON COLUMN stock_in_orders.confirmed_by IS
  'Audit metadata: UUID người xác nhận. Không enforce FK.';

COMMIT;
