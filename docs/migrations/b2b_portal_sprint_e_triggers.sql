-- ============================================================================
-- B2B Portal Sprint E — Fix 16 bugs E2E (5 DB fixes + 1 CHECK extend)
-- Date: 2026-04-21
-- ============================================================================
-- Bugs resolved:
--   BUG-1: stock_in_orders.source_type CHECK extend thêm 'b2b'
--   BUG-3: b2b.partner_ledger.running_balance auto-compute trigger
--   BUG-4: b2b.settlements thêm column paid_at + paid_by
--   BUG-5: b2b.deals.final_value auto-compute trigger (từ actual_drc × weight × price)
--   BUG-9: b2b.deals.stock_in_count auto-sync trigger (COUNT stock_in_orders)
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════
-- BUG-1: stock_in_orders.source_type add 'b2b'
-- ═══════════════════════════════════════════════════════════════
-- Find actual CHECK definition first, then recreate

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.stock_in_orders'::regclass
    AND conname = 'stock_in_orders_source_type_check';

  IF v_def IS NOT NULL AND v_def NOT LIKE '%''b2b''%' THEN
    ALTER TABLE public.stock_in_orders
      DROP CONSTRAINT stock_in_orders_source_type_check;
    ALTER TABLE public.stock_in_orders
      ADD CONSTRAINT stock_in_orders_source_type_check
      CHECK (source_type IN ('purchase', 'production', 'transfer', 'opening_balance', 'b2b'));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- BUG-4: Settlements add paid_at + paid_by columns
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE b2b.settlements
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE b2b.settlements
  ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE b2b.settlements
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) DEFAULT 0;

COMMENT ON COLUMN b2b.settlements.paid_at IS 'Timestamp khi settlement.status → paid';
COMMENT ON COLUMN b2b.settlements.paid_by IS 'Employee xác nhận thanh toán';
COMMENT ON COLUMN b2b.settlements.paid_amount IS 'Số tiền đã thanh toán (có thể partial)';

-- ═══════════════════════════════════════════════════════════════
-- BUG-9: b2b.deals.stock_in_count auto-sync
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sync_deal_stock_in_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deal_id UUID;
BEGIN
  -- Xác định deal_id cần recount
  IF TG_OP = 'DELETE' THEN
    v_deal_id := OLD.deal_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.deal_id IS DISTINCT FROM NEW.deal_id THEN
    -- Deal_id changed → recount cả OLD và NEW
    IF OLD.deal_id IS NOT NULL THEN
      UPDATE b2b.deals SET stock_in_count = (
        SELECT COUNT(*) FROM public.stock_in_orders
        WHERE deal_id = OLD.deal_id
      ) WHERE id = OLD.deal_id;
    END IF;
    v_deal_id := NEW.deal_id;
  ELSE
    v_deal_id := NEW.deal_id;
  END IF;

  IF v_deal_id IS NOT NULL THEN
    UPDATE b2b.deals SET stock_in_count = (
      SELECT COUNT(*) FROM public.stock_in_orders
      WHERE deal_id = v_deal_id
    ) WHERE id = v_deal_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_deal_stock_in_count ON public.stock_in_orders;
CREATE TRIGGER trg_sync_deal_stock_in_count
  AFTER INSERT OR UPDATE OF deal_id OR DELETE ON public.stock_in_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_deal_stock_in_count();

-- Backfill: recount cho tất cả deals hiện có
UPDATE b2b.deals d
SET stock_in_count = (
  SELECT COUNT(*) FROM public.stock_in_orders WHERE deal_id = d.id
);

-- ═══════════════════════════════════════════════════════════════
-- BUG-5: b2b.deals.final_value auto-compute
-- ═══════════════════════════════════════════════════════════════
-- Formula:
--   wet price: final_value = actual_weight_kg × unit_price
--   dry price: final_value = actual_weight_kg × (actual_drc/100) × unit_price
--   processing: giữ nguyên (logic riêng)

CREATE OR REPLACE FUNCTION b2b.compute_deal_final_value()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_price NUMERIC;
  v_unit  TEXT;
  v_drc   NUMERIC;
  v_weight NUMERIC;
BEGIN
  -- Chỉ compute nếu có đủ data
  v_weight := NEW.actual_weight_kg;
  v_drc := NEW.actual_drc;
  v_unit := COALESCE(NEW.price_unit, 'wet');
  v_price := COALESCE(NEW.final_price, NEW.unit_price);

  IF v_weight IS NULL OR v_weight <= 0 OR v_price IS NULL OR v_price <= 0 THEN
    -- Không đủ data → để NULL
    NEW.final_value := NULL;
    RETURN NEW;
  END IF;

  -- Deal type processing: không auto compute (cần phí GC)
  IF COALESCE(NEW.deal_type, 'purchase') = 'processing' THEN
    RETURN NEW;
  END IF;

  IF v_unit = 'dry' THEN
    IF v_drc IS NULL OR v_drc <= 0 THEN
      NEW.final_value := NULL;
      RETURN NEW;
    END IF;
    NEW.final_value := ROUND(v_weight * (v_drc / 100) * v_price);
  ELSE
    -- wet
    NEW.final_value := ROUND(v_weight * v_price);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_deal_final_value ON b2b.deals;
CREATE TRIGGER trg_compute_deal_final_value
  BEFORE INSERT OR UPDATE OF actual_weight_kg, actual_drc, unit_price, final_price, price_unit, deal_type
  ON b2b.deals
  FOR EACH ROW
  EXECUTE FUNCTION b2b.compute_deal_final_value();

-- Backfill cho deals đã có data
UPDATE b2b.deals
SET actual_weight_kg = actual_weight_kg  -- trigger no-op update để fire BEFORE
WHERE actual_weight_kg IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- BUG-3: b2b.partner_ledger.running_balance auto-compute
-- ═══════════════════════════════════════════════════════════════
-- running_balance = (running_balance của entry gần nhất của partner này) + debit - credit
-- Note: ORDER BY entry_date DESC, created_at DESC để pick row mới nhất

CREATE OR REPLACE FUNCTION b2b.compute_ledger_running_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_balance NUMERIC;
BEGIN
  -- Chỉ tính khi INSERT (UPDATE balance phức tạp hơn, tạm skip)
  IF TG_OP != 'INSERT' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(running_balance, 0)
  INTO v_prev_balance
  FROM b2b.partner_ledger
  WHERE partner_id = NEW.partner_id
    AND id != NEW.id
  ORDER BY entry_date DESC, created_at DESC
  LIMIT 1;

  NEW.running_balance := COALESCE(v_prev_balance, 0)
                       + COALESCE(NEW.debit, 0)
                       - COALESCE(NEW.credit, 0);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_ledger_running_balance ON b2b.partner_ledger;
CREATE TRIGGER trg_compute_ledger_running_balance
  BEFORE INSERT ON b2b.partner_ledger
  FOR EACH ROW
  EXECUTE FUNCTION b2b.compute_ledger_running_balance();

-- Backfill: Recompute all existing entries (partition by partner)
DO $$
DECLARE
  v_partner UUID;
  v_running NUMERIC;
  v_row RECORD;
BEGIN
  FOR v_partner IN
    SELECT DISTINCT partner_id FROM b2b.partner_ledger
  LOOP
    v_running := 0;
    FOR v_row IN
      SELECT id, debit, credit
      FROM b2b.partner_ledger
      WHERE partner_id = v_partner
      ORDER BY entry_date ASC, created_at ASC
    LOOP
      v_running := v_running + COALESCE(v_row.debit, 0) - COALESCE(v_row.credit, 0);
      UPDATE b2b.partner_ledger
      SET running_balance = v_running
      WHERE id = v_row.id;
    END LOOP;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- BUG-16: Patch DealCard metadata trong b2b.chat_messages
--         khi b2b.deals UPDATE (status, actual_drc, actual_weight_kg,
--         final_value, stock_in_count, qc_status)
-- ═══════════════════════════════════════════════════════════════
-- Card metadata được freeze tại thời điểm gửi → stale khi deal tiến triển.
-- Trigger sync các fields quan trọng để UI (chat) hiển thị đúng trạng thái.
-- Note: cancel_reason không phải column của b2b.deals, được patch riêng
-- qua ERP-side patchDealCardMetadata khi status='cancelled'.

CREATE OR REPLACE FUNCTION b2b.sync_deal_card_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_patch JSONB;
BEGIN
  -- Chỉ patch khi có field quan trọng thay đổi
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.actual_drc IS NOT DISTINCT FROM NEW.actual_drc
     AND OLD.actual_weight_kg IS NOT DISTINCT FROM NEW.actual_weight_kg
     AND OLD.final_value IS NOT DISTINCT FROM NEW.final_value
     AND OLD.stock_in_count IS NOT DISTINCT FROM NEW.stock_in_count
     AND OLD.qc_status IS NOT DISTINCT FROM NEW.qc_status
  THEN
    RETURN NEW;
  END IF;

  v_patch := jsonb_build_object(
    'status', NEW.status,
    'actual_drc', NEW.actual_drc,
    'actual_weight_kg', NEW.actual_weight_kg,
    'final_value', NEW.final_value,
    'stock_in_count', COALESCE(NEW.stock_in_count, 0),
    'qc_status', NEW.qc_status
  );

  -- Patch card có metadata->>'deal_id' = NEW.id
  -- Merge: metadata -> deal -> (old || patch), giữ các field khác intact
  UPDATE b2b.chat_messages
  SET metadata = jsonb_set(
    metadata,
    '{deal}',
    COALESCE(metadata->'deal', '{}'::jsonb) || v_patch
  )
  WHERE message_type = 'deal'
    AND (
      metadata->'deal'->>'deal_id' = NEW.id::text
      OR metadata->>'deal_id' = NEW.id::text
    );

  -- Cũng patch cho case metadata flat (deal_id ở root level)
  UPDATE b2b.chat_messages
  SET metadata = metadata || v_patch
  WHERE message_type = 'deal'
    AND metadata->>'deal_id' = NEW.id::text
    AND metadata->'deal' IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_deal_card_metadata ON b2b.deals;
CREATE TRIGGER trg_sync_deal_card_metadata
  AFTER UPDATE OF status, actual_drc, actual_weight_kg, final_value,
                 stock_in_count, qc_status
  ON b2b.deals
  FOR EACH ROW
  EXECUTE FUNCTION b2b.sync_deal_card_metadata();

-- ═══════════════════════════════════════════════════════════════
-- Reload PostgREST schema
-- ═══════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════

-- BUG-4: paid_at column exists
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'settlements'
  AND column_name IN ('paid_at', 'paid_by', 'paid_amount');

-- BUG-5: final_value backfilled
SELECT deal_number, actual_weight_kg, unit_price, price_unit, actual_drc, final_value
FROM b2b.deals
WHERE actual_weight_kg IS NOT NULL;

-- BUG-9: stock_in_count synced
SELECT deal_number, stock_in_count,
  (SELECT COUNT(*) FROM public.stock_in_orders WHERE deal_id = b2b.deals.id) AS actual_count
FROM b2b.deals
WHERE stock_in_count > 0
  OR EXISTS (SELECT 1 FROM public.stock_in_orders WHERE deal_id = b2b.deals.id);

-- BUG-3: running_balance correct
SELECT partner_id, entry_type, debit, credit, running_balance, entry_date
FROM b2b.partner_ledger
WHERE partner_id = '11111111-aaaa-1111-1111-000000000002'
ORDER BY entry_date ASC, created_at ASC;

-- All 5 triggers installed
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgname IN (
  'trg_sync_deal_stock_in_count',
  'trg_compute_deal_final_value',
  'trg_compute_ledger_running_balance',
  'trg_sync_deal_card_metadata'
)
ORDER BY tgname;
