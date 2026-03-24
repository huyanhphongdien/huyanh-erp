-- ============================================================================
-- COST TRACKING — Theo dõi giá vốn
-- File: docs/migrations/cost_tracking.sql
-- Phase: P8 — Cost Tracking
-- Ngày: 24/03/2026
-- ============================================================================

-- Giá vốn trên mỗi lô hàng
ALTER TABLE stock_batches ADD COLUMN IF NOT EXISTS cost_per_kg NUMERIC(15,4);
ALTER TABLE stock_batches ADD COLUMN IF NOT EXISTS total_cost NUMERIC(15,2);

-- Chi phí sản xuất trên lệnh sản xuất
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS total_input_cost NUMERIC(15,2);
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS total_output_cost NUMERIC(15,2);
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS cost_per_kg_output NUMERIC(15,4);
