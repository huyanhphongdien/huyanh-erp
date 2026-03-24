-- ============================================================================
-- WMS INDEXES — Tối ưu hiệu năng truy vấn
-- File: docs/migrations/wms_indexes.sql
-- Phase: P7 — Fix bugs & issues
-- Ngày: 24/03/2026
-- ============================================================================

-- Index cho picking queries: lọc batches theo status + warehouse
CREATE INDEX IF NOT EXISTS idx_batches_status_wh ON stock_batches(status, warehouse_id);

-- Index cho báo cáo tồn kho theo vật liệu + trạng thái
CREATE INDEX IF NOT EXISTS idx_batches_material ON stock_batches(material_id, status);

-- Index cho tra cứu kết quả QC theo lô
CREATE INDEX IF NOT EXISTS idx_qc_results_batch ON batch_qc_results(batch_id);

-- Index cho tra cứu giao dịch theo phiếu tham chiếu
CREATE INDEX IF NOT EXISTS idx_inv_transactions_ref ON inventory_transactions(reference_id);
