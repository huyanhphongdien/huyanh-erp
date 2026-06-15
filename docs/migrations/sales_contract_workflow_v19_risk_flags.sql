-- ============================================================================
-- SALES CONTRACT WORKFLOW v19 — Đèn báo "HĐ lạ" + 2 làn duyệt (Nấc 4)
-- ============================================================================
-- Thêm-không-phá: HĐ cũ mặc định risk_level='standard' → luồng cũ KHÔNG đổi.
-- Khi Sale gửi / Kiểm tra duyệt, hệ thống tự chấm "standard" | "unusual" + lý do.
-- HĐ "unusual" phải được Trung/Huy (người ký) DUYỆT (risk_ack_*) trước khi ký.
--
-- An toàn go-live: idempotent (ADD COLUMN IF NOT EXISTS), không đụng dữ liệu cũ.
-- Chạy 1 lần trên Supabase SQL Editor.
-- ============================================================================

-- Mức rủi ro: 'standard' (chuẩn) | 'unusual' (lạ — cần duyệt 2)
alter table public.sales_order_contracts
  add column if not exists risk_level text not null default 'standard';

-- Danh sách mã lý do lạ, vd: ["extra_terms","bank_custom","payment_custom","upload_autofill_failed"]
alter table public.sales_order_contracts
  add column if not exists risk_reasons jsonb not null default '[]'::jsonb;

-- Người ký (Trung/Huy) đã duyệt điểm lạ + thời điểm
alter table public.sales_order_contracts
  add column if not exists risk_ack_by uuid references public.employees(id);

alter table public.sales_order_contracts
  add column if not exists risk_ack_at timestamptz;

comment on column public.sales_order_contracts.risk_level   is 'standard|unusual — đèn báo HĐ lạ (Nấc 4)';
comment on column public.sales_order_contracts.risk_reasons is 'jsonb array mã lý do lạ';
comment on column public.sales_order_contracts.risk_ack_by  is 'Người ký đã duyệt điểm lạ trước khi ký';
comment on column public.sales_order_contracts.risk_ack_at  is 'Thời điểm duyệt điểm lạ';

-- Kiểm tra:
-- select status, risk_level, risk_reasons, risk_ack_at from sales_order_contracts order by created_at desc limit 20;
