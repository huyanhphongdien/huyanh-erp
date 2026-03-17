-- ============================================================================
-- WMS RUBBER FIELDS — Database Migration
-- Ngày: 17/03/2026
-- Chạy trên Supabase SQL Editor
-- Mục tiêu: Bổ sung fields đặc thù ngành cao su
-- An toàn: Dùng IF NOT EXISTS — chạy lại không lỗi
-- ============================================================================

-- =============================================
-- SECTION 1: BẢNG MỚI — rubber_grade_standards
-- Tiêu chuẩn SVR theo TCVN 3769:2016
-- =============================================

CREATE TABLE IF NOT EXISTS rubber_grade_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade VARCHAR(20) NOT NULL UNIQUE,
  grade_label VARCHAR(50) NOT NULL,
  drc_min NUMERIC(5,2) NOT NULL,
  drc_max NUMERIC(5,2),
  dirt_max NUMERIC(5,3) NOT NULL,
  ash_max NUMERIC(5,2) NOT NULL,
  nitrogen_max NUMERIC(5,2) NOT NULL,
  volatile_matter_max NUMERIC(5,2) NOT NULL,
  pri_min NUMERIC(5,1),
  mooney_max NUMERIC(5,1),
  moisture_max NUMERIC(5,2) NOT NULL DEFAULT 0.80,
  color_lovibond_max NUMERIC(5,1),
  price_factor NUMERIC(5,3) DEFAULT 1.000,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO rubber_grade_standards
  (grade, grade_label, drc_min, drc_max, dirt_max, ash_max, nitrogen_max, volatile_matter_max, pri_min, mooney_max, moisture_max, color_lovibond_max, sort_order)
VALUES
  ('SVR_3L',   'SVR 3L',   60, NULL, 0.020, 0.50, 0.60, 0.20, 40,   NULL, 0.80, 6,    1),
  ('SVR_5',    'SVR 5',    55, 60,   0.040, 0.50, 0.60, 0.20, 40,   NULL, 0.80, NULL, 2),
  ('SVR_10',   'SVR 10',   50, 55,   0.080, 0.60, 0.60, 0.20, 30,   NULL, 0.80, NULL, 3),
  ('SVR_20',   'SVR 20',   40, 50,   0.160, 0.80, 0.60, 0.20, 30,   NULL, 0.80, NULL, 4),
  ('SVR_CV60', 'SVR CV60', 60, NULL, 0.020, 0.50, 0.60, 0.20, NULL, 65,   0.80, NULL, 5)
ON CONFLICT (grade) DO NOTHING;


-- =============================================
-- SECTION 2: BỔ SUNG CỘT — stock_batches
-- Rubber-specific tracking fields
-- =============================================

-- 2a. Grade & loại mủ
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS rubber_grade VARCHAR(20);
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS rubber_type VARCHAR(20);

-- 2b. Trọng lượng & hao hụt
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS moisture_content NUMERIC(5,2);
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS dry_weight NUMERIC(12,2);
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS initial_weight NUMERIC(12,2);
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS current_weight NUMERIC(12,2);
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS weight_loss NUMERIC(12,2) DEFAULT 0;
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS last_weight_check DATE;

-- 2c. Nguồn gốc đại lý
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(200);
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS supplier_region VARCHAR(100);
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS supplier_reported_drc NUMERIC(5,2);
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS supplier_lab_report_url TEXT;

-- 2d. Lưu kho & tạp chất
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS storage_days INTEGER DEFAULT 0;
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS contamination_status VARCHAR(20) DEFAULT 'clean';
ALTER TABLE stock_batches
  ADD COLUMN IF NOT EXISTS contamination_notes TEXT;


-- =============================================
-- SECTION 3: BỔ SUNG CỘT — batch_qc_results
-- Full SVR QC parameters
-- =============================================

ALTER TABLE batch_qc_results
  ADD COLUMN IF NOT EXISTS moisture_content NUMERIC(5,2);
ALTER TABLE batch_qc_results
  ADD COLUMN IF NOT EXISTS volatile_matter NUMERIC(5,2);
ALTER TABLE batch_qc_results
  ADD COLUMN IF NOT EXISTS metal_content NUMERIC(8,4);
ALTER TABLE batch_qc_results
  ADD COLUMN IF NOT EXISTS dirt_content NUMERIC(5,3);
ALTER TABLE batch_qc_results
  ADD COLUMN IF NOT EXISTS color_lovibond NUMERIC(5,1);
ALTER TABLE batch_qc_results
  ADD COLUMN IF NOT EXISTS grade_tested VARCHAR(20);
ALTER TABLE batch_qc_results
  ADD COLUMN IF NOT EXISTS grade_matches_expected BOOLEAN DEFAULT true;
ALTER TABLE batch_qc_results
  ADD COLUMN IF NOT EXISTS contamination_detected BOOLEAN DEFAULT false;
ALTER TABLE batch_qc_results
  ADD COLUMN IF NOT EXISTS contamination_type VARCHAR(50);
ALTER TABLE batch_qc_results
  ADD COLUMN IF NOT EXISTS supplier_drc_discrepancy NUMERIC(5,2);


-- =============================================
-- SECTION 4: BỔ SUNG CỘT — material_qc_standards
-- Full SVR standard parameters
-- =============================================

ALTER TABLE material_qc_standards
  ADD COLUMN IF NOT EXISTS rubber_grade VARCHAR(20);
ALTER TABLE material_qc_standards
  ADD COLUMN IF NOT EXISTS moisture_max NUMERIC(5,2) DEFAULT 0.80;
ALTER TABLE material_qc_standards
  ADD COLUMN IF NOT EXISTS volatile_matter_max NUMERIC(5,2) DEFAULT 0.20;
ALTER TABLE material_qc_standards
  ADD COLUMN IF NOT EXISTS dirt_max NUMERIC(5,3) DEFAULT 0.020;
ALTER TABLE material_qc_standards
  ADD COLUMN IF NOT EXISTS ash_max NUMERIC(5,2) DEFAULT 0.50;
ALTER TABLE material_qc_standards
  ADD COLUMN IF NOT EXISTS nitrogen_max NUMERIC(5,2) DEFAULT 0.60;
ALTER TABLE material_qc_standards
  ADD COLUMN IF NOT EXISTS pri_min NUMERIC(5,1) DEFAULT 40;
ALTER TABLE material_qc_standards
  ADD COLUMN IF NOT EXISTS mooney_max NUMERIC(5,1);
ALTER TABLE material_qc_standards
  ADD COLUMN IF NOT EXISTS color_lovibond_max NUMERIC(5,1);
ALTER TABLE material_qc_standards
  ADD COLUMN IF NOT EXISTS season VARCHAR(10) DEFAULT 'all';


-- =============================================
-- SECTION 5: BỔ SUNG CỘT — stock_out_orders
-- Export/rubber-specific fields
-- =============================================

ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS svr_grade VARCHAR(20);
ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS required_drc_min NUMERIC(5,2);
ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS required_drc_max NUMERIC(5,2);
ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS container_type VARCHAR(10);
ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS container_id VARCHAR(50);
ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS packing_type VARCHAR(20);
ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS bale_count INTEGER;
ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS packing_requirements TEXT;
ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS export_date DATE;
ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS coa_generated BOOLEAN DEFAULT false;
ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS packing_list_generated BOOLEAN DEFAULT false;


-- =============================================
-- SECTION 6: BẢNG MỚI — weight_check_logs
-- Theo dõi hao hụt trọng lượng theo thời gian
-- =============================================

CREATE TABLE IF NOT EXISTS weight_check_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES stock_batches(id) ON DELETE CASCADE,
  previous_weight NUMERIC(12,2),
  new_weight NUMERIC(12,2) NOT NULL,
  weight_change NUMERIC(12,2),
  change_reason VARCHAR(50) DEFAULT 'drying',
  checked_by UUID,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_weight_check_logs_batch
  ON weight_check_logs(batch_id);
CREATE INDEX IF NOT EXISTS idx_weight_check_logs_date
  ON weight_check_logs(checked_at);


-- =============================================
-- VERIFY: Kiểm tra kết quả
-- =============================================

-- Verify rubber_grade_standards
SELECT grade, grade_label, drc_min, drc_max, dirt_max, ash_max, pri_min
FROM rubber_grade_standards
ORDER BY sort_order;

-- Verify stock_batches new columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'stock_batches'
  AND column_name IN (
    'rubber_grade', 'rubber_type', 'moisture_content', 'dry_weight',
    'initial_weight', 'current_weight', 'weight_loss', 'last_weight_check',
    'supplier_name', 'supplier_region', 'supplier_reported_drc',
    'storage_days', 'contamination_status'
  )
ORDER BY column_name;

-- Verify batch_qc_results new columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'batch_qc_results'
  AND column_name IN (
    'moisture_content', 'volatile_matter', 'metal_content', 'dirt_content',
    'color_lovibond', 'grade_tested', 'grade_matches_expected',
    'contamination_detected', 'contamination_type', 'supplier_drc_discrepancy'
  )
ORDER BY column_name;
