-- ============================================================================
-- MTS (Make-to-Stock) flow — cho phép Sales order lấy hàng trực tiếp từ kho
-- Thay vì bắt buộc đi qua Lệnh sản xuất (MTO).
--
-- User confirmed 5 design questions (2026-04-14):
--   Q1: Hybrid (MTO + MTS song song)
--   Q2: Manual pick (user chọn tay từng lô)
--   Q3: All-or-nothing (phải đủ mới cho allocate)
--   Q4: Hard commit (trừ quantity_remaining ngay khi allocate)
--   Q5: N-N (nhiều allocation × nhiều container)
--
-- Table: sales_order_stock_allocations
-- Flow:
--   1. User mở Production Tab → chọn mode "Từ kho"
--   2. Service query stock_batches cùng grade, qc_passed, status='active'
--   3. User tick batches + nhập qty (có thể partial từ 1 batch)
--   4. Validate all-or-nothing (sum >= sales_order.quantity_kg)
--   5. INSERT allocations + trừ stock_batches.quantity_remaining
--   6. Auto-bump sales_orders.status: confirmed → ready
--   7. Khi cancel đơn → release all allocations → restore stock
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_order_stock_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  stock_batch_id uuid NOT NULL REFERENCES public.stock_batches(id) ON DELETE RESTRICT,

  -- Container link — N-N cho phép 1 allocation vào 1 container,
  -- hoặc nhiều allocation trong cùng 1 container (qua quantity_kg)
  container_id uuid REFERENCES public.sales_order_containers(id) ON DELETE SET NULL,

  -- Số lượng thực tế từ batch này vào đơn (có thể nhỏ hơn batch.quantity_remaining)
  quantity_kg numeric(12, 2) NOT NULL CHECK (quantity_kg > 0),

  -- Tracking
  allocated_at timestamptz NOT NULL DEFAULT now(),
  allocated_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,

  -- Status lifecycle: reserved → packed (vào container) → shipped
  --                   hoặc reserved → released (hủy, stock hoàn lại)
  status varchar(20) NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'packed', 'shipped', 'released')),

  -- Khi released (hủy hoặc thay batch)
  released_at timestamptz,
  released_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  release_reason text,

  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Indexes cho query patterns
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_soa_order ON public.sales_order_stock_allocations(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_soa_batch ON public.sales_order_stock_allocations(stock_batch_id);
CREATE INDEX IF NOT EXISTS idx_soa_container ON public.sales_order_stock_allocations(container_id)
  WHERE container_id IS NOT NULL;

-- Query "allocation đang active cho đơn X"
CREATE INDEX IF NOT EXISTS idx_soa_active ON public.sales_order_stock_allocations(sales_order_id, status)
  WHERE status IN ('reserved', 'packed', 'shipped');

-- ============================================================================
-- Trigger updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.touch_soa_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_soa_touch ON public.sales_order_stock_allocations;
CREATE TRIGGER trg_soa_touch
  BEFORE UPDATE ON public.sales_order_stock_allocations
  FOR EACH ROW EXECUTE FUNCTION public.touch_soa_updated_at();

-- ============================================================================
-- RLS — authenticated user R/W (app layer kiểm role)
-- ============================================================================

ALTER TABLE public.sales_order_stock_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS soa_select_auth ON public.sales_order_stock_allocations;
CREATE POLICY soa_select_auth ON public.sales_order_stock_allocations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS soa_modify_auth ON public.sales_order_stock_allocations;
CREATE POLICY soa_modify_auth ON public.sales_order_stock_allocations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================================
-- Realtime publication
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_order_stock_allocations;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY
-- ============================================================================

SELECT 'Table created' AS section;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sales_order_stock_allocations'
ORDER BY ordinal_position;

SELECT 'Indexes' AS section;
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'sales_order_stock_allocations'
ORDER BY indexname;
