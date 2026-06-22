-- ============================================================================
-- LÃI VAY + LỊCH TRẢ LÃI (Đợt 3a) — kỳ lãi phải trả theo khoản vay
-- ============================================================================
-- Mỗi khoản vay sinh ra nhiều KỲ LÃI (monthly/quarterly/yearly/end). Theo dõi
-- kỳ nào đã trả / chưa, đến hạn → nhắc kế toán không miss kỳ lãi.
-- An toàn go-live: create if not exists, add column if not exists. Chạy 1 lần.
-- ============================================================================

create table if not exists public.fin_interest_periods (
  id              uuid primary key default gen_random_uuid(),
  loan_id         uuid not null references public.fin_loans(id) on delete cascade,
  period_no       int,
  from_date       date,
  to_date         date,
  due_date        date not null,                 -- ngày phải trả lãi kỳ này
  base_amount     numeric default 0,             -- dư nợ gốc dùng tính lãi kỳ
  rate            numeric,                        -- lãi suất %/năm áp cho kỳ
  interest_amount numeric not null default 0,    -- số lãi phải trả kỳ
  status          text not null default 'pending', -- pending | paid
  paid_date       date,
  paid_amount     numeric,
  note            text,
  created_by      uuid,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_fin_interest_loan on public.fin_interest_periods(loan_id);
create index if not exists idx_fin_interest_due  on public.fin_interest_periods(due_date);

alter table public.fin_interest_periods enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'fin_interest_periods' and policyname = 'fin_interest_all') then
    create policy fin_interest_all on public.fin_interest_periods
      for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Cấu hình lãi mặc định trên khoản vay (để tự sinh lịch)
alter table public.fin_loans add column if not exists interest_freq text;  -- monthly | quarterly | yearly | end
alter table public.fin_loans add column if not exists interest_day  int;   -- ngày trả lãi trong tháng (1–28)

NOTIFY pgrst, 'reload schema';
