-- ============================================================================
-- DỮ LIỆU DEMO MỚI cho Module Tài chính (test giao diện) — KHÔNG liên quan Excel
-- ============================================================================
-- Tinh chỉnh để DÒNG TIỀN DỄ NHÌN: ngày đến hạn trải đều 6 tuần, số vừa phải.
-- Kích hoạt đủ: 6 đèn CIC · HĐTG tái tục · tài sản ĐB · tuổi nợ phải thu · hạn
-- mức thiếu đảm bảo (ACB) · dòng tiền giảm dần & chạm THIẾU HỤT ở tuần cuối.
-- Ngày theo CURRENT_DATE. Tự idempotent (xoá [demo] rồi tạo lại). Chạy SAU reset.
-- ============================================================================

begin;

delete from public.fin_interest_periods   where note = '[demo]';
delete from public.fin_loan_repayments     where note = '[demo]';
delete from public.fin_loans               where note = '[demo]';
delete from public.fin_receivables         where note = '[demo]';
delete from public.fin_collaterals         where note = '[demo]';
delete from public.fin_deposits            where note = '[demo]';
delete from public.fin_recurring_payables  where note = '[demo]';
delete from public.fin_cash_balances       where note = '[demo]';
delete from public.fin_credit_lines        where note = '[demo]';

-- 1) HẠN MỨC (trục)
insert into public.fin_credit_lines (bank, contract_no, line_type, limit_amount, currency, from_date, to_date, interest_rate, status, note) values
 ('Vietcombank', 'VCB-HM-2026-01', 'vay',        40000000000, 'VND', '2025-01-01', '2026-12-31', 6.4, 'active', '[demo]'),
 ('MB Bank',     'MB-HM-2026-02',  'vay',        30000000000, 'VND', '2025-03-01', '2026-12-31', 6.7, 'active', '[demo]'),
 ('ACB',         'ACB-HM-2026-03', 'chiet_khau', 20000000000, 'VND', '2025-04-01', '2026-12-31', 6.9, 'active', '[demo]'),  -- sẽ THIẾU đảm bảo
 ('Techcombank', 'TCB-HM-2026-04', 'vay',        25000000000, 'VND', '2025-02-01', '2026-12-31', 6.6, 'active', '[demo]');

-- 2) KHOẢN VAY — đủ 6 đèn + ngày đến hạn TRẢI ĐỀU theo tuần
insert into public.fin_loans (bank, loan_no, principal, disbursed_date, due_date, interest_rate, purpose, status, note) values
 ('Vietcombank', 'DEMO-L05', 2000000000,  CURRENT_DATE - 110, CURRENT_DATE - 12, 6.4, 'Vốn lưu động',   'active', '[demo]'),  -- 🔴 NHẢY NHÓM (quá 12d) · tuần 0
 ('Techcombank', 'DEMO-L04', 2500000000,  CURRENT_DATE - 88,  CURRENT_DATE - 8,  6.6, 'Vốn lưu động',   'active', '[demo]'),  -- 🟠 Sát mốc (quá 8d) · tuần 0
 ('ACB',         'DEMO-L03', 3000000000,  CURRENT_DATE - 80,  CURRENT_DATE - 2,  6.9, 'Chiết khấu BCT', 'active', '[demo]'),  -- 🟧 Quá hạn (2d) · tuần 0
 ('MB Bank',     'DEMO-L02', 6000000000,  CURRENT_DATE - 85,  CURRENT_DATE + 5,  6.7, 'Vốn lưu động',   'active', '[demo]'),  -- 🟡 Sắp đến hạn · tuần 0
 ('MB Bank',     'DEMO-L06', 5000000000,  CURRENT_DATE - 30,  CURRENT_DATE + 16, 6.7, 'Vốn lưu động',   'active', '[demo]'),  -- 🟢 · tuần 2
 ('Vietcombank', 'DEMO-L01', 8000000000,  CURRENT_DATE - 60,  CURRENT_DATE + 25, 6.4, 'Vốn lưu động',   'active', '[demo]'),  -- 🟢 · tuần 3
 ('ACB',         'DEMO-L07', 4000000000,  CURRENT_DATE - 20,  CURRENT_DATE + 33, 6.9, 'Vốn lưu động',   'active', '[demo]'),  -- 🟢 · tuần 4
 ('Techcombank', 'DEMO-L08', 3000000000,  CURRENT_DATE - 200, CURRENT_DATE + 50, 6.6, 'Vốn lưu động',   'active', '[demo]');  -- ⚪ sẽ TẤT TOÁN

update public.fin_loans l set credit_line_id = c.id
  from public.fin_credit_lines c
  where c.bank = l.bank and c.note = '[demo]' and l.note = '[demo]' and l.credit_line_id is null;

-- trả nợ (trigger tự giảm dư nợ); L08 trả hết → tất toán
insert into public.fin_loan_repayments (loan_id, paid_date, amount, source, note)
  select id, CURRENT_DATE - 7, 2000000000, 'customer', '[demo]' from public.fin_loans where loan_no = 'DEMO-L01';
insert into public.fin_loan_repayments (loan_id, paid_date, amount, source, note)
  select id, CURRENT_DATE - 4, 1000000000, 'customer', '[demo]' from public.fin_loans where loan_no = 'DEMO-L02';
insert into public.fin_loan_repayments (loan_id, paid_date, amount, source, note)
  select id, CURRENT_DATE - 10, 3000000000, 'cash', '[demo]' from public.fin_loans where loan_no = 'DEMO-L08';

-- 3) TIỀN GỬI (HĐTG) đảm bảo hạn mức — đủ trạng thái đáo hạn
insert into public.fin_deposits (bank, deposit_no, amount, deposit_date, maturity_date, interest_rate, term, purpose, status, note) values
 ('Vietcombank', 'TG-VCB-26001', 12000000000, CURRENT_DATE - 180, CURRENT_DATE + 5,   4.6, '6 tháng',  'dam_bao_vay', 'active', '[demo]'),  -- cần tái tục gấp (≤7)
 ('Vietcombank', 'TG-VCB-26002', 10000000000, CURRENT_DATE - 100, CURRENT_DATE + 200, 4.8, '12 tháng', 'dam_bao_vay', 'active', '[demo]'),  -- còn xa
 ('MB Bank',     'TG-MB-26001',  16000000000, CURRENT_DATE - 150, CURRENT_DATE + 25,  4.7, '6 tháng',  'dam_bao_vay', 'active', '[demo]'),  -- sắp đáo hạn (≤30)
 ('ACB',         'TG-ACB-26001',  3000000000, CURRENT_DATE - 200, CURRENT_DATE - 2,   4.9, '6 tháng',  'dam_bao_vay', 'active', '[demo]'),  -- QUÁ HẠN tái tục (nhỏ → ACB thiếu đảm bảo)
 ('Techcombank', 'TG-TCB-26001', 14000000000, CURRENT_DATE - 90,  CURRENT_DATE + 60,  4.7, '12 tháng', 'dam_bao_vay', 'active', '[demo]');
update public.fin_deposits d set secured_credit_line_id = c.id
  from public.fin_credit_lines c
  where c.bank = d.bank and c.note = '[demo]' and d.note = '[demo]' and d.secured_credit_line_id is null;

-- 4) TÀI SẢN ĐẢM BẢO (HĐBĐ) — ACB cố ý KHÔNG có tài sản → thiếu đảm bảo
insert into public.fin_collaterals (bank, contract_ref, asset_name, asset_type, appraisal_date, appraisal_value, secured_value, status, note) values
 ('Vietcombank', 'VCB-BD-01', 'Nhà xưởng sản xuất khu A',  'bds',     CURRENT_DATE - 200, 18000000000, 12600000000, 'active', '[demo]'),
 ('MB Bank',     'MB-BD-01',  'Dây chuyền sấy mủ tự động', 'may_moc', CURRENT_DATE - 150,  9000000000,  6300000000, 'active', '[demo]'),
 ('Techcombank', 'TCB-BD-01', 'Xe nâng + kho thành phẩm',  'tscd',    CURRENT_DATE - 120,  5000000000,  3500000000, 'active', '[demo]');
update public.fin_collaterals x set credit_line_id = c.id
  from public.fin_credit_lines c
  where c.bank = x.bank and c.note = '[demo]' and x.note = '[demo]' and x.credit_line_id is null;

-- 5) PHẢI THU (USD) — đủ nhóm tuổi nợ; phần lớn trải vào tuần để dòng tiền có TIỀN VÀO
insert into public.fin_receivables (buyer_name, contract_no, commodity, currency, amount, amount_received, atd, term_days, bank, received_date, status, note) values
 ('EVERGREEN RUBBER PTE', 'HD-EXP-2601', 'SVR 10', 'USD', 200000, 0,     CURRENT_DATE - 88,  90, 'Vietcombank', null,              'pending',  '[demo]'),  -- về tuần 0 (còn 2d)
 ('PACIFIC LATEX CO',     'HD-EXP-2602', 'RSS 3',  'USD', 150000, 0,     CURRENT_DATE - 78,  90, 'MB Bank',     null,              'pending',  '[demo]'),  -- về tuần 1 (+12d)
 ('ORIENT TYRE LTD',      'HD-EXP-2603', 'SVR 3L', 'USD', 180000, 0,     CURRENT_DATE - 64,  90, 'Vietcombank', null,              'pending',  '[demo]'),  -- về tuần 3 (+26d)
 ('GLOBAL POLYMER INC',   'HD-EXP-2610', 'SVR 10', 'USD',  60000, 0,     CURRENT_DATE - 100, 90, 'Techcombank', null,              'pending',  '[demo]'),  -- quá 10d (1–30)
 ('NORTHWIND IMPORT',     'HD-EXP-2599', 'SVR 20', 'USD',  50000, 0,     CURRENT_DATE - 135, 90, 'ACB',         null,              'pending',  '[demo]'),  -- quá 45d (31–60)
 ('EASTGATE COMMODITIES', 'HD-EXP-2588', 'SVR 10', 'USD',  40000, 0,     CURRENT_DATE - 165, 90, 'MB Bank',     null,              'pending',  '[demo]'),  -- quá 75d (61–90)
 ('FARSEA RUBBER TRADE',  'HD-EXP-2575', 'SVR 3L', 'USD',  35000, 0,     CURRENT_DATE - 210, 90, 'ACB',         null,              'pending',  '[demo]'),  -- quá 120d (>90)
 ('SUMMIT TRADING LLC',   'HD-EXP-2605', 'SVR 20', 'USD',  95000, 95000, CURRENT_DATE - 120, 90, 'MB Bank',     CURRENT_DATE - 15, 'received', '[demo]');  -- đã thu

-- 6) TỒN QUỸ (đa tệ) — đầu kỳ ~9,3 tỷ để dòng tiền giảm dần chạm thiếu hụt tuần cuối
insert into public.fin_cash_balances (bank, vnd, usd, kip, as_of_date, sort_order, note) values
 ('Vietcombank', 3000000000, 6000, 0, CURRENT_DATE, 1, '[demo]'),
 ('MB Bank',     2500000000, 4000, 0, CURRENT_DATE, 2, '[demo]'),
 ('ACB',         1200000000,    0, 0, CURRENT_DATE, 3, '[demo]'),
 ('Techcombank', 1500000000, 3000, 0, CURRENT_DATE, 4, '[demo]'),
 ('Sacombank',    800000000,    0, 0, CURRENT_DATE, 5, '[demo]');

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
where l.loan_no like 'DEMO-L%' and l.status <> 'paid';

update public.fin_interest_periods p
  set status = 'paid', paid_date = p.due_date, paid_amount = p.interest_amount
  where p.note = '[demo]' and p.status = 'pending' and p.due_date < current_date - 10;

commit;
