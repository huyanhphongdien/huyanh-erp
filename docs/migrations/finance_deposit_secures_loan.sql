-- ============================================================================
-- LIÊN KẾT: HĐTG (tiền gửi) ĐẢM BẢO cho KHOẢN VAY nào
-- ============================================================================
-- Phần lớn HĐTG được cầm cố để đảm bảo khoản vay. Cột này nối từng HĐTG tới
-- khoản vay cụ thể → thể hiện rõ "cái nào chống lưng cái nào" (2 chiều):
--   • Trang Tiền gửi: hiện "Đảm bảo cho khoản vay X".
--   • Trang Khoản vay: hiện "Được đảm bảo bởi N HĐTG (Y tỷ)".
-- Xoá khoản vay → secured_loan_id tự về NULL (không mất HĐTG).
-- An toàn go-live: add column if not exists. Chạy 1 lần.
-- ============================================================================

ALTER TABLE public.fin_deposits
  ADD COLUMN IF NOT EXISTS secured_loan_id uuid REFERENCES public.fin_loans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_deposits_secured ON public.fin_deposits(secured_loan_id);

COMMENT ON COLUMN public.fin_deposits.secured_loan_id IS
  'HĐTG này đảm bảo (cầm cố) cho khoản vay nào — nối fin_loans.';

NOTIFY pgrst, 'reload schema';
