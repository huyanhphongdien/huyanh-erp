-- ============================================================================
-- B2B Intake v4 — Phase 6 + 7 + 8
-- Multi-lot schema core: ticket_items table + has_items flag + stock_in_details link
-- Date: 2026-04-23
-- Status: ✅ applied live production via agent_sql
-- ============================================================================
-- Gotcha phát hiện:
-- - b2b_deals, b2b_partners là VIEW không phải TABLE → phải REFERENCES b2b.deals / b2b.partners base table
-- - rubber_suppliers không tồn tại → dùng suppliers (public)
-- ============================================================================

-- ═══ P6: weighbridge_ticket_items (junction table) ═══
CREATE TABLE IF NOT EXISTS weighbridge_ticket_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES weighbridge_tickets(id) ON DELETE CASCADE,
  line_no INT NOT NULL,

  -- EXACTLY 1 of 3 source (CHECK bên dưới)
  deal_id      UUID REFERENCES b2b.deals(id),
  partner_id   UUID REFERENCES b2b.partners(id),
  supplier_id  UUID REFERENCES suppliers(id),

  rubber_type TEXT NOT NULL,
  lot_code TEXT,
  declared_qty_kg NUMERIC(12,2) NOT NULL CHECK (declared_qty_kg > 0),
  actual_qty_kg NUMERIC(12,2),              -- auto-compute bởi trigger P10+
  drc_percent NUMERIC(5,2),
  unit_price NUMERIC(12,2),
  line_amount_vnd NUMERIC(14,2),            -- auto-compute
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (ticket_id, line_no),

  CONSTRAINT chk_exactly_one_source CHECK (
    (deal_id IS NOT NULL)::INT +
    (partner_id IS NOT NULL)::INT +
    (supplier_id IS NOT NULL)::INT = 1
  ),
  CONSTRAINT chk_drc_range CHECK (
    drc_percent IS NULL OR (drc_percent >= 0 AND drc_percent <= 100)
  )
);

CREATE INDEX IF NOT EXISTS idx_ticket_items_ticket ON weighbridge_ticket_items(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_items_deal ON weighbridge_ticket_items(deal_id)
  WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_items_partner ON weighbridge_ticket_items(partner_id)
  WHERE partner_id IS NOT NULL;

ALTER TABLE weighbridge_ticket_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_items_auth_all ON weighbridge_ticket_items;
CREATE POLICY ticket_items_auth_all ON weighbridge_ticket_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ticket_items_service_all ON weighbridge_ticket_items;
CREATE POLICY ticket_items_service_all ON weighbridge_ticket_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ═══ P7: weighbridge_tickets + has_items + allocation_mode ═══
ALTER TABLE weighbridge_tickets
  ADD COLUMN IF NOT EXISTS has_items BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE weighbridge_tickets
  ADD COLUMN IF NOT EXISTS allocation_mode TEXT NOT NULL DEFAULT 'by_share';

ALTER TABLE weighbridge_tickets DROP CONSTRAINT IF EXISTS chk_allocation_mode;
ALTER TABLE weighbridge_tickets
  ADD CONSTRAINT chk_allocation_mode
  CHECK (allocation_mode IN ('by_share','direct'));


-- ═══ P8: stock_in_details — link về items + deal + lot_code ═══
ALTER TABLE stock_in_details
  ADD COLUMN IF NOT EXISTS ticket_item_id UUID REFERENCES weighbridge_ticket_items(id);

ALTER TABLE stock_in_details
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES b2b.deals(id);

ALTER TABLE stock_in_details
  ADD COLUMN IF NOT EXISTS lot_code TEXT;

CREATE INDEX IF NOT EXISTS idx_stock_in_details_ticket_item
  ON stock_in_details(ticket_item_id) WHERE ticket_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_in_details_deal
  ON stock_in_details(deal_id) WHERE deal_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- VERIFY
-- ═══════════════════════════════════════════════════════════════
-- Test chk_exactly_one_source:
-- INSERT INTO weighbridge_ticket_items (ticket_id, line_no, rubber_type, declared_qty_kg)
-- SELECT id, 99, 'mu_tap', 100 FROM weighbridge_tickets LIMIT 1;
-- → expect reject (0 source)

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- ALTER TABLE stock_in_details DROP COLUMN IF EXISTS ticket_item_id;
-- ALTER TABLE stock_in_details DROP COLUMN IF EXISTS deal_id;
-- ALTER TABLE stock_in_details DROP COLUMN IF EXISTS lot_code;
-- ALTER TABLE weighbridge_tickets DROP COLUMN IF EXISTS has_items;
-- ALTER TABLE weighbridge_tickets DROP COLUMN IF EXISTS allocation_mode;
-- ALTER TABLE weighbridge_tickets DROP CONSTRAINT IF EXISTS chk_allocation_mode;
-- DROP TABLE IF EXISTS weighbridge_ticket_items CASCADE;
