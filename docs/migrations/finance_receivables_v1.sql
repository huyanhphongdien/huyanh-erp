-- ============================================================================
-- PHẢI THU KHÁCH HÀNG (Đợt 4) — tiền VÀO từ xuất khẩu
-- ============================================================================
-- Nguồn: sheet "PHẢI THU KH" (hóa đơn xuất khẩu USD, có ngày tiền về).
-- Tuổi nợ (aging) theo due_date = (ATD/ETD + term) hoặc nhập tay.
-- An toàn go-live: idempotent. sales_order_id là LIÊN KẾT MỀM (không FK cứng).
-- ============================================================================

create table if not exists public.fin_receivables (
  id              uuid primary key default gen_random_uuid(),
  sales_order_id  uuid,                       -- nối Đơn hàng bán (mềm)
  buyer_name      text not null,
  contract_no     text,
  commodity       text,
  currency        text not null default 'USD',
  amount          numeric not null default 0, -- giá trị hóa đơn
  amount_received numeric default 0,          -- đã thu
  etd             date,
  atd             date,
  term_days       int,                        -- số ngày thanh toán (vd 90)
  due_date        date,                       -- hạn thu (nếu trống → tính từ ATD/ETD + term)
  doc_sent_date   date,                       -- ngày gửi bộ chứng từ (DHL)
  doc_tracking    text,                       -- số vận đơn DHL
  bank            text,                        -- ngân hàng xử lý (L/C / nhờ thu)
  received_date   date,                       -- ngày tiền về
  status          text not null default 'pending', -- pending | received
  note            text,
  created_by      uuid,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_fin_ar_due    on public.fin_receivables(due_date);
create index if not exists idx_fin_ar_status on public.fin_receivables(status);
create index if not exists idx_fin_ar_buyer  on public.fin_receivables(buyer_name);

alter table public.fin_receivables enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'fin_receivables' and policyname = 'fin_ar_all') then
    create policy fin_ar_all on public.fin_receivables
      for all to authenticated using (true) with check (true);
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
