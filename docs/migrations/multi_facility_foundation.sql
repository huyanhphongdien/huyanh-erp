-- ============================================================================
-- MULTI-FACILITY FOUNDATION (F1)
-- Ngày: 2026-04-16
-- Doc: docs/MULTI_FACILITY_WORKFLOW.md
-- ----------------------------------------------------------------------------
-- Tạo facilities table + facility_id FK trên 6 bảng liên quan + backfill data
-- cũ về Phong Điền + tạo 4 kho mới cho Tân Lâm và Lào.
-- ZERO breaking change — tất cả data hiện có gán PD, ERP vận hành như cũ.
-- ============================================================================

-- 1. Tạo bảng facilities
CREATE TABLE IF NOT EXISTS facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  address TEXT,
  region VARCHAR(100),
  country VARCHAR(50) DEFAULT 'VN',
  manager_employee_id UUID,
  phone VARCHAR(50),
  gps_lat NUMERIC(10, 7),
  gps_lng NUMERIC(10, 7),
  timezone VARCHAR(50) DEFAULT 'Asia/Ho_Chi_Minh',
  -- Chỉ facility nào can_ship_to_customer=true mới được tạo Sales Order ship trực tiếp
  can_ship_to_customer BOOLEAN DEFAULT false,
  weighbridge_subdomain VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facilities_code ON facilities(code);
CREATE INDEX IF NOT EXISTS idx_facilities_is_active ON facilities(is_active);

COMMENT ON TABLE facilities IS
  'Nhà máy cấp tổng — mỗi facility chứa nhiều warehouse. Phong Điền (PD) là HQ, Tân Lâm (TL) và Lào (LAO) là vệ tinh sản xuất.';

COMMENT ON COLUMN facilities.can_ship_to_customer IS
  'Chỉ facility=true mới được tạo Sales Order xuất khẩu trực tiếp. Hiện chỉ PD=true, TL/LAO chuyển TP về PD trước.';

-- 2. Insert 3 facilities
INSERT INTO facilities (code, name, region, country, can_ship_to_customer, weighbridge_subdomain) VALUES
  ('PD', 'Phong Điền (HQ)', 'Huế', 'VN', true, 'can.huyanhrubber.vn'),
  ('TL', 'Tân Lâm', 'Quảng Trị', 'VN', false, 'can-tl.huyanhrubber.vn'),
  ('LAO', 'Lào', 'Savannakhet', 'LA', false, 'can-lao.huyanhrubber.vn')
ON CONFLICT (code) DO NOTHING;

-- 3. Thêm facility_id vào warehouses + backfill data cũ về PD
ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id);

CREATE INDEX IF NOT EXISTS idx_warehouses_facility_id ON warehouses(facility_id);

-- Backfill: tất cả kho hiện có thuộc Phong Điền
UPDATE warehouses
SET facility_id = (SELECT id FROM facilities WHERE code = 'PD')
WHERE facility_id IS NULL;

-- 4. Tạo 4 kho mới cho TL + LAO
INSERT INTO warehouses (code, name, type, facility_id, is_active)
SELECT 'KHO-TL-NVL', 'Kho NVL Tân Lâm', 'raw', f.id, true
FROM facilities f WHERE f.code = 'TL'
  AND NOT EXISTS (SELECT 1 FROM warehouses WHERE code = 'KHO-TL-NVL');

INSERT INTO warehouses (code, name, type, facility_id, is_active)
SELECT 'KHO-TL-TP', 'Kho TP Tân Lâm', 'finished', f.id, true
FROM facilities f WHERE f.code = 'TL'
  AND NOT EXISTS (SELECT 1 FROM warehouses WHERE code = 'KHO-TL-TP');

INSERT INTO warehouses (code, name, type, facility_id, is_active)
SELECT 'KHO-LAO-NVL', 'Kho NVL Lào', 'raw', f.id, true
FROM facilities f WHERE f.code = 'LAO'
  AND NOT EXISTS (SELECT 1 FROM warehouses WHERE code = 'KHO-LAO-NVL');

INSERT INTO warehouses (code, name, type, facility_id, is_active)
SELECT 'KHO-LAO-TP', 'Kho TP Lào', 'finished', f.id, true
FROM facilities f WHERE f.code = 'LAO'
  AND NOT EXISTS (SELECT 1 FROM warehouses WHERE code = 'KHO-LAO-TP');

-- 5. Thêm facility_id vào các bảng liên quan + backfill về PD

-- weighbridge_tickets
ALTER TABLE weighbridge_tickets
  ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id);
CREATE INDEX IF NOT EXISTS idx_weighbridge_tickets_facility_id
  ON weighbridge_tickets(facility_id);
UPDATE weighbridge_tickets
SET facility_id = (SELECT id FROM facilities WHERE code = 'PD')
WHERE facility_id IS NULL;

-- production_orders — SKIP ở F1
-- Lý do: production_orders đã có column facility_id (FK tới
-- production_facilities = bảng dây chuyền sản xuất, KHÔNG phải bảng
-- facilities mới của F1). Naming conflict.
-- Production cross-facility sẽ làm trong module Production sau, dùng
-- column khác (VD site_id) hoặc rename để tránh conflict.

-- sales_orders (ship_from_facility_id)
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS ship_from_facility_id UUID REFERENCES facilities(id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_ship_from_facility_id
  ON sales_orders(ship_from_facility_id);
UPDATE sales_orders
SET ship_from_facility_id = (SELECT id FROM facilities WHERE code = 'PD')
WHERE ship_from_facility_id IS NULL;

-- rubber_intake_batches (nếu bảng tồn tại)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rubber_intake_batches') THEN
    ALTER TABLE rubber_intake_batches
      ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES facilities(id);
    CREATE INDEX IF NOT EXISTS idx_rubber_intake_batches_facility_id
      ON rubber_intake_batches(facility_id);
    UPDATE rubber_intake_batches
    SET facility_id = (SELECT id FROM facilities WHERE code = 'PD')
    WHERE facility_id IS NULL;
  END IF;
END $$;

-- 6. RLS policies cho facilities (read all, write admin) + warehouses giữ nguyên
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_read_facilities" ON facilities;
CREATE POLICY "auth_read_facilities" ON facilities
  FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "auth_write_facilities" ON facilities;
CREATE POLICY "auth_write_facilities" ON facilities
  FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);

-- 7. Verify
SELECT 'Facilities created:' AS info, COUNT(*) AS count FROM facilities;
SELECT code, name, can_ship_to_customer FROM facilities ORDER BY code;
SELECT 'Warehouses by facility:' AS info, '' AS code, '' AS name UNION ALL
SELECT '', w.code, f.code || ' - ' || w.name
FROM warehouses w JOIN facilities f ON f.id = w.facility_id
ORDER BY 1, 2;

-- ============================================================================
-- ROLLBACK (nếu cần):
--   ALTER TABLE warehouses DROP COLUMN IF EXISTS facility_id;
--   ALTER TABLE weighbridge_tickets DROP COLUMN IF EXISTS facility_id;
--   ALTER TABLE production_orders DROP COLUMN IF EXISTS facility_id;
--   ALTER TABLE sales_orders DROP COLUMN IF EXISTS ship_from_facility_id;
--   ALTER TABLE rubber_intake_batches DROP COLUMN IF EXISTS facility_id;
--   DELETE FROM warehouses WHERE code IN ('KHO-TL-NVL','KHO-TL-TP','KHO-LAO-NVL','KHO-LAO-TP');
--   DROP TABLE IF EXISTS facilities;
-- ============================================================================
