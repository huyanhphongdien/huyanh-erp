-- ============================================================================
-- SIẾT RLS MODULE TÀI CHÍNH — chỉ Admin / Ban giám đốc / Phòng kế toán (Patch 3)
-- ============================================================================
-- Trước đây: mọi `fin_*` + bucket finance-docs đều USING(true) → BẤT KỲ tài khoản
-- đăng nhập nào (kể cả đối tác B2B) đọc/ghi/xoá được toàn bộ số liệu ngân hàng qua REST.
-- Sau patch này: chỉ user thỏa fn_is_finance_user() mới truy cập (DB-level, không chỉ UI).
--
-- Phân quyền (theo bảng employees/positions/departments):
--   • Admin            : email whitelist (minhld) HOẶC JWT user_metadata.is_admin/role='admin'
--   • Ban giám đốc     : positions.level <= 3 (Giám đốc / Trợ lý GĐ / Phó GĐ)
--   • Phòng kế toán    : departments.name ILIKE '%kế toán%' HOẶC email kế toán (yendt, phulv)
-- Đối tác B2B / nhân viên thường: KHÔNG có employees.user_id thỏa → bị chặn.
--
-- ⚠️ ĐỘNG PRODUCTION — CHẠY THEO THỨ TỰ:
--   1) Chạy PART 0 (SELECT chẩn đoán) — xác nhận ĐÚNG người được quyền trước.
--   2) Nếu danh sách ổn → chạy PART 1→3.
--   3) Nếu lỡ khoá nhầm → chạy PART 4 (rollback về USING(true)).
-- Idempotent: create or replace + drop-then-create. Chạy lại an toàn.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- PART 0 — CHẨN ĐOÁN (chạy riêng trước; xem ai sẽ được vào Tài chính)
-- ─────────────────────────────────────────────────────────────────────────
-- select e.full_name, e.email, p.level as pos_level, d.name as department,
--   (coalesce(p.level,99) <= 3
--    or lower(coalesce(d.name,'')) like '%kế toán%'
--    or lower(coalesce(e.email,'')) in ('minhld@huyanhrubber.com','yendt@huyanhrubber.com','phulv@huyanhrubber.com')
--   ) as duoc_xem_tai_chinh
-- from public.employees e
-- left join public.positions p   on p.id = e.position_id
-- left join public.departments d on d.id = e.department_id
-- order by duoc_xem_tai_chinh desc, e.full_name;

-- ─────────────────────────────────────────────────────────────────────────
-- PART 1 — Hàm kiểm tra quyền (SECURITY DEFINER để đọc employees/positions/departments)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.fn_is_finance_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Admin qua JWT (user_metadata hoặc app_metadata)
    coalesce((auth.jwt() -> 'user_metadata' ->> 'is_admin')::boolean, false)
    or coalesce((auth.jwt() -> 'app_metadata'  ->> 'is_admin')::boolean, false)
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
    or coalesce(auth.jwt() -> 'app_metadata'  ->> 'role', '') = 'admin'
    -- Hoặc thuộc employees: BGĐ (level<=3) / Phòng kế toán / email được cấp
    or exists (
      select 1
      from public.employees e
      left join public.positions p   on p.id = e.position_id
      left join public.departments d on d.id = e.department_id
      where e.user_id = auth.uid()
        and (
          coalesce(p.level, 99) <= 3
          or lower(coalesce(d.name, '')) like '%kế toán%'
          or lower(coalesce(e.email, '')) in (
               'minhld@huyanhrubber.com',
               'yendt@huyanhrubber.com',
               'phulv@huyanhrubber.com'
             )
        )
    );
$$;

grant execute on function public.fn_is_finance_user() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- PART 2 — Thay policy của TẤT CẢ bảng fin_* (xoá policy cũ USING(true), tạo mới)
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare t text; r record;
begin
  foreach t in array array[
    'fin_credit_lines','fin_loans','fin_loan_repayments','fin_deposits',
    'fin_interest_periods','fin_attachments','fin_collaterals','fin_receivables',
    'fin_cash_balances','fin_recurring_payables'
  ]
  loop
    -- gỡ mọi policy hiện có trên bảng (không phụ thuộc tên cũ)
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
    -- bảo đảm RLS bật + tạo policy theo vai trò
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.fn_is_finance_user()) with check (public.fn_is_finance_user())',
      t || '_fin_access', t
    );
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- PART 3 — Bucket finance-docs: thêm điều kiện vai trò vào 4 policy
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists finance_docs_select on storage.objects;
drop policy if exists finance_docs_insert on storage.objects;
drop policy if exists finance_docs_update on storage.objects;
drop policy if exists finance_docs_delete on storage.objects;

create policy finance_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'finance-docs' and public.fn_is_finance_user());
create policy finance_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'finance-docs' and public.fn_is_finance_user());
create policy finance_docs_update on storage.objects for update to authenticated
  using (bucket_id = 'finance-docs' and public.fn_is_finance_user());
create policy finance_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'finance-docs' and public.fn_is_finance_user());

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- PART 4 — ROLLBACK (chỉ chạy nếu khoá nhầm) — mở lại USING(true) như cũ
-- ─────────────────────────────────────────────────────────────────────────
-- do $$ declare t text; r record; begin
--   foreach t in array array['fin_credit_lines','fin_loans','fin_loan_repayments','fin_deposits',
--     'fin_interest_periods','fin_attachments','fin_collaterals','fin_receivables',
--     'fin_cash_balances','fin_recurring_payables'] loop
--     for r in select policyname from pg_policies where schemaname='public' and tablename=t loop
--       execute format('drop policy %I on public.%I', r.policyname, t); end loop;
--     execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t||'_all', t);
--   end loop; end $$;
-- drop policy if exists finance_docs_select on storage.objects;
-- drop policy if exists finance_docs_insert on storage.objects;
-- drop policy if exists finance_docs_update on storage.objects;
-- drop policy if exists finance_docs_delete on storage.objects;
-- create policy finance_docs_select on storage.objects for select to authenticated using (bucket_id='finance-docs');
-- create policy finance_docs_insert on storage.objects for insert to authenticated with check (bucket_id='finance-docs');
-- create policy finance_docs_update on storage.objects for update to authenticated using (bucket_id='finance-docs');
-- create policy finance_docs_delete on storage.objects for delete to authenticated using (bucket_id='finance-docs');
