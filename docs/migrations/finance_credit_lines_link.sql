-- ============================================================================
-- HẠN MỨC TÍN DỤNG (HĐTD) làm TRỤC nối Tiền gửi ↔ Khoản vay (Đợt 2b)
-- ============================================================================
-- Mô hình đúng bản chất:
--   HẠN MỨC (fin_credit_lines, vd Agribank 99 tỷ)
--      ├── được ĐẢM BẢO bởi: nhiều HĐTG  (fin_deposits.secured_credit_line_id)
--      └── được RÚT thành:   nhiều khoản vay (fin_loans.credit_line_id) → còn room
-- Bảng fin_credit_lines + fin_loans.credit_line_id đã có ở finance_loans_v1.sql.
-- Migration này chỉ thêm liên kết HĐTG → Hạn mức.
-- An toàn: add column if not exists. Chạy 1 lần.
-- ============================================================================

ALTER TABLE public.fin_deposits
  ADD COLUMN IF NOT EXISTS secured_credit_line_id uuid REFERENCES public.fin_credit_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_deposits_creditline ON public.fin_deposits(secured_credit_line_id);
CREATE INDEX IF NOT EXISTS idx_fin_loans_creditline    ON public.fin_loans(credit_line_id);

COMMENT ON COLUMN public.fin_deposits.secured_credit_line_id IS
  'HĐTG này đảm bảo (cầm cố) cho HẠN MỨC nào — nối fin_credit_lines.';

NOTIFY pgrst, 'reload schema';
