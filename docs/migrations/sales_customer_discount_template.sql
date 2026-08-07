-- ============================================================================
-- Template chiết khấu / thanh toán mặc định theo KHÁCH — để đơn mới tự điền.
--   default_payment_method: 'lc' | 'dp' | 'da'
--   default_counterparty_bank: NH phát hành L/C (L/C) hoặc NH nhờ thu = NH người mua (D/P)
--   default_negotiate_pct / interest_rate / term_days: điều kiện chiết khấu mặc định
-- (số bản chứng từ đã có sẵn ở doc_checklist.) Idempotent.
-- ============================================================================

ALTER TABLE public.sales_customer_export_profiles
  ADD COLUMN IF NOT EXISTS default_payment_method   varchar DEFAULT 'lc',
  ADD COLUMN IF NOT EXISTS default_counterparty_bank text,
  ADD COLUMN IF NOT EXISTS default_negotiate_pct     numeric,
  ADD COLUMN IF NOT EXISTS default_interest_rate     numeric,
  ADD COLUMN IF NOT EXISTS default_term_days         integer;

COMMENT ON COLUMN public.sales_customer_export_profiles.default_payment_method IS
  'Phương thức mặc định: lc = L/C | dp = Nhờ thu D/P | da = Nhờ thu D/A.';
COMMENT ON COLUMN public.sales_customer_export_profiles.default_counterparty_bank IS
  'NH mặc định: L/C = NH phát hành · D/P = NH nhờ thu (NH người mua).';
