-- ============================================================================
-- B2B Portal Sprint M — Trigger on_settlement_paid sinh ledger payment_paid
-- Date: 2026-04-22
-- ============================================================================
-- BUG phát hiện E2E test: Mark settlement=paid KHÔNG sinh ledger entry
-- 'payment_paid' → running_balance không về 0.
--
-- Earlier session đã remove service manual insert ledger for payment (vì sai
-- entry_type). Giải pháp đúng: DB trigger tự sinh ledger entry khi status
-- transition → paid, idempotent via EXCEPTION unique_violation (pattern Sprint G).
-- ============================================================================

CREATE OR REPLACE FUNCTION b2b.on_settlement_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = b2b, public, pg_temp
AS $$
DECLARE
  v_amount NUMERIC;
BEGIN
  -- Chỉ fire khi status transition → 'paid' lần đầu
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    -- paid_amount: số tiền vừa thanh toán (remaining_amount tại thời điểm paid
    -- = gross - total_advance - total_paid_post trước khi mark paid).
    -- Nếu paid_amount không set, fallback = remaining_amount.
    v_amount := COALESCE(NEW.paid_amount, NEW.remaining_amount, 0);

    IF v_amount > 0 THEN
      BEGIN
        INSERT INTO b2b.partner_ledger (
          partner_id, entry_type, debit, credit,
          settlement_id, reference_code, description,
          entry_date, created_by
        ) VALUES (
          NEW.partner_id,
          'payment_paid',
          0,
          v_amount,
          NEW.id,
          NEW.code || '-PAY',
          'Thanh toán quyết toán ' || NEW.code ||
            COALESCE(' (' || NEW.payment_method || ')', ''),
          COALESCE(NEW.paid_at::DATE, NOW()::DATE),
          COALESCE(NEW.paid_by, NEW.approved_by)
        );
      EXCEPTION WHEN unique_violation THEN
        -- Idempotent: retry paid → approved → paid không sinh duplicate
        NULL;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_paid ON b2b.settlements;
CREATE TRIGGER trg_settlement_paid
  AFTER UPDATE OF status
  ON b2b.settlements
  FOR EACH ROW
  EXECUTE FUNCTION b2b.on_settlement_paid();

NOTIFY pgrst, 'reload schema';

-- Backfill: sinh ledger payment_paid cho settlements hiện đang status='paid' mà thiếu
INSERT INTO b2b.partner_ledger (
  partner_id, entry_type, debit, credit,
  settlement_id, reference_code, description,
  entry_date, created_by
)
SELECT
  s.partner_id,
  'payment_paid',
  0,
  COALESCE(s.paid_amount, s.remaining_amount, 0),
  s.id,
  s.code || '-PAY',
  'Backfill payment_paid ' || s.code,
  COALESCE(s.paid_at::DATE, NOW()::DATE),
  COALESCE(s.paid_by, s.approved_by)
FROM b2b.settlements s
WHERE s.status = 'paid'
  AND COALESCE(s.paid_amount, s.remaining_amount, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM b2b.partner_ledger pl
    WHERE pl.settlement_id = s.id AND pl.entry_type = 'payment_paid'
  );
