-- ============================================================================
-- SALES ORDER MODULE — Quản lý đơn hàng bán quốc tế
-- Ngày: 24/03/2026
-- 5 bảng mới cho module Sales Order
-- ============================================================================

-- 1. Khách hàng quốc tế
CREATE TABLE IF NOT EXISTS sales_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  short_name VARCHAR(50),
  country VARCHAR(100),
  region VARCHAR(100),
  contact_person VARCHAR(200),
  email VARCHAR(200),
  phone VARCHAR(50),
  address TEXT,
  payment_terms VARCHAR(50),
  default_incoterm VARCHAR(10) DEFAULT 'FOB',
  default_currency VARCHAR(3) DEFAULT 'USD',
  credit_limit NUMERIC(15,2),
  quality_standard VARCHAR(50) DEFAULT 'TCVN_3769',
  custom_specs JSONB DEFAULT '{}',
  preferred_grades TEXT[],
  requires_pre_shipment_sample BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'active',
  tier VARCHAR(20) DEFAULT 'standard',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_customers_code ON sales_customers(code);
CREATE INDEX IF NOT EXISTS idx_sales_customers_status ON sales_customers(status);

-- 2. Đơn hàng bán
CREATE TABLE IF NOT EXISTS sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES sales_customers(id),
  customer_po VARCHAR(100),
  grade VARCHAR(20) NOT NULL,
  quantity_tons NUMERIC(10,2) NOT NULL,
  quantity_kg NUMERIC(12,2),
  unit_price NUMERIC(15,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  exchange_rate NUMERIC(15,4),
  total_value_usd NUMERIC(15,2),
  total_value_vnd NUMERIC(15,2),
  incoterm VARCHAR(10) DEFAULT 'FOB',
  port_of_loading VARCHAR(100),
  port_of_destination VARCHAR(100),
  drc_min NUMERIC(5,2),
  drc_max NUMERIC(5,2),
  moisture_max NUMERIC(5,2) DEFAULT 0.80,
  dirt_max NUMERIC(5,3),
  ash_max NUMERIC(5,2),
  nitrogen_max NUMERIC(5,2),
  volatile_max NUMERIC(5,2),
  pri_min NUMERIC(5,1),
  mooney_max NUMERIC(5,1),
  color_lovibond_max NUMERIC(5,1),
  packing_type VARCHAR(20) DEFAULT 'bale',
  bale_weight_kg NUMERIC(5,2) DEFAULT 33.33,
  total_bales INTEGER,
  shrink_wrap BOOLEAN DEFAULT true,
  pallet_required BOOLEAN DEFAULT false,
  marking_instructions TEXT,
  container_type VARCHAR(10),
  container_count INTEGER,
  shipping_line VARCHAR(100),
  vessel_name VARCHAR(100),
  booking_reference VARCHAR(100),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date DATE,
  etd DATE,
  eta DATE,
  payment_terms VARCHAR(50),
  lc_number VARCHAR(100),
  lc_bank VARCHAR(200),
  lc_expiry_date DATE,
  status VARCHAR(20) DEFAULT 'draft',
  production_order_id UUID,
  stock_out_id UUID,
  coa_generated BOOLEAN DEFAULT false,
  packing_list_generated BOOLEAN DEFAULT false,
  invoice_generated BOOLEAN DEFAULT false,
  bl_received BOOLEAN DEFAULT false,
  notes TEXT,
  internal_notes TEXT,
  created_by UUID,
  confirmed_by UUID,
  confirmed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_code ON sales_orders(code);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_grade ON sales_orders(grade);
CREATE INDEX IF NOT EXISTS idx_sales_orders_delivery ON sales_orders(delivery_date);

-- 3. Container trong đơn hàng
CREATE TABLE IF NOT EXISTS sales_order_containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  container_no VARCHAR(50),
  seal_no VARCHAR(50),
  container_type VARCHAR(10),
  gross_weight_kg NUMERIC(12,2),
  tare_weight_kg NUMERIC(12,2),
  net_weight_kg NUMERIC(12,2),
  bale_count INTEGER,
  status VARCHAR(20) DEFAULT 'planning',
  packed_at TIMESTAMPTZ,
  sealed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_so_containers_order ON sales_order_containers(sales_order_id);

-- 4. Bành trong container
CREATE TABLE IF NOT EXISTS sales_order_container_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id UUID NOT NULL REFERENCES sales_order_containers(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES stock_batches(id),
  batch_no VARCHAR(50),
  bale_from INTEGER,
  bale_to INTEGER,
  bale_count INTEGER,
  weight_kg NUMERIC(12,2),
  grade VARCHAR(20),
  drc NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_so_container_items ON sales_order_container_items(container_id);

-- 5. Hóa đơn bán hàng
CREATE TABLE IF NOT EXISTS sales_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  sales_order_id UUID REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES sales_customers(id),
  subtotal NUMERIC(15,2),
  freight_charge NUMERIC(15,2) DEFAULT 0,
  insurance_charge NUMERIC(15,2) DEFAULT 0,
  total_amount NUMERIC(15,2),
  currency VARCHAR(3) DEFAULT 'USD',
  exchange_rate NUMERIC(15,4),
  total_vnd NUMERIC(15,2),
  payment_terms VARCHAR(50),
  due_date DATE,
  paid_amount NUMERIC(15,2) DEFAULT 0,
  payment_status VARCHAR(20) DEFAULT 'unpaid',
  invoice_date DATE,
  bl_number VARCHAR(100),
  bl_date DATE,
  status VARCHAR(20) DEFAULT 'draft',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_order ON sales_invoices(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer ON sales_invoices(customer_id);

-- 6. RLS
ALTER TABLE sales_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_containers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_container_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all sales_customers" ON sales_customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all sales_orders" ON sales_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all sales_order_containers" ON sales_order_containers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all sales_order_container_items" ON sales_order_container_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all sales_invoices" ON sales_invoices FOR ALL USING (true) WITH CHECK (true);

-- 7. Verify
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('sales_customers', 'sales_orders', 'sales_order_containers', 'sales_order_container_items', 'sales_invoices')
ORDER BY tablename;
