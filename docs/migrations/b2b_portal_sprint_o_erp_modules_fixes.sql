-- ============================================================================
-- B2B Portal Sprint O — ERP modules audit + 7 sub-fixes
-- Date: 2026-04-22
-- Status: ✅ applied production via agent_sql RPC
-- ============================================================================
-- Bugs audit cross-B2B modules (auctions, chat, partner_ratings, cross-module):
--
-- O-1 CRITICAL BUG-PTR-1: update_partner_volume_on_deal check 'completed'
--     nhưng deal CHECK không có status này → trigger không bao giờ fire.
-- O-2 HIGH BUG-AUC-1/2: b2b.auctions + auction_bids thiếu CHECK status.
-- O-3 Backfill partner_ratings cho deals settled (trigger chưa từng fire).
-- O-4 HIGH BUG-CROSS-1: Settlement paid không transition deal.status=settled →
--     partner_ratings trigger không cascade.
-- O-5 CRITICAL BUG-CHAT-1: policy chat_messages_all qual=true → public ALL access.
-- O-6 MED BUG-TIER-1: trigger update_partner_tier đã attach nhưng trigger
--     upstream (update_partner_volume_on_deal) không fire do BUG-PTR-1.
-- O-7 MED BUG-TIER-2: partner_ratings.tier không sync b2b.partners.tier.
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════
-- O-1: BUG-PTR-1 CRITICAL — Fix update_partner_volume_on_deal
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION b2b.update_partner_volume_on_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = b2b, public, pg_temp
AS $$
BEGIN
  -- Dùng 'settled' (đúng với CHECK deal status) thay 'completed' (không tồn tại)
  IF NEW.status = 'settled' AND (OLD.status IS NULL OR OLD.status != 'settled') THEN
    INSERT INTO b2b.partner_ratings (
      partner_id, total_volume_kg, purchase_volume_kg, processing_volume_kg,
      total_deals, completed_deals, last_transaction_at, tier
    ) VALUES (
      NEW.partner_id,
      COALESCE(NEW.quantity_kg, 0),
      CASE WHEN NEW.deal_type='purchase' THEN COALESCE(NEW.quantity_kg,0) ELSE 0 END,
      CASE WHEN NEW.deal_type='processing' THEN COALESCE(NEW.quantity_kg,0) ELSE 0 END,
      1, 1, NOW(), 'new'
    )
    ON CONFLICT (partner_id) DO UPDATE SET
      total_volume_kg = partner_ratings.total_volume_kg + COALESCE(NEW.quantity_kg, 0),
      purchase_volume_kg = partner_ratings.purchase_volume_kg
        + CASE WHEN NEW.deal_type='purchase' THEN COALESCE(NEW.quantity_kg,0) ELSE 0 END,
      processing_volume_kg = partner_ratings.processing_volume_kg
        + CASE WHEN NEW.deal_type='processing' THEN COALESCE(NEW.quantity_kg,0) ELSE 0 END,
      total_deals = partner_ratings.total_deals + 1,
      completed_deals = partner_ratings.completed_deals + 1,
      last_transaction_at = NOW();
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    UPDATE b2b.partner_ratings
    SET cancelled_deals = cancelled_deals + 1
    WHERE partner_id = NEW.partner_id;
  END IF;

  RETURN NEW;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- O-2: BUG-AUC-1/2 — CHECK status auctions + auction_bids
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE b2b.auctions
  ADD CONSTRAINT chk_auction_status
  CHECK (status IN ('draft','scheduled','live','ending','ended','cancelled','closed'));

ALTER TABLE b2b.auction_bids
  ADD CONSTRAINT chk_auction_bid_status
  CHECK (status IN ('pending','winning','losing','retracted','accepted','rejected'));


-- ═══════════════════════════════════════════════════════════════
-- O-3: Backfill partner_ratings cho deals settled (bypass trigger O-1 cũ)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO b2b.partner_ratings (
  partner_id, total_volume_kg, purchase_volume_kg, processing_volume_kg,
  total_deals, completed_deals, tier, last_transaction_at
)
SELECT
  d.partner_id,
  COALESCE(SUM(d.quantity_kg), 0),
  COALESCE(SUM(CASE WHEN d.deal_type='purchase' THEN d.quantity_kg ELSE 0 END), 0),
  COALESCE(SUM(CASE WHEN d.deal_type='processing' THEN d.quantity_kg ELSE 0 END), 0),
  COUNT(*), COUNT(*), 'new', MAX(d.created_at)
FROM b2b.deals d
WHERE d.status = 'settled'
GROUP BY d.partner_id
ON CONFLICT (partner_id) DO UPDATE SET
  total_volume_kg = EXCLUDED.total_volume_kg,
  purchase_volume_kg = EXCLUDED.purchase_volume_kg,
  processing_volume_kg = EXCLUDED.processing_volume_kg,
  total_deals = EXCLUDED.total_deals,
  completed_deals = EXCLUDED.completed_deals,
  last_transaction_at = EXCLUDED.last_transaction_at;


-- ═══════════════════════════════════════════════════════════════
-- O-4: BUG-CROSS-1 — Settlement paid → deal.status=settled
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION b2b.sync_deal_to_settled_on_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = b2b, public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'paid'
     AND (OLD.status IS NULL OR OLD.status != 'paid')
     AND NEW.deal_id IS NOT NULL
  THEN
    UPDATE b2b.deals
    SET status = 'settled'
    WHERE id = NEW.deal_id AND status = 'accepted';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_paid_sync_deal ON b2b.settlements;
CREATE TRIGGER trg_settlement_paid_sync_deal
  AFTER UPDATE OF status ON b2b.settlements
  FOR EACH ROW
  EXECUTE FUNCTION b2b.sync_deal_to_settled_on_paid();

-- Backfill: deal.status=accepted + settlement paid → settled
UPDATE b2b.deals d
SET status = 'settled'
WHERE d.status = 'accepted'
  AND EXISTS (
    SELECT 1 FROM b2b.settlements s
    WHERE s.deal_id = d.id AND s.status = 'paid'
  );


-- ═══════════════════════════════════════════════════════════════
-- O-5: BUG-CHAT-1 CRITICAL — Drop over-permissive chat RLS
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS chat_messages_all ON b2b.chat_messages;
DROP POLICY IF EXISTS chat_messages_insert ON b2b.chat_messages;
DROP POLICY IF EXISTS chat_messages_select ON b2b.chat_messages;
-- Giữ các policy đúng: _own_room / messages_factory_write / messages_partner_*


-- ═══════════════════════════════════════════════════════════════
-- O-6: BUG-TIER-1 — ensure trigger update_partner_tier attached
-- ═══════════════════════════════════════════════════════════════
-- Trigger trg_partner_ratings_tier_update đã có sẵn (BEFORE UPDATE OF
-- total_volume_kg). Chỉ ensure nó fire khi O-1 trigger upstream update volume.
-- Không cần thay đổi, chỉ re-create cho sạch.

DROP TRIGGER IF EXISTS trg_update_partner_tier ON b2b.partner_ratings;
CREATE TRIGGER trg_update_partner_tier
  BEFORE UPDATE OF total_volume_kg
  ON b2b.partner_ratings
  FOR EACH ROW
  EXECUTE FUNCTION b2b.update_partner_tier();


-- ═══════════════════════════════════════════════════════════════
-- O-7: BUG-TIER-2 — sync partner_ratings.tier → b2b.partners.tier
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION b2b.sync_partner_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = b2b, public, pg_temp
AS $$
BEGIN
  IF NEW.tier IS DISTINCT FROM OLD.tier THEN
    UPDATE b2b.partners
    SET tier = NEW.tier, updated_at = NOW()
    WHERE id = NEW.partner_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_partner_tier ON b2b.partner_ratings;
CREATE TRIGGER trg_sync_partner_tier
  AFTER UPDATE OF tier ON b2b.partner_ratings
  FOR EACH ROW
  EXECUTE FUNCTION b2b.sync_partner_tier();

-- Backfill: sync partners.tier từ partner_ratings
UPDATE b2b.partners p
SET tier = pr.tier, updated_at = NOW()
FROM b2b.partner_ratings pr
WHERE p.id = pr.partner_id AND p.tier != pr.tier;

NOTIFY pgrst, 'reload schema';
