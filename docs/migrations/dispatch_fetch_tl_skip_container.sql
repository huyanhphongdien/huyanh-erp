-- ============================================================
-- ĐI LẤY MỦ — XE CONTAINER: TL BỎ CÂN
-- Ngày: 2026-07-16
-- Bàn cân Tân Lâm KHÔNG cân được xe container → TL bấm "bỏ cân TL", chỉ PĐ cân.
-- Phụ thuộc: dispatch_fetch_4weigh_reconcile.sql (policy do_anon_update_weighbridge).
-- Idempotent + an toàn go-live.
-- ============================================================

ALTER TABLE public.dispatch_orders
  ADD COLUMN IF NOT EXISTS fetch_tl_skipped boolean NOT NULL DEFAULT false;

-- App cân (anon) ghi được cờ này (policy UPDATE đã có ở migration trước).
GRANT UPDATE (fetch_tl_skipped) ON public.dispatch_orders TO anon;

NOTIFY pgrst, 'reload schema';

-- VERIFY: cột đã thêm?
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'dispatch_orders'
  AND column_name = 'fetch_tl_skipped';
