-- ============================================================================
-- XOÁ SẠCH TOÀN BỘ DỮ LIỆU MODULE TÀI CHÍNH (test reset)
-- ============================================================================
-- Mục đích: dọn hết dữ liệu đang test (vốn lấy từ file Excel) để thay bằng bộ
-- dữ liệu mới hoàn toàn (finance_demo_fresh.sql) — không truy ngược về Excel.
-- ⚠ XOÁ HẾT mọi dòng trong các bảng fin_* (kể cả bản ghi đính kèm test).
--   File đã upload vào bucket finance-docs (nếu có) sẽ mồ côi — không sao khi test.
-- An toàn: module này chỉ chứa data test (chưa nhập số thật). Chạy 1 lần.
-- ============================================================================

begin;
delete from public.fin_attachments;        -- bản ghi đính kèm (test)
delete from public.fin_interest_periods;    -- kỳ lãi
delete from public.fin_loan_repayments;     -- lịch sử trả nợ
delete from public.fin_loans;               -- khoản vay
delete from public.fin_receivables;         -- phải thu
delete from public.fin_collaterals;         -- tài sản đảm bảo
delete from public.fin_deposits;            -- tiền gửi
delete from public.fin_recurring_payables;  -- phải nộp định kỳ
delete from public.fin_cash_balances;       -- tồn quỹ
delete from public.fin_credit_lines;        -- hạn mức (trục)
commit;

-- Kiểm: phải ra 0 hết
-- select 'credit_lines' t, count(*) c from public.fin_credit_lines
-- union all select 'loans', count(*) from public.fin_loans
-- union all select 'deposits', count(*) from public.fin_deposits
-- union all select 'collaterals', count(*) from public.fin_collaterals
-- union all select 'receivables', count(*) from public.fin_receivables
-- union all select 'cash', count(*) from public.fin_cash_balances
-- union all select 'payables', count(*) from public.fin_recurring_payables
-- union all select 'interest', count(*) from public.fin_interest_periods;
