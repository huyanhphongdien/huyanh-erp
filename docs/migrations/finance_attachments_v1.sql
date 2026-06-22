-- ============================================================================
-- ĐÍNH KÈM TÀI LIỆU cho module VỐN VAY (Đợt 3b)
-- ============================================================================
-- 1 bảng polymorphic gắn file vào mọi đối tượng tài chính + bucket PRIVATE.
-- Tài liệu mật (khế ước, sổ tiền gửi, sao kê) → bucket private, đọc qua signed URL.
-- An toàn go-live: idempotent. Chạy 1 lần trên Supabase SQL Editor.
-- ============================================================================

-- 1) Bucket PRIVATE cho tài liệu tài chính (giới hạn 25MB/file)
insert into storage.buckets (id, name, public, file_size_limit)
values ('finance-docs', 'finance-docs', false, 26214400)
on conflict (id) do nothing;

-- 2) RLS trên storage.objects cho bucket finance-docs (chỉ user đăng nhập)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='finance_docs_select') then
    create policy finance_docs_select on storage.objects for select to authenticated using (bucket_id = 'finance-docs');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='finance_docs_insert') then
    create policy finance_docs_insert on storage.objects for insert to authenticated with check (bucket_id = 'finance-docs');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='finance_docs_update') then
    create policy finance_docs_update on storage.objects for update to authenticated using (bucket_id = 'finance-docs');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='finance_docs_delete') then
    create policy finance_docs_delete on storage.objects for delete to authenticated using (bucket_id = 'finance-docs');
  end if;
end $$;

-- 3) Bảng đính kèm polymorphic
create table if not exists public.fin_attachments (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,            -- loan | deposit | credit_line | interest | repayment
  entity_id   uuid not null,
  doc_type    text,                     -- loại chứng từ (khế ước, sổ TG, UNC…)
  file_name   text not null,
  file_path   text not null,            -- path trong bucket finance-docs
  file_size   bigint,
  mime_type   text,
  note        text,
  uploaded_by uuid,
  uploaded_at timestamptz default now()
);

create index if not exists idx_fin_attach_entity on public.fin_attachments(entity_type, entity_id);

alter table public.fin_attachments enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='fin_attachments' and policyname='fin_attach_all') then
    create policy fin_attach_all on public.fin_attachments
      for all to authenticated using (true) with check (true);
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
