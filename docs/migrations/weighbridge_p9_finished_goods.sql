-- ============================================================================
-- APP CÂN — NHẬP THÀNH PHẨM / HÀNG THƯƠNG MẠI, CÂN TỪNG MÃ HÀNG (30/09/2026)
-- ============================================================================
-- Xe chở thành phẩm (vd TPSVR 3L của Ea H'Leo, Gia Lai) về nhà máy, trên xe nhiều mã hàng.
-- Owner: "nhiều mã đều cân được" → cân bậc thang (tổng → dỡ mã 1 → cân → … → xe rỗng),
-- mỗi mã = hiệu 2 lần cân. Kèm 2 số đối chiếu: KL khai báo (Lý lịch mủ) và số bành × kg/bành.
-- Treo (chưa làm): nhập kho WMS nào, ai chịu chênh lệch — chỉ làm phần CÂN.
--
-- Idempotent. Chạy qua RPC agent_sql: KHÔNG BEGIN/COMMIT, mỗi statement 1 lần gọi.
-- ============================================================================

-- 1. Phiếu cân: loại hàng + số Lý lịch mủ; source_type thêm 'finished_goods'
ALTER TABLE public.weighbridge_tickets
  ADD COLUMN IF NOT EXISTS cargo_kind  text NOT NULL DEFAULT 'raw',
  ADD COLUMN IF NOT EXISTS manifest_no text;

ALTER TABLE public.weighbridge_tickets DROP CONSTRAINT IF EXISTS chk_wt_cargo_kind;

ALTER TABLE public.weighbridge_tickets
  ADD CONSTRAINT chk_wt_cargo_kind CHECK (cargo_kind IN ('raw', 'finished'));

ALTER TABLE public.weighbridge_tickets DROP CONSTRAINT IF EXISTS weighbridge_tickets_source_type_check;

ALTER TABLE public.weighbridge_tickets
  ADD CONSTRAINT weighbridge_tickets_source_type_check
  CHECK (source_type IS NULL OR source_type IN ('deal', 'supplier', 'partner_direct', 'transfer', 'retail', 'finished_goods'));

-- 2. Lô trên phiếu: thêm thông tin thành phẩm + số đối chiếu
--    lot_code   = mã hàng (vd TM H'LEO-01)      grade = SVR 3L / SVR 10 / RSS3 …
--    bale_count × bale_kg = KL theo bành          declared_kg = KL khai báo trên Lý lịch mủ
--    weigh_after_kg = số cân xe SAU KHI DỠ lô này (truy vết; lô cuối = xe rỗng)
ALTER TABLE public.weighbridge_ticket_lots
  ADD COLUMN IF NOT EXISTS grade          text,
  ADD COLUMN IF NOT EXISTS bale_count     integer,
  ADD COLUMN IF NOT EXISTS bale_kg        numeric,
  ADD COLUMN IF NOT EXISTS declared_kg    numeric,
  ADD COLUMN IF NOT EXISTS weigh_after_kg numeric;

COMMENT ON COLUMN public.weighbridge_tickets.cargo_kind IS 'raw = mủ nguyên liệu (mặc định) · finished = thành phẩm/hàng thương mại (lô = mã hàng, không DRC, không sinh rubber_intake_batches)';
