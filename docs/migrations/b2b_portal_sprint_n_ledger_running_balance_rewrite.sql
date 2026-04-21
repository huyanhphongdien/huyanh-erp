-- ============================================================================
-- B2B Portal Sprint N — compute_ledger_running_balance rewrite cumulative SUM
-- Date: 2026-04-22
-- Status: ✅ applied production via agent_sql RPC
-- ============================================================================
-- Bug NEW-BUG-Q: Trigger cũ (Sprint E BUG-3) dùng `ORDER BY entry_date DESC,
-- created_at DESC LIMIT 1` để lấy prev_balance.
-- Sprint G/I/M dùng entry_date khác nhau (NOW()::DATE vs paid_at::DATE) →
-- entry_date lệch ngày trong cùng partner → prev picker trả wrong row →
-- running_balance sai.
--
-- E2E test phát hiện: advance_paid(-3B) + settlement_receivable(9B entry_date
-- yesterday) + payment_paid(9B entry_date today) → payment_paid.running = -12B
-- thay vì 0.
--
-- Fix: cumulative SUM approach ordered by created_at ASC (insertion order =
-- source of truth). Không dùng entry_date cho thứ tự vì đó là business date
-- có thể lệch.
-- ============================================================================

CREATE OR REPLACE FUNCTION b2b.compute_ledger_running_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP != 'INSERT' THEN RETURN NEW; END IF;

  -- Cumulative sum of all previous entries for this partner, ordered by
  -- insertion time (created_at + id tiebreaker). Không dùng entry_date vì
  -- Sprint G/I/M set entry_date khác nhau → thứ tự business ≠ thứ tự insertion.
  SELECT COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0)
  INTO NEW.running_balance
  FROM b2b.partner_ledger
  WHERE partner_id = NEW.partner_id
    AND id != NEW.id
    AND (created_at < NEW.created_at
         OR (created_at = NEW.created_at AND id < NEW.id));

  NEW.running_balance := NEW.running_balance
                       + COALESCE(NEW.debit, 0)
                       - COALESCE(NEW.credit, 0);

  RETURN NEW;
END;
$$;


-- ═══════════════════════════════════════════════════════════════
-- Backfill: recompute running_balance cho all existing rows
-- (ordered by created_at ASC, id ASC — insertion order)
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_partner UUID;
  v_running NUMERIC;
  v_row RECORD;
BEGIN
  FOR v_partner IN SELECT DISTINCT partner_id FROM b2b.partner_ledger LOOP
    v_running := 0;
    FOR v_row IN
      SELECT id, debit, credit
      FROM b2b.partner_ledger
      WHERE partner_id = v_partner
      ORDER BY created_at ASC, id ASC
    LOOP
      v_running := v_running + COALESCE(v_row.debit, 0) - COALESCE(v_row.credit, 0);
      UPDATE b2b.partner_ledger SET running_balance = v_running WHERE id = v_row.id;
    END LOOP;
  END LOOP;
END $$;
