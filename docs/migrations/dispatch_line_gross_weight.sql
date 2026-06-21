-- ============================================================================
-- DISPATCH LINE — KL GROSS (GW) do người ra lệnh điều động nhập
-- ============================================================================
-- KL KẾ HOẠCH hiện = net (sales_order_containers.net_weight_kg). Người ra lệnh
-- điều động là người theo dõi GW (net + bao bì/pallet) khi xếp hàng, nên nhập GW
-- ngay trên dòng lệnh. GW này được ghi ngược về sales_order_containers.gross_weight_kg
-- để Packing List / B/L gửi khách dùng đúng số (thay vì ước net × 1.02).
--
-- An toàn go-live: add column if not exists. Chạy 1 lần trên Supabase.
-- ============================================================================

ALTER TABLE public.dispatch_order_lines
  ADD COLUMN IF NOT EXISTS gross_weight_kg numeric;

COMMENT ON COLUMN public.dispatch_order_lines.gross_weight_kg IS
  'KL gross (GW = net + bao bì) do người ra lệnh điều động nhập; ghi ngược về sales_order_containers.gross_weight_kg.';

-- Kiểm: select code, weight_kg, gross_weight_kg from dispatch_order_lines order by created_at desc limit 20;
