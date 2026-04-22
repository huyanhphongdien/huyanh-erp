-- ============================================================================
-- Sprint P — WMS Module fixes (audit E2E)
-- Date: 2026-04-22
-- Status: ✅ applied production via agent_sql RPC
-- ============================================================================
-- Bugs found during WMS module deep audit:
--
-- P-0 CRITICAL BUG-WMS-1: Sprint J guard enforce_weighbridge_requires_accepted
--     check 'IN' uppercase nhưng weighbridge_tickets.ticket_type là 'in'
--     lowercase → guard KHÔNG BAO GIỜ fire → bypass accepted check.
-- P-1 HIGH BUG-WMS-2: Many "Allow all" / "auth_all_*" RLS policies trên 15
--     WMS tables → public full access.
-- P-2 MED BUG-WMS-3: 4+ SECURITY DEFINER functions thiếu SET search_path
--     → hijackable.
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════
-- P-0: Fix Sprint J guard lowercase ticket_type
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enforce_weighbridge_requires_accepted_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, b2b, pg_temp
AS $$
DECLARE
  v_deal_status TEXT;
  v_deal_number TEXT;
BEGIN
  -- Guard chỉ áp cho ticket_type='in' (lowercase, match DB CHECK constraint)
  IF NEW.deal_id IS NULL
     OR NEW.ticket_type != 'in'
     OR COALESCE(NEW.status, '') IN ('cancelled', 'void')
  THEN
    RETURN NEW;
  END IF;

  SELECT status, deal_number INTO v_deal_status, v_deal_number
  FROM b2b.deals WHERE id = NEW.deal_id;

  IF v_deal_status IS NULL THEN
    RAISE EXCEPTION 'Deal % không tồn tại — không thể cân weighbridge', NEW.deal_id;
  END IF;

  IF v_deal_status NOT IN ('accepted', 'settled') THEN
    RAISE EXCEPTION
      'Deal % đang "%" — chỉ cân được khi deal đã DUYỆT. ' ||
      'Hãy QC đo DRC mẫu + BGĐ duyệt trước khi xe vào cân.',
      v_deal_number, v_deal_status;
  END IF;

  RETURN NEW;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- P-1: Drop over-permissive WMS RLS policies (15 policies)
-- ═══════════════════════════════════════════════════════════════
-- Keep granular wms_* policies: wms_read / wms_insert / wms_update / wms_delete

-- Core WMS tables
DROP POLICY IF EXISTS "Allow all materials" ON public.materials;
DROP POLICY IF EXISTS "Allow all stock_batches" ON public.stock_batches;
DROP POLICY IF EXISTS "auth_all_stock_batches" ON public.stock_batches;
DROP POLICY IF EXISTS "Allow all stock_in_orders" ON public.stock_in_orders;
DROP POLICY IF EXISTS "auth_all_stock_levels" ON public.stock_levels;
DROP POLICY IF EXISTS "Allow all stock_out_orders" ON public.stock_out_orders;
DROP POLICY IF EXISTS "auth_all_stock_out_orders" ON public.stock_out_orders;
DROP POLICY IF EXISTS "Allow all warehouses" ON public.warehouses;

-- Detail + supporting tables
DROP POLICY IF EXISTS "Allow all stock_in_details" ON public.stock_in_details;
DROP POLICY IF EXISTS "auth_all_stock_out_details" ON public.stock_out_details;
DROP POLICY IF EXISTS "auth_all_warehouse_locations" ON public.warehouse_locations;
DROP POLICY IF EXISTS "Allow all access to weighbridge_tickets" ON public.weighbridge_tickets;
DROP POLICY IF EXISTS "Allow all access to weighbridge_images" ON public.weighbridge_images;
DROP POLICY IF EXISTS "Allow all access to scale_operators" ON public.scale_operators;
DROP POLICY IF EXISTS "auth_all_inventory_transactions" ON public.inventory_transactions;


-- ═══════════════════════════════════════════════════════════════
-- P-2: SET search_path cho WMS SECURITY DEFINER functions
-- ═══════════════════════════════════════════════════════════════

ALTER FUNCTION public.trigger_set_material_code()
  SET search_path = public, b2b, pg_temp;
ALTER FUNCTION public.fn_calc_intake_batch_amount()
  SET search_path = public, b2b, pg_temp;
ALTER FUNCTION public.fn_update_material_stock_from_variants()
  SET search_path = public, b2b, pg_temp;
ALTER FUNCTION public.enforce_batch_deal_lock()
  SET search_path = public, b2b, pg_temp;
ALTER FUNCTION public.generate_material_code(uuid, uuid)
  SET search_path = public, b2b, pg_temp;


-- ═══════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════

-- P-0: Sprint J guard fire with processing deal
-- (manual test — expected RAISE EXCEPTION)

-- P-1: Zero "Allow all" WMS policies
SELECT COUNT(*) AS leftover_allow_all
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'stock_batches','stock_in_orders','stock_out_orders','stock_levels',
    'warehouses','materials','stock_in_details','stock_out_details',
    'warehouse_locations','weighbridge_tickets','weighbridge_images',
    'scale_operators','inventory_transactions'
  )
  AND (policyname ILIKE '%allow all%' OR policyname ILIKE 'auth_all%');
-- Expected: 0

-- P-2: Functions có search_path
SELECT proname, proconfig
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'trigger_set_material_code','fn_calc_intake_batch_amount',
    'fn_update_material_stock_from_variants','enforce_batch_deal_lock',
    'generate_material_code'
  )
ORDER BY proname;

NOTIFY pgrst, 'reload schema';
