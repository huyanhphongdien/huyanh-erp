-- ============================================================================
-- LỆNH ĐIỀU ĐỘNG — hỗ trợ XE THUÊ NGOÀI (không thuộc đội xe nhà)
-- ============================================================================
-- Khi thuê ngoài: KHÔNG chọn xe/tài xế từ danh mục, mà nhập tay biển số + tài xế
-- (lưu vào các cột snapshot sẵn có: tractor_plate / trailer_plate / driver_name /
-- driver_phone) + đơn vị cho thuê + cước. An toàn go-live: add column if not exists.
-- ============================================================================

alter table public.dispatch_orders
  add column if not exists is_hired     boolean not null default false,
  add column if not exists hire_company text,                 -- đơn vị / nhà xe cho thuê
  add column if not exists hire_cost    numeric(14,2);        -- cước thuê (tuỳ chọn)

comment on column public.dispatch_orders.is_hired     is 'Chuyến THUÊ XE NGOÀI (không phải đội xe nhà)';
comment on column public.dispatch_orders.hire_company is 'Đơn vị / nhà xe cho thuê';
comment on column public.dispatch_orders.hire_cost    is 'Cước thuê xe ngoài (VNĐ)';

NOTIFY pgrst, 'reload schema';
