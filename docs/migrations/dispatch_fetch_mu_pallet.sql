-- ============================================================================
-- LỆNH ĐIỀU ĐỘNG — loại chuyến "Đi lấy mủ (NM khác)" + khai pallet mang đi
-- Date: 2026-07-16  (Đợt 2 phương án cân pallet TL→PĐ)
-- ============================================================================
-- Mục đích:
--   Chuyến "đi lấy mủ TL→PĐ": xe rời PĐ (rỗng + pallet) → lên Tân Lâm lấy mủ →
--   về PĐ. Khai SỐ PALLET MANG ĐI ngay trên lệnh (trước khi cân) để app cân
--   pre-fill cân lần 1. Thêm loại chuyến 'fetch_mu'.
--
-- Idempotent / an toàn go-live: chỉ ADD cột + nới CHECK (dò động tên constraint).
-- ============================================================================

-- ── Cột pallet mang đi (khai trên lệnh) ─────────────────────────────────────
ALTER TABLE public.dispatch_orders
  ADD COLUMN IF NOT EXISTS pallet_plastic_out INT,
  ADD COLUMN IF NOT EXISTS pallet_steel_out   INT,
  ADD COLUMN IF NOT EXISTS pallet_kg_out      NUMERIC;

COMMENT ON COLUMN public.dispatch_orders.pallet_plastic_out IS 'Số pallet nhựa mang đi (chuyến đi lấy mủ). Pre-fill cân lần 1 tại PĐ.';
COMMENT ON COLUMN public.dispatch_orders.pallet_steel_out   IS 'Số pallet sắt mang đi (chuyến đi lấy mủ).';
COMMENT ON COLUMN public.dispatch_orders.pallet_kg_out      IS 'KL pallet mang đi (kg) = snapshot theo định mức pallet_types.';

-- ── Nới CHECK trip_type thêm 'fetch_mu' (dò động tên constraint) ─────────────
DO $$
DECLARE v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.dispatch_orders'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%trip_type%'
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.dispatch_orders DROP CONSTRAINT %I', v_conname);
    ALTER TABLE public.dispatch_orders
      ADD CONSTRAINT dispatch_orders_trip_type_check
      CHECK (trip_type IN ('port','lao','internal','other','trading','fetch_mu'));
    RAISE NOTICE 'Đã nới CHECK trip_type (%) → + fetch_mu', v_conname;
  ELSE
    RAISE NOTICE 'Không có CHECK trên trip_type — bỏ qua (text tự do).';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ── VERIFY ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='dispatch_orders' AND column_name='pallet_plastic_out')
  THEN RAISE EXCEPTION 'FAIL: pallet_plastic_out chưa thêm'; END IF;
  RAISE NOTICE '═══ dispatch_fetch_mu_pallet VERIFY PASS ═══';
END $$;

-- ROLLBACK:
-- ALTER TABLE public.dispatch_orders
--   DROP COLUMN IF EXISTS pallet_plastic_out, DROP COLUMN IF EXISTS pallet_steel_out, DROP COLUMN IF EXISTS pallet_kg_out;
-- (trip_type CHECK: drop + re-add without 'fetch_mu' nếu cần)
