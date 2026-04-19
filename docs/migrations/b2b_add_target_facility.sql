-- ============================================================================
-- FEATURE: target_facility_id cho Booking + Deal
-- Ngày: 2026-04-19
-- Mục đích: Đại lý chọn nhà máy đích (PD/TL/LAO) khi tạo phiếu chốt.
--           Deal kế thừa từ booking. Weighbridge filter deals theo facility
--           → operator trạm cân PD chỉ thấy deal đi PD, không nhầm.
-- ============================================================================

-- ============================================
-- BƯỚC 1 — ADD COLUMN (nullable, backward compatible)
-- Deal/Booking cũ (trước migration này) sẽ có target_facility_id = NULL
-- → weighbridge filter dùng "facility = current OR target IS NULL"
-- ============================================

ALTER TABLE b2b.rubber_bookings
  ADD COLUMN IF NOT EXISTS target_facility_id UUID REFERENCES public.facilities(id);

ALTER TABLE b2b.deals
  ADD COLUMN IF NOT EXISTS target_facility_id UUID REFERENCES public.facilities(id);

-- ============================================
-- BƯỚC 2 — Index cho weighbridge filter performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_b2b_deals_target_facility
  ON b2b.deals(target_facility_id)
  WHERE target_facility_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_b2b_bookings_target_facility
  ON b2b.rubber_bookings(target_facility_id)
  WHERE target_facility_id IS NOT NULL;

-- ============================================
-- BƯỚC 3 — Comment đánh dấu ý nghĩa cột
-- ============================================

COMMENT ON COLUMN b2b.rubber_bookings.target_facility_id IS
  'Nhà máy đích nhận hàng. Đại lý chọn khi tạo phiếu chốt. Weighbridge filter theo cột này.';

COMMENT ON COLUMN b2b.deals.target_facility_id IS
  'Nhà máy đích — kế thừa từ rubber_bookings.target_facility_id lúc xác nhận Deal. Admin có thể override nếu logistics đổi.';

-- ============================================
-- BƯỚC 4 — Verify
-- ============================================

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'b2b'
  AND table_name IN ('rubber_bookings', 'deals')
  AND column_name = 'target_facility_id';

-- ============================================
-- HOÀN TẤT
-- Sau khi chạy xong:
--   - Portal cập nhật: booking modal có dropdown PD/TL/LAO
--   - ERP cập nhật: DealCard hiện "Giao tại: PD", ConfirmDealModal inherit
--   - Weighbridge: dropdown "Theo Deal" chỉ hiện deal đi facility hiện tại
-- ============================================

-- ============================================
-- ROLLBACK nếu cần
-- ============================================
-- DROP INDEX IF EXISTS idx_b2b_deals_target_facility;
-- DROP INDEX IF EXISTS idx_b2b_bookings_target_facility;
-- ALTER TABLE b2b.deals DROP COLUMN IF EXISTS target_facility_id;
-- ALTER TABLE b2b.rubber_bookings DROP COLUMN IF EXISTS target_facility_id;
