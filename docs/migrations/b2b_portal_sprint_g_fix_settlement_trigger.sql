-- ============================================================================
-- B2B Portal Sprint G — Fix NEW-BUG-D: on_settlement_approved non-idempotent
-- Date: 2026-04-21
-- ============================================================================
-- Bug: Trigger b2b.on_settlement_approved() fire khi status TRANSITION INTO
--      'approved' từ state khác. Nhưng rollback 'paid' → 'approved' cũng match
--      guard (OLD='paid' != 'approved') → INSERT duplicate ledger entry
--      → constraint idx_ledger_idempotency violation.
--
-- Fix: Thêm ON CONFLICT DO NOTHING làm fail-safe idempotent.
--      Guard logic giữ nguyên vì semantic của nó "chỉ INSERT khi transition"
--      vẫn đúng — nhưng bảo vệ thêm bằng constraint để chịu được mọi edge case.
-- ============================================================================

CREATE OR REPLACE FUNCTION b2b.on_settlement_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Chỉ ghi khi chuyển sang 'approved' lần đầu
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    BEGIN
      INSERT INTO b2b.partner_ledger (
        partner_id, entry_type, debit, credit,
        settlement_id, reference_code, description,
        entry_date, created_by
      ) VALUES (
        NEW.partner_id,
        'settlement_receivable',
        NEW.gross_amount,
        0,
        NEW.id,
        NEW.code,
        'Quyết toán ' || NEW.code || ' - ' || COALESCE(NEW.product_type, '') ||
          ' - KL: ' || NEW.finished_kg || 'kg × ' || NEW.approved_price || 'đ/kg',
        NOW()::DATE,
        NEW.approved_by
      );
    EXCEPTION WHEN unique_violation THEN
      -- Idempotent via PL/pgSQL exception handler:
      -- rollback paid → approved re-fire trigger → INSERT dup → silent skip.
      -- Dùng exception thay vì ON CONFLICT vì idx_ledger_idempotency là
      -- partial/expression unique index, ON CONFLICT (cols) không match shape.
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- VERIFY: trigger vẫn hoạt động cho new approval
-- ═══════════════════════════════════════════════════════════════

-- Test scenario: giả lập Scenario 4 cleanup — rollback paid → approved → không lỗi
-- (Chạy sau khi đã apply migration này)
--
-- UPDATE b2b.settlements SET status = 'approved' WHERE code = 'TEST-QT-E2E-001';
-- → Expected: Success. 1 row updated. Không error duplicate nữa.
