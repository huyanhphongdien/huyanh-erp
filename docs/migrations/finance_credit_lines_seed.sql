-- ============================================================================
-- SEED HẠN MỨC TÍN DỤNG (HĐTD) + nối Tiền gửi & Khoản vay vào Hạn mức (Đợt 2b)
-- ============================================================================
-- Chạy SAU: finance_loans_v1.sql, finance_deposits_v1.sql, finance_deposits_seed.sql,
--           finance_loans_sample.sql, finance_credit_lines_link.sql.
-- Tạo 6 hạn mức theo ngân hàng, nối:
--   • HĐTG (seed) → đảm bảo hạn mức cùng ngân hàng
--   • Khoản vay MẪU (MAU-01..07) → rút từ hạn mức cùng ngân hàng
-- Idempotent: facility chống trùng theo contract_no; nối chỉ khi đang NULL.
-- Hạn mức limit lấy ~ tổng HĐTG đảm bảo (đúng thực tế cầm cố trọn hạn mức).
-- An toàn chạy lại. Đây là DỮ LIỆU MẪU — xoá hạn mức là gỡ luôn liên kết.
-- ============================================================================

-- 1) Tạo hạn mức (chỉ insert nếu chưa có contract_no đó)
insert into public.fin_credit_lines
  (bank, contract_no, line_type, limit_amount, currency, from_date, to_date, interest_rate, status, note)
select v.bank, v.contract_no, v.line_type, v.limit_amount, v.currency, v.from_date, v.to_date, v.interest_rate, v.status, v.note
from (values
  ('Agribank',   'HM-AGRI-99',  'vay', 99000000000::numeric, 'VND', '2024-01-01'::date, '2026-12-31'::date, 6.5::numeric, 'active', '[seed-hdtd] Hạn mức Agribank 99 tỷ — cầm cố HĐTG (14 sổ)'),
  ('Vietinbank', 'HM-CTG-50',   'vay', 50000000000::numeric, 'VND', '2024-06-01'::date, '2026-12-31'::date, 6.8::numeric, 'active', '[seed-hdtd] Hạn mức Vietinbank — cầm cố HĐTG'),
  ('Eximbank',   'HM-EIB-16',   'vay', 16000000000::numeric, 'VND', '2024-06-01'::date, '2026-12-31'::date, 6.6::numeric, 'active', '[seed-hdtd] Hạn mức Eximbank — cầm cố HĐTG'),
  ('Seabank',    'HM-SEAB-5',   'vay',  5000000000::numeric, 'VND', '2024-06-01'::date, '2026-12-31'::date, 7.0::numeric, 'active', '[seed-hdtd] Hạn mức Seabank'),
  ('TPBank',     'HM-TPB-12',   'vay', 12000000000::numeric, 'VND', '2024-06-01'::date, '2026-12-31'::date, 6.9::numeric, 'active', '[seed-hdtd] Hạn mức TPBank — cầm cố HĐTG'),
  ('BIDV',       'HM-BIDV-10',  'vay', 10000000000::numeric, 'VND', '2024-06-01'::date, '2026-12-31'::date, 6.9::numeric, 'active', '[seed-hdtd] Hạn mức BIDV — CHƯA có HĐTG đảm bảo (cảnh báo thiếu)')
) as v(bank, contract_no, line_type, limit_amount, currency, from_date, to_date, interest_rate, status, note)
where not exists (select 1 from public.fin_credit_lines c where c.contract_no = v.contract_no);

-- 2) Nối HĐTG → hạn mức (theo tên ngân hàng ở bảng tiền gửi seed)
update public.fin_deposits d set secured_credit_line_id = c.id
  from public.fin_credit_lines c
  where c.contract_no = 'HM-AGRI-99' and d.bank = 'AGRIBANK (99 TỶ)' and d.secured_credit_line_id is null;

update public.fin_deposits d set secured_credit_line_id = c.id
  from public.fin_credit_lines c
  where c.contract_no = 'HM-CTG-50' and d.bank = 'VIETINBANK' and d.secured_credit_line_id is null;

update public.fin_deposits d set secured_credit_line_id = c.id
  from public.fin_credit_lines c
  where c.contract_no = 'HM-EIB-16' and d.bank = 'EXIM' and d.secured_credit_line_id is null;

update public.fin_deposits d set secured_credit_line_id = c.id
  from public.fin_credit_lines c
  where c.contract_no = 'HM-SEAB-5' and d.bank = 'SEABANK' and d.secured_credit_line_id is null;

update public.fin_deposits d set secured_credit_line_id = c.id
  from public.fin_credit_lines c
  where c.contract_no = 'HM-TPB-12' and d.bank = 'TP' and d.secured_credit_line_id is null;

-- 3) Nối Khoản vay MẪU (MAU-01..07) → hạn mức cùng ngân hàng
update public.fin_loans l set credit_line_id = c.id
  from public.fin_credit_lines c
  where c.contract_no = 'HM-AGRI-99' and l.bank = 'Agribank'   and l.loan_no like 'MAU-%' and l.credit_line_id is null;

update public.fin_loans l set credit_line_id = c.id
  from public.fin_credit_lines c
  where c.contract_no = 'HM-CTG-50'  and l.bank = 'Vietinbank' and l.loan_no like 'MAU-%' and l.credit_line_id is null;

update public.fin_loans l set credit_line_id = c.id
  from public.fin_credit_lines c
  where c.contract_no = 'HM-EIB-16'  and l.bank = 'Eximbank'   and l.loan_no like 'MAU-%' and l.credit_line_id is null;

update public.fin_loans l set credit_line_id = c.id
  from public.fin_credit_lines c
  where c.contract_no = 'HM-SEAB-5'  and l.bank = 'Seabank'    and l.loan_no like 'MAU-%' and l.credit_line_id is null;

update public.fin_loans l set credit_line_id = c.id
  from public.fin_credit_lines c
  where c.contract_no = 'HM-TPB-12'  and l.bank = 'TPBank'     and l.loan_no like 'MAU-%' and l.credit_line_id is null;

update public.fin_loans l set credit_line_id = c.id
  from public.fin_credit_lines c
  where c.contract_no = 'HM-BIDV-10' and l.bank = 'BIDV'       and l.loan_no like 'MAU-%' and l.credit_line_id is null;

-- 4) Kiểm tra nhanh
-- select c.bank, c.contract_no, c.limit_amount,
--        (select coalesce(sum(l.principal-l.paid_amount),0) from fin_loans l where l.credit_line_id=c.id and l.status<>'paid') as dang_vay,
--        (select count(*) from fin_deposits d where d.secured_credit_line_id=c.id and d.status<>'closed') as so_hdtg,
--        (select coalesce(sum(d.amount),0) from fin_deposits d where d.secured_credit_line_id=c.id and d.status<>'closed') as tg_dam_bao
-- from fin_credit_lines c where c.note like '[seed-hdtd]%' order by c.bank;
