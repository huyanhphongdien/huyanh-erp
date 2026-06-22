-- ============================================================================
-- SEED LỊCH TRẢ LÃI cho 7 khoản vay MẪU (MAU-01..07) — Đợt 3a
-- ============================================================================
-- Chạy SAU: finance_loans_v1.sql, finance_loans_sample.sql, finance_interest_v1.sql.
-- Sinh kỳ lãi HẰNG THÁNG từ ngày giải ngân → đáo hạn; kỳ cũ (>10 ngày trước)
-- đánh dấu ĐÃ TRẢ, kỳ gần đây + tương lai để CHƯA TRẢ → có quá hạn/đến hạn demo.
-- Idempotent: chỉ sinh cho khoản CHƯA có kỳ lãi. note '[seed-interest]' để xoá.
-- Đây là DỮ LIỆU MẪU — xoá khoản vay mẫu là kỳ lãi tự xoá theo (cascade).
-- ============================================================================

-- 1) Sinh kỳ lãi hằng tháng (lãi kỳ = dư nợ còn lại × LS/năm ÷ 12)
insert into public.fin_interest_periods
  (loan_id, period_no, from_date, to_date, due_date, base_amount, rate, interest_amount, status, note)
select
  l.id,
  row_number() over (partition by l.id order by g.d),
  g.d::date,
  least((g.d + interval '1 month')::date, l.due_date),
  least((g.d + interval '1 month')::date, l.due_date),
  (l.principal - coalesce(l.paid_amount, 0)),
  l.interest_rate,
  round((l.principal - coalesce(l.paid_amount, 0)) * coalesce(l.interest_rate, 0) / 100 / 12),
  'pending',
  '[seed-interest]'
from public.fin_loans l
cross join lateral generate_series(
  coalesce(l.disbursed_date, l.due_date - interval '3 months')::timestamp,
  (l.due_date - interval '1 day')::timestamp,
  interval '1 month'
) as g(d)
where l.loan_no like 'MAU-%'
  and not exists (select 1 from public.fin_interest_periods p where p.loan_id = l.id);

-- 2) Kỳ cũ (đến hạn > 10 ngày trước) coi như ĐÃ TRẢ đúng hạn
update public.fin_interest_periods p
set status = 'paid', paid_date = p.due_date, paid_amount = p.interest_amount
from public.fin_loans l
where p.loan_id = l.id
  and l.loan_no like 'MAU-%'
  and p.note = '[seed-interest]'
  and p.status = 'pending'
  and p.due_date < current_date - 10;

-- 3) Kiểm tra
-- select l.loan_no, p.period_no, p.due_date, p.interest_amount, p.status
-- from fin_interest_periods p join fin_loans l on l.id = p.loan_id
-- where l.loan_no like 'MAU-%' order by l.loan_no, p.due_date;
