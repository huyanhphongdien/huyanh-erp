-- ============================================================================
-- FEATURE: Thêm driver_phone cho weighbridge_tickets
-- Ngày: 2026-04-19
-- Lý do: Operator trạm cân cần lưu SĐT tài xế để liên hệ nếu cần
--        (đổi trạm, báo hàng về, vv). Đại lý cũng nhập field này khi báo
--        đã giao (portal Record Delivery Modal).
-- ============================================================================

ALTER TABLE weighbridge_tickets
  ADD COLUMN IF NOT EXISTS driver_phone TEXT;

COMMENT ON COLUMN weighbridge_tickets.driver_phone IS
  'SĐT tài xế chở hàng. Nullable — operator điền nếu có.';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'weighbridge_tickets' AND column_name = 'driver_phone';

-- Rollback
-- ALTER TABLE weighbridge_tickets DROP COLUMN IF EXISTS driver_phone;
