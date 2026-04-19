-- ============================================================================
-- BACKFILL: initial_drc + supplier_reported_drc cho batch từ Deal expected_drc
-- Ngày: 2026-04-19
--
-- Batch NVL-20260419-002 (và các batch stock-in auto từ deal) initial_drc
-- = null → tab QC hiển thị "DRC ban đầu: —". User muốn hiển thị DRC kỳ
-- vọng từ Deal (50%).
--
-- Fix: update initial_drc cho batches có source_lot_code khớp với Deal
-- lot_code.
-- ============================================================================

UPDATE stock_batches b
SET
  initial_drc = d.expected_drc,
  supplier_reported_drc = d.expected_drc
FROM b2b.deals d
WHERE b.source_lot_code = d.lot_code
  AND b.initial_drc IS NULL
  AND d.expected_drc IS NOT NULL;

-- Verify
SELECT
  b.batch_no,
  b.source_lot_code,
  b.initial_drc,
  b.latest_drc,
  b.supplier_reported_drc,
  d.deal_number,
  d.expected_drc AS deal_expected_drc
FROM stock_batches b
LEFT JOIN b2b.deals d ON d.lot_code = b.source_lot_code
WHERE b.source_lot_code IS NOT NULL
ORDER BY b.received_date DESC NULLS LAST
LIMIT 20;
