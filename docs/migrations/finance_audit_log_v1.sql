-- ============================================================================
-- NHẬT KÝ KIỂM TOÁN MODULE TÀI CHÍNH — fin_audit_log  (CHỈ ADMIN xem)
-- Date: 2026-06-25
-- ----------------------------------------------------------------------------
-- Ghi MỌI INSERT / UPDATE / DELETE trên toàn bộ bảng fin_* ở tầng DATABASE
-- (trigger) → không client nào bỏ sót hay bypass được. Mỗi dòng ghi: ai
-- (auth.uid → email + tên NV), thao tác gì, bản ghi nào, trường nào đổi (cũ→mới).
--
-- Vì sao TÁCH bảng riêng (không dùng audit_log chung):
--   audit_log chung đang cho Ban giám đốc xem (trang "Audit Log (BGĐ)").
--   Dữ liệu tài chính nhạy cảm → để "CHỈ ADMIN" ta dùng bảng riêng + RLS admin.
--
-- An toàn go-live: phần ghi log bọc trong EXCEPTION → nếu log lỗi KHÔNG chặn
-- nghiệp vụ tài chính. Idempotent: chạy lại nhiều lần đều an toàn.
-- Kết thúc bằng NOTIFY pgrst để PostgREST nạp lại schema.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1) Bảng log
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.fin_audit_log (
  id                 uuid primary key default gen_random_uuid(),
  table_name         text not null,
  record_id          uuid,
  record_code        text,
  action             text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  changed_by_user_id uuid,
  changed_by_email   text,
  changed_by_name    text,
  changed_at         timestamptz not null default now(),
  changed_fields     jsonb,   -- {field: {old, new}} cho UPDATE
  old_values         jsonb,   -- toàn bộ row cho DELETE
  new_values         jsonb    -- toàn bộ row cho INSERT
);
create index if not exists idx_fin_audit_changed_at on public.fin_audit_log (changed_at desc);
create index if not exists idx_fin_audit_table      on public.fin_audit_log (table_name);
create index if not exists idx_fin_audit_record     on public.fin_audit_log (record_id);

-- ──────────────────────────────────────────────────────────────────────────
-- 2) Ai là ADMIN tài chính — PHẢI KHỚP ADMIN_EMAILS ở src/lib/financeAccess.ts
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.fn_is_finance_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email) in ('minhld@huyanhrubber.com')
  );
$$;

-- ──────────────────────────────────────────────────────────────────────────
-- 3) RLS: CHỈ admin SELECT. Không policy INSERT/UPDATE/DELETE cho user
--    → người dùng thường KHÔNG đọc/sửa/xóa log được. Trigger ghi qua
--    SECURITY DEFINER (chạy bằng owner) nên vẫn insert được, bỏ qua RLS.
-- ──────────────────────────────────────────────────────────────────────────
alter table public.fin_audit_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'fin_audit_log' and policyname = 'fin_audit_admin_select'
  ) then
    create policy fin_audit_admin_select on public.fin_audit_log
      for select using (public.fn_is_finance_admin());
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 4) Trigger function GENERIC cho mọi bảng fin_*
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.fn_fin_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_name  text;
  v_rec   jsonb;
  v_code  text;
  v_id    uuid;
  v_chg   jsonb := '{}'::jsonb;
begin
  begin
    if v_uid is not null then
      select email     into v_email from auth.users   where id = v_uid;
      select full_name into v_name  from public.employees where user_id = v_uid limit 1;
    end if;

    v_rec := coalesce(to_jsonb(NEW), to_jsonb(OLD));

    -- record_id: mọi bảng fin_ đều có cột id uuid
    begin v_id := (v_rec->>'id')::uuid; exception when others then v_id := null; end;

    -- record_code: thử lần lượt các cột "mã/tên" thường gặp để hiển thị dễ đọc
    v_code := coalesce(
      v_rec->>'loan_no', v_rec->>'deposit_no', v_rec->>'contract_no', v_rec->>'credit_line_no',
      v_rec->>'code', v_rec->>'asset_name', v_rec->>'customer_name', v_rec->>'buyer_name',
      v_rec->>'name', v_rec->>'title', v_rec->>'bank_name', v_rec->>'bank'
    );

    if (TG_OP = 'UPDATE') then
      -- So sánh từng key giữa OLD và NEW (bỏ qua mốc thời gian tự cập nhật)
      select jsonb_object_agg(o.key, jsonb_build_object('old', o.value, 'new', n.value))
        into v_chg
        from jsonb_each(to_jsonb(OLD)) o
        join jsonb_each(to_jsonb(NEW)) n on n.key = o.key
       where o.value is distinct from n.value
         and o.key not in ('updated_at', 'created_at');

      if v_chg is not null and v_chg <> '{}'::jsonb then
        insert into public.fin_audit_log(table_name, record_id, record_code, action, changed_by_user_id, changed_by_email, changed_by_name, changed_at, changed_fields)
        values (TG_TABLE_NAME, v_id, v_code, 'UPDATE', v_uid, v_email, v_name, now(), v_chg);
      end if;

    elsif (TG_OP = 'DELETE') then
      insert into public.fin_audit_log(table_name, record_id, record_code, action, changed_by_user_id, changed_by_email, changed_by_name, changed_at, old_values)
      values (TG_TABLE_NAME, v_id, v_code, 'DELETE', v_uid, v_email, v_name, now(), to_jsonb(OLD));

    elsif (TG_OP = 'INSERT') then
      insert into public.fin_audit_log(table_name, record_id, record_code, action, changed_by_user_id, changed_by_email, changed_by_name, changed_at, new_values)
      values (TG_TABLE_NAME, v_id, v_code, 'INSERT', v_uid, v_email, v_name, now(), to_jsonb(NEW));
    end if;
  exception when others then
    -- Ghi log KHÔNG được phép chặn nghiệp vụ tài chính
    null;
  end;
  return coalesce(NEW, OLD);
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 5) Gắn trigger vào TẤT CẢ bảng fin_* (chỉ gắn nếu bảng tồn tại)
-- ──────────────────────────────────────────────────────────────────────────
do $$
declare
  t    text;
  tbls text[] := array[
    'fin_loans', 'fin_deposits', 'fin_credit_lines', 'fin_collaterals',
    'fin_interest_periods', 'fin_loan_repayments', 'fin_receivables',
    'fin_cash_balances', 'fin_recurring_payables', 'fin_attachments'
  ];
begin
  foreach t in array tbls loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_fin_audit on public.%I', t);
      execute format(
        'create trigger trg_fin_audit after insert or update or delete on public.%I '
        || 'for each row execute function public.fn_fin_audit()', t);
      raise notice '  ✓ gắn trigger audit → %', t;
    else
      raise notice '  ⚠ bỏ qua (không tồn tại): %', t;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

do $$ begin
  raise notice '═══ finance_audit_log_v1: fin_audit_log + RLS(admin) + trigger fin_* ✓ ═══';
end $$;
