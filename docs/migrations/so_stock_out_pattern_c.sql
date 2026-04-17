-- ============================================================================
-- Pattern C: 1 phiếu xuất / SO — thêm container_id cho stock_out_details
-- File: docs/migrations/so_stock_out_pattern_c.sql
--
-- Trước: 1 phiếu xuất per container (N:N)
-- Sau:   1 phiếu xuất per SO, mỗi detail gắn container_id cụ thể
--
-- Idempotent.
-- ============================================================================

ALTER TABLE stock_out_details
  ADD COLUMN IF NOT EXISTS container_id UUID REFERENCES sales_order_containers(id);

CREATE INDEX IF NOT EXISTS idx_sod_container ON stock_out_details(container_id)
  WHERE container_id IS NOT NULL;

COMMENT ON COLUMN stock_out_details.container_id IS
  'Pattern C: container nào thuộc detail này. 1 phiếu xuất / SO → mỗi detail = 1 container.';
