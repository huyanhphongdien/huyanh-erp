-- ============================================================================
-- BACKFILL: stock_in_order NK-TP-20260419-001 thiếu batch + detail
-- Ngày: 2026-04-19
--
-- Nguyên nhân: createFromWeighbridgeTicket dùng .single() query material
-- type='raw'. DB không có material type='raw' → throws → stock_in_order
-- đã tạo ở step 3 nhưng batch (step 5) + detail (step 6) fail silent →
-- tab QC không thấy batch nào.
--
-- Fix code: .maybeSingle() + auto-tạo material (commit eae1ec28+).
-- SQL này: backfill record cụ thể cho Deal DL2604-7B5P.
-- ============================================================================

-- BƯỚC 1 — Tạo material 'raw' nếu chưa có
INSERT INTO materials (code, name, type, unit)
SELECT 'MU-CSRAW', 'Mủ cao su thô (tự tạo)', 'raw', 'kg'
WHERE NOT EXISTS (SELECT 1 FROM materials WHERE type = 'raw');

-- BƯỚC 2 — Tạo batch cho stock_in_order NK-TP-20260419-001
WITH si AS (
  SELECT
    o.id AS stock_in_id,
    o.warehouse_id,
    o.total_weight,
    o.deal_id,
    t.id AS ticket_id,
    t.code AS ticket_code,
    t.vehicle_plate,
    t.driver_name,
    d.lot_code,
    d.rubber_type,
    p.name AS partner_name
  FROM stock_in_orders o
  LEFT JOIN weighbridge_tickets t ON t.deal_id = o.deal_id AND t.status = 'completed'
  LEFT JOIN b2b.deals d ON d.id = o.deal_id
  LEFT JOIN b2b.partners p ON p.id = d.partner_id
  WHERE o.code = 'NK-TP-20260419-001'
  LIMIT 1
),
mat AS (
  SELECT id FROM materials WHERE type = 'raw' LIMIT 1
),
batch_insert AS (
  INSERT INTO stock_batches (
    batch_no, material_id, warehouse_id,
    initial_quantity, quantity_remaining,
    initial_weight, current_weight,
    qc_status, status,
    rubber_type, supplier_name,
    source_lot_code, received_date
  )
  SELECT
    'NVL-' || REPLACE(si.ticket_code, 'CX-', ''),
    mat.id,
    si.warehouse_id,
    1, 1,
    si.total_weight, si.total_weight,
    'pending'::text, 'active'::text,
    si.rubber_type, si.partner_name,
    si.lot_code,
    CURRENT_DATE
  FROM si, mat
  ON CONFLICT (batch_no) DO UPDATE SET
    source_lot_code = EXCLUDED.source_lot_code,
    rubber_type = EXCLUDED.rubber_type,
    supplier_name = EXCLUDED.supplier_name
  RETURNING id, batch_no
)
-- BƯỚC 3 — Tạo stock_in_detail link stock_in ↔ batch (không có drc_value)
INSERT INTO stock_in_details (stock_in_id, material_id, batch_id, quantity, weight, unit)
SELECT si.stock_in_id, mat.id, b.id, 1, si.total_weight, 'kg'
FROM si, mat, batch_insert b
WHERE NOT EXISTS (
  SELECT 1 FROM stock_in_details
  WHERE stock_in_id = si.stock_in_id AND batch_id = b.id
);

-- BƯỚC 4 — Verify
SELECT
  o.code AS stock_in,
  d.batch_id,
  b.batch_no,
  b.source_lot_code,
  b.qc_status,
  b.current_weight
FROM stock_in_orders o
LEFT JOIN stock_in_details d ON d.stock_in_id = o.id
LEFT JOIN stock_batches b ON b.id = d.batch_id
WHERE o.code = 'NK-TP-20260419-001';
