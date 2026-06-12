-- ============================================================================
-- LỆNH ĐIỀU ĐỘNG + ĐỘI XE (Dispatch + Fleet) — ĐỢT 1
-- Date: 2026-06-12
-- ============================================================================
--
-- Mục đích:
--   Số hoá "Lệnh điều động xe" + "Biên bản bàn giao vận chuyển xuất hàng" và
--   danh mục đội xe (đầu kéo / rơ-moóc / xe khác) + tài xế. Nối 3 module:
--     Đơn hàng bán (kế hoạch container) → Lệnh điều động → Trạm cân (KL thực tế).
--
-- Đặc thù đội xe (từ Excel "THEO DÕI THÔNG TIN ĐỘI XE HAPĐ 2026"):
--   - Đầu kéo (75H-xxx) gắn 1 TÀI XẾ CỐ ĐỊNH.
--   - Rơ-moóc (75RM-xxx) ĐỔI LIÊN TỤC, không gắn cố định → mỗi lệnh chọn 1
--     đầu kéo(+tài xế) + 1 moóc riêng.
--   - 1 xe chở NHIỀU container → 1 lệnh có nhiều dòng (1 dòng = 1 container).
--
-- Tích hợp:
--   - dispatch_orders.sales_order_id (nullable) → đổ container từ SO sang lệnh.
--   - dispatch_orders.weighbridge_ticket_id + lines.actual_* (nullable) → ĐỢT 2
--     đồng bộ ngược từ phiếu cân XUẤT (reference_type='dispatch_order').
--
-- Idempotent: chạy lại nhiều lần an toàn (IF NOT EXISTS / DROP ... IF EXISTS).
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 1: fleet_drivers (danh mục tài xế)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fleet_drivers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text,                                  -- mã nội bộ (tuỳ chọn)
  full_name      text NOT NULL,
  phone          text,
  id_no          text,                                  -- CCCD/CMND
  license_no     text,                                  -- số GPLX
  license_class  text,                                  -- hạng GPLX (FC, C...)
  dob            date,
  address        text,
  note           text,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.fleet_drivers IS 'Danh mục tài xế — tái dùng khi lập Lệnh điều động.';

CREATE INDEX IF NOT EXISTS idx_fleet_drivers_active ON public.fleet_drivers(active);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 2: fleet_vehicles (danh mục phương tiện — đầu kéo/rơ-moóc/xe khác)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fleet_vehicles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate              text NOT NULL UNIQUE,              -- biển số (75H-02821 / 75RM-004.92)
  kind               text NOT NULL DEFAULT 'tractor'
                       CHECK (kind IN ('tractor','trailer','other')),  -- đầu kéo / rơ-moóc / xe khác
  internal_code      text,                              -- mã quản lý nội bộ (75H00604)
  brand              text,                              -- nhãn hiệu (CNHTC, DOOSUNG...)
  year_made          int,
  capacity_kg        numeric(12,2),                     -- trọng tải (kg) — moóc ~32600
  capacity_note      text,                              -- "2 ghế" / "16 ghế" (không phải kg)
  chassis_no         text,                              -- số khung
  engine_no          text,                              -- số máy
  color              text,
  default_driver_id  uuid REFERENCES public.fleet_drivers(id) ON DELETE SET NULL,  -- tài xế gắn (đầu kéo)
  inspection_expiry  date,                              -- hạn đăng kiểm
  transit_expiry     date,                              -- hạn transit (nếu là ngày)
  transit_note       text,                              -- "chưa" / "Chạy cảng" / "không"
  badge_expiry       date,                              -- hạn phù hiệu
  cavet_expiry       date,                              -- hạn xác nhận cavet NH (Vietinbank)
  border_gate        text,                              -- cửa khẩu (VN-LAO / CẢNG)
  purpose            text,                              -- hình thức hoạt động
  note               text,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.fleet_vehicles IS 'Danh mục phương tiện. kind: tractor=đầu kéo (gắn tài xế), trailer=rơ-moóc (đổi liên tục), other=xe khác.';
COMMENT ON COLUMN public.fleet_vehicles.default_driver_id IS 'Tài xế cố định của đầu kéo. Rơ-moóc/xe khác để NULL.';

CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_kind   ON public.fleet_vehicles(kind);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_active ON public.fleet_vehicles(active);

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 3: dispatch_orders (lệnh điều động — header)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dispatch_orders (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 text NOT NULL UNIQUE,            -- LDD-YYMM-001
  dispatch_date        date NOT NULL DEFAULT CURRENT_DATE,
  trip_type            text NOT NULL DEFAULT 'port'
                         CHECK (trip_type IN ('port','lao','internal','other')),  -- đi cảng / Lào / nội bộ / khác
  reason               text,                            -- lý do điều động
  -- Phương tiện + tài xế (FK danh mục)
  tractor_vehicle_id   uuid REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL,
  trailer_vehicle_id   uuid REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL,
  driver_id            uuid REFERENCES public.fleet_drivers(id)  ON DELETE SET NULL,
  -- Snapshot cho chứng từ (giữ nguyên dù danh mục đổi sau)
  tractor_plate        text,
  trailer_plate        text,
  driver_name          text,
  driver_phone         text,
  driver_license_no    text,
  driver_id_no         text,
  driver_dob           date,
  driver_address       text,
  -- Thông tin chuyến
  contract_ref         text,                            -- căn cứ HĐ / số booking
  customer_name        text,
  destination          text,                            -- cảng / điểm giao
  recipient_name       text,                            -- người nhận
  recipient_phone      text,
  -- 🔗 Liên kết module
  sales_order_id        uuid REFERENCES public.sales_orders(id)        ON DELETE SET NULL,
  weighbridge_ticket_id uuid REFERENCES public.weighbridge_tickets(id) ON DELETE SET NULL,  -- ĐỢT 2
  -- Trạng thái + tổng
  status               text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','dispatched','in_transit','completed','cancelled')),
  total_lines          int NOT NULL DEFAULT 0,
  total_weight         numeric(14,2) NOT NULL DEFAULT 0,  -- tổng KL kế hoạch (kg)
  note                 text,
  created_by           uuid,
  dispatched_at        timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.dispatch_orders IS 'Lệnh điều động xe. Mã sinh ở app: LDD-{YYMM}-{seq}. snapshot tài xế/xe để in chứng từ.';

CREATE INDEX IF NOT EXISTS idx_dispatch_orders_date    ON public.dispatch_orders(dispatch_date DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_status  ON public.dispatch_orders(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_so      ON public.dispatch_orders(sales_order_id) WHERE sales_order_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 4: dispatch_order_lines (dòng — 1 dòng = 1 container)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dispatch_order_lines (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_order_id        uuid NOT NULL REFERENCES public.dispatch_orders(id) ON DELETE CASCADE,
  route                    text,                        -- hành trình
  lot_code                 text,                        -- lô hàng
  grade                    text,                        -- loại/cấp hàng (SVR_10...)
  container_no             text,
  seal_no                  text,                        -- seal kế hoạch
  package_count            int,                         -- số kiện/bành
  weight_kg                numeric(14,2) NOT NULL DEFAULT 0,  -- KL kế hoạch
  -- 🔗 Liên kết container của SO
  sales_order_container_id uuid REFERENCES public.sales_order_containers(id) ON DELETE SET NULL,
  -- ĐỢT 2 — từ phiếu cân XUẤT
  actual_weight_kg         numeric(14,2),
  actual_seal_no           text,
  note                     text,
  sort_order               int NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.dispatch_order_lines IS 'Dòng lệnh điều động. 1 dòng = 1 container (seal riêng). actual_* điền ở ĐỢT 2 từ cân.';

CREATE INDEX IF NOT EXISTS idx_dol_order     ON public.dispatch_order_lines(dispatch_order_id);
CREATE INDEX IF NOT EXISTS idx_dol_so_cont   ON public.dispatch_order_lines(sales_order_container_id) WHERE sales_order_container_id IS NOT NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 5: Trigger updated_at + recompute totals
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.dispatch_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fleet_drivers_updated_at ON public.fleet_drivers;
CREATE TRIGGER trg_fleet_drivers_updated_at
  BEFORE UPDATE ON public.fleet_drivers
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_set_updated_at();

DROP TRIGGER IF EXISTS trg_fleet_vehicles_updated_at ON public.fleet_vehicles;
CREATE TRIGGER trg_fleet_vehicles_updated_at
  BEFORE UPDATE ON public.fleet_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_set_updated_at();

DROP TRIGGER IF EXISTS trg_dispatch_orders_updated_at ON public.dispatch_orders;
CREATE TRIGGER trg_dispatch_orders_updated_at
  BEFORE UPDATE ON public.dispatch_orders
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_set_updated_at();

DROP TRIGGER IF EXISTS trg_dol_updated_at ON public.dispatch_order_lines;
CREATE TRIGGER trg_dol_updated_at
  BEFORE UPDATE ON public.dispatch_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_set_updated_at();

-- Recompute tổng dòng + tổng KL trên dispatch_orders khi lines thay đổi
CREATE OR REPLACE FUNCTION public.dispatch_recalc_totals()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_order_id uuid := COALESCE(NEW.dispatch_order_id, OLD.dispatch_order_id);
BEGIN
  IF v_order_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.dispatch_orders d SET
    total_lines  = COALESCE((SELECT COUNT(*)        FROM public.dispatch_order_lines WHERE dispatch_order_id = v_order_id), 0),
    total_weight = COALESCE((SELECT SUM(weight_kg)  FROM public.dispatch_order_lines WHERE dispatch_order_id = v_order_id), 0)
  WHERE d.id = v_order_id;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_dol_recompute ON public.dispatch_order_lines;
CREATE TRIGGER trg_dol_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.dispatch_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_recalc_totals();

-- ════════════════════════════════════════════════════════════════════════════
-- STEP 6: RLS (dev-mode trước go-live — authenticated full; thắt lại sau)
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.fleet_drivers        ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.fleet_vehicles       ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.dispatch_orders      ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.dispatch_order_lines ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS fleet_drivers_auth_all        ON public.fleet_drivers';
  EXECUTE 'DROP POLICY IF EXISTS fleet_vehicles_auth_all       ON public.fleet_vehicles';
  EXECUTE 'DROP POLICY IF EXISTS dispatch_orders_auth_all      ON public.dispatch_orders';
  EXECUTE 'DROP POLICY IF EXISTS dispatch_order_lines_auth_all ON public.dispatch_order_lines';

  EXECUTE 'CREATE POLICY fleet_drivers_auth_all        ON public.fleet_drivers        FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY fleet_vehicles_auth_all       ON public.fleet_vehicles       FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY dispatch_orders_auth_all      ON public.dispatch_orders      FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY dispatch_order_lines_auth_all ON public.dispatch_order_lines FOR ALL TO authenticated USING (true) WITH CHECK (true)';

  RAISE NOTICE 'STEP 6: RLS enabled + authenticated full-access policies created';
END $$;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fleet_drivers')        THEN RAISE EXCEPTION 'FAIL: fleet_drivers chưa tạo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='fleet_vehicles')       THEN RAISE EXCEPTION 'FAIL: fleet_vehicles chưa tạo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='dispatch_orders')      THEN RAISE EXCEPTION 'FAIL: dispatch_orders chưa tạo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='dispatch_order_lines') THEN RAISE EXCEPTION 'FAIL: dispatch_order_lines chưa tạo'; END IF;
  RAISE NOTICE '═══ dispatch_module_v1 VERIFY PASS ═══';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (chạy tay nếu cần gỡ):
-- ════════════════════════════════════════════════════════════════════════════
-- DROP TABLE IF EXISTS public.dispatch_order_lines CASCADE;
-- DROP TABLE IF EXISTS public.dispatch_orders CASCADE;
-- DROP TABLE IF EXISTS public.fleet_vehicles CASCADE;
-- DROP TABLE IF EXISTS public.fleet_drivers CASCADE;
-- DROP FUNCTION IF EXISTS public.dispatch_recalc_totals();
-- DROP FUNCTION IF EXISTS public.dispatch_set_updated_at();
