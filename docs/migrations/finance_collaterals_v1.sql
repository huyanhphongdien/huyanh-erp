-- ============================================================================
-- TÀI SẢN ĐẢM BẢO (HĐBĐ) — Đợt 3c
-- ============================================================================
-- Tài sản (xe/silo/máy/BĐS) cầm cố/thế chấp ĐẢM BẢO cho HẠN MỨC (facility).
-- Cùng với HĐTG (tiền gửi), tạo bức tranh đầy đủ: hạn mức được chống lưng bởi
-- TIỀN (tiền gửi) + TÀI SẢN (HĐBĐ). Nguồn: sheet "HĐBĐ".
-- An toàn go-live: idempotent. Chạy 1 lần.
-- ============================================================================

create table if not exists public.fin_collaterals (
  id              uuid primary key default gen_random_uuid(),
  credit_line_id  uuid references public.fin_credit_lines(id) on delete set null,
  bank            text,
  contract_ref    text,            -- số HĐ bảo đảm / HĐTD (vd 4000-LCL-...)
  asset_name      text not null,   -- mô tả tài sản
  asset_type      text,            -- tscd | bds | xe | may_moc | hang_ton | khac
  appraisal_date  date,
  appraisal_value numeric,         -- giá trị định giá
  secured_value   numeric,         -- giá trị bảo đảm (định giá × tỷ lệ cho vay)
  status          text not null default 'active',  -- active | released
  note            text,
  created_by      uuid,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_fin_collateral_line on public.fin_collaterals(credit_line_id);

alter table public.fin_collaterals enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'fin_collaterals' and policyname = 'fin_collateral_all') then
    create policy fin_collateral_all on public.fin_collaterals
      for all to authenticated using (true) with check (true);
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
