-- ============================================================================
-- Revert SO-2026-0021 từ 'delivered' về 'raw_material'
-- Date: 2026-05-05
-- ============================================================================
--
-- VẤN ĐỀ:
--   User báo SO-2026-0021 (ELASTOMERIC ENGINEERING) hiện thị 'Đã giao khách'
--   nhưng thực tế đơn mới đến giai đoạn nguyên liệu (raw_material).
--
-- LÝ DO:
--   Backfill 2026-05-04 (sales_backfill_old_orders.sql) có rule:
--     confirmed + ETD đã qua >30d → 'delivered' (giả định khách nhận)
--   SO-2026-0021 có ETD quá xa nên bị auto-promote sang 'delivered' sai.
--
-- FIX:
--   1. Show trạng thái hiện tại
--   2. UPDATE current_stage='raw_material', status='confirmed'
--      (trigger sync_sales_workflow sẽ auto-assign owner = tannv@ + log handoff)
--   3. Verify
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 0: Show trạng thái hiện tại
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  so.code, so.contract_no, so.status, so.current_stage,
  e.full_name AS current_owner,
  so.etd, so.delivery_date,
  so.stage_started_at, so.stage_sla_hours
FROM sales_orders so
LEFT JOIN employees e ON e.id = so.current_owner_id
WHERE so.code = 'SO-2026-0021';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: Revert về raw_material + confirmed
-- ════════════════════════════════════════════════════════════════════════════
-- Trigger sync_sales_workflow sẽ tự động:
--   - Auto-assign owner = Nguyễn Nhật Tân (tannv@)
--   - Log handoff (delivered → raw_material) vào sales_order_handoffs
--   - Reset stage_started_at = NOW()
--   - Set stage_sla_hours = 96 (theo capacity table cho raw_material)
--
-- Status 'delivered' KHÔNG tự động xuống vì trigger chỉ bump FORWARD.
-- Phải manually set status='confirmed' trong cùng UPDATE.
UPDATE sales_orders
SET
  current_stage = 'raw_material',
  status = 'confirmed',
  updated_at = NOW()
WHERE code = 'SO-2026-0021';

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: Verify
-- ════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

SELECT
  so.code, so.contract_no, so.status, so.current_stage,
  e.full_name AS new_owner,
  so.stage_started_at, so.stage_sla_hours
FROM sales_orders so
LEFT JOIN employees e ON e.id = so.current_owner_id
WHERE so.code = 'SO-2026-0021';
-- Mong đợi: current_stage='raw_material', status='confirmed',
--           new_owner='Nguyễn Nhật Tân', stage_sla_hours=96

-- Check handoff log đã ghi chưa
SELECT
  from_dept, to_dept, passed_at, dwell_time_hours
FROM sales_order_handoffs
WHERE sales_order_id = (SELECT id FROM sales_orders WHERE code = 'SO-2026-0021')
ORDER BY passed_at DESC
LIMIT 3;
-- Mong đợi: 1 row mới với from_dept='delivered' to_dept='raw_material'

-- ════════════════════════════════════════════════════════════════════════════
-- BONUS: Check các đơn KHÁC có thể bị sai tương tự
-- (current_stage='delivered' nhưng có dấu hiệu chưa giao thật)
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  code, contract_no, status, current_stage,
  etd, delivery_date,
  CASE
    WHEN bl_received THEN 'BL nhận → có khả năng đã giao thật'
    WHEN shipped_at IS NOT NULL THEN 'Có shipped_at → đã giao'
    ELSE '⚠ Không có dấu hiệu giao — KIỂM TRA'
  END AS trust_signal
FROM sales_orders
WHERE current_stage = 'delivered'
  AND status <> 'cancelled'
ORDER BY code;
-- Bảng này giúp BGĐ check thêm đơn nào bị backfill sai → fix tương tự

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════════
-- UPDATE sales_orders
-- SET current_stage = 'delivered', status = 'delivered'
-- WHERE code = 'SO-2026-0021';
