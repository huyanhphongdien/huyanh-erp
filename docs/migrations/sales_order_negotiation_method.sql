-- ============================================================================
-- Phương thức thanh toán cho Hối phiếu kèm bộ chứng từ:
--   'lc' = L/C (mẫu BM03), 'dp' = Nhờ thu D/P (mẫu BM08), 'da' = Nhờ thu D/A
-- Quyết định Hối phiếu (drawn under L/C vs drawn on người mua) + mẫu đơn chiết khấu.
-- Idempotent.
-- ============================================================================

ALTER TABLE public.sales_order_lc_negotiations
  ADD COLUMN IF NOT EXISTS method varchar DEFAULT 'lc';

COMMENT ON COLUMN public.sales_order_lc_negotiations.method IS
  'Phương thức: lc = L/C (BM03) | dp = Nhờ thu D/P (BM08) | da = Nhờ thu D/A. Với dp/da: issuing_bank dùng làm NH nhờ thu (NH người mua).';
