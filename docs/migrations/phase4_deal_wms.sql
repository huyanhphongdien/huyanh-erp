-- ============================================================================
-- PHASE 4: DEAL ↔ WMS — Database Migration
-- Ngày: 16/03/2026
-- Chạy trên Supabase SQL Editor
-- LƯU Ý: b2b_deals là VIEW, table gốc là b2b.deals
-- ============================================================================

-- 1. Thêm deal_id vào stock_in_orders (reference tới b2b.deals)
ALTER TABLE stock_in_orders
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES b2b.deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_in_orders_deal_id
  ON stock_in_orders(deal_id);

-- 2. Thêm các cột WMS-related vào b2b.deals (table gốc)
ALTER TABLE b2b.deals
  ADD COLUMN IF NOT EXISTS actual_drc NUMERIC(5,2);

ALTER TABLE b2b.deals
  ADD COLUMN IF NOT EXISTS actual_weight_kg NUMERIC(12,2);

ALTER TABLE b2b.deals
  ADD COLUMN IF NOT EXISTS final_value NUMERIC(15,2);

ALTER TABLE b2b.deals
  ADD COLUMN IF NOT EXISTS stock_in_count INTEGER DEFAULT 0;

ALTER TABLE b2b.deals
  ADD COLUMN IF NOT EXISTS qc_status VARCHAR(20) DEFAULT 'pending';

-- 3. Cập nhật VIEW b2b_deals để expose các cột mới
CREATE OR REPLACE VIEW public.b2b_deals AS
SELECT
    id,
    deal_number,
    partner_id,
    deal_type,
    warehouse_id,
    product_name,
    product_code,
    quantity_kg,
    unit_price,
    total_amount,
    currency,
    status,
    notes,
    created_at,
    updated_at,
    created_by,
    demand_id,
    offer_id,
    final_price,
    exchange_rate,
    total_value_vnd,
    delivery_terms,
    transport_fee,
    transport_by,
    payment_terms,
    delivery_schedule,
    processing_fee_per_ton,
    expected_output_rate,
    booking_id,
    -- Phase 4: WMS fields
    actual_drc,
    actual_weight_kg,
    final_value,
    stock_in_count,
    qc_status
FROM b2b.deals;
