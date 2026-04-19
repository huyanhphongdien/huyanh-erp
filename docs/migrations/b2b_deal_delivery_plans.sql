-- ============================================================================
-- FEATURE: Thông tin giao hàng — Deal Delivery Plans
-- Ngày: 2026-04-19
--
-- Mục đích: Nhà máy khai báo TRƯỚC các xe dự kiến chở hàng cho 1 Deal
-- (khi đại lý gọi điện báo "tôi chở 3 xe từ ngày X"). Khi xe đến cân,
-- weighbridge match theo biển số → auto-fill actual_kg → tính chênh lệch
-- giữa KL khai báo vs KL thực cân.
-- ============================================================================

CREATE TABLE IF NOT EXISTS b2b.deal_delivery_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES b2b.deals(id) ON DELETE CASCADE,

  -- Thông tin xe + tài xế
  vehicle_plate TEXT NOT NULL,
  driver_name   TEXT,
  driver_phone  TEXT,

  -- Khai báo
  declared_kg   NUMERIC(12, 2) NOT NULL,
  declared_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  declared_by   UUID REFERENCES public.employees(id),
  notes         TEXT,

  -- Match với phiếu cân (sau khi xe đến trạm)
  weigh_ticket_id UUID REFERENCES public.weighbridge_tickets(id),
  actual_kg     NUMERIC(12, 2),
  weighed_at    TIMESTAMPTZ,
  -- variance_kg generated: auto compute khi update actual_kg
  variance_kg   NUMERIC(12, 2) GENERATED ALWAYS AS (
    COALESCE(actual_kg, 0) - declared_kg
  ) STORED,

  -- Status
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'weighed', 'cancelled', 'no_show')),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE b2b.deal_delivery_plans IS
  'Kế hoạch giao hàng theo xe cho Deal. Nhà máy khai báo trước, weighbridge match khi xe đến.';

COMMENT ON COLUMN b2b.deal_delivery_plans.variance_kg IS
  'Chênh lệch = actual_kg - declared_kg. Âm = hao hụt, dương = vượt khai báo.';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deal_delivery_plans_deal
  ON b2b.deal_delivery_plans (deal_id, declared_at DESC);

CREATE INDEX IF NOT EXISTS idx_deal_delivery_plans_plate
  ON b2b.deal_delivery_plans (UPPER(vehicle_plate), status);

-- ============================================
-- RLS — factory only
-- ============================================

ALTER TABLE b2b.deal_delivery_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_plans_factory_all ON b2b.deal_delivery_plans;
CREATE POLICY delivery_plans_factory_all ON b2b.deal_delivery_plans
  FOR ALL TO authenticated
  USING (public.current_partner_id() IS NULL)
  WITH CHECK (public.current_partner_id() IS NULL);

-- Anon role (weighbridge) cần SELECT + UPDATE để match khi cân
DROP POLICY IF EXISTS delivery_plans_weighbridge_select ON b2b.deal_delivery_plans;
CREATE POLICY delivery_plans_weighbridge_select ON b2b.deal_delivery_plans
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS delivery_plans_weighbridge_update ON b2b.deal_delivery_plans;
CREATE POLICY delivery_plans_weighbridge_update ON b2b.deal_delivery_plans
  FOR UPDATE TO anon USING (true)
  WITH CHECK (status IN ('weighed', 'pending'));

-- Partner có thể SELECT plans của deal mình (optional — xem lịch sử xe)
DROP POLICY IF EXISTS delivery_plans_partner_select ON b2b.deal_delivery_plans;
CREATE POLICY delivery_plans_partner_select ON b2b.deal_delivery_plans
  FOR SELECT TO authenticated
  USING (
    public.current_partner_id() IS NULL
    OR deal_id IN (SELECT id FROM b2b.deals WHERE partner_id = public.current_partner_id())
  );

-- ============================================
-- Public view (để supabase-js access)
-- ============================================

DROP VIEW IF EXISTS public.b2b_deal_delivery_plans CASCADE;
CREATE VIEW public.b2b_deal_delivery_plans
WITH (security_invoker = true)
AS SELECT * FROM b2b.deal_delivery_plans;

GRANT SELECT ON public.b2b_deal_delivery_plans TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.b2b_deal_delivery_plans TO authenticated;
GRANT UPDATE ON public.b2b_deal_delivery_plans TO anon;

-- Realtime publication (optional — để DealDetailPage auto-refresh khi weighbridge match)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'deal_delivery_plans'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE b2b.deal_delivery_plans';
  END IF;
END $$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'deal_delivery_plans'
ORDER BY ordinal_position;

-- ============================================
-- ROLLBACK
-- ============================================
-- DROP VIEW IF EXISTS public.b2b_deal_delivery_plans CASCADE;
-- DROP TABLE IF EXISTS b2b.deal_delivery_plans CASCADE;
