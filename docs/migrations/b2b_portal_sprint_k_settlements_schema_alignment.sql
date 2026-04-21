-- ============================================================================
-- B2B Portal Sprint K — Settlements schema alignment với code
-- Date: 2026-04-22
-- ============================================================================
-- Bugs phát hiện Phase B6 (click "Gửi duyệt" → 400 Bad Request):
--
-- 1. b2b.settlements thiếu 6 cột code đang UPDATE:
--      submitted_at, rejected_by, rejected_at, rejected_reason,
--      payment_method, bank_reference
-- 2. CHECK constraint thiếu status 'rejected' (code dùng nhưng CHECK reject)
-- 3. public.b2b_settlement_items VIEW không tồn tại → GET 404
--
-- Fix: ADD 6 columns + extend CHECK + CREATE VIEW security_invoker
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════
-- 1. ADD missing columns to b2b.settlements
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE b2b.settlements
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32),
  ADD COLUMN IF NOT EXISTS bank_reference VARCHAR(64);

COMMENT ON COLUMN b2b.settlements.submitted_at IS 'Timestamp khi chuyển status draft → pending_approval';
COMMENT ON COLUMN b2b.settlements.rejected_by IS 'Employee từ chối phiếu';
COMMENT ON COLUMN b2b.settlements.rejected_at IS 'Timestamp khi từ chối';
COMMENT ON COLUMN b2b.settlements.rejected_reason IS 'Lý do từ chối';
COMMENT ON COLUMN b2b.settlements.payment_method IS 'Hình thức thanh toán khi mark paid (cash/bank_transfer/etc.)';
COMMENT ON COLUMN b2b.settlements.bank_reference IS 'Số tham chiếu ngân hàng (nếu bank_transfer)';


-- ═══════════════════════════════════════════════════════════════
-- 2. Extend CHECK status list thêm 'rejected'
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE b2b.settlements DROP CONSTRAINT IF EXISTS settlements_status_check;
ALTER TABLE b2b.settlements ADD CONSTRAINT settlements_status_check
  CHECK (status IN (
    'draft',
    'pending_approval',
    'approved',
    'partial_paid',
    'paid',
    'cancelled',
    'rejected'
  ));


-- ═══════════════════════════════════════════════════════════════
-- 3. CREATE VIEW public.b2b_settlement_items
-- ═══════════════════════════════════════════════════════════════
-- Pattern giống các b2b_* view khác: security_invoker=true để reader dùng
-- RLS của base table b2b.settlement_items thay vì view owner.

DROP VIEW IF EXISTS public.b2b_settlement_items;

CREATE VIEW public.b2b_settlement_items
WITH (security_invoker = true)
AS
SELECT * FROM b2b.settlement_items;

GRANT SELECT ON public.b2b_settlement_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.b2b_settlement_items TO authenticated;


-- ═══════════════════════════════════════════════════════════════
-- Reload PostgREST
-- ═══════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════

-- 1. 6 cột đã add
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'settlements'
  AND column_name IN (
    'submitted_at', 'rejected_by', 'rejected_at', 'rejected_reason',
    'payment_method', 'bank_reference'
  )
ORDER BY column_name;
-- Expected: 6 rows

-- 2. CHECK đã có 'rejected'
SELECT pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conname = 'settlements_status_check';
-- Expected: definition chứa 'rejected'

-- 3. View b2b_settlement_items tồn tại + security_invoker
SELECT c.relname, (array_to_string(c.reloptions, ',') LIKE '%security_invoker=true%') AS invoker
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' AND c.relname = 'b2b_settlement_items';
-- Expected: 1 row, invoker=true
