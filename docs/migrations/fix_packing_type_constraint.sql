-- ============================================================================
-- FIX: chk_sales_orders_packing_type chặn code đóng gói mới
-- Date: 2026-06-25
-- ----------------------------------------------------------------------------
-- Lỗi: "new row for relation sales_orders violates check constraint
--       chk_sales_orders_packing_type" khi chọn "Shrink Wrapped plastic pallets".
-- Nguyên nhân: constraint trên prod tạo từ trước, danh sách CŨ chưa có 2 code
--   sw_plastic_pallet / sw_wooden_pallet (UI đã tách ra sau này).
-- Nguồn chuẩn 7 code: PackingType ở src/services/sales/salesTypes.ts
--   loose_bale · sw_pallet · sw_plastic_pallet · sw_wooden_pallet
--   · wooden_pallet · plastic_pallet · metal_box
--
-- Cách sửa: bỏ MỌI check constraint liên quan packing_type (bất kể tên) trên cả
--   sales_orders + sales_order_items, rồi thêm lại với ĐỦ 7 code.
-- Dùng NOT VALID → KHÔNG quét/validate dữ liệu cũ (an toàn go-live, migration
--   không thể fail vì row lịch sử), nhưng VẪN enforce cho mọi ghi mới/sửa.
-- Idempotent. Kết thúc bằng NOTIFY pgrst.
-- ============================================================================

do $mig$
declare
  c    record;
  t    text;
  tbls text[] := array['sales_orders', 'sales_order_items'];
begin
  foreach t in array tbls loop
    if to_regclass('public.' || t) is null then continue; end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'packing_type'
    ) then continue; end if;

    -- 1) Drop mọi CHECK constraint nhắc tới packing_type (bất kể tên)
    for c in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public' and rel.relname = t and con.contype = 'c'
        and pg_get_constraintdef(con.oid) ilike '%packing_type%'
    loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
      raise notice '  ✓ dropped % on %', c.conname, t;
    end loop;

    -- 2) Thêm lại với ĐỦ 7 code (NOT VALID = không đụng dữ liệu cũ)
    execute format(
      'alter table public.%I add constraint %I '
      || 'check (packing_type is null or packing_type in (%L,%L,%L,%L,%L,%L,%L)) not valid',
      t, 'chk_' || t || '_packing_type',
      'loose_bale', 'sw_pallet', 'sw_plastic_pallet', 'sw_wooden_pallet',
      'wooden_pallet', 'plastic_pallet', 'metal_box'
    );
    raise notice '  ✓ recreated chk_%_packing_type (7 code)', t;
  end loop;
end $mig$;

notify pgrst, 'reload schema';

do $$ begin
  raise notice '═══ fix_packing_type_constraint: cho phép sw_plastic_pallet + sw_wooden_pallet ✓ ═══';
end $$;
