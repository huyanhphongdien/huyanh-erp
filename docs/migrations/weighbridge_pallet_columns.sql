-- ============================================================================
-- PHIẾU CÂN — cột PALLET mỗi lần cân (Đợt 1 phương án cân pallet TL→PĐ)
-- Date: 2026-07-15
-- ============================================================================
-- Mục đích:
--   Xe trung chuyển TL→PĐ chở pallet nhựa (10kg)/sắt (50kg), số lượng KHÔNG cố
--   định giữa 2 lần cân (dỡ bớt/để lại). Ghi số pallet Ở TỪNG LẦN CÂN để tính:
--     KL mủ = (gross − pallet_kg_gross) − (tare − pallet_kg_tare)
--
--   Cột đặt theo GROSS/TARE (không phải "lần 1/lần 2") để công thức đồng nhất
--   cho cả luồng NHẬP (L1=gross, L2=tare) lẫn XUẤT/CỔNG (L1=tare, L2=gross).
--   Lưu CẢ số lượng (đếm theo loại) LẪN kg snapshot (chốt theo định mức tại thời
--   điểm cân — không lệch nếu định mức pallet_types đổi về sau).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. An toàn go-live: chỉ ADD, không sửa data.
-- RLS weighbridge_tickets đã mở anon (sprint1_06) → cột mới tự kế thừa, không cần thêm.
-- ============================================================================

ALTER TABLE public.weighbridge_tickets
  ADD COLUMN IF NOT EXISTS pallet_plastic_gross INT,
  ADD COLUMN IF NOT EXISTS pallet_steel_gross   INT,
  ADD COLUMN IF NOT EXISTS pallet_kg_gross      NUMERIC,
  ADD COLUMN IF NOT EXISTS pallet_plastic_tare  INT,
  ADD COLUMN IF NOT EXISTS pallet_steel_tare    INT,
  ADD COLUMN IF NOT EXISTS pallet_kg_tare       NUMERIC;

COMMENT ON COLUMN public.weighbridge_tickets.pallet_plastic_gross IS 'Số pallet nhựa trên xe tại lần cân GROSS (xe+hàng).';
COMMENT ON COLUMN public.weighbridge_tickets.pallet_steel_gross   IS 'Số pallet sắt trên xe tại lần cân GROSS.';
COMMENT ON COLUMN public.weighbridge_tickets.pallet_kg_gross      IS 'KL pallet (kg) tại lần cân GROSS = snapshot theo định mức pallet_types.';
COMMENT ON COLUMN public.weighbridge_tickets.pallet_plastic_tare  IS 'Số pallet nhựa trên xe tại lần cân TARE (xe rỗng).';
COMMENT ON COLUMN public.weighbridge_tickets.pallet_steel_tare    IS 'Số pallet sắt trên xe tại lần cân TARE.';
COMMENT ON COLUMN public.weighbridge_tickets.pallet_kg_tare       IS 'KL pallet (kg) tại lần cân TARE = snapshot theo định mức. net_weight = (gross−pallet_kg_gross)−(tare−pallet_kg_tare).';

NOTIFY pgrst, 'reload schema';

-- ── VERIFY ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='weighbridge_tickets' AND column_name='pallet_kg_gross'
  ) THEN RAISE EXCEPTION 'FAIL: cột pallet_kg_gross chưa thêm'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='weighbridge_tickets' AND column_name='pallet_kg_tare'
  ) THEN RAISE EXCEPTION 'FAIL: cột pallet_kg_tare chưa thêm'; END IF;
  RAISE NOTICE '═══ weighbridge_pallet_columns VERIFY PASS ═══';
END $$;

-- ROLLBACK:
-- ALTER TABLE public.weighbridge_tickets
--   DROP COLUMN IF EXISTS pallet_plastic_gross, DROP COLUMN IF EXISTS pallet_steel_gross,
--   DROP COLUMN IF EXISTS pallet_kg_gross, DROP COLUMN IF EXISTS pallet_plastic_tare,
--   DROP COLUMN IF EXISTS pallet_steel_tare, DROP COLUMN IF EXISTS pallet_kg_tare;
