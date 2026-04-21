-- ============================================================================
-- B2B Portal Sprint B — 5 MEDIUM gaps (additional constraints + chat factory)
-- Date: 2026-04-21
-- ============================================================================
-- Bao gồm:
--   GAP-6: UNIQUE(partner_id, demand_id) cho offer active — chặn duplicate
--   GAP-7: b2b.chat_rooms thêm column factory_id (+ index)
--   GAP-8: CHECK constraints trên public.b2b_demands
--   GAP-9: CHECK constraints trên public.b2b_demand_offers
--   GAP-10: CHECK deadline > published_at
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════
-- GAP-6: UNIQUE partial index (partner_id, demand_id) cho offer active
-- ═══════════════════════════════════════════════════════════════
-- Partner chỉ có 1 offer active/demand. Withdrawn/rejected không count
-- → có thể tạo offer mới sau khi rút đã có

-- Dọn duplicate cũ trước (giữ offer mới nhất)
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY partner_id, demand_id
           ORDER BY created_at DESC
         ) AS rn
  FROM public.b2b_demand_offers
  WHERE status IN ('pending', 'submitted', 'accepted')
)
UPDATE public.b2b_demand_offers
SET status = 'withdrawn', updated_at = NOW()
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- UNIQUE partial index
DROP INDEX IF EXISTS public.idx_offer_active_unique;
CREATE UNIQUE INDEX idx_offer_active_unique
  ON public.b2b_demand_offers (partner_id, demand_id)
  WHERE status IN ('pending', 'submitted', 'accepted');

COMMENT ON INDEX public.idx_offer_active_unique IS
  'GAP-6 Sprint B — Partner chỉ 1 offer active / demand';

-- ═══════════════════════════════════════════════════════════════
-- GAP-7: b2b.chat_rooms.factory_id — phân biệt phòng chat theo nhà máy
-- ═══════════════════════════════════════════════════════════════

-- Column factory_id (nullable để backward-compat với rooms cũ)
ALTER TABLE b2b.chat_rooms
  ADD COLUMN IF NOT EXISTS factory_id UUID REFERENCES public.facilities(id) ON DELETE SET NULL;

COMMENT ON COLUMN b2b.chat_rooms.factory_id IS
  'GAP-7 Sprint B — Nhà máy partner đang chat. NULL = general room, legacy behavior.';

-- Index truy vấn nhanh
CREATE INDEX IF NOT EXISTS idx_chat_rooms_partner_factory
  ON b2b.chat_rooms (partner_id, factory_id)
  WHERE is_active = true;

-- ═══════════════════════════════════════════════════════════════
-- GAP-8: CHECK constraints trên public.b2b_demands
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.b2b_demands
  DROP CONSTRAINT IF EXISTS chk_demand_qty_positive;
ALTER TABLE public.b2b_demands
  ADD CONSTRAINT chk_demand_qty_positive
  CHECK (quantity_kg > 0);

ALTER TABLE public.b2b_demands
  DROP CONSTRAINT IF EXISTS chk_demand_filled_nonneg;
ALTER TABLE public.b2b_demands
  ADD CONSTRAINT chk_demand_filled_nonneg
  CHECK (quantity_filled_kg IS NULL OR quantity_filled_kg >= 0);

ALTER TABLE public.b2b_demands
  DROP CONSTRAINT IF EXISTS chk_demand_price_range;
ALTER TABLE public.b2b_demands
  ADD CONSTRAINT chk_demand_price_range
  CHECK (
    price_min IS NULL OR price_max IS NULL OR
    (price_min >= 0 AND price_max >= 0 AND price_min <= price_max)
  );

ALTER TABLE public.b2b_demands
  DROP CONSTRAINT IF EXISTS chk_demand_drc_range;
ALTER TABLE public.b2b_demands
  ADD CONSTRAINT chk_demand_drc_range
  CHECK (
    (drc_min IS NULL OR (drc_min > 0 AND drc_min <= 100)) AND
    (drc_max IS NULL OR (drc_max > 0 AND drc_max <= 100)) AND
    (drc_min IS NULL OR drc_max IS NULL OR drc_min <= drc_max)
  );

ALTER TABLE public.b2b_demands
  DROP CONSTRAINT IF EXISTS chk_demand_output_rate_range;
ALTER TABLE public.b2b_demands
  ADD CONSTRAINT chk_demand_output_rate_range
  CHECK (expected_output_rate IS NULL OR (expected_output_rate > 0 AND expected_output_rate <= 100));

-- ═══════════════════════════════════════════════════════════════
-- GAP-9: CHECK constraints trên public.b2b_demand_offers
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.b2b_demand_offers
  DROP CONSTRAINT IF EXISTS chk_offer_qty_positive;
ALTER TABLE public.b2b_demand_offers
  ADD CONSTRAINT chk_offer_qty_positive
  CHECK (offered_quantity_kg > 0);

ALTER TABLE public.b2b_demand_offers
  DROP CONSTRAINT IF EXISTS chk_offer_price_positive;
ALTER TABLE public.b2b_demand_offers
  ADD CONSTRAINT chk_offer_price_positive
  CHECK (offered_price > 0);

ALTER TABLE public.b2b_demand_offers
  DROP CONSTRAINT IF EXISTS chk_offer_drc_range;
ALTER TABLE public.b2b_demand_offers
  ADD CONSTRAINT chk_offer_drc_range
  CHECK (offered_drc IS NULL OR (offered_drc > 0 AND offered_drc <= 100));

ALTER TABLE public.b2b_demand_offers
  DROP CONSTRAINT IF EXISTS chk_offer_lot_drc_range;
ALTER TABLE public.b2b_demand_offers
  ADD CONSTRAINT chk_offer_lot_drc_range
  CHECK (lot_drc IS NULL OR (lot_drc > 0 AND lot_drc <= 100));

-- ═══════════════════════════════════════════════════════════════
-- GAP-10: deadline > published_at
-- ═══════════════════════════════════════════════════════════════

-- NOT VALID: skip existing rows vi phạm (legacy WFV), chỉ enforce data mới
-- Nếu muốn hard enforce sau khi clean data: ALTER ... VALIDATE CONSTRAINT chk_...
ALTER TABLE public.b2b_demands
  DROP CONSTRAINT IF EXISTS chk_demand_deadline_after_publish;
ALTER TABLE public.b2b_demands
  ADD CONSTRAINT chk_demand_deadline_after_publish
  CHECK (
    deadline IS NULL OR published_at IS NULL OR deadline > published_at
  ) NOT VALID;

-- ═══════════════════════════════════════════════════════════════
-- Reload PostgREST schema
-- ═══════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════

-- List constraints đã add
SELECT conname, conrelid::regclass AS table_name
FROM pg_constraint
WHERE conname IN (
  'chk_demand_qty_positive', 'chk_demand_filled_nonneg',
  'chk_demand_price_range', 'chk_demand_drc_range',
  'chk_demand_output_rate_range', 'chk_demand_deadline_after_publish',
  'chk_offer_qty_positive', 'chk_offer_price_positive',
  'chk_offer_drc_range', 'chk_offer_lot_drc_range'
)
ORDER BY conrelid::regclass, conname;
-- Expected: 10 rows

-- Index
SELECT indexname, tablename FROM pg_indexes
WHERE indexname IN ('idx_offer_active_unique', 'idx_chat_rooms_partner_factory')
ORDER BY indexname;

-- Column factory_id existed
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'b2b' AND table_name = 'chat_rooms' AND column_name = 'factory_id';
-- Expected: factory_id | uuid

-- Check duplicates đã clean
SELECT partner_id, demand_id, COUNT(*)
FROM public.b2b_demand_offers
WHERE status IN ('pending', 'submitted', 'accepted')
GROUP BY partner_id, demand_id
HAVING COUNT(*) > 1;
-- Expected: 0 rows
