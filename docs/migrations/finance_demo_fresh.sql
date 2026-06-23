-- ============================================================================
-- DỮ LIỆU DEMO MỚI cho Module Tài chính (test giao diện) — KHÔNG liên quan Excel
-- ============================================================================
-- Bộ dữ liệu hư cấu, tự nhất quán, đủ kích hoạt MỌI luồng + MỌI đèn:
--   • Hạn mức (4) ← tiền gửi + tài sản đảm bảo → khoản vay (room).
--   • Khoản vay đủ trạng thái CIC: An toàn / Sắp đến hạn / Quá hạn / Sát mốc / NHẢY NHÓM.
--   • Kỳ lãi (đã trả + chưa trả), trả nợ một phần.
--   • HĐTG đáo hạn: cần tái tục / quá hạn / còn xa.
--   • Phải thu USD: đủ nhóm tuổi nợ (trong hạn → quá >90) + 1 đã thu.
--   • Tồn quỹ đa tệ + phải nộp định kỳ → dòng tiền có cảnh báo thiếu hụt.
-- Ngày theo CURRENT_DATE → đèn luôn đúng. Tự idempotent (xoá [demo] rồi tạo lại).
-- Chạy SAU finance_reset_all.sql. Đánh dấu note '[demo]' để dễ xoá.
-- ============================================================================

begin;

-- Dọn data demo cũ (nếu chạy lại)
delete from public.fin_interest_periods where note = '[demo]';
delete from public.fin_loan_repayments  where note = '[demo]';
delete from public.fin_loans            where note = '[demo]';
delete from public.fin_receivables      where note = '[demo]';
delete from public.fin_collaterals      where note = '[demo]';
delete from public.fin_deposits         where note = '[demo]';
delete from public.fin_recurring_payables where note = '[demo]';
delete from public.fin_cash_balances    where note = '[demo]';
delete from public.fin_credit_lines     where note = '[demo]';

-- 1) HẠN MỨC TÍN DỤNG (trục)
insert into public.fin_credit_lines (bank, contract_no, line_type, limit_amount, currency, from_date, to_date, interest_rate, status, note) values
 ('Vietcombank', 'VCB-HM-2026-01', 'vay',        60000000000, 'VND', '2025-01-01', '2026-12-31', 6.4, 'active', '[demo]'),
 ('MB Bank',     'MB-HM-2026-02',  'vay',        40000000000, 'VND', '2025-03-01', '2026-12-31', 6.7, 'active', '[demo]'),
 ('ACB',         'ACB-HM-2026-03', 'chiet_khau', 25000000000, 'VND', '2025-04-01', '2026-12-31', 6.9, 'active', '[demo]'),
 ('Techcombank', 'TCB-HM-2026-04', 'vay',        35000000000, 'VND', '2025-02-01', '2026-12-31', 6.6, 'active', '[demo]');

-- 2) KHOẢN VAY — đủ trạng thái đèn CIC
insert into public.fin_loans (bank, loan_no, principal, disbursed_date, due_date, interest_rate, purpose, status, note) values
 ('Vietcombank', 'DEMO-L01', 25000000000, CURRENT_DATE - 60,  CURRENT_DATE + 20, 6.4, 'Vốn lưu động',   'active', '[demo]'),  -- 🟢 An toàn
 ('MB Bank',     'DEMO-L02', 18000000000, CURRENT_DATE - 85,  CURRENT_DATE + 4,  6.7, 'Vốn lưu động',   'active', '[demo]'),  -- 🟡 Sắp đến hạn
 ('ACB',         'DEMO-L03', 12000000000, CURRENT_DATE - 80,  CURRENT_DATE - 3,  6.9, 'Chiết khấu BCT', 'active', '[demo]'),  -- 🟠 Quá hạn (3d)
 ('Techcombank', 'DEMO-L04', 15000000000, CURRENT_DATE - 88,  CURRENT_DATE - 8,  6.6, 'Vốn lưu động',   'active', '[demo]'),  -- 🟠 Sát nhảy nhóm (8d)
 ('Vietcombank', 'DEMO-L05', 10000000000, CURRENT_DATE - 110, CURRENT_DATE - 14, 6.4, 'Vốn lưu động',   'active', '[demo]'),  -- 🔴 NHẢY NHÓM (14d)
 ('MB Bank',     'DEMO-L06',  8000000000, CURRENT_DATE - 30,  CURRENT_DATE + 45, 6.7, 'Vốn lưu động',   'active', '[demo]');  -- 🟢 An toàn

-- nối khoản vay → hạn mức theo ngân hàng
update public.fin_loans l set credit_line_id = c.id
  from public.fin_credit_lines c
  where c.bank = l.bank and c.note = '[demo]' and l.note = '[demo]' and l.credit_line_id is null;

-- trả nợ một phần (trigger tự giảm dư nợ)
insert into public.fin_loan_repayments (loan_id, paid_date, amount, source, note)
  select id, CURRENT_DATE - 5, 5000000000, 'customer', '[demo]' from public.fin_loans where loan_no = 'DEMO-L01';
insert into public.fin_loan_repayments (loan_id, paid_date, amount, source, note)
  select id, CURRENT_DATE - 3, 3000000000, 'customer', '[demo]' from public.fin_loans where loan_no = 'DEMO-L02';

-- 3) TIỀN GỬI (HĐTG) đảm bảo hạn mức — đủ trạng thái đáo hạn
insert into public.fin_deposits (bank, deposit_no, amount, deposit_date, maturity_date, interest_rate, term, purpose, status, note) values
 ('Vietcombank', 'TG-VCB-26001', 20000000000, CURRENT_DATE - 180, CURRENT_DATE + 5,   4.6, '6 tháng',  'dam_bao_vay', 'active', '[demo]'),  -- cần tái tục gấp
 ('Vietcombank', 'TG-VCB-26002', 15000000000, CURRENT_DATE - 100, CURRENT_DATE + 200, 4.8, '12 tháng', 'dam_bao_vay', 'active', '[demo]'),  -- còn xa
 ('MB Bank',     'TG-MB-26001',  25000000000, CURRENT_DATE - 150, CURRENT_DATE + 25,  4.7, '6 tháng',  'dam_bao_vay', 'active', '[demo]'),  -- sắp đáo hạn (≤30)
 ('ACB',         'TG-ACB-26001', 10000000000, CURRENT_DATE - 200, CURRENT_DATE - 2,   4.9, '6 tháng',  'dam_bao_vay', 'active', '[demo]'),  -- QUÁ HẠN tái tục
 ('Techcombank', 'TG-TCB-26001', 18000000000, CURRENT_DATE - 90,  CURRENT_DATE + 60,  4.7, '12 tháng', 'dam_bao_vay', 'active', '[demo]');
update public.fin_deposits d set secured_credit_line_id = c.id
  from public.fin_credit_lines c
  where c.bank = d.bank and c.note = '[demo]' and d.note = '[demo]' and d.secured_credit_line_id is null;

-- 4) TÀI SẢN ĐẢM BẢO (HĐBĐ)
insert into public.fin_collaterals (bank, contract_ref, asset_name, asset_type, appraisal_date, appraisal_value, secured_value, status, note) values
 ('Vietcombank', 'VCB-BD-01', 'Nhà xưởng sản xuất khu A',   'bds',     CURRENT_DATE - 200, 30000000000, 21000000000, 'active', '[demo]'),
 ('MB Bank',     'MB-BD-01',  'Dây chuyền sấy mủ tự động',  'may_moc', CURRENT_DATE - 150, 12000000000,  8000000000, 'active', '[demo]'),
 ('Techcombank', 'TCB-BD-01', 'Xe nâng + kho thành phẩm',   'tscd',    CURRENT_DATE - 120,  5000000000,  3500000000, 'active', '[demo]');
update public.fin_collaterals x set credit_line_id = c.id
  from public.fin_credit_lines c
  where c.bank = x.bank and c.note = '[demo]' and x.note = '[demo]' and x.credit_line_id is null;

-- 5) PHẢI THU KHÁCH HÀNG (USD) — đủ nhóm tuổi nợ + 1 đã thu
insert into public.fin_receivables (buyer_name, contract_no, commodity, currency, amount, amount_received, atd, term_days, bank, received_date, status, note) values
 ('EVERGREEN RUBBER PTE', 'HD-EXP-2601', 'SVR 10', 'USD', 320000, 0,      CURRENT_DATE - 100, 90, 'Vietcombank', null,              'pending',  '[demo]'),  -- quá ~10d
 ('PACIFIC LATEX CO',     'HD-EXP-2602', 'RSS 3',  'USD', 185000, 0,      CURRENT_DATE - 70,  90, 'MB Bank',     null,              'pending',  '[demo]'),  -- còn 20d
 ('ORIENT TYRE LTD',      'HD-EXP-2603', 'SVR 3L', 'USD', 240000, 0,      CURRENT_DATE - 135, 90, 'Vietcombank', null,              'pending',  '[demo]'),  -- quá ~45d
 ('GLOBAL POLYMER INC',   'HD-EXP-2604', 'SVR 10', 'USD', 150000, 0,      CURRENT_DATE - 30,  90, 'Techcombank', null,              'pending',  '[demo]'),  -- còn 60d
 ('NORTHWIND IMPORT',     'HD-EXP-2599', 'SVR 10', 'USD', 128000, 0,      CURRENT_DATE - 200, 90, 'ACB',         null,              'pending',  '[demo]'),  -- quá >90d
 ('SUMMIT TRADING LLC',   'HD-EXP-2605', 'SVR 20', 'USD',  95000, 95000,  CURRENT_DATE - 120, 90, 'MB Bank',     CURRENT_DATE - 15, 'received', '[demo]');  -- đã thu

-- 6) TỒN QUỸ NGÂN HÀNG (đa tệ)
insert into public.fin_cash_balances (bank, vnd, usd, kip, as_of_date, sort_order, note) values
 ('Vietcombank', 1250000000, 12500, 0, CURRENT_DATE, 1, '[demo]'),
 ('MB Bank',     3400000000,  8200, 0, CURRENT_DATE, 2, '[demo]'),
 ('ACB',          780000000,     0, 0, CURRENT_DATE, 3, '[demo]'),
 ('Techcombank', 2100000000,  5000, 0, CURRENT_DATE, 4, '[demo]'),
 ('Sacombank',    950000000,     0, 0, CURRENT_DATE, 5, '[demo]');

-- 7) KHOẢN PHẢI NỘP ĐỊNH KỲ
insert into public.fin_recurring_payables (name, category, due_day, amount_est, active, sort_order, note) values
 ('Thuê văn phòng & nhà xưởng', 'khac',     5,  120000000, true, 1, '[demo]'),
 ('Tiền điện nhà máy',          'dien',     12,  85000000, true, 2, '[demo]'),
 ('Bảo hiểm tài sản',           'bao_hiem', 20,  45000000, true, 3, '[demo]'),
 ('Lãi vay định kỳ (gộp)',      'lai_vay',  26,       null, true, 4, '[demo]');

-- 8) KỲ LÃI cho khoản vay demo (hằng tháng; kỳ cũ >10 ngày coi như đã trả)
insert into public.fin_interest_periods (loan_id, period_no, from_date, to_date, due_date, base_amount, rate, interest_amount, status, note)
select l.id,
       row_number() over (partition by l.id order by g.d),
       g.d::date,
       least((g.d + interval '1 month')::date, l.due_date),
       least((g.d + interval '1 month')::date, l.due_date),
       (l.principal - coalesce(l.paid_amount, 0)),
       l.interest_rate,
       round((l.principal - coalesce(l.paid_amount, 0)) * coalesce(l.interest_rate, 0) / 100
             * (least((g.d + interval '1 month')::date, l.due_date) - g.d::date) / 365),
       'pending', '[demo]'
from public.fin_loans l
cross join lateral generate_series(
  coalesce(l.disbursed_date, l.due_date - interval '3 months')::timestamp,
  (l.due_date - interval '1 day')::timestamp,
  interval '1 month'
) as g(d)
where l.loan_no like 'DEMO-L%';

update public.fin_interest_periods p
  set status = 'paid', paid_date = p.due_date, paid_amount = p.interest_amount
  where p.note = '[demo]' and p.status = 'pending' and p.due_date < current_date - 10;

commit;

-- Kiểm nhanh
-- select bank, contract_no, limit_amount,
--   (select coalesce(sum(principal-paid_amount),0) from fin_loans l where l.credit_line_id=c.id and l.status<>'paid') dang_vay
-- from fin_credit_lines c where note='[demo]' order by bank;
