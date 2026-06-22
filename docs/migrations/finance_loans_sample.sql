-- ============================================================================
-- DỮ LIỆU MẪU — Khoản vay (để test đèn nhảy nhóm + liên kết HĐTG)
-- Chạy SAU finance_loans_v1.sql. Idempotent (xoá mẫu cũ rồi tạo lại).
-- Ngày đến hạn tính theo CURRENT_DATE → đèn luôn đúng dù chạy ngày nào.
-- Xoá hết mẫu:  DELETE FROM public.fin_loans WHERE note LIKE 'MẪU%';
-- ============================================================================
BEGIN;
DELETE FROM public.fin_loan_repayments WHERE loan_id IN (SELECT id FROM public.fin_loans WHERE note LIKE 'MẪU%');
DELETE FROM public.fin_loans WHERE note LIKE 'MẪU%';

INSERT INTO public.fin_loans (bank, loan_no, principal, disbursed_date, due_date, interest_rate, purpose, status, note) VALUES
('Agribank',   'MAU-01', 30000000000, CURRENT_DATE - 60,  CURRENT_DATE + 25, 6.5, 'Vốn lưu động',   'active', 'MẪU — xoá được'),  -- 🟢 An toàn
('Vietinbank', 'MAU-02', 47600000000, CURRENT_DATE - 85,  CURRENT_DATE + 5,  6.8, 'Vốn lưu động',   'active', 'MẪU — xoá được'),  -- 🟡 Sắp đến hạn
('Eximbank',   'MAU-03',  6500000000, CURRENT_DATE - 30,  CURRENT_DATE + 40, 6.6, 'Chiết khấu BCT', 'active', 'MẪU — xoá được'),  -- 🟢 An toàn
('Agribank',   'MAU-04', 15000000000, CURRENT_DATE - 88,  CURRENT_DATE + 1,  6.5, 'Vốn lưu động',   'active', 'MẪU — xoá được'),  -- 🟡 Sắp đến hạn (mai)
('BIDV',       'MAU-05',  8000000000, CURRENT_DATE - 92,  CURRENT_DATE - 2,  6.9, 'Vốn lưu động',   'active', 'MẪU — xoá được'),  -- 🟡 Quá 2 ngày
('Seabank',    'MAU-06',  4500000000, CURRENT_DATE - 100, CURRENT_DATE - 8,  7.0, 'Vốn lưu động',   'active', 'MẪU — xoá được'),  -- 🟠 Quá 8 ngày (sát mốc)
('TPBank',     'MAU-07', 10000000000, CURRENT_DATE - 110, CURRENT_DATE - 12, 6.9, 'Vốn lưu động',   'active', 'MẪU — xoá được');  -- 🔴 Quá 12 ngày — NHẢY NHÓM

-- Trả nợ một phần (để hiện "đã trả / còn lại")
INSERT INTO public.fin_loan_repayments (loan_id, paid_date, amount, source, note)
  SELECT id, CURRENT_DATE - 5, 10000000000, 'customer', 'MẪU' FROM public.fin_loans WHERE loan_no = 'MAU-01';  -- còn 20 tỷ
INSERT INTO public.fin_loan_repayments (loan_id, paid_date, amount, source, note)
  SELECT id, CURRENT_DATE - 3, 20000000000, 'customer', 'MẪU' FROM public.fin_loans WHERE loan_no = 'MAU-02';  -- còn 27,6 tỷ

COMMIT;
NOTIFY pgrst, 'reload schema';
-- Kiểm: select bank, principal, paid_amount, due_date, status from fin_loans where note like 'MẪU%' order by due_date;
