-- ============================================================================
-- Migration: Payment history for Sales Orders
-- Tạo bảng sales_order_payments để lưu lịch sử các lần thu tiền
-- (thay vì ghi đè actual_payment_amount như cũ).
--
-- Cách A đã chốt: payment_status và order.status COUPLE chặt với nhau.
-- App layer (salesOrderPaymentService) sẽ:
--   1. Sau mỗi insert/update/delete payment, recompute total_paid
--   2. Update sales_orders.actual_payment_amount = total_paid
--   3. Update payment_status (unpaid/partial/paid)
--   4. Nếu payment_status = 'paid' và order.status ∈ (shipped, delivered, invoiced)
--      → bump order.status từng bước cho tới 'paid'.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_order_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id  uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,

  -- Khi nào & bao nhiêu
  payment_date    date NOT NULL,
  amount          numeric(15, 2) NOT NULL CHECK (amount > 0),
  currency        varchar(10) NOT NULL DEFAULT 'USD',
  exchange_rate   numeric(12, 4),                     -- Tỷ giá USD→VND ngày trả
  amount_vnd      numeric(18, 2),                     -- amount × exchange_rate (snapshot)

  -- Loại khoản thu (chi tiết theo nghiệp vụ rubber export)
  payment_type    varchar(20) NOT NULL CHECK (payment_type IN (
    'deposit',       -- Đặt cọc trước khi giao
    'installment',   -- Trả lẻ giữa kỳ
    'final',         -- Trả cuối / tất toán
    'discount_lc',   -- Chiết khấu LC
    'fee_offset',    -- Bù trừ phí (vd: phí NH, vận tải)
    'other'          -- Khác
  )),

  -- Ngân hàng & tham chiếu
  bank_name       text,
  bank_reference  text,                               -- Số tham chiếu sao kê NH
  swift_code      text,
  fee_amount      numeric(15, 2) DEFAULT 0,           -- Phí NH cho riêng giao dịch này

  -- Audit
  notes           text,
  created_by      uuid REFERENCES public.employees(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sop_order      ON public.sales_order_payments(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sop_date       ON public.sales_order_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_sop_type       ON public.sales_order_payments(payment_type);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_sop_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sop_touch ON public.sales_order_payments;
CREATE TRIGGER trg_sop_touch
  BEFORE UPDATE ON public.sales_order_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_sop_updated_at();

-- ============================================================================
-- RLS: bật để dùng PostgREST. Policy đơn giản — service_role bypass mặc định.
-- ============================================================================

ALTER TABLE public.sales_order_payments ENABLE ROW LEVEL SECURITY;

-- Authenticated user đọc tất cả (UI cần)
DROP POLICY IF EXISTS sop_select_auth ON public.sales_order_payments;
CREATE POLICY sop_select_auth ON public.sales_order_payments
  FOR SELECT TO authenticated USING (true);

-- Authenticated user insert/update/delete (app layer kiểm role thêm)
DROP POLICY IF EXISTS sop_modify_auth ON public.sales_order_payments;
CREATE POLICY sop_modify_auth ON public.sales_order_payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================================
-- DATA MIGRATION: convert legacy fields → payment rows
-- - Mỗi đơn có deposit_amount > 0 → 1 payment 'deposit'
-- - Mỗi đơn có actual_payment_amount > 0 → 1 payment 'final' (con số tổng)
-- ============================================================================

INSERT INTO public.sales_order_payments
  (sales_order_id, payment_date, amount, currency, payment_type, notes)
SELECT
  id,
  COALESCE(deposit_date, order_date, current_date),
  deposit_amount,
  COALESCE(currency, 'USD'),
  'deposit',
  'Migrated from legacy deposit_amount field'
FROM public.sales_orders
WHERE deposit_amount IS NOT NULL AND deposit_amount > 0;

INSERT INTO public.sales_order_payments
  (sales_order_id, payment_date, amount, currency, payment_type, notes)
SELECT
  id,
  COALESCE(payment_received_date, payment_date, delivery_date, current_date),
  actual_payment_amount,
  COALESCE(currency, 'USD'),
  CASE
    WHEN payment_status = 'paid' THEN 'final'
    ELSE 'installment'
  END,
  'Migrated from legacy actual_payment_amount field'
FROM public.sales_orders
WHERE actual_payment_amount IS NOT NULL AND actual_payment_amount > 0;

COMMIT;

-- ============================================================================
-- Add to realtime publication (để timeline tự refresh khi có payment mới)
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_order_payments;

-- Reload PostgREST schema cache để FK mới detect
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT
  'Total payments migrated' AS metric,
  COUNT(*) AS value
FROM public.sales_order_payments
UNION ALL
SELECT 'Orders with deposit migrated',
  COUNT(DISTINCT sales_order_id)
FROM public.sales_order_payments WHERE payment_type = 'deposit'
UNION ALL
SELECT 'Orders with final/installment migrated',
  COUNT(DISTINCT sales_order_id)
FROM public.sales_order_payments WHERE payment_type IN ('final','installment');
