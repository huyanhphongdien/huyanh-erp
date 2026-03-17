-- ============================================================================
-- P9: BLENDING (Phoi tron lo) — Database Migration
-- Ngay: 17/03/2026
-- Muc tieu: Tron nhieu lo cao su de dat DRC mong muon
-- ============================================================================

-- =============================================
-- 1. blend_orders (Lenh phoi tron)
-- =============================================

CREATE TABLE IF NOT EXISTS blend_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,              -- BL-SVR10-20260317-001

  -- Target
  target_grade VARCHAR(20) NOT NULL,             -- SVR_3L, SVR_5, SVR_10, SVR_20
  target_drc NUMERIC(5,2) NOT NULL,              -- DRC mong muon
  target_quantity_kg NUMERIC(12,2) NOT NULL,      -- KL mong muon

  -- Result
  actual_drc NUMERIC(5,2),                       -- DRC thuc te sau tron
  actual_quantity_kg NUMERIC(12,2),              -- KL thuc te
  result_grade VARCHAR(20),                       -- Grade thuc te
  grade_meets_target BOOLEAN,

  -- Simulation
  simulated_drc NUMERIC(5,2),                    -- DRC du kien (tinh truoc)
  simulated_quantity_kg NUMERIC(12,2),

  -- Status
  status VARCHAR(20) DEFAULT 'draft',
  -- draft | simulated | approved | in_progress | completed | cancelled

  -- Output batch
  output_batch_id UUID REFERENCES stock_batches(id),
  output_warehouse_id UUID REFERENCES warehouses(id),
  output_location_id UUID REFERENCES warehouse_locations(id),

  -- Tracking
  blended_by UUID,
  blended_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,

  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blend_orders_status ON blend_orders(status);
CREATE INDEX IF NOT EXISTS idx_blend_orders_code ON blend_orders(code);

-- =============================================
-- 2. blend_order_items (Cac lo dau vao)
-- =============================================

CREATE TABLE IF NOT EXISTS blend_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blend_order_id UUID NOT NULL REFERENCES blend_orders(id) ON DELETE CASCADE,
  source_batch_id UUID NOT NULL REFERENCES stock_batches(id),

  -- Quantity
  quantity_kg NUMERIC(12,2) NOT NULL,            -- KL lay tu lo nay
  percentage NUMERIC(5,2),                        -- % trong tong hon hop

  -- DRC cua lo nay
  batch_drc NUMERIC(5,2),                         -- DRC cua batch tai thoi diem tron
  drc_contribution NUMERIC(5,2),                  -- DRC dong gop = qty * drc / total_qty

  -- Batch info (snapshot)
  batch_no VARCHAR(50),
  material_name VARCHAR(200),
  rubber_grade VARCHAR(20),

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blend_items_order ON blend_order_items(blend_order_id);
CREATE INDEX IF NOT EXISTS idx_blend_items_batch ON blend_order_items(source_batch_id);

-- =============================================
-- 3. blend_qc_results (QC sau phoi tron)
-- =============================================

CREATE TABLE IF NOT EXISTS blend_qc_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blend_order_id UUID NOT NULL REFERENCES blend_orders(id) ON DELETE CASCADE,

  drc_value NUMERIC(5,2),
  moisture_content NUMERIC(5,2),
  volatile_matter NUMERIC(5,2),
  ash_content NUMERIC(5,2),
  nitrogen_content NUMERIC(5,2),
  dirt_content NUMERIC(5,3),
  pri_value NUMERIC(5,1),
  mooney_value NUMERIC(5,1),
  color_lovibond NUMERIC(5,1),
  metal_content NUMERIC(8,4),

  grade_determined VARCHAR(20),
  grade_meets_target BOOLEAN,
  result VARCHAR(20),                             -- passed | warning | failed

  tester_id UUID,
  tested_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blend_qc_order ON blend_qc_results(blend_order_id);

-- =============================================
-- VERIFY
-- =============================================

SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('blend_orders', 'blend_order_items', 'blend_qc_results')
ORDER BY tablename;
