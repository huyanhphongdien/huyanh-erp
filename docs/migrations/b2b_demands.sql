-- ============================================================================
-- B2B DEMANDS — Nhu cầu mua nguyên liệu
-- Ngày: 18/03/2026
-- Nhà máy đăng nhu cầu → Đại lý xem + gửi chào giá → Tạo Deal
-- ============================================================================

-- 1. Bảng nhu cầu mua
CREATE TABLE IF NOT EXISTS b2b_demands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,             -- NCM-20260318-001

  -- Loại nhu cầu
  demand_type VARCHAR(20) NOT NULL DEFAULT 'purchase',
  -- 'purchase' = mua đứt NVL
  -- 'processing' = gia công (đại lý gửi mủ)

  -- Sản phẩm cần mua
  product_type VARCHAR(50) NOT NULL,            -- mu_dong, mu_nuoc, mu_tap, svr_3l...
  product_name VARCHAR(200) NOT NULL,           -- Mủ đông, Mủ nước...
  quantity_kg NUMERIC(12,2) NOT NULL,           -- SL cần mua (kg)
  quantity_filled_kg NUMERIC(12,2) DEFAULT 0,   -- SL đã có đại lý chào

  -- Yêu cầu DRC
  drc_min NUMERIC(5,2),                         -- DRC tối thiểu
  drc_max NUMERIC(5,2),                         -- DRC tối đa (null = không giới hạn)

  -- Giá
  price_min NUMERIC(15,2),                      -- Giá sàn (đ/kg)
  price_max NUMERIC(15,2),                      -- Giá trần (đ/kg)
  price_unit VARCHAR(10) DEFAULT 'VND',         -- Đơn vị tiền

  -- Vùng thu mua ưu tiên
  preferred_regions TEXT[],                      -- ['Bình Phước', 'Tây Ninh', 'Lào']

  -- Thời gian
  deadline DATE,                                -- Hạn chót nhận chào giá
  delivery_from DATE,                           -- Giao hàng từ ngày
  delivery_to DATE,                             -- Giao hàng đến ngày

  -- Kho nhận
  warehouse_id UUID REFERENCES warehouses(id),
  pickup_location_id UUID,                      -- Địa điểm chốt hàng

  -- Trạng thái
  status VARCHAR(20) DEFAULT 'draft',
  -- 'draft' = nháp
  -- 'published' = đã đăng (đại lý thấy)
  -- 'partially_filled' = đã có 1 phần chào giá
  -- 'filled' = đủ SL
  -- 'closed' = đã đóng
  -- 'cancelled' = đã hủy

  -- Gia công specific
  processing_fee_per_ton NUMERIC(15,2),         -- Phí gia công (đ/tấn)
  expected_output_rate NUMERIC(5,2),            -- Tỷ lệ thu hồi kỳ vọng (%)
  target_grade VARCHAR(20),                     -- Grade mong muốn (SVR_3L, SVR_10...)

  -- Ghi chú
  notes TEXT,
  internal_notes TEXT,                          -- Ghi chú nội bộ (đại lý không thấy)

  -- Tracking
  priority VARCHAR(10) DEFAULT 'normal',        -- low, normal, high, urgent
  created_by UUID,
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2b_demands_status ON b2b_demands(status);
CREATE INDEX IF NOT EXISTS idx_b2b_demands_type ON b2b_demands(demand_type);
CREATE INDEX IF NOT EXISTS idx_b2b_demands_deadline ON b2b_demands(deadline);

-- 2. Bảng chào giá từ đại lý
CREATE TABLE IF NOT EXISTS b2b_demand_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id UUID NOT NULL REFERENCES b2b_demands(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL,                     -- Đại lý chào giá

  -- Chào giá
  offered_quantity_kg NUMERIC(12,2) NOT NULL,   -- SL chào
  offered_price NUMERIC(15,2) NOT NULL,         -- Giá chào (đ/kg)
  offered_drc NUMERIC(5,2),                     -- DRC cam kết
  offered_delivery_date DATE,                   -- Ngày giao dự kiến

  -- Nguồn gốc
  rubber_type VARCHAR(20),                      -- Loại mủ
  source_region VARCHAR(100),                   -- Vùng thu mua

  -- Trạng thái
  status VARCHAR(20) DEFAULT 'pending',
  -- 'pending' = chờ xem xét
  -- 'accepted' = chấp nhận → tạo Deal
  -- 'rejected' = từ chối
  -- 'withdrawn' = đại lý rút chào giá

  -- Kết quả
  deal_id UUID,                                 -- Deal tạo từ chào giá này
  rejected_reason TEXT,

  -- Tracking
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_offers_demand ON b2b_demand_offers(demand_id);
CREATE INDEX IF NOT EXISTS idx_demand_offers_partner ON b2b_demand_offers(partner_id);
CREATE INDEX IF NOT EXISTS idx_demand_offers_status ON b2b_demand_offers(status);

-- 3. RLS
ALTER TABLE b2b_demands ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_demand_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to b2b_demands"
  ON b2b_demands FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to b2b_demand_offers"
  ON b2b_demand_offers FOR ALL
  USING (true) WITH CHECK (true);

-- 4. Cập nhật b2b_deals.demand_id reference
-- (demand_id đã có trong deals nhưng chưa có FK)
-- ALTER TABLE b2b.deals ADD CONSTRAINT fk_deals_demand
--   FOREIGN KEY (demand_id) REFERENCES b2b_demands(id) ON DELETE SET NULL;

-- 5. Verify
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('b2b_demands', 'b2b_demand_offers')
ORDER BY tablename;
