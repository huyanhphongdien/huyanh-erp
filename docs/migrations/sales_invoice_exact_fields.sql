-- ============================================================================
-- Commercial Invoice — field bổ sung để khớp HỆT mẫu gốc (sheet INV HA20260080.xlsm)
-- Idempotent. An toàn chạy nhiều lần (go-live, data thật).
-- ============================================================================
-- Đơn: giá trị per-đơn (ghi đè mặc định khách)
alter table public.sales_orders add column if not exists proforma_date       date;   -- "AS PER PROFORMA INVOICE ... DATED <proforma_date>"
alter table public.sales_orders add column if not exists packing_desc        text;   -- kiểu đóng gói: "35 KG/BALE. LOOSE BALES."
alter table public.sales_orders add column if not exists item_no             text;   -- mã hàng của khách: vd RRB01021 (ITEM NO.)
alter table public.sales_orders add column if not exists invoice_extra_lines text;   -- dòng mô tả riêng theo khách (BOI REGISTRATION NO, BANK NAME…), mỗi dòng 1 mục

comment on column public.sales_orders.proforma_date       is 'Ngày Proforma Invoice (dòng "DATED ..." trong Commercial Invoice)';
comment on column public.sales_orders.packing_desc        is 'Kiểu đóng gói cho dòng PACKING (vd "35 KG/BALE. LOOSE BALES.")';
comment on column public.sales_orders.item_no             is 'Mã hàng của khách (ITEM NO. trong ô mô tả invoice)';
comment on column public.sales_orders.invoice_extra_lines is 'Dòng mô tả riêng theo khách trong invoice (mỗi dòng 1 mục)';

-- Hồ sơ chứng từ khách: mặc định (ổn định theo khách → tự điền cho mọi đơn)
alter table public.sales_customer_export_profiles add column if not exists default_item_no             text;
alter table public.sales_customer_export_profiles add column if not exists default_packing_desc        text;
alter table public.sales_customer_export_profiles add column if not exists default_invoice_extra_lines text;

comment on column public.sales_customer_export_profiles.default_item_no             is 'Mặc định ITEM NO. cho khách';
comment on column public.sales_customer_export_profiles.default_packing_desc        is 'Mặc định kiểu đóng gói (PACKING) cho khách';
comment on column public.sales_customer_export_profiles.default_invoice_extra_lines is 'Mặc định dòng mô tả riêng invoice cho khách';
