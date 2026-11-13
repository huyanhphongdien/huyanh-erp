-- ============================================================================
-- dispatch_cargo_kind.sql
-- Trục phân loại "Chở gì" cho Lệnh điều động (phân loại = Loại XE × Loại HÀNG).
--   • trip_type giữ nguyên = LUỒNG xử lý (port/trading/fetch_mu/lao/internal/other) —
--     quyết định form (bảng container, pallet, điểm bốc…). KHÔNG đụng tới.
--   • cargo_kind MỚI = loại HÀNG chở:
--       raw(mủ) · finished(thành phẩm) · goods(hàng hoá) · passenger(cán bộ/khách) ·
--       supplies(vật tư) · other.
--   (trip_type, cargo_kind) cùng nhau tái lập 5 "loại" owner liệt kê:
--     Xe cont chở mủ = (port,raw) · Xe cont thành phẩm = (port,finished) ·
--     Xe tải chở mủ = (internal,raw) · Xe tải hàng hoá = (internal,goods) ·
--     Xe con chở CBNV = (internal,passenger).
--   Loại XE suy từ xe đã chọn + nhãn thẻ — KHÔNG lưu cột riêng (tránh 2 nguồn sự thật).
-- NULL = lệnh cũ chưa phân loại; CỐ Ý không backfill (tránh gán bừa loại hàng).
-- agent_sql: KHÔNG BEGIN/COMMIT. Idempotent.
-- ============================================================================

ALTER TABLE public.dispatch_orders
  ADD COLUMN IF NOT EXISTS cargo_kind text
    CHECK (cargo_kind IN ('raw','finished','goods','passenger','supplies','other'));

COMMENT ON COLUMN public.dispatch_orders.cargo_kind IS
  'Loại hàng chở (phân loại cùng trip_type). raw=mủ, finished=thành phẩm, goods=hàng hoá, passenger=cán bộ/khách, supplies=vật tư, other=khác. NULL=lệnh cũ chưa phân loại.';

-- Lọc nhanh theo loại hàng ở Sổ lệnh / báo cáo đội xe.
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_cargo_kind
  ON public.dispatch_orders(cargo_kind) WHERE cargo_kind IS NOT NULL;
