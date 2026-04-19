-- ============================================================================
-- FIX: GRANT UPDATE cho anon trên b2b.deal_delivery_plans (base table)
-- Ngày: 2026-04-19
--
-- Nguyên nhân: Migration b2b_deal_delivery_plans.sql grant UPDATE trên
-- VIEW public.b2b_deal_delivery_plans cho anon nhưng KHÔNG grant trên
-- base table b2b.deal_delivery_plans. View security_invoker=true →
-- caller role (anon từ weighbridge) truy cập base table → permission
-- denied (42501) → matchFromWeighbridge fail silent → plan status vẫn
-- 'pending' dù ticket đã cân xong.
-- ============================================================================

-- BƯỚC 1 — GRANT trên base table
GRANT SELECT, UPDATE ON b2b.deal_delivery_plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON b2b.deal_delivery_plans TO authenticated;

-- Reload PostgREST
NOTIFY pgrst, 'reload schema';

-- BƯỚC 2 — Backfill plan 'pending' có ticket match nhưng chưa update
UPDATE b2b.deal_delivery_plans p
SET
  status = 'weighed',
  actual_kg = t.net_weight,
  weigh_ticket_id = t.id,
  weighed_at = COALESCE(t.completed_at, t.updated_at, now()),
  updated_at = now()
FROM public.weighbridge_tickets t
WHERE p.status = 'pending'
  AND p.deal_id = t.deal_id
  AND UPPER(TRIM(p.vehicle_plate)) = UPPER(TRIM(t.vehicle_plate))
  AND t.status = 'completed'
  AND t.net_weight IS NOT NULL;

-- BƯỚC 3 — Verify
SELECT
  p.vehicle_plate,
  p.declared_kg,
  p.actual_kg,
  p.variance_kg,
  p.status,
  p.weigh_ticket_id
FROM b2b.deal_delivery_plans p
ORDER BY p.declared_at DESC;
