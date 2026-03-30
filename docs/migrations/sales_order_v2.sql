-- ============================================================
-- SALE ORDER V2 — Migration
-- Ngày: 30/03/2026
-- Thêm 16 cột + 4 sản phẩm + 25 KH thật + payment terms
-- ============================================================

-- 1. Thêm 16 cột cho sales_orders
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS contract_no VARCHAR(100);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS lot_number INTEGER;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS commodity_description TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS packing_description TEXT;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS bl_number VARCHAR(100);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS dhl_number VARCHAR(100);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS contract_price NUMERIC(15,2);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS actual_price NUMERIC(15,2);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_date DATE;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS commission_per_mt NUMERIC(10,2) DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS commission_total NUMERIC(15,2) DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS bank_name VARCHAR(50);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS doc_submission_date DATE;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS payment_date DATE;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- 2. Thêm cột cho sales_customers
ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);
ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS default_bank VARCHAR(50);
ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS broker_name VARCHAR(200);
ALTER TABLE sales_customers ADD COLUMN IF NOT EXISTS broker_commission NUMERIC(10,2);

-- 3. Thêm 4 sản phẩm mới
INSERT INTO rubber_grade_standards (grade, grade_label, drc_min, dirt_max, ash_max, nitrogen_max, volatile_matter_max, moisture_max, sort_order)
VALUES
  ('RSS1', 'RSS 1', 60, 0.010, 0.50, 0.60, 0.20, 0.80, 6),
  ('RSS3', 'RSS 3', 60, 0.020, 0.50, 0.60, 0.20, 0.80, 7),
  ('SBR1502', 'SBR 1502', 0, 0, 0, 0, 0, 0, 8),
  ('COMPOUND', 'Compound Rubber', 0, 0, 0, 0, 0, 0, 9)
ON CONFLICT (grade) DO NOTHING;

-- 4. Import 25 khách hàng thật
INSERT INTO sales_customers (code, name, short_name, country, region, default_incoterm, default_currency, quality_standard, status, tier)
VALUES
  ('KH-JK', 'JK Tyre & Industries Ltd', 'JK', 'IN', 'South Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'strategic'),
  ('KH-ATC', 'ATC Tires Private Limited', 'ATC', 'IN', 'South Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'strategic'),
  ('KH-PIX', 'Pix Transmissions Limited', 'PIX', 'IN', 'South Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-KOHINOOR', 'Kohinoor India Private Ltd', 'KOHINOOR', 'IN', 'South Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-RALSON', 'Ralson India Ltd', 'RALSON', 'IN', 'South Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-GOUTAM', 'Goutam Enterprises', 'GOUTAM', 'IN', 'South Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-TOWER', 'Tower Global Investment Pte Ltd', 'TOWER GLOBAL', 'SG', 'Southeast Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'strategic'),
  ('KH-IES', 'IE Synergy Pte Ltd', 'IE SYNERGY', 'SG', 'Southeast Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-ZHEJIANG', 'Zhejiang Jinhong Petrochemical Co Ltd', 'ZHEJIANG', 'CN', 'East Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-ALPHEN', 'PT Alphen Internasional Corporindo', 'PT ALPHEN', 'ID', 'Southeast Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-AYUMAS', 'PT Ayumas Alam Lestari', 'PT AYUMAS', 'ID', 'Southeast Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-OKAMOTO', 'PT Okamoto', 'PT OKAMOTO', 'ID', 'Southeast Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-MALAYA', 'Malaya International Co Pte Ltd', 'MALAYA', 'SG', 'Southeast Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-GRI', 'Global Rubber Industries Pvt Ltd', 'GRI', 'LK', 'South Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-VITRY', 'Vitry Middle East General Trading LLC', 'VITRY', 'AE', 'Middle East', 'FOB', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-UKKO', 'UKKO Corporation', 'UKKO', 'TW', 'East Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-PROCHEM', 'Prochem', 'PROCHEM', 'TR', 'Europe', 'FOB', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-COELSIN', 'Coelsin Elastomeros S.L', 'COELSIN', 'ES', 'Europe', 'CFR', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-R1', 'R1 International Pte Ltd', 'R1', 'SG', 'Southeast Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'premium'),
  ('KH-KIMEX', 'Kimex', 'KIMEX', 'IN', 'South Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-BRAZA', 'Braza Tyres', 'BRAZA', 'IN', 'South Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-CAVENDISH', 'Cavendish Industries Ltd', 'CAVENDISH', 'IN', 'South Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-JIANGSU', 'Jiangsu Provincial Foreign Trade Corp', 'JIANGSU', 'CN', 'East Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-KARNAPHULI', 'Karnaphuli Shoes Industries Ltd', 'KARNAPHULI', 'BD', 'South Asia', 'FOB', 'USD', 'ISO_2000', 'active', 'standard'),
  ('KH-WINYONG', 'Shanghai Winyong Co Ltd', 'WINYONG', 'CN', 'East Asia', 'CIF', 'USD', 'ISO_2000', 'active', 'standard')
ON CONFLICT (code) DO NOTHING;

-- 5. Verify
SELECT COUNT(*) AS total_customers FROM sales_customers;
SELECT grade, grade_label FROM rubber_grade_standards ORDER BY sort_order;
SELECT column_name FROM information_schema.columns WHERE table_name = 'sales_orders' AND column_name IN ('contract_no','bl_number','discount_amount','commission_per_mt','bank_name','payment_date') ORDER BY column_name;
