-- ============================================================================
-- P8: PRODUCTION ORDERS & BOM — Database Migration
-- Ngay: 17/03/2026
-- Chay tren Supabase SQL Editor
-- 7 bang moi + 3 ALTER existing tables
-- ============================================================================

-- =============================================
-- 1. production_facilities (Day chuyen san xuat)
-- =============================================

CREATE TABLE IF NOT EXISTS production_facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  max_batch_size_kg NUMERIC(12,2) DEFAULT 500,
  processing_stages TEXT DEFAULT '1,2,3,4,5',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO production_facilities (code, name, description, max_batch_size_kg)
VALUES ('LINE-01', 'Day chuyen 1', 'Day chuyen san xuat chinh', 500)
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- 2. production_material_specs (BOM templates theo grade)
-- =============================================

CREATE TABLE IF NOT EXISTS production_material_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_product_grade VARCHAR(20) NOT NULL,
  target_drc_min NUMERIC(5,2) NOT NULL,
  target_drc_max NUMERIC(5,2),
  expected_yield_percent NUMERIC(5,2) DEFAULT 80,
  optimal_input_drc_min NUMERIC(5,2),
  optimal_input_drc_max NUMERIC(5,2),
  washing_duration_hours NUMERIC(5,2) DEFAULT 3,
  washing_water_ratio NUMERIC(5,2) DEFAULT 1.5,
  creeping_duration_hours NUMERIC(5,2) DEFAULT 4,
  drying_duration_days NUMERIC(5,1) DEFAULT 10,
  drying_temperature_target NUMERIC(5,1) DEFAULT 65,
  pressing_duration_hours NUMERIC(5,2) DEFAULT 3,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO production_material_specs
  (target_product_grade, target_drc_min, target_drc_max, expected_yield_percent, optimal_input_drc_min, optimal_input_drc_max)
VALUES
  ('SVR_3L',   60, NULL, 78, 55, 65),
  ('SVR_5',    55, 60,   80, 50, 60),
  ('SVR_10',   50, 55,   82, 45, 55),
  ('SVR_20',   40, 50,   85, 35, 50),
  ('SVR_CV60', 60, NULL, 78, 55, 65)
ON CONFLICT DO NOTHING;

-- =============================================
-- 3. production_orders (Lenh san xuat)
-- =============================================

CREATE TABLE IF NOT EXISTS production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  product_type VARCHAR(20) NOT NULL,
  target_quantity NUMERIC(12,2) NOT NULL,
  actual_quantity NUMERIC(12,2),
  yield_percent NUMERIC(5,2),

  target_grade VARCHAR(20),
  target_drc_min NUMERIC(5,2),
  target_drc_max NUMERIC(5,2),

  status VARCHAR(20) DEFAULT 'draft',
  stage_current INTEGER DEFAULT 0,
  stage_status VARCHAR(20) DEFAULT 'pending',

  scheduled_start_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,

  facility_id UUID REFERENCES production_facilities(id),
  supervisor_id UUID,

  expected_grade VARCHAR(20),
  final_grade VARCHAR(20),
  final_drc NUMERIC(5,2),

  notes TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_orders_status ON production_orders(status);
CREATE INDEX IF NOT EXISTS idx_production_orders_code ON production_orders(code);

-- =============================================
-- 4. production_order_items (NVL dau vao)
-- =============================================

CREATE TABLE IF NOT EXISTS production_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  source_batch_id UUID NOT NULL REFERENCES stock_batches(id),
  required_quantity NUMERIC(12,2) NOT NULL,
  allocated_quantity NUMERIC(12,2),

  stage_sequence INTEGER,
  drc_at_intake NUMERIC(5,2),
  expected_drc_output NUMERIC(5,2),
  expected_weight_loss_kg NUMERIC(12,2),
  expected_weight_loss_percent NUMERIC(5,2),

  actual_input_quantity NUMERIC(12,2),
  actual_output_quantity NUMERIC(12,2),
  actual_drc_before NUMERIC(5,2),
  actual_drc_after NUMERIC(5,2),
  actual_weight_loss_kg NUMERIC(12,2),

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_items_po ON production_order_items(production_order_id);
CREATE INDEX IF NOT EXISTS idx_prod_items_batch ON production_order_items(source_batch_id);

-- =============================================
-- 5. production_stage_progress (5 cong doan)
-- =============================================

CREATE TABLE IF NOT EXISTS production_stage_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,

  stage_number INTEGER NOT NULL,
  stage_name VARCHAR(50) NOT NULL,

  status VARCHAR(20) DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_hours NUMERIC(8,2),

  input_quantity NUMERIC(12,2),
  output_quantity NUMERIC(12,2),
  weight_loss_kg NUMERIC(12,2),

  input_drc NUMERIC(5,2),
  output_drc NUMERIC(5,2),
  drc_change NUMERIC(5,2),

  temperature_avg NUMERIC(5,1),
  humidity_avg NUMERIC(5,1),
  duration_days INTEGER,

  operator_id UUID,
  qc_checkpoint_passed BOOLEAN DEFAULT false,
  qc_inspector_id UUID,
  qc_notes TEXT,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stage_progress_po ON production_stage_progress(production_order_id);

-- =============================================
-- 6. production_output_batches (Thanh pham dau ra)
-- =============================================

CREATE TABLE IF NOT EXISTS production_output_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  stock_batch_id UUID REFERENCES stock_batches(id),

  output_batch_no VARCHAR(50),
  material_id UUID REFERENCES materials(id),

  quantity_produced NUMERIC(12,2),
  bale_count INTEGER,

  final_grade VARCHAR(20),
  final_drc NUMERIC(5,2),
  final_moisture NUMERIC(5,2),

  status VARCHAR(20) DEFAULT 'created',

  warehouse_id UUID REFERENCES warehouses(id),
  location_id UUID REFERENCES warehouse_locations(id),

  input_batches JSONB,
  processing_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_output_po ON production_output_batches(production_order_id);

-- =============================================
-- 7. production_qc_results (QC thanh pham)
-- =============================================

CREATE TABLE IF NOT EXISTS production_qc_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  output_batch_id UUID NOT NULL REFERENCES production_output_batches(id) ON DELETE CASCADE,

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
  result VARCHAR(20),

  tester_id UUID,
  tested_at TIMESTAMPTZ,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_qc_output ON production_qc_results(output_batch_id);

-- =============================================
-- 8. ALTER stock_batches — them production link
-- =============================================

ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS production_order_id UUID REFERENCES production_orders(id);
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS production_output_batch_id UUID REFERENCES production_output_batches(id);
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS produced_from_batches JSONB;

CREATE INDEX IF NOT EXISTS idx_stock_batches_po ON stock_batches(production_order_id);

-- =============================================
-- VERIFY
-- =============================================

SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'production_facilities', 'production_material_specs',
    'production_orders', 'production_order_items',
    'production_stage_progress', 'production_output_batches',
    'production_qc_results'
  )
ORDER BY tablename;
