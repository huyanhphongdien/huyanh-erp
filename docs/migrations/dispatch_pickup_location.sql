-- ============================================================================
-- LỆNH ĐIỀU ĐỘNG — ĐIỂM BỐC HÀNG + loại chuyến 'trading' (hàng thương mại)
-- Date: 2026-07-12
-- ----------------------------------------------------------------------------
-- Bối cảnh: hàng thương mại = MUA của NHÀ MÁY KHÁC rồi bán cho khách → xe không
-- bốc ở kho Huy Anh mà chạy tới nhà máy đó lấy hàng. Tài xế cần biết BỐC Ở ĐÂU
-- và gọi cho AI. Bảng dispatch_orders hiện chỉ có `destination` (điểm GIAO).
--
-- ⚠ dispatch_module_v1.sql tạo CHECK INLINE cho trip_type (tên auto-generated).
--   KHÔNG drop + tạo lại thì INSERT 'trading' sẽ lỗi 23514.
--
-- IDEMPOTENT: chạy lại nhiều lần an toàn. KHÔNG UPDATE/DELETE dữ liệu đang có.
-- ⚠ CHẠY FILE NÀY TRƯỚC KHI DEPLOY CODE (push main = Vercel auto-deploy).
-- ============================================================================

-- ── STEP 1: 2 cột mới (nullable — lệnh cũ giữ nguyên; NULL = bốc tại kho nhà) ──
ALTER TABLE public.dispatch_orders
  ADD COLUMN IF NOT EXISTS pickup_location text,
  ADD COLUMN IF NOT EXISTS pickup_contact  text;

COMMENT ON COLUMN public.dispatch_orders.pickup_location IS
  'Điểm BỐC hàng — nơi xe đến LẤY hàng (nhà máy bán hàng cho HAPĐ, kho ngoài...). NULL = bốc tại kho Huy Anh. Khác với destination = điểm GIAO.';
COMMENT ON COLUMN public.dispatch_orders.pickup_contact IS
  'Người liên hệ + SĐT tại điểm bốc hàng (để tài xế gọi trước khi tới).';

-- ── STEP 2: CHECK trip_type — drop ĐỘNG mọi CHECK nhắc tới trip_type rồi tạo lại
--    với tên CỐ ĐỊNH + thêm 'trading'. (Drop động vì tên cũ là auto-generated.)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class      rel ON rel.oid = con.conrelid
    JOIN pg_namespace  ns  ON ns.oid  = rel.relnamespace
    WHERE ns.nspname  = 'public'
      AND rel.relname = 'dispatch_orders'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%trip_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.dispatch_orders DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Đã drop CHECK cũ: %', r.conname;
  END LOOP;

  ALTER TABLE public.dispatch_orders
    ADD CONSTRAINT chk_dispatch_orders_trip_type
    CHECK (trip_type IN ('port', 'lao', 'internal', 'other', 'trading'));

  RAISE NOTICE 'Đã tạo chk_dispatch_orders_trip_type (thêm trading)';
END $$;

NOTIFY pgrst, 'reload schema';

-- ── VERIFY — chạy xong PHẢI thấy 2 dòng NOTICE "PASS" ──
DO $$
DECLARE v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dispatch_orders'
      AND column_name IN ('pickup_location', 'pickup_contact')
    GROUP BY table_name HAVING COUNT(*) = 2
  ) THEN
    RAISE EXCEPTION 'FAIL: thiếu pickup_location / pickup_contact';
  END IF;
  RAISE NOTICE 'PASS: pickup_location + pickup_contact OK';

  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint WHERE conname = 'chk_dispatch_orders_trip_type';

  IF v_def IS NULL OR v_def NOT ILIKE '%trading%' THEN
    RAISE EXCEPTION 'FAIL: CHECK trip_type chưa nhận trading — def = %', COALESCE(v_def, '(null)');
  END IF;
  RAISE NOTICE 'PASS: CHECK trip_type nhận trading — %', v_def;
END $$;

-- ============================================================================
-- ROLLBACK (chạy tay nếu cần gỡ):
--   UPDATE public.dispatch_orders SET trip_type='other' WHERE trip_type='trading';
--   ALTER TABLE public.dispatch_orders DROP CONSTRAINT IF EXISTS chk_dispatch_orders_trip_type;
--   ALTER TABLE public.dispatch_orders ADD CONSTRAINT chk_dispatch_orders_trip_type
--     CHECK (trip_type IN ('port','lao','internal','other'));
--   ALTER TABLE public.dispatch_orders DROP COLUMN IF EXISTS pickup_location;
--   ALTER TABLE public.dispatch_orders DROP COLUMN IF EXISTS pickup_contact;
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================
