-- ============================================================================
-- TỒN QUỸ NGÂN HÀNG (112) + KHOẢN PHẢI NỘP ĐỊNH KỲ (Đợt 5)
-- ============================================================================
-- Nguồn: sheet "QUỸ 112" (8 bank × VNĐ/USD/KÍP) + "CÁC KHOẢN ĐẾN KỲ PHẢI NỘP".
-- An toàn go-live: idempotent. Chạy 1 lần.
-- ============================================================================

-- Tồn quỹ theo ngân hàng (đa tệ) — snapshot, cập nhật tại chỗ
create table if not exists public.fin_cash_balances (
  id          uuid primary key default gen_random_uuid(),
  bank        text not null,
  account_no  text,
  vnd         numeric default 0,
  usd         numeric default 0,
  kip         numeric default 0,
  as_of_date  date,
  note        text,
  sort_order  int default 0,
  updated_at  timestamptz default now()
);
alter table public.fin_cash_balances enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='fin_cash_balances' and policyname='fin_cash_all') then
    create policy fin_cash_all on public.fin_cash_balances for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Khoản phải nộp định kỳ (thuê TC, điện, bảo hiểm, lãi bank…)
create table if not exists public.fin_recurring_payables (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text,            -- thue_tc | dien | bao_hiem | lai_vay | thue | khac
  due_day     int,             -- ngày trong tháng (1–28); null nếu lịch phức tạp
  due_rule    text,            -- mô tả tự do (vd "3 kỳ: ngày 8/18/28")
  amount_est  numeric,         -- số tiền ước tính / kỳ
  bank        text,
  active      boolean not null default true,
  note        text,
  sort_order  int default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table public.fin_recurring_payables enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='fin_recurring_payables' and policyname='fin_payable_all') then
    create policy fin_payable_all on public.fin_recurring_payables for all to authenticated using (true) with check (true);
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
