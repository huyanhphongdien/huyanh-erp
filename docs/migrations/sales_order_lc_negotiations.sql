-- ============================================================================
-- GIAI ĐOẠN 4 — Đơn đề nghị chiết khấu / thương lượng L/C (mẫu Vietinbank BM03)
-- File: docs/migrations/sales_order_lc_negotiations.sql
-- Idempotent. RLS khớp pattern sales (authenticated).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sales_order_lc_negotiations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id    uuid NOT NULL UNIQUE REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  bank_id           uuid REFERENCES public.company_banks(id),   -- NH thụ hưởng (của Huy Anh) xin chiết khấu
  issuing_bank      text,        -- Ngân hàng phát hành L/C (của khách)
  lc_number         text,
  lc_date           date,
  negotiate_pct     numeric,     -- vd 90 (%)
  negotiate_amount  numeric,     -- vd 71440 (USD)
  interest_rate     numeric,     -- vd 4.8 (%/năm)
  term_days         int,         -- vd 110
  submitted_date    date,        -- ngày nộp NH
  status            text DEFAULT 'draft',  -- draft | submitted | financed | settled
  notes             text,
  created_by        uuid,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE public.sales_order_lc_negotiations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS soln_read   ON public.sales_order_lc_negotiations;
DROP POLICY IF EXISTS soln_write  ON public.sales_order_lc_negotiations;
DROP POLICY IF EXISTS soln_update ON public.sales_order_lc_negotiations;
DROP POLICY IF EXISTS soln_delete ON public.sales_order_lc_negotiations;
CREATE POLICY soln_read   ON public.sales_order_lc_negotiations FOR SELECT TO authenticated USING (true);
CREATE POLICY soln_write  ON public.sales_order_lc_negotiations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY soln_update ON public.sales_order_lc_negotiations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY soln_delete ON public.sales_order_lc_negotiations FOR DELETE TO authenticated USING (true);
