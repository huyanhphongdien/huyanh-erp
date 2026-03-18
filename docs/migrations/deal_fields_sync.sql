-- ============================================================================
-- DEAL FIELDS SYNC — Thêm trường vào b2b.deals
-- Ngày: 18/03/2026
-- Chạy trên Supabase SQL Editor
-- ============================================================================

-- 1. Thêm cột mới
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS expected_drc NUMERIC(5,2);
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS source_region VARCHAR(100);
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS rubber_type VARCHAR(50);
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS pickup_location_name VARCHAR(200);
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS price_unit VARCHAR(10) DEFAULT 'wet';
ALTER TABLE b2b.deals ADD COLUMN IF NOT EXISTS delivery_date DATE;

-- 2. Backfill rubber_type từ product_code cho deals cũ
UPDATE b2b.deals SET rubber_type = product_code WHERE rubber_type IS NULL AND product_code IS NOT NULL;

-- 3. Cập nhật VIEW
CREATE OR REPLACE VIEW public.b2b_deals AS
SELECT
    id, deal_number, partner_id, deal_type, warehouse_id,
    product_name, product_code, quantity_kg, unit_price,
    total_amount, currency, status, notes,
    created_at, updated_at, created_by,
    demand_id, offer_id, final_price, exchange_rate,
    total_value_vnd, delivery_terms, transport_fee, transport_by,
    payment_terms, delivery_schedule,
    processing_fee_per_ton, expected_output_rate, booking_id,
    actual_drc, actual_weight_kg, final_value, stock_in_count, qc_status,
    expected_drc, source_region, rubber_type,
    pickup_location_name, price_unit, delivery_date
FROM b2b.deals;

-- 4. Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'deals'
  AND column_name IN ('expected_drc', 'source_region', 'rubber_type', 'pickup_location_name', 'price_unit', 'delivery_date')
ORDER BY column_name;
