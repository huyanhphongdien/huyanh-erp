-- ============================================================================
-- F3 — Inter-Facility Transfer (CORE)
-- File: docs/migrations/f3_inter_facility_transfer.sql
--
-- Mục đích: Cho phép chuyển TP từ NM vệ tinh (TL/LAO) về NM HQ (PD) để xuất khách.
-- Quy trình 5-state với cân 2 đầu (NM gửi + NM nhận) → đối soát hao hụt 0.5%.
--
-- Cách chạy: paste vào Supabase SQL Editor → Run.
-- Idempotent: an toàn chạy lại nhiều lần (CREATE IF NOT EXISTS, INSERT ... ON CONFLICT).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ENUM cho state machine
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE transfer_status AS ENUM (
    'draft',         -- vừa tạo, chưa cân xuất
    'picking',       -- đang lấy hàng tại kho gửi
    'picked',        -- đã lấy xong, chờ xe đến cân
    'in_transit',    -- đã cân xuất, hàng trên đường
    'arrived',       -- xe đến NM nhận, chờ cân nhận
    'received',      -- đã cân nhận + nhập kho, hoàn tất
    'cancelled',     -- hủy (ở draft/picking)
    'rejected'       -- BGD không duyệt do hao hụt cao
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 2. Bảng chính: inter_facility_transfers
-- ============================================================================
CREATE TABLE IF NOT EXISTS inter_facility_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,    -- TR-YYYYMMDD-NNN

  -- Source (NM gửi)
  from_facility_id  UUID NOT NULL REFERENCES facilities(id),
  from_warehouse_id UUID NOT NULL REFERENCES warehouses(id),

  -- Destination (NM nhận)
  to_facility_id  UUID NOT NULL REFERENCES facilities(id),
  to_warehouse_id UUID NOT NULL REFERENCES warehouses(id),

  -- State machine
  status transfer_status NOT NULL DEFAULT 'draft',

  -- Vehicle / driver
  vehicle_plate VARCHAR(20),
  driver_name   VARCHAR(200),
  driver_phone  VARCHAR(20),

  -- Liên kết phiếu cân (cân 2 đầu)
  weighbridge_out_id UUID REFERENCES weighbridge_tickets(id),  -- cân tại NM gửi
  weighbridge_in_id  UUID REFERENCES weighbridge_tickets(id),  -- cân tại NM nhận

  -- Trọng lượng & hao hụt
  weight_out_kg NUMERIC(12,2),  -- net cân xuất tại NM gửi
  weight_in_kg  NUMERIC(12,2),  -- net cân nhận tại NM nhận
  loss_kg  NUMERIC(12,2) GENERATED ALWAYS AS (
    CASE WHEN weight_out_kg IS NOT NULL AND weight_in_kg IS NOT NULL
         THEN weight_out_kg - weight_in_kg
         ELSE NULL
    END
  ) STORED,
  loss_pct NUMERIC(7,4) GENERATED ALWAYS AS (
    CASE WHEN weight_out_kg IS NOT NULL AND weight_out_kg > 0 AND weight_in_kg IS NOT NULL
         THEN ((weight_out_kg - weight_in_kg) / weight_out_kg) * 100
         ELSE NULL
    END
  ) STORED,

  -- Approval (khi hao hụt vượt threshold)
  loss_threshold_pct NUMERIC(5,2) DEFAULT 0.5,  -- 0.5% mặc định
  needs_approval BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  approval_note TEXT,

  -- Liên kết phiếu xuất/nhập kho (auto-tạo khi confirm)
  stock_out_order_id UUID REFERENCES stock_out_orders(id),
  stock_in_order_id  UUID REFERENCES stock_in_orders(id),

  -- Audit
  notes TEXT,
  created_by UUID REFERENCES employees(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  picked_at   TIMESTAMPTZ,
  shipped_at  TIMESTAMPTZ,  -- = lúc cân xuất xong (in_transit)
  arrived_at  TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  CHECK (from_facility_id <> to_facility_id),  -- không transfer trong cùng NM
  CHECK (loss_threshold_pct >= 0 AND loss_threshold_pct <= 100)
);

CREATE INDEX IF NOT EXISTS idx_transfers_from_facility ON inter_facility_transfers(from_facility_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to_facility ON inter_facility_transfers(to_facility_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON inter_facility_transfers(status);
CREATE INDEX IF NOT EXISTS idx_transfers_created_at ON inter_facility_transfers(created_at DESC);

COMMENT ON TABLE inter_facility_transfers IS 'F3: Phiếu chuyển kho liên nhà máy. Mỗi phiếu = 1 chuyến xe.';
COMMENT ON COLUMN inter_facility_transfers.loss_pct IS 'Computed: (weight_out - weight_in) / weight_out * 100. NULL khi chưa cân nhận.';

-- ============================================================================
-- 3. Items table — chi tiết batch trong mỗi transfer
-- ============================================================================
CREATE TABLE IF NOT EXISTS inter_facility_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES inter_facility_transfers(id) ON DELETE CASCADE,

  material_id UUID NOT NULL REFERENCES materials(id),
  source_batch_id UUID REFERENCES stock_batches(id),  -- batch tại NM gửi

  -- Dự kiến (lúc tạo phiếu)
  quantity_planned NUMERIC(10,2),  -- bành/đơn vị
  weight_planned_kg NUMERIC(12,2), -- kg = qty × weight_per_unit

  -- Sau khi nhận → tạo batch mới ở NM nhận
  destination_batch_id UUID REFERENCES stock_batches(id),
  quantity_received NUMERIC(10,2),
  weight_received_kg NUMERIC(12,2),

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON inter_facility_transfer_items(transfer_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_source_batch ON inter_facility_transfer_items(source_batch_id);

-- ============================================================================
-- 4. Cross-link: weighbridge_tickets + stock_out/in_orders biết về transfer
-- ============================================================================
ALTER TABLE weighbridge_tickets
  ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES inter_facility_transfers(id);
CREATE INDEX IF NOT EXISTS idx_wb_transfer ON weighbridge_tickets(transfer_id) WHERE transfer_id IS NOT NULL;

ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES inter_facility_transfers(id);
CREATE INDEX IF NOT EXISTS idx_so_transfer ON stock_out_orders(transfer_id) WHERE transfer_id IS NOT NULL;

ALTER TABLE stock_in_orders
  ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES inter_facility_transfers(id);
CREATE INDEX IF NOT EXISTS idx_si_transfer ON stock_in_orders(transfer_id) WHERE transfer_id IS NOT NULL;

-- ============================================================================
-- 5. Trigger: updated_at auto-touch
-- ============================================================================
CREATE OR REPLACE FUNCTION trg_transfers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transfers_updated_at ON inter_facility_transfers;
CREATE TRIGGER trg_transfers_updated_at
  BEFORE UPDATE ON inter_facility_transfers
  FOR EACH ROW
  EXECUTE FUNCTION trg_transfers_updated_at();

-- ============================================================================
-- 6. RLS — cho authenticated + anon đọc/ghi (giống pattern các bảng WMS khác)
-- ============================================================================
ALTER TABLE inter_facility_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inter_facility_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transfers_all_auth" ON inter_facility_transfers;
CREATE POLICY "transfers_all_auth" ON inter_facility_transfers
  FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "transfer_items_all_auth" ON inter_facility_transfer_items;
CREATE POLICY "transfer_items_all_auth" ON inter_facility_transfer_items
  FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);

GRANT ALL ON inter_facility_transfers TO authenticated, anon;
GRANT ALL ON inter_facility_transfer_items TO authenticated, anon;

-- ============================================================================
-- 7. View tiện ích: transfers_in_transit (cho dashboard "Đang vận chuyển")
-- ============================================================================
CREATE OR REPLACE VIEW v_transfers_in_transit AS
SELECT
  t.id,
  t.code,
  t.status,
  t.from_facility_id,
  ff.code AS from_facility_code,
  ff.name AS from_facility_name,
  t.to_facility_id,
  tf.code AS to_facility_code,
  tf.name AS to_facility_name,
  t.vehicle_plate,
  t.driver_name,
  t.weight_out_kg,
  t.weight_in_kg,
  t.loss_kg,
  t.loss_pct,
  t.shipped_at,
  t.arrived_at,
  t.created_at
FROM inter_facility_transfers t
LEFT JOIN facilities ff ON ff.id = t.from_facility_id
LEFT JOIN facilities tf ON tf.id = t.to_facility_id
WHERE t.status IN ('in_transit', 'arrived');

GRANT SELECT ON v_transfers_in_transit TO authenticated, anon;

COMMIT;

-- ============================================================================
-- DONE — Verify:
--   SELECT * FROM inter_facility_transfers LIMIT 1;
--   SELECT * FROM v_transfers_in_transit;
-- ============================================================================
