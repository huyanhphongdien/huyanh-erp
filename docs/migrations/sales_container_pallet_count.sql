-- ============================================================================
-- Weight List — thêm số PALLET/container để khớp mẫu WL (sheet WL HA20260080.xlsm)
-- Idempotent. Container hàng xuất: cột "PALLET" = số pallet trong container.
-- ============================================================================
alter table public.sales_order_containers add column if not exists pallet_count integer;
comment on column public.sales_order_containers.pallet_count is 'Số pallet trong container (cột PALLET của Weight List)';
