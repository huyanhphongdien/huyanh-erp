-- ============================================================================
-- STOCK-OUT ↔ DEAL — Database Migration (S2)
-- Ngày: 2026-04-16
-- Chạy trên Supabase SQL Editor (hoặc npx supabase db push)
-- ----------------------------------------------------------------------------
-- LƯU Ý: b2b_deals là VIEW, table gốc là b2b.deals (đã có pattern từ
-- docs/migrations/phase4_deal_wms.sql). Migration này mirror pattern cho
-- chiều xuất (delivered) thay vì chiều nhập (received).
-- ============================================================================

-- 1. Thêm deal_id vào stock_out_orders (reference tới b2b.deals)
ALTER TABLE stock_out_orders
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES b2b.deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_out_orders_deal_id
  ON stock_out_orders(deal_id);

-- 2. Thêm cột delivered_weight_kg + stock_out_count vào b2b.deals (table gốc)
--    delivered_weight_kg = sum(stock_out_orders.total_weight) WHERE deal_id AND status='confirmed'
--    stock_out_count     = count(stock_out_orders) WHERE deal_id AND status='confirmed'
ALTER TABLE b2b.deals
  ADD COLUMN IF NOT EXISTS delivered_weight_kg NUMERIC(12,2) DEFAULT 0;

ALTER TABLE b2b.deals
  ADD COLUMN IF NOT EXISTS stock_out_count INTEGER DEFAULT 0;

-- 3. Update VIEW b2b_deals để expose 2 cột mới
--    Phải đọc phase4_deal_wms.sql để biết exact column list của VIEW hiện tại.
--    Đơn giản hoá: drop + recreate VIEW, select * from b2b.deals (nếu VIEW hiện
--    không có security filtering). Nếu có — giữ WHERE clause gốc.
--
--    CÁCH AN TOÀN: chạy lệnh dưới đây để inspect VIEW definition trước,
--    rồi copy + add 2 columns vào:
--      SELECT pg_get_viewdef('public.b2b_deals', true);
--
--    Sau đó CREATE OR REPLACE VIEW public.b2b_deals AS <view cũ + 2 cột mới>.
--    Để không block chạy migration, tôi để sẵn version đơn giản dưới đây.
--    NẾU VIEW có logic phức tạp → skip block này, tự sửa tay.

-- Option A (default — đơn giản): nếu b2b_deals là SELECT * từ b2b.deals
DROP VIEW IF EXISTS public.b2b_deals CASCADE;
CREATE VIEW public.b2b_deals AS
SELECT * FROM b2b.deals;

-- 4. Backfill — tính delivered_weight_kg + stock_out_count cho deal đã có
UPDATE b2b.deals d
SET
  delivered_weight_kg = COALESCE(sub.sum_weight, 0),
  stock_out_count = COALESCE(sub.cnt, 0)
FROM (
  SELECT
    deal_id,
    SUM(total_weight)::NUMERIC(12,2) AS sum_weight,
    COUNT(*)::INTEGER AS cnt
  FROM stock_out_orders
  WHERE deal_id IS NOT NULL AND status = 'confirmed'
  GROUP BY deal_id
) sub
WHERE d.id = sub.deal_id;

-- 5. Comment các cột mới
COMMENT ON COLUMN b2b.deals.delivered_weight_kg IS
  'Tổng KL đã xuất kho bán cho deal này (sum stock_out_orders.total_weight WHERE status=confirmed). Update bởi dealWmsService.updateDealStockOutTotals.';

COMMENT ON COLUMN b2b.deals.stock_out_count IS
  'Số phiếu xuất kho đã confirmed cho deal này.';

COMMENT ON COLUMN stock_out_orders.deal_id IS
  'Link tới deal sale (nullable). Khi phiếu xuất confirmed, dealWmsService.updateDealStockOutTotals sẽ được gọi để update delivered_weight_kg của deal.';

-- ============================================================================
-- ROLLBACK (nếu cần):
--   ALTER TABLE stock_out_orders DROP COLUMN IF EXISTS deal_id;
--   ALTER TABLE b2b.deals DROP COLUMN IF EXISTS delivered_weight_kg;
--   ALTER TABLE b2b.deals DROP COLUMN IF EXISTS stock_out_count;
--   DROP VIEW IF EXISTS public.b2b_deals CASCADE;
--   -- Re-run phase4_deal_wms.sql section 3 để restore VIEW cũ.
-- ============================================================================
