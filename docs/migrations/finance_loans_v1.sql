-- ============================================================================
-- MODULE VỐN VAY NGÂN HÀNG — Đợt 1: xương sống + chống nhảy nhóm
-- ============================================================================
-- Theo dõi khoản vay (khế ước nhận nợ) + trả nợ + hạn mức tín dụng. Trọng tâm:
-- cảnh báo TRƯỚC khi quá hạn → tránh "nhảy nhóm" CIC (quá hạn ≥10 ngày = nhóm 2,
-- ảnh hưởng chéo toàn bộ ngân hàng). Đèn trạng thái + lũy kế tính ở app/service.
--
-- An toàn go-live: create if not exists, RLS authenticated (UI siết về Admin).
-- Chạy 1 lần trên Supabase. Tiền tệ mặc định VND.
-- ============================================================================

-- ── HẠN MỨC TÍN DỤNG (HĐTD) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_credit_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank          text NOT NULL,
  contract_no   text,
  line_type     text,                 -- vay | chiet_khau | thau_chi | lc | khac
  limit_amount  numeric,              -- hạn mức
  currency      text DEFAULT 'VND',
  from_date     date,
  to_date       date,
  interest_rate numeric,              -- %/năm
  status        text DEFAULT 'active',-- active | expired | closed
  note          text,
  created_by    uuid,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- ── KHOẢN VAY / KHẾ ƯỚC NHẬN NỢ ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_loans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank           text NOT NULL,
  loan_no        text,                          -- số khế ước
  credit_line_id uuid REFERENCES public.fin_credit_lines(id) ON DELETE SET NULL,
  principal      numeric NOT NULL DEFAULT 0,    -- số vay
  currency       text DEFAULT 'VND',
  disbursed_date date,                          -- ngày giải ngân (GN)
  due_date       date NOT NULL,                 -- ngày đến hạn
  interest_rate  numeric,                       -- %/năm
  purpose        text,
  sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE SET NULL,  -- đơn nguồn tiền
  paid_amount    numeric NOT NULL DEFAULT 0,    -- tổng đã trả (trigger tự tính)
  status         text NOT NULL DEFAULT 'active',-- active | paid | cancelled
  note           text,
  created_by     uuid,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_loans_due  ON public.fin_loans(due_date);
CREATE INDEX IF NOT EXISTS idx_fin_loans_bank ON public.fin_loans(bank);

-- ── TRẢ NỢ ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fin_loan_repayments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id    uuid NOT NULL REFERENCES public.fin_loans(id) ON DELETE CASCADE,
  paid_date  date NOT NULL,
  amount     numeric NOT NULL,
  source     text,                    -- customer (tiền hàng) | cash (quỹ) | other
  note       text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fin_repay_loan ON public.fin_loan_repayments(loan_id);

-- Trigger: tổng đã trả → fin_loans.paid_amount + status (paid khi trả đủ)
CREATE OR REPLACE FUNCTION public.fn_fin_loan_recalc()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_loan uuid; v_paid numeric;
BEGIN
  v_loan := COALESCE(NEW.loan_id, OLD.loan_id);
  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.fin_loan_repayments WHERE loan_id = v_loan;
  UPDATE public.fin_loans
  SET paid_amount = v_paid,
      status = CASE WHEN status = 'cancelled' THEN 'cancelled'
                    WHEN principal > 0 AND v_paid >= principal THEN 'paid'
                    ELSE 'active' END,
      updated_at = now()
  WHERE id = v_loan;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_fin_loan_recalc ON public.fin_loan_repayments;
CREATE TRIGGER trg_fin_loan_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.fin_loan_repayments
  FOR EACH ROW EXECUTE FUNCTION public.fn_fin_loan_recalc();

-- ── RLS (nội bộ; UI siết về Admin) ──────────────────────────────────────────
ALTER TABLE public.fin_credit_lines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_loans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_loan_repayments  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fin_credit_lines_all    ON public.fin_credit_lines;
DROP POLICY IF EXISTS fin_loans_all           ON public.fin_loans;
DROP POLICY IF EXISTS fin_loan_repayments_all ON public.fin_loan_repayments;
CREATE POLICY fin_credit_lines_all    ON public.fin_credit_lines    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY fin_loans_all           ON public.fin_loans           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY fin_loan_repayments_all ON public.fin_loan_repayments FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- Kiểm: select bank, count(*), sum(principal) from fin_loans group by bank;
